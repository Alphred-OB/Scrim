export interface TooltipItem {
  id: string
  title: string
  badge: string
  desc: string
  difference?: string
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, time: number) => void
}

/** Draws a sleek minimalist cursor pointer on the canvas */
function drawPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  rotation = 0,
  fill = '#ffffff',
  stroke = '#000000',
  opacity = 1
) {
  ctx.save()
  ctx.translate(x, y)
  if (rotation !== 0) ctx.rotate(rotation)
  if (scale !== 1) ctx.scale(scale, scale)
  ctx.globalAlpha = opacity

  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2

  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 16)
  ctx.lineTo(4.2, 12.2)
  ctx.lineTo(8.5, 19.5)
  ctx.lineTo(11.5, 18)
  ctx.lineTo(7.2, 10.8)
  ctx.lineTo(13.5, 10.8)
  ctx.closePath()

  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.restore()
}

/** Helper to draw simulated document lines on dark slate */
function drawDocLines(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.22) {
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
  const lines = [
    { x: 24, y: 22, w: 70 },
    { x: 100, y: 22, w: 120 },
    { x: 24, y: 40, w: 180 },
    { x: 24, y: 56, w: 150 },
    { x: 182, y: 56, w: 60 },
    { x: 24, y: 72, w: 210 },
    { x: 24, y: 88, w: 110 }
  ]
  for (const line of lines) {
    ctx.beginPath()
    ctx.roundRect(line.x, line.y, Math.min(line.w, w - line.x - 20), 5, 2.5)
    ctx.fill()
  }
}

/** Cubic Bézier point evaluation */
function cubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
  }
}

