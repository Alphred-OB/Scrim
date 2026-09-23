import { useEffect, useRef, useState } from 'react'
import type { EffectLook, EffectSettings, Transition, TransitionDir, TransitionEase, TransitionType } from '@shared/types'
import { defaultEdit, defaultEffect } from '@shared/defaults'
import { Icon, Section, Seg, Select, Slider, openContextMenu } from '@/ui'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { dragAsset } from '../state/dragAsset'
import { addEffectAt, addTransitionAt, addTransitionItem } from '../state/actions'
import { effectFilter, paintTransition, type TransitionBuffers } from '../engine/compositor'

export const TRANSITIONS: { v: TransitionType; l: string }[] = [
  { v: 'none', l: 'None' },
  { v: 'fade', l: 'Fade' },
  { v: 'fade-white', l: 'Fade white' },
  { v: 'flash', l: 'Flash' },
  { v: 'morph', l: 'Morph' },
  { v: 'blur', l: 'Blur' },
  { v: 'zoom', l: 'Zoom in' },
  { v: 'zoom-out', l: 'Zoom out' },
  { v: 'spin', l: 'Spin' },
  { v: 'whip', l: 'Whip pan' },
  { v: 'slide-left', l: 'Slide left' },
  { v: 'slide-right', l: 'Slide right' },
  { v: 'slide-up', l: 'Slide up' },
  { v: 'slide-down', l: 'Slide down' },
  { v: 'iris', l: 'Iris' },
  { v: 'wipe', l: 'Wipe' },
  { v: 'pixelate', l: 'Pixelate' },
  { v: 'glitch', l: 'Glitch' }
]

export const LOOKS: { v: EffectLook; l: string }[] = [
  { v: 'none', l: 'Original' },
  { v: 'vivid', l: 'Vivid' },
  { v: 'punchy', l: 'Punchy' },
  { v: 'cinematic', l: 'Cinematic' },
  { v: 'warm', l: 'Warm' },
  { v: 'cool', l: 'Cool' },
  { v: 'cyberpunk', l: 'Cyberpunk' },
  { v: 'dreamy', l: 'Dreamy' },
  { v: 'faded', l: 'Faded' },
  { v: 'matte', l: 'Matte' },
  { v: 'vintage', l: 'Vintage' },
  { v: 'sepia', l: 'Sepia' },
  { v: 'high-key', l: 'Bright' },
  { v: 'low-key', l: 'Moody' },
  { v: 'mono', l: 'Black & white' },
  { v: 'noir', l: 'Noir' },
  { v: 'invert', l: 'Invert' }
]

// ---- small animated preview of a transition: shot A leaves, shot B arrives ----
function paintShot(ctx: CanvasRenderingContext2D, W: number, H: number, b: boolean): void {
  ctx.fillStyle = b ? '#ff8a3d' : '#2f6bff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,255,255,.9)'
  if (b) {
    ctx.beginPath()
    ctx.arc(W * 0.5, H * 0.52, H * 0.22, 0, Math.PI * 2)
    ctx.fill()
  } else ctx.fillRect(W * 0.3, H * 0.3, W * 0.4, H * 0.42)
}

const fxTickListeners = new Set<(now: number) => void>()
let fxTickRaf = 0
function subscribeFxTick(fn: (now: number) => void) {
  fxTickListeners.add(fn)
  if (fxTickListeners.size === 1) {
    // the previews run at about 20 fps and rest while the video plays or the window is hidden,
    // so a panel full of moving tiles never slows down playback
    let last = 0
    const loop = (now: number) => {
      if (now - last >= 50 && !document.hidden && !useEditor.getState().playing) {
        last = now
        fxTickListeners.forEach((cb) => cb(now))
      }
      fxTickRaf = requestAnimationFrame(loop)
    }
    fxTickRaf = requestAnimationFrame(loop)
  }
  return () => {
    fxTickListeners.delete(fn)
    if (fxTickListeners.size === 0 && fxTickRaf) {
      cancelAnimationFrame(fxTickRaf)
      fxTickRaf = 0
    }
  }
}

