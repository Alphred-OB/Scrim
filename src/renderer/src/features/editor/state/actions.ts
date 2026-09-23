// Editing actions shared by the timeline, panels, context menus and keyboard shortcuts.
import type { Asset, AudioClip, OverlayClip } from '@shared/types'
import { newText, newZoom, uid } from '@shared/defaults'
import { autoZoomFromClicks } from '@shared/autozoom'
import { api } from '@/lib/api'
import { flushSave, useEditor } from './store'
import { timeBus } from './timeBus'

const st = () => useEditor.getState()
const dur = () => st().project?.media.screen.duration ?? 0

export function addZoomAt(t: number, len = 2.5): string | null {
  const p = st().project
  if (!p) return null
  const segs = p.edit.zoom.segments
  let start = Math.max(0, Math.min(dur() - 0.5, t))
  // fit into the free gap around t
  const before = segs.filter((s) => s.end <= start + 1e-3).reduce((m, s) => Math.max(m, s.end), 0)
  const after = segs.filter((s) => s.start >= start - 1e-3).reduce((m, s) => Math.min(m, s.start), dur())
  if (segs.some((s) => start > s.start && start < s.end)) return null
  start = Math.max(start, before)
  const end = Math.min(after, start + len)
  if (end - start < 0.4) return null
  const z = newZoom(start)
  z.end = end
  z.follow = !!st().cursorData
  st().update((e) => e.zoom.segments.push(z))
  st().select({ kind: 'zoom', id: z.id })
  return z.id
}

export function addTextAt(t: number): void {
  const tx = newText(t)
  tx.end = Math.min(dur(), t + 3)
  st().update((e) => e.texts.push(tx))
  st().select({ kind: 'text', id: tx.id })
}

export function regenerateAutoZooms(): void {
  const s = st()
  const data = s.cursorData
  if (!data || !s.project) return
  s.update((e) => {
    const manual = e.zoom.segments.filter((z) => !z.auto)
    const auto = e.zoom.auto ? autoZoomFromClicks(data, dur(), e.zoom.autoScale) : []
    e.zoom.segments = [...manual, ...auto.filter((a) => !manual.some((m) => a.start < m.end && a.end > m.start))]
  })
}

/** First time at or after t where nothing on that track is playing. */
function freeSpot(list: { start: number; end: number }[], t: number): number {
  let at = t
  for (const c of list.slice().sort((a, b) => a.start - b.start)) if (at >= c.start - 0.01 && at < c.end) at = c.end
  return at
}

export function addAssetAt(asset: Asset, t0: number): void {
  const s = st()
  const e0 = s.project!.edit
  // prefer the next free gap on the track; if the track is full, layer it on top at the drop point
  let t = freeSpot(asset.kind === 'audio' ? e0.audioClips : e0.overlays, t0)
  if (t >= dur() - 0.2) t = Math.min(t0, dur() - 0.5)
  if (t < 0) return
  const end = Math.min(dur(), t + (asset.kind === 'image' ? 4 : Math.max(0.5, asset.duration)))
  if (end - t < 0.2) return
  if (asset.kind === 'audio') {
    const c: AudioClip = { id: uid('ac'), assetId: asset.id, start: t, end, trimStart: 0, volume: 0.8, muted: false, fadeIn: 0.3, fadeOut: 0.5 }
    s.update((e) => e.audioClips.push(c))
    s.select({ kind: 'audioClip', id: c.id })
  } else {
    const o: OverlayClip = {
      id: uid('ov'), assetId: asset.id, start: t, end, trimStart: 0, x: 0.78, y: 0.28, w: asset.kind === 'image' ? 0.18 : 0.32, radius: 16, shadow: true,
      opacity: 1, volume: 1, muted: !asset.hasAudio,
      // videos play inside the recording's frame by default, images float on top
      mode: asset.kind === 'video' ? 'frame' : 'pip',
      fit: 'contain'
    }
    s.update((e) => e.overlays.push(o))
    s.select({ kind: 'overlay', id: o.id })
  }
}

export function removeAsset(id: string): void {
  st().update((e) => {
    e.assets = e.assets.filter((a) => a.id !== id)
    e.overlays = e.overlays.filter((o) => o.assetId !== id)
    e.audioClips = e.audioClips.filter((c) => c.assetId !== id)
  })
}

