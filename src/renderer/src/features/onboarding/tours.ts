// Guided tours of the real interface: each step points at an element marked with data-tour.
import { create } from 'zustand'
import type { EditState } from '@shared/types'
import { useSettings } from '@/lib/settings'
import { useEditor } from '@/features/editor/state/store'
import { timeBus } from '@/features/editor/state/timeBus'
import { addTextAt, addTransitionAt, splitAtPlayhead } from '@/features/editor/state/actions'

export type TourName = 'home' | 'editor' | 'pro'
/** Something the user does themselves. The step ticks off when `done` becomes true. */
export interface TourTask {
  todo: string
  done(now: EditState, before: EditState, ui: { playing: boolean; panel: string }): boolean
  /** "Show me" does it for them. */
  doIt?(): void
}
export interface TourStep { target: string; title: string; body: string; place?: 'right' | 'left' | 'top' | 'bottom'; task?: TourTask }

const ed = () => useEditor.getState()

export const TOURS: Record<TourName, TourStep[]> = {
  home: [
    { target: 'home-record', title: 'Record', body: 'Start here to record a screen, a window or a browser tab, with your mic and webcam.', place: 'bottom' },
    { target: 'home-edit', title: 'Edit', body: 'Open your projects, or import any video to polish it with Scrim.', place: 'bottom' },
    { target: 'home-practice', title: 'Practice first', body: 'Opens a sample video and walks you through a real edit, one small task at a time.', place: 'bottom' },
    { target: 'home-recent', title: 'Pick up where you left off', body: 'Your latest projects are always one click away.', place: 'top' },
    { target: 'help', title: 'Need a hand?', body: 'Open the welcome tour again from here any time.', place: 'bottom' },
    { target: 'settings', title: 'Settings', body: 'Themes, shortcuts, the capture engine and export sounds.', place: 'bottom' }
  ],
  editor: [
    { target: 'preview', title: 'Preview', body: 'What you see here is what you export. Drag text, pictures and the webcam around right on the video. Press F for full screen.', place: 'left' },
    { target: 'rail', title: 'Tools', body: 'Background, cursor, zoom, text, media, transitions and effects, webcam, audio and clips. Each one opens its settings next to it.', place: 'right' },
    { target: 'panel', title: 'Settings for the tool', body: 'Everything you change here shows up in the preview straight away. Undo with Ctrl+Z.', place: 'right' },
    { target: 'play', title: 'Play', body: 'Space plays and pauses. The arrow keys move the playhead, Shift moves further.', place: 'top' },
    { target: 'timeline', title: 'The timeline', body: 'Every part of your video has a track. Drag items to move them, pull their edges to trim, right click for more.', place: 'top' },
    { target: 'track-video', title: 'Video', body: 'Your recording. Press S to split it at the playhead, then drag the edges to cut parts out. Drop another video here to join it.', place: 'right' },
    { target: 'track-transitions', title: 'Transitions', body: 'Click a pill to change the start, end or a cut, or drag a transition here from the Transitions panel.', place: 'right' },
    { target: 'track-effects', title: 'Effects and layers', body: 'Drag a look here to use it on part of the video. Things that overlap get their own layer, so nothing hides behind anything else.', place: 'right' },
    { target: 'track-zoom', title: 'Zoom', body: 'Zooms are made from your clicks. Click an empty spot to add one, drag to move it.', place: 'right' },
    { target: 'tl-zoom', title: 'Zoom the timeline', body: 'Make the timeline wider or narrower. Ctrl + scroll works too.', place: 'top' },
    { target: 'presets', title: 'Presets', body: 'Save the look you like and use it on every recording.', place: 'bottom' },
    { target: 'export', title: 'Export', body: 'MP4, WebM, MOV or GIF. You can keep working while it exports.', place: 'bottom' }
  ],
  // hands on: the user edits the sample video step by step
  pro: [
    { target: 'preview', title: 'Your practice video', body: 'A short recording of a made up app. Scrim already added the background, a smooth cursor and zooms where the clicks happened. Now let\'s make it yours.', place: 'left' },
    {
      target: 'play', title: 'Watch it first', body: 'See how it zooms in on every click, all by itself.', place: 'top',
      task: { todo: 'Press Space or click Play', done: (_n, _b, ui) => ui.playing, doIt: () => ed().setPlaying(true) }
    },
    {
      target: 'track-zoom', title: 'Zooms come from clicks', body: 'Each block is a zoom. Drag one to move it, pull an edge to make it longer, or click an empty spot to add your own.', place: 'top',
      task: { todo: 'Move or resize a zoom', done: (n, b) => JSON.stringify(n.zoom.segments) !== JSON.stringify(b.zoom.segments), doIt: () => ed().update((e) => { const z = e.zoom.segments[0]; if (z) z.end = Math.min(z.end + 0.6, (e.zoom.segments[1]?.start ?? z.end + 0.6) - 0.05) }) }
    },
    {
      target: 'tool-background', title: 'Pick a background', body: 'Open Background and choose a wallpaper, a live one, a color or your own picture.', place: 'right',
      task: { todo: 'Change the background', done: (n, b) => JSON.stringify(n.background) !== JSON.stringify(b.background), doIt: () => { ed().setPanel('background'); ed().update((e) => { e.background.type = 'color'; e.background.color = '#ff5a36'}) } }
    },
    {
      target: 'tool-text', title: 'Add a title', body: 'Open Text and add one, or press T. Double click it on the preview to type, and drag it anywhere.', place: 'right',
      task: { todo: 'Add some text', done: (n, b) => n.texts.length > b.texts.length, doIt: () => { ed().setPanel('text'); addTextAt(Math.max(0, timeBus.get())) } }
    },
    {
      target: 'track-video', title: 'Cut the slow part', body: 'Move the playhead to where you want to cut and press S. Then drag the edges of a clip to trim it, or delete it.', place: 'top',
      task: { todo: 'Split the video with S', done: (n, b) => n.clips.length > b.clips.length, doIt: () => { ed().setPlaying(false); ed().setTime(4.4); timeBus.emit(4.4); setTimeout(splitAtPlayhead, 60) } }
    },
    {
      target: 'tool-effects', title: 'Add a transition', body: 'Open Transitions and drag one onto the Transitions track, right on a cut if you like. Hover a tile to preview it.', place: 'right',
      task: { todo: 'Add a transition', done: (n, b) => n.transitions.items.length > b.transitions.items.length || Object.keys(n.transitions.perCut).length > Object.keys(b.transitions.perCut).length || n.transitions.intro.type !== b.transitions.intro.type, doIt: () => { ed().setPanel('effects'); addTransitionAt('zoom', Math.max(0.5, timeBus.get()), 0.8) } }
    },
    {
      target: 'track-video', title: 'Make room for an intro', body: 'Grab the video and drag it to the right. The empty space in front is yours: drop a title or a picture there for an intro.', place: 'top',
      task: { todo: 'Drag the video to the right', done: (n) => (n.leadIn ?? 0) > 0, doIt: () => { ed().update((e) => (e.leadIn = 2)); setTimeout(() => { addTextAt(-2); ed().update((e) => { const t = e.texts[e.texts.length - 1]; if (t) { t.text = 'Nimbus in 10 seconds'; t.y = 0.5; t.end = 0 } }) }, 60) } }
    },
    { target: 'export', title: 'Ship it', body: 'Export to MP4, GIF, WebM or MOV. That\'s the whole workflow: record, tweak, export. You\'re ready to make your own.', place: 'bottom' }
  ]
}

