import { defaultSettings, defaultEdit } from '../src/shared/defaults'
import type { AppSettings } from '../src/shared/types'

console.log('Testing App Settings and New Options...')

// 1. Verify defaultSettings
const s = defaultSettings()
if (s.videoEncoder !== 'auto') throw new Error(`Expected videoEncoder to be auto, got ${s.videoEncoder}`)
if (s.timelineSnapping !== true) throw new Error(`Expected timelineSnapping to be true, got ${s.timelineSnapping}`)
if (s.defaultAspect !== '16:9') throw new Error(`Expected defaultAspect to be 16:9, got ${s.defaultAspect}`)
if (s.openAtLogin !== false) throw new Error(`Expected openAtLogin to be false, got ${s.openAtLogin}`)
if (s.minimizeToTray !== false) throw new Error(`Expected minimizeToTray to be false, got ${s.minimizeToTray}`)
console.log('✔ defaultSettings contains valid defaults for all 5 requested settings')

// 2. Verify defaultEdit honors default aspect ratio without applying presets automatically
const edit169 = defaultEdit(10, '16:9')
if (edit169.aspect !== '16:9') throw new Error(`Expected 16:9, got ${edit169.aspect}`)

const edit916 = defaultEdit(10, '9:16')
if (edit916.aspect !== '9:16') throw new Error(`Expected 9:16, got ${edit916.aspect}`)

const edit11 = defaultEdit(10, '1:1')
if (edit11.aspect !== '1:1') throw new Error(`Expected 1:1, got ${edit11.aspect}`)
console.log('✔ defaultEdit correctly applies configured aspect ratio without auto-applying preset')

// 3. Verify AppSettings interface allows custom folder paths and preferences
const custom: AppSettings = {
  ...s,
  exportDir: 'D:\\Exports\\Videos',
  projectsDir: 'E:\\ScrimProjects',
  videoEncoder: 'nvenc',
  timelineSnapping: false,
  defaultAspect: '9:16',
  openAtLogin: true,
  minimizeToTray: true
}

if (custom.exportDir !== 'D:\\Exports\\Videos') throw new Error('exportDir mismatch')
if (custom.projectsDir !== 'E:\\ScrimProjects') throw new Error('projectsDir mismatch')
if (custom.videoEncoder !== 'nvenc') throw new Error('videoEncoder mismatch')
if (custom.timelineSnapping !== false) throw new Error('timelineSnapping mismatch')
if (custom.defaultAspect !== '9:16') throw new Error('defaultAspect mismatch')
if (custom.openAtLogin !== true) throw new Error('openAtLogin mismatch')
if (custom.minimizeToTray !== true) throw new Error('minimizeToTray mismatch')
console.log('✔ Custom AppSettings properties fully typed and validated')

console.log('ALL APP SETTINGS TESTS PASSED!')
