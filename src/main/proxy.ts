// Light preview copies of the recording and the webcam.
//
// Screen: a 25 minute 2560x1600 recording is a multi gigabyte file. Playing it straight in the editor
// means decoding huge frames and pushing gigabytes through the media:// protocol, which is what made
// the player lag (and the adaptive quality drop). So for long or big recordings we make a small,
// seek friendly copy in the background (proxy.mp4: up to 1600 wide, a keyframe every second, no audio)
// and the editor plays that while moving and playing. When paused, it shows the sharp original.
//
// Webcam: the browser's recorder writes webcam.webm with a keyframe only every 3 to 8 seconds, so every
// seek (scrub, play, cut, drift fix) decodes up to 8 s of video first: 0.1 to 0.5 s per seek, measured,
// against 10 to 35 ms for the MP4s. That stalled the webcam and the player with it. cam-proxy.mp4 has a
// keyframe every second at the same size, so seeks are as quick as the screen's.
//
// Export never touches a proxy, it always reads the originals. The copies live in a local cache folder
// (main/previewCache.ts), not in the project folder, so OneDrive and the like never upload them.
import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import { cpus } from 'os'
import { setPriority } from 'os'
import { ffmpegPath, probeVideo } from './ffmpeg'
import { log } from './log'
import { isPathAllowed } from './security'
import { previewCacheFor } from './previewCache'

/**
 * Copies made before the cache folder existed sit in the project folder. Move them over (a rename, so it's
 * instant on the same drive); if that fails, delete them and the copy is simply made again.
 */
async function adoptLegacy(dir: string, out: string, stem: string): Promise<void> {
  for (const name of [`${stem}.mp4`, `${stem}.json`, `${stem}.tmp.mp4`]) {
    const old = join(dir, name)
    if (!existsSync(old)) continue
    const moved = name.includes('.tmp.') ? false : await fs.rename(old, join(out, name)).then(() => true, () => false)
    if (!moved) await fs.rm(old, { force: true }).catch((e) => log.warn('[proxy] could not remove old copy', old, String(e)))
  }
}

export type ProxyKind = 'screen' | 'cam'

export interface ProxyState {
  dir: string
  kind: ProxyKind
  status: 'none' | 'building' | 'ready' | 'failed'
  /** 0..1 while building */
  pct?: number
  path?: string
  width?: number
  height?: number
}

interface Meta { size: number; mtimeMs: number; width: number; height: number; v: number }
const META_VERSION = 3 // 3: 1600 wide, veryfast, keyframe every second (older copies are rebuilt)
/** a copy shorter or longer than the original by more than this is broken (rounding and the last frame aside) */
const MAX_LENGTH_GAP_S = 1.5

interface KindSpec {
  /** file name stem: <stem>.mp4, <stem>.json, <stem>.<pid>.tmp.mp4 */
  stem: string
  maxW: number
  crf: string
  /** is a copy worth making for this source? */
  worth: (duration: number, bytes: number, srcW: number, src: string) => boolean
}
const SPECS: Record<ProxyKind, KindSpec> = {
  // Short or small recordings play fine from the original, and one already 1280 wide gains nothing.
  // 1600 wide at crf 23: measured on a 2560x1600 recording, sharper than the old 1280 / crf 27 copy at a quarter of
  // the size (7.6 vs 28.5 MB per minute), and no slower to make (decoding the original is the slow part)
  screen: { stem: 'proxy', maxW: 1600, crf: '23', worth: (d, bytes, w) => (d >= 150 || bytes >= 400 * 1024 * 1024) && w > 1280 },
  // Only the recorder's own WebM has the sparse keyframes; a few seconds of it seek fast enough anyway.
  cam: { stem: 'cam-proxy', maxW: 1280, crf: '23', worth: (d, _bytes, _w, src) => d >= 20 && /\.webm$/i.test(src) }
}

const jobs = new Map<string, { proc: ChildProcess; state: ProxyState }>()
const jobKey = (dir: string, kind: ProxyKind) => `${kind}|${dir}`

function broadcast(s: ProxyState): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('proxy:update', s)
}

async function readyState(dir: string, out: string, kind: ProxyKind, src: string): Promise<ProxyState | null> {
  const { stem } = SPECS[kind]
  try {
    const meta: Meta = JSON.parse(await fs.readFile(join(out, `${stem}.json`), 'utf8'))
    const st = await fs.stat(src)
    const px = await fs.stat(join(out, `${stem}.mp4`))
    if (meta.v === META_VERSION && meta.size === st.size && Math.abs(meta.mtimeMs - st.mtimeMs) < 2 && px.size > 1000) {
      return { dir, kind, status: 'ready', path: join(out, `${stem}.mp4`), width: meta.width, height: meta.height }
    }
  } catch {
    /* not there, or out of date */
  }
  return null
}

