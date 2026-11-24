import { defaultEdit, migrateProject } from '../src/shared/defaults'
import { activeKey, drawKeycaps, keyLabels, keyShows } from '../src/renderer/src/features/editor/engine/keysOverlay'
import type { KeyPress, KeySettings, Project } from '../src/shared/types'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

console.log('Testing Keystroke / Shortcut Overlay functionality...')

// 1. Test defaultEdit contains keys and tracks.keys
const edit = defaultEdit(10)
assert(edit.keys !== undefined, 'edit.keys must be defined')
assert(edit.keys.show === true, 'edit.keys.show should default to true')
assert(edit.keys.style === 'dark', 'edit.keys.style should default to dark')
assert(edit.keys.position === 'bottom', 'edit.keys.position should default to bottom')
assert(edit.keys.hold === 1.4, 'edit.keys.hold should default to 1.4s')
assert(edit.tracks.keys === true, 'tracks.keys must be true by default')
console.log('✔ defaultEdit keys settings & track passed')

// 2. Test project migration for legacy projects
const oldProject: any = {
  version: 1,
  id: 'legacy-keys',
  name: 'Legacy Keys Test',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  dir: 'C:/dummy',
  media: { screen: { path: 'screen.mp4', width: 1920, height: 1080, duration: 10, fps: 30 } },
  edit: {
    clips: [{ id: 'c1', start: 0, end: 10, speed: 1 }],
    texts: []
  }
}

const migrated = migrateProject(oldProject as Project)
assert(migrated.edit.keys !== undefined, 'Migrated project must have keys configuration')
assert(migrated.edit.keys.show === true, 'Migrated project keys.show must be true')
assert(migrated.edit.tracks.keys === true, 'Migrated project tracks.keys must be true')
console.log('✔ migrateProject backward compatibility passed')

// 3. Test keyShows logic
const s: KeySettings = {
  show: true,
  style: 'dark',
  color: '#ff3b30',
  position: 'bottom',
  size: 1,
  radius: 1,
  hold: 1.4,
  animation: 'pop',
  labels: 'words',
  singles: true,
  hidden: [2500] // hides press at t = 2.5s
}

const pCombo: KeyPress = { t: 1.0, keys: ['Ctrl', 'C'] }
const pSingle: KeyPress = { t: 2.0, keys: ['Enter'] }
const pHidden: KeyPress = { t: 2.5, keys: ['Ctrl', 'V'] }

assert(keyShows(pCombo, s) === true, 'Combination key should show')
assert(keyShows(pSingle, s) === true, 'Single key should show when singles=true')
assert(keyShows(pHidden, s) === false, 'Hidden key should not show')

const sNoSingles = { ...s, singles: false }
assert(keyShows(pCombo, sNoSingles) === true, 'Combination key still shows when singles=false')
assert(keyShows(pSingle, sNoSingles) === false, 'Single key should be filtered out when singles=false')
console.log('✔ keyShows filtering passed')

// 4. Test keyLabels transformation (words vs symbols)
const raw = ['Ctrl', 'Shift', 'Alt', 'Enter', 'P']
const words = keyLabels(raw, { labels: 'words' })
assert(words[0] === 'Ctrl' && words[1] === 'Shift' && words[3] === 'Enter', 'Words mode preserves original names')

const symbols = keyLabels(raw, { labels: 'symbols' })
assert(symbols[0] === '⌃' && symbols[1] === '⇧' && symbols[2] === '⌥' && symbols[3] === '↵', 'Symbols mode converts keys to symbols')
assert(symbols[4] === 'P', 'Regular key unchanged')
console.log('✔ keyLabels formatting passed')

// 5. Test activeKey discovery
const presses: KeyPress[] = [
  { t: 1.0, keys: ['Ctrl', 'S'] },
  { t: 3.0, keys: ['Ctrl', 'P'] }
]

assert(activeKey(presses, s, 0.5) === null, 'No key active before first press')
const a1 = activeKey(presses, s, 1.2)
assert(a1 !== null && a1.press.keys[1] === 'S', 'First key should be active at t=1.2')
assert(Math.abs(a1!.age - 0.2) < 1e-4, 'Age should be 0.2s')

assert(activeKey(presses, s, 2.6) === null, 'First key should expire after hold=1.4s (t=2.4s)')
const a2 = activeKey(presses, s, 3.5)
assert(a2 !== null && a2.press.keys[1] === 'P', 'Second key should be active at t=3.5')

const sOff = { ...s, show: false }
assert(activeKey(presses, sOff, 3.5) === null, 'Should return null when show=false')
console.log('✔ activeKey timeline discovery passed')

// 6. Test drawKeycaps canvas rendering without errors
class MockCanvasContext {
  save() {}
  restore() {}
  translate() {}
  scale() {}
  beginPath() {}
  roundRect() {}
  fill() {}
  stroke() {}
  fillText() {}
  measureText(txt: string) { return { width: txt.length * 10 } }
  set font(v: string) {}
  set fillStyle(v: any) {}
  set strokeStyle(v: any) {}
  set lineWidth(v: number) {}
  set shadowColor(v: string) {}
  set shadowBlur(v: number) {}
  set shadowOffsetY(v: number) {}
  set globalAlpha(v: number) {}
  set textAlign(v: string) {}
  set textBaseline(v: string) {}
}

const mockCtx = new MockCanvasContext() as unknown as CanvasRenderingContext2D
const styles = ['dark', 'light', 'accent', 'custom'] as const
const positions = ['top-left', 'top', 'top-right', 'bottom-left', 'bottom', 'bottom-right'] as const
const animations = ['pop', 'slide', 'fade'] as const

for (const st of styles) {
  for (const pos of positions) {
    for (const anim of animations) {
      drawKeycaps(mockCtx, ['Ctrl', 'Shift', 'P'], { ...s, style: st, position: pos, animation: anim }, 0.5, 1920, 1080, 1)
    }
  }
}
console.log('✔ drawKeycaps variations executed successfully')

console.log('All Keystroke Overlay tests PASSED!')
