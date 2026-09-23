// Guided tours of the real interface: each step points at an element marked with data-tour.
import { create } from 'zustand'
import { useSettings } from '@/lib/settings'

export type TourName = 'home' | 'editor'
export interface TourStep { target: string; title: string; body: string; place?: 'right' | 'left' | 'top' | 'bottom' }

export const TOURS: Record<TourName, TourStep[]> = {
  home: [
    { target: 'home-record', title: 'Record', body: 'Start here to record a screen, a window or a browser tab, with your mic and webcam.', place: 'bottom' },
    { target: 'home-edit', title: 'Edit', body: 'Open your projects, or import any video to polish it with Scrim.', place: 'bottom' },
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
  ]
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
  setTimeout(() => useTour.getState().start(name), 500)
}
