/**
 * Dev only: automated checks run under xvfb in CI style. Opens a project, clicks through the UI
 * like a person would, saves screenshots and runs a real export.
 *
 * Env vars:
 *   SCRIM_TEST_DIR     project folder to open (required to run at all)
 *   SCRIM_TEST_OUT     where screenshots and the export go
 *   SCRIM_TEST_RECORD  record the screen for 4 seconds instead of the editor checks
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
      await wait(2500)
      await shot('launcher.png')
      log('projects', JSON.stringify(await js('Promise.all([window.api.listProjects().then(r=>r.length).catch(e=>String(e)), window.api.projectsRoot()])')))

      if (env.SCRIM_TEST_RECORD) {
        const srcs = await listSources()
        const scr = srcs.find((s) => s.kind === 'screen')
        log('sources', srcs.length, scr?.name)
        await recorder.start({ sourceId: scr?.id ?? 'screen:0:0', sourceName: 'Self test', kind: 'screen', fps: 30, mic: true, systemAudio: true, countdown: 1 })
        await wait(4000)
        await recorder.stop()
        log('after stop', JSON.stringify(recorder.getStatus()))
        await wait(2500)
        await shot('recorded-editor.png')
        return app.quit()
      }

      openEditor(env.SCRIM_TEST_DIR!)
      await wait(3500)
      await shot('editor.png')

      if (env.SCRIM_TEST_IMPORT) {
        log('import errors', JSON.stringify(await js(`window.__scrim.import(${JSON.stringify(env.SCRIM_TEST_IMPORT.split(','))})`)))
        await wait(1500)
      }

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
          const rows = document.querySelector('.tl-row')
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
        await clickText('.theme-card', 'Dark')
        await click('.modal-head .icon-btn')
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
