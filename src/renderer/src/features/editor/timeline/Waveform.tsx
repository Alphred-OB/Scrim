import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

const cache = new Map<string, Promise<number[]>>()
export function getPeaks(path: string): Promise<number[]> {
  if (!cache.has(path)) cache.set(path, api.peaks(path).catch(() => []))
  return cache.get(path)!
}

const PEAKS_PER_SEC = 50

/** Draws a loudness waveform for [from, to] seconds of a file into the given pixel width. */
export default function Waveform({ path, from, to, width, height, color }: { path: string; from: number; to: number; width: number; height: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  useEffect(() => {
    let alive = true
    getPeaks(path).then((p) => alive && setPeaks(p))
    return () => {
      alive = false
    }
  }, [path])

  const cw = Math.max(1, Math.min(8000, Math.round(width)))
  useEffect(() => {
    const c = ref.current
    if (!c || !peaks) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = cw * dpr
    c.height = height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cw, height)
    ctx.fillStyle = color
    const mid = height / 2
    const span = Math.max(0.001, to - from)
    for (let x = 0; x < cw; x += 2) {
      const t0 = from + (x / cw) * span
      const t1 = from + ((x + 2) / cw) * span
      let p = 0
      for (let i = Math.max(0, Math.floor(t0 * PEAKS_PER_SEC)); i <= Math.min(peaks.length - 1, Math.floor(t1 * PEAKS_PER_SEC)); i++) p = Math.max(p, peaks[i])
      const h = Math.max(1, Math.sqrt(p) * (height - 4))
      ctx.fillRect(x, mid - h / 2, 1.4, h)
    }
  }, [peaks, from, to, cw, height, color])

  return <canvas ref={ref} style={{ width, height, display: 'block', pointerEvents: 'none' }} />
}
