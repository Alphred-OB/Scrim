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
  private keys: { t: number; keys: string[] }[] = []
  private onKey = (e: { keycode: number; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }) => this.key(e)
  /** save keyboard shortcuts (never plain typing) */
  trackKeys = true
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
    this.keys = this.keys.filter((k) => k.t < sinceMs) // e.g. the stop / pause hotkey itself
  }

  setRect(rect: Rect): void {
    this.rect = rect
  }

  start(): void {
    this.samples = []
    this.clicks = []
    this.keys = []
    this.sample(true)
    this.timer = setInterval(() => this.sample(false), 16)
    const h = loadHook()
    if (h) {
      h.uIOhook.on('mousedown', this.onDown)
      h.uIOhook.on('mouseup', this.onUp)
      if (this.trackKeys) h.uIOhook.on('keydown', this.onKey)
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

  /**
   * Keeps shortcuts only: a key pressed with Ctrl, Alt or Win, or a special key (Enter, Esc, Tab, arrows, F keys...).
   * Letters, numbers and symbols typed on their own (or with just Shift) are never saved, so passwords and
   * private text don't end up in the project.
   */
  private key(e: { keycode: number; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }): void {
    const name = keyName(e.keycode)
    if (!name || MODIFIERS.has(e.keycode)) return
    const special = SPECIAL.has(name)
    if (!(e.ctrlKey || e.altKey || e.metaKey) && !special) return
    const keys = [...(e.ctrlKey ? ['Ctrl'] : []), ...(e.altKey ? ['Alt'] : []), ...(e.shiftKey ? ['Shift'] : []), ...(e.metaKey ? ['Win'] : []), name]
    this.keys.push({ t: Date.now(), keys })
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
      h.uIOhook.off('keydown', this.onKey)
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
      })),
      keys: this.keys.map((k) => ({ t: rel(k.t), keys: k.keys }))
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

// ---- key names (uiohook key codes) ----
const KEY_NAMES: Record<number, string> = {
  14: 'Backspace', 15: 'Tab', 28: 'Enter', 3612: 'Enter', 1: 'Esc', 57: 'Space', 3657: 'PgUp', 3665: 'PgDn', 3663: 'End', 3655: 'Home',
  57419: '←', 57416: '↑', 57421: '→', 57424: '↓', 3666: 'Ins', 3667: 'Del', 3639: 'PrtSc',
  11: '0', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9',
  30: 'A', 48: 'B', 46: 'C', 32: 'D', 18: 'E', 33: 'F', 34: 'G', 35: 'H', 23: 'I', 36: 'J', 37: 'K', 38: 'L', 50: 'M',
  49: 'N', 24: 'O', 25: 'P', 16: 'Q', 19: 'R', 31: 'S', 20: 'T', 22: 'U', 47: 'V', 17: 'W', 45: 'X', 21: 'Y', 44: 'Z',
  59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6', 65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12',
  39: ';', 13: '=', 51: ',', 12: '-', 52: '.', 53: '/', 41: '`', 26: '[', 43: '\\', 27: ']', 40: "'",
  78: '+', 74: '-', 55: '*', 3637: '/'
}
const MODIFIERS = new Set([29, 3613, 56, 3640, 42, 54, 3675, 3676, 58, 69, 70])
const SPECIAL = new Set(['Backspace', 'Tab', 'Enter', 'Esc', 'PgUp', 'PgDn', 'End', 'Home', '←', '↑', '→', '↓', 'Ins', 'Del', 'PrtSc',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'])
function keyName(code: number): string | null {
  return KEY_NAMES[code] ?? null
}
