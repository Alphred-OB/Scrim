import { useEffect, useRef, useState } from 'react'
import { defaultEdit } from '@shared/defaults'
import type { BackgroundType, GradientDef } from '@shared/types'
import { api, mediaUrl } from '@/lib/api'
import { ColorRow, Icon, Section, Seg, Slider } from '@/ui'
import { useEditor } from '../state/store'
import { LIVE, WALLPAPERS, findWallpaper, type WallpaperCategory, drawLive } from '../engine/backgrounds'
import { wallpaperThumb } from '../engine/thumbnails'

type Tab = 'wallpaper' | 'live' | 'media' | 'color'
const TABS: { v: Tab; l: string; icon: string }[] = [
  { v: 'wallpaper', l: 'Wallpapers', icon: 'image' },
  { v: 'live', l: 'Live', icon: 'sparkles' },
  { v: 'media', l: 'Media', icon: 'upload' },
  { v: 'color', l: 'Color', icon: 'droplet' }
]

function getInitialTab(type: BackgroundType): Tab {
  if (type === 'live') return 'live'
  if (type === 'image' || type === 'video') return 'media'
  if (type === 'color' || type === 'gradient') return 'color'
  return 'wallpaper'
}

const WALLPAPER_CATEGORIES: { id: 'all' | WallpaperCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Dark', label: 'Dark' },
  { id: 'Vivid', label: 'Vivid' },
  { id: 'Light', label: 'Light' },
  { id: 'Gradients', label: 'Gradients' }
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
  const d = defaultEdit(0)

  // the open tab is separate from the active background, so you can browse a tab before choosing
  const [tab, setTab] = useState<Tab>(() => getInitialTab(b.type))
  const [wallpaperCat, setWallpaperCat] = useState<'all' | WallpaperCategory>('all')
  const [colorMode, setColorMode] = useState<'solid' | 'gradient'>(b.type === 'gradient' ? 'gradient' : 'solid')
  const choose = (type: BackgroundType) => update((e) => (e.background.type = type))

  const uploadMedia = async () => {
    const file = await api.openFile(
      'Choose a background image or video',
      [
        { name: 'Images & Videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov'] }
      ]
    )
    if (!file) return
    const ext = file.split('.').pop()?.toLowerCase() ?? ''
    const isVideo = ['mp4', 'webm', 'mov'].includes(ext)
    const copied = await api.copyAsset(project.dir, file)
    update((e) => {
      if (isVideo) {
        e.background.type = 'video'
        e.background.videoPath = copied
      } else {
        e.background.type = 'image'
        e.background.imagePath = copied
      }
    })
  }

  return (
    <div>
      <Section title="Background" onReset={() => update((e) => (e.background = d.background))}>
        <div className="bg-tabs">
          {TABS.map((t) => (
            <button
              key={t.v}
              type="button"
              className={`bg-tab-btn tab-chip ${tab === t.v ? 'on' : ''}`}
              onClick={() => setTab(t.v)}
            >
              <Icon name={t.icon} size={13} />
              <span>{t.l}</span>
            </button>
          ))}
        </div>
        {tab === 'wallpaper' && (
          <div className="wallpaper-gallery">
            <div className="wallpaper-cat-bar">
              {WALLPAPER_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`wallpaper-cat-chip ${wallpaperCat === cat.id ? 'on' : ''}`}
                  onClick={() => setWallpaperCat(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="wallpaper-grid">
              {WALLPAPERS.filter((w) => wallpaperCat === 'all' || w.category === wallpaperCat).map((w) => {
                const isSelected = b.type === 'wallpaper' && findWallpaper(b.wallpaper)?.id === w.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`wallpaper-card ${isSelected ? 'on' : ''}`}
                    title={w.name}
                    onClick={() =>
                      update((e) => {
                        e.background.type = 'wallpaper'
                        e.background.wallpaper = w.id
                      })
                    }
                  >
                    <div
                      className="wallpaper-card-preview"
                      style={{
                        backgroundImage: `url(${wallpaperThumb(w.id)})`,
                        backgroundColor: w.base
                      }}
                    >
                      {isSelected && (
                        <div className="wallpaper-card-badge">
                          <Icon name="check" size={12} stroke={2.5} />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {tab === 'live' && (
          <>
            {(['2d', '3d'] as const).map((kind) => (
              <div key={kind} style={{ marginBottom: 14 }}>
                <div className="hint" style={{ margin: '4px 0 8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{kind === '2d' ? 'Live 2D Presets' : 'Live 3D Presets'}</span>
                </div>
                <div className="live-grid">
                  {LIVE.filter((l) => l.kind === kind).map((l) => {
                    const isActive = b.type === 'live' && b.live.id === l.id
                    return (
                      <button
                        key={l.id}
                        type="button"
                        className={`live-card pick-tile wide ${isActive ? 'on' : ''}`}
                        onClick={() =>
                          update((e) => {
                            e.background.type = 'live'
                            e.background.live = { id: l.id, speed: e.background.live.speed || 1, colors: [...l.colors] }
                          })
                        }
                      >
                        <div className="live-card-preview">
                          <LiveTile
                            id={l.id}
                            colors={isActive ? b.live.colors : l.colors}
                            active={isActive}
                          />
                          {isActive && (
                            <div className="live-card-badge">
                              <Icon name="check" size={13} variant="Bold" />
                            </div>
                          )}
                        </div>
                        <div className="live-card-info">
                          <span className="live-card-name">{l.name}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {b.type === 'live' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <Slider
                  label="Speed"
                  value={b.live.speed}
                  min={0}
                  max={3}
                  step={0.05}
                  def={1}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) => update((e) => (e.background.live.speed = v), 'lspeed')}
                />
                {(['Background', 'Main color', 'Accent'] as const).map((label, i) => (
                  <ColorRow
                    key={label}
                    label={label}
                    value={b.live.colors[i]}
                    onChange={(v) => update((e) => (e.background.live.colors[i] = v), 'lc' + i)}
                  />
                ))}
                <span className="hint">Live backgrounds move continuously in the preview and during export.</span>
              </div>
            )}
          </>
        )}
        {tab === 'media' && (
          <div className="bg-media-section">
            {b.imagePath && b.videoPath && (
              <div style={{ marginBottom: 6 }}>
                <Seg
                  options={[
                    { v: 'image', l: 'Image' },
                    { v: 'video', l: 'Video' }
                  ]}
                  value={b.type === 'video' ? 'video' : 'image'}
                  onChange={(v) => choose(v as 'image' | 'video')}
                />
              </div>
            )}

            {(b.type === 'video' ? b.videoPath : b.imagePath) ? (
              <div className="bg-media-card">
                <div
                  className="bg-media-preview-wrap"
                  onClick={() => choose(b.type === 'video' ? 'video' : 'image')}
                >
                  {b.type === 'video' && b.videoPath ? (
                    <video
                      src={mediaUrl(b.videoPath)}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="bg-media-preview-video"
                    />
                  ) : (
                    <div
                      className="bg-media-preview-img"
                      style={{ backgroundImage: `url(${mediaUrl(b.imagePath)})` }}
                    />
                  )}
                  <div className="bg-media-badge">
                    <Icon name={b.type === 'video' ? 'film' : 'image'} size={12} />
                    <span>{b.type === 'video' ? 'Looping Video' : 'Custom Image'}</span>
                  </div>
                </div>

                <div className="bg-media-actions">
                  <button className="btn sm" onClick={uploadMedia}>
                    <Icon name="upload" size={14} /> Replace
                  </button>
                  <button
                    className="btn sm"
                    onClick={() =>
                      update((e) => {
                        if (b.type === 'video') {
                          e.background.videoPath = ''
                          if (e.background.imagePath) e.background.type = 'image'
                          else e.background.type = 'wallpaper'
                        } else {
                          e.background.imagePath = ''
                          if (e.background.videoPath) e.background.type = 'video'
                          else e.background.type = 'wallpaper'
                        }
                      })
                    }
                  >
                    <Icon name="trash" size={14} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-media-dropzone" onClick={uploadMedia}>
                <div className="bg-media-dropzone-icon">
                  <Icon name="upload" size={22} />
                </div>
                <div className="bg-media-dropzone-title">Upload Image or Video</div>
                <div className="bg-media-dropzone-sub">
                  Supports PNG, JPG, WebP, MP4, WebM, MOV
                </div>
                <button className="btn sm primary" type="button" style={{ marginTop: 4 }}>
                  Choose file
                </button>
              </div>
            )}

            <span className="hint">
              Upload custom desktop wallpapers, brand patterns, or looping videos that play smoothly behind your recording.
            </span>
          </div>
        )}
        {tab === 'color' && (
          <div className="bg-color-section">
            <div style={{ marginBottom: 12 }}>
              <Seg
                options={[
                  { v: 'solid', l: 'Solid Color' },
                  { v: 'gradient', l: 'Gradient' }
                ]}
                value={colorMode}
                onChange={(v) => {
                  setColorMode(v as 'solid' | 'gradient')
                  update((e) => (e.background.type = v as 'color' | 'gradient'))
                }}
              />
            </div>

            {colorMode === 'solid' ? (
              <>
                <ColorRow
                  label="Color"
                  value={b.color}
                  onChange={(v) =>
                    update((e) => {
                      e.background.color = v
                      e.background.type = 'color'
                    }, 'bgcolor')
                  }
                />
                <div className="swatch-row" style={{ marginTop: 8, marginBottom: 8 }}>
                  {[
                    '#0b0c0f',
                    '#1c1f26',
                    '#ffffff',
                    '#eee7db',
                    '#1e3a8a',
                    '#7c3aed',
                    '#be185d',
                    '#047857',
                    '#f59e0b',
                    '#ef4444'
                  ].map((col) => (
                    <button
                      key={col}
                      type="button"
                      className={`swatch ${b.type === 'color' && b.color === col ? 'on' : ''}`}
                      style={{ background: col, width: 28, height: 28 }}
                      onClick={() =>
                        update((e) => {
                          e.background.color = col
                          e.background.type = 'color'
                        })
                      }
                    />
                  ))}
                </div>
              </>
            ) : (
              <GradientEditor />
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <Slider label="Blur" value={b.blur} min={0} max={40} step={0.1} def={0} format={(v) => `${v.toFixed(1)}px`} onChange={(v) => update((e) => (e.background.blur = v), 'bgblur')} />
          <Slider label="Darken" value={b.dim} min={0} max={0.8} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.background.dim = v), 'bgdim')} />
        </div>
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

type LiveTickListener = (t: number) => void
const liveTickListeners = new Set<LiveTickListener>()
let sharedLiveRaf = 0
let sharedLiveStart = 0
let sharedLiveLast = 0

function registerLiveListener(listener: LiveTickListener): () => void {
  liveTickListeners.add(listener)
  if (sharedLiveRaf === 0) {
    sharedLiveStart = performance.now()
    sharedLiveLast = 0
    const tick = (now: number) => {
      if (liveTickListeners.size === 0) {
        sharedLiveRaf = 0
        return
      }
      // Throttle to ~30 FPS (33ms) so all 12 live canvases combined consume minimal CPU
      if (now - sharedLiveLast >= 33) {
        sharedLiveLast = now
        const elapsed = (now - sharedLiveStart) / 1000
        liveTickListeners.forEach((fn) => fn(elapsed))
      }
      sharedLiveRaf = requestAnimationFrame(tick)
    }
    sharedLiveRaf = requestAnimationFrame(tick)
  }

  return () => {
    liveTickListeners.delete(listener)
    if (liveTickListeners.size === 0 && sharedLiveRaf !== 0) {
      cancelAnimationFrame(sharedLiveRaf)
      sharedLiveRaf = 0
    }
  }
}

/** Live background tile that animates smoothly in real time via a shared RAF loop. */
function LiveTile({ id, colors, active }: { id: string; colors: [string, string, string]; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const paint = (t: number) => {
      drawLive(ctx, c.width, c.height, t, { id, speed: 1, colors })
    }

    // Initial paint at t = 0
    paint(0)

    // Subscribe to the shared 30fps RAF ticker
    const unsubscribe = registerLiveListener((t) => {
      paint(t)
    })

    return () => {
      unsubscribe()
    }
  }, [id, colors[0], colors[1], colors[2], active])

  return (
    <canvas
      ref={ref}
      width={160}
      height={100}
      className="live-tile-canvas"
    />
  )
}

