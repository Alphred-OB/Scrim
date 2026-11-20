// Runs in <head> before the page paints, so the saved theme shows right away with no flash.
// Light is the default. 'dark' or 'light' is stored; an old 'system' choice follows Windows once.
;(() => {
  let t = null
  try {
    t = localStorage.getItem('scrim-theme')
  } catch {}
  const dark = t === 'dark'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
