import { screen } from 'electron'
import type { CursorData } from '@shared/types'

export interface Rect { x: number; y: number; width: number; height: number } // physical pixels

type HookModule = typeof import('uiohook-napi')
let hook: HookModule | null = null
let hookStarted = false
function loadHook(): HookModule | null {
  if (hook) return hook
  try {
    // native module; optional so the app still records if it fails to load
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hook = require('uiohook-napi') as HookModule
  } catch (e) {
    console.warn('[cursor] uiohook-napi unavailable, clicks will not be tracked', e)
    hook = null
  }
  return hook
}

function physicalCursor(): { x: number; y: number } {
  const p = screen.getCursorScreenPoint()
  if (process.platform === 'win32') return screen.dipToScreenPoint(p)
  return p
}

/**
 * Samples the cursor at ~60Hz and records mouse button presses.
 * Times are wall clock ms; they are converted to video time later.
 */
export class CursorTracker {
  private timer: NodeJS.Timeout | null = null
  private rect: Rect
  private samples: { t: number; x: number; y: number }[] = []
  private clicks: { t: number; x: number; y: number; button: number; up?: number }[] = []
  private lastX = -1
  private lastY = -1
  private onDown = (e: { button: unknown }) => this.press(Number(e.button) || 1)
  private onUp = () => this.release()
  // presses on Scrim's own controls (record bar, webcam bubble): not clicks in the video,
  // and the cursor is hidden while you drag them
  private uiPress: number | null = null
  private hiddenRanges: [number, number][] = []

  constructor(rect: Rect, private isOwnUi: (p: { x: number; y: number }) => boolean = () => false) {
    this.rect = rect
  }

  /** Forgets clicks made from `sinceMs` on (e.g. clicking the tray icon to pause or stop). */
  dropClicksSince(sinceMs: number): void {
    this.clicks = this.clicks.filter((c) => c.t < sinceMs)
  }

  setRect(rect: Rect): void {
    this.rect = rect
  }

  start(): void {
    this.samples = []
    this.clicks = []
    this.sample(true)
    this.timer = setInterval(() => this.sample(false), 16)
    const h = loadHook()
    if (h) {
      h.uIOhook.on('mousedown', this.onDown)
      h.uIOhook.on('mouseup', this.onUp)
      if (!hookStarted) {
        try {
          h.uIOhook.start()
          hookStarted = true
        } catch (e) {
          console.warn('[cursor] failed to start hook', e)
        }
      }
    }
  }

  private norm(p: { x: number; y: number }): { x: number; y: number } {
    return { x: (p.x - this.rect.x) / this.rect.width, y: (p.y - this.rect.y) / this.rect.height }
  }

  private sample(force: boolean): void {
    const p = physicalCursor()
    if (!force && p.x === this.lastX && p.y === this.lastY) return
    this.lastX = p.x
    this.lastY = p.y
    const n = this.norm(p)
    this.samples.push({ t: Date.now(), x: n.x, y: n.y })
  }

  private press(button: number): void {
    const p = physicalCursor()
    if (this.isOwnUi(p)) {
      this.uiPress = Date.now()
      return
    }
    const n = this.norm(p)
    if (n.x < 0 || n.y < 0 || n.x > 1 || n.y > 1) return // outside what's being recorded
    this.clicks.push({ t: Date.now(), x: n.x, y: n.y, button })
  }

  private release(): void {
    if (this.uiPress !== null) {
      this.hiddenRanges.push([this.uiPress - 150, Date.now() + 250])
      this.uiPress = null
      return
    }
    for (let i = this.clicks.length - 1; i >= 0; i--) {
      if (this.clicks[i].up === undefined) {
        this.clicks[i].up = Date.now()
        break
      }
    }
  }

  /** Stops tracking and returns data with times relative to `videoStartMs`. */
  stop(videoStartMs: number): CursorData {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.sample(true)
    const h = hook
    if (h) {
      h.uIOhook.off('mousedown', this.onDown)
      h.uIOhook.off('mouseup', this.onUp)
    }
    const rel = (t: number) => Math.round(t - videoStartMs) / 1000
    if (this.uiPress !== null) this.hiddenRanges.push([this.uiPress - 150, Date.now()])
    return {
      hidden: this.hiddenRanges.map(([a, b]) => [rel(a), rel(b)] as [number, number]),
      width: this.rect.width,
      height: this.rect.height,
      samples: this.samples.map((s) => ({ t: rel(s.t), x: +s.x.toFixed(5), y: +s.y.toFixed(5) })),
      clicks: this.clicks.map((c) => ({
        t: rel(c.t),
        x: +c.x.toFixed(5),
        y: +c.y.toFixed(5),
        button: c.button,
        up: c.up !== undefined ? rel(c.up) : undefined
      }))
    }
  }
}

export function stopHookOnQuit(): void {
  if (hook && hookStarted) {
    try {
      hook.uIOhook.stop()
    } catch {
      /* ignore */
    }
  }
}
