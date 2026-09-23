import type { AppSettings, EditState, Project, TextItem, ZoomSegment } from './types'

export const uid = (p = ''): string => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

export function defaultEdit(duration: number): EditState {
  return {
    aspect: '16:9',
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
      clickEffect: 'ripple',
      clickColor: '#3b82f6',
      clickBounce: 1.6,
      bounceMs: 300,
      sway: 0.08,
      hideIdle: false,
      highlight: false,
      highlightColor: '#ffe678',
      highlightSize: 1,
      hiddenClicks: []
    },
    zoom: { enabled: true, auto: true, autoScale: 1.6, master: 1, ease: 0.6, segments: [] },
    clips: [{ id: uid('c'), start: 0, end: duration, speed: 1 }],
    texts: [],
    assets: [],
    overlays: [],
    audioClips: [],
    webcam: { show: true, shape: 'circle', size: 0.24, x: 0.86, y: 0.8, border: 4, borderColor: '#ffffff', shadow: true, mirror: true },
    audio: { micMuted: false, micVolume: 1, systemMuted: false, systemVolume: 0.8, webcamMuted: true, musicVolume: 0.25, musicMuted: false, syncOffset: 0 },
    export: { resolution: 1080, fps: 30, quality: 'high', format: 'mp4' }
  }
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
    anim: 'pop',
    letterSpacing: 0
  }
}

export function newZoom(t: number, x = 0.5, y = 0.5): ZoomSegment {
  return { id: uid('z'), start: t, end: t + 2.5, scale: 1.6, x, y, follow: true }
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
    overlays: e.overlays ?? [],
    audioClips: e.audioClips ?? [],
    export: { ...d.export, ...e.export },
    clips: e.clips?.length ? e.clips : d.clips,
    texts: e.texts ?? []
  }
  return p
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
  { id: 'stepBack', label: 'Back one frame', def: 'ArrowLeft' },
  { id: 'stepForward', label: 'Forward one frame', def: 'ArrowRight' },
  { id: 'jumpBack', label: 'Back one second', def: 'Shift+ArrowLeft' },
  { id: 'jumpForward', label: 'Forward one second', def: 'Shift+ArrowRight' },
  { id: 'timelineIn', label: 'Zoom timeline in', def: '=' },
  { id: 'timelineOut', label: 'Zoom timeline out', def: '-' },
  { id: 'export', label: 'Export', def: 'Ctrl+E' },
  { id: 'import', label: 'Import media', def: 'Ctrl+I' },
  { id: 'settings', label: 'Open settings', def: 'Ctrl+,' },
  { id: 'fullscreen', label: 'Full screen preview', def: 'F' },
  { id: 'stopRecording', label: 'Stop recording (works in any app)', def: 'Alt+Shift+S', global: true }
]

export function defaultSettings(): AppSettings {
  return {
    shortcuts: Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.def])),
    exportSound: { enabled: true, sound: 'chime', volume: 0.7 },
    reduceTransparency: false,
    theme: 'dark',
    captureEngine: 'auto'
  }
}
