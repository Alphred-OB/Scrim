/// <reference lib="webworker" />
// Offline speech to text: Whisper running on this PC's CPU.
// The model downloads once (tiny 40 MB, base 80 MB, small 250 MB) and is then kept by the app.
import { env, pipeline } from '@huggingface/transformers'
import * as ort from 'onnxruntime-web'
// paths relative to this file on purpose: onnxruntime-web doesn't export its wasm files
import ortWasm from '../../../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import ortMjs from '../../../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'

type Msg = { type: 'run'; pcm: Float32Array; model: 'tiny' | 'base' | 'small'; lang?: string } | { type: 'selftest'; model: Uint8Array }
type Word = { t0: number; t1: number; w: string }

const post = (m: unknown) => (self as unknown as Worker).postMessage(m)

env.allowLocalModels = false
env.useBrowserCache = true
const onnx = env.backends.onnx as unknown as { wasm: { wasmPaths: unknown; numThreads: number; proxy: boolean } }
onnx.wasm.wasmPaths = { wasm: new URL(ortWasm, self.location.href).href, mjs: new URL(ortMjs, self.location.href).href }
onnx.wasm.numThreads = Math.max(1, Math.min(4, (self.navigator.hardwareConcurrency || 2) - 1))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null
let loaded = ''

async function load(model: string) {
  if (asr && loaded === model) return asr
  const id = `Xenova/whisper-${model}`
  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
      let a = 0
      let b = 0
      files.forEach((f) => ((a += f.loaded), (b += f.total)))
      post({ type: 'progress', stage: 'download', p: b ? a / b : 0, mb: Math.round(b / 1e6) })
    }
  }
  // CPU (wasm) only. The GPU path in this onnxruntime build fails to start on some PCs
  // ("webgpuInit is not a function") and then blocks the CPU path too, so it isn't tried.
  const tries: { device: 'wasm'; dtype?: unknown }[] = [{ device: 'wasm' }]
  let lastErr: unknown = null
  for (const t of tries) {
    try {
      asr = await pipeline('automatic-speech-recognition', id, { device: t.device, dtype: t.dtype as never, progress_callback } as never)
      loaded = model
      post({ type: 'progress', stage: 'ready', device: t.device })
      return asr
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

/** Splits the audio into pieces of about 28 seconds, cutting in the quietest spot so words aren't split. */
function pieces(pcm: Float32Array, rate = 16000): [number, number][] {
  const out: [number, number][] = []
  const target = 28 * rate
  const win = Math.round(0.05 * rate)
  let start = 0
  while (start < pcm.length) {
    if (pcm.length - start <= target + 2 * rate) {
      out.push([start, pcm.length])
      break
    }
    // look for the quietest 50 ms between 22 s and 28 s
    let best = start + target
    let bestE = Infinity
    for (let at = start + 22 * rate; at + win < start + target; at += win) {
      let e = 0
      for (let k = at; k < at + win; k++) e += pcm[k] * pcm[k]
      if (e < bestE) (bestE = e), (best = at + win / 2)
    }
    out.push([start, Math.round(best)])
    start = Math.round(best)
  }
  return out
}

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const m = ev.data
  if (m.type === 'selftest') {
    // checks that the speech engine (onnxruntime wasm) loads and runs here, using a tiny model
    try {
      const s = await ort.InferenceSession.create(m.model, { executionProviders: ['wasm'] })
      const r = await s.run({ x: new ort.Tensor('float32', new Float32Array([1, 2, 3]), [3]) })
      post({ type: 'selftest', ok: true, out: Array.from(r.y.data as Float32Array) })
    } catch (e) {
      post({ type: 'selftest', ok: false, message: e instanceof Error ? e.message : String(e) })
    }
    return
  }
  if (m.type !== 'run') return
  try {
    const run = await load(m.model)
    const parts = pieces(m.pcm)
    const words: Word[] = []
    let wordLevel = true
    for (let i = 0; i < parts.length; i++) {
      const [a, b] = parts[i]
      const slice = m.pcm.subarray(a, b)
      const off = a / 16000
      const opts = { return_timestamps: 'word', task: 'transcribe', ...(m.lang ? { language: m.lang } : {}) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let out: any
      if (wordLevel) {
        try {
          out = await run(slice, opts)
        } catch {
          wordLevel = false // this model can't do word times: fall back to sentence times
        }
      }
      if (!wordLevel) out = await run(slice, { ...opts, return_timestamps: true })
      for (const c of (out?.chunks ?? []) as { text: string; timestamp: [number, number | null] }[]) {
        const s = (c.timestamp[0] ?? 0) + off
        const e = (c.timestamp[1] ?? c.timestamp[0] ?? 0) + off
        const toks = c.text.trim().split(/\s+/).filter(Boolean)
        if (!toks.length) continue
        if (wordLevel || toks.length === 1) words.push({ t0: s, t1: Math.max(s + 0.05, e), w: toks.join(' ') })
        else {
          // spread a sentence's words over its time by length
          const total = toks.reduce((n, t) => n + t.length + 1, 0)
          let at = s
          for (const t of toks) {
            const d = ((e - s) * (t.length + 1)) / total
            words.push({ t0: at, t1: at + d, w: t })
            at += d
          }
        }
      }
      post({ type: 'progress', stage: 'transcribe', p: (i + 1) / parts.length })
    }
    post({ type: 'done', words: words.map((w) => ({ t0: +w.t0.toFixed(3), t1: +w.t1.toFixed(3), w: w.w })), wordLevel })
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
