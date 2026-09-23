import { BrowserWindow, desktopCapturer, dialog, screen, globalShortcut, Tray, Menu, nativeImage, Notification } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import type { CaptureSource, CursorData, Project, RecordOptions, RecorderStatus, WebcamRecordOptions } from '@shared/types'
import { defaultEdit } from '@shared/defaults'
import { autoZoomFromClicks } from '@shared/autozoom'
import { CursorTracker, Rect } from './cursorTracker'
import { colorFilter, detectEncoder, encoderArgs, probeVideo, runFfmpeg, spawnFfmpeg } from './ffmpeg'
import { makeThumb, newProjectDir, saveProject } from './projects'
import { callRenderer } from './rpc'
import { getSettings, toAccelerator } from './settings'

export interface RecorderHooks {
  mainWindow: () => BrowserWindow | null
  showToolbar: (displayRect: Rect, protect: boolean) => void
  hideToolbar: () => void
  showBubble: (displayRect: Rect, cam: WebcamRecordOptions) => void
  hideBubble: () => void
  showBorder: (rect: Rect, protect: boolean, outside: boolean) => void
  hideBorder: () => void
  /** true when a physical screen point is on one of Scrim's own windows (record bar, bubble) */
  isOwnUi: (p: { x: number; y: number }) => boolean
  iconPath: string
  openEditor: (dir: string) => void
  broadcast: (channel: string, payload: unknown) => void
}


export async function listSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 225 },
    fetchWindowIcons: true
  })
  return sources
    .filter((s) => !s.name.startsWith('Scrim'))
    .filter((s) => s.id.startsWith('screen') || !s.thumbnail.isEmpty())
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen') ? 'screen' : 'window',
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : undefined,
      displayId: s.display_id || undefined
    }))
}

function physRect(r: Electron.Rectangle): Rect {
  if (process.platform === 'win32') {
    const p = screen.dipToScreenRect(null, r)
    return { x: p.x, y: p.y, width: p.width, height: p.height }
  }
  return { ...r }
}

function virtualDesktop(): Rect {
  const rects = screen.getAllDisplays().map((d) => physRect(d.bounds))
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const r = Math.max(...rects.map((r) => r.x + r.width))
  const b = Math.max(...rects.map((r) => r.y + r.height))
  return { x, y, width: r - x, height: b - y }
}

function even(r: Rect): Rect {
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.floor(r.width / 2) * 2, height: Math.floor(r.height / 2) * 2 }
}

function clampTo(r: Rect, bounds: Rect): Rect {
  const x = Math.max(r.x, bounds.x)
  const y = Math.max(r.y, bounds.y)
  const right = Math.min(r.x + r.width, bounds.x + bounds.width)
  const bottom = Math.min(r.y + r.height, bounds.y + bounds.height)
  return { x, y, width: right - x, height: bottom - y }
}

function displayFor(sourceId: string, displayId?: string): Electron.Display {
  const all = screen.getAllDisplays()
  const byId = all.find((d) => String(d.id) === String(displayId))
  if (byId) return byId
  const idx = Number(sourceId.split(':')[1])
  return all[idx] ?? screen.getPrimaryDisplay()
}

