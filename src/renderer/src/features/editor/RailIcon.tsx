import type { Panel } from './state/store'
import './railIcons.css'

interface RailIconProps {
  id: Panel
  active?: boolean
  clicked?: boolean
  size?: number
}

/**
 * Tool icons for the editor rail. Each one tells what its tool does when you hover it (the cursor
 * clicks, the scissors snip, the captions type out...), pops when clicked, and the open tool's
 * accent detail comes alive every few seconds. Parts marked `acc` take the accent color.
 * All motion is in railIcons.css and switches off for people who prefer reduced motion.
 */
export default function RailIcon({ id, active, clicked, size = 20 }: RailIconProps) {
  const cls = `rx rx-${id} ${active ? 'is-active' : ''} ${clicked ? 'is-clicked' : ''}`
  const svg = (children: React.ReactNode) => (
    <svg className={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
  switch (id) {
    case 'background': // Style: sparkles
      return svg(
        <>
          <path className="p-big" d="M10 3c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
          <path className="p-small acc" d="M18 13.5c.3 1.6 1.1 2.4 2.7 2.7-1.6.3-2.4 1.1-2.7 2.7-.3-1.6-1.1-2.4-2.7-2.7 1.6-.3 2.4-1.1 2.7-2.7z" fill="currentColor" />
          <circle className="p-dot acc" cx="18.5" cy="5" r="1" fill="currentColor" stroke="none" />
        </>
      )
    case 'cursor': // Cursor: an arrow that clicks
      return svg(
        <>
          <path className="p-arrow" d="M7 5.5l11.5 5-4.8 1.9-1.9 4.8z" />
          <path className="p-rays acc" pathLength={1} d="M5.2 3.2l1 1M3 6.8h1.4M6.8 2.4V3.8" />
        </>
      )
    case 'zoom': // Zoom: a lens that pushes in
      return svg(
        <>
          <g className="p-lens">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path className="p-plus acc" d="M10.5 7.8v5.4M7.8 10.5h5.4" />
          </g>
          <path className="p-handle" d="M15.4 15.4l5.1 5.1" />
        </>
      )
    case 'text': // Text: a T being typed
      return svg(
        <>
          <path className="p-t" pathLength={1} d="M4.5 6h11M10 6v12.5M8 18.5h4" />
          <path className="p-caret acc" d="M19 5.5v13" />
        </>
      )
    case 'blur': // Blur: an eye that gets crossed out
      return svg(
        <>
          <g className="p-eye">
            <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="2.6" />
          </g>
          <path className="p-slash acc" pathLength={1} d="M4 4l16 16" />
        </>
      )
    case 'media': // Media: sun rising over hills
      return svg(
        <>
          <rect x="3" y="4" width="18" height="16" rx="3.5" />
          <circle className="p-sun acc" cx="8.5" cy="9" r="1.8" fill="currentColor" stroke="none" />
          <path className="p-hills" d="M3.5 17l4.6-4.3a1.8 1.8 0 0 1 2.5 0l3.2 3M13 14.9l1.8-1.7a1.8 1.8 0 0 1 2.5 0l3.2 3" />
        </>
      )
    case 'effects': // Effects: a wand that casts sparks
      return svg(
        <>
          <g className="p-wand">
            <path d="M4 20l10-10" />
            <path className="p-tip" d="M14 10l2-2" strokeWidth={2.4} />
          </g>
          <path className="p-s1 acc" d="M18 2.8v2.6M16.7 4.1h2.6" />
          <path className="p-s2 acc" d="M20.6 9.5v2M19.6 10.5h2" />
          <path className="p-s3 acc" d="M11.5 3.5v2M10.5 4.5h2" />
        </>
      )
    case 'webcam': // Webcam: the lens focuses and the light blinks
      return svg(
        <>
          <circle cx="12" cy="10" r="6.5" />
          <circle className="p-iris" cx="12" cy="10" r="2.6" />
          <circle className="p-tally acc" cx="16.6" cy="5.4" r="1.1" fill="currentColor" stroke="none" />
          <path d="M8 20.5h8M12 16.5v4" />
        </>
      )
    case 'audio': // Audio: sound waves travel out
      return svg(
        <>
          <path className="p-cone" d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
          <path className="p-w1 acc" d="M15.4 9a4.3 4.3 0 0 1 0 6" />
          <path className="p-w2 acc" d="M18.2 6.3a8.2 8.2 0 0 1 0 11.4" />
        </>
      )
    case 'keys': // Keys: keys pressed one after another
      return svg(
        <>
          <rect x="2.5" y="6" width="19" height="12" rx="2.8" />
          <rect className="p-k1 acc" x="5.6" y="9" width="2.6" height="2.4" rx=".6" fill="currentColor" stroke="none" />
          <rect className="p-k2 acc" x="10.7" y="9" width="2.6" height="2.4" rx=".6" fill="currentColor" stroke="none" />
          <rect className="p-k3 acc" x="15.8" y="9" width="2.6" height="2.4" rx=".6" fill="currentColor" stroke="none" />
          <path className="p-space" d="M7.5 14.6h9" />
        </>
      )
    case 'settings': // Clips: scissors that snip
      return svg(
        <>
          <g className="p-bladeA">
            <circle cx="6" cy="6.5" r="2.7" />
            <path d="M8.2 8.2L19.5 17.5" />
          </g>
          <g className="p-bladeB">
            <circle cx="6" cy="17.5" r="2.7" />
            <path d="M8.2 15.8L19.5 6.5" />
          </g>
          <circle className="p-pivot acc" cx="12.3" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </>
      )
    case 'ai': // Captions: lines type out while the spoken word lights up
      return svg(
        <>
          <rect x="2.5" y="4.5" width="19" height="15" rx="3.5" />
          <rect className="p-word acc" x="6" y="9.2" width="4.6" height="2.6" rx="1" fill="currentColor" stroke="none" />
          <path className="p-l1" pathLength={1} d="M11.8 10.5H18" />
          <path className="p-l2" pathLength={1} d="M6 14.5h9.5" />
        </>
      )
    case 'tidy': // Trim: two clips slide together as the slow part is removed
      return svg(
        <>
          <rect className="p-clipA" x="2.5" y="7.5" width="7" height="9" rx="1.8" />
          <rect className="p-clipB" x="14.5" y="7.5" width="7" height="9" rx="1.8" />
          <path className="p-gap acc" d="M12 5v2.2M12 10.9v2.2M12 16.8V19" />
        </>
      )
    case 'guide': // Guide: numbered steps checked off one by one
      return svg(
        <>
          <rect x="4" y="2.8" width="16" height="18.4" rx="2.8" />
          <circle className="p-d1 acc" cx="8.4" cy="8" r="1.25" fill="currentColor" stroke="none" />
          <circle className="p-d2 acc" cx="8.4" cy="12" r="1.25" fill="currentColor" stroke="none" />
          <circle className="p-d3 acc" cx="8.4" cy="16" r="1.25" fill="currentColor" stroke="none" />
          <path className="p-g1" pathLength={1} d="M11.5 8h5" />
          <path className="p-g2" pathLength={1} d="M11.5 12h5" />
          <path className="p-g3" pathLength={1} d="M11.5 16h3.4" />
        </>
      )
    case 'brand': // Brand: a seal that turns and a star that shines
      return svg(
        <>
          <path className="p-seal" d="M12 2.8l2.3 1.6 2.8-.1.9 2.6 2.2 1.7-.9 2.6.9 2.6-2.2 1.7-.9 2.6-2.8-.1L12 21.2l-2.3-1.6-2.8.1-.9-2.6-2.2-1.7.9-2.6-.9-2.6 2.2-1.7.9-2.6 2.8.1z" />
          <path className="p-star acc" d="M12 8.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5L12 13.8 9.7 15l.5-2.5-1.8-1.7 2.5-.3z" fill="currentColor" stroke="none" />
        </>
      )
    default:
      return null
  }
}
