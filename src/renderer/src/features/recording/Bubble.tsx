import { useEffect, useState } from 'react'
import type { WebcamBg } from '@shared/types'
import LiveCam from './LiveCam'
import { webcamConstraints } from '@/lib/mediaCapture'

/** The floating webcam bubble shown while recording. Drag it anywhere. */
export default function Bubble({ query }: { query: string }) {
  const q = new URLSearchParams(query)
  const shape = q.get('shape') ?? 'circle'
  const device = q.get('device') || undefined
  const bg = (q.get('bg') ?? 'none') as WebcamBg
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: webcamConstraints(device, 480), audio: false })
      .then((s) => {
        stream = s
        setStream(s)
      })
      .catch(() => {})
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [device])

  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '22%' : '6px'
  const cut = bg === 'remove' // just you, floating over the screen
  return (
    <div style={{ position: 'fixed', inset: 6, borderRadius: cut ? 0 : radius, overflow: 'hidden', WebkitAppRegion: 'drag', boxShadow: cut ? 'none' : '0 10px 30px rgba(0,0,0,.45)', border: cut ? 'none' : '3px solid rgba(255,255,255,.9)', background: cut ? 'transparent' : '#111' } as React.CSSProperties}>
      <LiveCam stream={stream} live={{ bg, bgBlur: Number(q.get('blur') ?? 0.6), bgColor: q.get('color') ?? '#1d2230' }} style={{ transform: 'scaleX(-1)' }} />
    </div>
  )
}
