// Brand kit: your logo, colors, font and intro/outro saved once, put on any video in one click.
import { useState } from 'react'
import type { BrandKit, LogoCorner, Watermark } from '@shared/types'
import { FONTS, uid } from '@shared/defaults'
import { defaultCaptions } from '@shared/speech'
import { ColorRow, Icon, Section, Select, Slider, Toggle, askConfirm, showMessage } from '@/ui'

const mediaName = (p: string) => p.split(/[\\/]/).pop() ?? p
import { api, mediaUrl } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { useEditor } from '../state/store'
import { joinVideoAt } from '../state/actions'

const CORNERS: { v: LogoCorner; l: string }[] = [
  { v: 'top-left', l: 'Top left' },
  { v: 'top-right', l: 'Top right' },
  { v: 'bottom-left', l: 'Bottom left' },
  { v: 'bottom-right', l: 'Bottom right' }
]

export function newKit(n: number): BrandKit {
  return { id: uid('bk'), name: n ? `Brand ${n + 1}` : 'My brand', logoPos: 'bottom-right', logoSize: 0.12, logoOpacity: 0.9, colors: ['#0a84ff', '#ffd60a', '#0b0d12', '#ffffff'], font: 'Inter' }
}

const IMAGES = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
const VIDEOS = [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv'] }]

export default function BrandPanel() {
  const kits = useSettings((s) => s.settings.brandKits) ?? []
  const save = useSettings((s) => s.save)
  const project = useEditor((s) => s.project)!
  const update = useEditor((s) => s.update)
  const [open, setOpen] = useState<string | null>(kits[0]?.id ?? null)
  const [busy, setBusy] = useState('')
  const wm = project.edit.watermark

  const setKit = (id: string, patch: Partial<BrandKit>) => save({ brandKits: kits.map((k) => (k.id === id ? { ...k, ...patch } : k)) })
  const add = () => {
    const k = newKit(kits.length)
    save({ brandKits: [...kits, k] })
    setOpen(k.id)
  }
  const remove = async (k: BrandKit) => {
    if (!(await askConfirm({ title: `Delete "${k.name}"?`, body: 'Videos that already use it keep their logo.', ok: 'Delete', danger: true }))) return
    save({ brandKits: kits.filter((x) => x.id !== k.id) })
  }
  const setWm = (patch: Partial<Watermark>, key?: string) => update((e) => e.watermark && Object.assign(e.watermark, patch), key)

  const apply = async (k: BrandKit, parts: { logo: boolean; style: boolean; ends: boolean }) => {
    setBusy('Adding your brand…')
    try {
      let logoPath: string | undefined
      if (parts.logo && k.logoPath) logoPath = await api.copyAsset(project.dir, k.logoPath)
      update((e) => {
        if (parts.logo && logoPath) e.watermark = { path: logoPath, pos: k.logoPos, size: k.logoSize, opacity: k.logoOpacity, margin: 0.03 }
        if (parts.style) {
          const [main, accent] = k.colors
          for (const t of e.texts) t.font = k.font
          e.captions = { ...defaultCaptions(), ...(e.captions ?? {}), font: k.font, highlight: accent ?? main }
          e.cursor.clickColor = main
          e.keys.color = main
        }
      })
      if (parts.ends && k.introPath) {
        setBusy('Adding the intro…')
        await joinVideoAt('start', k.introPath)
      }
      if (parts.ends && k.outroPath) {
        setBusy('Adding the outro…')
        await joinVideoAt('end', k.outroPath)
      }
    } catch (e) {
      showMessage("Couldn't add the brand", e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      {wm && (
        <Section title="Logo on this video" action={<button className="link" style={{ color: 'var(--danger)' }} onClick={() => update((e) => (e.watermark = null))}>Remove</button>}>
          <div className="brand-corners">
            {CORNERS.map((c) => (
              <button key={c.v} className={`brand-corner ${c.v} ${wm.pos === c.v ? 'on' : ''}`} title={c.l} onClick={() => setWm({ pos: c.v })}><i /></button>
            ))}
          </div>
          <Slider label="Size" value={wm.size} min={0.04} max={0.35} step={0.005} def={0.12} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setWm({ size: v }, 'wm-size')} />
          <Slider label="Opacity" value={wm.opacity} min={0.1} max={1} step={0.05} def={0.9} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setWm({ opacity: v }, 'wm-op')} />
          <Slider label="Distance from edge" value={wm.margin} min={0} max={0.1} step={0.005} def={0.03} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setWm({ margin: v }, 'wm-m')} />
        </Section>
      )}
      <Section title="Brand kits" action={<button className="link" onClick={add}>+ New kit</button>}>
        <span className="hint">Save your logo, colors, font and intro once. Then put them on any video in one click. Kits are shared by all your projects.</span>
        {!kits.length && (
          <button className="btn primary" onClick={add}><Icon name="plus" size={15} /> Make a brand kit</button>
        )}
        {busy && <span className="hint"><span className="spin" /> {busy}</span>}
        {kits.map((k) => (
          <KitCard key={k.id} k={k} open={open === k.id} busy={!!busy} onToggle={() => setOpen(open === k.id ? null : k.id)} set={(p) => setKit(k.id, p)} onApply={(parts) => apply(k, parts)} onRemove={() => remove(k)} />
        ))}
      </Section>
    </>
  )
}

