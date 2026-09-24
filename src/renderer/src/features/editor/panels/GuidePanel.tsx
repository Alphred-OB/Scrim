// Step by step guide: every click in the recording becomes a numbered step with a screenshot and
// a marked click spot. Titles come from what you said at that moment. Saves as a web page or PDF.
import { useEffect, useState } from 'react'
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

/** Screenshot of the moment just before a click, with the click spot circled. */
async function stepImage(path: string, s: GuideStep, marked = true): Promise<string> {
  const key = `${path}@${s.t.toFixed(3)}@${marked}`
  const hit = shots.get(key)
  if (hit) return hit
  const [b64] = await api.guideStills(path, [Math.max(0, s.t - 0.04)])
  if (!b64) return ''
  const img = new Image()
  img.src = 'data:image/jpeg;base64,' + b64
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const x = c.getContext('2d')!
  x.drawImage(img, 0, 0)
  if (marked) {
    const cx = s.x * c.width
    const cy = s.y * c.height
    const r = Math.max(18, c.width * 0.022)
    x.fillStyle = 'rgba(255, 59, 48, 0.18)'
    x.strokeStyle = '#ff3b30'
    x.lineWidth = Math.max(3, r * 0.18)
    x.beginPath()
    x.arc(cx, cy, r, 0, Math.PI * 2)
    x.fill()
    x.stroke()
    x.fillStyle = '#ff3b30'
    x.beginPath()
    x.arc(cx, cy, r * 0.22, 0, Math.PI * 2)
    x.fill()
  }
  const url = c.toDataURL('image/jpeg', 0.86)
  shots.set(key, url)
  return url
}

const esc = (s: string) => s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!)

export async function guideHtml(title: string, steps: GuideStep[], path: string, onStep?: (i: number) => void): Promise<string> {
  const parts: string[] = []
  for (let i = 0; i < steps.length; i++) {
    onStep?.(i)
    const s = steps[i]
    const img = await stepImage(path, s)
    parts.push(`<section class="step"><div class="num">${i + 1}</div><div class="body"><h2>${esc(s.title)}</h2>${s.note ? `<p>${esc(s.note).replace(/\n/g, '<br>')}</p>` : ''}${img ? `<img src="${img}" alt="Step ${i + 1}">` : ''}</div></section>`)
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--ink:#16181d;--dim:#5b6170;--line:#e4e6eb;--accent:#ff3b30;--bg:#ffffff}
@media (prefers-color-scheme:dark){:root{--ink:#eceef2;--dim:#9aa0ad;--line:#2a2d35;--bg:#121318}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,Segoe UI,system-ui,sans-serif}
main{max-width:920px;margin:0 auto;padding:40px 20px 60px}h1{font-size:30px;margin:0 0 6px}.lead{color:var(--dim);margin:0 0 34px}
.step{display:flex;gap:18px;padding:24px 0;border-top:1px solid var(--line);break-inside:avoid;page-break-inside:avoid}
.num{flex:none;width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700}
.body{flex:1;min-width:0}h2{font-size:18px;margin:4px 0 8px}p{margin:0 0 12px;color:var(--dim)}
img{width:100%;height:auto;border-radius:10px;border:1px solid var(--line);display:block}
footer{margin-top:30px;color:var(--dim);font-size:13px}
@media print{main{padding:0}.step{padding:16px 0}}
</style></head><body><main><h1>${esc(title)}</h1><p class="lead">${steps.length} step${steps.length === 1 ? '' : 's'}</p>${parts.join('')}<footer>Made with Scrim</footer></main></body></html>`
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
    try {
      const html = await guideHtml(project.name, live, project.media.screen.path, (i) => setBusy(`Making step ${i + 1} of ${live.length}…`))
      setBusy(pdf ? 'Making the PDF…' : 'Saving…')
      await api.saveGuide(html, out, pdf)
      api.showItem(out)
    } catch (e) {
      showMessage("Couldn't save the guide", e instanceof Error ? e.message : String(e))
    } finally {
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
  useEffect(() => {
    let alive = true
    stepImage(path, s).then((u) => alive && setImg(u)).catch(() => {})
    return () => {
      alive = false
    }
  }, [path, s.t, s.x, s.y]) // eslint-disable-line react-hooks/exhaustive-deps
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
      {img ? <img className="guide-shot" src={img} alt="" onClick={seek} /> : <div className="guide-shot empty" />}
      <input className="guide-title" value={s.title} placeholder="What to do" onChange={(e) => set({ title: e.target.value }, 'gt-' + s.id)} />
      <textarea className="guide-note" value={s.note} placeholder="Add a note (optional)" rows={2} onChange={(e) => set({ note: e.target.value }, 'gn-' + s.id)} />
    </div>
  )
}
