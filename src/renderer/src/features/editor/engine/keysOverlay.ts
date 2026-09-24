// Shows keyboard shortcuts pressed while recording as keycaps on the video (Ctrl + Shift + P).
import type { KeyPress, KeySettings } from '@shared/types'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

interface Look { cap: string; edge: string; text: string; plus: string; shadow: string }
const LOOKS: Record<'dark' | 'light' | 'accent', Look> = {
  dark: { cap: 'rgba(18,19,24,0.92)', edge: 'rgba(255,255,255,0.14)', text: '#ffffff', plus: 'rgba(255,255,255,0.6)', shadow: 'rgba(0,0,0,0.35)' },
  light: { cap: 'rgba(255,255,255,0.96)', edge: 'rgba(0,0,0,0.12)', text: '#15161b', plus: 'rgba(0,0,0,0.45)', shadow: 'rgba(0,0,0,0.25)' },
  accent: { cap: '#2f6bff', edge: 'rgba(255,255,255,0.25)', text: '#ffffff', plus: 'rgba(255,255,255,0.75)', shadow: 'rgba(20,40,120,0.35)' }
}

function lookFor(s: KeySettings): Look {
  if (s.style !== 'custom') return LOOKS[s.style] ?? LOOKS.dark
  const h = (s.color || '#ff3b30').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  const dark = lum < 0.6
  return {
    cap: s.color,
    edge: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.15)',
    text: dark ? '#ffffff' : '#111111',
    plus: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
    shadow: 'rgba(0,0,0,0.3)'
  }
}

const SYMBOLS: Record<string, string> = { Ctrl: '⌃', Shift: '⇧', Alt: '⌥', Win: '⊞', Enter: '↵', Backspace: '⌫', Tab: '⇥', Esc: 'Esc', Del: '⌦', Space: '␣' }
const MODS = new Set(['Ctrl', 'Shift', 'Alt', 'Win'])

/** The key labels as they'll be shown (words or symbols). */
export function keyLabels(keys: string[], s: Pick<KeySettings, 'labels'>): string[] {
  return s.labels === 'symbols' ? keys.map((k) => SYMBOLS[k] ?? k) : keys
}

/** True when this press should show with these settings (single keys can be switched off). */
export function keyShows(p: KeyPress, s: KeySettings): boolean {
  if (s.singles === false && !p.keys.some((k) => MODS.has(k))) return false
  return !(s.hidden ?? []).includes(Math.round(p.t * 1000))
}

/** The shortcut showing at time t (the latest one pressed within `hold` seconds), with its age. */
export function activeKey(keys: KeyPress[] | undefined, s: KeySettings, t: number): { press: KeyPress; age: number } | null {
  if (!keys?.length || !s.show) return null
  let best: KeyPress | null = null
  for (const k of keys) {
    if (k.t > t) break
    if (t - k.t <= s.hold && keyShows(k, s)) best = k
  }
  return best ? { press: best, age: t - best.t } : null
}

export function drawKeys(ctx: Ctx, keys: KeyPress[] | undefined, s: KeySettings, t: number, W: number, H: number, k: number): void {
  const a = activeKey(keys, s, t)
  if (a) drawKeycaps(ctx, a.press.keys, s, a.age, W, H, k)
}

/** Draws one combination at `age` seconds after it was pressed. Also used by the panel preview. */
export function drawKeycaps(ctx: Ctx, rawKeys: string[], s: KeySettings, age: number, W: number, H: number, k: number): void {
  const look = lookFor(s)
  const labels = keyLabels(rawKeys, s)
  const inP = Math.min(1, age / 0.18)
  const outP = Math.min(1, Math.max(0, (s.hold - age) / 0.25))
  const alpha = Math.min(inP, outP)
  if (alpha <= 0) return
  const ease = 1 - Math.pow(1 - inP, 3)
  let scale = 1
  let dy = 0
  const top = s.position.startsWith('top')
  if (s.animation === 'pop') scale = 0.82 + 0.18 * ease + (inP < 1 ? Math.sin(inP * Math.PI) * 0.05 : 0)
  else if (s.animation === 'slide') dy = (1 - ease) * 26 * k * (top ? -1 : 1) + (1 - outP) * 10 * k * (top ? -1 : 1)

  const size = 56 * k * s.size
  const pad = size * 0.42
  const gap = size * 0.3
  const radius = size * 0.24 * Math.max(0, s.radius ?? 1)
  ctx.save()
  ctx.font = `600 ${Math.round(size * 0.5)}px "Inter", "Segoe UI", "Segoe UI Symbol", sans-serif`
  ctx.textBaseline = 'middle'
  const widths = labels.map((key) => Math.max(size * 1.05, ctx.measureText(key).width + pad * 2))
  const plusW = ctx.measureText('+').width
  const total = widths.reduce((x, w) => x + w, 0) + (labels.length - 1) * (plusW + gap * 2)
  const margin = 44 * k
  const cx = s.position.endsWith('left') ? margin + total / 2 : s.position.endsWith('right') ? W - margin - total / 2 : W / 2
  const cy = top ? margin + size / 2 : H - margin - size / 2
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy + dy)
  ctx.scale(scale, scale)
  let x = -total / 2
  labels.forEach((key, i) => {
    const w = widths[i]
    ctx.shadowColor = look.shadow
    ctx.shadowBlur = size * 0.35
    ctx.shadowOffsetY = size * 0.08
    ctx.fillStyle = look.cap
    ctx.beginPath()
    ctx.roundRect(x, -size / 2, w, size, Math.min(radius, size / 2))
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = look.edge
    ctx.lineWidth = Math.max(1, size * 0.03)
    ctx.stroke()
    ctx.fillStyle = look.text
    ctx.textAlign = 'center'
    ctx.fillText(key, x + w / 2, size * 0.02)
    x += w
    if (i < labels.length - 1) {
      ctx.fillStyle = look.plus
      ctx.fillText('+', x + gap + plusW / 2, 0)
      x += plusW + gap * 2
    }
  })
  ctx.restore()
}
