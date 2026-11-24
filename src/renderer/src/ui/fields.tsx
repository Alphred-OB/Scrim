import { Icon } from './Icon'
import { ReactNode, useRef, useState, useEffect } from 'react'

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  def?: number
  format?: (v: number) => string
  onChange: (v: number) => void
  compact?: boolean
  disabled?: boolean
  action?: ReactNode
}) {
  const { label, value, min, max, step = 0.01, format, onChange, def, action } = props
  const ref = useRef<HTMLDivElement>(null)
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const padding = props.compact ? 10 : 12
    const barWidth = Math.max(1, r.width - padding * 2)
    const f = Math.max(0, Math.min(1, (clientX - (r.left + padding)) / barWidth))
    let v = min + f * (max - min)
    v = Math.round(v / step) * step
    onChange(+v.toFixed(4))
  }
  return (
    <div
      ref={ref}
      className={`fslider ${props.compact ? 'compact' : ''} ${props.disabled ? 'disabled' : ''}`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.lbl-action, button, input')) return
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        set(e.clientX)
      }}
      onPointerMove={(e) => e.buttons === 1 && set(e.clientX)}
      onDoubleClick={() => def !== undefined && onChange(def)}
      title="Drag to change, double click to reset"
    >
      <div className="fslider-head">
        <div className="lbl">
          {label ? <span>{label}</span> : null}
          {action && <span className="lbl-action">{action}</span>}
        </div>
        <div className="val">{format ? format(value) : value.toFixed(2)}</div>
      </div>
      <div className="fslider-bar">
        <div className="fill" style={{ width: `${pct * 100}%` }} />
        <div className="knob" style={{ left: `${pct * 100}%` }} />
      </div>
    </div>
  )
}

export function Toggle({
  label,
  value,
  onChange,
  action
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  action?: ReactNode
}) {
  return (
    <label className="trow">
      <span className="tl">
        <span>{label}</span>
        {action && (
          <span
            className="lbl-action"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {action}
          </span>
        )}
      </span>
      <span className="switch">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" />
      </span>
    </label>
  )
}

export function Seg<T extends string | number>({ options, value, onChange }: { options: { v: T; l: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

export function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState(value)
  useEffect(() => setTxt(value), [value])
  const hex6 = value.length > 7 ? value.slice(0, 7) : value
  return (
    <div className="color-row">
      <div className="sw" style={{ background: value }}>
        <input type="color" value={hex6} onChange={(e) => onChange(e.target.value)} />
      </div>
      <span className="cl">{label}</span>
      <input
        className="hex"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(txt) ? onChange(txt) : setTxt(value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}

export function Section({
  title,
  onReset,
  action,
  children,
  collapsible,
  defaultOpen = true,
}: {
  title: string
  onReset?: () => void
  action?: ReactNode
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Animate height on toggle
  useEffect(() => {
    const el = bodyRef.current
    if (!el || !collapsible) return
    if (open) {
      el.style.maxHeight = el.scrollHeight + 'px'
      el.style.opacity = '1'
    } else {
      el.style.maxHeight = '0px'
      el.style.opacity = '0'
    }
  }, [open, collapsible])

  if (!collapsible) {
    return (
      <div className="section">
        <div className="section-head">
          <span className="section-title">{title}</span>
          {onReset ? <button className="link" onClick={onReset}>Reset</button> : action}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="section">
      <button
        className="section-head section-collapse-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span className="section-title">{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!open && action}
          <span style={{ display: 'flex', transition: 'transform 0.22s var(--ease, ease)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', color: 'var(--dim)' }}>
            <Icon name="chevron" size={13} />
          </span>
        </span>
      </button>
      <div
        ref={bodyRef}
        style={{
          overflow: 'hidden',
          maxHeight: defaultOpen ? '999px' : '0px',
          opacity: defaultOpen ? 1 : 0,
          transition: 'max-height 0.25s var(--ease, ease), opacity 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {children}
      </div>
    </div>
  )
}
