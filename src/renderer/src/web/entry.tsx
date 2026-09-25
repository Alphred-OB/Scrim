// Browser entry for the live demo on the website: installs the web backend, then opens the
// sample project straight in Scrim's real editor.
import { createWebApi, DEMO_DIR, resetDemo } from './webApi'
;(window as unknown as { api: unknown }).api = createWebApi()

const EDITOR = '/editor?dir=' + encodeURIComponent(DEMO_DIR)
// the editor's back arrow goes home; for the demo, home is the website
const keepInEditor = () => {
  if (location.hash.startsWith('#/editor')) return
  if (location.hash && location.hash !== '#' && location.hash !== '#/editor') location.href = '../'
  else location.hash = EDITOR
}
if (!location.hash.startsWith('#/editor')) location.hash = EDITOR
window.addEventListener('hashchange', keepInEditor)

// same fonts and styles as the desktop app
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/400-italic.css'
import '@fontsource/inter/700-italic.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/700.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '../styles/tokens.css'
import '../styles/app.css'
import './demo.css'
import { createRoot } from 'react-dom/client'

/** A small floating bar so people know where they are and how to get the full app. */
function DemoBar() {
  return (
    <div className="demo-bar" role="note">
      <span className="demo-dot" />
      <span className="demo-text">Live demo</span>
      <button className="demo-btn" onClick={resetDemo} title="Undo all your changes to the demo">Start over</button>
      <a className="demo-btn demo-primary" href="../download">Download Scrim</a>
    </div>
  )
}

function Small() {
  return (
    <div className="demo-small">
      <img src="../img/icon.png" alt="" />
      <h1>The editor needs a bigger screen</h1>
      <p>Open this page on a computer to edit the demo video right in your browser.</p>
      <a href="../">Back to the website</a>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
if (innerWidth < 820) root.render(<Small />)
else
  // imported after window.api exists, so every module sees the web backend
  import('@/App').then(({ default: App }) =>
    root.render(
      <>
        <App />
        <DemoBar />
      </>
    )
  )

// open on a good-looking moment instead of the black first frame of the fade in
const openAt = setInterval(() => {
  const s = (window as unknown as { __scrim?: { seek: (t: number) => void } }).__scrim
  if (!s) return
  clearInterval(openAt)
  setTimeout(() => s.seek(2.3), 400)
}, 150)
setTimeout(() => clearInterval(openAt), 15000)
