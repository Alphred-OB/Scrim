// App themes. Dark and Light live in styles/tokens.css; every other theme (presets and the
// user's custom one) is built from five colors and applied as CSS variables on <html>.
import type { AppSettings, ThemeColors } from '@shared/types'
import { api } from '@/lib/api'

export interface ThemePreset { id: string; name: string; colors: ThemeColors }

export const THEMES: ThemePreset[] = [
  { id: 'dark', name: 'Dark', colors: { base: 'dark', bg: '#0b0c0f', panel: '#16171c', text: '#f2f3f7', accent: '#0a84ff' } },
  { id: 'light', name: 'Light', colors: { base: 'light', bg: '#f4f5f7', panel: '#ffffff', text: '#16171b', accent: '#007aff' } },
  { id: 'mono-dark', name: 'Black & white', colors: { base: 'dark', bg: '#000000', panel: '#0e0e0e', text: '#ffffff', accent: '#ffffff' } },
  { id: 'mono-light', name: 'White & black', colors: { base: 'light', bg: '#ffffff', panel: '#f6f6f6', text: '#000000', accent: '#000000' } },
  { id: 'midnight', name: 'Midnight', colors: { base: 'dark', bg: '#0a0f1f', panel: '#121a33', text: '#e8ecff', accent: '#7c9cff' } },
  { id: 'ocean', name: 'Ocean', colors: { base: 'dark', bg: '#05161b', panel: '#0c242b', text: '#e3f6fb', accent: '#22c3d6' } },
  { id: 'forest', name: 'Forest', colors: { base: 'dark', bg: '#0b1410', panel: '#13211a', text: '#e6f2ea', accent: '#3ecf8e' } },
  { id: 'grape', name: 'Grape', colors: { base: 'dark', bg: '#110c1b', panel: '#1c142c', text: '#efe8ff', accent: '#b07cff' } },
  { id: 'sunset', name: 'Sunset', colors: { base: 'dark', bg: '#190e12', panel: '#27161d', text: '#fbeae6', accent: '#ff7a59' } },
  { id: 'rose', name: 'Rose', colors: { base: 'light', bg: '#fff5f7', panel: '#ffffff', text: '#2a1418', accent: '#e5487a' } },
  { id: 'sand', name: 'Sand', colors: { base: 'light', bg: '#f7f3ea', panel: '#fffdf8', text: '#2b2518', accent: '#c7812f' } },
  { id: 'mint', name: 'Mint', colors: { base: 'light', bg: '#f1faf6', panel: '#ffffff', text: '#12241c', accent: '#14a36b' } }
]

export const UI_FONTS = ['Inter', 'Poppins', 'Montserrat', 'JetBrains Mono', 'Segoe UI']

// ---- tiny color helpers ----
type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a)
  const y = rgb(b)
  return hex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB)
}
const alpha = (c: string, a: number) => `rgba(${rgb(c).join(', ')}, ${a})`
const luminance = (c: string) => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** All CSS variables for a theme, derived from its five colors. */
export function themeVars(c: ThemeColors): Record<string, string> {
  const dark = c.base === 'dark'
  return {
    '--bg': c.bg,
    '--bg-2': dark ? mix(c.bg, c.text, 0.035) : c.panel,
    '--panel': alpha(c.panel, 0.92),
    '--glass': alpha(c.panel, 0.78),
    '--glass-strong': alpha(c.panel, 0.97),
    '--glass-line': alpha(c.text, 0.08),
    '--card': alpha(c.text, dark ? 0.045 : 0.035),
    '--card-hi': alpha(c.text, dark ? 0.085 : 0.07),
    '--seg-on': dark ? alpha(c.text, 0.12) : c.panel,
    '--field': dark ? 'rgba(0, 0, 0, 0.28)' : alpha(c.text, 0.04),
    '--line': alpha(c.text, dark ? 0.07 : 0.08),
    '--line-2': alpha(c.text, dark ? 0.14 : 0.15),
    '--line-soft': alpha(c.text, dark ? 0.035 : 0.05),
    '--hover': alpha(c.text, dark ? 0.02 : 0.025),
    '--hatch-a': alpha(c.text, 0.03),
    '--hatch-b': alpha(c.text, dark ? 0.06 : 0.07),
    '--cut-a': dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.55)',
    '--cut-b': dark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.25)',
    '--text': c.text,
    '--text-2': mix(c.text, c.bg, 0.18),
    '--dim': mix(c.text, c.bg, 0.42),
    '--faint': mix(c.text, c.bg, 0.6),
    '--accent': c.accent,
    '--accent-2': mix(c.accent, c.text, 0.2),
    '--accent-soft': alpha(c.accent, dark ? 0.16 : 0.12),
    '--on-accent': luminance(c.accent) > 0.45 ? '#000000' : '#ffffff',
    '--shadow': dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.14)',
    '--scroll': alpha(c.text, dark ? 0.12 : 0.18),
    '--scroll-hi': alpha(c.text, dark ? 0.24 : 0.3),
    '--stage': mix(c.bg, dark ? '#000000' : c.text, dark ? 0.35 : 0.06)
  }
}

let applied: string[] = []

/** Resolves the theme setting to real colors, including "Match Windows". */
export function resolveTheme(s: AppSettings, systemLight: boolean): { id: string; colors: ThemeColors } {
  const id = s.theme === 'system' ? (systemLight ? 'light' : 'dark') : s.theme
  if (id === 'custom' && s.customTheme) return { id, colors: s.customTheme }
  return { id, colors: (THEMES.find((t) => t.id === id) ?? THEMES[0]).colors }
}

/** Applies theme colors, UI font and interface size to this window. */
export function applyTheme(s: AppSettings, systemLight: boolean, isMainWindow: boolean): void {
  const root = document.documentElement
  const { id, colors } = resolveTheme(s, systemLight)
  root.dataset.theme = colors.base
  for (const k of applied) root.style.removeProperty(k)
  applied = []
  // dark and light come straight from tokens.css; everything else is generated
  if (id !== 'dark' && id !== 'light') {
    for (const [k, v] of Object.entries(themeVars(colors))) {
      root.style.setProperty(k, v)
      applied.push(k)
    }
  }
  root.style.setProperty('--font', `'${s.uiFont || 'Inter'}'`)
  if (isMainWindow) {
    api.setTheme(colors.base).catch(() => {})
    api.setZoom(s.uiScale || 1)
  }
}
