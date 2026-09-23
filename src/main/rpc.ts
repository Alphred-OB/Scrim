import { ipcMain, WebContents } from 'electron'

// Tiny request/response helper for main -> renderer calls.
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
let seq = 1

ipcMain.on('rpc:reply', (_e, id: number, ok: boolean, payload: unknown) => {
  const p = pending.get(id)
  if (!p) return
  clearTimeout(p.timer)
  pending.delete(id)
  if (ok) p.resolve(payload)
  else p.reject(new Error(String(payload)))
})

export function callRenderer<T>(wc: WebContents, method: string, arg?: unknown, timeoutMs = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = seq++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Renderer call ${method} timed out`))
    }, timeoutMs)
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    wc.send('rpc:call', id, method, arg)
  })
}
