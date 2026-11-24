// Plays the click sound in the editor while the video plays (the export gets the same sound).
import type { ClickSound } from '@shared/types'
import { synthClick } from '@shared/clickSounds'

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()

function buffer(id: ClickSound, release: boolean): AudioBuffer | null {
  if (id === 'none') return null
  ctx ??= new AudioContext()
  const key = id + (release ? ':up' : '')
  let b = buffers.get(key)
  if (!b) {
    const data = synthClick(id, ctx.sampleRate, release)
    b = ctx.createBuffer(1, data.length, ctx.sampleRate)
    b.getChannelData(0).set(data)
    buffers.set(key, b)
  }
  return b
}

/** Plays one click now (or `delay` seconds from now). */
export function playClick(id: ClickSound, volume: number, delay = 0, release = false): void {
  const b = buffer(id, release)
  if (!b || !ctx || volume <= 0) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const src = ctx.createBufferSource()
  src.buffer = b
  const g = ctx.createGain()
  g.gain.value = volume
  src.connect(g).connect(ctx.destination)
  src.start(ctx.currentTime + Math.max(0, delay))
}
