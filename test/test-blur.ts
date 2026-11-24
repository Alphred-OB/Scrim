import { defaultEdit, migrateProject, newBlur } from '../src/shared/defaults'
import { computeLayout, blurRect } from '../src/renderer/src/features/editor/engine/compositor'
import type { Project, BlurItem } from '../src/shared/types'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

console.log('Testing Blur & Redaction functionality...')

// 1. Test newBlur default values
const b1 = newBlur(2.5, 0.4, 0.6)
assert(b1.id.startsWith('b'), 'Blur ID should start with b')
assert(b1.start === 2.5, 'Blur start should match input')
assert(b1.end === 5.5, 'Default duration should be 3s')
assert(b1.x === 0.4 && b1.y === 0.6, 'Coordinates should match')
assert(b1.type === 'blur', 'Default type should be blur')
assert(b1.amount > 0, 'Amount should be > 0')
assert(b1.darken > 0, 'Darken shield should be > 0')
console.log('✔ newBlur defaults passed')

// 2. Test defaultEdit contains blurs and track
const edit = defaultEdit(10)
assert(Array.isArray(edit.blurs), 'edit.blurs must be an array')
assert(edit.blurs.length === 0, 'edit.blurs should start empty')
assert(edit.tracks.blurs === true, 'tracks.blurs should be true by default')
console.log('✔ defaultEdit passed')

// 3. Test project migration for backward compatibility
const oldProject: any = {
  version: 1,
  id: 'legacy-proj',
  name: 'Legacy',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  dir: 'C:/dummy',
  media: { screen: { path: 'screen.mp4', width: 1920, height: 1080, duration: 10, fps: 30 } },
  edit: {
    // Missing blurs and tracks.blurs
    clips: [{ id: 'c1', start: 0, end: 10, speed: 1 }],
    texts: []
  }
}

const migrated = migrateProject(oldProject as Project)
assert(Array.isArray(migrated.edit.blurs), 'Migrated project must have blurs array')
assert(migrated.edit.tracks.blurs === true, 'Migrated project tracks.blurs must be true')
console.log('✔ migrateProject backward compatibility passed')

// 4. Test blur overlapping lane allocation in migration
const projWithBlurs: any = {
  version: 1,
  id: 'proj-blurs',
  name: 'Blurs Test',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  dir: 'C:/dummy',
  media: { screen: { path: 'screen.mp4', width: 1920, height: 1080, duration: 10, fps: 30 } },
  edit: {
    clips: [{ id: 'c1', start: 0, end: 10, speed: 1 }],
    blurs: [
      { id: 'b1', start: 1, end: 4, x: 0.5, y: 0.5, w: 0.3, h: 0.1, type: 'blur', radius: 8, amount: 0.6, darken: 0.1 },
      { id: 'b2', start: 2, end: 5, x: 0.5, y: 0.5, w: 0.3, h: 0.1, type: 'pixelate', radius: 8, amount: 0.6, darken: 0.1 }
    ]
  }
}
const migratedLanes = migrateProject(projWithBlurs as Project)
assert(migratedLanes.edit.blurs[0].lane === 0, 'First blur should have lane 0')
assert(migratedLanes.edit.blurs[1].lane === 1, 'Overlapping blur should be moved to lane 1')
console.log('✔ Blur lane migration passed')

// 5. Test blurRect geometric projection under 1x and zoomed viewports
const testEdit = defaultEdit(10)
const L = computeLayout(testEdit, 1920, 1080, 1920, 1080)
const normalVp = { x: 0, y: 0, w: 1, h: 1 }
const blurItem: BlurItem = {
  id: 'b-test',
  start: 0,
  end: 3,
  x: 0.5,
  y: 0.5,
  w: 0.2,
  h: 0.1,
  type: 'blur',
  radius: 8,
  amount: 0.6,
  darken: 0.2
}

const rect1 = blurRect(blurItem, L, normalVp)
assert(Math.abs((rect1.x + rect1.w / 2) - (L.view.x + L.view.w / 2)) < 1, 'Blur center X should align with view center at 1x')
assert(Math.abs((rect1.y + rect1.h / 2) - (L.view.y + L.view.h / 2)) < 1, 'Blur center Y should align with view center at 1x')
assert(Math.abs(rect1.w - L.view.w * 0.2) < 1, 'Blur width should match 0.2 of view width')

// Under 2x zoom centered on (0.5, 0.5)
const zoomVp = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }
const rect2 = blurRect(blurItem, L, zoomVp)
assert(Math.abs(rect2.w - rect1.w * 2) < 1, 'Blur width should double when zoomed 2x')
assert(Math.abs(rect2.h - rect1.h * 2) < 1, 'Blur height should double when zoomed 2x')
console.log('✔ blurRect content projection & zoom scaling passed')

console.log('ALL BLUR & REDACTION TESTS PASSED!')
