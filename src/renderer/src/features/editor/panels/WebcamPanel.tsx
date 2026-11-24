import { useEditor } from '../state/store'
import { ColorRow, Section, Seg, Slider, Toggle } from '@/ui'
import { defaultEdit } from '@shared/defaults'
import type { WebcamBg, WebcamShape } from '@shared/types'
import { api } from '@/lib/api'
import { useEffect, useState } from 'react'
import { loadSegmenter, segmenterFailed } from '../engine/webcamBg'

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
  const [, tick] = useState(0)
  useEffect(() => {
    if (w.bg !== 'none') loadSegmenter().then(() => tick((n) => n + 1))
  }, [w.bg])
  const pickPicture = async () => {
    const file = await api.openFile('Pick a background picture', [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }])
    if (!file) return
    const copied = await api.copyAsset(project.dir, file)
    set((c) => { c.bg = 'image'; c.bgImage = copied })
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
      <Section title="Background">
        <Seg
          options={[{ v: 'none', l: 'Off' }, { v: 'remove', l: 'Remove' }, { v: 'blur', l: 'Blur' }, { v: 'color', l: 'Color' }, { v: 'image', l: 'Picture' }]}
          value={w.bg}
          onChange={(v) => set((c) => (c.bg = v as WebcamBg))}
        />
        {w.bg === 'blur' && <Slider label="Blur" value={w.bgBlur} min={0} max={1} step={0.05} def={d.bgBlur} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((c) => (c.bgBlur = v), 'wbgblur')} />}
        {(w.bg === 'color' || (w.bg === 'image' && !w.bgImage)) && <ColorRow label="Color" value={w.bgColor} onChange={(v) => set((c) => (c.bgColor = v), 'wbgc')} />}
        {w.bg === 'image' && <button className="btn sm" onClick={pickPicture}>{w.bgImage ? 'Change picture…' : 'Choose a picture…'}</button>}
        {w.bg !== 'none' && segmenterFailed() && <span className="hint">The cutout could not start on this PC, so the camera is shown as it is.</span>}
        <span className="hint">
          {w.bg === 'remove' ? 'Only you show, with no frame, right over your screen.' : 'Finds you in the picture and changes what is behind you. It runs on this PC and also applies when you export (exports with it take a bit longer).'}
        </span>
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
