import { BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ffmpegPath, probeDuration, runFfmpeg } from './ffmpeg'
import type { TranscriptWord } from '@shared/types'

// Speech to text, voice clean up, dead time detection and guide files. The renderer decides what
// to do; this side does the heavy lifting with ffmpeg and talks to Groq.

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3-turbo'
const CHUNK_S = 600 // Groq takes files up to 25 MB; 10 minutes of 32 kbps Opus is about 2.4 MB

/** Reads a whole ffmpeg stdout as one buffer. */
function ffmpegOut(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let err = ''
    const p = spawn(ffmpegPath(), ['-hide_banner', '-v', 'error', ...args], { windowsHide: true })
    p.stdout.on('data', (d: Buffer) => chunks.push(d))
    p.stderr.on('data', (d: Buffer) => (err += d.toString()).length > 20000 && (err = err.slice(-10000)))
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) return resolve(Buffer.concat(chunks))
      if (/does not contain any stream|matches no streams/i.test(err)) return reject(new Error('That file has no sound track.'))
      reject(new Error(err.trim().split('\n').pop() || 'ffmpeg failed'))
    })
  })
}

/** True when the file has a sound track with something in it (not just silence). */
export async function hasSound(path: string): Promise<boolean> {
  const r = await runFfmpeg(['-i', path, '-map', '0:a:0', '-t', '600', '-af', 'volumedetect', '-f', 'null', '-'])
  if (r.code !== 0 || !/Stream #[^\n]*Audio:/.test(r.stderr)) return false
  const m = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr)
  if (!m) return true
  return m[1] !== '-inf' && parseFloat(m[1]) > -60
}

/** The first of the files that has real sound, or -1. */
export async function pickSpeech(paths: string[]): Promise<number> {
  for (let i = 0; i < paths.length; i++) if (await hasSound(paths[i]).catch(() => false)) return i
  return -1
}

/** 16 kHz mono float samples of a file (what Whisper wants). */
export async function speechPcm(path: string): Promise<Float32Array> {
  const buf = await ffmpegOut(['-i', path, '-vn', '-ac', '1', '-ar', '16000', '-af', 'highpass=f=70', '-f', 'f32le', '-'])
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4))
}

async function groqChunk(file: string, key: string, lang?: string): Promise<{ words: TranscriptWord[]; lang?: string }> {
  const data = await fs.readFile(file)
  const form = new FormData()
  form.append('file', new Blob([data], { type: 'audio/ogg' }), 'speech.ogg')
  form.append('model', GROQ_MODEL)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  form.append('temperature', '0')
  if (lang) form.append('language', lang)
  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
    if (res.status !== 429 && res.status < 500) break
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  if (!res || !res.ok) {
    const body = res ? await res.text().catch(() => '') : ''
    if (res?.status === 401) throw new Error('Groq did not accept the API key. Check it in Settings > AI.')
    if (res?.status === 429) throw new Error('Groq says too many requests right now. Try again in a minute.')
    throw new Error(`Groq error ${res?.status ?? ''}: ${body.slice(0, 200)}`)
  }
  const j = (await res.json()) as { language?: string; words?: { word: string; start: number; end: number }[]; segments?: { start: number; end: number; text: string }[] }
  let words = (j.words ?? []).map((w) => ({ t0: +w.start.toFixed(3), t1: +w.end.toFixed(3), w: w.word.trim() }))
  // Groq's word list has no punctuation; put the segment punctuation back on the last word of each piece
  if (j.segments?.length && words.length) words = punctuate(words, j.segments)
  return { words, lang: j.language }
}

/** Copies punctuation and capitals from the segment text onto the matching words. */
function punctuate(words: TranscriptWord[], segments: { start: number; end: number; text: string }[]): TranscriptWord[] {
  const out = words.map((w) => ({ ...w }))
  let wi = 0
  for (const s of segments) {
    const toks = s.text.trim().split(/\s+/).filter(Boolean)
    for (const tok of toks) {
      const bare = tok.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
      // find this token among the next few words
      for (let k = wi; k < Math.min(out.length, wi + 4); k++) {
        if (out[k].w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '') === bare) {
          out[k].w = tok
          wi = k + 1
          break
        }
      }
    }
  }
  return out
}

