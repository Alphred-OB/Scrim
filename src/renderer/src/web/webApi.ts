// The live demo on the website runs Scrim's real editor in a browser. This file stands in for the
// desktop app's backend (files, ffmpeg, recording): the sample project comes from the website,
// edits are kept in this browser, and exports are handed over as a download.
import type { Api, MuxJobIn } from '@/lib/api'
import type { AppSettings, Preset, Project } from '@shared/types'
import { defaultSettings } from '@shared/defaults'

export const DEMO_DIR = '/demo'
const BASE = new URL('demo/', document.baseURI).href // the sample files, next to the app
const KEY_PROJECT = 'scrim-demo-project'
const KEY_SETTINGS = 'scrim-demo-settings'
const KEY_PRESETS = 'scrim-demo-presets'

const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k)
      return v ? (JSON.parse(v) as T) : null
    } catch {
      return null
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {}
  }
}

/** A very small in-memory file system for the exporter's temporary files. */
const files = new Map<string, { parts: { pos: number; data: Uint8Array }[]; blob?: Blob; url?: string }>()
const assemble = (p: string): Blob => {
  const f = files.get(p)
  if (!f) throw new Error('File not found')
  if (f.blob) return f.blob
  const size = f.parts.reduce((m, x) => Math.max(m, x.pos + x.data.byteLength), 0)
  const out = new Uint8Array(size)
  for (const x of f.parts) out.set(x.data, x.pos)
  f.blob = new Blob([out])
  f.parts = []
  return f.blob
}
const nameOf = (p: string) => p.split('/').pop() || 'scrim-video'
const download = (blob: Blob, name: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}
/** Files people pick (background image, music, pictures) become blob: URLs we can load directly. */
const pickFile = (accept: string): Promise<string | null> =>
  new Promise((res) => {
    const i = document.createElement('input')
    i.type = 'file'
    i.accept = accept
    i.onchange = () => res(i.files?.[0] ? URL.createObjectURL(i.files[0]) + '#' + i.files[0].name : null)
    i.addEventListener('cancel', () => res(null))
    i.click()
  })
const notInBrowser = (what: string) => () => Promise.reject(new Error(`${what} needs the desktop app. Download Scrim to use it.`))

let listeners: Record<string, Set<(...a: any[]) => void>> = {}
export const emit = (ch: string, ...a: unknown[]) => listeners[ch]?.forEach((cb) => cb(...a))

async function canMakeMp4(): Promise<boolean> {
  try {
    return !!(await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1920, height: 1080 })).supported
  } catch {
    return false
  }
}

async function loadDemo(): Promise<Project> {
  const saved = store.get<Project>(KEY_PROJECT)
  const fresh = (await (await fetch(BASE + 'project.json')).json()) as Project
  const fix = (p: Project): Project => {
    p.dir = DEMO_DIR
    p.media.screen.path = BASE + 'screen.webm'
    p.media.cursor = BASE + 'cursor.json'
    if (p.media.webcam) delete p.media.webcam
    return p
  }
  // keep someone's edits between visits, unless the sample itself changed
  const p = fix(saved && saved.updatedAt >= fresh.updatedAt && saved.createdAt === fresh.createdAt ? saved : fresh)
  // some browsers can't make MP4 files; start them on WebM so the first export just works
  if (p.edit.export.format === 'mp4' && !(await canMakeMp4())) p.edit.export.format = 'webm'
  return p
}

