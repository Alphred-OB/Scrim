// Caption generation as a background job. It belongs to the app, not to the Captions panel: switch panels, open
// another tool or even leave the project and it keeps going, a small pill shows where it is, and the result lands in the
// project it was started for (written to its file when that project is no longer open).
import { create } from 'zustand'
import type { AppSettings, Project } from '@shared/types'
import { applyTranscript } from '@shared/speech'
import { Icon, showMessage } from '@/ui'
import { api } from '@/lib/api'
import { useEditor } from '@/features/editor/state/store'
import { cancelLocalTranscription, transcribe } from '@/features/editor/speech/transcribe'

export interface CaptionJob {
  dir: string
  name: string
  stage: string
  p: number
  note?: string
}
interface JobStore {
  job: CaptionJob | null
  /** captions that just finished, shown for a few seconds */
  finished: { dir: string; name: string } | null
}
export const useCaptionJob = create<JobStore>(() => ({ job: null, finished: null }))

const FINISHED_SHOWN_MS = 9000
let cancelled = false
let hideTimer = 0

/** Puts the transcript into the project it was made for: live if it is open, otherwise through its file. */
async function saveTranscript(dir: string, transcript: Parameters<typeof applyTranscript>[1]): Promise<void> {
  const editor = useEditor.getState()
  if (editor.project?.dir === dir) {
    editor.update((e) => applyTranscript(e, transcript))
    return
  }
  const p = await api.loadProject(dir)
  applyTranscript(p.edit, transcript)
  await api.saveProject(p)
}

/** Starts making captions for `project`. Returns false when another job is already running (one at a time). */
export async function startCaptions(project: Project, settings: AppSettings): Promise<boolean> {
  if (useCaptionJob.getState().job) return false
  cancelled = false
  window.clearTimeout(hideTimer)
  const dir = project.dir
  const name = project.name
  useCaptionJob.setState({ job: { dir, name, stage: 'extract', p: 0 }, finished: null })
  try {
    const t = await transcribe(project, settings, (stage, p, note) => {
      if (!cancelled) useCaptionJob.setState({ job: { dir, name, stage, p, note } })
    })
    if (cancelled) return true
    if (!t.words.length) throw new Error("No speech was found. Check that the right sound track isn't muted or empty.")
    await saveTranscript(dir, t)
    useCaptionJob.setState({ job: null, finished: { dir, name } })
    api.notify('Captions are ready', name).catch(() => {})
    hideTimer = window.setTimeout(() => useCaptionJob.setState({ finished: null }), FINISHED_SHOWN_MS)
  } catch (e) {
    if (!cancelled) showMessage("Couldn't make captions", e instanceof Error ? e.message : String(e))
    useCaptionJob.setState({ job: null })
  }
  return true
}

/** Stops the running job; whatever it makes is thrown away. */
export function cancelCaptions(): void {
  if (!useCaptionJob.getState().job) return
  cancelled = true
  cancelLocalTranscription()
  useCaptionJob.setState({ job: null })
}

const STAGE: Record<string, string> = {
  extract: 'Reading the sound',
  download: 'Downloading the speech model',
  upload: 'Sending to Groq',
  transcribe: 'Listening'
}

/** The small pill that follows the job around the app. `openDir`: the project folder of the editor on screen, if any. */
export function CaptionJobPill({ openDir }: { openDir: string | null }) {
  const job = useCaptionJob((s) => s.job)
  const finished = useCaptionJob((s) => s.finished)
  if (!job && !finished) return null
  const where = (dir: string, name: string) => (dir === openDir ? '' : ` for ${name}`)
  if (job) {
    const pct = job.p ? `${Math.round(job.p * 100)}%` : ''
    return (
      <div className="capjob glass" role="status">
        <span className="spin" />
        <span className="capjob-text">
          <b>{STAGE[job.stage] ?? 'Working'}</b>
          <span className="hint">Making captions{where(job.dir, job.name)}{pct ? ` · ${pct}` : ''}{job.note ? ` · ${job.note}` : ''}</span>
        </span>
        <button className="btn ghost sm" onClick={cancelCaptions}>Cancel</button>
      </div>
    )
  }
  return (
    <div className="capjob glass" role="status">
      <span className="capjob-done"><Icon name="check" size={16} /></span>
      <span className="capjob-text">
        <b>Captions are ready</b>
        <span className="hint">{finished!.name}</span>
      </span>
      {finished!.dir !== openDir && <button className="btn primary sm" onClick={() => (location.hash = `/editor?dir=${encodeURIComponent(finished!.dir)}`)}>Open</button>}
      <button className="btn ghost sm" onClick={() => useCaptionJob.setState({ finished: null })}>Dismiss</button>
    </div>
  )
}
