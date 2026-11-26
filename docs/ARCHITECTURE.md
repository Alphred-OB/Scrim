# Scrim architecture

Electron 44 + React 19 + TypeScript, built with electron-vite. Everything runs locally.

```
src/main        Electron main process (Node)
  index.ts        windows (main, floating bar, webcam bubble), IPC
  selftest.ts     automated UI + export checks (dev only)
  recorder.ts     capture engines, window/monitor geometry, start/stop/finalize, tray
  cursorTracker   60 Hz cursor sampling + global mouse hook (uiohook-napi)
  projects.ts     project folders, import video, import media assets, waveform peaks
  exporter.ts     streaming file writer + FFmpeg audio mix / container mux / GIF
  ffmpeg.ts       bundled FFmpeg path, GPU encoder detection, probing
  settings.ts     app settings (userData/settings.json)
  protocol.ts     media:// protocol with HTTP range support (fast seeking)
src/preload     contextBridge API (window.api)
src/renderer/src   React UI
  ui/             shared building blocks: Icon, Select, ContextMenu, fields (Slider, Toggle, Seg...)
  lib/            api bridge, media capture (mic/system/webcam), settings store + theme
  styles/         tokens.css (dark and light theme colors), app.css (components)
  features/
    launcher/     home screen: record options + projects
    recording/    floating record bar and webcam bubble
    settings/     settings modal
    editor/
      Editor.tsx  layout, shortcuts, file drop
      state/      store (undo/redo), actions, timeBus, dragAsset
      engine/     compositor, cursors, backgrounds (wallpapers + live), cursorTrack, timeMap, thumbnails
      preview/    live preview with on-canvas handles and full screen
      timeline/   tracks, waveforms, drag and drop
      panels/     one file per side panel
      export/     export dialog + exporter
src/shared      data model (types.ts), defaults + migration, auto zoom
```

## Recording pipeline
1. **Geometry.** Monitor bounds come from Windows (PowerShell + WinForms, per monitor DPI aware). Window bounds come from DWM extended frame bounds. Everything is in physical pixels.
2. **Engine.** It probes `ddagrab` outputs at startup, then matches the monitor by size to a DDA output. GPU Desktop Duplication (`ddagrab`, `draw_mouse=0`) is the first choice. It's fast, and it respects `WDA_EXCLUDEFROMCAPTURE`, so the floating bar and webcam bubble stay out of the video. If it fails to start, the recorder falls back to `gdigrab`. In GDI mode the bar and bubble hide, because GDI capture freezes or slows down with protected see-through windows on screen. That was the v0.1 frozen full screen bug.
3. **Encoding.** NVENC, then QuickSync, then AMF, then libx264 ultrafast. Keyframes come every second so the editor can seek fast, and a fragmented MP4 means a crash never loses the file.
4. **Sync.** gdigrab stamps frames with wall clock time, which gets parsed from ffmpeg's `start:`. DDA uses the moment the output opens. Mic, system and webcam MediaRecorders report their wall clock start. The cursor tracker uses wall clock too. All of them are converted to offsets against the video, and the user can fine tune with the sync slider.
5. **Finalize.** Remux to faststart MP4, remux the webm tracks (for proper duration and cues), write `cursor.json`, create auto zooms, save `project.json`, and open the editor.

