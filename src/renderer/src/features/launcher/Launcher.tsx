import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureSource, Corner, ProjectSummary, RecorderStatus, WebcamRecordOptions, WebcamShape } from '@shared/types'
import { api, mediaUrl } from '@/lib/api'
import { webcamConstraints } from '@/lib/mediaCapture'
import { Icon, Seg, Slider, Toggle, fmtTime, Select, openContextMenu, askConfirm, showMessage } from '@/ui'
import SettingsModal from '@/features/settings/SettingsModal'
import { matches, useSettings } from '@/lib/settings'
import { openProjectFromDialog } from '@/lib/openProject'
import { maybeAutoStart } from '@/features/onboarding/tours'
import { preloadSample, startPractice } from '@/features/onboarding/practice'

const LS = 'df.recordPrefs'
interface Prefs { mic: boolean; micDeviceId?: string; systemAudio: boolean; fps: 30 | 60; countdown: number; keys: boolean; webcam: WebcamRecordOptions }
const DEF: Prefs = {
  mic: true,
  systemAudio: true,
  fps: 30,
  countdown: 3,
  keys: true,
  webcam: { enabled: false, quality: 720, shape: 'circle', size: 0.24, corner: 'br', showBubble: true }
}
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(LS) || '{}')
    return { ...DEF, ...p, webcam: { ...DEF.webcam, ...(p.webcam ?? {}) } }
  } catch {
    return DEF
  }
}

