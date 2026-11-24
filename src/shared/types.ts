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
  mirror?: boolean // mirror camera feed horizontally
  /** live background change, shown in the preview and the bubble; the editor starts with the same look */
  bg?: WebcamBg
  bgBlur?: number
  bgColor?: string
}

export interface RecordOptions {
  sourceId: string
  sourceName: string
  kind: CaptureKind
  fps: 30 | 60
  mic: boolean
  micDeviceId?: string
  noiseSuppression?: boolean
  systemAudio: boolean
  countdown: number // seconds, 0 = none
  webcam?: WebcamRecordOptions
  /** save keyboard shortcuts (Ctrl+C, Enter...) so they can be shown in the video. Plain typing is never saved. */
  keys?: boolean
}

/** One keyboard shortcut pressed while recording, e.g. { t: 3.2, keys: ['Ctrl', 'Shift', 'P'] } */
export interface KeyPress { t: number; keys: string[] }

/** How pressed shortcuts are shown on the video. */
export interface KeySettings {
  show: boolean
  style: 'dark' | 'light' | 'accent' | 'custom'
  /** keycap color for the custom style (text color is picked automatically) */
  color: string
  position: 'bottom' | 'bottom-left' | 'bottom-right' | 'top' | 'top-left' | 'top-right'
  size: number // 1 = default
  radius: number // 0 = square, 1 = default, 2 = pill
  hold: number // seconds each shortcut stays on screen
  animation: 'pop' | 'slide' | 'fade'
  /** 'words' shows Ctrl Shift Alt Win, 'symbols' shows ⌃ ⇧ ⌥ ⊞ */
  labels: 'words' | 'symbols'
  /** also show single keys like Enter, Esc or the arrows (not just combinations) */
  singles: boolean
  hidden: number[] // shortcut times (rounded ms) switched off
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
  /** keyboard shortcuts pressed while recording */
  keys?: KeyPress[]
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
export type CursorMotionMode = 'cinematic' | 'natural' | 'raw'
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
  motionMode?: CursorMotionMode // 'cinematic' (Bézier spline + minimum jerk), 'natural' (spring physics), or 'raw'
  curvature?: number // 0..1 tension / arc smoothness of Bézier spline
  clickDwell?: number // seconds to pause / stabilize on target around clicks
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
  clickSound: ClickSound // sound played on every click ('none' = silent)
  clickVolume: number // 0..1
}

export type ClickSound = 'none' | 'mouse' | 'soft' | 'trackpad' | 'mechanical' | 'pop' | 'tap' | 'digital' | 'camera'

export interface ZoomSegment {
  id: string
  start: number
  end: number
  scale: number
  x: number // 0..1 focus (used when follow = false)
  y: number
  follow: boolean // follow cursor inside the segment
  auto?: boolean // created by automatic click detection
  /** optional points inside the zoom that change scale and focus over time */
  keyframes?: ZoomKeyframe[]
}

export type KeyframeEase = 'smooth' | 'linear' | 'snappy'
export interface ZoomKeyframe { id: string; t: number; scale: number; x: number; y: number; ease?: KeyframeEase }

export interface ZoomSettings {
  enabled: boolean
  auto: boolean // automatic zooms on clicks
  autoScale: number // zoom depth for automatic zooms
  master: number // global multiplier for zoom depth
  ease: number // ramp seconds
  segments: ZoomSegment[]
}

export interface Clip { id: string; start: number; end: number; speed: number } // kept ranges of source

/** Old single animation (kept so old projects still load). */
export type TextAnim = 'none' | 'fade' | 'slide-up' | 'pop' | 'typewriter'
/** How text comes in or goes out. */
export type TextMotion =
  | 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop' | 'zoom' | 'drop'
  | 'blur' | 'wipe' | 'spin' | 'flip' | 'typewriter' | 'letters' | 'words'
/** What text does while it's on screen. */
export type TextLoop = 'none' | 'pulse' | 'float' | 'wiggle' | 'shake' | 'blink' | 'wave' | 'glow'
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
  /** @deprecated replaced by animIn / animOut */
  anim?: TextAnim
  animIn: TextMotion
  animOut: TextMotion
  inDur: number
  outDur: number
  loop: TextLoop
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
export interface TransitionItem { id: string; type: TransitionType; start: number; end: number; lane?: number; direction?: TransitionDir; ease?: TransitionEase }

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

export type BlurType = 'blur' | 'pixelate' | 'solid'
export interface BlurItem {
  id: string
  start: number
  end: number
  lane?: number
  x: number // center 0..1 relative to screen content
  y: number // center 0..1 relative to screen content
  w: number // width 0..1 relative to screen content
  h: number // height 0..1 relative to screen content
  type: BlurType
  radius: number // corner radius in px at 1080p
  amount: number // intensity (blur radius or pixel block size)
  darken: number // 0..1 darkness overlay for privacy guarantee
  color?: string // tint or solid color
}

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
  /** what replaces the room behind you: nothing, a blur, a color or a picture */
  bg: WebcamBg
  bgBlur: number // 0..1 strength of the blur
  bgColor: string
  bgImage?: string // path of a picture in the project's assets
}

