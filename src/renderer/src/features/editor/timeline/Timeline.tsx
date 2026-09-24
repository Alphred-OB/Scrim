// The timeline. It shows the video as it will be exported: cut parts are gone and later
// things slide left to close the gap (like CapCut and Resolve), faster clips are shorter.
// Only tracks that have something on them are shown; the right one appears while you drag.
import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react'
import { create } from 'zustand'
import type { OverlayMode, Transition } from '@shared/types'
import { Icon, fmtTime, openContextMenu, MenuItem } from '@/ui'
import { mediaUrl } from '@/lib/api'
import { freeLane } from '@shared/defaults'
import { useEditor, Selection } from '../state/store'
import { timeBus } from '../state/timeBus'
import { dragAsset } from '../state/dragAsset'
import { addAssetAt, addBlurAt, addEffectAt, addTransitionItem, setTransitionAtJoint, joinVideoAt, addTextAt, addZoomAt, deleteSelection, duplicateSelection, splitAtPlayhead } from '../state/actions'
import { outputDuration, outputToSource, sortedClips, sourceToOutput } from '../engine/timeMap'
import Waveform from './Waveform'
import Filmstrip from './Filmstrip'
import { TRANSITIONS } from '../panels/EffectsPanel'

const TRACK_H = 34
const VIDEO_H = 58
const RULER_H = 26
const HEAD_W = 128
const PAD = 14
export const ZOOM_MIN = 0.25 // 1 = whole video fits the view
export const ZOOM_MAX = 60
/** Screen point to keep still during the next zoom change (set by Ctrl+wheel). */
let zoomAnchor: { time: number; screenX: number } | null = null

export const useTimelineView = create<{ zoom: number; height: number; snap: boolean; setZoom(z: number | ((z: number) => number)): void; setHeight(h: number): void; setSnap(v: boolean): void }>((set, get) => ({
  zoom: 1,
  height: Number(localStorage.getItem('df.tlh')) || 300,
  snap: true,
  setZoom: (z) => set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, typeof z === 'function' ? z(get().zoom) : z)) }),
  setHeight: (h) => {
    const v = Math.min(620, Math.max(170, h))
    try {
      localStorage.setItem('df.tlh', String(v))
    } catch {
      /* ignore */
    }
    set({ height: v })
  },
  setSnap: (v) => set({ snap: v })
}))

type Item = { id: string; start: number; end: number; lane?: number }
type Kind = 'clip' | 'zoom' | 'text' | 'overlay' | 'audioClip' | 'effect' | 'transition' | 'blur'
interface Row { key: string; base: string; label: string; icon: string; color: string; kind?: Kind; h: number; lane?: number; toggle?: { on: boolean; set: () => void; icon: [string, string]; title: string } }

const COLORS = { video: '#3563d6', text: '#14a37f', blur: '#e05638', overlay: '#1d8aa0', effect: '#0f9fb3', transition: '#e07a2e', zoom: '#6d4fd1', zoomManual: '#8a5cf0', audio: '#b24a86', webcam: '#c9703a', mic: '#2f9e5b', system: '#9e7a2f' }
const BASE: Record<string, string> = { text: 'text', blur: 'blur', overlay: 'overlay', audioClip: 'audio', effect: 'effects', transition: 'transitions', zoom: 'zoom' }
const laneKey = (base: string, lane = 0) => (lane ? `${base}#${lane}` : base)
const lanesOf = (list: { lane?: number }[], spare: boolean) => (list.length ? Math.max(...list.map((x) => x.lane ?? 0)) + 1 + (spare ? 1 : 0) : spare ? 1 : 0)

