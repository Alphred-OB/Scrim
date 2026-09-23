import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExportFormat, ExportSettings, Project } from '@shared/types'
import { api } from '@/lib/api'
import { playDoneSound } from '@/lib/settings'
import { DoneBurst, Icon, ProgressViz, Select, Seg, fmtTime, type Option } from '@/ui'
import { useSettings } from '@/lib/settings'
import { useEditor, flushSave } from '../state/store'
import { outputSize } from '../engine/compositor'
import { GIF_MAX_FPS, GIF_MAX_RES, canEncode, estimateExportSeconds, exportDims, exportProject, originalRes, sourceFps, type ExportProgress } from './exporter'

const FORMATS: { v: ExportFormat; l: string; hint: string }[] = [
  { v: 'mp4', l: 'MP4', hint: 'Works everywhere: YouTube, X, LinkedIn, WhatsApp.' },
  { v: 'webm', l: 'WebM', hint: 'Smaller files for websites. VP9 video with Opus audio.' },
  { v: 'mov', l: 'MOV', hint: 'For Final Cut, Premiere and other editors.' },
  { v: 'gif', l: 'GIF', hint: 'Silent loop for docs and READMEs. Up to 720p and 25 fps to keep files small.' }
]

const RES_STEPS = [480, 720, 1080, 1440, 2160]
const RES_NAME: Record<number, string> = { 480: '480p', 720: '720p', 1080: '1080p', 1440: '1440p', 2160: '4K' }
const UPSCALE_OK = 1.25 // small upscales are allowed but labelled

/**
 * Only offer what the export can really deliver: no resolutions far above the recording,
 * no sizes this PC can't encode, and no frame rates higher than what was actually captured.
 */
function useExportChoices(project: Project, s: ExportSettings) {
  const orig = originalRes(project)
  const realFps = sourceFps(project)
  const isGif = s.format === 'gif'
  const dims = (r: number) => outputSize(project.edit, project.media.screen.width, project.media.screen.height, r)
  const [encodable, setEncodable] = useState<Record<number, boolean>>({})

  const resValues = useMemo(() => [0, ...RES_STEPS.filter((r) => Math.abs(r - orig) > 8)].sort((a, b) => (a || orig) - (b || orig)), [orig])
  useEffect(() => {
    let alive = true
    Promise.all(resValues.map(async (r) => [r, await canEncode(s.format, ...dims(r || orig))] as const)).then((list) => alive && setEncodable(Object.fromEntries(list)))
    return () => {
      alive = false
    }
  }, [s.format, orig, project.edit.aspect])

  const res: Option<number>[] = resValues.map((r) => {
    const short = r || orig
    const [w, h] = dims(short)
    const up = short / orig
    let why = ''
    if (isGif && short > GIF_MAX_RES) why = 'GIFs are limited to 720p'
    else if (up > UPSCALE_OK) why = `Bigger than your recording, it would only look blurry`
    else if (encodable[r] === false) why = `This PC can't encode ${w} x ${h}`
    const name = r === 0 ? 'Original' : RES_NAME[r]
    return {
      v: r,
      l: `${name} · ${w} x ${h}${!why && up > 1.02 ? ' (upscaled)' : ''}`,
      hint: why || (r === 0 ? 'Sharpest, every recorded pixel is kept' : undefined),
      disabled: !!why
    }
  })

  const fpsSteps = isGif ? [10, 15, 20, 25] : [24, 30, 60]
  const roundedReal = Math.round(realFps)
  const fpsValues = [...new Set([...fpsSteps, ...(!isGif && !fpsSteps.includes(roundedReal) ? [roundedReal] : [])])].sort((a, b) => a - b)
  const fpsOk = (v: number) => v <= realFps * 1.05 + 0.5 && (!isGif || v <= GIF_MAX_FPS)
  const fps: Option<number>[] = fpsValues.map((v) => ({
    v,
    l: v === roundedReal && !fpsSteps.includes(v) ? `${v} fps · matches recording` : `${v} fps`,
    hint: fpsOk(v) ? undefined : `Your recording has ${roundedReal} real frames per second, so ${v} would only repeat frames`,
    disabled: !fpsOk(v)
  }))
  return { res, fps, realFps: roundedReal, orig }
}

function bestAllowed(opts: Option<number>[], cur: number, prefer: 'highest' | 'closest'): number {
  const ok = opts.filter((o) => !o.disabled)
  if (!ok.length) return cur
  if (ok.some((o) => o.v === cur)) return cur
  if (prefer === 'highest') return ok[ok.length - 1].v
  return ok.reduce((b, o) => (Math.abs(o.v - cur) < Math.abs(b.v - cur) ? o : b)).v
}

