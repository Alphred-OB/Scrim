// Where the preview copies (main/proxy.ts) live: a local, non-synced cache folder, one subfolder per project.
// They used to sit in the project folder, which is often in OneDrive: hundreds of MB of throwaway video
// uploaded for nothing (550 MB for one 22 minute recording), with the upload competing with playback.
import { app } from 'electron'
import { createHash } from 'crypto'
import { basename, join, resolve } from 'path'
import { promises as fs } from 'fs'

export function previewCacheRoot(): string {
  // LOCALAPPDATA is per machine (never roams or syncs); userData is the fallback elsewhere
  const local = process.env.LOCALAPPDATA
  return local ? join(local, 'Scrim', 'preview-cache') : join(app.getPath('userData'), 'preview-cache')
}

/** The cache folder for one project: readable name plus a hash of the full path, so two "recording-1" folders never collide. */
export function previewCacheFor(projectDir: string): string {
  const full = resolve(projectDir)
  const hash = createHash('sha1').update(full.toLowerCase()).digest('hex').slice(0, 10)
  const name = basename(full).replace(/[^\w.-]+/g, '_').slice(0, 40)
  return join(previewCacheRoot(), `${name}-${hash}`)
}

export async function removePreviewCache(projectDir: string): Promise<void> {
  await fs.rm(previewCacheFor(projectDir), { recursive: true, force: true }).catch(() => {})
}

/** Total size and file count of every project's preview copies. */
export async function previewCacheStats(): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0
  const root = previewCacheRoot()
  const dirs = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    for (const f of await fs.readdir(join(root, d.name)).catch(() => [] as string[])) {
      const st = await fs.stat(join(root, d.name, f)).catch(() => null)
      if (st?.isFile()) {
        bytes += st.size
        files++
      }
    }
  }
  return { bytes, files }
}