/** Starts the hands on tour the next time the editor opens (it lives in another page load). */
export function queueTour(name: TourName): void {
  try {
    localStorage.setItem('scrim.nextTour', name)
  } catch {
    /* ignore */
  }
}
let queuedPending = false
export function takeQueuedTour(): TourName | null {
  try {
    const n = localStorage.getItem('scrim.nextTour') as TourName | null
    localStorage.removeItem('scrim.nextTour')
    if (n) {
      // keep the regular editor tour from jumping in while this one is about to start
      queuedPending = true
      setTimeout(() => (queuedPending = false), 1500)
    }
    return n
  } catch {
    return null
  }
}

export const useTour = create<{ active: TourName | null; start(name: TourName): void; stop(): void }>((set, get) => ({
  active: null,
  start: (name) => set({ active: name }),
  stop: () => {
    const name = get().active
    set({ active: null })
    if (!name) return
    const s = useSettings.getState()
    const seen = s.settings.toursSeen ?? []
    if (!seen.includes(name)) s.save({ toursSeen: [...seen, name] })
  }
}))

export const startTour = (name: TourName): void => useTour.getState().start(name)

/** Starts a tour the first time its screen is shown (after the welcome tour is done). */
export function maybeAutoStart(name: TourName): void {
  const s = useSettings.getState().settings
  if (!useSettings.getState().loaded || !s.onboarded || (s.toursSeen ?? []).includes(name) || useTour.getState().active) return
  setTimeout(() => {
    const now = useSettings.getState().settings
    if (useTour.getState().active || queuedPending || (now.toursSeen ?? []).includes(name)) return
    useTour.getState().start(name)
  }, 500)
}
