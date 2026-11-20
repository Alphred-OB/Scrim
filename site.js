// Scrim website: smooth scrolling, scroll linked animation, entrance animations, the theme switch,
// the before and after slider, the cursor, the menu and the FAQ. No libraries except Lenis.
;(() => {
  const root = document.documentElement
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  // People with Windows animation effects off still get the page's motion, just without
  // smooth scrolling, the intro and the cursor (the parts that can feel like too much).
  const calm = false
  const lessMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
  const desktop = () => innerWidth >= 1024

  // ---------- theme: light by default, switched with a little film-style moment ----------
  const isDark = () => root.dataset.theme === 'dark'
  const paintTheme = () => {
    const d = isDark()
    const pick = d ? 'dark' : 'light'
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === pick)))
    $('[data-theme-toggle]')?.setAttribute('aria-checked', String(d))
    const sun = $('[data-icon-sun]')
    const moon = $('[data-icon-moon]')
    if (sun && moon) {
      sun.style.transform = d ? 'translateY(-170%) rotate(-120deg)' : 'none'
      moon.style.transform = d ? 'none' : 'translateY(170%) rotate(120deg)'
    }
    $('meta[name=theme-color]')?.setAttribute('content', d ? '#0b0c0f' : '#f4f5f7')
  }
  const setTheme = (t) => {
    if (t === (isDark() ? 'dark' : 'light')) return
    const apply = () => {
      root.classList.add('theme-switching')
      root.dataset.theme = t
      try {
        localStorage.setItem('scrim-theme', t)
      } catch {}
      paintTheme()
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
    }
    const btn = $('[data-theme-toggle]')
    if (!document.startViewTransition || calm || !btn) return apply()
    // 1) letterbox bars close in like a film frame  2) the new theme opens as a circle from the switch  3) bars open again
    const bars = document.createElement('div')
    bars.className = 'wow-bars'
    bars.innerHTML = '<i></i><i></i>'
    document.body.append(bars)
    btn.classList.remove('flip')
    void btn.offsetWidth
    btn.classList.add('flip')
    requestAnimationFrame(() => bars.classList.add('in'))
    const r = btn.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    setTimeout(() => {
      root.classList.add('theme-vt')
      const vt = document.startViewTransition(apply)
      vt.ready.then(() => {
        root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] }, { duration: 1000, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', pseudoElement: '::view-transition-new(root)' })
      })
      vt.finished.finally(() => {
        root.classList.remove('theme-vt')
        bars.classList.remove('in')
        setTimeout(() => bars.remove(), 600)
      })
    }, 380)
  }
  $('[data-theme-toggle]')?.addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'))
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)))
  paintTheme()

  // ---------- first visit intro, then the hero comes in ----------
  const curtain = $('[data-curtain]')
  let first = false
  try {
    first = !sessionStorage.getItem('scrim-intro')
    sessionStorage.setItem('scrim-intro', '1')
  } catch {}
  if (curtain && first && !lessMotion && $('[data-hero]')) {
    curtain.hidden = false
    setTimeout(() => root.classList.add('go'), 850)
    setTimeout(() => curtain.remove(), 1800)
  } else {
    curtain?.remove()
    requestAnimationFrame(() => root.classList.add('go'))
  }

  // ---------- smooth scroll ----------
  let lenis = null
  if (window.Lenis && !lessMotion) {
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
        lenis.scrollTo(t, { offset: t.matches('[data-chapter]') ? -130 : -20, duration: 1.4 })
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
    root.toggleAttribute('data-nav-hidden', nav?.style.transform === 'translateY(-110%)')
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

  // ---------- sound effects (made on the fly, no audio files) ----------
  const sfx = (() => {
    let ctx = null
    let on = true
    try {
      on = localStorage.getItem('scrim-sound') !== 'off'
    } catch {}
    let lastHover = 0
    const ensure = () => {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return null
        ctx = new AC()
      }
      if (ctx.state === 'suspended') ctx.resume()
      return ctx
    }
    // browsers only allow sound after the first click or key
    addEventListener('pointerdown', ensure, { once: true, capture: true })
    addEventListener('keydown', ensure, { once: true, capture: true })
    const tone = (f1, f2, dur, vol, type = 'sine', delay = 0) => {
      if (!on || !ctx || ctx.state !== 'running') return
      const t = ctx.currentTime + delay
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(f1, t)
      o.frequency.exponentialRampToValueAtTime(f2, t + dur)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + dur + 0.02)
    }
    const noise = (dur, vol, from, to) => {
      if (!on || !ctx || ctx.state !== 'running') return
      const t = ctx.currentTime
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
      const src = ctx.createBufferSource()
      const f = ctx.createBiquadFilter()
      const g = ctx.createGain()
      src.buffer = buf
      f.type = 'bandpass'
      f.Q.value = 1.2
      f.frequency.setValueAtTime(from, t)
      f.frequency.exponentialRampToValueAtTime(to, t + dur)
      g.gain.value = vol
      src.connect(f).connect(g).connect(ctx.destination)
      src.start(t)
    }
    return {
      get on() {
        return on
      },
      set on(v) {
        on = v
        try {
          localStorage.setItem('scrim-sound', v ? 'on' : 'off')
        } catch {}
      },
      hover() {
        const n = performance.now()
        if (n - lastHover < 70) return
        lastHover = n
        tone(2400, 2000, 0.035, 0.012)
      },
      click: () => tone(720, 360, 0.08, 0.05, 'triangle'),
      toggle: (up) => (tone(up ? 520 : 780, up ? 780 : 520, 0.09, 0.04, 'triangle'), tone(up ? 1040 : 520, up ? 1040 : 390, 0.08, 0.025, 'sine', 0.07)),
      tick: () => tone(1500, 1400, 0.05, 0.035, 'square'),
      start: () => (tone(660, 660, 0.09, 0.05), tone(990, 990, 0.14, 0.05, 'sine', 0.1)),
      stop: () => (tone(990, 990, 0.08, 0.045), tone(660, 600, 0.16, 0.045, 'sine', 0.09)),
      zoom: (inward) => noise(0.45, 0.18, inward ? 400 : 2400, inward ? 2600 : 380),
      cut: () => (noise(0.07, 0.25, 3000, 1500), tone(300, 120, 0.09, 0.05, 'triangle')),
      whoosh: () => noise(0.35, 0.1, 600, 2000)
    }
  })()

  const soundBtn = $('[data-sound]')
  const paintSound = () => {
    soundBtn?.setAttribute('aria-pressed', String(sfx.on))
    $('[data-sound-on]')?.classList.toggle('hidden', !sfx.on)
    $('[data-sound-off]')?.classList.toggle('hidden', sfx.on)
  }
  soundBtn?.addEventListener('click', () => {
    sfx.on = !sfx.on
    paintSound()
    if (sfx.on) sfx.toggle(true)
  })
  paintSound()

  // every button and link gets a soft tick on hover and a pop on press
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('a, button, summary, [data-w], input[type=range]')
    if (t && !t.contains(e.relatedTarget)) sfx.hover()
  })
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-sound], [data-rec-start], [data-rec-stop], [data-zoom], [data-w], [data-fillers]')) return
    if (e.target.closest?.('a, button, summary')) sfx.click()
  })
  $('[data-theme-toggle]')?.addEventListener('click', () => sfx.toggle(!isDark()))

  // ---------- our own pointer ----------
  const ptr = $('[data-pointer]')
  const ptrPos = $('[data-p-pos]')
  const ptrTrail = $('[data-p-trail]')
  const ring = $('[data-p-ring]')
  const pLabel = $('[data-p-label]')
  const arrow = $('[data-p-arrow]')
  const pDot = $('[data-p-dot]')
  const setStyle = (st) => {
    if (!ptr) return
    ptr.dataset.style = st
    arrow.classList.toggle('hidden', st === 'dot' || st === 'ring')
    pDot.classList.toggle('hidden', st !== 'dot')
    arrow.style.width = st === 'big' ? '34px' : '22px'
    arrow.style.setProperty('--p-fill', st === 'big' ? 'var(--c-accent)' : 'var(--c-ink)')
    ring.style.opacity = st === 'ring' || st === 'dot' || st === 'arrow' || st === 'big' ? '' : '0'
    ring.dataset.base = st === 'ring' ? '34' : st === 'dot' ? '28' : '36'
    ring.style.width = ring.style.height = ring.dataset.base + 'px'
    ring.style.borderColor = st === 'ring' ? 'var(--c-ink)' : ''
    ring.style.borderWidth = st === 'ring' ? '2px' : ''
    $$('[data-cursor-pick] [data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === st)))
    try {
      localStorage.setItem('scrim-pointer', st)
    } catch {}
  }
  if (ptr && fine) {
    root.classList.add('pointer-on')
    ptr.classList.remove('hidden')
    let saved = 'arrow'
    try {
      saved = localStorage.getItem('scrim-pointer') || 'arrow'
    } catch {}
    setStyle(saved)
    let x = -100
    let y = -100
    let tx = x
    let ty = y
    let seen = false
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return
      x = e.clientX
      y = e.clientY
      if (!seen) {
        seen = true
        tx = x
        ty = y
        ptr.style.opacity = '1'
      }
      ptrPos.style.transform = `translate3d(${x}px,${y}px,0)`
    }, { passive: true })
    const follow = () => {
      tx += (x - tx) * (lessMotion ? 1 : 0.18)
      ty += (y - ty) * (lessMotion ? 1 : 0.18)
      ptrTrail.style.transform = `translate3d(${tx}px,${ty}px,0)`
      requestAnimationFrame(follow)
    }
    follow()
    // grow over things you can press, show a word over special areas, hide over text fields
    let labelOn = false
    document.addEventListener('pointerover', (e) => {
      const lab = e.target.closest?.('[data-cursor-text]')
      const hit = e.target.closest?.('a, button, summary, [data-w], label, input[type=range]')
      const field = e.target.closest?.('input:not([type=range]), textarea')
      ptr.style.opacity = field ? '0' : '1'
      if (lab && !hit) {
        labelOn = true
        ring.style.width = ring.style.height = '76px'
        ring.style.background = 'var(--c-ink)'
        ring.style.borderColor = 'transparent'
        pLabel.textContent = lab.dataset.cursorText
        pLabel.style.opacity = '1'
        pLabel.style.transform = 'scale(1)'
        arrow.style.transform = 'scale(0)'
        pDot.style.transform = 'translate(-50%,-50%) scale(0)'
        return
      }
      labelOn = false
      pLabel.style.opacity = '0'
      pLabel.style.transform = 'scale(.5)'
      ring.style.background = hit ? 'color-mix(in srgb, var(--c-ink) 10%, transparent)' : ''
      ring.style.borderColor = ptr.dataset.style === 'ring' ? 'var(--c-ink)' : hit ? 'transparent' : ''
      const base = Number(ring.dataset.base || 36)
      ring.style.width = ring.style.height = (hit ? base * 1.55 : base) + 'px'
      arrow.style.transform = hit ? 'scale(.85)' : ''
      pDot.style.transform = hit ? 'translate(-50%,-50%) scale(.6)' : 'translate(-50%,-50%)'
    })
    document.addEventListener('pointerleave', () => (ptr.style.opacity = '0'))
    document.addEventListener('pointerenter', () => (ptr.style.opacity = '1'))
    // a click ripple, the same as Scrim draws in your videos
    addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return
      const r = document.createElement('span')
      r.className = 'ripple pointer-events-none absolute size-16 rounded-full border-2 border-accent'
      r.style.left = e.clientX + 'px'
      r.style.top = e.clientY + 'px'
      ptr.appendChild(r)
      setTimeout(() => r.remove(), 700)
      if (!labelOn) arrow.style.transform = 'scale(.8)'
    })
    addEventListener('pointerup', () => !labelOn && (arrow.style.transform = ''))
  }
  $$('[data-cursor-pick] [data-style]').forEach((b) =>
    b.addEventListener('click', () => {
      setStyle(b.dataset.style)
      sfx.toggle(true)
    })
  )

  // ---------- magnetic buttons ----------
  if (fine && !lessMotion) {
    $$('.btn').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect()
        b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.18}px ${(e.clientY - r.top - r.height / 2) * 0.3}px`
      })
      b.addEventListener('pointerleave', () => (b.style.translate = ''))
    })
  }

  // ---------- hotspots: tap shows the tip on touch screens ----------
  $$('.hot').forEach((h) =>
    h.addEventListener('click', () => {
      const was = h.hasAttribute('data-show')
      $$('.hot[data-show]').forEach((x) => x.removeAttribute('data-show'))
      if (!was) h.setAttribute('data-show', '')
    })
  )

  // ---------- tour: chapter bar follows what you're reading ----------
  const chapterLinks = $$('[data-chapters] a')
  const chapters = $$('[data-chapter]')
  if (chapterLinks.length && chapters.length) {
    const bar = $('[data-chapters] nav')
    let current = ''
    const spy = () => {
      const mid = innerHeight * 0.45
      let on = ''
      for (const c of chapters) if (c.getBoundingClientRect().top < mid) on = c.id
      if (on === current) return
      if (current && on) sfx.hover()
      current = on
      chapterLinks.forEach((a) => {
        const hit = a.getAttribute('href') === '#' + on
        a.toggleAttribute('data-on', hit)
        if (hit && bar) bar.scrollTo({ left: a.offsetLeft - bar.clientWidth / 2 + a.clientWidth / 2, behavior: 'smooth' })
      })
    }
    addEventListener('scroll', spy, { passive: true })
    lenis?.on('scroll', spy)
    spy()
  }

  // ---------- tour: a record button that works ----------
  const rec = $('[data-rec]')
  if (rec) {
    const count = $('[data-rec-count]', rec)
    const num = $('[data-rec-num]', rec)
    const border = $('[data-rec-border]', rec)
    const bar = $('[data-rec-bar]', rec)
    const time = $('[data-rec-time]', rec)
    const toast = $('[data-rec-toast]', rec)
    const pauseBtn = $('[data-rec-pause]', rec)
    let state = 'idle'
    let secs = 0
    let timer = null
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    const start = () => {
      if (state !== 'idle') return
      state = 'count'
      count.toggleAttribute('data-on', true)
      let n = 3
      num.textContent = n
      sfx.tick()
      const step = () => {
        n--
        if (n > 0) {
          num.textContent = n
          num.animate([{ transform: 'scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(0.16,1,0.3,1)' })
          sfx.tick()
          setTimeout(step, 800)
        } else {
          count.toggleAttribute('data-on', false)
          border.toggleAttribute('data-on', true)
          bar.toggleAttribute('data-on', true)
          sfx.start()
          state = 'rec'
          secs = 0
          time.textContent = fmt(0)
          timer = setInterval(() => state === 'rec' && (time.textContent = fmt(++secs)), 1000)
        }
      }
      setTimeout(step, 800)
    }
    const stop = () => {
      if (state !== 'rec' && state !== 'paused') return
      clearInterval(timer)
      state = 'idle'
      border.toggleAttribute('data-on', false)
      bar.toggleAttribute('data-on', false)
      toast.toggleAttribute('data-on', true)
      sfx.stop()
      setTimeout(() => toast.toggleAttribute('data-on', false), 2400)
    }
    $('[data-rec-start]', rec)?.addEventListener('click', (e) => {
      e.stopPropagation()
      start()
    })
    $('[data-rec-stop]', rec)?.addEventListener('click', stop)
    pauseBtn?.addEventListener('click', () => {
      if (state === 'rec') state = 'paused'
      else if (state === 'paused') state = 'rec'
      pauseBtn.style.opacity = state === 'paused' ? '0.5' : ''
    })
  }

  // ---------- tour: click to zoom, just like Scrim ----------
  const zoom = $('[data-zoom]')
  if (zoom) {
    const stage = $('[data-zoom-stage]', zoom)
    const level = $('[data-zoom-level]', zoom)
    let back = null
    let userTouched = false
    const zoomAt = (px, py, user) => {
      const r = zoom.getBoundingClientRect()
      const fx = (px - r.left) / r.width
      const fy = (py - r.top) / r.height
      const k = 2.2
      // keep the zoomed view inside the frame
      const tx = Math.max(-(k - 1) * r.width / 2, Math.min((k - 1) * r.width / 2, (0.5 - fx) * r.width * k))
      const ty = Math.max(-(k - 1) * r.height / 2, Math.min((k - 1) * r.height / 2, (0.5 - fy) * r.height * k))
      stage.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`
      level.textContent = k.toFixed(1) + 'x'
      const rp = document.createElement('span')
      rp.className = 'ripple pointer-events-none absolute z-10 size-[9cqw] rounded-full border-[0.5cqw] border-white'
      rp.style.left = px - r.left + 'px'
      rp.style.top = py - r.top + 'px'
      zoom.appendChild(rp)
      setTimeout(() => rp.remove(), 700)
      if (user) sfx.zoom(true)
      clearTimeout(back)
      back = setTimeout(() => {
        stage.style.transform = ''
        level.textContent = '1.0x'
        if (user) sfx.zoom(false)
      }, 1800)
    }
    zoom.addEventListener('click', (e) => {
      userTouched = true
      zoomAt(e.clientX, e.clientY, true)
    })
    // until someone clicks, it demonstrates on its own while on screen
    const spots = [[0.66, 0.48], [0.3, 0.3], [0.78, 0.7]]
    let si = 0
    let demo = null
    new IntersectionObserver(([e]) => {
      clearInterval(demo)
      if (!e.isIntersecting || userTouched) return
      demo = setInterval(() => {
        if (userTouched) return clearInterval(demo)
        const r = zoom.getBoundingClientRect()
        const [fx, fy] = spots[si++ % spots.length]
        zoomAt(r.left + fx * r.width, r.top + fy * r.height, false)
      }, 3600)
    }, { threshold: 0.6 }).observe(zoom)
  }

  // ---------- tour: try the background ----------
  const look = $('[data-look]')
  const lookScreen = $('[data-look-screen]')
  const lookImg = $('[data-look-img]')
  if (look && lookScreen && lookImg) {
    $$('[data-bg]', look).forEach((b) =>
      b.addEventListener('click', () => {
        $$('[data-bg]', look).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        lookScreen.style.background = b.dataset.bg
      })
    )
    const pad = $('[data-pad]', look)
    const rad = $('[data-radius]', look)
    let lastTick = 0
    const paint = (e) => {
      lookImg.style.width = 100 - Number(pad.value) * 2 + '%'
      lookImg.style.borderRadius = rad.value + 'px'
      if (e && performance.now() - lastTick > 40) {
        lastTick = performance.now()
        sfx.hover()
      }
    }
    pad?.addEventListener('input', paint)
    rad?.addEventListener('input', paint)
    paint()
  }

  // ---------- tour: edit by text ----------
  const tr = $('[data-transcript]')
  if (tr) {
    const words = $$('[data-w]', tr)
    const out = $('[data-cut]', tr)
    const trBar = $('[data-tr-bar]', tr)
    const trLen = $('[data-tr-len]', tr)
    const len = (w) => 0.18 + w.textContent.length * 0.05 // a rough speaking time per word
    const full = words.reduce((a, w) => a + len(w), 0)
    const style = (w) => {
      const cut = w.hasAttribute('data-gone')
      w.className = 'cursor-pointer rounded-md px-0.5 transition duration-300 ' + (cut ? 'text-faint line-through decoration-accent decoration-2' : 'hover:bg-bg-2')
    }
    const total = () => {
      const gone = words.filter((w) => w.hasAttribute('data-gone')).reduce((a, w) => a + len(w), 0)
      out.textContent = gone.toFixed(1) + 's'
      trBar.style.transform = `scaleX(${(full - gone) / full})`
      const left = full - gone
      trLen.textContent = `0:${left.toFixed(1).padStart(4, '0')}`
    }
    words.forEach((w) => {
      w.setAttribute('role', 'button')
      w.tabIndex = 0
      style(w)
      const flip = () => {
        w.toggleAttribute('data-gone')
        style(w)
        total()
        w.hasAttribute('data-gone') ? sfx.cut() : sfx.click()
      }
      w.addEventListener('click', flip)
      w.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip()))
    })
    $('[data-fillers]', tr)?.addEventListener('click', () => {
      words.filter((w) => w.hasAttribute('data-filler') && !w.hasAttribute('data-gone')).forEach((w, i) =>
        setTimeout(() => {
          w.setAttribute('data-gone', '')
          style(w)
          total()
          sfx.cut()
        }, i * 160)
      )
    })
    $('[data-tr-reset]', tr)?.addEventListener('click', () => {
      words.forEach((w) => (w.removeAttribute('data-gone'), style(w)))
      total()
    })
    total()
  }

  // ---------- tour: reshape for each platform ----------
  const shapePick = $('[data-shape-pick]')
  if (shapePick) {
    const box = $('[data-shape-box]')
    const img = $('[data-shape-img]')
    const tag = $('[data-shape-tag]')
    let pan = null
    $$('button', shapePick).forEach((b) =>
      b.addEventListener('click', () => {
        $$('button', shapePick).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        box.style.width = b.dataset.width + '%'
        tag.textContent = b.dataset.tag
        sfx.whoosh()
        clearInterval(pan)
        img.style.objectPosition = '50% 50%'
        if (b.dataset.pan) {
          // tall videos follow the cursor from side to side
          const xs = ['70%', '30%', '62%', '45%']
          let i = 0
          img.style.objectPosition = xs[0] + ' 50%'
          pan = setInterval(() => (img.style.objectPosition = xs[++i % xs.length] + ' 50%'), 1800)
        }
      })
    )
  }

  // ---------- year and version ----------
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()))
  // the newest installer comes straight from GitHub Releases, so a new release shows up here by itself
  const REPO = 'Alphred-OB/Scrim'
  if (location.protocol !== 'file:') {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((rel) => {
        const exe = rel?.assets?.find((a) => /\.exe$/i.test(a.name))
        if (!exe) return
        $$('[data-download]').forEach((a) => (a.href = exe.browser_download_url))
        const v = String(rel.tag_name || '').replace(/^v/i, '')
        $$('[data-meta]').forEach((el) => (el.textContent = `Version ${v} · Windows 10 and 11 · Free · ${Math.round(exe.size / 1e6)} MB`))
      })
      .catch(() => {})
  }

  // pause the video when it's off screen (saves battery)
  const v = $('main video')
  if (v) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()))).observe(v)
})()
