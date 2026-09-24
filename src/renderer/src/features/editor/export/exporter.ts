import {
  ALL_FORMATS, CanvasSource, Input, Mp4OutputFormat, Output, Quality, StreamTarget, UrlSource, VideoSample, VideoSampleSink, WebMOutputFormat,
  getFirstEncodableVideoCodec, type StreamTargetChunk, type VideoCodec
} from 'mediabunny'
import type { CursorData, ExportSettings, Project } from '@shared/types'
import { audibleClicks, clickTrackWav } from '@shared/clickSounds'
import { api, mediaUrl, type MuxJobIn } from '@/lib/api'
import { Renderer, computeLayout, outputSize } from '../engine/compositor'
import { buildCameraTrack, buildTrack } from '../engine/cursorTrack'
import { outputDuration, outputToSource, sortedClips } from '../engine/timeMap'

export interface ExportProgress { phase: 'prepare' | 'render' | 'audio' | 'done'; progress: number; frame?: number; frames?: number; speed?: number; eta?: number }

// bits per pixel per frame; screen recordings are mostly sharp text, which needs more than camera video
const BITRATE_PER_PIXEL: Record<ExportSettings['quality'], number> = { low: 0.07, medium: 0.12, high: 0.2, max: 0.32 }

export const GIF_MAX_RES = 720
export const GIF_MAX_FPS = 30

/**
 * Output short side at which the recording is drawn 1:1 (no upscaling). Padding, crop and aspect
 * all change this, so it's measured with the real layout instead of guessed from the screen size.
 */
export function originalRes(project: Project): number {
  const { width, height } = project.media.screen
  const [W, H] = outputSize(project.edit, width, height, 1080)
  const L = computeLayout(project.edit, width, height, W, H)
  return Math.max(2, Math.round((1080 * L.crop.w) / Math.max(1, L.view.w) / 2) * 2)
}

/** Frame rate the recording really has. Exporting above this would only repeat frames. */
export function sourceFps(project: Project): number {
  const s = project.media.screen
  return s.realFps ?? s.fps
}

const codecPrefs = (format: ExportSettings['format']): VideoCodec[] => (format === 'webm' ? ['vp9', 'vp8', 'av1'] : ['avc', 'hevc'])

/** True when this PC has an encoder for this size (hardware limits differ, e.g. some can't do 4K). */
export async function canEncode(format: ExportSettings['format'], W: number, H: number): Promise<boolean> {
  return !!(await getFirstEncodableVideoCodec(codecPrefs(format), { width: W, height: H }).catch(() => null))
}

export function exportDims(project: Project, s: ExportSettings): { W: number; H: number; fps: number; frames: number; duration: number } {
  const res = s.resolution > 0 ? s.resolution : originalRes(project)
  const [W, H] = outputSize(project.edit, project.media.screen.width, project.media.screen.height, res)
  const duration = outputDuration(project.edit.clips, project.edit.leadIn ?? 0)
  return { W, H, fps: s.fps, duration, frames: Math.max(1, Math.round(duration * s.fps)) }
}

/**
 * Rough export time: renders a few frames of the real compositor at full size to measure this PC,
 * then adds typical decode/encode cost. Good enough to say "about 2 minutes".
 */
export async function estimateExportSeconds(project: Project, cursorData: CursorData | null, s: ExportSettings): Promise<number> {
  const { W, H, frames } = exportDims(project, s)
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d', { alpha: false })!
  const r = new Renderer()
  const track = buildTrack(cursorData, project.media.screen.duration, project.edit.cursor.smoothing)
  const src = new OffscreenCanvas(project.media.screen.width, project.media.screen.height)
  const draw = (c: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, ...a: number[]) => c.drawImage(src, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7])
  r.render(ctx, W, H, { edit: project.edit, srcW: project.media.screen.width, srcH: project.media.screen.height, t: 0, drawFrame: draw, cursor: track, camera: null, clicks: [] })
  const N = 8
  const t0 = performance.now()
  for (let i = 0; i < N; i++) {
    r.render(ctx, W, H, { edit: project.edit, srcW: project.media.screen.width, srcH: project.media.screen.height, t: i / 10, drawFrame: draw, cursor: track, camera: null, clicks: cursorData?.clicks ?? [] })
    ctx.getImageData(0, 0, 1, 1) // force the GPU to finish
  }
  const perFrame = (performance.now() - t0) / N / 1000
  const pixels = W * H
  const codec = pixels * 4.5e-9 + 0.004 // decode + encode per frame (hardware assisted)
  const layers = project.edit.overlays.length * 0.004 + (project.media.webcam ? 0.004 : 0)
  const gif = s.format === 'gif' ? frames * 0.01 : 0
  return frames * (perFrame + codec + layers) + gif + 3
}

