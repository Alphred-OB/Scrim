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
/** glow = colored light around the cursor, dim = darken everything else, ring = outlined circle */
export type SpotlightMode = 'glow' | 'dim' | 'ring'
/** always, only while the cursor moves, or only around clicks */
export type SpotlightWhen = 'always' | 'moving' | 'clicks'
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
  highlight: boolean // spotlight around cursor
  highlightMode: SpotlightMode
  highlightColor: string // glow / ring color
  highlightSize: number // multiplier
  highlightOpacity: number // 0..1 strength of the glow or ring
  highlightSoftness: number // 0 = hard edge, 1 = fully feathered
  highlightDim: number // 0..0.9 how dark everything else gets in "dim" mode
  highlightDimColor: string // shade color used by "dim" mode
  highlightRing: number // ring thickness multiplier (ring mode)
  highlightWhen: SpotlightWhen
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
  /** timeline layer; items on different layers can overlap in time. Higher layers draw on top. */
  lane?: number
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
  lane?: number
  trimStart: number // seconds into the asset
  x: number // center, 0..1 of output
  y: number
  w: number // width as fraction of output width
  radius: number // px at 1080p
  shadow: boolean
  opacity: number
  volume: number
  muted: boolean
  /** pip = floating box, frame = plays inside the recording's frame (replaces it), full = covers everything */
  mode: OverlayMode
  fit: 'contain' | 'cover' // how frame/full media fills its area
  /** @deprecated use mode; kept so old projects migrate */
  fullscreen?: boolean
}

export type OverlayMode = 'pip' | 'frame' | 'full'

export type TransitionType =
  | 'none' | 'fade' | 'fade-white' | 'flash' | 'blur' | 'morph' | 'zoom' | 'zoom-out' | 'spin'
  | 'whip' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'iris' | 'wipe' | 'pixelate' | 'glitch'
export type TransitionDir = 'none' | 'left' | 'right' | 'up' | 'down'
export type TransitionEase = 'smooth' | 'linear' | 'snappy' | 'gentle'
export interface Transition { type: TransitionType; duration: number; direction?: TransitionDir; ease?: TransitionEase }
export interface TransitionSettings {
  intro: Transition // start of the video
  outro: Transition // end of the video
  cut: Transition // used at every cut unless the cut has its own
  perCut: Record<string, Transition> // key = id of the clip after the cut
  /** transitions placed anywhere on the Transitions track (source seconds) */
  items: TransitionItem[]
}
/** A transition placed on the Transitions track: it peaks in the middle of start..end. */
export interface TransitionItem { id: string; type: TransitionType; start: number; end: number; direction?: TransitionDir; ease?: TransitionEase }

export type EffectLook =
  | 'none' | 'vivid' | 'punchy' | 'warm' | 'cool' | 'cinematic' | 'cyberpunk' | 'dreamy' | 'faded' | 'matte'
  | 'vintage' | 'sepia' | 'high-key' | 'low-key' | 'mono' | 'noir' | 'invert'
export interface EffectSettings {
  look: EffectLook
  brightness: number // 1 = unchanged
  contrast: number
  saturation: number
  vignette: number // 0..1
  grain: number // 0..1
  bloom: number // 0..1 soft glow on bright parts
  blur: number // 0..1 focus blur
  pixelate: number // 0..1
  scanlines: number // 0..1 old monitor lines
}

/** An effect on part of the video (Effects track). It replaces the whole-video effect while it plays. */
export interface EffectClip extends EffectSettings { id: string; start: number; end: number; lane?: number; name: string }

export interface AudioClip {
  id: string
  assetId: string
  start: number
  end: number
  lane?: number
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
  transitions: TransitionSettings
  effects: EffectSettings
  effectClips: EffectClip[]
  /** eye / speaker buttons on the timeline tracks */
  tracks: { media: boolean; text: boolean; audio: boolean; effects: boolean }
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
  state: 'idle' | 'countdown' | 'recording' | 'paused' | 'stopping' | 'error'
  elapsed: number
  countdown?: number
  error?: string
  engine?: string
}

// ---- app wide settings (not per project) ----
export type ExportSound = 'chime' | 'pop' | 'success' | 'custom'
export interface ThemeColors { base: 'dark' | 'light'; bg: string; panel: string; text: string; accent: string }
export type ExportProgressStyle = 'wavy' | 'ring' | 'liquid' | 'dots' | 'orbit' | 'bar'
export interface AppSettings {
  shortcuts: Record<string, string> // action id -> key combo like "Ctrl+Z"
  exportSound: { enabled: boolean; sound: ExportSound; customPath?: string; volume: number }
  reduceTransparency: boolean
  /** 'dark', 'light', 'system', a preset id from lib/theme.ts, or 'custom' */
  theme: string
  customTheme?: ThemeColors
  uiFont: string
  uiScale: number // 0.8..1.3 interface zoom
  exportProgress: ExportProgressStyle
  exportCelebrate: boolean // confetti when an export finishes
  captureEngine: 'auto' | 'dda' | 'gdi'
  /** seconds the arrow keys move the playhead (0 = one frame); Shift moves 5x */
  arrowStep: number
  /** animated line around the area being recorded */
  recordBorder: boolean
  /** false until the welcome tour has been finished or skipped */
  onboarded: boolean
}
