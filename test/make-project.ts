import { writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { defaultEdit, newText } from '../src/shared/defaults'
import { autoZoomFromClicks } from '../src/shared/autozoom'
import type { CursorData, Project } from '../src/shared/types'

const variant = process.argv[2] || 'a'
const dir = join(homedir(), 'Documents', 'Scrim', 'test-' + variant)
mkdirSync(join(dir, 'assets'), { recursive: true })
for (const f of ['screen.mp4', 'mic.webm', 'system.webm', 'webcam.webm']) copyFileSync('/tmp/dftest/' + f, join(dir, f))
copyFileSync('/tmp/dftest/bg.mp4', join(dir, 'assets', 'bg.mp4'))
const dur = 8
const samples = []
for (let t = 0; t <= dur; t += 1 / 60) samples.push({ t: +t.toFixed(3), x: 0.5 + 0.3 * Math.cos(t), y: 0.5 + 0.3 * Math.sin(t * 1.3) })
const clicks = [1.2, 1.9, 4.5, 6.2].map((t) => ({ t, x: 0.5 + 0.3 * Math.cos(t), y: 0.5 + 0.3 * Math.sin(t * 1.3), button: 1, up: t + 0.1 }))
const cursor: CursorData = { width: 1920, height: 1080, samples, clicks }
writeFileSync(join(dir, 'cursor.json'), JSON.stringify(cursor))
const edit = defaultEdit(dur)
edit.zoom.segments = autoZoomFromClicks(cursor, dur)
edit.cursor.highlight = true
edit.cursor.color = '#ff3b30'
edit.cursor.hiddenClicks = [Math.round(clicks[1].t * 1000)]
edit.clips = [{ id: 'c1', start: 0, end: 3, speed: 1 }, { id: 'c2', start: 4, end: 8, speed: 2 }]
const tx = newText(0.5); tx.end = 5; tx.text = 'Hello from Scrim\nsecond line'; tx.underline = true
edit.texts = [tx]
if (variant === 'b') { edit.background.type = 'video'; edit.background.videoPath = join(dir, 'assets', 'bg.mp4'); edit.background.blur = 10; edit.aspect = '9:16'; edit.frame.browserBar = true; edit.export.format = 'gif' }
const p: Project = {
  version: 1, id: 'test-' + variant, name: 'Test ' + variant, createdAt: Date.now(), updatedAt: Date.now(), dir,
  media: { screen: { path: join(dir, 'screen.mp4'), width: 1920, height: 1080, duration: dur, fps: 30, ...(variant === 'a' ? { realFps: 27 } : {}) }, mic: { path: join(dir, 'mic.webm'), offset: 0.5 }, system: { path: join(dir, 'system.webm'), offset: -0.3 }, cursor: join(dir, 'cursor.json'), webcam: { path: join(dir, 'webcam.webm'), offset: 0.2, width: 640, height: 480 } },
  edit
}
writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 1))
console.log(dir)
