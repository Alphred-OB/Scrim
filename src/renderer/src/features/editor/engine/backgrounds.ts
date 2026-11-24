// Built in backgrounds: our own still wallpapers, procedural gradients, and animated "live" scenes (2D and 3D).

import wp_midnight_aurora from '@/assets/wallpapers/wp-midnight-aurora.jpg'
import wpt_midnight_aurora from '@/assets/wallpapers/thumb-wp-midnight-aurora.jpg'
import wp_obsidian_flow from '@/assets/wallpapers/wp-obsidian-flow.jpg'
import wpt_obsidian_flow from '@/assets/wallpapers/thumb-wp-obsidian-flow.jpg'
import wp_nebula from '@/assets/wallpapers/wp-nebula.jpg'
import wpt_nebula from '@/assets/wallpapers/thumb-wp-nebula.jpg'
import wp_deep_ocean from '@/assets/wallpapers/wp-deep-ocean.jpg'
import wpt_deep_ocean from '@/assets/wallpapers/thumb-wp-deep-ocean.jpg'
import wp_emerald_night from '@/assets/wallpapers/wp-emerald-night.jpg'
import wpt_emerald_night from '@/assets/wallpapers/thumb-wp-emerald-night.jpg'
import wp_graphite from '@/assets/wallpapers/wp-graphite.jpg'
import wpt_graphite from '@/assets/wallpapers/thumb-wp-graphite.jpg'
import wp_sunset_waves from '@/assets/wallpapers/wp-sunset-waves.jpg'
import wpt_sunset_waves from '@/assets/wallpapers/thumb-wp-sunset-waves.jpg'
import wp_electric_blue from '@/assets/wallpapers/wp-electric-blue.jpg'
import wpt_electric_blue from '@/assets/wallpapers/thumb-wp-electric-blue.jpg'
import wp_ultraviolet from '@/assets/wallpapers/wp-ultraviolet.jpg'
import wpt_ultraviolet from '@/assets/wallpapers/thumb-wp-ultraviolet.jpg'
import wp_cloud_pastel from '@/assets/wallpapers/wp-cloud-pastel.jpg'
import wpt_cloud_pastel from '@/assets/wallpapers/thumb-wp-cloud-pastel.jpg'
import wp_morning_mist from '@/assets/wallpapers/wp-morning-mist.jpg'
import wpt_morning_mist from '@/assets/wallpapers/thumb-wp-morning-mist.jpg'
import wp_peach_glow from '@/assets/wallpapers/wp-peach-glow.jpg'
import wpt_peach_glow from '@/assets/wallpapers/thumb-wp-peach-glow.jpg'
import wp_mint_fresh from '@/assets/wallpapers/wp-mint-fresh.jpg'
import wpt_mint_fresh from '@/assets/wallpapers/thumb-wp-mint-fresh.jpg'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type WallpaperCategory = 'Dark' | 'Vivid' | 'Light' | 'Gradients'

// ---------------- still wallpapers ----------------
export interface Wallpaper {
  id: string
  name: string
  category: WallpaperCategory
  tag?: string
  image?: string
  thumb?: string
  base: string
  blobs?: [number, number, number, string][]
}

