import type { EffectLook, Transition, TransitionType } from '@shared/types'
import { defaultEdit } from '@shared/defaults'
import { Section, Select, Slider } from '@/ui'
import { useEditor } from '../state/store'
import { effectFilter } from '../engine/compositor'

export const TRANSITIONS: { v: TransitionType; l: string }[] = [
  { v: 'none', l: 'None' },
  { v: 'fade', l: 'Fade through black' },
  { v: 'fade-white', l: 'Fade through white' },
  { v: 'blur', l: 'Blur' },
  { v: 'zoom', l: 'Zoom' },
  { v: 'whip', l: 'Whip pan' },
  { v: 'flash', l: 'Flash' }
]

const LOOKS: { v: EffectLook; l: string }[] = [
  { v: 'none', l: 'Original' },
  { v: 'vivid', l: 'Vivid' },
  { v: 'punchy', l: 'Punchy' },
  { v: 'warm', l: 'Warm' },
  { v: 'cool', l: 'Cool' },
  { v: 'matte', l: 'Matte' },
  { v: 'vintage', l: 'Vintage' },
  { v: 'sepia', l: 'Sepia' },
  { v: 'mono', l: 'Black & white' },
  { v: 'noir', l: 'Noir' }
]

/** A little sample swatch so each look can be judged at a glance. */
const SAMPLE = 'linear-gradient(135deg, #ff6b6b 0%, #ffd93d 30%, #6bcB77 55%, #4d96ff 80%, #9b5de5 100%)'

function TransitionRow({ label, value, onChange, max = 2 }: { label: string; value: Transition; onChange: (t: Transition) => void; max?: number }) {
  return (
    <>
      <div className="list-row" style={{ borderBottom: 'none', padding: '2px 0' }}>
        <span style={{ flex: 1 }}>{label}</span>
        <Select width={190} value={value.type} options={TRANSITIONS} onChange={(v) => onChange({ ...value, type: v })} />
      </div>
      {value.type !== 'none' && (
        <Slider label="Length" value={value.duration} min={0.2} max={max} step={0.05} def={0.5} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => onChange({ ...value, duration: v })} />
      )}
    </>
  )
}

export default function EffectsPanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const tr = project.edit.transitions
  const fx = project.edit.effects
  const d = defaultEdit(0)
  const cuts = Math.max(0, project.edit.clips.length - 1)
  const custom = Object.keys(tr.perCut).length

  return (
    <div>
      <Section title="Transitions" onReset={() => update((e) => (e.transitions = d.transitions))}>
        <TransitionRow label="Start of video" value={tr.intro} onChange={(v) => update((e) => (e.transitions.intro = v), 'tri')} />
        <TransitionRow label="End of video" value={tr.outro} onChange={(v) => update((e) => (e.transitions.outro = v), 'tro')} />
        <TransitionRow label="Every cut" value={tr.cut} onChange={(v) => update((e) => (e.transitions.cut = v), 'trc')} />
        <span className="hint">
          {cuts === 0
            ? 'Split or join videos to create cuts. Each cut then gets this transition.'
            : `${cuts} cut${cuts > 1 ? 's' : ''} in this video. Click the dot on a cut in the Video track to give it its own transition.`}
          {custom > 0 && ` ${custom} cut${custom > 1 ? 's have' : ' has'} their own.`}
        </span>
        {custom > 0 && (
          <button className="btn sm" onClick={() => update((e) => (e.transitions.perCut = {}))}>
            Use "Every cut" everywhere
          </button>
        )}
      </Section>

      <Section title="Look" onReset={() => update((e) => (e.effects = d.effects))}>
        <div className="look-grid">
          {LOOKS.map((l) => (
            <button key={l.v} className={`pick-tile ${fx.look === l.v ? 'on' : ''}`} onClick={() => update((e) => (e.effects.look = l.v))}>
              <div className="look-swatch" style={{ background: SAMPLE, filter: effectFilter({ ...d.effects, look: l.v }) || undefined }} />
              <span>{l.l}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Adjust">
        <Slider label="Brightness" value={fx.brightness} min={0.5} max={1.5} step={0.01} def={1} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => update((e) => (e.effects.brightness = v), 'fxb')} />
        <Slider label="Contrast" value={fx.contrast} min={0.5} max={1.5} step={0.01} def={1} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => update((e) => (e.effects.contrast = v), 'fxc')} />
        <Slider label="Saturation" value={fx.saturation} min={0} max={2} step={0.01} def={1} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => update((e) => (e.effects.saturation = v), 'fxs')} />
        <Slider label="Vignette" value={fx.vignette} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.effects.vignette = v), 'fxv')} />
        <Slider label="Film grain" value={fx.grain} min={0} max={1} step={0.01} def={0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((e) => (e.effects.grain = v), 'fxg')} />
        <span className="hint">These change your recording (and media playing in it). The background, text and webcam stay as they are.</span>
      </Section>
    </div>
  )
}
