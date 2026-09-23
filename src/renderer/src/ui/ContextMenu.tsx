import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react'
import { create } from 'zustand'

export interface MenuItem {
  label?: string
  icon?: ReactNode
  hint?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  onClick?: () => void
  sep?: boolean
}

interface MenuState {
  open: boolean
  x: number
  y: number
  items: MenuItem[]
  show(x: number, y: number, items: MenuItem[]): void
  close(): void
}

const useMenu = create<MenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  show: (x, y, items) => set({ open: true, x, y, items }),
  close: () => set({ open: false })
}))

/** Opens the custom right click menu at the mouse position. */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation?(): void }, items: MenuItem[]): void {
  e.preventDefault()
  e.stopPropagation?.()
  useMenu.getState().show(e.clientX, e.clientY, items)
}

export function ContextMenuHost() {
  const { open, x, y, items, close } = useMenu()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) })
  }, [open, x, y, items])

  useEffect(() => {
    if (!open) return
    const off = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      close()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', off, true)
    window.addEventListener('keydown', esc)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', off, true)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  // stop the default browser menu everywhere
  useEffect(() => {
    const prevent = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea')) return
      e.preventDefault()
    }
    window.addEventListener('contextmenu', prevent)
    return () => window.removeEventListener('contextmenu', prevent)
  }, [])

  if (!open) return null
  return (
    <div ref={ref} className="menu glass pop-in" style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 500 }}>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className={`menu-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              close()
              it.onClick?.()
            }}
          >
            <span className="mi-icon">{it.checked ? '✓' : it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.hint && <span className="mi-hint">{it.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}
