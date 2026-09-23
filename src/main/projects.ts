import { app } from 'electron'
import { promises as fs, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import type { Asset, CursorData, Preset, Project, ProjectSummary } from '@shared/types'
import { autoZoomFromClicks } from '@shared/autozoom'
import { defaultEdit, migrateProject, uid } from '@shared/defaults'
import { spawn } from 'child_process'
import { ffmpegPath, probeVideo, runFfmpeg } from './ffmpeg'

export function projectsRoot(): string {
  return join(app.getPath('documents'), 'Scrim')
}

/** Projects made before the rename to Scrim still live here. We keep showing them. */
const legacyRoot = (): string => join(app.getPath('documents'), 'Demo Frame')
const roots = (): string[] => [projectsRoot(), ...(existsSync(legacyRoot()) ? [legacyRoot()] : [])]

export async function ensureRoot(): Promise<string> {
  const root = projectsRoot()
  await fs.mkdir(root, { recursive: true })
  return root
}

export async function newProjectDir(): Promise<{ id: string; dir: string }> {
  const root = await ensureRoot()
  const id = 'recording-' + Date.now()
  const dir = join(root, id)
  await fs.mkdir(dir, { recursive: true })
  return { id, dir }
}

export async function saveProject(p: Project): Promise<void> {
  p.updatedAt = Date.now()
  const file = join(p.dir, 'project.json')
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(p, null, 1))
  await fs.rename(tmp, file) // atomic-ish save so a crash never corrupts the project
}

