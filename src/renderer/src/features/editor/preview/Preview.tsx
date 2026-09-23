import { useEffect, useMemo, useRef, useState } from 'react'
import type { Asset, EditState } from '@shared/types'
import { mediaUrl } from '@/lib/api'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { Renderer, computeLayout, measureText, outputSize, overlayRect, webcamRect } from '../engine/compositor'
import { buildCameraTrack, buildTrack } from '../engine/cursorTrack'
import { clipAt, nextClip, sampleSegmentKeyframes, sortedClips } from '../engine/timeMap'
import { Icon, openContextMenu } from '@/ui'
import { playClick } from './clickPlayer'

type Box = { x: number; y: number; w: number; h: number }
type Handle = { kind: 'text' | 'overlay' | 'webcam'; id: string; box: Box } // box in CSS px relative to canvas

/** Everything that plays alongside the main video, and what time it should be at. */
interface Follower { key: string; el: HTMLMediaElement; want: number | null; volume: number; muted: boolean; rate: number }

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
  const pool = useRef(new Map<string, HTMLMediaElement>())
  const images = useRef(new Map<string, HTMLImageElement>())
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)
  const [box, setBox] = useState({ w: 800, h: 450 })
  const [handles, setHandles] = useState<Handle[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const renderer = useMemo(() => new Renderer(), [])
  const { width: srcW, height: srcH, duration } = project.media.screen

  const track = useMemo(() => buildTrack(cursorData, duration, edit.cursor.smoothing), [cursorData, duration, edit.cursor.smoothing])
  const camera = useMemo(() => buildCameraTrack(cursorData, duration), [cursorData, duration])
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
    const add = (key: string, want: number | null, volume: number, muted: boolean) => {
      const el = pool.current.get(key)
      if (el) out.push({ key, el, want, volume, muted, rate })
    }
    const m = project.media
    if (m.mic) add('mic', t - m.mic.offset - a.syncOffset, a.micVolume, a.micMuted)
    if (m.system) add('sys', t - m.system.offset - a.syncOffset, a.systemVolume, a.systemMuted)
    if (m.webcam) add('webcam', t - m.webcam.offset - a.syncOffset, 0, true)
    if (a.musicPath) add('music', t, a.musicVolume, a.musicMuted)
    for (const o of e.overlays) {
      const as = L.assets.get(o.assetId)
      if (as?.kind !== 'video') continue
      add('ov:' + o.id, t >= o.start && t <= o.end ? o.trimStart + (t - o.start) : null, o.volume, o.muted || !as.hasAudio || !e.tracks.media)
    }
    for (const c of e.audioClips) add('ac:' + c.id, t >= c.start && t <= c.end ? c.trimStart + (t - c.start) : null, c.volume, c.muted || !e.tracks.audio)
    return out
  }

  const syncFollowers = (isPlaying: boolean) => {
    const v = videoRef.current
    if (!v) return
    for (const f of followers(logical.current)) {
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
      if (Math.abs(drift) > 0.6) el.currentTime = want!
      else if (Math.abs(drift) > 0.03) el.playbackRate = f.rate * (1 + Math.max(-0.12, Math.min(0.12, drift * 0.8)))
      if (el.paused) el.play().catch(() => {})
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

  // Adaptive preview quality: if frames take too long to draw (big full screen, low end GPU),
  // render smaller while playing and scale up. The export is always full quality.
  const quality = useRef(1)
  const frameMs = useRef(8)
  const adapt = (ms: number) => {
    frameMs.current = frameMs.current * 0.9 + ms * 0.1
    if (frameMs.current > 14 && quality.current > 0.45) {
      quality.current = Math.max(0.45, quality.current * 0.85)
      frameMs.current = 10
    } else if (frameMs.current < 6 && quality.current < 1) quality.current = Math.min(1, quality.current * 1.04)
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
    const q = useEditor.getState().playing ? quality.current : 1
    const W = Math.max(320, Math.round((Math.min(ow, box.w * dpr) * q) / 16) * 16)
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
    const camWant = project.media.webcam ? t - project.media.webcam.offset - L.edit.audio.syncOffset : -1
    // keep the last good webcam frame, and show it while the element is seeking or buffering
    let camSrc: { src: CanvasImageSource; w: number; h: number } | null = null
    if (cam && camWant >= 0 && L.edit.webcam.show) {
      if (cam.readyState >= 2 && !cam.seeking && cam.videoWidth) {
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
    }
    const t0 = performance.now()
    renderer.render(ctx, W, H, {
      edit: L.edit,
      srcW,
      srcH,
      t,
      bgTime: t + ambient.current,
      drawFrame: v.readyState >= 2 ? (cx, sx, sy, sw, sh, dx, dy, dw, dh) => cx.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh) : null,
      cursor: L.track,
      camera: L.camera,
      clicks: L.clicks,
      bgImage: L.bgImage,
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
      const vt = Math.max(0, time)
      if (Math.abs(v.currentTime - vt) > 0.001) v.currentTime = vt
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
    const loop = () => {
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
        if (n) v.currentTime = n.start
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
              v.currentTime = next.start
            }
          } else {
            v.pause()
            return useEditor.getState().setPlaying(false)
          }
        }
      }
      if (v.ended) return useEditor.getState().setPlaying(false)
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
      draw.current(at)
      timeBus.emit(at)
      syncFollowers(true)
      raf = requestAnimationFrame(loop)
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
    else st.select({ kind: h.kind === 'text' ? 'text' : 'overlay', id: h.id })
    const e0 = st.project!.edit
    const start = canvasXY(e)
    const item = h.kind === 'text' ? e0.texts.find((x) => x.id === h.id) : h.kind === 'overlay' ? e0.overlays.find((x) => x.id === h.id) : e0.webcam
    if (!item) return
    const ox = item.x
    const oy = item.y
    const size0 = h.kind === 'text' ? (item as { size: number }).size : h.kind === 'overlay' ? (item as { w: number }).w : (item as { size: number }).size
    const key = `${mode}-${h.id}-${Date.now()}`
    const mv = (ev: PointerEvent) => {
      const p = canvasXY(ev)
      useEditor.getState().update((ed) => {
        const it = h.kind === 'text' ? ed.texts.find((x) => x.id === h.id) : h.kind === 'overlay' ? ed.overlays.find((x) => x.id === h.id) : ed.webcam
        if (!it) return
        if (mode === 'move') {
          it.x = snap(ox + p.nx - start.nx)
          it.y = snap(oy + p.ny - start.ny)
        } else {
          // scale from the center by how far the pointer moved away from it
          const d0 = Math.hypot(start.nx - ox, (start.ny - oy) * (box.h / box.w))
          const d1 = Math.hypot(p.nx - ox, (p.ny - oy) * (box.h / box.w))
          const f = Math.max(0.2, Math.min(5, d1 / Math.max(0.01, d0)))
          if (h.kind === 'text') (it as { size: number }).size = Math.round(Math.max(12, Math.min(300, size0 * f)))
          else if (h.kind === 'overlay') (it as { w: number }).w = Math.max(0.05, Math.min(1, size0 * f))
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
  const selId = selection?.id
  const m = project.media
  const assetOf = (id: string): Asset | undefined => assets.get(id)

  return (
    <div ref={wrapRef} className="preview-wrap" data-tour="preview">
      <button className="icon-btn preview-full-btn" title={`${isFull ? 'Exit full screen' : 'Full screen preview'} (F)`} onClick={togglePreviewFullscreen}>
        <Icon name={isFull ? 'x' : 'expand'} size={16} />
      </button>
      {isFull && (
        <div className="preview-full-bar glass">
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
                onDoubleClick={() => h.kind === 'text' && setEditing(h.id)}
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
        {pinMode && <div className="toast glass" style={{ position: 'absolute', bottom: 12, top: 'auto' }}>Click where this zoom should point</div>}
      </div>

      {/* media elements stay in the layout (invisible) so Chromium keeps decoding frames in real time */}
      <div className="media-pool" aria-hidden>
      <video ref={videoRef} src={mediaUrl(m.screen.path)} muted playsInline preload="auto" className="pool-video" onLoadedData={() => draw.current()} onSeeked={() => draw.current()} />
      {m.mic && <audio ref={reg('mic')} src={mediaUrl(m.mic.path)} preload="auto" />}
      {m.system && <audio ref={reg('sys')} src={mediaUrl(m.system.path)} preload="auto" />}
      {m.webcam && <video ref={reg('webcam')} src={mediaUrl(m.webcam.path)} muted playsInline preload="auto" className="pool-video" onSeeked={() => draw.current()} onLoadedData={() => draw.current()} />}
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
