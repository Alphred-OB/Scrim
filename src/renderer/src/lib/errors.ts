/** Turns a raw error (often an Electron "Error invoking remote method…" string) into a sentence a person can act on. */
export function friendlyError(e: unknown): { message: string; detail: string } {
  const raw = e instanceof Error ? e.message : String(e)
  const detail = raw.replace(/^(Error: )?Error invoking remote method '[^']*': (Error: )?/, '').trim()
  const has = (re: RegExp) => re.test(raw)
  let message = 'Something went wrong.'
  if (has(/ENOSPC|no space left/i)) message = 'Your disk is full. Free up some space and try again.'
  else if (has(/EACCES|EPERM|EBUSY|being used by another process/i)) message = 'Windows would not let Scrim use that file. It may be open in another app, or OneDrive may still be syncing it. Close the other app or wait a moment, then try again.'
  else if (has(/ENOENT|no such file/i)) message = 'A file this needs was moved or deleted, so Scrim could not find it.'
  else if (has(/EMFILE|ENOMEM|out of memory|allocation/i)) message = 'Scrim ran out of memory. Close other apps, or export at a lower resolution, and try again.'
  else if (has(/encoder|codec|VideoEncoder|not supported/i)) message = 'This computer could not encode the video at these settings. Try 1080p, 30 fps, or another format.'
  else if (has(/network|ENOTFOUND|ETIMEDOUT|fetch failed/i)) message = 'Scrim could not reach the internet. Check your connection and try again.'
  return { message, detail }
}
