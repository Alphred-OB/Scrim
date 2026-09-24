import type { ReactNode } from 'react'
import type { ClickEffect, ClickSound, SpotlightMode, SpotlightWhen } from '@shared/types'
import { CLICK_SOUNDS } from '@shared/clickSounds'
import { playClick } from '../preview/clickPlayer'
import { defaultEdit } from '@shared/defaults'
import { ColorRow, Icon, Section, Seg, Slider, Toggle } from '@/ui'
import { useEditor } from '../state/store'
import { CURSORS, cursorDef } from '../engine/cursors'
import { cursorThumb } from '../engine/thumbnails'

/** the sound picked before switching sounds off, so turning them back on brings it back */
let lastSound: ClickSound | '' = ''

const EFFECTS: { id: ClickEffect; name: string; svg: ReactNode }[] = [
  { id: 'none', name: 'None', svg: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={1.6} /><path d="M6.5 17.5l11-11" stroke="currentColor" strokeWidth={1.6} /></> },
  { id: 'ripple', name: 'Ripple', svg: <><circle cx="12" cy="12" r="9" fill="#0a84ff33" /><circle cx="12" cy="12" r="5" fill="#0a84ff88" /></> },
  { id: 'ring', name: 'Ring', svg: <circle cx="12" cy="12" r="8" fill="none" stroke="#0a84ff" strokeWidth={1.8} /> },
  { id: 'pulse', name: 'Pulse', svg: <><circle cx="12" cy="12" r="9" fill="none" stroke="#0a84ff" strokeWidth={1.4} /><circle cx="12" cy="12" r="4.5" fill="#0a84ff" /></> }
]

const GROUPS = ['Classic', 'Simple', 'Pointy', 'Touch', 'Special'] as const
const SWATCHES = ['#000000', '#ffffff', '#0a84ff', '#6c63ff', '#ff453a', '#ff9f0a', '#30d158', '#ff2d92']

