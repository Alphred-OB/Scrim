import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { startMedia, stopMedia, cancelMedia } from '@/lib/mediaCapture'
import { useSettings } from '@/lib/settings'
import Launcher from '@/features/launcher/Launcher'
import Toolbar from '@/features/recording/Toolbar'
import Bubble from '@/features/recording/Bubble'
import Editor from '@/features/editor/Editor'
import { ContextMenuHost } from '@/ui'

function useHashRoute(): string {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1) || '/')
    window.addEventListener('hashchange', on)
    const off = api.on('nav', (route: string) => (location.hash = route))
    return () => {
      window.removeEventListener('hashchange', on)
      off()
    }
  }, [])
  return hash
}

let rpcReady = false
function registerRpc(): void {
  if (rpcReady) return
  rpcReady = true
  api.onCall(async (method, arg) => {
    if (method === 'media:start') return startMedia(arg)
    if (method === 'media:stop') return stopMedia(arg.dir)
    if (method === 'media:cancel') return cancelMedia()
    throw new Error('Unknown method ' + method)
  })
}

export default function App() {
  const route = useHashRoute()
  const reduce = useSettings((s) => s.settings.reduceTransparency)
  const theme = useSettings((s) => s.settings.theme)
  useEffect(() => {
    useSettings.getState().load()
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('solid', reduce)
  }, [reduce])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme
      document.documentElement.dataset.theme = t
      if (!location.hash.includes('toolbar') && !location.hash.includes('bubble')) api.setTheme(t).catch(() => {})
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  if (route.startsWith('/toolbar')) return <Toolbar />
  if (route.startsWith('/bubble')) return <Bubble query={route.split('?')[1] ?? ''} />
  registerRpc()
  return (
    <>
      {route.startsWith('/editor') ? (
        <Editor key={route} dir={new URLSearchParams(route.split('?')[1] ?? '').get('dir') ?? ''} />
      ) : (
        <Launcher />
      )}
      <ContextMenuHost />
    </>
  )
}
