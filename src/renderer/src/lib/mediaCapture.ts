import { api } from '@/lib/api'

// Records microphone, system audio and webcam as separate files so each can be edited on its own.
type Kind = 'mic' | 'system' | 'webcam'
interface Track { rec: MediaRecorder; chunks: Blob[]; stream: MediaStream; startedAt: number }
const tracks: Partial<Record<Kind, Track>> = {}

function pickMime(kind: Kind): string {
  const list =
    kind === 'webcam'
      ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm']
      : ['audio/webm;codecs=opus', 'audio/webm']
  return list.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

function startTrack(kind: Kind, stream: MediaStream, opts: MediaRecorderOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const rec = new MediaRecorder(stream, { mimeType: pickMime(kind), ...opts })
    const t: Track = { rec, chunks: [], stream, startedAt: 0 }
    rec.ondataavailable = (e) => e.data.size && t.chunks.push(e.data)
    rec.onstart = () => {
      t.startedAt = Date.now()
      resolve(t.startedAt)
    }
    rec.onerror = (e) => reject(e)
    tracks[kind] = t
    rec.start(1000)
  })
}

export interface MediaStartOptions {
  mic: boolean
  micDeviceId?: string
  noiseSuppression?: boolean
  system: boolean
  webcam: { deviceId?: string; quality: 480 | 720 | 1080 } | null
}

export function webcamConstraints(deviceId: string | undefined, quality: number): MediaTrackConstraints {
  const h = quality
  const w = Math.round((h * 16) / 9)
  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    width: { ideal: w },
    height: { ideal: h },
    frameRate: { ideal: 30, max: 30 }
  }
}

export async function startMedia(opts: MediaStartOptions): Promise<Partial<Record<Kind, number>>> {
  const out: Partial<Record<Kind, number>> = {}
  const jobs: Promise<void>[] = []
  if (opts.mic) {
    jobs.push(
      (async () => {
        const ns = opts.noiseSuppression ?? true
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: opts.micDeviceId ? { exact: opts.micDeviceId } : undefined,
            echoCancellation: ns,
            noiseSuppression: ns,
            autoGainControl: ns,
            channelCount: 1
          }
        })
        out.mic = await startTrack('mic', stream, { audioBitsPerSecond: 160_000 })
      })().catch((e) => console.warn('mic failed', e))
    )
  }
  if (opts.system) {
    jobs.push(
      (async () => {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 16, height: 16, frameRate: 1 }, audio: true })
        stream.getVideoTracks().forEach((t) => t.stop()) // only the audio is needed
        if (!stream.getAudioTracks().length) throw new Error('no system audio track')
        out.system = await startTrack('system', new MediaStream(stream.getAudioTracks()), { audioBitsPerSecond: 160_000 })
      })().catch((e) => console.warn('system audio failed', e))
    )
  }
  if (opts.webcam) {
    const cam = opts.webcam
    jobs.push(
      (async () => {
        // ask for the best the camera can do; it answers with what it really supports
        const stream = await navigator.mediaDevices.getUserMedia({ video: webcamConstraints(cam.deviceId, 1080), audio: false })
        const h = stream.getVideoTracks()[0]?.getSettings().height ?? 720
        const bps = h >= 1000 ? 5_000_000 : h >= 700 ? 2_500_000 : 1_200_000
        // a keyframe every second: left to itself the recorder makes one every 3 to 8 s, and then every seek
        // in the editor decodes seconds of video first (0.1 to 0.5 s per seek, which stalled the player)
        out.webcam = await startTrack('webcam', stream, { videoBitsPerSecond: bps, videoKeyFrameIntervalDuration: 1000 } as MediaRecorderOptions)
      })().catch((e) => console.warn('webcam failed', e))
    )
  }
  await Promise.all(jobs)
  return out
}

function finish(t: Track, type: string): Promise<Blob> {
  return new Promise((resolve) => {
    t.rec.onstop = () => resolve(new Blob(t.chunks, { type }))
    if (t.rec.state === 'inactive') resolve(new Blob(t.chunks, { type }))
    else t.rec.stop()
    t.stream.getTracks().forEach((s) => s.stop())
  })
}

export async function stopMedia(dir: string): Promise<Partial<Record<Kind, string>>> {
  const out: Partial<Record<Kind, string>> = {}
  for (const kind of ['mic', 'system', 'webcam'] as const) {
    const t = tracks[kind]
    if (!t) continue
    const blob = await finish(t, kind === 'webcam' ? 'video/webm' : 'audio/webm')
    delete tracks[kind]
    if (blob.size > 0) out[kind] = await api.saveAudio(dir, kind, new Uint8Array(await blob.arrayBuffer()))
  }
  return out
}

/** Pausing keeps the tracks in step with the screen video, which also skips paused time. */
export function pauseMedia(): void {
  for (const t of Object.values(tracks)) if (t?.rec.state === 'recording') t.rec.pause()
}
export function resumeMedia(): void {
  for (const t of Object.values(tracks)) if (t?.rec.state === 'paused') t.rec.resume()
}

export async function cancelMedia(): Promise<void> {
  for (const kind of ['mic', 'system', 'webcam'] as const) {
    const t = tracks[kind]
    if (t) await finish(t, 'video/webm')
    delete tracks[kind]
  }
}
