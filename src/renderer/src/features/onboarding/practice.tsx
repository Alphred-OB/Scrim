// "Practice on a sample": builds the sample project, then opens it with the hands on tour.
import { create } from 'zustand'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { makeSampleProject } from './sample'
import { queueTour } from './tours'

const usePractice = create<{ progress: number | null; error: string }>(() => ({ progress: null, error: '' }))

export async function startPractice(): Promise<void> {
  if (usePractice.getState().progress !== null) return
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
