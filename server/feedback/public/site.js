// Small touches: newest version on the download buttons, the year, and gentle entrance animations.
;(() => {
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()))

  fetch('/v1/latest')
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      if (!v || !v.version) return
      const mb = v.size ? ` · ${Math.round(v.size / 1e6)} MB` : ''
      document.querySelectorAll('[data-meta]').forEach((el) => (el.textContent = `Version ${v.version} · Windows 10 and 11 · Free${mb}`))
    })
    .catch(() => {})

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { rootMargin: '0px 0px -8% 0px' })
    : null
  document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')))

  // pause the hero video when it's off screen (saves battery)
  const v = document.querySelector('.stage video')
  if (v && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()))).observe(v)
  }
})()
