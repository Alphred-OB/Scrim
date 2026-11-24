import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { promises as fs } from 'fs'
import { release, totalmem, cpus } from 'os'
import { dirname, join } from 'path'
import { feedbackUrl } from '@shared/config'
import { getSettings } from './settings'
import { logFile } from './log'
import { scrub } from './scrub'
import { lastCrashId } from './crash'

// "Report a problem" and "Suggest a feature": the report is sent from here (not the page) so it
// can attach the log and a picture of the window. If the internet is down it waits in a folder
// and goes out the next time Scrim starts.

export interface FeedbackIn {
  kind: 'bug' | 'idea'
  title: string
  message: string
  email?: string
  logs?: boolean
  screenshot?: boolean
}

const queueDir = () => join(app.getPath('userData'), 'feedback-queue')

async function readLog(): Promise<string> {
  const f = logFile()
  if (!f) return ''
  const parts: string[] = []
  for (const p of [join(dirname(f), 'scrim.old.log'), f]) {
    try {
      parts.push(await fs.readFile(p, 'utf8'))
    } catch {
      /* not there */
    }
  }
  return scrub(parts.join('\n').slice(-500_000))
}

async function windowPicture(): Promise<string> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible() && w.getTitle() !== 'Scrim Toolbar' && w.getBounds().width > 600)
  if (!win) return ''
  const img = await win.webContents.capturePage()
  const small = img.getSize().width > 1600 ? img.resize({ width: 1600 }) : img
  return 'data:image/jpeg;base64,' + small.toJPEG(82).toString('base64')
}

function details(): Record<string, unknown> {
  const s = getSettings()
  const d = screen.getPrimaryDisplay()
  return {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    arch: process.arch,
    cpu: cpus()[0]?.model?.trim(),
    cores: cpus().length,
    memoryGB: Math.round(totalmem() / 1e9),
    display: `${d.size.width}x${d.size.height} @${d.scaleFactor}x`,
    captureEngine: s.captureEngine,
    theme: s.theme,
    packaged: app.isPackaged
  }
}

async function post(body: Record<string, unknown>): Promise<{ id: number }> {
  const res = await fetch(feedbackUrl().replace(/\/$/, '') + '/v1/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-scrim-client': 'scrim-desktop' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  })
  const j = (await res.json().catch(() => ({}))) as { id?: number; error?: string }
  if (!res.ok) {
    const e = new Error(j.error || `The feedback service answered ${res.status}`)
    ;(e as Error & { permanent?: boolean }).permanent = res.status >= 400 && res.status < 500 && res.status !== 429
    throw e
  }
  return { id: j.id ?? 0 }
}

export async function sendFeedback(f: FeedbackIn): Promise<{ id: number; queued?: boolean }> {
  if (!feedbackUrl()) throw new Error("Feedback isn't set up in this build yet.")
  const body: Record<string, unknown> = {
    kind: f.kind,
    title: f.title,
    message: f.message,
    email: f.email || undefined,
    appVersion: app.getVersion(),
    os: `${process.platform === 'win32' ? 'Windows' : process.platform} ${release()}`,
    meta: details(),
    crashId: lastCrashId()
  }
  if (f.logs) body.logs = await readLog()
  if (f.screenshot) body.screenshot = await windowPicture().catch(() => '')
  try {
    return await post(body)
  } catch (e) {
    if ((e as { permanent?: boolean }).permanent) throw e
    // offline or the service is asleep: keep it and try again later
    await fs.mkdir(queueDir(), { recursive: true })
    await fs.writeFile(join(queueDir(), `${Date.now()}.json`), JSON.stringify(body))
    return { id: 0, queued: true }
  }
}

/** Sends reports that were saved while offline. */
export async function flushFeedbackQueue(): Promise<number> {
  if (!feedbackUrl()) return 0
  let sent = 0
  const files = await fs.readdir(queueDir()).catch(() => [] as string[])
  for (const name of files.filter((n) => n.endsWith('.json')).sort()) {
    const p = join(queueDir(), name)
    try {
      await post(JSON.parse(await fs.readFile(p, 'utf8')))
      await fs.rm(p, { force: true })
      sent++
    } catch (e) {
      if ((e as { permanent?: boolean }).permanent) await fs.rm(p, { force: true }) // it will never go through
      else break // still offline
    }
  }
  return sent
}

export function registerFeedbackIpc(): void {
  ipcMain.handle('feedback:send', (_e, f: FeedbackIn) => sendFeedback(f))
  ipcMain.handle('feedback:enabled', () => !!feedbackUrl())
  ipcMain.handle('feedback:logFolder', () => {
    const f = logFile()
    if (f) shell.showItemInFolder(f)
  })
  // try the waiting ones a little after start
  setTimeout(() => flushFeedbackQueue().catch(() => {}), 20_000)
}
