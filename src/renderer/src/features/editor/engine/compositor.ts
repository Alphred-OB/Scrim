import { drawAnimatedText } from './textAnim'
import { drawKeys } from './keysOverlay'
import { drawCaptions } from './captions'
import type { BlurItem, ClickEvent, EditState, KeyPress, EffectClip, EffectSettings, GradientDef, OverlayClip, TextItem, Transition, TransitionDir, TransitionEase } from '@shared/types'
import { Track, cursorHiddenAt, sampleTrack } from './cursorTrack'
import { ZoomState, viewport, zoomAt } from './timeMap'
import { drawLive, drawWallpaper } from './backgrounds'
import { drawCursor } from './cursors'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

/** Something that can draw a source video frame region into a destination rect. */
export type FrameDrawer = (ctx: Ctx, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => void

export interface RenderInputs {
  edit: EditState
  srcW: number
  srcH: number
  t: number // source time
  drawFrame: FrameDrawer | null
  cursor: Track | null
  camera: Track | null
  clicks: ClickEvent[]
  /** keyboard shortcuts pressed while recording */
  keys?: KeyPress[]
  bgImage?: CanvasImageSource | null
  bgVideo?: CanvasImageSource | null
  /** clock for animated backgrounds; defaults to t (the preview keeps them moving while paused) */
  bgTime?: number
  bgVideoSize?: [number, number]
  webcam?: { src: CanvasImageSource; w: number; h: number } | null
  overlays?: Map<string, { src: CanvasImageSource; w: number; h: number }>
  /** brand logo image for edit.watermark */
  watermark?: { src: CanvasImageSource; w: number; h: number } | null
}

// ---------------- sizes ----------------
export function aspectRatio(edit: EditState, srcW: number, srcH: number): number {
  switch (edit.aspect) {
    case '16:9': return 16 / 9
    case '9:16': return 9 / 16
    case '1:1': return 1
    case '4:3': return 4 / 3
    case '4:5': return 4 / 5
    case '21:9': return 21 / 9
    default: {
      const c = edit.crop
      const cw = srcW * (1 - (c.left + c.right) / 100)
      const ch = srcH * (1 - (c.top + c.bottom) / 100)
      return cw / Math.max(1, ch)
    }
  }
}

/** Output pixel size for a given "resolution" (short side). */
export function outputSize(edit: EditState, srcW: number, srcH: number, res: number): [number, number] {
  const a = aspectRatio(edit, srcW, srcH)
  const ev = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  return a >= 1 ? [ev(res * a), ev(res)] : [ev(res), ev(res / a)]
}

export interface Layout {
  W: number
  H: number
  k: number // scale vs 1080p reference
  crop: { x: number; y: number; w: number; h: number } // source px
  box: { x: number; y: number; w: number; h: number } // whole window (incl. browser bar) in output px
  view: { x: number; y: number; w: number; h: number } // video area in output px
  bar: number
  radius: number
}

/**
 * "Follow" reframing: the recording fills the whole video (no frame, no padding) and the visible
 * window slides along with the cursor. Used for vertical and square videos made from a wide recording.
 */
export function followLayout(base: Layout, camera: Track | null, t: number, srcW: number, srcH: number): Layout {
  const { W, H } = base
  const A = W / H
  const c = base.crop
  let crop = { ...c }
  const p = camera ? sampleTrack(camera, Math.max(0, t)) : { x: 0.5, y: 0.5 }
  if (c.w / c.h > A) {
    const w = c.h * A
    const cx = p.x * srcW
    crop = { x: Math.min(c.x + c.w - w, Math.max(c.x, cx - w / 2)), y: c.y, w, h: c.h }
  } else {
    const h = c.w / A
    const cy = p.y * srcH
    crop = { x: c.x, y: Math.min(c.y + c.h - h, Math.max(c.y, cy - h / 2)), w: c.w, h }
  }
  const full = { x: 0, y: 0, w: W, h: H }
  return { ...base, crop, box: full, view: full, bar: 0, radius: 0 }
}

export function computeLayout(edit: EditState, srcW: number, srcH: number, W: number, H: number): Layout {
  const c = edit.crop
  const crop = {
    x: (srcW * c.left) / 100,
    y: (srcH * c.top) / 100,
    w: Math.max(16, srcW * (1 - (c.left + c.right) / 100)),
    h: Math.max(16, srcH * (1 - (c.top + c.bottom) / 100))
  }
  const k = Math.min(W, H) / 1080
  const pad = (edit.frame.padding / 100) * Math.min(W, H)
  const availW = Math.max(10, W - pad * 2)
  const availH = Math.max(10, H - pad * 2)
  const barRatio = edit.frame.browserBar ? 0.045 : 0 // bar height relative to video width
  // box aspect = w / (h + w*barRatio)
  const videoA = crop.w / crop.h
  const boxA = 1 / (1 / videoA + barRatio)
  let bw = availW
  let bh = bw / boxA
  if (bh > availH) {
    bh = availH
    bw = bh * boxA
  }
  const bar = bw * barRatio
  const box = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh }
  const view = { x: box.x, y: box.y + bar, w: bw, h: bh - bar }
  const radius = (edit.frame.radius / 100) * Math.min(bw, bh)
  return { W, H, k, crop, box, view, bar, radius }
}

