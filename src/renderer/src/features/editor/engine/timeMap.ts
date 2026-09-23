import type { Clip, KeyframeEase, ZoomSegment, ZoomSettings } from '@shared/types'
import { Track, sampleTrack } from './cursorTrack'

export function sortedClips(clips: Clip[]): Clip[] {
  return clips.slice().sort((a, b) => a.start - b.start)
}

export function outputDuration(clips: Clip[], leadIn = 0): number {
  return leadIn + clips.reduce((s, c) => s + (c.end - c.start) / c.speed, 0)
}

/** Output (edited) time -> source time. The lead-in (empty space before the video) maps to negative times. */
export function outputToSource(clips: Clip[], T: number, leadIn = 0): number {
  if (T < leadIn) return T - leadIn
  T -= leadIn
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
export function sourceToOutput(clips: Clip[], t: number, leadIn = 0): number {
  if (t < 0) return Math.max(0, t + leadIn)
  const cs = sortedClips(clips)
  let acc = leadIn
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
const easeLinear = (x: number) => x
const easeSnappy = (x: number) => (x < 0.5 ? Math.pow(2 * x, 4) / 2 : 1 - Math.pow(-2 * x + 2, 4) / 2)

function interpolateEase(mode: KeyframeEase | undefined, u: number): number {
  const clamped = Math.max(0, Math.min(1, u))
  if (mode === 'linear') return easeLinear(clamped)
  if (mode === 'snappy') return easeSnappy(clamped)
  return ease(clamped)
}

export interface ZoomState { scale: number; fx: number; fy: number } // focus in content-normalized coords

export function sampleSegmentKeyframes(s: ZoomSegment, t: number): { scale: number; x: number; y: number } {
  if (!s.keyframes || s.keyframes.length === 0) {
    return { scale: s.scale, x: s.x, y: s.y }
  }
  const kfs = s.keyframes.slice().sort((a, b) => a.t - b.t)
  if (kfs.length === 1 || t <= kfs[0].t) {
    return { scale: kfs[0].scale, x: kfs[0].x, y: kfs[0].y }
  }
  if (t >= kfs[kfs.length - 1].t) {
    const last = kfs[kfs.length - 1]
    return { scale: last.scale, x: last.x, y: last.y }
  }
  for (let j = 0; j < kfs.length - 1; j++) {
    const a = kfs[j]
    const b = kfs[j + 1]
    if (t >= a.t && t <= b.t) {
      const dt = b.t - a.t
      const u = dt > 1e-4 ? (t - a.t) / dt : 0
      const k = interpolateEase(b.ease ?? a.ease ?? 'smooth', u)
      return {
        scale: a.scale + (b.scale - a.scale) * k,
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k
      }
    }
  }
  return { scale: s.scale, x: s.x, y: s.y }
}

function focusOf(
  seg: ZoomSegment,
  t: number,
  cam: Track | null,
  toContent: (x: number, y: number) => [number, number],
  manualPos?: { x: number; y: number }
): [number, number] {
  const mx = manualPos ? manualPos.x : seg.x
  const my = manualPos ? manualPos.y : seg.y
  if (seg.follow && cam) {
    const tt = Math.min(Math.max(t, seg.start), seg.end)
    const p = sampleTrack(cam, tt)
    const [cx, cy] = toContent(p.x, p.y)
    // blend toward the manual focus a little so follow never feels jumpy
    return [cx * 0.85 + mx * 0.15, cy * 0.85 + my * 0.15]
  }
  return [mx, my]
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
      const kfState = sampleSegmentKeyframes(s, t)
      const baseEff = 1 + (kfState.scale - 1) * z.master
      const [fx, fy] = focusOf(s, t, cam, toContent, kfState)
      return { scale: 1 + (baseEff - 1) * w, fx, fy }
    }
    // gap between two joined segments: glide from one to the next without zooming out
    if (joinNext && t > s.end && t < next.start) {
      const k = ease((t - s.end) / (next.start - s.end))
      const kfS = sampleSegmentKeyframes(s, s.end)
      const kfNext = sampleSegmentKeyframes(next, next.start)
      const effS = 1 + (kfS.scale - 1) * z.master
      const effNext = 1 + (kfNext.scale - 1) * z.master
      const [ax, ay] = focusOf(s, s.end, cam, toContent, kfS)
      const [bx, by] = focusOf(next, next.start, cam, toContent, kfNext)
      return { scale: effS + (effNext - effS) * k, fx: ax + (bx - ax) * k, fy: ay + (by - ay) * k }
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
