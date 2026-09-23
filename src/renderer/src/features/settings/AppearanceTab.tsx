import type { ReactNode } from 'react'
import type { AppSettings, ThemeColors } from '@shared/types'
import { ColorRow, Seg, Select, Slider, Toggle } from '@/ui'
import { THEMES, UI_FONTS, resolveTheme } from '@/lib/theme'

/** A tiny picture of the app in a theme's colors. */
function ThemeSwatch({ c, split }: { c: ThemeColors; split?: ThemeColors }) {
  const half = (x: ThemeColors, clip?: string) => (
    <div style={{ position: 'absolute', inset: 0, background: x.bg, clipPath: clip }}>
      <div style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 18, borderRadius: 5, background: x.panel, border: `1px solid ${x.text}14` }} />
      <div style={{ position: 'absolute', left: 30, right: 8, top: 8, height: 5, borderRadius: 3, background: x.text, opacity: 0.8 }} />
      <div style={{ position: 'absolute', left: 30, right: 26, top: 18, height: 4, borderRadius: 3, background: x.text, opacity: 0.35 }} />
      <div style={{ position: 'absolute', right: 8, bottom: 8, width: 26, height: 12, borderRadius: 4, background: x.accent }} />
    </div>
  )
  return (
    <div style={{ position: 'relative', height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
      {half(c)}
      {split && half(split, 'polygon(100% 0, 100% 100%, 0 100%)')}
    </div>
  )
}

export default function AppearanceTab({ settings, save }: { settings: AppSettings; save: (p: Partial<AppSettings>) => void }) {
  const light = window.matchMedia('(prefers-color-scheme: light)').matches
  const current = resolveTheme(settings, light).colors
  const custom: ThemeColors = settings.customTheme ?? { ...current }
  const setCustom = (patch: Partial<ThemeColors>) => save({ theme: 'custom', customTheme: { ...custom, ...patch } })
  // switching base swaps in matching background, panel and text colors (the accent is kept),
  // otherwise "Dark base" with light colors would look broken
  const switchBase = (base: ThemeColors['base']) => {
    if (base === custom.base) return
    const ref = THEMES.find((t) => t.id === base)!.colors
    setCustom({ base, bg: ref.bg, panel: ref.panel, text: ref.text })
  }
  const dark = THEMES[0].colors
  const lightC = THEMES[1].colors

  const cards: { id: string; name: string; node: ReactNode }[] = [
    { id: 'system', name: 'Match Windows', node: <ThemeSwatch c={dark} split={lightC} /> },
    ...THEMES.map((t) => ({ id: t.id, name: t.name, node: <ThemeSwatch c={t.colors} /> })),
    { id: 'custom', name: 'Custom', node: <ThemeSwatch c={custom} /> }
  ]

  return (
    <>
      <div className="section">
        <span className="section-title">Theme</span>
        <div className="theme-grid">
          {cards.map((t) => (
            <button
              key={t.id}
              className={`theme-card ${settings.theme === t.id ? 'on' : ''}`}
              onClick={() => (t.id === 'custom' ? save({ theme: 'custom', customTheme: custom }) : save({ theme: t.id }))}
            >
              {t.node}
              <b>{t.name}</b>
            </button>
          ))}
        </div>
      </div>

      {settings.theme === 'custom' && (
        <div className="section">
          <div className="section-head">
            <span className="section-title">Custom theme</span>
            <button className="link" onClick={() => save({ customTheme: { ...(THEMES.find((x) => x.id === (current.base === 'light' ? 'light' : 'dark'))!.colors) } })}>
              Reset
            </button>
          </div>
          <Seg options={[{ v: 'dark', l: 'Dark base' }, { v: 'light', l: 'Light base' }]} value={custom.base} onChange={(v) => switchBase(v as ThemeColors['base'])} />
          <ColorRow label="Accent (buttons, selection)" value={custom.accent} onChange={(v) => setCustom({ accent: v })} />
          <ColorRow label="Background" value={custom.bg} onChange={(v) => setCustom({ bg: v })} />
          <ColorRow label="Panels and menus" value={custom.panel} onChange={(v) => setCustom({ panel: v })} />
          <ColorRow label="Text" value={custom.text} onChange={(v) => setCustom({ text: v })} />
          <span className="hint">Start from any theme above, then tweak it here. Borders, hovers and muted text are worked out from these colors.</span>
          <div className="swatch-row">
            {THEMES.map((t) => (
              <button key={t.id} className="swatch" title={`Start from ${t.name}`} style={{ background: `linear-gradient(135deg, ${t.colors.bg} 50%, ${t.colors.accent} 50%)` }} onClick={() => setCustom({ ...t.colors })} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <span className="section-title">Interface</span>
        <div className="list-row" style={{ borderBottom: 'none', padding: '2px 0' }}>
          <span style={{ flex: 1 }}>Font</span>
          <Select width={180} value={settings.uiFont || 'Inter'} options={UI_FONTS.map((f) => ({ v: f, l: f, style: { fontFamily: `'${f}'` } }))} onChange={(v) => save({ uiFont: v })} />
        </div>
        <Slider label="Interface size" value={settings.uiScale || 1} min={0.8} max={1.3} step={0.05} def={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => save({ uiScale: v })} />
        <Toggle label="Reduce transparency (faster on low end PCs)" value={settings.reduceTransparency} onChange={(v) => save({ reduceTransparency: v })} />
      </div>
    </>
  )
}
