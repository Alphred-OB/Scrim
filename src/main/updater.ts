import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { releaseNoteLines } from '@shared/updateNotes'

// Updates come from GitHub Releases (see "publish" in electron-builder.yml). New versions download
// quietly in the background; the app then offers a one click restart, or installs on the next quit.


let status: UpdateStatus = { state: 'off', current: app.getVersion() }
let send: (s: UpdateStatus) => void = () => {}

const set = (s: Partial<UpdateStatus>): void => {
  status = { ...status, ...s }
  send(status)
}

const notesText = (n: unknown): string | undefined => releaseNoteLines(n).join('\n') || undefined

export function initUpdater(broadcast: (channel: string, payload: unknown) => void): void {
  send = (s) => broadcast('update:status', s)
  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:check', () => check(true))
  ipcMain.handle('update:install', () => {
    if (status.state !== 'ready') return false
    // isSilent: no installer pages, isForceRunAfter: open Scrim again when it's done
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
    return true
  })
  // only a real installed build can update itself (not `npm run dev`, not the self test)
  if (!app.isPackaged || process.env.SCRIM_TEST_DIR) return

  const u = autoUpdater
  u.autoDownload = true
  u.autoInstallOnAppQuit = true
  u.allowPrerelease = app.getVersion().includes('-')
  u.logger = { info: (m: unknown) => console.log('[update]', m), warn: (m: unknown) => console.warn('[update]', m), error: (m: unknown) => console.error('[update]', m), debug: () => {} }
  u.on('checking-for-update', () => set({ state: 'checking', error: undefined }))
  u.on('update-available', (i) => set({ state: 'downloading', version: i.version, progress: 0, notes: notesText(i.releaseNotes) }))
  u.on('update-not-available', () => set({ state: 'latest', version: undefined }))
  u.on('download-progress', (p) => set({ state: 'downloading', progress: Math.round(p.percent) }))
  u.on('update-downloaded', (i) => set({ state: 'ready', version: i.version, progress: 100, notes: notesText(i.releaseNotes) ?? status.notes }))
  u.on('error', (e) => {
    const msg = e?.message ?? ''
    if (status.state === 'ready') return set({ state: 'ready' })
    // a download that broke part way: the update screen says so and offers a retry
    if (status.state === 'downloading') return set({ state: 'error', error: 'The download did not finish.' })
    // no release published yet (404) or no internet: nothing to report, you are simply on the newest version we can see
    if (/\b404\b|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ERR_INTERNET|net::/i.test(msg)) return set({ state: 'latest', error: undefined })
    set({ state: 'error', error: 'Could not check for updates right now.', version: undefined })
  })
  set({ state: 'idle' })

  // first look a little after start up, then every 4 hours while the app stays open
  setTimeout(() => check(false), 12_000)
  setInterval(() => check(false), 4 * 60 * 60 * 1000)
}

async function check(manual: boolean): Promise<UpdateStatus> {
  if (status.state === 'off') return status
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    // a quiet background check that fails (offline, rate limited) is not worth a message
    console.warn('[update] check failed', e instanceof Error ? e.message.split('\n')[0] : String(e))
    set({ state: manual ? 'error' : 'idle', error: manual ? 'Could not check for updates right now.' : undefined })
  }
  return status
}
