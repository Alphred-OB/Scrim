# Scrim features guide

## Recording
1. Pick **Screens** or **Windows** on the Record screen. For a browser tab, pick the browser window.
2. Audio: microphone (with a live level meter) and system audio. They're saved as separate tracks.
3. Webcam: turn on **Record webcam** to see a live preview. Choose the camera, shape (circle, rounded, square), size, corner and quality. Turn on **Show bubble while recording** to see yourself while you record.
4. Pick 30 or 60 fps and a countdown, then **Start recording**.
5. Stop with the floating bar, the tray icon, or **Alt+Shift+S** (you can change this in Settings).

The real cursor is hidden in the video. Scrim logs where it goes and every click, then draws a smooth cursor in the editor. That's what makes the zooms, ripples and restyling possible.

## Editor layout
- **Left rail:** Background, Cursor, Zoom, Text, Media, Webcam, Audio, Clips, AI (coming soon)
- **Center:** live preview. You can drag text, media and the webcam around on it. The corner button (or **F**) shows it full screen.
- **Bottom:** the timeline. Drag its top edge to make it taller.

## Timeline
| Track | What you can do |
| --- | --- |
| Video | Split (S), trim the edges, delete parts, change speed from the right click menu |
| Webcam | Click to open webcam settings. The eye icon shows or hides it. |
| Media | Imported videos and images. Drag, trim, right click for full screen or mute. |
| Zoom | Click an empty spot to add a zoom. Drag, trim, right click for follow or pin, and zoom amount. |
| Clicks | Every click you made. Click a dot to turn that effect on or off. |
| Text | Click an empty spot to add text. |
| Microphone / System audio | Waveforms. The speaker icon mutes. |
| Audio | Imported music and sounds, with fades |

Eye and speaker icons dim their track when turned off. Items snap to the playhead and to each other's edges. The minus and plus buttons (or Ctrl + scroll) zoom the timeline. Right click anything for more options. Grey hatched areas are cut from the final video.

## Background
Wallpapers (24), Live (animated: aurora, orbit, concentric, contour, waves, bokeh, grid, stars in 2D, and terrain, tunnel, spheres, cubes in 3D, with speed and three colors), Image, Video, Color and Gradient. Blur and darken work on all of them.

## Zoom
- **Automatic:** finds your clicks and zooms in on them, following the cursor. Set the depth and click **Find clicks again** to rebuild.
- **Manual:** add a zoom, then choose **Follow cursor** or **Pin a spot** and click the preview where it should point.
- **Master zoom** scales every zoom at once. **Transition speed** sets how fast it eases in and out.

## Cursor and clicks
19 cursor styles in five groups: Classic (macOS, Windows, outline), Simple, Pointy (including neon), Touch (dot, touch circle, ring) and Special (hand, crosshair, pen). Style it with fill, outline, outline width, size, shadow and opacity. Motion has smoothing, sway and hide when not moving. There's also a spotlight with its own color and size. Click effects: ripple, ring or pulse, with color and bounce.

## Text
Add from the Text panel, the Text track or **T**. Drag on the preview to move it (it snaps to the center). Drag the white corner to resize, and double click to type directly on the video. Styles include font, size, bold, italic, underline, alignment, color, box, letter spacing, shadow and animation (fade, slide, pop, typewriter).

## Media
Import with the button, **Ctrl+I**, or by dragging files onto the editor. Supports mp4, mov, webm, mkv, avi, mp3, wav, m4a, ogg, png, jpg, webp and gif. Anything the editor can't play directly is converted automatically. The library is split into Videos, Audio and Images. Drag any item anywhere onto the timeline: audio lands on the Audio track, videos and images on the Media track. Or double click to add at the playhead.

## Webcam (editing)
Move it by dragging on the preview, resize it with the corner handle, and change the shape, border, shadow and mirror in the Webcam panel.

## Audio
Set volume and mute for the mic and system audio, adjust sync (if your voice or camera is slightly early or late), and add background music.

## Export
MP4 (H.264), WebM (VP9 + Opus), MOV, or GIF. Pick the resolution (with the real pixel size, including Original) and the frame rate. Only real choices are on: if your recording captured 27 frames per second, 60 fps is off and a 27 fps option matches it. Sizes far above your recording or beyond what your PC can encode are off too, and the reason is shown. You see an estimated time before you start and a live time left while it renders. When it's done it plays a sound (change it in Settings) and shows a Windows notification if you're in another app.

## Settings (gear icon, Ctrl+,)
- **General:** capture engine. Automatic uses GPU capture when possible. Compatibility uses GDI.
- **Shortcuts:** click any shortcut and press new keys. Clashes are flagged.
- **Export:** finish sound on or off, chime, success, pop or your own file, volume, and a test button
- **Appearance:** dark, light, or match Windows, and reduce transparency for low end PCs
- **AI:** what's coming

## Default shortcuts
| Action | Keys |
| --- | --- |
| Play / pause | Space |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Split | S |
| Delete selected | Delete |
| Duplicate selected | Ctrl+D |
| Add zoom / text | Z / T |
| Frame step | Left / Right |
| Jump 1 second | Shift+Left / Shift+Right |
| Timeline zoom | = / - (or Ctrl + mouse wheel) |
| Export | Ctrl+E |
| Import media | Ctrl+I |
| Settings | Ctrl+, |
| Full screen preview | F |
| Stop recording | Alt+Shift+S |
