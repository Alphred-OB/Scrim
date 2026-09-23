import { useEffect, useRef, useState } from 'react'
import { defaultEdit } from '@shared/defaults'
import type { BackgroundType, GradientDef } from '@shared/types'
import { api, mediaUrl } from '@/lib/api'
import { ColorRow, Icon, Section, Seg, Slider, Toggle } from '@/ui'
import { useEditor } from '../state/store'
import { LIVE, WALLPAPERS, drawLive } from '../engine/backgrounds'
import { wallpaperThumb } from '../engine/thumbnails'

type Tab = 'wallpaper' | 'live' | 'image' | 'video' | 'color' | 'gradient'
const TABS: { v: Tab; l: string }[] = [
  { v: 'wallpaper', l: 'Wallpapers' },
  { v: 'live', l: 'Live' },
  { v: 'image', l: 'Image' },
  { v: 'video', l: 'Video' },
  { v: 'color', l: 'Color' },
  { v: 'gradient', l: 'Gradient' }
]

const GRADIENT_PRESETS: GradientDef[] = [
  { kind: 'linear', angle: 135, stops: [{ pos: 0, color: '#38bdf8' }, { pos: 0.5, color: '#6366f1' }, { pos: 1, color: '#0f172a' }] },
  { kind: 'linear', angle: 120, stops: [{ pos: 0, color: '#ff8a3d' }, { pos: 0.55, color: '#ff4d6d' }, { pos: 1, color: '#7c3aed' }] },
  { kind: 'linear', angle: 160, stops: [{ pos: 0, color: '#34d399' }, { pos: 1, color: '#0f766e' }] },
  { kind: 'linear', angle: 90, stops: [{ pos: 0, color: '#f9a8d4' }, { pos: 1, color: '#a5b4fc' }] },
  { kind: 'radial', angle: 0, stops: [{ pos: 0, color: '#3b3f4a' }, { pos: 1, color: '#0b0c0f' }] },
  { kind: 'linear', angle: 45, stops: [{ pos: 0, color: '#fde68a' }, { pos: 1, color: '#f97316' }] },
  { kind: 'linear', angle: 180, stops: [{ pos: 0, color: '#1e293b' }, { pos: 1, color: '#020617' }] },
  { kind: 'radial', angle: 0, stops: [{ pos: 0, color: '#6d28d9' }, { pos: 1, color: '#0c0a1d' }] }
]

const cssGradient = (g: GradientDef) => {
  const stops = g.stops.slice().sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${Math.round(s.pos * 100)}%`).join(',')
  return g.kind === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle}deg, ${stops})`
}

