import type { CaptionSettings, EditState } from '@shared/types'
import { captionChunks, defaultCaptions, spokenWords, type CaptionChunk } from '@shared/speech'
import { clipAt } from './timeMap'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// chunks are rebuilt only when the transcript or the caption layout changes, not every frame
const cache = new WeakMap<object, { key: string; chunks: CaptionChunk[] }>()

export function chunksFor(edit: EditState): CaptionChunk[] {
  const tr = edit.transcript
  if (!tr) return []
  const c = { ...defaultCaptions(), ...(edit.captions ?? {}) }
  const key = [c.maxChars, c.lines, edit.audio.syncOffset, JSON.stringify(c.fixes ?? {}), (c.hidden ?? []).join(','), edit.clips.map((x) => `${x.start}-${x.end}`).join(',')].join('|')
  const hit = cache.get(tr)
  if (hit && hit.key === key) return hit.chunks
  // words that were cut out of the video never show up in the captions
  const chunks = captionChunks(spokenWords(edit).filter((w) => clipAt(edit.clips, (w.t0 + w.t1) / 2)), c.maxChars, c.lines)
  cache.set(tr, { key, chunks })
  return chunks
}

/** The caption showing at video time t, if any (binary search). */
export function chunkAt(chunks: CaptionChunk[], t: number): CaptionChunk | null {
  let lo = 0
  let hi = chunks.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const c = chunks[mid]
    if (t < c.t0) hi = mid - 1
    else if (t >= c.t1) lo = mid + 1
    else return c
  }
  return null
}

const WEIGHT: Record<CaptionSettings['look'], number> = { clean: 700, bold: 900, box: 700, karaoke: 800, neon: 800, minimal: 500 }

export function drawCaptions(ctx: Ctx, edit: EditState, t: number, W: number, H: number, k: number): void {
  const c: CaptionSettings = { ...defaultCaptions(), ...(edit.captions ?? {}) }
  if (!c.show || !edit.transcript) return
  const chunk = chunkAt(chunksFor(edit), t)
  if (!chunk) return
  const size = c.size * k * (c.look === 'minimal' ? 0.8 : 1)
  const weight = WEIGHT[c.look]
  ctx.save()
  ctx.font = `${weight} ${size}px "${c.font}", Inter, sans-serif`
  ctx.textBaseline = 'middle'
  const space = ctx.measureText(' ').width
  const text = (w: string) => (c.uppercase || c.look === 'bold' ? w.toUpperCase() : w)
  const lineH = size * 1.28
  const lines = chunk.lines.map((l) => {
    const widths = l.map((w) => ctx.measureText(text(w.w)).width)
    return { words: l, widths, w: widths.reduce((a, b) => a + b, 0) + space * (l.length - 1) }
  })
  // keep inside the frame: shrink when a line is wider than 92% of the video
  const maxW = Math.max(...lines.map((l) => l.w))
  const fit = Math.min(1, (W * 0.92) / Math.max(1, maxW))
  if (fit < 1) {
    ctx.font = `${weight} ${size * fit}px "${c.font}", Inter, sans-serif`
    lines.forEach((l) => {
      l.widths = l.words.map((w) => ctx.measureText(text(w.w)).width)
      l.w = l.widths.reduce((a, b) => a + b, 0) + space * fit * (l.words.length - 1)
    })
  }
  const sz = size * fit
  const lh = lineH * fit
  const sp = space * fit
  const blockH = lh * lines.length
  const cy = Math.min(H - blockH / 2 - 8 * k, Math.max(blockH / 2 + 8 * k, c.y * H))
  // appear: quick pop and fade
  const age = t - chunk.t0
  const a = Math.min(1, age / 0.12)
  const pop = c.look === 'minimal' ? 1 : 0.92 + 0.08 * (1 - Math.pow(1 - a, 3))
  ctx.globalAlpha = a
  ctx.translate(W / 2, cy)
  ctx.scale(pop, pop)
  ctx.translate(-W / 2, -cy)

  const padX = sz * 0.45
  const padY = sz * 0.2
  lines.forEach((l, li) => {
    const y = cy - blockH / 2 + lh * (li + 0.5)
    let x = W / 2 - l.w / 2
    if (c.look === 'box' || c.look === 'minimal') {
      ctx.fillStyle = hexA(c.bg, c.look === 'minimal' ? Math.min(0.45, c.bgOpacity) : c.bgOpacity)
      ctx.beginPath()
      ctx.roundRect(x - padX, y - lh / 2 - padY * 0.2, l.w + padX * 2, lh + padY * 0.4, sz * 0.28)
      ctx.fill()
    }
    l.words.forEach((w, wi) => {
      const ww = l.widths[wi]
      const now = t >= w.t0 && t < w.t1
      const said = t >= w.t0
      const s = text(w.w)
      let fill = c.color
      if (c.look === 'karaoke') fill = said ? c.highlight : c.color
      else if (c.look !== 'minimal' && now) fill = c.highlight
      // the word being said gets a small lift in the bold look
      const lift = c.look === 'bold' && now ? 1.08 : 1
      ctx.save()
      if (lift !== 1) {
        ctx.translate(x + ww / 2, y)
        ctx.scale(lift, lift)
        ctx.translate(-(x + ww / 2), -y)
      }
      if (c.look === 'clean' || c.look === 'karaoke' || c.look === 'bold') {
        ctx.lineJoin = 'round'
        ctx.lineWidth = sz * (c.look === 'bold' ? 0.16 : 0.12)
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'
        ctx.strokeText(s, x, y)
      }
      if (c.look === 'neon') {
        ctx.shadowColor = c.highlight
        ctx.shadowBlur = sz * (now ? 0.7 : 0.35)
      } else if (c.look === 'clean') {
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = sz * 0.15
        ctx.shadowOffsetY = sz * 0.04
      }
      ctx.fillStyle = fill
      ctx.fillText(s, x, y)
      ctx.restore()
      x += ww + sp
    })
  })
  ctx.restore()
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
