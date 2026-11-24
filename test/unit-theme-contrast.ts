// Every built-in theme's primary button text must read at 4.5:1. Run: npx tsx test/unit-theme-contrast.ts
import { contrast, MIN_TEXT_CONTRAST, strongAccent } from '../src/shared/color'

// the accents of the presets in renderer/lib/theme.ts, plus tokens.css's two
const ACCENTS: Record<string, string> = {
  dark: '#0a84ff', light: '#007aff', 'mono-dark': '#ffffff', 'mono-light': '#000000', midnight: '#7c9cff', ocean: '#22c3d6',
  forest: '#3ecf8e', grape: '#b07cff', sunset: '#ff7a59', rose: '#e5487a', sand: '#c7812f', mint: '#14a36b'
}
let fails = 0
for (const [id, accent] of Object.entries(ACCENTS)) {
  const { fill, on } = strongAccent(accent)
  const c = contrast(fill, on)
  const pass = c >= MIN_TEXT_CONTRAST
  console.log(pass ? 'PASS' : 'FAIL', id.padEnd(11), `${accent} -> ${fill} with ${on}`.padEnd(40), c.toFixed(2))
  if (!pass) fails++
}
const same = strongAccent('#ffffff').fill === '#ffffff' && strongAccent('#000000').fill === '#000000'
console.log(same ? 'PASS' : 'FAIL', 'black and white accents are left alone')
if (!same) fails++
console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
