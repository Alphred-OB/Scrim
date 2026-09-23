import { protocol } from 'electron'
import { createReadStream, promises as fs } from 'fs'
import { extname } from 'path'
import { Readable } from 'stream'

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
        const stream = createReadStream(path, { start, end })
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) }
        })
      }
      const stream = createReadStream(path)
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 200,
        headers: { ...headers, 'Content-Length': String(stat.size) }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
