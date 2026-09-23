// Text rendering with in / out animations and a loop while the text is on screen.
// Used by the compositor (preview and export) and by the little previews in the Text panel.
import type { TextItem, TextLoop, TextMotion } from '@shared/types'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export const TEXT_MOTIONS: { id: TextMotion; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade' },
  { id: 'pop', name: 'Pop' },
  { id: 'slide-up', name: 'Rise' },
  { id: 'slide-down', name: 'Sink' },
  { id: 'slide-left', name: 'Slide left' },
  { id: 'slide-right', name: 'Slide right' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'drop', name: 'Drop' },
  { id: 'blur', name: 'Blur' },
  { id: 'wipe', name: 'Wipe' },
  { id: 'spin', name: 'Spin' },
  { id: 'flip', name: 'Flip' },
  { id: 'typewriter', name: 'Typewriter' },
  { id: 'letters', name: 'Letters' },
  { id: 'words', name: 'Words' }
]
export const TEXT_LOOPS: { id: TextLoop; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'float', name: 'Float' },
  { id: 'wiggle', name: 'Wiggle' },
  { id: 'shake', name: 'Shake' },
  { id: 'blink', name: 'Blink' },
  { id: 'wave', name: 'Wave' },
  { id: 'glow', name: 'Glow' }
]

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3)
const outBack = (p: number) => {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2)
}
const outBounce = (p: number) => {
  const n = 7.5625
  const d = 2.75
  if (p < 1 / d) return n * p * p
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375
  return n * (p -= 2.625 / d) * p + 0.984375
}

