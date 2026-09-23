/**
 * Splash screen shown while the main window loads. It's a tiny self-contained page (no bundle),
 * so it appears instantly, and it stays for at least a moment so it never just flickers.
 */
import { BrowserWindow } from 'electron'
import { readFileSync } from 'fs'

let splash: BrowserWindow | null = null
let shownAt = 0

function page(_icon: string): string {
  const letters = 'Scrim'.split('').map((c, i) => `<span style="animation-delay:${0.45 + i * 0.06}s">${c}</span>`).join('')
  const clips = [
    [0, 38, '#3563d6'], [40, 34, '#3563d6'], [76, 24, '#3563d6'],
    [8, 20, '#7a5af0'], [52, 26, '#7a5af0'],
    [18, 44, '#1aa37a'], [70, 20, '#ffd60a']
  ].map(([l, w, c], i) => `<b style="left:${l}%;width:${w}%;background:${c};top:${i < 3 ? 0 : i < 5 ? 12 : 24}px;animation-delay:${0.55 + i * 0.09}s"></b>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;font-family:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none}
  .card{position:absolute;inset:10px;border-radius:22px;background:#0c0c10;border:1px solid #23242b;box-shadow:0 20px 50px rgba(0,0,0,.5);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;overflow:hidden}
  .logo{position:relative;width:76px;height:76px;animation:pop .6s cubic-bezier(.2,1.6,.4,1) both}
  .logo svg{position:absolute;inset:0}
  .ring{fill:none;stroke:#fff;stroke-width:6;stroke-dasharray:120;stroke-dashoffset:120;animation:draw .5s .25s ease-out forwards;transform:rotate(-90deg);transform-origin:38px 38px}
  .dot{fill:#fff;transform-origin:38px 38px;transform:scale(0);animation:dot .35s .7s cubic-bezier(.2,1.8,.4,1) forwards}
  .pulse{position:absolute;inset:0;border-radius:22px;border:3px solid #ff3b30;opacity:0;animation:pulse 1.4s .9s ease-out infinite}
  h1{margin:4px 0 0;color:#f5f5f7;font-size:34px;font-weight:800;letter-spacing:-.03em;display:flex;overflow:hidden}
  h1 span{display:inline-block;transform:translateY(110%);animation:up .5s cubic-bezier(.2,.9,.3,1) forwards}
  .tag{display:flex;gap:8px;font-size:13px;font-weight:600;color:#8b8f9c}
  .tag i{font-style:normal;opacity:0;animation:fade .35s forwards;padding:3px 8px;border-radius:6px}
  .tag i:nth-child(1){animation-delay:.8s}.tag i:nth-child(2){animation-delay:1s}.tag i:nth-child(3){animation-delay:1.2s;background:#ff3b30;color:#fff}
  .tl{position:relative;width:200px;height:34px;margin-top:10px}
  .tl b{position:absolute;height:9px;border-radius:3px;transform:scaleX(0);transform-origin:left;animation:grow .35s cubic-bezier(.2,.9,.3,1) forwards}
  .ph{position:absolute;top:-4px;bottom:-2px;width:2px;background:#ff3b30;border-radius:2px;left:0;animation:sweep 1.6s .5s cubic-bezier(.5,0,.5,1) infinite}
  @keyframes pop{from{transform:scale(.3) rotate(-20deg);opacity:0}to{transform:none;opacity:1}}
  @keyframes draw{to{stroke-dashoffset:0}}
  @keyframes dot{to{transform:scale(1)}}
  @keyframes pulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}
  @keyframes up{to{transform:none}}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes grow{to{transform:scaleX(1)}}
  @keyframes sweep{0%{left:0}100%{left:100%}}
  </style></head><body><div class="card">
  <div class="logo"><span class="pulse"></span><svg viewBox="0 0 76 76"><rect width="76" height="76" rx="22" fill="#ff3b30"/>
  <circle class="ring" cx="38" cy="38" r="19"/><circle class="dot" cx="38" cy="38" r="7"/></svg></div>
  <h1>${letters}</h1>
  <div class="tag"><i>Record.</i><i>Polish.</i><i>Share.</i></div>
  <div class="tl">${clips}<span class="ph"></span></div>
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
    width: 400,
    height: 330,
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
