import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { startMedia, stopMedia, cancelMedia, pauseMedia, resumeMedia } from '@/lib/mediaCapture'
import { useSettings } from '@/lib/settings'
import { applyTheme } from '@/lib/theme'
import Launcher from '@/features/launcher/Launcher'
import Toolbar from '@/features/recording/Toolbar'
import Prompter from '@/features/recording/Prompter'
import Bubble from '@/features/recording/Bubble'
import RecordBorder from '@/features/recording/RecordBorder'
import Editor from '@/features/editor/Editor'
import { ContextMenuHost, DialogHost } from '@/ui'
import { UpdateBanner, UpdateScreen } from '@/lib/update'
import { CaptionJobPill } from '@/lib/captionJob'
import { CrashConsent, FeedbackHost } from '@/lib/feedback'
import Onboarding from '@/features/onboarding/Onboarding'
import { PracticeLoader } from '@/features/onboarding/practice'
import CoachMarks from '@/features/onboarding/CoachMarks'

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
    if (method === 'media:pause') return pauseMedia()
    if (method === 'media:resume') return resumeMedia()
    throw new Error('Unknown method ' + method)
  })
}

export default function App() {
  const route = useHashRoute()
  const reduce = useSettings((s) => s.settings.reduceTransparency)
  const settings = useSettings((s) => s.settings)
  const settingsLoaded = useSettings((s) => s.loaded)
  useEffect(() => {
    useSettings.getState().load()
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('solid', reduce)
  }, [reduce])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const main = !/toolbar|bubble|border|prompter/.test(location.hash)
    const apply = () => applyTheme(settings, mq.matches, main)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme, settings.customTheme, settings.uiFont, settings.uiScale])

  if (route.startsWith('/toolbar')) return <Toolbar />
  if (route.startsWith('/prompter')) return <Prompter />
  if (route.startsWith('/border')) return <RecordBorder />
  if (route.startsWith('/bubble')) return <Bubble query={route.split('?')[1] ?? ''} />
  registerRpc()
  // the full screen update page belongs on the launcher: never over the editor, and not before the first run tour is done
  const updateScreenEnabled = !route.startsWith('/editor') && settingsLoaded && settings.onboarded
  return (
    <>
      {route.startsWith('/editor') ? (
        <Editor key={route} dir={new URLSearchParams(route.split('?')[1] ?? '').get('dir') ?? ''} />
      ) : (
        <Launcher />
      )}
      <ContextMenuHost />
      <DialogHost />
      <CaptionJobPill openDir={route.startsWith('/editor') ? new URLSearchParams(route.split('?')[1] ?? '').get('dir') : null} />
      <UpdateScreen enabled={updateScreenEnabled} />
      <UpdateBanner screenEnabled={updateScreenEnabled} />
      <FeedbackHost />
      {!route.startsWith('/editor') && <CrashConsent />}
      {settingsLoaded && !settings.onboarded && <Onboarding />}
      <CoachMarks />
      <PracticeLoader />
    </>
  )
}
