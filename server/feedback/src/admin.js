// The dashboard: plain server rendered pages, no build step. Solid colors only.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m])
const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const KIND = { bug: 'Problem', idea: 'Idea' }
const STATUS = { new: 'New', seen: 'Seen', planned: 'Planned', done: 'Done', wontfix: "Won't do" }

const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16181d;--dim:#626876;--line:#e3e6eb;--accent:#0a84ff;--bug:#ff3b30;--idea:#30a46c}
@media (prefers-color-scheme:dark){:root{--bg:#0f1014;--card:#17181d;--ink:#eceef2;--dim:#9aa0ad;--line:#262830}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Inter,Segoe UI,system-ui,sans-serif}
a{color:inherit;text-decoration:none}main{max-width:1000px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:22px;margin:0}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:5px 11px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--dim);font-size:12.5px}
.chip.on{border-color:var(--accent);color:var(--ink);font-weight:600}
form.search input{padding:7px 11px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);min-width:200px}
.row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid var(--line);margin-bottom:8px}
.row:hover{border-color:var(--accent)}.t{font-weight:600}.p{color:var(--dim);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tag{font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;color:#fff}.tag.bug{background:var(--bug)}.tag.idea{background:var(--idea)}
.st{font-size:12px;color:var(--dim);text-align:right}.st b{color:var(--ink)}.empty{padding:40px;text-align:center;color:var(--dim)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;color:var(--dim);font-size:13px}.meta b{color:var(--ink);display:block}
.msg{white-space:pre-wrap;word-break:break-word;font-size:15px}pre{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px;max-height:420px;overflow:auto;font-size:12px}
img.shot{max-width:100%;border-radius:10px;border:1px solid var(--line)}.btns{display:flex;gap:6px;flex-wrap:wrap}
button{padding:7px 12px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;font:inherit}
button.on{border-color:var(--accent);background:var(--accent);color:#fff}button.danger{color:var(--bug)}
.del{margin-left:auto;display:flex;gap:6px;align-items:center}.del summary{list-style:none;cursor:pointer;padding:7px 12px;border-radius:9px;border:1px solid var(--line);color:var(--bug)}.del[open] summary{display:none}
</style></head><body><main>${body}</main></body></html>`

export function listPage(rows, counts, f) {
  const n = (kind, status) => counts.filter((c) => (!kind || c.kind === kind) && (!status || c.status === status)).reduce((a, c) => a + c.n, 0)
  const link = (patch) => {
    const p = new URLSearchParams(Object.entries({ ...f, ...patch }).filter(([, v]) => v))
    return '/admin' + (p.toString() ? '?' + p : '')
  }
  const chip = (label, patch, on) => `<a class="chip ${on ? 'on' : ''}" href="${link(patch)}">${label}</a>`
  const body = `<div class="top"><h1>Scrim feedback</h1>
  <form class="search" method="get" action="/admin">${f.kind ? `<input type="hidden" name="kind" value="${esc(f.kind)}">` : ''}${f.status ? `<input type="hidden" name="status" value="${esc(f.status)}">` : ''}<input name="q" value="${esc(f.q)}" placeholder="Search"></form></div>
  <div class="top"><div class="chips">
    ${chip(`Everything ${n()}`, { kind: '' }, !f.kind)}
    ${chip(`Problems ${n('bug')}`, { kind: 'bug' }, f.kind === 'bug')}
    ${chip(`Ideas ${n('idea')}`, { kind: 'idea' }, f.kind === 'idea')}
  </div><div class="chips">
    ${chip('Any status', { status: '' }, !f.status)}
    ${Object.entries(STATUS).map(([k, l]) => chip(`${l} ${n(f.kind, k)}`, { status: k }, f.status === k)).join('')}
  </div></div>
  ${rows.length ? rows.map((r) => `<a class="row" href="/admin/${r.id}">
    <span class="tag ${r.kind}">${KIND[r.kind]}</span>
    <span style="min-width:0"><div class="t">${esc(r.title)}</div><div class="p">${esc(r.preview)}</div></span>
    <span class="st"><b>${STATUS[r.status]}</b><br>${when(r.created_at)}${r.has_shot ? ' · picture' : ''}${r.has_logs ? ' · logs' : ''}</span></a>`).join('') : '<div class="empty">Nothing here yet.</div>'}`
  return shell('Scrim feedback', body)
}

export function detailPage(r, statuses) {
  const meta = r.meta && Object.keys(r.meta).length ? `<pre>${esc(JSON.stringify(r.meta, null, 2))}</pre>` : ''
  const body = `<p><a href="/admin">&larr; All feedback</a></p>
  <div class="card"><div class="top" style="margin:0 0 10px"><div><span class="tag ${r.kind}">${KIND[r.kind]}</span> <span style="color:var(--dim)">#${r.id} · ${when(r.created_at)}</span></div></div>
  <h1 style="margin-bottom:10px">${esc(r.title)}</h1><div class="msg">${esc(r.message)}</div></div>
  <div class="card meta"><div><b>Reply to</b>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : 'Not given'}</div><div><b>Scrim</b>${esc(r.app_version ?? 'unknown')}</div><div><b>Computer</b>${esc(r.os ?? 'unknown')}</div>${r.crash_id ? `<div><b>Crash report</b>${esc(r.crash_id)}</div>` : ''}</div>
  <div class="card"><div class="btns">${statuses.map((s) => `<form method="post" action="/admin/${r.id}/status"><button name="status" value="${s}" class="${r.status === s ? 'on' : ''}">${STATUS[s]}</button></form>`).join('')}
  <details class="del"><summary>Delete</summary><form method="post" action="/admin/${r.id}/delete"><button class="danger">Yes, delete it for good</button></form></details></div></div>
  ${r.has_shot ? `<div class="card"><img class="shot" src="/admin/${r.id}/screenshot" alt="Screenshot"></div>` : ''}
  ${r.logs ? `<div class="card"><div class="top" style="margin:0 0 8px"><b>Log</b><a class="chip" href="/admin/${r.id}/logs.txt">Download</a></div><pre>${esc(r.logs.slice(-40000))}</pre></div>` : ''}
  ${meta ? `<div class="card"><b>Details</b>${meta}</div>` : ''}`
  return shell(`#${r.id} ${r.title}`, body)
}
