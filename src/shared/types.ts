// Shared data model between main and renderer.
// All editor times are in SOURCE seconds (time inside screen.mp4), so cuts never move other layers.

export type CaptureKind = 'screen' | 'window'

export interface CaptureSource {
  id: string // electron desktopCapturer id, e.g. "screen:0:0" or "window:1234:0"
  name: string
  kind: CaptureKind
  thumbnail: string // data url
  appIcon?: string
  displayId?: string
}

export type WebcamShape = 'circle' | 'rounded' | 'square'
export type Corner = 'br' | 'bl' | 'tr' | 'tl'

export interface WebcamRecordOptions {
  enabled: boolean
  deviceId?: string
  quality: 480 | 720 | 1080
  shape: WebcamShape
  size: number // 0.1..0.45 of the output short side
  corner: Corner
  showBubble: boolean // floating preview bubble while recording
}

export interface RecordOptions {
  sourceId: string
  sourceName: string
  kind: CaptureKind
  fps: 30 | 60
  mic: boolean
  micDeviceId?: string
  systemAudio: boolean
  countdown: number // seconds, 0 = none
  webcam?: WebcamRecordOptions
}

export interface CursorSample { t: number; x: number; y: number } // t = seconds from video start, x/y normalized 0..1 in capture rect
export interface ClickEvent { t: number; x: number; y: number; button: number; up?: number }
export interface CursorData {
  width: number
  height: number
  samples: CursorSample[]
  clicks: ClickEvent[]
  /** Source time ranges with no cursor data (e.g. a joined video that wasn't recorded in Scrim). The cursor is hidden there. */
  hidden?: [number, number][]
}

export interface MediaInfo {
  path: string // absolute path
  offset: number // seconds: where this track starts relative to screen video t=0 (may be negative)
}

export interface ProjectMedia {
  /** fps = container rate; realFps = unique frames per second actually captured (what the PC managed) */
  screen: { path: string; width: number; height: number; duration: number; fps: number; realFps?: number }
  mic?: MediaInfo
  system?: MediaInfo
  webcam?: MediaInfo & { width: number; height: number }
  cursor?: string // path to cursor.json
  engine?: string // capture engine used, for diagnostics
}

export type Aspect = 'auto' | '16:9' | '9:16' | '1:1' | '4:3' | '4:5' | '21:9'

export interface GradientStop { pos: number; color: string }
export interface GradientDef { kind: 'linear' | 'radial'; angle: number; stops: GradientStop[] }

export type BackgroundType = 'wallpaper' | 'live' | 'image' | 'video' | 'color' | 'gradient'
export interface LiveBackground {
  id: string // built in animated scene
  speed: number
  colors: [string, string, string] // background, main, accent
}
export interface BackgroundSettings {
  type: BackgroundType
  wallpaper: string // built-in procedural wallpaper id
  live: LiveBackground
  imagePath?: string
  videoPath?: string
  color: string
  gradient: GradientDef
  blur: number // px at 1080p
  dim: number // 0..1 dark overlay
}

export interface FrameSettings {
  padding: number // % of output short edge
  radius: number // % of content short edge
  shadow: number // 0..100 intensity
  border: number // px at 1080p
  borderColor: string
  browserBar: boolean
  inset: number
}

export interface CropSettings { top: number; bottom: number; left: number; right: number } // %

export type CursorStyle = string // id from the cursor library (renderer/features/editor/engine/cursors.ts)
export type ClickEffect = 'none' | 'ripple' | 'ring' | 'pulse'
export interface CursorSettings {
  show: boolean
  style: CursorStyle
  color: string // pointer fill
  outline: string // pointer outline
  outlineWidth: number // multiplier of the style's default outline
  shadow: number // 0..1
  opacity: number // 0..1
  size: number // multiplier
  smoothing: number // 0..1
  clickEffect: ClickEffect
  clickColor: string
  clickBounce: number // 1 = none
  bounceMs: number
  sway: number
  hideIdle: boolean
  highlight: boolean // soft spotlight around cursor
  highlightColor: string
  highlightSize: number // multiplier
  hiddenClicks: number[] // click times (rounded ms) whose effect is switched off
}

export interface ZoomSegment {
  id: string
  start: number
  end: number
  scale: number
  x: number // 0..1 focus (used when follow = false)
  y: number
  follow: boolean // follow cursor inside the segment
  auto?: boolean // created by automatic click detection
}

