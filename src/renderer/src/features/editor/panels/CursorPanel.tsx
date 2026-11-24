import { useState, type ReactNode } from 'react'
import type { ClickEffect, ClickSound, SpotlightWhen } from '@shared/types'
import { CLICK_SOUNDS } from '@shared/clickSounds'
import { playClick } from '../preview/clickPlayer'
import { defaultEdit } from '@shared/defaults'
import { ColorRow, Icon, Section, Seg, Slider, Toggle } from '@/ui'
import { useEditor } from '../state/store'
import { CURSORS, cursorDef } from '../engine/cursors'
import { cursorThumb } from '../engine/thumbnails'
import { CursorTooltipProvider, TooltipIcon } from './CursorTooltip'

/** The sound picked before switching sounds off, so turning them back on restores it */
let lastSound: ClickSound | '' = ''

type CursorTab = 'style' | 'motion' | 'spotlight' | 'clicks'

const TABS: { id: CursorTab; label: string; icon: string }[] = [
  { id: 'style', label: 'Style', icon: 'cursor' },
  { id: 'motion', label: 'Motion', icon: 'wand' },
  { id: 'spotlight', label: 'Spotlight', icon: 'sun' },
  { id: 'clicks', label: 'Clicks', icon: 'click' }
]

const STYLE_CATEGORIES = [
  { id: 'all', label: 'All', filter: () => true },
  { id: 'classic', label: 'Classic OS', filter: (x: (typeof CURSORS)[number]) => x.group === 'Classic' },
  { id: 'modern', label: 'Modern', filter: (x: (typeof CURSORS)[number]) => x.group === 'Simple' || x.group === 'Pointy' },
  { id: 'touch', label: 'Touch', filter: (x: (typeof CURSORS)[number]) => x.group === 'Touch' },
  { id: 'tools', label: 'Tools', filter: (x: (typeof CURSORS)[number]) => x.group === 'Special' }
]

const COLOR_THEMES = [
  { id: 'light', label: 'Light', fill: '#ffffff', outline: '#000000' },
  { id: 'dark', label: 'Dark', fill: '#000000', outline: '#ffffff' },
  { id: 'blue', label: 'Blue', fill: '#0a84ff', outline: '#ffffff' },
  { id: 'purple', label: 'Purple', fill: '#6c63ff', outline: '#ffffff' },
  { id: 'orange', label: 'Orange', fill: '#ff9f0a', outline: '#ffffff' },
  { id: 'green', label: 'Green', fill: '#30d158', outline: '#ffffff' }
]

const QUICK_SIZES = [
  { val: 1.0, scale: '1.0x', label: 'Normal' },
  { val: 1.5, scale: '1.5x', label: 'Medium' },
  { val: 2.0, scale: '2.0x', label: 'Large' },
  { val: 2.8, scale: '2.8x', label: 'Hero' }
]

const EFFECTS: { id: ClickEffect; name: string; tipId: string; svg: ReactNode }[] = [
  {
    id: 'none',
    name: 'None',
    tipId: 'effect-none',
    svg: (
      <>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={1.6} />
        <path d="M6.5 17.5l11-11" stroke="currentColor" strokeWidth={1.6} />
      </>
    )
  },
  {
    id: 'ripple',
    name: 'Ripple',
    tipId: 'effect-ripple',
    svg: (
      <>
        <circle cx="12" cy="12" r="9" fill="#0a84ff33" />
        <circle cx="12" cy="12" r="5" fill="#0a84ff88" />
      </>
    )
  },
  {
    id: 'ring',
    name: 'Ring',
    tipId: 'effect-ring',
    svg: <circle cx="12" cy="12" r="8" fill="none" stroke="#0a84ff" strokeWidth={1.8} />
  },
  {
    id: 'pulse',
    name: 'Pulse',
    tipId: 'effect-pulse',
    svg: (
      <>
        <circle cx="12" cy="12" r="9" fill="none" stroke="#0a84ff" strokeWidth={1.4} />
        <circle cx="12" cy="12" r="4.5" fill="#0a84ff" />
      </>
    )
  }
]

const SWATCHES = ['#000000', '#ffffff', '#0a84ff', '#6c63ff', '#ff453a', '#ff9f0a', '#30d158', '#ff2d92']

