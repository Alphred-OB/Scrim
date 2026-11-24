import Module from 'module'
import path from 'path'
import assert from 'assert'

// Mock image extensions and alias resolution for Node test runner
// @ts-ignore
const originalResolveFilename = (Module as any)._resolveFilename
// @ts-ignore
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request.endsWith('.jpg') || request.endsWith('.png')) {
    if (request.startsWith('@/')) {
      return path.resolve(__dirname, '../src/renderer/src', request.slice(2))
    }
    return request
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}
// @ts-ignore
require.extensions['.jpg'] = (module: any, filename: string) => {
  module.exports = filename
}

async function run() {
  const { WALLPAPERS, drawWallpaper } = await import('../src/renderer/src/features/editor/engine/backgrounds')

console.log('Testing Official Apple Wallpapers & Gallery Engine...')

// 1. Check count and structure
assert(WALLPAPERS.length >= 35, `Expected at least 35 wallpapers, got ${WALLPAPERS.length}`)

const categories = new Set(WALLPAPERS.map((w) => w.category))
assert(categories.has('macOS'), 'Missing macOS category')
assert(categories.has('Landscape'), 'Missing Landscape category')
assert(categories.has('Abstract'), 'Missing Abstract category')
assert(categories.has('Gradients'), 'Missing Gradients category')

// 2. Check official Apple wallpapers
const appleWallpapers = [
  'sequoia',
  'sonoma-light',
  'sonoma-dark',
  'ventura-light',
  'ventura-dark',
  'monterey',
  'big-sur',
  'catalina',
  'mojave',
  'apple-cyan',
  'apple-purple'
]

for (const id of appleWallpapers) {
  const wp = WALLPAPERS.find((w) => w.id === id)
  assert(wp, `Missing official Apple wallpaper: ${id}`)
  assert(wp.image, `Wallpaper ${id} should have an image asset`)
  assert(wp.thumb, `Wallpaper ${id} should have a thumb asset`)
  assert(wp.tag, `Wallpaper ${id} should have a tag`)
  assert(wp.base, `Wallpaper ${id} should have a fallback base color`)
}
console.log('✔ All 11 Official Apple Wallpapers registered with tags, images, and thumbnails')

// 3. Check procedural wallpapers
const proceduralIds = ['aurora', 'sunset', 'ocean', 'mint', 'candy', 'peach', 'dusk', 'forest', 'ice', 'lava']
for (const id of proceduralIds) {
  const wp = WALLPAPERS.find((w) => w.id === id)
  assert(wp, `Missing procedural wallpaper: ${id}`)
  assert(wp.category === 'Gradients', `Procedural wallpaper ${id} should be categorized as Gradients`)
  assert(wp.blobs && wp.blobs.length > 0, `Procedural wallpaper ${id} should have blobs`)
}
console.log('✔ Procedural gradient wallpapers preserved with fallback compatibility')

// 4. Mock canvas context to test drawWallpaper
const mockCtx = {
  fillStyle: '',
  fillRect: () => {},
  drawImage: () => {},
  createRadialGradient: () => ({
    addColorStop: () => {}
  })
} as unknown as CanvasRenderingContext2D

for (const wp of WALLPAPERS) {
  drawWallpaper(mockCtx, 1920, 1080, wp.id)
}
console.log('✔ drawWallpaper executed successfully for all wallpapers')

console.log('ALL WALLPAPER TESTS PASSED!')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
