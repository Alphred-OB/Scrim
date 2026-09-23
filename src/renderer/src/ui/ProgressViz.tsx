// Animated progress indicators for exports. One canvas, redrawn every frame, colors from the theme.
// "wavy" is the Material style wiggly ring (like Play Store downloads).
import { useEffect, useRef } from 'react'
import type { ExportProgressStyle } from '@shared/types'

export const PROGRESS_STYLES: { id: ExportProgressStyle; name: string }[] = [
  { id: 'wavy', name: 'Wavy ring' },
  { id: 'ring', name: 'Clean ring' },
  { id: 'liquid', name: 'Liquid fill' },
  { id: 'orbit', name: 'Orbit' },
  { id: 'dots', name: 'Dots' },
  { id: 'bar', name: 'Wavy bar' }
]

interface Props {
  kind: ExportProgressStyle
  /** 0..1, or null while it's getting ready (spins without a number) */
  value: number | null
  size?: number
  /** hide the percentage in the middle (used for small previews) */
  bare?: boolean
}

const TAU = Math.PI * 2

export function ProgressViz({ kind, value, size = 180, bare = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const target = useRef(value)
  target.current = value

  useEffect(() => {
    const c = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = kind === 'bar' ? size * 1.8 : size
    const H = kind === 'bar' ? size * 0.42 : size
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    const ctx = c.getContext('2d')!
    let shown = target.current ?? 0
    let raf = 0
    const t0 = performance.now()
    const css = getComputedStyle(document.documentElement)
    const col = (v: string, f: string) => css.getPropertyValue(v).trim() || f
    const accent = col('--accent', '#0a84ff')
    const track = col('--line-2', 'rgba(255,255,255,.14)')
    const text = col('--text', '#fff')
    const dim = col('--dim', '#999')
    const onAccent = col('--on-accent', '#fff')

    const frame = (now: number) => {
      const time = (now - t0) / 1000
      const tv = target.current
      const indeterminate = tv === null
      if (!indeterminate) shown += (tv - shown) * 0.12 // ease toward the real value
      const p = indeterminate ? 0 : Math.max(0, Math.min(1, shown))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const cx = W / 2
      const cy = H / 2
      const r = size * 0.38
      const lw = Math.max(3, size * 0.045)
      ctx.lineCap = 'round'

      if (kind === 'wavy' || kind === 'ring' || kind === 'orbit') {
        const start = indeterminate ? time * 4 : -Math.PI / 2
        const sweep = indeterminate ? TAU * (0.2 + 0.15 * Math.sin(time * 2.2)) : p * TAU
        const gap = sweep > 0.01 && sweep < TAU - 0.01 ? (lw * 1.8) / r : 0
        // remaining track (flat, with a small gap either side)
        if (sweep < TAU - 0.01) {
          ctx.strokeStyle = track
          ctx.lineWidth = kind === 'wavy' ? lw * 0.8 : lw
          ctx.beginPath()
          ctx.arc(cx, cy, r, start + sweep + gap, start + TAU - gap)
          ctx.stroke()
        }
        if (sweep > 0.001) {
          ctx.strokeStyle = accent
          ctx.lineWidth = lw
          ctx.beginPath()
          if (kind === 'wavy') {
            const amp = lw * 0.55
            const waves = Math.max(8, Math.round(size / 16))
            const steps = Math.max(12, Math.ceil((sweep / TAU) * 220))
            for (let i = 0; i <= steps; i++) {
              const a = start + (sweep * i) / steps
              // fade the wiggle in at the very start and when it completes, like Material's wavy indicator
              const fade = Math.min(1, (sweep * i) / steps / 0.4) * (p > 0.985 ? Math.max(0, (1 - p) / 0.015) : 1)
              const rr = r + Math.sin(a * waves - time * 6) * amp * fade
              const x = cx + Math.cos(a) * rr
              const y = cy + Math.sin(a) * rr
              if (i) ctx.lineTo(x, y)
              else ctx.moveTo(x, y)
            }
          } else ctx.arc(cx, cy, r, start, start + sweep)
          ctx.stroke()
          if (kind === 'orbit') {
            // a small moon riding the end of the arc, with a fading trail
            const a = start + sweep
            for (let k = 0; k < 14; k++) {
              const b = a - k * 0.06
              ctx.globalAlpha = (1 - k / 14) * 0.5
              ctx.fillStyle = accent
              ctx.beginPath()
              ctx.arc(cx + Math.cos(b) * r, cy + Math.sin(b) * r, lw * (1 - k / 20), 0, TAU)
              ctx.fill()
            }
            ctx.globalAlpha = 1
            const bob = 1 + 0.12 * Math.sin(time * 5)
            ctx.fillStyle = accent
            ctx.beginPath()
            ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, lw * 1.1 * bob, 0, TAU)
            ctx.fill()
          }
        }
      } else if (kind === 'dots') {
        const n = 24
        const lit = indeterminate ? -1 : p * n
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n) * TAU
          const on = indeterminate ? (Math.floor(time * 14) - i + n * 10) % n < 6 : i < lit
          const head = !indeterminate && i === Math.floor(lit)
          const s = lw * 0.6 * (head ? 1.2 + 0.25 * Math.sin(time * 8) : on ? 1 : 0.7)
          ctx.fillStyle = on || head ? accent : track
          ctx.globalAlpha = head ? 0.6 + 0.4 * Math.sin(time * 8) : 1
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, 0, TAU)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      } else if (kind === 'liquid') {
        const R = r + lw / 2
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, TAU)
        ctx.clip()
        ctx.fillStyle = track
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
        const level = cy + R - (indeterminate ? 0.35 + 0.05 * Math.sin(time) : p) * R * 2
        for (const [ph, a, al] of [[0, 1, 0.45], [2.1, 0.7, 1]] as const) {
          ctx.globalAlpha = al
          ctx.fillStyle = accent
          ctx.beginPath()
          ctx.moveTo(cx - R, cy + R)
          for (let x = -R; x <= R; x += 3) {
            const y = level + Math.sin(x / (R * 0.28) + time * 2.4 * a + ph) * R * 0.05
            ctx.lineTo(cx + x, y)
          }
          ctx.lineTo(cx + R, cy + R)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
        ctx.globalAlpha = 1
        ctx.strokeStyle = track
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, TAU)
        ctx.stroke()
      } else if (kind === 'bar') {
        const x0 = lw
        const x1 = W - lw
        const y = H * 0.62
        const end = indeterminate ? x0 + ((time * 0.6) % 1) * (x1 - x0) : x0 + p * (x1 - x0)
        const from = indeterminate ? Math.max(x0, end - (x1 - x0) * 0.3) : x0
        ctx.strokeStyle = track
        ctx.lineWidth = lw * 0.8
        ctx.beginPath()
        ctx.moveTo(Math.min(x1, end + lw * 2), y)
        ctx.lineTo(x1, y)
        ctx.stroke()
        ctx.strokeStyle = accent
        ctx.lineWidth = lw
        ctx.beginPath()
        for (let x = from; x <= end; x += 2) {
          const yy = y + Math.sin(x / (size * 0.06) - time * 6) * lw * 0.6 * Math.min(1, (x - from) / 20)
          if (x === from) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      }

      if (!bare && !indeterminate) {
        const pct = `${Math.round(p * 100)}`
        const fy = kind === 'bar' ? H * 0.3 : cy
        const big = kind === 'bar' ? size * 0.16 : size * 0.2
        const family = getComputedStyle(document.body).fontFamily
        const onFill = kind === 'liquid' && p > 0.55
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.font = `700 ${big}px ${family}`
        const wN = ctx.measureText(pct).width
        ctx.font = `600 ${big * 0.45}px ${family}`
        const wP = ctx.measureText('%').width
        const left = cx - (wN + wP + 2) / 2
        ctx.font = `700 ${big}px ${family}`
        ctx.fillStyle = onFill ? onAccent : text
        ctx.fillText(pct, left, fy)
        ctx.font = `600 ${big * 0.45}px ${family}`
        ctx.fillStyle = onFill ? onAccent : dim
        ctx.fillText('%', left + wN + 2, fy + big * 0.12)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [kind, size, bare])

  const W = kind === 'bar' ? size * 1.8 : size
  const H = kind === 'bar' ? size * 0.42 : size
  return <canvas ref={ref} style={{ width: W, height: H, display: 'block' }} />
}

/** Checkmark that draws itself in a popping circle, plus optional confetti. */
export function DoneBurst({ confetti, size = 120 }: { confetti: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!confetti) return
    const c = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = 420
    const H = 300
    c.width = W * dpr
    c.height = H * dpr
    const ctx = c.getContext('2d')!
    const css = getComputedStyle(document.documentElement)
    const colors = [css.getPropertyValue('--accent').trim() || '#0a84ff', '#ffd60a', '#30d158', '#ff453a', '#bf5af2', '#ffffff']
    const parts = Array.from({ length: 90 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
      const v = 5 + Math.random() * 7
      return { x: W / 2, y: H / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.4, s: 4 + Math.random() * 5, c: colors[i % colors.length] }
    })
    let raf = 0
    let n = 0
    const frame = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      for (const p of parts) {
        p.vy += 0.28
        p.vx *= 0.985
        p.x += p.vx
        p.y += p.vy
        p.r += p.vr
        ctx.save()
        ctx.globalAlpha = Math.max(0, 1 - n / 110)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.c
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2)
        ctx.restore()
      }
      if (++n < 120) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [confetti])

  return (
    <div className="done-burst" style={{ width: size, height: size }}>
      {confetti && <canvas ref={ref} className="done-confetti" style={{ width: 420, height: 300 }} />}
      <svg viewBox="0 0 52 52" width={size} height={size}>
        <circle className="done-circle" cx="26" cy="26" r="24" />
        <path className="done-check" d="M15 27l7 7 15-16" />
      </svg>
    </div>
  )
}
