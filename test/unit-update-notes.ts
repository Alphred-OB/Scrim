// Checks how release notes become the update screen's "What's new" list. Run: npx tsx test/unit-update-notes.ts
import { releaseNoteLines } from '../src/shared/updateNotes'

let fails = 0
const ok = (name: string, cond: boolean, info?: unknown) => {
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(info))
  if (!cond) fails++
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// what GitHub's release feed sends for markdown bullets
const html = '<p>Smoother playback &amp; a cleaner editor.</p>\n<ul>\n<li>Webcam seeks are 20x faster.</li>\n<li>Thumbnails wait while you play.</li>\n</ul>'
ok('html list becomes one line per item', same(releaseNoteLines(html), ['Smoother playback & a cleaner editor.', 'Webcam seeks are 20x faster.', 'Thumbnails wait while you play.']), releaseNoteLines(html))

ok('markdown bullets lose their markers', same(releaseNoteLines('- one\n* two\n• three\n1. four\n## five'), ['one', 'two', 'three', 'four', 'five']))
ok('blank lines and whitespace are dropped', same(releaseNoteLines('\n  \n a \r\n\r\n b\n'), ['a', 'b']))
ok('a list of per version notes is joined', same(releaseNoteLines([{ note: 'x' }, { note: 'y' }]), ['x', 'y']))
ok('nothing in, nothing out', releaseNoteLines(undefined).length === 0 && releaseNoteLines('').length === 0 && releaseNoteLines(null).length === 0)
ok('capped at six lines', releaseNoteLines('1\n2\n3\n4\n5\n6\n7\n8').length === 6)
ok('a very long line is cut', releaseNoteLines('x'.repeat(500))[0].length === 200)
ok('entities decode once', releaseNoteLines('&amp;lt;b&amp;gt;')[0] === '&lt;b&gt;', releaseNoteLines('&amp;lt;b&amp;gt;'))
ok('tags never survive', !/[<>]/.test(releaseNoteLines('<script>alert(1)</script><b>bold</b>').join('')))

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