export async function groqTranscribe(path: string, key: string, onProgress: (p: number) => void): Promise<{ words: TranscriptWord[]; lang?: string }> {
  if (!key) throw new Error('Add your Groq API key in Settings > AI first.')
  const dur = await probeDuration(path)
  const dir = await fs.mkdtemp(join(tmpdir(), 'scrim-speech-'))
  const all: TranscriptWord[] = []
  let lang: string | undefined
  try {
    const n = Math.max(1, Math.ceil(dur / CHUNK_S))
    for (let i = 0; i < n; i++) {
      const at = i * CHUNK_S
      const file = join(dir, `part${i}.ogg`)
      const r = await runFfmpeg(['-ss', String(at), '-t', String(CHUNK_S), '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-af', 'highpass=f=70', '-c:a', 'libopus', '-b:a', '32k', file])
      if (r.code !== 0) throw new Error('Could not read the audio: ' + r.stderr.trim().split('\n').pop())
      const st = await fs.stat(file).catch(() => null)
      if (!st || st.size < 200) continue
      const part = await groqChunk(file, key, lang)
      lang ??= part.lang
      for (const w of part.words) all.push({ t0: +(w.t0 + at).toFixed(3), t1: +(w.t1 + at).toFixed(3), w: w.w })
      onProgress((i + 1) / n)
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  return { words: all, lang }
}

/**
 * Cleans a voice track: rumble and hiss filtered, background noise reduced, loudness evened out
 * to about -16 LUFS (what YouTube and podcasts use). Returns the new file.
 */
export async function cleanVoice(src: string, dir: string, strength: number): Promise<string> {
  const out = join(dir, `voice-clean-${Date.now()}.m4a`)
  const nr = Math.round(8 + strength * 22) // noise reduction in dB
  const nf = Math.round(-50 + strength * 12) // noise floor
  const chain = [
    'highpass=f=80',
    'lowpass=f=14000',
    `afftdn=nr=${nr}:nf=${nf}:tn=1`,
    // gentle gate for the room between sentences
    `agate=threshold=${(0.008 + strength * 0.02).toFixed(3)}:ratio=2:attack=5:release=200`,
    'acompressor=threshold=0.1:ratio=3:attack=10:release=150:makeup=2',
    'loudnorm=I=-16:TP=-1.5:LRA=11'
  ].join(',')
  const r = await runFfmpeg(['-i', src, '-vn', '-af', chain, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', out])
  if (r.code !== 0) throw new Error('Voice clean up failed: ' + r.stderr.trim().split('\n').pop())
  // drop older cleaned copies
  for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
    if (/^voice-clean-\d+\.m4a$/.test(f) && join(dir, f) !== out) await fs.rm(join(dir, f), { force: true }).catch(() => {})
  }
  return out
}

/**
 * How much the screen changes each second (0 = frozen). Uses only keyframes, which the recorder
 * writes once a second, so even an hour long video is read in seconds.
 */
export async function screenChange(path: string): Promise<{ step: number; values: number[] }> {
  const W = 64
  const H = 36
  const buf = await ffmpegOut(['-skip_frame', 'nokey', '-i', path, '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'])
  const n = Math.floor(buf.length / (W * H))
  const dur = await probeDuration(path)
  const step = n > 1 ? dur / n : 1
  const values: number[] = []
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      values.push(1)
      continue
    }
    let d = 0
    const a = (i - 1) * W * H
    const b = i * W * H
    for (let k = 0; k < W * H; k++) d += Math.abs(buf[a + k] - buf[b + k])
    values.push(+(d / (W * H * 255)).toFixed(4))
  }
  return { step, values }
}

/** Still frames (JPEG, base64) at the given times, for the step by step guide. */
export async function stills(path: string, times: number[], width = 1600): Promise<string[]> {
  const out: string[] = []
  for (const t of times) {
    const buf = await ffmpegOut(['-ss', Math.max(0, t).toFixed(3), '-i', path, '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-q:v', '3', '-f', 'image2', '-c:v', 'mjpeg', '-']).catch(() => Buffer.alloc(0))
    out.push(buf.length ? buf.toString('base64') : '')
  }
  return out
}

/** Writes the guide as HTML, and as PDF too when asked (printed by a hidden window). */
export async function saveGuide(html: string, outPath: string, pdf: boolean): Promise<string> {
  if (!pdf) {
    await fs.writeFile(outPath, html, 'utf8')
    return outPath
  }
  const tmp = join(tmpdir(), `scrim-guide-${Date.now()}.html`)
  await fs.writeFile(tmp, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false } })
  try {
    await win.loadFile(tmp)
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } })
    await fs.writeFile(outPath, data)
  } finally {
    win.destroy()
    await fs.rm(tmp, { force: true }).catch(() => {})
  }
  return outPath
}

export function registerSpeechIpc(): void {
  ipcMain.handle('speech:groq', (e, path: string, key: string) => groqTranscribe(path, key, (p) => e.sender.send('speech:progress', p)))
  ipcMain.handle('speech:pcm', (_e, path: string) => speechPcm(path))
  ipcMain.handle('speech:pick', (_e, paths: string[]) => pickSpeech(paths))
  ipcMain.handle('voice:clean', (_e, src: string, dir: string, strength: number) => cleanVoice(src, dir, strength))
  ipcMain.handle('tidy:screen', (_e, path: string) => screenChange(path))
  ipcMain.handle('guide:stills', (_e, path: string, times: number[]) => stills(path, times))
  ipcMain.handle('guide:save', (_e, html: string, outPath: string, pdf: boolean) => saveGuide(html, outPath, pdf))
  ipcMain.handle('file:writeText', (_e, p: string, text: string) => fs.writeFile(p, text, 'utf8'))
}