export const WALLPAPERS: Wallpaper[] = [
  // --- Scrim's own wallpapers (drawn by tools/make-wallpapers.py, so they are ours to ship) ---
  { id: 'midnight-aurora', name: 'Midnight Aurora', category: 'Dark', tag: 'Scrim', image: wp_midnight_aurora, thumb: wpt_midnight_aurora, base: '#060a1c' },
  { id: 'obsidian-flow', name: 'Obsidian Flow', category: 'Dark', tag: 'Scrim', image: wp_obsidian_flow, thumb: wpt_obsidian_flow, base: '#05050b' },
  { id: 'nebula', name: 'Nebula', category: 'Dark', tag: 'Scrim', image: wp_nebula, thumb: wpt_nebula, base: '#070312' },
  { id: 'deep-ocean', name: 'Deep Ocean', category: 'Dark', tag: 'Scrim', image: wp_deep_ocean, thumb: wpt_deep_ocean, base: '#03121f' },
  { id: 'emerald-night', name: 'Emerald Night', category: 'Dark', tag: 'Scrim', image: wp_emerald_night, thumb: wpt_emerald_night, base: '#03120e' },
  { id: 'graphite', name: 'Graphite', category: 'Dark', tag: 'Scrim', image: wp_graphite, thumb: wpt_graphite, base: '#0b0c10' },
  { id: 'sunset-waves', name: 'Sunset Waves', category: 'Vivid', tag: 'Scrim', image: wp_sunset_waves, thumb: wpt_sunset_waves, base: '#2a0a2e' },
  { id: 'electric-blue', name: 'Electric Blue', category: 'Vivid', tag: 'Scrim', image: wp_electric_blue, thumb: wpt_electric_blue, base: '#0b1470' },
  { id: 'ultraviolet', name: 'Ultraviolet', category: 'Vivid', tag: 'Scrim', image: wp_ultraviolet, thumb: wpt_ultraviolet, base: '#1a0536' },
  { id: 'cloud-pastel', name: 'Cloud Pastel', category: 'Light', tag: 'Scrim', image: wp_cloud_pastel, thumb: wpt_cloud_pastel, base: '#f7f0ff' },
  { id: 'morning-mist', name: 'Morning Mist', category: 'Light', tag: 'Scrim', image: wp_morning_mist, thumb: wpt_morning_mist, base: '#f1f7ff' },
  { id: 'peach-glow', name: 'Peach Glow', category: 'Light', tag: 'Scrim', image: wp_peach_glow, thumb: wpt_peach_glow, base: '#fff3e8' },
  { id: 'mint-fresh', name: 'Mint Fresh', category: 'Light', tag: 'Scrim', image: wp_mint_fresh, thumb: wpt_mint_fresh, base: '#effcf6' },

  // --- Procedural Gradient Wallpapers ---
  { id: 'aurora', name: 'Aurora', category: 'Gradients', tag: 'Gradient', base: '#0b1026', blobs: [[0.15, 0.2, 0.6, '#2f6bff'], [0.85, 0.3, 0.55, '#7c3aed'], [0.5, 0.95, 0.6, '#06b6d4'], [0.9, 0.9, 0.4, '#1e3a8a']] },
  { id: 'sunset', name: 'Sunset', category: 'Gradients', tag: 'Gradient', base: '#2a0a1f', blobs: [[0.1, 0.1, 0.6, '#ff7a45'], [0.9, 0.2, 0.55, '#ff3d77'], [0.4, 0.9, 0.7, '#7c3aed'], [0.95, 0.95, 0.4, '#f59e0b']] },
  { id: 'ocean', name: 'Ocean', category: 'Gradients', tag: 'Gradient', base: '#03141f', blobs: [[0.2, 0.8, 0.7, '#0ea5e9'], [0.8, 0.15, 0.6, '#14b8a6'], [0.6, 0.6, 0.4, '#1d4ed8']] },
  { id: 'mint', name: 'Mint', category: 'Gradients', tag: 'Gradient', base: '#06201a', blobs: [[0.2, 0.2, 0.6, '#34d399'], [0.85, 0.7, 0.6, '#0f766e'], [0.5, 1, 0.5, '#a3e635']] },
  { id: 'candy', name: 'Candy', category: 'Gradients', tag: 'Gradient', base: '#2b0a3d', blobs: [[0.15, 0.85, 0.6, '#f472b6'], [0.85, 0.15, 0.6, '#60a5fa'], [0.6, 0.5, 0.45, '#c084fc']] },
  { id: 'peach', name: 'Peach', category: 'Gradients', tag: 'Gradient', base: '#fbe3d0', blobs: [[0.1, 0.1, 0.6, '#fdba74'], [0.9, 0.3, 0.55, '#fda4af'], [0.4, 0.95, 0.6, '#fde68a']] },
  { id: 'dusk', name: 'Dusk', category: 'Gradients', tag: 'Gradient', base: '#0f0a1f', blobs: [[0.8, 0.8, 0.7, '#e11d48'], [0.2, 0.3, 0.6, '#4338ca'], [0.6, 0.1, 0.4, '#9333ea']] },
  { id: 'forest', name: 'Forest', category: 'Gradients', tag: 'Gradient', base: '#0a1a10', blobs: [[0.3, 0.9, 0.7, '#166534'], [0.8, 0.2, 0.55, '#65a30d'], [0.1, 0.2, 0.4, '#0f766e']] },
  { id: 'ice', name: 'Ice', category: 'Gradients', tag: 'Gradient', base: '#dbeafe', blobs: [[0.2, 0.2, 0.6, '#ffffff'], [0.8, 0.8, 0.6, '#93c5fd'], [0.7, 0.2, 0.4, '#c7d2fe']] },
  { id: 'lava', name: 'Lava', category: 'Gradients', tag: 'Gradient', base: '#1a0500', blobs: [[0.3, 0.7, 0.65, '#ea580c'], [0.8, 0.3, 0.55, '#dc2626'], [0.6, 0.95, 0.4, '#facc15']] },
  { id: 'graphite', name: 'Graphite', category: 'Gradients', tag: 'Gradient', base: '#0d0e11', blobs: [[0.2, 0.1, 0.7, '#2a2d35'], [0.9, 0.9, 0.7, '#1b1d23'], [0.7, 0.3, 0.3, '#3b3f4a']] },
  { id: 'lilac', name: 'Lilac', category: 'Gradients', tag: 'Gradient', base: '#ede9fe', blobs: [[0.1, 0.9, 0.6, '#c4b5fd'], [0.9, 0.1, 0.6, '#f0abfc'], [0.5, 0.5, 0.35, '#ffffff']] },
  { id: 'neon', name: 'Neon', category: 'Gradients', tag: 'Gradient', base: '#050510', blobs: [[0.15, 0.5, 0.5, '#22d3ee'], [0.85, 0.5, 0.5, '#e879f9'], [0.5, 0.05, 0.35, '#4f46e5']] },
  { id: 'sand', name: 'Sand', category: 'Gradients', tag: 'Gradient', base: '#e7dcc8', blobs: [[0.2, 0.3, 0.6, '#f5ecd9'], [0.85, 0.8, 0.6, '#d6b98c'], [0.6, 0.1, 0.3, '#fff7e6']] },
  { id: 'berry', name: 'Berry', category: 'Gradients', tag: 'Gradient', base: '#1c0418', blobs: [[0.2, 0.8, 0.6, '#be185d'], [0.8, 0.2, 0.6, '#6d28d9'], [0.9, 0.9, 0.35, '#f43f5e']] },
  { id: 'sky', name: 'Sky', category: 'Gradients', tag: 'Gradient', base: '#0c4a6e', blobs: [[0.1, 0.1, 0.7, '#38bdf8'], [0.9, 0.9, 0.6, '#1e40af'], [0.7, 0.2, 0.4, '#bae6fd']] },
  { id: 'cotton', name: 'Cotton', category: 'Gradients', tag: 'Gradient', base: '#fdf2f8', blobs: [[0.15, 0.2, 0.6, '#bae6fd'], [0.85, 0.75, 0.6, '#fbcfe8'], [0.5, 0.5, 0.4, '#e9d5ff']] },
  { id: 'citrus', name: 'Citrus', category: 'Gradients', tag: 'Gradient', base: '#1a1300', blobs: [[0.2, 0.2, 0.6, '#fde047'], [0.8, 0.8, 0.6, '#f97316'], [0.8, 0.1, 0.35, '#84cc16']] },
  { id: 'deep', name: 'Deep sea', category: 'Gradients', tag: 'Gradient', base: '#020617', blobs: [[0.5, 1.1, 0.8, '#0e7490'], [0.1, 0.1, 0.5, '#1e1b4b'], [0.9, 0.3, 0.4, '#155e75']] },
  { id: 'rose', name: 'Rose gold', category: 'Gradients', tag: 'Gradient', base: '#2a1614', blobs: [[0.2, 0.8, 0.6, '#fda4af'], [0.8, 0.2, 0.6, '#b45309'], [0.5, 0.5, 0.3, '#fecdd3']] },
  { id: 'emerald', name: 'Emerald', category: 'Gradients', tag: 'Gradient', base: '#022c22', blobs: [[0.8, 0.8, 0.7, '#10b981'], [0.2, 0.2, 0.5, '#064e3b'], [0.5, 0, 0.35, '#6ee7b7']] },
  { id: 'violet', name: 'Violet', category: 'Gradients', tag: 'Gradient', base: '#12002b', blobs: [[0.3, 0.3, 0.7, '#7c3aed'], [0.9, 0.8, 0.5, '#c026d3'], [0.1, 0.9, 0.4, '#312e81']] },
  { id: 'paper', name: 'Paper', category: 'Gradients', tag: 'Gradient', base: '#eee7db', blobs: [[0.2, 0.2, 0.6, '#f7f1e6'], [0.8, 0.8, 0.6, '#e3d7c3']] },
  { id: 'midnight', name: 'Midnight', category: 'Gradients', tag: 'Gradient', base: '#05060a', blobs: [[0.8, 0.1, 0.6, '#1e293b'], [0.1, 0.9, 0.5, '#0f172a']] }
]

