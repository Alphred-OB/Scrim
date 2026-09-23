import { useEditor } from '../state/store'
import { Icon, Section, Seg, fmtTime } from '@/ui'
import { uid } from '@shared/defaults'
import { outputDuration } from '../engine/timeMap'

export { splitAtPlayhead, deleteSelection } from '../state/actions'
import { splitAtPlayhead, deleteSelection } from '../state/actions'

export default function ClipPanel() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const clips = project.edit.clips
  const sel = selection?.kind === 'clip' ? clips.find((c) => c.id === selection.id) : undefined

  return (
    <div>
      <Section title="Clips">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={splitAtPlayhead}><Icon name="scissors" size={15} /> Split (S)</button>
          <button className="btn" style={{ flex: 1 }} disabled={!sel || clips.length <= 1} onClick={deleteSelection}><Icon name="trash" size={15} /> Delete clip</button>
        </div>
        <span className="hint">Split at the playhead, select the part you don't want, then delete it. Drag clip edges to trim.</span>
        <div className="chip">Final length {fmtTime(outputDuration(clips, project.edit.leadIn ?? 0), true)} from {fmtTime(project.media.screen.duration, true)}</div>
        <button className="btn sm" onClick={() => update((e) => (e.clips = [{ id: uid('c'), start: 0, end: project.media.screen.duration, speed: 1 }]))}>Restore all cuts</button>
      </Section>
      {sel && (
        <Section title="Selected clip">
          <span className="section-title" style={{ fontSize: 10.5 }}>Speed</span>
          <Seg
            options={[0.5, 1, 1.5, 2, 3, 4].map((v) => ({ v, l: `${v}x` }))}
            value={sel.speed}
            onChange={(v) => update((e) => { const c = e.clips.find((x) => x.id === sel.id); if (c) c.speed = v as number })}
          />
          <span className="hint">Speed up boring parts like loading screens or typing.</span>
        </Section>
      )}
    </div>
  )
}
