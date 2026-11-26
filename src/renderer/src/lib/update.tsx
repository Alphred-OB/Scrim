import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { UpdateStatus } from '@shared/types'
import { releaseNoteLines } from '@shared/updateNotes'
import { api } from '@/lib/api'
import { Icon } from '@/ui'
import { flushSave } from '@/features/editor/state/store'

interface UpdStore {
  s: UpdateStatus | null
  /** version the person chose "Later" for: no screen, no card, until the next version or the next launch */
  dismissed: string | null
  /** version whose download screen was closed with "Continue to Scrim" (the ready screen still comes) */
  dlDismissed: string | null
  restarting: boolean
  set(s: UpdateStatus): void
  dismiss(v: string): void
  dismissDownload(v: string): void
  setRestarting(on: boolean): void
}
export const useUpdate = create<UpdStore>((set) => ({
  s: null,
  dismissed: null,
  dlDismissed: null,
  restarting: false,
  set: (s) => set({ s }),
  dismiss: (v) => set({ dismissed: v }),
  dismissDownload: (v) => set({ dlDismissed: v }),
  setRestarting: (restarting) => set({ restarting })
}))
// the self test and manual checks drive the screen through this, the same way the editor exposes __scrim
if (typeof window !== 'undefined') (window as unknown as { __scrimUpdate: typeof useUpdate }).__scrimUpdate = useUpdate

let wired = false
function wire() {
  if (wired) return
  wired = true
  api.updateStatus().then((s) => useUpdate.getState().set(s)).catch(() => {})
  api.on('update:status', (s: UpdateStatus) => useUpdate.getState().set(s))
}

const RESTART_GIVE_UP_MS = 20_000

/** Restart into the new version, saving the open project first. */
export async function restartToUpdate(): Promise<void> {
  const { setRestarting } = useUpdate.getState()
  setRestarting(true)
  // if the app has not closed by itself, stop showing "Restarting" and let the person carry on
  const giveUp = window.setTimeout(() => setRestarting(false), RESTART_GIVE_UP_MS)
  await flushSave().catch(() => {})
  const started = await api.installUpdate().catch(() => false)
  if (!started) {
    window.clearTimeout(giveUp)
    setRestarting(false)
  }
}

type ScreenKind = 'downloading' | 'ready' | 'error' | 'restarting'

/** Which full screen page (if any) the update should show right now. `enabled`: on the launcher, not recording or editing. */
function screenKind(s: UpdateStatus | null, enabled: boolean, dismissed: string | null, dlDismissed: string | null, restarting: boolean): ScreenKind | null {
  if (restarting) return 'restarting' // always: the app is about to close, wherever the person is
  if (!enabled || !s?.version || dismissed === s.version) return null
  if (s.state === 'ready') return 'ready'
  if (dlDismissed === s.version) return null
  if (s.state === 'downloading') return 'downloading'
  if (s.state === 'error') return 'error' // only a download that broke has a version: a failed check clears it
  return null
}

function useScreenKind(enabled: boolean): ScreenKind | null {
  const { s, dismissed, dlDismissed, restarting } = useUpdate()
  return screenKind(s, enabled, dismissed, dlDismissed, restarting)
}

/** Small card in the corner once a new version has downloaded, where the full screen page doesn't apply (the editor). */
export function UpdateBanner({ screenEnabled }: { screenEnabled: boolean }) {
  const { s, dismissed, dismiss } = useUpdate()
  const kind = useScreenKind(screenEnabled)
  const [busy, setBusy] = useState(false)
  useEffect(wire, [])
  if (kind || !s || s.state !== 'ready' || !s.version || dismissed === s.version) return null
  return (
    <div className="upd-card" role="status">
      <div className="upd-ico"><Icon name="update" size={18} /></div>
      <div className="upd-text">
        <b>Scrim {s.version} is ready</b>
        <span>{s.notes ? s.notes.split('\n')[0] : 'Restart to get the newest version. Your work is saved first.'}</span>
      </div>
      <div className="upd-actions">
        <button className="btn" onClick={() => dismiss(s.version!)}>Later</button>
        <button className="btn primary" disabled={busy} onClick={() => { setBusy(true); restartToUpdate().finally(() => setBusy(false)) }}>
          {busy ? 'Restarting…' : 'Restart now'}
        </button>
      </div>
    </div>
  )
}

export function ScrimLogo() {
  return (
    <svg className="updscr-logo" viewBox="0 0 76 76" aria-hidden="true">
      <rect width="76" height="76" rx="22" fill="#ff3b30" />
      <circle cx="38" cy="38" r="19" fill="none" stroke="#fff" strokeWidth="6" />
      <circle cx="38" cy="38" r="7" fill="#fff" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <div className="updscr-warn">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5 21.5 20h-19Z" />
        <path d="M12 10v4.5" />
        <path d="M12 17.2v.1" />
      </svg>
    </div>
  )
}