function drawCover(ctx: Ctx, img: CanvasImageSource, iw: number, ih: number, w: number, h: number): void {
  const s = Math.max(w / iw, h / ih)
  const dw = iw * s
  const dh = ih * s
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

const imgCache = new Map<string, HTMLImageElement>()
const loadListeners = new Set<() => void>()

export function onWallpaperLoaded(cb: () => void): () => void {
  loadListeners.add(cb)
  return () => {
    loadListeners.delete(cb)
  }
}

export function preloadWallpaperImage(src: string): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined') return Promise.resolve({} as HTMLImageElement)
  const existing = imgCache.get(src)
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing)
  }
  return new Promise((resolve, reject) => {
    let img = existing
    if (!img) {
      img = new Image()
      imgCache.set(src, img)
    }
    img.onload = () => {
      loadListeners.forEach((l) => l())
      resolve(img!)
    }
    img.onerror = (e) => reject(e)
    if (!img.src) img.src = src
    else if (img.complete && img.naturalWidth > 0) resolve(img)
  })
}

/** Projects made with the old Apple wallpapers keep a similar look: their ids point at the nearest of our own. */
const LEGACY_WALLPAPERS: Record<string, string> = {
  sequoia: 'midnight-aurora', 'sonoma-light': 'morning-mist', 'sonoma-dark': 'deep-ocean', 'ventura-light': 'peach-glow', 'ventura-dark': 'nebula',
  monterey: 'ultraviolet', 'big-sur': 'electric-blue', catalina: 'deep-ocean', mojave: 'sunset-waves', 'apple-cyan': 'deep-ocean', 'apple-purple': 'ultraviolet'
}
export const findWallpaper = (id: string): Wallpaper | undefined => WALLPAPERS.find((x) => x.id === (LEGACY_WALLPAPERS[id] ?? id))

