// Captions page: make a transcript from the voice, style the captions, and edit the video by
// editing its text (delete words to cut them, remove um and uh, shorten long pauses).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CaptionLook, CaptionSettings } from '@shared/types'
import { FONTS, uid } from '@shared/defaults'
import { cutRanges, defaultCaptions, fillerRanges, isFiller, mergeRanges, plainText, silenceRanges, spokenWords, subtitleFile, type SpokenWord } from '@shared/speech'
import { ColorRow, Icon, Section, Seg, Select, Slider, Toggle, askConfirm } from '@/ui'
import { api, pickSavePath } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { clipAt, sourceToOutput } from '../engine/timeMap'
import { chunksFor } from '../engine/captions'
import { speechSource } from '../speech/transcribe'
import { cancelCaptions, startCaptions, useCaptionJob } from '@/lib/captionJob'

const LOOKS: { v: CaptionLook; l: string }[] = [
  { v: 'karaoke', l: 'Karaoke' },
  { v: 'bold', l: 'Bold' },
  { v: 'clean', l: 'Clean' },
  { v: 'box', l: 'Box' },
  { v: 'neon', l: 'Neon' },
  { v: 'minimal', l: 'Minimal' }
]

const STAGE: Record<string, string> = {
  extract: 'Reading the sound',
  download: 'Downloading the speech model (only the first time)',
  upload: 'Sending to Groq',
  transcribe: 'Listening'
}

export default function CaptionsPanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const settings = useSettings((s) => s.settings)
  const [tab, setTab] = useState<'style' | 'text'>('style')
  // the job belongs to the app (lib/captionJob.tsx), so it carries on when this panel is closed
  const job = useCaptionJob((s) => s.job)
  const busy = job && job.dir === project.dir ? job : null
  const busyElsewhere = job && job.dir !== project.dir ? job : null
  const edit = project.edit
  const tr = edit.transcript
  const c: CaptionSettings = { ...defaultCaptions(), ...(edit.captions ?? {}) }
  const set = (patch: Partial<CaptionSettings>, key?: string) => update((e) => (e.captions = { ...defaultCaptions(), ...(e.captions ?? {}), ...patch }), key)
  const src = speechSource(project)
  const engine = (settings.transcribeEngine ?? 'auto') === 'local' || !settings.groqKey?.trim() ? 'local' : 'groq'

  const generate = async () => {
    if (tr && !(await askConfirm({ title: 'Transcribe again?', body: 'This replaces the current text, including any words you fixed.', ok: 'Transcribe' }))) return
    await startCaptions(project, settings)
  }

  const saveSubs = async (kind: 'srt' | 'vtt') => {
    const out = await pickSavePath(`${project.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'captions'}.${kind}`, kind)
    if (!out) return
    const lead = edit.leadIn ?? 0
    await api.writeText(out, subtitleFile(chunksFor(edit), (t) => sourceToOutput(edit.clips, t, lead), kind, (t) => !!clipAt(edit.clips, t)))
  }

  return (
    <>
      <Section title="Captions">
        {!tr && !busy && (
          <div className="cap-empty">
            <div className="cap-empty-art" aria-hidden>
              <span>Hello</span> <b>everyone</b> <span>and</span>
            </div>
            <span className="hint">
              Turns what you say into captions that highlight each word as you speak, plus a transcript you can edit to cut the video. Listens to {src.label}.
            </span>
            <button className="btn primary" onClick={generate} disabled={!!busyElsewhere}>
              <Icon name="cc" size={16} /> Make captions
            </button>
            {busyElsewhere && <span className="hint">Captions are being made for {busyElsewhere.name}. One at a time: this can start when it is done.</span>}
            <span className="hint">
              {engine === 'groq' ? 'Using Groq (fast, online).' : `Using Whisper on this PC (offline). The ${settings.localModel ?? 'base'} model downloads once.`} Change it in Settings, AI.
            </span>
          </div>
        )}
        {busy && (
          <div className="cap-busy">
            <div className="cap-busy-row">
              <span className="spin" />
              <b>{STAGE[busy.stage] ?? 'Working'}</b>
              <span className="hint">{busy.note ?? (busy.p ? `${Math.round(busy.p * 100)}%` : '')}</span>
            </div>
            <div className="upd-bar"><i style={{ width: `${Math.round(busy.p * 100)}%` }} /></div>
            <span className="hint">This runs in the background. Keep editing, open other tools or even leave this project: a small box shows where it is, and you get a message when it is done.</span>
            <button className="link" style={{ alignSelf: 'flex-start' }} onClick={cancelCaptions}>Cancel</button>
          </div>
        )}
        {tr && !busy && (
          <>
            <Toggle label="Show captions on the video" value={c.show} onChange={(v) => set({ show: v })} />
            <div className="fx-tabs" role="tablist">
              <button className={tab === 'style' ? 'on' : ''} onClick={() => setTab('style')}><Icon name="palette" size={14} /> Style</button>
              <button className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}><Icon name="text" size={14} /> Edit text</button>
            </div>
          </>
        )}
      </Section>
      {tr && !busy && tab === 'style' && <StyleTab c={c} set={set} onSave={saveSubs} onRedo={generate} />}
      {tr && !busy && tab === 'text' && <TextTab />}
    </>
  )
}

