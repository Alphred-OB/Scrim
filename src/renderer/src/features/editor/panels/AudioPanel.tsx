import { useState } from 'react'
import { useEditor } from '../state/store'
import { Icon, Section, Slider, Toggle, showMessage } from '@/ui'
import { api } from '@/lib/api'

/** Voice clean up: noise and hum removed, level evened out. Makes a cleaned copy that plays instead of the mic. */
function VoiceClean() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const a = project.edit.audio
  const mic = project.media.mic!
  const [busy, setBusy] = useState(false)
  const [strength, setStrength] = useState(a.voiceCleanStrength ?? 0.5)
  const stale = !!a.voiceCleanPath && Math.abs((a.voiceCleanStrength ?? 0.5) - strength) > 0.01
  const run = async (s: number) => {
    setBusy(true)
    try {
      const out = await api.cleanVoice(mic.path, project.dir, s)
      update((e) => {
        e.audio.voiceClean = true
        e.audio.voiceCleanPath = out
        e.audio.voiceCleanStrength = s
      })
    } catch (e) {
      showMessage("Couldn't clean up the voice", e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Voice clean up">
      <span className="hint">Takes out fan hum, keyboard noise and room echo, and evens out loud and quiet parts so any microphone sounds clear.</span>
      <Toggle
        label="Clean up my voice"
        value={!!a.voiceClean}
        onChange={(v) => {
          if (v && !a.voiceCleanPath) run(strength)
          else update((e) => (e.audio.voiceClean = v))
        }}
      />
      <Slider label="Strength" value={strength} min={0} max={1} step={0.05} def={0.5} disabled={busy} format={(v) => (v < 0.34 ? 'Light' : v > 0.66 ? 'Strong' : 'Medium')} onChange={setStrength} />
      {(busy || stale) && (
        <button className="btn" disabled={busy} onClick={() => run(strength)}>
          {busy ? <><span className="spin" /> Cleaning up…</> : 'Apply the new strength'}
        </button>
      )}
      {a.voiceClean && !busy && <span className="hint">Turn it off to hear the original. Both play in the preview and the export.</span>}
    </Section>
  )
}

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
      {m.mic && <VoiceClean />}

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
