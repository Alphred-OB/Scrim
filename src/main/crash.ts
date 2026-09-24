import { app, ipcMain } from 'electron'
import * as Sentry from '@sentry/electron/main'
import { IPCMode } from '@sentry/electron/main'
import { sentryDsn } from '@shared/config'
import { getSettings } from './settings'
import { scrub } from './scrub'

// Crash reports (opt in). Sentry starts with the app so it can catch crashes in any window, but
// nothing leaves the PC unless the person said yes (Settings, Privacy). Home folder, user name
// and keys are wiped from every report. No screenshots, videos or files are ever included.

const allowed = (): boolean => {
  try {
    return !!(getSettings() as { crashReports?: boolean }).crashReports
  } catch {
    return false
  }
}

export function initCrashReports(): void {
  if (!sentryDsn()) return
  Sentry.init({
    dsn: sentryDsn(),
    release: `scrim@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    sendDefaultPii: false,
    // windows talk to Sentry through our preload, so no extra protocol is needed
    ipcMode: IPCMode.Classic,
    sendClientReports: false,
    // no session tracking: nothing is sent just for opening the app
    integrations: (defaults) => defaults.filter((i) => !/Session/i.test(i.name)),
    beforeSend(event) {
      if (!allowed()) return null
      // the computer's name is personal too
      delete event.server_name
      if (event.user) event.user = { id: event.user.id }
      try {
        return JSON.parse(scrub(JSON.stringify(event)))
      } catch {
        return null
      }
    },
    beforeBreadcrumb(b) {
      // breadcrumbs can hold file paths from console output; keep only the kind of event
      if (b.message) b.message = scrub(b.message).slice(0, 300)
      return b
    }
  })
}

/** The last report id, so a problem report can point at the crash it belongs to. */
export function lastCrashId(): string | undefined {
  return sentryDsn() ? Sentry.lastEventId() : undefined
}

export function registerCrashIpc(): void {
  ipcMain.handle('crash:enabled', () => !!sentryDsn())
  // for testing the setup: sends a harmless test report when reports are on
  ipcMain.handle('crash:test', () => {
    if (!sentryDsn() || !allowed()) return false
    Sentry.captureMessage('Scrim crash report test')
    return true
  })
}