// ---------- native Windows helpers (PowerShell, run as a base64 encoded command) ----------
const PS_HEADER = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class DFW {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
"@
try { [DFW]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch { [DFW]::SetProcessDPIAware() | Out-Null }
`

function runPowerShell(body: string): Promise<string> {
  const encoded = Buffer.from(PS_HEADER + body, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true
    })
    let out = ''
    let err = ''
    ps.stdout.on('data', (d) => (out += d.toString()))
    ps.stderr.on('data', (d) => (err += d.toString()))
    ps.on('error', reject)
    ps.on('close', () => (out.trim() ? resolve(out) : reject(new Error(err.trim() || 'PowerShell returned nothing'))))
  })
}

/** Exact physical pixel bounds of every monitor from Electron's native screen subsystem (instant 0ms). */
function nativeMonitors(): Rect[] {
  if (process.platform !== 'win32') return []
  return screen.getAllDisplays().map((d) => physRect(d.bounds))
}

/**
 * Windows display scaling makes Electron's pixel sizes off by a pixel or two (2560 x 1600 at 150% comes back as
 * 2560 x 1602). The GPU capture reports the true size of every screen, so monitor sizes are corrected to match it.
 */
function snapToOutputs(monitors: Rect[], outputs: { width: number; height: number }[]): Rect[] {
  const used = new Set<number>()
  return monitors.map((m) => {
    const i = outputs.findIndex((o, k) => !used.has(k) && Math.abs(o.width - m.width) <= 6 && Math.abs(o.height - m.height) <= 6)
    if (i < 0) return m
    used.add(i)
    return { ...m, width: outputs[i].width, height: outputs[i].height }
  })
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const r = Math.max(...rects.map((r) => r.x + r.width))
  const b = Math.max(...rects.map((r) => r.y + r.height))
  return { x, y, width: r - x, height: b - y }
}

/** Gets a window's on-screen rectangle in physical pixels and brings it to the front (Windows only). */
async function windowRect(sourceId: string): Promise<Rect> {
  const hwnd = Number(sourceId.split(':')[1])
  if (!hwnd) throw new Error('Could not identify that window. Click Refresh and pick it again.')
  let out = ''
  try {
    out = await runPowerShell(`
$h = [IntPtr]::new([Int64]${hwnd})
if (-not [DFW]::IsWindow($h)) { Write-Output "GONE"; exit }
if ([DFW]::IsIconic($h)) { [DFW]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 400 }
[DFW]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 150
$r = New-Object DFW+RECT
if ([DFW]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [DFW]::GetWindowRect($h, [ref]$r) | Out-Null }
Write-Output ("R:" + $r.L + "," + $r.T + "," + $r.R + "," + $r.B)
`)
  } catch (e) {
    throw new Error('Could not read the window position: ' + (e instanceof Error ? e.message.split('\n')[0] : String(e)))
  }
  if (out.includes('GONE')) throw new Error('That window was closed. Click Refresh and pick it again.')
  const m = /R:(-?\d+),(-?\d+),(-?\d+),(-?\d+)/.exec(out)
  if (!m) throw new Error('Could not read the window position.')
  const [l, t, r, b] = m.slice(1).map(Number)
  if (r - l < 50 || b - t < 50) throw new Error('That window is minimized or too small to record.')
  return { x: l, y: t, width: r - l, height: b - t }
}

// ---------- GPU capture (Desktop Duplication via ffmpeg ddagrab) ----------
interface DdaOutput { idx: number; width: number; height: number }
let ddaCache: DdaOutput[] | null = null

let ddaProbePromise: Promise<DdaOutput[]> | null = null

/** Lists the monitors ffmpeg's ddagrab can see (index + size). Empty if DDA is unavailable. */
export async function probeDdaOutputs(): Promise<DdaOutput[]> {
  if (process.platform !== 'win32') return []
  if (ddaCache) return ddaCache
  if (ddaProbePromise) return ddaProbePromise
  ddaProbePromise = (async () => {
    const list: DdaOutput[] = []
    const maxMonitors = Math.max(1, Math.min(screen.getAllDisplays().length, 3))
    for (let i = 0; i < maxMonitors; i++) {
      const { stderr } = await runFfmpeg(['-v', 'verbose', '-f', 'lavfi', '-i', `ddagrab=output_idx=${i}:framerate=5:draw_mouse=0`, '-frames:v', '1', '-f', 'null', '-'])
      const m = /Opened dxgi output (\d+) with dimensions (\d+)x(\d+)/.exec(stderr)
      if (!m) break
      list.push({ idx: +m[1], width: +m[2], height: +m[3] })
    }
    // a failed probe (GPU busy, secure desktop) is tried again next time instead of forcing GDI for the whole session
    ddaCache = list.length ? list : null
    console.log('[rec] DDA outputs', JSON.stringify(list))
    return list
  })().finally(() => {
    ddaProbePromise = null
  })
  return ddaProbePromise
}

/** Picks the DDA output for a monitor by matching its size (ties keep monitor order).
 * Sizes can be off by a pixel or two after Windows display scaling is rounded, so they only need to be close. */
const near = (a: number, b: number) => Math.abs(a - b) <= 4
function ddaIndexFor(monitor: Rect, monitors: Rect[], outputs: DdaOutput[]): number | null {
  const same = monitors.filter((m) => near(m.width, monitor.width) && near(m.height, monitor.height))
  const pos = same.indexOf(monitor)
  const candidates = outputs.filter((o) => near(o.width, monitor.width) && near(o.height, monitor.height))
  if (candidates.length) return (candidates[pos] ?? candidates[0]).idx
  // one screen and one output: it can only be that one
  if (monitors.length === 1 && outputs.length === 1) return outputs[0].idx
  return null
}

function monitorFor(rect: Rect, monitors: Rect[]): Rect | null {
  if (!monitors.length) return null
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return (
    monitors.find((m) => cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height) ??
    monitors.reduce((best, m) => (overlap(m, rect) > overlap(best, rect) ? m : best), monitors[0])
  )
}

type Engine = { kind: 'dda'; output: number; monitor: Rect } | { kind: 'gdi' } | { kind: 'x11' }

class Recorder {
  private hooks!: RecorderHooks
  private status: RecorderStatus = { state: 'idle', elapsed: 0 }
  private proc: ChildProcess | null = null
  private tracker: CursorTracker | null = null
  private opts: RecordOptions | null = null
  private dir = ''
  private id = ''
  private rect: Rect = { x: 0, y: 0, width: 0, height: 0 }
  private videoStartMs = 0
  private startWall = 0
  private tick: NodeJS.Timeout | null = null
  private stderr = ''
  private cancelled = false
  private media: { mic?: number; system?: number; webcam?: number } = {}
  private engine: Engine = { kind: 'gdi' }
  private tray: Tray | null = null
  private stopKey = ''
  private pauseKey = ''
  // pause support: every resume starts a new capture file, joined when recording stops
  private segments: string[] = []
  private gaps: [number, number][] = [] // wall clock ms ranges that were paused
  private pausedAt = 0
  private activeMs = 0 // recorded time before the current segment
  private frames = { total: 0, dup: 0 } // ffmpeg frame stats of finished segments
  private busy = false // pausing/resuming in progress
  private firstStart = 0 // wall clock ms when the first segment's frames began

  init(h: RecorderHooks): void {
    this.hooks = h
  }

  getStatus(): RecorderStatus {
    return this.status
  }

  private set(s: Partial<RecorderStatus>): void {
    this.status = { ...this.status, ...s }
    this.hooks.broadcast('recorder:status', this.status)
    this.updateTray()
  }

  private updateTray(): void {
    if (!this.tray) return
    const st = this.status.state
    this.tray.setToolTip(
      st === 'recording' ? `Scrim, recording ${Math.floor(this.status.elapsed)}s (click to stop)` : st === 'paused' ? 'Scrim, paused (click to stop)' : 'Scrim'
    )
    this.buildTrayMenu()
  }

  private buildTrayMenu(): void {
    if (!this.tray) return
    const paused = this.status.state === 'paused'
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Stop recording', click: () => void this.stop() },
        { label: paused ? 'Resume' : 'Pause', click: () => void (paused ? this.resume() : this.pause()) },
        { type: 'separator' },
        { label: 'Restart…', click: () => void this.confirmThen('Restart the recording?', 'What you recorded so far will be deleted.', () => this.restart()) },
        { label: 'Discard…', click: () => void this.confirmThen('Discard this recording?', 'It will be deleted and cannot be recovered.', () => this.cancel()) }
      ])
    )
  }

  /** Destructive actions always ask first, so a recording is never lost by a slip of the mouse. */
  private async confirmThen(title: string, detail: string, fn: () => Promise<void>): Promise<void> {
    const r = await dialog.showMessageBox({ type: 'warning', buttons: ['Cancel', 'Delete recording'], defaultId: 0, cancelId: 0, title: 'Scrim', message: title, detail })
    if (r.response === 1) await fn()
  }

  private showTray(): void {
    if (this.tray) return
    try {
      const img = nativeImage.createFromPath(this.hooks.iconPath).resize({ width: 16, height: 16 })
      this.tray = new Tray(img)
      this.buildTrayMenu()
      this.tray.on('click', () => void this.stop())
      this.updateTray()
    } catch (e) {
      console.warn('[rec] tray failed', e)
    }
  }

  private hideTray(): void {
    this.tray?.destroy()
    this.tray = null
  }

  async start(opts: RecordOptions): Promise<void> {
    if (this.status.state === 'recording' || this.status.state === 'countdown') return
    this.opts = opts
    this.cancelled = false
    this.stderr = ''
    this.media = {}
    this.segments = []
    this.gaps = []
    this.pausedAt = 0
    this.activeMs = 0
    this.frames = { total: 0, dup: 0 }
    this.busy = false
    this.firstStart = 0
    try {
      // 1. figure out what to capture (physical pixels)
      let displayRect: Rect
      // true pixel sizes of the screens (corrected with what the GPU capture sees)
      const monitors = snapToOutputs(nativeMonitors(), await probeDdaOutputs())
      console.log('[rec] screens', JSON.stringify(monitors))
      const desktop = monitors.length ? unionRect(monitors) : virtualDesktop()
      if (opts.kind === 'window' && process.platform === 'win32') {
        const wr = await windowRect(opts.sourceId)
        this.rect = even(clampTo(wr, desktop))
        const d = screen.getDisplayMatching(screen.screenToDipRect(null, this.rect))
        displayRect = d.bounds
      } else {
        const d = displayFor(opts.sourceId)
        const approx = physRect(d.bounds)
        const exact = monitors.length ? monitors.reduce((best, m) => (overlap(m, approx) > overlap(best, approx) ? m : best), monitors[0]) : approx
        this.rect = even(clampTo(exact, desktop))
        displayRect = d.bounds
      }
      if (this.rect.width < 64 || this.rect.height < 64) throw new Error('Capture area is too small.')

      // 2. choose the capture engine: GPU desktop duplication when possible, GDI as the fallback
      this.engine = await this.pickEngine(monitors)
      console.log('[rec] start', JSON.stringify({ kind: opts.kind, source: opts.sourceId, rect: this.rect, engine: this.engine, fps: opts.fps }))

      const { id, dir } = await newProjectDir()
      this.id = id
      this.dir = dir

      // 3. countdown. The floating bar only stays visible when it can be kept out of the video.
      const protect = this.engine.kind === 'dda'
      this.hooks.mainWindow()?.hide()
      this.hooks.showToolbar(displayRect, protect)
      if (opts.webcam?.enabled && opts.webcam.showBubble && protect) this.hooks.showBubble(displayRect, opts.webcam)
      this.updateBorder()
      for (let c = opts.countdown; c > 0; c--) {
        if (this.cancelled) return
        this.set({ state: 'countdown', countdown: c, elapsed: 0, error: undefined, engine: this.engine.kind })
        await new Promise((r) => setTimeout(r, 1000))
      }
      if (this.cancelled) return
      if (!protect) this.hooks.hideToolbar() // GDI capture freezes/slows when a protected, see-through window is on screen
      if (!protect && Notification.isSupported()) {
        // the bar can't stay on screen with this capture method, so say how to stop
        new Notification({ title: 'Scrim is recording', body: `Stop with ${getSettings().shortcuts.stopRecording || 'Alt+Shift+S'} or the Scrim icon in the taskbar tray.`, silent: true }).show()
      }
      this.showTray()

      // 4. audio + webcam in the renderer, video in ffmpeg, cursor in main
      const win = this.hooks.mainWindow()
      if (win && (opts.mic || opts.systemAudio || opts.webcam?.enabled)) {
        try {
          this.media = await callRenderer<{ mic?: number; system?: number; webcam?: number }>(win.webContents, 'media:start', {
            mic: opts.mic,
            micDeviceId: opts.micDeviceId,
            system: opts.systemAudio,
            webcam: opts.webcam?.enabled ? { deviceId: opts.webcam.deviceId, quality: opts.webcam.quality } : null
          })
        } catch (e) {
          console.warn('[rec] media failed to start', e)
          this.media = {}
        }
      }

      this.tracker = new CursorTracker(this.rect, this.hooks.isOwnUi)
      this.tracker.start()
      await this.launchCapture(opts)
      this.tracker.setRect(this.rect)

      this.set({ state: 'recording', elapsed: 0, countdown: undefined, engine: this.engine.kind })
      this.tick = setInterval(() => {
        if (this.status.state === 'recording') this.set({ elapsed: this.elapsedSec() })
      }, 500)
      const sc = getSettings().shortcuts
      this.stopKey = toAccelerator(sc.stopRecording || 'Alt+Shift+S')
      this.pauseKey = toAccelerator(sc.pauseRecording || 'Alt+Shift+P')
      try {
        globalShortcut.register(this.stopKey, () => void this.stop())
      } catch {
        /* invalid accelerator, tray still works */
      }
      try {
        globalShortcut.register(this.pauseKey, () => void (this.status.state === 'paused' ? this.resume() : this.pause()))
      } catch {
        /* invalid accelerator */
      }
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e))
    }
  }

  /** Shows the recording border where it can't end up in the video (see showBorder in index.ts). */
  private updateBorder(): void {
    if (getSettings().recordBorder === false) return this.hooks.hideBorder()
    if (this.engine.kind === 'dda' || this.engine.kind === 'x11') this.hooks.showBorder(this.rect, true, false)
    else if (this.opts?.kind === 'window') this.hooks.showBorder(this.rect, false, true)
    else this.hooks.hideBorder() // GDI full screen: a border would be recorded, the tray shows status instead
  }

  private async pickEngine(monitors: Rect[]): Promise<Engine> {
    if (process.platform !== 'win32') return { kind: 'x11' }
    const pref = getSettings().captureEngine
    console.log('[rec] capture engine setting:', pref)
    if (pref === 'gdi') return { kind: 'gdi' }
    const outputs = await probeDdaOutputs()
    const mon = monitorFor(this.rect, monitors)
    if (outputs.length && mon) {
      const idx = ddaIndexFor(mon, monitors, outputs)
      if (idx !== null) {
        // DDA crops within one monitor, using the output's real pixel size
        const out = outputs.find((o) => o.idx === idx)!
        const real = { x: mon.x, y: mon.y, width: out.width, height: out.height }
        this.rect = even(clampTo(this.rect, real))
        return { kind: 'dda', output: idx, monitor: real }
      }
    }
    return { kind: 'gdi' }
  }

  private buildArgs(opts: RecordOptions, enc: string, out: string): string[] {
    const r = this.rect
    let grab: string[]
    let vf: string[] = []
    if (this.engine.kind === 'dda') {
      const m = this.engine.monitor
      const full = r.x === m.x && r.y === m.y && r.width === m.width && r.height === m.height
      const crop = full ? '' : `:video_size=${r.width}x${r.height}:offset_x=${r.x - m.x}:offset_y=${r.y - m.y}`
      grab = ['-v', 'verbose', '-f', 'lavfi', '-i', `ddagrab=output_idx=${this.engine.output}:framerate=${opts.fps}:draw_mouse=0${crop}`]
      vf = ['-vf', `hwdownload,format=bgra,${colorFilter(enc)}`]
    } else if (this.engine.kind === 'gdi') {
      grab = ['-f', 'gdigrab', '-framerate', String(opts.fps), '-draw_mouse', '0',
        '-offset_x', String(r.x), '-offset_y', String(r.y), '-video_size', `${r.width}x${r.height}`, '-thread_queue_size', '512', '-i', 'desktop']
    } else {
      grab = ['-f', 'x11grab', '-framerate', String(opts.fps), '-draw_mouse', '0', '-video_size', `${r.width}x${r.height}`,
        '-thread_queue_size', '512', '-i', `${process.env.DISPLAY || ':0'}+${r.x},${r.y}`]
    }
    if (!vf.length) vf = ['-vf', colorFilter(enc)]
    return [...grab, ...vf, ...encoderArgs(enc, opts.fps), '-fps_mode', 'cfr', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', out]
  }

  private elapsedSec(): number {
    const live = this.status.state === 'recording' ? Date.now() - (this.videoStartMs || this.startWall) : 0
    return (this.activeMs + live) / 1000
  }

  /** Adds the finished segment's frame counters (for the honest frame rate). */
  private collectFrames(): void {
    const lines = this.stderr.split(/[\r\n]+/).filter((l) => /frame=\s*\d+/.test(l))
    const last = lines[lines.length - 1]
    if (last) {
      this.frames.total += Number(/frame=\s*(\d+)/.exec(last)![1])
      this.frames.dup += Number(/dup=\s*(\d+)/.exec(last)?.[1] ?? 0)
    }
  }

  /** Ends the current capture segment cleanly. */
  private async endSegment(): Promise<void> {
    const proc = this.proc
    this.proc = null
    if (!proc) return
    const closed = new Promise<void>((r) => (proc.exitCode !== null ? r() : proc.on('close', () => r())))
    try {
      proc.stdin?.write('q\n')
      proc.stdin?.end()
    } catch {
      /* ignore */
    }
    const killTimer = setTimeout(() => proc.kill('SIGKILL'), 10000)
    await closed
    clearTimeout(killTimer)
    this.collectFrames()
  }

  /** Pause: stop capturing now; nothing on screen is recorded until resume. */
  async pause(): Promise<void> {
    if (this.status.state !== 'recording' || this.busy) return
    this.busy = true
    try {
      this.pausedAt = Date.now()
      this.tracker?.dropClicksSince(this.pausedAt - 400) // the click that paused (tray, hotkey) isn't content
      this.activeMs += this.pausedAt - (this.videoStartMs || this.startWall)
      this.set({ state: 'paused', elapsed: this.activeMs / 1000 })
      // stop audio/webcam and the screen at the same moment so they stay in sync
      const win = this.hooks.mainWindow()
      const media = win && (this.media.mic || this.media.system || this.media.webcam) ? callRenderer(win.webContents, 'media:pause').catch(() => {}) : null
      await Promise.all([media, this.endSegment()])
    } finally {
      this.busy = false
    }
  }

  async resume(): Promise<void> {
    if (this.status.state !== 'paused' || this.busy || !this.opts) return
    this.busy = true
    try {
      // audio/webcam resume the moment the first new frame is captured, not when ffmpeg is fully up
      const win = this.hooks.mainWindow()
      let resumed = false
      const resumeMedia = () => {
        if (resumed) return
        resumed = true
        if (win && (this.media.mic || this.media.system || this.media.webcam)) callRenderer(win.webContents, 'media:resume').catch(() => {})
      }
      await this.launchCapture(this.opts, resumeMedia)
      resumeMedia()
      const startedAt = this.videoStartMs || Date.now()
      this.gaps.push([this.pausedAt, startedAt])
      this.set({ state: 'recording', elapsed: this.activeMs / 1000 })
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e))
    } finally {
      this.busy = false
    }
  }

  /** Starts ffmpeg, waits for frames, retries with fixes (area rounding, DDA -> GDI fallback). */
  private async launchCapture(opts: RecordOptions, onStarted?: () => void): Promise<void> {
    const enc = await detectEncoder()
    const out = join(this.dir, `screen.rec${this.segments.length}.mp4`)
    for (let attempt = 0; attempt < 4; attempt++) {
      if (this.cancelled) throw new Error('Cancelled')
      this.stderr = ''
      this.videoStartMs = 0
      this.startWall = Date.now()
      const proc = spawnFfmpeg(this.buildArgs(opts, enc, out))
      this.proc = proc
      proc.stderr?.on('data', (d: Buffer) => {
        const chunk = d.toString()
        this.stderr = (this.stderr + chunk).slice(-20000)
        if (this.videoStartMs) return
        if (this.engine.kind === 'dda') {
          // DDA frames start right after the output is opened
          if (chunk.includes('Opened dxgi output')) {
            this.videoStartMs = Date.now()
            onStarted?.()
          }
        } else {
          // gdigrab/x11grab stamp frames with wall clock time: "start: 1790100982.460000"
          const m = /start:\s*(\d{9,}\.\d+)/.exec(this.stderr)
          if (m) {
            const t = parseFloat(m[1]) * 1000
            if (Math.abs(t - this.startWall) < 5000) {
              this.videoStartMs = t
              onStarted?.()
            }
          }
        }
      })
      proc.on('error', (e) => (this.stderr += '\n' + String(e)))
      const result = await new Promise<'ok' | 'closed'>((resolve) => {
        const timer = setInterval(() => {
          if (/frame=\s*[1-9]\d*/.test(this.stderr) || Date.now() - this.startWall > 5000) {
            clearInterval(timer)
            resolve('ok')
          }
        }, 100)
        const done = () => {
          clearInterval(timer)
          resolve('closed')
        }
        proc.once('close', done)
        proc.once('error', done)
      })
      if (result === 'ok' && proc.exitCode === null) {
        this.segments.push(out)
        if (!this.firstStart) this.firstStart = this.videoStartMs || this.startWall
        proc.on('close', (code) => {
          if (this.status.state === 'recording' && this.proc === proc) {
            this.fail(`Recording stopped unexpectedly (code ${code}).\n${this.stderr.split('\n').slice(-6).join('\n')}`)
          }
        })
        return
      }
      this.proc = null
      const area = /outside window area \((-?\d+),(-?\d+)\),\((-?\d+),(-?\d+)\)/.exec(this.stderr)
      if (area) {
        const [l, t, rr, bt] = area.slice(1).map(Number)
        this.rect = even(clampTo(this.rect, { x: l, y: t, width: rr - l, height: bt - t }))
        continue
      }
      if (this.engine.kind === 'dda') {
        console.warn('[rec] DDA capture failed, falling back to GDI:\n' + this.stderr.slice(-800))
        this.engine = { kind: 'gdi' }
        this.hooks.hideToolbar()
        this.hooks.hideBubble()
        this.updateBorder()
        continue
      }
      throw new Error('Could not start screen capture.\n' + this.stderr.split('\n').filter((x) => x.trim()).slice(-4).join('\n'))
    }
    throw new Error('Could not start screen capture.\n' + this.stderr.split('\n').slice(-4).join('\n'))
  }

  private async fail(msg: string): Promise<void> {
    console.error('[rec] failed:', msg)
    this.cleanupRuntime()
    this.proc?.kill('SIGKILL')
    this.proc = null
    this.tracker?.stop(Date.now())
    this.tracker = null
    if (this.dir && !existsSync(join(this.dir, 'project.json'))) await fs.rm(this.dir, { recursive: true, force: true }).catch(() => {})
    this.hooks.hideToolbar()
    this.hooks.hideBubble()
    this.hooks.hideBorder()
    const win = this.hooks.mainWindow()
    if (win) {
      callRenderer(win.webContents, 'media:cancel').catch(() => {})
      win.show()
    }
    this.set({ state: 'error', error: msg })
  }

  private cleanupRuntime(): void {
    if (this.tick) clearInterval(this.tick)
    this.tick = null
    if (this.stopKey) globalShortcut.unregister(this.stopKey)
    if (this.pauseKey) globalShortcut.unregister(this.pauseKey)
    this.stopKey = ''
    this.pauseKey = ''
    this.hideTray()
  }

  async cancel(): Promise<void> {
    this.cancelled = true
    this.cleanupRuntime()
    const proc = this.proc
    this.proc = null
    proc?.kill('SIGKILL')
    this.tracker?.stop(Date.now())
    this.tracker = null
    const win = this.hooks.mainWindow()
    if (win) await callRenderer(win.webContents, 'media:cancel').catch(() => {})
    this.hooks.hideToolbar()
    this.hooks.hideBubble()
    this.hooks.hideBorder()
    if (this.dir) await fs.rm(this.dir, { recursive: true, force: true }).catch(() => {})
    this.set({ state: 'idle', elapsed: 0, countdown: undefined })
    win?.show()
  }

  async restart(): Promise<void> {
    const opts = this.opts
    await this.cancel()
    if (opts) await this.start({ ...opts, countdown: Math.min(opts.countdown, 3) })
  }

  async stop(): Promise<void> {
    if ((this.status.state !== 'recording' && this.status.state !== 'paused') || !this.opts) return
    while (this.busy) await new Promise((r) => setTimeout(r, 50))
    const opts = this.opts
    const wasPaused = this.status.state === 'paused'
    this.set({ state: 'stopping' })
    this.cleanupRuntime()
    const endedAt = wasPaused ? this.pausedAt : Date.now()
    const videoStart = this.firstStart || this.startWall + 250
    this.tracker?.dropClicksSince(endedAt - 400) // the click that stopped the recording isn't content
    let cursor = this.tracker?.stop(videoStart)
    this.tracker = null
    if (cursor) cursor = removePaused(cursor, this.gaps, videoStart, endedAt)
    this.hooks.hideBubble()
    this.hooks.hideBorder()
    const ending = this.endSegment()

    const win = this.hooks.mainWindow()
    let files: { mic?: string; system?: string; webcam?: string } = {}
    if (win && (this.media.mic || this.media.system || this.media.webcam)) {
      try {
        files = await callRenderer<{ mic?: string; system?: string; webcam?: string }>(win.webContents, 'media:stop', { dir: this.dir }, 120000)
      } catch (e) {
        console.warn('[rec] media stop failed', e)
      }
    }
    await ending
    this.hooks.hideToolbar()

    try {
      const project = await this.finalize(opts, videoStart, cursor, files)
      this.set({ state: 'idle', elapsed: 0 })
      this.hooks.openEditor(project.dir)
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e))
    }
  }

  private async finalize(
    opts: RecordOptions,
    videoStart: number,
    cursor: CursorData | undefined,
    files: { mic?: string; system?: string; webcam?: string }
  ): Promise<Project> {
    const dir = this.dir
    const final = join(dir, 'screen.mp4')
    const parts = this.segments.filter((f) => existsSync(f))
    if (!parts.length) throw new Error('No video was captured. ' + this.stderr.split('\n').slice(-4).join(' '))
    // one file per recorded stretch (pauses split them); join without re-encoding
    let r
    if (parts.length === 1) r = await runFfmpeg(['-i', parts[0], '-c', 'copy', '-movflags', '+faststart', final])
    else {
      const list = join(dir, 'segments.txt')
      await fs.writeFile(list, parts.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
      r = await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final])
      await fs.rm(list, { force: true })
    }
    if (r.code !== 0) throw new Error('Could not finalize the recording.')
    for (const f of parts) await fs.rm(f, { force: true })

    const info = await probeVideo(final)
    const unique = this.frames.total - this.frames.dup
    const realFps = this.frames.total && info.duration > 0.5 ? Math.max(1, Math.min(opts.fps, Math.round((unique / info.duration) * 10) / 10)) : opts.fps
    const media: Project['media'] = { screen: { path: final, ...info, fps: opts.fps, realFps }, engine: this.engine.kind }

    // remux MediaRecorder webm files so they get a proper duration + seek index
    for (const kind of ['mic', 'system', 'webcam'] as const) {
      const raw = files[kind]
      const started = this.media[kind]
      if (!raw || !started || !existsSync(raw)) continue
      const clean = join(dir, `${kind}.webm`)
      const rr = await runFfmpeg(['-i', raw, '-c', 'copy', clean])
      const path = rr.code === 0 ? clean : raw
      if (rr.code === 0) await fs.rm(raw, { force: true })
      const offset = (started - videoStart) / 1000
      if (kind === 'webcam') {
        const v = await probeVideo(path)
        media.webcam = { path, offset, width: v.width, height: v.height }
      } else media[kind] = { path, offset }
    }

    const edit = defaultEdit(info.duration)
    if (cursor) {
      const cursorPath = join(dir, 'cursor.json')
      await fs.writeFile(cursorPath, JSON.stringify(cursor))
      media.cursor = cursorPath
      edit.zoom.segments = autoZoomFromClicks(cursor, info.duration, edit.zoom.autoScale)
    } else edit.cursor.show = false
    if (opts.kind === 'window') edit.aspect = 'auto'
    if (opts.webcam) {
      const cam = opts.webcam
      edit.webcam.shape = cam.shape
      edit.webcam.size = cam.size
      const mx = 0.06 + cam.size / 2 / 1.78
      const my = 0.08 + cam.size / 2
      edit.webcam.x = cam.corner.endsWith('l') ? mx : 1 - mx
      edit.webcam.y = cam.corner.startsWith('t') ? my : 1 - my
    }

    await makeThumb(final, dir)
    const project: Project = {
      version: 1,
      id: this.id,
      name: opts.sourceName.slice(0, 60) || 'Recording',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dir,
      media,
      edit
    }
    await saveProject(project)
    return project
  }
}

export const recorder = new Recorder()

/**
 * Drops cursor samples and clicks from paused stretches and closes the gaps, so cursor time
 * matches the joined video. Times are seconds from the first segment's start.
 */
export function removePaused(c: CursorData, gaps: [number, number][], videoStart: number, endedAt: number): CursorData {
  if (!gaps.length) return c
  const g = gaps.map(([a, b]) => [(a - videoStart) / 1000, (b - videoStart) / 1000] as [number, number])
  const map = (t: number): number | null => {
    let shift = 0
    for (const [a, b] of g) {
      if (t >= a && t < b) return null
      if (t >= b) shift += b - a
    }
    return t - shift
  }
  const end = map((endedAt - videoStart) / 1000) ?? Infinity
  const samples = c.samples.flatMap((s) => {
    const t = map(s.t)
    return t === null || t > end ? [] : [{ ...s, t }]
  })
  const clicks = c.clicks.flatMap((k) => {
    const t = map(k.t)
    if (t === null) return []
    const up = k.up !== undefined ? map(k.up) ?? t + 0.1 : undefined
    return [{ ...k, t, up }]
  })
  const hidden = (c.hidden ?? []).flatMap(([a, b]) => {
    const ma = map(a) ?? map(b)
    const mb = map(b) ?? ma
    return ma === null || mb === null ? [] : [[ma, mb] as [number, number]]
  })
  return { ...c, samples, clicks, hidden }
}
