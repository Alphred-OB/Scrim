// The feedback form: problem or idea, sent to the same service the app uses.
;(() => {
  const form = document.getElementById('fb')
  if (!form) return
  const $ = (s) => document.querySelector(s)
  const TEXT = {
    bug: { h: 'Report a problem', sub: "Tell us what went wrong and we'll look into it.", label: 'What went wrong?', ph: 'In a few words, e.g. "Export stops at 91%"', msg: 'What were you doing, and what happened? Steps to make it happen again help the most.', done: "Thanks, we got your report.", doneSub: "If you left your email, we'll write when it's fixed." },
    idea: { h: 'Suggest a feature', sub: 'What would make Scrim better for you?', label: 'Your idea in a few words', ph: 'e.g. "Chapters for YouTube"', msg: 'What would you use it for? How do you picture it working?', done: 'Thanks for the idea!', doneSub: 'Every suggestion gets read, and the popular ones get built first.' }
  }
  let kind = new URLSearchParams(location.search).get('type') === 'idea' ? 'idea' : 'bug'
  const apply = () => {
    const t = TEXT[kind]
    document.title = `${t.h} · Scrim`
    $('[data-heading]').textContent = t.h
    $('[data-sub]').textContent = t.sub
    $('[data-title-label]').textContent = t.label
    form.title.placeholder = t.ph
    form.message.placeholder = t.msg
    $('[data-version-field]').hidden = kind !== 'bug'
    document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === kind)))
    history.replaceState(null, '', kind === 'idea' ? '/feedback?type=idea' : '/feedback')
  }
  document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => ((kind = b.dataset.kind), apply())))
  apply()

  const err = (m) => {
    const el = $('[data-err]')
    el.textContent = m || ''
    el.hidden = !m
  }
  const readFile = (f) =>
    new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.onerror = () => rej(new Error("Couldn't read that picture"))
      r.readAsDataURL(f)
    })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err('')
    const title = form.title.value.trim()
    const message = form.message.value.trim()
    if (title.length < 3) return err('Please add a short title.'), form.title.focus()
    if (message.length < 3) return err('Please describe it in a few words.'), form.message.focus()
    const body = { kind, title, message, email: form.email.value.trim() || undefined, website: form.website.value, appVersion: kind === 'bug' ? form.version.value.trim() || undefined : undefined, os: navigator.userAgent.slice(0, 120), meta: { from: 'website' } }
    const file = form.shot.files[0]
    if (file) {
      if (file.size > 4_000_000) return err('That picture is bigger than 4 MB.')
      try {
        body.screenshot = await readFile(file)
      } catch (x) {
        return err(x.message)
      }
    }
    const btn = form.querySelector('button[type=submit]')
    btn.disabled = true
    btn.textContent = 'Sending…'
    try {
      const r = await fetch('/v1/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-scrim-client': 'scrim-website' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.')
      form.hidden = true
      $('[data-done-title]').textContent = TEXT[kind].done
      $('[data-done-sub]').textContent = TEXT[kind].doneSub
      $('[data-done]').hidden = false
    } catch (x) {
      err(x.message === 'Failed to fetch' ? "Couldn't reach us. Check your internet and try again." : x.message)
    } finally {
      btn.disabled = false
      btn.textContent = 'Send'
    }
  })
})()