export default function CursorPanel() {
  const project = useEditor((s) => s.project)!
  const hasData = useEditor((s) => !!s.cursorData)
  const update = useEditor((s) => s.update)
  const c = project.edit.cursor
  const d = defaultEdit(0).cursor

  if (!hasData) {
    return (
      <Section title="Cursor">
        <span className="hint">This video was imported, so there's no cursor data. Cursor effects work on videos recorded with Scrim.</span>
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

  return (
    <div>
      <Section title="Cursor" onReset={() => update((e) => (e.cursor = { ...d, hiddenClicks: e.cursor.hiddenClicks }))}>
        <Toggle label="Show cursor" value={c.show} onChange={(v) => update((e) => (e.cursor.show = v))} />
      </Section>

      <div style={{ opacity: c.show ? 1 : 0.4, pointerEvents: c.show ? 'auto' : 'none' }}>
        {GROUPS.map((g) => (
          <div key={g} style={{ marginTop: 14 }}>
            <div className="hint" style={{ marginBottom: 6, fontWeight: 600 }}>{g}</div>
            <div className="cursor-grid">
              {CURSORS.filter((x) => x.group === g).map((x) => (
                <button key={x.id} className={`pick-tile ${c.style === x.id ? 'on' : ''}`} onClick={() => pick(x.id)} title={x.name}>
                  <img src={cursorThumb(x.id, c.style === x.id ? c.color : undefined, c.style === x.id ? c.outline : undefined)} width={48} height={48} alt="" />
                  <span>{x.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <Section title="Look">
          <ColorRow label="Fill" value={c.color} onChange={(v) => update((e) => (e.cursor.color = v), 'ccolor')} />
          <div className="swatch-row">
            {SWATCHES.map((col) => <button key={col} className={`swatch ${c.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => update((e) => (e.cursor.color = col))} />)}
          </div>
          <ColorRow label="Outline" value={c.outline} onChange={(v) => update((e) => (e.cursor.outline = v), 'coutline')} />
          <Slider label="Outline width" value={c.outlineWidth} min={0} max={3} step={0.05} def={1} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.cursor.outlineWidth = v), 'cow')} />
          <Slider label="Size" value={c.size} min={0.5} max={5} step={0.05} def={d.size} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.cursor.size = v), 'csize')} />
          <Slider label="Shadow" value={c.shadow} min={0} max={1} step={0.01} def={d.shadow} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.cursor.shadow = v), 'cshadow')} />
          <Slider label="Opacity" value={c.opacity} min={0.1} max={1} step={0.01} def={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.cursor.opacity = v), 'copacity')} />
        </Section>

        <Section title="Motion">
          <Slider label="Smoothing" value={c.smoothing} min={0} max={1} step={0.01} def={d.smoothing} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.cursor.smoothing = v), 'csmooth')} />
          <Slider label="Sway" value={c.sway} min={0} max={0.3} step={0.01} def={d.sway} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.cursor.sway = v), 'csway')} />
          <Toggle label="Hide when not moving" value={c.hideIdle} onChange={(v) => update((e) => (e.cursor.hideIdle = v))} />
        </Section>

        <Section
          title="Spotlight"
          onReset={() =>
            update((e) => {
              for (const k of ['highlightMode', 'highlightColor', 'highlightSize', 'highlightOpacity', 'highlightSoftness', 'highlightDim', 'highlightDimColor', 'highlightRing', 'highlightWhen'] as const)
                (e.cursor as unknown as Record<string, unknown>)[k] = d[k]
            })
          }
        >
          <Toggle label="Spotlight around the cursor" value={c.highlight} onChange={(v) => update((e) => (e.cursor.highlight = v))} />
          {c.highlight && (
            <>
              <Seg
                options={[{ v: 'glow', l: 'Glow' }, { v: 'dim', l: 'Dim the rest' }, { v: 'ring', l: 'Ring' }]}
                value={c.highlightMode}
                onChange={(v) => update((e) => (e.cursor.highlightMode = v as SpotlightMode))}
              />
              <span className="hint">
                {c.highlightMode === 'dim' ? 'Darkens everything except the area around the cursor.' : c.highlightMode === 'ring' ? 'Draws a circle that follows the cursor.' : 'A soft light that follows the cursor.'}
              </span>
              <span className="section-title" style={{ marginTop: 4 }}>Show</span>
              <Seg
                options={[{ v: 'always', l: 'Always' }, { v: 'moving', l: 'When moving' }, { v: 'clicks', l: 'On clicks' }]}
                value={c.highlightWhen}
                onChange={(v) => update((e) => (e.cursor.highlightWhen = v as SpotlightWhen))}
              />
              {c.highlightMode === 'dim' ? (
                <>
                  <ColorRow label="Shade color" value={c.highlightDimColor} onChange={(v) => update((e) => (e.cursor.highlightDimColor = v), 'hdc')} />
                  <Slider label="Darkness" value={c.highlightDim} min={0.05} max={0.9} step={0.01} def={d.highlightDim} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.cursor.highlightDim = v), 'hdim')} />
                </>
              ) : (
                <>
                  <ColorRow label="Color" value={c.highlightColor} onChange={(v) => update((e) => (e.cursor.highlightColor = v), 'hcolor')} />
                  <div className="swatch-row">
                    {['#ffe678', '#ffffff', '#0a84ff', '#ff453a', '#30d158', '#bf5af2'].map((col) => (
                      <button key={col} className={`swatch ${c.highlightColor === col ? 'on' : ''}`} style={{ background: col }} onClick={() => update((e) => (e.cursor.highlightColor = col))} />
                    ))}
                  </div>
                  <Slider label="Strength" value={c.highlightOpacity} min={0.05} max={1} step={0.01} def={d.highlightOpacity} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.cursor.highlightOpacity = v), 'hop')} />
                </>
              )}
              <Slider label="Size" value={c.highlightSize} min={0.3} max={4} step={0.05} def={d.highlightSize} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.cursor.highlightSize = v), 'hsize')} />
              <Slider label="Edge softness" value={c.highlightSoftness} min={0} max={1} step={0.01} def={d.highlightSoftness} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.cursor.highlightSoftness = v), 'hsoft')} />
              {c.highlightMode === 'ring' && (
                <Slider label="Ring thickness" value={c.highlightRing} min={0.3} max={4} step={0.05} def={d.highlightRing} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.cursor.highlightRing = v), 'hring')} />
              )}
            </>
          )}
        </Section>

        <Section title="Click effects">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {EFFECTS.map((s) => (
              <button key={s.id} className={`pick-tile ${c.clickEffect === s.id ? 'on' : ''}`} onClick={() => update((e) => (e.cursor.clickEffect = s.id))}>
                <svg width="30" height="30" viewBox="0 0 24 24">{s.svg}</svg>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <ColorRow label="Effect color" value={c.clickColor} onChange={(v) => update((e) => (e.cursor.clickColor = v), 'cclr')} />
          <Slider label="Click bounce" value={c.clickBounce} min={1} max={3} step={0.05} def={d.clickBounce} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.cursor.clickBounce = v), 'cbounce')} />
          <Slider label="Bounce speed" value={c.bounceMs} min={100} max={800} step={10} def={d.bounceMs} format={(v) => `${Math.round(v)} ms`} onChange={(v) => update((e) => (e.cursor.bounceMs = v), 'cbms')} />
        </Section>

        <Section title="Click sound">
          <Toggle
            label="Play a sound on every click"
            value={c.clickSound !== 'none'}
            onChange={(v) => {
              const pick = v ? lastSound || 'mouse' : 'none'
              if (v) playClick(pick as ClickSound, c.clickVolume)
              update((e) => (e.cursor.clickSound = pick as ClickSound))
            }}
          />
          <div className={`sound-grid ${c.clickSound === 'none' ? 'off' : ''}`}>
            {CLICK_SOUNDS.map((snd) => (
              <button
                key={snd.id}
                className={`sound-tile ${c.clickSound === snd.id ? 'on' : ''}`}
                title={`${snd.hint}. Click to hear it.`}
                onClick={() => {
                  lastSound = snd.id
                  playClick(snd.id, c.clickVolume || 0.6)
                  update((e) => (e.cursor.clickSound = snd.id))
                }}
              >
                <span className="sound-ico"><Icon name="volume" size={14} /></span>
                <b>{snd.name}</b>
              </button>
            ))}
          </div>
          {c.clickSound !== 'none' && (
            <Slider label="Click volume" value={c.clickVolume} min={0.05} max={1} step={0.05} def={0.6} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.cursor.clickVolume = v), 'cvol')} />
          )}
          <span className="hint">Plays in the preview and goes into the export. Clicks cut out of the video stay silent.</span>
        </Section>

        <Section title="Keyboard shortcuts">
          <button className="btn" onClick={() => useEditor.getState().setPanel('keys')}><Icon name="keyboard" size={15} /> Open the Keys page</button>
        </Section>
      </div>
    </div>
  )
}
