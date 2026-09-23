import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { ColorRow, Icon, Section, Seg, Slider, fmtTime } from '@/ui'
import { addBlurAt, deleteSelection, duplicateSelection } from '../state/actions'
import type { BlurItem, BlurType } from '@shared/types'

const PRESETS: { name: string; p: Partial<BlurItem> }[] = [
  { name: 'API Key / Token', p: { type: 'blur', w: 0.32, h: 0.08, amount: 0.7, darken: 0.2, radius: 8 } },
  { name: 'Password Field', p: { type: 'blur', w: 0.26, h: 0.07, amount: 0.85, darken: 0.3, radius: 8 } },
  { name: 'Email Address', p: { type: 'pixelate', w: 0.28, h: 0.07, amount: 0.65, darken: 0.15, radius: 6 } },
  { name: 'Black Redact Bar', p: { type: 'solid', w: 0.3, h: 0.08, color: '#000000', darken: 1, radius: 4 } },
  { name: 'Avatar / Face', p: { type: 'blur', w: 0.18, h: 0.18, amount: 0.75, darken: 0.1, radius: 24 } }
]

export default function BlurPanel() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const setTime = useEditor((s) => s.setTime)
  const blurs = project.edit.blurs ?? []
  const duration = project.media.screen.duration
  const sel = selection?.kind === 'blur' ? blurs.find((b) => b.id === selection.id) : undefined

  const add = (patch?: Partial<BlurItem>) => {
    const t = Math.max(0, Math.min(duration - 0.5, timeBus.get()))
    const id = addBlurAt(t)
    if (id && patch) {
      update((e) => {
        const item = e.blurs.find((x) => x.id === id)
        if (item) Object.assign(item, patch)
      })
    }
  }

  const set = (fn: (b: BlurItem) => void, key?: string) => {
    if (!sel) return
    update((e) => {
      const b = e.blurs.find((x) => x.id === sel.id)
      if (b) fn(b)
    }, key ? key + sel.id : undefined)
  }

  const jumpTo = (b: BlurItem) => {
    select({ kind: 'blur', id: b.id })
    setTime(b.start)
    timeBus.emit(b.start)
  }

  return (
    <div className="section" style={{ gap: 16 }}>
      <button className="btn primary block" onClick={() => add()} style={{ height: 38, gap: 8 }}>
        <Icon name="plus" size={16} /> Add blur at playhead
      </button>

      {sel ? (
        <>
          <Section title="Redaction style">
            <Seg
              value={sel.type}
              options={[
                { v: 'blur', l: 'Blur' },
                { v: 'pixelate', l: 'Pixelate' },
                { v: 'solid', l: 'Solid bar' }
              ]}
              onChange={(v) => set((b) => (b.type = v as BlurType))}
            />

            {sel.type !== 'solid' && (
              <>
                <Slider
                  label={sel.type === 'blur' ? 'Blur strength' : 'Pixel block size'}
                  value={sel.amount ?? 0.6}
                  min={0.1}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => set((b) => (b.amount = v), 'bamt')}
                />
                <Slider
                  label="Darken shield"
                  value={sel.darken ?? 0.15}
                  min={0}
                  max={0.8}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => set((b) => (b.darken = v), 'bdark')}
                />
              </>
            )}

            {sel.type === 'solid' && (
              <ColorRow
                label="Bar color"
                value={sel.color || '#000000'}
                onChange={(c) => set((b) => (b.color = c))}
              />
            )}

            <Slider
              label="Corner radius"
              value={sel.radius ?? 8}
              min={0}
              max={30}
              step={1}
              format={(v) => `${v}px`}
              onChange={(v) => set((b) => (b.radius = v), 'brad')}
            />
          </Section>

          <Section title="Quick presets">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  className="btn ghost sm"
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: 12 }}
                  onClick={() => set((b) => Object.assign(b, p.p))}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Dimensions & position">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Slider
                label="Width"
                value={sel.w}
                min={0.04}
                max={0.9}
                step={0.02}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set((b) => (b.w = v), 'bw')}
              />
              <Slider
                label="Height"
                value={sel.h}
                min={0.02}
                max={0.8}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set((b) => (b.h = v), 'bh')}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Slider
                label="Position X"
                value={sel.x}
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set((b) => (b.x = v), 'bx')}
              />
              <Slider
                label="Position Y"
                value={sel.y}
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set((b) => (b.y = v), 'by')}
              />
            </div>
          </Section>

          <Section title="Timing">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="hint">
                {fmtTime(sel.start)} – {fmtTime(sel.end)} ({fmtTime(sel.end - sel.start)})
              </span>
              <button className="btn sm ghost" onClick={() => jumpTo(sel)}>
                Go to blur
              </button>
            </div>
          </Section>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn sm ghost" style={{ flex: 1 }} onClick={duplicateSelection}>
              <Icon name="copy" size={14} /> Duplicate
            </button>
            <button className="btn sm danger" style={{ flex: 1 }} onClick={deleteSelection}>
              <Icon name="trash" size={14} /> Delete
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="glass" style={{ padding: 14, borderRadius: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Sensitive data protection</span>
            <div className="hint" style={{ marginTop: 6, lineHeight: 1.5 }}>
              Blur or pixelate passwords, API keys, emails and sensitive information. The box locks to your screen content and zooms with the camera.
            </div>
          </div>

          {blurs.length > 0 && (
            <Section title={`Blur regions (${blurs.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {blurs.map((b, i) => (
                  <div
                    key={b.id}
                    className="glass"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 10,
                      cursor: 'pointer'
                    }}
                    onClick={() => jumpTo(b)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge" style={{ textTransform: 'capitalize' }}>{b.type}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Region #{i + 1}</span>
                      <span className="hint" style={{ fontSize: 11 }}>{fmtTime(b.start)} – {fmtTime(b.end)}</span>
                    </div>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        update((ed) => (ed.blurs = ed.blurs.filter((x) => x.id !== b.id)))
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
