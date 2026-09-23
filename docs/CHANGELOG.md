# Changelog

## Unreleased
- New: text animations. Pick how text comes in and goes out (16 each: fade, pop, rise, slide, zoom, drop, blur, wipe, spin, flip, typewriter, letter by letter, word by word) and a loop while it's on screen (pulse, float, wiggle, shake, blink, wave, glow), with speed control. Tiles play a preview on hover. Ramps on the Text track show the in and out.
- New: 9 text styles to start from (Caption, Title, Label, Accent, Poster, Code, Callout, Neon, Lower third), each with its own animation.
- New: no gradients anywhere in the interface. New solid red logo and app icon, new animated splash screen, bolder home screen with a changing headline word.
- Improved: the tool rail shows names under the icons. Empty spare layers only appear while you drag something onto a track. New text no longer lands on top of other text. Cursor styles show as a grid. The mic meter says whether it can hear you. The timeline resize handle is visible.
- New: home and projects screens redesigned. Animated cards, a live glow, R and E shortcuts, quick actions, sorting, relative dates and hover previews.
- New: Practice on a sample. Scrim makes a short sample recording and walks you through a real edit with small hands on tasks (play, zooms, background, title, cut, transition, intro). Every step has a Show me button.
- Fixed: the webcam flickered in the preview. Small drift is now corrected smoothly instead of seeking, and the last good frame is kept while it buffers.
- Fixed: the Export button covered the window buttons on Windows.
- Fixed: the playhead was drawn in the wrong place after adding intro space.
- New: drag the whole video right to make empty space before it, like CapCut. Fill it with text, pictures or a video for an intro over the background. Drag it back to the start to remove the space.
- New: transitions, effects, media and audio all get layers. Things at the same time stack on their own layer, and you can drag them between layers.
- New: guided tour of the editor and home screen that points at each part of the interface. Runs the first time, and again from the ? button.
- New: splash screen while Scrim starts
- New: welcome tour on first run (7 short steps, skippable). Take it again from the ? button on the home screen or Settings, General.
- New: home screen asks what you want to do: Record, or Edit (recent projects, search, import a video, open a project, drop a video to import)
- New: transitions have a speed (slow, normal, fast or custom length), a feel (smooth, snappy, gentle, even) and a direction for fades, wipes and whip pans
- Fixed: full screen preview lag. The preview now lowers its render size while playing if the PC can't keep up (the export is always full quality), and the hidden media players no longer cover the whole screen.
- Removed: the Clicks track (click effects are set in the Cursor panel) and the Background music section (add music from the Media library)
- Fixed: pausing jumped the playhead back to where playback started
- New: Transitions and Effects tracks on the timeline. Drag a transition onto a cut or anywhere on its track (drag its edges for the length); drag a look onto the Effects track to use it on just part of the video. Start, end and cut transitions show as pills you can click.
- New: Transitions and Effects are separate tabs, with animated previews of each transition (hover) and look swatches made from your own video
- New: 17 transitions (fade, fade white, flash, morph, blur, zoom in, zoom out, spin, whip pan, slide left/right/up/down, iris, wipe, pixelate, glitch)
- New: 16 looks (adds cinematic, cyberpunk, dreamy, faded, bright, moody, invert) and new effects: glow, blur, pixelate, scan lines. Blur and pixelate on part of the video are handy for hiding private info.
- New: layers for Text, Media and Audio. Items that play at the same time sit on their own layer instead of stacking. Drag an item up or down to change its layer; higher layers draw on top. Text always has an empty layer ready.
- New: eye button on Media and Text, speaker button on Audio, to hide or mute a whole track
- Changed: the recording outline shows during the countdown, the first few seconds and while paused, then fades away
- Removed: the webcam 480p/720p/1080p choice, which didn't change anything. Scrim now asks the camera for its best quality.
- New: transitions for the start, the end and every cut (fade through black or white, blur, zoom, whip pan, flash), with a dot on each cut in the Video track to set its own
- New: effects panel with 10 looks (vivid, punchy, warm, cool, matte, vintage, sepia, black & white, noir) plus brightness, contrast, saturation, vignette and film grain
- New: media placement: play a video inside your recording's frame (default for videos), on top as picture in picture, or full screen, with fit or fill
- Fixed: clicks on the record bar and webcam bubble no longer show up as clicks in the video, and the cursor hides while you drag them. The click that pauses or stops (tray, taskbar) is dropped too.
- Fixed: custom theme "Dark base" now switches to dark colors
- Fixed: the timeline zoom slider dot sits on its track
- Changed: removed the Add button and the zoom, text and split buttons under the preview (use the timeline, right click menus or Z, T, S)
- New: a moving blue border around what's being recorded (amber while paused). It never shows up in the video. Turn it off in Settings, General.
- New: redesigned floating record bar: timer, status, pause/resume and stop
- New: media library tabs for Videos, Audio and Pictures
- New: the timeline has open space after the end, can zoom out past the video length, and zooming keeps the playhead (or the point under the mouse) in place
- Fixed: clicking the timeline put the playhead about 150 pixels away from the mouse
- Fixed: live and video backgrounds stood still while the editor was paused. Live tiles now play when hovered or selected, and unplayable background videos (mov, hevc) are converted.
- Fixed: the webcam preview on the record screen was squashed to nothing
- New: arrow keys move the playhead 0.5 seconds by default (pick one frame up to 5 seconds in Settings, General). Shift moves 5 times further, comma and period step one frame, Home and End jump to the start and end. The timeline scrolls to follow.
- New: 12 themes (including Black & white and White & black) plus a fully custom theme (accent, background, panels, text, dark or light base), a choice of interface font, and interface size
- New: animated export progress with 6 styles (wavy ring like the Play Store, clean ring, liquid fill, orbit, dots, wavy bar), a check mark that draws itself when done, and optional confetti
- New: spotlight modes (glow, dim the rest, ring), when to show it (always, while moving, on clicks), strength, darkness, shade color, edge softness and ring thickness
- New: pause and resume while recording (floating bar, tray, or Alt+Shift+P). Paused time is left out of the video, audio, webcam and cursor.
- New: Ctrl+S saves the project, Ctrl+O opens a project or any video
- Changed: the floating bar no longer has Discard or Restart, so a recording can't be deleted by a stray click. Both are still in the tray menu and ask before deleting.
- New: join videos. Drop a video from the library on the Video track (left half puts it before, right half after), or use Add > Join a video before/after, or right click the Video track. Another Scrim recording brings its cursor, clicks, zooms, mic and system audio along. Other videos get their audio on the Audio track and the cursor is hidden over them.
- Fixed: editor preview froze while the cursor and zoom kept moving, then sped up at the end

