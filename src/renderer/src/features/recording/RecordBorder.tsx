import { useEffect, useRef, useState } from 'react'
import type { RecorderStatus } from '@shared/types'
import { api } from '@/lib/api'

/**
 * Full size, click-through window around the recorded area: a blue frame with a bright line
 * travelling around it. It shows during the countdown and the first seconds of recording (and
 * again briefly after resuming), then fades away so it never gets in the way. While paused it
 * stays on in amber so it's obvious nothing is being recorded.
 */
export default function RecordBorder() {
  const [state, setState] = useState<RecorderStatus['state']>('countdown')
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const runner = useRef<SVGRectElement>(null)
  const [visible, setVisible] = useState(true)
  const prev = useRef<RecorderStatus['state']>('countdown')

  // decide when to show: countdown and paused stay on; recording shows for a moment then fades
  useEffect(() => {
    const was = prev.current
    prev.current = state
    if (state !== 'recording') return setVisible(state === 'countdown' || state === 'paused')
    setVisible(true)
    const id = setTimeout(() => setVisible(false), was === 'paused' ? 2000 : 3500)
    return () => clearTimeout(id)
  }, [state])

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
    if (paused || !visible) return
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
  }, [paused, perimeter, visible])

  return (
    <svg width={size.w} height={size.h} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', opacity: visible ? 1 : 0, transition: `opacity ${visible ? 0.2 : 0.8}s ease` }}>
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
