/**
 * How far past the end of the webcam file the bubble still shows (the last frame of a recording is
 * rarely at the exact end, and the file can be a few frames shorter than the screen video).
 */
export const WEBCAM_TAIL_S = 0.5

/**
 * The time inside the webcam file to show at screen time `t`, or null when the webcam has no footage then.
 * Before the webcam starts, and after it ends (a video joined on, or the webcam stopped early), the bubble
 * must go away: a frame sink or a video element asked for a time past the end just returns the last frame,
 * which froze on top of the joined video.
 * `webcamDuration` is the file's length; when unknown (a recorder WebM may not state it) the end is not checked.
 * `until` is the screen time where the recording the webcam belongs to ends (set when a video is joined on): the
 * webcam file is usually a few seconds longer than the screen video, and those seconds would sit on top of the joined
 * video, which often has its own bubble baked in.
 */
export function webcamTimeAt(t: number, offset: number, syncOffset: number, webcamDuration: number, until?: number): number | null {
  if (until !== undefined && t > until) return null
  const want = t - offset - syncOffset
  if (want < 0) return null
  if (Number.isFinite(webcamDuration) && webcamDuration > 0 && want > webcamDuration + WEBCAM_TAIL_S) return null
  return want
}
