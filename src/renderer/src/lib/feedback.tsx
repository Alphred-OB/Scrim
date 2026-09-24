// "Report a problem", "Suggest a feature", the crash report question and the privacy settings.
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { AppSettings } from '@shared/types'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { Icon, Seg, Toggle, type MenuItem } from '@/ui'

type Kind = 'bug' | 'idea'
interface Prefill { title?: string; message?: string }
interface FeedbackStore {
  open: { kind: Kind; prefill?: Prefill } | null
  show(kind: Kind, prefill?: Prefill): void
  close(): void
}
export const useFeedback = create<FeedbackStore>((set) => ({
  open: null,
  show: (kind, prefill) => set({ open: { kind, prefill } }),
  close: () => set({ open: null })
}))
export const openFeedback = (kind: Kind, prefill?: Prefill) => useFeedback.getState().show(kind, prefill)

/** The items for a help button's menu. */
export function helpMenu(tour?: () => void): MenuItem[] {
  return [
    ...(tour ? [{ label: 'Show me around', icon: <Icon name="help" size={15} />, onClick: tour }] : []),
    { label: 'Report a problem', icon: <Icon name="alert" size={15} />, onClick: () => openFeedback('bug') },
    { label: 'Suggest a feature', icon: <Icon name="sparkles" size={15} />, onClick: () => openFeedback('idea') },
    { sep: true },
    { label: 'Open the log folder', icon: <Icon name="folder" size={15} />, onClick: () => api.openLogFolder() }
  ]
}

// crash report settings are kept next to the others without widening the shared type
type Privacy = { crashReports?: boolean; crashReportsAsked?: boolean }
const privacy = (s: AppSettings) => s as AppSettings & Privacy
const savePrivacy = (p: Privacy) => useSettings.getState().save(p as Partial<AppSettings>)

const EMAIL_KEY = 'scrim.feedback.email'
const TEXT: Record<Kind, { title: string; heading: string; titleHint: string; msgHint: string; ok: string }> = {
  bug: {
    title: 'Report a problem',
    heading: 'What went wrong?',
    titleHint: 'In a few words, e.g. "Export stops at 91%"',
    msgHint: 'What were you doing, and what happened? Steps to make it happen again help the most.',
    ok: "Thanks! We got your report and we'll look into it."
  },
  idea: {
    title: 'Suggest a feature',
    heading: 'What would make Scrim better?',
    titleHint: 'Your idea in a few words',
    msgHint: 'What would you use it for? How do you picture it working?',
    ok: 'Thanks for the idea! Every suggestion gets read.'
  }
}

