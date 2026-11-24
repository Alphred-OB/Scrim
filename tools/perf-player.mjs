// Player speed check on a real project: npm run build, then
//   npm run perf -- "<project folder>" [--json]
// Opens the built app, waits for the preview copies, then measures seeks and cold playback at a few
// spots. Exits 1 if any number is past its limit, so a change that brings the lag back is caught.
// Read-only on the project: it only seeks and plays.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const LIMITS = { seekMs: 100, droppedPct: 10, realtime: 0.95, longTaskMs: 300 }
const PORT = 9339
const PLAY_SECONDS = 6
const SPOTS = [0.15, 0.45, 0.75] // fractions of the recording (plus one inside the webcam, if any)

const dir = process.argv[2]
const asJson = process.argv.includes('--json')
const profileFirstPlay = process.argv.includes('--profile') // prints where the first Play spends its longest busy stretch
if (!dir || !existsSync(join(dir, 'project.json'))) {
  console.error('usage: npm run perf -- "<project folder with project.json>"')
  process.exit(2)
}
if (!existsSync('out/main/index.js')) {
  console.error('build first: npm run build')
  process.exit(2)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const electron = createRequire(import.meta.url)('electron')
// the occlusion flags keep timers and video running when the window is behind others
const app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'], { stdio: 'ignore' })

let appExited = false
app.on('exit', () => (appExited = true))
async function connect() {
  for (let i = 0; i < 80; i++) {
    if (appExited) throw new Error('the app closed right away: is Scrim already open? Close it and run again')
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.url.includes('renderer/index.html'))
      if (page) return page.webSocketDebuggerUrl
    } catch { /* app still starting */ }
    await wait(500)
  }
  throw new Error('the app did not start')
}

const ws = new WebSocket(await connect())
await new Promise((r) => ws.addEventListener('open', r))
let seq = 0
/** Sends one DevTools command; resolves its result. */
function cdp(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq
    ws.addEventListener('message', function onMsg(m) {
      const d = JSON.parse(m.data)
      if (d.id !== id) return
      ws.removeEventListener('message', onMsg)
      resolve(d.result)
    })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
/** Runs an expression in the page; resolves its value, throws its error. */
function run(expression) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    ws.addEventListener('message', function onMsg(m) {
      const d = JSON.parse(m.data)
      if (d.id !== id) return
      ws.removeEventListener('message', onMsg)
      const ex = d.result?.exceptionDetails
      ex ? reject(new Error(ex.exception?.description ?? ex.text)) : resolve(d.result?.result?.value)
    })
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
}

async function openProject() {
  await wait(1500)
  await run(`location.hash = "/editor?dir=" + encodeURIComponent(${JSON.stringify(dir)})`)
  for (let i = 0; i < 200 && !(await run('!!window.__scrim?.state')); i++) await wait(250)
  // wait until no preview copy is being built (the badge disappears), up to 15 minutes
  const building = () => run(`!!document.querySelector('[title^="Making a lighter copy"]')`)
  const t0 = Date.now()
  while ((await building()) && Date.now() - t0 < 40 * 60_000) await wait(2000)
  // measuring while a copy is being made would only measure the build competing with the player
  if (await building()) throw new Error('the preview copy is still being made after 40 minutes')
  if (Date.now() - t0 > 5000) report.copyBuildSeconds = Math.round((Date.now() - t0) / 1000)
  await wait(3000) // the player switches to a fresh copy on the next pause
}

const VIDEOS = `[...document.querySelectorAll('video')].filter((v) => v.currentSrc && v.duration > 0)`

/**
 * Jumps the playhead like a person would (through the editor) and times how long until every video that
 * has to move (the player and the webcam) has landed on its new frame.
 */
async function seekTimes(spots) {
  await run('window.__scrim.play(false)')
  await wait(800)
  const times = []
  for (const at of spots) {
    times.push(await run(`(async () => {
      const moving = ${VIDEOS}.filter((v) => !/screen[^\\\\/]*\\.mp4$/i.test(decodeURIComponent(v.currentSrc))) // the sharp original only follows later
      const before = moving.map((v) => v.currentTime)
      const s = performance.now()
      // listen first: a quick seek can finish before we look
      const done = moving.map((v) => new Promise((res) => { v.addEventListener('seeked', () => res(performance.now()), { once: true }); setTimeout(() => res(null), 5000) }))
      window.__scrim.seek(${at})
      await new Promise((r) => setTimeout(r, 100))
      const ends = await Promise.all(moving.map((v, i) => (v.seeking || Math.abs(v.currentTime - before[i]) > 0.5 ? done[i] : s)))
      return ends.includes(null) ? 5000 : Math.round(Math.max(...ends) - s)
    })()`))
    await wait(1200)
  }
  return times
}

/** The longest stretch without idle samples, as the call stacks that filled it (most common first). */
function busiestStretch(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  let best = { ms: 0, ids: [] }
  let cur = null
  profile.samples.forEach((id, i) => {
    const ms = profile.timeDeltas[i] / 1000
    if (byId.get(id).callFrame.functionName !== '(idle)') (cur ??= { ms: 0, ids: [] }), (cur.ms += ms), cur.ids.push(id)
    else if (cur) (cur.ms > best.ms && (best = cur)), (cur = null)
  })
  const stack = (id) => { const out = []; for (; id; id = parent.get(id)) { const f = byId.get(id).callFrame; out.push(`${f.functionName || '(anon)'}${f.url ? '@' + f.url.split('/').pop() + ':' + f.lineNumber : ''}`) } return out.slice(0, 8).join(' < ') }
  const counts = new Map()
  for (const id of best.ids) counts.set(stack(id), (counts.get(stack(id)) ?? 0) + 1)
  return { ms: Math.round(best.ms), stacks: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6) }
}

