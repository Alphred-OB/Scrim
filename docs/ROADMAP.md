# Scrim roadmap

Where we are, and where we're heading. Status as of v0.3.0 (September 2026).

## Done

### Phase 1 (v0.1)
- Screen and window recording with the real cursor hidden
- Cursor and click tracking, auto zoom on clicks
- Editor: backgrounds, frame, crop, zoom, cursor styles, click effects, text, cuts, speed
- MP4 and GIF export with audio mix

### Phase 2 (v0.2)
- **Capture fix:** GPU screen capture (Desktop Duplication), which fixes the frozen full screen video. It falls back to GDI automatically.
- **Webcam:** record it, preview it before recording, choose shape, size and corner, see a floating bubble while recording, then move, resize, restyle or hide it in the editor
- **Timeline rebuilt:** separate tracks for Video, Webcam, Media, Zoom, Clicks, Text, Microphone, System audio and Audio. Click to add, drag, trim, snap, right click menus, waveforms, resizable height
- **Import media:** video, audio and images from a library or by dragging from File Explorer, used as picture in picture, b-roll, logos or music
- **Zoom modes:** automatic from clicks (with adjustable depth) and manual (follow the cursor or pin a spot)
- **Clicks:** turn any single click effect on or off
- **Cursor:** pointer color, outline color, spotlight color and size
- **Text:** move, resize and edit directly on the video
- **Settings:** custom keyboard shortcuts, export sound, capture engine, reduce transparency, theme
- **Export:** MP4, WebM, MOV, GIF, time estimate, finish sound and notification
- **UI:** glass Apple style design, custom dropdowns, right click menus, custom scrollbars, custom title bar

### Phase 2.5 (v0.3), this release
- Renamed to Scrim
- Light, dark and system themes, no glow UI
- Cursor library (19 styles) with full styling, live 2D and 3D backgrounds
- Full screen preview, drag media anywhere on the timeline, media split by type
- Honest export: real frame rate and resolution choices only
- **Regional blur & redaction:** hide passwords and emails with frosted blur, mosaic pixelate, or solid black bars that automatically track and scale with auto-zoom

## Next up

### Phase 3: AI (marked "coming soon" in the app)
- **AI captions:** speech to text on the mic track (local Whisper model, so it works offline). Captions become editable text layers.
- **Smart annotations:** send key frames to a vision model and suggest callouts and highlights at important moments
- **Auto trim silences:** detect long pauses in the mic track and offer one click cuts

### Phase 4: polish and distribution
- Light theme and follow the system theme
- Code signing, so Windows stops showing "unknown publisher"
- Auto updates (electron-updater with GitHub releases)
- Crash reporting and a "send feedback" button

### Ideas backlog
- Keystroke overlay (show the shortcuts you press)
- Speed ramps with smooth transitions
- Multiple scenes with transitions between them
- Share link upload (EAN hosted)
- Templates for intros and outros
- macOS build (needs a ScreenCaptureKit helper)

## Known limits
- Only Windows is fully supported. Linux works for development.
- A browser tab can't be recorded on its own. Record the browser window instead.
- The window must stay in place while you record a window. Moving it doesn't move the capture area.
- In Compatibility capture mode, the floating bar and webcam bubble hide during recording. Use the tray icon or the shortcut to stop.
