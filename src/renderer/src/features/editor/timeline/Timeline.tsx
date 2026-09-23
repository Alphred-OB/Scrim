import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react'
import { create } from 'zustand'
import type { OverlayMode, Transition } from '@shared/types'
import { Icon, fmtTime, openContextMenu, MenuItem } from '@/ui'
import { mediaUrl } from '@/lib/api'
import { freeLane } from '@shared/defaults'
import { useEditor, Selection } from '../state/store'
import { timeBus } from '../state/timeBus'
import { dragAsset } from '../state/dragAsset'
import { addAssetAt, addEffectAt, addTransitionAt, joinVideoAt, addTextAt, addZoomAt, deleteSelection, duplicateSelection, splitAtPlayhead } from '../state/actions'
import { sortedClips } from '../engine/timeMap'
import Waveform from './Waveform'
import { TRANSITIONS } from '../panels/EffectsPanel'

const TRACK_H = 36
const RULER_H = 28
const HEAD_W = 150
export const ZOOM_MIN = 0.25 // 1 = whole video fits the view; below that the video gets shorter than the view
export const ZOOM_MAX = 60
/** Screen point to keep still during the next zoom change (set by Ctrl+wheel). */
let zoomAnchor: { time: number; screenX: number } | null = null

export const useTimelineView = create<{ zoom: number; height: number; setZoom(z: number | ((z: number) => number)): void; setHeight(h: number): void }>((set, get) => ({
  zoom: 1,
  height: Number(localStorage.getItem('df.tlh')) || 330,
  setZoom: (z) => set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, typeof z === 'function' ? z(get().zoom) : z)) }),
  setHeight: (h) => {
    const v = Math.min(620, Math.max(150, h))
    try {
      localStorage.setItem('df.tlh', String(v))
    } catch {
      /* ignore */
    }
    set({ height: v })
  }
}))

type Item = { id: string; start: number; end: number; lane?: number }

// layer helpers: row keys are "text", "text#1", "text#2"...
const laneKey = (base: string, lane = 0) => (lane ? `${base}#${lane}` : base)
const laneOf = (key: string) => Number(key.split('#')[1] ?? 0)
const laneCount = (list: { lane?: number }[], spare = false) => (list.length ? Math.max(...list.map((x) => x.lane ?? 0)) + 1 + (spare ? 1 : 0) : 1)
const BASE: Record<string, string> = { text: 'text', overlay: 'overlay', audioClip: 'audio', effect: 'effects', transition: 'transitions' }
type Kind = 'clip' | 'zoom' | 'text' | 'overlay' | 'audioClip' | 'effect' | 'transition'
interface Row { key: string; label: string; sub?: string; icon: string; color: string; kind?: Kind; hint?: string; toggle?: { on: boolean; set: () => void; icon: [string, string]; title: string } }

