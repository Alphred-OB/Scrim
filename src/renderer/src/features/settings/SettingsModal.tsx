import { useEffect, useState } from 'react'
import { SHORTCUTS, defaultSettings } from '@shared/defaults'
import type { AppSettings, Aspect, ExportSound } from '@shared/types'
import { useSettings, comboFromEvent, playDoneSound } from '@/lib/settings'
import { api, type CacheStats, type EncoderInfo } from '@/lib/api'
import { Icon, ProgressViz, PROGRESS_STYLES, Select, Seg, Slider, Toggle } from '@/ui'
import AppearanceTab from './AppearanceTab'
import { UpdateSettings, useUpdate } from '@/lib/update'
import { PrivacySettings } from '@/lib/feedback'

type Tab = 'general' | 'shortcuts' | 'export' | 'appearance' | 'ai'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'gear' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
  { id: 'export', label: 'Export', icon: 'download' },
  { id: 'appearance', label: 'Appearance', icon: 'sparkles' },
  { id: 'ai', label: 'AI', icon: 'wand' }
]

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('general')
  const settings = useSettings((s) => s.settings)
  const save = useSettings((s) => s.save)
  const [recording, setRecording] = useState<string | null>(null)
  const [dda, setDda] = useState<boolean | null>(null)
  const [encoders, setEncoders] = useState<EncoderInfo[]>([])
  const [projectsDir, setProjectsDir] = useState<string>('')
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [cacheMsg, setCacheMsg] = useState('')

  // fake progress that loops so the animation previews move
  const [demo, setDemo] = useState(0.1)
  useEffect(() => {
    if (tab !== 'export') return
    const id = setInterval(() => setDemo((d) => (d >= 1 ? 0 : Math.min(1, d + 0.04))), 120)
    return () => clearInterval(id)
  }, [tab])

  useEffect(() => {
    api.engines().then((e) => setDda(e.dda)).catch(() => setDda(false))
    api.listEncoders().then(setEncoders).catch(() => {})
    api.projectsRoot().then(setProjectsDir).catch(() => {})
    api.getCacheStats().then(setCacheStats).catch(() => {})
  }, [])

  // capture the next key combo for a shortcut
  useEffect(() => {
    if (!recording) return
    const on = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(null)
      const combo = comboFromEvent(e)
      if (!combo || ['Ctrl', 'Alt', 'Shift', 'Ctrl+Shift', 'Ctrl+Alt', 'Alt+Shift'].includes(combo)) return
      save({ shortcuts: { ...settings.shortcuts, [recording]: combo } })
      setRecording(null)
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [recording, settings.shortcuts, save])

  const conflicts = (id: string, combo: string) => Object.entries(settings.shortcuts).some(([k, v]) => k !== id && v.toLowerCase() === combo.toLowerCase())
  const setSound = (patch: Partial<AppSettings['exportSound']>) => save({ exportSound: { ...settings.exportSound, ...patch } })

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass" style={{ width: 760, height: 560, padding: 0, display: 'flex', overflow: 'hidden' }}>
        <nav style={{ width: 190, padding: 14, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 15, padding: '6px 8px 14px' }}>Settings</div>
          {TABS.map((t) => (
            <button key={t.id} className={`menu-item ${tab === t.id ? 'hi' : ''}`} onClick={() => setTab(t.id)}>
              <span className="mi-icon"><Icon name={t.icon} size={15} /></span>
              {t.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div className="hint" style={{ padding: 8 }}>Scrim {useUpdate((x) => x.s?.current) ?? ''}</div>
        </nav>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <header className="modal-head">
            <b>{TABS.find((t) => t.id === tab)!.label}</b>
            <button className="icon-btn" onClick={onClose} title="Close"><Icon name="x" /></button>
          </header>
          <div style={{ flex: 1, padding: '6px 22px 22px', overflowY: 'auto' }}>

          {tab === 'general' && (
            <>
              <div className="section">
                <span className="section-title">Screen capture engine</span>
                <Seg
                  options={[{ v: 'auto', l: 'Automatic' }, { v: 'dda', l: 'GPU (fast)' }, { v: 'gdi', l: 'Compatibility' }]}
                  value={settings.captureEngine}
                  onChange={(v) => save({ captureEngine: v as AppSettings['captureEngine'] })}
                />
                <span className="hint">
                  GPU capture (Desktop Duplication) is smooth and light on low end PCs, and keeps the record bar and webcam bubble out of your video.
                  Compatibility mode works everywhere but uses more CPU, and hides the record bar while recording (it would show up in your video), so you stop with Alt+Shift+S or the tray icon. {dda === null ? 'Checking your PC…' : dda ? 'GPU capture is available on this PC.' : 'GPU capture is not available on this PC, so Compatibility mode is used.'}
                </span>
              </div>

              <div className="section">
                <span className="section-title">While recording</span>
                <Toggle label="Outline what's being recorded" value={settings.recordBorder ?? true} onChange={(v) => save({ recordBorder: v })} />
                <span className="hint">A blue outline shows for the first few seconds (and while paused) so you know exactly what's being recorded, then fades away. It never appears in your video.</span>
                <span className="section-title" style={{ marginTop: 10 }}>Welcome tour</span>
                <button className="btn" onClick={() => { save({ onboarded: false, toursSeen: [] }); onClose() }}><Icon name="help" size={15} /> Show the welcome tour again</button>
              </div>

              <div className="section">
                <span className="section-title">Editor & timeline</span>
                <Toggle
                  label="Magnetic snapping on timeline"
                  value={settings.timelineMagnet ?? false}
                  onChange={(v) => save({ timelineMagnet: v })}
                />
                <span className="hint">Clips, transitions, and playhead snap magnetically to edges when dragging on the timeline.</span>
                <span className="section-title" style={{ marginTop: 10 }}>Default aspect ratio</span>
                <Select
                  value={settings.defaultAspect ?? '16:9'}
                  options={[
                    { v: '16:9', l: '16:9 · Landscape (YouTube, standard displays)' },
                    { v: '9:16', l: '9:16 · Vertical (TikTok, Reels, Shorts)' },
                    { v: '1:1', l: '1:1 · Square (Instagram, LinkedIn)' },
                    { v: '4:3', l: '4:3 · Classic' },
                    { v: '21:9', l: '21:9 · Ultrawide' }
                  ]}
                  onChange={(v) => save({ defaultAspect: v as Aspect })}
                />
                <span className="hint">Default canvas shape for newly recorded or imported videos. You can change it anytime in the editor.</span>
                <span className="section-title" style={{ marginTop: 10 }}>Arrow keys in the editor</span>
                <Select
                  value={settings.arrowStep ?? 0.5}
                  options={[
                    { v: 0, l: 'One frame' },
                    { v: 0.1, l: '0.1 second' },
                    { v: 0.25, l: '0.25 second' },
                    { v: 0.5, l: '0.5 second' },
                    { v: 1, l: '1 second' },
                    { v: 2, l: '2 seconds' },
                    { v: 5, l: '5 seconds' }
                  ]}
                  onChange={(v) => save({ arrowStep: v })}
                />
                <span className="hint">Left and Right move the playhead by this much. Hold Shift to move 5 times further. Comma and period always move one frame.</span>
              </div>

              <div className="section">
                <span className="section-title">Projects storage</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="field-input"
                    style={{ flex: 1 }}
                    type="text"
                    readOnly
                    value={projectsDir || 'Loading…'}
                    title={projectsDir}
                  />
                  <button
                    className="btn"
                    onClick={async () => {
                      const f = await api.chooseFolder('Choose folder for Scrim projects')
                      if (f) {
                        await save({ projectsDir: f })
                        const next = await api.projectsRoot()
                        setProjectsDir(next)
                      }
                    }}
                  >
                    <Icon name="folder" size={15} /> Change…
                  </button>
                  <button
                    className="btn"
                    onClick={() => projectsDir && api.openPath(projectsDir)}
                    title="Open folder in File Explorer"
                  >
                    <Icon name="folderOpen" size={14} /> Open
                  </button>
                  {settings.projectsDir && (
                    <button
                      className="btn"
                      onClick={async () => {
                        await save({ projectsDir: undefined })
                        const next = await api.projectsRoot()
                        setProjectsDir(next)
                      }}
                      title="Reset to Documents/Scrim"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <span className="hint">Where your raw recordings and project files are kept. Scrim still finds existing projects in your Documents folder.</span>
              </div>

              <div className="section">
                <div className="section-head">
                  <span className="section-title">Temporary cache & disk space</span>
                  {cacheStats && (
                    <span className="hint" style={{ fontWeight: 600 }}>
                      {cacheStats.humanSize} ({cacheStats.fileCount} files)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="btn"
                    title="Includes the light preview copies of long recordings. They are made again the next time you open that project."
                    onClick={async () => {
                      setCacheMsg('Clearing cache…')
                      try {
                        const res = await api.clearCache()
                        const next = await api.getCacheStats()
                        setCacheStats(next)
                        setCacheMsg(`Cleared ${res.humanFreed}`)
                        setTimeout(() => setCacheMsg(''), 3000)
                      } catch {
                        setCacheMsg('Failed to clear cache')
                      }
                    }}
                  >
                    <Icon name="trash" size={15} /> Clear temporary cache
                  </button>
                  {cacheMsg && <span className="hint" style={{ color: 'var(--accent)', fontWeight: 600 }}>{cacheMsg}</span>}
                </div>
                <span className="hint">Cleans up speech transcription models, temporary renders, and thumbnail caches. Your saved projects and recordings are never touched.</span>
              </div>

              <div className="section">
                <span className="section-title">System & background</span>
                <Toggle
                  label="Launch Scrim at Windows startup"
                  value={settings.openAtLogin ?? false}
                  onChange={(v) => save({ openAtLogin: v })}
                />
                <span className="hint">Starts Scrim when you sign into Windows so it is always ready to record.</span>
                <Toggle
                  label="Minimize to system tray on close"
                  value={settings.minimizeToTray ?? false}
                  onChange={(v) => save({ minimizeToTray: v })}
                />
                <span className="hint">Closing the Scrim window keeps it active in the background. Use the tray icon or Alt+Shift+S anytime.</span>
              </div>

              <UpdateSettings />
              <PrivacySettings />
            </>
          )}

          {tab === 'shortcuts' && (
            <div className="section">
              <div className="section-head">
                <span className="section-title">Keyboard shortcuts</span>
                <button className="link" onClick={() => save({ shortcuts: defaultSettings().shortcuts })}>Reset all</button>
              </div>
              <span className="hint">Click a shortcut, then press the new keys. Esc cancels.</span>
              <div className="list">
                {SHORTCUTS.map((s) => {
                  const combo = settings.shortcuts[s.id] ?? s.def
                  const clash = conflicts(s.id, combo)
                  return (
                    <div key={s.id} className="list-row">
                      <span style={{ flex: 1 }}>{s.label}</span>
                      {clash && <span className="badge" title="Another action uses the same keys">Clash</span>}
                      <button className={`keycaps ${recording === s.id ? 'rec' : ''}`} onClick={() => setRecording(s.id)}>
                        {recording === s.id ? 'Press keys…' : combo.split('+').map((k, i) => <kbd key={i}>{k.replace('Arrow', '')}</kbd>)}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'export' && (
            <>
              <div className="section">
                <span className="section-title">Default export folder</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="field-input"
                    style={{ flex: 1 }}
                    type="text"
                    readOnly
                    value={settings.exportDir || 'Default (Videos folder)'}
                    title={settings.exportDir || 'Videos folder'}
                  />
                  <button
                    className="btn"
                    onClick={async () => {
                      const f = await api.chooseFolder('Choose default export folder')
                      if (f) save({ exportDir: f })
                    }}
                  >
                    <Icon name="folder" size={15} /> Browse…
                  </button>
                  {settings.exportDir && (
                    <button className="btn" onClick={() => save({ exportDir: undefined })} title="Reset to Videos folder">
                      Reset
                    </button>
                  )}
                </div>
                <span className="hint">When you export, the save dialog opens in this folder by default.</span>
              </div>

              <div className="section">
                <span className="section-title">Hardware video encoder</span>
                <Select
                  value={settings.videoEncoder ?? 'auto'}
                  options={[
                    { v: 'auto', l: 'Automatic (recommended)' },
                    ...encoders.filter((e) => e.id !== 'auto').map((e) => ({
                      v: e.id,
                      l: e.available ? e.name : `${e.name} (Not available on this PC)`
                    }))
                  ]}
                  onChange={(v) => save({ videoEncoder: v as AppSettings['videoEncoder'] })}
                />
                <span className="hint">
                  {settings.videoEncoder === 'cpu'
                    ? 'Software x264 runs on your CPU. It is compatible everywhere but uses more CPU.'
                    : 'Hardware GPU encoding (NVIDIA NVENC, Intel QSV, or AMD AMF) encodes fast with minimal CPU load. Automatic uses the best available GPU encoder.'}
                </span>
              </div>

              <div className="section">
                <span className="section-title">Progress animation</span>
                <div className="progress-pick">
                  {PROGRESS_STYLES.map((p) => (
                    <button key={p.id} className={`pick-tile ${(settings.exportProgress ?? 'wavy') === p.id ? 'on' : ''}`} onClick={() => save({ exportProgress: p.id })}>
                      <ProgressViz kind={p.id} value={demo} size={p.id === 'bar' ? 44 : 64} bare />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
                <Toggle label="Confetti when it's done" value={settings.exportCelebrate ?? true} onChange={(v) => save({ exportCelebrate: v })} />
              </div>
            </>
          )}
          {tab === 'export' && (
            <div className="section">
              <span className="section-title">When an export finishes</span>
              <Toggle label="Play a sound" value={settings.exportSound.enabled} onChange={(v) => setSound({ enabled: v })} />
              {settings.exportSound.enabled && (
                <>
                  <Select
                    value={settings.exportSound.sound}
                    options={[
                      { v: 'chime', l: 'Chime' },
                      { v: 'success', l: 'Success' },
                      { v: 'pop', l: 'Pop' },
                      { v: 'custom', l: 'Custom sound file' }
                    ]}
                    onChange={(v) => setSound({ sound: v as ExportSound })}
                  />
                  {settings.exportSound.sound === 'custom' && (
                    <button
                      className="btn"
                      onClick={async () => {
                        const f = await api.openFile('Choose a sound', [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }])
                        if (f) setSound({ customPath: f })
                      }}
                    >
                      <Icon name="audio" size={15} /> {settings.exportSound.customPath ? settings.exportSound.customPath.split(/[\\/]/).pop() : 'Choose file'}
                    </button>
                  )}
                  <Slider label="Volume" value={settings.exportSound.volume} min={0.05} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setSound({ volume: v })} />
                  <button className="btn" onClick={() => playDoneSound()}><Icon name="play" size={12} /> Test sound</button>
                </>
              )}
              <span className="hint">You also get a Windows notification, so you can do other things while it exports.</span>
            </div>
          )}

          {tab === 'appearance' && <AppearanceTab settings={settings} save={save} />}

          {tab === 'ai' && <AiTab />}

          </div>
        </div>
      </div>
    </div>
  )
}

/** Speech to text engine for captions, text editing and guide titles. */
function AiTab() {
  const settings = useSettings((s) => s.settings)
  const save = useSettings((s) => s.save)
  const [show, setShow] = useState(false)
  const engine = settings.transcribeEngine ?? 'auto'
  const hasKey = !!settings.groqKey?.trim()
  return (
    <>
      <div className="section">
        <span className="section-title">Speech to text</span>
        <span className="hint">Used for captions, editing by text and the titles of guide steps.</span>
        <Seg
          options={[{ v: 'auto', l: 'Automatic' }, { v: 'groq', l: 'Groq (online)' }, { v: 'local', l: 'This PC (offline)' }]}
          value={engine}
          onChange={(v) => save({ transcribeEngine: v as 'auto' | 'groq' | 'local' })}
        />
        <span className="hint">
          {engine === 'auto'
            ? hasKey
              ? 'Groq is used, and this PC takes over if Groq is unreachable.'
              : 'No Groq key yet, so Whisper runs on this PC.'
            : engine === 'groq'
              ? 'Very fast and accurate. Your audio is sent to Groq to be transcribed.'
              : 'Nothing leaves your PC. Slower, and the model downloads the first time.'}
        </span>
      </div>
      <div className="section">
        <span className="section-title">Groq API key</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="field-input"
            style={{ flex: 1 }}
            type={show ? 'text' : 'password'}
            placeholder="gsk_..."
            value={settings.groqKey ?? ''}
            spellCheck={false}
            onChange={(e) => save({ groqKey: e.target.value.trim() })}
          />
          <button className="btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <span className="hint">Get a free key at console.groq.com, under API Keys. It's stored only on this PC.</span>
      </div>
      <div className="section">
        <span className="section-title">Offline model</span>
        <Seg
          options={[{ v: 'tiny', l: 'Fast (40 MB)' }, { v: 'base', l: 'Balanced (80 MB)' }, { v: 'small', l: 'Accurate (250 MB)' }]}
          value={settings.localModel ?? 'base'}
          onChange={(v) => save({ localModel: v as 'tiny' | 'base' | 'small' })}
        />
        <span className="hint">Bigger models hear better but take longer. It downloads once, then works without internet.</span>
      </div>
    </>
  )
}