type Sink = { list: { frame: number; time: number }[]; iter: AsyncGenerator<VideoSample | null>; input: Input; cur: VideoSample | null; pos: number }

async function openSink(path: string, list: { frame: number; time: number }[]): Promise<Sink | null> {
  if (!list.length) return null
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(mediaUrl(path)) })
  const track = await input.getPrimaryVideoTrack()
  if (!track) {
    input.dispose()
    return null
  }
  const sink = new VideoSampleSink(track)
  const times = function* () {
    for (const e of list) yield Math.max(0, e.time)
  }
  return { list, iter: sink.samplesAtTimestamps(times()), input, cur: null, pos: 0 }
}

/** Advances a sink to output frame k and returns the frame to draw (or null when not visible). */
async function sinkFrame(s: Sink | null, k: number): Promise<VideoSample | null> {
  if (!s) return null
  if (s.pos >= s.list.length || s.list[s.pos].frame !== k) return null
  const r = await s.iter.next()
  s.pos++
  const smp = r.done ? null : r.value
  if (smp && s.cur && smp !== s.cur) s.cur.close()
  if (smp) s.cur = smp
  return s.cur
}

function closeSink(s: Sink | null): void {
  if (!s) return
  s.cur?.close()
  s.iter.return(undefined).catch(() => {})
  s.input.dispose()
}

