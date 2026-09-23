/** 1:05 or 1:05.3 */
export function fmtTime(s: number, withMs = false): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const base = `${m}:${String(sec).padStart(2, '0')}`
  return withMs ? `${base}.${String(Math.floor((s % 1) * 10))}` : base
}
