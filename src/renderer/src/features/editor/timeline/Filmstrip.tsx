// Thumbnails along a video clip, like a strip of film. Frames are grabbed once per video
// (about one a second) in the background, then drawn at any width.
import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '@/lib/api'

type Strip = { step: number; frames: (ImageBitmap | null)[] }
const cache = new Map<string, Promise<Strip>>()
const listeners = new Map<string, Set<() => void>>()
const partial = new Map<string, Strip>()

function load(path: string, duration: number): Promise<Strip> {
  if (cache.has(path)) return cache.get(path)!
  const p = (async () => {
    const n = Math.max(2, Math.min(80, Math.ceil(duration)))
    const step = duration / n
    const strip: Strip = { step, frames: new Array(n).fill(null) }
    partial.set(path, strip)
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.src = mediaUrl(path)
    await new Promise<void>((res) => {
      v.onloadeddata = () => res()
      v.onerror = () => res()
      setTimeout(res, 8000)
    })
    for (let i = 0; i < n; i++) {
      try {
        await new Promise<void>((res) => {
          v.onseeked = () => res()
          v.currentTime = Math.min(duration - 0.05, (i + 0.5) * step)
          setTimeout(res, 1500)
        })
        strip.frames[i] = await createImageBitmap(v, { resizeHeight: 72, resizeQuality: 'medium' })
        // let the clip redraw as frames come in (every few frames)
        if (i % 6 === 5 || i === n - 1) listeners.get(path)?.forEach((f) => f())
      } catch {
        /* keep going */
      }
    }
    v.removeAttribute('src')
    v.load()
    return strip
  })()
  cache.set(path, p)
  return p
}

export default function Filmstrip({ path, duration, from, to, width, height }: { path: string; duration: number; from: number; to: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    load(path, duration).then(() => setTick((x) => x + 1))
    const on = () => setTick((x) => x + 1)
    if (!listeners.has(path)) listeners.set(path, new Set())
    listeners.get(path)!.add(on)
    return () => void listeners.get(path)?.delete(on)
  }, [path, duration])

  const cw = Math.max(1, Math.min(8000, Math.round(width)))
  useEffect(() => {
    const c = ref.current
    const strip = partial.get(path)
    if (!c || !strip) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = cw * dpr
    c.height = height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    const tileW = height * (16 / 9)
    const tiles = Math.ceil(cw / tileW)
    for (let k = 0; k < tiles; k++) {
      const t = from + ((k + 0.5) * tileW / cw) * (to - from)
      const i = Math.max(0, Math.min(strip.frames.length - 1, Math.floor(t / strip.step)))
      const f = strip.frames[i]
      if (!f) continue
      // cover the tile
      const s = Math.max(tileW / f.width, height / f.height)
      const w = f.width * s
      const h = f.height * s
      ctx.save()
      ctx.beginPath()
      ctx.rect(k * tileW, 0, tileW, height)
      ctx.clip()
      ctx.drawImage(f, k * tileW + (tileW - w) / 2, (height - h) / 2, w, h)
      ctx.restore()
    }
  }, [tick, cw, height, from, to, path])

  return <canvas ref={ref} className="tl-film" style={{ width, height }} />
}
