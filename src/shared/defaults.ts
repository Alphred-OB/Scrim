import type { AppSettings, Aspect, EditState, KeyframeEase, Project, TextItem, TextMotion, ZoomKeyframe, ZoomSegment, EffectSettings } from './types'

export const uid = (p = ''): string => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

export function defaultEdit(duration: number, aspect: Aspect = '16:9'): EditState {
  return {
    aspect,
    background: {
      type: 'wallpaper',
      wallpaper: 'aurora',
      live: { id: 'aurora-flow', speed: 1, colors: ['#0b1026', '#2f6bff', '#a855f7'] },
      color: '#1c1f26',
      gradient: {
        kind: 'linear',
        angle: 135,
        stops: [
          { pos: 0, color: '#38bdf8' },
          { pos: 0.5, color: '#6366f1' },
          { pos: 1, color: '#0f172a' }
        ]
      },
      blur: 0,
      dim: 0
    },
    frame: { padding: 7, radius: 2.5, shadow: 60, border: 0, borderColor: '#ffffff33', browserBar: false, inset: 0 },
    crop: { top: 0, bottom: 0, left: 0, right: 0 },
    cursor: {
      show: true,
      style: 'mac',
      color: '#000000',
      outline: '#ffffff',
      outlineWidth: 1,
      shadow: 0.6,
      opacity: 1,
      size: 2,
      smoothing: 0.55,
      motionMode: 'cinematic',
      curvature: 0.5,
      clickDwell: 0.12,
      clickEffect: 'ripple',
      clickColor: '#3b82f6',
      clickBounce: 1.6,
      bounceMs: 300,
      sway: 0.08,
      hideIdle: false,
      highlight: false,
      highlightMode: 'glow',
      highlightColor: '#ffe678',
      highlightSize: 1,
      highlightOpacity: 0.4,
      highlightSoftness: 1,
      highlightDim: 0.55,
      highlightDimColor: '#000000',
      highlightRing: 1,
      highlightWhen: 'always',
      hiddenClicks: [],
      clickSound: 'none',
      clickVolume: 0.6
    },
    zoom: { enabled: true, auto: true, autoScale: 1.6, master: 1, ease: 0.6, segments: [] },
    clips: [{ id: uid('c'), start: 0, end: duration, speed: 1 }],
    texts: [],
    keys: { show: true, style: 'dark', color: '#ff3b30', position: 'bottom', size: 1, radius: 1, hold: 1.4, animation: 'pop', labels: 'words', singles: true, hidden: [] },
    assets: [],
    overlays: [],
    audioClips: [],
    webcam: { show: true, shape: 'circle', size: 0.24, x: 0.86, y: 0.8, border: 4, borderColor: '#ffffff', shadow: true, mirror: true, bg: 'none', bgBlur: 0.6, bgColor: '#1d2230' },
    audio: { micMuted: false, micVolume: 1, systemMuted: false, systemVolume: 0.8, webcamMuted: true, musicVolume: 0.25, musicMuted: false, syncOffset: 0 },
    export: { resolution: 0, fps: 30, quality: 'high', format: 'mp4' }, // 0 = original: every recorded pixel is kept
    transitions: {
      intro: { type: 'none', duration: 0.6 },
      outro: { type: 'none', duration: 0.6 },
      cut: { type: 'none', duration: 0.5 },
      perCut: {},
      items: []
    },
    effects: defaultEffect(),
    effectClips: [],
    blurs: [],
    leadIn: 0,
    tracks: { media: true, text: true, audio: true, effects: true, blurs: true, keys: true }
  }
}

export function defaultEffect(): EffectSettings {
  return { look: 'none', brightness: 1, contrast: 1, saturation: 1, vignette: 0, grain: 0, bloom: 0, blur: 0, pixelate: 0, scanlines: 0 }
}

