// First run welcome tour. Skippable at any point, and it can be opened again from the ? button
// on the home screen or from Settings.
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '@/ui'
import { useSettings } from '@/lib/settings'

interface Step { title: string; body: string; art: ReactNode; points?: string[] }

/** Little illustrations drawn with plain elements, so they follow the theme and stay crisp. */
const Art = {
  welcome: (
    <div className="ob-art ob-welcome">
      <span className="ob-logo" />
      <span className="ob-ring r1" />
      <span className="ob-ring r2" />
    </div>
  ),
  record: (
    <div className="ob-art ob-screen">
      <div className="ob-window">
        <i /><i /><i />
      </div>
      <span className="ob-outline" />
      <div className="ob-bar"><span className="ob-dot" /> 0:12 <span className="ob-pill" /><span className="ob-stop" /></div>
    </div>
  ),
  auto: (
    <div className="ob-art ob-screen">
      <div className="ob-window zoomy">
        <i /><i /><i />
        <span className="ob-cursor" />
        <span className="ob-ripple" />
      </div>
    </div>
  ),
  timeline: (
    <div className="ob-art ob-timeline">
      {[['#2b4fb8', 0, 100], ['#d9772b', 30, 16], ['#1aa3b8', 45, 40], ['#6a47c9', 10, 50], ['#11806a', 20, 38], ['#11806a', 44, 30], ['#a2427a', 0, 90]].map(([c, l, w], i) => (
        <div key={i} className="ob-track"><span style={{ background: c as string, marginLeft: `${l}%`, width: `${w}%` }} /></div>
      ))}
      <span className="ob-playhead" />
    </div>
  ),
  style: (
    <div className="ob-art ob-style">
      <span className="s1" /><span className="s2" /><span className="s3" /><span className="s4" />
    </div>
  ),
  export: (
    <div className="ob-art ob-export">
      <svg viewBox="0 0 80 80" width="96" height="96">
        <circle cx="40" cy="40" r="30" fill="none" stroke="var(--line-2)" strokeWidth="6" />
        <circle className="ob-progress" cx="40" cy="40" r="30" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <div className="ob-formats"><b>MP4</b><b>WebM</b><b>MOV</b><b>GIF</b></div>
    </div>
  ),
  done: (
    <div className="ob-art ob-welcome">
      <svg viewBox="0 0 52 52" width="92" height="92">
        <circle className="done-circle" cx="26" cy="26" r="24" />
        <path className="done-check" d="M15 27l7 7 15-16" />
      </svg>
    </div>
  )
}

const STEPS: Step[] = [
  { title: 'Welcome to Scrim', body: 'Record your screen and turn it into a polished demo in minutes. Here is a quick look around. It takes about a minute.', art: Art.welcome },
  {
    title: 'Record anything',
    body: 'Pick a screen or a window, choose your mic and webcam, and hit record.',
    art: Art.record,
    points: ['A blue outline shows what is being recorded, then fades', 'Pause with Alt+Shift+P, stop with Alt+Shift+S', 'Clicks on the record bar never end up in your video']
  },
  {
    title: 'It edits itself',
    body: 'Scrim follows your cursor, zooms in where you click and adds a clean background, so the first version already looks good.',
    art: Art.auto,
    points: ['Smooth cursor with click effects', 'Automatic zooms you can move, remove or add', 'Backgrounds, rounded frame and shadow']
  },
  {
    title: 'The timeline',
    body: 'Everything lives on tracks: video, transitions, effects, media, zoom, text and audio.',
    art: Art.timeline,
    points: ['Drag things around, pull their edges to trim', 'Items at the same time get their own layer', 'Split with S, use the arrow keys to move the playhead']
  },
  {
    title: 'Make it yours',
    body: 'Drag in videos, pictures and music, add text, and choose from transitions and effects.',
    art: Art.style,
    points: ['17 transitions and 16 looks, previewed as you hover', 'Blur or pixelate part of the video to hide private info', 'Themes and your own colors in Settings']
  },
  {
    title: 'Export and share',
    body: 'MP4, WebM, MOV or GIF. Scrim only offers settings your recording can really reach, and tells you why when it can not.',
    art: Art.export,
    points: ['You can keep working while it exports', 'A sound and a notification when it is done']
  },
  {
    title: "You're all set",
    body: 'Start a recording or open a video. You can take this tour again any time from the ? button on the home screen.',
    art: Art.done,
    points: ['Ctrl+S save, Ctrl+O open, Ctrl+E export', 'Space to play, F for full screen preview']
  }
]

export default function Onboarding() {
  const [i, setI] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const done = () => {
    setLeaving(true)
    setTimeout(() => useSettings.getState().save({ onboarded: true }), 220)
  }
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') last ? done() : setI((x) => x + 1)
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [last])

  return (
    <div className={`ob-back ${leaving ? 'leaving' : ''}`}>
      <div className="ob-card" role="dialog" aria-label="Welcome tour">
        <button className="ob-skip" onClick={done}>{last ? 'Close' : 'Skip tour'}</button>
        <div className="ob-stage" key={i}>
          {step.art}
        </div>
        <div className="ob-text" key={'t' + i}>
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          {step.points && (
            <ul>
              {step.points.map((p) => (
                <li key={p}><Icon name="arrowRight" size={13} /> {p}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="ob-foot">
          <div className="ob-dots">
            {STEPS.map((_, k) => (
              <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Step ${k + 1}`} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn primary" onClick={() => (last ? done() : setI(i + 1))}>{i === 0 ? 'Show me around' : last ? 'Get started' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
