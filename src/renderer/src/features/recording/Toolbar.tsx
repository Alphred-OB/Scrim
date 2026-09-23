import { useEffect, useState } from 'react'
import type { RecorderStatus } from '@shared/types'
import { api } from '@/lib/api'
import { Icon, fmtTime } from '@/ui'
import { useSettings } from '@/lib/settings'

export default function Toolbar() {
  const [s, setS] = useState<RecorderStatus>({ state: 'idle', elapsed: 0 })
  const stopKey = useSettings((x) => x.settings.shortcuts.stopRecording)
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    api.recorderStatus().then(setS)
    return api.on('recorder:status', setS)
  }, [])

  const bar: React.CSSProperties = {
    height: 56,
    margin: 4,
    borderRadius: 18,
    background: 'rgba(22,23,28,.92)',
    backdropFilter: 'blur(20px)',
    border: '1px solid #2c2d34',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 10px 0 16px',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    WebkitAppRegion: 'drag'
  } as React.CSSProperties
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

  if (s.state === 'countdown') {
    return (
      <div style={{ ...bar, justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700 }}>Recording in</span>
        <span style={{ fontSize: 26, fontWeight: 800, color: '#ff4d5e', fontVariantNumeric: 'tabular-nums' }}>{s.countdown}</span>
        <button className="btn sm" style={noDrag} onClick={() => api.cancelRecording()}>Cancel</button>
      </div>
    )
  }

  const stopping = s.state === 'stopping'
  return (
    <div style={bar}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: stopping ? '#888' : '#ff4d5e', animation: stopping ? '' : 'blink 1.2s infinite' }} />
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 52 }}>{stopping ? 'Saving' : fmtTime(s.elapsed)}</span>
      <span style={{ flex: 1, fontSize: 11, color: '#8b8f9c' }}>{stopping ? '' : stopKey}</span>
      <button className="icon-btn" style={noDrag} title="Restart" disabled={stopping} onClick={() => api.restartRecording()}>
        <Icon name="restart" />
      </button>
      <button className="icon-btn" style={noDrag} title="Discard" disabled={stopping} onClick={() => api.cancelRecording()}>
        <Icon name="trash" />
      </button>
      <button className="btn danger sm" style={{ ...noDrag, height: 36 }} disabled={stopping} onClick={() => api.stopRecording()}>
        {stopping ? <span className="spin" /> : <Icon name="stop" size={14} />} Stop
      </button>
      <style>{'@keyframes blink{50%{opacity:.25}}'}</style>
    </div>
  )
}
