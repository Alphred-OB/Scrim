// Keeps the header and footer the same on every page of the website.
//   npm run pages
// Edit partials/header.html or partials/footer.html, run this, and every public/*.html page is updated
// (the text between <!--header--> ... <!--/header--> and <!--footer--> ... <!--/footer-->).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, 'public')
const part = (n) => readFileSync(join(here, 'partials', n), 'utf8').trim()
const header = part('header.html')
const footer = part('footer.html')

const swap = (html, tag, body) => html.replace(new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`), () => `<!--${tag}-->\n${body}\n<!--/${tag}-->`)

let n = 0
for (const f of readdirSync(pub).filter((x) => x.endsWith('.html'))) {
  const file = join(pub, f)
  let html = readFileSync(file, 'utf8')
  if (!html.includes('<!--header-->')) continue
  // mark the page you are on in the menu
  const here = f === 'index.html' ? 'index.html' : f
  const head = header.replace(new RegExp(`(<a class="link"[^>]*?)href="${here.replace('.', '\\.')}"`, 'g'), '$1href="' + here + '" aria-current="page"')
  html = swap(swap(html, 'header', head), 'footer', footer)
  writeFileSync(file, html)
  n++
}
console.log(`updated ${n} pages`)