// ---------------- cached layers ----------------
function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function paintGradient(ctx: Ctx, w: number, h: number, g: GradientDef): void {
  let grad: CanvasGradient
  if (g.kind === 'radial') {
    grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
  } else {
    const a = (g.angle * Math.PI) / 180
    const dx = Math.sin(a)
    const dy = -Math.cos(a)
    const len = Math.abs(w * dx) / 2 + Math.abs(h * dy) / 2
    grad = ctx.createLinearGradient(w / 2 - dx * len, h / 2 - dy * len, w / 2 + dx * len, h / 2 + dy * len)
  }
  for (const s of g.stops.slice().sort((a, b) => a.pos - b.pos)) grad.addColorStop(Math.min(1, Math.max(0, s.pos)), s.color)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

function drawCover(ctx: Ctx, img: CanvasImageSource, iw: number, ih: number, w: number, h: number, ox = 0, oy = 0): void {
  const s = Math.max(w / iw, h / ih)
  const dw = iw * s
  const dh = ih * s
  ctx.drawImage(img, ox + (w - dw) / 2, oy + (h - dh) / 2, dw, dh)
}

/** Where an overlay clip sits on the output canvas. */
export function overlayRect(o: OverlayClip, iw: number, ih: number, W: number, H: number): { x: number; y: number; w: number; h: number } {
  if (o.mode === 'full') return { x: 0, y: 0, w: W, h: H }
  const w = o.w * W
  const h = w * (ih / Math.max(1, iw))
  return { x: o.x * W - w / 2, y: o.y * H - h / 2, w, h }
}

/** Where the webcam sits on the output canvas. */
export function webcamRect(edit: EditState, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const s = edit.webcam.size * Math.min(W, H)
  return { x: edit.webcam.x * W - s / 2, y: edit.webcam.y * H - s / 2, w: s, h: s }
}

/** Where a blur / redact region sits on the output canvas, taking window layout and viewport zoom into account. */
export function blurRect(b: BlurItem, L: Layout, vp: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const cx = b.x - b.w / 2
  const cy = b.y - b.h / 2
  return {
    x: L.view.x + ((cx - vp.x) / vp.w) * L.view.w,
    y: L.view.y + ((cy - vp.y) / vp.h) * L.view.h,
    w: (b.w / vp.w) * L.view.w,
    h: (b.h / vp.h) * L.view.h
  }
}

function drawWebcam(ctx: Ctx, edit: EditState, cam: { src: CanvasImageSource; w: number; h: number }, W: number, H: number, k: number): void {
  const wc = edit.webcam
  const r = webcamRect(edit, W, H)
  const rad = wc.shape === 'circle' ? r.w / 2 : wc.shape === 'rounded' ? r.w * 0.22 : 6 * k
  ctx.save()
  if (wc.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.45)'
    ctx.shadowBlur = 28 * k
    ctx.shadowOffsetY = 8 * k
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, rad)
    ctx.fill()
    ctx.shadowColor = 'transparent'
  }
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, rad)
  ctx.clip()
  // square crop from the middle of the camera frame
  const side = Math.min(cam.w, cam.h)
  const sx = (cam.w - side) / 2
  const sy = (cam.h - side) / 2
  if (wc.mirror) {
    ctx.translate(r.x + r.w, r.y)
    ctx.scale(-1, 1)
    ctx.drawImage(cam.src, sx, sy, side, side, 0, 0, r.w, r.h)
  } else ctx.drawImage(cam.src, sx, sy, side, side, r.x, r.y, r.w, r.h)
  ctx.restore()
  if (wc.border > 0) {
    ctx.strokeStyle = wc.borderColor
    ctx.lineWidth = wc.border * k
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, rad)
    ctx.stroke()
  }
  ctx.restore()
}

function sizeOf(img: CanvasImageSource): [number, number] {
  const a = img as { videoWidth?: number; naturalWidth?: number; width?: number; videoHeight?: number; naturalHeight?: number; height?: number }
  return [a.videoWidth || a.naturalWidth || (a.width as number) || 1, a.videoHeight || a.naturalHeight || (a.height as number) || 1]
}

/** Draws a blurred background cheaply: downscale, then upscale (plus a small real blur). */
function drawBlurred(ctx: Ctx, src: AnyCanvas | CanvasImageSource, sw: number, sh: number, w: number, h: number, blurPx: number, cover: boolean): void {
  if (blurPx <= 0.2) {
    if (cover) drawCover(ctx, src, sw, sh, w, h)
    else ctx.drawImage(src, 0, 0, w, h)
    return
  }
  const f = Math.max(0.06, 1 / (1 + blurPx / 3))
  const tw = Math.max(8, Math.round(w * f))
  const th = Math.max(8, Math.round(h * f))
  const tmp = scratch(tw, th)
  const tc = tmp.getContext('2d') as Ctx
  tc.clearRect(0, 0, tw, th)
  tc.filter = `blur(${Math.max(0.5, blurPx * f * 0.8)}px)`
  if (cover) drawCover(tc, src, sw, sh, tw, th)
  else tc.drawImage(src, 0, 0, tw, th)
  tc.filter = 'none'
  ctx.imageSmoothingQuality = 'high'
  // overscan a touch so blurred edges don't show
  const o = blurPx * 2
  ctx.drawImage(tmp, 0, 0, tw, th, -o, -o, w + o * 2, h + o * 2)
}

let scratchC: AnyCanvas | null = null
function scratch(w: number, h: number): AnyCanvas {
  if (!scratchC) scratchC = makeCanvas(w, h)
  if (scratchC.width !== w || scratchC.height !== h) {
    scratchC.width = w
    scratchC.height = h
  }
  return scratchC
}

export class Renderer {
  private bgKey = ''
  private bg: AnyCanvas | null = null
  private shadowKey = ''
  private shadow: AnyCanvas | null = null
  private shadowPad = 0

