import type { CaptionSettings, Clip, EditState, ProjectMedia, TranscriptWord } from './types'

/** A word placed on the video's own (source) timeline. */
export interface SpokenWord { t0: number; t1: number; w: string; key: number }

export function defaultCaptions(): CaptionSettings {
  return {
    show: true,
    look: 'karaoke',
    font: 'Inter',
    size: 52,
    color: '#ffffff',
    highlight: '#ffd60a',
    bg: '#000000',
    bgOpacity: 0.55,
    y: 0.85,
    maxChars: 34,
    lines: 2,
    uppercase: false,
    hidden: [],
    fixes: {}
  }
}

/** Every word of the transcript on the video timeline (sync offset applied), fixes applied, hidden ones left out. */
export function spokenWords(edit: EditState, _media?: ProjectMedia, includeHidden = false): SpokenWord[] {
  const tr = edit.transcript
  if (!tr) return []
  const shift = tr.offset + (tr.source === 'screen' ? 0 : edit.audio.syncOffset)
  const fixes = edit.captions?.fixes ?? {}
  const hidden = new Set(edit.captions?.hidden ?? [])
  const out: SpokenWord[] = []
  for (const w of tr.words) {
    const key = Math.round(w.t0 * 1000)
    if (!includeHidden && hidden.has(key)) continue
    const text = fixes[String(key)] ?? w.w
    if (!text.trim()) continue
    out.push({ t0: w.t0 + shift, t1: w.t1 + shift, w: text.trim(), key })
  }
  return out
}

export interface CaptionChunk { t0: number; t1: number; words: SpokenWord[]; lines: SpokenWord[][] }

/** Groups words into what's on screen at once: at most `lines` lines of `maxChars`, split on pauses and sentence ends. */
export function captionChunks(words: SpokenWord[], maxChars = 34, lines = 2): CaptionChunk[] {
  const chunks: CaptionChunk[] = []
  let cur: SpokenWord[] = []
  const flush = () => {
    if (!cur.length) return
    chunks.push({ t0: cur[0].t0, t1: cur[cur.length - 1].t1, words: cur, lines: splitLines(cur, maxChars, lines) })
    cur = []
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const prev = cur[cur.length - 1]
    if (prev) {
      const gap = w.t0 - prev.t1
      const text = [...cur, w].map((x) => x.w).join(' ')
      const endSentence = /[.!?]$/.test(prev.w) && cur.length >= 2
      if (gap > 0.75 || text.length > maxChars * lines || endSentence) flush()
    }
    cur.push(w)
  }
  flush()
  // keep each chunk up until the next one starts (short pauses don't blink), at most 0.6s past its last word
  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1]
    chunks[i].t1 = Math.min(next ? next.t0 : Infinity, chunks[i].t1 + 0.6)
  }
  return chunks
}

function splitLines(words: SpokenWord[], maxChars: number, lines: number): SpokenWord[][] {
  const total = words.map((w) => w.w).join(' ').length
  if (lines < 2 || total <= maxChars) return [words]
  // balance two lines by length
  let best = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).map((w) => w.w).join(' ').length
    const b = words.slice(i).map((w) => w.w).join(' ').length
    const d = Math.abs(a - b) + (a > maxChars || b > maxChars ? 1000 : 0)
    if (d < bestDiff) (bestDiff = d), (best = i)
  }
  return [words.slice(0, best), words.slice(best)]
}

// ---------------- cleaning up speech ----------------
const FILLERS = new Set(['um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'err', 'ah', 'ahh', 'hmm', 'hm', 'mm', 'mmm', 'eh'])
export const norm = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
export const isFiller = (w: string): boolean => FILLERS.has(norm(w))

/** Stretches to cut for filler words (um, uh...), in video time. */
export function fillerRanges(words: SpokenWord[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (!isFiller(w.w)) continue
    // take the little pause after it too, but never into the next word
    const next = words[i + 1]
    const end = next ? Math.min(next.t0 - 0.03, w.t1 + 0.12) : w.t1 + 0.1
    const prev = words[i - 1]
    const start = prev ? Math.max(prev.t1 + 0.03, w.t0 - 0.04) : w.t0 - 0.04
    if (end - start > 0.05) out.push([start, end])
  }
  return out
}

/** Pauses longer than `minGap` between words, shortened so `keep` seconds of breathing room stay. */
export function silenceRanges(words: SpokenWord[], minGap = 1, keep = 0.3, from = 0, to = Infinity): [number, number][] {
  const out: [number, number][] = []
  const pts = [{ t1: from }, ...words, { t0: to }] as { t0?: number; t1?: number }[]
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i].t1 ?? pts[i].t0!
    const b = pts[i + 1].t0 ?? pts[i + 1].t1!
    if (!isFinite(b) || b - a < minGap) continue
    const s = i === 0 ? a : a + keep
    const e = i + 1 === pts.length - 1 ? b : b - keep
    if (e - s > 0.2) out.push([s, e])
  }
  return out
}