function StyleTab({ c, set, onSave, onRedo }: { c: CaptionSettings; set: (p: Partial<CaptionSettings>, key?: string) => void; onSave: (k: 'srt' | 'vtt') => void; onRedo: () => void }) {
  const edit = useEditor((s) => s.project!.edit)
  return (
    <>
      <Section title="Look" onReset={() => set({ ...defaultCaptions(), show: c.show, hidden: c.hidden, fixes: c.fixes })}>
        <div className="cap-looks">
          {LOOKS.map((l) => (
            <button key={l.v} className={`cap-look cap-look-${l.v} ${c.look === l.v ? 'on' : ''}`} onClick={() => set({ look: l.v })} style={{ ['--hl' as string]: c.highlight }}>
              <span className="cap-look-sample">
                <i>so</i> <em>this</em> <i>is</i>
              </span>
              <span className="cap-look-name">{l.l}</span>
            </button>
          ))}
        </div>
        <div className="list-row" style={{ borderBottom: 'none', padding: '2px 0' }}>
          <span style={{ flex: 1 }}>Font</span>
          <Select width={170} value={c.font} options={FONTS.map((f) => ({ v: f, l: f, style: { fontFamily: f } }))} onChange={(v) => set({ font: v })} />
        </div>
        <Slider label="Size" value={c.size} min={24} max={110} step={1} def={52} format={(v) => `${v}`} onChange={(v) => set({ size: v }, 'cap-size')} />
        <Slider label="Height on screen" value={c.y} min={0.08} max={0.95} step={0.01} def={0.85} format={(v) => (v > 0.66 ? 'Bottom' : v < 0.33 ? 'Top' : 'Middle')} onChange={(v) => set({ y: v }, 'cap-y')} />
        <ColorRow label="Text" value={c.color} onChange={(v) => set({ color: v }, 'cap-color')} />
        <ColorRow label="Spoken word" value={c.highlight} onChange={(v) => set({ highlight: v }, 'cap-hl')} />
        {(c.look === 'box' || c.look === 'minimal') && (
          <>
            <ColorRow label="Box" value={c.bg} onChange={(v) => set({ bg: v }, 'cap-bg')} />
            <Slider label="Box opacity" value={c.bgOpacity} min={0} max={1} step={0.05} def={0.55} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ bgOpacity: v }, 'cap-bgo')} />
          </>
        )}
        <Seg options={[{ v: 1, l: 'One line' }, { v: 2, l: 'Two lines' }]} value={c.lines} onChange={(v) => set({ lines: v as 1 | 2 })} />
        <Slider label="Words per line" value={c.maxChars} min={12} max={60} step={1} def={34} format={(v) => (v < 22 ? 'Few' : v > 42 ? 'Many' : 'Some')} onChange={(v) => set({ maxChars: v }, 'cap-max')} />
        <Toggle label="All capitals" value={c.uppercase} onChange={(v) => set({ uppercase: v })} />
      </Section>
      <Section title="Subtitle files">
        <span className="hint">For YouTube, LinkedIn and players that show their own subtitles. Timed to the edited video.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => onSave('srt')}><Icon name="download" size={15} /> Save .srt</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onSave('vtt')}><Icon name="download" size={15} /> Save .vtt</button>
        </div>
        <button className="btn" onClick={() => navigator.clipboard.writeText(plainText(spokenWords(edit)))}><Icon name="copy" size={15} /> Copy the transcript</button>
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={onRedo}>Transcribe again</button>
      </Section>
    </>
  )
}

