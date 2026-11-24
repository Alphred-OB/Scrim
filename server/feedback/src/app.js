import express from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { detailPage, listPage } from './admin.js'

const KINDS = new Set(['bug', 'idea'])
const CLIENTS = new Set(['scrim-desktop', 'scrim-website'])
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const STATUSES = ['new', 'seen', 'planned', 'done', 'wontfix']
const LIMITS = { title: 140, message: 8000, email: 200, logs: 600_000, shot: 4_000_000, meta: 20_000 }
const PER_HOUR = 12 // reports one address can send in an hour

const emailOk = (s) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s)
const clean = (s, max) => (typeof s === 'string' ? s.replace(/\u0000/g, '').trim().slice(0, max) : '')

/**
 * The feedback service: the app posts reports to /v1/feedback, you read them at /admin.
 * `db` is the store from db.js; `opts` lets tests swap the clock-free bits.
 */
export function createApp(db, opts = {}) {
  const adminUser = opts.adminUser ?? process.env.ADMIN_USER ?? 'admin'
  const adminPass = opts.adminPassword ?? process.env.ADMIN_PASSWORD ?? ''
  const salt = opts.salt ?? process.env.IP_SALT ?? 'scrim'
  const notify = opts.notify ?? webhookNotifier(process.env.NOTIFY_WEBHOOK_URL)
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // exactly one proxy (Render) in front; `true` would trust a client-sent X-Forwarded-For

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"
    })
    next()
  })
  app.get('/health', (_req, res) => res.json({ ok: true }))

  // ---------------- the website ----------------
  const latest = latestRelease(opts.githubRepo ?? process.env.GITHUB_REPO ?? 'Alphred-OB/Scrim', opts.fetch ?? fetch)
  app.get('/v1/latest', async (_req, res) => {
    const r = await latest().catch(() => null)
    if (!r) return res.status(404).json({ error: 'No release yet' })
    res.set('Cache-Control', 'public, max-age=300').json({ version: r.version, size: r.size, published: r.published })
  })
  // always the newest installer, so links never go stale
  app.get('/download', async (_req, res) => {
    const r = await latest().catch(() => null)
    res.redirect(302, r?.url ?? `https://github.com/${opts.githubRepo ?? process.env.GITHUB_REPO ?? 'Alphred-OB/Scrim'}/releases/latest`)
  })
  app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: '1h', setHeaders: (res, p) => res.set('Cache-Control', /\.(webp|mp4|jpg|png)$/.test(p) ? 'public, max-age=86400' : 'no-cache') }))

  // ---------------- from the app ----------------
  app.post('/v1/feedback', express.json({ limit: '7mb' }), async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Feedback is off on this server.' })
    try {
      // a light filter for random bots; the app always sends this
      if (!CLIENTS.has(req.get('x-scrim-client') ?? '')) return res.status(403).json({ error: 'Not allowed' })
      const b = req.body ?? {}
      if (b.website) return res.status(200).json({ id: 0 }) // honeypot: pretend it worked
      const kind = String(b.kind ?? '')
      if (!KINDS.has(kind)) return res.status(400).json({ error: 'kind must be bug or idea' })
      const title = clean(b.title, LIMITS.title)
      const message = clean(b.message, LIMITS.message)
      if (title.length < 3) return res.status(400).json({ error: 'Please add a short title.' })
      if (message.length < 3) return res.status(400).json({ error: 'Please describe it in a few words.' })
      const email = clean(b.email, LIMITS.email)
      if (email && !emailOk(email)) return res.status(400).json({ error: "That email address doesn't look right." })
      const logs = typeof b.logs === 'string' ? b.logs.replace(/\u0000/g, '').slice(-LIMITS.logs) : null
      let screenshot = null
      let screenshotType = null
      if (typeof b.screenshot === 'string' && b.screenshot) {
        const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(b.screenshot)
        if (!m) return res.status(400).json({ error: 'Screenshot must be a PNG or JPEG' })
        screenshot = Buffer.from(m[2], 'base64')
        if (screenshot.length > LIMITS.shot) return res.status(413).json({ error: 'Screenshot is too big' })
        screenshotType = m[1]
      }
      const ipHash = createHash('sha256').update(salt + (req.ip ?? '')).digest('hex').slice(0, 32)
      if ((await db.recentFrom(ipHash, 60)) >= PER_HOUR) return res.status(429).json({ error: 'Thanks! You have sent a lot of reports this hour. Please try again later.' })
      // Postgres jsonb rejects NUL characters, and cutting JSON text mid-way makes it invalid, so drop oversized meta instead
      const metaJson = typeof b.meta === 'object' && b.meta && !Array.isArray(b.meta) ? JSON.stringify(b.meta, (_k, v) => (typeof v === 'string' ? v.replace(/\u0000/g, '') : v)) : '{}'
      const meta = metaJson.length <= LIMITS.meta ? JSON.parse(metaJson) : { truncated: true }
      const row = await db.insert({
        kind, title, message, email: email || null, logs, screenshot, screenshotType, ipHash,
        appVersion: clean(b.appVersion, 40) || null,
        os: clean(b.os, 120) || null,
        crashId: clean(b.crashId, 80) || null,
        meta
      })
      notify({ id: row.id, kind, title, appVersion: b.appVersion }).catch(() => {})
      db.forgetAddresses?.().catch(() => {}) // the spam check only needs an hour of memory
      res.status(201).json({ id: row.id })
    } catch (e) {
      if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'That report is too big' })
      console.error('[feedback]', e)
      res.status(500).json({ error: 'Something went wrong on our side' })
    }
  })

  // ---------------- dashboard ----------------
  const auth = (req, res, next) => {
    if (!db) return res.status(503).type('text').send('Set DATABASE_URL to use the dashboard.')
    if (!adminPass) return res.status(503).type('text').send('Set ADMIN_PASSWORD to use the dashboard.')
    const [scheme, token] = (req.get('authorization') ?? '').split(' ')
    if (scheme === 'Basic' && token) {
      const [u, ...rest] = Buffer.from(token, 'base64').toString().split(':')
      const p = rest.join(':')
      const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
      if (same(u, adminUser) && same(p, adminPass)) return next()
    }
    res.set('WWW-Authenticate', 'Basic realm="Scrim feedback"').status(401).send('Login needed')
  }
  // changes only from our own pages
  const sameOrigin = (req, res, next) => {
    const o = req.get('origin')
    if (o && new URL(o).host !== req.get('host')) return res.status(403).send('Wrong origin')
    next()
  }

  app.get('/admin', auth, async (req, res) => {
    const f = { kind: KINDS.has(req.query.kind) ? req.query.kind : '', status: STATUSES.includes(req.query.status) ? req.query.status : '', q: clean(req.query.q, 100) }
    const [rows, counts] = await Promise.all([db.list(f), db.counts()])
    res.set('Cache-Control', 'no-store').type('html').send(listPage(rows, counts, f))
  })
  app.get('/admin/:id(\\d+)', auth, async (req, res) => {
    const row = await db.get(Number(req.params.id))
    if (!row) return res.status(404).send('Not found')
    res.set('Cache-Control', 'no-store').type('html').send(detailPage(row, STATUSES))
  })
  app.get('/admin/:id(\\d+)/screenshot', auth, async (req, res) => {
    const s = await db.screenshot(Number(req.params.id))
    if (!s) return res.status(404).send('Not found')
    res.set('Cache-Control', 'private, max-age=3600').type(s.screenshot_type).send(s.screenshot)
  })
  app.get('/admin/:id(\\d+)/logs.txt', auth, async (req, res) => {
    const row = await db.get(Number(req.params.id))
    if (!row?.logs) return res.status(404).send('No logs')
    res.type('text').set('Content-Disposition', `attachment; filename="scrim-report-${row.id}.log"`).send(row.logs)
  })
  app.post('/admin/:id(\\d+)/status', auth, sameOrigin, express.urlencoded({ extended: false }), async (req, res) => {
    if (STATUSES.includes(req.body.status)) await db.setStatus(Number(req.params.id), req.body.status)
    res.redirect(303, `/admin/${req.params.id}`)
  })
  app.post('/admin/:id(\\d+)/delete', auth, sameOrigin, async (req, res) => {
    await db.remove(Number(req.params.id))
    res.redirect(303, '/admin')
  })
  return app
}

/** Posts a one line message to a Discord or Slack webhook, if one is set. */
function webhookNotifier(url) {
  if (!url) return async () => {}
  return async ({ id, kind, title, appVersion }) => {
    const text = `${kind === 'bug' ? 'New problem report' : 'New feature idea'} #${id}: ${title}${appVersion ? ` (Scrim ${appVersion})` : ''}`
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text, text }) })
  }
}

/** The newest published GitHub release with a Windows installer, cached for 10 minutes. */
function latestRelease(repo, fetchFn) {
  let cache = null
  let at = 0
  return async () => {
    if (cache && Date.now() - at < 600_000) return cache
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'scrim-site' }
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    const r = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error('GitHub ' + r.status)
    const j = await r.json()
    const exe = (j.assets ?? []).find((a) => /\.exe$/i.test(a.name))
    if (!exe) throw new Error('No installer in the latest release')
    cache = { version: String(j.tag_name ?? '').replace(/^v/, ''), url: exe.browser_download_url, size: exe.size, published: j.published_at }
    at = Date.now()
    return cache
  }
}
