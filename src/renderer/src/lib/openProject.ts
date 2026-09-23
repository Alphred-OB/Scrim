import { api } from '@/lib/api'

/**
 * Ctrl+O: pick a Scrim project (project.json or its screen.mp4) or any video, then open it in the
 * editor. `beforeLeave` lets the editor save the current project first.
 */
export async function openProjectFromDialog(beforeLeave?: () => Promise<unknown>): Promise<void> {
  try {
    const dir = await api.openProjectDialog()
    if (!dir) return
    await beforeLeave?.()
    location.hash = `/editor?dir=${encodeURIComponent(dir)}`
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e))
  }
}
