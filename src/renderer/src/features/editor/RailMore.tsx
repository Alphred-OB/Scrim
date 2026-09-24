import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/ui'
import { useEditor } from './state/store'

/** Small arrow at the bottom (or top) of the tool rail when some tools are out of view. */
export default function RailMore() {
  const ref = useRef<HTMLDivElement>(null)
  const [down, setDown] = useState(false)
  const [up, setUp] = useState(false)
  useEffect(() => {
    const nav = ref.current?.parentElement
    if (!nav) return
    const check = () => {
      setDown(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 4)
      setUp(nav.scrollTop > 4)
    }
    check()
    nav.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(nav)
    return () => {
      nav.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [])
  // when a tool opens from somewhere else (a shortcut, the timeline), bring its button into view
  const panel = useEditor((s) => s.panel)
  useEffect(() => {
    const nav = ref.current?.parentElement
    const btn = nav?.querySelector('.rail-btn.active') as HTMLElement | null
    if (!nav || !btn) return
    const n = nav.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    if (b.top < n.top) nav.scrollBy({ top: b.top - n.top - 6, behavior: 'smooth' })
    else if (b.bottom > n.bottom - 26) nav.scrollBy({ top: b.bottom - n.bottom + 32, behavior: 'smooth' })
  }, [panel])
  const go = (dy: number) => ref.current?.parentElement?.scrollBy({ top: dy, behavior: 'smooth' })
  return (
    <div ref={ref} className="rail-more-wrap">
      {down && (
        <button className="rail-more" title="More tools" onClick={() => go(240)}>
          <Icon name="chevron" size={14} />
        </button>
      )}
      {!down && up && (
        <button className="rail-more up" title="Back to the top" onClick={() => go(-9999)}>
          <Icon name="chevron" size={14} />
        </button>
      )}
    </div>
  )
}
