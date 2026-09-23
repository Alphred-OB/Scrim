/**
 * Splash screen shown while the main window loads. It's a tiny self-contained page (no bundle),
 * so it appears instantly, and it stays for at least a moment so it never just flickers.
 */
import { BrowserWindow } from 'electron'
import { readFileSync } from 'fs'

let splash: BrowserWindow | null = null
let shownAt = 0

function page(icon: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;font-family:'Segoe UI Variable','Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none}
  .card{position:absolute;inset:10px;border-radius:22px;background:radial-gradient(120% 120% at 20% 0%,#1d2440 0%,#0b0c10 60%);
    border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 50px rgba(0,0,0,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
  img{width:74px;height:74px;border-radius:18px;animation:pop .7s cubic-bezier(.2,1.5,.4,1) both}
  h1{margin:0;color:#f2f3f7;font-size:30px;font-weight:700;letter-spacing:-.02em;animation:rise .6s .2s ease-out both}
  p{margin:0;color:#8b8f9c;font-size:13px;animation:rise .6s .35s ease-out both}
  .bar{width:120px;height:3px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:6px;animation:rise .6s .45s ease-out both}
  .bar i{display:block;width:40%;height:100%;border-radius:3px;background:linear-gradient(90deg,#2f8bff,#9b5cff);animation:slide 1.1s ease-in-out infinite}
  @keyframes pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes rise{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
  </style></head><body><div class="card">
  ${icon ? `<img src="${icon}">` : ''}<h1>Scrim</h1><p>Record. Polish. Share.</p><div class="bar"><i></i></div>
  </div></body></html>`
}

export function showSplash(iconPath: string): void {
  let icon = ''
  try {
    icon = 'data:image/png;base64,' + readFileSync(iconPath).toString('base64')
  } catch {
    /* no icon, still fine */
  }
  splash = new BrowserWindow({
    width: 380,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    center: true,
    hasShadow: false,
    title: 'Scrim'
  })
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page(icon)))
  splash.once('ready-to-show', () => {
    shownAt = Date.now()
    splash?.showInactive()
  })
}

/** Closes the splash once it has been visible for at least `minMs`, then calls `after`. */
export function closeSplash(after: () => void, minMs = 1200): void {
  if (!splash || splash.isDestroyed()) return after()
  const wait = shownAt ? Math.max(0, minMs - (Date.now() - shownAt)) : minMs
  setTimeout(() => {
    after()
    setTimeout(() => {
      splash?.destroy()
      splash = null
    }, 150)
  }, wait)
}