/** The transcript as text. Click a word to jump there; select words and press Delete to cut them from the video. */
function TextTab() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const edit = project.edit
  const words = useMemo(() => spokenWords(edit, undefined, true), [edit.transcript, edit.captions?.fixes, edit.audio.syncOffset]) // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = new Set(edit.captions?.hidden ?? [])
  const kept = (w: SpokenWord) => !!clipAt(edit.clips, (w.t0 + w.t1) / 2)
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [gap, setGap] = useState(1.2)
  const anchor = useRef<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const fillers = words.filter((w) => isFiller(w.w) && kept(w)).length
  const liveWords = words.filter(kept)
  const pauses = silenceRanges(liveWords, gap, 0.3).filter(([a, b]) => clipAt(edit.clips, (a + b) / 2))
  const pauseSecs = pauses.reduce((s, [a, b]) => s + b - a, 0)

  const seek = (t: number) => {
    useEditor.getState().setPlaying(false)
    useEditor.getState().setTime(t)
    timeBus.emit(t)
  }

  // highlight the word under the playhead without re-rendering the list
  useEffect(() => {
    let last = -1
    let prevT = -1
    return timeBus.on((t) => {
      if (Math.abs(t - prevT) < 0.04) return
      prevT = t
      let i = -1
      let lo = 0
      let hi = words.length - 1
      while (lo <= hi) {
        const m = (lo + hi) >> 1
        if (words[m].t0 <= t) (i = m), (lo = m + 1)
        else hi = m - 1
      }
      if (i >= 0 && t > words[i].t1 + 0.3) i = -1
      if (i === last) return
      box.current?.querySelector('.tw.now')?.classList.remove('now')
      if (i >= 0) {
        const el = box.current?.querySelector(`[data-i="${i}"]`)
        el?.classList.add('now')
        const r = el?.getBoundingClientRect()
        const b = box.current?.getBoundingClientRect()
        if (r && b && useEditor.getState().playing && (r.top < b.top || r.bottom > b.bottom)) el?.scrollIntoView({ block: 'center' })
      }
      last = i
    })
  }, [words])

  const cut = (ranges: [number, number][], what: string) => {
    if (!ranges.length) return
    const before = edit.clips.length
    update((e) => {
      e.clips = cutRanges(e.clips, ranges, () => uid('c'))
    })
    const secs = mergeRanges(ranges).reduce((s, [a, b]) => s + b - a, 0)
    console.log(`[captions] cut ${what}: ${ranges.length} parts, ${secs.toFixed(1)}s, clips ${before} -> ${useEditor.getState().project!.edit.clips.length}`)
  }

  const cutSelection = () => {
    if (!sel) return
    const [i, j] = sel[0] <= sel[1] ? sel : [sel[1], sel[0]]
    const prev = words[i - 1]
    const next = words[j + 1]
    const a = Math.max(prev ? prev.t1 : -Infinity, words[i].t0 - 0.03)
    const b = Math.min(next ? next.t0 : Infinity, words[j].t1 + 0.03)
    cut([[a, b]], 'selection')
    setSel(null)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!sel || editing !== null) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        cutSelection()
      } else if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })

  const fix = (w: SpokenWord, text: string) => {
    update((e) => {
      const c = { ...defaultCaptions(), ...(e.captions ?? {}) }
      const fixes = { ...(c.fixes ?? {}) }
      const orig = e.transcript?.words.find((x) => Math.round(x.t0 * 1000) === w.key)?.w
      if (!text.trim() || text.trim() === orig) delete fixes[String(w.key)]
      else fixes[String(w.key)] = text.trim()
      e.captions = { ...c, fixes }
    })
  }
  const toggleHidden = (w: SpokenWord) =>
    update((e) => {
      const c = { ...defaultCaptions(), ...(e.captions ?? {}) }
      const h = new Set(c.hidden ?? [])
      if (h.has(w.key)) h.delete(w.key)
      else h.add(w.key)
      e.captions = { ...c, hidden: [...h] }
    })

  const inSel = (i: number) => !!sel && i >= Math.min(sel[0], sel[1]) && i <= Math.max(sel[0], sel[1])

  return (
    <>
      <Section title="Clean up">
        <button className="btn" disabled={!fillers} onClick={() => cut(fillerRanges(liveWords.filter((w) => !hidden.has(w.key) || isFiller(w.w))), 'fillers')}>
          <Icon name="scissors" size={15} /> {fillers ? `Remove ${fillers} um and uh` : 'No um or uh found'}
        </button>
        <Slider label="Pauses longer than" value={gap} min={0.5} max={4} step={0.1} def={1.2} format={(v) => `${v.toFixed(1)}s`} onChange={setGap} />
        <button className="btn" disabled={!pauses.length} onClick={() => cut(pauses, 'pauses')}>
          <Icon name="scissors" size={15} /> {pauses.length ? `Shorten ${pauses.length} pauses (saves ${pauseSecs.toFixed(1)}s)` : 'No long pauses'}
        </button>
        <span className="hint">A short breath is kept at each pause so the talk still sounds natural. Ctrl+Z brings anything back.</span>
      </Section>
      <Section title="Transcript" action={sel ? <button className="link" style={{ color: 'var(--danger)' }} onClick={cutSelection}>Cut selected</button> : undefined}>
        <span className="hint">Click a word to jump to it. Drag or Shift+click to select, then Delete to cut it from the video. Double click to fix a word.</span>
        <div
          ref={box}
          className="tw-box"
          onPointerUp={() => (anchor.current = null)}
          onPointerLeave={() => (anchor.current = null)}
        >
          {words.map((w, i) => {
            const k = kept(w)
            if (editing === i)
              return (
                <input
                  key={i}
                  className="tw-edit"
                  autoFocus
                  defaultValue={w.w}
                  size={Math.max(3, w.w.length + 1)}
                  onBlur={(e) => {
                    fix(w, e.target.value)
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                    e.stopPropagation()
                  }}
                />
              )
            const gapBefore = i > 0 && w.t0 - words[i - 1].t1 > 1.2
            return (
              <span key={i}>
                {gapBefore && <span className="tw-gap" title={`${(w.t0 - words[i - 1].t1).toFixed(1)}s pause`}>···</span>}
                <span
                  data-i={i}
                  className={`tw ${k ? '' : 'cut'} ${inSel(i) ? 'sel' : ''} ${isFiller(w.w) ? 'filler' : ''} ${hidden.has(w.key) ? 'hid' : ''}`}
                  title={k ? undefined : 'Cut from the video. Ctrl+Z to bring it back.'}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    if (e.shiftKey && sel) setSel([sel[0], i])
                    else {
                      anchor.current = i
                      setSel(null)
                    }
                  }}
                  onPointerEnter={() => anchor.current !== null && anchor.current !== i && setSel([anchor.current, i])}
                  onClick={(e) => !e.shiftKey && !sel && seek(w.t0)}
                  onDoubleClick={() => setEditing(i)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    toggleHidden(w)
                  }}
                >
                  {w.w}
                </span>{' '}
              </span>
            )
          })}
        </div>
        <span className="hint">Right click a word to hide it from the captions only.</span>
      </Section>
    </>
  )
}
