# Scrim

Record your screen and turn it into a polished demo: backgrounds, rounded frame, smooth auto zoom on clicks,
webcam, custom cursor with click effects, text, imported media, cuts, speed changes and MP4/WebM/MOV/GIF export.

## Run it (Windows)

You need Node.js 20 or newer (https://nodejs.org).

```
npm install
npm run dev
```

## Build the installer

```
npm run dist
```

The installer lands in `dist/Scrim-Setup-0.3.0.exe`.

## How it works

- Recording uses FFmpeg (bundled) with the real cursor hidden, so the editor can draw a smooth, restyled cursor.
  Your GPU encoder is used automatically (NVIDIA, Intel or AMD), with a CPU fallback.
- The cursor position and every click are logged during recording (`cursor.json`) and drive auto zoom, ripples and bounce.
- Mic and system audio are saved as separate tracks so you can mute or balance them later.
- Export renders with WebCodecs (hardware H.264 when available) and FFmpeg mixes the audio.
- Projects live in `Documents\Scrim`. Everything autosaves.

## Docs

- [Features guide](docs/FEATURES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Changelog](docs/CHANGELOG.md)

## Shortcuts

All shortcuts can be changed in Settings (Ctrl+,). The full list is in the [features guide](docs/FEATURES.md#default-shortcuts).

## Project layout

```
src/main       Electron main process: recorder (FFmpeg), cursor tracker, projects, export muxing
src/preload    Safe bridge between main and the UI
src/renderer   React UI: ui kit, themes, and features (launcher, recording, settings, editor)
src/shared     Types, defaults, auto zoom logic shared by both sides
```