export function splitAtPlayhead(): void {
  const s = st()
  const p = s.project
  if (!p) return
  const t = timeBus.get()
  const sel = s.selection
  // split the selected overlay / audio / text if the playhead is inside it, otherwise the video
  if (sel && sel.kind !== 'clip' && sel.kind !== 'zoom') {
    const list = sel.kind === 'overlay' ? p.edit.overlays : sel.kind === 'audioClip' ? p.edit.audioClips : p.edit.texts
    const it = list.find((x) => x.id === sel.id)
    if (it && t > it.start + 0.1 && t < it.end - 0.1) {
      const nid = uid('s')
      s.update((e) => {
        const arr = (sel.kind === 'overlay' ? e.overlays : sel.kind === 'audioClip' ? e.audioClips : e.texts) as { id: string; start: number; end: number; trimStart?: number }[]
        const src = arr.find((x) => x.id === sel.id)!
        const copy = { ...structuredClone(src), id: nid, start: t }
        if (copy.trimStart !== undefined) copy.trimStart = (src.trimStart ?? 0) + (t - src.start)
        src.end = t
        arr.push(copy)
      })
      return
    }
  }
  const c = p.edit.clips.find((x) => t > x.start + 0.1 && t < x.end - 0.1)
  if (!c) return
  const right = { id: uid('c'), start: t, end: c.end, speed: c.speed }
  s.update((e) => {
    const cc = e.clips.find((x) => x.id === c.id)!
    cc.end = t
    e.clips.push(right)
    e.clips.sort((a, b) => a.start - b.start)
  })
  s.select({ kind: 'clip', id: right.id })
}

export function deleteSelection(): void {
  const s = st()
  const sel = s.selection
  if (!sel || !s.project) return
  s.update((e) => {
    if (sel.kind === 'clip') {
      if (e.clips.length > 1) e.clips = e.clips.filter((c) => c.id !== sel.id)
    } else if (sel.kind === 'zoom') e.zoom.segments = e.zoom.segments.filter((c) => c.id !== sel.id)
    else if (sel.kind === 'text') e.texts = e.texts.filter((c) => c.id !== sel.id)
    else if (sel.kind === 'overlay') e.overlays = e.overlays.filter((c) => c.id !== sel.id)
    else if (sel.kind === 'audioClip') e.audioClips = e.audioClips.filter((c) => c.id !== sel.id)
  })
  s.select(null)
}

export function duplicateSelection(): void {
  const s = st()
  const sel = s.selection
  if (!sel || sel.kind === 'clip' || !s.project) return
  s.update((e) => {
    const arr = (sel.kind === 'zoom' ? e.zoom.segments : sel.kind === 'text' ? e.texts : sel.kind === 'overlay' ? e.overlays : e.audioClips) as { id: string; start: number; end: number }[]
    const it = arr.find((x) => x.id === sel.id)
    if (!it) return
    const len = it.end - it.start
    const copy = { ...structuredClone(it), id: uid('d'), start: it.end, end: Math.min(dur(), it.end + len) }
    if (copy.end - copy.start > 0.2) arr.push(copy)
  })
}

export function toggleClick(t: number): void {
  const key = Math.round(t * 1000)
  st().update((e) => {
    const h = new Set(e.cursor.hiddenClicks)
    if (h.has(key)) h.delete(key)
    else h.add(key)
    e.cursor.hiddenClicks = [...h]
  })
}

/**
 * Joins another video before or after the main video (file dialog when no file is given).
 * The project is rebuilt on disk, so undo history starts fresh afterwards.
 */
export async function joinVideoAt(where: 'start' | 'end', file?: string): Promise<void> {
  const s = st()
  const p = s.project
  if (!p || s.busy) return
  s.setPlaying(false)
  await flushSave()
  const off = api.on('join:progress', (v: number) => st().setBusy(`Joining videos… ${Math.round(v * 100)}%`))
  try {
    s.setBusy('Joining videos…')
    const r = await api.joinVideo(p.dir, where, file)
    if (!r) return
    st().load(r.project, r.cursor)
    st().setTime(where === 'start' ? 0 : p.media.screen.duration)
    st().setBusy('Videos joined')
    setTimeout(() => st().busy === 'Videos joined' && st().setBusy(''), 2000)
  } catch (e) {
    st().setBusy('Could not join: ' + (e instanceof Error ? e.message.split('\n')[0] : String(e)))
    setTimeout(() => st().setBusy(''), 5000)
  } finally {
    off()
    if (st().busy.startsWith('Joining')) st().setBusy('')
  }
}
