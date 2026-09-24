import type { AppSettings, Project, Transcript, TranscriptWord } from '@shared/types'
import { api } from '@/lib/api'

export interface SpeechSource { path: string; offset: number; source: Transcript['source']; label: string }

/** The voice to transcribe: the microphone if there is one, otherwise PC sound, otherwise the video's own audio. */
export function speechSource(p: Project): SpeechSource {
  const m = p.media
  if (m.mic) return { path: m.mic.path, offset: m.mic.offset, source: 'mic', label: 'your microphone' }
  if (m.system) return { path: m.system.path, offset: m.system.offset, source: 'system', label: 'PC sound' }
  return { path: m.screen.path, offset: 0, source: 'screen', label: "the video's sound" }
}

export type Progress = (stage: 'extract' | 'download' | 'transcribe' | 'upload', p: number, note?: string) => void

let worker: Worker | null = null

async function local(path: string, model: 'tiny' | 'base' | 'small', onProgress: Progress): Promise<TranscriptWord[]> {
  onProgress('extract', 0)
  const pcm = await api.speechPcm(path)
  if (!pcm.length) throw new Error('No sound found to transcribe.')
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  return new Promise((resolve, reject) => {
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data
      if (d.type === 'progress') onProgress(d.stage === 'download' ? 'download' : 'transcribe', d.stage === 'ready' ? 0 : d.p ?? 0, d.mb ? `${d.mb} MB` : undefined)
      else if (d.type === 'done') resolve(d.words)
      else if (d.type === 'error') reject(new Error('Offline speech model: ' + d.message))
    }
    w.onerror = (e) => reject(new Error('Offline speech model crashed: ' + e.message))
    w.postMessage({ type: 'run', pcm, model }, [pcm.buffer])
  })
}

async function groq(path: string, key: string, onProgress: Progress): Promise<{ words: TranscriptWord[]; lang?: string }> {
  onProgress('upload', 0)
  const off = api.on('speech:progress', (p: number) => onProgress('transcribe', p))
  try {
    return await api.transcribeGroq(path, key)
  } finally {
    off()
  }
}

/** Test hook: a fake transcript so the self test can run without a model or a network. */
const fake = (): TranscriptWord[] | null => (window as unknown as { __fakeWords?: TranscriptWord[] }).__fakeWords ?? null

/**
 * Transcribes the project's voice with the engine picked in Settings: Groq when there's a key
 * (falls back to offline if Groq fails), otherwise Whisper on this PC.
 */
export async function transcribe(p: Project, s: AppSettings, onProgress: Progress): Promise<Transcript> {
  const src = speechSource(p)
  const base = { offset: src.offset, source: src.source, createdAt: Date.now() }
  const f = fake()
  if (f) return { ...base, words: f, engine: 'local' }
  const pref = s.transcribeEngine ?? 'auto'
  const key = s.groqKey?.trim() ?? ''
  if (pref === 'groq' || (pref === 'auto' && key)) {
    try {
      const r = await groq(src.path, key, onProgress)
      return { ...base, words: r.words, lang: r.lang, engine: 'groq' }
    } catch (e) {
      if (pref === 'groq') throw e
      console.warn('[speech] Groq failed, using the offline model', e)
    }
  }
  const words = await local(src.path, s.localModel ?? 'base', onProgress)
  return { ...base, words, engine: 'local' }
}

/** Self test: loads the offline engine and runs a tiny model through it. */
export function engineSelfTest(model: Uint8Array): Promise<{ ok: boolean; out?: number[]; message?: string }> {
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  return new Promise((resolve) => {
    w.onmessage = (ev: MessageEvent) => ev.data.type === 'selftest' && resolve(ev.data)
    w.onerror = (e) => resolve({ ok: false, message: e.message })
    w.postMessage({ type: 'selftest', model })
  })
}
