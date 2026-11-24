import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { Icon } from '@/ui'

/**
 * The on screen script. This window is excluded from screen capture (see showPrompter in main/index.ts),
 * so it can sit right over what you're demoing and never ends up in the video.
 */
export default function Prompter() {
  const cfg = useSettings((s) => s.settings.prompter)
  const [running, setRunning] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pos = useRef(0) // px scrolled
  const [speedNow, setSpeedNow] = useState(cfg?.speed ?? 5) // kept here only, so this window never rewrites the saved settings
  const speed = useRef(speedNow)
  speed.current = speedNow
  const autoRef = useRef(true)
  autoRef.current = cfg?.auto !== false
  const text = cfg?.text ?? ''
  const size = cfg?.size ?? 34

  useEffect(() => api.on('settings:changed', () => void useSettings.getState().load()), [])
  useEffect(() => setSpeedNow(cfg?.speed ?? 5), [cfg?.speed]) // a speed picked in the script editor wins

  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  // scroll loop
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      pos.current += ((now - last) / 1000) * speed.current * size * 0.3
      last = now
      const el = box.current
      if (el) {
        const max = el.scrollHeight - el.clientHeight
        if (pos.current >= max) {
          pos.current = max
          setRunning(false)
        }
        el.scrollTop = pos.current
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [running, size])

  const setSpeed = (d: number) => setSpeedNow((v) => Math.max(1, Math.min(10, v + d)))
  const restart = () => {
    pos.current = 0
    if (box.current) box.current.scrollTop = 0
  }

  // scrolls by itself while recording: starts when the recording starts, holds while paused or counting down
  useEffect(() => {
    const on = (st: { state?: string }) => {
      if (st.state === 'recording') setRunning(autoRef.current)
      else if (st.state === 'paused') setRunning(false)
      else if (st.state === 'countdown') {
        setRunning(false)
        restart()
      }
    }
    api.recorderStatus().then(on)
    return api.on('recorder:status', on as (...a: unknown[]) => void)
  }, [])

  // global hotkeys (sent from the main process, since this window never has focus)
  useEffect(
    () =>
      api.on('prompter:cmd', (cmd: unknown) => {
        if (cmd === 'toggle') setRunning((r) => !r)
        else if (cmd === 'faster') setSpeed(1)
        else if (cmd === 'slower') setSpeed(-1)
        else if (cmd === 'restart') restart()
      }),
    []
  )

  // dragging the text with the mouse wheel moves the place too
  const onWheel = (e: React.WheelEvent) => {
    pos.current = Math.max(0, pos.current + e.deltaY)
    if (box.current) box.current.scrollTop = pos.current
  }

  return (
    <div className="prompter" style={{ ['--pa' as string]: cfg?.opacity ?? 0.85 }}>
      <div className="prompter-bar">
        <span className="recbar-grip" title="Drag to move" />
        <button className="recbar-btn" title="Start or stop scrolling (Alt+Shift+Space)" onClick={() => setRunning((r) => !r)}>
          <Icon name={running ? 'pause' : 'play'} size={15} />
        </button>
        <button className="recbar-btn" title="Slower (Alt+Shift+Down)" onClick={() => setSpeed(-1)}>−</button>
        <span className="prompter-speed">{speed.current}</span>
        <button className="recbar-btn" title="Faster (Alt+Shift+Up)" onClick={() => setSpeed(1)}>+</button>
        <button className="recbar-text" title="Back to the top (Alt+Shift+Home)" onClick={restart}>Top</button>
      </div>
      <div className="prompter-text" ref={box} onWheel={onWheel} style={{ fontSize: size }}>
        <div className="prompter-pad" />
        {text.split('\n').map((line, i) =>
          line.startsWith('#') ? (
            <p key={i} className="prompter-h">{line.replace(/^#+\s*/, '')}</p>
          ) : (
            <p key={i}>{line || ' '}</p>
          )
        )}
        <div className="prompter-pad" />
      </div>
      <div className="prompter-line" />
    </div>
  )
}
