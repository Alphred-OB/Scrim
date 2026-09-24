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
      `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) return false; el.setAttribute('data-test-hit', '1'); return true })()`
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
