import type { CursorData } from './types'

/** Finds dead time: stretches where nothing is said, clicked, typed, the cursor rests and the screen stays still. */
export interface TidyInputs {
  duration: number
  /** spoken word times (video time) */
  speech?: { t0: number; t1: number }[]
  /** voice loudness, `rate` values per second starting at `offset` (used when there's no transcript) */
  loud?: { values: number[]; rate: number; offset: number }
  cursor?: CursorData | null
  /** screen change per `step` seconds (0 = frozen) */
  screen?: { step: number; values: number[] }
}

export interface IdleRange { start: number; end: number; why: string }

const BIN = 0.25

export function findIdle(inp: TidyInputs, minLen = 3, pad = 0.4, sensitivity = 0.5): IdleRange[] {
  const n = Math.ceil(inp.duration / BIN)
  const busy = new Uint8Array(n) // bit flags: 1 voice, 2 input, 4 cursor, 8 screen
  const mark = (a: number, b: number, bit: number) => {
    for (let i = Math.max(0, Math.floor(a / BIN)); i < Math.min(n, Math.ceil(b / BIN)); i++) busy[i] |= bit
  }
  // voice
  if (inp.speech?.length) for (const w of inp.speech) mark(w.t0 - 0.2, w.t1 + 0.2, 1)
  else if (inp.loud?.values.length) {
    const v = inp.loud.values
    const sorted = [...v].sort((a, b) => a - b)
    const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0
    const thr = Math.max(0.03, floor * 3)
    for (let i = 0; i < v.length; i++) if (v[i] > thr) mark(inp.loud.offset + i / inp.loud.rate - 0.25, inp.loud.offset + (i + 1) / inp.loud.rate + 0.25, 1)
  }
  // clicks and keys
  for (const c of inp.cursor?.clicks ?? []) mark(c.t - 0.6, (c.up ?? c.t) + 0.6, 2)
  for (const k of inp.cursor?.keys ?? []) mark(k.t - 0.6, k.t + 0.8, 2)
  // cursor movement
  const s = inp.cursor?.samples ?? []
  const moveThr = 0.006 * (1.5 - sensitivity)
  for (let i = 1; i < s.length; i++) {
    const d = Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y)
    const dt = Math.max(1e-3, s[i].t - s[i - 1].t)
    if (d / dt > moveThr / BIN) mark(s[i - 1].t, s[i].t + 0.3, 4)
  }
  // screen change (typing, scrolling, pages loading)
  if (inp.screen?.values.length) {
    const thr = 0.0025 * (1.5 - sensitivity)
    const { step, values } = inp.screen
    for (let i = 1; i < values.length; i++) if (values[i] > thr) mark((i - 1) * step, (i + 1) * step, 8)
  }
  const out: IdleRange[] = []
  let i = 0
  while (i < n) {
    if (busy[i]) {
      i++
      continue
    }
    let j = i
    while (j < n && !busy[j]) j++
    const start = i * BIN + pad
    const end = Math.min(inp.duration, j * BIN) - pad
    if (end - start >= minLen - 2 * pad) {
      const why = !inp.speech?.length && !inp.loud ? 'Nothing moving' : 'No talking, clicking or movement'
      out.push({ start: +start.toFixed(2), end: +end.toFixed(2), why })
    }
    i = j
  }
  return out
}
