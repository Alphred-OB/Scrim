// A plain text log of what the app does, so problems (a recording that dies, a crash) can be looked at later.
// While developing it goes to <project>/logs/scrim.log, in the installed app to <userData>/logs/scrim.log.
import { app, BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync, statSync, renameSync } from 'fs'
import { join } from 'path'

let file = ''

/** Path of the log file ('' if logging couldn't start). */
export const logFile = (): string => file

function write(level: string, parts: unknown[]): void {
  if (!file) return
  const text = parts.map((p) => (p instanceof Error ? `${p.message}\n${p.stack}` : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  try {
    appendFileSync(file, `${new Date().toISOString()} ${level} ${text}\n`)
  } catch {
    /* never let logging break the app */
  }
}

export const log = {
  info: (...a: unknown[]) => write('INFO', a),
  warn: (...a: unknown[]) => write('WARN', a),
  error: (...a: unknown[]) => write('ERROR', a)
}

/** Starts the log and also records console output, crashes and renderer errors. */
export function startLog(): void {
  const dir = app.isPackaged ? join(app.getPath('userData'), 'logs') : join(app.getAppPath(), 'logs')
  try {
    mkdirSync(dir, { recursive: true })
    file = join(dir, 'scrim.log')
    // keep it small: start a new file past 5 MB
    try {
      if (statSync(file).size > 5_000_000) renameSync(file, join(dir, 'scrim.old.log'))
    } catch {
      /* no file yet */
    }
  } catch {
    file = ''
  }
  log.info(`---- Scrim ${app.getVersion()} started (${process.platform}, Electron ${process.versions.electron})`)
  for (const level of ['log', 'warn', 'error'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...a: unknown[]) => {
      orig(...a)
      write(level === 'log' ? 'INFO' : level.toUpperCase(), a)
    }
  }
  process.on('uncaughtException', (e) => log.error('uncaught exception', e))
  process.on('unhandledRejection', (e) => log.error('unhandled rejection', e as Error))
  app.on('render-process-gone', (_e, wc, d) => log.error(`renderer gone (${wc.getURL()}): ${d.reason} code ${d.exitCode}`))
  app.on('child-process-gone', (_e, d) => log.error(`child process gone: ${d.type} ${d.reason} code ${d.exitCode} ${d.name ?? ''}`))
  // errors and warnings printed inside any window
  app.on('browser-window-created', (_e, win: BrowserWindow) => {
    win.webContents.on('console-message', (e) => {
      const m = e as unknown as { level: string | number; message: string; sourceId?: string; lineNumber?: number }
      const lvl = String(m.level)
      if (lvl === 'warning' || lvl === 'error' || lvl === '2' || lvl === '3') write(lvl === 'error' || lvl === '3' ? 'ERROR' : 'WARN', [`[${win.webContents.getURL().split('#')[1] ?? 'main'}] ${m.message}`])
    })
  })
}