export default function Launcher() {
  // start on a simple choice: record something new, or edit what you have
  const [tab, setTab] = useState<'home' | 'record' | 'projects'>('home')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'long'>('recent')
  const [dropping, setDropping] = useState(false)
  const [kind, setKind] = useState<'screen' | 'window'>('screen')
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [status, setStatus] = useState<RecorderStatus>({ state: 'idle', elapsed: 0 })
  const [busy, setBusy] = useState('')
  const [level, setLevel] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const recBusy = status.state === 'recording' || status.state === 'paused' || status.state === 'countdown' || status.state === 'stopping'
  const cam = prefs.webcam
  // after the welcome tour, point out the home screen once
  const onboarded = useSettings((s) => s.settings.onboarded)
  useEffect(() => {
    if (tab === 'home' && onboarded) maybeAutoStart('home')
  }, [tab, onboarded])
  useEffect(() => {
    if (recBusy) setTab('record')
  }, [recBusy])
  // get the practice project ready in the background, so opening it is instant
  useEffect(() => {
    const id = setTimeout(() => preloadSample(), 2500)
    return () => clearTimeout(id)
  }, [])
  const setCam = (p: Partial<WebcamRecordOptions>) => setPrefs((s) => ({ ...s, webcam: { ...s.webcam, ...p } }))

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.listSources()
      setSources(s)
      setSelected((cur) => (s.some((x) => x.id === cur) ? cur : s.find((x) => x.kind === 'screen')?.id ?? ''))
    } finally {
      setLoading(false)
    }
  }, [])
  const loadProjects = useCallback(() => api.listProjects().then(setProjects), [])

  useEffect(() => {
    refresh()
    loadProjects()
    const devices = () =>
      navigator.mediaDevices.enumerateDevices().then((d) => {
        setMics(d.filter((x) => x.kind === 'audioinput' && x.deviceId !== 'default' && x.deviceId !== 'communications'))
        setCams(d.filter((x) => x.kind === 'videoinput'))
      })
    devices()
    navigator.mediaDevices.addEventListener('devicechange', devices)
    api.recorderStatus().then(setStatus)
    const off = api.on('recorder:status', (s: RecorderStatus) => {
      setStatus(s)
      if (s.state === 'idle') loadProjects()
    })
    return () => {
      off()
      navigator.mediaDevices.removeEventListener('devicechange', devices)
    }
  }, [refresh, loadProjects])

  // Ctrl+O opens a project or video from anywhere on the home screen
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-back')) return
      if (matches(e, useSettings.getState().settings.shortcuts.open || 'Ctrl+O')) {
        e.preventDefault()
        openProjectFromDialog()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs])

  // live mic level meter
  const raf = useRef(0)
  useEffect(() => {
    if (!prefs.mic || tab !== 'record' || recBusy) return setLevel(0)
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let stopped = false
    navigator.mediaDevices
      .getUserMedia({ audio: prefs.micDeviceId ? { deviceId: { exact: prefs.micDeviceId } } : true })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        ctx = new AudioContext()
        const an = ctx.createAnalyser()
        an.fftSize = 512
        ctx.createMediaStreamSource(s).connect(an)
        const buf = new Uint8Array(an.fftSize)
        let last = 0
        const loop = (now: number) => {
          if (now - last > 80) {
            last = now
            an.getByteTimeDomainData(buf)
            let peak = 0
            for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
            setLevel(Math.min(1, peak / 90))
          }
          raf.current = requestAnimationFrame(loop)
        }
        raf.current = requestAnimationFrame(loop)
      })
      .catch(() => setLevel(0))
    return () => {
      stopped = true
      cancelAnimationFrame(raf.current)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close()
    }
  }, [prefs.mic, prefs.micDeviceId, tab, recBusy])

  // live webcam preview before recording
  const camVideo = useRef<HTMLVideoElement>(null)
  const [camError, setCamError] = useState('')
  useEffect(() => {
    if (!cam.enabled || tab !== 'record' || recBusy) return
    let stream: MediaStream | null = null
    let stopped = false
    setCamError('')
    navigator.mediaDevices
      .getUserMedia({ video: webcamConstraints(cam.deviceId, 480), audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (camVideo.current) camVideo.current.srcObject = s
        navigator.mediaDevices.enumerateDevices().then((d) => setCams(d.filter((x) => x.kind === 'videoinput')))
      })
      .catch((e) => setCamError(e?.name === 'NotAllowedError' ? 'Camera permission was blocked.' : 'No camera found or it is busy in another app.'))
    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [cam.enabled, cam.deviceId, tab, recBusy])

  const src = sources.find((s) => s.id === selected)
  const list = sources.filter((s) => s.kind === kind)

  const record = async () => {
    if (!src) return
    await api.startRecording({
      sourceId: src.id,
      sourceName: src.name,
      kind: src.kind,
      fps: prefs.fps,
      mic: prefs.mic,
      micDeviceId: prefs.micDeviceId,
      systemAudio: prefs.systemAudio,
      countdown: prefs.countdown,
      keys: prefs.keys,
      webcam: cam.enabled ? cam : undefined
    })
  }

  const doImport = async (file?: string) => {
    setBusy('Importing video…')
    try {
      const p = await api.importVideo(file)
      if (p) api.openEditor(p.dir)
    } catch (e) {
      showMessage("That video couldn't be imported", String(e).replace(/^Error:\s*/, ''))
    } finally {
      setBusy('')
    }
  }

  const q = query.trim().toLowerCase()
  const shown = projects
    .filter((p) => p.name.toLowerCase().includes(q))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'long' ? b.duration - a.duration : b.updatedAt - a.updatedAt))
  const projectMenu = (p: ProjectSummary) => [
    { label: 'Open', onClick: () => api.openEditor(p.dir) },
    { label: 'Show in folder', onClick: () => api.showItem(p.dir) },
    { sep: true },
    { label: 'Delete', danger: true, onClick: async () => { if (await askConfirm({ title: `Delete "${p.name}"?`, body: 'The project and its recording will be removed for good. This can\'t be undone.', ok: 'Delete', danger: true })) { await api.deleteProject(p.dir); loadProjects() } } }
  ]

  // R and E on the home screen
  useEffect(() => {
    if (tab !== 'home') return
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || document.querySelector('.modal-back, .ob-back, .coach')) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'r' || e.key === 'R') setTab('record')
      else if (e.key === 'e' || e.key === 'E') setTab('projects')
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [tab])

  const camRadius = cam.shape === 'circle' ? '50%' : cam.shape === 'rounded' ? '22%' : '6px'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="drag surface win-head" style={{ height: 52, display: 'flex', alignItems: 'center', gap: 16, padding: '0 150px 0 18px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        {tab !== 'home' ? (
          <button className="icon-btn" title="Back" onClick={() => setTab('home')} disabled={recBusy && tab === 'record'}><Icon name="back" /></button>
        ) : null}
        <button className="brand" onClick={() => setTab('home')} title="Home">
          <span className="brand-mark" />
          <b>Scrim</b>
        </button>
        {tab !== 'home' && <span className="crumb">{tab === 'record' ? 'New recording' : 'Your projects'}</span>}
        <div style={{ flex: 1 }} />
        <button
          data-tour="help"
          className="icon-btn"
          title="Take the tour"
          onClick={() => {
            setTab('home')
            const s = useSettings.getState()
            s.save({ onboarded: false, toursSeen: (s.settings.toursSeen ?? []).filter((t) => t !== 'home') })
          }}
        >
          <Icon name="help" />
        </button>
        <button data-tour="settings" className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}><Icon name="gear" /></button>
      </header>

      {status.state === 'error' && (
        <div className="fade-in" style={{ margin: '14px 22px 0', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,69,58,.12)', border: '1px solid rgba(255,69,58,.3)', whiteSpace: 'pre-wrap', fontSize: 12.5 }}>
          <b>Recording failed.</b> {status.error}
        </div>
      )}

      {tab === 'home' && (
        <div className="home">
          <div className="home-choices">
            <button data-tour="home-record" className="home-card rec" onMouseMove={spot} onClick={() => setTab('record')}>
              <div className="hc-art rec-art" aria-hidden>
                <div className="ra-screen">
                  <div className="ra-bar"><i /><i /><i /></div>
                  <div className="ra-body"><span /><span /><span /><span /></div>
                  <span className="ra-cursor" />
                  <span className="ra-ripple" />
                </div>
                <span className="ra-rec"><span /> REC 0:12</span>
              </div>
              <div className="hc-body">
                <span className="home-icon"><Icon name="record" size={22} /></span>
                <div>
                  <b>Record</b>
                  <span>Your screen, a window or a browser tab, with mic and webcam.</span>
                </div>
                <kbd>R</kbd>
              </div>
            </button>
            <button data-tour="home-edit" className="home-card edit" onMouseMove={spot} onClick={() => setTab('projects')}>
              <div className="hc-art edit-art" aria-hidden>
                <div className="ea-preview"><span /></div>
                <div className="ea-tracks">
                  <div><span style={{ left: '2%', width: '60%' }} /><span style={{ left: '64%', width: '34%' }} /></div>
                  <div><span style={{ left: '14%', width: '22%' }} /><span style={{ left: '58%', width: '18%' }} /></div>
                  <div><span style={{ left: '30%', width: '40%' }} /></div>
                  <i className="ea-head" />
                </div>
              </div>
              <div className="hc-body">
                <span className="home-icon"><Icon name="scissors" size={20} /></span>
                <div>
                  <b>Edit</b>
                  <span>Open a project, or bring in any video to polish.</span>
                </div>
                <kbd>E</kbd>
              </div>
            </button>
          </div>
          <div className="home-quick">
            <button onClick={() => doImport()}><Icon name="upload" size={14} /> Import a video</button>
            <button onClick={() => openProjectFromDialog()}><Icon name="folder" size={14} /> Open a project <kbd>Ctrl O</kbd></button>
            <button data-tour="home-practice" className="accent" onClick={() => startPractice()}><Icon name="sparkles" size={14} /> Practice on a sample</button>
          </div>
          {projects.length > 0 && (
            <div className="home-recent" data-tour="home-recent">
              <div className="section-head">
                <span className="section-title">Jump back in</span>
                <button className="link" onClick={() => setTab('projects')}>See all {projects.length} <Icon name="arrowRight" size={12} /></button>
              </div>
              <div className="home-recent-row">
                {projects.slice(0, 4).map((p, k) => (
                  <button key={p.dir} className="recent-tile" style={{ animationDelay: `${k * 60}ms` }} onClick={() => api.openEditor(p.dir)}>
                    <div className="rt-thumb" style={{ backgroundImage: p.thumb ? `url(${mediaUrl(p.thumb)})` : undefined }}>
                      <span className="rt-dur">{fmtTime(p.duration)}</span>
                      <span className="rt-play"><Icon name="play" size={14} /></span>
                    </div>
                    <b>{p.name}</b>
                    <span>{ago(p.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'record' ? (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, padding: 22, overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 260 }}>
                <Seg
                  options={[
                    { v: 'screen', l: <><Icon name="monitor" size={15} /> Screens</> },
                    { v: 'window', l: <><Icon name="window" size={15} /> Windows</> }
                  ]}
                  value={kind}
                  onChange={(v) => {
                    setKind(v as 'screen' | 'window')
                    if (src?.kind !== v) setSelected(sources.find((x) => x.kind === v)?.id ?? '')
                  }}
                />
              </div>
              <button className="btn sm" onClick={refresh} disabled={loading}>{loading ? <span className="spin" /> : <Icon name="restart" size={14} />} Refresh</button>
              <span className="hint">{kind === 'window' ? 'For a browser tab, pick the browser window and keep that tab open.' : 'Pick the display you want to record.'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
              {list.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  onDoubleClick={record}
                  className="glass"
                  style={{
                    textAlign: 'left', padding: 8, borderRadius: 16, cursor: 'pointer', boxShadow: 'none',
                    borderColor: selected === s.id ? 'var(--accent)' : undefined,
                    outline: selected === s.id ? '3px solid var(--accent-soft)' : 'none',
                    transition: 'transform .15s var(--ease)'
                  }}
                >
                  <div style={{ aspectRatio: '16/9', borderRadius: 10, background: '#000 center/contain no-repeat', backgroundImage: `url(${s.thumbnail})` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '0 4px 2px' }}>
                    {s.appIcon ? <img src={s.appIcon} width={16} height={16} /> : <Icon name={s.kind === 'screen' ? 'monitor' : 'window'} size={15} />}
                    <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  </div>
                </button>
              ))}
              {!list.length && !loading && <div className="hint">Nothing found. Click Refresh.</div>}
            </div>
          </div>

          <aside className="surface" style={{ width: 350, borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
            <div className="side-col" style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="section-title">Audio</span>
              <Toggle label="Microphone" value={prefs.mic} onChange={(v) => setPrefs({ ...prefs, mic: v })} />
              {prefs.mic && (
                <>
                  <Select
                    value={prefs.micDeviceId ?? ''}
                    options={[{ v: '', l: 'Default microphone' }, ...mics.map((m) => ({ v: m.deviceId, l: m.label || 'Microphone' }))]}
                    onChange={(v) => setPrefs({ ...prefs, micDeviceId: v || undefined })}
                  />
                  <div className="mic-meter" title="Speak to test your microphone">
                    <Icon name="mic" size={14} />
                    <div>{Array.from({ length: 16 }, (_, k) => <i key={k} className={level * 16 > k ? (k > 12 ? 'hot' : 'on') : ''} />)}</div>
                    <span>{level > 0.03 ? 'Hearing you' : 'Say something'}</span>
                  </div>
                </>
              )}
              <Toggle label="System audio" value={prefs.systemAudio} onChange={(v) => setPrefs({ ...prefs, systemAudio: v })} />

              <span className="section-title" style={{ marginTop: 12 }}>Webcam</span>
              <Toggle label="Record webcam" value={cam.enabled} onChange={(v) => setCam({ enabled: v })} />
              {cam.enabled && (
                <>
                  {/* preview of where the camera will sit */}
                  <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', background: src ? `#000 center/cover url(${src.thumbnail})` : '#000', border: '1px solid var(--line)' }}>
                    <div
                      style={{
                        position: 'absolute',
                        width: `${cam.size * 56.25}%`,
                        aspectRatio: '1',
                        borderRadius: camRadius,
                        overflow: 'hidden',
                        border: '2px solid #fff',
                        boxShadow: '0 6px 18px rgba(0,0,0,.5)',
                        background: '#111',
                        [cam.corner.endsWith('l') ? 'left' : 'right']: '4%',
                        [cam.corner.startsWith('t') ? 'top' : 'bottom']: '6%',
                        transition: 'all .2s var(--ease)'
                      } as React.CSSProperties}
                    >
                      <video ref={camVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    </div>
                    {camError && <div className="hint" style={{ position: 'absolute', left: 10, top: 8, right: 10, color: '#fff', background: 'rgba(0,0,0,.6)', padding: '4px 8px', borderRadius: 6 }}>{camError}</div>}
                  </div>
                  <Select
                    value={cam.deviceId ?? ''}
                    options={[{ v: '', l: 'Default camera' }, ...cams.map((c) => ({ v: c.deviceId, l: c.label || 'Camera' }))]}
                    onChange={(v) => setCam({ deviceId: v || undefined })}
                  />
                  <Seg options={[{ v: 'circle', l: 'Circle' }, { v: 'rounded', l: 'Rounded' }, { v: 'square', l: 'Square' }]} value={cam.shape} onChange={(v) => setCam({ shape: v as WebcamShape })} />
                  <Slider label="Size" value={cam.size} min={0.12} max={0.45} step={0.01} def={0.24} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setCam({ size: v })} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => (
                      <button key={c} className="btn sm" style={{ borderColor: cam.corner === c ? 'var(--accent)' : undefined, background: cam.corner === c ? 'var(--accent-soft)' : undefined }} onClick={() => setCam({ corner: c })}>
                        {{ tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' }[c]}
                      </button>
                    ))}
                  </div>
                  <Toggle label="Show bubble while recording" value={cam.showBubble} onChange={(v) => setCam({ showBubble: v })} />
                  <span className="hint">The camera is saved as its own file, so you can move, resize, reshape or hide it later in the editor.</span>
                </>
              )}

              <span className="section-title" style={{ marginTop: 12 }}>Video</span>
              <Seg options={[{ v: 30, l: '30 fps' }, { v: 60, l: '60 fps' }]} value={prefs.fps} onChange={(v) => setPrefs({ ...prefs, fps: v as 30 | 60 })} />
              <span className="section-title" style={{ marginTop: 12 }}>Keyboard</span>
              <Toggle label="Show keyboard shortcuts" value={prefs.keys} onChange={(v) => setPrefs({ ...prefs, keys: v })} />
              <span className="hint">Shortcuts like Ctrl+C or Enter can be shown in the video. What you type is never saved.</span>
              <span className="section-title" style={{ marginTop: 12 }}>Countdown</span>
              <Seg options={[{ v: 0, l: 'Off' }, { v: 3, l: '3s' }, { v: 5, l: '5s' }]} value={prefs.countdown} onChange={(v) => setPrefs({ ...prefs, countdown: v as number })} />
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--line)' }}>
              <button className="btn primary" style={{ width: '100%', height: 46, fontSize: 15, borderRadius: 12 }} disabled={!src || recBusy} onClick={record}>
                <Icon name="record" size={15} /> Start recording
              </button>
              <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>Stop with Alt+Shift+S, the floating bar, or the tray icon.</div>
            </div>
          </aside>
        </div>
      ) : tab === 'projects' ? (
        <div
          className="projects-page fade-in"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setDropping(true)
          }}
          onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
          onDrop={async (e) => {
            setDropping(false)
            const f = e.dataTransfer.files[0]
            if (!f) return
            e.preventDefault()
            await doImport(api.pathForFile(f))
          }}
        >
          <div className="projects-head">
            <div>
              <h2>Projects <span className="count-pill">{projects.length}</span></h2>
              <span className="hint">Right click a project for more. Drop a video anywhere to import it.</span>
            </div>
            <div style={{ flex: 1 }} />
            <div className="search-wrap">
              <Icon name="search" size={15} />
              <input className="search" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div style={{ width: 230 }}>
              <Seg options={[{ v: 'recent', l: 'Recent' }, { v: 'name', l: 'Name' }, { v: 'long', l: 'Longest' }]} value={sort} onChange={(v) => setSort(v as typeof sort)} />
            </div>
            <button className="btn" onClick={() => openProjectFromDialog()} title="Ctrl+O"><Icon name="folder" size={15} /> Open…</button>
            <button className="btn primary" onClick={() => doImport()}><Icon name="upload" size={15} /> Import a video</button>
          </div>
          <div className="proj-grid">
            <button className="proj-new" onClick={() => setTab('record')}>
              <span className="pn-icon"><Icon name="record" size={20} /></span>
              <b>New recording</b>
              <span>Screen, window or tab</span>
            </button>
            {shown.map((p, k) => (
              <div
                key={p.dir}
                className="proj-card"
                style={{ animationDelay: `${Math.min(k, 12) * 35}ms` }}
                onClick={() => api.openEditor(p.dir)}
                onContextMenu={(e) => openContextMenu(e, projectMenu(p))}
              >
                <div className="pc-thumb" style={{ backgroundImage: p.thumb ? `url(${mediaUrl(p.thumb)})` : undefined }}>
                  <span className="rt-dur">{fmtTime(p.duration)}</span>
                  <span className="rt-play"><Icon name="play" size={16} /></span>
                </div>
                <div className="pc-meta">
                  <div>
                    <b>{p.name}</b>
                    <span>Edited {ago(p.updatedAt)}</span>
                  </div>
                  <button className="icon-btn pc-more" title="More" onClick={(e) => { e.stopPropagation(); openContextMenu(e, projectMenu(p)) }}>
                    <Icon name="more" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!shown.length && projects.length > 0 && <div className="hint" style={{ marginTop: 20, textAlign: 'center' }}>Nothing matches "{query}".</div>}
          {!projects.length && (
            <div className="empty-state" style={{ marginTop: 18 }}>
              <Icon name="film" size={30} />
              <b>No projects yet</b>
              <span>Import a video, drop one here, or try the practice project.</span>
              <button className="btn primary" onClick={() => startPractice()}><Icon name="sparkles" size={14} /> Practice on a sample</button>
            </div>
          )}
          {dropping && <div className="drop-veil">Drop to import</div>}
        </div>
      ) : null}
      {busy && <div className="toast glass"><span className="spin" />{busy}</div>}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

/** Hover glow that follows the mouse on the big home cards. */
function spot(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}


/** "just now", "5 min ago", "yesterday", then a date. */
function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 172800) return 'yesterday'
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
