import { create } from 'zustand'
import type { AppSettings } from '@shared/types'
import { defaultSettings } from '@shared/defaults'
import { api } from '@/lib/api'

interface SettingsStore {
  settings: AppSettings
  loaded: boolean
  load(): Promise<void>
  save(patch: Partial<AppSettings>): Promise<void>
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: defaultSettings(),
  loaded: false,
  async load() {
    try {
      set({ settings: await api.getSettings(), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  async save(patch) {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    await api.saveSettings(next)
  }
}))

/** Turns a keyboard event into the "Ctrl+Shift+S" style used by shortcuts. */
export function comboFromEvent(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let k = e.key
  if (k === ' ') k = 'Space'
  else if (k.length === 1) k = k.toUpperCase()
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return parts.join('+')
  parts.push(k)
  return parts.join('+')
}

export function matches(e: KeyboardEvent, combo: string): boolean {
  return comboFromEvent(e).toLowerCase() === combo.toLowerCase()
}

// ---- export finished sound, made with WebAudio so no files are needed ----
export async function playDoneSound(): Promise<void> {
  const s = useSettings.getState().settings.exportSound
  if (!s.enabled) return
  if (s.sound === 'custom' && s.customPath) {
    const a = new Audio('media://file/' + encodeURIComponent(s.customPath))
    a.volume = s.volume
    await a.play().catch(() => {})
    return
  }
  const ctx = new AudioContext()
  const notes: [number, number, number][] =
    s.sound === 'pop' ? [[880, 0, 0.12]] : s.sound === 'success' ? [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.3]] : [[988, 0, 0.5], [1319, 0.1, 0.7]]
  for (const [f, at, dur] of notes) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = s.sound === 'pop' ? 'triangle' : 'sine'
    o.frequency.value = f
    const t0 = ctx.currentTime + at
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.35 * s.volume, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g).connect(ctx.destination)
    o.start(t0)
    o.stop(t0 + dur + 0.05)
  }
  setTimeout(() => ctx.close(), 1500)
}
