import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { ColorRow, Icon, Section, Seg, Slider, Toggle, fmtTime, Select } from '@/ui'
import { FONTS, newText, uid } from '@shared/defaults'
import type { TextAnim, TextItem } from '@shared/types'

const STYLE_PRESETS: { name: string; p: Partial<TextItem> }[] = [
  { name: 'Caption', p: { font: 'Inter', size: 54, bold: true, color: '#ffffff', bg: '#0b0d12', bgOpacity: 0.75, radius: 14, padding: 18, shadow: false } },
  { name: 'Title', p: { font: 'Poppins', size: 96, bold: true, color: '#ffffff', bg: '', shadow: true, letterSpacing: -1 } },
  { name: 'Label', p: { font: 'Inter', size: 40, bold: true, color: '#0b0c0f', bg: '#ffffff', bgOpacity: 1, radius: 99, padding: 16, shadow: false } },
  { name: 'Accent', p: { font: 'Montserrat', size: 60, bold: true, color: '#ffffff', bg: '#2f6bff', bgOpacity: 1, radius: 12, padding: 20, shadow: false } },
  { name: 'Poster', p: { font: 'Bebas Neue', size: 130, bold: false, color: '#ffffff', bg: '', shadow: true, letterSpacing: 2 } },
  { name: 'Code', p: { font: 'JetBrains Mono', size: 44, bold: false, color: '#a7f3d0', bg: '#0b0c0f', bgOpacity: 0.9, radius: 10, padding: 16, shadow: false } }
]

export default function TextPanel() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const setTime = useEditor((s) => s.setTime)
  const texts = project.edit.texts
  const duration = project.media.screen.duration
  const sel = selection?.kind === 'text' ? texts.find((t) => t.id === selection.id) : undefined

  const add = () => {
    const t = timeBus.get()
    const tx = newText(t)
    tx.end = Math.min(duration, t + 3)
    update((e) => e.texts.push(tx))
    select({ kind: 'text', id: tx.id })
  }
  const set = (fn: (t: TextItem) => void, key?: string) =>
    update((e) => {
      const t = e.texts.find((x) => x.id === sel!.id)
      if (t) fn(t)
    }, key ? key + sel!.id : undefined)

  return (
    <div>
      <Section title="Text">
        <button className="btn primary" onClick={add}><Icon name="plus" size={15} /> Add text at playhead</button>
        <span className="hint">Drag text on the preview to move it (it snaps to the center). Drag the white corner to resize. Double click to type right on the video.</span>
        {texts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {texts.slice().sort((a, b) => a.start - b.start).map((t) => (
              <button key={t.id} className="chip" style={{ cursor: 'pointer', borderColor: sel?.id === t.id ? 'var(--accent)' : undefined, maxWidth: 180 }} onClick={() => { select({ kind: 'text', id: t.id }); setTime(t.start + 0.4) }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtTime(t.start)} {t.text.split('\n')[0]}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {sel && (
        <>
          <Section
            title="Edit text"
            action={
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="link" onClick={() => { const c = { ...structuredClone(sel), id: uid('t'), y: Math.max(0.05, sel.y - 0.1) }; update((e) => e.texts.push(c)); select({ kind: 'text', id: c.id }) }}>Duplicate</button>
                <button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((e) => (e.texts = e.texts.filter((x) => x.id !== sel.id))); select(null) }}>Delete</button>
              </div>
            }
          >
            <textarea className="field-input" value={sel.text} onChange={(e) => set((t) => (t.text = e.target.value), 'txt')} rows={3} />
            <div className="grid-tiles" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {STYLE_PRESETS.map((s) => (
                <button key={s.name} className="btn sm" onClick={() => set((t) => Object.assign(t, s.p))}>{s.name}</button>
              ))}
            </div>
            <Select value={sel.font} options={FONTS.map((f) => ({ v: f, l: f, style: { fontFamily: `"${f}"`, fontSize: 14 } }))} onChange={(v) => set((t) => (t.font = v))} />
            <div style={{ display: 'flex', gap: 6 }}>
              {([['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline']] as const).map(([k, icon]) => (
                <button key={k} className={`icon-btn ${sel[k] ? 'active' : ''}`} style={{ background: sel[k] ? undefined : 'var(--card)', width: 40, height: 40 }} onClick={() => set((t) => (t[k] = !t[k]))} title={k}>
                  <Icon name={icon} size={17} />
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {([['left', 'alignL'], ['center', 'alignC'], ['right', 'alignR']] as const).map(([k, icon]) => (
                <button key={k} className={`icon-btn ${sel.align === k ? 'active' : ''}`} style={{ background: sel.align === k ? undefined : 'var(--card)', width: 40, height: 40 }} onClick={() => set((t) => (t.align = k))} title={`Align ${k}`}>
                  <Icon name={icon} size={17} />
                </button>
              ))}
            </div>
            <Slider label="Size" value={sel.size} min={16} max={220} step={1} format={(v) => `${Math.round(v)}px`} onChange={(v) => set((t) => (t.size = v), 'tsize')} />
            <Slider label="Letter spacing" value={sel.letterSpacing} min={-5} max={20} step={0.5} def={0} format={(v) => `${v}px`} onChange={(v) => set((t) => (t.letterSpacing = v), 'tls')} />
            <ColorRow label="Text color" value={sel.color} onChange={(v) => set((t) => (t.color = v), 'tcolor')} />
            <Toggle label="Text shadow" value={sel.shadow} onChange={(v) => set((t) => (t.shadow = v))} />
          </Section>

          <Section title="Box">
            <Toggle label="Background box" value={!!sel.bg} onChange={(v) => set((t) => (t.bg = v ? '#0b0d12' : ''))} />
            {sel.bg && (
              <>
                <ColorRow label="Box color" value={sel.bg} onChange={(v) => set((t) => (t.bg = v), 'tbg')} />
                <Slider label="Opacity" value={sel.bgOpacity} min={0.05} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((t) => (t.bgOpacity = v), 'tbgo')} />
                <Slider label="Padding" value={sel.padding} min={0} max={60} step={1} format={(v) => `${v}px`} onChange={(v) => set((t) => (t.padding = v), 'tpad')} />
                <Slider label="Roundness" value={sel.radius} min={0} max={99} step={1} format={(v) => `${v}px`} onChange={(v) => set((t) => (t.radius = v), 'trad')} />
              </>
            )}
          </Section>

          <Section title="Animation">
            <Seg
              options={[{ v: 'none', l: 'None' }, { v: 'fade', l: 'Fade' }, { v: 'slide-up', l: 'Slide' }, { v: 'pop', l: 'Pop' }, { v: 'typewriter', l: 'Type' }]}
              value={sel.anim}
              onChange={(v) => set((t) => (t.anim = v as TextAnim))}
            />
            <div className="chip">Shows {fmtTime(sel.start, true)} to {fmtTime(sel.end, true)}. Drag it on the Text track to change.</div>
          </Section>
        </>
      )}
    </div>
  )
}