function TransitionTile({ type, name, on, onPick }: { type: TransitionType; name: string; on: boolean; onPick: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const bufs: TransitionBuffers = { scratch: null, tiny: null }
    const frame = (p: number, time: number) => {
      // p: 0..1 across the whole loop; first half leaves A, second half brings in B
      const outSide = p < 0.5
      paintShot(ctx, c.width, c.height, !outSide)
      const amount = outSide ? p * 2 : (1 - p) * 2
      if (type !== 'none') paintTransition(ctx, c.width, c.height, type, amount, outSide ? 'out' : 'in', 0.35, time, bufs)
    }
    const t0 = performance.now()
    const onTick = (now: number) => {
      const s = (now - t0) / 1000
      const p = (s % 2.2) / 2.2
      // hold each shot for a moment around the transition
      const q = p < 0.2 ? 0 : p > 0.8 ? 1 : (p - 0.2) / 0.6
      frame(q, s)
    }
    return subscribeFxTick(onTick)
  }, [type])
  return (
    <button
      className={`fx-tile ${on ? 'on' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-scrim-fx', type)
        e.dataTransfer.effectAllowed = 'copy'
        dragAsset.setFx({ kind: 'transition', type, name })
      }}
      onDragEnd={() => dragAsset.setFx(null)}
      onClick={onPick}
      title="Click for options, or drag onto the timeline"
    >
      <canvas ref={ref} width={128} height={80} />
      <span>{name}</span>
    </button>
  )
}

const DIRECTIONAL: TransitionType[] = ['fade', 'fade-white', 'wipe', 'whip']
const SPEEDS = [
  { v: 1.2, l: 'Slow' },
  { v: 0.6, l: 'Normal' },
  { v: 0.3, l: 'Fast' }
]

/** Length (speed), feel and direction for any transition. */
function TransitionOptions({ value, onChange }: { value: { type: TransitionType; duration: number; direction?: TransitionDir; ease?: TransitionEase }; onChange: (p: Partial<Transition>) => void }) {
  if (value.type === 'none') return null
  const speed = SPEEDS.find((x) => Math.abs(x.v - value.duration) < 0.01)?.v ?? -1
  return (
    <>
      <Seg options={[...SPEEDS, { v: -1, l: 'Custom' }]} value={speed} onChange={(v) => v > 0 && onChange({ duration: v })} />
      <Slider label="Length" value={value.duration} min={0.2} max={3} step={0.05} def={0.6} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => onChange({ duration: v })} />
      <div className="list-row" style={{ borderBottom: 'none', padding: '2px 0' }}>
        <span style={{ flex: 1 }}>Feel</span>
        <Select
          width={170}
          value={value.ease ?? 'smooth'}
          options={[
            { v: 'smooth', l: 'Smooth' },
            { v: 'snappy', l: 'Snappy' },
            { v: 'gentle', l: 'Gentle' },
            { v: 'linear', l: 'Even' }
          ]}
          onChange={(v) => onChange({ ease: v as TransitionEase })}
        />
      </div>
      {DIRECTIONAL.includes(value.type) && (
        <Seg
          options={[
            ...(value.type === 'fade' || value.type === 'fade-white' ? [{ v: 'none', l: 'All over' }] : []),
            { v: 'left', l: '←' },
            { v: 'right', l: '→' },
            { v: 'up', l: '↑' },
            { v: 'down', l: '↓' }
          ]}
          value={value.direction ?? (value.type === 'fade' || value.type === 'fade-white' ? 'none' : value.type === 'whip' ? 'left' : 'right')}
          onChange={(v) => onChange({ direction: v as TransitionDir })}
        />
      )}
    </>
  )
}

function TransitionRow({ label, value, onChange }: { label: string; value: Transition; onChange: (t: Transition) => void }) {
  return (
    <>
      <div className="list-row" style={{ borderBottom: 'none', padding: '2px 0' }}>
        <span style={{ flex: 1 }}>{label}</span>
        <Select width={170} value={value.type} options={TRANSITIONS} onChange={(v) => onChange({ ...value, type: v })} />
      </div>
      <TransitionOptions value={value} onChange={(p) => onChange({ ...value, ...p })} />
    </>
  )
}

function TransitionsTab() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const tr = project.edit.transitions
  const d = defaultEdit(0)
  const cuts = Math.max(0, project.edit.clips.length - 1)
  const sel = selection?.kind === 'transition' ? tr.items.find((x) => x.id === selection.id) : undefined

  const pick = (e: React.MouseEvent, type: TransitionType, name: string) =>
    openContextMenu(e, [
      { label: 'Put on the nearest cut', onClick: () => addTransitionAt(type, timeBus.get()) },
      { label: 'Add on the Transitions line at the playhead', onClick: () => addTransitionItem(type, timeBus.get()) },
      { label: 'Use at every cut', disabled: cuts === 0, onClick: () => update((ed) => (ed.transitions.cut = { type, duration: ed.transitions.cut.duration || 0.6 })) },
      { label: 'Use at the start', onClick: () => update((ed) => (ed.transitions.intro = { type, duration: ed.transitions.intro.duration || 0.6 })) },
      { label: 'Use at the end', onClick: () => update((ed) => (ed.transitions.outro = { type, duration: ed.transitions.outro.duration || 0.6 })) },
      ...(sel ? [{ sep: true } as const, { label: `Change selected to ${name}`, onClick: () => update((ed) => { const x = ed.transitions.items.find((i) => i.id === sel.id); if (x) x.type = type }) }] : [])
    ])

  return (
    <>
      {sel && (
        <Section title="Selected transition" action={<button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((ed) => (ed.transitions.items = ed.transitions.items.filter((x) => x.id !== sel.id))); select(null) }}>Delete</button>}>
          <Select value={sel.type} options={TRANSITIONS.filter((x) => x.v !== 'none')} onChange={(v) => update((ed) => { const x = ed.transitions.items.find((i) => i.id === sel.id); if (x) x.type = v })} />
          <TransitionOptions
            value={{ type: sel.type, duration: sel.end - sel.start, direction: sel.direction, ease: sel.ease }}
            onChange={(p) =>
              update((ed) => {
                const x = ed.transitions.items.find((i) => i.id === sel.id)
                if (!x) return
                if (p.direction) x.direction = p.direction
                if (p.ease) x.ease = p.ease
                if (p.duration) {
                  const mid = (x.start + x.end) / 2
                  x.start = Math.max(0, mid - p.duration / 2)
                  x.end = mid + p.duration / 2
                }
              }, 'tritem')
            }
          />
          <span className="hint">Drag its edges on the timeline to change the length, or drag it to move it.</span>
        </Section>
      )}
      <Section title="Transitions">
        <span className="hint">Drag one onto a cut, or anywhere on the Transitions track. Hover to preview, click for more options.</span>
        <div className="fx-grid">
          {TRANSITIONS.filter((x) => x.v !== 'none').map((x) => (
            <TransitionTile key={x.v} type={x.v} name={x.l} on={sel?.type === x.v} onPick={(e) => pick(e, x.v, x.l)} />
          ))}
        </div>
      </Section>
      <Section title="Start, end and cuts" onReset={() => update((e) => (e.transitions = { ...d.transitions, items: e.transitions.items }))}>
        <TransitionRow label="Start of video" value={tr.intro} onChange={(v) => update((e) => (e.transitions.intro = v), 'tri')} />
        <TransitionRow label="End of video" value={tr.outro} onChange={(v) => update((e) => (e.transitions.outro = v), 'tro')} />
        <TransitionRow label="Every cut" value={tr.cut} onChange={(v) => update((e) => (e.transitions.cut = v), 'trc')} />
        <span className="hint">
          {cuts === 0 ? 'No cuts yet. Split the video (S) or join another video to make one.' : `${cuts} cut${cuts > 1 ? 's' : ''}. Click a cut's pill on the Transitions track to give it its own.`}
        </span>
      </Section>
    </>
  )
}

