import type {
  AppSettings, Asset, CursorData, CaptureSource, Preset, Project, ProjectSummary, RecordOptions, RecorderStatus
} from '@shared/types'

export interface MuxJobIn {
  videoPath: string
  outPath: string
  duration: number
  clips: { id: string; start: number; end: number; speed: number }[]
  tracks: { path: string; offset: number; volume: number; window?: [number, number]; fadeIn?: number; fadeOut?: number }[]
  music?: { path: string; volume: number }
  gif?: { width: number; fps: number }
  format?: 'mp4' | 'webm' | 'mov' | 'gif'
}

export interface Api {
  setZoom(factor: number): void
  pauseRecording(): Promise<void>
  resumeRecording(): Promise<void>
  /** Ctrl+O dialog. Returns the project folder to open, or null if cancelled. */
  openProjectDialog(): Promise<string | null>
  setTheme(t: 'dark' | 'light'): Promise<void>
  listSources(): Promise<CaptureSource[]>
  startRecording(o: RecordOptions): Promise<void>
  stopRecording(): Promise<void>
  cancelRecording(): Promise<void>
  restartRecording(): Promise<void>
  recorderStatus(): Promise<RecorderStatus>
  detectEncoder(): Promise<string>
  listProjects(): Promise<ProjectSummary[]>
  loadProject(dir: string): Promise<Project>
  saveProject(p: Project): Promise<void>
  deleteProject(dir: string): Promise<void>
  importVideo(file?: string): Promise<Project | null>
  projectsRoot(): Promise<string>
  openFile(title: string, filters: { name: string; extensions: string[] }[]): Promise<string | null>
  saveFile(defaultName: string, ext: string): Promise<string | null>
  copyAsset(dir: string, file: string): Promise<string>
  loadPresets(): Promise<Preset[]>
  savePresets(l: Preset[]): Promise<void>
  showItem(p: string): Promise<void>
  openPath(p: string): Promise<string>
  tmpDir(): Promise<string>
  fileOpen(p: string): Promise<void>
  /** Practice project for the guided tour: makes its folder, then saves it once the video is written. */
  sampleBegin(): Promise<{ dir: string; video: string }>
  sampleFinish(dir: string, cursor: CursorData, duration: number): Promise<string>
  fileWrite(p: string, d: Uint8Array, pos: number): Promise<void>
  fileClose(p: string): Promise<void>
  fileRemove(p: string): Promise<void>
  readJson<T = unknown>(p: string): Promise<T>
  saveAudio(dir: string, kind: string, d: Uint8Array): Promise<string>
  mux(job: MuxJobIn): Promise<void>
  pathForFile(f: File): string
  getSettings(): Promise<AppSettings>
  saveSettings(s: AppSettings): Promise<AppSettings>
  importAssets(dir: string, paths?: string[]): Promise<{ assets: Asset[]; errors: string[] }>
  /** Joins a video before or after the main video. No file = ask with a dialog. Null if cancelled. */
  joinVideo(dir: string, where: 'start' | 'end', file?: string): Promise<{ project: Project; cursor: CursorData | null } | null>
  peaks(path: string): Promise<number[]>
  notify(title: string, body: string): Promise<void>
  engines(): Promise<{ dda: boolean; platform: string }>
  openEditor(dir: string): void
  on(channel: string, cb: (...a: any[]) => void): () => void
  onCall(handler: (method: string, arg: any) => Promise<unknown>): void
}

declare global {
  interface Window { api: Api }
}

export const api: Api = window.api

/** Turns an absolute path into a URL the renderer can load (served by the media:// protocol). */
export function mediaUrl(path: string | undefined): string {
  if (!path) return ''
  return 'media://file/' + encodeURIComponent(path)
}
