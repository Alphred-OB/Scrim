import { useEffect, useState } from 'react'
import { SHORTCUTS, defaultSettings } from '@shared/defaults'
import type { AppSettings, ExportSound } from '@shared/types'
import { useSettings, comboFromEvent, playDoneSound } from '@/lib/settings'
import { api } from '@/lib/api'
import { Icon, Select, Seg, Slider, Toggle } from '@/ui'

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

  useEffect(() => {
    api.engines().then((e) => setDda(e.dda)).catch(() => setDda(false))
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
          <div className="hint" style={{ padding: 8 }}>Scrim 0.3</div>
        </nav>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <header className="modal-head">
            <b>{TABS.find((t) => t.id === tab)!.label}</b>
            <button className="icon-btn" onClick={onClose} title="Close"><Icon name="x" /></button>
          </header>
          <div style={{ flex: 1, padding: '6px 22px 22px', overflowY: 'auto' }}>

          {tab === 'general' && (
            <div className="section">
              <span className="section-title">Screen capture engine</span>
              <Seg
                options={[{ v: 'auto', l: 'Automatic' }, { v: 'dda', l: 'GPU (fast)' }, { v: 'gdi', l: 'Compatibility' }]}
                value={settings.captureEngine}
                onChange={(v) => save({ captureEngine: v as AppSettings['captureEngine'] })}
              />
              <span className="hint">
                GPU capture (Desktop Duplication) is smooth and light on low end PCs, and keeps the record bar and webcam bubble out of your video.
                Compatibility mode works everywhere but uses more CPU. {dda === null ? 'Checking your PC…' : dda ? 'GPU capture is available on this PC.' : 'GPU capture is not available on this PC, so Compatibility mode is used.'}
              </span>
            </div>
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

          {tab === 'appearance' && (
            <div className="section">
              <span className="section-title">Theme</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {(
                  [
                    { id: 'dark', l: 'Dark', bg: 'linear-gradient(135deg,#1b1c22,#0a0b0e)' },
                    { id: 'light', l: 'Light', bg: 'linear-gradient(135deg,#ffffff,#dfe1e6)' },
                    { id: 'system', l: 'Match Windows', bg: 'linear-gradient(135deg,#f5f5f7 50%,#1b1c22 50%)' }
                  ] as const
                ).map((t) => {
                  const on = settings.theme === t.id
                  return (
                    <button key={t.id} className={`theme-card ${on ? 'on' : ''}`} onClick={() => save({ theme: t.id })}>
                      <div style={{ height: 70, borderRadius: 8, background: t.bg, border: '1px solid var(--line)' }} />
                      <b>{t.l}</b>
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: 14 }}>
                <Toggle label="Reduce transparency (faster on low end PCs)" value={settings.reduceTransparency} onChange={(v) => save({ reduceTransparency: v })} />
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="section">
              <span className="section-title">AI features</span>
              {[
                { t: 'AI captions', d: 'Automatic subtitles from your voice, fully editable and styled like your text layers.' },
                { t: 'Smart annotations', d: 'AI reads your screen and suggests callouts and highlights on the important moments.' },
                { t: 'Auto trim silences', d: 'Finds long pauses and dead air so you can cut them in one click.' }
              ].map((f) => (
                <div key={f.t} style={{ padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{f.t}</b>
                    <span className="badge">Coming soon</span>
                  </div>
                  <div className="hint" style={{ marginTop: 4 }}>{f.d}</div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