export type WebcamBg = 'none' | 'remove' | 'blur' | 'color' | 'image'

/** The on screen script (teleprompter) shown while recording. It is kept out of the video. */
export interface PrompterSettings {
  text: string // lines starting with # are section titles
  show: boolean // open it automatically when a recording starts
  auto?: boolean // scroll by itself while recording (default on)
  size: number // font px
  speed: number // 1..10
  opacity: number // 0.3..1
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
  /** cleaned up copy of the voice (noise removed, level evened out), used instead of the mic when on */
  voiceClean?: boolean
  voiceCleanPath?: string
  voiceCleanStrength?: number // 0..1
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
  blurs: BlurItem[]
  /** keyboard shortcuts shown on the video */
  keys: KeySettings
  /**
   * Empty space before the recording starts (seconds), made by dragging the video later on the
   * timeline. That space uses negative source time, so intro text and media sit at t < 0.
   */
  leadIn: number
  /** eye / speaker buttons on the timeline tracks */
  tracks: { media: boolean; text: boolean; audio: boolean; effects: boolean; blurs?: boolean; keys?: boolean }
  /** what was said, word by word (made by Captions > Generate) */
  transcript?: Transcript
  captions?: CaptionSettings
  /** brand logo drawn on every frame */
  watermark?: Watermark | null
  /** 'follow' fills a different shaped video (like 9:16) with the recording and pans with the cursor */
  reframe?: 'fit' | 'follow'
  /** step by step guide made from the clicks */
  guide?: GuideStep[]
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
  /** preferred hardware or software video encoder */
  videoEncoder?: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'cpu'
  /** default directory for saved video exports */
  exportDir?: string
  /** custom directory where recordings and project folders are stored */
  projectsDir?: string
  /** whether magnetic snapping is enabled by default on the timeline */
  timelineSnapping?: boolean // old name, no longer used
  /** magnetic snapping and joining on the timeline (off by default: items move freely) */
  timelineMagnet?: boolean
  /** default aspect ratio for new projects */
  defaultAspect?: Aspect
  /** whether Scrim automatically starts when logging into Windows */
  openAtLogin?: boolean
  /** whether closing the Scrim window minimizes it to the system tray */
  minimizeToTray?: boolean
  /** seconds the arrow keys move the playhead (0 = one frame); Shift moves 5x */
  arrowStep: number
  /** animated line around the area being recorded */
  recordBorder: boolean
  /** false until the welcome tour has been finished or skipped */
  onboarded: boolean
  /** guided interface tours already shown ('home', 'editor') */
  toursSeen: string[]
  /** speech to text: Groq (fast, online, needs a key) or Whisper on this PC (offline after a one time download) */
  transcribeEngine?: 'auto' | 'groq' | 'local'
  groqKey?: string
  /** size of the offline speech model */
  localModel?: 'tiny' | 'base' | 'small'
  brandKits?: BrandKit[]
  prompter?: PrompterSettings
}

/** Where the app's self update is at (updates come from GitHub Releases). */
export type UpdateState = 'off' | 'idle' | 'checking' | 'downloading' | 'ready' | 'latest' | 'error'
export interface UpdateStatus { state: UpdateState; current: string; version?: string; progress?: number; error?: string; notes?: string }

// ---------------- speech, captions, guide, brand ----------------
/** A spoken word. Times are in the audio track's own time; add Transcript.offset to get video time. */
export interface TranscriptWord { t0: number; t1: number; w: string }
export interface Transcript {
  words: TranscriptWord[]
  /** where the audio track starts in the video (mic offset), without the sync offset */
  offset: number
  source: 'mic' | 'system' | 'screen'
  engine: 'groq' | 'local'
  lang?: string
  createdAt: number
}
export type CaptionLook = 'clean' | 'bold' | 'box' | 'karaoke' | 'neon' | 'minimal'
export interface CaptionSettings {
  show: boolean
  look: CaptionLook
  font: string
  size: number // px at 1080p
  color: string
  highlight: string // the word being spoken
  bg: string
  bgOpacity: number
  y: number // 0 top .. 1 bottom (center of the caption)
  maxChars: number // per line
  lines: 1 | 2
  uppercase: boolean
  /** words the person turned off (by start time in ms), e.g. a misheard word */
  hidden?: number[]
  /** fixed spellings: start time in ms -> text */
  fixes?: Record<string, string>
}
export type LogoCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export interface Watermark { path: string; pos: LogoCorner; size: number; opacity: number; margin: number }
export interface BrandKit {
  id: string
  name: string
  logoPath?: string
  logoPos: LogoCorner
  logoSize: number // share of the video width, 0.05..0.3
  logoOpacity: number
  colors: string[] // [main, accent, dark, light]
  font: string
  introPath?: string
  outroPath?: string
}
export interface GuideStep {
  id: string
  t: number // source time of the click
  x: number // click position 0..1 in the recording
  y: number
  title: string
  note: string
  off?: boolean
}
