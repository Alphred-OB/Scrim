// "Practice on a sample": builds the sample project, then opens it with the hands on tour.
import { create } from 'zustand'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { makeSampleProject } from './sample'
import { queueTour } from './tours'

const usePractice = create<{ progress: number | null; error: string }>(() => ({ progress: null, error: '' }))

let preloadPromise: Promise<string> | null = null

/** Preloads the practice project in the background so opening it is instantaneous. */
export async function preloadSample(): Promise<void> {
  try {
    const ready = await api.sampleGetDir()
    if (ready) return
    if (!preloadPromise) {
      preloadPromise = makeSampleProject().finally(() => {
        preloadPromise = null
      })
    }
    await preloadPromise
  } catch (e) {
    console.warn('[practice] preload error', e)
  }
}

export async function startPractice(): Promise<void> {
  if (usePractice.getState().progress !== null) return

  // 1. If already preloaded and ready on disk, open immediately (0ms!)
  try {
    const readyDir = await api.sampleGetDir(true)
    if (readyDir) {
      const s = useSettings.getState()
      if (!s.settings.onboarded) await s.save({ onboarded: true })
      queueTour('pro')
      api.openEditor(readyDir)
      return
    }
  } catch {
    /* fallback to build */
  }

  // 2. If background preload is actively in-flight, await it
  if (preloadPromise) {
    usePractice.setState({ progress: 0.7, error: '' })
    try {
      const dir = await preloadPromise
      const s = useSettings.getState()
      if (!s.settings.onboarded) await s.save({ onboarded: true })
      queueTour('pro')
      api.openEditor(dir)
      return
    } catch {
      /* fallback to fresh build */
    } finally {
      usePractice.setState({ progress: null })
    }
  }

  // 3. Fallback: build on-demand with progress bar
  usePractice.setState({ progress: 0, error: '' })
  try {
    const dir = await makeSampleProject((p) => usePractice.setState({ progress: p }))
    const s = useSettings.getState()
    if (!s.settings.onboarded) await s.save({ onboarded: true })
    queueTour('pro')
    api.openEditor(dir)
  } catch (e) {
    usePractice.setState({ error: e instanceof Error ? e.message : String(e) })
    setTimeout(() => usePractice.setState({ error: '' }), 5000)
  } finally {
    usePractice.setState({ progress: null })
  }
}

/** Full screen card while the sample is being made (a few seconds). */
export function PracticeLoader() {
  const { progress, error } = usePractice()
  if (progress === null && !error) return null
  return (
    <div className="practice-back">
      <div className="practice-card">
        {error ? (
          <>
            <b>Couldn't make the sample</b>
            <p>{error}</p>
          </>
        ) : (
          <>
            <div className="practice-reel">
              <span /><span /><span />
            </div>
            <b>Setting up your practice video</b>
            <p>A short recording of a made up app, with real clicks and cursor moves to play with.</p>
            <div className="practice-bar"><span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
          </>
        )}
      </div>
    </div>
  )
}
