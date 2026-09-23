/**
 * Joins another video onto the start or end of a project's main video.
 *
 * Every edit time in Scrim is "source time" (seconds inside screen.mp4), so joining means building
 * a new screen.mp4 that contains both videos, then:
 *  - joining at the end: existing edits stay where they are, the new part starts at the old length
 *  - joining at the start: every existing time is pushed back by the new video's length
 * The joined video is scaled into the project's frame size (letterboxed if the shape differs).
 * If it's another Scrim recording, its cursor, clicks, mic and system audio come along too.
 */
import { promises as fs, existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { Asset, AudioClip, CursorData, EditState, Project } from '@shared/types'
import { migrateProject, uid } from '@shared/defaults'
import { autoZoomFromClicks } from '@shared/autozoom'
import { detectEncoder, encoderArgs, probeVideo, runFfmpeg } from './ffmpeg'
import { loadProject, makeThumb, saveProject } from './projects'

export type JoinWhere = 'start' | 'end'

interface Incoming {
  video: string
  name: string
  width: number
  height: number
  duration: number
  fps: number
  /** set when the file belongs to another Scrim recording */
  project?: Project
  cursor?: CursorData
}

async function readIncoming(file: string): Promise<Incoming> {
  const info = await probeVideo(file)
  if (!info.duration) throw new Error('Could not read that video.')
  const inc: Incoming = { video: file, name: basename(file), width: info.width, height: info.height, duration: info.duration, fps: info.fps }
  // picked the screen.mp4 of another Scrim recording? bring its cursor and audio along
  const projDir = dirname(file)
  if (existsSync(join(projDir, 'project.json'))) {
    try {
      const p = await loadProject(projDir)
      if (p.media.screen.path === file || basename(file) === 'screen.mp4') {
        inc.project = p
        inc.name = p.name
        if (p.media.cursor && existsSync(p.media.cursor)) inc.cursor = JSON.parse(await fs.readFile(p.media.cursor, 'utf8')) as CursorData
      }
    } catch {
      /* treat it as a plain video */
    }
  }
  return inc
}

/** Moves every time in the edit (and the recorded tracks) later by `d` seconds. */
function shiftEdit(e: EditState, d: number): void {
  const ranges: { start: number; end: number }[][] = [e.clips, e.zoom.segments, e.texts, e.overlays, e.audioClips]
  for (const list of ranges) for (const it of list) (it.start += d), (it.end += d)
  e.cursor.hiddenClicks = e.cursor.hiddenClicks.map((ms) => ms + Math.round(d * 1000))
}

function shiftCursor(c: CursorData, d: number): CursorData {
  return {
    ...c,
    samples: c.samples.map((s) => ({ ...s, t: s.t + d })),
    clicks: c.clicks.map((k) => ({ ...k, t: k.t + d, up: k.up !== undefined ? k.up + d : undefined })),
    hidden: c.hidden?.map(([a, b]) => [a + d, b + d] as [number, number])
  }
}

/** Maps normalized cursor coords of the joined video into the letterboxed frame. */
function fitCursor(c: CursorData, from: { w: number; h: number }, to: { w: number; h: number }): CursorData {
  const s = Math.min(to.w / from.w, to.h / from.h)
  const ox = (to.w - from.w * s) / 2 / to.w
  const oy = (to.h - from.h * s) / 2 / to.h
  const kx = (from.w * s) / to.w
  const ky = (from.h * s) / to.h
  const map = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: ox + p.x * kx, y: oy + p.y * ky })
  return { ...c, width: to.w, height: to.h, samples: c.samples.map(map), clicks: c.clicks.map(map) }
}

async function audioDuration(file: string): Promise<number> {
  const { stderr } = await runFfmpeg(['-i', file])
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0
}

/** Copies (or extracts) an audio track into the project's assets and returns it placed on the Audio track. */
async function placeAudio(
  dir: string,
  src: string,
  name: string,
  at: number,
  limit: number
): Promise<{ asset: Asset; clip: AudioClip } | null> {
  const assets = join(dir, 'assets')
  await fs.mkdir(assets, { recursive: true })
  const id = uid('a')
  const target = join(assets, id + '.m4a')
  const r = await runFfmpeg(['-i', src, '-vn', '-c:a', 'aac', '-b:a', '192k', target])
  if (r.code !== 0) return null
  const dur = await audioDuration(target)
  if (dur <= 0.05) return null
  const trimStart = at < 0 ? -at : 0
  const start = Math.max(0, at)
  const end = Math.min(limit, start + dur - trimStart)
  if (end - start < 0.05) return null
  const asset: Asset = { id, kind: 'audio', name, path: target, duration: dur, width: 0, height: 0, hasAudio: true }
  const clip: AudioClip = { id: uid('ac'), assetId: id, start, end, trimStart, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 }
  return { asset, clip }
}

