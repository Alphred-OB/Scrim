import type { WebcamSettings } from '@shared/types'
// paths relative to this file on purpose: the package doesn't export its wasm files
import wasmJs from '../../../../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url'
import wasmBin from '../../../../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url'
import modelData from '../../../assets/models/selfie_segmenter.tflite?inline' // 250 KB, runs on this PC, nothing is uploaded

type Cam = { src: CanvasImageSource; w: number; h: number; cut?: boolean }
type Seg = { segmentForVideo(img: HTMLCanvasElement, ts: number): { confidenceMasks?: { width: number; height: number; getAsFloat32Array(): Float32Array; close(): void }[] }; getLabels(): string[] }

let seg: Seg | null = null
let loading: Promise<void> | null = null
let failed = false
let personIdx = 0
let stamp = 0

/** Loads the person cutout model once. Until it's ready the camera is shown as it is. */
export function loadSegmenter(): Promise<void> {
  loading ??= (async () => {
    try {
      const { ImageSegmenter } = await import('@mediapipe/tasks-vision')
      const buf = new Uint8Array(await (await fetch(modelData)).arrayBuffer())
      // the engine refuses to read a wasm file from a file:// address (the installed app), so hand it a blob: copy
      const wasm = await (await fetch(new URL(wasmBin, location.href))).arrayBuffer()
      const wasmUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }))
      const s = await ImageSegmenter.createFromOptions(
        { wasmLoaderPath: new URL(wasmJs, location.href).href, wasmBinaryPath: wasmUrl },
        { baseOptions: { modelAssetBuffer: buf }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false }
      )
      const labels = s.getLabels()
      const i = labels.findIndex((l) => /person|selfie|foreground/i.test(l))
      personIdx = i >= 0 ? i : labels.length === 2 ? 1 : 0
      seg = s as unknown as Seg
    } catch (e) {
      failed = true
      console.warn('[webcam] background cutout unavailable', e)
    }
  })()
  return loading
}

export const segmenterReady = () => !!seg
export const segmenterFailed = () => failed

const cv = (w: number, h: number, c?: HTMLCanvasElement): HTMLCanvasElement => {
  c ??= document.createElement('canvas')
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
  return c
}
const A = { inp: null as HTMLCanvasElement | null, mask: null as HTMLCanvasElement | null, person: null as HTMLCanvasElement | null, out: null as HTMLCanvasElement | null }
const images = new Map<string, HTMLImageElement>()
let cached: { key: string; sig: string; at: number; out: Cam } | null = null
let errors = 0

/** Playback options: `maxSide` shrinks the picture the cutout works on, `reuseMs` keeps the last cutout for that long (the mask lags a hair behind, which nobody sees). */
export interface CutOpts { maxSide?: number; reuseMs?: number }

/** Waits until the picture is decoded (the export needs it ready before the first frame). */
export async function preloadPicture(url: string): Promise<void> {
  bgPicture(url)
  await images.get(url)?.decode().catch(() => {})
}