function human(sec: number): string {
  if (sec < 60) return `about ${Math.max(5, Math.round(sec / 5) * 5)} seconds`
  const m = Math.round(sec / 60)
  return `about ${m} minute${m > 1 ? 's' : ''}`
}

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project)!
  const cursorData = useEditor((s) => s.cursorData)
  const update = useEditor((s) => s.update)
  const s = project.edit.export
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [prog, setProg] = useState<ExportProgress>({ phase: 'prepare', progress: 0 })
  const [err, setErr] = useState('')
  const [outPath, setOutPath] = useState('')
  const [estimate, setEstimate] = useState<number | null>(null)
  const [took, setTook] = useState(0)
  const abort = useRef<AbortController | null>(null)

  const set = (patch: Partial<ExportSettings>) => update((e) => Object.assign(e.export, patch))
  const choices = useExportChoices(project, s)
  const progressStyle = useSettings((x) => x.settings.exportProgress ?? 'wavy')
  const celebrate = useSettings((x) => x.settings.exportCelebrate ?? true)
  const { W, H, duration } = exportDims(project, s)

  // if the current choice isn't possible (e.g. 60 fps on a 27 fps recording), switch to the nearest real one
  useEffect(() => {
    const fps = bestAllowed(choices.fps, s.fps, 'highest')
    const resolution = bestAllowed(choices.res, s.resolution, 'closest')
    if (fps !== s.fps || resolution !== s.resolution) set({ fps, resolution })
  }, [choices.fps.map((o) => o.disabled).join(), choices.res.map((o) => o.disabled).join()])

  useEffect(() => {
    let alive = true
    setEstimate(null)
    const t = setTimeout(() => {
      estimateExportSeconds(project, cursorData, s).then((v) => alive && setEstimate(v)).catch(() => {})
    }, 150)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [s.format, s.resolution, s.fps, s.quality])

  const start = async () => {
    const ext = s.format
    const safe = project.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'demo'
    const p = await api.saveFile(`${safe}.${ext}`, ext)
    if (!p) return
    await flushSave()
    setOutPath(p)
    setState('running')
    setErr('')
    abort.current = new AbortController()
    const t0 = performance.now()
    try {
      await exportProject(useEditor.getState().project!, cursorData, s, p, setProg, abort.current.signal)
      setTook((performance.now() - t0) / 1000)
      setState('done')
      playDoneSound()
      if (!document.hasFocus()) api.notify('Export finished', `${safe}.${ext} is ready.`)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return setState('idle')
      console.error(e)
      setErr(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  const pct = prog.phase === 'render' ? prog.progress * 92 : prog.phase === 'audio' ? 92 + prog.progress * 8 : prog.phase === 'done' ? 100 : 0
  const fmt = FORMATS.find((f) => f.v === s.format)!

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && state !== 'running' && onClose()}>
      <div className="modal glass" style={{ width: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Export video</h3>
          {state !== 'running' && <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>}
        </div>
        <div className="hint" style={{ marginBottom: 16 }}>{W} x {H} · {s.fps} fps · {fmtTime(duration)} · {fmt.l}</div>

        {state === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="section-title">Format</span>
            <Seg options={FORMATS.map((f) => ({ v: f.v, l: f.l }))} value={s.format} onChange={(v) => set({ format: v as ExportFormat })} />
            <span className="hint">{fmt.hint}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginTop: 6 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="section-title">Resolution</span>
                <Select value={s.resolution} options={choices.res} onChange={(v) => set({ resolution: v })} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="section-title">Frame rate</span>
                <Select value={s.fps} options={choices.fps} onChange={(v) => set({ fps: v })} />
              </label>
            </div>
            <span className="hint">
              Recorded at {project.media.screen.width} x {project.media.screen.height}, {choices.realFps} real frames per second. Options your video can't really reach are turned off.
            </span>
            {s.format !== 'gif' && (
              <>
                <span className="section-title" style={{ marginTop: 6 }}>Quality</span>
                <Seg options={[{ v: 'low', l: 'Small' }, { v: 'medium', l: 'Good' }, { v: 'high', l: 'High' }, { v: 'max', l: 'Max' }]} value={s.quality} onChange={(v) => set({ quality: v as ExportSettings['quality'] })} />
              </>
            )}
            <div className="glass" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="restart" size={16} />
              <span style={{ flex: 1 }}>Estimated time</span>
              <b>{estimate === null ? <span className="spin" /> : human(estimate)}</b>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn primary" style={{ flex: 2 }} onClick={start}><Icon name="download" size={15} /> Export {fmt.l}</button>
            </div>
          </div>
        )}

        {state === 'running' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              <ProgressViz kind={progressStyle} value={prog.phase === 'prepare' ? null : pct / 100} size={170} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }} className="hint">
              <span>
                {prog.phase === 'prepare'
                  ? 'Getting ready…'
                  : prog.phase === 'render'
                    ? `Frame ${prog.frame ?? 0} of ${prog.frames ?? '…'}${prog.speed ? ` · ${prog.speed.toFixed(1)}x real time` : ''}`
                    : s.format === 'gif' ? 'Making the GIF…' : 'Mixing audio…'}
              </span>
              <span>{Math.round(pct)}%{prog.phase === 'render' && prog.eta !== undefined ? ` · ${fmtTime(prog.eta)} left` : ''}</span>
            </div>
            <span className="hint">You can switch to other apps. You'll hear a sound when it's done.</span>
            <button className="btn" onClick={() => abort.current?.abort()}>Cancel export</button>
          </div>
        )}

        {state === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <DoneBurst confetti={celebrate} size={96} />
              <b style={{ fontSize: 16 }}>Your video is ready</b>
              <span className="hint">Exported in {fmtTime(took)}</span>
            </div>
            <div className="chip" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{outPath}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => api.showItem(outPath)}>Show in folder</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => api.openPath(outPath)}>Play</button>
              <button className="btn primary" style={{ flex: 1 }} onClick={onClose}>Done</button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap', fontSize: 12.5, maxHeight: 200, overflow: 'auto', userSelect: 'text' }}>{err}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={onClose}>Close</button>
              <button className="btn primary" style={{ flex: 1 }} onClick={() => setState('idle')}>Try again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
