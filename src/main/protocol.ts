import { protocol } from 'electron'
import { createReadStream, promises as fs } from 'fs'
import { extname } from 'path'

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json'
}

export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
  ])
}

/**
 * Reads part of a file as a web stream that really stops (closes the file) when the player lets go.
 * The player drops and reopens requests all the time on a long recording, and each dropped one
 * must close its file. (Don't cap open ended ranges to a small piece: Chromium then fails to load
 * the video at all over this protocol.)
 */
function fileStream(path: string, start: number, end: number): ReadableStream<Uint8Array> {
  const node = createReadStream(path, { start, end, highWaterMark: 512 * 1024 })
  let done = false
  return new ReadableStream<Uint8Array>(
    {
      start(ctrl) {
        node.on('data', (c) => {
          if (done) return
          ctrl.enqueue(new Uint8Array(c as Buffer))
          if ((ctrl.desiredSize ?? 1) <= 0) node.pause()
        })
        node.on('end', () => {
          if (done) return
          done = true
          ctrl.close()
        })
        node.on('error', (e) => {
          if (done) return
          done = true
          ctrl.error(e)
        })
      },
      pull() {
        node.resume()
      },
      cancel() {
        done = true
        node.destroy()
      }
    },
    { highWaterMark: 4 }
  )
}

/** media://file/<encoded absolute path> -> local file, with HTTP Range support so video seeking works. */
export function handleMediaProtocol(): void {
  protocol.handle('media', async (req) => {
    try {
      const url = new URL(req.url)
      const path = decodeURIComponent(url.pathname.slice(1))
      const stat = await fs.stat(path)
      const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
      const range = req.headers.get('range')
      const headers: Record<string, string> = {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      }
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m && m[1] ? parseInt(m[1], 10) : 0
        let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1
        if (m && !m[1] && m[2]) {
          // suffix range: last N bytes
          start = Math.max(0, stat.size - parseInt(m[2], 10))
          end = stat.size - 1
        }
        end = Math.min(end, stat.size - 1)
        if (start > end || start >= stat.size) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
        }
        return new Response(fileStream(path, start, end), {
          status: 206,
          headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) }
        })
      }
      return new Response(fileStream(path, 0, stat.size - 1), {
        status: 200,
        headers: { ...headers, 'Content-Length': String(stat.size) }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
