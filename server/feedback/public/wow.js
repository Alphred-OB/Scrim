// Extra polish for the website: Iconsax icons, scroll progress, card tilt, text scramble and the small live demos
// (caption highlight, speech engine picker, script speed). Works on top of site.js, no libraries.
;(() => {
  'use strict'
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

  // ---------- Iconsax icons: <i data-i="Video"></i>, add data-v="b" for the two tone style ----------
  const icons = window.ICONS || { l: {}, b: {} }
  $$('[data-i]').forEach((el) => {
    const svg = (icons[el.dataset.v === 'b' ? 'b' : 'l'] || {})[el.dataset.i]
    if (svg) el.innerHTML = svg
  })

  // ---------- scroll progress ----------
  const bar = document.createElement('div')
  bar.className = 'wow-progress'
  document.body.append(bar)
  const onScroll = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    bar.style.transform = `scaleX(${clamp(scrollY / max)})`
  }
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  // ---------- 3D tilt on cards ----------
  if (fine && !calm) {
    $$('.wow-card').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width
        const py = (e.clientY - r.top) / r.height
        card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 6}deg) rotateY(${(px - 0.5) * 8}deg) translateY(-3px)`
      })
      card.addEventListener('pointerleave', () => (card.style.transform = ''))
    })
  }

  // ---------- text scramble when a small label scrolls into view ----------
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+*'
  const scramble = (el) => {
    const final = el.dataset.final
    const t0 = performance.now()
    const step = (t) => {
      const p = clamp((t - t0) / 700)
      el.textContent = [...final].map((ch, i) => (ch === ' ' || i < p * final.length ? ch : glyphs[(Math.random() * glyphs.length) | 0])).join('')
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const labels = $$('.label').filter((l) => !l.children.length && l.textContent.trim())
  labels.forEach((l) => { l.dataset.scramble = ''; l.dataset.final = l.textContent })
  if (!calm) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { scramble(e.target); io.unobserve(e.target) } }), { threshold: 0.8 })
    labels.forEach((l) => io.observe(l))
  }

  // ---------- captions: the words light up one by one ----------
  $$('[data-karaoke]').forEach((box) => {
    const ws = $$('[data-k]', box)
    if (!ws.length) return
    let i = 0
    const paint = () => ws.forEach((w, n) => w.classList.toggle('on', n === i))
    paint()
    if (calm) return
    setInterval(() => {
      i = (i + 1) % (ws.length + 2)
      paint()
    }, 420)
  })

  // ---------- AI page: pick the speech engine ----------
  const engines = {
    auto: 'Groq is used, and this PC takes over if Groq is unreachable.',
    groq: 'Very fast and accurate. Your audio is sent to Groq to be transcribed.',
    local: 'Nothing leaves your PC. Slower, and the model downloads the first time.'
  }
  const demo = $('[data-engine-demo]')
  if (demo) {
    const text = $('[data-engine-text]', demo)
    const btns = $$('[data-engine]', demo)
    btns.forEach((b) =>
      b.addEventListener('click', () => {
        btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        text.textContent = engines[b.dataset.engine]
      })
    )
  }

  // ---------- Script page: speed slider drives the scrolling text ----------
  const speed = $('[data-prompt-speed]')
  const scroller = $('[data-prompt-scroll]')
  if (speed && scroller) {
    const val = $('[data-prompt-val]')
    const set = () => {
      val.textContent = speed.value
      scroller.style.animationDuration = `${(34 - speed.value * 3).toFixed(1)}s`
    }
    speed.addEventListener('input', set)
    set()
  }
})()
