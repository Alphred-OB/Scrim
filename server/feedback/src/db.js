import pg from 'pg'

// One small table holds everything. It's created on start, so a fresh database just works.
const SCHEMA = `
create table if not exists feedback (
  id serial primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('bug', 'idea')),
  title text not null,
  message text not null,
  email text,
  app_version text,
  os text,
  meta jsonb not null default '{}'::jsonb,
  logs text,
  screenshot bytea,
  screenshot_type text,
  crash_id text,
  status text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'wontfix')),
  ip_hash text
);
create index if not exists feedback_created on feedback (created_at desc);
create index if not exists feedback_kind_status on feedback (kind, status);
`

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set')
  // TLS with a verified certificate, except for local databases and Render's internal network (a bare
  // host with no dots, e.g. dpg-xxxx-a), which is private. PGSSL_NO_VERIFY=1 is an escape hatch for a
  // provider whose certificate chain Node doesn't trust.
  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  const local = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(host) || url.includes('host=/') || (host && !host.includes('.'))
  const ssl = local ? false : { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== '1' }
  const pool = new pg.Pool({ connectionString: url, ssl, max: 5 })
  return {
    pool,
    migrate: () => pool.query(SCHEMA),
    async insert(f) {
      const r = await pool.query(
        `insert into feedback (kind, title, message, email, app_version, os, meta, logs, screenshot, screenshot_type, crash_id, ip_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id, created_at`,
        [f.kind, f.title, f.message, f.email, f.appVersion, f.os, f.meta ?? {}, f.logs, f.screenshot, f.screenshotType, f.crashId, f.ipHash]
      )
      return r.rows[0]
    },
    async list({ kind, status, q, limit = 100, offset = 0 } = {}) {
      const where = []
      const args = []
      if (kind) where.push(`kind = $${args.push(kind)}`)
      if (status) where.push(`status = $${args.push(status)}`)
      if (q) where.push(`(title ilike $${args.push('%' + q + '%')} or message ilike $${args.length})`)
      const sql = `select id, created_at, kind, title, left(message, 180) as preview, email, app_version, os, status,
        screenshot is not null as has_shot, logs is not null as has_logs
        from feedback ${where.length ? 'where ' + where.join(' and ') : ''}
        order by created_at desc limit ${Number(limit)} offset ${Number(offset)}`
      return (await pool.query(sql, args)).rows
    },
    async counts() {
      const r = await pool.query(`select kind, status, count(*)::int as n from feedback group by kind, status`)
      return r.rows
    },
    async get(id) {
      const r = await pool.query(`select id, created_at, kind, title, message, email, app_version, os, meta, logs, crash_id, status, screenshot is not null as has_shot from feedback where id = $1`, [id])
      return r.rows[0] ?? null
    },
    async screenshot(id) {
      const r = await pool.query(`select screenshot, screenshot_type from feedback where id = $1`, [id])
      return r.rows[0]?.screenshot ? r.rows[0] : null
    },
    setStatus: (id, status) => pool.query(`update feedback set status = $2 where id = $1`, [id, status]),
    remove: (id) => pool.query(`delete from feedback where id = $1`, [id]),
    async recentFrom(ipHash, minutes) {
      const r = await pool.query(`select count(*)::int as n from feedback where ip_hash = $1 and created_at > now() - ($2 || ' minutes')::interval`, [ipHash, String(minutes)])
      return r.rows[0].n
    },
    forgetAddresses: () => pool.query(`update feedback set ip_hash = null where ip_hash is not null and created_at < now() - interval '1 hour'`),
    close: () => pool.end()
  }
}
