import type { ReactNode } from 'react'

// Inline SVG icon set (no icon font needed).
const P = (d: string) => <path d={d} />
const ICONS: Record<string, ReactNode> = {
  sparkles: <>{P('M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z')}{P('M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z')}</>,
  cursor: P('M5 3l14 7-6 1.8L10.5 18z'),
  camera: <>{P('M4 8h3l2-2h6l2 2h3v11H4z')}<circle cx="12" cy="13" r="3.5" /></>,
  cc: <><rect x="3" y="5" width="18" height="14" rx="3" />{P('M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6')}</>,
  gear: <><circle cx="12" cy="12" r="3" />{P('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')}</>,
  text: P('M5 6V4h14v2M12 4v16M9 20h6'),
  zoom: <><circle cx="11" cy="11" r="6.5" />{P('M20 20l-4.3-4.3M11 8.5v5M8.5 11h5')}</>,
  audio: P('M4 10v4h4l5 4V6L8 10zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12'),
  folder: P('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
  undo: P('M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11'),
  redo: P('M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13'),
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  prev: <><path d="M18 5v14L8 12z" fill="currentColor" stroke="none" /><rect x="5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  next: <><path d="M6 5v14l10-7z" fill="currentColor" stroke="none" /><rect x="16.5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  volume: P('M4 10v4h4l5 4V6L8 10zM16.5 8.5a5 5 0 0 1 0 7'),
  mute: P('M4 10v4h4l5 4V6L8 10zM17 9l5 6M22 9l-5 6'),
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />{P('M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12')}</>,
  wand: P('M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 6.2L11 5M3 21l9-9'),
  plus: P('M12 5v14M5 12h14'),
  minus: P('M5 12h14'),
  help: P('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01'),
  arrowRight: P('M5 12h14M13 6l6 6-6 6'),
  fx: P('M4 20l8-8M14 4l1.2 2.8L18 8l-2.8 1.2L14 12l-1.2-2.8L10 8l2.8-1.2zM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z'),
  transition: P('M3 6h7v12H3zM14 6h7v12h-7zM10 12h4'),
  expand: P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'),
  sun: P('M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'),
  trash: P('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'),
  download: P('M12 4v11M7 10l5 5 5-5M5 20h14'),
  bookmark: P('M6 3h12v18l-6-4-6 4z'),
  chevron: P('M6 9l6 6 6-6'),
  crop: P('M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14'),
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" />{P('M21 16l-5-5-9 9')}</>,
  mic: <>{P('M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3')}</>,
  monitor: <><rect x="2.5" y="4" width="19" height="13" rx="2" />{P('M8 21h8M12 17v4')}</>,
  window: <><rect x="3" y="4" width="18" height="16" rx="2" />{P('M3 9h18')}</>,
  record: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />,
  restart: P('M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5'),
  x: P('M6 6l12 12M18 6L6 18'),
  upload: P('M12 16V4M7 9l5-5 5 5M5 20h14'),
  back: P('M15 18l-6-6 6-6'),
  split: P('M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5'),
  bold: P('M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z'),
  italic: P('M11 5h7M6 19h7M14 5l-4 14'),
  underline: P('M7 4v7a5 5 0 0 0 10 0V4M5 20h14'),
  alignL: P('M4 6h16M4 10h10M4 14h16M4 18h10'),
  alignC: P('M4 6h16M7 10h10M4 14h16M7 18h10'),
  alignR: P('M4 6h16M10 10h10M4 14h16M10 18h10'),
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" />{P('M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10')}</>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" />{P('M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4')}</>,
  music: <>{P('M9 18V5l11-2v13')}<circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  webcam: <><circle cx="12" cy="10" r="7" /><circle cx="12" cy="10" r="2.5" />{P('M8 21h8M12 17v4')}</>,
  layers: P('M12 3l9 5-9 5-9-5zM3 13l9 5 9-5'),
  eye: <>{P('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z')}<circle cx="12" cy="12" r="3" /></>,
  eyeOff: P('M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2'),
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" />{P('M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2')}</>,
  click: <><circle cx="12" cy="12" r="3" />{P('M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1')}</>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  magnet: <><path d="M6 4v7a6 6 0 0 0 12 0V4" /><path d="M6 8h4M14 8h4" /><path d="M10 4v7a2 2 0 0 0 4 0V4" /></>,
  more: <><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /></>,
  pin: P('M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'),
  keyframe: P('M12 2L2 12l10 10 10-10z'),
  palette: <>{P('M12 2C6.5 2 2 6.5 2 12c0 3.6 2 6 5 6 .6 0 1-.4 1-1 0-.3-.1-.5-.2-.7-.3-.4-.5-.9-.5-1.5 0-1.7 1.3-3 3-3h1.8c3.4 0 6.2-2.8 6.2-6.2C22 5.6 17.5 2 12 2z')}<circle cx="7.5" cy="10.5" r="1.5" /><circle cx="12" cy="7.5" r="1.5" /><circle cx="16.5" cy="10.5" r="1.5" /></>
}

export function Icon({ name, size = 18, stroke = 1.8 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] ?? null}
    </svg>
  )
}
