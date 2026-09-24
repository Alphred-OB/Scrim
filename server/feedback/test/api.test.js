// Needs a Postgres: TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/scrim_fb npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'

const url = process.env.TEST_DATABASE_URL
const db = createDb(url)
const sent = []
let server
let base

before(async () => {
  await db.migrate()
  await db.pool.query('truncate feedback restart identity')
  const app = createApp(db, { adminUser: 'admin', adminPassword: 'pw', notify: async (m) => sent.push(m) })
  await new Promise((r) => (server = app.listen(0, r)))
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  server.close()
  await db.close()
})

const post = (body, headers = { 'x-scrim-client': 'scrim-desktop' }) =>
  fetch(base + '/v1/feedback', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const admin = (path, init = {}) => fetch(base + path, { ...init, redirect: 'manual', headers: { authorization: 'Basic ' + Buffer.from('admin:pw').toString('base64'), ...(init.headers ?? {}) } })

// 1x1 png
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('a bug report with logs and a screenshot is stored', async () => {
  const r = await post({ kind: 'bug', title: 'Export stops at 91%', message: 'It froze when exporting a 7 minute video.', email: 'me@example.com', appVersion: '0.4.0', os: 'Windows 11', logs: 'line 1\nline 2', screenshot: PNG, meta: { gpu: 'Intel' } })
  assert.equal(r.status, 201)
  const { id } = await r.json()
  assert.ok(id > 0)
  const row = await db.get(id)
  assert.equal(row.title, 'Export stops at 91%')
  assert.equal(row.has_shot, true)
  assert.equal(row.meta.gpu, 'Intel')
  assert.equal(sent.length, 1)
})

test('an idea without email works', async () => {
  const r = await post({ kind: 'idea', title: 'Add chapters', message: 'Let me mark chapters for YouTube.' })
  assert.equal(r.status, 201)
})

test('bad input is refused', async () => {
  assert.equal((await post({ kind: 'spam', title: 'x', message: 'y' })).status, 400)
  assert.equal((await post({ kind: 'bug', title: 'ok title', message: '' })).status, 400)
  assert.equal((await post({ kind: 'bug', title: 'ok title', message: 'fine', email: 'nope' })).status, 400)
  assert.equal((await post({ kind: 'bug', title: 'ok title', message: 'fine', screenshot: 'data:text/html;base64,PGI+' })).status, 400)
  assert.equal((await post({ kind: 'bug', title: 'ok title', message: 'fine' }, {})).status, 403)
})

test('honeypot is quietly ignored', async () => {
  const before = (await db.list()).length
  const r = await post({ kind: 'bug', title: 'Buy now', message: 'spam', website: 'http://spam' })
  assert.equal(r.status, 200)
  assert.equal((await db.list()).length, before)
})

test('one address is limited per hour', async () => {
  let last = 0
  for (let i = 0; i < 14; i++) last = (await post({ kind: 'idea', title: 'Idea ' + i, message: 'more ideas' })).status
  assert.equal(last, 429)
})

test('dashboard needs the password and shows reports', async () => {
  assert.equal((await fetch(base + '/admin')).status, 401)
  const r = await admin('/admin?kind=bug')
  assert.equal(r.status, 200)
  const html = await r.text()
  assert.match(html, /Export stops at 91%/)
  assert.doesNotMatch(html, /Add chapters/)
  const d = await admin('/admin/1')
  assert.match(await d.text(), /me@example.com/)
  const shot = await admin('/admin/1/screenshot')
  assert.equal(shot.headers.get('content-type'), 'image/png')
  const logs = await admin('/admin/1/logs.txt')
  assert.match(await logs.text(), /line 2/)
})

test('status changes and delete', async () => {
  const s = await admin('/admin/1/status', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }, body: 'status=planned' })
  assert.equal(s.status, 303)
  assert.equal((await db.get(1)).status, 'planned')
  const bad = await admin('/admin/1/delete', { method: 'POST', headers: { origin: 'https://evil.example' } })
  assert.equal(bad.status, 403)
  const del = await admin('/admin/2/delete', { method: 'POST', headers: { origin: base } })
  assert.equal(del.status, 303)
  assert.equal(await db.get(2), null)
})