export const CURSOR_TOOLTIPS: Record<string, TooltipItem> = {
  'mode-cinematic': {
    id: 'mode-cinematic',
    title: 'Cinematic Movement',
    badge: 'Smooth & Polished',
    desc: 'Automatically turns nervous hand twitches and sharp turns into soft, flowing curves that look great in video presentations.',
    difference: 'Best for app demos and tutorials. Keeps viewers focused without dizzying quick moves.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      // Subtle background grid
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      for (let x = 16; x < w; x += 24) {
        for (let y = 14; y < h; y += 24) {
          ctx.beginPath()
          ctx.arc(x, y, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      const p0 = { x: 36, y: 78 }
      const p1 = { x: 80, y: 18 }
      const p2 = { x: 180, y: 92 }
      const p3 = { x: 236, y: 32 }

      // Jagged original path in soft red
      ctx.beginPath()
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = 'rgba(255, 100, 80, 0.45)'
      ctx.lineWidth = 1.4
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(70, 65)
      ctx.lineTo(100, 38)
      ctx.lineTo(125, 52)
      ctx.lineTo(165, 80)
      ctx.lineTo(200, 58)
      ctx.lineTo(p3.x, p3.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Smooth curved path in bright blue
      ctx.beginPath()
      ctx.strokeStyle = '#0a84ff'
      ctx.lineWidth = 2.4
      ctx.moveTo(p0.x, p0.y)
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
      ctx.stroke()

      // Soft glow
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(10, 132, 255, 0.25)'
      ctx.lineWidth = 6
      ctx.moveTo(p0.x, p0.y)
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
      ctx.stroke()

      // Destination target
      ctx.strokeStyle = '#0a84ff'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.arc(p3.x, p3.y, 6.5, 0, Math.PI * 2)
      ctx.stroke()

      const cycle = (time % 2.8) / 2.8
      let t = 0
      if (cycle < 0.15) {
        t = 0
      } else if (cycle > 0.82) {
        t = 1
      } else {
        const u = (cycle - 0.15) / 0.67
        t = u * u * (3 - 2 * u)
      }

      const curPos = cubicBezier(p0, p1, p2, p3, t)
      drawPointer(ctx, curPos.x, curPos.y, 1.15, -0.05, '#ffffff', '#000000')

      // Dwell ripple
      if (cycle >= 0.82) {
        const dwellP = (cycle - 0.82) / 0.18
        ctx.beginPath()
        ctx.arc(p3.x, p3.y, 6 + dwellP * 14, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(10, 132, 255, ${0.8 * (1 - dwellP)})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('✓ Soft curves replace sharp corners', 14, h - 10)
    }
  },

  'mode-natural': {
    id: 'mode-natural',
    title: 'Natural Movement',
    badge: 'Responsive & Clean',
    desc: 'Follows your exact hand movements directly, but absorbs hand tremors so mouse travels look clean and steady.',
    difference: 'Great when you want quick, responsive mouse movement without artificial curved arcs.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.16)

      const cycle = (time % 2.6) / 2.6
      const start = { x: 40, y: 70 }
      const mid = { x: 140, y: 35 }
      const end = { x: 235, y: 65 }

      ctx.beginPath()
      ctx.strokeStyle = 'rgba(48, 209, 88, 0.6)'
      ctx.lineWidth = 2
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(mid.x, mid.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

      let pos = { x: start.x, y: start.y }
      if (cycle < 0.5) {
        const p = cycle / 0.5
        pos = {
          x: start.x + (mid.x - start.x) * p,
          y: start.y + (mid.y - start.y) * p
        }
      } else {
        const p = (cycle - 0.5) / 0.5
        pos = {
          x: mid.x + (end.x - mid.x) * p,
          y: mid.y + (end.y - mid.y) * p
        }
      }

      drawPointer(ctx, pos.x, pos.y, 1.15, 0, '#ffffff', '#1b382b')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#30d158'
      ctx.fillText('✓ Fast and responsive with no hand jitter', 14, h - 10)
    }
  },

  'mode-raw': {
    id: 'mode-raw',
    title: 'Direct Movement',
    badge: 'Exact Capture',
    desc: 'Shows the exact, unedited movement of your mouse just as it happened on screen during the recording.',
    difference: 'Best when you need to show precise, 100% untouched mouse paths in technical tutorials.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const pts = [
        { x: 35, y: 75 },
        { x: 65, y: 62 },
        { x: 90, y: 55 },
        { x: 110, y: 38 },
        { x: 135, y: 50 },
        { x: 175, y: 40 },
        { x: 210, y: 65 },
        { x: 240, y: 35 }
      ]

      ctx.beginPath()
      ctx.strokeStyle = 'rgba(255, 159, 10, 0.55)'
      ctx.lineWidth = 1.5
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.stroke()

      for (const p of pts) {
        ctx.fillStyle = '#ff9f0a'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }

      const cycle = (time % 2.2) / 2.2
      const stepIdx = Math.min(pts.length - 1, Math.floor(cycle * pts.length))
      const p = pts[stepIdx]

      drawPointer(ctx, p.x, p.y, 1.15, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#ff9f0a'
      ctx.fillText('✓ Original recorded mouse path', 14, h - 10)
    }
  },

  smoothing: {
    id: 'smoothing',
    title: 'Shake Reduction',
    badge: 'Steady Hand',
    desc: 'Removes hand shaking and mouse sensor wobble so your cursor glides across the screen smoothly.',
    difference: 'Higher settings make the mouse look calm and deliberate. Lower settings feel faster.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      // Top: Shaky
      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = 'rgba(255, 100, 80, 0.85)'
      ctx.fillText('Without smoothing: shaky', 14, 22)

      ctx.beginPath()
      ctx.strokeStyle = 'rgba(255, 69, 58, 0.7)'
      ctx.lineWidth = 1.6
      ctx.moveTo(14, 38)
      for (let x = 14; x < w - 14; x += 12) {
        const noise = Math.sin(x * 0.8 + time * 10) * 5
        ctx.lineTo(x, 38 + noise)
      }
      ctx.stroke()

      // Bottom: Steady
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('With smoothing: steady & clean', 14, 70)

      ctx.beginPath()
      ctx.strokeStyle = '#0a84ff'
      ctx.lineWidth = 2.2
      ctx.moveTo(14, 88)
      ctx.lineTo(w - 14, 88)
      ctx.stroke()

      const cycle = (time % 2.0) / 2.0
      const curX = 14 + cycle * (w - 38)
      drawPointer(ctx, curX, 84, 1.0, 0, '#ffffff', '#0a84ff')
    }
  },

  curvature: {
    id: 'curvature',
    title: 'Curve Amount',
    badge: 'Gentle Arcs',
    desc: 'Controls how much straight mouse paths bend into soft, rounded curves when moving between points.',
    difference: 'A setting around 50% gives a natural, professional look used in Apple and SaaS trailers.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const p0 = { x: 30, y: 80 }
      const p3 = { x: 240, y: 40 }

      const cycle = (time % 3.0) / 3.0
      const curveFactor = 0.5 + 0.45 * Math.sin(cycle * Math.PI * 2)

      const p1 = { x: 30 + 60 * curveFactor, y: 80 - 65 * curveFactor }
      const p2 = { x: 240 - 60 * curveFactor, y: 40 + 55 * curveFactor }

      ctx.beginPath()
      ctx.strokeStyle = '#6c63ff'
      ctx.lineWidth = 2.4
      ctx.moveTo(p0.x, p0.y)
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
      ctx.stroke()

      const t = 0.5 + 0.4 * Math.sin(time * 3)
      const pos = cubicBezier(p0, p1, p2, p3, t)
      drawPointer(ctx, pos.x, pos.y, 1.1, -0.1, '#ffffff', '#6c63ff')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#6c63ff'
      ctx.fillText('✓ Softly curves straight lines into arcs', 14, h - 10)
    }
  },

  clickDwell: {
    id: 'clickDwell',
    title: 'Pause on Click',
    badge: 'Steady Click',
    desc: 'Briefly holds the mouse steady when clicking a button so it doesn’t accidentally slip or skid across the screen.',
    difference: 'Makes it easy for viewers to see exactly which button or menu item you clicked.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const btnX = 160
      const btnY = 40
      const btnW = 75
      const btnH = 26

      const cycle = (time % 2.5) / 2.5
      const isDwell = cycle >= 0.4 && cycle <= 0.7

      ctx.fillStyle = isDwell ? '#0a84ff' : '#222734'
      ctx.beginPath()
      ctx.roundRect(btnX, btnY, btnW, btnH, 6)
      ctx.fill()

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('Submit', btnX + 18, btnY + 17)

      let curX = 35
      let curY = 75
      if (cycle < 0.4) {
        const p = cycle / 0.4
        const smoothP = p * p * (3 - 2 * p)
        curX = 35 + (btnX + 30 - 35) * smoothP
        curY = 75 + (btnY + 14 - 75) * smoothP
      } else if (cycle <= 0.7) {
        curX = btnX + 30
        curY = btnY + 14

        const dwellP = (cycle - 0.4) / 0.3
        ctx.beginPath()
        ctx.arc(curX, curY, 4 + dwellP * 18, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * (1 - dwellP)})`
        ctx.lineWidth = 1.6
        ctx.stroke()
      } else {
        const p = (cycle - 0.7) / 0.3
        const smoothP = p * p * (3 - 2 * p)
        curX = btnX + 30 + (250 - (btnX + 30)) * smoothP
        curY = btnY + 14 + (80 - (btnY + 14)) * smoothP
      }

      drawPointer(ctx, curX, curY, isDwell ? 0.92 : 1.15, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = isDwell ? '#0a84ff' : 'rgba(255,255,255,0.6)'
      ctx.fillText(isDwell ? '✓ Held steady during click' : 'Moving to button...', 14, h - 10)
    }
  },

  sway: {
    id: 'sway',
    title: 'Cursor Lean',
    badge: 'Natural Tilt',
    desc: 'Gently tilts the mouse arrow into turns as you move, making cursor movement feel smooth and organic instead of stiff.',
    difference: 'The mouse leans left when moving left, and leans right when moving right.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const p0 = { x: 30, y: 55 }
      const p1 = { x: 90, y: 15 }
      const p2 = { x: 180, y: 95 }
      const p3 = { x: 245, y: 55 }

      ctx.beginPath()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 2
      ctx.moveTo(p0.x, p0.y)
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
      ctx.stroke()

      const cycle = (time % 2.4) / 2.4
      const p = 0.5 + 0.45 * Math.sin(cycle * Math.PI * 2)
      const pos = cubicBezier(p0, p1, p2, p3, p)

      const tilt = Math.cos(cycle * Math.PI * 2) * 0.35

      drawPointer(ctx, pos.x, pos.y, 1.25, tilt, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('✓ Leans naturally into turns', 14, h - 10)
    }
  },

  hideIdle: {
    id: 'hideIdle',
    title: 'Hide When Still',
    badge: 'Clean Screen',
    desc: 'Fades the mouse pointer away when you stop moving it, keeping the screen clean so viewers can read text easily.',
    difference: 'The mouse pointer instantly reappears the moment you move it again.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.25)

      const cycle = (time % 3.0) / 3.0
      let opacity = 1
      let x = 60
      let y = 55

      if (cycle < 0.35) {
        const p = cycle / 0.35
        x = 40 + p * 100
        opacity = 1
      } else if (cycle < 0.75) {
        x = 140
        const p = (cycle - 0.35) / 0.4
        opacity = Math.max(0, 1 - p * 2)
      } else {
        const p = (cycle - 0.75) / 0.25
        x = 140 + p * 90
        opacity = Math.min(1, p * 3)
      }

      drawPointer(ctx, x, y, 1.15, 0, '#ffffff', '#000000', opacity)

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = opacity > 0.1 ? '#30d158' : 'rgba(255,255,255,0.5)'
      ctx.fillText(opacity > 0.1 ? 'Visible while moving' : '✓ Fades out when not in use', 14, h - 10)
    }
  },

  'spotlight-glow': {
    id: 'spotlight-glow',
    title: 'Soft Glow',
    badge: 'Gentle Light',
    desc: 'Surrounds the mouse pointer with a soft, warm light to subtly highlight where you are pointing.',
    difference: 'Gentle and clean. Works well on both light and dark screens without covering content.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#10141d'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.3)

      const cycle = (time % 3.0) / 3.0
      const curX = w / 2 + Math.cos(cycle * Math.PI * 2) * 55
      const curY = h / 2 + Math.sin(cycle * Math.PI * 2) * 25

      const grad = ctx.createRadialGradient(curX, curY, 0, curX, curY, 52)
      grad.addColorStop(0, 'rgba(255, 230, 120, 0.45)')
      grad.addColorStop(0.5, 'rgba(255, 230, 120, 0.18)')
      grad.addColorStop(1, 'rgba(255, 230, 120, 0)')

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(curX, curY, 52, 0, Math.PI * 2)
      ctx.fill()

      drawPointer(ctx, curX, curY, 1.15, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = 'rgba(255, 230, 120, 0.9)'
      ctx.fillText('✓ Soft glowing aura follows cursor', 14, h - 10)
    }
  },

  'spotlight-dim': {
    id: 'spotlight-dim',
    title: 'Dim the Rest',
    badge: 'Spotlight Focus',
    desc: 'Darkens the background and shines a clear spotlight on whatever you point at.',
    difference: 'Perfect for focusing 100% of viewer attention directly on a specific button or menu item.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#1a202c'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.5)

      const cycle = (time % 3.0) / 3.0
      const curX = w / 2 + Math.cos(cycle * Math.PI * 2) * 50
      const curY = h / 2 + Math.sin(cycle * Math.PI * 2) * 22

      ctx.save()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
      ctx.fillRect(0, 0, w, h)

      ctx.globalCompositeOperation = 'destination-out'
      const cutout = ctx.createRadialGradient(curX, curY, 15, curX, curY, 44)
      cutout.addColorStop(0, 'rgba(0, 0, 0, 1)')
      cutout.addColorStop(0.7, 'rgba(0, 0, 0, 0.8)')
      cutout.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = cutout
      ctx.beginPath()
      ctx.arc(curX, curY, 44, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      drawPointer(ctx, curX, curY, 1.15, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('✓ Darkens background to isolate focus', 14, h - 10)
    }
  },

  'spotlight-ring': {
    id: 'spotlight-ring',
    title: 'Focus Ring',
    badge: 'Target Ring',
    desc: 'Draws a colored circle around the mouse pointer that follows it everywhere.',
    difference: 'Makes the mouse pointer super easy to spot on busy or colorful screens.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.25)

      const cycle = (time % 3.0) / 3.0
      const curX = w / 2 + Math.cos(cycle * Math.PI * 2) * 55
      const curY = h / 2 + Math.sin(cycle * Math.PI * 2) * 25

      ctx.beginPath()
      ctx.arc(curX, curY, 32, 0, Math.PI * 2)
      ctx.strokeStyle = '#0a84ff'
      ctx.lineWidth = 2.2
      ctx.stroke()

      ctx.fillStyle = 'rgba(10, 132, 255, 0.08)'
      ctx.fill()

      drawPointer(ctx, curX, curY, 1.15, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('✓ Colored circle tracks the cursor', 14, h - 10)
    }
  },

  'effect-ripple': {
    id: 'effect-ripple',
    title: 'Ripple Effect',
    badge: 'Water Wave',
    desc: 'Plays an expanding water ripple whenever you click the mouse.',
    difference: 'Soft and natural visual feedback that confirms every click.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2

      const cycle = (time % 1.5) / 1.5
      const r1 = cycle * 42
      const alpha1 = Math.max(0, 1 - cycle)

      const r2 = Math.max(0, (cycle - 0.2) * 42)
      const alpha2 = Math.max(0, 1 - (cycle - 0.2) / 0.8)

      ctx.beginPath()
      ctx.arc(cx, cy, r1, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(10, 132, 255, ${alpha1 * 0.25})`
      ctx.fill()
      ctx.strokeStyle = `rgba(10, 132, 255, ${alpha1 * 0.7})`
      ctx.lineWidth = 1.8
      ctx.stroke()

      if (cycle > 0.2) {
        ctx.beginPath()
        ctx.arc(cx, cy, r2, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(10, 132, 255, ${alpha2 * 0.5})`
        ctx.lineWidth = 1.4
        ctx.stroke()
      }

      drawPointer(ctx, cx, cy, 1.1, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('✓ Soft water ripple on click', 14, h - 10)
    }
  },

  'effect-ring': {
    id: 'effect-ring',
    title: 'Ring Effect',
    badge: 'Clean Circle',
    desc: 'Flashes a quick, clean ring outward when you press a button.',
    difference: 'Crisp and minimal. Standard for clean software tutorials.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2

      const cycle = (time % 1.4) / 1.4
      const radius = 6 + cycle * 34
      const alpha = Math.max(0, 1 - cycle * cycle)

      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(10, 132, 255, ${alpha})`
      ctx.lineWidth = 2.4 * (1 - cycle * 0.5)
      ctx.stroke()

      drawPointer(ctx, cx, cy, 1.1, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('✓ Quick accent ring on click', 14, h - 10)
    }
  },

  'effect-pulse': {
    id: 'effect-pulse',
    title: 'Pulse Flash',
    badge: 'Bright Flash',
    desc: 'Flashes a bright burst on click so clicks are impossible to miss.',
    difference: 'Ideal when demonstrating actions quickly on high-contrast backgrounds.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2

      const cycle = (time % 1.4) / 1.4
      const alpha = Math.max(0, 1 - cycle)

      ctx.beginPath()
      ctx.arc(cx, cy, 5 + cycle * 12, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(10, 132, 255, ${alpha * 0.9})`
      ctx.fill()

      ctx.beginPath()
      ctx.arc(cx, cy, 8 + cycle * 36, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.85})`
      ctx.lineWidth = 1.8
      ctx.stroke()

      drawPointer(ctx, cx, cy, 1.1, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('✓ High-visibility flash on click', 14, h - 10)
    }
  },

  'effect-none': {
    id: 'effect-none',
    title: 'No Visual Effect',
    badge: 'Clean Video',
    desc: 'Shows only the normal mouse arrow without any extra graphics on clicks.',
    difference: 'Keeps your video minimal and completely unaltered.',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.25)
      drawPointer(ctx, w / 2, h / 2, 1.15, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText('✓ Standard cursor without click graphics', 14, h - 10)
    }
  },

  clickBounce: {
    id: 'clickBounce',
    title: 'Click Bounce',
    badge: 'Button Press',
    desc: 'Makes the mouse arrow shrink down and pop back up when clicking, like pressing a real button.',
    difference: 'Gives a satisfying, tactile feel that confirms when the mouse was pressed.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2

      const cycle = (time % 1.5) / 1.5
      let scale = 1.0

      if (cycle < 0.2) {
        const p = cycle / 0.2
        scale = 1.0 - p * 0.28
      } else if (cycle < 0.5) {
        const p = (cycle - 0.2) / 0.3
        scale = 0.72 + p * 0.5
      } else if (cycle < 0.75) {
        const p = (cycle - 0.5) / 0.25
        scale = 1.22 - p * 0.22
      } else {
        scale = 1.0
      }

      drawPointer(ctx, cx, cy, scale * 1.2, 0, '#ffffff', '#0a84ff')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText('✓ Mouse dips down like pressing a button', 14, h - 10)
    }
  },

  clickSound: {
    id: 'clickSound',
    title: 'Click Sounds',
    badge: 'Audio Feedback',
    desc: 'Plays a clean, realistic mouse or trackpad sound every time you click a button.',
    difference: 'Makes your video feel more interactive and satisfying to watch.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      const cycle = (time % 1.2) / 1.2
      const isClick = cycle < 0.35

      const numBars = 18
      const barW = 8
      const gap = 5
      const startX = (w - (numBars * (barW + gap) - gap)) / 2

      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barW + gap)
        const distFromCenter = Math.abs(i - numBars / 2) / (numBars / 2)
        const baseH = 8
        const dynamicH = isClick ? (1 - distFromCenter) * 48 * (1 - cycle / 0.35) * Math.sin(i * 1.5 + time * 12) : 0
        const barH = Math.max(baseH, Math.abs(dynamicH) + 6)

        ctx.fillStyle = isClick ? '#30d158' : 'rgba(255, 255, 255, 0.2)'
        ctx.beginPath()
        ctx.roundRect(x, h / 2 - barH / 2, barW, barH, 3)
        ctx.fill()
      }

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = isClick ? '#30d158' : 'rgba(255,255,255,0.5)'
      ctx.fillText(isClick ? '♫ Click sound triggered' : 'Plays sound on every click', 14, h - 10)
    }
  },

  cursorSize: {
    id: 'cursorSize',
    title: 'Cursor Size',
    badge: 'Scale',
    desc: 'Scales up the mouse pointer so viewers on phones or smaller screens can easily follow your actions.',
    difference: '1.5x to 2.0x is standard for YouTube videos and high-definition product demos.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.22)

      const cycle = (time % 2.4) / 2.4
      const scale = 1.0 + 1.2 * (0.5 + 0.5 * Math.sin(cycle * Math.PI * 2))

      drawPointer(ctx, w / 2, h / 2, scale, 0, '#ffffff', '#000000')

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText(`✓ Scale: ${scale.toFixed(1)}x size`, 14, h - 10)
    }
  },

  cursorShadow: {
    id: 'cursorShadow',
    title: 'Drop Shadow',
    badge: 'Depth',
    desc: 'Adds a soft shadow beneath the mouse pointer so it stands out clearly over windows, text, and graphics.',
    difference: 'Keeps the mouse visible when hovering over busy or colorful user interfaces.',
    draw: (ctx, w, h, time) => {
      ctx.fillStyle = '#0e1117'
      ctx.fillRect(0, 0, w, h)

      drawDocLines(ctx, w, h, 0.3)

      const cycle = (time % 2.0) / 2.0
      const shadowAmount = 0.5 + 0.5 * Math.sin(cycle * Math.PI * 2)

      ctx.save()
      ctx.shadowColor = `rgba(0,0,0,${0.7 * shadowAmount})`
      ctx.shadowBlur = 12 * shadowAmount + 1
      ctx.shadowOffsetY = 4 * shadowAmount
      drawPointer(ctx, w / 2, h / 2, 1.4, 0, '#ffffff', '#000000')
      ctx.restore()

      ctx.font = '10.5px sans-serif'
      ctx.fillStyle = '#0a84ff'
      ctx.fillText(`✓ Shadow depth: ${Math.round(shadowAmount * 100)}%`, 14, h - 10)
    }
  }
}