export default function BackgroundPanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const b = project.edit.background
  const f = project.edit.frame
  const c = project.edit.crop
  const d = defaultEdit(0)

  // the open tab is separate from the active background, so you can browse a tab before choosing
  const [tab, setTab] = useState<Tab>(b.type as Tab)
  const choose = (type: BackgroundType) => update((e) => (e.background.type = type))

  const upload = async (kind: 'image' | 'video') => {
    const file = await api.openFile(
      kind === 'image' ? 'Choose a background image' : 'Choose a background video',
      kind === 'image'
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        : [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov'] }]
    )
    if (!file) return
    const copied = await api.copyAsset(project.dir, file)
    update((e) => {
      e.background.type = kind
      if (kind === 'image') e.background.imagePath = copied
      else e.background.videoPath = copied
    })
  }

  return (
    <div>
      <Section title="Background" onReset={() => update((e) => (e.background = d.background))}>
        <Slider label="Blur" value={b.blur} min={0} max={40} step={0.1} def={0} format={(v) => `${v.toFixed(1)}px`} onChange={(v) => update((e) => (e.background.blur = v), 'bgblur')} />
        <Slider label="Darken" value={b.dim} min={0} max={0.8} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.background.dim = v), 'bgdim')} />
        <div className="tab-chips">
          {TABS.map((t) => (
            <button key={t.v} className={`tab-chip ${tab === t.v ? 'on' : ''}`} onClick={() => setTab(t.v)}>
              {t.l}
              {b.type === t.v && <span className="dot" />}
            </button>
          ))}
        </div>
        {tab === 'wallpaper' && (
          <div className="grid-tiles">
            {WALLPAPERS.map((w) => (
              <div
                key={w.id}
                title={w.name}
                className={`tile ${b.type === 'wallpaper' && b.wallpaper === w.id ? 'on' : ''}`}
                style={{ backgroundImage: `url(${wallpaperThumb(w.id)})` }}
                onClick={() => update((e) => { e.background.type = 'wallpaper'; e.background.wallpaper = w.id })}
              />
            ))}
          </div>
        )}
        {tab === 'live' && (
          <>
            {(['2d', '3d'] as const).map((kind) => (
              <div key={kind}>
                <div className="hint" style={{ margin: '4px 0 6px', fontWeight: 600 }}>{kind === '2d' ? 'Live 2D' : 'Live 3D'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {LIVE.filter((l) => l.kind === kind).map((l) => (
                    <button
                      key={l.id}
                      className={`pick-tile wide ${b.type === 'live' && b.live.id === l.id ? 'on' : ''}`}
                      onClick={() => update((e) => { e.background.type = 'live'; e.background.live = { id: l.id, speed: e.background.live.speed || 1, colors: [...l.colors] } })}
                    >
                      <LiveTile id={l.id} colors={b.type === 'live' && b.live.id === l.id ? b.live.colors : l.colors} active={b.type === 'live' && b.live.id === l.id} />
                      <span>{l.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {b.type === 'live' && (
              <>
                <Slider label="Speed" value={b.live.speed} min={0} max={3} step={0.05} def={1} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update((e) => (e.background.live.speed = v), 'lspeed')} />
                {(['Background', 'Main color', 'Accent'] as const).map((label, i) => (
                  <ColorRow key={label} label={label} value={b.live.colors[i]} onChange={(v) => update((e) => (e.background.live.colors[i] = v), 'lc' + i)} />
                ))}
                <span className="hint">Live backgrounds move in the preview and in your export. Lower the speed for a calmer look.</span>
              </>
            )}
          </>
        )}
        {tab === 'image' && (
          <>
            <button className="btn" onClick={() => upload('image')}><Icon name="upload" size={16} /> {b.imagePath ? 'Replace image' : 'Upload image'}</button>
            {b.imagePath && (
              <div className={`tile wide ${b.type === 'image' ? 'on' : ''}`} style={{ aspectRatio: '16/9', backgroundImage: `url(${mediaUrl(b.imagePath)})` }} onClick={() => choose('image')} />
            )}
            <span className="hint">PNG, JPG or WebP. Big photos look best with a little blur.</span>
          </>
        )}
        {tab === 'video' && (
          <>
            <button className="btn" onClick={() => upload('video')}><Icon name="upload" size={16} /> {b.videoPath ? 'Replace video' : 'Upload video'}</button>
            {b.videoPath && (
              <video
                src={mediaUrl(b.videoPath)}
                autoPlay
                muted
                loop
                playsInline
                onClick={() => choose('video')}
                style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 10, cursor: 'pointer', border: `2px solid ${b.type === 'video' ? 'var(--accent)' : 'var(--line)'}` }}
              />
            )}
            {b.videoPath && (
              <button className={`btn ${b.type === 'video' ? 'primary' : ''}`} onClick={() => choose('video')}>{b.type === 'video' ? 'Using this video' : 'Use this video'}</button>
            )}
            <span className="hint">An mp4 or webm that loops behind your recording. Short, calm loops look best and export faster.</span>
          </>
        )}
        {tab === 'color' && (
          <>
            <ColorRow label="Color" value={b.color} onChange={(v) => update((e) => { e.background.color = v; e.background.type = 'color' }, 'bgcolor')} />
            <div className="grid-tiles">
              {['#0b0c0f', '#1c1f26', '#ffffff', '#eee7db', '#1e3a8a', '#7c3aed', '#be185d', '#047857', '#f59e0b', '#ef4444'].map((col) => (
                <div key={col} className={`tile ${b.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => update((e) => { e.background.color = col; e.background.type = 'color' })} />
              ))}
            </div>
          </>
        )}
        {tab === 'gradient' && <GradientEditor />}
      </Section>

      <Section title="Frame" onReset={() => update((e) => (e.frame = d.frame))}>
        <Slider label="Shadow" value={f.shadow} min={0} max={100} step={1} def={d.frame.shadow} format={(v) => `${Math.round(v)}%`} onChange={(v) => update((e) => (e.frame.shadow = v), 'shadow')} />
        <Slider label="Radius" value={f.radius} min={0} max={12} step={0.1} def={d.frame.radius} format={(v) => `${v.toFixed(1)}%`} onChange={(v) => update((e) => (e.frame.radius = v), 'radius')} />
        <Slider label="Border" value={f.border} min={0} max={12} step={0.5} def={0} format={(v) => `${v}px`} onChange={(v) => update((e) => (e.frame.border = v), 'border')} />
        {f.border > 0 && <ColorRow label="Border color" value={f.borderColor} onChange={(v) => update((e) => (e.frame.borderColor = v), 'bordercolor')} />}
        <Toggle label="Browser bar" value={f.browserBar} onChange={(v) => update((e) => (e.frame.browserBar = v))} />
      </Section>

      <Section title="Padding">
        <Slider label="Padding" value={f.padding} min={0} max={25} step={0.5} def={d.frame.padding} format={(v) => `${v}%`} onChange={(v) => update((e) => (e.frame.padding = v), 'padding')} />
      </Section>

      <Section title="Crop" onReset={() => update((e) => (e.crop = d.crop))}>
        {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
          <Slider
            key={side}
            label={side[0].toUpperCase() + side.slice(1)}
            value={c[side]}
            min={0}
            max={45}
            step={0.5}
            def={0}
            format={(v) => `${v}%`}
            onChange={(v) => update((e) => (e.crop[side] = v), 'crop' + side)}
          />
        ))}
        <span className="hint">Tip: crop off the taskbar or browser tabs for a cleaner look.</span>
      </Section>
    </div>
  )
}

function GradientEditor() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const g = project.edit.background.gradient
  const set = (fn: (g: GradientDef) => void, key?: string) =>
    update((e) => {
      e.background.type = 'gradient'
      fn(e.background.gradient)
    }, key)

  return (
    <>
      <div style={{ height: 56, borderRadius: 12, background: cssGradient(g), border: '1px solid var(--line)' }} />
      <div className="grid-tiles">
        {GRADIENT_PRESETS.map((p, i) => (
          <div key={i} className="tile" style={{ background: cssGradient(p) }} onClick={() => set((gg) => Object.assign(gg, structuredClone(p)))} />
        ))}
      </div>
      <Seg options={[{ v: 'linear', l: 'Linear' }, { v: 'radial', l: 'Radial' }]} value={g.kind} onChange={(v) => set((gg) => (gg.kind = v as 'linear' | 'radial'))} />
      {g.kind === 'linear' && <Slider label="Angle" value={g.angle} min={0} max={360} step={1} format={(v) => `${Math.round(v)}°`} onChange={(v) => set((gg) => (gg.angle = v), 'gangle')} />}
      {g.stops.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <ColorRow label={`Stop ${i + 1}`} value={s.color} onChange={(v) => set((gg) => (gg.stops[i].color = v), 'gstop' + i)} />
          </div>
          <div style={{ width: 120 }}>
            <Slider compact label="" value={s.pos} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((gg) => (gg.stops[i].pos = v), 'gpos' + i)} />
          </div>
          <button className="icon-btn" disabled={g.stops.length <= 2} onClick={() => set((gg) => gg.stops.splice(i, 1))}><Icon name="x" size={14} /></button>
        </div>
      ))}
      {g.stops.length < 6 && (
        <button className="btn sm" onClick={() => set((gg) => gg.stops.push({ pos: 0.5, color: '#ffffff' }))}><Icon name="plus" size={14} /> Add color stop</button>
      )}
    </>
  )
}

/** Live background tile that plays while hovered or selected, and rests on a still frame otherwise. */
function LiveTile({ id, colors, active }: { id: string; colors: [string, string, string]; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState(false)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const t0 = performance.now()
    const paint = (t: number) => drawLive(ctx, c.width, c.height, t, { id, speed: 1, colors })
    if (!hover && !active) {
      paint(2.5)
      return
    }
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      if (now - last > 33) {
        last = now
        paint(2.5 + (now - t0) / 1000)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id, colors.join(), hover, active])
  return (
    <canvas
      ref={ref}
      width={160}
      height={96}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ width: '100%', aspectRatio: '5 / 3', borderRadius: 8, display: 'block' }}
    />
  )
}
