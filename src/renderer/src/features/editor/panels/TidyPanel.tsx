// Smart trim: finds the dead time in a recording (waiting for pages, thinking, looking for a
// window) and cuts it or speeds it up, all at once or one by one.
import { useState } from 'react'
import { uid } from '@shared/defaults'
import { cutRanges, speedRanges, spokenWords } from '@shared/speech'
import { findIdle, type IdleRange } from '@shared/tidy'
import { Icon, Section, Seg, Slider, fmtTime, showMessage } from '@/ui'
import { api } from '@/lib/api'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { sortedClips, sourceToOutput } from '../engine/timeMap'

type Found = IdleRange & { on: boolean }

export default function TidyPanel() {
  const project = useEditor((s) => s.project)!
  const cursor = useEditor((s) => s.cursorData)
  const update = useEditor((s) => s.update)
  const [busy, setBusy] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [minLen, setMinLen] = useState(3)
  const [sens, setSens] = useState(0.5)
  const [mode, setMode] = useState<'cut' | 'fast'>('fast')
  const [speed, setSpeed] = useState(6)
  const edit = project.edit
  const lead = edit.leadIn ?? 0

  const analyse = async () => {
    setBusy('Looking at the screen…')
    try {
      const m = project.media
      const screen = await api.screenChange(m.screen.path).catch(() => undefined)
      let loud: { values: number[]; rate: number; offset: number } | undefined
      const speech = edit.transcript ? spokenWords(edit) : undefined
      if (!speech?.length) {
        setBusy('Listening for talking…')
        const voice = m.mic ?? m.system
        if (voice) loud = { values: await api.peaks(voice.path), rate: 50, offset: voice.offset + edit.audio.syncOffset }
      }
      const idle = findIdle({ duration: m.screen.duration, speech, loud, cursor, screen }, minLen, 0.4, sens)
      // only the parts still in the video
      const clips = sortedClips(edit.clips)
      const inVideo: Found[] = []
      for (const r of idle)
        for (const c of clips) {
          const s = Math.max(r.start, c.start)
          const e = Math.min(r.end, c.end)
          if (e - s >= Math.max(1, minLen - 0.8)) inVideo.push({ start: s, end: e, why: r.why, on: true })
        }
      setFound(inVideo)
    } catch (e) {
      showMessage("Couldn't look for dead time", e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const seek = (t: number) => {
    useEditor.getState().setPlaying(false)
    useEditor.getState().setTime(t)
    timeBus.emit(t)
  }

  const chosen = (found ?? []).filter((f) => f.on)
  const total = chosen.reduce((s, f) => s + f.end - f.start, 0)
  const saved = mode === 'cut' ? total : total * (1 - 1 / speed)

  const apply = () => {
    const ranges = chosen.map((f) => [f.start, f.end] as [number, number])
    update((e) => {
      e.clips = mode === 'cut' ? cutRanges(e.clips, ranges, () => uid('c')) : speedRanges(e.clips, ranges, speed, () => uid('c'))
    })
    setFound(null)
  }

  return (
    <>
      <Section title="Smart trim">
        <span className="hint">
          Finds the slow parts: waiting for a page to load, looking for a window, thinking. It checks your voice, clicks, typing, the cursor and the screen itself.
        </span>
        <Slider label="Shortest slow part" value={minLen} min={1.5} max={10} step={0.5} def={3} format={(v) => `${v}s`} onChange={setMinLen} />
        <Slider label="Sensitivity" value={sens} min={0} max={1} step={0.05} def={0.5} format={(v) => (v < 0.34 ? 'Only very still' : v > 0.66 ? 'Catch more' : 'Balanced')} onChange={setSens} />
        <button className="btn primary" disabled={!!busy} onClick={analyse}>
          {busy ? <><span className="spin" /> {busy}</> : <><Icon name="search" size={15} /> Find slow parts</>}
        </button>
      </Section>
      {found && (
        <Section title={found.length ? `${found.length} slow part${found.length > 1 ? 's' : ''}` : 'Nothing slow found'}>
          {!found.length && <span className="hint">Every part of this video has something going on. Try a lower shortest length or more sensitivity.</span>}
          {found.length > 0 && (
            <>
              <Seg options={[{ v: 'fast', l: 'Speed up' }, { v: 'cut', l: 'Cut out' }]} value={mode} onChange={setMode} />
              {mode === 'fast' && <Seg options={[3, 4, 6, 8, 12].map((v) => ({ v, l: `${v}x` }))} value={speed} onChange={setSpeed} />}
              <div className="tidy-list">
                {found.map((f, i) => (
                  <div key={i} className={`tidy-row ${f.on ? '' : 'off'}`}>
                    <input type="checkbox" checked={f.on} onChange={(e) => setFound(found.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
                    <button className="tidy-time" onClick={() => seek(f.start)} title="Jump there">
                      {fmtTime(sourceToOutput(edit.clips, f.start, lead))}
                    </button>
                    <span className="tidy-bar"><i style={{ width: `${Math.min(100, ((f.end - f.start) / 20) * 100)}%` }} /></span>
                    <span className="hint">{(f.end - f.start).toFixed(1)}s</span>
                  </div>
                ))}
              </div>
              <button className="btn primary" disabled={!chosen.length} onClick={apply}>
                <Icon name={mode === 'cut' ? 'scissors' : 'play'} size={15} /> {mode === 'cut' ? 'Cut' : 'Speed up'} {chosen.length} part{chosen.length === 1 ? '' : 's'} (saves {saved.toFixed(0)}s)
              </button>
              <span className="hint">Ctrl+Z undoes it. Sped up parts stay on the timeline, so you can drag their speed back.</span>
            </>
          )}
        </Section>
      )}
    </>
  )
}
