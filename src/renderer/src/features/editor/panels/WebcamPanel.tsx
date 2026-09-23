import { useEditor } from '../state/store'
import { ColorRow, Section, Seg, Slider, Toggle } from '@/ui'
import { defaultEdit } from '@shared/defaults'
import type { WebcamShape } from '@shared/types'

export default function WebcamPanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const w = project.edit.webcam
  const d = defaultEdit(0).webcam

  if (!project.media.webcam) {
    return (
      <Section title="Webcam">
        <span className="hint">This recording has no webcam. Turn on "Record webcam" on the Record screen before your next recording.</span>
      </Section>
    )
  }
  const set = (fn: (x: typeof w) => void, key?: string) => update((e) => fn(e.webcam), key)
  const place = (x: number, y: number) => set((c) => { c.x = x; c.y = y })
  const mx = 0.05 + w.size / 2 / 1.78
  const my = 0.07 + w.size / 2

  return (
    <div>
      <Section title="Webcam" onReset={() => update((e) => (e.webcam = { ...d, show: e.webcam.show }))}>
        <Toggle label="Show webcam" value={w.show} onChange={(v) => set((c) => (c.show = v))} />
        <Seg options={[{ v: 'circle', l: 'Circle' }, { v: 'rounded', l: 'Rounded' }, { v: 'square', l: 'Square' }]} value={w.shape} onChange={(v) => set((c) => (c.shape = v as WebcamShape))} />
        <Slider label="Size" value={w.size} min={0.08} max={0.6} step={0.01} def={d.size} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((c) => (c.size = v), 'wsize')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button className="btn sm" onClick={() => place(mx, my)}>Top left</button>
          <button className="btn sm" onClick={() => place(1 - mx, my)}>Top right</button>
          <button className="btn sm" onClick={() => place(mx, 1 - my)}>Bottom left</button>
          <button className="btn sm" onClick={() => place(1 - mx, 1 - my)}>Bottom right</button>
        </div>
        <span className="hint">Drag the camera on the preview to put it anywhere, and drag its white corner to resize.</span>
      </Section>
      <Section title="Style">
        <Slider label="Border" value={w.border} min={0} max={16} step={0.5} def={d.border} format={(v) => `${v}px`} onChange={(v) => set((c) => (c.border = v), 'wborder')} />
        {w.border > 0 && <ColorRow label="Border color" value={w.borderColor} onChange={(v) => set((c) => (c.borderColor = v), 'wbc')} />}
        <Toggle label="Shadow" value={w.shadow} onChange={(v) => set((c) => (c.shadow = v))} />
        <Toggle label="Mirror" value={w.mirror} onChange={(v) => set((c) => (c.mirror = v))} />
      </Section>
    </div>
  )
}
