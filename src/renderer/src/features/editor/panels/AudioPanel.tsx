import { useEditor } from '../state/store'
import { Icon, Section, Slider, Toggle } from '@/ui'
import { api } from '@/lib/api'

export default function AudioPanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const a = project.edit.audio
  const m = project.media

  const pickMusic = async () => {
    const f = await api.openFile('Choose background music', [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'aac'] }])
    if (!f) return
    const p = await api.copyAsset(project.dir, f)
    update((e) => (e.audio.musicPath = p))
  }

  return (
    <div>
      <Section title="Microphone">
        {m.mic ? (
          <>
            <Toggle label="Mute microphone" value={a.micMuted} onChange={(v) => update((e) => (e.audio.micMuted = v))} />
            <Slider label="Volume" value={a.micVolume} min={0} max={2} step={0.01} def={1} disabled={a.micMuted} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.audio.micVolume = v), 'micv')} />
            <span className="hint">Above 100% is applied on export (preview tops out at 100%).</span>
          </>
        ) : (
          <span className="hint">No microphone track in this recording.</span>
        )}
      </Section>

      <Section title="System audio">
        {m.system ? (
          <>
            <Toggle label="Mute system audio" value={a.systemMuted} onChange={(v) => update((e) => (e.audio.systemMuted = v))} />
            <Slider label="Volume" value={a.systemVolume} min={0} max={2} step={0.01} def={0.8} disabled={a.systemMuted} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.audio.systemVolume = v), 'sysv')} />
          </>
        ) : (
          <span className="hint">No system audio track in this recording.</span>
        )}
      </Section>

      {(m.mic || m.system || m.webcam) && (
        <Section title="Sync">
          <Slider label="Audio delay" value={a.syncOffset} min={-0.5} max={0.5} step={0.01} def={0} format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 1000)} ms`} onChange={(v) => update((e) => (e.audio.syncOffset = v), 'sync')} />
          <span className="hint">If your voice or camera is a little ahead of or behind the screen, nudge it here. Plus means later.</span>
        </Section>
      )}

      <Section title="Background music" action={a.musicPath ? <button className="link" style={{ color: 'var(--danger)' }} onClick={() => update((e) => (e.audio.musicPath = undefined))}>Remove</button> : undefined}>
        <button className="btn" onClick={pickMusic}><Icon name="audio" size={16} /> {a.musicPath ? 'Replace music' : 'Add music'}</button>
        {a.musicPath && (
          <>
            <div className="chip" style={{ maxWidth: '100%', overflow: 'hidden' }}>{a.musicPath.split(/[\\/]/).pop()}</div>
            <Toggle label="Mute music" value={a.musicMuted} onChange={(v) => update((e) => (e.audio.musicMuted = v))} />
            <Slider label="Volume" value={a.musicVolume} min={0} max={1} step={0.01} def={0.25} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.audio.musicVolume = v), 'musv')} />
            <span className="hint">Music loops to fill the video and fades out at the end.</span>
          </>
        )}
      </Section>
    </div>
  )
}