export async function ensureWallpaperLoaded(id: string): Promise<void> {
  const wp = findWallpaper(id)
  if (!wp || !wp.image) return
  await preloadWallpaperImage(wp.image)
}

export function drawWallpaper(ctx: Ctx, w: number, h: number, id: string): void {
  const wp = findWallpaper(id) ?? WALLPAPERS[0]
  if (wp.image && typeof Image !== 'undefined') {
    let img = imgCache.get(wp.image)
    if (!img) {
      img = new Image()
      img.src = wp.image
      img.onload = () => loadListeners.forEach((l) => l())
      imgCache.set(wp.image, img)
    }
    if (img.complete && img.naturalWidth > 0) {
      drawCover(ctx, img, img.naturalWidth, img.naturalHeight, w, h)
      return
    }
  }

  ctx.fillStyle = wp.base
  ctx.fillRect(0, 0, w, h)
  if (wp.blobs) {
    const m = Math.max(w, h)
    for (const [x, y, r, c] of wp.blobs) {
      const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * m)
      g.addColorStop(0, c)
      g.addColorStop(1, c + '00')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  }
}

// Background preload of official wallpapers in browser/electron environment
if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
  WALLPAPERS.forEach((wp) => {
    if (wp.image) {
      const img = new Image()
      img.src = wp.image
      img.onload = () => loadListeners.forEach((l) => l())
      imgCache.set(wp.image, img)
    }
  })
}

