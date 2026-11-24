import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Transition } from '@shared/types'
import { Icon, Toggle } from '@/ui'
import { TRANSITIONS, TransitionOptions, TransitionTile } from '../panels/EffectsPanel'

/**
 * Pops up next to a joint on the timeline: every transition plays as a little moving preview,
 * so you pick by how it looks, not by its name.
 */
export function TransitionPicker({ x, y, title, cur, own, canInherit, onChange, onClose, onMore }: {
  x: number
  y: number
  title: string
  cur: Transition
  own: boolean
  canInherit: boolean
  onChange: (t: Transition | null, key?: string) => void
  onClose: () => void
  onMore: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect()
    // open above the joint when there's room, and never off screen
    const top = y - r.height - 14 > 8 ? y - r.height - 14 : Math.min(window.innerHeight - r.height - 8, y + 14)
    setPos({ x: Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2)), y: Math.max(8, top) })
  }, [x, y])
  useEffect(() => {
    const off = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      // clicks on menus that belong to the picker (dropdowns) keep it open
      if (e.target instanceof Element && e.target.closest('.select-list, .menu')) return
      onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', off, true)
    window.addEventListener('keydown', esc)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', off, true)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  return (
    <div ref={ref} className="tpick" style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="tpick-head">
        <Icon name="transition" size={15} />
        <span>{title}</span>
        <button className="icon-btn" title="Close" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      {canInherit && (
        <div className="tpick-inherit">
          <Toggle label="Same as every cut" value={!own} onChange={(v) => onChange(v ? null : { ...cur })} />
        </div>
      )}
      <div className="tpick-grid">
        {TRANSITIONS.map((t) => (
          <TransitionTile
            key={t.v}
            type={t.v}
            name={t.l}
            on={cur.type === t.v}
            hint={t.v === 'none' ? 'No transition, a straight cut' : `Use ${t.l}`}
            onPick={() => onChange({ ...cur, type: t.v, duration: cur.duration || 0.6 })}
          />
        ))}
      </div>
      {cur.type !== 'none' && (
        <div className="tpick-opts">
          <TransitionOptions value={cur} onChange={(p) => onChange({ ...cur, ...p }, 'tpick-opts')} />
        </div>
      )}
      <button className="tpick-more" onClick={onMore}>
        Open the Transitions page <Icon name="arrowRight" size={13} />
      </button>
    </div>
  )
}
