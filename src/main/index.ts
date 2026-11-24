import { app, BrowserWindow, screen, dialog, ipcMain, session, shell, desktopCapturer, Menu, globalShortcut, Notification, Tray, nativeImage } from 'electron'
import { basename, dirname, join, extname } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'
import { existsSync, promises as fs } from 'fs'
import type { CursorData, AppSettings, Asset, Preset, Project, RecordOptions, WebcamRecordOptions } from '@shared/types'
import { registerSchemes, handleMediaProtocol } from './protocol'
import { recorder, listSources, probeDdaOutputs } from './recorder'
import { stopHookOnQuit, Rect } from './cursorTracker'
import {
  audioPeaks, copyAsset, getSampleDir, sampleBegin, sampleFinish, deleteProject, importAsset, importVideo, listProjects, loadPresets, loadProject, projectsRoot, savePresets, saveProject
} from './projects'
import { getSettings, migrateLegacyUserData, saveSettings } from './settings'
import { closeWrite, mux, MuxJob, openWrite, writeAt } from './exporter'
import { initUpdater } from './updater'
import { registerSpeechIpc } from './speech'
import { registerProxyIpc } from './proxy'
import { previewCacheRoot, previewCacheStats } from './previewCache'
import { registerFeedbackIpc } from './feedback'
import { initCrashReports, registerCrashIpc } from './crash'
import { detectEncoder, getAvailableEncoders } from './ffmpeg'
import { runSelfTest, selfTestDir } from './selftest'
import { closeSplash, showSplash } from './splash'
import { joinVideo, type JoinWhere } from './join'
import './rpc'
import { startLog } from './log'
import { isSafeExternalUrl, isPathAllowed, isOpenable, grantPath, grantParentOf } from './security'

startLog()
initCrashReports() // before the app is ready, so crashes in every window are caught (sends nothing unless allowed)

registerSchemes()
// keep things smooth on low end GPUs/CPUs
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

let mainWindow: BrowserWindow | null = null
let toolbar: BrowserWindow | null = null
let bubble: BrowserWindow | null = null
let border: BrowserWindow | null = null
let prompter: BrowserWindow | null = null
let isQuitting = false
let appTray: Tray | null = null
// Windows wants a real .ico (with every size) for the taskbar, title bar and tray; elsewhere a png is fine
const ICON_PNG = join(__dirname, '../../resources/icon.png')
const ICON = process.platform === 'win32' ? join(__dirname, '../../resources/icon.ico') : ICON_PNG
const APP_ID = app.isPackaged ? 'com.aob.scrim' : 'com.aob.scrim.dev'

function ensureAppTray(): void {
  if (appTray) return
  try {
    const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 })
    appTray = new Tray(img)
    appTray.setToolTip('Scrim')
    appTray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show Scrim',
          click: () => {
            mainWindow?.show()
            mainWindow?.focus()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit Scrim',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])
    )
    appTray.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  } catch (err) {
    console.warn('[tray] app tray failed', err)
  }
}

