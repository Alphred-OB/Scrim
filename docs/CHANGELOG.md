# Changelog

## Unreleased
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
