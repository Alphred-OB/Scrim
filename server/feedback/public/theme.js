// Runs in <head> before the page paints, so the saved theme shows right away with no flash.
// 'light' or 'dark' is stored; 'system' removes the choice and follows Windows.
;(() => {
  let t = null
  try {
    t = localStorage.getItem('scrim-theme')
  } catch {}
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
})()
