import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { UpdateStatus } from '@shared/types'
import { api } from '@/lib/api'
import { Icon } from '@/ui'
import { flushSave } from '@/features/editor/state/store'

interface UpdStore { s: UpdateStatus | null; dismissed: string | null; set(s: UpdateStatus): void; dismiss(v: string): void }
export const useUpdate = create<UpdStore>((set) => ({
  s: null,
  dismissed: null,
  set: (s) => set({ s }),
  dismiss: (v) => set({ dismissed: v })
}))

let wired = false
function wire() {
  if (wired) return
  wired = true
  api.updateStatus().then((s) => useUpdate.getState().set(s)).catch(() => {})
  api.on('update:status', (s: UpdateStatus) => useUpdate.getState().set(s))
}

/** Restart into the new version, saving the open project first. */
export async function restartToUpdate(): Promise<void> {
  await flushSave().catch(() => {})
  await api.installUpdate()
}

/** Small card in the corner once a new version has downloaded. One click restarts into it. */
export function UpdateBanner() {
  const { s, dismissed, dismiss } = useUpdate()
  const [busy, setBusy] = useState(false)
  useEffect(wire, [])
  if (!s || s.state !== 'ready' || !s.version || dismissed === s.version) return null
  return (
    <div className="upd-card" role="status">
      <div className="upd-ico"><Icon name="update" size={18} /></div>
      <div className="upd-text">
        <b>Scrim {s.version} is ready</b>
        <span>{s.notes ? s.notes.split('\n')[0] : 'Restart to get the newest version. Your work is saved first.'}</span>
      </div>
      <div className="upd-actions">
        <button className="btn" onClick={() => dismiss(s.version!)}>Later</button>
        <button className="btn primary" disabled={busy} onClick={() => { setBusy(true); restartToUpdate().catch(() => setBusy(false)) }}>
          {busy ? 'Restarting…' : 'Restart now'}
        </button>
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
