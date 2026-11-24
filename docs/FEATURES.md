# Scrim features guide

## Recording
1. Pick **Screens** or **Windows** on the Record screen. For a browser tab, pick the browser window.
2. Audio: microphone (with a live level meter) and system audio. They're saved as separate tracks.
3. Webcam: turn on **Record webcam** to see a live preview. Choose the camera, shape (circle, rounded, square), size, corner and quality. Turn on **Show bubble while recording** to see yourself while you record.
4. Pick 30 or 60 fps and a countdown, then **Start recording**.
5. Pause and resume with the floating bar, the tray menu or **Alt+Shift+P**. Paused time is left out of the video.
6. Stop with the floating bar, the tray icon, or **Alt+Shift+S** (you can change this in Settings). Discard and Restart are only in the tray menu and always ask first.

The real cursor is hidden in the video. Scrim logs where it goes and every click, then draws a smooth cursor in the editor. That's what makes the zooms, ripples and restyling possible.

## Editor layout
- **Left rail:** Background, Cursor, Zoom, Text, Blur, Media, Effects, Webcam, Audio, Clips, AI (coming soon)
- **Center:** live preview. You can drag text, media, webcam and blur regions around on it. The corner button (or **F**) shows it full screen.
- **Bottom:** the timeline. Drag its top edge to make it taller.

## Timeline
| Track | What you can do |
| --- | --- |
| Video | Split (S), trim the edges, delete parts, change speed from the right click menu |
| Webcam | Click to open webcam settings. The eye icon shows or hides it. |
| Media | Imported videos and images. Drag, trim, right click for full screen or mute. |
| Zoom | Click an empty spot to add a zoom. Drag, trim, right click for follow or pin, and zoom amount. |
| Clicks | Every click you made. Click a dot to turn that effect on or off. |
| Keys | Every shortcut recorded. Click to jump directly there, right-click to hide/show individual presses. |
| Text | Click an empty spot to add text. |
| Blur | Redactions for passwords, API keys and sensitive info. Drag, resize on canvas, trim edges. |
| Microphone / System audio | Waveforms. The speaker icon mutes. |
| Audio | Imported music and sounds, with fades |

Eye and speaker icons dim their track when turned off. Items snap to the playhead and to each other's edges. The minus and plus buttons (or Ctrl + scroll) zoom the timeline. Right click anything for more options. Grey hatched areas are cut from the final video.

## Background
- **Scrim wallpapers:** 13 high-resolution wallpapers drawn for Scrim (Dark, Vivid and Light sets) plus procedural gradients and live animated scenes. They are made by `tools/make-wallpapers.py`, so they are ours to ship.
- **Redesigned Wallpaper Gallery:** Sleek 16:10 widescreen desktop cards with live release tags, instant-load thumbnails, active check badges, and category filtering (`All`, `macOS`, `Landscape`, `Abstract`, `Gradients`).
- **Gradients & Procedural Wallpapers:** 24 curated smooth gradient backdrops.
- **Live Backgrounds:** Animated scenes (aurora, orbit, concentric, contour, waves, bokeh, grid, stars in 2D, and terrain, tunnel, spheres, cubes in 3D, with speed and color controls).
- **Unified Custom Media:** Single upload/drop card combining both images (PNG, JPG, WebP) and looping videos (MP4, WebM, MOV) with automatic file-type detection, live preview player, and replace/remove controls.
- **Unified Colors & Gradients:** Single panel tab with a clean switch between solid color palette swatches and multi-stop linear/radial gradient styling.
- **Adjustments:** High-performance blur and darkening sliders applicable across all backgrounds.

## Zoom
- **Automatic:** finds your clicks and zooms in on them, following the cursor. Set the depth and click **Find clicks again** to rebuild.
- **Manual:** add a zoom, then choose **Follow cursor** or **Pin a spot** and click the preview where it should point.
- **Master zoom** scales every zoom at once. **Transition speed** sets how fast it eases in and out.

## Cursor and clicks
19 cursor styles in five groups: Classic (macOS, Windows, outline), Simple, Pointy (including neon), Touch (dot, touch circle, ring) and Special (hand, crosshair, pen). Style it with fill, outline, outline width, size, shadow and opacity.
- **Cinematic Motion Engine (Screen Studio style):** Reconstructs erratic, hesitant mouse recordings into fluid, curved Bézier trajectories with Minimum-Jerk motor control easing ($10\tau^3 - 15\tau^4 + 6\tau^5$).
- **Curvature Control:** Adjust arc tension from Straight (0%) to Sweeping (100%).
- **Click Dwell Pause:** Stabilizes the pointer with an intentional presentation pause on buttons before and after clicks.
- **Motion Modes:** Choose between **Cinematic** (curved Bézier splines), **Natural** (critically damped spring physics), and **Direct** (raw capture).
- **Physics & Effects:** Cursor sway (velocity roll), idle hiding, and customizable spotlight (glow, dim everything else, or ring). Click effects include ripple, ring or pulse, with tactile mouse click audio SFX (Apple, Logitech, Mechanical, Soft, Pop).