export default function Timeline() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const keyPresses = useEditor((s) => s.cursorData?.keys) ?? []
  const select = useEditor((s) => s.select)
  const setTime = useEditor((s) => s.setTime)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const { zoom, height, setHeight } = useTimelineView()
  const duration = project.media.screen.duration
  const edit = project.edit
  const media = project.media

  const scrollRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1000)
  const [ghost, setGhost] = useState<{ row: string; T: number } | null>(null)
  const [dropRow, setDropRow] = useState<string | null>(null)
  const [dragBase, setDragBase] = useState<string | null>(null)
  const [joinHint, setJoinHint] = useState<'start' | 'end' | null>(null)
  const [snapLine, setSnapLine] = useState<number | null>(null)
  const [hoverT, setHoverT] = useState<number | null>(null)
  // the start, cut or end a dragged transition will land on
  const [hotJoint, setHotJoint] = useState<string | null>(null)

  // ---- time: everything on screen is output time (what plays after cuts and speed changes) ----
  const clips = sortedClips(edit.clips)
  const lead = edit.leadIn ?? 0
  const outDur = outputDuration(clips, lead)
  const o = (t: number) => sourceToOutput(clips, t, lead) // source -> output
  const src = (T: number) => outputToSource(clips, T, lead) // output -> source
  const pps = (width / Math.max(0.5, outDur)) * zoom
  const total = outDur * pps
  const tail = Math.max(260, width * 0.5)
  const X = (T: number) => PAD + T * pps
  const XS = (t: number) => X(o(t))

  useEffect(() => {
    const el = scrollRef.current!
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - HEAD_W - PAD * 2 - 16)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Ctrl + wheel zooms around the mouse
  const ppsRef = useRef(pps)
  useEffect(() => {
    const sc = scrollRef.current!
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const r = sc.getBoundingClientRect()
      const screenX = Math.max(HEAD_W, e.clientX - r.left)
      zoomAnchor = { time: (sc.scrollLeft + screenX - HEAD_W - PAD) / ppsRef.current, screenX }
      useTimelineView.getState().setZoom((z) => z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    }
    sc.addEventListener('wheel', on, { passive: false })
    return () => sc.removeEventListener('wheel', on)
  }, [])

  // zooming keeps what you're looking at in place (mouse, else playhead, else the middle)
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const before = ppsRef.current
    ppsRef.current = pps
    if (!sc || before === pps) return
    let a = zoomAnchor
    zoomAnchor = null
    if (!a) {
      const ph = o(timeBus.get())
      const phX = HEAD_W + PAD + ph * before - sc.scrollLeft
      a = phX >= HEAD_W && phX <= sc.clientWidth ? { time: ph, screenX: phX } : { time: (sc.scrollLeft + (sc.clientWidth + HEAD_W) / 2 - HEAD_W - PAD) / before, screenX: (sc.clientWidth + HEAD_W) / 2 }
    }
    sc.scrollLeft = Math.max(0, HEAD_W + PAD + a.time * pps - a.screenX)
  }, [pps])

  // playhead follows the clock without re-rendering the timeline
  const mapRef = useRef({ X, o })
  mapRef.current = { X, o }
  useEffect(() => {
    const move = (t: number) => {
      const { X: x, o: to } = mapRef.current
      const px = x(to(t))
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${px}px)`
      const sc = scrollRef.current
      if (sc && useEditor.getState().playing) {
        const abs = px + HEAD_W
        if (abs > sc.scrollLeft + sc.clientWidth - 40 || abs < sc.scrollLeft + HEAD_W) sc.scrollLeft = Math.max(0, abs - HEAD_W - 80)
      }
    }
    move(timeBus.get())
    return timeBus.on(move)
  }, [pps, lead, edit.clips])

  const outAt = (clientX: number) => {
    const sc = scrollRef.current!
    const r = sc.getBoundingClientRect()
    return Math.min(outDur, Math.max(0, (clientX - r.left + sc.scrollLeft - HEAD_W - PAD) / pps))
  }
  const timeAt = (clientX: number) => src(outAt(clientX))

  // ---- snapping (in output time) ----
  const snapPoints = (exclude: string): number[] => {
    const pts = [0, lead, outDur, o(timeBus.get())]
    for (const c of clips) pts.push(o(c.start), o(c.end))
    for (const list of [edit.zoom.segments, edit.texts, edit.blurs ?? [], edit.overlays, edit.audioClips, edit.effectClips, edit.transitions.items] as Item[][])
      for (const it of list) if (it.id !== exclude) pts.push(o(it.start), o(it.end))
    return pts
  }
  const snapT = (T: number, pts: number[]): number => {
    if (!useTimelineView.getState().snap) return T
    const tol = 8 / pps
    let best = T
    let bd = tol
    for (const p of pts) if (Math.abs(p - T) < bd) (bd = Math.abs(p - T)), (best = p)
    return best
  }

  const seek = (t: number) => {
    setTime(t)
    timeBus.emit(t)
  }
  const scrub = (clientX: number) => {
    useEditor.getState().setPlaying(false)
    seek(timeAt(clientX))
    const mv = (ev: PointerEvent) => seek(timeAt(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const listFor = (kind: Kind, ed = edit): Item[] =>
    kind === 'clip' ? ed.clips : kind === 'zoom' ? ed.zoom.segments : kind === 'text' ? ed.texts : kind === 'blur' ? (ed.blurs ?? []) : kind === 'overlay' ? ed.overlays : kind === 'effect' ? ed.effectClips : kind === 'transition' ? ed.transitions.items : ed.audioClips

  const assetLen = (it: Item, kind: Kind): number => {
    if (kind !== 'overlay' && kind !== 'audioClip') return Infinity
    const ov = it as unknown as { assetId: string; trimStart: number }
    const a = edit.assets.find((x) => x.id === ov.assetId)
    return !a || a.kind === 'image' ? Infinity : a.duration - ov.trimStart
  }

  // ---- dragging items ----
  const startDrag = (e: React.PointerEvent, kind: Kind, item: Item, mode: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return
    e.stopPropagation()
    select({ kind, id: item.id })
    if (kind === 'clip') return mode === 'move' ? dragVideo(e.clientX) : trimClip(e.clientX, item, mode)
    const x0 = e.clientX
    const y0 = e.clientY
    const layered = kind !== 'zoom'
    const lane0 = item.lane ?? 0
    const lanes = lanesOf(listFor(kind), true)
    let lane = lane0
    const s0 = item.start
    const e0 = item.end
    const srcLen = e0 - s0
    const T0s = o(s0)
    const T0e = o(e0)
    const others = listFor(kind).filter((x) => x.id !== item.id)
    // zooms can't overlap each other; everything else stacks on layers
    const lo = layered ? -lead : Math.max(0, ...others.filter((x) => x.end <= s0 + 1e-3).map((x) => x.end))
    const hi = layered ? duration : Math.min(duration, ...others.filter((x) => x.start >= e0 - 1e-3).map((x) => x.start))
    const maxLen = assetLen(item, kind)
    const trim0 = (item as { trimStart?: number }).trimStart ?? 0
    const pts = snapPoints(item.id)
    const key = `drag-${kind}-${item.id}-${Date.now()}`
    let moved = false
    const mv = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) > 3 || (layered && mode === 'move' && Math.abs(ev.clientY - y0) > 8)) {
        if (!moved && layered && mode === 'move') setDragBase(BASE[kind] ?? null)
        moved = true
      }
      if (!moved) return
      if (layered && mode === 'move') lane = Math.max(0, Math.min(lanes, lane0 + Math.round((ev.clientY - y0) / TRACK_H)))
      const dT = (ev.clientX - x0) / pps
      let ns = s0
      let ne = e0
      let trim = trim0
      let line: number | null = null
      if (mode === 'move') {
        let T = snapT(T0s + dT, pts)
        if (T !== T0s + dT) line = T
        else {
          const Te = snapT(T0e + dT, pts)
          if (Te !== T0e + dT) {
            line = Te
            T = Te - (T0e - T0s)
          }
        }
        ns = Math.min(hi - srcLen, Math.max(lo, src(T)))
        ne = ns + srcLen
      } else if (mode === 'l') {
        const T = snapT(T0s + dT, pts)
        if (T !== T0s + dT) line = T
        ns = Math.min(e0 - 0.2, Math.max(lo, src(T)))
        if (kind === 'overlay' || kind === 'audioClip') {
          trim = Math.max(0, trim0 + (ns - s0))
          ns = s0 + (trim - trim0)
        }
      } else {
        const T = snapT(T0e + dT, pts)
        if (T !== T0e + dT) line = T
        ne = Math.max(s0 + 0.2, Math.min(hi, s0 + maxLen, src(T)))
      }
      setSnapLine(line)
      update((ed) => {
        const it = listFor(kind, ed).find((x) => x.id === item.id) as (Item & { trimStart?: number }) | undefined
        if (!it) return
        it.start = +ns.toFixed(3)
        it.end = +ne.toFixed(3)
        if (layered) it.lane = lane
        if (it.trimStart !== undefined) it.trimStart = +trim.toFixed(3)
      }, key)
    }
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      setDragBase(null)
      setSnapLine(null)
      if (moved && layered)
        update((ed) => {
          const list = listFor(kind, ed)
          const it = list.find((x) => x.id === item.id)
          if (it) it.lane = freeLane(list, it.start, it.end, it.lane ?? 0, it.id)
        }, key)
      if (!moved && mode === 'move') seek(timeAt(x0))
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  // pulling a clip's edge trims it; everything after slides along (nothing is lost, pull it back out)
  const trimClip = (x0: number, item: Item, mode: 'l' | 'r') => {
    const c0 = clips.find((c) => c.id === item.id)!
    const i = clips.indexOf(c0)
    const prevEnd = i > 0 ? clips[i - 1].end : 0
    const nextStart = i < clips.length - 1 ? clips[i + 1].start : duration
    const key = `trim-${item.id}-${Date.now()}`
    const mv = (ev: PointerEvent) => {
      const dt = ((ev.clientX - x0) / pps) * c0.speed
      update((ed) => {
        const c = ed.clips.find((x) => x.id === item.id)
        if (!c) return
        if (mode === 'l') c.start = +Math.min(c0.end - 0.2, Math.max(prevEnd, c0.start + dt)).toFixed(3)
        else c.end = +Math.max(c0.start + 0.2, Math.min(nextStart, c0.end + dt)).toFixed(3)
      }, key)
    }
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  // dragging the video itself slides the whole recording later, leaving room for an intro
  const dragVideo = (x0: number) => {
    const lead0 = lead
    const key = `lead-${Date.now()}`
    let moved = false
    const mv = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) > 3) moved = true
      if (!moved) return
      let next = Math.max(0, lead0 + (ev.clientX - x0) / pps)
      if (next * pps < 10) next = 0
      update((ed) => (ed.leadIn = +next.toFixed(3)), key)
    }
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      if (!moved) seek(timeAt(x0))
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const itemMenu = (kind: Kind, it: Item): MenuItem[] => {
    const base: MenuItem[] = [
      { label: 'Split at playhead', hint: 'S', onClick: () => { select({ kind, id: it.id }); splitAtPlayhead() } },
      ...(kind !== 'clip' ? [{ label: 'Duplicate', onClick: () => { select({ kind, id: it.id }); duplicateSelection() } }] : [])
    ]
    const del: MenuItem[] = [{ sep: true }, { label: 'Delete', hint: 'Del', danger: true, disabled: kind === 'clip' && edit.clips.length <= 1, onClick: () => { select({ kind, id: it.id }); deleteSelection() } }]
    const find = <T extends Item>(list: (e: typeof edit) => T[]) => (fn: (x: T) => void) => update((e) => { const x = list(e).find((y) => y.id === it.id); if (x) fn(x) })
    if (kind === 'clip') {
      const c = it as unknown as { speed: number }
      const set = find((e) => e.clips)
      return [...base, { sep: true }, ...[0.5, 1, 1.5, 2, 4].map((sp) => ({ label: `Speed ${sp}x`, checked: c.speed === sp, onClick: () => set((x) => (x.speed = sp)) })), ...del]
    }
    if (kind === 'zoom') {
      const z = it as unknown as { follow: boolean; scale: number }
      const set = find((e) => e.zoom.segments)
      return [
        { label: 'Follow the cursor', checked: z.follow, onClick: () => set((x) => { x.follow = !x.follow; x.auto = false }) },
        { label: 'Pin a spot on the preview', onClick: () => { set((x) => { x.follow = false; x.auto = false }); select({ kind: 'zoom', id: it.id }) } },
        { sep: true },
        ...[1.25, 1.5, 2, 2.5, 3].map((sc) => ({ label: `Zoom ${sc}x`, checked: Math.abs(z.scale - sc) < 0.01, onClick: () => set((x) => (x.scale = sc)) })),
        { sep: true },
        ...base,
        ...del
      ]
    }
    if (kind === 'overlay') {
      const ov = it as unknown as { muted: boolean; mode: OverlayMode }
      const set = find((e) => e.overlays)
      return [
        { label: 'Play in the video', checked: ov.mode === 'frame', onClick: () => set((x) => (x.mode = 'frame')) },
        { label: 'On top (picture in picture)', checked: ov.mode === 'pip', onClick: () => set((x) => (x.mode = 'pip')) },
        { label: 'Full screen', checked: ov.mode === 'full', onClick: () => set((x) => (x.mode = 'full')) },
        { sep: true },
        { label: 'Mute', checked: ov.muted, onClick: () => set((x) => (x.muted = !x.muted)) },
        { sep: true },
        ...base,
        ...del
      ]
    }
    if (kind === 'audioClip') {
      const a = it as unknown as { muted: boolean }
      const set = find((e) => e.audioClips)
      return [{ label: 'Mute', checked: a.muted, onClick: () => set((x) => (x.muted = !x.muted)) }, { sep: true }, ...base, ...del]
    }
    if (kind === 'blur') {
      const b = it as unknown as { type: string }
      const set = find((e) => e.blurs)
      return [
        { label: 'Frosted blur', checked: b.type === 'blur', onClick: () => set((x) => (x.type = 'blur')) },
        { label: 'Pixelate mosaic', checked: b.type === 'pixelate', onClick: () => set((x) => (x.type = 'pixelate')) },
        { label: 'Solid redaction bar', checked: b.type === 'solid', onClick: () => set((x) => (x.type = 'solid')) },
        { sep: true },
        ...base,
        ...del
      ]
    }
    return [...base, ...del]
  }

  const isSel = (s: Selection, kind: Kind, id: string) => s?.kind === kind && s.id === id

  // ---- rows (only tracks with something on them, plus the video) ----
  const spareOn = dragBase ?? (dropRow ? dropRow.split('#')[0] : null)
  const rows: Row[] = []
  const pushLanes = (base: string, n: number, r: Omit<Row, 'key' | 'base' | 'h' | 'lane'>) => {
    for (let l = 0; l < n; l++) rows.push({ key: laneKey(base, l), base, h: TRACK_H, lane: l, ...r, label: l === 0 ? r.label : '' })
  }
  const eye = (on: boolean, set: () => void, title: string): Row['toggle'] => ({ on, set, icon: ['eye', 'eyeOff'], title })
  // the video always comes first, so it's never scrolled out of sight
  rows.push({ key: 'video', base: 'video', label: 'Video', icon: 'film', color: COLORS.video, kind: 'clip', h: VIDEO_H })
  if (edit.zoom.segments.length || spareOn === 'zoom')
    rows.push({ key: 'zoom', base: 'zoom', label: 'Zoom', icon: 'zoom', color: COLORS.zoom, kind: 'zoom', h: TRACK_H, toggle: eye(edit.zoom.enabled, () => update((e) => (e.zoom.enabled = !e.zoom.enabled)), 'Turn all zooms on or off') })
  if (keyPresses.length)
    rows.push({ key: 'keys', base: 'keys', label: 'Keys', icon: 'keyboard', color: '#5b6478', h: TRACK_H, toggle: eye(edit.keys.show, () => update((e) => (e.keys.show = !e.keys.show)), 'Show or hide keyboard shortcuts') })
  pushLanes('text', lanesOf(edit.texts, spareOn === 'text'), { label: 'Text', icon: 'text', color: COLORS.text, kind: 'text', toggle: eye(edit.tracks.text, () => update((e) => (e.tracks.text = !e.tracks.text)), 'Show or hide all text') })
  pushLanes('blur', lanesOf(edit.blurs ?? [], spareOn === 'blur'), { label: 'Blur', icon: 'eyeOff', color: COLORS.blur, kind: 'blur', toggle: eye(edit.tracks.blurs !== false, () => update((e) => (e.tracks.blurs = !(e.tracks.blurs !== false))), 'Show or hide blur regions') })
  pushLanes('overlay', lanesOf(edit.overlays, spareOn === 'overlay'), { label: 'Media', icon: 'image', color: COLORS.overlay, kind: 'overlay', toggle: eye(edit.tracks.media, () => update((e) => (e.tracks.media = !e.tracks.media)), 'Show or hide all media') })
  pushLanes('effects', lanesOf(edit.effectClips, spareOn === 'effects'), { label: 'Effects', icon: 'fx', color: COLORS.effect, kind: 'effect', toggle: eye(edit.tracks.effects, () => update((e) => (e.tracks.effects = !e.tracks.effects)), 'Turn effects on or off') })
  // transitions sit on the cuts (round buttons on the video); this line is for ones in the middle of a shot
  pushLanes('transitions', lanesOf(edit.transitions.items, spareOn === 'transitions'), { label: 'Transitions', icon: 'transition', color: COLORS.transition, kind: 'transition' })
  if (media.webcam) rows.push({ key: 'webcam', base: 'webcam', label: 'Camera', icon: 'webcam', color: COLORS.webcam, h: TRACK_H, toggle: eye(edit.webcam.show, () => update((e) => (e.webcam.show = !e.webcam.show)), 'Show or hide the camera') })
  if (media.mic) rows.push({ key: 'mic', base: 'mic', label: 'Voice', icon: 'mic', color: COLORS.mic, h: TRACK_H, toggle: { on: !edit.audio.micMuted, set: () => update((e) => (e.audio.micMuted = !e.audio.micMuted)), icon: ['volume', 'mute'], title: 'Mute your voice' } })
  if (media.system) rows.push({ key: 'system', base: 'system', label: 'PC sound', icon: 'audio', color: COLORS.system, h: TRACK_H, toggle: { on: !edit.audio.systemMuted, set: () => update((e) => (e.audio.systemMuted = !e.audio.systemMuted)), icon: ['volume', 'mute'], title: 'Mute computer sound' } })
  pushLanes('audio', lanesOf(edit.audioClips, spareOn === 'audio'), { label: 'Music', icon: 'music', color: COLORS.audio, kind: 'audioClip', toggle: { on: edit.tracks.audio, set: () => update((e) => (e.tracks.audio = !e.tracks.audio)), icon: ['volume', 'mute'], title: 'Mute all added audio' } })

  const tops = new Map<string, number>()
  let y = RULER_H
  for (const r of rows) {
    tops.set(r.key, y)
    y += r.h
  }
  const contentH = y + 34
  const top = (key: string) => tops.get(key) ?? RULER_H
  const rowAt = (clientY: number): Row | null => {
    const sc = scrollRef.current!
    const yy = clientY - sc.getBoundingClientRect().top + sc.scrollTop
    return rows.find((r) => yy >= top(r.key) && yy < top(r.key) + r.h) ?? null
  }

  // ---- drag and drop from the panels ----
  const joinSide = (clientX: number): 'start' | 'end' => (outAt(clientX) < outDur / 2 ? 'start' : 'end')
  const onDragOver = (e: React.DragEvent) => {
    const a = dragAsset.get()
    const fx = dragAsset.getFx()
    const under = rowAt(e.clientY)
    if (fx) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (fx.kind === 'transition') {
        // on the Transitions line: a free transition there; anywhere else: the nearest cut, start or end
        if (under?.base === 'transitions') {
          setHotJoint(null)
          setDropRow(under.key)
        } else {
          const T = outAt(e.clientX)
          setHotJoint(jointList().reduce((a, b) => (Math.abs(b.at - T) < Math.abs(a.at - T) ? b : a)).key)
          setDropRow('transitions')
        }
        return
      }
      setDropRow(under?.base === 'effects' ? under.key : 'effects')
      return
    }
    if (a) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const onVideo = a.kind === 'video' && under?.key === 'video'
      const base = a.kind === 'audio' ? 'audio' : 'overlay'
      setDropRow(onVideo ? 'video' : under?.base === base ? under.key : base)
      setJoinHint(onVideo ? joinSide(e.clientX) : null)
      setGhost(null)
    } else if (e.dataTransfer.types.includes('Files')) {
      dragAsset.setDropTime(timeAt(e.clientX))
    }
  }
  const onDrop = (e: React.DragEvent) => {
    setDropRow(null)
    setJoinHint(null)
    const under = rowAt(e.clientY)
    const fx = dragAsset.getFx()
    if (fx) {
      e.preventDefault()
      e.stopPropagation()
      dragAsset.setFx(null)
      const t = timeAt(e.clientX)
      if (fx.kind === 'effect') return addEffectAt(fx.look, fx.name, t, 5, under?.base === 'effects' ? under.lane ?? 0 : 0)
      setHotJoint(null)
      if (under?.base === 'transitions') return addTransitionItem(fx.type, t, 0.8, under.lane ?? 0)
      // anywhere else it goes between shots: the nearest start, cut or end
      setTransitionAtJoint(fx.type, outAt(e.clientX))
      return
    }
    const a = dragAsset.get()
    if (!a) return
    e.preventDefault()
    e.stopPropagation()
    dragAsset.set(null)
    if (a.kind === 'video' && under?.key === 'video') return void joinVideoAt(joinSide(e.clientX), a.path)
    const base = a.kind === 'audio' ? 'audio' : 'overlay'
    const live = useEditor.getState().project!.edit.assets.find((x) => x.id === a.id)
    if (live) addAssetAt(live, timeAt(e.clientX), under?.base === base ? under.lane ?? 0 : 0)
  }

  const jointList = () => [{ key: 'intro', at: lead }, ...clips.slice(1).map((c) => ({ key: c.id, at: o(c.start) })), { key: 'outro', at: outDur }]

  const onRowPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    select(null)
    scrub(e.clientX)
  }
  const onRowDouble = (e: React.MouseEvent, row: Row) => {
    if (e.target !== e.currentTarget) return
    const t = timeAt(e.clientX)
    if (row.key === 'zoom') addZoomAt(t)
    else if (row.kind === 'text') addTextAt(t, row.lane ?? 0)
    else if (row.kind === 'blur') addBlurAt(t, row.lane ?? 0)
  }

  // ---- blocks ----
  const block = (kind: Kind, it: Item, rowKey: string, color: string, icon: string, label: ReactNode, extra?: ReactNode, off?: boolean) => {
    const sel = isSel(selection, kind, it.id)
    const left = XS(it.start)
    const w = Math.max(6, XS(it.end) - left)
    const h = (rows.find((r) => r.key === rowKey)?.h ?? TRACK_H) - 6
    return (
      <div
        key={it.id}
        data-kind={kind}
        className={`tl-block ${sel ? 'sel' : ''} ${off ? 'off' : ''}`}
        onPointerDown={(e) => startDrag(e, kind, it, 'move')}
        onContextMenu={(e) => {
          select({ kind, id: it.id })
          openContextMenu(e, itemMenu(kind, it))
        }}
        title={`${typeof label === 'string' ? label : ''} ${fmtTime(o(it.end) - o(it.start), true)}`.trim()}
        style={{ left, width: w, top: top(rowKey) + 3, height: h, background: color, cursor: kind === 'clip' ? 'grab' : 'grab' }}
      >
        {extra}
        {w > 44 && (
          <span className="tl-label">
            <Icon name={icon} size={11} />
            <span>{label}</span>
          </span>
        )}
        <div className="tl-edge l" onPointerDown={(e) => startDrag(e, kind, it, 'l')}><i /></div>
        <div className="tl-edge r" onPointerDown={(e) => startDrag(e, kind, it, 'r')}><i /></div>
      </div>
    )
  }

  // ---- transitions on the video: intro, outro and one on every cut ----
  const name = (t: Transition) => TRANSITIONS.find((x) => x.v === t.type)?.l ?? ''
  const tMenu = (cur: Transition, set: (t: Transition | null) => void, canInherit: boolean, own: boolean) =>
    [
      ...TRANSITIONS.map((x) => ({ label: x.l, checked: cur.type === x.v, onClick: () => set({ type: x.v, duration: cur.duration || 0.6 }) })),
      { sep: true },
      ...[0.3, 0.5, 0.8, 1.2].map((d) => ({ label: `${d}s long`, checked: Math.abs(cur.duration - d) < 0.01, disabled: cur.type === 'none', onClick: () => set({ type: cur.type, duration: d }) })),
      ...(canInherit ? [{ sep: true }, { label: 'Same as every cut', checked: !own, onClick: () => set(null) }] : []),
      { sep: true },
      { label: 'Transitions panel…', onClick: () => useEditor.getState().setPanel('effects') }
    ] as MenuItem[]
  const joint = (key: string, T: number, cur: Transition, title: string, onMenu: (e: React.MouseEvent) => void, edge?: 'l' | 'r') => (
    <button
      key={key}
      className={`tl-joint ${cur.type !== 'none' ? 'on' : ''} ${edge ?? ''} ${hotJoint === key.replace(/^cut/, '') ? 'hot' : ''}`}
      style={{ left: X(T), top: top('video') + VIDEO_H / 2 }}
      title={`${title}. Click to change.`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onMenu}
    >
      <Icon name={cur.type === 'none' ? 'plus' : 'transition'} size={11} />
    </button>
  )
  const tr = edit.transitions
  const joints: ReactNode[] = []
  if (clips.length) {
    joints.push(joint('intro', lead, tr.intro, `Start: ${tr.intro.type === 'none' ? 'none' : name(tr.intro)}`, (e) => openContextMenu(e, tMenu(tr.intro, (v) => update((ed) => (ed.transitions.intro = v ?? ed.transitions.intro)), false, true)), 'l'))
    joints.push(joint('outro', outDur, tr.outro, `End: ${tr.outro.type === 'none' ? 'none' : name(tr.outro)}`, (e) => openContextMenu(e, tMenu(tr.outro, (v) => update((ed) => (ed.transitions.outro = v ?? ed.transitions.outro)), false, true)), 'r'))
    clips.slice(1).forEach((c) => {
      const own = tr.perCut[c.id]
      const cur = own ?? tr.cut
      joints.push(joint('cut' + c.id, o(c.start), cur, `Cut: ${cur.type === 'none' ? 'none' : name(cur)}${own ? '' : ' (same as every cut)'}`, (e) =>
        openContextMenu(e, tMenu(cur, (v) => update((ed) => { if (v) ed.transitions.perCut[c.id] = v; else delete ed.transitions.perCut[c.id] }), true, !!own))))
    })
  }

  // ---- ruler ----
  const step = niceStep(90 / pps)
  const ticks: number[] = []
  for (let u = 0; u <= outDur + tail / pps + 1e-6; u += step) ticks.push(u)

  const resize = (e: React.PointerEvent) => {
    const y0 = e.clientY
    const h0 = height
    const mv = (ev: PointerEvent) => setHeight(h0 + (y0 - ev.clientY))
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const sel = selection
  const extraTracks = rows.length - 1 - (media.webcam ? 1 : 0) - (media.mic ? 1 : 0) - (media.system ? 1 : 0)
  const dragging = !!dropRow || !!dragBase

  return (
    <div data-tour="timeline" className="tl2" style={{ height }}>
      <div className="tl-resize" onPointerDown={resize} title="Drag to resize the timeline" />
      <Toolbar
        canUndo={canUndo}
        canRedo={canRedo}
        hasSel={!!sel}
        canDup={!!sel && sel.kind !== 'clip'}
        canDelete={!!sel && !(sel.kind === 'clip' && edit.clips.length <= 1)}
      />
      <div
        className={`tl-scroll ${dragging ? 'dragging' : ''}`}
        ref={scrollRef}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDropRow(null)
          setJoinHint(null)
          setHotJoint(null)
        }}
        onDrop={onDrop}
      >
        <div style={{ position: 'relative', width: total + HEAD_W + tail, height: contentH, minHeight: '100%' }}>
          {/* track names */}
          <div className="tl-heads" style={{ height: contentH }}>
            <div style={{ height: RULER_H }} />
            {rows.map((r) => (
              <div key={r.key} data-tour={r.label ? 'track-' + r.base : undefined} className={`tl-head ${r.key === 'video' ? 'main' : ''} ${r.toggle && !r.toggle.on ? 'off' : ''} ${r.lane ? 'sub' : ''}`} style={{ height: r.h }}>
                {r.label ? (
                  <>
                    <span className="tl-badge" style={{ background: r.color }}><Icon name={r.icon} size={12} /></span>
                    <span className="tl-name">{r.label}</span>
                  </>
                ) : (
                  <span className="tl-name sub">Layer {(r.lane ?? 0) + 1}</span>
                )}
                {r.toggle && r.label && (
                  <button className={`icon-btn tl-eye ${r.toggle.on ? '' : 'off'}`} title={r.toggle.title} aria-pressed={!r.toggle.on} onPointerDown={(e) => e.stopPropagation()} onClick={r.toggle.set}>
                    <Icon name={r.toggle.on ? r.toggle.icon[0] : r.toggle.icon[1]} size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ position: 'absolute', left: HEAD_W, top: 0, width: total + tail, height: contentH }} onPointerMove={(e) => setHoverT(outAt(e.clientX))} onPointerLeave={() => setHoverT(null)}>
            {/* ruler */}
            <div className="tl-ruler" onPointerDown={(e) => scrub(e.clientX)} style={{ height: RULER_H }}>
              {ticks.map((T) => (
                <div key={T} className="tl-tick" style={{ left: X(T), opacity: T > outDur + 1e-6 ? 0.35 : 1 }}>
                  <span>{fmtRuler(T, step)}</span>
                </div>
              ))}
              {hoverT !== null && <div className="tl-hover" style={{ left: X(hoverT) }} />}
            </div>

            {/* track rows */}
            {rows.map((r) => (
              <div
                key={r.key}
                data-row={r.key}
                className={`tl-row ${r.key === 'video' ? 'main' : ''} ${dropRow === r.key ? 'tl-drop' : ''}`}
                style={{ top: top(r.key), height: r.h, width: total + tail }}
                onPointerDown={onRowPointerDown}
                onDoubleClick={(e) => onRowDouble(e, r)}
                onPointerMove={(e) => ((r.key === 'zoom' || r.kind === 'text' || r.kind === 'blur') && e.target === e.currentTarget ? setGhost({ row: r.key, T: outAt(e.clientX) }) : ghost && setGhost(null))}
                onPointerLeave={() => setGhost(null)}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    ...(r.key === 'zoom' ? [{ label: 'Add zoom here', onClick: () => addZoomAt(timeAt(e.clientX)) }] : []),
                    ...(r.kind === 'text' ? [{ label: 'Add text here', onClick: () => addTextAt(timeAt(e.clientX), r.lane ?? 0) }] : []),
                    ...(r.kind === 'blur' ? [{ label: 'Add blur here', onClick: () => addBlurAt(timeAt(e.clientX), r.lane ?? 0) }] : []),
                    ...(r.key === 'video' ? [{ label: 'Add a video before this one…', onClick: () => joinVideoAt('start') }, { label: 'Add a video after this one…', onClick: () => joinVideoAt('end') }, { sep: true }] : []),
                    { label: 'Split video at playhead', hint: 'S', onClick: () => splitAtPlayhead() }
                  ])
                }
              />
            ))}

            {/* double click to add */}
            {ghost && (
              <div className="tl-ghost" style={{ left: X(ghost.T), top: top(ghost.row) + 3, width: Math.max(90, (ghost.row === 'zoom' ? 2.5 : 3) * pps), height: TRACK_H - 6 }}>
                Double click to add {ghost.row === 'zoom' ? 'a zoom' : ghost.row.startsWith('blur') ? 'a blur' : 'text'}
              </div>
            )}

            {/* where a dragged video will be joined */}
            {joinHint && (
              <div className="tl-join" style={{ left: joinHint === 'start' ? X(lead) : X(outDur) - 4, top: top('video') + 2, height: VIDEO_H - 4 }}>
                <span style={{ [joinHint === 'start' ? 'left' : 'right']: 10 } as React.CSSProperties}>{joinHint === 'start' ? 'Join before' : 'Join after'}</span>
              </div>
            )}

            {/* intro space */}
            {lead > 0 && (
              <div className="tl-lead" style={{ left: X(0), width: lead * pps, top: top('video') + 3, height: VIDEO_H - 6 }} title="Empty space before your recording">
                {lead * pps > 150 ? 'Intro space · add text or media' : ''}
              </div>
            )}

            {/* the video, one block per clip, with thumbnails */}
            {clips.map((c) =>
              block('clip', c, 'video', COLORS.video, 'film', <>{c.speed !== 1 ? `${c.speed}x · ` : ''}{fmtTime((c.end - c.start) / c.speed, true)}</>,
                <Filmstrip path={media.screen.path} duration={duration} from={c.start} to={c.end} width={Math.max(6, ((c.end - c.start) / c.speed) * pps)} height={VIDEO_H - 6} />)
            )}
            {joints}

            {/* transitions on their own line */}
            {edit.transitions.items.map((it) => block('transition', it, laneKey('transitions', it.lane), COLORS.transition, 'transition', TRANSITIONS.find((x) => x.v === it.type)?.l ?? 'Transition'))}

            {/* effects */}
            {edit.effectClips.map((c) => block('effect', c, laneKey('effects', c.lane), COLORS.effect, 'fx', c.name, undefined, !edit.tracks.effects))}

            {/* camera */}
            {media.webcam && (
              <div className={`tl-block ${edit.webcam.show ? '' : 'off'}`} data-kind="webcam" onPointerDown={() => useEditor.getState().setPanel('webcam')} style={{ left: XS(Math.max(0, media.webcam.offset)), width: Math.max(10, X(outDur) - XS(Math.max(0, media.webcam.offset))), top: top('webcam') + 3, height: TRACK_H - 6, background: COLORS.webcam, cursor: 'pointer' }}>
                <span className="tl-label"><Icon name="webcam" size={11} /><span>Camera</span></span>
              </div>
            )}

            {/* media on top of the video */}
            {edit.overlays.map((ov) => {
              const a = edit.assets.find((x) => x.id === ov.assetId)
              return block('overlay', ov, laneKey('overlay', ov.lane), COLORS.overlay, a?.kind === 'video' ? 'film' : 'image', a?.name ?? 'Media',
                a?.kind === 'image' ? <div className="tl-thumb" style={{ backgroundImage: `url(${mediaUrl(a.path)})` }} /> : a?.kind === 'video' ? <Filmstrip path={a.path} duration={a.duration} from={ov.trimStart} to={ov.trimStart + (ov.end - ov.start)} width={Math.max(6, XS(ov.end) - XS(ov.start))} height={TRACK_H - 6} /> : undefined, !edit.tracks.media)
            })}

            {/* keyboard shortcuts: click to jump there, right click to hide one */}
            {keyPresses.length > 0 && keyPresses.map((kp) => {
              const id = Math.round(kp.t * 1000)
              const hidden = edit.keys.hidden.includes(id)
              return (
                <button
                  key={'k' + id}
                  className={`tl-key ${hidden || !edit.keys.show ? 'off' : ''}`}
                  style={{ left: XS(kp.t), top: top('keys') + 5, height: TRACK_H - 10, minWidth: Math.max(18, edit.keys.hold * pps) }}
                  title={`${kp.keys.join(' + ')}${hidden ? ' (hidden)' : ''}. Right click to ${hidden ? 'show' : 'hide'} it.`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    seek(kp.t)
                    useEditor.getState().setPanel('keys')
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    update((ed) => (ed.keys.hidden = hidden ? ed.keys.hidden.filter((h) => h !== id) : [...ed.keys.hidden, id]))
                  }}
                >
                  {kp.keys.map((c, i) => <kbd key={i}>{c}</kbd>)}
                </button>
              )
            })}

            {/* zooms */}
            {edit.zoom.segments.map((z) => block('zoom', z, 'zoom', z.auto ? COLORS.zoom : COLORS.zoomManual, 'zoom', <>{z.auto ? 'Auto' : z.follow ? 'Follow' : 'Pinned'} {z.scale.toFixed(1)}x</>, undefined, !edit.zoom.enabled))}

            {/* text, with ramps for the in and out animation */}
            {edit.texts.map((t) => {
              const len = Math.max(0.1, t.end - t.start)
              const k = Math.min(1, len / ((t.inDur ?? 0.35) + (t.outDur ?? 0.35) + 0.001))
              const rin = t.animIn && t.animIn !== 'none' ? (t.inDur ?? 0.35) * k * pps : 0
              const rout = t.animOut && t.animOut !== 'none' ? (t.outDur ?? 0.35) * k * pps : 0
              return block('text', t, laneKey('text', t.lane), COLORS.text, 'text', `${t.loop && t.loop !== 'none' ? '∿ ' : ''}${t.text.split('\n')[0] || 'Text'}`, <>
                {rin > 3 && <i className="tl-ramp in" style={{ width: rin }} />}
                {rout > 3 && <i className="tl-ramp out" style={{ width: rout }} />}
              </>, !edit.tracks.text)
            })}

            {/* blur & redaction */}
            {(edit.blurs ?? []).map((b) =>
              block(
                'blur',
                b,
                laneKey('blur', b.lane),
                COLORS.blur,
                'eyeOff',
                b.type === 'pixelate' ? 'Pixelate' : b.type === 'solid' ? 'Redact' : 'Blur',
                undefined,
                edit.tracks.blurs === false
              )
            )}

            {/* recorded sound: one waveform piece per clip, so cuts show up here too */}
            {(['mic', 'system'] as const).map((k) => {
              const m = media[k]
              if (!m) return null
              const muted = k === 'mic' ? edit.audio.micMuted : edit.audio.systemMuted
              return clips.map((c) => {
                const w = ((c.end - c.start) / c.speed) * pps
                const off = m.offset + edit.audio.syncOffset
                return (
                  <div key={k + c.id} className={`tl-wave ${muted ? 'off' : ''}`} style={{ left: XS(c.start), width: w, top: top(k) + 3, height: TRACK_H - 6, borderColor: COLORS[k] }}>
                    <Waveform path={m.path} from={c.start - off} to={c.end - off} width={w} height={TRACK_H - 6} color={COLORS[k]} />
                  </div>
                )
              })
            })}

            {/* imported audio */}
            {edit.audioClips.map((c) => {
              const a = edit.assets.find((x) => x.id === c.assetId)
              const w = Math.max(6, XS(c.end) - XS(c.start))
              return block('audioClip', c, laneKey('audio', c.lane), COLORS.audio, 'music', a?.name ?? 'Audio',
                a ? <div style={{ position: 'absolute', inset: 0, opacity: c.muted ? 0.3 : 0.85 }}><Waveform path={a.path} from={c.trimStart} to={c.trimStart + (c.end - c.start)} width={w} height={TRACK_H - 6} color="rgba(255,255,255,.55)" /></div> : undefined, !edit.tracks.audio)
            })}

            {/* end of the video */}
            <div className="tl-end" style={{ left: X(outDur), top: RULER_H, height: y - RULER_H }} />

            {/* snap guide */}
            {snapLine !== null && <div className="tl-snap" style={{ left: X(snapLine), top: RULER_H, height: y - RULER_H }} />}

            {/* help when the timeline is just the video */}
            {extraTracks === 0 && !dragging && (
              <div className="tl-empty" style={{ top: y + 8, left: X(0) }}>
                Drag media, text, transitions or effects here. Press <kbd>S</kbd> to split, <kbd>Del</kbd> to delete.
              </div>
            )}

            {/* playhead */}
            <div ref={playheadRef} className="tl-playhead" style={{ height: y }}>
              <div className="knob" />
              <div className="line" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The bar above the tracks: the everyday editing buttons, always in the same place. */
function Toolbar({ canUndo, canRedo, hasSel, canDup, canDelete }: { canUndo: boolean; canRedo: boolean; hasSel: boolean; canDup: boolean; canDelete: boolean }) {
  const { zoom, snap, setZoom, setSnap } = useTimelineView()
  const st = useEditor.getState
  const addText = () => {
    st().setPanel('text')
    addTextAt(Math.max(-(st().project?.edit.leadIn ?? 0), timeBus.get()))
  }
  const slider = Math.round((Math.log(zoom / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) * 100)
  return (
    <div className="tl-bar">
      <div className="tl-group">
        <button className="tl-tool" disabled={!canUndo} onClick={() => st().undo()} title="Undo (Ctrl+Z)"><Icon name="undo" size={16} /></button>
        <button className="tl-tool" disabled={!canRedo} onClick={() => st().redo()} title="Redo (Ctrl+Y)"><Icon name="redo" size={16} /></button>
      </div>
      <span className="tl-sep" />
      <div className="tl-group">
        <button className="tl-tool wide" onClick={() => splitAtPlayhead()} title="Split at the playhead (S)"><Icon name="split" size={16} /><span>Split</span></button>
        <button className="tl-tool wide" disabled={!canDelete} onClick={() => deleteSelection()} title={hasSel ? 'Delete (Del)' : 'Select something to delete it'}><Icon name="trash" size={16} /><span>Delete</span></button>
        <button className="tl-tool" disabled={!canDup} onClick={() => duplicateSelection()} title="Duplicate"><Icon name="copy" size={16} /></button>
      </div>
      <span className="tl-sep" />
      <div className="tl-group">
        <button className="tl-add" onClick={addText} title="Add text at the playhead (T)"><Icon name="text" size={14} /> Text</button>
        <button className="tl-add" onClick={() => addZoomAt(Math.max(0, timeBus.get()))} title="Add a zoom at the playhead (Z)"><Icon name="zoom" size={14} /> Zoom</button>
        <button className="tl-add" onClick={() => st().setPanel('media')} title="Open your media"><Icon name="image" size={14} /> Media</button>
        <button className="tl-add" onClick={() => st().setPanel('effects')} title="Transitions and effects"><Icon name="fx" size={14} /> Effects</button>
      </div>
      <div style={{ flex: 1 }} />
      <button className={`tl-tool ${snap ? 'on' : ''}`} onClick={() => setSnap(!snap)} title={snap ? 'Snapping is on' : 'Snapping is off'}><Icon name="magnet" size={16} /></button>
      <span className="tl-sep" />
      <div data-tour="tl-zoom" className="tl-group tl-zoomer">
        <button className="tl-tool" onClick={() => setZoom((z) => z / 1.5)} title="Zoom out (-)"><Icon name="minus" size={14} /></button>
        <input className="range" type="range" min={0} max={100} value={slider} onChange={(e) => setZoom(ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, +e.target.value / 100))} aria-label="Timeline zoom" />
        <button className="tl-tool" onClick={() => setZoom((z) => z * 1.5)} title="Zoom in (+)"><Icon name="plus" size={14} /></button>
        <button className="tl-fit" onClick={() => setZoom(1)} title="Fit the whole video">Fit</button>
      </div>
    </div>
  )
}

function niceStep(minSec: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  return steps.find((s) => s >= minSec) ?? 600
}
function fmtRuler(t: number, step: number): string {
  return step < 1 ? `${t.toFixed(step < 0.5 ? 2 : 1)}s` : fmtTime(t)
}
