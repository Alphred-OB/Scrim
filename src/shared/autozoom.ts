import type { CursorData, ZoomSegment } from './types'
import { uid } from './defaults'

/**
 * Builds zoom segments from click activity. Clicks that happen close together are grouped
 * into one segment so the camera doesn't bounce in and out.
 */
export function autoZoomFromClicks(data: CursorData, duration: number, scale = 1.6): ZoomSegment[] {
  const clicks = data.clicks.filter((c) => c.t >= 0 && c.t <= duration).sort((a, b) => a.t - b.t)
  const groups: { start: number; end: number; xs: number[]; ys: number[] }[] = []
  const GAP = 1.5 // seconds between clicks that still counts as the same moment
  const MAX = 5 // never stay zoomed in longer than this on one group
  for (const c of clicks) {
    const g = groups[groups.length - 1]
    if (g && c.t - g.end < GAP && c.t - g.start < MAX) {
      g.end = c.t
      g.xs.push(c.x)
      g.ys.push(c.y)
    } else groups.push({ start: c.t, end: c.t, xs: [c.x], ys: [c.y] })
  }
  const out: ZoomSegment[] = []
  for (const g of groups) {
    const start = Math.max(0, g.start - 0.7)
    const end = Math.min(duration, g.end + 1.3)
    if (end - start < 0.8) continue
    const prev = out[out.length - 1]
    // keep a clear gap so the camera visibly zooms out between groups
    if (prev && start < prev.end + 0.8) {
      if (end - prev.start <= MAX + 2) {
        prev.end = end
        continue
      }
      prev.end = Math.max(prev.start + 0.8, start - 0.8)
    }
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
    out.push({
      id: uid('z'),
      start,
      end,
      scale,
      x: Math.min(1, Math.max(0, avg(g.xs))),
      y: Math.min(1, Math.max(0, avg(g.ys))),
      follow: true,
      auto: true
    })
  }
  return out
}