export async function exportProject(
  project: Project,
  cursorData: CursorData | null,
  settings: ExportSettings,
  outPath: string,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal
): Promise<void> {
  const edit = project.edit
  const media = project.media
  const { width: srcW, height: srcH, duration } = media.screen
  const { W, H, fps, frames, duration: outDur } = exportDims(project, settings)
  const clips = sortedClips(edit.clips)
  const webm = settings.format === 'webm'
  const lead = edit.leadIn ?? 0
  const srcTime = (k: number) => Math.min(duration - 0.001, outputToSource(clips, k / fps, lead))

  onProgress({ phase: 'prepare', progress: 0 })
  await document.fonts.ready
  await Promise.all(edit.texts.map((t) => document.fonts.load(`${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} 40px "${t.font}"`).catch(() => null)))

  // ---- inputs ----
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(mediaUrl(media.screen.path)) })
  const vTrack = await input.getPrimaryVideoTrack()
  if (!vTrack) throw new Error('The recording has no video track.')
  const sink = new VideoSampleSink(vTrack)

  const sinks: Sink[] = []
  let bgSink: Sink | null = null
  if (edit.background.type === 'video' && edit.background.videoPath) {
    const probe = new Input({ formats: ALL_FORMATS, source: new UrlSource(mediaUrl(edit.background.videoPath)) })
    const bgDur = (await probe.computeDuration().catch(() => 1)) || 1
    probe.dispose()
    bgSink = await openSink(edit.background.videoPath, Array.from({ length: frames }, (_, k) => ({ frame: k, time: (k / fps) % bgDur })))
    if (bgSink) sinks.push(bgSink)
  }

  let camSink: Sink | null = null
  if (media.webcam && edit.webcam.show) {
    const off = media.webcam.offset + edit.audio.syncOffset
    const list: { frame: number; time: number }[] = []
    for (let k = 0; k < frames; k++) {
      const t = srcTime(k) - off
      if (t >= 0) list.push({ frame: k, time: t })
    }
    camSink = await openSink(media.webcam.path, list)
    if (camSink) sinks.push(camSink)
  }

  const assets = new Map(edit.assets.map((a) => [a.id, a]))
  const ovSinks = new Map<string, Sink>()
  const ovImages = new Map<string, ImageBitmap>()
  for (const o of edit.overlays) {
    const a = assets.get(o.assetId)
    if (!a) continue
    if (a.kind === 'image') {
      if (!ovImages.has(a.id)) ovImages.set(a.id, await createImageBitmap(await (await fetch(mediaUrl(a.path))).blob()))
      continue
    }
    const list: { frame: number; time: number }[] = []
    for (let k = 0; k < frames; k++) {
      const t = srcTime(k)
      if (t >= o.start && t <= o.end) list.push({ frame: k, time: o.trimStart + (t - o.start) })
    }
    const s = await openSink(a.path, list)
    if (s) {
      ovSinks.set(o.id, s)
      sinks.push(s)
    }
  }

  let bgImage: ImageBitmap | null = null
  if (edit.background.type === 'image' && edit.background.imagePath) {
    bgImage = await createImageBitmap(await (await fetch(mediaUrl(edit.background.imagePath))).blob())
  }

  const track = buildTrack(cursorData, duration, edit.cursor.smoothing)
  const camera = buildCameraTrack(cursorData, duration)
  const clicks = cursorData?.clicks ?? []

  // ---- output ----
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d', { alpha: false })!
  const renderer = new Renderer()
  const tmpVideo = outPath.replace(/\.(mp4|gif|webm|mov)$/i, '') + `.video-${Date.now()}.${webm ? 'webm' : 'mp4'}`
  await api.fileOpen(tmpVideo)
  const writable = new WritableStream<StreamTargetChunk>({ write: (chunk) => api.fileWrite(tmpVideo, chunk.data, chunk.position) })
  const output = new Output({
    format: webm ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target: new StreamTarget(writable, { chunked: true })
  })
  const codec = await getFirstEncodableVideoCodec(codecPrefs(settings.format), { width: W, height: H })
  if (!codec) throw new Error(`This PC can't encode ${W} x ${H} video. Pick a smaller resolution.`)
  const bitrate = Math.round(W * H * fps * BITRATE_PER_PIXEL[settings.quality])
  const source = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate, bitrateMode: 'variable' }), keyFrameInterval: 2, latencyMode: 'quality' })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  const times = function* () {
    for (let k = 0; k < frames; k++) yield Math.max(0, srcTime(k)) // the lead-in has no recording frames
  }

  let prev: VideoSample | null = null
  let k = 0
  const t0 = performance.now()
  try {
    for await (const sample of sink.samplesAtTimestamps(times())) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
      if (sample && prev && sample !== prev) prev.close()
      const frame: VideoSample | null = sample ?? prev
      prev = frame

      const bgFrame = await sinkFrame(bgSink, k)
      const camFrame = await sinkFrame(camSink, k)
      const ovMap = new Map<string, { src: CanvasImageSource; w: number; h: number }>()
      const ovSamples = new Map<string, VideoSample>()
      for (const o of edit.overlays) {
        const a = assets.get(o.assetId)
        if (!a) continue
        const t = srcTime(k)
        if (t < o.start || t > o.end) continue
        if (a.kind === 'image') {
          const bmp = ovImages.get(a.id)
          if (bmp) ovMap.set(o.id, { src: bmp, w: bmp.width, h: bmp.height })
        } else {
          const f = await sinkFrame(ovSinks.get(o.id) ?? null, k)
          if (f) ovSamples.set(o.id, f)
        }
      }
      // turn decoded frames into drawable sources right before drawing (they must be used immediately)
      for (const [id, f] of ovSamples) ovMap.set(id, { src: f.toCanvasImageSource() as CanvasImageSource, w: f.displayWidth, h: f.displayHeight })

      renderer.render(ctx, W, H, {
        edit,
        srcW,
        srcH,
        t: srcTime(k),
        drawFrame: frame ? (c, sx, sy, sw, sh, dx, dy, dw, dh) => frame.draw(c, sx, sy, sw, sh, dx, dy, dw, dh) : null,
        cursor: track,
        camera,
        clicks,
        keys: cursorData?.keys,
        bgImage,
        bgVideo: bgFrame ? (bgFrame.toCanvasImageSource() as CanvasImageSource) : null,
        bgVideoSize: bgFrame ? [bgFrame.displayWidth, bgFrame.displayHeight] : undefined,
        webcam: camFrame ? { src: camFrame.toCanvasImageSource() as CanvasImageSource, w: camFrame.displayWidth, h: camFrame.displayHeight } : null,
        overlays: ovMap
      })
      await source.add(k / fps, 1 / fps)
      k++
      if (k % 5 === 0 || k === frames) {
        const el = (performance.now() - t0) / 1000
        const rate = k / el
        onProgress({ phase: 'render', progress: k / frames, frame: k, frames, speed: rate / fps, eta: (frames - k) / rate })
      }
      if (k >= frames) break
    }
    while (k < frames) {
      await source.add(k / fps, 1 / fps)
      k++
    }
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    await api.fileClose(tmpVideo).catch(() => {})
    await api.fileRemove(tmpVideo).catch(() => {})
    throw e
  } finally {
    prev?.close()
    sinks.forEach(closeSink)
    input.dispose()
    bgImage?.close()
    ovImages.forEach((b) => b.close())
  }
  await api.fileClose(tmpVideo)

  // ---- audio mix + container (or GIF) with ffmpeg ----
  onProgress({ phase: 'audio', progress: 0 })
  const a = edit.audio
  const tracks: MuxJobIn['tracks'] = []
  if (media.mic && !a.micMuted && a.micVolume > 0) tracks.push({ path: media.mic.path, offset: media.mic.offset + a.syncOffset, volume: a.micVolume })
  if (media.system && !a.systemMuted && a.systemVolume > 0) tracks.push({ path: media.system.path, offset: media.system.offset + a.syncOffset, volume: a.systemVolume })
  for (const c of edit.audioClips) {
    const as = assets.get(c.assetId)
    if (!as || c.muted || c.volume <= 0 || !edit.tracks.audio) continue
    tracks.push({ path: as.path, offset: c.start - c.trimStart, volume: c.volume, window: [c.start, c.end], fadeIn: c.fadeIn, fadeOut: c.fadeOut })
  }
  for (const o of edit.overlays) {
    const as = assets.get(o.assetId)
    if (!as || as.kind !== 'video' || !as.hasAudio || o.muted || o.volume <= 0 || !edit.tracks.media) continue
    tracks.push({ path: as.path, offset: o.start - o.trimStart, volume: o.volume, window: [o.start, o.end], fadeIn: 0.05, fadeOut: 0.05 })
  }
  // click sounds: one WAV with a click at every click, cut and sped up along with the video
  let clickWav = ''
  const cl = audibleClicks(cursorData, edit.cursor)
  if (cl.length && edit.cursor.clickVolume > 0) {
    clickWav = outPath.replace(/\.(mp4|gif|webm|mov)$/i, '') + `.clicks-${Date.now()}.wav`
    await api.fileOpen(clickWav)
    await api.fileWrite(clickWav, clickTrackWav(edit.cursor.clickSound, cl, media.screen.duration, 1), 0)
    await api.fileClose(clickWav)
    tracks.push({ path: clickWav, offset: 0, volume: edit.cursor.clickVolume })
  }
  const off = api.on('export:progress', (p: number) => onProgress({ phase: 'audio', progress: p }))
  try {
    await api.mux({
      videoPath: tmpVideo,
      outPath,
      duration: outDur,
      // the mixer works on times from 0: shift everything past the lead-in, which is one more silent-or-not stretch
      clips: lead > 0 ? [{ id: 'lead', start: 0, end: lead, speed: 1 }, ...clips.map((c) => ({ ...c, start: c.start + lead, end: c.end + lead }))] : clips,
      tracks: lead > 0 ? tracks.map((t) => ({ ...t, offset: t.offset + lead, window: t.window ? ([t.window[0] + lead, t.window[1] + lead] as [number, number]) : undefined })) : tracks,
      music: a.musicPath && !a.musicMuted ? { path: a.musicPath, volume: a.musicVolume } : undefined,
      gif: settings.format === 'gif' ? { width: W, fps } : undefined,
      format: settings.format
    })
  } finally {
    off()
    await api.fileRemove(tmpVideo).catch(() => {})
    if (clickWav) await api.fileRemove(clickWav).catch(() => {})
  }
  onProgress({ phase: 'done', progress: 1 })
}
