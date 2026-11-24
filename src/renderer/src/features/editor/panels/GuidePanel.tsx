// Step by step guide: every click in the recording becomes a numbered step with a screenshot and
// a marked click spot. Titles come from what you said at that moment. Saves as a web page or PDF.
import { useEffect, useRef, useState } from 'react'
import type { GuideStep } from '@shared/types'
import { uid } from '@shared/defaults'
import { plainText, spokenWords } from '@shared/speech'
import { Icon, Section, fmtTime, showMessage } from '@/ui'
import { api, pickSavePath } from '@/lib/api'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { clipAt, sourceToOutput } from '../engine/timeMap'

const shots = new Map<string, string>() // `${path}@${t}` -> data url

export function makeSteps(): GuideStep[] {
  const st = useEditor.getState()
  const p = st.project!
  const clicks = st.cursorData?.clicks ?? []
  const hidden = new Set(p.edit.cursor.hiddenClicks ?? [])
  const words = p.edit.transcript ? spokenWords(p.edit) : []
  const out: GuideStep[] = []
  let last = -10
  for (const c of [...clicks].sort((a, b) => a.t - b.t)) {
    if (hidden.has(Math.round(c.t * 1000))) continue
    if (!clipAt(p.edit.clips, c.t)) continue // cut from the video
    if (c.t - last < 0.8) continue // double clicks and quick repeats are one step
    last = c.t
    // what was said just before (and a moment after) the click
    const said = words.filter((w) => w.t1 > c.t - 4 && w.t0 < c.t + 1.2)
    let title = plainText(said).trim()
    if (title.split(' ').length > 14) title = title.split(' ').slice(-14).join(' ')
    title = title.replace(/^[a-z]/, (m) => m.toUpperCase())
    out.push({ id: uid('g'), t: c.t, x: c.x, y: c.y, title: title || '', note: '' })
  }
  return out.map((s, i) => ({ ...s, title: s.title || `Step ${i + 1}: click here` }))
}

// Small pictures for the step list: made only when a card scrolls into view, one at a time,
// and kept in a small cache so a guide with hundreds of steps stays light.
const queue: (() => Promise<void>)[] = []
let busyQ = false
async function pump() {
  if (busyQ) return
  busyQ = true
  while (queue.length) await queue.shift()!().catch(() => {})
  busyQ = false
}
function thumb(path: string, t: number): Promise<string> {
  const key = `${path}@${t.toFixed(3)}`
  const hit = shots.get(key)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    queue.push(async () => {
      const [b64] = await api.guideStills(path, [Math.max(0, t - 0.04)])
      const url = b64 ? 'data:image/jpeg;base64,' + b64 : ''
      if (url) {
        shots.set(key, url)
        if (shots.size > 120) shots.delete(shots.keys().next().value!)
      }
      resolve(url)
    })
    pump()
  })
}

export default function GuidePanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const cursor = useEditor((s) => s.cursorData)
  const steps = project.edit.guide ?? []
  const live = steps.filter((s) => !s.off)
  const [busy, setBusy] = useState('')
  const lead = project.edit.leadIn ?? 0

  const make = () => update((e) => (e.guide = makeSteps()))
  const setStep = (id: string, patch: Partial<GuideStep>, key?: string) => update((e) => {
    const s = e.guide?.find((x) => x.id === id)
    if (s) Object.assign(s, patch)
  }, key)

  const save = async (pdf: boolean) => {
    const name = project.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'guide'
    const out = await pickSavePath(`${name} guide.${pdf ? 'pdf' : 'html'}`, pdf ? 'pdf' : 'html')
    if (!out) return
    const off = api.on('guide:progress', (done: number, total: number) => setBusy(done < total ? `Making step ${done} of ${total - 1}…` : pdf ? 'Making the PDF…' : 'Saving…'))
    try {
      setBusy('Starting…')
      await api.exportGuide({ title: project.name, video: project.media.screen.path, steps: live.map((s) => ({ t: s.t, x: s.x, y: s.y, title: s.title, note: s.note })), outPath: out, pdf })
      api.showItem(out)
    } catch (e) {
      showMessage("Couldn't save the guide", e instanceof Error ? e.message : String(e))
    } finally {
      off()
      setBusy('')
    }
  }

  return (
    <>
      <Section title="Step by step guide">
        <span className="hint">
          Turns every click into a numbered step with a screenshot, ready to send as a web page or PDF. Steps are titled from what you said{project.edit.transcript ? '' : ' (make captions first to get titles from your voice)'}.
        </span>
        {!steps.length ? (
          <button className="btn primary" disabled={!cursor?.clicks.length} onClick={make}>
            <Icon name="click" size={15} /> {cursor?.clicks.length ? `Make steps from ${cursor.clicks.length} clicks` : 'This recording has no clicks'}
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" style={{ flex: 1 }} disabled={!!busy || !live.length} onClick={() => save(true)}><Icon name="download" size={15} /> Save PDF</button>
              <button className="btn" style={{ flex: 1 }} disabled={!!busy || !live.length} onClick={() => save(false)}><Icon name="download" size={15} /> Web page</button>
            </div>
            {busy && <span className="hint"><span className="spin" /> {busy}</span>}
            <button className="link" style={{ alignSelf: 'flex-start' }} onClick={make}>Make the steps again</button>
          </>
        )}
      </Section>
      {steps.length > 0 && (
        <Section title={`${live.length} step${live.length === 1 ? '' : 's'}`}>
          <div className="guide-list">
            {steps.map((s) => (
              <StepCard key={s.id} s={s} n={live.indexOf(s) + 1} path={project.media.screen.path} time={sourceToOutput(project.edit.clips, s.t, lead)} set={(p, k) => setStep(s.id, p, k)} />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function StepCard({ s, n, path, time, set }: { s: GuideStep; n: number; path: string; time: number; set: (p: Partial<GuideStep>, key?: string) => void }) {
  const [img, setImg] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    const el = box.current
    if (!el) return
    // only fetch the picture once the card is (nearly) on screen
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((x) => x.isIntersecting)) return
        io.disconnect()
        thumb(path, s.t).then((u) => alive && setImg(u))
      },
      { rootMargin: '300px' }
    )
    io.observe(el)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [path, s.t])
  const seek = () => {
    useEditor.getState().setPlaying(false)
    useEditor.getState().setTime(s.t)
    timeBus.emit(s.t)
  }
  return (
    <div className={`guide-step ${s.off ? 'off' : ''}`}>
      <div className="guide-head">
        <span className="guide-num">{s.off ? '·' : n}</span>
        <button className="tidy-time" onClick={seek} title="Jump there">{fmtTime(time)}</button>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title={s.off ? 'Put this step back' : 'Leave this step out'} onClick={() => set({ off: !s.off })}>
          <Icon name={s.off ? 'eyeOff' : 'eye'} size={14} />
        </button>
      </div>
      <div ref={box} className="guide-shot-box" onClick={seek}>
        {img ? <img className="guide-shot" src={img} alt="" /> : <div className="guide-shot empty" />}
        <span className="guide-mark" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }} />
      </div>
      <input className="guide-title" value={s.title} placeholder="What to do" onChange={(e) => set({ title: e.target.value }, 'gt-' + s.id)} />
      <textarea className="guide-note" value={s.note} placeholder="Add a note (optional)" rows={2} onChange={(e) => set({ note: e.target.value }, 'gn-' + s.id)} />
    </div>
  )
}
