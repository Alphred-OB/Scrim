import { useState } from 'react'
import type { PrompterSettings } from '@shared/types'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { Slider, Toggle, showMessage } from '@/ui'

export const defaultPrompter = (): PrompterSettings => ({ text: '', show: true, size: 34, speed: 5, opacity: 0.85 })

/** Write the script you'll read while recording. It shows in a small floating window that never appears in the video. */
export default function ScriptModal({ onClose }: { onClose: () => void }) {
  const saved = useSettings((s) => s.settings.prompter)
  const save = useSettings((s) => s.save)
  const [p, setP] = useState<PrompterSettings>({ ...defaultPrompter(), ...saved })
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<PrompterSettings>) => {
    const next = { ...p, ...patch }
    setP(next)
    save({ prompter: next }) // saved as you type, and the open script window follows
  }
  const words = p.text.trim() ? p.text.trim().split(/\s+/).length : 0
  const toggle = async () => {
    await api.prompter(!open)
    setOpen(!open)
  }
  const importFile = async () => {
    try {
      const t = await api.importScript()
      if (t == null) return
      set({ text: p.text.trim() ? p.text.trimEnd() + '\n\n' + t : t })
    } catch (e) {
      showMessage(e instanceof Error ? e.message : String(e))
    }
  }
  const close = () => {
    if (open) api.prompter(false)
    onClose()
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal glass" style={{ width: 640, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Script</div>
        <textarea
          className="script-area"
          autoFocus
          spellCheck
          value={p.text}
          placeholder={'# Part 1: Intro\nWrite what you want to say here.\n\n# Part 2: First diagram\nLines starting with # become section titles.'}
          onChange={(e) => set({ text: e.target.value })}
        />
        <span className="hint">
          {words} words, about {Math.max(1, Math.round(words / 140))} min at a calm pace. Start or stop the scroll with Alt+Shift+Space, change speed with Alt+Shift+Up/Down, jump to the top with Alt+Shift+Home.
          The script is hidden from the recording.
        </span>
        <Toggle label="Show it when a recording starts" value={p.show} onChange={(v) => set({ show: v })} />
        <Slider label="Text size" value={p.size} min={20} max={64} step={1} def={34} format={(v) => `${v}px`} onChange={(v) => set({ size: v })} />
        <Toggle label="Scroll by itself while recording" value={p.auto !== false} onChange={(v) => set({ auto: v })} />
        <span className="hint">{p.auto !== false ? 'It starts moving when the recording starts and waits while you pause.' : 'It stays still. Start and stop it yourself with Alt+Shift+Space or its play button.'}</span>
        <Slider label="Scroll speed" value={p.speed} min={1} max={10} step={1} def={5} format={(v) => (v <= 3 ? `${v} slow` : v >= 8 ? `${v} fast` : String(v))} onChange={(v) => set({ speed: v })} />
        <Slider label="Window opacity" value={p.opacity} min={0.3} max={1} step={0.05} def={0.85} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ opacity: v })} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={importFile}>Import .txt…</button>
          <button className="btn" disabled={!p.text.trim()} onClick={toggle}>{open ? 'Hide preview' : 'Preview on screen'}</button>
          <button className="btn primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  )
}