async function getCacheStats(): Promise<{ sizeBytes: number; humanSize: string; fileCount: number }> {
  let sizeBytes = 0
  let fileCount = 0
  try {
    const sesBytes = await session.defaultSession.getCacheSize()
    sizeBytes += sesBytes
  } catch {
    /* ignore */
  }

  try {
    const tmp = tmpdir()
    const entries = await fs.readdir(tmp, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.toLowerCase().startsWith('scrim-')) {
        const full = join(tmp, e.name)
        try {
          if (e.isDirectory()) {
            const files = await fs.readdir(full)
            for (const f of files) {
              const st = await fs.stat(join(full, f))
              sizeBytes += st.size
              fileCount++
            }
          } else {
            const st = await fs.stat(full)
            sizeBytes += st.size
            fileCount++
          }
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* ignore */
  }

  // preview copies of long recordings (main/proxy.ts); made again on demand when a project is opened
  const previews = await previewCacheStats()
  sizeBytes += previews.bytes
  fileCount += previews.files

  const humanSize =
    sizeBytes < 1024 * 1024
      ? `${Math.round(sizeBytes / 1024)} KB`
      : sizeBytes < 1024 * 1024 * 1024
        ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`

  return { sizeBytes, humanSize, fileCount }
}

async function clearCache(): Promise<{ freedBytes: number; humanFreed: string }> {
  const before = await getCacheStats()
  try {
    await session.defaultSession.clearCache()
  } catch {
    /* ignore */
  }

  try {
    const tmp = tmpdir()
    const entries = await fs.readdir(tmp, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.toLowerCase().startsWith('scrim-')) {
        const full = join(tmp, e.name)
        try {
          await fs.rm(full, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  // a copy the open editor is playing is locked on Windows and simply stays
  await fs.rm(previewCacheRoot(), { recursive: true, force: true }).catch(() => {})

  // report what really went (files in use stay behind)
  const after = await getCacheStats()
  const freed = Math.max(0, before.sizeBytes - after.sizeBytes)
  return {
    freedBytes: freed,
    humanFreed: freed < 1024 * 1024 ? `${Math.round(freed / 1024)} KB` : freed < 1024 ** 3 ? `${(freed / 1024 ** 2).toFixed(1)} MB` : `${(freed / 1024 ** 3).toFixed(2)} GB`
  }
}

const RENDERER_URL = pathToFileURL(join(__dirname, '../renderer/index.html')).href

function secureWebContents(wc: Electron.WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  const handleNav = (e: Electron.Event, url: string) => {
    const isDev = !!process.env['ELECTRON_RENDERER_URL']
    // only our own page: any other local file would get window.api through the preload
    const isLocal = isDev
      ? url.startsWith(process.env['ELECTRON_RENDERER_URL']!)
      : url.split('#')[0] === RENDERER_URL
    if (!isLocal) {
      e.preventDefault()
      if (isSafeExternalUrl(url)) shell.openExternal(url)
    }
  }
  wc.on('will-navigate', handleNav)
  wc.on('will-redirect', handleNav)
}

function loadRoute(win: BrowserWindow, route: string): void {
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0c10',
    title: 'Scrim',
    icon: ICON,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { color: '#00000000', symbolColor: '#c9ccd6', height: 44 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false // audio keeps recording while hidden
    }
  })
  secureWebContents(mainWindow.webContents)
  // Windows takes the taskbar icon from the app's id. While developing, the running exe is
  // Electron's, so tell Windows our own id and icon for this window or it shows the Electron atom.
  if (process.platform === 'win32') mainWindow.setAppDetails({ appId: APP_ID, appIconPath: ICON, appIconIndex: 0, relaunchDisplayName: 'Scrim' })
  mainWindow.on('ready-to-show', () => closeSplash(() => mainWindow?.show(), selfTestDir() ? 0 : 1700))
  mainWindow.on('close', (e) => {
    if (!isQuitting && getSettings()?.minimizeToTray) {
      e.preventDefault()
      mainWindow?.hide()
      ensureAppTray()
    }
  })
  mainWindow.on('show', () => {
    if (appTray) {
      appTray.destroy()
      appTray = null
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    toolbar?.destroy()
    bubble?.destroy()
    border?.destroy()
    prompter?.destroy()
    app.quit()
  })
  loadRoute(mainWindow, '/')
  if (selfTestDir()) runSelfTest(mainWindow, openEditor)
}

function showToolbar(displayRect: Rect, protect: boolean): void {
  const w = 290
  const h = 64
  if (!toolbar || toolbar.isDestroyed()) {
    toolbar = new BrowserWindow({
      width: w,
      height: h,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      hasShadow: false,
      show: false,
      title: 'Scrim Toolbar',
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    })
    secureWebContents(toolbar.webContents)
    toolbar.setAlwaysOnTop(true, 'screen-saver')
    loadRoute(toolbar, '/toolbar')
  }
  toolbar.setContentProtection(protect) // with GPU capture this keeps the bar out of the video
  toolbar.setBounds({
    x: Math.round(displayRect.x + displayRect.width / 2 - w / 2),
    y: Math.round(displayRect.y + displayRect.height - h - 70),
    width: w,
    height: h
  })
  toolbar.showInactive()
}

function hideToolbar(): void {
  toolbar?.hide()
}

/**
 * Animated line around what's being recorded. With GPU capture it sits on the edge and is kept out
 * of the video; with GDI capture of a window it sits just outside the window so it's never captured.
 */
function showBorder(rect: Rect, protect: boolean, outside: boolean): void {
  const pad = outside ? 4 : 0
  const phys = { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
  const b = process.platform === 'win32' ? screen.screenToDipRect(null, phys) : phys
  if (!border || border.isDestroyed()) {
    border = new BrowserWindow({
      ...b,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      title: 'Scrim Border',
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    })
    secureWebContents(border.webContents)
    border.setIgnoreMouseEvents(true)
    border.setAlwaysOnTop(true, 'screen-saver')
    loadRoute(border, '/border')
  }
  border.setContentProtection(protect)
  border.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) })
  border.showInactive()
}

function hideBorder(): void {
  border?.hide()
}

/**
 * The on screen script. It's marked as excluded from capture (like the record bar), so you can read
 * it while recording and it never shows in the video. Alt+Shift+Space starts/stops the scroll,
 * Alt+Shift+Up/Down change the speed.
 */
const PROMPTER_KEYS: [string, string][] = [['Alt+Shift+Space', 'toggle'], ['Alt+Shift+Up', 'faster'], ['Alt+Shift+Down', 'slower'], ['Alt+Shift+Home', 'restart']]

function showPrompter(displayRect?: Rect, force = false): void {
  const p = getSettings().prompter
  if (!p?.text?.trim() || (!force && !p.show)) return
  const w = 720
  const h = 230
  if (!prompter || prompter.isDestroyed()) {
    prompter = new BrowserWindow({
      width: w,
      height: h,
      minWidth: 360,
      minHeight: 120,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false, // clicking it never takes the keyboard from the app you're demoing
      hasShadow: false,
      show: false,
      title: 'Scrim Script',
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    })
    secureWebContents(prompter.webContents)
    prompter.setAlwaysOnTop(true, 'screen-saver')
    loadRoute(prompter, '/prompter')
  }
  prompter.setContentProtection(true)
  const r = displayRect ?? screen.getPrimaryDisplay().bounds // both are in DIPs, like the bar and the bubble
  const b = { x: Math.round(r.x + r.width / 2 - w / 2), y: Math.round(r.y + 24), width: w, height: h }
  prompter.setBounds(b)
  prompter.showInactive()
  for (const [key, cmd] of PROMPTER_KEYS) {
    try {
      globalShortcut.register(key, () => broadcast('prompter:cmd', cmd))
    } catch {
      /* key taken by another app */
    }
  }
}

function hidePrompter(): void {
  for (const [key] of PROMPTER_KEYS) globalShortcut.unregister(key)
  if (prompter && !prompter.isDestroyed()) {
    prompter.destroy()
    prompter = null
  }
}

/** Is this physical screen point on the record bar or the webcam bubble? */
function isOwnUi(p: { x: number; y: number }): boolean {
  for (const w of [toolbar, bubble, prompter]) {
    if (!w || w.isDestroyed() || !w.isVisible()) continue
    const b = process.platform === 'win32' ? screen.dipToScreenRect(null, w.getBounds()) : w.getBounds()
    if (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) return true
  }
  return false
}

/** Floating webcam preview while recording (kept out of the screen capture). */
function showBubble(displayRect: Rect, cam: WebcamRecordOptions): void {
  const size = Math.round(Math.min(displayRect.width, displayRect.height) * Math.max(0.12, Math.min(0.4, cam.size)))
  const m = 32
  const x = cam.corner.endsWith('l') ? displayRect.x + m : displayRect.x + displayRect.width - size - m
  const y = cam.corner.startsWith('t') ? displayRect.y + m : displayRect.y + displayRect.height - size - m - 90
  if (!bubble || bubble.isDestroyed()) {
    bubble = new BrowserWindow({
      width: size,
      height: size,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      title: 'Scrim Camera',
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    })
    secureWebContents(bubble.webContents)
    bubble.setAlwaysOnTop(true, 'screen-saver')
    bubble.setContentProtection(true)
  }
  const q = new URLSearchParams({ shape: cam.shape, device: cam.deviceId ?? '', bg: cam.bg ?? 'none', blur: String(cam.bgBlur ?? 0.6), color: cam.bgColor ?? '#1d2230' }).toString()
  loadRoute(bubble, `/bubble?${q}`)
  bubble.setBounds({ x: Math.round(x), y: Math.round(y), width: size, height: size })
  bubble.showInactive()
}

function hideBubble(): void {
  if (bubble && !bubble.isDestroyed()) {
    bubble.destroy()
    bubble = null
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

function registerIpc(): void {
  ipcMain.handle('sources:list', () => listSources())
  ipcMain.handle('recorder:start', (_e, o: RecordOptions) => recorder.start(o))
  ipcMain.handle('recorder:stop', () => recorder.stop())
  ipcMain.handle('recorder:cancel', () => recorder.cancel())
  ipcMain.handle('recorder:restart', () => recorder.restart())
  ipcMain.handle('recorder:pause', () => recorder.pause())
  ipcMain.handle('recorder:resume', () => recorder.resume())
  ipcMain.handle('recorder:status', () => recorder.getStatus())
  ipcMain.handle('script:import', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { title: 'Import a script', properties: ['openFile'], filters: [{ name: 'Text', extensions: ['txt', 'md'] }] })
    const f = r.canceled ? null : r.filePaths[0]
    if (!f) return null
    if ((await fs.stat(f)).size > 2_000_000) throw new Error('That file is too big for a script.')
    return (await fs.readFile(f, 'utf8')).replace(/^﻿/, '')
  })
  ipcMain.handle('prompter:toggle', (_e, open: boolean) => (open ? showPrompter(undefined, true) : hidePrompter()))
  ipcMain.handle('encoder:detect', () => detectEncoder())
  ipcMain.handle('encoder:list', () => getAvailableEncoders())

  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:load', async (_e, dir: string) => {
    const p = await loadProject(dir) // throws unless the folder holds a readable project.json
    grantPath(dir) // a project opened from elsewhere (recent list, Ctrl+O) may be saved back to its own folder
    return p
  })
  ipcMain.handle('projects:save', (_e, p: Project) => {
    if (!isPathAllowed(p?.dir)) throw new Error('Path not allowed')
    return saveProject(p)
  })
  ipcMain.handle('projects:delete', (_e, dir: string) => deleteProject(dir))
  ipcMain.handle('projects:root', () => projectsRoot())
  ipcMain.handle('projects:import', async (_e, file?: string) => {
    if (file) return importVideo(file)
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import a video',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    return importVideo(r.filePaths[0])
  })

  // Ctrl+O: open a Scrim project (its folder's project.json or screen.mp4) or turn any video into a project
  ipcMain.handle('projects:open', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open a project or video',
      defaultPath: projectsRoot(),
      properties: ['openFile'],
      filters: [
        { name: 'Scrim projects and videos', extensions: ['json', 'mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'] },
        { name: 'Scrim project', extensions: ['json'] },
        { name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'] }
      ]
    })
    const file = r.canceled ? null : r.filePaths[0]
    if (!file) return null
    const dir = dirname(file)
    if (existsSync(join(dir, 'project.json')) && (basename(file) === 'project.json' || /^screen(-\d+)?\.mp4$/.test(basename(file)))) {
      grantPath(dir)
      return dir
    }
    if (file.toLowerCase().endsWith('.json')) throw new Error('That file is not a Scrim project.')
    return (await importVideo(file)).dir
  })

  ipcMain.handle('dialog:open', async (_e, opts: { title: string; filters: Electron.FileFilter[] }) => {
    const r = await dialog.showOpenDialog(mainWindow!, { title: opts.title, properties: ['openFile'], filters: opts.filters })
    return r.canceled ? null : r.filePaths[0] ?? null
  })
  ipcMain.handle('dialog:chooseFolder', async (_e, title?: string) => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: title || 'Choose folder',
      properties: ['openDirectory', 'createDirectory']
    })
    const dir = r.canceled ? null : r.filePaths[0] ?? null
    grantPath(dir)
    return dir
  })
  // one Save window at a time: a second request while it's open gets the same answer instead of stacking another window
  let savePending: Promise<string | null> | null = null
  ipcMain.handle('dialog:save', (_e, opts: { defaultName: string; ext: string; defaultDir?: string }) => {
    if (process.env.SCRIM_TEST_SAVE_DIR) return Promise.resolve(grantParentOf(join(process.env.SCRIM_TEST_SAVE_DIR, opts.defaultName))) // automated checks: no window
    if (savePending) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
      return savePending
    }
    const baseDir = opts.defaultDir || getSettings().exportDir || app.getPath('videos')
    // bring Scrim forward first so the window never opens behind it
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    savePending = dialog
      .showSaveDialog(mainWindow!, {
        defaultPath: join(baseDir, opts.defaultName),
        filters: [{ name: opts.ext.toUpperCase(), extensions: [opts.ext] }]
      })
      .then((r) => (r.canceled ? null : grantParentOf(r.filePath) ?? null))
      .finally(() => {
        savePending = null
      })
    return savePending
  })
  ipcMain.handle('cache:stats', () => getCacheStats())
  ipcMain.handle('cache:clear', () => clearCache())
  ipcMain.handle('asset:copy', (_e, dir: string, file: string) => copyAsset(dir, file))
  ipcMain.handle('presets:load', () => loadPresets())
  ipcMain.handle('presets:save', (_e, list: Preset[]) => savePresets(list))
  ipcMain.handle('shell:show', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('shell:open', (_e, p: string) => {
    if (!isOpenable(p)) throw new Error('Refusing to open that file')
    return shell.openPath(p)
  })
  ipcMain.handle('app:tmp', () => tmpdir())

  ipcMain.handle('sample:getDir', (_e, reset?: boolean) => getSampleDir(!!reset))
  ipcMain.handle('sample:begin', () => sampleBegin())
  ipcMain.handle('sample:finish', (_e, dir: string, cursor: CursorData, duration: number) => sampleFinish(dir, cursor, duration))
  ipcMain.handle('file:open', (_e, p: string) => {
    if (!isPathAllowed(p)) throw new Error('Path not allowed')
    return openWrite(p)
  })
  ipcMain.handle('file:write', (_e, p: string, data: Uint8Array, pos: number) => {
    if (!isPathAllowed(p)) throw new Error('Path not allowed')
    return writeAt(p, data, pos)
  })
  ipcMain.handle('file:close', (_e, p: string) => closeWrite(p))
  ipcMain.handle('file:remove', (_e, p: string) => {
    if (!isPathAllowed(p)) throw new Error('Path not allowed')
    return fs.rm(p, { force: true })
  })
  ipcMain.handle('file:readJson', async (_e, p: string) => {
    const ext = extname(p).toLowerCase()
    if (ext !== '.json') throw new Error('Only JSON files may be read')
    if (!isPathAllowed(p)) throw new Error('Path not allowed')
    return JSON.parse(await fs.readFile(p, 'utf8'))
  })
  ipcMain.handle('audio:save', async (_e, dir: string, kind: string, data: Uint8Array) => {
    const safeKind = kind.replace(/[^a-zA-Z0-9_-]/g, '')
    const p = join(dir, `${safeKind}.raw.webm`)
    if (!isPathAllowed(p)) throw new Error('Path not allowed')
    await fs.writeFile(p, data)
    return p
  })
  ipcMain.handle('export:mux', async (e, job: MuxJob) => {
    await mux(job, (p) => e.sender.send('export:progress', p))
  })
  ipcMain.handle('app:theme', (_e, t: 'dark' | 'light') => {
    if (!mainWindow) return
    const light = t === 'light'
    mainWindow.setBackgroundColor(light ? '#f4f5f7' : '#0b0c0f')
    if (process.platform === 'win32') mainWindow.setTitleBarOverlay({ color: '#00000000', symbolColor: light ? '#3a3d46' : '#c9ccd6', height: 44 })
  })
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', async (_e, s: AppSettings) => {
    const r = await saveSettings(s)
    broadcast('settings:changed', null) // the script window follows changes made in the editor
    return r
  })
  ipcMain.handle('assets:import', async (_e, dir: string, paths?: string[]) => {
    let files = paths
    if (!files?.length) {
      const r = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import media',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Media', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi', 'mp3', 'wav', 'm4a', 'ogg', 'aac', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }
        ]
      })
      if (r.canceled) return { assets: [], errors: [] }
      files = r.filePaths
    }
    const assets: Asset[] = []
    const errors: string[] = []
    for (const f of files) {
      try {
        assets.push(await importAsset(dir, f))
      } catch (err) {
        errors.push(`${f.split(/[\\/]/).pop()}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return { assets, errors }
  })
  ipcMain.handle('project:join', async (e, dir: string, where: JoinWhere, file?: string) => {
    let src = file
    if (!src) {
      const r = await dialog.showOpenDialog(mainWindow!, {
        title: where === 'start' ? 'Pick a video to put before this one' : 'Pick a video to add after this one',
        properties: ['openFile'],
        filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'] }]
      })
      if (r.canceled || !r.filePaths[0]) return null
      src = r.filePaths[0]
    }
    return joinVideo(dir, src, where, (p) => e.sender.send('join:progress', p))
  })
  ipcMain.handle('media:peaks', (_e, p: string) => audioPeaks(p))
  ipcMain.handle('app:notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title, body, icon: ICON }).show()
  })
  ipcMain.handle('app:engines', async () => ({ dda: (await probeDdaOutputs()).length > 0, platform: process.platform }))

  ipcMain.on('nav:editor', (_e, dir: string) => openEditor(dir))
}