## Project format
`Documents\Scrim\recording-<ms>\` (projects from the old `Documents\Demo Frame` folder are still listed): `project.json`, `screen.mp4`, `mic.webm`, `system.webm`, `webcam.webm`, `cursor.json`, `thumb.jpg`, `assets/`.
Every time in the edit state is **source time** (seconds in screen.mp4), so cutting the video never moves text, zooms or media. `migrateProject()` fills in new fields, so old projects keep opening.

## Compositor (engine/compositor.ts)
One pure function draws a frame for both the preview and the export. The layers are:
background (cached, or a live animated scene drawn at up to 960px), shadow (cached sprite), window with the zoomed video, cursor and clicks, border, media overlays, webcam, text.
Blur is done by downscaling and upscaling instead of per pixel filters, which keeps low end PCs smooth. The preview renders at the size you see on screen, never at full 1080p.

## Export (export/exporter.ts)
Frames are decoded with WebCodecs through mediabunny (the screen, webcam, overlays and background video each get their own sink), drawn to an OffscreenCanvas, and encoded with hardware H.264 (MP4/MOV) or VP9 (WebM). Chunks stream to disk through IPC. Then FFmpeg mixes the audio: each track is aligned by its offset, silenced outside its window, faded, cut by the clip list, sped up with atempo, and mixed with amix. The result is muxed into the final container, or turned into a GIF with palettegen.

The export dialog only offers settings that are real. The recorder measures the unique frames per second it actually captured (`screen.realFps`, from ffmpeg's frame and dup counters), so frame rates above that are turned off with the reason shown. "Original" resolution is measured from the real layout (crop, padding, aspect), sizes far above it are turned off, small upscales are labelled, and every size is checked against the PC's encoder before it can be picked.

## Performance choices
- GPU capture and GPU encoding while recording
- The cursor is tracked separately, so 30 fps recordings still get a smooth cursor
- Timeline thumbnails (`timeline/Filmstrip.tsx`) grab frames one seek at a time, so they pause while the video plays or the playhead is being moved, and wait until the editor knows whether a preview copy exists instead of starting on the full size original
- Opening a project in the editor shows `features/editor/EditorLoading.tsx` until the recording (and webcam) have shown a first frame and the smooth copies are done; the store's `previewReady` flags come from the preview's video elements, the copy progress from `lib/useProxy.ts`. It is a frosted card over the editor (backdrop blur; solid under Reduce transparency), which is `inert` behind it (`loadingOpen` in the store). It waits 0.6 s before appearing, so quick loads never show it, and "Start editing now" (or Esc) skips the copy wait.
- Playing draws as many pixels as the screen can show (up to 2560 wide), like paused; the adaptive quality in `preview/Preview.tsx` lowers it on a slow PC (floor 0.5).
- The webcam bubble only shows while the webcam file has footage (`shared/webcamTime.ts`), in the preview and the export.
- The record screen's screen pictures keep Scrim's own window out of the grab (`listSources` in `main/recorder.ts`, content protection for the moment of the grab).
- The webcam is copied to its frame cache only when it has a new frame (it runs at ~30 fps, the preview draws at ~60)
- Preview playback drives a tiny event bus instead of React state (the playhead and time label don't re-render the app)
- Cached background and shadow layers, and blur by downscaling
- Reduce transparency setting turns off backdrop blur
- Long or big recordings (over about 2.5 minutes or 400 MB) get a light preview copy, `proxy.mp4`, kept in a local cache folder (`%LOCALAPPDATA%\Scrim\preview-cache\<project>-<hash>`, see `main/previewCache.ts`) so OneDrive never uploads it (up to 2048 wide and only for recordings wider than that, x264 veryfast crf 23, keyframe every second, no B frames, no audio, same timestamps). `main/proxy.ts` builds it in the background at low priority and the editor (`lib/useProxy.ts`) switches to it when ready. The player, scrubbing and the timeline thumbnails use the copy. Paused frames come from the original, so what you stop on is sharp. Export never uses the copy.
- The webcam gets the same treatment (`cam-proxy.mp4`, same size, keyframe every second) when it is a recorder WebM longer than 20 s: MediaRecorder writes a keyframe only every 3 to 8 s, which made each webcam seek take 0.1 to 0.5 s. `useProxy(project, 'cam')` switches the webcam element to it on the next pause. New recordings also ask MediaRecorder for a keyframe every second (`videoKeyFrameIntervalDuration`).
- Copies made by older versions in the project folder are moved into the cache the next time the project opens. Deleting a project removes its copies, and Settings > Clear temporary cache removes them all (they are made again on the next open).
- The webcam cut-out model (`engine/webcamBg.ts`) is loaded on idle when the project uses a webcam background, so its one second of setup never lands on Play.

## Updates
`main/updater.ts` (electron-updater, GitHub Releases) keeps one `UpdateStatus` and broadcasts it; the renderer (`lib/update.tsx`) shows it. `UpdateScreen` is the full screen page (downloading, ready, restarting, download failed) and only appears on the launcher after onboarding; Later or Esc hides it for that version until the next launch, "Continue to Scrim" hides only the download page. `UpdateBanner` is the small card, used where the page doesn't apply (the editor). `shared/updateNotes.ts` turns the release notes into the "What's new" lines. Tests: `npx tsx test/unit-update-notes.ts`, `npx tsx test/unit-theme-contrast.ts`. The renderer exposes `window.__scrimUpdate` (the store) so a state can be forced in a running app for screenshots.

## Background jobs
Caption generation (`lib/captionJob.tsx`) is an app level job, not panel state: `startCaptions` runs `speech/transcribe.ts`, progress lives in the `useCaptionJob` store, `CaptionJobPill` (mounted in `App.tsx`) shows it on every screen, and the finished transcript is applied with `shared/speech.ts` `applyTranscript` to the editor if that project is open, otherwise to its file (`loadProject`, `saveProject`). One job at a time; Cancel stops the offline worker and discards the result. Tests: `npx tsx test/unit-captions-apply.ts`; in a running app the fake transcript hooks `window.__fakeWords` and `window.__fakeCaptionMs` drive a job.

## Themes
All colors are CSS variables in `styles/tokens.css`. `data-theme` on `<html>` switches dark and light, and System follows Windows. The main process updates the title bar buttons to match.

## Testing
`npx tsx test/make-project.ts a` makes a test project. `SCRIM_TEST_DIR=<project> SCRIM_TEST_OUT=<dir> electron .` then runs `src/main/selftest.ts`. It clicks through the UI with real mouse input and prints PASS or FAIL for: the track eye toggles, dragging media onto the timeline, settings and theme switching, live backgrounds, the export dialog and full screen preview. It saves screenshots and finishes with a real export (`SCRIM_TEST_FORMAT`). `SCRIM_TEST_IMPORT` imports files first, `SCRIM_TEST_RECORD=1` runs a real record, stop and editor cycle instead.

`npm run build` then `npm run perf -- "<project folder>"` (`tools/perf-player.mjs`) opens a real project in the built app, waits for its preview copies, then times playhead jumps and cold playback at a few spots (one inside the webcam). It prints PASS or FAIL against fixed limits (seek 100 ms, 10% dropped frames, 0.95x speed, 300 ms freeze); `--profile` shows where the first Play spends its busiest stretch, `--json` prints the raw numbers. It only seeks and plays, so it never changes the project.