async function coldPlay(at, profile = false) {
  await run('window.__scrim.play(false)')
  await wait(800)
  await run(`window.__scrim.seek(${at})`)
  await wait(2500)
  await run(`(() => {
    const W = (window.__perf = { long: [] })
    W.q0 = new Map(${VIDEOS}.map((v) => [v, v.getVideoPlaybackQuality()]))
    W.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) W.long.push(e.duration) })
    W.obs.observe({ type: 'longtask' })
    // playback speed = video time moved / wall time, adding only small steps so a jump over a cut isn't counted
    W.main = document.querySelector('video'); W.moved = 0; W.last = W.main.currentTime; W.w0 = performance.now()
    W.iv = setInterval(() => { const d = W.main.currentTime - W.last; if (d >= 0 && d < 0.5) W.moved += d; W.last = W.main.currentTime }, 100)
  })()`)
  if (profile) await cdp('Profiler.enable'), await cdp('Profiler.setSamplingInterval', { interval: 250 }), await cdp('Profiler.start')
  await run('window.__scrim.play(true)')
  await wait(PLAY_SECONDS * 1000)
  if (profile) report.firstPlayProfile = busiestStretch((await cdp('Profiler.stop')).profile)
  return run(`(() => {
    const W = window.__perf
    W.obs.disconnect()
    clearInterval(W.iv)
    const realtime = W.moved / ((performance.now() - W.w0) / 1000)
    window.__scrim.play(false)
    let decoded = 0, dropped = 0
    for (const [v, q0] of W.q0) {
      const q = v.getVideoPlaybackQuality()
      if (v.paused && q.totalVideoFrames === q0.totalVideoFrames) continue
      decoded += q.totalVideoFrames - q0.totalVideoFrames
      dropped += q.droppedVideoFrames - q0.droppedVideoFrames
    }
    return { realtime: +realtime.toFixed(3), droppedPct: decoded ? +((dropped / decoded) * 100).toFixed(1) : 0, worstLongTaskMs: Math.round(Math.max(0, ...W.long)) }
  })()`)
}

const report = { project: dir, limits: LIMITS, seeks: {}, plays: [], failures: [] }
try {
  await openProject()
  const { duration } = await run('window.__scrim.state()')
  // the player plays a preview copy: it has to be as long as the recording, or every number below is meaningless
  const playing = await run(`(() => { const v = document.querySelector('video'); return { file: decodeURIComponent(v.currentSrc).split(/[\\\\/]/).pop(), length: v.duration } })()`)
  report.playerFile = playing
  if (Math.abs(playing.length - duration) > 1.5) report.failures.push(`${playing.file} is ${playing.length.toFixed(1)} s long, the recording ${duration.toFixed(1)} s`)
  const spots = SPOTS.map((f) => Math.round(duration * f))
  // one spot in the middle of the webcam, where the most work happens
  const webcam = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).media.webcam
  const camLen = await run(`(${VIDEOS}.find((v) => /cam/i.test(decodeURIComponent(v.currentSrc)))?.duration) ?? 0`)
  if (webcam && camLen) spots.push(Math.round(Math.min(duration - PLAY_SECONDS - 1, webcam.offset + camLen / 2)))
  // jumps that land inside and outside the webcam, never twice on the same spot
  const jumps = [0.12, 0.62, 0.33, 0.88, 0.52].map((f) => Math.round(duration * f) + 7)
  if (webcam && camLen) jumps.push(Math.round(webcam.offset + camLen * 0.3), Math.round(webcam.offset + camLen * 0.8))
  report.seeks = { 'playhead jump (player + webcam)': await seekTimes(jumps) }
  for (const [i, at] of spots.entries()) report.plays.push({ at, ...(await coldPlay(at, profileFirstPlay && i === 0)) })
} finally {
  ws.close()
  app.kill()
}

for (const [file, times] of Object.entries(report.seeks)) if (Math.max(...times) > LIMITS.seekMs) report.failures.push(`${file}: slowest seek ${Math.max(...times)} ms > ${LIMITS.seekMs}`)
for (const p of report.plays) {
  if (p.realtime < LIMITS.realtime) report.failures.push(`play at ${p.at}s: ${p.realtime}x speed < ${LIMITS.realtime}`)
  if (p.droppedPct > LIMITS.droppedPct) report.failures.push(`play at ${p.at}s: ${p.droppedPct}% frames dropped > ${LIMITS.droppedPct}`)
  if (p.worstLongTaskMs > LIMITS.longTaskMs) report.failures.push(`play at ${p.at}s: page froze ${p.worstLongTaskMs} ms > ${LIMITS.longTaskMs}`)
}

if (asJson) console.log(JSON.stringify(report, null, 1))
else {
  if (report.copyBuildSeconds) console.log(`waited ${report.copyBuildSeconds} s for the preview copies to be made`)
  for (const [file, times] of Object.entries(report.seeks)) console.log(`seek  ${file.padEnd(28)} ${times.join(' ')} ms`)
  for (const p of report.plays) console.log(`play  at ${String(p.at).padStart(5)}s   speed ${p.realtime}x   dropped ${p.droppedPct}%   worst freeze ${p.worstLongTaskMs} ms`)
  if (report.firstPlayProfile) {
    console.log(`first Play, busiest ${report.firstPlayProfile.ms} ms:`)
    for (const [stack, n] of report.firstPlayProfile.stacks) console.log(`  ${n}x ${stack}`)
  }
  console.log(report.failures.length ? `FAIL\n  ${report.failures.join('\n  ')}` : 'PASS')
}
process.exit(report.failures.length ? 1 : 0)
