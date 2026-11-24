import { app, safeStorage } from 'electron'
import { writeFileSync, copyFileSync, existsSync, mkdirSync, promises as fs, readFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@shared/types'
import { defaultSettings } from '@shared/defaults'

interface PersistedSettings extends Partial<AppSettings> {
  groqKeyEncrypted?: string
}

const file = () => join(app.getPath('userData'), 'settings.json')
let cache: AppSettings | null = null

/** The app was called "Demo Frame" before v0.3. Bring its settings and presets across once. */
export function migrateLegacyUserData(): void {
  const oldDir = join(app.getPath('appData'), 'Demo Frame')
  const newDir = app.getPath('userData')
  if (!existsSync(oldDir) || existsSync(join(newDir, 'settings.json'))) return
  mkdirSync(newDir, { recursive: true })
  for (const f of ['settings.json', 'presets.json']) {
    try {
      if (existsSync(join(oldDir, f))) copyFileSync(join(oldDir, f), join(newDir, f))
    } catch {
      /* not important enough to block start up */
    }
  }
}

export function getSettings(): AppSettings {
  if (cache) return cache
  const d = defaultSettings()
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as PersistedSettings
    let groqKey = s.groqKey
    if (s.groqKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try {
        groqKey = safeStorage.decryptString(Buffer.from(s.groqKeyEncrypted, 'base64'))
      } catch {
        groqKey = s.groqKey
      }
    }
    cache = {
      ...d,
      ...s,
      groqKey,
      shortcuts: { ...d.shortcuts, ...(s.shortcuts ?? {}) },
      exportSound: { ...d.exportSound, ...(s.exportSound ?? {}) }
    }
    // Compatibility capture was often left on from older versions, where it was the fallback. It hides the record bar
    // and is heavy, so everyone goes back to Automatic once (it still falls back by itself when GPU capture can't work).
    if (!(s as { engineReset?: boolean }).engineReset) {
      cache.captureEngine = 'auto'
      ;(cache as { engineReset?: boolean }).engineReset = true
      try {
        writeFileSync(file(), JSON.stringify(cache, null, 2))
      } catch {
        /* next start tries again */
      }
    }
  } catch {
    cache = d
  }
  return cache
}

export async function saveSettings(s: AppSettings): Promise<AppSettings> {
  cache = s
  const toSave: PersistedSettings = { ...s }
  if (toSave.groqKey && safeStorage.isEncryptionAvailable()) {
    try {
      toSave.groqKeyEncrypted = safeStorage.encryptString(toSave.groqKey).toString('base64')
      delete toSave.groqKey
    } catch {
      /* fallback to storing plain if safeStorage fails */
    }
  } else if (!toSave.groqKey) {
    delete toSave.groqKeyEncrypted
  }
  await fs.writeFile(file(), JSON.stringify(toSave, null, 1))
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin })
    } catch {
      /* ignore in dev environment or unsupported */
    }
  }
  return s
}

/** Converts the app's "Ctrl+Shift+S" style into an Electron accelerator. */
export function toAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((k) => (k === 'Ctrl' ? 'CommandOrControl' : k === 'ArrowLeft' ? 'Left' : k === 'ArrowRight' ? 'Right' : k === 'ArrowUp' ? 'Up' : k === 'ArrowDown' ? 'Down' : k))
    .join('+')
}
