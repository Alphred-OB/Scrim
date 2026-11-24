import { useEffect, useRef } from 'react'
import type { WebcamBg } from '@shared/types'
import { applyCamBg, loadSegmenter } from '@/features/editor/engine/webcamBg'

export interface LiveBg { bg?: WebcamBg; bgBlur?: number; bgColor?: string }

/**
 * A camera feed with the background removed, blurred or replaced as it plays (like a video call).
 * The recording itself stays the plain camera; the editor applies the same look, so you can still change it later.
 */
export default function LiveCam({ stream, live, style }: { stream: MediaStream | null; live: LiveBg; style?: React.CSSProperties }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cfg = useRef(live)
  cfg.current = live

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.srcObject = stream
    void v.play().catch(() => {})
    void loadSegmenter()
    let stop = false
    let busy = false
    const step = () => {
      if (stop) return
      const c = canvas.current
      const cf = cfg.current
      if (c && v.videoWidth && !busy) {
        busy = true
        try {
          const w = v.videoWidth
          const h = v.videoHeight
          const wc = { bg: cf.bg ?? 'none', bgBlur: cf.bgBlur ?? 0.6, bgColor: cf.bgColor ?? '#1d2230' } as Parameters<typeof applyCamBg>[1]
          const out = applyCamBg({ src: v, w, h }, wc, undefined)
          if (c.width !== w) c.width = w
          if (c.height !== h) c.height = h
          const g = c.getContext('2d')!
          g.clearRect(0, 0, w, h)
          g.drawImage(out.src, 0, 0, w, h)
        } finally {
          busy = false
        }
      }
      v.requestVideoFrameCallback(step)
    }
    v.requestVideoFrameCallback(step)
    return () => {
      stop = true
      v.srcObject = null
    }
  }, [stream])

  return (
    <>
      <video ref={video} muted playsInline style={{ display: 'none' }} />
      <canvas ref={canvas} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} />
    </>
  )
}
