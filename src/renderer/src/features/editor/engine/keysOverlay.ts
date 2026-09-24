// Shows keyboard shortcuts pressed while recording as keycaps on the video (Ctrl + Shift + P).
import type { KeyPress, KeySettings } from '@shared/types'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const LOOK = {
  dark: { cap: 'rgba(18,19,24,0.92)', edge: 'rgba(255,255,255,0.14)', text: '#ffffff', plus: 'rgba(255,255,255,0.55)', shadow: 'rgba(0,0,0,0.35)' },
  light: { cap: 'rgba(255,255,255,0.96)', edge: 'rgba(0,0,0,0.12)', text: '#15161b', plus: 'rgba(0,0,0,0.45)', shadow: 'rgba(0,0,0,0.25)' },
  accent: { cap: '#2f6bff', edge: 'rgba(255,255,255,0.25)', text: '#ffffff', plus: 'rgba(255,255,255,0.7)', shadow: 'rgba(20,40,120,0.35)' }
}

/** The shortcut showing at time t (the latest one pressed within `hold` seconds), with how far along it is. */
export function activeKey(keys: KeyPress[] | undefined, s: KeySettings, t: number): { press: KeyPress; age: number } | null {
  if (!keys?.length || !s.show) return null
  const off = new Set(s.hidden ?? [])
  let best: KeyPress | null = null
  for (const k of keys) {
    if (k.t > t) break
    if (t - k.t <= s.hold && !off.has(Math.round(k.t * 1000))) best = k
  }
  return best ? { press: best, age: t - best.t } : null
}

export function drawKeys(ctx: Ctx, keys: KeyPress[] | undefined, s: KeySettings, t: number, W: number, H: number, k: number): void {
  const a = activeKey(keys, s, t)
  if (!a) return
  const { press, age } = a
  const look = LOOK[s.style] ?? LOOK.dark
  // pop in, stay, fade out
  const inP = Math.min(1, age / 0.16)
  const outP = Math.min(1, Math.max(0, (s.hold - age) / 0.25))
  const alpha = Math.min(inP, outP)
  const scale = 0.85 + 0.15 * (1 - Math.pow(1 - inP, 3)) + (inP < 1 ? Math.sin(inP * Math.PI) * 0.04 : 0)
  if (alpha <= 0) return

  const size = 56 * k * s.size
  const pad = size * 0.42
  const gap = size * 0.34
  ctx.save()
  ctx.font = `600 ${Math.round(size * 0.52)}px "Inter", "Segoe UI", sans-serif`
  ctx.textBaseline = 'middle'
  const widths = press.keys.map((key) => Math.max(size * 1.05, ctx.measureText(key).width + pad * 2))
  const plusW = ctx.measureText('+').width
  const total = widths.reduce((x, w) => x + w, 0) + (press.keys.length - 1) * (plusW + gap * 2)
  const margin = 40 * k
  const cx = s.position === 'bottom-left' ? margin + total / 2 : s.position === 'bottom-right' ? W - margin - total / 2 : W / 2
  const cy = s.position === 'top' ? margin + size / 2 : H - margin - size / 2
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  let x = -total / 2
  press.keys.forEach((key, i) => {
    const w = widths[i]
    // keycap with a little depth
    ctx.shadowColor = look.shadow
    ctx.shadowBlur = size * 0.35
    ctx.shadowOffsetY = size * 0.08
    ctx.fillStyle = look.cap
    ctx.beginPath()
    ctx.roundRect(x, -size / 2, w, size, size * 0.24)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = look.edge
    ctx.lineWidth = Math.max(1, size * 0.03)
    ctx.stroke()
    ctx.fillStyle = look.text
    ctx.textAlign = 'center'
    ctx.fillText(key, x + w / 2, size * 0.02)
    x += w
    if (i < press.keys.length - 1) {
      ctx.fillStyle = look.plus
      ctx.fillText('+', x + gap + plusW / 2, 0)
      x += plusW + gap * 2
    }
  })
  ctx.restore()
}