/**
 * A still of the current preview frame, used as the swatch for every look. It's kept as a canvas
 * (not an image URL) because frames from local media can't be exported as data.
 */
function usePreviewStill(): { still: HTMLCanvasElement | null; version: number } {
  const [state, setState] = useState<{ still: HTMLCanvasElement | null; version: number }>({ still: null, version: 0 })
  useEffect(() => {
    const grab = () => {
      try {
        const c = document.querySelector('.preview-wrap canvas') as HTMLCanvasElement | null
        if (!c || !c.width) return
        const t = document.createElement('canvas')
        t.width = 160
        t.height = Math.round((160 * c.height) / c.width)
        t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height)
        setState((s) => ({ still: t, version: s.version + 1 }))
      } catch {
        /* keep the previous still */
      }
    }
    grab()
    const id = setInterval(grab, 2000)
    return () => clearInterval(id)
  }, [])
  return state
}

function LookSwatch({ still, version, look }: { still: HTMLCanvasElement | null; version: number; look: EffectLook }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ctx.filter = effectFilter({ ...defaultEffect(), look }) || 'none'
    if (still) ctx.drawImage(still, 0, 0, c.width, c.height)
    else {
      // color bars, so every look has something to change
      ;['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5'].forEach((col, i) => {
        ctx.fillStyle = col
        ctx.fillRect((i * c.width) / 5, 0, c.width / 5 + 1, c.height)
      })
    }
  }, [version, look])
  return <canvas ref={ref} width={128} height={80} />
}

