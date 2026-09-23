import { useEffect, useState } from 'react'
import type { RecorderStatus } from '@shared/types'
import { api } from '@/lib/api'
import { Icon, fmtTime } from '@/ui'
import { useSettings } from '@/lib/settings'

/** The floating record bar: timer, pause/resume and stop. Nothing on it can delete a recording. */
export default function Toolbar() {
  const [s, setS] = useState<RecorderStatus>({ state: 'idle', elapsed: 0 })
  const keys = useSettings((x) => x.settings.shortcuts)
  const stopKey = keys.stopRecording || 'Alt+Shift+S'
  const pauseKey = keys.pauseRecording || 'Alt+Shift+P'
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    api.recorderStatus().then(setS)
    return api.on('recorder:status', setS)
  }, [])

  if (s.state === 'countdown') {
    return (
      <div className="recbar">
        <span className="recbar-grip" />
        <span className="recbar-count" key={s.countdown}>{s.countdown}</span>
        <span className="recbar-label">Recording starts…</span>
        <button className="recbar-text" onClick={() => api.cancelRecording()}>Cancel</button>
      </div>
    )
  }

  const stopping = s.state === 'stopping'
  const paused = s.state === 'paused'
  return (
    <div className={`recbar ${paused ? 'paused' : ''}`}>
      <span className="recbar-grip" title="Drag to move" />
      <span className={`recbar-dot ${stopping ? 'idle' : ''}`} />
      <div className="recbar-time">
        <b>{stopping ? 'Saving…' : fmtTime(s.elapsed)}</b>
        <small>{stopping ? 'Opening the editor' : paused ? 'Paused' : 'Recording'}</small>
      </div>
      <div className="recbar-sep" />
      <button
        className="recbar-btn"
        title={`${paused ? 'Resume' : 'Pause'} (${pauseKey})`}
        disabled={stopping}
        onClick={() => (paused ? api.resumeRecording() : api.pauseRecording())}
      >
        <Icon name={paused ? 'play' : 'pause'} size={16} />
      </button>
      <button className="recbar-stop" title={`Stop and edit (${stopKey})`} disabled={stopping} onClick={() => api.stopRecording()}>
        {stopping ? <span className="spin" /> : <span className="recbar-square" />}
      </button>
    </div>
  )
}
