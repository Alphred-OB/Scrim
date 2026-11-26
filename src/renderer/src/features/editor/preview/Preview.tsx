import { useEffect, useMemo, useRef, useState } from 'react'
import type { Asset, EditState } from '@shared/types'
import { webcamTimeAt } from '@shared/webcamTime'
import { mediaUrl } from '@/lib/api'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { applyCamBg, loadSegmenter } from '../engine/webcamBg'
import { Renderer, type FrameDrawer, blurRect, computeLayout, measureText, outputSize, overlayRect, webcamRect } from '../engine/compositor'
import { buildCameraTrack, buildTrack } from '../engine/cursorTrack'
import { onWallpaperLoaded } from '../engine/backgrounds'
import { clipAt, nextClip, sampleSegmentKeyframes, sortedClips, sourceToOutput, viewport, zoomAt } from '../engine/timeMap'
import { Icon, openContextMenu, showMessage } from '@/ui'
import { addZoomAt } from '../state/actions'
import { playClick } from './clickPlayer'
import { useProxy } from '@/lib/useProxy'

type Box = { x: number; y: number; w: number; h: number }
/** Widest the preview draws while playing, in px. */
const PLAY_MAX_W = 2560
/** How far the adaptive quality may shrink the playing size on a slow PC (1 = full). */
const MIN_PLAY_QUALITY = 0.5

type Handle = { kind: 'text' | 'overlay' | 'webcam' | 'blur'; id: string; box: Box } // box in CSS px relative to canvas

/** Everything that plays alongside the main video, and what time it should be at. */
interface Follower { key: string; el: HTMLMediaElement; want: number | null; volume: number; muted: boolean; rate: number; free?: boolean }