function EffectsTab() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const { still, version } = usePreviewStill()
  const clip = selection?.kind === 'effect' ? project.edit.effectClips.find((c) => c.id === selection.id) : undefined
  const fx: EffectSettings = clip ?? project.edit.effects
  const set = (patch: Partial<EffectSettings>, key?: string) =>
    update((e) => {
      const target = clip ? e.effectClips.find((c) => c.id === clip.id) : e.effects
      if (target) Object.assign(target, patch)
    }, key)

  const pick = (e: React.MouseEvent, look: EffectLook, name: string) =>
    openContextMenu(e, [
      { label: clip ? `Use on the selected part` : 'Use on the whole video', onClick: () => set({ look, ...(clip ? { name } : {}) } as Partial<EffectSettings>) },
      { label: 'Add to part of the video (at playhead)', onClick: () => addEffectAt(look, name, timeBus.get()) },
      ...(clip ? [{ label: 'Use on the whole video', onClick: () => update((ed) => (ed.effects.look = look)) }] : [])
    ])

  return (
    <>
      <Section
        title={clip ? `Effect: ${clip.name}` : 'Whole video'}
        action={
          clip ? (
            <span style={{ display: 'flex', gap: 12 }}>
              <button className="link" onClick={() => select(null)}>Whole video</button>
              <button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((ed) => (ed.effectClips = ed.effectClips.filter((c) => c.id !== clip.id))); select(null) }}>Delete</button>
            </span>
          ) : (
            <button className="link" onClick={() => update((e) => (e.effects = defaultEffect()))}>Reset</button>
          )
        }
      >
        <span className="hint">
          {clip
            ? 'This effect replaces the whole-video effect while it plays. Drag its edges on the Effects track to change when.'
            : 'Changes here apply to the whole recording. Drag a look onto the Effects track to use it on just a part.'}
        </span>
        <div className="fx-grid">
          {LOOKS.map((l) => (
            <button
              key={l.v}
              className={`fx-tile ${fx.look === l.v ? 'on' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-scrim-fx', l.v)
                e.dataTransfer.effectAllowed = 'copy'
                dragAsset.setFx({ kind: 'effect', look: l.v, name: l.l })
              }}
              onDragEnd={() => dragAsset.setFx(null)}
              onClick={(e) => pick(e, l.v, l.l)}
            >
              <LookSwatch still={still} version={version} look={l.v} />
              <span>{l.l}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Adjust">
        <Slider label="Brightness" value={fx.brightness} min={0.5} max={1.5} step={0.01} def={1} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => set({ brightness: v }, 'fxb')} />
        <Slider label="Contrast" value={fx.contrast} min={0.5} max={1.5} step={0.01} def={1} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => set({ contrast: v }, 'fxc')} />
        <Slider label="Saturation" value={fx.saturation} min={0} max={2} step={0.01} def={1} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => set({ saturation: v }, 'fxs')} />
      </Section>

      <Section title="Effects">
        <Slider label="Glow" value={fx.bloom} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ bloom: v }, 'fxbl')} />
        <Slider label="Blur" value={fx.blur} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ blur: v }, 'fxbu')} />
        <Slider label="Pixelate" value={fx.pixelate} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ pixelate: v }, 'fxpx')} />
        <Slider label="Vignette" value={fx.vignette} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ vignette: v }, 'fxv')} />
        <Slider label="Film grain" value={fx.grain} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ grain: v }, 'fxg')} />
        <Slider label="Scan lines" value={fx.scanlines} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ scanlines: v }, 'fxsl')} />
        <span className="hint">Blur and pixelate are handy for hiding private info on part of the video.</span>
      </Section>
    </>
  )
}

export default function EffectsPanel() {
  const selection = useEditor((s) => s.selection)
  const [tab, setTab] = useState<'transitions' | 'effects'>(selection?.kind === 'effect' ? 'effects' : 'transitions')
  // selecting something on the timeline switches to its tab
  useEffect(() => {
    if (selection?.kind === 'effect') setTab('effects')
    if (selection?.kind === 'transition') setTab('transitions')
  }, [selection?.kind, selection?.id])
  return (
    <div>
      <div className="fx-tabs" role="tablist">
        <button className={tab === 'transitions' ? 'on' : ''} onClick={() => setTab('transitions')}><Icon name="transition" size={14} /> Transitions</button>
        <button className={tab === 'effects' ? 'on' : ''} onClick={() => setTab('effects')}><Icon name="fx" size={14} /> Effects</button>
      </div>
      {tab === 'transitions' ? <TransitionsTab /> : <EffectsTab />}
    </div>
  )
}
