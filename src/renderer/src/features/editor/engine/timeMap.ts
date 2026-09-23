import type { Clip, ZoomSegment, ZoomSettings } from '@shared/types'
import { Track, sampleTrack } from './cursorTrack'

export function sortedClips(clips: Clip[]): Clip[] {
  return clips.slice().sort((a, b) => a.start - b.start)
}

export function outputDuration(clips: Clip[]): number {
  return clips.reduce((s, c) => s + (c.end - c.start) / c.speed, 0)
}

/** Output (edited) time -> source time. */
export function outputToSource(clips: Clip[], T: number): number {
  const cs = sortedClips(clips)
  let acc = 0
  for (const c of cs) {
    const d = (c.end - c.start) / c.speed
    if (T <= acc + d) return c.start + (T - acc) * c.speed
    acc += d
  }
  const last = cs[cs.length - 1]
  return last ? last.end : 0
}

/** Source time -> output time (times inside a removed gap snap to the next clip). */
export function sourceToOutput(clips: Clip[], t: number): number {
  const cs = sortedClips(clips)
  let acc = 0
  for (const c of cs) {
    if (t < c.start) return acc
    if (t <= c.end) return acc + (t - c.start) / c.speed
    acc += (c.end - c.start) / c.speed
  }
  return acc
}

export function clipAt(clips: Clip[], t: number): Clip | undefined {
  return clips.find((c) => t >= c.start - 1e-4 && t < c.end - 1e-4)
}

export function nextClip(clips: Clip[], t: number): Clip | undefined {
  return sortedClips(clips).find((c) => c.start > t - 1e-4)
}

// ---------------- zoom ----------------
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

export interface ZoomState { scale: number; fx: number; fy: number } // focus in content-normalized coords

function focusOf(seg: ZoomSegment, t: number, cam: Track | null, toContent: (x: number, y: number) => [number, number]): [number, number] {
  if (seg.follow && cam) {
    const tt = Math.min(Math.max(t, seg.start), seg.end)
    const p = sampleTrack(cam, tt)
    const [cx, cy] = toContent(p.x, p.y)
    // blend toward the manual focus a little so follow never feels jumpy
    const [mx, my] = [seg.x, seg.y]
    return [cx * 0.85 + mx * 0.15, cy * 0.85 + my * 0.15]
  }
  return [seg.x, seg.y]
}

export function zoomAt(
  z: ZoomSettings,
  t: number,
  cam: Track | null,
  toContent: (x: number, y: number) => [number, number]
): ZoomState {
  if (!z.enabled || !z.segments.length) return { scale: 1, fx: 0.5, fy: 0.5 }
  const segs = z.segments.slice().sort((a, b) => a.start - b.start)
  const r = Math.max(0.15, z.ease)
  const eff = (s: ZoomSegment) => 1 + (s.scale - 1) * z.master
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const prev = segs[i - 1]
    const next = segs[i + 1]
    // only glide straight from one zoom to the next when they touch; otherwise always zoom back out
    const joinPrev = prev && s.start - prev.end < 0.25
    const joinNext = next && next.start - s.end < 0.25
    if (t >= s.start && t <= s.end) {
      let w = 1
      const dur = s.end - s.start
      const rr = Math.min(r, dur / 2)
      if (!joinPrev && t < s.start + rr) w = ease((t - s.start) / rr)
      if (!joinNext && t > s.end - rr) w = Math.min(w, ease((s.end - t) / rr))
      const [fx, fy] = focusOf(s, t, cam, toContent)
      return { scale: 1 + (eff(s) - 1) * w, fx, fy }
    }
    // gap between two joined segments: glide from one to the next without zooming out
    if (joinNext && t > s.end && t < next.start) {
      const k = ease((t - s.end) / (next.start - s.end))
      const [ax, ay] = focusOf(s, s.end, cam, toContent)
      const [bx, by] = focusOf(next, next.start, cam, toContent)
      return { scale: eff(s) + (eff(next) - eff(s)) * k, fx: ax + (bx - ax) * k, fy: ay + (by - ay) * k }
    }
  }
  return { scale: 1, fx: 0.5, fy: 0.5 }
}

/** Visible part of the content (normalized 0..1) for a zoom state. */
export function viewport(z: ZoomState): { x: number; y: number; w: number; h: number } {
  const w = 1 / Math.max(1, z.scale)
  const x = Math.min(1 - w, Math.max(0, z.fx - w / 2))
  const y = Math.min(1 - w, Math.max(0, z.fy - w / 2))
  return { x, y, w, h: w }
}