export async function joinVideo(
  dir: string,
  file: string,
  where: JoinWhere,
  onProgress: (p: number) => void
): Promise<{ project: Project; cursor: CursorData | null }> {
  const p = await loadProject(dir)
  const base = p.media.screen
  const inc = await readIncoming(file)
  const W = base.width
  const H = base.height
  const fps = base.fps || 30

  // ---- 1. build the combined video ----
  const first = where === 'start' ? inc.video : base.path
  const second = where === 'start' ? base.path : inc.video
  const norm = (i: number) =>
    `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[v${i}]`
  const filter = `${norm(0)};${norm(1)};[v0][v1]concat=n=2:v=1:a=0[v]`
  const total = base.duration + inc.duration
  const out = join(dir, `screen-${Date.now()}.mp4`)
  const progress = (line: string) => {
    const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
    if (m) onProgress(Math.min(0.99, (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) / total))
  }
  const run = (enc: string) =>
    runFfmpeg(['-i', first, '-i', second, '-filter_complex', filter, '-map', '[v]', ...encoderArgs(enc, fps), '-movflags', '+faststart', out], progress)
  let r = await run(await detectEncoder())
  if (r.code !== 0) r = await run('libx264')
  if (r.code !== 0) throw new Error('Could not join the videos.\n' + r.stderr.split('\n').slice(-4).join('\n'))

  const info = await probeVideo(out)
  // where the joined video sits in the new source timeline, and how far old content moved
  const incLen = Math.max(0.1, info.duration - base.duration)
  const at = where === 'start' ? 0 : base.duration
  const shift = where === 'start' ? incLen : 0

  // ---- 2. move existing edits and recorded tracks ----
  const e = p.edit
  if (shift) {
    shiftEdit(e, shift)
    for (const k of ['mic', 'system', 'webcam'] as const) {
      const m = p.media[k]
      if (m) m.offset += shift
    }
  }
  e.clips.push({ id: uid('c'), start: at, end: at + incLen, speed: 1 })
  e.clips.sort((a, b) => a.start - b.start)

  // ---- 3. cursor: keep both recordings' cursors, hide it where there was none ----
  let cursor: CursorData | null = null
  if (p.media.cursor && existsSync(p.media.cursor)) cursor = JSON.parse(await fs.readFile(p.media.cursor, 'utf8')) as CursorData
  const hadCursor = !!cursor
  if (cursor && shift) cursor = shiftCursor(cursor, shift)
  const incRange: [number, number] = [at, at + incLen]
  const baseRange: [number, number] = where === 'start' ? [incLen, info.duration] : [0, base.duration]
  if (inc.cursor) {
    const fitted = shiftCursor(fitCursor(inc.cursor, { w: inc.width, h: inc.height }, { w: W, h: H }), at)
    fitted.samples = fitted.samples.filter((s) => s.t >= incRange[0] && s.t < incRange[1])
    fitted.clicks = fitted.clicks.filter((c) => c.t >= incRange[0] && c.t < incRange[1])
    cursor = cursor
      ? {
          ...cursor,
          samples: [...cursor.samples, ...fitted.samples].sort((a, b) => a.t - b.t),
          clicks: [...cursor.clicks, ...fitted.clicks].sort((a, b) => a.t - b.t),
          hidden: [...(cursor.hidden ?? []), ...(fitted.hidden ?? [])]
        }
      : { width: W, height: H, samples: fitted.samples, clicks: fitted.clicks, hidden: [baseRange, ...(fitted.hidden ?? [])] }
    // automatic zooms for the joined recording's clicks
    if (e.zoom.auto) {
      const zooms = autoZoomFromClicks({ ...fitted, clicks: fitted.clicks.map((c) => ({ ...c, t: c.t - at })) }, incLen, e.zoom.autoScale)
      for (const z of zooms) e.zoom.segments.push({ ...z, start: z.start + at, end: z.end + at })
    }
    e.cursor.show = true
  } else if (cursor) {
    cursor.hidden = [...(cursor.hidden ?? []), incRange]
  }
  if (cursor) {
    const cursorPath = join(dir, 'cursor.json')
    await fs.writeFile(cursorPath, JSON.stringify(cursor))
    p.media.cursor = cursorPath
  }
  if (!hadCursor && !inc.cursor) e.cursor.show = false

  // ---- 4. audio from the joined video goes on the Audio track ----
  const added: { asset: Asset; clip: AudioClip }[] = []
  const limit = info.duration
  if (inc.project) {
    for (const k of ['mic', 'system'] as const) {
      const m = inc.project.media[k]
      if (!m || !existsSync(m.path)) continue
      const placed = await placeAudio(dir, m.path, `${inc.name} (${k === 'mic' ? 'microphone' : 'system audio'})`, at + m.offset, Math.min(limit, at + incLen))
      if (placed) added.push(placed)
    }
  } else if (/Stream #.*Audio:/.test((await runFfmpeg(['-i', inc.video])).stderr)) {
    const placed = await placeAudio(dir, inc.video, `${inc.name} (audio)`, at, at + incLen)
    if (placed) added.push(placed)
  }
  for (const a of added) {
    e.assets.push(a.asset)
    e.audioClips.push(a.clip)
  }

  // ---- 5. swap in the new video and save ----
  const oldPath = base.path
  p.media.screen = { ...base, path: out, width: info.width, height: info.height, duration: info.duration, fps }
  // the joined video can only be as smooth as the choppier of the two
  const incFps = inc.project?.media.screen.realFps ?? inc.project?.media.screen.fps ?? inc.fps
  p.media.screen.realFps = Math.min(fps, base.realFps ?? fps, incFps)
  await saveProject(p)
  // keep the original recording file only if it was a Scrim capture's first video; old joins are replaced
  if (/screen-\d+\.mp4$/.test(oldPath)) await fs.rm(oldPath, { force: true }).catch(() => {})
  await makeThumb(out, dir).catch(() => {})
  onProgress(1)
  return { project: migrateProject(p), cursor }
}
