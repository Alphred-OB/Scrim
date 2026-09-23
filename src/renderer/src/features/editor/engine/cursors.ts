// Cursor library. Every cursor is vector art in a ~24 unit box with its click point (hotspot) at 0,0.
// Colors, outline, shadow and size are applied at draw time so each style is fully customisable.

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface CursorDef {
  id: string
  name: string
  group: 'Classic' | 'Simple' | 'Pointy' | 'Touch' | 'Special'
  path: string
  fill: string // default colors for this style
  outline: string
  outlineWidth: number
  /** where the click point sits inside the path, in path units */
  hotspot?: [number, number]
  /** draw only the outline */
  hollow?: boolean
  /** soft glow in the fill color */
  glow?: boolean
}

const MAC = 'M0 0 L0 17.2 L4.3 13.3 L7.1 19.8 L10 18.6 L7.2 12.2 L12.8 12.2 Z'
const WIN = 'M0 0 L0 16 L3.8 12.4 L6.4 18.4 L8.6 17.4 L6 11.6 L11.3 11.6 Z'
const SIMPLE = 'M1.2 1.2 L19 8.1 Q20.6 8.8 19 9.6 L11.8 12.1 L9.4 19.2 Q8.7 20.8 7.9 19.2 Z'
const POINTY = 'M0 0 L18 7.2 L9.2 9.2 L7.2 18 Z'
const CIRCLE = 'M9 0 A9 9 0 1 1 -9 0 A9 9 0 1 1 9 0 Z'
const DOT = 'M4.5 0 A4.5 4.5 0 1 1 -4.5 0 A4.5 4.5 0 1 1 4.5 0 Z'
const HAND =
  'M6 3.2 a1.8 1.8 0 0 1 3.6 0 V10 h.6 V8.6 a1.7 1.7 0 0 1 3.4 0 V10.4 h.5 V9.4 a1.7 1.7 0 0 1 3.4 0 V11 h.4 V10.6 a1.6 1.6 0 0 1 3.2 0 V16.2 c0 3.4 -2.6 6 -6 6 h-2.6 c-2 0 -3.4 -.8 -4.6 -2.4 L1.6 14.4 a1.8 1.8 0 0 1 2.6 -2.4 L6 13.8 Z'
const CROSS = 'M-10 -1.2 H-3 V1.2 H-10 Z M3 -1.2 H10 V1.2 H3 Z M-1.2 -10 H1.2 V-3 H-1.2 Z M-1.2 3 H1.2 V10 H-1.2 Z'
const TAIL = 'M0 0 L14 14 L8.6 14 L11.8 21 L9.4 22 L6.2 15 L2.2 18.6 Z'
const PEN = 'M0 0 L3.2 9.8 L15.6 22.2 Q17 23.6 18.4 22.2 L22.2 18.4 Q23.6 17 22.2 15.6 L9.8 3.2 Z'

