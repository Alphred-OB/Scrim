import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { Icon } from './Icon'

interface DialogOpts {
  title: string
  body?: string
  ok?: string
  cancel?: string | false
  danger?: boolean
  icon?: 'trash' | 'alert' | 'info'
}

interface DialogState {
  open: DialogOpts | null
  resolve: ((v: boolean) => void) | null
  show(o: DialogOpts): Promise<boolean>
  done(v: boolean): void
}

const useDialog = create<DialogState>((set, get) => ({
  open: null,
  resolve: null,
  show: (o) =>
    new Promise<boolean>((res) => {
      get().resolve?.(false)
      set({ open: o, resolve: res })
    }),
  done: (v) => {
    get().resolve?.(v)
    set({ open: null, resolve: null })
  }
}))

/** Our own confirm box (never the system one). Resolves true when the person agrees. */
export const askConfirm = (o: DialogOpts): Promise<boolean> => useDialog.getState().show(o)

/** Our own message box, with a single button. */
export const showMessage = (title: string, body?: string): Promise<boolean> => useDialog.getState().show({ title, body, ok: 'OK', cancel: false, icon: 'alert' })

export function DialogHost() {
  const { open, done } = useDialog()
  const okRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    okRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        done(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        done(true)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [open, done])
  if (!open) return null
  const kind = open.icon ?? (open.danger ? 'trash' : 'info')
  return (
    <div className="dlg-scrim" onPointerDown={(e) => e.target === e.currentTarget && done(false)}>
      <div className={'dlg' + (open.danger ? ' danger' : '')} role="alertdialog" aria-modal="true" aria-label={open.title}>
        <div className={'dlg-ico ' + kind}>
          <Icon name={kind === 'trash' ? 'trash' : kind === 'alert' ? 'alert' : 'info'} size={20} />
        </div>
        <div className="dlg-title">{open.title}</div>
        {open.body && <div className="dlg-body">{open.body}</div>}
        <div className="dlg-actions">
          {open.cancel !== false && (
            <button className="btn" onClick={() => done(false)}>
              {open.cancel ?? 'Cancel'}
            </button>
          )}
          <button ref={okRef} className={'btn ' + (open.danger ? 'danger' : 'primary')} onClick={() => done(true)}>
            {open.ok ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
