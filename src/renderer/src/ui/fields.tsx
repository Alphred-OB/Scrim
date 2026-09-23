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
}) {
  const { label, value, min, max, step = 0.01, format, onChange, def } = props
  const ref = useRef<HTMLDivElement>(null)
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    let v = min + f * (max - min)
    v = Math.round(v / step) * step
    onChange(+v.toFixed(4))
  }
  return (
    <div
      ref={ref}
      className={`fslider ${props.compact ? 'compact' : ''} ${props.disabled ? 'disabled' : ''}`}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        set(e.clientX)
      }}
      onPointerMove={(e) => e.buttons === 1 && set(e.clientX)}
      onDoubleClick={() => def !== undefined && onChange(def)}
      title="Drag to change, double click to reset"
    >
      <div className="fill" style={{ width: `calc(${pct * 100}% - 8px)` }} />
      <div className="knob" style={{ left: `max(16px, ${pct * 100}%)` }} />
      <div className="lbl">{label}</div>
      <div className="val">{format ? format(value) : value.toFixed(2)}</div>
    </div>
  )
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="trow">
      <span className="tl">{label}</span>
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

export function Section({ title, onReset, action, children }: { title: string; onReset?: () => void; action?: ReactNode; children: ReactNode }) {
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
