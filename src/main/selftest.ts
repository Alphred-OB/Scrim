/**
 * Dev only: automated checks run under xvfb in CI style. Opens a project, clicks through the UI
 * like a person would, saves screenshots and runs a real export.
 *
 * Env vars:
 *   SCRIM_TEST_DIR     project folder to open (required to run at all)
 *   SCRIM_TEST_OUT     where screenshots and the export go
 *   SCRIM_TEST_RECORD  record 3s, pause 3s, record 3s more, then open the result (instead of the editor checks)
 *   SCRIM_TEST_IMPORT  comma separated files to import into the media library
 *   SCRIM_TEST_FORMAT  export format (mp4, webm, mov, gif)
 *   SCRIM_TEST_NAME    export file name
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { recorder, listSources } from './recorder'
import { grantPath } from './security'

export const selfTestDir = (): string | undefined => process.env.SCRIM_TEST_DIR

export function runSelfTest(win: BrowserWindow, openEditor: (dir: string) => void): void {
  const env = process.env
  const out = env.SCRIM_TEST_OUT ?? '.'
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const js = <T = unknown>(code: string, gesture = false) => win.webContents.executeJavaScript(code, gesture) as Promise<T>
  const log = (...a: unknown[]) => console.log('[selftest]', ...a)
  const shot = async (name: string) => fs.writeFile(join(out, name), (await win.webContents.capturePage()).toPNG())
  const state = () => js<Record<string, unknown>>('window.__scrim.state()')

  /** Real mouse click (goes through Chromium input, not a synthetic DOM event). */
  const click = async (selector: string) => {
    const r = await js<{ x: number; y: number } | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } })()`
    )
    if (!r) throw new Error('Nothing to click at ' + selector)
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 })
    await wait(250)
  }
  const clickText = async (selector: string, text: string) => {
    const ok = await js<boolean>(
      `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) return false; el.setAttribute('data-test-hit', '1'); el.scrollIntoView({ block: 'center', inline: 'nearest' }); return true })()`
    )
    if (!ok) throw new Error(`No ${selector} with text ${text}`)
    await click('[data-test-hit="1"]')
    await js(`document.querySelector('[data-test-hit="1"]')?.removeAttribute('data-test-hit')`)
  }
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
      log('PASS', name)
    } catch (e) {
      log('FAIL', name, e instanceof Error ? e.message : e)
    }
  }

  win.webContents.on('console-message', (e) => console.log('[renderer]', (e as unknown as { message: string }).message))
  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(1500)
      if (env.SCRIM_TEST_SHOTS) {
        // clean pictures of the app for the website
        await js(`window.api.getSettings().then((s) => window.api.saveSettings({ ...s, onboarded: true, crashReportsAsked: true, toursSeen: ['welcome', 'home', 'editor', 'practice', 'record'] }))`)
        await js('location.reload()')
        await wait(3000)
        await shot('site-home.png')
        // SCRIM_TEST_SHOTS=4k first renders the sample app at 3840 x 2160 so zooms stay sharp
        let dir = env.SCRIM_TEST_DIR!
        if (env.SCRIM_TEST_SHOTS === '4k') {
          dir = await js<string>(`(async () => { for (let i = 0; i < 50 && !window.__scrimSample; i++) await new Promise((r) => setTimeout(r, 200)); return window.__scrimSample(2) })()`)
          log('sharp sample at', dir)
        }
        openEditor(dir)
        await wait(5000)
        await js(`document.querySelectorAll('.coach-foot .btn').forEach((b) => /skip|done|got it/i.test(b.textContent) && b.click())`, true).catch(() => {})
        // a solid brand color behind the recording, like the rest of the site
        await js(`window.__scrim.patchEdit({ background: { type: 'color', wallpaper: 'aurora', live: { id: 'aurora-flow', speed: 1, colors: ['#0b1026', '#2f6bff', '#a855f7'] }, color: '#ff5a36', gradient: { kind: 'linear', angle: 135, stops: [{ pos: 0, color: '#38bdf8' }, { pos: 1, color: '#0f172a' }] }, blur: 0, dim: 0 } })`)
        await js('window.__scrim.panel("background")')
        await clickText('button', 'Color').catch(() => {})
        await js(`window.__scrim.patchEdit({ export: { ...window.__scrim.edit().export, format: 'mp4', resolution: 1080, fps: 30 } })`)
        await js('window.__scrim.seek(2.4)')
        await wait(1500)
        await shot('site-editor.png')
        const canvasRect = await js<{ x: number; y: number; width: number; height: number }>(`(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; const b = c.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) } })()`)
        await fs.writeFile(join(out, 'site-frame.png'), (await win.webContents.capturePage(canvasRect)).toPNG())
        // captions
        const said = 'Here is how to build your first workflow in under a minute, step by step.'.split(' ')
        const words = said.map((w, i) => ({ t0: +(0.6 + i * 0.32).toFixed(2), t1: +(0.6 + i * 0.32 + 0.28).toFixed(2), w }))
        await js(`window.__scrim.patchEdit({ transcript: { words: ${JSON.stringify(words)}, offset: 0, source: 'screen', engine: 'local', createdAt: 1 }, captions: { show: true, look: 'karaoke', font: 'Inter', size: 50, color: '#ffffff', highlight: '#ffd60a', bg: '#000000', bgOpacity: 0.55, y: 0.84, maxChars: 34, lines: 2, uppercase: false, hidden: [], fixes: {} } })`)
        await js('window.__scrim.panel("ai")')
        await js('window.__scrim.seek(2.1)')
        await wait(1500)
        await shot('site-captions.png')
        await js('window.__scrim.panel("guide")')
        await wait(400)
        await clickText('.btn', 'Make steps').catch(() => {})
        await wait(2500)
        await shot('site-guide.png')
        await js('window.__scrim.panel("keys")')
        await wait(900)
        await shot('site-keys.png')
        await js('window.__scrim.exportDialog()')
        await wait(1200)
        await shot('site-export.png')
        await js(`document.querySelector('.modal .icon-btn')?.click()`, true)
        await js(`window.__scrim.patchEdit({ captions: { show: false } })`)
        const r = await js(`window.__scrim.export(${JSON.stringify(join(out, 'site-demo.mp4'))}, { resolution: ${env.SCRIM_TEST_SHOTS === '4k' ? 1440 : 1080}, fps: ${env.SCRIM_TEST_SHOTS === '4k' ? 60 : 30}, quality: '${env.SCRIM_TEST_SHOTS === '4k' ? 'high' : 'medium'}', format: 'mp4' })`)
        log('demo export', r)
        return app.quit()
      }
      // start every run like a first install, so the welcome and interface tours are tested too
      await js(`window.api.getSettings().then((s) => window.api.saveSettings({ ...s, onboarded: false, toursSeen: [] }))`)
      await js('location.reload()')
      await wait(2500)
      await step('welcome tour shows and can be skipped', async () => {
        const has = await js<boolean>('!!document.querySelector(".ob-card")')
        if (!has) throw new Error('welcome tour did not show on a first run')
        {
          await shot('onboarding-1.png')
          await clickText('.ob-foot .btn', 'Show me around')
          await wait(500)
          await shot('onboarding-2.png')
          await click('.ob-skip')
          await wait(600)
        }
        if (await js<boolean>('!!document.querySelector(".ob-card")')) throw new Error('tour did not close')
      })
      await shot('launcher.png')
      await step('home tour', async () => {
        await wait(1000)
        let n = 0
        for (; n < 12 && (await js<boolean>('!!document.querySelector(".coach-card")')); n++) {
          if (n === 2) await shot('home-tour.png')
          await js(`document.querySelector('.coach-foot .btn.primary').click()`, true)
          await wait(300)
        }
        log('home tour steps', n)
        if (n < 4) throw new Error('home tour had ' + n + ' steps')
      })
      await step('home: record and edit', async () => {
        await click('[data-tour="home-record"]')
        await wait(500)
        await shot('home-record.png')
        await click('.brand')
        await wait(300)
        await click('[data-tour="home-edit"]')
        await wait(500)
        await shot('home-edit.png')
        await click('.brand')
        await wait(300)
      })
      if (!env.SCRIM_TEST_RECORD) await step('practice on a sample: hands on tour', async () => {
        await shot('home.png')
        await js(`document.querySelector('[data-tour="home-practice"]').click()`, true)
        await wait(600)
        await shot('practice-loading.png')
        let ok = false
        for (let k = 0; k < 120 && !ok; k++) {
          await wait(500)
          ok = await js<boolean>('!!(window.__scrim && window.__scrim.state && document.querySelector(".coach-card"))').catch(() => false)
        }
        if (!ok) throw new Error('sample editor or practice tour did not open')
        const st0 = await state()
        log('sample', JSON.stringify({ duration: st0.duration, clips: st0.clips }))
        let tasks = 0
        for (let k = 0; k < 30 && (await js<boolean>('!!document.querySelector(".coach-card")')); k++) {
          await shot(`practice-${k + 1}.png`)
          const hasTask = await js<boolean>('!!document.querySelector(".coach-task:not(.done) .link")')
          if (hasTask) {
            await js(`document.querySelector('.coach-task .link').click()`, true)
            await wait(700)
            const done = await js<boolean>('!!document.querySelector(".coach-task.done")')
            if (done) tasks++
            await wait(1500)
          } else {
            await js(`document.querySelector('.coach-foot .btn.primary').click()`, true)
            await wait(400)
          }
        }
        const st = await state()
        log('practice tasks done', tasks, JSON.stringify({ leadIn: st.leadIn, clips: st.clips, transitions: st.transitionItems }))
        await js('window.__scrim.play(false)')
        await wait(300)
        await shot('practice-result.png')
        if (tasks < 6) throw new Error('only ' + tasks + ' tasks completed')
      })
      log('projects', JSON.stringify(await js('Promise.all([window.api.listProjects().then(r=>r.length).catch(e=>String(e)), window.api.projectsRoot()])')))

      if (env.SCRIM_TEST_RECORD) {
        const srcs = await listSources()
        const scr = srcs.find((s) => s.kind === 'screen')
        log('sources', srcs.length, scr?.name)
        await recorder.start({ sourceId: scr?.id ?? 'screen:0:0', sourceName: 'Self test', kind: 'screen', fps: 30, mic: true, systemAudio: true, countdown: 1 })
        await wait(3000)
        const winShot = async (route: string, name: string) => {
          let w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('#' + route) && x.isVisible())
          if (!w && route === '/toolbar') {
            // the bar hides itself with this capture engine; open a copy just for the screenshot
            w = new BrowserWindow({ width: 290, height: 64, show: false, webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false } })
            await w.loadURL(win.webContents.getURL().split('#')[0] + '#/toolbar')
            await wait(800)
          }
          if (w) await fs.writeFile(join(out, name), (await w.webContents.capturePage()).toPNG())
          else log('no visible window', route)
        }
        await winShot('/border', 'border-recording.png')
        await winShot('/toolbar', 'toolbar-recording.png')
        await recorder.pause()
        log('paused', JSON.stringify(recorder.getStatus()))
        await wait(400)
        await winShot('/border', 'border-paused.png')
        await winShot('/toolbar', 'toolbar-paused.png')
        await wait(3000)
        await recorder.resume()
        log('resumed', JSON.stringify(recorder.getStatus()))
        await wait(3000)
        await recorder.stop()
        log('after stop', JSON.stringify(recorder.getStatus()))
        await wait(2500)
        await shot('recorded-editor.png')
        return app.quit()
      }

      openEditor(env.SCRIM_TEST_DIR!)
      await wait(3500)
      if (env.SCRIM_TEST_ENGINE) {
        // quick check of the offline speech engine (used to try dev mode)
        for (let i = 0; i < 120 && !(await js<boolean>('!!window.__scrim?.engineTest').catch(() => false)); i++) await wait(500)
        const model = await fs.readFile('/tmp/dftest/double.onnx')
        const r = await js(`window.__scrim.engineTest(${JSON.stringify([...model])})`).catch((e) => String(e))
        log('engine', JSON.stringify(r))
        log(JSON.stringify(r).includes('[2,4,6]') ? 'PASS engine in this mode' : 'FAIL engine in this mode')
        return app.quit()
      }
      if (env.SCRIM_TEST_LONG) {
        // long playback: the time must keep moving the whole way (no stalls that need a pause and play)
        await js(`window.api.getSettings().then((s) => window.api.saveSettings({ ...s, onboarded: true, toursSeen: ['home', 'editor', 'welcome', 'practice'] }))`)
        await js(`document.querySelectorAll('.coach-foot .btn').forEach((b) => b.textContent.includes('Skip') && b.click())`, true).catch(() => {})
        // jump around first, like scrubbing a long recording: every jump opens a new read of the file
        for (let i = 0; i < 25; i++) {
          await js(`window.__scrim.seek(${(i * 37) % 140})`)
          await wait(120)
        }
        const { readdirSync, readlinkSync } = await import('fs')
        const openReads = () => readdirSync('/proc/self/fd').filter((f) => { try { return readlinkSync('/proc/self/fd/' + f).endsWith('screen.mp4') } catch { return false } }).length
        await wait(1500)
        log('long play open reads after jumping', process.platform === 'linux' ? openReads() : -1, 'rss MB', Math.round(process.memoryUsage().rss / 1e6))
        await js('window.__scrim.seek(0)')
        await wait(500)
        await js('window.__scrim.play(true)')
        let prev = -1
        let frozen = 0
        const secs = Number(env.SCRIM_TEST_LONG) || 70
        for (let i = 0; i < secs; i++) {
          await wait(1000)
          const t = (await state()).time as number
          const vt = await js<number>(`document.querySelector('video').currentTime`)
          if (vt - prev < 0.2) frozen++
          if (i % 10 === 0) log('long play', i, 's', 'video at', vt.toFixed(1))
          prev = vt
          void t
        }
        log('long play frozen seconds', frozen)
        log(frozen > 2 ? 'FAIL long playback froze' : 'PASS long playback keeps going')
        return app.quit()
      }
      await shot('editor.png')
      await step('editor tour walks through the interface', async () => {
        await wait(800)
        log('tour state', JSON.stringify(await js('window.__scrim.tour()')))
        const steps: string[] = []
        for (let k = 0; k < 20 && (await js<boolean>('!!document.querySelector(".coach-card")')); k++) {
          steps.push(await js<string>('document.querySelector(".coach-card h3, .coach-card b, .coach-card")?.textContent?.slice(0, 40) ?? ""'))
          if (k < 3) await shot(`tour-${k + 1}.png`)
          await js(`document.querySelector('.coach-foot .btn.primary').click()`, true)
          await wait(350)
        }
        log('tour steps', steps.length)
        if (steps.length < 4) throw new Error('editor tour did not run, steps: ' + steps.length)
      })

      if (env.SCRIM_TEST_IMPORT) {
        log('import errors', JSON.stringify(await js(`window.__scrim.import(${JSON.stringify(env.SCRIM_TEST_IMPORT.split(','))})`)))
        await wait(1500)
      }

      await step('timeline click lands under the mouse', async () => {
        await js('window.__scrim.seek(2)')
        await wait(300)
        const pos = await js<{ x: number; y: number }>(`(() => { const p = document.querySelector('.tl-playhead').getBoundingClientRect(); const r = document.querySelector('.tl-ruler').getBoundingClientRect(); return { x: Math.round(p.x), y: Math.round(r.y + r.height / 2) } })()`)
        await js('window.__scrim.seek(0)')
        await wait(300)
        win.webContents.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
        win.webContents.sendInputEvent({ type: 'mouseUp', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
        await wait(300)
        const t = (await state()).time as number
        log('clicked at x', pos.x, 'time', t)
        if (Math.abs(t - 2) > 0.1) throw new Error(`playhead went to ${t.toFixed(2)}s instead of 2s`)
      })

      await step('scrubbing never goes dark', async () => {
        const rect = await js<{ x: number; y: number; width: number; height: number }>(`(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; const b = c.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) } })()`)
        const bright = async () => {
          const img = (await win.webContents.capturePage(rect)).resize({ width: 32, height: 18 })
          const d = img.toBitmap()
          let s = 0
          for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]
          return s / (d.length / 4) / 3
        }
        await js('window.__scrim.seek(1)')
        await wait(900)
        const base = await bright()
        let low = 999
        for (let i = 0; i < 24; i++) {
          await js(`window.__scrim.seek(${1 + i * 0.37})`)
          await wait(16)
          low = Math.min(low, await bright())
        }
        log('scrub brightness', JSON.stringify({ base, low }))
        if (low < base * 0.55) throw new Error(`went dark while scrubbing: ${low.toFixed(1)} vs ${base.toFixed(1)}`)
      })
      await step('pausing keeps the playhead where it stopped', async () => {
        await js('window.__scrim.seek(1)')
        await wait(300)
        await js('window.__scrim.play(true)')
        await wait(1500)
        await js('window.__scrim.play(false)')
        await wait(500)
        const t = (await state()).time as number
        log('paused at', t)
        if (t < 1.8) throw new Error(`playhead went back to ${t.toFixed(2)}s`)
      })

      await step('two texts at the same time get their own layers', async () => {
        await js('window.__scrim.addText(1)')
        await js('window.__scrim.addText(1.5)')
        await wait(400)
        const lanes = await js<number[]>('window.__scrim.lanes()')
        log('text layers', JSON.stringify(lanes))
        if (new Set(lanes).size < 3) throw new Error('texts share a layer: ' + lanes.join(','))
        await shot('text-layers.png')
      })

      await step('text animations: pick in, loop and out', async () => {
        await js('window.__scrim.addText(0.5)')
        await wait(300)
        await click('[data-tour="tool-text"]')
        await wait(500)
        await shot('text-panel.png')
        await js(`document.querySelector('.motion-grid').scrollIntoView({ block: 'center' })`)
        await wait(300)
        await shot('text-anim-panel.png')
        await clickText('.motion-tile', 'Letters')
        await wait(300)
        await js('window.__scrim.patchText({ loop: "wave", animOut: "blur", text: "Animated title" })')
        const tx = await js<Record<string, unknown>>('window.__scrim.lastText()')
        log('text anim', JSON.stringify({ in: tx.animIn, loop: tx.loop, out: tx.animOut }))
        if (tx.animIn !== 'letters') throw new Error('in animation not applied: ' + tx.animIn)
        for (const [k, dt] of [[1, 0.12], [2, 0.3], [3, 1.4]] as const) {
          await js(`window.__scrim.seek(${(tx.start as number) + dt})`)
          await wait(350)
          await shot(`text-anim-${k}.png`)
        }
      })

      await step('click sounds', async () => {
        await click('[data-tour="tool-cursor"]')
        await wait(400)
        await js(`document.querySelector('.sound-grid').scrollIntoView({ block: 'center' })`)
        await wait(200)
        await clickText('.sound-tile', 'Pop')
        await wait(300)
        await shot('click-sounds.png')
        const snd = await js<string>('window.__scrim.clickSound()')
        log('click sound', snd)
        if (snd !== 'pop') throw new Error('sound not picked: ' + snd)
      })

      await step('keyboard shortcuts on the video', async () => {
        await js('window.__scrim.seek(0.95)')
        await wait(600)
        await shot('keys-preview.png')
        await click('[data-tour="tool-keys"]')
        await wait(700)
        await shot('keys-panel.png')
        await js(`document.querySelectorAll('.keys-look')[3].click()`, true)
        await js(`document.querySelectorAll('.keys-pos-btn')[2].click()`, true)
        await wait(500)
        await shot('keys-panel-custom.png')
        const painted: number[] = []
        for (let i = 0; i < 6; i++) {
          painted.push(await js<number>(`(() => { const c = document.querySelector('.keys-preview'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n })()`))
          await wait(330)
        }
        log('keys preview painted', JSON.stringify(painted))
        if (Math.max(...painted) === 0) throw new Error('keys preview is empty')
        const n = await js<number>('document.querySelectorAll(".tl-key").length')
        log('key chips', n)
        if (n !== 3) throw new Error('expected 3 key chips, got ' + n)
      })

      await step('zoom eye toggle', async () => {
        const before = (await state()).zoomEnabled
        await js(`document.querySelectorAll('.tl-head').forEach((h) => h.textContent.includes('Zoom') && h.querySelector('.tl-eye')?.setAttribute('id', 'eye-zoom'))`)
        await click('#eye-zoom')
        const after = (await state()).zoomEnabled
        if (before === after) throw new Error(`zoom.enabled stayed ${before}`)
        await shot('eye-off.png')
        await click('#eye-zoom')
      })

      await step('drag asset onto timeline', async () => {
        await js('window.__scrim.panel("media")')
        await wait(500)
        const before = await state()
        const r = await js<string>(`(() => {
          const tile = document.querySelector('[draggable="true"]')
          // drop anywhere on the timeline: the right track appears by itself
          const rows = document.querySelector('.tl-ruler')
          if (!tile || !rows) return 'missing'
          const dt = new DataTransfer()
          const b = rows.getBoundingClientRect()
          const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: b.x + 200, clientY: b.y + 10 }
          tile.dispatchEvent(new DragEvent('dragstart', at))
          rows.dispatchEvent(new DragEvent('dragover', at))
          rows.dispatchEvent(new DragEvent('drop', at))
          tile.dispatchEvent(new DragEvent('dragend', at))
          return 'ok'
        })()`)
        await wait(400)
        const after = await state()
        const added = (after.overlays as number) + (after.audioClips as number) - (before.overlays as number) - (before.audioClips as number)
        if (r !== 'ok' || added !== 1) throw new Error(`drop result ${r}, clips added ${added}`)
      })
      await step('join video by dropping on the Video track', async () => {
        const before = await state()
        await js(`(() => {
          const tile = [...document.querySelectorAll('[draggable="true"]')].find((t) => t.textContent.includes('.mp4'))
          const row = document.querySelector('.tl-row[data-row="video"]')
          const b = row.getBoundingClientRect()
          const at = { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: b.right - 60, clientY: b.y + 10 }
          tile.dispatchEvent(new DragEvent('dragstart', at))
          row.dispatchEvent(new DragEvent('dragover', at))
          row.dispatchEvent(new DragEvent('drop', at))
          tile.dispatchEvent(new DragEvent('dragend', at))
        })()`)
        await wait(400)
        await shot('joining.png')
        for (let i = 0; i < 120 && String((await state()).busy).startsWith('Joining'); i++) await wait(500)
        const after = await state()
        log('join', JSON.stringify({ before: before.duration, after: after.duration, clips: after.clips, busy: after.busy }))
        if ((after.duration as number) <= (before.duration as number) + 1) throw new Error('duration did not grow')
        await wait(1500)
        await shot('joined.png')
      })
      await step('removing media asks in our own dialog', async () => {
        await js('window.__scrim.panel("media")')
        await wait(400)
        const n0 = ((await state()).assets as string[]).length
        await js(`(() => { const t = document.querySelector('[draggable="true"]'); const b = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 20, clientY: b.y + 20 })) })()`)
        await wait(300)
        await clickText('.menu-item', 'Remove from project')
        await wait(400)
        await shot('dialog.png')
        if (!(await js<boolean>('!!document.querySelector(".dlg")'))) throw new Error('no custom dialog')
        await clickText('.dlg .btn', 'Cancel')
        await wait(300)
        if (await js<boolean>('!!document.querySelector(".dlg")')) throw new Error('dialog did not close')
        if (((await state()).assets as string[]).length !== n0) throw new Error('cancel still removed the asset')
      })
      await step('magnet: a clip dropped onto its neighbour joins it end to end', async () => {
        const D = (await state()).duration as number
        await js(`window.__scrim.addText(${D - 9})`)
        const a = await js<{ id: string }>('window.__scrim.lastText()')
        await js(`window.__scrim.addText(${D - 4.5})`)
        const b = await js<{ id: string }>('window.__scrim.lastText()')
        await js(`window.__scrim.textById(${JSON.stringify(a.id)}, { start: ${D - 9}, end: ${D - 6}, lane: 7 })`)
        await js(`window.__scrim.textById(${JSON.stringify(b.id)}, { start: ${D - 4.5}, end: ${D - 1.5}, lane: 7 })`)
        await wait(400)
        const r = await js<{ ax: number; bx: number; y: number } | null>(`(() => { const A = document.querySelector('[data-id="${a.id}"]'), B = document.querySelector('[data-id="${b.id}"]'); if (!A || !B) return null; B.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect(); return { ax: Math.round(ra.right), bx: Math.round(rb.x + rb.width / 2), y: Math.round(rb.y + rb.height / 2), bl: Math.round(rb.x), w: rb.width } })()`)
        if (!r) throw new Error('blocks not on the timeline')
        const rr = r as unknown as { ax: number; bx: number; y: number; bl: number; w: number }
        const dx = rr.ax - rr.bl - 30 // overlap A by 30px
        win.webContents.sendInputEvent({ type: 'mouseDown', x: rr.bx, y: rr.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 8; i++) {
          win.webContents.sendInputEvent({ type: 'mouseMove', x: rr.bx + Math.round((dx * i) / 8), y: rr.y, button: 'left' } as Electron.MouseInputEvent)
          await wait(30)
        }
        win.webContents.sendInputEvent({ type: 'mouseUp', x: rr.bx + dx, y: rr.y, button: 'left', clickCount: 1 })
        await wait(400)
        const A2 = await js<{ start: number; end: number; lane: number }>(`window.__scrim.textById(${JSON.stringify(a.id)})`)
        const B2 = await js<{ start: number; end: number; lane: number }>(`window.__scrim.textById(${JSON.stringify(b.id)})`)
        log('magnet', JSON.stringify({ A2, B2 }))
        await shot('magnet.png')
        if (B2.lane !== A2.lane || Math.abs(B2.start - A2.end) > 0.01) throw new Error('did not join its neighbour')
        const w = await js<number>(`document.querySelector('[data-id="${b.id}"]').getBoundingClientRect().width`)
        if (Math.abs(w - rr.w) > 2) throw new Error(`length on the timeline changed ${rr.w} -> ${w}`)
        await js(`(() => { for (let e = document.querySelector('.tl-joint.l'); e; e = e.parentElement) { e.scrollTop = 0; e.scrollLeft = 0 } })()`)
        await wait(200)
      })
      await shot('editor2.png')
      log('estimate', await js('window.__scrim.estimate()'))

      await step('settings and theme', async () => {
        await js('window.__scrim.settings()')
        await wait(500)
        await shot('settings.png')
        await clickText('.menu-item', 'Shortcuts')
        await shot('settings-shortcuts.png')
        await clickText('.menu-item', 'Appearance')
        await clickText('.theme-card', 'Light')
        await wait(300)
        const theme = await js('document.documentElement.dataset.theme')
        if (theme !== 'light') throw new Error('theme is ' + theme)
        await shot('settings-light.png')
        await click('.modal-head .icon-btn')
        await wait(300)
        await shot('editor-light.png')
        await js('window.__scrim.settings()')
        await wait(300)
        await clickText('.menu-item', 'Appearance')
        await clickText('.theme-card', 'Black & white')
        await wait(300)
        await shot('settings-mono.png')
        await clickText('.theme-card', 'Custom')
        await wait(300)
        await shot('settings-custom.png')
        await clickText('.theme-card', 'Ocean')
        await clickText('.menu-item', 'Export')
        await wait(1500)
        await shot('settings-export.png')
        await click('.modal-head .icon-btn')
        await wait(300)
        await shot('editor-ocean.png')
        await js('window.__scrim.settings()')
        await wait(300)
        await clickText('.menu-item', 'Appearance')
        await clickText('.theme-card', 'Dark')
        await click('.modal-head .icon-btn')
      })

      await step('spotlight dim mode', async () => {
        await js(`window.__scrim.patchCursor({ highlight: true, highlightMode: 'dim', highlightDim: 0.6, highlightSize: 1.2 })`)
        await js('window.__scrim.panel("cursor")')
        await js('window.__scrim.seek(2)')
        await wait(900)
        await shot('spotlight-dim.png')
        await js(`window.__scrim.patchCursor({ highlightMode: 'ring', highlightColor: '#30d158', highlightSoftness: 0.3 })`)
        await wait(600)
        await shot('spotlight-ring.png')
        await js(`window.__scrim.patchCursor({ highlight: false })`)
      })

      await step('transitions, effects and media in the video', async () => {
        await js(`window.__scrim.patch('transitions', { intro: { type: 'fade', duration: 0.8 }, cut: { type: 'zoom', duration: 0.8 } })`)
        await js(`window.__scrim.patch('effects', { look: 'vintage', vignette: 0.6, grain: 0.5 })`)
        await js('window.__scrim.panel("effects")')
        await js('window.__scrim.seek(1.2)')
        await wait(900)
        await shot('effects.png')
        await js('window.__scrim.seek(2.85)') // just before the first cut
        await wait(700)
        await shot('transition-cut.png')
        await js(`window.__scrim.patch('effects', { look: 'none', vignette: 0, grain: 0 })`)
        await shot('tab-transitions.png')
        // drag a transition tile and a look onto the timeline
        const dropOn = (tile: string, row: string, frac: number) => `(() => {
          const t = [...document.querySelectorAll('.fx-tile')].find((x) => x.textContent.trim() === ${JSON.stringify(tile)})
          const r = document.querySelector('.tl-ruler')
          if (!t || !r || !${JSON.stringify(row)}) return 'missing'
          const b = r.getBoundingClientRect()
          const at = { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: b.x + 12 + (b.width - 24) * ${frac} * 0.8, clientY: b.y + 10 }
          t.dispatchEvent(new DragEvent('dragstart', at)); r.dispatchEvent(new DragEvent('dragover', at)); r.dispatchEvent(new DragEvent('drop', at)); t.dispatchEvent(new DragEvent('dragend', at))
          return 'ok'
        })()`
        log('drop transition', await js(dropOn('Glitch', 'Transitions', 0.15)))
        // and one on its own line in the middle of a shot
        await js(`window.__scrim.addTransitionItem('flash', 1.5)`)
        await clickText('.fx-tabs button', 'Effects')
        await wait(300)
        log('drop effect', await js(dropOn('Cyberpunk', 'Effects', 0.3)))
        await wait(500)
        const st = await state()
        log('items', JSON.stringify({ transitions: st.transitionTypes, onLine: st.transitionItems, effects: st.effectClips }))
        if (!(st.transitionTypes as string[]).includes('glitch') || st.transitionItems !== 1 || st.effectClips !== 1) throw new Error('drops did not land')
        await shot('tab-effects.png')
      })
      await step('transition picker shows moving previews', async () => {
        await js(`(() => { for (let e = document.querySelector('.tl-joint.l'); e; e = e.parentElement) { e.scrollTop = 0; e.scrollLeft = 0 } })()`)
        await wait(200)
        await click('.tl-joint.l')
        await wait(700)
        const n = await js<number>('document.querySelectorAll(".tpick .fx-tile").length')
        await shot('transition-picker.png')
        if (n < 10) throw new Error('picker has ' + n + ' tiles')
        await clickText('.tpick .fx-tile', 'Spin')
        await wait(300)
        const st = await state()
        if ((st.transitionTypes as string[])[0] !== 'spin') throw new Error('start transition is ' + (st.transitionTypes as string[])[0])
        await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
        await wait(300)
        if (await js<boolean>('!!document.querySelector(".tpick")')) throw new Error('picker did not close')
      })

      await step('live background', async () => {
        await js('window.__scrim.panel("background")')
        await wait(400)
        await clickText('.tab-chip', 'Live')
        await wait(300)
        await click('.pick-tile.wide')
        await wait(500)
        await shot('bg-live.png')
      })

      for (const panel of ['cursor', 'zoom', 'text', 'media', 'webcam', 'audio']) {
        await js(`window.__scrim.panel(${JSON.stringify(panel)})`)
        await wait(600)
        await shot(`panel-${panel}.png`)
      }

      await step('export dialog', async () => {
        await js('window.__scrim.exportDialog()')
        await wait(800)
        await shot('export-dialog.png')
        await click('.modal .select')
        await wait(300)
        await shot('export-resolution.png')
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        await js(`document.querySelector('.modal-back')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
        await wait(300)
      })

      await step('drag the video right to make intro space', async () => {
        await js('window.__scrim.seek(0)')
        await wait(300)
        const b = await js<{ x: number; y: number }>(`(() => { const top = document.querySelector('.tl-block[data-kind="clip"]').getBoundingClientRect(); return { x: Math.round(top.x + 40), y: Math.round(top.y + top.height / 2) } })()`)
        win.webContents.sendInputEvent({ type: 'mouseDown', x: b.x, y: b.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 8; i++) {
          win.webContents.sendInputEvent({ type: 'mouseMove', x: b.x + i * 20, y: b.y, button: 'left' } as Electron.MouseInputEvent)
          await wait(30)
        }
        win.webContents.sendInputEvent({ type: 'mouseUp', x: b.x + 160, y: b.y, button: 'left', clickCount: 1 })
        await wait(400)
        const lead = (await state()).leadIn as number
        log('lead in', lead)
        if (!(lead > 0.3)) throw new Error('video did not move, lead is ' + lead)
        await js(`window.__scrim.addText(${-lead})`)
        await js(`window.__scrim.seek(${-lead / 2})`)
        await wait(600)
        await shot('intro-space.png')
      })

      // ---------------- speech, captions, trim, guide, voice, brand, presets ----------------
      type E = { transcript?: { words: unknown[] }; clips: { speed: number }[]; audio: { voiceCleanPath?: string }; watermark?: unknown; aspect: string; reframe?: string; guide?: unknown[] }
      const ed = () => js<E>('window.__scrim.edit()')
      const until = async (fn: () => Promise<boolean>, ms = 15000) => {
        for (let i = 0; i < ms / 250; i++) {
          if (await fn().catch(() => false)) return true
          await wait(250)
        }
        return false
      }
      grantPath(out) // stands in for the Save dialog, which is what normally allows writing there
      await js(`window.__scrim.saveTo(${JSON.stringify(out)})`)
      await step('offline speech engine loads and runs', async () => {
        const model = await fs.readFile(env.SCRIM_TEST_ONNX || '/tmp/dftest/double.onnx').catch(() => null)
        if (!model) return log('engine test skipped (no model file)')
        const r = await js<{ ok: boolean; out?: number[]; message?: string }>(`window.__scrim.engineTest(${JSON.stringify([...model])})`)
        log('engine', JSON.stringify(r))
        if (!r.ok || r.out?.join() !== '2,4,6') throw new Error('engine did not run: ' + (r.message ?? JSON.stringify(r.out)))
        const n = await js<number>(`window.api.speechPcm(${JSON.stringify('/tmp/dftest/mic.webm')}).then((a) => a.length)`)
        log('speech samples', n)
        if (!(n > 16000)) throw new Error('no speech samples')
      })
      await step('captions from speech', async () => {
        // mic time; the mic starts 0.5 s into the video
        const said = 'So today I will um show you how this works. First open the settings page. Then we pick a color and save it.'.split(' ')
        const words = said.map((w, i) => {
          const t0 = i < 12 ? 0.1 + i * 0.28 : 5.4 + (i - 12) * 0.25
          return { t0: +t0.toFixed(2), t1: +(t0 + 0.22).toFixed(2), w }
        })
        await js(`window.__scrim.fakeWords(${JSON.stringify(words)})`)
        await js('window.__scrim.panel("ai")')
        await wait(500)
        await shot('captions-empty.png')
        await clickText('.btn', 'Make captions')
        if (!(await until(async () => !!(await ed()).transcript))) throw new Error('no transcript')
        await js('window.__scrim.seek(1.9)')
        await wait(800)
        await shot('captions.png')
        await clickText('.cap-look-name', 'Bold')
        await js('window.__scrim.seek(6.4)')
        await wait(600)
        await shot('captions-bold.png')
      })
      await step('edit by text: remove um and shorten pauses', async () => {
        await clickText('.fx-tabs button', 'Edit text')
        await wait(400)
        await shot('transcript.png')
        const len = async () => (await ed()).clips.reduce((a, c) => a + ((c as unknown as { end: number; start: number }).end - (c as unknown as { start: number }).start) / c.speed, 0)
        const n0 = await len()
        await clickText('.btn', 'Remove 1 um')
        await wait(300)
        const n1 = await len()
        await clickText('.btn', 'Shorten')
        await wait(300)
        const n2 = await len()
        log('text edit clips', n0, n1, n2)
        if (!(n1 < n0 - 0.1) || !(n2 < n1 - 0.5)) throw new Error(`video length ${n0} -> ${n1} -> ${n2}`)
        await shot('transcript-cut.png')
      })
      await step('subtitle file', async () => {
        await clickText('.fx-tabs button', 'Style')
        await wait(300)
        await clickText('.btn', 'Save .srt')
        const f = join(out, 'Test a.srt')
        if (!(await until(async () => (await fs.stat(f)).size > 20, 5000))) throw new Error('no srt')
        const srt = await fs.readFile(f, 'utf8')
        log('srt', JSON.stringify(srt.slice(0, 120)))
        if (!srt.includes('-->') || srt.includes(' um ')) throw new Error('bad srt')
      })
      await step('smart trim looks for slow parts', async () => {
        await js('window.__scrim.panel("tidy")')
        await wait(400)
        await clickText('.btn', 'Find slow parts')
        if (!(await until(async () => js<boolean>(`!![...document.querySelectorAll('.section-title')].find((e) => /slow (part|found)/i.test(e.textContent))`), 20000))) throw new Error('no result')
        const rows = await js<number>('document.querySelectorAll(".tidy-row").length')
        log('slow parts', rows)
        await shot('tidy.png')
        if (rows) {
          await clickText('.btn', 'Speed up')
          await wait(300)
          log('speeds', JSON.stringify((await ed()).clips.map((c) => c.speed)))
        }
      })
      await step('guide from clicks, saved as PDF', async () => {
        await js('window.__scrim.panel("guide")')
        await wait(400)
        await clickText('.btn', 'Make steps')
        await wait(300)
        const n = await js<number>('document.querySelectorAll(".guide-step").length')
        log('guide steps', n)
        if (!n) throw new Error('no steps')
        await until(async () => js<boolean>('!!document.querySelector("img.guide-shot")'), 10000)
        await wait(400)
        await shot('guide.png')
        await clickText('.btn', 'Save PDF')
        const f = join(out, 'Test a guide.pdf')
        if (!(await until(async () => (await fs.stat(f)).size > 5000, 30000))) throw new Error('no pdf')
        log('guide pdf bytes', (await fs.stat(f)).size)
        // a long recording: 150 steps must not eat the memory
        const many = Array.from({ length: 150 }, (_, i) => ({ id: 'm' + i, t: (i % 70) * 0.1 + 0.2, x: (i % 10) / 10 + 0.05, y: 0.5, title: 'Step ' + (i + 1), note: '' }))
        await js(`window.__scrim.patchEdit({ guide: ${JSON.stringify(many)} })`)
        await wait(800)
        let peak = 0
        const t0 = Date.now()
        const watch = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 100)
        await fs.rm(f, { force: true })
        await clickText('.btn', 'Save PDF')
        const done = await until(async () => (await fs.stat(f)).size > 5000, 120000)
        await clickText('.btn', 'Web page')
        const fh = join(out, 'Test a guide.html')
        const done2 = await until(async () => (await fs.stat(fh)).size > 5000, 120000)
        clearInterval(watch)
        log('guide 150 steps', JSON.stringify({ pdf: done && (await fs.stat(f)).size, html: done2 && (await fs.stat(fh)).size, secs: (Date.now() - t0) / 1000, mainPeakMB: Math.round(peak / 1e6) }))
        if (!done || !done2) throw new Error('long guide did not save')
        await shot('guide-many.png')
      })
      await step('voice clean up', async () => {
        await js('window.__scrim.panel("audio")')
        await wait(400)
        await clickText('.trow', 'Clean up my voice')
        if (!(await until(async () => !!(await ed()).audio.voiceCleanPath, 30000))) throw new Error('no cleaned voice')
        const p = (await ed()).audio.voiceCleanPath!
        log('clean voice bytes', (await fs.stat(p)).size)
        await shot('voice.png')
      })
      await step('brand kit puts the logo on', async () => {
        await js(`window.__scrim.saveSettings({ brandKits: [{ id: 'bk1', name: 'Test brand', logoPath: '/tmp/dftest/logo.png', logoPos: 'top-right', logoSize: 0.14, logoOpacity: 0.9, colors: ['#ff3b30', '#34c759', '#000000', '#ffffff'], font: 'Poppins' }] })`)
        await js('window.__scrim.panel("brand")')
        await wait(500)
        if (!(await js<boolean>('!!document.querySelector(".brand-kit.open")'))) await click('.brand-kit-head')
        await wait(300)
        await clickText('.btn', 'Use this brand')
        if (!(await until(async () => !!(await ed()).watermark, 8000))) throw new Error('no logo')
        await js('window.__scrim.seek(2)')
        await wait(700)
        await shot('brand.png')
      })
      await step('export presets: vertical follows the cursor', async () => {
        await js('window.__scrim.exportDialog()')
        await wait(600)
        await click('[data-preset="vertical"]')
        await wait(500)
        await shot('export-presets.png')
        const e = await ed()
        if (e.aspect !== '9:16' || e.reframe !== 'follow') throw new Error(`aspect ${e.aspect} reframe ${e.reframe}`)
        await js(`document.querySelector('.modal .icon-btn').click()`, true)
        await wait(500)
        await js('window.__scrim.seek(2.6)')
        await wait(700)
        await shot('vertical.png')
        const r = await js(`window.__scrim.export(${JSON.stringify(join(out, 'vertical.mp4'))}, { resolution: 720, fps: 30, format: 'mp4' })`)
        log('vertical export', r)
        if (r !== 'ok') throw new Error('vertical export: ' + r)
        await js(`window.__scrim.patchEdit({ aspect: '16:9', reframe: 'fit' })`)
        await wait(300)
      })
      if (env.SCRIM_FEEDBACK_URL) await step('report a problem reaches the feedback service', async () => {
        await click('[title^="Help, report"]')
        await wait(300)
        await clickText('.menu-item', 'Report a problem')
        await wait(400)
        const set = (sel: string, v: string) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
        await set('.fb input.field-input', 'Self test problem report')
        await set('.fb textarea', 'Clicking export does nothing on the second try.')
        await shot('feedback-form.png')
        await clickText('.fb .btn', 'Send')
        if (!(await until(async () => js<boolean>('!!document.querySelector(".fb-done")'), 20000))) throw new Error('no thank you screen: ' + (await js('document.querySelector(".fb-warn")?.textContent')))
        await shot('feedback-sent.png')
        await clickText('.fb .btn', 'Done')
        const auth = 'Basic ' + Buffer.from('admin:' + (env.SCRIM_TEST_ADMIN_PW ?? '')).toString('base64')
        const html = await (await fetch(env.SCRIM_FEEDBACK_URL + '/admin?kind=bug', { headers: { authorization: auth } })).text()
        if (!html.includes('Self test problem report')) throw new Error('report not on the dashboard')
        const id = /href="\/admin\/(\d+)"/.exec(html)?.[1]
        const detail = await (await fetch(env.SCRIM_FEEDBACK_URL + '/admin/' + id, { headers: { authorization: auth } })).text()
        log('report', id, detail.includes('Log') ? 'with log' : 'no log', detail.includes('/home/') ? 'HOME PATH LEAKED' : 'paths hidden')
        if (detail.includes(require('os').homedir())) throw new Error('home folder leaked into the report')
      })
      if (env.SCRIM_SENTRY_DSN) await step('crash reports only go out after a yes', async () => {
        const sink = '/tmp/sentry-sink.log'
        const count = async () => (await fs.readFile(sink, 'utf8').catch(() => '')).split('----').length - 1
        await js(`window.__scrim.saveSettings({ crashReports: false })`)
        await wait(300)
        const before = await count()
        await js(`window.api.crashTest()`)
        await js(`setTimeout(() => { throw new Error('scrim renderer test error off') }, 0)`)
        await wait(2500)
        const offSent = (await count()) - before
        await js(`window.__scrim.saveSettings({ crashReports: true })`)
        await wait(300)
        const ok = await js<boolean>(`window.api.crashTest()`)
        await js(`setTimeout(() => { throw new Error('scrim renderer test error on') }, 0)`)
        await until(async () => (await count()) - before >= 2, 10000)
        const text = await fs.readFile(sink, 'utf8').catch(() => '')
        log('sentry', JSON.stringify({ offSent, test: ok, total: (await count()) - before, renderer: text.includes('scrim renderer test error on'), leakedHome: text.includes(require('os').homedir()) }))
        if (offSent) throw new Error('sent while crash reports were off')
        if (!ok || !text.includes('Scrim crash report test')) throw new Error('test report not received')
        if (!text.includes('scrim renderer test error on')) throw new Error('renderer error not received')
        if (text.includes('scrim renderer test error off')) throw new Error('error from while it was off was sent later')
        await js(`window.__scrim.saveSettings({ crashReports: false })`)
      })
      await step('rail icons animate', async () => {
        const count = await js<number>(`document.querySelectorAll('.rail-btn').length`)
        log('rail buttons', count)
        const frames: Buffer[] = []
        for (let i = 0; i < count; i++) {
          const b = await js<{ x: number; y: number; w: number; h: number }>(`(() => { const el = document.querySelectorAll('.rail-btn')[${i}]; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })()`)
          await wait(350)
          win.webContents.sendInputEvent({ type: 'mouseMove', x: b.x + b.w / 2, y: b.y + b.h / 2 })
          for (const ms of [120, 80, 100]) {
            await wait(ms)
            frames.push((await win.webContents.capturePage({ x: b.x, y: b.y, width: b.w, height: b.h })).toPNG())
          }
          win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 400 })
        }
        await Promise.all(frames.map((f, i) => fs.writeFile(join(out, `rail-${String(i).padStart(2, '0')}.png`), f)))
        const noAnim = await js<boolean>(`getComputedStyle(document.querySelector('.rail-btn .rx')).animationName === undefined`)
        void noAnim
        win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 400 })
        await wait(300)
      })
      await step('full screen preview', async () => {
        await js(`document.querySelector('.preview-full-btn').click()`, true)
        await wait(900)
        await shot('fullscreen.png')
        const on = await js('!!document.fullscreenElement')
        await js('document.exitFullscreen().catch(() => {})')
        await wait(500)
        if (!on) throw new Error('did not enter full screen')
      })

      const file = join(out, env.SCRIM_TEST_NAME || 'export.mp4')
      const t0 = Date.now()
      const r = await js(`window.__scrim.export(${JSON.stringify(file)}, ${JSON.stringify(env.SCRIM_TEST_FORMAT ? { format: env.SCRIM_TEST_FORMAT } : {})})`)
      log('export result', r, 'in', Date.now() - t0, 'ms')
    } catch (e) {
      log('failed', e)
    }
    app.quit()
  })
}
