// Cinematic Motion Engine (Screen Studio-style continuous cursor smoothing)
// Combines zero-phase critically damped physics, momentum curvature, and cubic Hermite click dwell.

import type { CursorData, CursorSettings } from '@shared/types'
import { TRACK_HZ, Track } from './cursorTrack'

/** Critically damped spring filter run forward then backward to cancel phase lag. */
export function smoothSpring(arr: Float32Array, amount: number): Float32Array {
  if (amount <= 0.001) return arr
  // amount 0..1 -> time constant 0..0.22s
  const tau = 0.01 + amount * 0.21
  const dt = 1 / TRACK_HZ
  const omega = 2 / tau

  const run = (src: Float32Array, reverse: boolean) => {
    const out = new Float32Array(src.length)
    let x = reverse ? src[src.length - 1] : src[0]
    let v = 0
    for (let k = 0; k < src.length; k++) {
      const i = reverse ? src.length - 1 - k : k
      const target = src[i]
      const f = 1 + 2 * dt * omega
      const oo = omega * omega
      const hoo = dt * oo
      const hhoo = dt * hoo
      const det = 1 / (f + hhoo)
      const detX = f * x + dt * v + hhoo * target
      const detV = v + hoo * (target - x)
      x = detX * det
      v = detV * det
      out[i] = x
    }
    return out
  }

  return run(run(arr, false), true)
}

/** Resamples raw recorded cursor events to a continuous 60Hz timeline.
 * Correctly holds resting positions during gaps between mouse movements. */
export function resampleTo60Hz(
  data: CursorData,
  duration: number
): { xs: Float32Array; ys: Float32Array; moving: Uint8Array } {
  const n = Math.max(2, Math.ceil(duration * TRACK_HZ) + 2)
  const xs = new Float32Array(n)
  const ys = new Float32Array(n)
  const moving = new Uint8Array(n)
  const s = data.samples

  if (!s.length) {
    xs.fill(0.5)
    ys.fill(0.5)
    return { xs, ys, moving }
  }

  let j = 0
  for (let i = 0; i < n; i++) {
    const t = i / TRACK_HZ
    while (j < s.length - 1 && s[j + 1].t <= t) j++
    const a = s[j]
    const b = s[Math.min(j + 1, s.length - 1)]

    if (t <= a.t || a === b) {
      xs[i] = a.x
      ys[i] = a.y
    } else {
      const gap = b.t - a.t
      if (gap > 0.08) {
        // While resting between movements, hold position a until motion resumes at b
        const moveStart = b.t - Math.min(0.04, gap * 0.1)
        if (t < moveStart) {
          xs[i] = a.x
          ys[i] = a.y
        } else {
          const f = (t - moveStart) / (b.t - moveStart)
          xs[i] = a.x + (b.x - a.x) * f
          ys[i] = a.y + (b.y - a.y) * f
        }
      } else {
        const f = (t - a.t) / gap
        xs[i] = a.x + (b.x - a.x) * f
        ys[i] = a.y + (b.y - a.y) * f
      }
    }
  }

  // Populate moving flags (1 if cursor moved in the last ~0.25s)
  const win = Math.round(TRACK_HZ * 0.25)
  let last = -1e9
  for (let i = 1; i < n; i++) {
    if (Math.abs(xs[i] - xs[i - 1]) + Math.abs(ys[i] - ys[i - 1]) > 0.0004) last = i
    moving[i] = i - last <= win ? 1 : 0
  }

  return { xs, ys, moving }
}

/** Builds the continuous 60Hz cinematic track with zero-phase smoothing,
 * curvature momentum, and keynote click dwell stabilization. */
export function buildCinematicTrack(
  data: CursorData | null,
  duration: number,
  settings: CursorSettings
): Track | null {
  if (!data || !data.samples.length) return null

  const r = resampleTo60Hz(data, duration)
  const smoothing = settings.smoothing ?? 0.55
  const curvature = settings.curvature ?? 0.5
  const clickDwell = settings.clickDwell ?? 0.12

  // 1. Primary zero-phase filter: eliminates hand jitter without latency or overshoot
  let xs = smoothSpring(r.xs, smoothing)
  let ys = smoothSpring(r.ys, smoothing)

  // 2. Secondary curvature cascade: adds momentum and turns jagged sharp corners into sweeping arcs
  if (curvature > 0.05) {
    const curveAmount = smoothing * curvature * 0.65
    xs = smoothSpring(xs, curveAmount)
    ys = smoothSpring(ys, curveAmount)
  }

  // 3. Click Target Pinning & Keynote Dwell
  // Smoothly anchors the path to hit click coordinates with 100% pixel precision,
  // pausing momentarily during dwell for an authoritative keynote demo feel.
  const clicks = data.clicks ?? []
  if (clicks.length > 0) {
    const n = xs.length
    const dwellFrames = Math.max(1, Math.round((clickDwell * 0.5) * TRACK_HZ))
    const blendRadius = Math.max(dwellFrames + 3, Math.round((clickDwell + 0.16) * TRACK_HZ))

    for (const c of clicks) {
      const clickFrame = Math.round(c.t * TRACK_HZ)
      const startF = Math.max(0, clickFrame - blendRadius)
      const endF = Math.min(n - 1, clickFrame + blendRadius)

      for (let f = startF; f <= endF; f++) {
        const distFrames = Math.abs(f - clickFrame)
        if (distFrames <= dwellFrames) {
          // Inside dwell window: firmly hold click position
          xs[f] = c.x
          ys[f] = c.y
        } else {
          // In approach/exit window: smooth cubic Hermite transition
          const normDist = (distFrames - dwellFrames) / (blendRadius - dwellFrames)
          // Smoothstep: 1 at dwell boundary, 0 at blendRadius
          const w = 1 - (3 * normDist * normDist - 2 * normDist * normDist * normDist)
          xs[f] = xs[f] * (1 - w) + c.x * w
          ys[f] = ys[f] * (1 - w) + c.y * w
        }
      }
    }
  }

  return {
    hz: TRACK_HZ,
    xs,
    ys,
    moving: r.moving,
    hidden: data.hidden
  }
}
