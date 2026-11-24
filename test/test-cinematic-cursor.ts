import { defaultEdit, migrateProject } from '../src/shared/defaults'
import { buildCinematicTrack, smoothSpring } from '../src/renderer/src/features/editor/engine/cinematicSpline'
import { buildCameraTrack, buildTrack, sampleTrack } from '../src/renderer/src/features/editor/engine/cursorTrack'
import type { CursorData, Project } from '../src/shared/types'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

console.log('Testing Continuous Cinematic Cursor Smoothing...')

// 1. Zero-phase Spring Mathematics
const testArr = new Float32Array(180)
for (let i = 85; i <= 95; i++) testArr[i] = 1
const smoothed = smoothSpring(testArr, 0.5)
assert(smoothed.length === testArr.length, 'Length must be preserved')
assert(Math.abs(smoothed[0]) < 1e-4 && Math.abs(smoothed[smoothed.length - 1]) < 1e-4, 'Endpoints must remain zero')
assert(smoothed[90] > 0 && smoothed[90] <= 1, 'Pulse must be gracefully smoothed')
console.log('✔ Zero-phase spring filter passed')

// 2. Default Edit & Project Migration
const edit = defaultEdit(10)
assert(edit.cursor.motionMode === 'cinematic', 'Default motionMode must be cinematic')
assert(edit.cursor.curvature === 0.5, 'Default curvature must be 0.5')
assert(edit.cursor.clickDwell === 0.12, 'Default clickDwell must be 0.12s')

const legacyProject: any = {
  version: 1,
  id: 'legacy-cursor',
  name: 'Legacy Project',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  dir: 'C:/dummy',
  media: { screen: { path: 'screen.mp4', width: 1920, height: 1080, duration: 10, fps: 30 } },
  edit: {
    cursor: { show: true, style: 'default', color: '#fff', size: 1, smoothing: 0.5 }
  }
}
const migrated = migrateProject(legacyProject as Project)
assert(migrated.edit.cursor.motionMode === 'cinematic', 'Migrated project must receive cinematic motionMode')
assert(migrated.edit.cursor.curvature === 0.5, 'Migrated project must receive curvature')
assert(migrated.edit.cursor.clickDwell === 0.12, 'Migrated project must receive clickDwell')
console.log('✔ defaultEdit and migrateProject passed')

// 3. Resting Stability (NO drift while stationary)
const cursorData: CursorData = {
  width: 1920,
  height: 1080,
  samples: [
    // Resting at (0.2, 0.2)
    { t: 0.0, x: 0.2, y: 0.2 },
    // Movement from 1.0 to 1.8
    { t: 1.0, x: 0.2, y: 0.2 },
    { t: 1.2, x: 0.35, y: 0.35 },
    { t: 1.5, x: 0.55, y: 0.6 },
    { t: 1.8, x: 0.8, y: 0.8 },
    // Resting at (0.8, 0.8)
    { t: 1.85, x: 0.8, y: 0.8 },
    { t: 3.0, x: 0.8, y: 0.8 }
  ],
  clicks: [
    { t: 1.8, x: 0.8, y: 0.8, button: 1 }
  ]
}

const cineTrack = buildTrack(cursorData, 3.0, {
  ...edit.cursor,
  motionMode: 'cinematic',
  curvature: 0.5,
  clickDwell: 0.12
})
assert(cineTrack !== null, 'Track must build')

// Sample at resting times
const restStart = sampleTrack(cineTrack!, 0.5)
assert(Math.abs(restStart.x - 0.2) < 1e-4 && Math.abs(restStart.y - 0.2) < 1e-4, `Must not drift during initial rest (got ${restStart.x})`)

const restEnd = sampleTrack(cineTrack!, 2.5)
assert(Math.abs(restEnd.x - 0.8) < 1e-4 && Math.abs(restEnd.y - 0.8) < 1e-4, `Must not drift during final rest (got ${restEnd.x})`)
console.log('✔ Resting stability (zero drift) passed')

// 4. Click Precision Anchoring
const clickSample = sampleTrack(cineTrack!, 1.8)
assert(Math.abs(clickSample.x - 0.8) < 1e-4, `Click coordinate x must be exact (got ${clickSample.x})`)
assert(Math.abs(clickSample.y - 0.8) < 1e-4, `Click coordinate y must be exact (got ${clickSample.y})`)
console.log('✔ Click precision anchoring passed')

// 5. Continuous Smooth Velocity (No teleportation or speed bursts)
let maxVelocity = 0
for (let t = 0; t <= 3.0; t += 0.05) {
  const s = sampleTrack(cineTrack!, t)
  maxVelocity = Math.max(maxVelocity, Math.abs(s.vx))
}
assert(maxVelocity < 2.5, `Velocity must be smooth and bounded, no teleport spikes (max=${maxVelocity})`)
console.log('✔ Velocity continuity (no teleports/choppiness) passed')

// 6. Steadicam Camera Zoom Track
const cameraTrack = buildCameraTrack(cursorData, 3.0, edit.cursor)
assert(cameraTrack !== null, 'Camera track must build successfully')
assert(cameraTrack!.xs.length === cineTrack!.xs.length, 'Camera track frames must match cursor track')
console.log('✔ Steadicam camera zoom coordination passed')

console.log('ALL CONTINUOUS CINEMATIC CURSOR TESTS PASSED!')