function hexA(hex: string, a: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function font(tx: TextItem, k: number): string {
  return `${tx.italic ? 'italic ' : ''}${tx.bold ? 700 : 400} ${Math.round(tx.size * k)}px "${tx.font}", "Segoe UI", sans-serif`
}

/** Whole text transform for one phase. p goes 0 (hidden) to 1 (fully shown). */
interface Look { alpha: number; dx: number; dy: number; scale: number; sy: number; rot: number; blur: number; reveal: number }
const still = (): Look => ({ alpha: 1, dx: 0, dy: 0, scale: 1, sy: 1, rot: 0, blur: 0, reveal: 1 })

function motion(m: TextMotion, p: number, entering: boolean, k: number, L: Look): void {
  if (p >= 1 || m === 'none') return
  const e = outCubic(p)
  const dir = entering ? 1 : -1
  switch (m) {
    case 'fade':
      L.alpha *= e
      break
    case 'slide-up':
      L.dy += (1 - e) * 70 * k * dir
      L.alpha *= clamp(p * 2)
      break
    case 'slide-down':
      L.dy -= (1 - e) * 70 * k * dir
      L.alpha *= clamp(p * 2)
      break
    case 'slide-left':
      L.dx += (1 - e) * 120 * k * dir
      L.alpha *= clamp(p * 2)
      break
    case 'slide-right':
      L.dx -= (1 - e) * 120 * k * dir
      L.alpha *= clamp(p * 2)
      break
    case 'pop':
      L.scale *= entering ? 0.4 + 0.6 * outBack(p) : 0.6 + 0.4 * e
      L.alpha *= clamp(p * 3)
      break
    case 'zoom':
      L.scale *= entering ? 1.8 - 0.8 * e : 1 + (1 - e) * 0.5
      L.alpha *= e
      break
    case 'drop':
      L.dy -= (1 - (entering ? outBounce(p) : e)) * 160 * k * dir
      L.alpha *= clamp(p * 4)
      break
    case 'blur':
      L.blur += (1 - e) * 24 * k
      L.alpha *= e
      L.scale *= 1 + (1 - e) * 0.08
      break
    case 'wipe':
      L.reveal *= e
      break
    case 'spin':
      L.rot += (1 - e) * -0.6 * dir
      L.scale *= 0.5 + 0.5 * e
      L.alpha *= e
      break
    case 'flip':
      L.sy *= Math.max(0.02, e)
      L.alpha *= clamp(p * 2)
      break
    // typewriter, letters and words work per character or word (see below)
  }
}

const perUnit = (m: TextMotion) => m === 'typewriter' || m === 'letters' || m === 'words'

/** Measures the text box in output px (for hit testing and dragging). */
export function textBox(ctx: Ctx, tx: TextItem, W: number, H: number, k: number): { x: number; y: number; w: number; h: number } {
  ctx.save()
  ctx.font = font(tx, k)
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

/** Draws one text item at source time t. */
export function drawAnimatedText(ctx: Ctx, tx: TextItem, t: number, W: number, H: number, k: number): void {
  const animIn = tx.animIn ?? 'fade'
  const animOut = tx.animOut ?? 'fade'
  const inDur = Math.max(0.05, tx.inDur ?? 0.35)
  const outDur = Math.max(0.05, tx.outDur ?? 0.35)
  const since = t - tx.start
  const until = tx.end - t
  // on a very short text, in and out share the time
  const room = Math.max(0.1, tx.end - tx.start)
  const scaleDur = Math.min(1, room / (inDur + outDur + 0.001))
  const pin = animIn === 'none' ? 1 : clamp(since / (inDur * scaleDur))
  const pout = animOut === 'none' ? 1 : clamp(until / (outDur * scaleDur))

  const L = still()
  motion(animIn, pin, true, k, L)
  motion(animOut, pout, false, k, L)

  // loop while on screen, eased in and out with the text
  const loop = tx.loop ?? 'none'
  const amp = Math.min(pin, pout)
  const lt = since
  let glow = 0
  switch (loop) {
    case 'pulse':
      L.scale *= 1 + 0.05 * amp * Math.sin(lt * Math.PI * 2 * 1.2)
      break
    case 'float':
      L.dy += Math.sin(lt * Math.PI * 2 * 0.5) * 10 * k * amp
      break
    case 'wiggle':
      L.rot += Math.sin(lt * Math.PI * 2 * 1.1) * 0.05 * amp
      break
    case 'shake': {
      const burst = (lt % 2) < 0.45 ? 1 : 0
      L.dx += Math.sin(lt * 55) * 5 * k * amp * burst
      L.rot += Math.sin(lt * 41) * 0.015 * amp * burst
      break
    }
    case 'blink':
      L.alpha *= 1 - amp * 0.55 * (0.5 + 0.5 * Math.cos(lt * Math.PI * 2 * 0.9))
      break
    case 'glow':
      glow = amp * (0.55 + 0.45 * Math.sin(lt * Math.PI * 2 * 0.8))
      break
  }
  if (L.alpha <= 0.002 || L.reveal <= 0.002) return

  // per character / word progress for the unit based animations
  const unitMode: 'char' | 'word' | null =
    (animIn === 'words' && pin < 1) || (animOut === 'words' && pout < 1) ? 'word'
      : (perUnit(animIn) && pin < 1) || (perUnit(animOut) && pout < 1) || loop === 'wave' ? 'char' : null
  const phase: { m: TextMotion; p: number; entering: boolean } | null =
    perUnit(animIn) && pin < 1 ? { m: animIn, p: pin, entering: true } : perUnit(animOut) && pout < 1 ? { m: animOut, p: pout, entering: false } : null

  const box = textBox(ctx, tx, W, H, k)
  const cx = box.x + box.w / 2 + L.dx
  const cy = box.y + box.h / 2 + L.dy
  ctx.save()
  ctx.globalAlpha = clamp(L.alpha)
  ctx.translate(cx, cy)
  if (L.rot) ctx.rotate(L.rot)
  ctx.scale(L.scale, L.scale * L.sy)
  ctx.translate(-box.w / 2, -box.h / 2)
  if (L.blur > 0.3) ctx.filter = `blur(${L.blur.toFixed(1)}px)`
  if (L.reveal < 1) {
    ctx.beginPath()
    ctx.rect(-4, -4, (box.w + 8) * L.reveal, box.h + 8)
    ctx.clip()
  }
  // the box grows with the text in typewriter mode, otherwise it's just there
  if (tx.bg) {
    ctx.fillStyle = hexA(tx.bg, tx.bgOpacity)
    ctx.beginPath()
    ctx.roundRect(0, 0, box.w, box.h, tx.radius * k)
    ctx.fill()
  }
  ctx.font = font(tx, k)
  ;(ctx as CanvasRenderingContext2D).letterSpacing = `${tx.letterSpacing * k}px`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = tx.color
  if (glow > 0) {
    ctx.shadowColor = tx.color
    ctx.shadowBlur = (8 + 26 * glow) * k
  } else if (tx.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.45)'
    ctx.shadowBlur = 10 * k
    ctx.shadowOffsetY = 2 * k
  }
  const pad = tx.bg ? tx.padding * k : 0
  const lh = tx.size * k * 1.25
  const lines = tx.text.split('\n')
  const total = tx.text.replace(/\s/g, '').length
  const words = tx.text.split(/\s+/).filter(Boolean).length
  let unitIndex = 0 // running character or word index across lines

  lines.forEach((line, li) => {
    const fullW = ctx.measureText(line).width
    const inner = box.w - pad * 2
    const x0 = tx.align === 'left' ? pad : tx.align === 'right' ? pad + inner - fullW : pad + (inner - fullW) / 2
    const y = pad + lh * li + lh / 2
    if (!unitMode) {
      ctx.fillText(line, x0, y)
      if (tx.underline) underline(ctx, tx, k, x0, y, fullW)
      return
    }
    // draw piece by piece
    const pieces = unitMode === 'word' ? line.split(/(\s+)/) : [...line]
    let x = x0
    for (const piece of pieces) {
      const w = ctx.measureText(piece).width
      const blank = /^\s+$/.test(piece)
      if (!blank) {
        const n = unitMode === 'word' ? words : total
        const i = unitIndex++
        let a = 1
        let dy = 0
        let sc = 1
        if (phase) {
          const m = phase.m
          if (m === 'typewriter') {
            // characters appear (or disappear from the end) one by one
            a = i < phase.p * n ? 1 : 0
          } else {
            const spread = 0.65
            const q = clamp((phase.p * (1 + spread) - (i / Math.max(1, n - 1)) * spread) / 1)
            const e = outCubic(q)
            a = clamp(q * 1.6)
            dy = (1 - e) * tx.size * k * (m === 'words' ? 0.5 : 0.6) * (phase.entering ? 1 : -1)
            sc = m === 'letters' ? 0.6 + 0.4 * outBack(q) : 1
          }
        }
        if (loop === 'wave') dy += Math.sin(lt * 6 - i * 0.55) * tx.size * k * 0.12 * amp
        if (a > 0.002) {
          ctx.save()
          ctx.globalAlpha *= a
          if (sc !== 1) {
            ctx.translate(x + w / 2, y + dy)
            ctx.scale(sc, sc)
            ctx.fillText(piece, -w / 2, 0)
          } else ctx.fillText(piece, x, y + dy)
          ctx.restore()
        }
      }
      x += w
    }
    if (tx.underline) underline(ctx, tx, k, x0, y, fullW * (phase?.m === 'typewriter' ? clamp(phase.p) : 1))
  })
  ctx.restore()
}

function underline(ctx: Ctx, tx: TextItem, k: number, x: number, y: number, w: number): void {
  if (w <= 0) return
  ctx.save()
  ctx.shadowColor = 'transparent'
  ctx.fillRect(x, y + tx.size * k * 0.45, w, Math.max(1, tx.size * k * 0.06))
  ctx.restore()
}