/** The full screen update page: downloading, ready to restart, restarting, or a download that failed. */
export function UpdateScreen({ enabled }: { enabled: boolean }) {
  const { s, dismiss, dismissDownload } = useUpdate()
  const kind = useScreenKind(enabled)
  const rootRef = useRef<HTMLDivElement>(null)
  const [retrying, setRetrying] = useState(false)
  useEffect(wire, [])
  // the restarting page has nothing to press: take focus anyway, so Tab can't wander into the page behind it
  useEffect(() => {
    if (kind === 'restarting') rootRef.current?.focus()
  }, [kind])

  const version = s?.version ?? ''
  const closable = kind === 'ready' || kind === 'downloading' || kind === 'error'
  // Esc is the quiet way out: "Later" on the ready screen, "Continue" on the others
  const leave = () => (kind === 'ready' ? dismiss(version) : dismissDownload(version))
  useEffect(() => {
    if (!kind) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable) {
        e.preventDefault()
        leave()
      }
      // keep Tab inside the page: everything behind it is covered
      if (e.key === 'Tab' && rootRef.current) {
        const items = [...rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
        if (!items.length) return e.preventDefault() // the restarting page has nothing to press
        const first = items[0]
        const last = items[items.length - 1]
        const at = document.activeElement
        if (!rootRef.current.contains(at)) (e.shiftKey ? last : first).focus()
        else if (e.shiftKey && at === first) last.focus()
        else if (!e.shiftKey && at === last) first.focus()
        else return
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closable, kind, version])

  if (!kind || !s) return null
  const lines = kind === 'downloading' || kind === 'ready' ? releaseNoteLines(s.notes) : []
  const pct = Math.max(0, Math.min(100, Math.round(s.progress ?? 0)))
  const retry = async () => {
    setRetrying(true)
    try {
      useUpdate.getState().set(await api.checkForUpdate())
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="updscr" ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="updscr-title" data-kind={kind}>
      <div className="updscr-col" key={kind}>
        <div className="updscr-head">
          {kind === 'error' ? <WarnIcon /> : <ScrimLogo />}
          <div className="updscr-text">
            <h1 id="updscr-title">
              {kind === 'downloading' ? `Downloading Scrim ${version}` : kind === 'ready' ? `Scrim ${version} is ready` : kind === 'restarting' ? 'Restarting Scrim' : "Couldn't download the update"}
            </h1>
            <p>
              {kind === 'downloading' ? `You're on ${s.current}. Keep using Scrim while this downloads. We'll ask before restarting.`
                : kind === 'ready' ? `You're on ${s.current}. Restart to switch over. Anything you have open is saved first.`
                : kind === 'restarting' ? `Installing ${version}. This takes a few seconds, and Scrim opens again by itself.`
                : `Scrim ${version} didn't finish downloading. Check your internet connection and try again. Scrim ${s.current} keeps working in the meantime.`}
            </p>
          </div>
        </div>

        {kind === 'downloading' && (
          <div className="updscr-prog">
            <div className="updscr-prog-row">
              <span>Downloading in the background</span>
              <b>{pct}%</b>
            </div>
            <div className="updscr-bar" role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {kind === 'restarting' && (
          <div className="updscr-bar" role="progressbar" aria-label="Installing the update">
            <i className="ind" />
          </div>
        )}

        {kind === 'downloading' && <button className="updscr-btn primary" autoFocus onClick={leave}>Continue to Scrim</button>}
        {kind === 'ready' && (
          <div className="updscr-actions">
            <button className="updscr-btn primary" autoFocus onClick={() => restartToUpdate()}>Restart and update</button>
            <button className="updscr-btn" onClick={leave}>Later</button>
          </div>
        )}
        {kind === 'error' && (
          <>
            <div className="updscr-actions">
              <button className="updscr-btn primary" autoFocus disabled={retrying} onClick={retry}>{retrying ? 'Trying…' : 'Try again'}</button>
              <button className="updscr-btn" onClick={leave}>Continue to Scrim</button>
            </div>
            <a className="updscr-link" href="https://github.com/Alphred-OB/Scrim/releases/latest" target="_blank" rel="noreferrer">Download the installer instead</a>
          </>
        )}

        {lines.length > 0 && (
          <section className="updscr-notes">
            <h2>What's new in {version}</h2>
            <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </section>
        )}
        {kind === 'ready' && <p className="updscr-hint">Installing takes a few seconds, and Scrim opens again by itself.</p>}
      </div>
    </div>
  )
}

/** The "Updates" block in Settings. */
export function UpdateSettings() {
  const s = useUpdate((x) => x.s)
  const [checking, setChecking] = useState(false)
  useEffect(wire, [])
  const st = s?.state ?? 'off'
  const line =
    st === 'off' ? 'Updates work in the installed app (not while running from source).'
    : st === 'checking' || checking ? 'Looking for a new version…'
    : st === 'downloading' ? `Downloading ${s?.version ?? 'the new version'} in the background${s?.progress ? ` (${s.progress}%)` : ''}…`
    : st === 'ready' ? `Scrim ${s?.version} is downloaded and ready.`
    : st === 'latest' ? 'You have the newest version.'
    : st === 'error' && s?.version ? `The download of ${s.version} didn't finish. Check now to try again.`
    : st === 'error' ? `Couldn't check just now${s?.error ? `: ${s.error}` : ''}.`
    : 'Scrim checks for new versions quietly in the background.'
  return (
    <div className="section">
      <span className="section-title">Updates</span>
      <div className="upd-row">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>Version {s?.current ?? ''}</div>
          <span className="hint">{line}</span>
        </div>
        {st === 'ready' ? (
          <button className="btn primary" onClick={() => restartToUpdate()}>Restart to update</button>
        ) : (
          <button
            className="btn"
            disabled={st === 'off' || st === 'checking' || st === 'downloading' || checking}
            onClick={async () => {
              setChecking(true)
              try { useUpdate.getState().set(await api.checkForUpdate()) } finally { setChecking(false) }
            }}
          >
            Check now
          </button>
        )}
      </div>
      {st === 'downloading' && <div className="upd-bar"><i style={{ width: `${s?.progress ?? 0}%` }} /></div>}
    </div>
  )
}