## 0.3.0
- Renamed to **Scrim**. Settings, presets and old projects carry over automatically.
- New: light theme, dark theme, or follow Windows (Settings, Appearance)
- New: 19 cursor styles in five groups (Classic, Simple, Pointy, Touch, Special) with fill, outline, outline width, size, shadow and opacity
- New: live animated backgrounds, 8 in 2D and 4 in 3D, with speed and three colors. 24 wallpapers.
- New: full screen preview (button on the preview, or F)
- New: drag media from the library anywhere onto the timeline. Audio goes to the Audio track, videos and images to the Media track.
- New: media library split into Videos, Audio and Images
- New: export resolution picker with real pixel sizes, including Original
- Honest export: frame rates above what the recording really captured, and sizes your PC can't encode, are turned off with the reason. Progress shows frames and speed instead of a number that looked like the output frame rate.
- Fixed: the background Video tab
- Fixed: auto zoom now zooms back out between clicks
- Fixed: scrolling the side panel no longer changes sliders
- Fixed: the settings close button overlapping Reset all. Shortcuts are a clean list now.
- Changed: no more glow on buttons and controls. Bigger timeline zoom control with minus and plus.
- Changed: track eye and mute toggles dim the track so you can see what's off
- Code: renderer reorganised into ui, lib, styles and features folders. Self test moved to its own file.

## 0.2.0
- Fixed: full screen recordings came out frozen (GDI capture + protected see-through toolbar). Now it uses GPU Desktop Duplication with an automatic fallback.
- Fixed: "Capture area extends outside window area" with display scaling
- Fixed: "Could not find that window" when recording a window
- New: webcam recording with a live preview, shapes, size, corner, floating bubble, and editing afterwards
- New: timeline with separate tracks, click to add, snapping, right click menus, waveforms, and a resizable height
- New: media library, importing video, audio and images, drag and drop from Explorer
- New: automatic and manual zoom modes, pin a zoom point on the preview
- New: per click effect toggles, pointer and outline colors, spotlight color and size
- New: move, resize and inline edit text on the preview
- New: settings with custom shortcuts, export sound, capture engine and reduce transparency
- New: WebM and MOV export, export time estimate, finish sound and notification
- New: tray icon controls while recording, audio sync slider
- New: glass UI redesign, custom dropdowns and menus, custom title bar

## 0.1.0
- First Electron build: recorder, editor, MP4/GIF export
