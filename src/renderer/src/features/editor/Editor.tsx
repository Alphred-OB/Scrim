import { useEffect, useState } from 'react'
import type { Aspect, CursorData, Preset } from '@shared/types'
import { uid } from '@shared/defaults'
import { api } from '@/lib/api'
import { useSettings, matches } from '@/lib/settings'
import { openProjectFromDialog } from '@/lib/openProject'
import { Icon, fmtTime, Select, openContextMenu } from '@/ui'
import SettingsModal from '@/features/settings/SettingsModal'
import { useEditor, flushSave, Panel } from './state/store'
import { timeBus } from './state/timeBus'
import { dragAsset } from './state/dragAsset'
import Preview, { togglePreviewFullscreen } from './preview/Preview'
import Timeline, { useTimelineView } from './timeline/Timeline'
import ExportDialog from './export/ExportDialog'
import { exportProject, estimateExportSeconds } from './export/exporter'
import BackgroundPanel from './panels/BackgroundPanel'
import CursorPanel from './panels/CursorPanel'
import ZoomPanel from './panels/ZoomPanel'
import TextPanel from './panels/TextPanel'
import AudioPanel from './panels/AudioPanel'
import ClipPanel from './panels/ClipPanel'
import MediaPanel, { importMedia } from './panels/MediaPanel'
import WebcamPanel from './panels/WebcamPanel'
import { joinVideoAt, addTextAt, addZoomAt, deleteSelection, duplicateSelection, splitAtPlayhead } from './state/actions'
import { sortedClips } from './engine/timeMap'

const RAIL: { id: Panel; icon: string; title: string; soon?: boolean }[] = [
  { id: 'background', icon: 'sparkles', title: 'Background & frame' },
  { id: 'cursor', icon: 'cursor', title: 'Cursor & clicks' },
  { id: 'zoom', icon: 'zoom', title: 'Zoom' },
  { id: 'text', icon: 'text', title: 'Text' },
  { id: 'media', icon: 'image', title: 'Media library' },
  { id: 'webcam', icon: 'webcam', title: 'Webcam' },
  { id: 'audio', icon: 'audio', title: 'Audio' },
  { id: 'settings', icon: 'scissors', title: 'Clips & speed' },
  { id: 'ai', icon: 'cc', title: 'AI captions & annotations', soon: true }
]

const ASPECTS: { v: Aspect; l: string }[] = [
  { v: 'auto', l: 'Auto' },
  { v: '16:9', l: '16:9' },
  { v: '9:16', l: '9:16' },
  { v: '1:1', l: '1:1' },
  { v: '4:3', l: '4:3' },
  { v: '4:5', l: '4:5' },
  { v: '21:9', l: '21:9' }
]

export default function Editor({ dir }: { dir: string }) {
  const project = useEditor((s) => s.project)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const p = await api.loadProject(dir)
        let cursor: CursorData | null = null
        if (p.media.cursor) cursor = await api.readJson<CursorData>(p.media.cursor).catch(() => null)
        if (alive) useEditor.getState().load(p, cursor)
      } catch (e) {
        setError(String(e))
      }
    })()
    return () => {
      alive = false
      flushSave()
    }
  }, [dir])

  if (error) return <div style={{ padding: 40 }}>Could not open project: {error}</div>
  if (!project || project.dir !== dir) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="spin" /></div>
  return <EditorView />
}

