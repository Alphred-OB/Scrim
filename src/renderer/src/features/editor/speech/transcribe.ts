import type { AppSettings, Project, Transcript, TranscriptWord } from '@shared/types'
import { api } from '@/lib/api'

export interface SpeechSource { path: string; offset: number; source: Transcript['source']; label: string }

/** Every place a voice could be, best first: the microphone, then PC sound, then the video's own sound. */
export function speechSources(p: Project): SpeechSource[] {
  const m = p.media
  const out: SpeechSource[] = []
  if (m.mic) out.push({ path: m.mic.path, offset: m.mic.offset, source: 'mic', label: 'your microphone' })
  if (m.system) out.push({ path: m.system.path, offset: m.system.offset, source: 'system', label: 'PC sound' })
  out.push({ path: m.screen.path, offset: 0, source: 'screen', label: "the video's sound" })
  return out
}

/** The voice to transcribe (for labels): the first likely source. */
export function speechSource(p: Project): SpeechSource {
  return speechSources(p)[0]
}

/** The first source that really has sound in it (a mic file can exist but be silent). */
async function findVoice(p: Project): Promise<SpeechSource> {
  const all = speechSources(p)
  const i = await api.pickSpeech(all.map((s) => s.path))
  if (i < 0) throw new Error('This recording has no sound to listen to. Record with your microphone on, or import a video that has sound.')
  return all[i]
}

export type Progress = (stage: 'extract' | 'download' | 'transcribe' | 'upload', p: number, note?: string) => void

let worker: Worker | null = null
let rejectLocal: ((e: Error) => void) | null = null

/** Stops an offline transcription that is running (the model is loaded again next time). */
export function cancelLocalTranscription(): void {
  worker?.terminate()
  worker = null
  rejectLocal?.(new Error('Cancelled'))
  rejectLocal = null
}

async function local(path: string, model: 'tiny' | 'base' | 'small', onProgress: Progress): Promise<TranscriptWord[]> {
  onProgress('extract', 0)
  const pcm = await api.speechPcm(path)
  if (!pcm.length) throw new Error('No sound found to transcribe.')
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  return new Promise((resolve, reject) => {
    rejectLocal = reject
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data
      if (d.type === 'progress') onProgress(d.stage === 'download' ? 'download' : 'transcribe', d.stage === 'ready' ? 0 : d.p ?? 0, d.mb ? `${d.mb} MB` : undefined)
      else if (d.type === 'done') {
        rejectLocal = null
        resolve(d.words)
      }
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
/** Test hook: how long the fake transcript takes, reporting progress on the way (so a job can be watched in the background). */
const fakeMs = (): number => (window as unknown as { __fakeCaptionMs?: number }).__fakeCaptionMs ?? 0

/**
 * Transcribes the project's voice with the engine picked in Settings: Groq when there's a key
 * (falls back to offline if Groq fails), otherwise Whisper on this PC.
 */
export async function transcribe(p: Project, s: AppSettings, onProgress: Progress): Promise<Transcript> {
  const f = fake()
  if (f) {
    for (let i = 1; i <= 10 && fakeMs(); i++) {
      onProgress('transcribe', i / 10)
      await new Promise((r) => setTimeout(r, fakeMs() / 10))
    }
    const s0 = speechSource(p)
    return { offset: s0.offset, source: s0.source, createdAt: Date.now(), words: f, engine: 'local' }
  }
  onProgress('extract', 0)
  const src = await findVoice(p)
  const base = { offset: src.offset, source: src.source, createdAt: Date.now() }
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
