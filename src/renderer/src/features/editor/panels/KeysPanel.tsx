// The Keys page: turn shortcut keycaps on or off, style them, and pick which ones show.
import { useEffect, useRef } from 'react'
import type { KeySettings } from '@shared/types'
import { defaultEdit } from '@shared/defaults'
import { ColorRow, Icon, Section, Seg, Slider, Toggle, fmtTime } from '@/ui'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { drawKeycaps, keyLabels, keyShows } from '../engine/keysOverlay'

const SAMPLES = [['Ctrl', 'C'], ['Ctrl', 'Shift', 'P'], ['Enter'], ['Alt', 'Tab'], ['Ctrl', 'S']]
const POSITIONS: { v: KeySettings['position']; l: string }[] = [
  { v: 'top-left', l: 'Top left' }, { v: 'top', l: 'Top' }, { v: 'top-right', l: 'Top right' },
  { v: 'bottom-left', l: 'Bottom left' }, { v: 'bottom', l: 'Bottom' }, { v: 'bottom-right', l: 'Bottom right' }
]

export default function KeysPanel() {
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const recorded = useEditor((s) => s.cursorData?.keys) ?? []
  const k = project.edit.keys
  const d = defaultEdit(1).keys
  const set = (fn: (x: KeySettings) => void, key?: string) => update((e) => fn(e.keys), key)
  const seek = (t: number) => {
    useEditor.getState().setPlaying(false)
    useEditor.getState().setTime(t)
    timeBus.emit(t)
  }
  const shown = recorded.filter((p) => keyShows(p, k)).length

  return (
    <div>
      <Section title="Keyboard shortcuts" onReset={() => set((x) => Object.assign(x, { ...d, hidden: x.hidden, show: x.show }))}>
        <KeysPreview settings={k} combos={recorded.length ? recorded.slice(0, 6).map((p) => p.keys) : SAMPLES} />
        <Toggle label="Show shortcuts on the video" value={k.show} onChange={(v) => set((x) => (x.show = v))} />
        <span className="hint">
          {recorded.length
            ? `${recorded.length} shortcut${recorded.length === 1 ? '' : 's'} in this recording, ${shown} showing.`
            : 'This recording has no shortcuts. Turn on "Show keyboard shortcuts" on the record screen, then press things like Ctrl+C or Enter while recording. What you type is never saved.'}
        </span>
      </Section>

      <div className={k.show ? '' : 'dim-section'}>
        <Section title="Look">
          <div className="keys-looks">
            {(['dark', 'light', 'accent', 'custom'] as const).map((st) => (
              <button key={st} className={`keys-look ${k.style === st ? 'on' : ''}`} onClick={() => set((x) => (x.style = st))}>
                <span className={`keys-look-cap ${st}`} style={st === 'custom' ? { background: k.color } : undefined}>Ctrl</span>
                <span>{{ dark: 'Dark', light: 'Light', accent: 'Blue', custom: 'Your color' }[st]}</span>
              </button>
            ))}
          </div>
          {k.style === 'custom' && <ColorRow label="Keycap color" value={k.color} onChange={(v) => set((x) => (x.color = v), 'kcolor')} />}
          <Seg options={[{ v: 'words', l: 'Ctrl  Shift  Alt' }, { v: 'symbols', l: '⌃  ⇧  ⌥' }]} value={k.labels} onChange={(v) => set((x) => (x.labels = v as KeySettings['labels']))} />
          <Slider label="Size" value={k.size} min={0.5} max={2.2} step={0.05} def={d.size} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((x) => (x.size = v), 'ksize')} />
          <Slider label="Roundness" value={k.radius} min={0} max={2} step={0.05} def={d.radius} format={(v) => (v < 0.05 ? 'Square' : v > 1.95 ? 'Pill' : `${Math.round(v * 100)}%`)} onChange={(v) => set((x) => (x.radius = v), 'kradius')} />
        </Section>

        <Section title="Position">
          <div className="keys-pos">
            {POSITIONS.map((p) => (
              <button key={p.v} className={`keys-pos-btn ${k.position === p.v ? 'on' : ''}`} title={p.l} onClick={() => set((x) => (x.position = p.v))}>
                <i className={p.v} />
              </button>
            ))}
          </div>
        </Section>

        <Section title="Timing">
          <Seg options={[{ v: 'pop', l: 'Pop' }, { v: 'slide', l: 'Slide' }, { v: 'fade', l: 'Fade' }]} value={k.animation} onChange={(v) => set((x) => (x.animation = v as KeySettings['animation']))} />
          <Slider label="Time on screen" value={k.hold} min={0.5} max={4} step={0.1} def={d.hold} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => set((x) => (x.hold = v), 'khold')} />
          <Toggle label="Also show single keys (Enter, Esc, arrows)" value={k.singles} onChange={(v) => set((x) => (x.singles = v))} />
        </Section>

        {recorded.length > 0 && (
          <Section
            title="In this recording"
            action={
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="link" onClick={() => set((x) => (x.hidden = []))}>Show all</button>
                <button className="link" onClick={() => set((x) => (x.hidden = recorded.map((p) => Math.round(p.t * 1000))))}>Hide all</button>
              </div>
            }
          >
            <div className="key-list">
              {recorded.map((p) => {
                const id = Math.round(p.t * 1000)
                const hidden = k.hidden.includes(id)
                const single = !keyShows(p, { ...k, hidden: [] })
                return (
                  <div key={id} className={`key-row ${hidden || single ? 'off' : ''}`}>
                    <button className="link" onClick={() => seek(Math.max(0, p.t - 0.2))} title="Jump to it">{fmtTime(p.t, true)}</button>
                    <span className="key-caps">{keyLabels(p.keys, k).map((c, i) => <kbd key={i}>{c}</kbd>)}</span>
                    <button className="icon-btn" title={hidden ? 'Show this one' : 'Hide this one'} onClick={() => set((x) => (x.hidden = hidden ? x.hidden.filter((h) => h !== id) : [...x.hidden, id]))}>
                      <Icon name={hidden ? 'eyeOff' : 'eye'} size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
            <span className="hint">Right click a shortcut on the Keys track of the timeline to hide it too.</span>
          </Section>
        )}
      </div>
    </div>
  )
}

/** A live preview of the keycaps with the current settings, cycling through shortcuts. */
function KeysPreview({ settings, combos }: { settings: KeySettings; combos: string[][] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ settings, combos })
  live.current = { settings, combos }
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let raf = 0
    let last = 0
    const t0 = performance.now()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now()
      if (now - last < 33 || document.hidden) return
      last = now
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = Math.round(c.clientWidth * dpr)
      const H = Math.round(c.clientHeight * dpr)
      if (!W || !H) return
      if (c.width !== W || c.height !== H) {
        c.width = W
        c.height = H
      }
      const { settings: s, combos: list } = live.current
      ctx.clearRect(0, 0, W, H)
      const cycle = (s.hold || 1.4) + 0.5
      const t = Math.max(0, (now - t0) / 1000)
      const combo = list[Math.floor(t / cycle) % list.length]
      if (!combo?.length) return
      try {
        // same proportions as a 1080p video
        drawKeycaps(ctx, combo, s, t % cycle, W, H, (H / 1080) * 2.2)
      } catch (e) {
        console.warn('[keys] preview failed', e)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="keys-preview" />
}