  private staticBg(edit: EditState, W: number, H: number, img: CanvasImageSource | null | undefined): AnyCanvas {
    const b = edit.background
    const key = JSON.stringify([b.type, b.wallpaper, b.imagePath, b.color, b.gradient, b.blur, b.dim, W, H, !!img])
    if (this.bg && key === this.bgKey) return this.bg
    const c = makeCanvas(W, H)
    const ctx = c.getContext('2d') as Ctx
    const blur = b.blur * (Math.min(W, H) / 1080)
    if (b.type === 'color') {
      ctx.fillStyle = b.color
      ctx.fillRect(0, 0, W, H)
    } else if (b.type === 'gradient') {
      paintGradient(ctx, W, H, b.gradient)
    } else if (b.type === 'image' && img) {
      const [iw, ih] = sizeOf(img)
      drawBlurred(ctx, img, iw, ih, W, H, blur, true)
    } else {
      // wallpaper (also the fallback while an image loads)
      const tmp = makeCanvas(W, H)
      drawWallpaper(tmp.getContext('2d') as Ctx, W, H, b.wallpaper)
      drawBlurred(ctx, tmp, W, H, W, H, blur, false)
    }
    if (b.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${b.dim})`
      ctx.fillRect(0, 0, W, H)
    }
    this.bg = c
    this.bgKey = key
    return c
  }

  private shadowLayer(L: Layout, strength: number): { c: AnyCanvas; pad: number } | null {
    if (strength <= 0) return null
    const blur = (18 + strength * 0.5) * L.k
    const pad = Math.ceil(blur * 2.5)
    const key = JSON.stringify([Math.round(L.box.w), Math.round(L.box.h), Math.round(L.radius), strength, L.k])
    if (this.shadow && key === this.shadowKey) return { c: this.shadow, pad: this.shadowPad }
    const w = Math.ceil(L.box.w + pad * 2)
    const h = Math.ceil(L.box.h + pad * 2)
    const c = makeCanvas(w, h)
    const ctx = c.getContext('2d') as Ctx
    ctx.shadowColor = `rgba(0,0,0,${0.25 + strength / 180})`
    ctx.shadowBlur = blur
    ctx.shadowOffsetY = blur * 0.35
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.roundRect(pad, pad, L.box.w, L.box.h, L.radius)
    ctx.fill()
    // cut out the window itself so only the shadow remains
    ctx.shadowColor = 'transparent'
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.roundRect(pad, pad, L.box.w, L.box.h, L.radius)
    ctx.fill()
    this.shadow = c
    this.shadowKey = key
    this.shadowPad = pad
    return { c, pad }
  }

  private tiny: AnyCanvas | null = null
  private region: AnyCanvas | null = null
  private blurScratch: AnyCanvas | null = null
  private blurTiny: AnyCanvas | null = null

  /** Regional blur, pixelation, or solid redaction over a sensitive area. */
  private drawBlurRegion(ctx: Ctx, r: { x: number; y: number; w: number; h: number }, b: BlurItem, k: number): void {
    if (r.w <= 1 || r.h <= 1) return
    const w = Math.max(1, Math.round(r.w))
    const h = Math.max(1, Math.round(r.h))
    const rad = Math.min((b.radius ?? 8) * k, Math.min(w, h) / 2)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, rad)
    ctx.clip()

    if (b.type === 'solid') {
      ctx.fillStyle = b.color || '#000000'
      ctx.fillRect(r.x, r.y, r.w, r.h)
    } else {
      if (!this.blurScratch || this.blurScratch.width !== w || this.blurScratch.height !== h) {
        this.blurScratch = makeCanvas(w, h)
      }
      const sc = this.blurScratch.getContext('2d') as Ctx
      sc.clearRect(0, 0, w, h)
      sc.drawImage(ctx.canvas as CanvasImageSource, -r.x, -r.y)

      if (b.type === 'pixelate') {
        const block = Math.max(3, (3 + (b.amount ?? 0.6) * 36) * k)
        const tw = Math.max(1, Math.round(w / block))
        const th = Math.max(1, Math.round(h / block))
        if (!this.blurTiny || this.blurTiny.width !== tw || this.blurTiny.height !== th) {
          this.blurTiny = makeCanvas(tw, th)
        }
        const tc = this.blurTiny.getContext('2d') as Ctx
        tc.drawImage(this.blurScratch, 0, 0, tw, th)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(this.blurTiny, r.x, r.y, r.w, r.h)
        ctx.imageSmoothingEnabled = true
      } else {
        const px = Math.max(2, (8 + (b.amount ?? 0.6) * 36) * k)
        ctx.filter = `blur(${px.toFixed(1)}px)`
        ctx.drawImage(this.blurScratch, r.x, r.y, r.w, r.h)
        ctx.filter = 'none'
      }

      if (b.darken > 0) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, b.darken)})`
        ctx.fillRect(r.x, r.y, r.w, r.h)
      }
    }
    ctx.restore()
  }

  /** Blur, pixelate and bloom work on a copy of the recording's area. */
  private postEffects(ctx: Ctx, fx: EffectSettings, r: { x: number; y: number; w: number; h: number }, k: number): void {
    if (fx.blur < 0.01 && fx.pixelate < 0.01 && fx.bloom < 0.01 && fx.scanlines < 0.01) return
    const w = Math.max(1, Math.round(r.w))
    const h = Math.max(1, Math.round(r.h))
    if (!this.region || this.region.width !== w || this.region.height !== h) this.region = makeCanvas(w, h)
    const rc = this.region.getContext('2d') as Ctx
    rc.clearRect(0, 0, w, h)
    rc.drawImage(ctx.canvas as CanvasImageSource, r.x, r.y, r.w, r.h, 0, 0, w, h)
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    if (fx.pixelate >= 0.01) {
      const block = 2 + fx.pixelate * 40 * k
      const tw = Math.max(1, Math.round(w / block))
      const th = Math.max(1, Math.round(h / block))
      if (!this.tiny || this.tiny.width !== tw || this.tiny.height !== th) this.tiny = makeCanvas(tw, th)
      const tc = this.tiny.getContext('2d') as Ctx
      tc.drawImage(this.region, 0, 0, tw, th)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(this.tiny, r.x, r.y, r.w, r.h)
      ctx.imageSmoothingEnabled = true
    } else if (fx.blur >= 0.01) {
      ctx.filter = `blur(${(fx.blur * 24 * k).toFixed(1)}px)`
      ctx.drawImage(this.region, r.x, r.y, r.w, r.h)
      ctx.filter = 'none'
    }
    if (fx.bloom >= 0.01) {
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = Math.min(1, fx.bloom * 0.8)
      ctx.filter = `blur(${(10 + fx.bloom * 24) * k}px) brightness(1.1)`
      ctx.drawImage(this.region, r.x, r.y, r.w, r.h)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    if (fx.scanlines >= 0.01) {
      const gap = Math.max(2, 3 * k)
      ctx.fillStyle = `rgba(0,0,0,${fx.scanlines * 0.35})`
      for (let y = r.y; y < r.y + r.h; y += gap * 2) ctx.fillRect(r.x, y, r.w, gap)
    }
    ctx.restore()
  }

  private bufs: TransitionBuffers = { scratch: null, tiny: null }
  private applyTransition(ctx: Ctx, W: number, H: number, t: number, edit: EditState, k: number): void {
    const tr = transitionAt(edit, t)
    if (tr) paintTransition(ctx, W, H, tr.type, tr.amount, tr.side, k, t, this.bufs, tr.direction, tr.ease)
  }

  /** Animated backgrounds are drawn at a reduced size and scaled up: cheap, and the softness looks intentional. */
  private liveCanvas: AnyCanvas | null = null
  private drawLiveBg(ctx: Ctx, W: number, H: number, t: number, edit: EditState): void {
    const b = edit.background
    const f = Math.min(1, 960 / Math.max(W, H))
    const w = Math.max(16, Math.round(W * f))
    const h = Math.max(16, Math.round(H * f))
    if (!this.liveCanvas || this.liveCanvas.width !== w || this.liveCanvas.height !== h) this.liveCanvas = makeCanvas(w, h)
    const lc = this.liveCanvas.getContext('2d') as Ctx
    drawLive(lc, w, h, t, b.live)
    drawBlurred(ctx, this.liveCanvas, w, h, W, H, b.blur * (Math.min(W, H) / 1080), false)
    if (b.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${b.dim})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  render(ctx: Ctx, W: number, H: number, inp: RenderInputs): { layout: Layout; zoom: ZoomState } {
    const { edit, srcW, srcH, t } = inp
    const L0 = computeLayout(edit, srcW, srcH, W, H)
    const L = edit.reframe === 'follow' && edit.aspect !== 'auto' ? followLayout(L0, inp.camera, t, srcW, srcH) : L0

    // 1. background
    if (edit.background.type === 'live') {
      this.drawLiveBg(ctx, W, H, inp.bgTime ?? t, edit)
    } else if (edit.background.type === 'video' && inp.bgVideo) {
      const [vw, vh] = inp.bgVideoSize ?? sizeOf(inp.bgVideo)
      drawBlurred(ctx, inp.bgVideo, vw, vh, W, H, edit.background.blur * L.k, true)
      if (edit.background.dim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${edit.background.dim})`
        ctx.fillRect(0, 0, W, H)
      }
    } else {
      ctx.drawImage(this.staticBg(edit, W, H, inp.bgImage), 0, 0)
    }

    // layers: higher lanes draw on top; hidden tracks are skipped entirely
    const overlays = edit.tracks.media ? [...edit.overlays].sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0)) : []
    const inFrame = [...overlays].reverse().find((o) => o.mode === 'frame' && t >= o.start && t <= o.end && inp.overlays?.has(o.id))
    // before the recording starts (the lead-in) there's no window, only the background,
    // unless media is set to play inside the frame
    const showWindow = t >= 0 || !!inFrame
    let z: ZoomState = { scale: 1, fx: 0.5, fy: 0.5 }
    if (showWindow) {
      // 2. shadow
      const sh = this.shadowLayer(L, edit.frame.shadow)
      if (sh) ctx.drawImage(sh.c, L.box.x - sh.pad, L.box.y - sh.pad)

      // 3. window
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(L.box.x, L.box.y, L.box.w, L.box.h, L.radius)
      ctx.clip()
      ctx.fillStyle = '#000'
      ctx.fillRect(L.box.x, L.box.y, L.box.w, L.box.h)
      if (L.bar > 0) drawBrowserBar(ctx, L)

      const toContent = (x: number, y: number): [number, number] => [
        (x * srcW - L.crop.x) / L.crop.w,
        (y * srcH - L.crop.y) / L.crop.h
      ]
      z = zoomAt(edit.zoom, t, inp.camera, toContent)
      const vp = viewport(z)
      // media set to play "inside the frame" replaces the recording for its duration
      const fx = activeEffect(edit, t)
      const look = effectFilter(fx)
      if (look) ctx.filter = look
      if (inFrame) {
        const src = inp.overlays!.get(inFrame.id)!
        ctx.globalAlpha = inFrame.opacity
        drawFit(ctx, src.src, src.w, src.h, L.view, edit.reframe === 'follow' && L !== L0 ? 'cover' : inFrame.fit)
        ctx.globalAlpha = 1
      } else if (inp.drawFrame) {
        // best quality scaling for the recording itself (text stays crisp when zoomed or shrunk)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        inp.drawFrame(
          ctx,
          L.crop.x + vp.x * L.crop.w,
          L.crop.y + vp.y * L.crop.h,
          vp.w * L.crop.w,
          vp.h * L.crop.h,
          L.view.x,
          L.view.y,
          L.view.w,
          L.view.h
        )
      }

      ctx.filter = 'none'
      this.postEffects(ctx, fx, L.view, L.k)
      drawVignetteGrain(ctx, fx, L.view, t)

      // 3.5. regional blur / redact
      if (edit.tracks.blurs !== false && edit.blurs?.length) {
        const blurs = [...edit.blurs].sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0))
        for (const b of blurs) {
          if (t >= b.start && t <= b.end) {
            const br = blurRect(b, L, vp)
            this.drawBlurRegion(ctx, br, b, L.k)
          }
        }
      }

      // 4. cursor + click effects (inside the window clip)
      if (!inFrame && edit.cursor.show && inp.cursor && !cursorHiddenAt(inp.cursor, inp.t)) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(L.view.x, L.view.y, L.view.w, L.view.h)
        ctx.clip()
        const project = (x: number, y: number): [number, number] => {
          const [cx, cy] = toContent(x, y)
          return [L.view.x + ((cx - vp.x) / vp.w) * L.view.w, L.view.y + ((cy - vp.y) / vp.h) * L.view.h]
        }
        const pxPerSrc = L.view.w / (vp.w * L.crop.w) // output px per source px
        drawCursorLayer(ctx, edit, inp, project, pxPerSrc)
        ctx.restore()
      }
      ctx.restore()

      // 5. border
      if (edit.frame.border > 0) {
        ctx.save()
        ctx.strokeStyle = edit.frame.borderColor
        ctx.lineWidth = edit.frame.border * L.k
        ctx.beginPath()
        ctx.roundRect(L.box.x, L.box.y, L.box.w, L.box.h, L.radius)
        ctx.stroke()
        ctx.restore()
      }
    }

    // 6. imported media (picture in picture, logos, b-roll)
    for (const o of overlays) {
      if (t < o.start || t > o.end || o.mode === 'frame') continue
      const src = inp.overlays?.get(o.id)
      if (!src) continue
      if (o.mode === 'full') {
        ctx.save()
        ctx.globalAlpha = o.opacity
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, W, H)
        drawFit(ctx, src.src, src.w, src.h, { x: 0, y: 0, w: W, h: H }, o.fit)
        ctx.restore()
        continue
      }
      const r = overlayRect(o, src.w, src.h, W, H)
      ctx.save()
      ctx.globalAlpha = o.opacity
      const rad = o.radius * L.k
      if (o.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,.45)'
        ctx.shadowBlur = 30 * L.k
        ctx.shadowOffsetY = 10 * L.k
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.roundRect(r.x, r.y, r.w, r.h, rad)
        ctx.fill()
        ctx.shadowColor = 'transparent'
      }
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, rad)
      ctx.clip()
      drawCover(ctx, src.src, src.w, src.h, r.w, r.h, r.x, r.y)
      ctx.restore()
    }

    // 7. webcam
    if (edit.webcam.show && inp.webcam && t >= 0) drawWebcam(ctx, edit, inp.webcam, W, H, L.k)

    // 8. text
    if (edit.tracks.text) {
      const texts = [...edit.texts].sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0))
      for (const tx of texts) if (t >= tx.start && t <= tx.end) drawAnimatedText(ctx, tx, t, W, H, L.k)
    }

    // 8a. captions from the voice
    if (edit.captions?.show && edit.transcript) drawCaptions(ctx, edit, t, W, H, L.k)

    // 8b. keyboard shortcuts
    if (edit.keys?.show && edit.tracks.keys !== false && inp.keys?.length) drawKeys(ctx, inp.keys, edit.keys, t, W, H, L.k)

    // 8c. brand logo
    if (edit.watermark && inp.watermark) drawWatermark(ctx, edit.watermark, inp.watermark, W, H)

    // 9. transitions at the start, the end and around cuts
    this.applyTransition(ctx, W, H, t, edit, L.k)

    return { layout: L, zoom: z }
  }
}

function drawWatermark(ctx: Ctx, wm: NonNullable<EditState['watermark']>, img: { src: CanvasImageSource; w: number; h: number }, W: number, H: number): void {
  const w = W * Math.max(0.03, Math.min(0.4, wm.size))
  const h = (w * img.h) / Math.max(1, img.w)
  const m = Math.min(W, H) * (wm.margin ?? 0.03)
  const x = wm.pos.endsWith('left') ? m : W - w - m
  const y = wm.pos.startsWith('top') ? m : H - h - m
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, wm.opacity))
  ctx.drawImage(img.src, x, y, w, h)
  ctx.restore()
}

function drawBrowserBar(ctx: Ctx, L: Layout): void {
  ctx.fillStyle = '#23252c'
  ctx.fillRect(L.box.x, L.box.y, L.box.w, L.bar)
  const r = L.bar * 0.16
  const cy = L.box.y + L.bar / 2
  ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(L.box.x + L.bar * 0.55 + i * L.bar * 0.5, cy, r, 0, Math.PI * 2)
    ctx.fill()
  })
  // address pill
  ctx.fillStyle = '#16171c'
  const pw = L.box.w * 0.42
  ctx.beginPath()
  ctx.roundRect(L.box.x + (L.box.w - pw) / 2, cy - L.bar * 0.3, pw, L.bar * 0.6, L.bar * 0.3)
  ctx.fill()
}

// ---------------- cursor ----------------
function drawCursorLayer(
  ctx: Ctx,
  edit: EditState,
  inp: RenderInputs,
  project: (x: number, y: number) => [number, number],
  pxPerSrc: number
): void {
  const cs = edit.cursor
  const tr = inp.cursor!
  const t = inp.t
  const p = sampleTrack(tr, t)
  const [px, py] = project(p.x, p.y)
  const base = Math.max(0.6, pxPerSrc) * 1.0 * cs.size // cursor ~ its real size, scaled
  const clickDur = 0.55

  // spotlight first, so dim mode never darkens the click effects or the cursor
  if (cs.highlight) drawSpotlight(ctx, cs, inp, px, py, Math.max(0.6, pxPerSrc), p.idle)

  // click effects under the cursor
  if (cs.clickEffect !== 'none') {
    const hidden = new Set(cs.hiddenClicks)
    for (const c of inp.clicks) {
      const dt = t - c.t
      if (dt < 0 || dt > clickDur) continue
      if (hidden.has(Math.round(c.t * 1000))) continue
      const q = dt / clickDur
      const [cx, cy] = project(c.x, c.y)
      const R = 26 * base
      ctx.save()
      ctx.strokeStyle = cs.clickColor
      ctx.fillStyle = cs.clickColor
      if (cs.clickEffect === 'ripple') {
        for (let i = 0; i < 2; i++) {
          const qq = Math.max(0, q - i * 0.18) / (1 - i * 0.18)
          if (qq <= 0) continue
          ctx.globalAlpha = (1 - qq) * 0.6
          ctx.beginPath()
          ctx.arc(cx, cy, R * (0.25 + qq * 0.9), 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (cs.clickEffect === 'ring') {
        ctx.globalAlpha = 1 - q
        ctx.lineWidth = 3 * base * (1 - q * 0.5)
        ctx.beginPath()
        ctx.arc(cx, cy, R * (0.3 + q * 0.8), 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.globalAlpha = (1 - q) * 0.55
        ctx.beginPath()
        ctx.arc(cx, cy, R * (0.9 - q * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }

  // idle fade
  let alpha = 1
  if (cs.hideIdle && p.idle > 1.5) alpha = Math.max(0, 1 - (p.idle - 1.5) / 0.4)
  if (alpha <= 0.01) return

  // press bounce
  let bounce = 1
  if (cs.clickBounce > 1) {
    const dur = cs.bounceMs / 1000
    for (const c of inp.clicks) {
      const dt = t - c.t
      if (dt >= 0 && dt < dur) {
        const q = dt / dur
        const dip = Math.sin(q * Math.PI) // 0 -> 1 -> 0
        bounce = Math.min(bounce, 1 - (1 - 1 / cs.clickBounce) * dip * 0.6)
      }
    }
  }
  const rot = Math.max(-0.5, Math.min(0.5, p.vx * cs.sway * 0.6))

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(px, py)
  ctx.rotate(rot)
  drawCursor(ctx, cs.style, base * bounce, { color: cs.color, outline: cs.outline, outlineWidth: cs.outlineWidth, shadow: cs.shadow, opacity: cs.opacity })
  ctx.restore()
}

// ---------------- text ----------------
/** How strongly the spotlight shows right now (0..1), based on its "when" setting. */
function spotlightStrength(cs: EditState['cursor'], t: number, idle: number, clicks: RenderInputs['clicks']): number {
  if (cs.highlightWhen === 'moving') return Math.max(0, Math.min(1, 1 - (idle - 0.3) / 0.5))
  if (cs.highlightWhen === 'clicks') {
    let k = 0
    for (const c of clicks) {
      const up = c.up ?? c.t + 0.1
      if (t < c.t - 0.3 || t > up + 0.7) continue
      const v = t < c.t ? (t - (c.t - 0.3)) / 0.3 : t <= up + 0.3 ? 1 : 1 - (t - up - 0.3) / 0.4
      k = Math.max(k, v)
    }
    return Math.max(0, Math.min(1, k))
  }
  return 1
}

function drawSpotlight(ctx: Ctx, cs: EditState['cursor'], inp: RenderInputs, px: number, py: number, unit: number, idle: number): void {
  const k = spotlightStrength(cs, inp.t, idle, inp.clicks)
  if (k <= 0.01) return
  const R = 120 * unit * cs.highlightSize
  const soft = Math.max(0, Math.min(1, cs.highlightSoftness))
  const hard = 1 - soft // where the edge starts fading
  ctx.save()
  if (cs.highlightMode === 'dim') {
    // everything outside the circle gets shaded; the gradient's last color fills the rest of the view
    const g = ctx.createRadialGradient(px, py, 0, px, py, R)
    g.addColorStop(0, hexA(cs.highlightDimColor, 0))
    g.addColorStop(Math.min(0.98, hard * 0.98), hexA(cs.highlightDimColor, 0))
    g.addColorStop(1, hexA(cs.highlightDimColor, cs.highlightDim))
    ctx.globalAlpha = k
    ctx.fillStyle = g
    ctx.fillRect(-1e5, -1e5, 2e5, 2e5)
  } else if (cs.highlightMode === 'ring') {
    const w = Math.max(1, 3 * unit * cs.highlightRing)
    ctx.globalAlpha = k * Math.min(1, cs.highlightOpacity * 2)
    ctx.strokeStyle = cs.highlightColor
    ctx.lineWidth = w
    if (soft > 0.05) ctx.shadowColor = cs.highlightColor
    ctx.shadowBlur = soft * 12 * unit
    ctx.beginPath()
    ctx.arc(px, py, R * 0.7, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    const g = ctx.createRadialGradient(px, py, 0, px, py, R)
    g.addColorStop(0, hexA(cs.highlightColor, cs.highlightOpacity))
    g.addColorStop(Math.min(0.98, hard * 0.98), hexA(cs.highlightColor, cs.highlightOpacity))
    g.addColorStop(1, hexA(cs.highlightColor, 0))
    ctx.globalAlpha = k
    ctx.fillStyle = g
    ctx.fillRect(px - R, py - R, R * 2, R * 2)
  }
  ctx.restore()
}

export interface TransitionBuffers { scratch: AnyCanvas | null; tiny: AnyCanvas | null }

/** Draws a transition over the finished frame. Also used by the small previews in the Transitions tab. */
export function paintTransition(
  ctx: Ctx, W: number, H: number, type: string, amount: number, side: 'in' | 'out', k: number, t: number, bufs: TransitionBuffers,
  direction: TransitionDir = 'none', ease: TransitionEase = 'smooth'
): void {
  if (amount <= 0.001) return
  const a = Math.min(1, amount)
  // speed curve: how the effect builds toward the cut
  const e = ease === 'linear' ? a : ease === 'snappy' ? 1 - (1 - a) ** 3 : ease === 'gentle' ? a * a : a * a * (3 - 2 * a)
  // unit vector the transition travels along (left = moves toward the left)
  const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0
  const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
  const out = side === 'out'
  const color = type === 'fade-white' || type === 'flash' ? '255,255,255' : '0,0,0'
  // fades and wipes can sweep in a direction: the color covers the frame from one edge
  // going out, and uncovers it toward the same side coming in
  const sweep = (soft: number) => {
    const dir = direction === 'none' ? 'right' : direction
    const [x0, y0, x1, y1] = dir === 'right' ? [0, 0, W, 0] : dir === 'left' ? [W, 0, 0, 0] : dir === 'down' ? [0, 0, 0, H] : [0, H, 0, 0]
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    const s = Math.max(0.001, soft)
    const front = out ? e * (1 + s) : (1 - e) * (1 + s) - s
    for (let i = 0; i <= 20; i++) {
      const u = i / 20
      const al = out ? (front - u) / s : (u - front) / s
      g.addColorStop(u, `rgba(${color},${Math.max(0, Math.min(1, al))})`)
    }
    ctx.save()
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
  if (type === 'fade' || type === 'fade-white' || type === 'flash') {
    if (direction !== 'none' && type !== 'flash') return sweep(0.35)
    ctx.save()
    ctx.fillStyle = `rgb(${color})`
    ctx.globalAlpha = type === 'flash' ? e * e * e : e
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
    return
  }
  if (type === 'wipe') return sweep(0.02)
  // the rest reshape the finished frame, so copy it first
  if (!bufs.scratch || bufs.scratch.width !== W || bufs.scratch.height !== H) bufs.scratch = makeCanvas(W, H)
  const sc = bufs.scratch.getContext('2d') as Ctx
  sc.clearRect(0, 0, W, H)
  sc.drawImage(ctx.canvas as CanvasImageSource, 0, 0)
  const img = bufs.scratch
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  const around = (fn: () => void) => {
    ctx.save()
    ctx.translate(W / 2, H / 2)
    fn()
    ctx.drawImage(img, -W / 2, -H / 2)
    ctx.restore()
  }
  switch (type) {
    case 'blur':
      ctx.filter = `blur(${Math.round(e * 28 * k)}px)`
      ctx.drawImage(img, 0, 0)
      break
    case 'morph':
      // melts into a soft, bright blur and forms again on the other side
      ctx.filter = `blur(${Math.round(e * 22 * k)}px) saturate(${1 + e * 0.6}) brightness(${1 + e * 0.25})`
      around(() => ctx.scale(1 + 0.08 * e, 1 + 0.08 * e))
      break
    case 'zoom':
      ctx.filter = `blur(${Math.round(e * 8 * k)}px)`
      around(() => ctx.scale(1 + 0.45 * e, 1 + 0.45 * e))
      break
    case 'zoom-out':
      around(() => ctx.scale(1 - 0.4 * e, 1 - 0.4 * e))
      break
    case 'spin':
      ctx.filter = `blur(${Math.round(e * 10 * k)}px)`
      around(() => {
        ctx.rotate((out ? 1 : -1) * e * 0.6)
        ctx.scale(1 + 0.6 * e, 1 + 0.6 * e)
      })
      break
    case 'whip': {
      // quick pan with motion smear, leaving toward the direction and arriving from the other side
      const ux = direction === 'none' ? -1 : dx
      const uy = direction === 'none' ? 0 : dy
      const s = out ? 1 : -1
      ctx.filter = `blur(${Math.round(e * 14 * k)}px)`
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = i === 0 ? 1 : 0.35
        const m = s * e * 0.35 - s * i * e * 0.04
        ctx.drawImage(img, ux * m * W, uy * m * H)
      }
      break
    }
    case 'slide-left':
    case 'slide-right':
    case 'slide-up':
    case 'slide-down': {
      // dynamic push with motion blur so the cut is punchy and never drops to an empty black frame
      const horiz = type === 'slide-left' || type === 'slide-right'
      const sign = type === 'slide-left' || type === 'slide-up' ? -1 : 1
      const d = (out ? sign : -sign) * (e * 0.45) * (horiz ? W : H)
      ctx.filter = `blur(${Math.round(e * 10 * k)}px)`
      ctx.globalAlpha = Math.max(0.25, 1 - e * 0.5)
      ctx.drawImage(img, horiz ? d : 0, horiz ? 0 : d)
      break
    }
    case 'iris': {
      const R = (Math.hypot(W, H) / 2) * (1 - e)
      ctx.beginPath()
      ctx.arc(W / 2, H / 2, Math.max(0.5, R), 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, 0, 0)
      break
    }
    case 'pixelate': {
      const block = 1 + e * 60 * k
      const tw = Math.max(1, Math.round(W / block))
      const th = Math.max(1, Math.round(H / block))
      if (!bufs.tiny || bufs.tiny.width !== tw || bufs.tiny.height !== th) bufs.tiny = makeCanvas(tw, th)
      ;(bufs.tiny.getContext('2d') as Ctx).drawImage(img, 0, 0, tw, th)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(bufs.tiny, 0, 0, W, H)
      break
    }
    case 'glitch': {
      // horizontal slices jump sideways, with a few colored bars; changes every frame
      ctx.drawImage(img, 0, 0)
      const seed = Math.floor(t * 30)
      const rnd = (n: number) => {
        const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
        return x - Math.floor(x)
      }
      const slices = 10
      for (let i = 0; i < slices; i++) {
        if (rnd(i) > 0.35 + (1 - e) * 0.6) continue
        const y = rnd(i + 50) * H
        const h = (0.02 + rnd(i + 90) * 0.08) * H
        const dx = (rnd(i + 130) - 0.5) * W * 0.25 * e
        ctx.drawImage(img, 0, y, W, h, dx, y, W, h)
        ctx.fillStyle = rnd(i + 170) > 0.5 ? 'rgba(255,0,80,.18)' : 'rgba(0,220,255,.18)'
        ctx.fillRect(dx, y, W, h * 0.3)
      }
      break
    }
    default:
      ctx.drawImage(img, 0, 0)
  }
  ctx.restore()
  if (type === 'zoom' || type === 'blur' || type === 'spin' || type === 'zoom-out') {
    ctx.save()
    ctx.globalAlpha = e * 0.35
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
}

/** CSS filter for the recording from the chosen look and adjustments ('' when untouched). */
export function effectFilter(fx: EffectSettings): string {
  const looks: Record<string, string> = {
    none: '',
    vivid: 'saturate(1.35) contrast(1.08)',
    punchy: 'contrast(1.25) saturate(1.2)',
    warm: 'sepia(0.18) saturate(1.15) hue-rotate(-8deg)',
    cool: 'saturate(1.05) hue-rotate(12deg) brightness(1.02)',
    mono: 'grayscale(1)',
    noir: 'grayscale(1) contrast(1.35) brightness(0.95)',
    sepia: 'sepia(0.75)',
    vintage: 'sepia(0.35) contrast(0.92) saturate(0.85) brightness(1.05)',
    matte: 'contrast(0.85) brightness(1.08) saturate(0.9)',
    cinematic: 'contrast(1.12) saturate(1.1) sepia(0.12) hue-rotate(-6deg)',
    cyberpunk: 'hue-rotate(-25deg) saturate(1.6) contrast(1.1)',
    dreamy: 'brightness(1.08) saturate(1.15) contrast(0.9)',
    faded: 'contrast(0.8) brightness(1.1) saturate(0.75)',
    'high-key': 'brightness(1.2) contrast(0.9)',
    'low-key': 'brightness(0.8) contrast(1.25)',
    invert: 'invert(1)'
  }
  const parts = [looks[fx.look] ?? '']
  if (Math.abs(fx.brightness - 1) > 0.005) parts.push(`brightness(${fx.brightness.toFixed(3)})`)
  if (Math.abs(fx.contrast - 1) > 0.005) parts.push(`contrast(${fx.contrast.toFixed(3)})`)
  if (Math.abs(fx.saturation - 1) > 0.005) parts.push(`saturate(${fx.saturation.toFixed(3)})`)
  return parts.filter(Boolean).join(' ')
}

let grainTile: AnyCanvas | null = null
function drawVignetteGrain(ctx: Ctx, fx: EffectSettings, r: { x: number; y: number; w: number; h: number }, t: number): void {
  if (fx.vignette > 0.001) {
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const R = Math.hypot(r.w, r.h) / 2
    const g = ctx.createRadialGradient(cx, cy, R * 0.35, cx, cy, R)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, fx.vignette * 0.85)})`)
    ctx.fillStyle = g
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }
  if (fx.grain > 0.001) {
    // one small noise tile, shifted every frame so the grain moves like film
    if (!grainTile) {
      grainTile = makeCanvas(128, 128)
      const g = grainTile.getContext('2d') as Ctx
      const img = g.createImageData(128, 128)
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = 255
      }
      g.putImageData(img, 0, 0)
    }
    const pat = ctx.createPattern(grainTile as CanvasImageSource, 'repeat')
    if (pat) {
      const f = Math.floor(t * 24)
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
      ctx.globalAlpha = fx.grain * 0.18
      ctx.globalCompositeOperation = 'overlay'
      ctx.translate((f * 37) % 128, (f * 59) % 128)
      ctx.fillStyle = pat
      ctx.fillRect(r.x - 128, r.y - 128, r.w + 256, r.h + 256)
      ctx.restore()
    }
  }
}