export function FeedbackHost() {
  const open = useFeedback((s) => s.open)
  const close = useFeedback((s) => s.close)
  const [kind, setKind] = useState<Kind>('bug')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [logs, setLogs] = useState(true)
  const [shot, setShot] = useState(false)
  const [state, setState] = useState<'edit' | 'sending' | 'sent' | 'queued'>('edit')
  const [err, setErr] = useState('')
  const [enabled, setEnabled] = useState(true)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setKind(open.kind)
    setTitle(open.prefill?.title ?? '')
    setMessage(open.prefill?.message ?? '')
    try {
      setEmail(localStorage.getItem(EMAIL_KEY) ?? '')
    } catch {
      setEmail('')
    }
    setLogs(true)
    setShot(false)
    setState('edit')
    setErr('')
    api.feedbackEnabled().then(setEnabled).catch(() => setEnabled(false))
    setTimeout(() => titleRef.current?.focus(), 60)
  }, [open])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && state !== 'sending' && close()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, state, close])

  if (!open) return null
  const t = TEXT[kind]
  const ready = title.trim().length >= 3 && message.trim().length >= 3 && state === 'edit'

  const send = async () => {
    if (!ready) return
    setState('sending')
    setErr('')
    try {
      localStorage.setItem(EMAIL_KEY, email.trim())
    } catch {
      /* fine */
    }
    try {
      const r = await api.sendFeedback({ kind, title: title.trim(), message: message.trim(), email: email.trim() || undefined, logs: kind === 'bug' && logs, screenshot: shot })
      setState(r.queued ? 'queued' : 'sent')
    } catch (e) {
      setErr((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setState('edit')
    }
  }

  return (
    <div className="dlg-scrim" onPointerDown={(e) => e.target === e.currentTarget && state !== 'sending' && close()}>
      <div className="dlg fb" role="dialog" aria-modal="true" aria-label={t.title}>
        {state === 'sent' || state === 'queued' ? (
          <div className="fb-done">
            <div className="dlg-ico info"><Icon name={kind === 'bug' ? 'check' : 'sparkles'} size={22} /></div>
            <div className="dlg-title">{state === 'sent' ? t.ok : "You're offline right now."}</div>
            <div className="dlg-body">{state === 'sent' ? (email ? "If we need more details we'll write to you." : 'You can always send another one from the help menu.') : "It's saved and will be sent automatically the next time Scrim starts with internet."}</div>
            <div className="dlg-actions"><button className="btn primary" onClick={close}>Done</button></div>
          </div>
        ) : (
          <>
            <div className="fb-head">
              <span className="dlg-title">{t.title}</span>
              <button className="icon-btn" title="Close" onClick={close} disabled={state === 'sending'}><Icon name="x" size={16} /></button>
            </div>
            <Seg options={[{ v: 'bug', l: 'Something is broken' }, { v: 'idea', l: 'I have an idea' }]} value={kind} onChange={(v) => setKind(v as Kind)} />
            {!enabled && <div className="fb-warn">Sending isn't set up in this version yet. Your report can't be sent.</div>}
            <label className="fb-field">
              <span>{t.heading}</span>
              <input ref={titleRef} className="field-input" value={title} maxLength={140} placeholder={t.titleHint} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="fb-field">
              <span>Tell us more</span>
              <textarea className="field-input" rows={5} value={message} maxLength={8000} placeholder={t.msgHint} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <label className="fb-field">
              <span>Your email (optional, only to reply to you)</span>
              <input className="field-input" type="email" value={email} maxLength={200} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
            </label>
            {kind === 'bug' && <Toggle label="Attach the app log (your name and folders are removed)" value={logs} onChange={setLogs} />}
            <Toggle label="Attach a picture of the Scrim window" value={shot} onChange={setShot} />
            {err && <div className="fb-warn">{err}</div>}
            <div className="dlg-actions">
              <button className="btn" onClick={close} disabled={state === 'sending'}>Cancel</button>
              <button className="btn primary" disabled={!ready || !enabled} onClick={send}>
                {state === 'sending' ? <><span className="spin" /> Sending…</> : <><Icon name="upload" size={15} /> Send</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Asked once, on the home screen: may Scrim send crash reports? */
export function CrashConsent() {
  const settings = useSettings((s) => s.settings)
  const loaded = useSettings((s) => s.loaded)
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    api.crashEnabled().then(setAvailable).catch(() => setAvailable(false))
  }, [])
  const p = privacy(settings)
  if (!available || !loaded || !settings.onboarded || p.crashReportsAsked) return null
  return (
    <div className="upd-card consent" role="dialog" aria-label="Crash reports">
      <div className="upd-ico"><Icon name="alert" size={18} /></div>
      <div className="upd-text">
        <b>Help make Scrim better</b>
        <span>When something breaks, Scrim can send a crash report so it gets fixed. It never includes your videos, files, name or folders. You can change this any time in Settings.</span>
      </div>
      <div className="upd-actions">
        <button className="btn" onClick={() => savePrivacy({ crashReports: false, crashReportsAsked: true })}>No thanks</button>
        <button className="btn primary" onClick={() => savePrivacy({ crashReports: true, crashReportsAsked: true })}>Send crash reports</button>
      </div>
    </div>
  )
}

/** The privacy block in Settings. */
export function PrivacySettings() {
  const settings = useSettings((s) => s.settings)
  const p = privacy(settings)
  const [available, setAvailable] = useState(false)
  const [tested, setTested] = useState('')
  useEffect(() => {
    api.crashEnabled().then(setAvailable).catch(() => setAvailable(false))
  }, [])
  return (
    <div className="section">
      <span className="section-title">Privacy and help</span>
      <Toggle label="Send crash reports" value={!!p.crashReports} onChange={(v) => savePrivacy({ crashReports: v, crashReportsAsked: true })} />
      <span className="hint">
        {available
          ? 'When something breaks, a report with the error goes to us so it can be fixed. Never your videos, files, name or folders.'
          : "Crash reports aren't set up in this version yet."}
        {available && p.crashReports && (
          <>
            {' '}
            <button className="link" onClick={async () => setTested((await api.crashTest()) ? 'Test report sent.' : "Couldn't send a test report.")}>Send a test report</button> {tested}
          </>
        )}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => openFeedback('bug')}><Icon name="alert" size={15} /> Report a problem</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => openFeedback('idea')}><Icon name="sparkles" size={15} /> Suggest a feature</button>
      </div>
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => api.openLogFolder()}>Open the log folder</button>
    </div>
  )
}