export const CURSORS: CursorDef[] = [
  { id: 'mac', name: 'macOS', group: 'Classic', path: MAC, fill: '#000000', outline: '#ffffff', outlineWidth: 1.6 },
  { id: 'mac-black', name: 'macOS light', group: 'Classic', path: MAC, fill: '#ffffff', outline: '#111111', outlineWidth: 1.5 },
  { id: 'windows', name: 'Windows', group: 'Classic', path: WIN, fill: '#ffffff', outline: '#000000', outlineWidth: 1.2 },
  { id: 'windows-dark', name: 'Windows dark', group: 'Classic', path: WIN, fill: '#111111', outline: '#ffffff', outlineWidth: 1.2 },
  { id: 'tail', name: 'Retro', group: 'Classic', path: TAIL, fill: '#ffffff', outline: '#000000', outlineWidth: 1.3 },
  { id: 'outline', name: 'Outline', group: 'Classic', path: MAC, fill: '#00000000', outline: '#ffffff', outlineWidth: 1.8, hollow: true },

  { id: 'simple-light', name: 'Simple light', group: 'Simple', path: SIMPLE, fill: '#ffffff', outline: '#000000', outlineWidth: 2.4, hotspot: [1.2, 1.2] },
  { id: 'simple-dark', name: 'Simple dark', group: 'Simple', path: SIMPLE, fill: '#000000', outline: '#ffffff', outlineWidth: 2.4, hotspot: [1.2, 1.2] },
  { id: 'simple-brand', name: 'Simple brand', group: 'Simple', path: SIMPLE, fill: '#6c63ff', outline: '#ffffff', outlineWidth: 2.4, hotspot: [1.2, 1.2] },

  { id: 'pointer', name: 'Pointy light', group: 'Pointy', path: POINTY, fill: '#ffffff', outline: '#111111', outlineWidth: 1.5 },
  { id: 'pointy-dark', name: 'Pointy dark', group: 'Pointy', path: POINTY, fill: '#111111', outline: '#ffffff', outlineWidth: 1.5 },
  { id: 'pointy-brand', name: 'Pointy brand', group: 'Pointy', path: POINTY, fill: '#6c63ff', outline: '#ffffff', outlineWidth: 1.5 },
  { id: 'neon', name: 'Neon', group: 'Pointy', path: POINTY, fill: '#00e5ff', outline: '#ffffff', outlineWidth: 1.2, glow: true },

  { id: 'dot', name: 'Dot', group: 'Touch', path: DOT, fill: '#ffffff', outline: '#00000088', outlineWidth: 1.4 },
  { id: 'touch', name: 'Touch circle', group: 'Touch', path: CIRCLE, fill: '#9a9a9a99', outline: '#ffffff66', outlineWidth: 1.2 },
  { id: 'ring', name: 'Ring', group: 'Touch', path: CIRCLE, fill: '#00000000', outline: '#ffffff', outlineWidth: 2.2, hollow: true },

  { id: 'hand', name: 'Hand', group: 'Special', path: HAND, fill: '#ffffff', outline: '#000000', outlineWidth: 1.3, hotspot: [7.8, 1.4] },
  { id: 'cross', name: 'Crosshair', group: 'Special', path: CROSS, fill: '#ffffff', outline: '#000000', outlineWidth: 1 },
  { id: 'pen', name: 'Pen', group: 'Special', path: PEN, fill: '#ffd60a', outline: '#1a1a1a', outlineWidth: 1.4 }
]

const byId = new Map(CURSORS.map((c) => [c.id, c]))
export const cursorDef = (id: string): CursorDef => byId.get(id) ?? CURSORS[0]

const pathCache = new Map<string, Path2D>()
function path2d(d: string): Path2D {
  let p = pathCache.get(d)
  if (!p) pathCache.set(d, (p = new Path2D(d)))
  return p
}

export interface CursorLook {
  color: string
  outline: string
  outlineWidth: number // multiplier of the style's default outline
  shadow: number // 0..1
  opacity: number
}

/** Draws a cursor at the current transform origin (the click point). */
export function drawCursor(ctx: Ctx, id: string, scale: number, look: CursorLook): void {
  const def = cursorDef(id)
  const p = path2d(def.path)
  ctx.save()
  ctx.globalAlpha *= look.opacity
  ctx.scale(scale, scale)
  if (def.hotspot) ctx.translate(-def.hotspot[0], -def.hotspot[1])
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (look.shadow > 0 || def.glow) {
    ctx.shadowColor = def.glow ? look.color : `rgba(0,0,0,${0.5 * look.shadow})`
    ctx.shadowBlur = def.glow ? 8 : 4 * look.shadow + 1
    ctx.shadowOffsetY = def.glow ? 0 : 1.4 * look.shadow
  }
  const lw = def.outlineWidth * look.outlineWidth
  ctx.strokeStyle = look.outline
  ctx.fillStyle = look.color
  if (def.hollow) {
    ctx.lineWidth = lw
    ctx.stroke(p)
  } else {
    // outline first and doubled so the fill always sits cleanly inside it
    if (lw > 0) {
      ctx.lineWidth = lw * 2
      ctx.stroke(p)
      ctx.shadowColor = 'transparent'
    }
    ctx.fill(p)
  }
  ctx.restore()
}