// ---------------- live (animated) backgrounds ----------------
export interface LiveDef { id: string; name: string; kind: '2d' | '3d'; colors: [string, string, string] }

export const LIVE: LiveDef[] = [
  { id: 'aurora-flow', name: 'Aurora flow', kind: '2d', colors: ['#0b1026', '#2f6bff', '#a855f7'] },
  { id: 'orbit', name: 'Orbit', kind: '2d', colors: ['#05060a', '#ffffff', '#6c63ff'] },
  { id: 'concentric', name: 'Concentric', kind: '2d', colors: ['#05060a', '#8b8f9c', '#0a84ff'] },
  { id: 'contour', name: 'Contour', kind: '2d', colors: ['#05060a', '#9aa0ad', '#30d158'] },
  { id: 'waves', name: 'Waves', kind: '2d', colors: ['#071120', '#0ea5e9', '#6366f1'] },
  { id: 'bokeh', name: 'Bokeh', kind: '2d', colors: ['#12081f', '#f472b6', '#60a5fa'] },
  { id: 'grid', name: 'Dot grid', kind: '2d', colors: ['#0a0b0f', '#3b3f4a', '#0a84ff'] },
  { id: 'stars', name: 'Starfield', kind: '2d', colors: ['#02030a', '#ffffff', '#93c5fd'] },
  { id: 'terrain', name: 'Terrain', kind: '3d', colors: ['#05020f', '#ff3d77', '#7c3aed'] },
  { id: 'tunnel', name: 'Tunnel', kind: '3d', colors: ['#02040a', '#22d3ee', '#6366f1'] },
  { id: 'spheres', name: 'Spheres', kind: '3d', colors: ['#0b0c14', '#f97316', '#3b82f6'] },
  { id: 'cubes', name: 'Cubes', kind: '3d', colors: ['#06070c', '#e5e7eb', '#0a84ff'] }
]

export interface LiveSettings { id: string; speed: number; colors: [string, string, string] }