## Keyboard Shortcuts Overlay
Recorded shortcuts (e.g. `Ctrl+C`, `Ctrl+Shift+P`, `Enter`, arrows) display as beautiful animated keycaps overlaid on the video. Plain typing is never recorded to protect passwords and private text.
- **Styling:** Dark, Light, Blue Accent, or Custom keycap color with automated luminance-aware text coloring.
- **Positioning:** 6 spatial locations (Top-Left, Top, Top-Right, Bottom-Left, Bottom, Bottom-Right).
- **Animation & Timing:** Pop, Slide, or Fade in/out; configurable hold duration (time on screen) and corner roundness (square to pill).
- **Formatting:** Display words (`Ctrl`, `Shift`, `Alt`, `Win`) or macOS-style symbols (`⌃`, `⇧`, `⌥`, `⊞`).
- **Granular Control:** Timeline track with per-shortcut click-to-seek, right-click toggle, and full list view in the Keys inspector with show-all and hide-all controls.

## Text
Add from the Text panel, the Text track or **T**. Drag on the preview to move it (it snaps to the center). Drag the white corner to resize, and double click to type directly on the video. Styles include font, size, bold, italic, underline, alignment, color, box, letter spacing, shadow and animation (fade, slide, pop, typewriter).

## Blur & Redact
Add from the Blur panel, the Blur track, or double-click an empty spot on the Blur track. Drag directly on the preview to position over sensitive content (passwords, emails, API keys, tokens), and drag the corner handle to resize. Options include **Blur** (frosted glass), **Pixelate** (mosaic censorship), and **Solid bar** (redaction bar), with controls for intensity, corner radius, and privacy darken shield. Redaction coordinates lock directly to your screen content, meaning the masked area pans and zooms automatically with camera zoom.

## Media
Import with the button, **Ctrl+I**, or by dragging files onto the editor. Supports mp4, mov, webm, mkv, avi, mp3, wav, m4a, ogg, png, jpg, webp and gif. Anything the editor can't play directly is converted automatically. The library is split into Videos, Audio and Images. Drag any item anywhere onto the timeline: audio lands on the Audio track, videos and images on the Media track. Or double click to add at the playhead.

## Joining videos
Put another video before or after your recording: drag it from the library onto the Video track (drop on the left half to put it before, right half to put it after), use **Add > Join a video before/after**, or right click the Video track. Pick the `screen.mp4` of another Scrim recording and its cursor, clicks, zooms and audio come along. Other videos are fitted to your frame size, their sound goes on the Audio track, and the cursor is hidden while they play.

## Webcam (editing)
Move it by dragging on the preview, resize it with the corner handle, and change the shape, border, shadow and mirror in the Webcam panel.

## Audio
Set volume and mute for the mic and system audio, adjust sync (if your voice or camera is slightly early or late), and add background music.

## Export
MP4 (H.264), WebM (VP9 + Opus), MOV, or GIF. Pick the resolution (with the real pixel size, including Original) and the frame rate. Only real choices are on: if your recording captured 27 frames per second, 60 fps is off and a 27 fps option matches it. Sizes far above your recording or beyond what your PC can encode are off too, and the reason is shown. You see an estimated time before you start and a live time left while it renders. When it's done it plays a sound (change it in Settings) and shows a Windows notification if you're in another app.

## Settings (gear icon, Ctrl+,)
- **General:** capture engine. Automatic uses GPU capture when possible. Compatibility uses GDI.
- **Shortcuts:** click any shortcut and press new keys. Clashes are flagged.
- **Export:** progress animation style, confetti, finish sound on or off, chime, success, pop or your own file, volume, and a test button
- **Appearance:** 12 themes or your own custom colors, interface font and size, and reduce transparency for low end PCs
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
| Step (0.5s by default, set in General) | Left / Right |
| Big step (5x) | Shift+Left / Shift+Right |
| One frame | , / . |
| Start / end | Home / End |
| Timeline zoom | = / - (or Ctrl + mouse wheel) |
| Export | Ctrl+E |
| Import media | Ctrl+I |
| Settings | Ctrl+, |
| Full screen preview | F |
| Save project | Ctrl+S |
| Open a project or video | Ctrl+O |
| Stop recording | Alt+Shift+S |
| Pause / resume recording | Alt+Shift+P |