export function newText(t: number): TextItem {
  return {
    id: uid('t'),
    start: t,
    end: t + 3,
    text: 'Your text here',
    x: 0.5,
    y: 0.86,
    font: 'Inter',
    size: 54,
    bold: true,
    italic: false,
    underline: false,
    color: '#ffffff',
    bg: '#0b0d12',
    bgOpacity: 0.75,
    padding: 18,
    radius: 14,
    align: 'center',
    shadow: true,
    animIn: 'pop',
    animOut: 'fade',
    inDur: 0.45,
    outDur: 0.35,
    loop: 'none',
    letterSpacing: 0
  }
}

export function newZoomKeyframe(t: number, scale: number, x: number, y: number, ease: KeyframeEase = 'smooth'): ZoomKeyframe {
  return { id: uid('kf'), t, scale, x, y, ease }
}

export function newZoom(t: number, x = 0.5, y = 0.5): ZoomSegment {
  return { id: uid('z'), start: t, end: t + 2.5, scale: 1.6, x, y, follow: true }
}

export function newBlur(t: number, x = 0.5, y = 0.5) {
  return {
    id: uid('b'),
    start: t,
    end: t + 3,
    lane: undefined as number | undefined,
    x,
    y,
    w: 0.28,
    h: 0.1,
    type: 'blur' as const,
    radius: 8,
    amount: 0.6,
    darken: 0.15,
    color: '#000000'
  }
}

/** Fill in fields added in later versions so old project files keep working. */
export function migrateProject(p: Project): Project {
  const d = defaultEdit(p.media.screen.duration)
  const e = p.edit ?? d
  p.edit = {
    ...d,
    ...e,
    background: {
      ...d.background,
      ...e.background,
      gradient: { ...d.background.gradient, ...e.background?.gradient },
      live: { ...d.background.live, ...e.background?.live }
    },
    frame: { ...d.frame, ...e.frame },
    crop: { ...d.crop, ...e.crop },
    cursor: { ...d.cursor, ...e.cursor },
    zoom: { ...d.zoom, ...e.zoom },
    webcam: { ...d.webcam, ...e.webcam },
    audio: { ...d.audio, ...e.audio },
    assets: e.assets ?? [],
    // older projects had a fullscreen flag instead of a mode
    overlays: (e.overlays ?? []).map((o) => ({ ...o, mode: o.mode ?? (o.fullscreen ? 'full' : 'pip'), fit: o.fit ?? 'contain' })),
    audioClips: e.audioClips ?? [],
    export: { ...d.export, ...e.export },
    transitions: { ...d.transitions, ...e.transitions, perCut: { ...(e.transitions?.perCut ?? {}) }, items: e.transitions?.items ?? [] },
    effects: { ...d.effects, ...e.effects },
    effectClips: (e.effectClips ?? []).map((c) => ({ ...defaultEffect(), ...c })),
    blurs: (e.blurs ?? []).map((b) => ({ ...b, type: b.type ?? 'blur', radius: b.radius ?? 8, amount: b.amount ?? 0.6, darken: b.darken ?? 0.15 })),
    keys: { ...d.keys, ...(e.keys ?? {}) },
    tracks: { ...d.tracks, ...e.tracks },
    clips: e.clips?.length ? e.clips : d.clips,
    texts: (e.texts ?? []).map(migrateText)
  }
  // projects from before layers: spread overlapping items over layers so nothing is stacked
  for (const list of [p.edit.texts, p.edit.overlays, p.edit.audioClips, p.edit.effectClips, p.edit.transitions.items, p.edit.blurs] as { start: number; end: number; lane?: number }[][]) {
    if (list.every((x) => x.lane !== undefined)) continue
    const ends: number[] = []
    for (const it of [...list].sort((a, b) => a.start - b.start)) {
      let l = ends.findIndex((end) => end <= it.start + 1e-3)
      if (l < 0) l = ends.length
      ends[l] = it.end
      it.lane = l
    }
  }
  return p
}

