import type { ClickEvent, EditState, GradientDef, OverlayClip, TextItem } from '@shared/types'
import { Track, sampleTrack } from './cursorTrack'
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
  bgImage?: CanvasImageSource | null
  bgVideo?: CanvasImageSource | null
  bgVideoSize?: [number, number]
  webcam?: { src: CanvasImageSource; w: number; h: number } | null
  overlays?: Map<string, { src: CanvasImageSource; w: number; h: number }>
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
  if (o.fullscreen) return { x: 0, y: 0, w: W, h: H }
  const w = o.w * W
  const h = w * (ih / Math.max(1, iw))
  return { x: o.x * W - w / 2, y: o.y * H - h / 2, w, h }
}

/** Where the webcam sits on the output canvas. */
export function webcamRect(edit: EditState, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const s = edit.webcam.size * Math.min(W, H)
  return { x: edit.webcam.x * W - s / 2, y: edit.webcam.y * H - s / 2, w: s, h: s }
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
    const L = computeLayout(edit, srcW, srcH, W, H)

    // 1. background
    if (edit.background.type === 'live') {
      this.drawLiveBg(ctx, W, H, t, edit)
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
    const z = zoomAt(edit.zoom, t, inp.camera, toContent)
    const vp = viewport(z)
    if (inp.drawFrame) {
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

    // 4. cursor + click effects (inside the window clip)
    if (edit.cursor.show && inp.cursor) {
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

    // 6. imported media (picture in picture, logos, b-roll)
    for (const o of edit.overlays) {
      if (t < o.start || t > o.end) continue
      const src = inp.overlays?.get(o.id)
      if (!src) continue
      const r = overlayRect(o, src.w, src.h, W, H)
      ctx.save()
      ctx.globalAlpha = o.opacity
      const rad = o.fullscreen ? 0 : o.radius * L.k
      if (o.shadow && !o.fullscreen) {
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
    if (edit.webcam.show && inp.webcam) drawWebcam(ctx, edit, inp.webcam, W, H, L.k)

    // 8. text
    for (const tx of edit.texts) if (t >= tx.start && t <= tx.end) drawText(ctx, tx, t, W, H, L.k)

    return { layout: L, zoom: z }
  }
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

  if (cs.highlight) {
    ctx.save()
    const R = 60 * base * cs.highlightSize
    const g = ctx.createRadialGradient(px, py, 0, px, py, R)
    g.addColorStop(0, hexA(cs.highlightColor, 0.4))
    g.addColorStop(1, hexA(cs.highlightColor, 0))
    ctx.fillStyle = g
    ctx.globalAlpha = alpha
    ctx.fillRect(px - R, py - R, R * 2, R * 2)
    ctx.restore()
  }

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

function drawText(ctx: Ctx, tx: TextItem, t: number, W: number, H: number, k: number): void {
  const inDur = 0.35
  const since = t - tx.start
  const until = tx.end - t
  let alpha = 1
  let dy = 0
  let scale = 1
  let chars = tx.text.length
  const qin = Math.min(1, since / inDur)
  const qout = Math.min(1, until / inDur)
  switch (tx.anim) {
    case 'fade':
      alpha = Math.min(qin, qout)
      break
    case 'slide-up':
      alpha = Math.min(qin, qout)
      dy = (1 - Math.min(qin, 1)) * 40 * k + (1 - qout) * -20 * k
      break
    case 'pop': {
      alpha = Math.min(qin * 1.5, qout, 1)
      const q = qin
      scale = q < 1 ? 0.8 + 0.2 * (1 - Math.pow(1 - q, 3)) + Math.sin(q * Math.PI) * 0.06 : 1
      if (qout < 1) scale = 0.9 + 0.1 * qout
      break
    }
    case 'typewriter':
      chars = Math.floor(Math.min(1, since / Math.max(0.4, tx.text.length * 0.04)) * tx.text.length)
      alpha = qout
      break
  }
  if (alpha <= 0) return
  const box = measureText(ctx, tx, W, H, k)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2 + dy
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-box.w / 2, -box.h / 2)
  if (tx.bg) {
    ctx.fillStyle = hexA(tx.bg, tx.bgOpacity)
    ctx.beginPath()
    ctx.roundRect(0, 0, box.w, box.h, tx.radius * k)
    ctx.fill()
  }
  ctx.font = textFont(tx, k)
  ;(ctx as CanvasRenderingContext2D).letterSpacing = `${tx.letterSpacing * k}px`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = tx.color
  if (tx.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.45)'
    ctx.shadowBlur = 10 * k
    ctx.shadowOffsetY = 2 * k
  }
  const pad = tx.bg ? tx.padding * k : 0
  const lh = tx.size * k * 1.25
  let remaining = chars
  tx.text.split('\n').forEach((line, i) => {
    const shown = line.slice(0, Math.max(0, remaining))
    remaining -= line.length + 1
    const fullW = ctx.measureText(line).width
    const inner = box.w - pad * 2
    const x = tx.align === 'left' ? pad : tx.align === 'right' ? pad + inner - fullW : pad + (inner - fullW) / 2
    const y = pad + lh * i + lh / 2
    ctx.fillText(shown, x, y)
    if (tx.underline && shown) {
      const sw = ctx.measureText(shown).width
      ctx.shadowColor = 'transparent'
      ctx.fillRect(x, y + tx.size * k * 0.45, sw, Math.max(1, tx.size * k * 0.06))
    }
  })
  ctx.restore()
}
