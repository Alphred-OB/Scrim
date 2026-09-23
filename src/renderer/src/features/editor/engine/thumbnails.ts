// Small cached preview images for the side panels.
import { drawLive, drawWallpaper, LIVE } from './backgrounds'
import { drawCursor, cursorDef } from './cursors'

const cache = new Map<string, string>()

function make(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d')!)
  const url = c.toDataURL()
  cache.set(key, url)
  return url
}

export const wallpaperThumb = (id: string): string => make('wp:' + id, 96, 96, (ctx) => drawWallpaper(ctx, 96, 96, id))

export const liveThumb = (id: string): string =>
  make('live:' + id, 160, 96, (ctx) => {
    const def = LIVE.find((l) => l.id === id) ?? LIVE[0]
    drawLive(ctx, 160, 96, 2.5, { id, speed: 1, colors: def.colors })
  })

export const cursorThumb = (id: string, color?: string, outline?: string): string => {
  const def = cursorDef(id)
  return make(`cur:${id}:${color}:${outline}`, 72, 72, (ctx) => {
    ctx.translate(def.group === 'Touch' || id === 'cross' ? 36 : 22, def.group === 'Touch' || id === 'cross' ? 36 : 16)
    drawCursor(ctx, id, 2, { color: color ?? def.fill, outline: outline ?? def.outline, outlineWidth: 1, shadow: 0.6, opacity: 1 })
  })
}
