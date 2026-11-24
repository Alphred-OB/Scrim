import { useEffect, useState } from 'react'
import type { KeyframeEase, ZoomKeyframe } from '@shared/types'
import { newZoomKeyframe } from '@shared/defaults'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { Icon, Section, Select, Slider, Toggle, fmtTime } from '@/ui'
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

  const [curTime, setCurTime] = useState(() => timeBus.get())
  useEffect(() => {
    return timeBus.on((t: number) => setCurTime(t))
  }, [])

  const setSel = (fn: (s: (typeof z.segments)[number]) => void, key?: string) =>
    update((e) => {
      const s = e.zoom.segments.find((x) => x.id === sel!.id)
      if (s) fn(s)
    }, key)

  const keyframes = (sel?.keyframes ?? []).slice().sort((a, b) => a.t - b.t)
  const activeKf = keyframes.find((k) => Math.abs(k.t - curTime) <= 0.15)
  const prevKf = [...keyframes].reverse().find((k) => k.t < curTime - 0.05)
  const nextKf = keyframes.find((k) => k.t > curTime + 0.05)

  const addOrUpdateKf = () => {
    if (!sel) return
    const t = Math.min(sel.end, Math.max(sel.start, curTime))
    setSel((s) => {
      s.auto = false
      if (!s.keyframes) s.keyframes = []
      const existing = s.keyframes.find((k) => Math.abs(k.t - t) <= 0.15)
      if (existing) {
        existing.scale = s.scale
        existing.x = s.x
        existing.y = s.y
      } else {
        s.keyframes.push(newZoomKeyframe(t, s.scale, s.x, s.y, 'smooth'))
        s.keyframes.sort((a, b) => a.t - b.t)
      }
    }, 'addkf')
  }

  const deleteKf = (kfId: string) => {
    setSel((s) => {
      if (s.keyframes) {
        s.keyframes = s.keyframes.filter((k) => k.id !== kfId)
      }
    }, 'delkf')
  }

  const updateActiveKf = (patch: Partial<ZoomKeyframe>, key?: string) => {
    if (!activeKf) return
    setSel((s) => {
      const target = s.keyframes?.find((k) => k.id === activeKf.id)
      if (target) {
        Object.assign(target, patch)
        if (patch.scale !== undefined) s.scale = patch.scale
        if (patch.x !== undefined) s.x = patch.x
        if (patch.y !== undefined) s.y = patch.y
      }
    }, key)
  }

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
        <button className="btn primary" onClick={() => useEditor.getState().setAreaMode(true)}><Icon name="crop" size={15} /> Zoom to an area</button>
        <span className="hint">Drag a box around any part of the screen. The zoom fits that box and stays there instead of following the mouse. With a zoom selected it changes that one; otherwise it adds one at the playhead.</span>
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
        <>
          <Section title={sel.auto ? 'Selected zoom (automatic)' : 'Selected zoom'} action={<button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((e) => (e.zoom.segments = e.zoom.segments.filter((s) => s.id !== sel.id))); select(null) }}>Delete</button>}>
            <Slider label="Base zoom depth" value={sel.scale} min={1.1} max={6} step={0.05} def={1.6} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => setSel((s) => { s.scale = v; s.auto = false }, 'zscale' + sel.id)} />
            <div className="seg">
              <button className={sel.follow ? 'on' : ''} onClick={() => setSel((s) => { s.follow = true; s.auto = false })}><Icon name="cursor" size={14} /> Follow cursor</button>
              <button className={!sel.follow ? 'on' : ''} onClick={() => setSel((s) => { s.follow = false; s.auto = false })}><Icon name="pin" size={14} /> Pin a spot</button>
            </div>
            {!sel.follow && <span className="hint">Click or drag on the preview to choose the spot. A pin shows where it points.</span>}
            <div className="chip">{fmtTime(sel.start, true)} to {fmtTime(sel.end, true)}</div>
          </Section>

          <Section
            title="Camera Keyframes"
            action={
              keyframes.length > 0 ? (
                <button className="link" style={{ color: 'var(--danger)' }} onClick={() => setSel((s) => { s.keyframes = [] })}>Clear All</button>
              ) : undefined
            }
          >
            <span className="hint">
              Animate camera zoom and pan coordinates smoothly across this zoom clip.
            </span>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn primary"
                style={{ flex: 1 }}
                onClick={addOrUpdateKf}
              >
                <Icon name="keyframe" size={14} />
                {activeKf ? `Update Keyframe at ${fmtTime(curTime)}` : `+ Keyframe at ${fmtTime(curTime)}`}
              </button>
              <button
                className="btn"
                style={{ padding: '0 10px' }}
                disabled={!prevKf}
                title="Go to previous keyframe"
                onClick={() => prevKf && setTime(prevKf.t)}
              >
                <Icon name="prev" size={14} />
              </button>
              <button
                className="btn"
                style={{ padding: '0 10px' }}
                disabled={!nextKf}
                title="Go to next keyframe"
                onClick={() => nextKf && setTime(nextKf.t)}
              >
                <Icon name="next" size={14} />
              </button>
            </div>

            {keyframes.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {keyframes.map((k) => (
                  <button
                    key={k.id}
                    className="chip"
                    style={{
                      cursor: 'pointer',
                      borderColor: activeKf?.id === k.id ? 'var(--accent)' : undefined,
                      color: activeKf?.id === k.id ? 'var(--text)' : undefined,
                      fontWeight: activeKf?.id === k.id ? 600 : 400
                    }}
                    onClick={() => setTime(k.t)}
                  >
                    ◆ {fmtTime(k.t)} · {k.scale.toFixed(1)}x
                  </button>
                ))}
              </div>
            ) : (
              <span className="hint">No keyframes on this clip yet. Move the playhead and click "+ Keyframe" to create points.</span>
            )}

            {activeKf && (
              <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="keyframe" size={13} /> Active Keyframe ({fmtTime(activeKf.t, true)})
                  </strong>
                  <button className="link" style={{ color: 'var(--danger)', fontSize: 11 }} onClick={() => deleteKf(activeKf.id)}>
                    Delete
                  </button>
                </div>

                <Slider
                  label="Keyframe Zoom"
                  value={activeKf.scale}
                  min={1.1}
                  max={4}
                  step={0.05}
                  def={1.6}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) => updateActiveKf({ scale: v }, 'kfscale' + activeKf.id)}
                />

                <Slider
                  label="Camera X"
                  value={activeKf.x}
                  min={0}
                  max={1}
                  step={0.01}
                  def={0.5}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateActiveKf({ x: v }, 'kfx' + activeKf.id)}
                />

                <Slider
                  label="Camera Y"
                  value={activeKf.y}
                  min={0}
                  max={1}
                  step={0.01}
                  def={0.5}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateActiveKf({ y: v }, 'kfy' + activeKf.id)}
                />

                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Interpolation Easing</label>
                  <Select<KeyframeEase>
                    value={activeKf.ease ?? 'smooth'}
                    options={[
                      { v: 'smooth', l: 'Smooth (Cubic curve)' },
                      { v: 'linear', l: 'Linear (Constant speed)' },
                      { v: 'snappy', l: 'Snappy (Dynamic whip)' }
                    ]}
                    onChange={(v) => updateActiveKf({ ease: v }, 'kfease' + activeKf.id)}
                  />
                </div>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