export default function Preview() {
  const project = useEditor((s) => s.project)!
  const edit = project.edit
  const cursorData = useEditor((s) => s.cursorData)
  const playing = useEditor((s) => s.playing)
  const time = useEditor((s) => s.time)
  const selection = useEditor((s) => s.selection)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Long recordings play from a small preview copy (main/proxy.ts). `hiRef` is the original, used only for
  // the sharp frame shown while paused. Export always reads the original.
  const hiRef = useRef<HTMLVideoElement>(null)
  const proxy = useProxy(project)
  const proxyOn = proxy.status === 'ready' && !!proxy.path
  // The webcam plays from its seek friendly copy once it exists. The switch waits for a pause, so playback never blinks.
  const camProxy = useProxy(project, 'cam')
  const camPath = useRef(project.media.webcam?.path ?? '')
  if (!project.media.webcam) camPath.current = ''
  else if (!playing && camProxy.status === 'ready' && camProxy.path) camPath.current = camProxy.path
  else if (!camPath.current) camPath.current = project.media.webcam.path
  const camEditsBg = !!project.media.webcam && edit.webcam.bg !== 'none'
  // Load the cut-out model while idle, not on the first frame after Play (it blocks the page for about a second)
  useEffect(() => {
    if (!camEditsBg) return
    const id = requestIdleCallback(() => void loadSegmenter(), { timeout: 3000 })
    return () => cancelIdleCallback(id)
  }, [camEditsBg])
  const pool = useRef(new Map<string, HTMLMediaElement>())
  const images = useRef(new Map<string, HTMLImageElement>())
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)
  const [box, setBox] = useState({ w: 800, h: 450 })
  const [handles, setHandles] = useState<Handle[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const renderer = useMemo(() => new Renderer(), [])
  const { width: srcW, height: srcH, duration } = project.media.screen

  const track = useMemo(
    () => buildTrack(cursorData, duration, edit.cursor),
    [cursorData, duration, edit.cursor.smoothing, edit.cursor.motionMode, edit.cursor.curvature, edit.cursor.clickDwell]
  )
  const camera = useMemo(
    () => buildCameraTrack(cursorData, duration, edit.cursor),
    [cursorData, duration, edit.cursor.smoothing, edit.cursor.motionMode, edit.cursor.curvature, edit.cursor.clickDwell]
  )
  const clicks = useMemo(() => cursorData?.clicks ?? [], [cursorData])
  const assets = useMemo(() => new Map(edit.assets.map((a) => [a.id, a])), [edit.assets])

  const live = useRef({ edit, track, camera, clicks, bgImage, assets })
  live.current = { edit, track, camera, clicks, bgImage, assets }

  const [ow, oh] = outputSize(edit, srcW, srcH, 1080)
  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const a = ow / oh
      let w = r.width
      let h = w / a
      if (h > r.height) {
        h = r.height
        w = h * a
      }
      setBox({ w: Math.max(50, Math.floor(w)), h: Math.max(50, Math.floor(h)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ow, oh])

  useEffect(() => {
    if (edit.background.type !== 'image' || !edit.background.imagePath) return setBgImage(null)
    const img = new Image()
    img.onload = () => setBgImage(img)
    img.src = mediaUrl(edit.background.imagePath)
  }, [edit.background.type, edit.background.imagePath])

  useEffect(() => {
    return onWallpaperLoaded(() => {
      requestAnimationFrame(() => draw.current())
    })
  }, [])

  // brand logo
  const logo = useRef<HTMLImageElement | null>(null)
  const logoPath = edit.watermark?.path
  useEffect(() => {
    logo.current = null
    if (!logoPath) return
    const img = new Image()
    img.onload = () => {
      logo.current = img
      requestAnimationFrame(() => draw.current())
    }
    img.src = mediaUrl(logoPath)
  }, [logoPath])

  // images used by overlay clips
  useEffect(() => {
    for (const a of edit.assets) {
      if (a.kind !== 'image' || images.current.has(a.id)) continue
      const img = new Image()
      img.onload = () => requestAnimationFrame(() => draw.current())
      img.src = mediaUrl(a.path)
      images.current.set(a.id, img)
    }
  }, [edit.assets])

  const reg = (key: string) => (el: HTMLMediaElement | null) => {
    if (el) pool.current.set(key, el)
    else pool.current.delete(key)
  }

  /** Works out every follower's target time for main video time t. */
  const followers = (t: number): Follower[] => {
    const L = live.current
    const e = L.edit
    const a = e.audio
    const clip = clipAt(e.clips, t)
    const rate = clip?.speed ?? 1
    const out: Follower[] = []
    const add = (key: string, want: number | null, volume: number, muted: boolean, free = false) => {
      const el = pool.current.get(key)
      if (el) out.push({ key, el, want, volume, muted, rate: free ? 1 : rate, free })
    }
    // Imported audio and media clips live on the edited timeline: they keep playing straight
    // through cuts and speed changes, exactly as they look on the timeline and sound in the export.
    const lead = e.leadIn ?? 0
    const O = (x: number) => sourceToOutput(e.clips, x, lead)
    const T = O(t)
    const place = (start: number, end: number, trimStart: number) => {
      const s0 = O(start)
      return T >= s0 && T <= O(end) ? trimStart + (T - s0) : null
    }
    const m = project.media
    if (m.mic) add('mic', t - m.mic.offset - a.syncOffset, a.micVolume, a.micMuted)
    if (m.system) add('sys', t - m.system.offset - a.syncOffset, a.systemVolume, a.systemMuted)
    if (m.webcam) add('webcam', t - m.webcam.offset - a.syncOffset, 0, true)
    if (a.musicPath) add('music', t, a.musicVolume, a.musicMuted)
    for (const o of e.overlays) {
      const as = L.assets.get(o.assetId)
      if (as?.kind !== 'video') continue
      add('ov:' + o.id, place(o.start, o.end, o.trimStart), o.volume, o.muted || !as.hasAudio || !e.tracks.media, true)
    }
    for (const c of e.audioClips) add('ac:' + c.id, place(c.start, c.end, c.trimStart), c.volume, c.muted || !e.tracks.audio, true)
    return out
  }

  const syncFollowers = (isPlaying: boolean, at = logical.current) => {
    const v = videoRef.current
    if (!v) return
    for (const f of followers(at)) {
      const el = f.el
      el.volume = Math.max(0, Math.min(1, f.volume))
      el.muted = f.muted
      if (!isPlaying && el.playbackRate !== f.rate) el.playbackRate = f.rate
      else if (isPlaying && Math.abs(el.playbackRate / f.rate - 1) > 0.15) el.playbackRate = f.rate
      if (f.key === 'music') {
        if (isPlaying && el.paused) el.play().catch(() => {})
        if (!isPlaying && !el.paused) el.pause()
        continue
      }
      const want = f.want
      const inRange = want !== null && want >= 0 && (!el.duration || want < el.duration)
      if (!isPlaying || !inRange) {
        if (!el.paused) el.pause()
        if (inRange && Math.abs(el.currentTime - want!) > 0.04) el.currentTime = want!
        continue
      }
      // Small drift is fixed by nudging the speed instead of seeking. Every seek blanks the
      // element for a moment (webcam recordings seek slowly), which is what made it flicker.
      const drift = want! - el.currentTime
      if (el.paused) {
        // starting: land on the right spot first, then play
        if (Math.abs(drift) > 0.05) el.currentTime = want!
        el.play().catch(() => {})
      } else if (f.key === 'webcam') {
        if (Math.abs(drift) > 0.6) el.currentTime = want!
        else if (Math.abs(drift) > 0.03) el.playbackRate = f.rate * (1 + Math.max(-0.12, Math.min(0.12, drift * 0.8)))
      } else {
        // Sound is never sped up or slowed down to catch up (that makes it wobble). It only
        // jumps when it's clearly off, and gets a few frames to settle after starting.
        if (el.playbackRate !== f.rate) el.playbackRate = f.rate
        const settled = !el.seeking && el.readyState >= 3
        if (settled && Math.abs(drift) > 0.2) el.currentTime = want!
      }
    }
    const bgv = pool.current.get('bg') as HTMLVideoElement | undefined
    // background videos loop on their own, even while the editor is paused, so they always look alive
    if (bgv && bgv.paused) bgv.play().catch(() => {})
  }

  // The editor's own clock. Usually the video's time, but it also runs through the lead-in
  // (empty space before the recording), where the video element can't go.
  const logical = useRef(time)
  const camCache = useRef<HTMLCanvasElement | null>(null)
  const camHas = useRef(false)
  /** media time of the newest frame the webcam element presented (-1: unknown, then every draw copies it) */
  const camFrameT = useRef(-1)
  const camDrawnT = useRef(-2)
  useEffect(() => {
    const cam = pool.current.get('webcam') as HTMLVideoElement | undefined
    if (!cam || !('requestVideoFrameCallback' in cam)) return
    let id = 0
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      camFrameT.current = meta.mediaTime
      id = cam.requestVideoFrameCallback(onFrame)
    }
    id = cam.requestVideoFrameCallback(onFrame)
    return () => cam.cancelVideoFrameCallback(id)
  }, [project.media.webcam?.path])
  // Last good frame of the recording. While the video element is seeking it has no picture, so
  // scrubbing used to flash dark; we show this copy instead until the new frame arrives.
  const frameCache = useRef<HTMLCanvasElement | null>(null)
  const frameAt = useRef(-1)
  const frameK = useRef(1)
  /** how much smaller than the original this video element is (1 for the original) */
  const scaleOf = (el: HTMLVideoElement) => {
    const r = el.videoWidth && srcW ? el.videoWidth / srcW : 1
    return Math.abs(r - 1) < 0.01 ? 1 : r
  }
  const snapshot = () => {
    const v = videoRef.current
    if (!v || v.readyState < 2 || v.seeking || !v.videoWidth) return
    if (Math.abs(frameAt.current - v.currentTime) < 1e-4) return
    const k = Math.min(1, 1920 / v.videoWidth)
    const w = Math.round(v.videoWidth * k)
    const h = Math.round(v.videoHeight * k)
    const fc = (frameCache.current ??= document.createElement('canvas'))
    if (fc.width !== w || fc.height !== h) {
      fc.width = w
      fc.height = h
    }
    fc.getContext('2d', { alpha: false })!.drawImage(v, 0, 0, w, h)
    // maps source pixels to cache pixels (the video may be a smaller preview copy)
    frameK.current = k * scaleOf(v)
    frameAt.current = v.currentTime
  }
  // Scrubbing sends a new time on every mouse move. Starting a new seek before the last one is
  // done means no frame ever lands, so seeks are queued: the newest time waits for the current one.
  const pendingSeek = useRef<number | null>(null)
  const seekVideo = (vt: number) => {
    const v = videoRef.current
    if (!v) return
    if (v.seeking) pendingSeek.current = vt
    else {
      pendingSeek.current = null
      if (Math.abs(v.currentTime - vt) > 0.001) v.currentTime = vt
    }
  }
  // After scrubbing or pausing settles, line the sharp original up with the frame being shown.
  const hiTimer = useRef(0)
  const syncHi = () => {
    window.clearTimeout(hiTimer.current)
    hiTimer.current = window.setTimeout(() => {
      const v = videoRef.current
      const hi = hiRef.current
      if (!v || !hi || !proxyOn || useEditor.getState().playing) return
      if (v.seeking) return syncHi()
      if (Math.abs(hi.currentTime - v.currentTime) > 0.001) hi.currentTime = v.currentTime
      else draw.current()
    }, 100)
  }
  useEffect(() => {
    if (!playing && proxyOn) syncHi()
    return () => window.clearTimeout(hiTimer.current)
  }, [time, playing, proxyOn])
  const onVideoSeeked = () => {
    if (proxyOn) syncHi()
    const v = videoRef.current
    const p = pendingSeek.current
    pendingSeek.current = null
    if (v && p !== null && !useEditor.getState().playing && Math.abs(v.currentTime - p) > 0.001) {
      draw.current()
      v.currentTime = p
      return
    }
    draw.current()
  }

  // Adaptive preview quality: if frames take too long to draw (big full screen, low end GPU),
  // render smaller while playing and scale up. The export is always full quality.
  const quality = useRef(1)
  const frameMs = useRef(8)
  const adapt = (ms: number) => {
    frameMs.current = frameMs.current * 0.9 + ms * 0.1
    if (frameMs.current > 14 && quality.current > MIN_PLAY_QUALITY) {
      quality.current = Math.max(MIN_PLAY_QUALITY, quality.current * 0.88)
      frameMs.current = 10
    } else if (frameMs.current < 6 && quality.current < 1) quality.current = Math.min(1, quality.current * 1.08)
  }

  // extra seconds added to the background clock while paused, so live backgrounds keep moving
  const ambient = useRef(0)
  const draw = useRef<(at?: number) => void>(() => {})
  draw.current = (at?: number) => {
    const c = canvasRef.current
    const v = videoRef.current
    if (!c || !v) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // while playing, render at a size this PC can keep up with (adaptive, see below); paused is always sharp
    const isPlaying = useEditor.getState().playing
    const q = isPlaying ? quality.current : 1
    // Playing draws as many pixels as the screen can show, the same as paused (a smaller playing size looked soft
    // in motion and snapped sharp on pause), up to PLAY_MAX_W so a 4K screen doesn't draw 4x the pixels every frame.
    // A PC that can't keep up is handled by the adaptive quality below, which only ever lowers this while playing.
    const target = Math.min(ow, box.w * dpr, isPlaying ? PLAY_MAX_W : Infinity)
    const W = Math.max(320, Math.round((target * q) / 16) * 16)
    const H = Math.round((W * oh) / ow)
    if (c.width !== W || c.height !== H) {
      c.width = W
      c.height = H
    }
    const ctx = c.getContext('2d', { alpha: false })!
    const L = live.current
    const t = at ?? logical.current
    const bgv = pool.current.get('bg') as HTMLVideoElement | undefined
    const cam = pool.current.get('webcam') as HTMLVideoElement | undefined
    const overlays = new Map<string, { src: CanvasImageSource; w: number; h: number }>()
    for (const o of L.edit.overlays) {
      if (t < o.start || t > o.end) continue
      const as = L.assets.get(o.assetId)
      if (!as) continue
      if (as.kind === 'image') {
        const img = images.current.get(as.id)
        if (img?.complete && img.naturalWidth) overlays.set(o.id, { src: img, w: img.naturalWidth, h: img.naturalHeight })
      } else {
        const el = pool.current.get('ov:' + o.id) as HTMLVideoElement | undefined
        if (el && el.readyState >= 2) overlays.set(o.id, { src: el, w: el.videoWidth, h: el.videoHeight })
      }
    }
    // null when the webcam has no footage at this time (before it starts, or after it ends: a video joined on)
    const camAt = project.media.webcam ? webcamTimeAt(t, project.media.webcam.offset, L.edit.audio.syncOffset, cam?.duration ?? NaN) : null
    // keep the last good webcam frame, and show it while the element is seeking or buffering
    let camSrc: { src: CanvasImageSource; w: number; h: number } | null = null
    if (cam && camAt !== null && L.edit.webcam.show) {
      // The webcam is ~30 fps and the preview draws ~60: while playing, copy only frames the camera hasn't shown yet
      const camFresh = !isPlaying || camFrameT.current < 0 || camFrameT.current !== camDrawnT.current
      if (camFresh && cam.readyState >= 2 && !cam.seeking && cam.videoWidth) {
        camDrawnT.current = camFrameT.current
        const k = Math.min(1, 720 / Math.max(cam.videoWidth, cam.videoHeight))
        const cw = Math.round(cam.videoWidth * k)
        const ch = Math.round(cam.videoHeight * k)
        const cc = (camCache.current ??= document.createElement('canvas'))
        if (cc.width !== cw || cc.height !== ch) {
          cc.width = cw
          cc.height = ch
        }
        cc.getContext('2d')!.drawImage(cam, 0, 0, cw, ch)
        camHas.current = true
      }
      if (camHas.current && camCache.current) camSrc = { src: camCache.current, w: camCache.current.width, h: camCache.current.height }
      // cut the person out and swap what's behind them (redone only when the camera frame or the look changes)
      if (camSrc && L.edit.webcam.bg !== 'none') camSrc = applyCamBg(camSrc, L.edit.webcam, L.edit.webcam.bgImage ? mediaUrl(L.edit.webcam.bgImage) : undefined, `${(camFrameT.current >= 0 ? camFrameT.current : cam.currentTime).toFixed(3)}|${cam.seeking ? 1 : 0}`, useEditor.getState().playing ? { maxSide: 360, reuseMs: 90 } : {})
    }
    const ready = v.readyState >= 2 && !v.seeking
    if (ready && !isPlaying) snapshot()
    // paused on a preview copy: show the sharp original frame once it has landed on the same moment
    const hi = hiRef.current
    const hiOk = !isPlaying && proxyOn && ready && !!hi && hi.readyState >= 2 && !hi.seeking && hi.videoWidth > 0 && Math.abs(hi.currentTime - v.currentTime) < 0.034
    const sv = hiOk ? hi! : v
    const pk = scaleOf(sv)
    const fc = frameCache.current
    const fk = frameK.current
    const drawFrame: FrameDrawer | null = ready
      ? (cx, sx, sy, sw, sh, dx, dy, dw, dh) => cx.drawImage(sv, sx * pk, sy * pk, sw * pk, sh * pk, dx, dy, dw, dh)
      : fc && frameAt.current >= 0
        ? (cx, sx, sy, sw, sh, dx, dy, dw, dh) => cx.drawImage(fc, sx * fk, sy * fk, sw * fk, sh * fk, dx, dy, dw, dh)
        : null
    // Resting on the very first frame: show the picture itself, not the first instant of the opening transition (a blank or washed out frame)
    let drawEdit = useEditor.getState().areaMode ? { ...L.edit, zoom: { ...L.edit.zoom, enabled: false } } : L.edit
    const firstT = [...L.edit.clips].sort((a, b) => a.start - b.start)[0]?.start ?? 0
    const lead = L.edit.leadIn ?? 0
    if (!isPlaying && (Math.abs(t - firstT) < 1e-3 || (lead > 0 && Math.abs(t + lead) < 1e-3))) {
      drawEdit = { ...drawEdit, transitions: { ...drawEdit.transitions, intro: { ...drawEdit.transitions.intro, type: 'none' }, cut: { ...drawEdit.transitions.cut, type: 'none' }, perCut: {} } }
    }
    const t0 = performance.now()
    renderer.render(ctx, W, H, {
      edit: drawEdit,
      srcW,
      srcH,
      t,
      bgTime: t + ambient.current,
      drawFrame,
      cursor: L.track,
      camera: L.camera,
      clicks: L.clicks,
      keys: useEditor.getState().cursorData?.keys,
      bgImage: L.bgImage,
      watermark: logo.current && L.edit.watermark ? { src: logo.current, w: logo.current.naturalWidth, h: logo.current.naturalHeight } : null,
      bgVideo: L.edit.background.type === 'video' && bgv && bgv.readyState >= 2 ? bgv : null,
      webcam: camSrc,
      overlays
    })
    if (useEditor.getState().playing) adapt(performance.now() - t0)
    updateHandles(ctx, W, H, t)
  }

  // selection handles, recomputed after each draw (cheap, only a few items)
  const lastHandles = useRef('')
  const updateHandles = (ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    const L = live.current
    const sx = box.w / W
    const sy = box.h / H
    const k = Math.min(W, H) / 1080
    const hs: Handle[] = []
    const byLane = <T extends { lane?: number }>(list: T[]) => [...list].sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0))
    for (const tx of L.edit.tracks.text ? byLane(L.edit.texts) : []) {
      if (t < tx.start || t > tx.end) continue
      const b = measureText(ctx, tx, W, H, k)
      hs.push({ kind: 'text', id: tx.id, box: { x: b.x * sx, y: b.y * sy, w: b.w * sx, h: b.h * sy } })
    }
    for (const o of L.edit.tracks.media ? byLane(L.edit.overlays) : []) {
      if (t < o.start || t > o.end || o.mode !== 'pip') continue
      const as = L.assets.get(o.assetId)
      if (!as) continue
      const r = overlayRect(o, as.width || 16, as.height || 9, W, H)
      hs.push({ kind: 'overlay', id: o.id, box: { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy } })
    }
    if (project.media.webcam && L.edit.webcam.show) {
      const r = webcamRect(L.edit, W, H)
      hs.push({ kind: 'webcam', id: 'webcam', box: { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy } })
    }
    if (L.edit.tracks.blurs !== false && L.edit.blurs) {
      const lay = computeLayout(L.edit, srcW, srcH, W, H)
      const toContent = (x: number, y: number): [number, number] => [
        (x * srcW - lay.crop.x) / lay.crop.w,
        (y * srcH - lay.crop.y) / lay.crop.h
      ]
      const z = zoomAt(L.edit.zoom, t, L.camera, toContent)
      const vp = viewport(z)
      for (const b of byLane(L.edit.blurs)) {
        if (t < b.start || t > b.end) continue
        const r = blurRect(b, lay, vp)
        hs.push({ kind: 'blur', id: b.id, box: { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy } })
      }
    }
    const key = JSON.stringify(hs.map((h) => [h.id, Math.round(h.box.x), Math.round(h.box.y), Math.round(h.box.w), Math.round(h.box.h)]))
    if (key !== lastHandles.current) {
      lastHandles.current = key
      setHandles(hs)
    }
  }

  useEffect(() => {
    if (!playing) requestAnimationFrame(() => draw.current())
  }, [edit, track, bgImage, box, selection, playing])

  // seek only when the time was changed on purpose (scrub, arrow keys...). Pausing must not
  // jump back to the time playback started from, which the store still holds while playing.
  const lastSeek = useRef(time)
  useEffect(() => {
    const v = videoRef.current
    if (!v || playing) return
    if (time !== lastSeek.current) {
      lastSeek.current = time
      logical.current = time
      // the lead-in (negative time) has no recording; park the video on its first frame
      seekVideo(Math.max(0, time))
    }
    syncFollowers(false)
    timeBus.emit(time)
    requestAnimationFrame(() => draw.current())
  }, [time, playing])

  // keep live and video backgrounds moving while paused (about 30 fps, stops when not needed)
  const bgType = edit.background.type
  useEffect(() => {
    if (playing || (bgType !== 'live' && bgType !== 'video')) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      ambient.current += dt
      acc += dt
      if (acc >= 1 / 30 && !document.hidden) {
        acc = 0
        draw.current()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, bgType])

  // The main video's source: the light preview copy once it is ready, the original until then.
  // Swapping keeps the current time, and waits for a pause so playback never stutters.
  const shownSrc = useRef('')
  useEffect(() => {
    const v = videoRef.current
    if (!v || playing) return
    const want = proxyOn ? proxy.path! : project.media.screen.path
    if (shownSrc.current === want) return
    const at = shownSrc.current ? v.currentTime : Math.max(0, useEditor.getState().time)
    shownSrc.current = want
    v.addEventListener('loadedmetadata', () => { v.currentTime = at }, { once: true })
    v.src = mediaUrl(want)
  }, [proxyOn, proxy.path, playing, project.media.screen.path])

  // playback loop
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (!playing) {
      v.pause()
      syncFollowers(false)
      useEditor.getState().setTime(logical.current)
      return
    }
    const clips = sortedClips(live.current.edit.clips)
    const lead = live.current.edit.leadIn ?? 0
    const last = clips[clips.length - 1]
    // at the very end: start again from the top (the lead-in if there is one)
    if (last && logical.current >= last.end - 0.05) logical.current = lead > 0 ? -lead : clips[0].start
    let intro: { wall: number; from: number } | null = null
    if (logical.current < 0) {
      intro = { wall: performance.now(), from: logical.current }
      v.currentTime = clips[0]?.start ?? 0
    } else {
      if (!clipAt(clips, v.currentTime) || v.currentTime >= duration - 0.05) {
        const n = nextClip(clips, v.currentTime) ?? clips[0]
        if (n) v.currentTime = n.start
      }
      v.play().catch(() => {})
    }
    let raf = 0
    // Time of the frame the video is actually showing. If decoding falls behind, the cursor,
    // zoom and text follow the visible frame instead of running ahead of a frozen picture.
    let shown: number | null = null
    let vfc = 0
    let lastLoop = 0
    // click sounds: play every click the playhead passed since the last frame
    let clickFrom = logical.current
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      shown = meta.mediaTime
      vfc = v.requestVideoFrameCallback(onFrame)
    }
    if ('requestVideoFrameCallback' in v) vfc = v.requestVideoFrameCallback(onFrame)
    let lastDraw = 0
    // Watchdog: if the video stops moving on its own (the decoder or the file reader stalled),
    // give it a gentle kick, the same thing pausing and playing again used to do by hand.
    let stuckSince = 0
    let lastT = -1
    let kicks = 0
    const step = () => {
      if (intro) {
        const it = intro.from + (performance.now() - intro.wall) / 1000
        if (it < 0) {
          logical.current = it
          draw.current(it)
          timeBus.emit(it)
          syncFollowers(true)
          raf = requestAnimationFrame(loop)
          return
        }
        // lead-in is over: the recording takes over
        intro = null
        v.play().catch(() => {})
      }
      const cs = sortedClips(live.current.edit.clips)
      const t = v.currentTime
      const cur = clipAt(cs, t)
      if (!cur) {
        const n = nextClip(cs, t)
        if (n) {
          snapshot()
          v.currentTime = n.start
        }
        else {
          v.pause()
          return useEditor.getState().setPlaying(false)
        }
      } else {
        if (v.playbackRate !== cur.speed) v.playbackRate = cur.speed
        const idx = cs.indexOf(cur)
        const next = idx >= 0 && idx < cs.length - 1 ? cs[idx + 1] : undefined
        if (t >= cur.end - 0.03) {
          if (next) {
            // If the next clip does not immediately follow in the source recording, jump to it
            if (Math.abs(next.start - cur.end) > 0.04) {
              snapshot()
              v.currentTime = next.start
            }
          } else {
            v.pause()
            return useEditor.getState().setPlaying(false)
          }
        }
      }
      if (v.ended) return useEditor.getState().setPlaying(false)
      {
        const now = performance.now()
        if (Math.abs(v.currentTime - lastT) > 1e-3) {
          lastT = v.currentTime
          stuckSince = now
          kicks = 0
        } else if (!intro && now - stuckSince > (v.seeking || v.readyState < 2 ? 6000 : 1500) && kicks < 5) {
          kicks++
          stuckSince = now
          console.warn('[preview] playback stalled at', v.currentTime.toFixed(2), 'state', v.readyState, 'kick', kicks)
          const at = v.currentTime
          v.pause()
          v.currentTime = at + 0.001
          v.play().catch(() => {})
        }
      }
      const at = shown !== null && Math.abs(v.currentTime - shown) < 1 ? shown : v.currentTime
      // frames arriving late (GPU busy) count as slow too, not just slow drawing
      const now = performance.now()
      if (lastLoop && now - lastLoop > 30) adapt(now - lastLoop - 16)
      lastLoop = now
      {
        const cur = live.current.edit.cursor
        const cd = useEditor.getState().cursorData
        if (cur.clickSound !== 'none' && cd && at > clickFrom && at - clickFrom < 0.5) {
          const off = new Set(cur.hiddenClicks ?? [])
          for (const c of cd.clicks) {
            if (off.has(Math.round(c.t * 1000))) continue
            if (c.t > clickFrom && c.t <= at) playClick(cur.clickSound, cur.clickVolume)
            if ((cur.clickSound === 'mouse' || cur.clickSound === 'mechanical' || cur.clickSound === 'trackpad') && c.up !== undefined && c.up - c.t > 0.03 && c.up - c.t < 0.6 && c.up > clickFrom && c.up <= at) playClick(cur.clickSound, cur.clickVolume, 0, true)
          }
        }
        clickFrom = at
      }
      logical.current = at
      // draw at most about 60 times a second (a 120 or 144 Hz screen would otherwise redraw the same frame twice)
      const nowDraw = performance.now()
      if (nowDraw - lastDraw >= 15) {
        lastDraw = nowDraw
        draw.current(at)
        timeBus.emit(at)
      }
      syncFollowers(true, v.currentTime)
      raf = requestAnimationFrame(loop)
    }
    // one bad frame (a missing image, a follower that can't seek) must never stop playback for good
    const loop = () => {
      try {
        step()
      } catch (e) {
        console.error('[preview] playback loop error', e)
        raf = requestAnimationFrame(loop)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      if (vfc && 'cancelVideoFrameCallback' in v) v.cancelVideoFrameCallback(vfc)
    }
  }, [playing])

  // ---------- direct manipulation ----------
  const canvasXY = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height }
  }
  const snap = (v: number) => (Math.abs(v - 0.5) < 0.012 ? 0.5 : Math.min(1, Math.max(0, v)))

  const startMove = (e: React.PointerEvent, h: Handle, mode: 'move' | 'resize') => {
    e.stopPropagation()
    e.preventDefault()
    const st = useEditor.getState()
    if (h.kind === 'webcam') st.setPanel('webcam')
    else st.select({ kind: h.kind === 'text' ? 'text' : h.kind === 'overlay' ? 'overlay' : 'blur', id: h.id })
    const e0 = st.project!.edit
    const start = canvasXY(e)
    const item = h.kind === 'text' ? e0.texts.find((x) => x.id === h.id) : h.kind === 'overlay' ? e0.overlays.find((x) => x.id === h.id) : h.kind === 'blur' ? e0.blurs.find((x) => x.id === h.id) : e0.webcam
    if (!item) return
    const ox = item.x
    const oy = item.y
    const size0 = h.kind === 'text' ? (item as { size: number }).size : h.kind === 'overlay' ? (item as { w: number }).w : h.kind === 'blur' ? (item as { w: number }).w : (item as { size: number }).size
    const blurH0 = h.kind === 'blur' ? (item as { h: number }).h : 0
    const key = `${mode}-${h.id}-${Date.now()}`
    const lay = computeLayout(e0, srcW, srcH, box.w, box.h)
    const toContent = (x: number, y: number): [number, number] => [(x * srcW - lay.crop.x) / lay.crop.w, (y * srcH - lay.crop.y) / lay.crop.h]
    const z = zoomAt(e0.zoom, logical.current, live.current.camera, toContent)
    const vp = viewport(z)
    const mv = (ev: PointerEvent) => {
      const p = canvasXY(ev)
      useEditor.getState().update((ed) => {
        const it = h.kind === 'text' ? ed.texts.find((x) => x.id === h.id) : h.kind === 'overlay' ? ed.overlays.find((x) => x.id === h.id) : h.kind === 'blur' ? ed.blurs.find((x) => x.id === h.id) : ed.webcam
        if (!it) return
        if (mode === 'move') {
          if (h.kind === 'blur') {
            const dContentX = (((p.nx - start.nx) * box.w) / Math.max(1, lay.view.w)) * vp.w
            const dContentY = (((p.ny - start.ny) * box.h) / Math.max(1, lay.view.h)) * vp.h
            it.x = Math.max(0, Math.min(1, ox + dContentX))
            it.y = Math.max(0, Math.min(1, oy + dContentY))
          } else {
            it.x = snap(ox + p.nx - start.nx)
            it.y = snap(oy + p.ny - start.ny)
          }
        } else {
          // scale from the center by how far the pointer moved away from it
          const d0 = Math.hypot(start.nx - ox, (start.ny - oy) * (box.h / box.w))
          const d1 = Math.hypot(p.nx - ox, (p.ny - oy) * (box.h / box.w))
          const f = Math.max(0.2, Math.min(5, d1 / Math.max(0.01, d0)))
          if (h.kind === 'text') (it as { size: number }).size = Math.round(Math.max(12, Math.min(300, size0 * f)))
          else if (h.kind === 'overlay') (it as { w: number }).w = Math.max(0.05, Math.min(1, size0 * f))
          else if (h.kind === 'blur') {
            ;(it as { w: number }).w = Math.max(0.03, Math.min(1, size0 * f))
            ;(it as { h: number }).h = Math.max(0.015, Math.min(1, blurH0 * f))
          }
          else (it as { size: number }).size = Math.max(0.08, Math.min(0.6, size0 * f))
        }
      }, key)
    }
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const setZoomFocus = (id: string, e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!
    const { nx, ny } = canvasXY(e)
    const L = computeLayout(useEditor.getState().project!.edit, srcW, srcH, c.width, c.height)
    const fx = (nx * c.width - L.view.x) / L.view.w
    const fy = (ny * c.height - L.view.y) / L.view.h
    useEditor.getState().update((ed) => {
      const z = ed.zoom.segments.find((s) => s.id === id)
      if (z) {
        const nxVal = Math.min(1, Math.max(0, fx))
        const nyVal = Math.min(1, Math.max(0, fy))
        z.x = nxVal
        z.y = nyVal
        z.follow = false
        z.auto = false
        const tCur = logical.current
        if (z.keyframes && z.keyframes.length > 0) {
          const kf = z.keyframes.find((k) => Math.abs(k.t - tCur) <= 0.15)
          if (kf) {
            kf.x = nxVal
            kf.y = nyVal
          }
        }
      }
    }, 'zoomfocus' + id)
  }

  // ---- zoom to an area: drag a box, the zoom points at it ----
  const areaMode = useEditor((s) => s.areaMode)
  const [area, setArea] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  useEffect(() => {
    draw.current()
    if (!areaMode) return setArea(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && useEditor.getState().setAreaMode(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [areaMode])
  const finishArea = (r: { x0: number; y0: number; x1: number; y1: number }) => {
    const st = useEditor.getState()
    const c = canvasRef.current
    if (!c || !st.project) return
    const L = computeLayout(st.project.edit, srcW, srcH, c.width, c.height)
    const fr = (nx: number, ny: number): [number, number] => [(nx * c.width - L.view.x) / L.view.w, (ny * c.height - L.view.y) / L.view.h]
    const [ax, ay] = fr(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1))
    const [bx, by] = fr(Math.max(r.x0, r.x1), Math.max(r.y0, r.y1))
    const x0 = Math.max(0, ax), y0 = Math.max(0, ay), x1 = Math.min(1, bx), y1 = Math.min(1, by)
    const w = x1 - x0, h = y1 - y0
    st.setAreaMode(false)
    if (w < 0.03 || h < 0.03) return
    const need = Math.min(6, Math.max(1.1, Math.min(1 / w, 1 / h))) // how far in to fit the box
    const master = st.project.edit.zoom.master || 1
    const scale = 1 + (need - 1) / master // the master multiplier scales every zoom, so undo it for an exact fit
    const t = logical.current
    const segs = st.project.edit.zoom.segments
    const sel = st.selection?.kind === 'zoom' ? segs.find((s) => s.id === st.selection!.id) : undefined
    const at = sel ?? segs.find((s) => t >= s.start && t <= s.end)
    const id = at?.id ?? addZoomAt(t)
    if (!id) return void showMessage('No room for a zoom here', 'Move the playhead to a spot that is not inside another zoom, then try again.')
    st.update((e) => {
      const z = e.zoom.segments.find((s) => s.id === id)
      if (!z) return
      z.x = (x0 + x1) / 2
      z.y = (y0 + y1) / 2
      z.scale = scale
      z.follow = false
      z.auto = false
      z.keyframes = []
    })
    st.select({ kind: 'zoom', id })
  }
  const startArea = (e: React.PointerEvent) => {
    e.preventDefault()
    const p0 = canvasXY(e)
    setArea({ x0: p0.nx, y0: p0.ny, x1: p0.nx, y1: p0.ny })
    const mv = (ev: PointerEvent) => {
      const p = canvasXY(ev)
      setArea({ x0: p0.nx, y0: p0.ny, x1: p.nx, y1: p.ny })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      const p = canvasXY(ev)
      setArea(null)
      finishArea({ x0: p0.nx, y0: p0.ny, x1: p.nx, y1: p.ny })
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const selZoom = selection?.kind === 'zoom' ? edit.zoom.segments.find((s) => s.id === selection.id) : undefined
  const pinMode = !!selZoom && !selZoom.follow
  const onCanvasDown = (e: React.PointerEvent) => {
    if (pinMode && selZoom) {
      setZoomFocus(selZoom.id, e)
      const mv = (ev: PointerEvent) => ev.buttons === 1 && setZoomFocus(selZoom.id, ev)
      const up = () => {
        window.removeEventListener('pointermove', mv)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', mv)
      window.addEventListener('pointerup', up)
      return
    }
    useEditor.getState().select(null)
  }

  // pin marker position for manual zooms (accurately tracks keyframed camera pan)
  let pin: { x: number; y: number } | null = null
  if (pinMode && selZoom) {
    const L = computeLayout(edit, srcW, srcH, box.w, box.h)
    let px = selZoom.x
    let py = selZoom.y
    if (selZoom.keyframes && selZoom.keyframes.length > 0) {
      const kfState = sampleSegmentKeyframes(selZoom, logical.current)
      px = kfState.x
      py = kfState.y
    }
    pin = { x: L.view.x + px * L.view.w, y: L.view.y + py * L.view.h }
  }

  const isFull = useFullscreen(wrapRef)
  // full screen controls: always there while paused; while playing they show when the mouse moves, then tuck away
  const [barOn, setBarOn] = useState(true)
  const barTimer = useRef<number>(0)
  const wake = () => {
    setBarOn(true)
    window.clearTimeout(barTimer.current)
    barTimer.current = window.setTimeout(() => setBarOn(false), 2500)
  }
  useEffect(() => {
    if (!isFull) return
    wake()
    return () => window.clearTimeout(barTimer.current)
  }, [isFull, playing])
  const selId = selection?.id
  const m = project.media
  const assetOf = (id: string): Asset | undefined => assets.get(id)

  return (
    <div ref={wrapRef} className="preview-wrap" data-tour="preview" onMouseMove={isFull ? wake : undefined}>
      <button className="icon-btn preview-full-btn" title={`${isFull ? 'Exit full screen' : 'Full screen preview'} (F)`} onClick={togglePreviewFullscreen}>
        <Icon name={isFull ? 'x' : 'expand'} size={16} />
      </button>
      {isFull && (
        <div className={`preview-full-bar ${!playing || barOn ? 'on' : ''}`}>
          <button className="play-btn" style={{ width: 36, height: 36 }} onClick={() => useEditor.getState().setPlaying(!playing)}>
            <Icon name={playing ? 'pause' : 'play'} size={16} />
          </button>
          <span className="hint">Space to play or pause · Esc to exit</span>
        </div>
      )}
      <div style={{ position: 'relative', width: box.w, height: box.h }}>
        <canvas
          ref={canvasRef}
          style={{ width: box.w, height: box.h, borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.06)', cursor: pinMode ? 'crosshair' : 'default', display: 'block' }}
          onPointerDown={onCanvasDown}
          onDoubleClick={() => !pinMode && useEditor.getState().setPlaying(!useEditor.getState().playing)}
        />
        {/* interaction layer: move / resize text, media and webcam right on the preview */}
        {!playing &&
          handles.map((h) => {
            const sel = (h.kind === 'webcam' && useEditor.getState().panel === 'webcam') || selId === h.id
            return (
              <div
                key={h.kind + h.id}
                className={`handle ${sel ? 'sel' : ''}`}
                style={{ left: h.box.x, top: h.box.y, width: h.box.w, height: h.box.h, borderRadius: h.kind === 'webcam' && edit.webcam.shape === 'circle' ? '50%' : 6 }}
                onPointerDown={(e) => startMove(e, h, 'move')}
                onDoubleClick={() => {
                  if (h.kind === 'text') setEditing(h.id)
                  else if (h.kind === 'blur') useEditor.getState().setPanel('blur')
                }}
                onContextMenu={(e) =>
                  openContextMenu(e, h.kind === 'text'
                    ? [
                        { label: 'Edit text', onClick: () => setEditing(h.id) },
                        { label: 'Center horizontally', onClick: () => useEditor.getState().update((ed) => { const t = ed.texts.find((x) => x.id === h.id); if (t) t.x = 0.5 }) },
                        { sep: true },
                        { label: 'Delete', danger: true, onClick: () => useEditor.getState().update((ed) => (ed.texts = ed.texts.filter((x) => x.id !== h.id))) }
                      ]
                    : h.kind === 'overlay'
                      ? [
                          { label: 'Play in the video instead', onClick: () => useEditor.getState().update((ed) => { const o = ed.overlays.find((x) => x.id === h.id); if (o) o.mode = 'frame' }) },
                          { label: 'Make full screen', onClick: () => useEditor.getState().update((ed) => { const o = ed.overlays.find((x) => x.id === h.id); if (o) o.mode = 'full' }) },
                          { sep: true },
                          { label: 'Delete', danger: true, onClick: () => useEditor.getState().update((ed) => (ed.overlays = ed.overlays.filter((x) => x.id !== h.id))) }
                        ]
                    : h.kind === 'blur'
                      ? [
                          { label: 'Frosted blur', onClick: () => useEditor.getState().update((ed) => { const b = ed.blurs.find((x) => x.id === h.id); if (b) b.type = 'blur' }) },
                          { label: 'Pixelate mosaic', onClick: () => useEditor.getState().update((ed) => { const b = ed.blurs.find((x) => x.id === h.id); if (b) b.type = 'pixelate' }) },
                          { label: 'Solid redaction bar', onClick: () => useEditor.getState().update((ed) => { const b = ed.blurs.find((x) => x.id === h.id); if (b) b.type = 'solid' }) },
                          { sep: true },
                          { label: 'Delete', danger: true, onClick: () => useEditor.getState().update((ed) => (ed.blurs = ed.blurs.filter((x) => x.id !== h.id))) }
                        ]
                      : [{ label: 'Hide webcam', onClick: () => useEditor.getState().update((ed) => (ed.webcam.show = false)) }])
                }
              >
                {sel && <div className="handle-resize" onPointerDown={(e) => startMove(e, h, 'resize')} />}
              </div>
            )
          })}
        {editing && (() => {
          const tx = edit.texts.find((x) => x.id === editing)
          const h = handles.find((x) => x.id === editing)
          if (!tx || !h) return null
          return (
            <textarea
              autoFocus
              className="field-input"
              defaultValue={tx.text}
              style={{ position: 'absolute', left: h.box.x, top: h.box.y, minWidth: Math.max(160, h.box.w), minHeight: h.box.h, zIndex: 5 }}
              onBlur={(e) => {
                const v = e.target.value
                useEditor.getState().update((ed) => { const t = ed.texts.find((x) => x.id === editing); if (t) t.text = v || 'Text' })
                setEditing(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey))) (e.target as HTMLTextAreaElement).blur()
                e.stopPropagation()
              }}
            />
          )
        })()}
        {pin && (
          <div style={{ position: 'absolute', left: pin.x - 14, top: pin.y - 14, width: 28, height: 28, borderRadius: 14, border: '2px solid #fff', background: 'rgba(10,132,255,.35)', boxShadow: '0 0 0 6px rgba(10,132,255,.2)', pointerEvents: 'none' }} />
        )}
        {proxy.status === 'building' && (
          <div className="glass" title="Making a lighter copy of this recording so the player stays smooth. Your original and your export stay full quality." style={{ position: 'absolute', top: 10, right: 10, padding: '5px 10px', borderRadius: 999, fontSize: 12, pointerEvents: 'none', opacity: 0.9 }}>
            Smoothing playback {Math.round((proxy.pct ?? 0) * 100)}%
          </div>
        )}
        {areaMode && (
          <div style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 6 }} onPointerDown={startArea}>
            {area && <div style={{ position: 'absolute', left: Math.min(area.x0, area.x1) * box.w, top: Math.min(area.y0, area.y1) * box.h, width: Math.abs(area.x1 - area.x0) * box.w, height: Math.abs(area.y1 - area.y0) * box.h, border: '2px solid #fff', background: 'rgba(10,132,255,.25)', boxShadow: '0 0 0 9999px rgba(0,0,0,.45)', borderRadius: 4 }} />}
            <div className="toast glass" style={{ position: 'absolute', bottom: 12, top: 'auto' }}>Drag a box around the part to zoom into · Esc to cancel</div>
          </div>
        )}
        {pinMode && !areaMode && <div className="toast glass" style={{ position: 'absolute', bottom: 12, top: 'auto' }}>Click where this zoom should point</div>}
      </div>

      {/* media elements stay in the layout (invisible) so Chromium keeps decoding frames in real time */}
      <div className="media-pool" aria-hidden>
      <video ref={videoRef} muted playsInline preload="auto" className="pool-video" onLoadedData={() => { draw.current(); useEditor.getState().setPreviewReady({ screen: true }) }} onSeeked={onVideoSeeked} />
      {proxyOn && <video ref={hiRef} src={mediaUrl(m.screen.path)} muted playsInline preload="metadata" className="pool-video" onSeeked={() => draw.current()} onLoadedData={() => draw.current()} />}
      {m.mic && <audio ref={reg('mic')} src={mediaUrl(edit.audio.voiceClean && edit.audio.voiceCleanPath ? edit.audio.voiceCleanPath : m.mic.path)} preload="auto" />}
      {m.system && <audio ref={reg('sys')} src={mediaUrl(m.system.path)} preload="auto" />}
      {m.webcam && <video ref={reg('webcam')} src={mediaUrl(camPath.current)} muted playsInline preload="auto" className="pool-video" onSeeked={() => draw.current()} onLoadedData={() => { syncFollowers(useEditor.getState().playing); draw.current(); useEditor.getState().setPreviewReady({ webcam: true }) }} />}
      {edit.audio.musicPath && <audio ref={reg('music')} src={mediaUrl(edit.audio.musicPath)} loop preload="auto" />}
      {edit.overlays.map((o) => {
        const a = assetOf(o.assetId)
        return a?.kind === 'video' ? <video key={o.id} ref={reg('ov:' + o.id)} src={mediaUrl(a.path)} playsInline preload="auto" className="pool-video" onSeeked={() => draw.current()} onLoadedData={() => draw.current()} /> : null
      })}
      {edit.audioClips.map((c) => {
        const a = assetOf(c.assetId)
        return a ? <audio key={c.id} ref={reg('ac:' + c.id)} src={mediaUrl(a.path)} preload="auto" /> : null
      })}
      {edit.background.type === 'video' && edit.background.videoPath && (
        <video ref={reg('bg')} src={mediaUrl(edit.background.videoPath)} muted loop playsInline preload="auto" className="pool-video" onLoadedData={() => draw.current()} onSeeked={() => draw.current()} />
      )}
      </div>
    </div>
  )
}

export type { EditState }

let fullTarget: HTMLElement | null = null

/** Shows the preview on the whole screen (or leaves full screen). */
export function togglePreviewFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else fullTarget?.requestFullscreen().catch(() => {})
}

function useFullscreen(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    fullTarget = ref.current
    const sync = () => setOn(!!document.fullscreenElement && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      if (fullTarget === ref.current) fullTarget = null
    }
  }, [ref])
  return on
}