/** Merges overlapping ranges and sorts them. */
export function mergeRanges(r: [number, number][]): [number, number][] {
  const s = r.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const x of s) {
    const last = out[out.length - 1]
    if (last && x[0] <= last[1] + 0.02) last[1] = Math.max(last[1], x[1])
    else out.push([x[0], x[1]])
  }
  return out
}

/**
 * Removes the given source time ranges from the clips (the video "ripples" closed). Pieces shorter
 * than 50 ms are dropped. New pieces get new ids; the first piece of a clip keeps its id.
 */
export function cutRanges(clips: Clip[], ranges: [number, number][], newId: () => string): Clip[] {
  const rs = mergeRanges(ranges)
  const out: Clip[] = []
  for (const c of [...clips].sort((a, b) => a.start - b.start)) {
    let pieces: [number, number][] = [[c.start, c.end]]
    for (const [a, b] of rs) {
      if (b <= c.start || a >= c.end) continue
      const next: [number, number][] = []
      for (const [s, e] of pieces) {
        if (b <= s || a >= e) next.push([s, e])
        else {
          if (a > s) next.push([s, a])
          if (b < e) next.push([b, e])
        }
      }
      pieces = next
    }
    pieces = pieces.filter(([s, e]) => e - s >= 0.05)
    pieces.forEach(([s, e], i) => out.push({ ...c, id: i === 0 ? c.id : newId(), start: +s.toFixed(3), end: +e.toFixed(3) }))
  }
  return out
}

/** Sets a speed on the given ranges (splitting clips at their edges). */
export function speedRanges(clips: Clip[], ranges: [number, number][], speed: number, newId: () => string): Clip[] {
  const rs = mergeRanges(ranges)
  let out: Clip[] = [...clips].sort((a, b) => a.start - b.start)
  for (const [a, b] of rs) {
    const next: Clip[] = []
    for (const c of out) {
      if (b <= c.start || a >= c.end) {
        next.push(c)
        continue
      }
      const s = Math.max(a, c.start)
      const e = Math.min(b, c.end)
      if (s - c.start >= 0.05) next.push({ ...c, end: s })
      next.push({ ...c, id: s - c.start >= 0.05 ? newId() : c.id, start: s, end: e, speed })
      if (c.end - e >= 0.05) next.push({ ...c, id: newId(), start: e })
    }
    out = next
  }
  return out.map((c) => ({ ...c, start: +c.start.toFixed(3), end: +c.end.toFixed(3) }))
}

// ---------------- subtitle files ----------------
const stamp = (s: number, sep: string): string => {
  const ms = Math.max(0, Math.round(s * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  const pad = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}${sep}${pad(ms % 1000, 3)}`
}

/** SRT or WebVTT text. `toOut` maps video time to the exported video's time (cuts removed). */
export function subtitleFile(chunks: CaptionChunk[], toOut: (t: number) => number, kind: 'srt' | 'vtt', keep?: (t: number) => boolean): string {
  const rows: string[] = kind === 'vtt' ? ['WEBVTT', ''] : []
  let n = 1
  for (const c of chunks) {
    if (keep && !keep((c.t0 + c.t1) / 2)) continue
    const a = toOut(c.t0)
    const b = toOut(c.t1)
    if (b - a < 0.05) continue
    if (kind === 'srt') rows.push(String(n++))
    rows.push(`${stamp(a, kind === 'srt' ? ',' : '.')} --> ${stamp(b, kind === 'srt' ? ',' : '.')}`)
    rows.push(c.lines.map((l) => l.map((w) => w.w).join(' ')).join('\n'), '')
  }
  return rows.join('\n')
}

/** Plain transcript for copying. */
export function plainText(words: { w: string }[]): string {
  return words.map((w) => w.w).join(' ').replace(/\s+([,.!?;:])/g, '$1')
}

export type { TranscriptWord }
