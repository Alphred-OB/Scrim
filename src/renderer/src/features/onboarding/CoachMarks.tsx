import { useEffect, useLayoutEffect, useState } from 'react'
import { TOURS, useTour } from './tours'

type Rect = { x: number; y: number; w: number; h: number }

/**
 * Spotlight tour over the real interface: dims everything except one element and explains it.
 * Steps whose element isn't on screen are skipped.
 */
export default function CoachMarks() {
  const active = useTour((s) => s.active)
  const stop = useTour((s) => s.stop)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const steps = active ? TOURS[active] : []
  const step = steps[i]

  useEffect(() => setI(0), [active])

  // find the element; skip steps that aren't available on this screen
  useLayoutEffect(() => {
    if (!active || !step) return
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
      const r = el?.getBoundingClientRect()
      if (!r || r.width < 2 || r.height < 2) return false
      setRect({ x: r.x, y: r.y, w: r.width, h: r.height })
      return true
    }
    if (!measure()) {
      if (i < steps.length - 1) setI(i + 1)
      else stop()
      return
    }
    const on = () => measure()
    window.addEventListener('resize', on)
    const id = setInterval(on, 400) // follow layout changes (panels opening, scrolling)
    return () => {
      window.removeEventListener('resize', on)
      clearInterval(id)
    }
  }, [active, i, step?.target])

  useEffect(() => {
    if (!active) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') i < steps.length - 1 ? setI(i + 1) : stop()
      else if (e.key === 'ArrowLeft') setI(Math.max(0, i - 1))
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [active, i, steps.length])

  if (!active || !step || !rect) return null
  const pad = 6
  const hole = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardW = 300
  // place the card next to the element, kept on screen
  const place = step.place ?? 'bottom'
  let left = place === 'right' ? hole.x + hole.w + 14 : place === 'left' ? hole.x - cardW - 14 : hole.x + hole.w / 2 - cardW / 2
  let top = place === 'bottom' ? hole.y + hole.h + 14 : place === 'top' ? hole.y - 14 - 170 : hole.y + Math.min(hole.h / 2 - 60, 40)
  if (place === 'left' && left < 12) left = hole.x + 24
  left = Math.max(12, Math.min(vw - cardW - 12, left))
  top = Math.max(12, Math.min(vh - 190, top))
  const last = i === steps.length - 1

  return (
    <div className="coach" onMouseDown={(e) => e.stopPropagation()}>
      <svg className="coach-dim" width={vw} height={vh}>
        <defs>
          <mask id="coach-hole">
            <rect width={vw} height={vh} fill="#fff" />
            <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={12} fill="#000" />
          </mask>
        </defs>
        <rect width={vw} height={vh} fill="rgba(0,0,0,.6)" mask="url(#coach-hole)" />
        <rect className="coach-ring" x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={12} />
      </svg>
      <div className="coach-card" style={{ left, top, width: cardW }} key={i}>
        <div className="coach-count">{i + 1} of {steps.length}</div>
        <b>{step.title}</b>
        <p>{step.body}</p>
        <div className="coach-foot">
          <button className="link" onClick={stop}>{last ? '' : 'Skip'}</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn sm primary" onClick={() => (last ? stop() : setI(i + 1))}>{last ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