export default function Timeline() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const setTime = useEditor((s) => s.setTime)
  const cursorData = useEditor((s) => s.cursorData)
  const { zoom, height, setHeight } = useTimelineView()
  const duration = project.media.screen.duration
  const edit = project.edit
  const media = project.media

  const scrollRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1000)
  const [ghost, setGhost] = useState<{ row: string; t: number } | null>(null)
  const [dropRow, setDropRow] = useState<string | null>(null)
  // the extra empty layer only shows while something is being dragged onto that track
  const [dragBase, setDragBase] = useState<string | null>(null)
  const [joinHint, setJoinHint] = useState<'start' | 'end' | null>(null)
  const pps = (width / Math.max(0.5, duration)) * zoom
  // empty space before the recording (drag the video right to make it); it sits at negative times
  const lead = edit.leadIn ?? 0
  const total = (duration + lead) * pps
  // open space after the end so the timeline never feels boxed in and can be zoomed freely
  const tail = Math.max(240, width * 0.5)
  const X = (t: number) => 12 + (t + lead) * pps

  useEffect(() => {
    const el = scrollRef.current!
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - HEAD_W - 30)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Ctrl + wheel zooms around the mouse (native listener so the page itself never zooms)
  useEffect(() => {
    const sc = scrollRef.current!
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const r = sc.getBoundingClientRect()
      const screenX = Math.max(HEAD_W, e.clientX - r.left)
      zoomAnchor = { time: (sc.scrollLeft + screenX - HEAD_W - 12) / prevPps.current - leadRef.current, screenX }
      useTimelineView.getState().setZoom((z) => z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    }
    sc.addEventListener('wheel', on, { passive: false })
    return () => sc.removeEventListener('wheel', on)
  }, [])

  // zooming keeps what you're looking at in place: the point under the mouse (Ctrl+wheel),
  // otherwise the playhead if it's on screen, otherwise the middle of the view
  const prevPps = useRef(pps)
  const leadRef = useRef(lead)
  leadRef.current = lead
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const before = prevPps.current
    prevPps.current = pps
    if (!sc || before === pps) return
    const Xb = (t: number) => HEAD_W + 12 + (t + lead) * before
    let a = zoomAnchor
    zoomAnchor = null
    if (!a) {
      const ph = timeBus.get()
      const phX = Xb(ph) - sc.scrollLeft
      a = phX >= HEAD_W && phX <= sc.clientWidth ? { time: ph, screenX: phX } : { time: (sc.scrollLeft + (sc.clientWidth + HEAD_W) / 2 - HEAD_W - 12) / before - lead, screenX: (sc.clientWidth + HEAD_W) / 2 }
    }
    sc.scrollLeft = Math.max(0, HEAD_W + 12 + (a.time + lead) * pps - a.screenX)
  }, [pps])

  useEffect(() => {
    const move = (t: number) => {
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${X(t)}px)`
      const sc = scrollRef.current
      // keep the playhead in view while playing or stepping with the arrow keys
      if (sc) {
        const x = X(t) + HEAD_W
        if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft + HEAD_W) sc.scrollLeft = Math.max(0, x - HEAD_W - 80)
      }
    }
    move(timeBus.get())
    return timeBus.on(move)
  }, [pps, lead])

  const timeAt = (clientX: number) => {
    const sc = scrollRef.current!
    const r = sc.getBoundingClientRect()
    return Math.min(duration, Math.max(-lead, (clientX - r.left + sc.scrollLeft - HEAD_W - 12) / pps - lead))
  }

  // edges things snap to while dragging
  const snapPoints = (exclude: string): number[] => {
    const pts = [-lead, 0, duration, timeBus.get()]
    for (const c of edit.clips) pts.push(c.start, c.end)
    for (const list of [edit.zoom.segments, edit.texts, edit.overlays, edit.audioClips] as Item[][]) for (const it of list) if (it.id !== exclude) pts.push(it.start, it.end)
    return pts
  }
  const snap = (t: number, pts: number[]) => {
    const tol = 7 / pps
    let best = t
    let bd = tol
    for (const p of pts) if (Math.abs(p - t) < bd) (bd = Math.abs(p - t)), (best = p)
    return best
  }

  const scrub = (clientX: number) => {
    useEditor.getState().setPlaying(false)
    const go = (x: number) => {
      const t = timeAt(x)
      setTime(t)
      timeBus.emit(t)
    }
    go(clientX)
    const mv = (ev: PointerEvent) => go(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const listFor = (kind: Kind, ed = edit): Item[] =>
    kind === 'clip' ? ed.clips : kind === 'zoom' ? ed.zoom.segments : kind === 'text' ? ed.texts : kind === 'overlay' ? ed.overlays : kind === 'effect' ? ed.effectClips : kind === 'transition' ? ed.transitions.items : ed.audioClips

  const assetLen = (it: Item, kind: Kind): number => {
    if (kind !== 'overlay' && kind !== 'audioClip') return Infinity
    const o = it as unknown as { assetId: string; trimStart: number }
    const a = edit.assets.find((x) => x.id === o.assetId)
    return !a || a.kind === 'image' ? Infinity : a.duration - o.trimStart
  }

  const startDrag = (e: React.PointerEvent, kind: Kind, item: Item, mode: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return
    e.stopPropagation()
    select({ kind, id: item.id })
    if (kind === 'clip' && mode === 'move') return dragVideo(e.clientX)
    const x0 = e.clientX
    const y0 = e.clientY
    const layered = kind === 'text' || kind === 'overlay' || kind === 'audioClip' || kind === 'effect' || kind === 'transition'
    const lane0 = item.lane ?? 0
    const lanes = laneCount(listFor(kind), true)
    let lane = lane0
    const s0 = item.start
    const e0 = item.end
    const others = listFor(kind).filter((o) => o.id !== item.id)
    const stacks = kind === 'text' || kind === 'overlay' || kind === 'audioClip' || kind === 'effect' || kind === 'transition'
    const lo = stacks ? -lead : Math.max(0, ...others.filter((o) => o.end <= s0 + 1e-3).map((o) => o.end))
    const hi = stacks ? duration : Math.min(duration, ...others.filter((o) => o.start >= e0 - 1e-3).map((o) => o.start))
    const maxLen = assetLen(item, kind)
    const trim0 = (item as { trimStart?: number }).trimStart ?? 0
    const pts = snapPoints(item.id)
    const key = `drag-${kind}-${item.id}-${Date.now()}`
    let moved = false
    const mv = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) > 2 || (layered && mode === 'move' && Math.abs(ev.clientY - y0) > 6)) {
        if (!moved && layered && mode === 'move') setDragBase(BASE[kind] ?? null)
        moved = true
      }
      if (!moved) return
      // dragging up or down moves the item to another layer (one past the last makes a new layer)
      if (layered && mode === 'move') lane = Math.max(0, Math.min(lanes, lane0 + Math.round((ev.clientY - y0) / TRACK_H)))
      const dt = (ev.clientX - x0) / pps
      let ns = s0
      let ne = e0
      let trim = trim0
      if (mode === 'move') {
        const len = e0 - s0
        ns = snap(s0 + dt, pts)
        if (ns === s0 + dt) ns = snap(s0 + dt + len, pts) - len
        ns = Math.min(hi - len, Math.max(lo, ns))
        ne = ns + len
      } else if (mode === 'l') {
        ns = Math.min(e0 - 0.2, Math.max(lo, snap(s0 + dt, pts)))
        if (kind === 'overlay' || kind === 'audioClip') {
          // trimming the left edge also moves where the asset starts playing
          trim = Math.max(0, trim0 + (ns - s0))
          ns = s0 + (trim - trim0)
        }
      } else ne = Math.max(s0 + 0.2, Math.min(hi, s0 + maxLen, snap(e0 + dt, pts)))
      update((ed) => {
        const it = listFor(kind, ed).find((o) => o.id === item.id) as (Item & { trimStart?: number }) | undefined
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
      // never leave two items on top of each other on one layer: bump to the next free one
      if (moved && layered)
        update((ed) => {
          const list = listFor(kind, ed)
          const it = list.find((o) => o.id === item.id)
          if (it) it.lane = freeLane(list, it.start, it.end, it.lane ?? 0, it.id)
        }, key)
      if (!moved && mode === 'move') {
        const t = timeAt(x0)
        setTime(t)
        timeBus.emit(t)
      }
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  // dragging the video block slides the whole recording later or earlier, leaving room before it
  const dragVideo = (x0: number) => {
    const lead0 = lead
    const key = `lead-${Date.now()}`
    let moved = false
    const mv = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) > 3) moved = true
      if (!moved) return
      let next = Math.max(0, lead0 + (ev.clientX - x0) / pps)
      if (next * pps < 8) next = 0 // snap back to the very start
      update((ed) => (ed.leadIn = +next.toFixed(3)), key)
    }
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      if (!moved) {
        const t = timeAt(x0)
        setTime(t)
        timeBus.emit(t)
      }
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
    if (kind === 'clip') {
      const c = it as unknown as { speed: number }
      return [
        ...base,
        { sep: true },
        ...[0.5, 1, 1.5, 2, 4].map((sp) => ({ label: `Speed ${sp}x`, checked: c.speed === sp, onClick: () => update((e) => { const x = e.clips.find((y) => y.id === it.id); if (x) x.speed = sp }) })),
        ...del
      ]
    }
    if (kind === 'zoom') {
      const z = it as unknown as { follow: boolean; scale: number }
      return [
        { label: 'Follow the cursor', checked: z.follow, onClick: () => update((e) => { const x = e.zoom.segments.find((y) => y.id === it.id); if (x) { x.follow = !x.follow; x.auto = false } }) },
        { label: 'Pin a spot on the preview', onClick: () => { update((e) => { const x = e.zoom.segments.find((y) => y.id === it.id); if (x) { x.follow = false; x.auto = false } }); select({ kind: 'zoom', id: it.id }) } },
        { sep: true },
        ...[1.25, 1.5, 2, 2.5, 3].map((sc) => ({ label: `Zoom ${sc}x`, checked: Math.abs(z.scale - sc) < 0.01, onClick: () => update((e) => { const x = e.zoom.segments.find((y) => y.id === it.id); if (x) x.scale = sc }) })),
        { sep: true },
        ...base,
        ...del
      ]
    }
    if (kind === 'overlay') {
      const o = it as unknown as { muted: boolean; mode: OverlayMode }
      const setMode = (m: OverlayMode) => update((e) => { const x = e.overlays.find((y) => y.id === it.id); if (x) x.mode = m })
      return [
        { label: 'Play in the video', checked: o.mode === 'frame', onClick: () => setMode('frame') },
        { label: 'On top (picture in picture)', checked: o.mode === 'pip', onClick: () => setMode('pip') },
        { label: 'Full screen', checked: o.mode === 'full', onClick: () => setMode('full') },
        { sep: true },
        { label: 'Mute', checked: o.muted, onClick: () => update((e) => { const x = e.overlays.find((y) => y.id === it.id); if (x) x.muted = !x.muted }) },
        { sep: true },
        ...base,
        ...del
      ]
    }
    if (kind === 'audioClip') {
      const a = it as unknown as { muted: boolean }
      return [{ label: 'Mute', checked: a.muted, onClick: () => update((e) => { const x = e.audioClips.find((y) => y.id === it.id); if (x) x.muted = !x.muted }) }, { sep: true }, ...base, ...del]
    }
    return [...base, ...del]
  }

  const isSel = (s: Selection, kind: Kind, id: string) => s?.kind === kind && s.id === id

  const block = (kind: Kind, it: Item, top: number, color: string, label: ReactNode, extra?: ReactNode) => {
    const sel = isSel(selection, kind, it.id)
    const w = Math.max(6, (it.end - it.start) * pps)
    return (
      <div
        key={it.id}
        className={`tl-block ${sel ? 'sel' : ''}`}
        onPointerDown={(e) => startDrag(e, kind, it, 'move')}
        onContextMenu={(e) => {
          select({ kind, id: it.id })
          openContextMenu(e, itemMenu(kind, it))
        }}
        style={{ left: X(it.start), width: w, top: top + 4, height: TRACK_H - 8, background: color, cursor: kind === 'clip' ? 'pointer' : 'grab', opacity: (kind === 'zoom' && !edit.zoom.enabled) || (kind === 'overlay' && !edit.tracks.media) || (kind === 'text' && !edit.tracks.text) || (kind === 'audioClip' && !edit.tracks.audio) || (kind === 'effect' && !edit.tracks.effects) ? 0.35 : undefined }}
      >
        {extra}
        <div className="tl-edge l" onPointerDown={(e) => startDrag(e, kind, it, 'l')} />
        {w > 30 && <span className="tl-label">{label}</span>}
        <div className="tl-edge r" onPointerDown={(e) => startDrag(e, kind, it, 'r')} />
      </div>
    )
  }

  // Media library items can be dropped anywhere on the timeline. The asset type picks the track.
  // which track row is under the pointer
  const rowAt = (clientY: number): string | null => {
    const sc = scrollRef.current!
    const y = clientY - sc.getBoundingClientRect().top + sc.scrollTop - RULER_H
    return y < 0 ? null : rows[Math.floor(y / TRACK_H)]?.key ?? null
  }
  // dropping a video on the Video track joins it before or after the recording (nearest end)
  const joinSide = (clientX: number): 'start' | 'end' => (timeAt(clientX) < duration / 2 ? 'start' : 'end')

  const onDragOver = (e: React.DragEvent) => {
    const a = dragAsset.get()
    const fx = dragAsset.getFx()
    if (fx) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const under = rowAt(e.clientY) ?? ''
      const base = fx.kind === 'transition' ? 'transitions' : 'effects'
      setDropRow(under.split('#')[0] === base ? under : base)
      return
    }
    if (a) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const onVideo = a.kind === 'video' && rowAt(e.clientY) === 'video'
      const base = a.kind === 'audio' ? 'audio' : 'overlay'
      const under = rowAt(e.clientY) ?? ''
      setDropRow(onVideo ? 'video' : under.split('#')[0] === base ? under : base)
      setJoinHint(onVideo ? joinSide(e.clientX) : null)
      setGhost(null)
    } else if (e.dataTransfer.types.includes('Files')) {
      dragAsset.setDropTime(timeAt(e.clientX))
    }
  }
  const onDrop = (e: React.DragEvent) => {
    setDropRow(null)
    setJoinHint(null)
    const fx = dragAsset.getFx()
    if (fx) {
      e.preventDefault()
      e.stopPropagation()
      dragAsset.setFx(null)
      const t = timeAt(e.clientX)
      if (fx.kind === 'effect') {
        const under = rowAt(e.clientY) ?? ''
        return addEffectAt(fx.look, fx.name, t, 5, under.split('#')[0] === 'effects' ? laneOf(under) : 0)
      }
      // dropped near a cut: that cut gets it; anywhere else: a free-standing transition
      const under = rowAt(e.clientY) ?? ''
      const lane = under.split('#')[0] === 'transitions' ? laneOf(under) : 0
      // dropped near a cut on the first layer: that cut gets it; anywhere else: a free-standing transition
      const cut = lane === 0 ? cutNear(t) : null
      if (cut) return update((ed) => (ed.transitions.perCut[cut.id] = { type: fx.type, duration: ed.transitions.perCut[cut.id]?.duration ?? ed.transitions.cut.duration ?? 0.6 }))
      return addTransitionAt(fx.type, t, 0.8, lane)
    }
    const a = dragAsset.get()
    if (!a) return
    e.preventDefault()
    e.stopPropagation()
    dragAsset.set(null)
    const row = rowAt(e.clientY) ?? ''
    if (a.kind === 'video' && row === 'video') return void joinVideoAt(joinSide(e.clientX), a.path)
    const base = a.kind === 'audio' ? 'audio' : 'overlay'
    const live = useEditor.getState().project!.edit.assets.find((x) => x.id === a.id)
    if (live) addAssetAt(live, timeAt(e.clientX), row.split('#')[0] === base ? laneOf(row) : 0)
  }

  // the clip right after a cut near time t (within about 14 pixels), for dropping transitions on cuts
  const cutNear = (t: number) => {
    const cs = sortedClips(edit.clips)
    for (let i = 1; i < cs.length; i++) {
      const at = (cs[i - 1].end + cs[i].start) / 2
      if (Math.abs(at - t) * pps < 14 + Math.abs(cs[i].start - cs[i - 1].end) * pps / 2) return cs[i]
    }
    return null
  }

  // ---- rows ----
  // Media, Text and Audio have layers: items on different layers can play at the same time.
  function pushLanes(base: string, n: number, first: Omit<Row, 'key'>): void {
    for (let l = 0; l < n; l++)
      rows.push(l === 0 ? { key: base, ...first } : { key: laneKey(base, l), label: '', sub: `Layer ${l + 1}`, icon: first.icon, color: first.color, kind: first.kind })
  }
  const spareOn = dragBase ?? (dropRow ? dropRow.split('#')[0] : null)
  const rows: Row[] = [{ key: 'video', label: 'Video', icon: 'film', color: '#2b4fb8', kind: 'clip' }]
  pushLanes('transitions', laneCount(edit.transitions.items, spareOn === 'transitions'), { label: 'Transitions', icon: 'transition', color: '#d9772b', kind: 'transition' })
  const fxToggle = { on: edit.tracks.effects, set: () => update((e) => (e.tracks.effects = !e.tracks.effects)), icon: ['eye', 'eyeOff'] as [string, string], title: 'Turn effects on this track on or off' }
  pushLanes('effects', laneCount(edit.effectClips, spareOn === 'effects'), { label: 'Effects', icon: 'fx', color: '#1aa3b8', kind: 'effect', hint: 'Drag an effect here to use it on part of the video', toggle: fxToggle })
  if (media.webcam)
    rows.push({
      key: 'webcam', label: 'Webcam', icon: 'webcam', color: '#b85d2b',
      toggle: { on: edit.webcam.show, set: () => update((e) => (e.webcam.show = !e.webcam.show)), icon: ['eye', 'eyeOff'], title: 'Show or hide the webcam' }
    })
  const mediaToggle = { on: edit.tracks.media, set: () => update((e) => (e.tracks.media = !e.tracks.media)), icon: ['eye', 'eyeOff'] as [string, string], title: 'Show or hide all media' }
  pushLanes('overlay', laneCount(edit.overlays, spareOn === 'overlay'), { label: 'Media', icon: 'image', color: '#1f7a8c', kind: 'overlay', hint: 'Drop videos or images here', toggle: mediaToggle })
  rows.push({
    key: 'zoom', label: 'Zoom', icon: 'zoom', color: '#6a47c9', kind: 'zoom', hint: 'Click to add a zoom',
    toggle: { on: edit.zoom.enabled, set: () => update((e) => (e.zoom.enabled = !e.zoom.enabled)), icon: ['eye', 'eyeOff'], title: 'Turn all zooms on or off' }
  })
  const textToggle = { on: edit.tracks.text, set: () => update((e) => (e.tracks.text = !e.tracks.text)), icon: ['eye', 'eyeOff'] as [string, string], title: 'Show or hide all text' }
  pushLanes('text', laneCount(edit.texts, spareOn === 'text'), { label: 'Text', icon: 'text', color: '#11806a', kind: 'text', hint: 'Click to add text', toggle: textToggle })
  if (media.mic)
    rows.push({ key: 'mic', label: 'Microphone', icon: 'mic', color: '#2f9e5b', toggle: { on: !edit.audio.micMuted, set: () => update((e) => (e.audio.micMuted = !e.audio.micMuted)), icon: ['volume', 'mute'], title: 'Mute microphone' } })
  if (media.system)
    rows.push({ key: 'system', label: 'System audio', icon: 'audio', color: '#9e7a2f', toggle: { on: !edit.audio.systemMuted, set: () => update((e) => (e.audio.systemMuted = !e.audio.systemMuted)), icon: ['volume', 'mute'], title: 'Mute system audio' } })
  const audioToggle = { on: edit.tracks.audio, set: () => update((e) => (e.tracks.audio = !e.tracks.audio)), icon: ['volume', 'mute'] as [string, string], title: 'Mute or unmute all added audio' }
  pushLanes('audio', laneCount(edit.audioClips, spareOn === 'audio'), { label: 'Audio', icon: 'music', color: '#a2427a', kind: 'audioClip', hint: 'Drop music or sound here', toggle: audioToggle })
  const top = (key: string) => RULER_H + Math.max(0, rows.findIndex((r) => r.key === key)) * TRACK_H
  const laneTop = (base: string, lane = 0) => top(laneKey(base, lane))

  const onRowPointerDown = (e: React.PointerEvent, row: Row) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    const t = timeAt(e.clientX)
    if (row.key === 'zoom') addZoomAt(t)
    else if (row.kind === 'text') addTextAt(t, laneOf(row.key))
    else {
      select(null)
      scrub(e.clientX)
    }
  }

  const step = niceStep(90 / pps)
  const ticks: number[] = []
  for (let u = 0; u <= duration + lead + tail / pps + 1e-6; u += step) ticks.push(u - lead)
  const clips = sortedClips(edit.clips)
  const gaps: [number, number][] = []
  let last = 0
  for (const c of clips) {
    if (c.start > last + 0.01) gaps.push([last, c.start])
    last = c.end
  }
  if (last < duration - 0.01) gaps.push([last, duration])
  const contentH = RULER_H + rows.length * TRACK_H + 8

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

  return (
    <div data-tour="timeline" className="surface" style={{ height, flexShrink: 0, borderTop: '1px solid var(--line)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div className="tl-resize" onPointerDown={resize} title="Drag to resize the timeline" />
      <div
        style={{ flex: 1, overflow: 'auto', position: 'relative' }}
        ref={scrollRef}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDropRow(null)
          setJoinHint(null)
        }}
        onDrop={onDrop}
>
        <div style={{ position: 'relative', width: total + HEAD_W + tail, height: contentH }}>
          {/* sticky track headers */}
          <div className="tl-heads" style={{ height: contentH }}>
            <div style={{ height: RULER_H }} />
            {rows.map((r) => (
              <div key={r.key} data-tour={r.label ? 'track-' + r.key : undefined} className={`tl-head ${r.toggle && !r.toggle.on ? 'off' : ''}`} style={{ height: TRACK_H }}>
                <span style={{ color: r.color, display: 'inline-flex', visibility: r.label ? 'visible' : 'hidden' }}><Icon name={r.icon} size={14} /></span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label || <span className="tl-sublabel">{r.sub}</span>}</span>
                {r.toggle && (
                  <button className={`icon-btn tl-eye ${r.toggle.on ? '' : 'off'}`} title={r.toggle.title} aria-pressed={!r.toggle.on} onPointerDown={(e) => e.stopPropagation()} onClick={r.toggle.set}>
                    <Icon name={r.toggle.on ? r.toggle.icon[0] : r.toggle.icon[1]} size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ position: 'absolute', left: HEAD_W, top: 0, width: total + tail, height: contentH }}>
            {/* ruler */}
            <div className="tl-ruler" onPointerDown={(e) => scrub(e.clientX)} style={{ height: RULER_H }}>
              {ticks.map((t) => (
                <div key={t} style={{ position: 'absolute', left: X(t), top: 5, fontSize: 10, color: 'var(--faint)', transform: 'translateX(-50%)', whiteSpace: 'nowrap', opacity: t > duration + 1e-6 ? 0.4 : 1 }}>
                  {fmtRuler(t + lead, step)}
                  <div style={{ width: 1, height: 5, background: 'var(--line-2)', margin: '3px auto 0' }} />
                </div>
              ))}
            </div>

            {/* rows */}
            {rows.map((r, i) => (
              <div
                key={r.key}
                className={`tl-row ${r.kind === 'zoom' || r.kind === 'text' ? 'addable' : ''} ${r.sub ? 'lane' : ''} ${dropRow === r.key ? 'tl-drop' : ''}`}
                style={{ top: RULER_H + i * TRACK_H, height: TRACK_H, width: total + tail }}
                onPointerDown={(e) => onRowPointerDown(e, r)}
                onPointerMove={(e) => (r.key === 'zoom' || r.kind === 'text') && e.target === e.currentTarget ? setGhost({ row: r.key, t: timeAt(e.clientX) }) : ghost && setGhost(null)}
                onPointerLeave={() => setGhost(null)}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    ...(r.key === 'zoom' ? [{ label: 'Add zoom here', onClick: () => addZoomAt(timeAt(e.clientX)) }] : []),
                    ...(r.key === 'text' ? [{ label: 'Add text here', onClick: () => addTextAt(timeAt(e.clientX)) }] : []),
                    ...(r.key === 'video' ? [
                      { label: 'Add a video before this one…', onClick: () => joinVideoAt('start') },
                      { label: 'Add a video after this one…', onClick: () => joinVideoAt('end') },
                      { sep: true }
                    ] : []),
                    ...(r.key === 'overlay' || r.key === 'audio' ? [{ label: 'Open media library', onClick: () => useEditor.getState().setPanel('media') }] : []),
                    ...(r.key === 'clicks' ? [
                      { label: 'Show all click effects', onClick: () => update((ed) => (ed.cursor.hiddenClicks = [])) },
                      { label: 'Hide all click effects', onClick: () => update((ed) => (ed.cursor.hiddenClicks = (cursorData?.clicks ?? []).map((c) => Math.round(c.t * 1000)))) }
                    ] : []),
                    { label: 'Split video at playhead', onClick: () => splitAtPlayhead() }
                  ])
                }
              >
                {r.hint && !(r.kind && listFor(r.kind).length) && r.key !== 'clicks' && <span className="tl-hint">{r.hint}</span>}
              </div>
            ))}

            {/* where a dragged video will be joined */}
            {joinHint && (
              <div className="tl-join" style={{ left: joinHint === 'start' ? X(0) : X(duration) - 4, top: top('video') + 2, height: TRACK_H - 4 }}>
                <span style={{ [joinHint === 'start' ? 'left' : 'right']: 10 } as React.CSSProperties}>{joinHint === 'start' ? 'Join before' : 'Join after'}</span>
              </div>
            )}

            {/* ghost preview for click-to-add */}
            {ghost && (
              <div className="tl-ghost" style={{ left: X(ghost.t), top: top(ghost.row) + 4, width: Math.max(40, (ghost.row === 'zoom' ? 2.5 : 3) * pps), height: TRACK_H - 8 }}>
                + {ghost.row === 'zoom' ? 'Zoom' : 'Text'}
              </div>
            )}

            {/* video clips */}
            <div className="tl-hatch" style={{ left: X(0), width: duration * pps, top: top('video') + 4, height: TRACK_H - 8 }} />
            {lead > 0 && (
              <div className="tl-lead" style={{ left: X(-lead), width: lead * pps, top: top('video') + 4, height: TRACK_H - 8 }} title="Empty space before your recording">
                {lead * pps > 150 ? 'Intro space · add text or media' : ''}
              </div>
            )}
            {edit.clips.map((c) => block('clip', c, top('video'), '#3563d6', <>Clip{c.speed !== 1 ? ` · ${c.speed}x` : ''}</>))}

            {/* start, end and cut transitions, shown as pills on the Transitions track */}
            {(() => {
              const tr = edit.transitions
              const name = (t: Transition) => TRANSITIONS.find((x) => x.v === t.type)?.l ?? ''
              const menu = (cur: Transition, set: (t: Transition | null) => void, canInherit: boolean, own: boolean) =>
                [
                  ...TRANSITIONS.map((x) => ({ label: x.l, checked: cur.type === x.v, onClick: () => set({ type: x.v, duration: cur.duration || 0.6 }) })),
                  { sep: true },
                  ...[0.3, 0.5, 0.8, 1.2].map((d) => ({ label: `${d}s long`, checked: Math.abs(cur.duration - d) < 0.01, disabled: cur.type === 'none', onClick: () => set({ type: cur.type, duration: d }) })),
                  ...(canInherit ? [{ sep: true }, { label: 'Same as every cut', checked: !own, onClick: () => set(null) }] : []),
                  { sep: true },
                  { label: 'Transitions panel…', onClick: () => useEditor.getState().setPanel('effects') }
                ] as MenuItem[]
              const pill = (key: string, at: number, cur: Transition, title: string, onMenu: (e: React.MouseEvent) => void) => {
                const w = Math.max(20, cur.type === 'none' ? 20 : cur.duration * pps)
                const left = Math.max(X(0), X(at) - w / 2)
                return (
                  <button
                    key={key}
                    className={`tl-trans ${cur.type !== 'none' ? 'on' : ''}`}
                    style={{ left, width: w, top: top('transitions') + 7, height: TRACK_H - 14 }}
                    title={title}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onMenu}
                  >
                    {cur.type === 'none' ? <Icon name="plus" size={11} /> : w > 60 ? name(cur) : <Icon name="transition" size={11} />}
                  </button>
                )
              }
              const out = [
                pill('intro', (lead > 0 ? -lead : clips[0].start) + tr.intro.duration / 2, tr.intro, `Start: ${name(tr.intro)}`, (e) => openContextMenu(e, menu(tr.intro, (v) => update((ed) => (ed.transitions.intro = v ?? ed.transitions.intro)), false, true))),
                pill('outro', clips[clips.length - 1].end - tr.outro.duration / 2, tr.outro, `End: ${name(tr.outro)}`, (e) => openContextMenu(e, menu(tr.outro, (v) => update((ed) => (ed.transitions.outro = v ?? ed.transitions.outro)), false, true)))
              ]
              if (lead > 0) {
                const own = tr.perCut['lead']
                const cur = own ?? tr.cut
                out.push(
                  pill('cut-lead', 0, cur, `Into the recording: ${name(cur)}${own ? '' : ' (from Every cut)'}`, (e) =>
                    openContextMenu(e, menu(cur, (v) => update((ed) => { if (v) ed.transitions.perCut['lead'] = v; else delete ed.transitions.perCut['lead'] }), true, !!own))
                  )
                )
              }
              clips.slice(1).forEach((c, i) => {
                const own = tr.perCut[c.id]
                const cur = own ?? tr.cut
                out.push(
                  pill('cut' + c.id, (clips[i].end + c.start) / 2, cur, `Cut: ${name(cur)}${own ? '' : ' (from Every cut)'}`, (e) =>
                    openContextMenu(e, menu(cur, (v) => update((ed) => { if (v) ed.transitions.perCut[c.id] = v; else delete ed.transitions.perCut[c.id] }), true, !!own))
                  )
                )
              })
              return out
            })()}

            {/* transitions placed anywhere */}
            {edit.transitions.items.map((it) => block('transition', it, laneTop('transitions', it.lane), '#e0873a', TRANSITIONS.find((x) => x.v === it.type)?.l ?? 'Transition'))}

            {/* effects on part of the video */}
            {edit.effectClips.map((c) => block('effect', c, laneTop('effects', c.lane), '#22b3c9', c.name))}

            {/* webcam */}
            {media.webcam && (
              <div
                className="tl-block"
                onPointerDown={() => useEditor.getState().setPanel('webcam')}
                style={{ left: X(Math.max(0, media.webcam.offset)), width: Math.max(10, (duration - Math.max(0, media.webcam.offset)) * pps), top: top('webcam') + 4, height: TRACK_H - 8, background: '#c9703a', opacity: edit.webcam.show ? 1 : 0.35, cursor: 'pointer' }}
              >
                <span className="tl-label">Camera</span>
              </div>
            )}

            {/* overlays */}
            {edit.overlays.map((o) => {
              const a = edit.assets.find((x) => x.id === o.assetId)
              return block('overlay', o, laneTop('overlay', o.lane), '#23879b', a?.name ?? 'Media',
                a?.kind === 'image' ? <div className="tl-thumb" style={{ backgroundImage: `url(${mediaUrl(a.path)})` }} /> : undefined)
            })}

            {/* zooms */}
            {edit.zoom.segments.map((z) =>
              block('zoom', z, top('zoom'), z.auto ? '#6247b8' : '#8a5cf0',
                <>{z.auto ? 'Auto' : z.follow ? 'Follow' : 'Pinned'} · {z.scale.toFixed(1)}x</>)
            )}

            {/* text */}
            {edit.texts.map((t) => {
              // in and out animations show as ramps at the ends of the block
              const len = Math.max(0.1, t.end - t.start)
              const k = Math.min(1, len / ((t.inDur ?? 0.35) + (t.outDur ?? 0.35) + 0.001))
              const rin = t.animIn && t.animIn !== 'none' ? (t.inDur ?? 0.35) * k * pps : 0
              const rout = t.animOut && t.animOut !== 'none' ? (t.outDur ?? 0.35) * k * pps : 0
              return block('text', t, laneTop('text', t.lane), '#17a086', <>{t.loop && t.loop !== 'none' ? '∿ ' : ''}{t.text.split('\n')[0] || 'Text'}</>, <>
                {rin > 3 && <i className="tl-ramp in" style={{ width: rin }} />}
                {rout > 3 && <i className="tl-ramp out" style={{ width: rout }} />}
              </>)
            })}

            {/* recorded audio with waveforms */}
            {media.mic && (
              <div className="tl-block" style={{ left: X(Math.max(0, media.mic.offset + edit.audio.syncOffset)), width: total - Math.max(0, media.mic.offset) * pps, top: top('mic') + 4, height: TRACK_H - 8, background: 'rgba(47,158,91,.22)', opacity: edit.audio.micMuted ? 0.35 : 1, overflow: 'hidden' }}>
                <Waveform path={media.mic.path} from={Math.max(0, -media.mic.offset)} to={duration - media.mic.offset} width={total} height={TRACK_H - 8} color="#43c37a" />
              </div>
            )}
            {media.system && (
              <div className="tl-block" style={{ left: X(Math.max(0, media.system.offset + edit.audio.syncOffset)), width: total - Math.max(0, media.system.offset) * pps, top: top('system') + 4, height: TRACK_H - 8, background: 'rgba(158,122,47,.22)', opacity: edit.audio.systemMuted ? 0.35 : 1, overflow: 'hidden' }}>
                <Waveform path={media.system.path} from={Math.max(0, -media.system.offset)} to={duration - media.system.offset} width={total} height={TRACK_H - 8} color="#d3a64a" />
              </div>
            )}

            {/* imported audio */}
            {edit.audioClips.map((c) => {
              const a = edit.assets.find((x) => x.id === c.assetId)
              return block('audioClip', c, laneTop('audio', c.lane), '#a2427a', a?.name ?? 'Audio',
                a ? <div style={{ position: 'absolute', inset: 0, opacity: c.muted ? 0.3 : 0.9 }}><Waveform path={a.path} from={c.trimStart} to={c.trimStart + (c.end - c.start)} width={(c.end - c.start) * pps} height={TRACK_H - 8} color="rgba(255,255,255,.55)" /></div> : undefined)
            })}

            {/* end of the video */}
            <div className="tl-end" style={{ left: X(duration), top: RULER_H, height: rows.length * TRACK_H }} title="End of the video" />

            {/* removed parts of the video, shown across every track */}
            {gaps.map(([a, b], i) => (
              <div key={i} className="tl-cut" style={{ left: X(a), width: (b - a) * pps, top: RULER_H, height: rows.length * TRACK_H }} title="Cut from the final video" />
            ))}

            {/* playhead */}
            <div ref={playheadRef} className="tl-playhead" style={{ height: contentH }}>
              <div className="knob" />
              <div className="line" />
            </div>
          </div>
        </div>
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