export default function CursorPanel() {
  const project = useEditor((s) => s.project)!
  const hasData = useEditor((s) => !!s.cursorData)
  const update = useEditor((s) => s.update)
  const [tab, setTab] = useState<CursorTab>('style')
  const [activeCat, setActiveCat] = useState<string>('all')

  const c = project.edit.cursor
  const d = defaultEdit(0).cursor

  if (!hasData) {
    return (
      <Section title="Cursor">
        <span className="hint">This video was imported, so there's no cursor telemetry. Cursor effects work on recordings captured with Scrim.</span>
      </Section>
    )
  }

  const pick = (id: string) =>
    update((e) => {
      const def = cursorDef(id)
      e.cursor.style = id
      e.cursor.color = def.fill
      e.cursor.outline = def.outline
    })

  const currentDef = CURSORS.find((x) => x.id === c.style) ?? CURSORS[0]
  const catObj = STYLE_CATEGORIES.find((cat) => cat.id === activeCat) ?? STYLE_CATEGORIES[0]
  const filteredCursors = CURSORS.filter(catObj.filter)

  return (
    <CursorTooltipProvider>
      <div className="cursor-panel-container">
        {/* Top Header Card */}
        <div className="cursor-hero-card">
          <div className="cursor-hero-thumb">
            <img src={cursorThumb(c.style, c.color, c.outline)} alt="" />
          </div>
          <div className="cursor-hero-info">
            <span className="cursor-hero-name">{currentDef.name}</span>
            <span className="cursor-hero-group">{currentDef.group} Style</span>
          </div>
          <button
            className="link"
            style={{ fontSize: 11.5 }}
            title="Reset cursor settings to defaults"
            onClick={() => update((e) => (e.cursor = { ...d, hiddenClicks: e.cursor.hiddenClicks }))}
          >
            Reset
          </button>
        </div>

        {/* Master Visibility Switch */}
        <div style={{ marginBottom: 12 }}>
          <Toggle label="Show cursor in video" value={c.show} onChange={(v) => update((e) => (e.cursor.show = v))} />
        </div>

        {/* Top Navigation Tabs */}
        <div className="cursor-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`cursor-tab-btn ${tab === t.id ? 'on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={13} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ opacity: c.show ? 1 : 0.35, pointerEvents: c.show ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
          {/* TAB 1: STYLE */}
          {tab === 'style' && (
            <div className="fade-in">
              {/* Organized Category Pills */}
              <div className="cursor-cat-chips">
                {STYLE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    className={`cursor-cat-chip ${activeCat === cat.id ? 'on' : ''}`}
                    onClick={() => setActiveCat(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Organized Cursor Gallery */}
              <div className="cursor-grid" style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 2, marginBottom: 14 }}>
                {filteredCursors.map((x) => (
                  <button
                    key={x.id}
                    className={`pick-tile ${c.style === x.id ? 'on' : ''}`}
                    onClick={() => pick(x.id)}
                    title={x.name}
                  >
                    <img
                      src={cursorThumb(x.id, c.style === x.id ? c.color : undefined, c.style === x.id ? c.outline : undefined)}
                      width={38}
                      height={38}
                      alt=""
                    />
                    <span>{x.name}</span>
                  </button>
                ))}
              </div>

              {/* 1-Click Color Themes */}
              <Section title="Color Themes">
                <div className="cursor-theme-row">
                  {COLOR_THEMES.map((th) => {
                    const isSelected = c.color.toLowerCase() === th.fill.toLowerCase() && c.outline.toLowerCase() === th.outline.toLowerCase()
                    return (
                      <button
                        key={th.id}
                        className={`cursor-theme-btn ${isSelected ? 'on' : ''}`}
                        title={`${th.label} theme`}
                        onClick={() =>
                          update((e) => {
                            e.cursor.color = th.fill
                            e.cursor.outline = th.outline
                          })
                        }
                      >
                        <div
                          className="cursor-theme-swatch"
                          style={{
                            background: th.fill,
                            border: `2px solid ${th.outline}`
                          }}
                        />
                        <span>{th.label}</span>
                      </button>
                    )
                  })}
                </div>

                <ColorRow label="Fill color" value={c.color} onChange={(v) => update((e) => (e.cursor.color = v), 'ccolor')} />
                <div className="swatch-row" style={{ marginTop: 6, marginBottom: 8 }}>
                  {SWATCHES.map((col) => (
                    <button
                      key={col}
                      className={`swatch ${c.color === col ? 'on' : ''}`}
                      style={{ background: col }}
                      onClick={() => update((e) => (e.cursor.color = col))}
                    />
                  ))}
                </div>

                <ColorRow label="Outline color" value={c.outline} onChange={(v) => update((e) => (e.cursor.outline = v), 'coutline')} />
                <Slider
                  label="Outline width"
                  value={c.outlineWidth}
                  min={0}
                  max={3}
                  step={0.05}
                  def={1}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) => update((e) => (e.cursor.outlineWidth = v), 'cow')}
                />
              </Section>

              {/* Size & Depth with Quick Scales */}
              <Section title="Size & Depth">
                <div className="cursor-size-pills">
                  {QUICK_SIZES.map((qs) => (
                    <button
                      key={qs.val}
                      type="button"
                      className={`cursor-size-pill ${Math.abs(c.size - qs.val) < 0.08 ? 'on' : ''}`}
                      onClick={() => update((e) => (e.cursor.size = qs.val), 'csize')}
                    >
                      <span className="cursor-size-val">{qs.scale}</span>
                      <span className="cursor-size-lbl">{qs.label}</span>
                    </button>
                  ))}
                </div>

                <Slider
                  label="Size"
                  action={<TooltipIcon tipId="cursorSize" />}
                  value={c.size}
                  min={0.5}
                  max={5}
                  step={0.05}
                  def={d.size}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) => update((e) => (e.cursor.size = v), 'csize')}
                />

                <Slider
                  label="Drop shadow"
                  action={<TooltipIcon tipId="cursorShadow" />}
                  value={c.shadow}
                  min={0}
                  max={1}
                  step={0.01}
                  def={d.shadow}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update((e) => (e.cursor.shadow = v), 'cshadow')}
                />

                <Slider
                  label="Opacity"
                  value={c.opacity}
                  min={0.1}
                  max={1}
                  step={0.01}
                  def={1}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update((e) => (e.cursor.opacity = v), 'copacity')}
                />
              </Section>
            </div>
          )}

          {/* TAB 2: MOTION */}
          {tab === 'motion' && (
            <div className="fade-in">
              <Section
                title="Motion Engine"
                onReset={() =>
                  update((e) => {
                    e.cursor.smoothing = d.smoothing
                    e.cursor.motionMode = d.motionMode
                    e.cursor.curvature = d.curvature
                    e.cursor.clickDwell = d.clickDwell
                    e.cursor.sway = d.sway
                    e.cursor.hideIdle = d.hideIdle
                  })
                }
              >
                {/* Motion mode pills with dedicated info icon */}
                <div className="motion-mode-grid">
                  <button
                    className={`mode-tile ${c.motionMode === 'cinematic' || !c.motionMode ? 'on' : ''}`}
                    onClick={() => update((e) => (e.cursor.motionMode = 'cinematic'))}
                  >
                    <span className="mode-tile-label">Cinematic</span>
                    <TooltipIcon tipId="mode-cinematic" />
                  </button>

                  <button
                    className={`mode-tile ${c.motionMode === 'natural' ? 'on' : ''}`}
                    onClick={() => update((e) => (e.cursor.motionMode = 'natural'))}
                  >
                    <span className="mode-tile-label">Natural</span>
                    <TooltipIcon tipId="mode-natural" />
                  </button>

                  <button
                    className={`mode-tile ${c.motionMode === 'raw' ? 'on' : ''}`}
                    onClick={() => update((e) => (e.cursor.motionMode = 'raw'))}
                  >
                    <span className="mode-tile-label">Direct</span>
                    <TooltipIcon tipId="mode-raw" />
                  </button>
                </div>

                <Slider
                  label="Smoothing"
                  action={<TooltipIcon tipId="smoothing" />}
                  value={c.smoothing}
                  min={0}
                  max={1}
                  step={0.01}
                  def={d.smoothing}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => update((e) => (e.cursor.smoothing = v), 'csmooth')}
                />

                {(c.motionMode ?? 'cinematic') === 'cinematic' && (
                  <>
                    <Slider
                      label="Curvature"
                      action={<TooltipIcon tipId="curvature" />}
                      value={c.curvature ?? 0.5}
                      min={0}
                      max={1}
                      step={0.05}
                      def={d.curvature ?? 0.5}
                      format={(v) => (v < 0.05 ? 'Straight' : v > 0.95 ? 'Sweeping' : `${Math.round(v * 100)}%`)}
                      onChange={(v) => update((e) => (e.cursor.curvature = v), 'ccurv')}
                    />

                    <Slider
                      label="Click dwell pause"
                      action={<TooltipIcon tipId="clickDwell" />}
                      value={c.clickDwell ?? 0.12}
                      min={0}
                      max={0.3}
                      step={0.02}
                      def={d.clickDwell ?? 0.12}
                      format={(v) => (v === 0 ? 'None' : `${Math.round(v * 1000)} ms`)}
                      onChange={(v) => update((e) => (e.cursor.clickDwell = v), 'cdwell')}
                    />
                  </>
                )}

                <Slider
                  label="Sway"
                  action={<TooltipIcon tipId="sway" />}
                  value={c.sway}
                  min={0}
                  max={0.3}
                  step={0.01}
                  def={d.sway}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) => update((e) => (e.cursor.sway = v), 'csway')}
                />

                <Toggle
                  label="Hide when not moving"
                  action={<TooltipIcon tipId="hideIdle" />}
                  value={c.hideIdle}
                  onChange={(v) => update((e) => (e.cursor.hideIdle = v))}
                />
              </Section>
            </div>
          )}

          {/* TAB 3: SPOTLIGHT */}
          {tab === 'spotlight' && (
            <div className="fade-in">
              <Section
                title="Spotlight"
                onReset={() =>
                  update((e) => {
                    for (const k of [
                      'highlightMode',
                      'highlightColor',
                      'highlightSize',
                      'highlightOpacity',
                      'highlightSoftness',
                      'highlightDim',
                      'highlightDimColor',
                      'highlightRing',
                      'highlightWhen'
                    ] as const)
                      (e.cursor as unknown as Record<string, unknown>)[k] = d[k]
                  })
                }
              >
                <Toggle
                  label="Spotlight around cursor"
                  value={c.highlight}
                  onChange={(v) => update((e) => (e.cursor.highlight = v))}
                />

                {c.highlight && (
                  <div style={{ marginTop: 10 }}>
                    {/* Spotlight Mode Tabs with Tooltip Icon */}
                    <div className="motion-mode-grid">
                      <button
                        className={`mode-tile ${c.highlightMode === 'glow' ? 'on' : ''}`}
                        onClick={() => update((e) => (e.cursor.highlightMode = 'glow'))}
                      >
                        <span className="mode-tile-label">Glow</span>
                        <TooltipIcon tipId="spotlight-glow" />
                      </button>

                      <button
                        className={`mode-tile ${c.highlightMode === 'dim' ? 'on' : ''}`}
                        onClick={() => update((e) => (e.cursor.highlightMode = 'dim'))}
                      >
                        <span className="mode-tile-label">Dim rest</span>
                        <TooltipIcon tipId="spotlight-dim" />
                      </button>

                      <button
                        className={`mode-tile ${c.highlightMode === 'ring' ? 'on' : ''}`}
                        onClick={() => update((e) => (e.cursor.highlightMode = 'ring'))}
                      >
                        <span className="mode-tile-label">Ring</span>
                        <TooltipIcon tipId="spotlight-ring" />
                      </button>
                    </div>

                    <span className="section-title" style={{ marginTop: 8, marginBottom: 4, display: 'block' }}>
                      Trigger When
                    </span>
                    <Seg
                      options={[
                        { v: 'always', l: 'Always' },
                        { v: 'moving', l: 'Moving' },
                        { v: 'clicks', l: 'Clicks' }
                      ]}
                      value={c.highlightWhen}
                      onChange={(v) => update((e) => (e.cursor.highlightWhen = v as SpotlightWhen))}
                    />

                    {c.highlightMode === 'dim' ? (
                      <>
                        <ColorRow
                          label="Shade color"
                          value={c.highlightDimColor}
                          onChange={(v) => update((e) => (e.cursor.highlightDimColor = v), 'hdc')}
                        />
                        <Slider
                          label="Darkness"
                          value={c.highlightDim}
                          min={0.05}
                          max={0.9}
                          step={0.01}
                          def={d.highlightDim}
                          format={(v) => `${Math.round(v * 100)}%`}
                          onChange={(v) => update((e) => (e.cursor.highlightDim = v), 'hdim')}
                        />
                      </>
                    ) : (
                      <>
                        <ColorRow
                          label="Color"
                          value={c.highlightColor}
                          onChange={(v) => update((e) => (e.cursor.highlightColor = v), 'hcolor')}
                        />
                        <div className="swatch-row" style={{ marginTop: 6, marginBottom: 6 }}>
                          {['#ffe678', '#ffffff', '#0a84ff', '#ff453a', '#30d158', '#bf5af2'].map((col) => (
                            <button
                              key={col}
                              className={`swatch ${c.highlightColor === col ? 'on' : ''}`}
                              style={{ background: col }}
                              onClick={() => update((e) => (e.cursor.highlightColor = col))}
                            />
                          ))}
                        </div>
                        <Slider
                          label="Strength"
                          value={c.highlightOpacity}
                          min={0.05}
                          max={1}
                          step={0.01}
                          def={d.highlightOpacity}
                          format={(v) => `${Math.round(v * 100)}%`}
                          onChange={(v) => update((e) => (e.cursor.highlightOpacity = v), 'hop')}
                        />
                      </>
                    )}

                    <Slider
                      label="Size"
                      value={c.highlightSize}
                      min={0.3}
                      max={4}
                      step={0.05}
                      def={d.highlightSize}
                      format={(v) => `${v.toFixed(2)}x`}
                      onChange={(v) => update((e) => (e.cursor.highlightSize = v), 'hsize')}
                    />

                    <Slider
                      label="Edge softness"
                      value={c.highlightSoftness}
                      min={0}
                      max={1}
                      step={0.01}
                      def={d.highlightSoftness}
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) => update((e) => (e.cursor.highlightSoftness = v), 'hsoft')}
                    />

                    {c.highlightMode === 'ring' && (
                      <Slider
                        label="Ring thickness"
                        value={c.highlightRing}
                        min={0.3}
                        max={4}
                        step={0.05}
                        def={d.highlightRing}
                        format={(v) => `${v.toFixed(2)}x`}
                        onChange={(v) => update((e) => (e.cursor.highlightRing = v), 'hring')}
                      />
                    )}
                  </div>
                )}
              </Section>
            </div>
          )}

          {/* TAB 4: CLICKS & SOUND */}
          {tab === 'clicks' && (
            <div className="fade-in">
              <Section title="Click Animation">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
                  {EFFECTS.map((s) => (
                    <button
                      key={s.id}
                      className={`pick-tile ${c.clickEffect === s.id ? 'on' : ''}`}
                      style={{ width: '100%', padding: '8px 4px 6px' }}
                      onClick={() => update((e) => (e.cursor.clickEffect = s.id))}
                    >
                      <div className="pick-tile-top">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                          {s.svg}
                        </svg>
                        <TooltipIcon tipId={s.tipId} />
                      </div>
                      <span>{s.name}</span>
                    </button>
                  ))}
                </div>

                {c.clickEffect !== 'none' && (
                  <ColorRow
                    label="Effect color"
                    value={c.clickColor}
                    onChange={(v) => update((e) => (e.cursor.clickColor = v), 'cclr')}
                  />
                )}

                <Slider
                  label="Click bounce"
                  action={<TooltipIcon tipId="clickBounce" />}
                  value={c.clickBounce}
                  min={1}
                  max={3}
                  step={0.05}
                  def={d.clickBounce}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) => update((e) => (e.cursor.clickBounce = v), 'cbounce')}
                />

                {c.clickBounce > 1 && (
                  <Slider
                    label="Bounce speed"
                    value={c.bounceMs}
                    min={100}
                    max={800}
                    step={10}
                    def={d.bounceMs}
                    format={(v) => `${Math.round(v)} ms`}
                    onChange={(v) => update((e) => (e.cursor.bounceMs = v), 'cbms')}
                  />
                )}
              </Section>

              <Section title="Click Audio" action={<TooltipIcon tipId="clickSound" />}>
                <Toggle
                  label="Play sound on click"
                  value={c.clickSound !== 'none'}
                  onChange={(v) => {
                    const pick = v ? lastSound || 'mouse' : 'none'
                    if (v) playClick(pick as ClickSound, c.clickVolume)
                    update((e) => (e.cursor.clickSound = pick as ClickSound))
                  }}
                />

                {c.clickSound !== 'none' && (
                  <div style={{ marginTop: 10 }}>
                    <div className="sound-grid">
                      {CLICK_SOUNDS.map((snd) => (
                        <button
                          key={snd.id}
                          className={`sound-tile ${c.clickSound === snd.id ? 'on' : ''}`}
                          title={`${snd.hint}. Click to preview.`}
                          onClick={() => {
                            lastSound = snd.id
                            playClick(snd.id, c.clickVolume || 0.6)
                            update((e) => (e.cursor.clickSound = snd.id))
                          }}
                        >
                          <span className="sound-ico">
                            <Icon name="volume" size={13} />
                          </span>
                          <b>{snd.name}</b>
                        </button>
                      ))}
                    </div>

                    <Slider
                      label="Click volume"
                      value={c.clickVolume}
                      min={0.05}
                      max={1}
                      step={0.05}
                      def={0.6}
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) => update((e) => (e.cursor.clickVolume = v), 'cvol')}
                    />
                  </div>
                )}
              </Section>
            </div>
          )}
        </div>

        {/* Minimalist keyboard shortcut banner */}
        <div className="cursor-keys-banner">
          <span>Need keyboard keystroke overlays?</span>
          <button className="link" onClick={() => useEditor.getState().setPanel('keys')}>
            Open Keys panel →
          </button>
        </div>
      </div>
    </CursorTooltipProvider>
  )
}
