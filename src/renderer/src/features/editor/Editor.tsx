import { useEffect, useRef, useState } from 'react'
import type { Aspect, CursorData, Preset } from '@shared/types'
import { uid } from '@shared/defaults'
import { api } from '@/lib/api'
import { useSettings, matches } from '@/lib/settings'
import { openProjectFromDialog } from '@/lib/openProject'
import { maybeAutoStart, startTour, takeQueuedTour, useTour } from '@/features/onboarding/tours'
import { Icon, fmtTime, Select, openContextMenu } from '@/ui'
import { friendlyError } from '@/lib/errors'
import { helpMenu } from '@/lib/feedback'
import SettingsModal from '@/features/settings/SettingsModal'
import EditorLoading from './EditorLoading'
import { useEditor, flushSave, Panel } from './state/store'
import { timeBus } from './state/timeBus'
import { dragAsset } from './state/dragAsset'
import Preview, { togglePreviewFullscreen } from './preview/Preview'
import Timeline, { useTimelineView } from './timeline/Timeline'
import { outputDuration, sourceToOutput } from './engine/timeMap'
import ExportDialog from './export/ExportDialog'
import { exportProject, estimateExportSeconds } from './export/exporter'
import BackgroundPanel from './panels/BackgroundPanel'
import FramePanel from './panels/FramePanel'
import CursorPanel from './panels/CursorPanel'
import ZoomPanel from './panels/ZoomPanel'
import TextPanel from './panels/TextPanel'
import BlurPanel from './panels/BlurPanel'
import AudioPanel from './panels/AudioPanel'
import ClipPanel from './panels/ClipPanel'
import EffectsPanel from './panels/EffectsPanel'
import MediaPanel, { importMedia } from './panels/MediaPanel'
import WebcamPanel from './panels/WebcamPanel'
import KeysPanel from './panels/KeysPanel'
import CaptionsPanel from './panels/CaptionsPanel'
import TidyPanel from './panels/TidyPanel'
import GuidePanel from './panels/GuidePanel'
import BrandPanel from './panels/BrandPanel'
import { engineSelfTest } from './speech/transcribe'
import RailIcon from './RailIcon'
import RailMore from './RailMore'
import { addTextAt, addTransitionItem, addZoomAt, deleteSelection, duplicateSelection, splitAtPlayhead } from './state/actions'
import { sortedClips } from './engine/timeMap'

const RAIL: { id: Panel; icon: string; title: string; label?: string; soon?: boolean }[] = [
  { id: 'background', icon: 'sparkles', title: 'Background & frame', label: 'Style' },
  { id: 'frame', icon: 'frame', title: 'Frame: padding, shadow, corners and border', label: 'Frame' },
  { id: 'cursor', icon: 'cursor', title: 'Cursor & clicks', label: 'Cursor' },
  { id: 'zoom', icon: 'zoom', title: 'Zoom' },
  { id: 'text', icon: 'text', title: 'Text' },
  { id: 'blur', icon: 'eyeOff', title: 'Blur & redact', label: 'Blur' },
  { id: 'media', icon: 'image', title: 'Media library', label: 'Media' },
  { id: 'effects', icon: 'fx', title: 'Transitions & effects', label: 'Effects' },
  { id: 'webcam', icon: 'webcam', title: 'Webcam' },
  { id: 'audio', icon: 'audio', title: 'Audio' },
  { id: 'keys', icon: 'keyboard', title: 'Keyboard shortcuts', label: 'Keys' },
  { id: 'settings', icon: 'scissors', title: 'Clips & speed', label: 'Clips' },
  { id: 'ai', icon: 'cc', title: 'Captions and editing by text', label: 'Captions' },
  { id: 'tidy', icon: 'wand', title: 'Smart trim: find and remove slow parts', label: 'Trim' },
  { id: 'guide', icon: 'click', title: 'Step by step guide from your clicks', label: 'Guide' },
  { id: 'brand', icon: 'palette', title: 'Brand kit: logo, colors, intro', label: 'Brand' }
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

  if (error) {
    const f = friendlyError(error)
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>This project could not be opened</h3>
          <span className="hint">{f.message}</span>
          <button className="btn primary" onClick={() => (location.hash = '/')}>Back to home</button>
          <details className="hint" style={{ maxWidth: '100%' }}>
            <summary style={{ cursor: 'pointer' }}>Technical details</summary>
            <div style={{ whiteSpace: 'pre-wrap', userSelect: 'text', marginTop: 6 }}>{f.detail}</div>
          </details>
        </div>
      </div>
    )
  }
  const opened = !!project && project.dir === dir
  const loadingOpen = useEditor((s) => s.loadingOpen)
  return (
    <>
      {/* while the loading page is up the editor stays visible, blurred, behind it, and can't be clicked or tabbed into */}
      <div style={{ display: 'contents' }} inert={loadingOpen}>
        {opened ? <EditorView /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="spin" /></div>}
      </div>
      <EditorLoading dir={dir} />
    </>
  )
}

