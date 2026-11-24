import type { Panel } from './state/store'
import { Icon } from '@/ui'
import './railIcons.css'

interface RailIconProps {
  id: Panel
  active?: boolean
  clicked?: boolean
  size?: number
}

const NAME: Record<Panel, string> = {
  background: 'sparkles', frame: 'frame', cursor: 'cursor', zoom: 'zoom', text: 'text', blur: 'blur', media: 'image', effects: 'fx', webcam: 'webcam', audio: 'audio',
  keys: 'keyboard', settings: 'scissors', ai: 'cc', tidy: 'wand', guide: 'click', brand: 'palette'
}

/** Tool icons for the editor rail (Iconsax). The open tool is drawn filled in, and every icon pops when clicked (see railIcons.css). */
export default function RailIcon({ id, active, clicked, size = 20 }: RailIconProps) {
  return (
    <span className={`rx rx-${id} ${active ? 'is-active' : ''} ${clicked ? 'is-clicked' : ''}`} style={{ display: 'inline-flex' }}>
      <Icon name={NAME[id]} size={size} variant={active ? 'Bulk' : 'Linear'} />
    </span>
  )
}
