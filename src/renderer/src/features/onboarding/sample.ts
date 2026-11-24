// Makes the practice project for the guided tour: a short "screen recording" of a made up app
// (Nimbus), drawn frame by frame and encoded right here, plus the cursor moves and clicks that
// Scrim would have recorded. That way the sample shows real auto zooms and cursor effects.
import { CanvasSource, Mp4OutputFormat, Output, Quality, StreamTarget, getFirstEncodableVideoCodec, type StreamTargetChunk } from 'mediabunny'
import type { ClickEvent, CursorData, CursorSample } from '@shared/types'
import { api } from '@/lib/api'

const W = 1920
const H = 1080
const FPS = 30
export const SAMPLE_SECONDS = 11

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const prog = (t: number, a: number, b: number) => ease((t - a) / (b - a))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

// ---- the script: where the mouse goes, and when it clicks ----
// [time, x, y] waypoints in pixels; the pointer eases between them
const PATH: [number, number, number][] = [
  [0, 980, 760],
  [0.3, 980, 760],
  [1.5, 1755, 50],
  [1.75, 1755, 50],
  [2.55, 960, 474],
  [2.8, 960, 474],
  [4.3, 1040, 540],
  [4.9, 1215, 668],
  [5.2, 1215, 668],
  [6.7, 1222, 372],
  [7.0, 1222, 372],
  [8.4, 140, 262],
  [8.8, 140, 262],
  [10.2, 820, 640],
  [SAMPLE_SECONDS, 830, 646]
]
const CLICKS: [number, number, number][] = [
  [1.62, 1755, 50],
  [2.66, 960, 474],
  [5.05, 1215, 668],
  [6.88, 1222, 372],
  [8.62, 140, 262]
]

function pointer(t: number): [number, number] {
  for (let i = 0; i < PATH.length - 1; i++) {
    const [t0, x0, y0] = PATH[i]
    const [t1, x1, y1] = PATH[i + 1]
    if (t <= t1) {
      const k = ease((t - t0) / Math.max(1e-3, t1 - t0))
      // a slight arc makes it feel like a hand, not a robot
      const arc = Math.sin(k * Math.PI) * Math.min(60, Math.hypot(x1 - x0, y1 - y0) * 0.08)
      return [lerp(x0, x1, k), lerp(y0, y1, k) - arc]
    }
  }
  const l = PATH[PATH.length - 1]
  return [l[1], l[2]]
}

export function sampleCursor(): CursorData {
  const samples: CursorSample[] = []
  for (let t = 0; t <= SAMPLE_SECONDS + 1e-6; t += 1 / 60) {
    const [x, y] = pointer(t)
    samples.push({ t: +t.toFixed(3), x: +(x / W).toFixed(5), y: +(y / H).toFixed(5) })
  }
  const clicks: ClickEvent[] = CLICKS.map(([t, x, y]) => ({ t, x: x / W, y: y / H, button: 1, up: t + 0.09 }))
  return { width: W, height: H, samples, clicks }
}

// ---- drawing the app ----
const FONT = "'Inter', 'Segoe UI', system-ui, sans-serif"
const C = { bg: '#f5f6fb', panel: '#ffffff', line: '#e7e9f2', text: '#161a2e', dim: '#7a809a', brand: '#5b4cf0', brandSoft: '#eeebff', ok: '#16a36a' }