function EditorView() {
  const project = useEditor((s) => s.project)!
  const panel = useEditor((s) => s.panel)
  const setPanel = useEditor((s) => s.setPanel)
  const playing = useEditor((s) => s.playing)
  const update = useEditor((s) => s.update)
  const shortcuts = useSettings((s) => s.settings.shortcuts)
  const [exporting, setExporting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!presetsOpen) return
    const onDown = (e: PointerEvent | MouseEvent) => {
      if (presetsRef.current && e.target instanceof Node && presetsRef.current.contains(e.target)) return
      if ((e.target as HTMLElement).closest?.('.context-menu, .cmenu')) return
      setPresetsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresetsOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [presetsOpen])
  const [name, setName] = useState(project.name)
  const [dropping, setDropping] = useState(false)
  const [toast, setToast] = useState('')
  const [clickedRail, setClickedRail] = useState<Panel | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  // every tool opens at the top of its page, not wherever the last one was scrolled to
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [panel])
  const busy = useEditor((s) => s.busy)
  // first visit to the editor: show the guided tour of the interface
  const loadedDir = useEditor((s) => s.project?.dir)
  useEffect(() => {
    if (!loadedDir) return
    // the practice project opens with the hands on tour instead
    const queued = takeQueuedTour()
    if (queued) setTimeout(() => startTour(queued), 700)
    else maybeAutoStart('editor')
  }, [loadedDir])

  // picking a transition or effect on the timeline opens its settings
  const selKind = useEditor((s) => s.selection?.kind)
  useEffect(() => {
    if (selKind === 'effect' || selKind === 'transition') useEditor.getState().setPanel('effects')
  }, [selKind])

  useEffect(() => {
    api.loadPresets().then(setPresets)
    // hooks for the automated self test in src/main/selftest.ts (harmless in normal use)
    ;(window as unknown as { __scrim: unknown }).__scrim = {
      panel: (p: Panel) => useEditor.getState().setPanel(p),
      settings: () => setSettingsOpen(true),
      exportDialog: () => setExporting(true),
      patchCursor: (patch: Record<string, unknown>) => useEditor.getState().update((e) => Object.assign(e.cursor, patch)),
      seek: (t: number) => useEditor.getState().setTime(t),
      play: (on: boolean) => useEditor.getState().setPlaying(on),
      addText: (t: number) => addTextAt(t),
      addTransitionItem: (type: string, at: number) => addTransitionItem(type as import('@shared/types').TransitionType, at),
      clickSound: () => useEditor.getState().project!.edit.cursor.clickSound,
      lastText: () => { const ts = useEditor.getState().project!.edit.texts; return ts[ts.length - 1] },
      patchText: (patch: Record<string, unknown>) => useEditor.getState().update((e) => Object.assign(e.texts[e.texts.length - 1], patch)),
      fakeWords: (w: unknown) => ((window as unknown as { __fakeWords: unknown }).__fakeWords = w),
      saveTo: (d: string) => ((window as unknown as { __saveTo: string }).__saveTo = d),
      engineTest: (bytes: number[]) => engineSelfTest(new Uint8Array(bytes)),
      edit: () => useEditor.getState().project!.edit,
      patchEdit: (patch: Record<string, unknown>) => useEditor.getState().update((e) => Object.assign(e, patch)),
      saveSettings: (patch: Record<string, unknown>) => useSettings.getState().save(patch),
      undo: () => useEditor.getState().undo(),
      textById: (id: string, patch?: Record<string, unknown>) => { if (patch) useEditor.getState().update((e) => Object.assign(e.texts.find((x) => x.id === id)!, patch)); return useEditor.getState().project!.edit.texts.find((x) => x.id === id) },
      lanes: () => useEditor.getState().project!.edit.texts.map((x) => x.lane ?? 0),
      patch: (key: string, patch: Record<string, unknown>) => useEditor.getState().update((e) => Object.assign((e as unknown as Record<string, object>)[key], patch)),
      import: (paths: string[]) => importMedia(useEditor.getState().project!.dir, paths, timeBus.get()),
      estimate: () => {
        const st = useEditor.getState()
        return estimateExportSeconds(st.project!, st.cursorData, st.project!.edit.export)
      },
      tour: () => ({ active: useTour.getState().active, seen: useSettings.getState().settings.toursSeen, onboarded: useSettings.getState().settings.onboarded }),
      state: () => {
        const e = useEditor.getState().project!.edit
        const st = useEditor.getState()
        return { transitionTypes: [e.transitions.intro.type, e.transitions.outro.type, ...Object.values(e.transitions.perCut).map((x) => x.type)], transitionItems: e.transitions.items.length, effectClips: e.effectClips.length, time: st.time, duration: st.project!.media.screen.duration, leadIn: e.leadIn ?? 0, clips: e.clips.length, busy: st.busy, zoomEnabled: e.zoom.enabled, clickEffect: e.cursor.clickEffect, overlays: e.overlays.length, audioClips: e.audioClips.length, assets: e.assets.map((a) => a.kind) }
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
      const arrowSetting = useSettings.getState().settings.arrowStep ?? 0.5
      const arrow = arrowSetting > 0 ? arrowSetting : 1 / fps
      const step = (d: number) => {
        st.setPlaying(false)
        st.setTime(Math.max(-(st.project!.edit.leadIn ?? 0), Math.min(project.media.screen.duration, timeBus.get() + d)))
      }
      const actions: Record<string, () => void> = {
        playPause: () => st.setPlaying(!st.playing),
        undo: () => st.undo(),
        redo: () => st.redo(),
        split: splitAtPlayhead,
        delete: deleteSelection,
        addZoom: () => addZoomAt(timeBus.get()),
        addText: () => addTextAt(timeBus.get()),
        stepBack: () => step(-arrow),
        stepForward: () => step(arrow),
        jumpBack: () => step(-arrow * 5),
        jumpForward: () => step(arrow * 5),
        frameBack: () => step(-1 / fps),
        frameForward: () => step(1 / fps),
        goStart: () => jump(-1),
        goEnd: () => jump(1),
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
    const cs = sortedClips(st.project!.edit.clips)
    const lead = st.project!.edit.leadIn ?? 0
    st.setTime(dir < 0 ? (lead > 0 ? -lead : cs[0]?.start ?? 0) : Math.max(0, (cs[cs.length - 1]?.end ?? 0) - 0.05))
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
      className="fade-in"
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
      <header className="drag surface win-head" style={{ height: 48, display: 'flex', alignItems: 'center', gap: 4, padding: '0 150px 0 10px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <button className="icon-btn" title="Back to home" onClick={async () => { await flushSave(); location.hash = '/' }}><Icon name="back" /></button>
        <button className="icon-btn" title="Show project folder" onClick={() => api.showItem(project.media.screen.path)}><Icon name="folder" /></button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 650, fontSize: 13.5, textAlign: 'center', width: 300, outline: 'none' }}
          />
        </div>
        <div style={{ position: 'relative' }} ref={presetsRef}>
          <button data-tour="presets" className="btn ghost sm" onClick={() => setPresetsOpen((o) => !o)}><Icon name="bookmark" size={15} /> Presets <Icon name="chevron" size={13} /></button>
          {presetsOpen && (
            <div className="menu glass pop-in" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', width: 270, zIndex: 50 }}>
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
        <button className="icon-btn" title="Help, report a problem, suggest a feature" onClick={(e) => openContextMenu(e, helpMenu(() => startTour('editor')))}><Icon name="help" /></button>
        <button className="icon-btn" title={`Settings (${kb('settings')})`} onClick={() => setSettingsOpen(true)}><Icon name="gear" /></button>
        <button data-tour="export" className="btn primary sm" style={{ marginLeft: 4, height: 32 }} onClick={() => { useEditor.getState().setPlaying(false); setExporting(true) }}><Icon name="download" size={15} /> Export</button>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <nav data-tour="rail" className="surface rail" style={{ width: 68, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 8, borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
          {RAIL.map((r) => (
            <button
              key={r.id}
              data-tour={`tool-${r.id}`}
              className={`rail-btn ${panel === r.id ? 'active' : ''} ${clickedRail === r.id ? 'clicked' : ''}`}
              title={r.title}
              onClick={() => {
                setClickedRail(r.id)
                setPanel(r.id)
                setTimeout(() => setClickedRail((cur) => (cur === r.id ? null : cur)), 450)
              }}
            >
              <RailIcon id={r.id} active={panel === r.id} clicked={clickedRail === r.id} size={20} />
              <span>{r.label ?? r.title}</span>
              {r.soon && <span className="rail-soon-dot" />}
            </button>
          ))}
          <RailMore />
        </nav>
        <div
          style={{
            width: panelCollapsed ? 0 : 360,
            flexShrink: 0,
            transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
          }}
        >
          <aside
            ref={panelRef}
            data-tour="panel"
            className="surface"
            style={{
              width: 360,
              height: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '18px 16px 30px',
              borderRight: '1px solid var(--line)',
            }}
          >
            <div className="fade-in" key={panel}>
              {panel === 'background' && <BackgroundPanel />}
              {panel === 'frame' && <FramePanel />}
              {panel === 'cursor' && <CursorPanel />}
              {panel === 'zoom' && <ZoomPanel />}
              {panel === 'text' && <TextPanel />}
              {panel === 'blur' && <BlurPanel />}
              {panel === 'media' && <MediaPanel />}
              {panel === 'webcam' && <WebcamPanel />}
              {panel === 'audio' && <AudioPanel />}
              {panel === 'keys' && <KeysPanel />}
              {panel === 'settings' && <ClipPanel />}
              {panel === 'effects' && <EffectsPanel />}
              {panel === 'ai' && <CaptionsPanel />}
              {panel === 'tidy' && <TidyPanel />}
              {panel === 'guide' && <GuidePanel />}
              {panel === 'brand' && <BrandPanel />}
            </div>
          </aside>
        </div>
        {/* Collapse/expand toggle — lives OUTSIDE overflow:hidden so it's always visible */}
        <button
          onClick={() => setPanelCollapsed((c) => !c)}
          title={panelCollapsed ? 'Expand panel' : 'Collapse panel'}
          style={{
            flexShrink: 0,
            alignSelf: 'center',
            width: 22,
            height: 48,
            border: 'none',
            borderRadius: '0 8px 8px 0',
            background: 'var(--panel)',
            borderTop: '1px solid var(--line)',
            borderRight: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dim)',
            padding: 0,
            marginRight: 4,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--hover)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--panel)')}
        >
          <span style={{ display: 'flex', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)', transform: panelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <Icon name="back" size={14} />
          </span>
        </button>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 22px 10px', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 110 }}>
              <Select compact value={project.edit.aspect} options={ASPECTS} onChange={(v) => update((e) => (e.aspect = v))} />
            </div>
            {project.edit.aspect !== 'auto' && (
              <button
                className={`btn ghost sm ${project.edit.reframe === 'follow' ? 'on' : ''}`}
                data-test="follow"
                title="Fill the whole video with the recording and move with the cursor (great for vertical videos)"
                onClick={() => update((e) => (e.reframe = e.reframe === 'follow' ? 'fit' : 'follow'))}
              >
                <Icon name="target" size={15} /> {project.edit.reframe === 'follow' ? 'Following cursor' : 'Follow cursor'}
              </button>
            )}
            <button data-tour="crop" className="btn ghost sm" onClick={() => setPanel('background')}><Icon name="crop" size={15} /> Crop</button>
          </div>

          <Preview />

          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div className="transport-side" />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              <TimeLabel />
              <button className="icon-btn" onClick={() => jump(-1)} title="Go to start"><Icon name="prev" /></button>
              <button data-tour="play" className="play-btn" onClick={() => useEditor.getState().setPlaying(!playing)} title={`Play / pause (${kb('playPause')})`}>
                <Icon name={playing ? 'pause' : 'play'} size={19} />
              </button>
              <button className="icon-btn" onClick={() => jump(1)} title="Go to end"><Icon name="next" /></button>
              <span className="hint" style={{ minWidth: 56 }}>{fmtTime(outputDuration(project.edit.clips, project.edit.leadIn ?? 0))}</span>
            </div>
            <div className="transport-side" />
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

/** Shows the time as it will be in the exported video (after cuts, speed and intro space). */
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
  return <span className="hint" style={{ minWidth: 56, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(sourceToOutput(useEditor.getState().project!.edit.clips, t, useEditor.getState().project!.edit.leadIn ?? 0), true)}</span>
}
