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

import { getSettings } from './settings'

let encoderCache: string[] | null = null

export interface EncoderInfo {
  id: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'cpu'
  name: string
  available: boolean
  active?: boolean
}

/** Picks the fastest working H.264 encoder on this machine (GPU first, CPU fallback). */
export async function detectEncoder(pref?: string): Promise<string> {
  let chosenPref = pref
  if (!chosenPref) {
    try {
      chosenPref = getSettings()?.videoEncoder ?? 'auto'
    } catch {
      chosenPref = 'auto'
    }
  }

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

  if (chosenPref === 'nvenc' && encoderCache.includes('h264_nvenc')) return 'h264_nvenc'
  if (chosenPref === 'qsv' && encoderCache.includes('h264_qsv')) return 'h264_qsv'
  if (chosenPref === 'amf' && encoderCache.includes('h264_amf')) return 'h264_amf'
  if (chosenPref === 'cpu') return 'libx264'
  return encoderCache[0]
}

export async function getAvailableEncoders(): Promise<EncoderInfo[]> {
  await detectEncoder()
  const list = encoderCache || ['libx264']
  const hasNvenc = list.includes('h264_nvenc')
  const hasQsv = list.includes('h264_qsv')
  const hasAmf = list.includes('h264_amf')
  let pref = 'auto'
  try {
    pref = getSettings()?.videoEncoder ?? 'auto'
  } catch {
    /* ignore */
  }
  const activeEnc = await detectEncoder(pref)

  return [
    { id: 'auto', name: `Automatic (${list[0] === 'libx264' ? 'Software CPU' : list[0].replace('h264_', '').toUpperCase() + ' GPU'})`, available: true, active: pref === 'auto' },
    { id: 'nvenc', name: 'NVIDIA NVENC (GPU)', available: hasNvenc, active: activeEnc === 'h264_nvenc' },
    { id: 'qsv', name: 'Intel Quick Sync (GPU)', available: hasQsv, active: activeEnc === 'h264_qsv' },
    { id: 'amf', name: 'AMD AMF (GPU)', available: hasAmf, active: activeEnc === 'h264_amf' },
    { id: 'cpu', name: 'Software libx264 (CPU)', available: true, active: activeEnc === 'libx264' }
  ]
}

/** Pixel format each encoder takes in. */
export function encoderPixFmt(enc: string): string {
  return enc === 'h264_qsv' ? 'nv12' : 'yuv420p'
}

/**
 * Screen to video color conversion: exact BT.709 (what players assume for HD), sharp chroma for text,
 * done in one place so colors don't shift or wash out.
 */
export function colorFilter(enc: string): string {
  return `scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+full_chroma_int,format=${encoderPixFmt(enc)}`
}

/** Tags the video as BT.709 so the editor, browsers and YouTube show the right colors. */
export const COLOR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']

/**
 * Encoder settings tuned for screen content: crisp text and UI edges matter more than file size.
 * The editor trims and re-encodes on export anyway, so the recording keeps as much detail as it can.
 */
export function encoderArgs(enc: string, fps: number): string[] {
  const gop = String(fps) // keyframe every second = fast seeking in the editor
  switch (enc) {
    case 'h264_nvenc':
      return ['-c:v', enc, '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '16', '-b:v', '0', '-maxrate', '80M', '-bufsize', '160M', '-spatial-aq', '1', '-aq-strength', '8', '-profile:v', 'high', '-g', gop, '-pix_fmt', encoderPixFmt(enc), ...COLOR_TAGS]
    case 'h264_qsv':
      return ['-c:v', enc, '-preset', 'veryfast', '-async_depth', '4', '-global_quality', '19', '-profile:v', 'high', '-g', gop, '-pix_fmt', encoderPixFmt(enc), ...COLOR_TAGS]
    case 'h264_amf':
      return ['-c:v', enc, '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '16', '-qp_p', '18', '-profile:v', 'high', '-g', gop, '-pix_fmt', encoderPixFmt(enc), ...COLOR_TAGS]
    default:
      // superfast keeps up in real time on most CPUs and looks far better than ultrafast (no blocky text)
      return ['-c:v', 'libx264', '-preset', 'superfast', '-tune', 'zerolatency', '-crf', '16', '-profile:v', 'high', '-g', gop, '-pix_fmt', encoderPixFmt(enc), ...COLOR_TAGS]
  }
}
