// Checks for the pure speech, trim and caption helpers. Run: npx tsx test/unit-speech.ts
import { captionChunks, cutRanges, fillerRanges, mergeRanges, silenceRanges, speedRanges, subtitleFile, type SpokenWord } from '../src/shared/speech'
import { findIdle } from '../src/shared/tidy'

let fails = 0
const ok = (name: string, cond: boolean, info?: unknown) => {
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(info))
  if (!cond) fails++
}
let n = 0
const id = () => 'n' + n++
const W = (t0: number, t1: number, w: string): SpokenWord => ({ t0, t1, w, key: Math.round(t0 * 1000) })

// cutting
const clips = [{ id: 'a', start: 0, end: 10, speed: 1 }]
const cut = cutRanges(clips, [[2, 3], [2.5, 4], [8, 12]], id)
ok('cut merges and splits', JSON.stringify(cut.map((c) => [c.start, c.end])) === '[[0,2],[4,8]]', cut)
ok('first piece keeps its id', cut[0].id === 'a')
ok('merge', JSON.stringify(mergeRanges([[5, 6], [1, 2], [1.5, 3]])) === '[[1,3],[5,6]]')
const sp = speedRanges([{ id: 'a', start: 0, end: 10, speed: 1 }], [[3, 5]], 4, id)
ok('speed range', JSON.stringify(sp.map((c) => [c.start, c.end, c.speed])) === '[[0,3,1],[3,5,4],[5,10,1]]', sp)
const sp2 = speedRanges([{ id: 'a', start: 0, end: 4, speed: 1 }, { id: 'b', start: 6, end: 10, speed: 2 }], [[3, 7]], 6, id)
ok('speed across two clips', JSON.stringify(sp2.map((c) => [c.start, c.end, c.speed])) === '[[0,3,1],[3,4,6],[6,7,6],[7,10,2]]', sp2)

// fillers and pauses
const words = [W(0, 0.3, 'So'), W(0.35, 0.6, 'um,'), W(0.7, 1, 'this'), W(3.5, 3.8, 'works.')]
const f = fillerRanges(words)
ok('filler found once', f.length === 1 && f[0][0] >= 0.3 && f[0][1] <= 0.67, f)
const s = silenceRanges(words, 1, 0.3)
ok('pause shortened with breathing room', s.length === 1 && Math.abs(s[0][0] - 1.3) < 1e-6 && Math.abs(s[0][1] - 3.2) < 1e-6, s)

// captions
const many = Array.from({ length: 30 }, (_, i) => W(i * 0.3, i * 0.3 + 0.25, i === 9 ? 'end.' : 'word'))
const ch = captionChunks(many, 20, 2)
ok('chunks respect length', ch.every((c) => c.lines.every((l) => l.map((w) => w.w).join(' ').length <= 20 + 5)), ch.map((c) => c.lines.map((l) => l.map((w) => w.w).join(' '))))
ok('sentence end splits', ch.some((c) => c.words[c.words.length - 1].w === 'end.'))
ok('chunks do not overlap', ch.every((c, i) => !ch[i + 1] || c.t1 <= ch[i + 1].t0 + 1e-9))
const srt = subtitleFile(ch, (t) => t, 'srt')
ok('srt format', /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\n/.test(srt), srt.slice(0, 80))

// dead time
const idle = findIdle({ duration: 20, speech: [{ t0: 0, t1: 3 }, { t0: 12, t1: 14 }], cursor: { width: 1, height: 1, samples: [{ t: 0, x: 0.5, y: 0.5 }, { t: 20, x: 0.5, y: 0.5 }], clicks: [{ t: 16, x: 0.5, y: 0.5, button: 1 }] } }, 3)
ok('finds the quiet middle', idle.length >= 1 && idle[0].start > 3 && idle[0].end < 12 && idle[0].end - idle[0].start > 7, idle)
ok('clicks count as activity', !idle.some((r) => r.start < 16 && r.end > 16), idle)

console.log(fails ? `${fails} FAILED` : 'all passed')
process.exit(fails ? 1 : 0)
