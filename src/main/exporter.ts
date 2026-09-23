import { promises as fs } from 'fs'
import type { FileHandle } from 'fs/promises'
import type { Clip } from '@shared/types'
import { runFfmpeg } from './ffmpeg'

// ---------- streaming writer for the renderer's encoded video ----------
const handles = new Map<string, FileHandle>()

export async function openWrite(path: string): Promise<void> {
  const h = await fs.open(path, 'w')
  handles.set(path, h)
}
export async function writeAt(path: string, data: Uint8Array, position: number): Promise<void> {
  const h = handles.get(path)
  if (!h) throw new Error('File not open')
  await h.write(data, 0, data.byteLength, position)
}
export async function closeWrite(path: string): Promise<void> {
  const h = handles.get(path)
  handles.delete(path)
  await h?.close()
}

// ---------- final audio mix + mux ----------
export interface MuxJob {
  videoPath: string
  outPath: string
  duration: number
  clips: Clip[]
  tracks: { path: string; offset: number; volume: number; window?: [number, number]; fadeIn?: number; fadeOut?: number }[]
  music?: { path: string; volume: number }
  gif?: { width: number; fps: number }
  format?: 'mp4' | 'webm' | 'mov' | 'gif'
}

function atempoChain(speed: number): string {
  const parts: string[] = []
  let s = speed
  while (s > 2) {
    parts.push('atempo=2')
    s /= 2
  }
  while (s < 0.5) {
    parts.push('atempo=0.5')
    s /= 0.5
  }
  if (Math.abs(s - 1) > 0.001) parts.push(`atempo=${s.toFixed(4)}`)
  return parts.join(',')
}

export async function mux(job: MuxJob, onProgress: (p: number) => void): Promise<void> {
  if (job.gif) {
    const { width, fps } = job.gif
    const r = await runFfmpeg([
      '-i', job.videoPath,
      '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop', '0', job.outPath
    ])
    if (r.code !== 0) throw new Error('GIF conversion failed')
    return
  }

  const clips = job.clips.slice().sort((a, b) => a.start - b.start)
  const inputs: string[] = ['-i', job.videoPath]
  const filters: string[] = []
  const mixLabels: string[] = []
  let idx = 1
  for (const t of job.tracks) {
    if (t.volume <= 0) continue
    inputs.push('-i', t.path)
    const lbl = `t${idx}`
    // 1) align to the video timeline
    const align = t.offset >= 0
      ? `adelay=${Math.round(t.offset * 1000)}:all=1`
      : `atrim=start=${(-t.offset).toFixed(3)},asetpts=PTS-STARTPTS`
    // 2) silence outside the clip window (imported audio / overlay video) and apply fades
    let win = ''
    if (t.window) {
      const [ws, we] = t.window
      win = `,volume=0:enable='lt(t,${ws.toFixed(3)})+gt(t,${we.toFixed(3)})'`
      if (t.fadeIn && t.fadeIn > 0) win += `,afade=t=in:st=${ws.toFixed(3)}:d=${t.fadeIn.toFixed(3)}`
      if (t.fadeOut && t.fadeOut > 0) win += `,afade=t=out:st=${Math.max(ws, we - t.fadeOut).toFixed(3)}:d=${t.fadeOut.toFixed(3)}`
    }
    filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,${align},apad${win}[${lbl}al]`)
    // 2) keep only the clip ranges, in order
    if (clips.length === 1) {
      const c = clips[0]
      const tempo = atempoChain(c.speed)
      filters.push(`[${lbl}al]atrim=start=${c.start.toFixed(3)}:end=${c.end.toFixed(3)},asetpts=PTS-STARTPTS${tempo ? ',' + tempo : ''},volume=${t.volume.toFixed(3)}[${lbl}]`)
    } else {
      const splits = clips.map((_, i) => `[${lbl}s${i}]`).join('')
      filters.push(`[${lbl}al]asplit=${clips.length}${splits}`)
      clips.forEach((c, i) => {
        const tempo = atempoChain(c.speed)
        filters.push(`[${lbl}s${i}]atrim=start=${c.start.toFixed(3)}:end=${c.end.toFixed(3)},asetpts=PTS-STARTPTS${tempo ? ',' + tempo : ''}[${lbl}c${i}]`)
      })
      filters.push(`${clips.map((_, i) => `[${lbl}c${i}]`).join('')}concat=n=${clips.length}:v=0:a=1,volume=${t.volume.toFixed(3)}[${lbl}]`)
    }
    mixLabels.push(`[${lbl}]`)
    idx++
  }
  if (job.music && job.music.volume > 0) {
    inputs.push('-stream_loop', '-1', '-i', job.music.path)
    const fadeStart = Math.max(0, job.duration - 2)
    filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${job.duration.toFixed(3)},afade=t=out:st=${fadeStart.toFixed(3)}:d=2,volume=${job.music.volume.toFixed(3)}[mus]`)
    mixLabels.push('[mus]')
    idx++
  }

  const args: string[] = [...inputs]
  if (mixLabels.length) {
    const mix = mixLabels.length > 1
      ? `${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest,atrim=0:${job.duration.toFixed(3)}[aout]`
      : `${mixLabels[0]}atrim=0:${job.duration.toFixed(3)}[aout]`
    filters.push(mix)
    const acodec = job.format === 'webm' ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'aac', '-b:a', '192k']
    args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', ...acodec)
  } else {
    args.push('-map', '0:v', '-c:v', 'copy')
  }
  args.push('-t', job.duration.toFixed(3))
  if (job.format !== 'webm') args.push('-movflags', '+faststart')
  args.push(job.outPath)

  const r = await runFfmpeg(args, (s) => {
    const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(s)
    if (m) onProgress(Math.min(1, (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) / job.duration))
  })
  if (r.code !== 0) throw new Error('Audio mixing failed:\n' + r.stderr.split('\n').slice(-6).join('\n'))
}
