import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/store'
import { timeBus } from '../state/timeBus'
import { ColorRow, Icon, Section, Seg, Slider, Toggle, fmtTime, Select } from '@/ui'
import { FONTS, freeLane, newText, uid } from '@shared/defaults'
import type { TextItem, TextLoop, TextMotion } from '@shared/types'
import { TEXT_LOOPS, TEXT_MOTIONS, drawAnimatedText } from '../engine/textAnim'

/** Ready made looks. Each comes with an animation that suits it. */
const STYLE_PRESETS: { name: string; sample: string; p: Partial<TextItem> }[] = [
  { name: 'Caption', sample: 'Hello there', p: { font: 'Inter', size: 54, bold: true, color: '#ffffff', bg: '#0b0d12', bgOpacity: 0.75, radius: 14, padding: 18, shadow: false, letterSpacing: 0, animIn: 'pop', animOut: 'fade', loop: 'none' } },
  { name: 'Title', sample: 'Big idea', p: { font: 'Poppins', size: 96, bold: true, color: '#ffffff', bg: '', shadow: true, letterSpacing: -1, animIn: 'words', animOut: 'fade', inDur: 0.7, loop: 'none' } },
  { name: 'Label', sample: 'Tip', p: { font: 'Inter', size: 40, bold: true, color: '#0b0c0f', bg: '#ffffff', bgOpacity: 1, radius: 99, padding: 16, shadow: false, letterSpacing: 0, animIn: 'slide-up', animOut: 'slide-down', loop: 'none' } },
  { name: 'Accent', sample: 'Step 1', p: { font: 'Montserrat', size: 60, bold: true, color: '#ffffff', bg: '#2f6bff', bgOpacity: 1, radius: 12, padding: 20, shadow: false, letterSpacing: 0, animIn: 'wipe', animOut: 'wipe', loop: 'none' } },
  { name: 'Poster', sample: 'POSTER', p: { font: 'Bebas Neue', size: 130, bold: false, color: '#ffffff', bg: '', shadow: true, letterSpacing: 2, animIn: 'letters', animOut: 'blur', inDur: 0.8, loop: 'none' } },
  { name: 'Code', sample: 'npm i', p: { font: 'JetBrains Mono', size: 44, bold: false, color: '#a7f3d0', bg: '#0b0c0f', bgOpacity: 0.9, radius: 10, padding: 16, shadow: false, letterSpacing: 0, animIn: 'typewriter', animOut: 'fade', inDur: 0.9, loop: 'none' } },
  { name: 'Callout', sample: 'New!', p: { font: 'Poppins', size: 64, bold: true, color: '#0b0c0f', bg: '#ffd60a', bgOpacity: 1, radius: 16, padding: 18, shadow: false, letterSpacing: 0, animIn: 'drop', animOut: 'pop', loop: 'wiggle' } },
  { name: 'Neon', sample: 'Glow', p: { font: 'Montserrat', size: 80, bold: true, color: '#5ef0ff', bg: '', shadow: false, letterSpacing: 1, animIn: 'blur', animOut: 'fade', loop: 'glow' } },
  { name: 'Lower third', sample: 'Sam Lee', p: { font: 'Inter', size: 46, bold: true, color: '#ffffff', bg: '#ff3b30', bgOpacity: 1, radius: 6, padding: 16, shadow: false, letterSpacing: 0, align: 'left', x: 0.22, y: 0.82, animIn: 'slide-right', animOut: 'slide-left', loop: 'none' } }
]

type Phase = 'in' | 'loop' | 'out'

