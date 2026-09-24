// Scrim website: smooth scrolling, scroll linked animation, entrance animations, the theme switch,
// the before and after slider, the cursor, the menu and the FAQ. No libraries except Lenis.
;(() => {
  const root = document.documentElement
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
  const desktop = () => innerWidth >= 1024

  // ---------- theme ----------
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
  const paintTheme = () => {
    const pick = root.dataset.theme || 'system'
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === pick)))
    const d = isDark()
    const sun = $('[data-icon-sun]')
    const moon = $('[data-icon-moon]')
    if (sun && moon) {
      sun.style.transform = d ? 'translateY(-150%) rotate(-90deg)' : 'none'
      moon.style.transform = d ? 'none' : 'translateY(150%) rotate(90deg)'
    }
    $('meta[name=theme-color]')?.setAttribute('content', d ? '#0a0a0a' : '#fafaf9')
  }
  const setTheme = (t) => {
    const apply = () => {
      root.classList.add('theme-switching')
      if (t === 'system') delete root.dataset.theme
      else root.dataset.theme = t
      try {
        t === 'system' ? localStorage.removeItem('scrim-theme') : localStorage.setItem('scrim-theme', t)
      } catch {}
      paintTheme()
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
    }
    // a circle grows from the switch (Chrome and Edge), otherwise a plain swap
    const btn = $('[data-theme-toggle]')
    if (!document.startViewTransition || calm || !btn) return apply()
    const r = btn.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    document.startViewTransition(apply).ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] }, { duration: 700, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', pseudoElement: '::view-transition-new(root)' })
    })
  }
  $('[data-theme-toggle]')?.addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'))
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)))
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', paintTheme)
  paintTheme()

  // ---------- first visit intro, then the hero comes in ----------
  const curtain = $('[data-curtain]')
  let first = false
  try {
    first = !sessionStorage.getItem('scrim-intro')
    sessionStorage.setItem('scrim-intro', '1')
  } catch {}
  if (curtain && first && !calm && $('[data-hero]')) {
    curtain.hidden = false
    setTimeout(() => root.classList.add('go'), 850)
    setTimeout(() => curtain.remove(), 1800)
  } else {
    curtain?.remove()
    requestAnimationFrame(() => root.classList.add('go'))
  }

  // ---------- smooth scroll ----------
  let lenis = null
  if (window.Lenis && !calm) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
    const raf = (t) => {
      lenis.raf(t)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    // in page links glide
    $$('a[href*="#"]').forEach((a) =>
      a.addEventListener('click', (e) => {
        const u = new URL(a.href, location.href)
        if (u.pathname !== location.pathname || !u.hash) return
        const t = $(u.hash)
        if (!t) return
        e.preventDefault()
        closeMenu()
        lenis.scrollTo(t, { offset: -20, duration: 1.4 })
        history.replaceState(null, '', u.hash)
      })
    )
  }

  // ---------- nav: solid once you scroll, hides going down, shows going up ----------
  const nav = $('[data-nav]')
  const bar = $('[data-nav-bar]')
  let lastY = scrollY
  const onNav = () => {
    const y = scrollY
    bar?.toggleAttribute('data-solid', y > 24)
    if (nav && !menuOpen) nav.style.transform = y > 200 && y > lastY + 2 ? 'translateY(-110%)' : y < lastY - 2 || y < 200 ? 'none' : nav.style.transform
    lastY = y
  }

  // ---------- mobile menu ----------
  const menu = $('[data-menu]')
  const menuBtn = $('[data-menu-btn]')
  let menuOpen = false
  function closeMenu() {
    if (!menuOpen) return
    toggleMenu(false)
  }
  function toggleMenu(on) {
    menuOpen = on
    menu?.toggleAttribute('data-open', on)
    menuBtn?.setAttribute('aria-expanded', String(on))
    const l1 = $('[data-l1]')
    const l2 = $('[data-l2]')
    if (l1 && l2) {
      l1.style.transform = on ? 'translateY(5.5px) rotate(45deg)' : ''
      l2.style.transform = on ? 'translateY(-5.5px) rotate(-45deg)' : ''
    }
    on ? lenis?.stop() : lenis?.start()
    document.body.style.overflow = on ? 'hidden' : ''
  }
  menuBtn?.addEventListener('click', () => toggleMenu(!menuOpen))
  $$('a', menu || document.createElement('i')).forEach((a) => a.addEventListener('click', closeMenu))
  addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu())

  // ---------- words that light up as you scroll ----------
  const wordsEl = $('[data-words]')
  let words = []
  if (wordsEl) {
    wordsEl.innerHTML = wordsEl.textContent
      .trim()
      .split(/\s+/)
      .map((w) => `<span class="transition-colors duration-300" style="color:var(--c-faint)">${w}</span>`)
      .join(' ')
    words = $$('span', wordsEl)
  }

  // ---------- scroll linked pieces ----------
  const scrubs = $$('[data-scrub]')
  const story = $('[data-scrub="story"]')
  const storyImgs = $$('[data-story-img]')
  const storySteps = $$('[data-story-steps] > li')
  const storyNum = $('[data-story-num]')
  const rail = $('[data-scrub="rail"]')
  const railTrack = $('[data-rail]')
  let lastStep = -1

  const sizeRail = () => {
    if (!rail || !railTrack) return
    if (desktop() && !calm) {
      const extra = railTrack.scrollWidth - innerWidth
      rail.style.height = `${innerHeight + Math.max(0, extra)}px`
    } else {
      rail.style.height = ''
      railTrack.style.transform = ''
    }
  }

  const tick = () => {
    const vh = innerHeight
    for (const el of scrubs) {
      const r = el.getBoundingClientRect()
      if (r.bottom < -vh || r.top > vh * 2) continue
      const kind = el.dataset.scrub
      let p
      if (kind === 'hero') p = clamp(1 - (r.top - vh * 0.1) / (vh * 0.7))
      else if (kind === 'end') p = clamp((vh - r.top) / (vh * 0.9))
      else p = clamp(-r.top / Math.max(1, r.height - vh)) // pinned sections
      if (calm) p = 1
      el.style.setProperty('--p', p.toFixed(4))

      if (el === story && storyImgs.length) {
        const n = storyImgs.length + 1
        const f = p * n
        storyImgs.forEach((img, i) => {
          const local = clamp((f - (i + 0.7)) / 0.6) // wipe happens near each step boundary
          const e = 1 - Math.pow(1 - local, 3)
          img.style.clipPath = `inset(${(1 - e) * 100}% 0 0 0 round 0px)`
          img.style.transform = `scale(${1.12 - 0.12 * e})`
        })
        const step = Math.min(n - 1, Math.floor(f))
        if (step !== lastStep) {
          lastStep = step
          storySteps.forEach((li, i) => li.toggleAttribute('data-on', i === step))
          if (storyNum) storyNum.textContent = String(step + 1).padStart(2, '0')
        }
      }
      if (el === rail && railTrack && desktop() && !calm) {
        const extra = Math.max(0, railTrack.scrollWidth - innerWidth)
        railTrack.style.transform = `translate3d(${-p * extra}px,0,0)`
      }
    }
    if (words.length) {
      const r = wordsEl.getBoundingClientRect()
      const p = calm ? 1 : clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35))
      const lit = p * words.length
      words.forEach((w, i) => (w.style.color = i < lit ? 'var(--c-ink)' : 'var(--c-faint)'))
    }
    onNav()
  }
  let queued = false
  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      tick()
    })
  }
  addEventListener('scroll', queue, { passive: true })
  lenis?.on('scroll', queue)
  addEventListener('resize', () => {
    sizeRail()
    queue()
  })
  addEventListener('load', () => {
    sizeRail()
    queue()
  })
  sizeRail()
  tick()

  // ---------- entrance on scroll ----------
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return
        e.target.classList.add('in')
        io.unobserve(e.target)
        if (e.target.querySelector('[data-count]')) countUp(e.target.querySelector('[data-count]'))
        if (e.target.matches('[data-compare]')) sweep(e.target)
      }),
    { rootMargin: '0px 0px -10% 0px' }
  )
  $$('.reveal').forEach((el) => io.observe(el))

  function countUp(el) {
    const to = Number(el.dataset.count)
    if (calm || to < 2) return
    const t0 = performance.now()
    const step = (t) => {
      const k = clamp((t - t0) / 1400)
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 4)))
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // ---------- before and after ----------
  const cmp = $('[data-compare]')
  let touched = false
  function sweep(el) {
    if (calm || touched) return
    const t0 = performance.now()
    const run = (t) => {
      if (touched) return
      const k = clamp((t - t0) / 2200)
      const x = 50 + Math.sin(k * Math.PI * 2) * 28 * (1 - k)
      el.style.setProperty('--x', x + '%')
      if (k < 1) requestAnimationFrame(run)
    }
    setTimeout(() => requestAnimationFrame(run), 500)
  }
  if (cmp) {
    const set = (clientX) => {
      const r = cmp.getBoundingClientRect()
      cmp.style.setProperty('--x', clamp((clientX - r.left) / r.width, 0.02, 0.98) * 100 + '%')
    }
    let drag = false
    cmp.addEventListener('pointerdown', (e) => {
      touched = drag = true
      cmp.setPointerCapture(e.pointerId)
      set(e.clientX)
    })
    cmp.addEventListener('pointermove', (e) => drag && set(e.clientX))
    cmp.addEventListener('pointerup', () => (drag = false))
    cmp.addEventListener('pointercancel', () => (drag = false))
    const h = $('[data-compare-handle]', cmp)
    h?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      touched = true
      const cur = parseFloat(getComputedStyle(cmp).getPropertyValue('--x')) || 50
      cmp.style.setProperty('--x', clamp(cur + (e.key === 'ArrowLeft' ? -5 : 5), 2, 98) + '%')
    })
  }

  // ---------- sound wave for the clear voice card ----------
  const wave = $('[data-wave]')
  if (wave) {
    const n = 26
    wave.innerHTML = Array.from({ length: n }, (_, i) => `<span class="w-1 rounded-full bg-ink transition-[height] duration-700 ease-out-expo" style="height:${12 + Math.abs(Math.sin(i * 1.7)) * 80}%" data-noisy="${(12 + Math.abs(Math.sin(i * 1.7)) * 80).toFixed(0)}" data-clean="${(28 + Math.sin(i / 4) * 18 + 20).toFixed(0)}"></span>`).join('')
    const card = wave.closest('article')
    const bars = $$('span', wave)
    const show = (clean) => bars.forEach((b) => (b.style.height = (clean ? b.dataset.clean : b.dataset.noisy) + '%'))
    card?.addEventListener('pointerenter', () => show(true))
    card?.addEventListener('pointerleave', () => show(false))
  }

  // ---------- FAQ opens and closes smoothly ----------
  $$('[data-faq] details').forEach((d) => {
    const body = d.querySelector('div')
    const summary = d.querySelector('summary')
    summary.addEventListener('click', (e) => {
      if (calm) return
      e.preventDefault()
      if (d.open) {
        const h = body.offsetHeight
        body.animate({ height: [h + 'px', '0px'], opacity: [1, 0] }, { duration: 450, easing: 'cubic-bezier(0.76,0,0.24,1)' }).onfinish = () => (d.open = false)
      } else {
        d.open = true
        const h = body.offsetHeight
        body.animate({ height: ['0px', h + 'px'], opacity: [0, 1] }, { duration: 600, easing: 'cubic-bezier(0.16,1,0.3,1)' })
      }
    })
  })

  // ---------- cursor ----------
  const cur = $('[data-cursor]')
  if (cur && fine && !calm) {
    cur.hidden = false
    cur.classList.remove('hidden')
    const dot = $('[data-cursor-dot]', cur)
    const label = $('[data-cursor-label]', cur)
    let x = innerWidth / 2
    let y = innerHeight / 2
    let cx = x
    let cy = y
    addEventListener('pointermove', (e) => {
      x = e.clientX
      y = e.clientY
    })
    const loop = () => {
      cx += (x - cx) * 0.2
      cy += (y - cy) * 0.2
      cur.style.transform = `translate3d(${cx}px,${cy}px,0)`
      requestAnimationFrame(loop)
    }
    loop()
    const grow = (text) => {
      dot.style.width = dot.style.height = text ? '84px' : '10px'
      label.textContent = text || ''
      label.style.opacity = text ? '1' : '0'
      label.style.transform = text ? 'scale(1)' : 'scale(0)'
    }
    $$('[data-cursor-text]').forEach((el) => {
      el.addEventListener('pointerenter', () => grow(el.dataset.cursorText))
      el.addEventListener('pointerleave', () => grow(''))
    })
    $$('a, button').forEach((el) => {
      el.addEventListener('pointerenter', () => !label.textContent && (dot.style.opacity = '0'))
      el.addEventListener('pointerleave', () => (dot.style.opacity = '1'))
    })
    document.addEventListener('pointerleave', () => (cur.style.opacity = '0'))
    document.addEventListener('pointerenter', () => (cur.style.opacity = '1'))
  }

  // ---------- magnetic buttons ----------
  if (fine && !calm) {
    $$('.btn').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect()
        b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.18}px ${(e.clientY - r.top - r.height / 2) * 0.3}px`
      })
      b.addEventListener('pointerleave', () => (b.style.translate = ''))
    })
  }

  // ---------- year and version ----------
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()))
  if (location.protocol !== 'file:') {
    fetch('/v1/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v?.version && $$('[data-meta]').forEach((el) => (el.textContent = `Version ${v.version} · Windows 10 and 11 · Free${v.size ? ` · ${Math.round(v.size / 1e6)} MB` : ''}`)))
      .catch(() => {})
  }

  // pause the video when it's off screen (saves battery)
  const v = $('main video')
  if (v) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()))).observe(v)
})()