function EditorView() {
  const project = useEditor((s) => s.project)!
  const panel = useEditor((s) => s.panel)
  const setPanel = useEditor((s) => s.setPanel)
  const playing = useEditor((s) => s.playing)
  const saving = useEditor((s) => s.saving)
  const past = useEditor((s) => s.past.length)
  const future = useEditor((s) => s.future.length)
  const update = useEditor((s) => s.update)
  const shortcuts = useSettings((s) => s.settings.shortcuts)
  const tlZoom = useTimelineView((s) => s.zoom)
  const [exporting, setExporting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [name, setName] = useState(project.name)
  const [dropping, setDropping] = useState(false)
  const [toast, setToast] = useState('')
  const busy = useEditor((s) => s.busy)

  useEffect(() => {
    api.loadPresets().then(setPresets)
    // hooks for the automated self test in src/main/selftest.ts (harmless in normal use)
    ;(window as unknown as { __scrim: unknown }).__scrim = {
      panel: (p: Panel) => useEditor.getState().setPanel(p),
      settings: () => setSettingsOpen(true),
      exportDialog: () => setExporting(true),
      import: (paths: string[]) => importMedia(useEditor.getState().project!.dir, paths, timeBus.get()),
      estimate: () => {
        const st = useEditor.getState()
        return estimateExportSeconds(st.project!, st.cursorData, st.project!.edit.export)
      },
      state: () => {
        const e = useEditor.getState().project!.edit
        const st = useEditor.getState()
        return { duration: st.project!.media.screen.duration, clips: e.clips.length, busy: st.busy, zoomEnabled: e.zoom.enabled, clickEffect: e.cursor.clickEffect, overlays: e.overlays.length, audioClips: e.audioClips.length, assets: e.assets.map((a) => a.kind) }
      },
      export: async (out: string, patch?: Partial<import('@shared/types').ExportSettings>) => {
        const st = useEditor.getState()
        try {
          const settings = { ...st.project!.edit.export, ...(patch ?? {}) }
          await exportProject(st.project!, st.cursorData, settings, out, (p) => p.phase !== 'render' && console.log('progress', p.phase), new AbortController().signal)
          return 'ok'
        } catch (e) {
          return 'error: ' + (e instanceof Error ? e.stack : String(e))
        }
      }
    }
  }, [])

  // keyboard shortcuts (customisable in Settings)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (document.querySelector('.modal-back')) return
      const st = useEditor.getState()
      const sc = useSettings.getState().settings.shortcuts
      const fps = project.media.screen.fps || 30
      const step = (d: number) => {
        st.setPlaying(false)
        st.setTime(Math.max(0, Math.min(project.media.screen.duration, timeBus.get() + d)))
      }
      const actions: Record<string, () => void> = {
        playPause: () => st.setPlaying(!st.playing),
        undo: () => st.undo(),
        redo: () => st.redo(),
        split: splitAtPlayhead,
        delete: deleteSelection,
        addZoom: () => addZoomAt(timeBus.get()),
        addText: () => addTextAt(timeBus.get()),
        stepBack: () => step(-1 / fps),
        stepForward: () => step(1 / fps),
        jumpBack: () => step(-1),
        jumpForward: () => step(1),
        timelineIn: () => useTimelineView.getState().setZoom((z) => z * 1.5),
        timelineOut: () => useTimelineView.getState().setZoom((z) => z / 1.5),
        export: () => setExporting(true),
        import: () => importMedia(project.dir),
        settings: () => setSettingsOpen(true),
        fullscreen: togglePreviewFullscreen,
        save: async () => {
          await flushSave()
          setToast('Saved')
          setTimeout(() => setToast((t) => (t === 'Saved' ? '' : t)), 1500)
        },
        open: () => openProjectFromDialog(flushSave)
      }
      for (const [id, fn] of Object.entries(actions)) {
        if (sc[id] && matches(e, sc[id])) {
          e.preventDefault()
          fn()
          return
        }
      }
      if (e.key === 'Backspace' && matches(e, 'Backspace') && sc.delete === 'Delete') {
        e.preventDefault()
        deleteSelection()
      } else if (e.key === 'Escape') st.select(null)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [project.media.screen.fps, project.media.screen.duration, project.dir])

  // drag files from File Explorer onto the editor
  const onDrop = async (e: React.DragEvent) => {
    setDropping(false)
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean)
    setToast(`Importing ${paths.length} file${paths.length > 1 ? 's' : ''}…`)
    const errs = await importMedia(project.dir, paths, dragAsset.takeDropTime() ?? timeBus.get())
    setToast(errs.length ? errs[0] : '')
    if (errs.length) setTimeout(() => setToast(''), 4000)
    setPanel('media')
  }

  const jump = (dir: -1 | 1) => {
    const st = useEditor.getState()
    st.setPlaying(false)
    const cs = sortedClips(project.edit.clips)
    st.setTime(dir < 0 ? cs[0]?.start ?? 0 : Math.max(0, (cs[cs.length - 1]?.end ?? 0) - 0.05))
  }

  const savePreset = async () => {
    const e = project.edit
    const p: Preset = { id: uid('p'), name: presetName.trim() || `Preset ${presets.length + 1}`, aspect: e.aspect, background: e.background, frame: e.frame, cursor: e.cursor, webcam: e.webcam }
    const list = [...presets, p]
    setPresets(list)
    setPresetName('')
    await api.savePresets(list)
  }

  const commitName = () => {
    const n = name.trim() || project.name
    setName(n)
    if (n !== project.name) useEditor.getState().rename(n)
  }

  const kb = (id: string) => shortcuts[id]?.replace('Arrow', '')

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDropping(true)
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={onDrop}
    >
      {/* title bar */}
      <header className="drag surface" style={{ height: 48, display: 'flex', alignItems: 'center', gap: 4, padding: '0 150px 0 10px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <button className="icon-btn" title="Back to home" onClick={async () => { await flushSave(); location.hash = '/' }}><Icon name="back" /></button>
        <button className="icon-btn" title="Show project folder" onClick={() => api.showItem(project.media.screen.path)}><Icon name="folder" /></button>
        <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 6px' }} />
        <button className="icon-btn" title={`Undo (${kb('undo')})`} disabled={!past} onClick={() => useEditor.getState().undo()}><Icon name="undo" /></button>
        <button className="icon-btn" title={`Redo (${kb('redo')})`} disabled={!future} onClick={() => useEditor.getState().redo()}><Icon name="redo" /></button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: saving ? 'var(--warn)' : 'var(--ok)', transition: 'background .3s' }} title={saving ? 'Saving…' : 'All changes saved'} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 650, fontSize: 13.5, textAlign: 'center', width: 300, outline: 'none' }}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn ghost sm" onClick={() => setPresetsOpen((o) => !o)}><Icon name="bookmark" size={15} /> Presets <Icon name="chevron" size={13} /></button>
          {presetsOpen && (
            <div className="menu glass pop-in" style={{ position: 'absolute', right: 0, top: 38, width: 270, zIndex: 50 }} onMouseLeave={() => setPresetsOpen(false)}>
              {presets.length === 0 && <div className="hint" style={{ padding: 8 }}>Save your favourite look (background, frame, cursor, webcam) to reuse it on every recording.</div>}
              {presets.map((p) => (
                <button
                  key={p.id}
                  className="menu-item"
                  onClick={() => {
                    update((e) => {
                      e.aspect = p.aspect
                      e.background = structuredClone(p.background)
                      e.frame = structuredClone(p.frame)
                      e.cursor = { ...e.cursor, ...structuredClone(p.cursor), hiddenClicks: e.cursor.hiddenClicks }
                      if (p.webcam) e.webcam = structuredClone(p.webcam)
                    })
                    setPresetsOpen(false)
                  }}
                  onContextMenu={(ev) => openContextMenu(ev, [{ label: `Delete "${p.name}"`, danger: true, onClick: async () => { const l = presets.filter((x) => x.id !== p.id); setPresets(l); await api.savePresets(l) } }])}
                >
                  <span className="mi-icon"><Icon name="bookmark" size={13} /></span>
                  {p.name}
                </button>
              ))}
              <div className="menu-sep" />
              <div style={{ display: 'flex', gap: 6, padding: 4 }}>
                <input className="field-input" style={{ padding: '6px 10px' }} placeholder="Name this look" value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && savePreset()} />
                <button className="btn sm primary" onClick={savePreset}>Save</button>
              </div>
            </div>
          )}
        </div>
        <button className="icon-btn" title={`Settings (${kb('settings')})`} onClick={() => setSettingsOpen(true)}><Icon name="gear" /></button>
        <button className="btn primary sm" style={{ marginLeft: 4, height: 32 }} onClick={() => { useEditor.getState().setPlaying(false); setExporting(true) }}><Icon name="download" size={15} /> Export</button>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <nav className="surface" style={{ width: 58, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 10, borderRight: '1px solid var(--line)' }}>
          {RAIL.map((r) => (
            <button key={r.id} className={`icon-btn ${panel === r.id ? 'active' : ''}`} style={{ width: 40, height: 40, borderRadius: 11, position: 'relative' }} title={r.title} onClick={() => setPanel(r.id)}>
              <Icon name={r.icon} size={19} />
              {r.soon && <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, background: 'var(--warn)' }} />}
            </button>
          ))}
        </nav>
        <aside className="surface" style={{ width: 360, flexShrink: 0, overflowY: 'auto', padding: '18px 16px 30px', borderRight: '1px solid var(--line)' }}>
          <div className="fade-in" key={panel}>
            {panel === 'background' && <BackgroundPanel />}
            {panel === 'cursor' && <CursorPanel />}
            {panel === 'zoom' && <ZoomPanel />}
            {panel === 'text' && <TextPanel />}
            {panel === 'media' && <MediaPanel />}
            {panel === 'webcam' && <WebcamPanel />}
            {panel === 'audio' && <AudioPanel />}
            {panel === 'settings' && <ClipPanel />}
            {panel === 'ai' && <AiPanel />}
          </div>
        </aside>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 22px 10px', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 110 }}>
              <Select compact value={project.edit.aspect} options={ASPECTS} onChange={(v) => update((e) => (e.aspect = v))} />
            </div>
            <button className="btn ghost sm" onClick={() => setPanel('background')}><Icon name="crop" size={15} /> Crop</button>
          </div>

          <Preview />

          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="btn sm" onClick={(e) => openContextMenu(e, [
              { label: 'Zoom at playhead', hint: kb('addZoom'), onClick: () => addZoomAt(timeBus.get()) },
              { label: 'Text at playhead', hint: kb('addText'), onClick: () => addTextAt(timeBus.get()) },
              { label: 'Import media…', hint: kb('import'), onClick: () => importMedia(project.dir) },
              { sep: true },
              { label: 'Join a video before…', onClick: () => joinVideoAt('start') },
              { label: 'Join a video after…', onClick: () => joinVideoAt('end') }
            ])}><Icon name="plus" size={14} /> Add <Icon name="chevron" size={12} /></button>
            <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 6px' }} />
            <button className="icon-btn" title={`Add zoom (${kb('addZoom')})`} onClick={() => addZoomAt(timeBus.get())}><Icon name="zoom" /></button>
            <button className="icon-btn" title={`Add text (${kb('addText')})`} onClick={() => addTextAt(timeBus.get())}><Icon name="text" /></button>
            <button className="icon-btn" title={`Split (${kb('split')})`} onClick={splitAtPlayhead}><Icon name="scissors" /></button>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              <TimeLabel />
              <button className="icon-btn" onClick={() => jump(-1)} title="Go to start"><Icon name="prev" /></button>
              <button className="play-btn" onClick={() => useEditor.getState().setPlaying(!playing)} title={`Play / pause (${kb('playPause')})`}>
                <Icon name={playing ? 'pause' : 'play'} size={19} />
              </button>
              <button className="icon-btn" onClick={() => jump(1)} title="Go to end"><Icon name="next" /></button>
              <span className="hint" style={{ minWidth: 56 }}>{fmtTime(project.media.screen.duration)}</span>
            </div>
            <div className="tl-zoom" title="Timeline zoom">
              <button className="icon-btn sm" title="Zoom timeline out" onClick={() => useTimelineView.getState().setZoom((z) => z / 1.5)}><Icon name="minus" size={14} /></button>
              <input className="range" type="range" min={0} max={100} value={Math.round((Math.log(tlZoom) / Math.log(60)) * 100)} onChange={(e) => useTimelineView.getState().setZoom(Math.pow(60, +e.target.value / 100))} />
              <button className="icon-btn sm" title="Zoom timeline in" onClick={() => useTimelineView.getState().setZoom((z) => z * 1.5)}><Icon name="plus" size={14} /></button>
            </div>
          </div>
        </main>
      </div>

      <Timeline />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {dropping && (
        <div className="fade-in" style={{ position: 'fixed', inset: 10, border: '2px dashed var(--accent)', borderRadius: 18, background: 'var(--accent-soft)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontSize: 16, fontWeight: 600 }}>
          Drop to add to your project
        </div>
      )}
      {(busy || toast) && (
        <div className="toast glass">
          {(busy.startsWith('Joining') || (!busy && toast.startsWith('Importing'))) && <span className="spin" />}
          {busy || toast}
        </div>
      )}
    </div>
  )
}

function AiPanel() {
  return (
    <div className="section">
      <span className="section-title">AI</span>
      {[
        { t: 'AI captions', d: 'Subtitles made from your voice, fully editable and styled like your text layers.', i: 'cc' },
        { t: 'Smart annotations', d: 'AI watches your screen and adds callouts and highlights at the important moments.', i: 'sparkles' },
        { t: 'Auto trim silences', d: 'Finds long pauses and dead air so you can cut them in one click.', i: 'scissors' }
      ].map((f) => (
        <div key={f.t} className="glass" style={{ padding: 14, borderRadius: 14, boxShadow: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name={f.i} size={16} /> <b>{f.t}</b></span>
            <span className="badge">Coming soon</span>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>{f.d}</div>
        </div>
      ))}
    </div>
  )
}

function TimeLabel() {
  const [t, setT] = useState(timeBus.get())
  useEffect(() => {
    let last = 0
    return timeBus.on((v) => {
      const now = performance.now()
      if (now - last > 90) {
        last = now
        setT(v)
      }
    })
  }, [])
  return <span className="hint" style={{ minWidth: 56, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(t, true)}</span>
}
