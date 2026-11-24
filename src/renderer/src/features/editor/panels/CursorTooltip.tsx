import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CURSOR_TOOLTIPS, type TooltipItem } from './cursorTooltipsData'
import { Icon } from '@/ui'

interface TooltipTarget {
  id: string
  rect: DOMRect
}

interface TooltipContextType {
  activeId: string | null
  showTooltip: (id: string, el: HTMLElement) => void
  hideTooltip: () => void
  toggleTooltip: (id: string, el: HTMLElement) => void
}

const TooltipContext = createContext<TooltipContextType | null>(null)

export function CursorTooltipProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<TooltipTarget | null>(null)
  const timerRef = useRef<number | null>(null)

  const showTooltip = (id: string, el: HTMLElement) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const rect = el.getBoundingClientRect()
      setTarget({ id, rect })
    }, 280)
  }

  const hideTooltip = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setTarget(null)
  }

  const toggleTooltip = (id: string, el: HTMLElement) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (target?.id === id) {
      setTarget(null)
    } else {
      const rect = el.getBoundingClientRect()
      setTarget({ id, rect })
    }
  }

  useEffect(() => {
    if (!target) return
    const onDown = (e: PointerEvent | MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('.tip-icon-btn')) return
      setTarget(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTarget(null)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [target])

  return (
    <TooltipContext.Provider value={{ activeId: target?.id ?? null, showTooltip, hideTooltip, toggleTooltip }}>
      {children}
      {target && <TooltipPopup target={target} />}
    </TooltipContext.Provider>
  )
}

/** Dedicated discreet info icon button that triggers the animated preview popup on hover or click */
export function TooltipIcon({
  tipId,
  className,
  style
}: {
  tipId: string
  className?: string
  style?: React.CSSProperties
}) {
  const ctx = useContext(TooltipContext)
  const ref = useRef<HTMLButtonElement>(null)

  if (!ctx || !CURSOR_TOOLTIPS[tipId]) return null

  const isCurrent = ctx.activeId === tipId

  return (
    <button
      ref={ref}
      type="button"
      className={`tip-icon-btn ${isCurrent ? 'active' : ''} ${className ?? ''}`}
      style={style}
      title="Click or hover to see what this does"
      aria-label="Learn more about this setting"
      onPointerDown={(e) => {
        // Prevent parent slider, switch, or button from capturing drag or click
        e.stopPropagation()
      }}
      onMouseEnter={() => {
        if (ref.current) ctx.showTooltip(tipId, ref.current)
      }}
      onMouseLeave={() => {
        ctx.hideTooltip()
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (ref.current) ctx.toggleTooltip(tipId, ref.current)
      }}
    >
      <Icon name="info" size={11.5} stroke={2.2} />
    </button>
  )
}

/** Legacy wrapper kept for backward compatibility; renders children cleanly without hijacking hover */
export function WithCursorTooltip({
  children,
  className,
  style
}: {
  tipId?: string
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}

function TooltipPopup({ target }: { target: TooltipTarget }) {
  const data: TooltipItem | undefined = CURSOR_TOOLTIPS[target.id]
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!data || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId: number
    const t0 = performance.now()

    const loop = (now: number) => {
      const elapsed = (now - t0) / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      data.draw(ctx, canvas.width, canvas.height, elapsed)
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [data])

  if (!data) return null

  const width = 290
  const height = 220

  // Anchor to the right of the inspector panel so the tooltip NEVER overlaps sliders, switches, or buttons inside the panel
  const panelEl = document.querySelector('aside[data-tour="panel"]') as HTMLElement | null
  const panelRight = panelEl ? panelEl.getBoundingClientRect().right : 428

  let left: number
  if (target.rect.left < panelRight) {
    left = panelRight + 12
  } else {
    left = target.rect.right + 12
  }

  if (left + width > window.innerWidth - 12) {
    left = Math.max(12, target.rect.left - width - 12)
  }

  const top = Math.max(16, Math.min(window.innerHeight - height - 16, target.rect.top - 12))

  return createPortal(
    <div
      className="cursor-popover fade-in"
      style={{
        position: 'fixed',
        left,
        top,
        width,
        zIndex: 9999,
        pointerEvents: 'none'
      }}
    >
      <div className="cursor-popover-card">
        {/* Header */}
        <div className="cursor-popover-head">
          <span className="cursor-popover-title">{data.title}</span>
          <span className="cursor-popover-badge">{data.badge}</span>
        </div>

        {/* Animated 60fps Micro-Canvas Clip */}
        <div className="cursor-popover-preview">
          <canvas ref={canvasRef} width={264} height={98} />
        </div>

        {/* Friendly Description */}
        <p className="cursor-popover-desc">{data.desc}</p>

        {/* Helpful Pro Tip */}
        {data.difference && (
          <div className="cursor-popover-diff">
            <span className="diff-tag">Tip</span>
            <span className="diff-text">{data.difference}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