function KitCard({ k, open, busy, onToggle, set, onApply, onRemove }: {
  k: BrandKit
  open: boolean
  busy: boolean
  onToggle: () => void
  set: (p: Partial<BrandKit>) => void
  onApply: (parts: { logo: boolean; style: boolean; ends: boolean }) => void
  onRemove: () => void
}) {
  const [parts, setParts] = useState({ logo: true, style: true, ends: true })
  const pick = async (key: 'logoPath' | 'introPath' | 'outroPath', filters: typeof IMAGES) => {
    const p = await api.openFile(key === 'logoPath' ? 'Choose your logo' : 'Choose a video', filters)
    if (p) set({ [key]: p })
  }
  return (
    <div className={`brand-kit ${open ? 'open' : ''}`}>
      <button className="brand-kit-head" onClick={onToggle}>
        <span className="brand-logo">{k.logoPath ? <img src={mediaUrl(k.logoPath)} alt="" /> : <Icon name="image" size={16} />}</span>
        <span className="brand-name" style={{ fontFamily: k.font }}>{k.name}</span>
        <span className="brand-dots">{k.colors.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="brand-kit-body">
          <input className="guide-title" value={k.name} onChange={(e) => set({ name: e.target.value })} />
          <div className="brand-row">
            <button className="btn" onClick={() => pick('logoPath', IMAGES)}><Icon name="upload" size={15} /> {k.logoPath ? 'Change logo' : 'Add your logo'}</button>
            {k.logoPath && <button className="link" onClick={() => set({ logoPath: undefined })}>Remove</button>}
          </div>
          {k.logoPath && (
            <>
              <div className="brand-corners">
                {CORNERS.map((c) => (
                  <button key={c.v} className={`brand-corner ${c.v} ${k.logoPos === c.v ? 'on' : ''}`} title={c.l} onClick={() => set({ logoPos: c.v })}><i /></button>
                ))}
              </div>
              <Slider label="Logo size" value={k.logoSize} min={0.04} max={0.35} step={0.005} def={0.12} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ logoSize: v })} />
              <Slider label="Logo opacity" value={k.logoOpacity} min={0.1} max={1} step={0.05} def={0.9} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ logoOpacity: v })} />
            </>
          )}
          <ColorRow label="Main color" value={k.colors[0]} onChange={(v) => set({ colors: [v, ...k.colors.slice(1)] })} />
          <ColorRow label="Accent" value={k.colors[1]} onChange={(v) => set({ colors: [k.colors[0], v, ...k.colors.slice(2)] })} />
          <div className="list-row" style={{ borderBottom: 'none', padding: '2px 0' }}>
            <span style={{ flex: 1 }}>Font</span>
            <Select width={170} value={k.font} options={FONTS.map((f) => ({ v: f, l: f, style: { fontFamily: f } }))} onChange={(v) => set({ font: v })} />
          </div>
          <div className="brand-row">
            <button className="btn" onClick={() => pick('introPath', VIDEOS)}><Icon name="film" size={15} /> {k.introPath ? mediaName(k.introPath) : 'Intro video'}</button>
            {k.introPath && <button className="link" onClick={() => set({ introPath: undefined })}>Remove</button>}
          </div>
          <div className="brand-row">
            <button className="btn" onClick={() => pick('outroPath', VIDEOS)}><Icon name="film" size={15} /> {k.outroPath ? mediaName(k.outroPath) : 'Outro video'}</button>
            {k.outroPath && <button className="link" onClick={() => set({ outroPath: undefined })}>Remove</button>}
          </div>
          <div className="brand-apply">
            <span className="section-title">Put on this video</span>
            <Toggle label="Logo" value={parts.logo && !!k.logoPath} onChange={(v) => setParts({ ...parts, logo: v })} />
            <Toggle label="Font and colors" value={parts.style} onChange={(v) => setParts({ ...parts, style: v })} />
            <Toggle label="Intro and outro" value={parts.ends && !!(k.introPath || k.outroPath)} onChange={(v) => setParts({ ...parts, ends: v })} />
            <button className="btn primary" disabled={busy} onClick={() => onApply(parts)}><Icon name="sparkles" size={15} /> Use this brand</button>
          </div>
          <button className="link" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={onRemove}>Delete this kit</button>
        </div>
      )}
    </div>
  )
}