export function bgPicture(url: string): HTMLImageElement | null {
  let img = images.get(url)
  if (!img) {
    img = new Image()
    img.src = url
    images.set(url, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

/**
 * Cuts the person out of a camera frame and puts them on a blur, a color, a picture or nothing (see-through).
 * `key` lets the live preview skip redoing a frame it already did. Returns the frame untouched until the model is ready.
 */
export function applyCamBg(cam: Cam, wc: WebcamSettings, pictureUrl: string | undefined, key?: string, opts: CutOpts = {}): Cam {
  try {
    const out = cutOut(cam, wc, pictureUrl, key, opts)
    errors = 0
    return out
  } catch (e) {
    // a failed cutout must never take the whole picture down (that was the black preview): show the camera as it is.
    // One bad frame is fine; only a run of them switches the effect off.
    if (++errors === 1) console.warn('[webcam] cutout failed, showing the plain camera', e)
    if (errors > 8) failed = true
    return cam
  }
}

function cutOut(cam: Cam, wc: WebcamSettings, pictureUrl: string | undefined, key: string | undefined, opts: CutOpts): Cam {
  if (wc.bg === 'none') return cam
  if (!seg || failed) {
    void loadSegmenter()
    return cam
  }
  const sig = `${wc.bg}|${wc.bgBlur}|${wc.bgColor}|${pictureUrl}|${opts.maxSide ?? 0}`
  const k = key ? `${key}|${sig}` : ''
  if (k && cached?.key === k) return cached.out
  if (opts.reuseMs && cached && cached.sig === sig && performance.now() - cached.at < opts.reuseMs) return cached.out
  const sc = opts.maxSide ? Math.min(1, opts.maxSide / Math.max(cam.w, cam.h)) : 1
  const w = Math.max(16, Math.round(cam.w * sc))
  const h = Math.max(16, Math.round(cam.h * sc))
  const inp = (A.inp = cv(w, h, A.inp ?? undefined))
  const ic = inp.getContext('2d', { willReadFrequently: false })!
  ic.clearRect(0, 0, w, h)
  ic.drawImage(cam.src, 0, 0, w, h)

  // video mode wants a strictly rising timestamp; our own counter (image mode used the clock, which repeats when export runs faster than 1 ms per frame)
  const masks = seg.segmentForVideo(inp, ++stamp).confidenceMasks
  const m = masks?.[Math.min(personIdx, (masks?.length ?? 1) - 1)]
  if (!m) return cam
  const f = m.getAsFloat32Array()
  const mc = (A.mask = cv(m.width, m.height, A.mask ?? undefined))
  const mctx = mc.getContext('2d')!
  const id = mctx.createImageData(m.width, m.height)
  for (let i = 0; i < f.length; i++) {
    // harden the soft edge a little (smoothstep) so hair and shoulders look clean, not ghosted
    const v = Math.min(1, Math.max(0, (f[i] - 0.35) / 0.4))
    id.data[i * 4 + 3] = Math.round(v * v * (3 - 2 * v) * 255)
  }
  mctx.putImageData(id, 0, 0)
  m.close()

  // person: the camera frame, kept only where the mask is
  const pc = (A.person = cv(w, h, A.person ?? undefined))
  const pctx = pc.getContext('2d')!
  pctx.globalCompositeOperation = 'source-over'
  pctx.clearRect(0, 0, w, h)
  pctx.drawImage(inp, 0, 0)
  pctx.globalCompositeOperation = 'destination-in'
  pctx.filter = `blur(${Math.max(1, w / 400)}px)`
  pctx.drawImage(mc, 0, 0, w, h)
  pctx.filter = 'none'
  pctx.globalCompositeOperation = 'source-over'

  const oc = (A.out = cv(w, h, A.out ?? undefined))
  const o = oc.getContext('2d')!
  o.clearRect(0, 0, w, h)
  if (wc.bg === 'blur') {
    o.filter = `blur(${Math.round(4 + wc.bgBlur * 28 * (w / 720))}px)`
    o.drawImage(inp, -20, -20, w + 40, h + 40) // oversize so the blur doesn't fade at the edges
    o.filter = 'none'
  } else if (wc.bg === 'color') {
    o.fillStyle = wc.bgColor
    o.fillRect(0, 0, w, h)
  } else if (wc.bg === 'image') {
    const img = pictureUrl ? bgPicture(pictureUrl) : null
    if (img) {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
      o.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s)
    } else {
      o.fillStyle = wc.bgColor
      o.fillRect(0, 0, w, h)
    }
  }
  o.drawImage(pc, 0, 0)
  // ponytail: no smoothing between frames, so the edge can shimmer a little. Add a mask blend over time if it bothers anyone.
  const out = { src: oc, w, h, cut: wc.bg === 'remove' }
  cached = { key: k, sig, at: performance.now(), out }
  return out
}