export interface ZoomSettings {
  enabled: boolean
  auto: boolean // automatic zooms on clicks
  autoScale: number // zoom depth for automatic zooms
  master: number // global multiplier for zoom depth
  ease: number // ramp seconds
  segments: ZoomSegment[]
}

export interface Clip { id: string; start: number; end: number; speed: number } // kept ranges of source

export type TextAnim = 'none' | 'fade' | 'slide-up' | 'pop' | 'typewriter'
export interface TextItem {
  id: string
  start: number
  end: number
  text: string
  x: number // 0..1 center, relative to output canvas
  y: number
  font: string
  size: number // px at 1080p
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  bg: string // '' for none
  bgOpacity: number
  padding: number
  radius: number
  align: 'left' | 'center' | 'right'
  shadow: boolean
  anim: TextAnim
  letterSpacing: number
}

// ---- imported media ----
export type AssetKind = 'video' | 'audio' | 'image'
export interface Asset {
  id: string
  kind: AssetKind
  name: string
  path: string
  duration: number // 0 for images
  width: number
  height: number
  hasAudio: boolean
}

/** A video or image placed on top of the recording (picture in picture, logo, b-roll). */
export interface OverlayClip {
  id: string
  assetId: string
  start: number // timeline (source) seconds
  end: number
  trimStart: number // seconds into the asset
  x: number // center, 0..1 of output
  y: number
  w: number // width as fraction of output width
  radius: number // px at 1080p
  shadow: boolean
  opacity: number
  volume: number
  muted: boolean
  fullscreen: boolean // cover the whole canvas (b-roll)
}

export interface AudioClip {
  id: string
  assetId: string
  start: number
  end: number
  trimStart: number
  volume: number
  muted: boolean
  fadeIn: number
  fadeOut: number
}

export interface WebcamSettings {
  show: boolean
  shape: WebcamShape
  size: number // fraction of output short side
  x: number // center 0..1 of output
  y: number
  border: number // px at 1080p
  borderColor: string
  shadow: boolean
  mirror: boolean
}

export interface AudioSettings {
  micMuted: boolean
  micVolume: number
  systemMuted: boolean
  systemVolume: number
  webcamMuted: boolean
  musicPath?: string
  musicVolume: number
  musicMuted: boolean
  syncOffset: number // seconds, shifts recorded audio/webcam against the screen video
}

export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'gif'
export interface ExportSettings {
  resolution: number // short side in px (480, 720, 1080, 1440, 2160) or 0 = original size
  fps: number
  quality: 'low' | 'medium' | 'high' | 'max'
  format: ExportFormat
}

export interface EditState {
  aspect: Aspect
  background: BackgroundSettings
  frame: FrameSettings
  crop: CropSettings
  cursor: CursorSettings
  zoom: ZoomSettings
  clips: Clip[]
  texts: TextItem[]
  assets: Asset[]
  overlays: OverlayClip[]
  audioClips: AudioClip[]
  webcam: WebcamSettings
  audio: AudioSettings
  export: ExportSettings
}

export interface Project {
  version: 1
  id: string
  name: string
  createdAt: number
  updatedAt: number
  dir: string
  media: ProjectMedia
  edit: EditState
}

export interface ProjectSummary {
  id: string
  name: string
  dir: string
  createdAt: number
  updatedAt: number
  duration: number
  thumb?: string
}

export interface Preset {
  id: string
  name: string
  aspect: Aspect
  background: BackgroundSettings
  frame: FrameSettings
  cursor: CursorSettings
  webcam?: WebcamSettings
}

export interface RecorderStatus {
  state: 'idle' | 'countdown' | 'recording' | 'stopping' | 'error'
  elapsed: number
  countdown?: number
  error?: string
  engine?: string
}

// ---- app wide settings (not per project) ----
export type ExportSound = 'chime' | 'pop' | 'success' | 'custom'
export interface AppSettings {
  shortcuts: Record<string, string> // action id -> key combo like "Ctrl+Z"
  exportSound: { enabled: boolean; sound: ExportSound; customPath?: string; volume: number }
  reduceTransparency: boolean
  theme: 'dark' | 'light' | 'system'
  captureEngine: 'auto' | 'dda' | 'gdi'
}
