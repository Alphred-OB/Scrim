import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface Option<T> { v: T; l: ReactNode; hint?: string; style?: React.CSSProperties; disabled?: boolean }

/** Custom dropdown that matches the app look (native selects can't be styled on Windows). */
export function Select<T extends string | number>(props: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  placeholder?: string
  compact?: boolean
  width?: number | string
  align?: 'left' | 'right'
  renderValue?: (o: Option<T> | undefined) => ReactNode
}) {
  const { value, options, onChange } = props
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ x: number; y: number; w: number; up: boolean }>({ x: 0, y: 0, w: 200, up: false })
  const cur = options.find((o) => o.v === value)
  const [hi, setHi] = useState(0)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const est = Math.min(320, options.length * 36 + 12)
    const up = r.bottom + est > window.innerHeight - 8
    setRect({ x: r.left, y: up ? r.top - 6 : r.bottom + 6, w: r.width, up })
    setHi(Math.max(0, options.findIndex((o) => o.v === value)))
  }, [open, options, value])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (list.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const shut = () => setOpen(false)
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('resize', shut)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('resize', shut)
    }
  }, [open])

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') setHi((h) => Math.min(options.length - 1, h + 1))
    else if (e.key === 'ArrowUp') setHi((h) => Math.max(0, h - 1))
    else if (e.key === 'Enter') {
      const o = options[hi]
      if (o && !o.disabled) onChange(o.v)
      setOpen(false)
    } else return
    e.preventDefault()
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`select ${props.compact ? 'compact' : ''} ${open ? 'open' : ''}`}
        style={{ width: props.width }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        <span className="select-val" style={cur?.style}>{props.renderValue ? props.renderValue(cur) : cur?.l ?? <span className="dim">{props.placeholder ?? 'Choose'}</span>}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            className="menu glass pop-in select-list"
            style={{
              position: 'fixed',
              left: props.align === 'right' ? undefined : rect.x,
              right: props.align === 'right' ? window.innerWidth - rect.x - rect.w : undefined,
              top: rect.up ? undefined : rect.y,
              bottom: rect.up ? window.innerHeight - rect.y : undefined,
              minWidth: rect.w,
              zIndex: 600
            }}
          >
            {options.map((o, i) => (
              <button
                key={String(o.v)}
                disabled={o.disabled}
                className={`menu-item ${i === hi && !o.disabled ? 'hi' : ''}`}
                style={o.style}
                onMouseEnter={() => setHi(i)}
                onClick={() => {
                  onChange(o.v)
                  setOpen(false)
                }}
              >
                <span className="mi-icon">{o.v === value ? '✓' : ''}</span>
                <span className="mi-text">
                  {o.l}
                  {o.hint && <span className="mi-sub">{o.hint}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
