import { spawn, ChildProcess } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'
import { sep } from 'path'

export function ffmpegPath(): string {
  const p = (ffmpegStatic as unknown as string) || 'ffmpeg'
  // inside a packaged app the binary lives in app.asar.unpacked
  return p.replace('app.asar' + sep, 'app.asar.unpacked' + sep)
}

export function runFfmpeg(args: string[], onStderr?: (line: string) => void): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-y', ...args], { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      const s = d.toString()
      stderr += s
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000)
      onStderr?.(s)
    })
    proc.on('error', (e) => resolve({ code: -1, stderr: String(e) }))
    proc.on('close', (code) => resolve({ code: code ?? -1, stderr }))
  })
}

export function spawnFfmpeg(args: string[]): ChildProcess {
  return spawn(ffmpegPath(), ['-hide_banner', '-y', ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
}

/** Returns duration in seconds parsed from `ffmpeg -i` output, or 0. */
export async function probeDuration(file: string): Promise<number> {
  const { stderr } = await runFfmpeg(['-i', file])
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  if (!m) return 0
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])
}

export async function probeVideo(file: string): Promise<{ width: number; height: number; duration: number; fps: number }> {
  const { stderr } = await runFfmpeg(['-i', file])
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  const v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr)
  const f = /(\d+(?:\.\d+)?) fps/.exec(stderr)
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0,
    width: v ? +v[1] : 1920,
    height: v ? +v[2] : 1080,
    fps: f ? Math.round(parseFloat(f[1])) : 30
  }
}

let encoderCache: string[] | null = null
/** Picks the fastest working H.264 encoder on this machine (GPU first, CPU fallback). */
export async function detectEncoder(): Promise<string> {
  if (!encoderCache) {
    encoderCache = []
    for (const enc of ['h264_nvenc', 'h264_qsv', 'h264_amf']) {
      const { code } = await runFfmpeg([
        '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30', '-frames:v', '5', '-c:v', enc, '-f', 'null', '-'
      ])
      if (code === 0) encoderCache.push(enc)
    }
    encoderCache.push('libx264')
  }
  return encoderCache[0]
}

export function encoderArgs(enc: string, fps: number): string[] {
  const gop = String(fps) // keyframe every second = fast seeking in the editor
  switch (enc) {
    case 'h264_nvenc':
      return ['-c:v', enc, '-preset', 'p4', '-tune', 'll', '-rc', 'vbr', '-cq', '21', '-b:v', '0', '-g', gop, '-pix_fmt', 'yuv420p']
    case 'h264_qsv':
      return ['-c:v', enc, '-preset', 'veryfast', '-global_quality', '22', '-g', gop, '-pix_fmt', 'nv12']
    case 'h264_amf':
      return ['-c:v', enc, '-quality', 'speed', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '22', '-g', gop, '-pix_fmt', 'yuv420p']
    default:
      return ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '20', '-g', gop, '-pix_fmt', 'yuv420p']
  }
}