export function createWebApi(): Api {
  const api: Partial<Api> = {
    // ---- projects ----
    loadProject: () => loadDemo(),
    saveProject: async (p) => store.set(KEY_PROJECT, p),
    listProjects: async () => [],
    projectsRoot: async () => DEMO_DIR,
    readJson: async <T>(p: string) => (await (await fetch(p)).json()) as T,
    loadPresets: async () => store.get<Preset[]>(KEY_PRESETS) ?? [],
    savePresets: async (l) => store.set(KEY_PRESETS, l),
    getSettings: async () => ({ ...defaultSettings(), ...store.get<Partial<AppSettings>>(KEY_SETTINGS), onboarded: true, toursSeen: ['welcome', 'home', 'editor', 'practice', 'record', 'guide', 'captions'] }),
    saveSettings: async (s) => (store.set(KEY_SETTINGS, s), s),
    sampleGetDir: async () => DEMO_DIR,
    // ---- files ----
    fileOpen: async (p) => void files.set(p, { parts: [] }),
    fileWrite: async (p, d, pos) => void files.get(p)?.parts.push({ pos, data: new Uint8Array(d) }),
    fileClose: async (p) => void (files.has(p) && assemble(p)),
    fileRemove: async (p) => void files.delete(p),
    tmpDir: async () => '/tmp',
    saveFile: async (name) => '/downloads/' + name,
    openFile: async (_title, filters) => pickFile(filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',')),
    copyAsset: async (_dir, file) => file,
    pathForFile: (f: File) => URL.createObjectURL(f) + '#' + f.name,
    importAssets: async (_dir, paths) => ({ assets: [], errors: paths?.length ? ['Adding your own media needs the desktop app.'] : [] }),
    writeText: async (p, text) => download(new Blob([text], { type: 'text/plain' }), nameOf(p)),
    // ---- export: the video is encoded right here in the page ----
    mux: async (job: MuxJobIn) => {
      if (job.format === 'gif') throw new Error('GIF export needs the desktop app. Try MP4 or WebM here.')
      const blob = assemble(job.videoPath)
      files.set(job.outPath, { parts: [], blob: new Blob([blob], { type: job.format === 'webm' ? 'video/webm' : 'video/mp4' }) })
      emit('export:progress', 1)
      download(files.get(job.outPath)!.blob!, nameOf(job.outPath))
    },
    showItem: async (p) => {
      const b = files.get(p)?.blob
      if (b) download(b, nameOf(p))
    },
    openPath: async (p) => {
      const b = files.get(p)?.blob
      if (b) window.open(URL.createObjectURL(b), '_blank')
      return ''
    },
    // ---- things the browser can do a simpler way ----
    peaks: async () => [],
    proxyEnsure: async (dir) => ({ dir, status: 'none' as const }),
    screenChange: async () => ({ step: 0.25, values: [] }),
    pickSpeech: async () => -1,
    guideStills: async (path, times) => {
      // grab the frames with a video element instead of ffmpeg
      const v = document.createElement('video')
      v.muted = true
      v.crossOrigin = 'anonymous'
      v.src = path
      await new Promise((r, j) => ((v.onloadeddata = r), (v.onerror = j)))
      const c = document.createElement('canvas')
      c.width = 960
      c.height = Math.round((960 * v.videoHeight) / v.videoWidth)
      const g = c.getContext('2d')!
      const out: string[] = []
      for (const t of times) {
        v.currentTime = t
        await new Promise((r) => (v.onseeked = r))
        g.drawImage(v, 0, 0, c.width, c.height)
        out.push(c.toDataURL('image/jpeg', 0.85))
      }
      return out
    },
    engines: async () => ({ dda: false, platform: 'web' }),
    updateStatus: async () => ({ state: 'idle' }) as never,
    checkForUpdate: async () => ({ state: 'idle' }) as never,
    installUpdate: async () => false,
    feedbackEnabled: async () => false,
    crashEnabled: async () => false,
    crashTest: async () => false,
    recorderStatus: async () => ({ state: 'idle' }) as never,
    prompter: async () => {},
    importScript: async () => null,
    listSources: async () => [],
    detectEncoder: async () => 'browser',
    notify: async () => {},
    setZoom: () => {},
    setTheme: async () => {},
    openLogFolder: async () => {},
    openProjectDialog: async () => null,
    importVideo: async () => null,
    deleteProject: async () => {},
    openEditor: () => {},
    // ---- desktop only ----
    startRecording: notInBrowser('Recording'),
    stopRecording: async () => {},
    cancelRecording: async () => {},
    restartRecording: async () => {},
    pauseRecording: async () => {},
    resumeRecording: async () => {},
    transcribeGroq: notInBrowser('Making captions'),
    speechPcm: notInBrowser('Making captions'),
    cleanVoice: notInBrowser('Clear voice'),
    exportGuide: notInBrowser('Saving a guide'),
    joinVideo: notInBrowser('Joining videos'),
    saveAudio: notInBrowser('Saving audio'),
    sampleBegin: notInBrowser('Making a sample'),
    sampleFinish: notInBrowser('Making a sample'),
    sendFeedback: notInBrowser('Sending feedback from here'),
    // ---- events ----
    on: (ch, cb) => {
      ;(listeners[ch] ??= new Set()).add(cb)
      return () => listeners[ch]?.delete(cb)
    },
    onCall: () => {}
  }
  // anything we missed fails politely instead of crashing the editor
  return new Proxy(api as Api, {
    get: (t, k: string) => (k in t ? (t as any)[k] : () => Promise.reject(new Error(`${k} isn't available in the browser demo.`)))
  })
}

export function resetDemo(): void {
  try {
    localStorage.removeItem(KEY_PROJECT)
  } catch {}
  location.reload()
}
