import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { Icon, Section, Slider, Toggle, fmtTime } from '@/ui'
import { addZoomAt, regenerateAutoZooms } from '../state/actions'

export default function ZoomPanel() {
  const project = useEditor((s) => s.project)!
  const cursorData = useEditor((s) => s.cursorData)
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const setTime = useEditor((s) => s.setTime)
  const z = project.edit.zoom
  const sel = selection?.kind === 'zoom' ? z.segments.find((s) => s.id === selection.id) : undefined
  const autos = z.segments.filter((s) => s.auto)
  const manual = z.segments.filter((s) => !s.auto)

  const setSel = (fn: (s: (typeof z.segments)[number]) => void, key?: string) =>
    update((e) => {
      const s = e.zoom.segments.find((x) => x.id === sel!.id)
      if (s) fn(s)
    }, key)

  return (
    <div>
      <Section title="Zoom">
        <Toggle label="Zoom effects" value={z.enabled} onChange={(v) => update((e) => (e.zoom.enabled = v))} />
        <Slider label="Master zoom" value={z.master} min={0.3} max={2} step={0.05} def={1} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.zoom.master = v), 'zmaster')} />
        <Slider label="Transition speed" value={z.ease} min={0.2} max={1.5} step={0.05} def={0.6} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => update((e) => (e.zoom.ease = v), 'zease')} />
      </Section>

      <Section title="Automatic">
        {cursorData ? (
          <>
            <Toggle
              label="Zoom in on clicks"
              value={z.auto}
              onChange={(v) => {
                update((e) => (e.zoom.auto = v))
                regenerateAutoZooms()
              }}
            />
            <Slider
              label="Auto zoom depth"
              value={z.autoScale}
              min={1.1}
              max={3.5}
              step={0.05}
              def={1.6}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={(v) =>
                update((e) => {
                  e.zoom.autoScale = v
                  for (const s of e.zoom.segments) if (s.auto) s.scale = v
                }, 'zautoscale')
              }
            />
            <button className="btn" onClick={regenerateAutoZooms}><Icon name="wand" size={15} /> Find clicks again</button>
            <span className="hint">
              {autos.length} automatic zoom{autos.length === 1 ? '' : 's'} from {cursorData.clicks.length} click{cursorData.clicks.length === 1 ? '' : 's'}. They follow your cursor. Editing one turns it into a manual zoom.
            </span>
          </>
        ) : (
          <span className="hint">Automatic zooms need cursor data, which only videos recorded in Scrim have.</span>
        )}
      </Section>

      <Section title="Manual">
        <button className="btn" onClick={() => addZoomAt(timeBus.get())}><Icon name="plus" size={15} /> Add zoom at playhead</button>
        <span className="hint">Or click anywhere on the Zoom track. Pick a zoom, then click the preview to pin exactly where it points.</span>
        {manual.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {manual.slice().sort((a, b) => a.start - b.start).map((s) => (
              <button key={s.id} className="chip" style={{ cursor: 'pointer', borderColor: sel?.id === s.id ? 'var(--accent)' : undefined, color: sel?.id === s.id ? 'var(--text)' : undefined }} onClick={() => { select({ kind: 'zoom', id: s.id }); setTime(s.start + 0.01) }}>
                {fmtTime(s.start)} · {s.scale.toFixed(1)}x
              </button>
            ))}
          </div>
        )}
      </Section>

      {sel && (
        <Section title={sel.auto ? 'Selected zoom (automatic)' : 'Selected zoom'} action={<button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((e) => (e.zoom.segments = e.zoom.segments.filter((s) => s.id !== sel.id))); select(null) }}>Delete</button>}>
          <Slider label="Zoom amount" value={sel.scale} min={1.1} max={4} step={0.05} def={1.6} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => setSel((s) => { s.scale = v; s.auto = false }, 'zscale' + sel.id)} />
          <div className="seg">
            <button className={sel.follow ? 'on' : ''} onClick={() => setSel((s) => { s.follow = true; s.auto = false })}><Icon name="cursor" size={14} /> Follow cursor</button>
            <button className={!sel.follow ? 'on' : ''} onClick={() => setSel((s) => { s.follow = false; s.auto = false })}><Icon name="pin" size={14} /> Pin a spot</button>
          </div>
          {!sel.follow && <span className="hint">Click or drag on the preview to choose the spot. A blue pin shows where it points.</span>}
          <div className="chip">{fmtTime(sel.start, true)} to {fmtTime(sel.end, true)}</div>
        </Section>
      )}
    </div>
  )
}
