import { useState } from 'react'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { Icon, Section, Slider, Toggle, fmtTime, openContextMenu } from '@/ui'
import { api, mediaUrl } from '@/lib/api'
import { addAssetAt, joinVideoAt, removeAsset } from '../state/actions'
import { dragAsset } from '../state/dragAsset'
import type { Asset } from '@shared/types'

/** Imports files into the project. Pass `at` (seconds) to also place them on the timeline. */
export async function importMedia(dir: string, paths?: string[], at?: number): Promise<string[]> {
  const { assets, errors } = await api.importAssets(dir, paths)
  if (assets.length) {
    useEditor.getState().update((e) => e.assets.push(...assets))
    if (at !== undefined) {
      let t = at
      for (const a of assets) {
        addAssetAt(a, t)
        t = Math.min(useEditor.getState().project!.media.screen.duration - 0.5, t + 0.5)
      }
    }
  }
  return errors
}

type Filter = Asset['kind']
const KINDS: { id: Filter; label: string; icon: string; empty: string }[] = [
  { id: 'video', label: 'Videos', icon: 'film', empty: 'No videos yet. Import one, or drag it in from File Explorer.' },
  { id: 'audio', label: 'Audio', icon: 'music', empty: 'No audio yet. Music and sound effects land here.' },
  { id: 'image', label: 'Pictures', icon: 'image', empty: 'No pictures yet. Logos and screenshots land here.' }
]

function AssetTile({ a }: { a: Asset }) {
  const icon = a.kind === 'audio' ? 'music' : a.kind === 'image' ? 'image' : 'film'
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-scrim-asset', a.id)
        e.dataTransfer.effectAllowed = 'copy'
        dragAsset.set(a)
      }}
      onDragEnd={() => dragAsset.set(null)}
      onDoubleClick={() => addAssetAt(a, timeBus.get())}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: a.kind === 'video' ? 'Add as overlay at playhead' : 'Add at playhead', onClick: () => addAssetAt(a, timeBus.get()) },
          ...(a.kind === 'video'
            ? [
                { label: 'Join before the main video', onClick: () => joinVideoAt('start', a.path) },
                { label: 'Join after the main video', onClick: () => joinVideoAt('end', a.path) }
              ]
            : []),
          { label: 'Show file', onClick: () => api.showItem(a.path) },
          { sep: true },
          { label: 'Remove from project', danger: true, onClick: () => confirm(`Remove "${a.name}" and its clips?`) && removeAsset(a.id) }
        ])
      }
      className="glass"
      style={{ borderRadius: 12, overflow: 'hidden', boxShadow: 'none', cursor: 'grab' }}
      title="Drag onto the timeline, or double click to add at the playhead"
    >
      <div style={{ aspectRatio: '16/10', background: 'var(--stage)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {a.kind === 'image' && <img draggable={false} src={mediaUrl(a.path)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        {a.kind === 'video' && <video draggable={false} src={mediaUrl(a.path) + '#t=0.5'} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        {a.kind === 'audio' && <span style={{ color: '#d36ba7' }}><Icon name="music" size={28} /></span>}
        {a.duration > 0 && <span className="chip" style={{ position: 'absolute', right: 6, bottom: 6, height: 20, background: 'rgba(0,0,0,.6)', color: '#fff' }}>{fmtTime(a.duration)}</span>}
      </div>
      <div style={{ padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 }}>
        <Icon name={icon} size={13} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
      </div>
    </div>
  )
}

