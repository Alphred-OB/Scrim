import { defaultEdit } from '@shared/defaults'
import { ColorRow, Icon, Section, Slider, Toggle } from '@/ui'
import { useEditor } from '../state/store'

/** The frame around the recording: inset, padding, shadow, rounded corners, border and browser bar. */
export default function FramePanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const f = project.edit.frame
  const c = project.edit.crop
  const d = defaultEdit(0)

  return (
    <div>
      <Section title="Frame" onReset={() => update((e) => (e.frame = d.frame))}>
        <div className="frame-presets-row">
          <span className="frame-presets-lbl">Canvas Inset</span>
          <div className="frame-preset-chips">
            {[
              { l: 'Flush', v: 0 },
              { l: 'Default', v: d.frame.padding },
              { l: 'Spacious', v: 14 }
            ].map((p) => (
              <button
                key={p.l}
                type="button"
                className={`frame-preset-chip ${Math.abs(f.padding - p.v) < 0.5 ? 'on' : ''}`}
                onClick={() => update((e) => (e.frame.padding = p.v), 'padding')}
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Padding"
          value={f.padding}
          min={0}
          max={25}
          step={0.5}
          def={d.frame.padding}
          format={(v) => `${v}%`}
          onChange={(v) => update((e) => (e.frame.padding = v), 'padding')}
        />
        <Slider
          label="Shadow"
          value={f.shadow}
          min={0}
          max={100}
          step={1}
          def={d.frame.shadow}
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => update((e) => (e.frame.shadow = v), 'shadow')}
        />
        <Slider
          label="Radius"
          value={f.radius}
          min={0}
          max={12}
          step={0.1}
          def={d.frame.radius}
          format={(v) => `${v.toFixed(1)}%`}
          onChange={(v) => update((e) => (e.frame.radius = v), 'radius')}
        />
        <Slider
          label="Border"
          value={f.border}
          min={0}
          max={12}
          step={0.5}
          def={0}
          format={(v) => `${v}px`}
          onChange={(v) => update((e) => (e.frame.border = v), 'border')}
        />
        {f.border > 0 && (
          <ColorRow
            label="Border color"
            value={f.borderColor}
            onChange={(v) => update((e) => (e.frame.borderColor = v), 'bordercolor')}
          />
        )}
        <Toggle
          label="Browser bar"
          value={f.browserBar}
          onChange={(v) => update((e) => (e.frame.browserBar = v))}
        />
      </Section>

      <Section title="Crop" onReset={() => update((e) => (e.crop = d.crop))}>
        <div className="crop-presets-bar">
          <button
            type="button"
            className={`crop-chip ${c.top === 0 && c.bottom === 0 && c.left === 0 && c.right === 0 ? 'on' : ''}`}
            onClick={() => update((e) => (e.crop = { top: 0, bottom: 0, left: 0, right: 0 }), 'cropreset')}
          >
            None (0%)
          </button>
          <button
            type="button"
            className={`crop-chip ${c.bottom === 4.5 && c.top === 0 ? 'on' : ''}`}
            onClick={() => update((e) => (e.crop = { ...e.crop, bottom: 4.5 }), 'croptaskbar')}
          >
            Taskbar (4.5%)
          </button>
          <button
            type="button"
            className={`crop-chip ${c.top === 4 && c.bottom === 0 ? 'on' : ''}`}
            onClick={() => update((e) => (e.crop = { ...e.crop, top: 4 }), 'croptabs')}
          >
            Browser Tabs (4%)
          </button>
          <button
            type="button"
            className={`crop-chip ${c.top === 4 && c.bottom === 4.5 ? 'on' : ''}`}
            onClick={() => update((e) => (e.crop = { ...e.crop, top: 4, bottom: 4.5 }), 'cropboth')}
          >
            Both
          </button>
        </div>

        <div className="crop-grid">
          <Slider
            compact
            label="↑ Top"
            value={c.top}
            min={0}
            max={45}
            step={0.5}
            def={0}
            format={(v) => `${v}%`}
            onChange={(v) => update((e) => (e.crop.top = v), 'croptop')}
          />
          <Slider
            compact
            label="↓ Bottom"
            value={c.bottom}
            min={0}
            max={45}
            step={0.5}
            def={0}
            format={(v) => `${v}%`}
            onChange={(v) => update((e) => (e.crop.bottom = v), 'cropbottom')}
          />
          <Slider
            compact
            label="← Left"
            value={c.left}
            min={0}
            max={45}
            step={0.5}
            def={0}
            format={(v) => `${v}%`}
            onChange={(v) => update((e) => (e.crop.left = v), 'cropleft')}
          />
          <Slider
            compact
            label="→ Right"
            value={c.right}
            min={0}
            max={45}
            step={0.5}
            def={0}
            format={(v) => `${v}%`}
            onChange={(v) => update((e) => (e.crop.right = v), 'cropright')}
          />
        </div>
        <div className="crop-hint">
          <Icon name="crop" size={13} />
          <span>Crop off the taskbar or browser tabs for a cleaner look.</span>
        </div>
      </Section>
    </div>
  )
}
