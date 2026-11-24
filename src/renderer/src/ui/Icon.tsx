import {
  Add, ArrowCircleDown, ArrowDown2, ArrowLeft, ArrowRight, ArrowSwapHorizontal, Blur, Bookmark, Brush2, Camera, Colorfilter, Copy, Cpu, Crop, Cut, Danger, Diamonds, DocumentDownload,
  DocumentUpload, Drop, Eye, EyeSlash, Folder, FolderOpen, Gallery, Gps, InfoCircle, Keyboard, Layer, Link2, Location, MagicStar, Magicpen, Maximize, MessageQuestion, Microphone, Minus,
  Monitor, More, Mouse, MouseCircle, Music, Next, Pause, Play, Previous, Record, Refresh, RotateLeft, RotateRight, Scissor, SearchNormal1, SearchZoomIn, Scan, Setting2, Stop, Subtitle, Sun1,
  TextBlock, TextBold, TextItalic, TextUnderline, TextalignCenter, TextalignLeft, TextalignRight, TickCircle, Trash, Video, VideoSquare, Volume, VolumeSlash, Windows, CloseCircle
} from 'iconsax-react'
import type { Icon as IconsaxIcon } from 'iconsax-react'

/** The one icon set for the whole app: Iconsax (MIT). Names are ours, so a screen never needs to know which pack it comes from. */
export const ICONS: Record<string, IconsaxIcon> = {
  sparkles: Magicpen, cursor: Mouse, check: TickCircle, camera: Camera, cc: Subtitle, gear: Setting2, text: TextBlock, zoom: SearchZoomIn, audio: Volume, folder: Folder,
  undo: RotateLeft, redo: RotateRight, play: Play, pause: Pause, prev: Previous, next: Next, volume: Volume, mute: VolumeSlash, scissors: Scissor, wand: MagicStar, plus: Add, minus: Minus,
  help: MessageQuestion, arrowRight: ArrowRight, fx: Colorfilter, transition: ArrowSwapHorizontal, expand: Maximize, sun: Sun1, trash: Trash, download: DocumentDownload,
  bookmark: Bookmark, chevron: ArrowDown2, crop: Crop, image: Gallery, mic: Microphone, monitor: Monitor, window: Windows, record: Record, stop: Stop, restart: Refresh,
  x: CloseCircle, upload: DocumentUpload, back: ArrowLeft, split: Cut, bold: TextBold, italic: TextItalic, underline: TextUnderline, alignL: TextalignLeft, alignC: TextalignCenter,
  alignR: TextalignRight, keyboard: Keyboard, film: VideoSquare, music: Music, webcam: Video, layers: Layer, eye: Eye, eyeOff: EyeSlash, copy: Copy, click: MouseCircle, target: Gps,
  search: SearchNormal1, magnet: Link2, more: More, pin: Location, keyframe: Diamonds, alert: Danger, info: InfoCircle, update: ArrowCircleDown, droplet: Drop, palette: Brush2,
  folderOpen: FolderOpen, cpu: Cpu, blur: Blur, frame: Scan
}

export function Icon({ name, size = 18, variant = 'Linear' }: { name: string; size?: number; stroke?: number; variant?: 'Linear' | 'Bulk' | 'Bold' | 'Outline' | 'TwoTone' | 'Broken' }) {
  const Sax = ICONS[name]
  return Sax ? <Sax size={size} color="currentColor" variant={variant} /> : null
}