export default function MediaPanel() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [filter, setFilter] = useState<Filter>('video')
  const e = project.edit
  const ov = selection?.kind === 'overlay' ? e.overlays.find((o) => o.id === selection.id) : undefined
  const ac = selection?.kind === 'audioClip' ? e.audioClips.find((o) => o.id === selection.id) : undefined
  const asset = e.assets.find((a) => a.id === (ov?.assetId ?? ac?.assetId))

  const doImport = async () => {
    setBusy(true)
    setErrors(await importMedia(project.dir).finally(() => setBusy(false)))
  }

  const setOv = (fn: (o: NonNullable<typeof ov>) => void, key?: string) => update((ed) => { const o = ed.overlays.find((x) => x.id === ov!.id); if (o) fn(o) }, key)
  const setAc = (fn: (o: NonNullable<typeof ac>) => void, key?: string) => update((ed) => { const o = ed.audioClips.find((x) => x.id === ac!.id); if (o) fn(o) }, key)

  return (
    <div>
      <Section title="Media library">
        <button className="btn primary" onClick={doImport} disabled={busy}>{busy ? <span className="spin" /> : <Icon name="upload" size={15} />} Import video, audio or image</button>
        <span className="hint">Drag files in from File Explorer, then drag them onto the timeline. Drop a video on the Video track to join it to your recording.</span>
        {errors.map((er) => <div key={er} className="hint" style={{ color: 'var(--danger)' }}>{er}</div>)}
      </Section>

      <div className="media-tabs" role="tablist">
        {KINDS.map((k) => {
          const n = e.assets.filter((a) => a.kind === k.id).length
          return (
            <button key={k.id} role="tab" aria-selected={filter === k.id} className={filter === k.id ? 'on' : ''} onClick={() => setFilter(k.id)}>
              <Icon name={k.icon} size={14} /> {k.label}
              <span className="count">{n}</span>
            </button>
          )
        })}
      </div>
      {(() => {
        const k = KINDS.find((x) => x.id === filter)!
        const list = e.assets.filter((a) => a.kind === filter)
        if (!list.length) return <div className="media-empty hint">{k.empty}</div>
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            {list.map((a) => <AssetTile key={a.id} a={a} />)}
          </div>
        )
      })()}

      {ov && asset && (
        <Section title="Selected media" action={<button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((ed) => (ed.overlays = ed.overlays.filter((x) => x.id !== ov.id))); select(null) }}>Delete</button>}>
          <div className="chip" style={{ maxWidth: '100%' }}>{asset.name}</div>
          <Toggle label="Full screen (b-roll)" value={ov.fullscreen} onChange={(v) => setOv((o) => (o.fullscreen = v))} />
          {!ov.fullscreen && (
            <>
              <Slider label="Size" value={ov.w} min={0.08} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setOv((o) => (o.w = v), 'ovw')} />
              <Slider label="Corner radius" value={ov.radius} min={0} max={80} step={1} format={(v) => `${v}px`} onChange={(v) => setOv((o) => (o.radius = v), 'ovr')} />
              <Toggle label="Shadow" value={ov.shadow} onChange={(v) => setOv((o) => (o.shadow = v))} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {[['Top left', 0.2, 0.22], ['Top', 0.5, 0.22], ['Top right', 0.8, 0.22], ['Left', 0.2, 0.5], ['Center', 0.5, 0.5], ['Right', 0.8, 0.5], ['Bottom left', 0.2, 0.78], ['Bottom', 0.5, 0.78], ['Bottom right', 0.8, 0.78]].map(([l, x, y]) => (
                  <button key={l as string} className="btn sm" onClick={() => setOv((o) => { o.x = x as number; o.y = y as number })}>{l}</button>
                ))}
              </div>
              <span className="hint">Or drag it on the preview. Drag the white corner to resize.</span>
            </>
          )}
          <Slider label="Opacity" value={ov.opacity} min={0.1} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setOv((o) => (o.opacity = v), 'ovo')} />
          {asset.kind === 'video' && asset.hasAudio && (
            <>
              <Toggle label="Mute this clip" value={ov.muted} onChange={(v) => setOv((o) => (o.muted = v))} />
              {!ov.muted && <Slider label="Volume" value={ov.volume} min={0} max={2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setOv((o) => (o.volume = v), 'ovv')} />}
            </>
          )}
        </Section>
      )}

      {ac && asset && (
        <Section title="Selected audio" action={<button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((ed) => (ed.audioClips = ed.audioClips.filter((x) => x.id !== ac.id))); select(null) }}>Delete</button>}>
          <div className="chip" style={{ maxWidth: '100%' }}>{asset.name}</div>
          <Toggle label="Mute" value={ac.muted} onChange={(v) => setAc((o) => (o.muted = v))} />
          <Slider label="Volume" value={ac.volume} min={0} max={2} step={0.01} def={0.8} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setAc((o) => (o.volume = v), 'acv')} />
          <Slider label="Fade in" value={ac.fadeIn} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => setAc((o) => (o.fadeIn = v), 'acfi')} />
          <Slider label="Fade out" value={ac.fadeOut} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => setAc((o) => (o.fadeOut = v), 'acfo')} />
        </Section>
      )}
    </div>
  )
}
