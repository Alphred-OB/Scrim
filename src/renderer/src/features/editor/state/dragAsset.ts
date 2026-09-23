// The media library asset currently being dragged. dataTransfer can't be read during dragover,
// so the timeline looks here to know which track to highlight.
import type { Asset, EffectLook, TransitionType } from '@shared/types'

let current: Asset | null = null
/** a transition or effect being dragged from the Transitions & effects panel */
export type FxDrag = { kind: 'transition'; type: TransitionType; name: string } | { kind: 'effect'; look: EffectLook; name: string }
let fx: FxDrag | null = null
let dropTime: number | null = null

export const dragAsset = {
  get: (): Asset | null => current,
  set: (a: Asset | null): void => {
    current = a
  },
  /** Timeline time a file from File Explorer was dropped at, read once by the editor's import. */
  getFx: (): FxDrag | null => fx,
  setFx: (f: FxDrag | null): void => {
    fx = f
  },
  setDropTime: (t: number | null): void => {
    dropTime = t
  },
  takeDropTime: (): number | null => {
    const t = dropTime
    dropTime = null
    return t
  }
}