export default function TextPanel() {
  const project = useEditor((s) => s.project)!
  const selection = useEditor((s) => s.selection)
  const update = useEditor((s) => s.update)
  const select = useEditor((s) => s.select)
  const setTime = useEditor((s) => s.setTime)
  const texts = project.edit.texts
  const duration = project.media.screen.duration
  const lead = project.edit.leadIn ?? 0
  const sel = selection?.kind === 'text' ? texts.find((t) => t.id === selection.id) : undefined
  const [phase, setPhase] = useState<Phase>('in')

  const add = (style?: Partial<TextItem>, sample?: string) => {
    const t = Math.max(-lead, timeBus.get())
    const tx = { ...newText(t), ...(style ?? {}) }
    if (sample && style) tx.text = sample === 'POSTER' ? 'BIG NEWS' : sample === 'npm i' ? 'npm install scrim' : sample === 'Sam Lee' ? 'Sam Lee · Designer' : tx.text
    tx.end = Math.min(duration, t + 3)
    tx.lane = freeLane(project.edit.texts, tx.start, tx.end, 0)
    const busy = project.edit.texts.filter((o) => o.start < tx.end && o.end > tx.start)
    for (let k = 0; k < 6 && busy.some((o) => Math.abs(o.y - tx.y) < 0.09 && Math.abs(o.x - tx.x) < 0.3); k++) tx.y = Math.max(0.08, tx.y - 0.12)
    update((e) => e.texts.push(tx))
    select({ kind: 'text', id: tx.id })
  }
  const set = (fn: (t: TextItem) => void, key?: string) =>
    update((e) => {
      const t = e.texts.find((x) => x.id === sel!.id)
      if (t) fn(t)
    }, key ? key + sel!.id : undefined)

  const current: TextMotion | TextLoop = !sel ? 'none' : phase === 'in' ? sel.animIn : phase === 'out' ? sel.animOut : sel.loop
  const pick = (id: string) =>
    set((t) => {
      if (phase === 'in') t.animIn = id as TextMotion
      else if (phase === 'out') t.animOut = id as TextMotion
      else t.loop = id as TextLoop
    })
  // show the change on the preview right away
  const preview = () => {
    if (!sel) return
    const at = phase === 'out' ? Math.max(sel.start, sel.end - (sel.outDur ?? 0.35) - 0.25) : sel.start
    setTime(at)
    timeBus.emit(at)
    setTimeout(() => useEditor.getState().setPlaying(true), 40)
    const stopAt = phase === 'out' ? sel.end : phase === 'in' ? sel.start + (sel.inDur ?? 0.4) + 0.5 : sel.start + 2.5
    const off = timeBus.on((v) => {
      if (v >= stopAt || v < at - 0.1) {
        off()
        useEditor.getState().setPlaying(false)
      }
    })
  }

  return (
    <div>
      <Section title="Text">
        <button className="btn primary" onClick={() => add()}><Icon name="plus" size={15} /> Add text at playhead</button>
        <span className="hint">{sel ? 'Pick a style to restyle this text.' : 'Or start from a style. It comes with its own animation.'}</span>
        <div className="text-styles">
          {STYLE_PRESETS.map((s) => (
            <button key={s.name} className="text-style" title={sel ? `Restyle as ${s.name}` : `Add a ${s.name}`} onClick={() => (sel ? set((t) => Object.assign(t, s.p)) : add(s.p, s.sample))}>
              <StyleChip p={s.p} sample={s.sample} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
        {texts.length > 0 && (
          <div className="text-list">
            {texts.slice().sort((a, b) => a.start - b.start).map((t) => (
              <button key={t.id} className={sel?.id === t.id ? 'on' : ''} onClick={() => { select({ kind: 'text', id: t.id }); setTime(t.start + 0.4) }}>
                <span className="tl-time">{fmtTime(Math.max(0, t.start + lead))}</span>
                <span className="tl-name">{t.text.split('\n')[0] || 'Empty text'}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {sel && (
        <>
          <Section title="Animation" action={<button className="link" onClick={preview}><Icon name="play" size={11} /> Preview</button>}>
            <Seg
              options={[
                { v: 'in', l: <>In{sel.animIn !== 'none' && <i className="dot-on" />}</> },
                { v: 'loop', l: <>Loop{sel.loop !== 'none' && <i className="dot-on" />}</> },
                { v: 'out', l: <>Out{sel.animOut !== 'none' && <i className="dot-on" />}</> }
              ]}
              value={phase}
              onChange={(v) => setPhase(v as Phase)}
            />
            <div className="motion-grid">
              {(phase === 'loop' ? TEXT_LOOPS : TEXT_MOTIONS).map((m) => (
                <MotionTile key={m.id} id={m.id} name={m.name} phase={phase} on={current === m.id} onPick={() => pick(m.id)} />
              ))}
            </div>
            {phase !== 'loop' && current !== 'none' && (
              <Slider
                label={phase === 'in' ? 'In speed' : 'Out speed'}
                value={phase === 'in' ? sel.inDur ?? 0.4 : sel.outDur ?? 0.35}
                min={0.1}
                max={2}
                step={0.05}
                def={phase === 'in' ? 0.45 : 0.35}
                format={(v) => `${v.toFixed(2)}s`}
                onChange={(v) => set((t) => (phase === 'in' ? (t.inDur = v) : (t.outDur = v)), 'tdur' + phase)}
              />
            )}
            <button
              className="link"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => update((e) => e.texts.forEach((t) => { t.animIn = sel.animIn; t.animOut = sel.animOut; t.inDur = sel.inDur; t.outDur = sel.outDur; t.loop = sel.loop }))}
            >
              Use this animation on all texts
            </button>
          </Section>

          <Section
            title="Edit text"
            action={
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="link" onClick={() => { const c = { ...structuredClone(sel), id: uid('t'), y: Math.max(0.05, sel.y - 0.1) }; update((e) => e.texts.push(c)); select({ kind: 'text', id: c.id }) }}>Duplicate</button>
                <button className="link" style={{ color: 'var(--danger)' }} onClick={() => { update((e) => (e.texts = e.texts.filter((x) => x.id !== sel.id))); select(null) }}>Delete</button>
              </div>
            }
          >
            <textarea className="field-input" value={sel.text} onChange={(e) => set((t) => (t.text = e.target.value), 'txt')} rows={3} />
            <Select value={sel.font} options={FONTS.map((f) => ({ v: f, l: f, style: { fontFamily: `"${f}"`, fontSize: 14 } }))} onChange={(v) => set((t) => (t.font = v))} />
            <div style={{ display: 'flex', gap: 6 }}>
              {([['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline']] as const).map(([k, icon]) => (
                <button key={k} className={`icon-btn ${sel[k] ? 'active' : ''}`} style={{ background: sel[k] ? undefined : 'var(--card)', width: 40, height: 40 }} onClick={() => set((t) => (t[k] = !t[k]))} title={k}>
                  <Icon name={icon} size={17} />
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {([['left', 'alignL'], ['center', 'alignC'], ['right', 'alignR']] as const).map(([k, icon]) => (
                <button key={k} className={`icon-btn ${sel.align === k ? 'active' : ''}`} style={{ background: sel.align === k ? undefined : 'var(--card)', width: 40, height: 40 }} onClick={() => set((t) => (t.align = k))} title={`Align ${k}`}>
                  <Icon name={icon} size={17} />
                </button>
              ))}
            </div>
            <Slider label="Size" value={sel.size} min={16} max={220} step={1} format={(v) => `${Math.round(v)}px`} onChange={(v) => set((t) => (t.size = v), 'tsize')} />
            <Slider label="Letter spacing" value={sel.letterSpacing} min={-5} max={20} step={0.5} def={0} format={(v) => `${v}px`} onChange={(v) => set((t) => (t.letterSpacing = v), 'tls')} />
            <ColorRow label="Text color" value={sel.color} onChange={(v) => set((t) => (t.color = v), 'tcolor')} />
            <Toggle label="Text shadow" value={sel.shadow} onChange={(v) => set((t) => (t.shadow = v))} />
          </Section>

          <Section title="Box">
            <Toggle label="Background box" value={!!sel.bg} onChange={(v) => set((t) => (t.bg = v ? '#0b0d12' : ''))} />
            {sel.bg && (
              <>
                <ColorRow label="Box color" value={sel.bg} onChange={(v) => set((t) => (t.bg = v), 'tbg')} />
                <Slider label="Opacity" value={sel.bgOpacity} min={0.05} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((t) => (t.bgOpacity = v), 'tbgo')} />
                <Slider label="Padding" value={sel.padding} min={0} max={60} step={1} format={(v) => `${v}px`} onChange={(v) => set((t) => (t.padding = v), 'tpad')} />
                <Slider label="Roundness" value={sel.radius} min={0} max={99} step={1} format={(v) => `${v}px`} onChange={(v) => set((t) => (t.radius = v), 'trad')} />
              </>
            )}
            <div className="chip">Shows {fmtTime(Math.max(0, sel.start + lead), true)} to {fmtTime(sel.end + lead, true)}. Drag it on the Text track to change.</div>
          </Section>
        </>
      )}
    </div>
  )
}

const textColor = () => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#ffffff'

/** A tiny rendering of a style preset. */
function StyleChip({ p, sample }: { p: Partial<TextItem>; sample: string }) {
  return (
    <span
      className="text-style-art"
      style={{
        fontFamily: `"${p.font}"`,
        fontWeight: p.bold ? 700 : 400,
        color: p.color,
        background: p.bg || 'transparent',
        borderRadius: Math.min(99, (p.radius ?? 0) / 3),
        padding: p.bg ? '3px 8px' : 0,
        letterSpacing: (p.letterSpacing ?? 0) / 3,
        textShadow: p.loop === 'glow' ? `0 0 8px ${p.color}` : p.shadow ? '0 1px 4px rgba(0,0,0,.5)' : undefined
      }}
    >
      {sample}
    </span>
  )
}

const tickListeners = new Set<(now: number) => void>()
let tickRaf = 0
function subscribeTick(fn: (now: number) => void) {
  tickListeners.add(fn)
  if (tickListeners.size === 1) {
    // the previews run at about 20 fps and rest while the video plays or the window is hidden,
    // so a panel full of moving tiles never slows down playback
    let last = 0
    const loop = (now: number) => {
      if (now - last >= 50 && !document.hidden && !useEditor.getState().playing) {
        last = now
        tickListeners.forEach((cb) => cb(now))
      }
      tickRaf = requestAnimationFrame(loop)
    }
    tickRaf = requestAnimationFrame(loop)
  }
  return () => {
    tickListeners.delete(fn)
    if (tickListeners.size === 0 && tickRaf) {
      cancelAnimationFrame(tickRaf)
      tickRaf = 0
    }
  }
}

/** Animated tile for one in, out or loop animation. Always plays live so users can see each motion clearly. */
function MotionTile({ id, name, phase, on, onPick }: { id: string; name: string; phase: Phase; on: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const W = 96
    const H = 54
    c.width = W * dpr
    c.height = H * dpr
    const ctx = c.getContext('2d')!
    const color = textColor()
    const base: TextItem = {
      ...newText(0), text: 'Hello', x: 0.5, y: 0.5, size: 22, bg: '', shadow: false, bold: true, color,
      animIn: 'none', animOut: 'none', loop: 'none', inDur: 0.6, outDur: 0.6
    }
    const tx: TextItem =
      phase === 'in' ? { ...base, animIn: id as TextMotion, start: 0, end: 1000 }
        : phase === 'out' ? { ...base, animOut: id as TextMotion, start: -1000, end: 0.6 }
          : { ...base, loop: id as TextLoop, start: -10, end: 1000 }
    const t0 = performance.now()
    const onTick = (now: number) => {
      const s = (now - t0) / 1000
      // in: plays in and holds; out: holds, then plays out; loop: runs continuously
      const cycle = 2.0
      const lt = phase === 'loop' ? s : s % cycle
      const t = phase === 'in' ? lt - 0.25 : phase === 'out' ? lt - 1.1 : lt
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      if (id !== 'none' || phase === 'loop') {
        if (t >= tx.start && t <= tx.end) drawAnimatedText(ctx, tx, t, W, H, 1)
      } else drawAnimatedText(ctx, tx, 0, W, H, 1)
    }
    return subscribeTick(onTick)
  }, [id, phase])
  return (
    <button className={`motion-tile ${on ? 'on' : ''}`} onClick={onPick} title={name}>
      <canvas ref={ref} style={{ width: 96, height: 54 }} />
      <span>{name}</span>
    </button>
  )
}
