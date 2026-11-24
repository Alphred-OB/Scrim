import { app } from 'electron'
import { resolve, relative, isAbsolute, extname, dirname } from 'path'
import { tmpdir } from 'os'
import { statSync } from 'fs'
import { projectRoots } from './projects'

const DANGEROUS_EXTS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.msi', '.com', '.scr',
  '.pif', '.reg', '.dll', '.sh', '.bash', '.csh', '.bin', '.app',
  '.jar', '.vbe', '.hta', '.wsf', '.wsh', '.lnk', '.url', '.js', '.jse',
  '.cpl', '.msc', '.appref-ms', '.application', '.psm1', '.ps1xml'
])

/** Files the app ever hands to the OS to open: its own exports, captions and guides. */
const OPENABLE_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.gif', '.png', '.jpg', '.jpeg', '.webp', '.srt', '.vtt', '.txt', '.md', '.pdf', '.html'])

export function isDangerousExtension(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return true
  return DANGEROUS_EXTS.has(extname(filePath).toLowerCase())
}

/**
 * Folders the user picked in a dialog this session (or that hold a project they opened).
 * The renderer may only write or delete inside the app's own folders plus these.
 */
const granted = new Set<string>()
export function grantPath(dirOrFile: string | null | undefined): void {
  if (dirOrFile && typeof dirOrFile === 'string') granted.add(resolve(dirOrFile))
}
/** For a file the user chose in a Save dialog: its folder, since exports write temp files beside it. */
export function grantParentOf(file: string | null | undefined): string | null | undefined {
  if (file && typeof file === 'string') grantPath(dirname(file))
  return file
}

export function getAllowedRoots(): string[] {
  return [...projectRoots(), app.getPath('userData'), tmpdir(), ...granted]
}

const inside = (root: string, target: string): boolean => {
  const rel = relative(resolve(root), target)
  return rel === '' || (!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && rel !== '..' && !isAbsolute(rel))
}

export function isPathAllowed(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false
  try {
    const target = resolve(targetPath)
    return getAllowedRoots().some((r) => inside(r, target))
  } catch {
    return false
  }
}

/** shell:open: a folder, or a media/document file, inside an allowed place. Never anything Windows would run. */
export function isOpenable(p: string): boolean {
  if (!isPathAllowed(p) || isDangerousExtension(p)) return false
  try {
    if (statSync(p).isDirectory()) return true
  } catch {
    return false
  }
  return OPENABLE_EXTS.has(extname(p).toLowerCase())
}

export function isSafeExternalUrl(urlStr: string): boolean {
  try {
    const p = new URL(urlStr).protocol
    return p === 'https:' || p === 'http:'
  } catch {
    return false
  }
}
