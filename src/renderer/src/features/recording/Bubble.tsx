import { useEffect, useRef } from 'react'
import { webcamConstraints } from '@/lib/mediaCapture'

/** The floating webcam bubble shown while recording. Drag it anywhere. */
export default function Bubble({ query }: { query: string }) {
  const q = new URLSearchParams(query)
  const shape = q.get('shape') ?? 'circle'
  const device = q.get('device') || undefined
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: webcamConstraints(device, 480), audio: false })
      .then((s) => {
        stream = s
        if (ref.current) ref.current.srcObject = s
      })
      .catch(() => {})
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [device])

  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '22%' : '6px'
  return (
    <div style={{ position: 'fixed', inset: 6, borderRadius: radius, overflow: 'hidden', WebkitAppRegion: 'drag', boxShadow: '0 10px 30px rgba(0,0,0,.45)', border: '3px solid rgba(255,255,255,.9)', background: '#111' } as React.CSSProperties}>
      <video ref={ref} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
    </div>
  )
}