export async function ensureProxy(dir: string, src: string, duration: number, srcW: number, srcH: number, kind: ProxyKind = 'screen'): Promise<ProxyState> {
  const spec = SPECS[kind]
  const running = jobs.get(jobKey(dir, kind))
  if (running) return running.state
  if (!existsSync(src)) return { dir, kind, status: 'none' }
  const out = previewCacheFor(dir)
  await fs.mkdir(out, { recursive: true })
  await adoptLegacy(dir, out, spec.stem)
  const ready = await readyState(dir, out, kind, src)
  if (ready) return ready
  const st = await fs.stat(src)
  if (!spec.worth(duration, st.size, srcW, src)) return { dir, kind, status: 'none' }

  const w = Math.min(spec.maxW, Math.round(srcW / 2) * 2)
  const h = Math.max(2, Math.round((srcH * w) / srcW / 2) * 2)
  // this process's own temp file, so two builds of the same copy can never write into one file
  const tmp = join(out, `${spec.stem}.${process.pid}.tmp.mp4`)
  // leftovers of a build that was cut short (app closed or crashed)
  for (const f of await fs.readdir(out).catch(() => [] as string[])) {
    if (f.startsWith(`${spec.stem}.`) && f.endsWith('.tmp.mp4')) await fs.rm(join(out, f), { force: true }).catch(() => {})
  }
  const state: ProxyState = { dir, kind, status: 'building', pct: 0 }
  // Measured on this kind of recording: decoding the big original is what takes the time, so a GPU encoder buys nothing,
  // and veryfast builds as quickly as ultrafast while making a file about 4x smaller.
  const threads = Math.max(2, cpus().length - 1)
  // a keyframe every second whatever the frame rate, and no B frames: seeks decode at most a second of video.
  // (Every half second made the file 1.7x bigger.)
  const gop = ['-g', '120', '-force_key_frames', 'expr:gte(t,n_forced*1)', '-bf', '0']
  const args = [
    '-hide_banner', '-v', 'error', '-y', '-nostdin',
    '-hwaccel', 'auto',
    '-i', src,
    '-an', '-sn',
    '-vf', `scale=${w}:${h}:flags=bilinear,format=yuv420p`,
    // keep every frame on its original timestamp so proxy time == original time
    '-fps_mode', 'passthrough',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'fastdecode', '-crf', spec.crf, '-sc_threshold', '0', '-threads', String(threads), ...gop,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    tmp
  ]
  const proc = spawn(ffmpegPath(), args, { windowsHide: true })
  try {
    if (proc.pid) setPriority(proc.pid, 10) // below normal, so the editor stays responsive while it builds
  } catch {
    /* not allowed here, fine */
  }
  jobs.set(jobKey(dir, kind), { proc, state })
  broadcast(state)
  let buf = ''
  let lastSent = 0
  proc.stdout.on('data', (d: Buffer) => {
    buf += d.toString()
    const m = [...buf.matchAll(/out_time_us=(\d+)/g)].pop()
    if (buf.length > 4000) buf = buf.slice(-2000)
    if (!m) return
    state.pct = Math.min(0.99, +m[1] / 1e6 / Math.max(1, duration))
    const now = Date.now()
    if (now - lastSent > 700) {
      lastSent = now
      broadcast(state)
    }
  })
  let err = ''
  proc.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-4000) })
  proc.on('error', (e) => {
    jobs.delete(jobKey(dir, kind))
    log.warn(`[proxy:${kind}] could not start`, String(e))
    broadcast({ dir, kind, status: 'failed' })
  })
  proc.on('close', async (code) => {
    jobs.delete(jobKey(dir, kind))
    if (code !== 0) {
      log.warn(`[proxy:${kind}] ffmpeg failed`, code, err)
      await fs.rm(tmp, { force: true }).catch(() => {})
      broadcast({ dir, kind, status: 'failed' })
      return
    }
    try {
      // ffmpeg can end "successfully" part way (a decode problem it skips past, a stream it gives up on). A short
      // copy would leave the player blank after its end, so it only counts if it is as long as the original.
      const [want, got] = await Promise.all([probeVideo(src), probeVideo(tmp)])
      // (a recorder WebM may not state its length at all: then there is nothing to compare against)
      if (want.duration > 0 && Math.abs(want.duration - got.duration) > MAX_LENGTH_GAP_S) {
        throw new Error(`copy is ${got.duration.toFixed(1)} s long, the original ${want.duration.toFixed(1)} s. ${err.slice(-400)}`)
      }
      const final = join(out, `${spec.stem}.mp4`)
      await fs.rename(tmp, final) // replaces the old copy in one step; if this fails the old one is still there
      const s2 = await fs.stat(src)
      const meta: Meta = { size: s2.size, mtimeMs: s2.mtimeMs, width: w, height: h, v: META_VERSION }
      await fs.writeFile(join(out, `${spec.stem}.json`), JSON.stringify(meta))
      log.info(`[proxy:${kind}] ready`, dir)
      broadcast({ dir, kind, status: 'ready', path: final, width: w, height: h })
    } catch (e) {
      log.warn(`[proxy:${kind}] finish failed`, String(e))
      await fs.rm(tmp, { force: true }).catch(() => {})
      broadcast({ dir, kind, status: 'failed' })
    }
  })
  return state
}

export function registerProxyIpc(): void {
  ipcMain.handle('proxy:ensure', (_e, dir: string, src: string, duration: number, w: number, h: number, kind?: ProxyKind) => {
    const k: ProxyKind = kind === 'cam' ? 'cam' : 'screen'
    return (isPathAllowed(dir) ? ensureProxy(dir, src, duration, w, h, k) : Promise.reject(new Error('Path not allowed'))).catch((e): ProxyState => {
      log.warn(`[proxy:${k}] ensure failed`, String(e))
      return { dir, kind: k, status: 'failed' }
    })
  })
  app.on('before-quit', () => {
    for (const { proc } of jobs.values()) proc.kill()
  })
}
