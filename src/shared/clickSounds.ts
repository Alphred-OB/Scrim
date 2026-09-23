// Click sounds, made from scratch in code (no audio files to ship). The same samples are used
// for the preview (Web Audio) and the export (written into a WAV track).
import type { ClickSound, CursorData, CursorSettings } from './types'

export const CLICK_SOUNDS: { id: ClickSound; name: string; hint: string }[] = [
  { id: 'mouse', name: 'Mouse', hint: 'A real mouse button' },
  { id: 'soft', name: 'Soft tick', hint: 'Quiet and clean' },
  { id: 'trackpad', name: 'Trackpad', hint: 'Short and muted' },
  { id: 'mechanical', name: 'Mechanical', hint: 'Clicky switch' },
  { id: 'pop', name: 'Pop', hint: 'Playful bubble' },
  { id: 'tap', name: 'Wood tap', hint: 'Warm knock' },
  { id: 'digital', name: 'Digital', hint: 'UI blip' },
  { id: 'camera', name: 'Shutter', hint: 'Camera click' }
]

/** Tiny seeded noise so every export sounds the same. */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) / 4294967295) * 2 - 1
  }
}

/** Mono samples for one click (the press). `release` is a softer second sound for the button coming up. */
export function synthClick(id: ClickSound, rate: number, release = false): Float32Array {
  const len = Math.round(rate * (id === 'pop' ? 0.09 : id === 'camera' ? 0.12 : 0.06))
  const out = new Float32Array(len)
  const rnd = noise(id.length * 977 + (release ? 13 : 7))
  let hp = 0
  let prev = 0
  let lp = 0
  for (let i = 0; i < len; i++) {
    const t = i / rate
    const n = rnd()
    // one pole high pass to keep noise crisp
    hp = 0.86 * (hp + n - prev)
    prev = n
    lp += 0.25 * (n - lp)
    let v = 0
    switch (id) {
      case 'mouse':
        v = hp * Math.exp(-t * 900) * 0.9 + Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 700) * 0.35
        break
      case 'soft':
        v = Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 260) * 0.55 + hp * Math.exp(-t * 1500) * 0.15
        break
      case 'trackpad':
        v = lp * Math.exp(-t * 700) * 0.9 + Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t * 500) * 0.25
        break
      case 'mechanical':
        v = hp * Math.exp(-t * 600) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 90) * 0.45 + Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-t * 900) * 0.3
        break
      case 'pop': {
        const f = 950 * Math.exp(-t * 18) + 280
        v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 45) * 0.6 * Math.min(1, t * 900)
        break
      }
      case 'tap':
        v = Math.sin(2 * Math.PI * 780 * t) * Math.exp(-t * 110) * 0.5 + Math.sin(2 * Math.PI * 1650 * t) * Math.exp(-t * 180) * 0.2 + lp * Math.exp(-t * 800) * 0.4
        break
      case 'digital':
        v = Math.sign(Math.sin(2 * Math.PI * 1600 * t)) * 0.18 * Math.exp(-t * 90) * Math.min(1, t * 2000)
        break
      case 'camera':
        v = hp * (Math.exp(-t * 400) + (t > 0.05 ? Math.exp(-(t - 0.05) * 350) * 0.8 : 0)) * 0.7
        break
    }
    out[i] = v * (release ? 0.45 : 1)
  }
  return out
}

/**
 * A whole click track: silence with a click at every time (seconds from the start of the recording),
 * as 16 bit mono WAV bytes.
 */
export function clickTrackWav(id: ClickSound, clicks: { t: number; up?: number }[], duration: number, volume: number, rate = 44100): Uint8Array {
  const n = Math.max(1, Math.ceil(duration * rate))
  const mix = new Float32Array(n)
  const press = synthClick(id, rate)
  const rel = id === 'mouse' || id === 'mechanical' || id === 'trackpad' ? synthClick(id, rate, true) : null
  const add = (buf: Float32Array, at: number) => {
    const s = Math.round(at * rate)
    for (let i = 0; i < buf.length && s + i < n; i++) if (s + i >= 0) mix[s + i] += buf[i] * volume
  }
  for (const c of clicks) {
    add(press, c.t)
    if (rel && c.up !== undefined && c.up - c.t > 0.03 && c.up - c.t < 0.6) add(rel, c.up)
  }
  const bytes = new Uint8Array(44 + n * 2)
  const dv = new DataView(bytes.buffer)
  const str = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF')
  dv.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true)
  dv.setUint16(22, 1, true)
  dv.setUint32(24, rate, true)
  dv.setUint32(28, rate * 2, true)
  dv.setUint16(32, 2, true)
  dv.setUint16(34, 16, true)
  str(36, 'data')
  dv.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mix[i])) * 32767, true)
  return bytes
}

/** The clicks that make a sound: all recorded clicks except the ones switched off on the timeline. */
export function audibleClicks(data: CursorData | null, cursor: CursorSettings): { t: number; up?: number }[] {
  if (!data || cursor.clickSound === 'none') return []
  const off = new Set(cursor.hiddenClicks ?? [])
  return data.clicks.filter((c) => !off.has(Math.round(c.t * 1000)))
}
