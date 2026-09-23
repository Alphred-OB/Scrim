import { app, BrowserWindow, screen, dialog, ipcMain, session, shell, desktopCapturer, Menu, globalShortcut, Notification } from 'electron'
import { basename, dirname, join } from 'path'
import { tmpdir } from 'os'
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
import { detectEncoder } from './ffmpeg'
import { runSelfTest, selfTestDir } from './selftest'
import { closeSplash, showSplash } from './splash'
import { joinVideo, type JoinWhere } from './join'
import './rpc'

registerSchemes()
// keep things smooth on low end GPUs/CPUs
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

let mainWindow: BrowserWindow | null = null
let toolbar: BrowserWindow | null = null
let bubble: BrowserWindow | null = null
let border: BrowserWindow | null = null
const ICON = join(__dirname, '../../resources/icon.png')

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
      sandbox: false,
      backgroundThrottling: false // audio keeps recording while hidden
    }
  })
  mainWindow.on('ready-to-show', () => closeSplash(() => mainWindow?.show(), selfTestDir() ? 0 : 1700))
  mainWindow.on('closed', () => {
    mainWindow = null
    toolbar?.destroy()
    bubble?.destroy()
    border?.destroy()
    app.quit()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
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
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
    })
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
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
    })
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

/** Is this physical screen point on the record bar or the webcam bubble? */
function isOwnUi(p: { x: number; y: number }): boolean {
  for (const w of [toolbar, bubble]) {
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
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
    })
    bubble.setAlwaysOnTop(true, 'screen-saver')
    bubble.setContentProtection(true)
  }
  const q = new URLSearchParams({ shape: cam.shape, device: cam.deviceId ?? '' }).toString()
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
  ipcMain.handle('encoder:detect', () => detectEncoder())

  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:load', (_e, dir: string) => loadProject(dir))
  ipcMain.handle('projects:save', (_e, p: Project) => saveProject(p))
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
    if (existsSync(join(dir, 'project.json')) && (basename(file) === 'project.json' || /^screen(-\d+)?\.mp4$/.test(basename(file)))) return dir
    if (file.toLowerCase().endsWith('.json')) throw new Error('That file is not a Scrim project.')
    return (await importVideo(file)).dir
  })

  ipcMain.handle('dialog:open', async (_e, opts: { title: string; filters: Electron.FileFilter[] }) => {
    const r = await dialog.showOpenDialog(mainWindow!, { title: opts.title, properties: ['openFile'], filters: opts.filters })
    return r.canceled ? null : r.filePaths[0] ?? null
  })
  ipcMain.handle('dialog:save', async (_e, opts: { defaultName: string; ext: string }) => {
    const r = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: join(app.getPath('videos'), opts.defaultName),
      filters: [{ name: opts.ext.toUpperCase(), extensions: [opts.ext] }]
    })
    return r.canceled ? null : r.filePath ?? null
  })
  ipcMain.handle('asset:copy', (_e, dir: string, file: string) => copyAsset(dir, file))
  ipcMain.handle('presets:load', () => loadPresets())
  ipcMain.handle('presets:save', (_e, list: Preset[]) => savePresets(list))
  ipcMain.handle('shell:show', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('shell:open', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('app:tmp', () => tmpdir())

  ipcMain.handle('sample:getDir', (_e, reset?: boolean) => getSampleDir(!!reset))
  ipcMain.handle('sample:begin', () => sampleBegin())
  ipcMain.handle('sample:finish', (_e, dir: string, cursor: CursorData, duration: number) => sampleFinish(dir, cursor, duration))
  ipcMain.handle('file:open', (_e, p: string) => openWrite(p))
  ipcMain.handle('file:write', (_e, p: string, data: Uint8Array, pos: number) => writeAt(p, data, pos))
  ipcMain.handle('file:close', (_e, p: string) => closeWrite(p))
  ipcMain.handle('file:remove', (_e, p: string) => fs.rm(p, { force: true }))
  ipcMain.handle('file:readJson', async (_e, p: string) => JSON.parse(await fs.readFile(p, 'utf8')))
  ipcMain.handle('audio:save', async (_e, dir: string, kind: string, data: Uint8Array) => {
    const p = join(dir, `${kind}.raw.webm`)
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
  ipcMain.handle('settings:save', (_e, s: AppSettings) => saveSettings(s))
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

app.whenReady().then(() => {
  migrateLegacyUserData()
  Menu.setApplicationMenu(null)
  if (process.platform === 'win32') app.setAppUserModelId('com.eruditeafrican.scrim')
  handleMediaProtocol()

  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'display-capture', 'clipboard-read', 'fullscreen'].includes(permission)))
  ses.setPermissionCheckHandler(() => true)
  // getDisplayMedia is only used to grab system audio (Windows loopback)
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    const [first] = await desktopCapturer.getSources({ types: ['screen'] })
    cb({ video: first, audio: 'loopback' })
  })

  recorder.init({ mainWindow: () => mainWindow, showToolbar, hideToolbar, showBubble, hideBubble, showBorder, hideBorder, isOwnUi, iconPath: ICON, openEditor, broadcast })
  registerIpc()
  if (!selfTestDir()) showSplash(ICON)
  createMainWindow()
  // warm up encoder detection in the background so the first recording starts fast
  setTimeout(() => {
    detectEncoder()
      .then(() => probeDdaOutputs())
      .catch(() => {})
  }, 1500)
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopHookOnQuit()
})
app.on('window-all-closed', () => app.quit())