function openEditor(dir: string): void {
  if (!mainWindow) return
  mainWindow.webContents.send('nav', `/editor?dir=${encodeURIComponent(dir)}`)
  mainWindow.show()
  mainWindow.focus()
}

// One Scrim at a time: a second launch (double click, shortcut, taskbar) brings the open window forward.
// Two instances would record, autosave and build preview copies over each other.
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  migrateLegacyUserData()
  Menu.setApplicationMenu(null)
  // The installed app has a Start menu shortcut with this id, which gives the taskbar our icon.
  // While developing there's no such shortcut, and a made up id makes Windows show Electron's
  // atom instead, so use the exe path (Electron's default) and let the window icon show.
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
  handleMediaProtocol()

  const ses = session.defaultSession
  const PERMS = ['media', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(PERMS.includes(permission)))
  ses.setPermissionCheckHandler((_wc, permission) => PERMS.includes(permission))
  // getDisplayMedia is only used to grab system audio (Windows loopback)
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    const [first] = await desktopCapturer.getSources({ types: ['screen'] })
    cb({ video: first, audio: 'loopback' })
  })

  recorder.init({ mainWindow: () => mainWindow, showToolbar, hideToolbar, showPrompter: (r) => showPrompter(r), hidePrompter, showBubble, hideBubble, showBorder, hideBorder, isOwnUi, iconPath: ICON, openEditor, broadcast })
  registerIpc()
  initUpdater(broadcast)
  registerSpeechIpc()
  registerProxyIpc()
  registerFeedbackIpc()
  registerCrashIpc()
  if (!selfTestDir()) showSplash(ICON_PNG)
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({ openAtLogin: !!getSettings().openAtLogin })
    } catch {
      /* ignore */
    }
  }

  createMainWindow()
  // warm up encoder detection in the background so the first recording starts fast
  setTimeout(() => {
    detectEncoder()
      .then(() => probeDdaOutputs())
      .catch(() => {})
  }, 1500)
})

app.on('before-quit', () => {
  isQuitting = true
  if (appTray) {
    appTray.destroy()
    appTray = null
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopHookOnQuit()
})
app.on('window-all-closed', () => app.quit())