function rr(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
function text(ctx: OffscreenCanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 500, align: CanvasTextAlign = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(s, x, y)
}
function card(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(30,40,90,0.06)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 6
  rr(ctx, x, y, w, h, 18)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.restore()
  rr(ctx, x, y, w, h, 18)
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1.5
  ctx.stroke()
}

const DAILY = [34, 52, 41, 66, 58, 74, 62, 81, 70, 88, 76, 92]
const WEEKLY = [48, 44, 60, 55, 71, 67, 79, 73, 86, 82, 94, 99]
const PROJECTS = [
  { name: 'Website refresh', color: '#5b4cf0', p: 0.72 },
  { name: 'Mobile onboarding', color: '#f0994c', p: 0.45 },
  { name: 'Billing v2', color: '#1aa3b8', p: 0.9 },
  { name: 'Support inbox', color: '#e5487a', p: 0.3 },
  { name: 'Q4 planning', color: '#16a36a', p: 0.58 }
]
const NAV = ['Home', 'Projects', 'Team', 'Reports', 'Settings']
const TYPED = 'Launch plan'

function drawFrame(ctx: OffscreenCanvasRenderingContext2D, t: number) {
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)

  // sidebar
  ctx.fillStyle = C.panel
  ctx.fillRect(0, 0, 280, H)
  ctx.fillStyle = C.line
  ctx.fillRect(279, 0, 1.5, H)
  rr(ctx, 40, 38, 40, 40, 12)
  ctx.fillStyle = C.brand
  ctx.fill()
  text(ctx, 'Nimbus', 96, 59, 26, C.text, 700)
  // active item slides from Home to Team after the last click
  const navK = prog(t, 8.62, 8.9)
  const activeY = lerp(150, 150 + 2 * 56, navK)
  rr(ctx, 24, activeY - 22, 232, 44, 12)
  ctx.fillStyle = C.brandSoft
  ctx.fill()
  NAV.forEach((n, i) => {
    const y = 150 + i * 56
    const on = Math.abs(activeY - y) < 20
    rr(ctx, 44, y - 9, 18, 18, 5)
    ctx.fillStyle = on ? C.brand : '#c3c7d8'
    ctx.fill()
    text(ctx, n, 78, y, 19, on ? C.brand : '#4b5068', on ? 650 : 500)
  })
  rr(ctx, 24, H - 120, 232, 88, 16)
  ctx.fillStyle = '#f3f1ff'
  ctx.fill()
  text(ctx, 'Upgrade to Pro', 44, H - 92, 17, C.text, 650)
  text(ctx, 'Unlimited projects', 44, H - 62, 15, C.dim)

  // top bar
  const title = navK > 0.5 ? 'Team overview' : 'Good morning, Sam'
  text(ctx, title, 330, 62, 32, C.text, 700)
  rr(ctx, 900, 30, 460, 46, 14)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.stroke()
  text(ctx, 'Search projects, people, files', 944, 53, 17, '#a0a5bb')
  ctx.strokeStyle = '#a0a5bb'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(922, 52, 7, 0, Math.PI * 2)
  ctx.stroke()
  // New project button (pressed around the first click)
  const press = 1 - Math.min(1, Math.abs(t - 1.66) / 0.12)
  ctx.save()
  ctx.translate(1755, 50)
  ctx.scale(1 - press * 0.05, 1 - press * 0.05)
  rr(ctx, -115, -25, 230, 50, 14)
  ctx.fillStyle = press > 0 ? '#4a3be0' : C.brand
  ctx.fill()
  text(ctx, '+  New project', 0, 1, 19, '#fff', 650, 'center')
  ctx.restore()

  // stat cards
  const stats = [['Active projects', '24', '+3 this week'], ['Tasks done', '1,284', '+12%'], ['Team members', '18', '+2'], ['On time', '94%', '+4%']]
  stats.forEach(([l, v, d], i) => {
    const x = 330 + i * 392
    card(ctx, x, 124, 364, 150)
    text(ctx, l, x + 28, 162, 17, C.dim)
    const bump = i === 0 ? prog(t, 5.3, 5.8) : 0
    text(ctx, i === 0 && bump > 0.5 ? '25' : v, x + 28, 214, 40, C.text, 750)
    text(ctx, d, x + 28, 252, 15, C.ok, 600)
  })

  // chart
  card(ctx, 330, 308, 960, 632)
  text(ctx, 'Activity', 362, 352, 24, C.text, 700)
  text(ctx, 'Tasks completed', 362, 384, 16, C.dim)
  const weekK = prog(t, 6.92, 7.6)
  rr(ctx, 1070, 344, 200, 48, 12)
  ctx.fillStyle = '#f1f2f8'
  ctx.fill()
  rr(ctx, lerp(1074, 1170, weekK), 348, 96, 40, 10)
  ctx.fillStyle = C.panel
  ctx.fill()
  text(ctx, 'Daily', 1122, 368, 16, weekK < 0.5 ? C.text : C.dim, 600, 'center')
  text(ctx, 'Weekly', 1218, 368, 16, weekK >= 0.5 ? C.text : C.dim, 600, 'center')
  const base = 880
  const grow = prog(t, 0, 0.8)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#eef0f6'
    ctx.fillRect(370, base - i * 120, 880, 1.5)
  }
  DAILY.forEach((v, i) => {
    const h = lerp(v, WEEKLY[i], weekK) * 4.2 * grow
    const x = 380 + i * 72
    rr(ctx, x, base - h, 44, h, 10)
    ctx.fillStyle = i === 11 ? C.brand : '#c9c3ff'
    ctx.fill()
    text(ctx, ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][i], x + 22, base + 26, 14, C.dim, 500, 'center')
  })

  // project list, with the new one sliding in at the top after "Create"
  card(ctx, 1320, 308, 570, 632)
  text(ctx, 'Projects', 1352, 352, 24, C.text, 700)
  text(ctx, 'See all', 1858, 352, 16, C.brand, 600, 'right')
  const add = prog(t, 5.25, 5.75)
  const list = add > 0 ? [{ name: TYPED, color: '#ff7a59', p: 0.05 }, ...PROJECTS] : PROJECTS
  const flash = add > 0 ? Math.max(0, 1 - (t - 5.75) / 1.4) : 0
  ctx.save()
  rr(ctx, 1321, 390, 568, 548, 0)
  ctx.clip()
  list.forEach((p, i) => {
    const y = 420 + i * 92 - (add > 0 ? (1 - add) * 92 : 0)
    if (i === 0 && add > 0) {
      ctx.globalAlpha = add
      rr(ctx, 1336, y - 10, 538, 84, 14)
      ctx.fillStyle = `rgba(91,76,240,${0.1 * flash + 0.02})`
      ctx.fill()
    }
    rr(ctx, 1352, y + 8, 44, 44, 12)
    ctx.fillStyle = p.color
    ctx.fill()
    text(ctx, p.name, 1414, y + 20, 19, C.text, 650)
    rr(ctx, 1414, y + 42, 300, 8, 4)
    ctx.fillStyle = '#eef0f6'
    ctx.fill()
    rr(ctx, 1414, y + 42, 300 * p.p, 8, 4)
    ctx.fillStyle = p.color
    ctx.fill()
    text(ctx, `${Math.round(p.p * 100)}%`, 1858, y + 30, 16, C.dim, 600, 'right')
    ctx.globalAlpha = 1
  })
  ctx.restore()

  // "New project" dialog
  const open = prog(t, 1.68, 1.95) * (1 - prog(t, 5.08, 5.3))
  if (open > 0) {
    ctx.fillStyle = `rgba(18,22,45,${0.38 * open})`
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.globalAlpha = open
    ctx.translate(960, 520)
    ctx.scale(0.94 + 0.06 * open, 0.94 + 0.06 * open)
    ctx.translate(-960, -520)
    ctx.shadowColor = 'rgba(20,20,60,0.25)'
    ctx.shadowBlur = 60
    ctx.shadowOffsetY = 20
    rr(ctx, 600, 320, 720, 400, 24)
    ctx.fillStyle = C.panel
    ctx.fill()
    ctx.shadowColor = 'transparent'
    text(ctx, 'New project', 640, 372, 28, C.text, 700)
    text(ctx, 'Name', 640, 420, 16, C.dim, 600)
    const focus = t > 2.7
    rr(ctx, 640, 442, 640, 64, 14)
    ctx.fillStyle = '#fafbff'
    ctx.fill()
    ctx.strokeStyle = focus ? C.brand : C.line
    ctx.lineWidth = focus ? 2.5 : 1.5
    ctx.stroke()
    const n = Math.max(0, Math.min(TYPED.length, Math.floor((t - 2.95) / 0.11)))
    const typed = TYPED.slice(0, n)
    text(ctx, typed || (focus ? '' : 'Give it a name'), 664, 475, 22, typed ? C.text : '#a8adc2')
    if (focus && Math.floor(t * 2.2) % 2 === 0) {
      ctx.font = `500 22px ${FONT}`
      const cx = 664 + ctx.measureText(typed).width + 2
      ctx.fillStyle = C.brand
      ctx.fillRect(cx, 460, 2.5, 30)
    }
    text(ctx, 'Team', 640, 548, 16, C.dim, 600)
    ;['#5b4cf0', '#f0994c', '#1aa3b8', '#e5487a'].forEach((c, i) => {
      ctx.beginPath()
      ctx.arc(660 + i * 34, 590, 18, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.stroke()
    })
    rr(ctx, 1000, 642, 130, 52, 14)
    ctx.fillStyle = '#f1f2f8'
    ctx.fill()
    text(ctx, 'Cancel', 1065, 668, 18, C.text, 600, 'center')
    const pc = 1 - Math.min(1, Math.abs(t - 5.07) / 0.1)
    rr(ctx, 1150, 642, 130, 52, 14)
    ctx.fillStyle = pc > 0 ? '#4a3be0' : C.brand
    ctx.fill()
    text(ctx, 'Create', 1215, 668, 18, '#fff', 650, 'center')
    ctx.restore()
  }

  // small toast after creating
  const toast = prog(t, 5.5, 5.8) * (1 - prog(t, 8.0, 8.3))
  if (toast > 0) {
    ctx.save()
    ctx.globalAlpha = toast
    rr(ctx, 760, H - 110 + (1 - toast) * 30, 400, 60, 16)
    ctx.fillStyle = '#161a2e'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(796, H - 80 + (1 - toast) * 30, 12, 0, Math.PI * 2)
    ctx.fillStyle = C.ok
    ctx.fill()
    text(ctx, 'Project created', 822, H - 80 + (1 - toast) * 30, 18, '#fff', 600)
    ctx.restore()
  }
}

