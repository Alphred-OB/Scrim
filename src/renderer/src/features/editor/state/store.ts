import { create } from 'zustand'
import type { CursorData, EditState, Project } from '@shared/types'
import { api } from '@/lib/api'

export type Panel = 'background' | 'cursor' | 'zoom' | 'text' | 'media' | 'effects' | 'blur' | 'webcam' | 'audio' | 'keys' | 'settings' | 'ai'
export type Selection = { kind: 'clip' | 'zoom' | 'text' | 'overlay' | 'audioClip' | 'effect' | 'transition' | 'blur'; id: string } | null

interface EditorStore {
  project: Project | null
  cursorData: CursorData | null
  time: number // source seconds
  playing: boolean
  panel: Panel
  selection: Selection
  past: EditState[]
  future: EditState[]
  lastKey: string
  lastAt: number
  saving: boolean
  /** message for long jobs like joining videos; empty when idle */
  busy: string

  setBusy(msg: string): void
  load(p: Project, cursor: CursorData | null): void
  update(fn: (e: EditState) => void, key?: string): void
  undo(): void
  redo(): void
  setTime(t: number): void
  setPlaying(p: boolean): void
  setPanel(p: Panel): void
  select(s: Selection): void
  rename(name: string): void
}

const clone = <T,>(v: T): T => structuredClone(v)

export const useEditor = create<EditorStore>((set, get) => ({
  project: null,
  cursorData: null,
  time: 0,
  playing: false,
  panel: 'background',
  selection: null,
  past: [],
  future: [],
  lastKey: '',
  lastAt: 0,
  saving: false,
  busy: '',

  setBusy(msg) {
    set({ busy: msg })
  },

  load(p, cursor) {
    set({ project: p, cursorData: cursor, time: p.edit.clips[0]?.start ?? 0, past: [], future: [], selection: null, playing: false })
  },

  update(fn, key = '') {
    const p = get().project
    if (!p) return
    const before = p.edit
    const next = clone(before)
    fn(next)
    const now = performance.now()
    // group rapid changes of the same control (e.g. dragging a slider) into one undo step
    const coalesce = key !== '' && key === get().lastKey && now - get().lastAt < 800
    set({
      project: { ...p, edit: next },
      past: coalesce ? get().past : [...get().past.slice(-80), before],
      future: [],
      lastKey: key,
      lastAt: now
    })
    scheduleSave()
  },

  undo() {
    const { past, project, future } = get()
    if (!project || !past.length) return
    const prev = past[past.length - 1]
    set({ project: { ...project, edit: prev }, past: past.slice(0, -1), future: [project.edit, ...future], lastKey: '' })
    scheduleSave()
  },

  redo() {
    const { past, project, future } = get()
    if (!project || !future.length) return
    const next = future[0]
    set({ project: { ...project, edit: next }, past: [...past, project.edit], future: future.slice(1), lastKey: '' })
    scheduleSave()
  },

  setTime: (t) => set({ time: t }),
  setPlaying: (playing) => set({ playing }),
  setPanel: (panel) => set({ panel }),
  select: (selection) => {
    const s = selection
    set({ selection: s })
    if (s?.kind === 'zoom') set({ panel: 'zoom' })
    if (s?.kind === 'text') set({ panel: 'text' })
    if (s?.kind === 'blur') set({ panel: 'blur' })
    if (s?.kind === 'overlay' || s?.kind === 'audioClip') set({ panel: 'media' })
    if (s?.kind === 'clip') set({ panel: 'settings' })
  },
  rename(name) {
    const p = get().project
    if (!p) return
    set({ project: { ...p, name } })
    scheduleSave()
  }
}))

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const p = useEditor.getState().project
    if (!p) return
    useEditor.setState({ saving: true })
    try {
      await api.saveProject(p)
    } finally {
      useEditor.setState({ saving: false })
    }
  }, 700)
}

export function flushSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  const p = useEditor.getState().project
  return p ? api.saveProject(p) : Promise.resolve()
}
