import { useEffect, useRef, useState } from 'react'
import type { RecorderStatus } from '@shared/types'
import { api } from '@/lib/api'

/**
 * Full size, click-through window around the recorded area. A soft blue frame with a bright
 * line that keeps travelling around it, so it's always clear what's being recorded.
 * Turns amber and stops moving while paused.
 */
export default function RecordBorder() {
  const [state, setState] = useState<RecorderStatus['state']>('countdown')
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const runner = useRef<SVGRectElement>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    api.recorderStatus().then((s: RecorderStatus) => setState(s.state))
    const off = api.on('recorder:status', (s: RecorderStatus) => setState(s.state))
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => {
      off()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const inset = 2
  const w = Math.max(0, size.w - inset * 2)
  const h = Math.max(0, size.h - inset * 2)
  const r = 10
  const perimeter = 2 * (w + h - 4 * r) + 2 * Math.PI * r
  const seg = Math.min(perimeter * 0.22, 700)
  const paused = state === 'paused'
  const color = paused ? '#ffb020' : '#2f8bff'

  // move the bright segment with rAF: steady speed in px/s whatever the window size
  useEffect(() => {
    if (paused) return
    let raf = 0
    let off = 0
    let last = performance.now()
    const speed = Math.max(350, perimeter / 4) // one lap in about 4 seconds
    const step = (now: number) => {
      off = (off + ((now - last) / 1000) * speed) % perimeter
      last = now
      runner.current?.setAttribute('stroke-dashoffset', String(-off))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [paused, perimeter])

  return (
    <svg width={size.w} height={size.h} style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      <rect x={inset} y={inset} width={w} height={h} rx={r} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={3} />
      {!paused && (
        <rect
          ref={runner}
          x={inset}
          y={inset}
          width={w}
          height={h}
          rx={r}
          fill="none"
          stroke="#8fc2ff"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${seg} ${perimeter - seg}`}
        />
      )}
    </svg>
  )
}