/** Renders the sample, saves it as a project and returns its folder.
 *  `scale` 2 draws it at 3840 x 2160 (used for sharp website footage). */
export async function makeSampleProject(onProgress?: (p: number) => void, scale = 1): Promise<string> {
  const { dir, video } = await api.sampleBegin()
  const canvas = new OffscreenCanvas(W * scale, H * scale)
  const ctx = canvas.getContext('2d', { alpha: false })!
  await document.fonts?.load(`600 20px Inter`).catch(() => {})
  await api.fileOpen(video)
  const writable = new WritableStream<StreamTargetChunk>({ write: (chunk) => api.fileWrite(video, chunk.data, chunk.position) })
  const output = new Output({ format: new Mp4OutputFormat(), target: new StreamTarget(writable, { chunked: true }) })
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'vp8'], { width: W * scale, height: H * scale })
  if (!codec) throw new Error("This PC can't encode the sample video.")
  const source = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate: scale > 1 ? 40_000_000 : 6_000_000, bitrateMode: 'variable' }), keyFrameInterval: 1 })
  output.addVideoTrack(source, { frameRate: FPS })
  await output.start()
  const frames = Math.round(SAMPLE_SECONDS * FPS)
  for (let k = 0; k < frames; k++) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawFrame(ctx, k / FPS)
    await source.add(k / FPS, 1 / FPS)
    if (k % 10 === 0) onProgress?.(k / frames)
  }
  await output.finalize()
  await api.fileClose(video)
  onProgress?.(1)
  return api.sampleFinish(dir, sampleCursor(), SAMPLE_SECONDS)
}

// the self test makes a sharp copy of the sample for the website
;(window as unknown as { __scrimSample?: (scale: number) => Promise<string> }).__scrimSample = (scale: number) => makeSampleProject(undefined, scale)