function rand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function alpha(hex: string, a: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Draws one frame of a live background. `t` is seconds. Deterministic for identical inputs. */
export function drawLive(ctx: Ctx, w: number, h: number, t: number, s: LiveSettings): void {
  const [bg, c1, c2] = s.colors
  const time = t * s.speed
  const m = Math.min(w, h)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  const R = rand(7)

  switch (s.id) {
    case 'aurora-flow': {
      const blobs = [[0.2, 0.3, c1], [0.8, 0.4, c2], [0.5, 0.9, c1], [0.9, 0.9, c2]] as const
      blobs.forEach(([x, y, c], i) => {
        const bx = (x + Math.sin(time * 0.25 + i * 1.7) * 0.15) * w
        const by = (y + Math.cos(time * 0.2 + i * 2.3) * 0.12) * h
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, 0.65 * Math.max(w, h))
        g.addColorStop(0, alpha(c, 0.85))
        g.addColorStop(1, alpha(c, 0))
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      })
      break
    }
    case 'orbit': {
      for (let i = 0; i < 70; i++) {
        const r = (0.1 + R() * 0.6) * m
        const a = R() * Math.PI * 2 + time * (0.05 + R() * 0.12) * (i % 2 ? 1 : -1)
        const x = w / 2 + Math.cos(a) * r * 1.4
        const y = h / 2 + Math.sin(a) * r * 0.8
        ctx.fillStyle = alpha(i % 5 === 0 ? c2 : c1, 0.35 + R() * 0.5)
        ctx.beginPath()
        ctx.arc(x, y, (1 + R() * 2.4) * (m / 900), 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'concentric': {
      ctx.lineWidth = Math.max(1, m / 700)
      const gap = m / 9
      const shift = (time * gap * 0.25) % gap
      for (let r = shift; r < Math.hypot(w, h); r += gap) {
        ctx.strokeStyle = alpha(r % (gap * 3) < gap ? c2 : c1, 0.35)
        ctx.beginPath()
        ctx.arc(w / 2, h * 1.05, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'contour': {
      ctx.lineWidth = Math.max(1, m / 800)
      for (let k = 0; k < 14; k++) {
        ctx.strokeStyle = alpha(k % 4 === 0 ? c2 : c1, 0.3)
        ctx.beginPath()
        for (let x = 0; x <= w; x += w / 60) {
          const u = x / w
          const y = h * (k / 13) + Math.sin(u * 5 + time * 0.3 + k * 0.6) * m * 0.05 + Math.sin(u * 11 - time * 0.2 + k) * m * 0.02
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      break
    }
    case 'waves': {
      for (let k = 0; k < 6; k++) {
        const g = ctx.createLinearGradient(0, 0, w, 0)
        g.addColorStop(0, alpha(c1, 0.25))
        g.addColorStop(1, alpha(c2, 0.25))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += w / 50) {
          const y = h * (0.45 + k * 0.08) + Math.sin(x / w * 6 + time * (0.4 + k * 0.1) + k) * m * 0.04
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.fill()
      }
      break
    }
    case 'bokeh': {
      for (let i = 0; i < 26; i++) {
        const r = (0.04 + R() * 0.12) * m
        const x = ((R() + time * (0.01 + R() * 0.02)) % 1.2 - 0.1) * w
        const y = (R() + Math.sin(time * 0.3 + i) * 0.03) * h
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        const c = i % 2 ? c1 : c2
        g.addColorStop(0, alpha(c, 0.45))
        g.addColorStop(1, alpha(c, 0))
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      break
    }
    case 'grid': {
      const step = m / 22
      const ox = (time * step * 0.3) % step
      for (let x = -step + ox; x < w + step; x += step)
        for (let y = -step + ox; y < h + step; y += step) {
          const d = Math.hypot(x - w / 2, y - h / 2) / Math.max(w, h)
          const pulse = 0.5 + 0.5 * Math.sin(d * 12 - time * 1.5)
          ctx.fillStyle = alpha(pulse > 0.85 ? c2 : c1, 0.35 + pulse * 0.4)
          ctx.fillRect(x, y, Math.max(1.5, m / 500), Math.max(1.5, m / 500))
        }
      break
    }
    case 'stars': {
      for (let i = 0; i < 160; i++) {
        const z = ((R() - time * 0.08) % 1 + 1) % 1
        const sx = (R() - 0.5) * 2
        const sy = (R() - 0.5) * 2
        const k = 0.1 / Math.max(0.02, z)
        const x = w / 2 + sx * k * w * 0.5
        const y = h / 2 + sy * k * h * 0.5
        if (x < 0 || y < 0 || x > w || y > h) continue
        ctx.fillStyle = alpha(i % 7 ? c1 : c2, Math.min(1, (1 - z) * 1.2))
        const size = (1 - z) * (m / 500) * 2 + 0.5
        ctx.fillRect(x, y, size, size)
      }
      break
    }
    case 'terrain': {
      // perspective wireframe landscape rolling toward the camera
      const rows = 26
      const cols = 36
      const horizon = h * 0.42
      ctx.lineWidth = Math.max(1, m / 900)
      const project = (gx: number, gz: number): [number, number] => {
        const z = gz + 0.2
        const hgt = Math.sin(gx * 0.6 + time * 0.5) * Math.cos(gz * 0.5 - time * 0.8) * 0.9
        return [w / 2 + ((gx - cols / 2) / z) * w * 0.12, horizon + ((1.4 - hgt) / z) * h * 0.18]
      }
      const off = (time * 1.2) % 1
      for (let r = rows; r >= 1; r--) {
        const gz = r - off
        ctx.strokeStyle = alpha(r < 8 ? c1 : c2, Math.min(0.9, 1.6 / gz + 0.1))
        ctx.beginPath()
        for (let c = 0; c <= cols; c++) {
          const [x, y] = project(c, gz)
          if (c === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      const sun = ctx.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, m * 0.35)
      sun.addColorStop(0, alpha(c1, 0.55))
      sun.addColorStop(1, alpha(c1, 0))
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, w, horizon + m * 0.1)
      break
    }
    case 'tunnel': {
      ctx.lineWidth = Math.max(1, m / 600)
      for (let i = 0; i < 28; i++) {
        const z = (i / 28 + time * 0.15) % 1 // 0 far away, 1 at the camera
        const r = (0.02 / Math.max(0.03, 1 - z)) * m
        if (r > Math.hypot(w, h)) continue
        const cx = w / 2 + Math.sin(time * 0.6 + z * 3) * m * 0.05 * z
        const cy = h / 2 + Math.cos(time * 0.5 + z * 3) * m * 0.04 * z
        ctx.strokeStyle = alpha(i % 3 === 0 ? c2 : c1, Math.min(0.8, z))
        ctx.beginPath()
        ctx.ellipse(cx, cy, r * 1.3, r, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'spheres': {
      const balls = Array.from({ length: 14 }, (_, i) => {
        const z = 0.4 + ((R() + time * 0.03 * (i % 3 + 1)) % 1) * 1.6
        return { x: R() * 1.4 - 0.2 + Math.sin(time * 0.4 + i) * 0.05, y: R() * 1.2 - 0.1 + Math.cos(time * 0.3 + i) * 0.05, z, c: i % 2 ? c1 : c2 }
      }).sort((a, b) => b.z - a.z)
      for (const b of balls) {
        const r = (m * 0.09) / b.z
        const x = b.x * w
        const y = b.y * h
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
        g.addColorStop(0, alpha('#ffffff', 0.9 / b.z))
        g.addColorStop(0.25, alpha(b.c, 0.95 / Math.max(1, b.z * 0.9)))
        g.addColorStop(1, alpha(bg, 0.9))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'cubes': {
      const verts = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
      ctx.lineWidth = Math.max(1, m / 700)
      for (let i = 0; i < 9; i++) {
        const cx = (R() * 1.1 - 0.05) * w
        const cy = (R() * 1.1 - 0.05) * h
        const size = (0.03 + R() * 0.07) * m
        const ax = time * (0.2 + R() * 0.4)
        const ay = time * (0.3 + R() * 0.4)
        const pts = verts.map(([x, y, z]) => {
          const y1 = y * Math.cos(ax) - z * Math.sin(ax)
          const z1 = y * Math.sin(ax) + z * Math.cos(ax)
          const x2 = x * Math.cos(ay) + z1 * Math.sin(ay)
          const z2 = -x * Math.sin(ay) + z1 * Math.cos(ay)
          const p = 3 / (3 + z2)
          return [cx + x2 * size * p, cy + y1 * size * p]
        })
        ctx.strokeStyle = alpha(i % 3 === 0 ? c2 : c1, 0.55)
        ctx.beginPath()
        for (const [a, b] of edges) {
          ctx.moveTo(pts[a][0], pts[a][1])
          ctx.lineTo(pts[b][0], pts[b][1])
        }
        ctx.stroke()
      }
      break
    }
  }
}
