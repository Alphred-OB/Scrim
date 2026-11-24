// Request checks for /v1/feedback with an in-memory store, so they run without Postgres.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

const rows = []
const db = {
  async insert(f) {
    // mimic Postgres: text and jsonb columns refuse NUL characters
    for (const v of [f.title, f.message, f.logs, JSON.stringify(f.meta)]) if (typeof v === 'string' && /\u0000|\\u0000/.test(v)) throw new Error('invalid byte sequence 0x00')
    rows.push({ ...f, id: rows.length + 1 })
    return { id: rows.length }
  },
  recentFrom: async (ipHash) => rows.filter((r) => r.ipHash === ipHash).length,
  forgetAddresses: async () => {}
}
let server
let base
before(async () => {
  const app = createApp(db, { notify: async () => {}, fetch: async () => ({ ok: false }) })
  await new Promise((r) => (server = app.listen(0, r)))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const post = (body, headers = {}) =>
  fetch(base + '/v1/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-scrim-client': 'scrim-desktop', ...headers }, body: JSON.stringify(body) })
const report = (extra = {}) => ({ kind: 'bug', title: 'Export froze', message: 'It stopped at 91%', ...extra })

test('oversized meta is stored as truncated instead of failing', async () => {
  const r = await post(report({ meta: { big: 'x'.repeat(30_000) } }), { 'x-forwarded-for': '10.0.0.1' })
  assert.equal(r.status, 201)
  assert.deepEqual(rows.at(-1).meta, { truncated: true })
})

test('NUL characters in logs and meta are stripped', async () => {
  const r = await post(report({ logs: 'a\u0000b', meta: { gpu: 'In\u0000tel' } }), { 'x-forwarded-for': '10.0.0.2' })
  assert.equal(r.status, 201)
  assert.equal(rows.at(-1).logs, 'ab')
  assert.equal(rows.at(-1).meta.gpu, 'Intel')
})

test('a client-sent X-Forwarded-For cannot dodge the hourly limit', async () => {
  // the test server has no proxy in front, so with trust proxy = 1 the real peer address is used
  // only when the header is absent; the spoofed leftmost entry must never become req.ip
  let last = 0
  for (let i = 0; i < 14; i++) last = (await post(report(), { 'x-forwarded-for': `1.2.3.${i}, 127.0.0.1` })).status
  assert.equal(last, 429)
})