/** Draws media into a box, letterboxed (contain) or cropped to fill (cover). */
function drawFit(ctx: Ctx, src: CanvasImageSource, sw: number, sh: number, box: { x: number; y: number; w: number; h: number }, fit: 'contain' | 'cover'): void {
  if (fit === 'cover') return drawCover(ctx, src, sw, sh, box.w, box.h, box.x, box.y)
  const s = Math.min(box.w / sw, box.h / sh)
  const w = sw * s
  const h = sh * s
  ctx.drawImage(src, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h)
}

/** The effect in charge at time t: the top Effects-track clip there, otherwise the whole-video effect. */
export function activeEffect(edit: EditState, t: number): EffectSettings {
  if (!edit.tracks.effects) return edit.effects
  let best: EffectClip | null = null
  for (const c of edit.effectClips) if (t >= c.start && t <= c.end && (!best || (c.lane ?? 0) >= (best.lane ?? 0))) best = c
  return best ?? edit.effects
}

/** Which transition is playing at source time t, and how far into it (amount peaks at the cut). */
export interface ActiveTransition { type: string; amount: number; side: 'in' | 'out'; direction: TransitionDir; ease: TransitionEase }
export function transitionAt(edit: EditState, t: number): ActiveTransition | null {
  const tr = edit.transitions
  const clips = [...edit.clips].sort((a, b) => a.start - b.start)
  const lead = edit.leadIn ?? 0
  const pickT = (x: Transition | undefined): Transition | null => (x && x.type !== 'none' && x.duration > 0 ? x : null)
  // in the lead-in: the start transition at its beginning, and a cut into the recording at its end
  if (t < 0 && lead > 0) {
    let best: ActiveTransition | null = null
    const intro = pickT(tr.intro)
    const into = pickT(tr.perCut['lead'] ?? tr.cut)
    if (intro && t + lead < intro.duration) best = { type: intro.type, amount: 1 - (t + lead) / intro.duration, side: 'in', direction: intro.direction ?? 'none', ease: intro.ease ?? 'smooth' }
    if (into && -t < into.duration / 2) {
      const amt = 1 - -t / (into.duration / 2)
      if (!best || amt > best.amount) best = { type: into.type, amount: amt, side: 'out', direction: into.direction ?? 'none', ease: into.ease ?? 'smooth' }
    }
    return best
  }
  const i = clips.findIndex((c) => t >= c.start - 1e-6 && t <= c.end + 1e-6)
  if (i < 0) return null
  const c = clips[i]
  const fromStart = (t - c.start) / c.speed // output seconds
  const toEnd = (c.end - t) / c.speed
  const pick = (x: Transition | undefined): Transition | null => (x && x.type !== 'none' && x.duration > 0 ? x : null)
  // the cut before this clip (or the intro) and the cut after it (or the outro)
  const before = i === 0 ? (lead > 0 ? pick(tr.perCut['lead'] ?? tr.cut) : pick(tr.intro)) : pick(tr.perCut[c.id] ?? tr.cut)
  const after = i === clips.length - 1 ? pick(tr.outro) : pick(tr.perCut[clips[i + 1].id] ?? tr.cut)
  // intro/outro use their full length; a cut shares its length between both sides
  let best: ActiveTransition | null = null
  const consider = (x: { type: string; direction?: TransitionDir; ease?: TransitionEase }, amount: number, side: 'in' | 'out') => {
    if (amount > 0 && (!best || amount > best.amount)) best = { type: x.type, amount, side, direction: x.direction ?? 'none', ease: x.ease ?? 'smooth' }
  }
  if (before) {
    const d = i === 0 && lead <= 0 ? before.duration : before.duration / 2
    if (fromStart < d) consider(before, 1 - fromStart / d, 'in')
  }
  if (after) {
    const d = i === clips.length - 1 ? after.duration : after.duration / 2
    if (toEnd < d) consider(after, 1 - toEnd / d, 'out')
  }
  // transitions placed anywhere on the Transitions track
  for (const it of tr.items ?? []) {
    if (it.type === 'none' || t < it.start || t > it.end) continue
    const at = (it.start + it.end) / 2
    const half = Math.max(0.01, (it.end - it.start) / 2)
    consider(it, 1 - Math.abs(t - at) / half, t < at ? 'out' : 'in')
  }
  return best
}

function hexA(hex: string, a: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function textFont(tx: TextItem, k: number): string {
  return `${tx.italic ? 'italic ' : ''}${tx.bold ? 700 : 400} ${Math.round(tx.size * k)}px "${tx.font}", "Segoe UI", sans-serif`
}

/** Returns the text box in output px (used for hit testing/dragging). */
export function measureText(ctx: Ctx, tx: TextItem, W: number, H: number, k: number): { x: number; y: number; w: number; h: number } {
  ctx.save()
  ctx.font = textFont(tx, k)
  ;(ctx as CanvasRenderingContext2D).letterSpacing = `${tx.letterSpacing * k}px`
  const lines = tx.text.split('\n')
  const lh = tx.size * k * 1.25
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width), 4)
  ctx.restore()
  const pad = tx.bg ? tx.padding * k : 0
  const bw = w + pad * 2
  const bh = lh * lines.length + pad * 2
  return { x: tx.x * W - bw / 2, y: tx.y * H - bh / 2, w: bw, h: bh }
}
