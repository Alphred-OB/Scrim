import { useEffect, useRef, useState } from 'react'
import { useProxy, type ProxyInfo } from '@/lib/useProxy'
import { ScrimLogo } from '@/lib/update'
import { useEditor } from './state/store'

/** A load that finishes inside this never shows the page at all (no flash). */
const SHOW_AFTER_MS = 600
/** Fade out time once everything is ready. */
const FADE_MS = 250
const MIN_PROGRESS_FOR_ETA = 0.03

const building = (p: ProxyInfo) => p.status === 'checking' || p.status === 'building'

function timeLeft(seconds: number): string {
  if (seconds < 60) return 'Less than a minute left'
  const min = Math.ceil(seconds / 60)
  return `About ${min} minute${min === 1 ? '' : 's'} left`
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

/**
 * The page shown while a project gets ready to edit: the recording and webcam load their first frame, and a long
 * recording gets its lighter preview copy (see main/proxy.ts). It waits for all of it so the first thing you do
 * isn't a stuttering player, explains what is going on, and lets you start now if you would rather not wait for the copy.
 */
export default function EditorLoading({ dir }: { dir: string }) {
  const stored = useEditor((s) => s.project)
  const project = stored && stored.dir === dir ? stored : null // null while the project is still being opened
  const ready = useEditor((s) => s.previewReady)
  const screenCopy = useProxy(project)
  const camCopy = useProxy(project, 'cam')
  const hasCam = !!project?.media.webcam
  const [skipped, setSkipped] = useState(false)
  const [shown, setShown] = useState(false)
  const [gone, setGone] = useState(false)
  const startedAt = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const copiesNeeded = screenCopy.status === 'building' || camCopy.status === 'building'
  const copiesReady = !building(screenCopy) && !building(camCopy)
  const showCopyStep = copiesNeeded || screenCopy.status === 'ready' || camCopy.status === 'ready'
  const videosReady = !!project && ready.screen && (!hasCam || ready.webcam)
  const allReady = videosReady && copiesReady

  // progress of the copies being made, averaged over the ones in progress
  const parts = [screenCopy, camCopy].filter((p) => p.status === 'building')
  const pct = parts.length ? parts.reduce((a, p) => a + (p.pct ?? 0), 0) / parts.length : 1
  useEffect(() => {
    if (copiesNeeded && startedAt.current === null) startedAt.current = performance.now()
  }, [copiesNeeded])
  const eta = startedAt.current !== null && pct >= MIN_PROGRESS_FOR_ETA && pct < 1 ? ((performance.now() - startedAt.current) / 1000) * ((1 - pct) / pct) : null

  const hidden = skipped || gone
  const allReadyNow = useRef(false)
  allReadyNow.current = allReady
  useEffect(() => {
    // still loading after a moment: explain. Already done by then: never show it at all.
    const id = window.setTimeout(() => (allReadyNow.current ? setGone(true) : setShown(true)), SHOW_AFTER_MS)
    return () => window.clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!allReady || !shown) return
    const id = window.setTimeout(() => setGone(true), FADE_MS)
    return () => window.clearTimeout(id)
  }, [allReady, shown])

  // you can start as soon as the video itself is up; only the lighter copy is still being made
  const canSkip = videosReady && !copiesReady
  useEffect(() => {
    if (!canSkip || hidden) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSkipped(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canSkip, hidden])

  const visible = !hidden && shown
  // tell the editor to put itself out of reach (blurred behind this page), and keep Tab on the page
  useEffect(() => {
    if (!visible) return
    useEditor.getState().setLoadingOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !rootRef.current) return
      const items = [...rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
      e.preventDefault()
      if (items.length) items[0].focus()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      useEditor.getState().setLoadingOpen(false)
    }
  }, [visible])

  if (!visible) return null

  const steps = [
    { id: 'open', label: 'Opening your project', done: !!project },
    { id: 'screen', label: 'Loading your recording', done: ready.screen },
    ...(hasCam ? [{ id: 'cam', label: 'Loading your webcam', done: ready.webcam }] : []),
    ...(showCopyStep ? [{ id: 'copy', label: 'Making playback smooth', done: copiesReady }] : [])
  ]
  const active = steps.find((s) => !s.done)?.id

  return (
    <div className="edload" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="edload-title" data-leaving={allReady ? 'true' : undefined}>
      <div className="edload-card">
        <div className="edload-head">
          <ScrimLogo />
          <div className="edload-text">
            <h1 id="edload-title">{allReady ? 'Ready to edit' : 'Getting your recording ready'}</h1>
            <p>
              {copiesNeeded
                ? 'Long recordings play smoothest from a lighter copy. It is made once, and your original recording is never changed.'
                : allReady
                  ? 'Everything is loaded.'
                  : 'This only takes a few seconds.'}
            </p>
          </div>
        </div>

        <ul className="edload-steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.id} data-state={s.done ? 'done' : s.id === active ? 'active' : 'wait'}>
              <span className="edload-mark">{s.done ? <Check /> : s.id === active ? <span className="spin" /> : <i />}</span>
              <span className="edload-label">{s.label}</span>
              {s.id === 'copy' && !s.done && <span className="edload-detail">{Math.round(pct * 100)}%</span>}
              {s.id === 'copy' && !s.done && (
                <div className="updscr-bar" role="progressbar" aria-label="Making playback smooth" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
                  <i style={{ width: `${Math.round(pct * 100)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>

        {canSkip && (
          <div className="edload-skip">
            <button className="updscr-btn primary" autoFocus onClick={() => setSkipped(true)}>Start editing now</button>
            <p className="updscr-hint">
              {eta !== null ? `${timeLeft(eta)}. ` : ''}Playback may stutter until the smooth copy is ready. You can keep working meanwhile.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