/** Texts migration: cleans emojis and ensures in/out animations. */
function migrateText(t: TextItem): TextItem {
  const text = t.text ? t.text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE0F}]/gu, '').trim() : t.text
  if (t.animIn) return { ...t, text }
  const a = t.anim ?? 'fade'
  const animIn: TextMotion = a
  const animOut: TextMotion = a === 'typewriter' || a === 'pop' ? 'fade' : a
  return { ...t, text, animIn, animOut, inDur: a === 'typewriter' ? Math.max(0.4, text.length * 0.04) : 0.35, outDur: 0.35, loop: 'none' }
}

/** First layer where [start, end] doesn't overlap anything, starting from `from`. */
export function freeLane(list: { start: number; end: number; lane?: number; id?: string }[], start: number, end: number, from = 0, skipId?: string): number {
  for (let l = from; ; l++) {
    if (!list.some((x) => x.id !== skipId && (x.lane ?? 0) === l && x.start < end - 1e-3 && x.end > start + 1e-3)) return l
  }
}

export const FONTS = [
  'Inter',
  'Poppins',
  'Montserrat',
  'Playfair Display',
  'Bebas Neue',
  'JetBrains Mono',
  'Segoe UI',
  'Arial',
  'Georgia',
  'Impact',
  'Consolas'
]

export interface ShortcutDef { id: string; label: string; def: string; global?: boolean }
export const SHORTCUTS: ShortcutDef[] = [
  { id: 'playPause', label: 'Play / pause', def: 'Space' },
  { id: 'undo', label: 'Undo', def: 'Ctrl+Z' },
  { id: 'redo', label: 'Redo', def: 'Ctrl+Y' },
  { id: 'split', label: 'Split clip at playhead', def: 'S' },
  { id: 'delete', label: 'Delete selected', def: 'Delete' },
  { id: 'addZoom', label: 'Add zoom at playhead', def: 'Z' },
  { id: 'addText', label: 'Add text at playhead', def: 'T' },
  { id: 'stepBack', label: 'Step back (size set in General)', def: 'ArrowLeft' },
  { id: 'stepForward', label: 'Step forward (size set in General)', def: 'ArrowRight' },
  { id: 'jumpBack', label: 'Big step back (5x)', def: 'Shift+ArrowLeft' },
  { id: 'jumpForward', label: 'Big step forward (5x)', def: 'Shift+ArrowRight' },
  { id: 'frameBack', label: 'Back one frame', def: ',' },
  { id: 'frameForward', label: 'Forward one frame', def: '.' },
  { id: 'goStart', label: 'Go to start', def: 'Home' },
  { id: 'goEnd', label: 'Go to end', def: 'End' },
  { id: 'timelineIn', label: 'Zoom timeline in', def: '=' },
  { id: 'timelineOut', label: 'Zoom timeline out', def: '-' },
  { id: 'export', label: 'Export', def: 'Ctrl+E' },
  { id: 'import', label: 'Import media', def: 'Ctrl+I' },
  { id: 'settings', label: 'Open settings', def: 'Ctrl+,' },
  { id: 'fullscreen', label: 'Full screen preview', def: 'F' },
  { id: 'save', label: 'Save project', def: 'Ctrl+S' },
  { id: 'open', label: 'Open a project or video', def: 'Ctrl+O' },
  { id: 'stopRecording', label: 'Stop recording (works in any app)', def: 'Alt+Shift+S', global: true },
  { id: 'pauseRecording', label: 'Pause or resume recording (works in any app)', def: 'Alt+Shift+P', global: true }
]

export function defaultSettings(): AppSettings {
  return {
    shortcuts: Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.def])),
    exportSound: { enabled: true, sound: 'chime', volume: 0.7 },
    reduceTransparency: false,
    theme: 'dark',
    captureEngine: 'auto',
    videoEncoder: 'auto',
    timelineMagnet: false,
    defaultAspect: '16:9',
    openAtLogin: false,
    minimizeToTray: false,
    arrowStep: 0.5,
    recordBorder: true,
    onboarded: false,
    toursSeen: [],
    uiFont: 'Inter',
    uiScale: 1,
    exportProgress: 'wavy',
    exportCelebrate: true
  }
}
