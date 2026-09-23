import type { CursorData } from '@shared/types'

export const TRACK_HZ = 60

/** A cursor path resampled to a fixed rate and smoothed with a critically damped spring. */
export interface Track {
  hz: number
  xs: Float32Array
  ys: Float32Array
  moving: Uint8Array // 1 if the raw cursor moved in the last ~0.25s
  hidden?: [number, number][] // source ranges with no cursor (joined videos without cursor data)
}

/** True when the cursor should not be drawn at this source time. */
export function cursorHiddenAt(tr: Track, t: number): boolean {
  return !!tr.hidden?.some(([a, b]) => t >= a && t < b)
}

function resample(data: CursorData, duration: number): { xs: Float32Array; ys: Float32Array; moving: Uint8Array } {
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
      // samples only arrive on movement, so a big gap means the cursor was resting at `a`
      const gap = b.t - a.t
      if (gap > 0.1) {
        const moveStart = b.t - 0.05
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
  // movement flags
  const win = Math.round(TRACK_HZ * 0.25)
  let last = -1e9
  for (let i = 1; i < n; i++) {
    if (Math.abs(xs[i] - xs[i - 1]) + Math.abs(ys[i] - ys[i - 1]) > 0.0004) last = i
    moving[i] = i - last <= win ? 1 : 0
  }
  return { xs, ys, moving }
}

/** Critically damped spring, run forward then backward to cancel lag (zero phase). */
function smooth(arr: Float32Array, amount: number): Float32Array {
  if (amount <= 0.001) return arr
  // amount 0..1 -> time constant 0..0.18s
  const tau = 0.01 + amount * 0.17
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

export function buildTrack(data: CursorData | null, duration: number, smoothing: number): Track | null {
  if (!data) return null
  const r = resample(data, duration)
  return { hz: TRACK_HZ, xs: smooth(r.xs, smoothing), ys: smooth(r.ys, smoothing), moving: r.moving, hidden: data.hidden }
}

/** Slow camera path used by "follow cursor" zooms. */
export function buildCameraTrack(data: CursorData | null, duration: number): Track | null {
  if (!data) return null
  const r = resample(data, duration)
  const s = (a: Float32Array) => smooth(smooth(a, 1), 1)
  return { hz: TRACK_HZ, xs: s(r.xs), ys: s(r.ys), moving: r.moving }
}

export function sampleTrack(tr: Track, t: number): { x: number; y: number; vx: number; idle: number } {
  const f = Math.max(0, t * tr.hz)
  const i = Math.min(tr.xs.length - 2, Math.floor(f))
  const k = Math.min(1, f - i)
  const x = tr.xs[i] + (tr.xs[i + 1] - tr.xs[i]) * k
  const y = tr.ys[i] + (tr.ys[i + 1] - tr.ys[i]) * k
  const vx = (tr.xs[i + 1] - tr.xs[i]) * tr.hz
  // seconds since last movement (capped at 3)
  let idle = 0
  for (let j = i; j >= 0 && idle < 3; j--) {
    if (tr.moving[j]) break
    idle += 1 / tr.hz
  }
  return { x, y, vx, idle }
}
