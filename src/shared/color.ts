// Tiny color helpers shared by the themes (renderer/lib/theme.ts) and their tests.
export type RGB = [number, number, number]

export const rgb = (hex: string): RGB => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const hex = (c: RGB): string => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
export const mix = (a: string, b: string, t: number): string => {
  const x = rgb(a)
  const y = rgb(b)
  return hex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB)
}
export const alpha = (c: string, a: number): string => `rgba(${rgb(c).join(', ')}, ${a})`
export const luminance = (c: string): number => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast ratio between two colors (1 to 21). */
export const contrast = (a: string, b: string): number => {
  const x = luminance(a) + 0.05
  const y = luminance(b) + 0.05
  return Math.max(x, y) / Math.min(x, y)
}

export const MIN_TEXT_CONTRAST = 4.5

/**
 * The accent as a button fill that carries its text at 4.5:1: the accent itself when it already does,
 * otherwise nudged toward black (for white text) or white (for black text) just far enough.
 */
export function strongAccent(accent: string): { fill: string; on: string } {
  const on = luminance(accent) > 0.45 ? '#000000' : '#ffffff'
  const toward = on === '#ffffff' ? '#000000' : '#ffffff'
  let fill = accent
  for (let t = 0.05; t <= 1 && contrast(fill, on) < MIN_TEXT_CONTRAST; t += 0.05) fill = mix(accent, toward, t)
  return { fill, on }
}