export async function loadProject(dir: string): Promise<Project> {
  const raw = await fs.readFile(join(dir, 'project.json'), 'utf8')
  const p = JSON.parse(raw) as Project
  p.dir = dir
  return migrateProject(p)
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureRoot()
  const out: ProjectSummary[] = []
  const dirs: string[] = []
  for (const root of roots()) {
    for (const e of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) if (e.isDirectory()) dirs.push(join(root, e.name))
  }
  for (const dir of dirs) {
    try {
      const p = await loadProject(dir)
      const thumb = join(dir, 'thumb.jpg')
      out.push({
        id: p.id,
        name: p.name,
        dir,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        duration: p.media.screen.duration,
        thumb: existsSync(thumb) ? thumb : undefined
      })
    } catch {
      /* not a project */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function makeThumb(videoPath: string, dir: string): Promise<void> {
  await runFfmpeg(['-ss', '0.5', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', join(dir, 'thumb.jpg')])
}

/** Creates a project from any existing video file (no cursor data). */
export async function importVideo(file: string): Promise<Project> {
  const { id, dir } = await newProjectDir()
  const ext = extname(file).toLowerCase()
  const target = join(dir, 'screen.mp4')
  // Remux (or transcode if needed) so the editor always gets a seek-friendly mp4 with 1s keyframes.
  let r = { code: 1, stderr: '' }
  if (ext === '.mp4' || ext === '.mov' || ext === '.m4v') {
    r = await runFfmpeg(['-i', file, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', target])
  }
  if (r.code !== 0) {
    r = await runFfmpeg([
      '-i', file, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30',
      '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', target
    ])
  }
  if (r.code !== 0) throw new Error('Could not read this video file.')
  const info = await probeVideo(target)
  // pull any embedded audio out as its own track so it can be muted/adjusted
  let system: Project['media']['system']
  const hasAudio = /Audio:/.test((await runFfmpeg(['-i', target])).stderr)
  if (hasAudio) {
    const a = join(dir, 'audio.m4a')
    const ar = await runFfmpeg(['-i', target, '-vn', '-c:a', 'copy', a])
    if (ar.code === 0) system = { path: a, offset: 0 }
  }
  await makeThumb(target, dir)
  const p: Project = {
    version: 1,
    id,
    name: basename(file, ext),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dir,
    media: { screen: { path: target, ...info }, system },
    edit: defaultEdit(info.duration)
  }
  p.edit.cursor.show = false
  await saveProject(p)
  return p
}

/** Copies a background image/video into the project. Videos Chromium can't play (mov, hevc...) are converted. */
export async function copyAsset(dir: string, file: string): Promise<string> {
  const assets = join(dir, 'assets')
  await fs.mkdir(assets, { recursive: true })
  const ext = extname(file).toLowerCase()
  if (!IMAGE_OK.includes(ext)) {
    const probe = (await runFfmpeg(['-i', file])).stderr
    const playable = VIDEO_OK.includes(ext) && (/Video: h264/.test(probe) || /Video: vp[89]/.test(probe))
    if (/Stream #.*Video:/.test(probe) && !playable) {
      const target = join(assets, uid('a') + '.mp4')
      const r = await runFfmpeg([
        '-i', file, '-map', '0:v:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-g', '30',
        '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', target
      ])
      if (r.code !== 0) throw new Error('Could not convert that video.')
      return target
    }
  }
  const target = join(assets, uid('a') + ext)
  await fs.copyFile(file, target)
  return target
}

export async function deleteProject(dir: string): Promise<void> {
  if (!roots().some((r) => dir.startsWith(r))) throw new Error('Refusing to delete outside projects folder')
  await fs.rm(dir, { recursive: true, force: true })
}

// ---------- presets ----------
const presetsFile = () => join(app.getPath('userData'), 'presets.json')
export async function loadPresets(): Promise<Preset[]> {
  try {
    return JSON.parse(await fs.readFile(presetsFile(), 'utf8'))
  } catch {
    return []
  }
}
export async function savePresets(list: Preset[]): Promise<void> {
  await fs.writeFile(presetsFile(), JSON.stringify(list, null, 1))
}

// ---------- imported media (video / audio / image) ----------
const VIDEO_OK = ['.mp4', '.webm', '.m4v']
const AUDIO_OK = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.opus', '.webm']
const IMAGE_OK = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

export async function importAsset(dir: string, file: string): Promise<Asset> {
  const assets = join(dir, 'assets')
  await fs.mkdir(assets, { recursive: true })
  const ext = extname(file).toLowerCase()
  const id = uid('a')
  const name = basename(file)
  const probe = (await runFfmpeg(['-i', file])).stderr
  const hasVideo = /Stream #.*Video:/.test(probe) && !/Video: (png|mjpeg).*attached pic/.test(probe)
  const hasAudio = /Stream #.*Audio:/.test(probe)

  if (IMAGE_OK.includes(ext)) {
    const target = join(assets, id + ext)
    await fs.copyFile(file, target)
    const v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(probe)
    return { id, kind: 'image', name, path: target, duration: 0, width: v ? +v[1] : 512, height: v ? +v[2] : 512, hasAudio: false }
  }
  if (hasVideo) {
    let target = join(assets, id + ext)
    const h264 = /Video: h264/.test(probe)
    const vp = /Video: vp[89]/.test(probe)
    if (VIDEO_OK.includes(ext) && (h264 || vp || ext === '.webm')) {
      await fs.copyFile(file, target)
    } else {
      // transcode anything else (mov, mkv, avi, hevc...) so the editor can always play and decode it
      target = join(assets, id + '.mp4')
      const r = await runFfmpeg([
        '-i', file, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '30',
        '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', target
      ])
      if (r.code !== 0) throw new Error('Could not convert that video.')
    }
    const info = await probeVideo(target)
    return { id, kind: 'video', name, path: target, duration: info.duration, width: info.width, height: info.height, hasAudio }
  }
  if (hasAudio) {
    let target = join(assets, id + ext)
    if (AUDIO_OK.includes(ext)) await fs.copyFile(file, target)
    else {
      target = join(assets, id + '.m4a')
      const r = await runFfmpeg(['-i', file, '-vn', '-c:a', 'aac', '-b:a', '192k', target])
      if (r.code !== 0) throw new Error('Could not convert that audio file.')
    }
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe)
    const duration = d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0
    return { id, kind: 'audio', name, path: target, duration, width: 0, height: 0, hasAudio: true }
  }
  throw new Error('That file type is not supported.')
}

/** Loudness peaks (about 50 per second, 0..1) for drawing waveforms. Cached next to the file. */
export async function audioPeaks(file: string): Promise<number[]> {
  const cache = file + '.peaks.json'
  try {
    return JSON.parse(await fs.readFile(cache, 'utf8'))
  } catch {
    /* build it */
  }
  const rate = 4000
  const per = rate / 50
  const pcm = await new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = []
    const p = spawn(ffmpegPath(), ['-hide_banner', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { windowsHide: true })
    p.stdout.on('data', (d: Buffer) => chunks.push(d))
    p.on('close', () => resolve(Buffer.concat(chunks)))
    p.on('error', () => resolve(Buffer.alloc(0)))
  })
  const n = Math.floor(pcm.length / 2)
  const out: number[] = []
  for (let i = 0; i < n; i += per) {
    let peak = 0
    for (let j = i; j < Math.min(n, i + per); j++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(j * 2)))
    out.push(+(peak / 32768).toFixed(3))
  }
  await fs.writeFile(cache, JSON.stringify(out)).catch(() => {})
  return out
}

/** Returns the sample project directory if it already exists, is complete, and contains the rich showcase configuration. */
export async function getSampleDir(reset = false): Promise<string | null> {
  const dir = join(await ensureRoot(), 'sample-project')
  try {
    const projPath = join(dir, 'project.json')
    const videoPath = join(dir, 'screen.mp4')
    if (existsSync(projPath) && existsSync(videoPath)) {
      const p = await loadProject(dir)
      if (p.edit?.texts?.length && p.edit?.transitions?.items?.length) {
        // practice always starts from the untouched sample
        const original = join(dir, 'project.original.json')
        if (reset) {
          if (!existsSync(original)) return null // an old sample without a clean copy: make a new one
          await fs.copyFile(original, projPath)
        }
        return dir
      }
    }
  } catch {
    /* ignore and re-create */
  }
  return null
}

/** Folder for the practice project. Starting again replaces the old one, so there is only ever one. */
export async function sampleBegin(): Promise<{ dir: string; video: string }> {
  const dir = join(await ensureRoot(), 'sample-project')
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  return { dir, video: join(dir, 'raw.mp4') }
}

/** Finishes the practice project: seek friendly video, cursor data, thumbnail and a showcase of all features. */
export async function sampleFinish(dir: string, cursor: CursorData, duration: number): Promise<string> {
  const raw = join(dir, 'raw.mp4')
  const target = join(dir, 'screen.mp4')
  const r = await runFfmpeg(['-i', raw, '-c', 'copy', '-movflags', '+faststart', target])
  if (r.code !== 0) await fs.rename(raw, target)
  else await fs.rm(raw, { force: true })
  const info = await probeVideo(target)
  await fs.writeFile(join(dir, 'cursor.json'), JSON.stringify(cursor))
  await makeThumb(target, dir).catch(() => {})
  const dur = info.duration || duration
  const edit = defaultEdit(dur)
  edit.zoom.segments = autoZoomFromClicks(cursor, dur)

  // Split into 2 clips to showcase cut transitions
  const clip1Id = uid('c')
  const clip2Id = uid('c')
  const cutPoint = Math.min(5.2, +(dur * 0.48).toFixed(2))
  edit.clips = [
    { id: clip1Id, start: 0, end: cutPoint, speed: 1 },
    { id: clip2Id, start: cutPoint, end: dur, speed: 1 }
  ]

  // Rich transitions: intro, outro, cut, per-cut override, and timeline transition items
  edit.transitions = {
    intro: { type: 'fade', duration: 0.6, ease: 'smooth' },
    outro: { type: 'fade', duration: 0.6, ease: 'smooth' },
    cut: { type: 'zoom', duration: 0.45, ease: 'smooth' },
    perCut: {
      [clip2Id]: { type: 'slide-left', duration: 0.5, ease: 'snappy' }
    },
    items: [
      { id: uid('trans'), type: 'wipe', start: Math.min(7.2, +(dur * 0.68).toFixed(2)), end: Math.min(7.9, +(dur * 0.74).toFixed(2)), direction: 'right', ease: 'snappy' }
    ]
  }

  // Showcase text overlays with diverse animations and styles
  edit.texts = [
    {
      id: uid('t'),
      start: 0.4,
      end: 3.2,
      lane: 0,
      text: '⚡ Instant Workflow Demo',
      x: 0.5,
      y: 0.18,
      font: 'Inter',
      size: 42,
      bold: true,
      italic: false,
      underline: false,
      color: '#ffffff',
      bg: '#0b0d12',
      bgOpacity: 0.85,
      padding: 16,
      radius: 12,
      align: 'center',
      shadow: true,
      anim: 'slide-up',
      animIn: 'slide-up',
      animOut: 'fade',
      inDur: 0.45,
      outDur: 0.35,
      loop: 'none',
      letterSpacing: 0
    },
    {
      id: uid('t'),
      start: 4.6,
      end: 7.4,
      lane: 0,
      text: '🎯 Dynamic Cut & Transition',
      x: 0.5,
      y: 0.84,
      font: 'Inter',
      size: 38,
      bold: true,
      italic: false,
      underline: false,
      color: '#ffffff',
      bg: '#0a84ff',
      bgOpacity: 0.9,
      padding: 14,
      radius: 10,
      align: 'center',
      shadow: true,
      anim: 'pop',
      animIn: 'pop',
      animOut: 'fade',
      inDur: 0.45,
      outDur: 0.35,
      loop: 'none',
      letterSpacing: 0
    },
    {
      id: uid('t'),
      start: 7.8,
      end: Math.max(8.5, +(dur - 0.2).toFixed(2)),
      lane: 0,
      text: '✨ Studio Quality Polish',
      x: 0.5,
      y: 0.84,
      font: 'Inter',
      size: 38,
      bold: true,
      italic: false,
      underline: false,
      color: '#ffffff',
      bg: '#30d158',
      bgOpacity: 0.9,
      padding: 14,
      radius: 10,
      align: 'center',
      shadow: true,
      anim: 'fade',
      animIn: 'fade',
      animOut: 'fade',
      inDur: 0.45,
      outDur: 0.35,
      loop: 'none',
      letterSpacing: 0
    }
  ]

  // Showcase visual effects (both global look grade and timeline effect clips)
  edit.effects = {
    look: 'punchy',
    brightness: 1.02,
    contrast: 1.08,
    saturation: 1.15,
    vignette: 0.15,
    grain: 0.02,
    bloom: 0.1,
    blur: 0,
    pixelate: 0,
    scanlines: 0
  }
  edit.effectClips = [
    {
      id: uid('fx'),
      name: 'Cinematic Accent',
      start: 2.2,
      end: 5.0,
      lane: 0,
      look: 'cinematic',
      brightness: 1.05,
      contrast: 1.14,
      saturation: 1.2,
      vignette: 0.22,
      grain: 0.04,
      bloom: 0.16,
      blur: 0,
      pixelate: 0,
      scanlines: 0
    }
  ]

  const p: Project = {
    version: 1,
    id: 'sample-project',
    name: 'Sample project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dir,
    media: { screen: { path: target, ...info, duration: dur }, cursor: join(dir, 'cursor.json') },
    edit
  }
  await saveProject(p)
  await fs.copyFile(join(dir, 'project.json'), join(dir, 'project.original.json'))
  return dir
}
