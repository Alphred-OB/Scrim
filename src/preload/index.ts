import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

const invoke = (ch: string, ...a: unknown[]) => ipcRenderer.invoke(ch, ...a)

const api = {
  listSources: () => invoke('sources:list'),
  startRecording: (o: unknown) => invoke('recorder:start', o),
  stopRecording: () => invoke('recorder:stop'),
  cancelRecording: () => invoke('recorder:cancel'),
  restartRecording: () => invoke('recorder:restart'),
  pauseRecording: () => invoke('recorder:pause'),
  resumeRecording: () => invoke('recorder:resume'),
  recorderStatus: () => invoke('recorder:status'),
  detectEncoder: () => invoke('encoder:detect'),

  listProjects: () => invoke('projects:list'),
  loadProject: (dir: string) => invoke('projects:load', dir),
  saveProject: (p: unknown) => invoke('projects:save', p),
  deleteProject: (dir: string) => invoke('projects:delete', dir),
  importVideo: (file?: string) => invoke('projects:import', file),
  openProjectDialog: () => invoke('projects:open'),
  projectsRoot: () => invoke('projects:root'),

  openFile: (title: string, filters: { name: string; extensions: string[] }[]) => invoke('dialog:open', { title, filters }),
  saveFile: (defaultName: string, ext: string) => invoke('dialog:save', { defaultName, ext }),
  copyAsset: (dir: string, file: string) => invoke('asset:copy', dir, file),
  loadPresets: () => invoke('presets:load'),
  savePresets: (l: unknown) => invoke('presets:save', l),
  showItem: (p: string) => invoke('shell:show', p),
  openPath: (p: string) => invoke('shell:open', p),
  tmpDir: () => invoke('app:tmp'),

  fileOpen: (p: string) => invoke('file:open', p),
  sampleBegin: () => invoke('sample:begin'),
  sampleFinish: (dir: string, cursor: unknown, duration: number) => invoke('sample:finish', dir, cursor, duration),
  fileWrite: (p: string, d: Uint8Array, pos: number) => invoke('file:write', p, d, pos),
  fileClose: (p: string) => invoke('file:close', p),
  fileRemove: (p: string) => invoke('file:remove', p),
  readJson: (p: string) => invoke('file:readJson', p),
  saveAudio: (dir: string, kind: string, d: Uint8Array) => invoke('audio:save', dir, kind, d),
  mux: (job: unknown) => invoke('export:mux', job),
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  getSettings: () => invoke('settings:get'),
  saveSettings: (s: unknown) => invoke('settings:save', s),
  importAssets: (dir: string, paths?: string[]) => invoke('assets:import', dir, paths),
  joinVideo: (dir: string, where: 'start' | 'end', file?: string) => invoke('project:join', dir, where, file),
  peaks: (p: string) => invoke('media:peaks', p),
  notify: (title: string, body: string) => invoke('app:notify', title, body),
  engines: () => invoke('app:engines'),
  setTheme: (t: 'dark' | 'light') => invoke('app:theme', t),
  setZoom: (f: number) => webFrame.setZoomFactor(Math.max(0.7, Math.min(1.5, f))),

  openEditor: (dir: string) => ipcRenderer.send('nav:editor', dir),

  on: (channel: string, cb: (...a: unknown[]) => void) => {
    const fn = (_e: unknown, ...a: unknown[]) => cb(...a)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  },
  // main -> renderer RPC
  onCall: (handler: (method: string, arg: unknown) => Promise<unknown>) => {
    ipcRenderer.on('rpc:call', async (_e, id: number, method: string, arg: unknown) => {
      try {
        ipcRenderer.send('rpc:reply', id, true, await handler(method, arg))
      } catch (err) {
        ipcRenderer.send('rpc:reply', id, false, err instanceof Error ? err.message : String(err))
      }
    })
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
