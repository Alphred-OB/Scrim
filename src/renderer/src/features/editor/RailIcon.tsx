import type { Panel } from './state/store'

interface RailIconProps {
  id: Panel
  active?: boolean
  clicked?: boolean
  size?: number
}

export default function RailIcon({ id, active, clicked, size = 20 }: RailIconProps) {
  const common = `rail-icon rail-icon-${id} ${active ? 'is-active' : ''} ${clicked ? 'is-clicked' : ''}`

  switch (id) {
    case 'background': // Style
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path className="ri-spark-big" d="M10 2.5 C10 6.5, 6 10.5, 2 10.5 C6 10.5, 10 14.5, 10 18.5 C10 14.5, 14 10.5, 18 10.5 C14 10.5, 10 6.5, 10 2.5 Z" />
          <path className="ri-spark-small" d="M18.5 2 C18.5 4, 16.5 6, 14.5 6 C16.5 6, 18.5 8, 18.5 10 C18.5 8, 20.5 6, 22.5 6 C20.5 6, 18.5 4, 18.5 2 Z" />
          <circle className="ri-spark-dot" cx="19" cy="17" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      )

    case 'cursor': // Cursor
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path className="ri-cursor-ripple" d="M13.5 3.5 A 6.5 6.5 0 0 1 19.5 9.5" />
          <path className="ri-cursor-arrow" d="M4.5 3.5 L11.5 20.5 L14.5 13.5 L21.5 10.5 Z" />
        </svg>
      )

    case 'zoom': // Zoom
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle className="ri-zoom-lens" cx="10" cy="10" r="6.5" />
          <path className="ri-zoom-handle" d="M14.8 14.8 L20.5 20.5" />
          <path className="ri-zoom-cross" d="M10 7.2 V12.8 M7.2 10 H12.8" />
        </svg>
      )

    case 'text': // Text
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path className="ri-text-cap" d="M4 6 H16 M4 5.5 V7 M16 5.5 V7 M10 6 V18.5 M7.5 18.5 H12.5" />
          <line className="ri-text-caret" x1="19" y1="5.5" x2="19" y2="18.5" />
        </svg>
      )

    case 'blur': // Blur & Redact
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3 L21 21" />
          <path d="M10.6 5.1 A10 10 0 0 1 12 5 C18.5 5 22 12 22 12 A17 17 0 0 1 18.8 16.1" />
          <path d="M6.6 6.6 A17 17 0 0 0 2 12 C2 12 5.5 19 12 19 A9.7 9.7 0 0 0 17.4 17.4" />
          <path d="M9.9 9.9 A3 3 0 0 0 14.1 14.1" />
        </svg>
      )

    case 'media': // Media
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect className="ri-media-frame" x="3" y="3.5" width="18" height="17" rx="3.5" />
          <circle className="ri-media-sun" cx="8" cy="8.5" r="2" />
          <path className="ri-media-ridge" d="M3 16.5 L7.8 12.2 C8.8 11.2 10.2 11.2 11.2 12.2 L14.5 15.5 M13 14 L15 12 C16 11 17.5 11 18.5 12 L21 14.5" />
        </svg>
      )

    case 'effects': // Effects
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path className="ri-wand-shaft" d="M3.5 20.5 L12.5 11.5" />
          <path className="ri-wand-tip" d="M12.5 11.5 L14.5 9.5" />
          <path className="ri-fx-spark1" d="M15 3.5 V1.5 M15 5.5 V7.5" />
          <path className="ri-fx-spark2" d="M13 4.5 H11 M17 4.5 H19" />
          <path className="ri-fx-spark3" d="M19.5 12.5 L21 13.5 M19.5 14.5 L21 13.5" />
        </svg>
      )

    case 'webcam': // Webcam
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle className="ri-cam-outer" cx="12" cy="9.5" r="6.5" />
          <circle className="ri-cam-iris" cx="12" cy="9.5" r="2.8" />
          <circle className="ri-cam-tally" cx="12" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
          <path className="ri-cam-stand" d="M7.5 20.5 H16.5 M12 16 V20.5" />
        </svg>
      )

    case 'audio': // Audio
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path className="ri-audio-cone" d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z" />
          <path className="ri-audio-wave1" d="M15.5 8.5 A 5 5 0 0 1 15.5 15.5" />
          <path className="ri-audio-wave2" d="M18.5 5.5 A 9 9 0 0 1 18.5 18.5" />
        </svg>
      )

    case 'keys': // Keyboard shortcuts
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect className="ri-keys-board" x="2.5" y="6" width="19" height="12" rx="2.8" />
          <rect className="ri-key ri-key1" x="5.6" y="9.1" width="2.6" height="2.4" rx="0.6" fill="currentColor" stroke="none" />
          <rect className="ri-key ri-key2" x="10.7" y="9.1" width="2.6" height="2.4" rx="0.6" fill="currentColor" stroke="none" />
          <rect className="ri-key ri-key3" x="15.8" y="9.1" width="2.6" height="2.4" rx="0.6" fill="currentColor" stroke="none" />
          <path className="ri-key-space" d="M7.5 14.6 H16.5" />
        </svg>
      )

    case 'settings': // Clips
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <g className="ri-blade-top">
            <circle cx="6" cy="6.5" r="2.8" />
            <path d="M8.2 8.5 L19.5 17.5" />
          </g>
          <g className="ri-blade-bottom">
            <circle cx="6" cy="17.5" r="2.8" />
            <path d="M8.2 15.5 L19.5 6.5" />
          </g>
          <circle className="ri-pivot-screw" cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      )

    case 'ai': // AI
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect className="ri-ai-badge" x="3" y="4" width="18" height="16" rx="3.5" />
          <line className="ri-ai-bar ri-ai-bar1" x1="8" y1="10" x2="8" y2="14" />
          <line className="ri-ai-bar ri-ai-bar2" x1="12" y1="7" x2="12" y2="17" />
          <line className="ri-ai-bar ri-ai-bar3" x1="16" y1="9.5" x2="16" y2="14.5" />
        </svg>
      )

    case 'tidy': // Smart trim: a clip that shrinks
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect className="ri-tidy-a" x="2.5" y="8" width="7" height="8" rx="1.6" />
          <rect className="ri-tidy-b" x="14.5" y="8" width="7" height="8" rx="1.6" />
          <path className="ri-tidy-arrows" d="M10.8 12h2.4M11.6 10.6 10.4 12l1.2 1.4M12.4 10.6l1.2 1.4-1.2 1.4" />
        </svg>
      )

    case 'guide': // Guide: numbered steps
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2.5" />
          <circle className="ri-guide-dot ri-guide-dot1" cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
          <circle className="ri-guide-dot ri-guide-dot2" cx="8.5" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
          <circle className="ri-guide-dot ri-guide-dot3" cx="8.5" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
          <path className="ri-guide-lines" d="M11.5 8.5h5M11.5 12.5h5M11.5 16.5h3.5" />
        </svg>
      )

    case 'brand': // Brand: a badge with a star
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path className="ri-brand-badge" d="M12 2.8l2.4 1.7 2.9-.2.9 2.8 2.3 1.8-1 2.7 1 2.7-2.3 1.8-.9 2.8-2.9-.2L12 20.4l-2.4-1.7-2.9.2-.9-2.8-2.3-1.8 1-2.7-1-2.7 2.3-1.8.9-2.8 2.9.2z" />
          <path className="ri-brand-star" d="M12 8.3l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="currentColor" stroke="none" />
        </svg>
      )

    default:
      return null
  }
}
