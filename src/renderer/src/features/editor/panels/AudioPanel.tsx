import { useEditor } from '../state/store'
import { Icon, Section, Slider, Toggle } from '@/ui'

export default function AudioPanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const a = project.edit.audio
  const m = project.media



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

      {a.musicPath && (
        <Section title="Background music" action={<button className="link" style={{ color: 'var(--danger)' }} onClick={() => update((e) => (e.audio.musicPath = undefined))}>Remove</button>}>
          <div className="chip" style={{ maxWidth: '100%', overflow: 'hidden' }}>{a.musicPath.split(/[\\/]/).pop()}</div>
          <Slider label="Volume" value={a.musicVolume} min={0} max={1} step={0.01} def={0.25} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.audio.musicVolume = v), 'musv')} />
          <span className="hint">Music from an older version of Scrim. To add music now, import it in the Media library and drag it onto the Audio track.</span>
        </Section>
      )}
      {!a.musicPath && (
        <Section title="Music and sound effects">
          <button className="btn" onClick={() => useEditor.getState().setPanel('media')}><Icon name="music" size={16} /> Open the media library</button>
          <span className="hint">Import music or sounds in the Media library, then drag them onto the Audio track.</span>
        </Section>
      )}
    </div>
  )
}
