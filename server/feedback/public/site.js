// Theme switch, mobile menu, the feature tabs, newest version on the download buttons,
// the year, and gentle entrance animations.
;(() => {
  const root = document.documentElement
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]

  // ---------- theme ----------
  const current = () => root.dataset.theme || 'system'
  const paintTheme = () => {
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === current())))
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#09090b' : '#fafaf9')
  }
  const setTheme = (t) => {
    root.classList.add('theme-switching')
    if (t === 'system') delete root.dataset.theme
    else root.dataset.theme = t
    try {
      t === 'system' ? localStorage.removeItem('scrim-theme') : localStorage.setItem('scrim-theme', t)
    } catch {}
    paintTheme()
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
  }
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)))
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', paintTheme)
  paintTheme()

  // ---------- mobile menu ----------
  const menuBtn = document.querySelector('[data-menu-btn]')
  const menu = document.querySelector('[data-menu]')
  if (menuBtn && menu) {
    const open = (on) => {
      menu.hidden = !on
      menuBtn.setAttribute('aria-expanded', String(on))
    }
    menuBtn.addEventListener('click', () => open(menu.hidden))
    $$('a', menu).forEach((a) => a.addEventListener('click', () => open(false)))
    addEventListener('keydown', (e) => e.key === 'Escape' && open(false))
  }

  // ---------- year and version ----------
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()))
  if (location.protocol !== 'file:') {
    fetch('/v1/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!v || !v.version) return
        const mb = v.size ? ` · ${Math.round(v.size / 1e6)} MB` : ''
        $$('[data-meta]').forEach((el) => (el.textContent = `Version ${v.version} · Windows 10 and 11${mb}`))
      })
      .catch(() => {})
  }

  // ---------- feature tabs: advance on their own until someone picks one ----------
  const show = document.querySelector('[data-showcase]')
  if (show) {
    const tabs = $$('[data-tab]', show)
    const panels = $$('[data-panel]', show)
    const DUR = 6000
    let i = 0
    let timer = null
    let auto = !matchMedia('(prefers-reduced-motion: reduce)').matches
    const pick = (n, user) => {
      i = n
      tabs.forEach((t, k) => {
        t.setAttribute('aria-selected', String(k === n))
        const bar = t.querySelector('[data-bar]')
        bar.classList.remove('progress')
        bar.style.transform = k === n && !auto ? 'scaleX(1)' : 'scaleX(0)'
        if (k === n && auto) {
          void bar.offsetWidth // restart the fill animation
          bar.style.transform = ''
          bar.style.setProperty('--dur', DUR + 'ms')
          bar.classList.add('progress')
        }
      })
      panels.forEach((p, k) => p.classList.toggle('opacity-0', k !== n))
      if (user && innerWidth < 1024) tabs[n].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
      clearTimeout(timer)
      if (auto) timer = setTimeout(() => pick((i + 1) % tabs.length), DUR)
    }
    tabs.forEach((t, k) =>
      t.addEventListener('click', () => {
        auto = false
        pick(k, true)
      })
    )
    // only run the timer while the section is on screen
    new IntersectionObserver(([e]) => {
      if (!auto) return
      if (e.isIntersecting) pick(i)
      else clearTimeout(timer)
    }).observe(show)
    pick(0)
  }

  // ---------- entrance animations ----------
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { rootMargin: '0px 0px -6% 0px' })
    : null
  $$('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')))

  // pause the hero video when it's off screen (saves battery)
  const v = document.querySelector('main video')
  if (v && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()))).observe(v)
  }
})()
