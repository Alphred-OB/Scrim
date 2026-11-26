// Checks how a finished transcript is put into a project's edit. Run: npx tsx test/unit-captions-apply.ts
import { applyTranscript, defaultCaptions } from '../src/shared/speech'
import type { EditState, Transcript } from '../src/shared/types'

let fails = 0
const ok = (name: string, cond: boolean, info?: unknown) => {
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(info))
  if (!cond) fails++
}

const t = (text: string): Transcript => ({ offset: 0, source: 'mic', engine: 'local', createdAt: 1, words: text.split(' ').map((w, i) => ({ t0: i, t1: i + 0.5, w })) })
const blank = () => ({} as EditState)

// first time: the transcript is set and captions get their defaults
const a = blank()
applyTranscript(a, t('hello world'))
ok('a first transcript is stored', a.transcript?.words.length === 2)
ok('captions get their defaults', a.captions?.look === defaultCaptions().look && a.captions?.show === defaultCaptions().show, a.captions)
ok('nothing is hidden or fixed yet', a.captions?.hidden.length === 0 && Object.keys(a.captions?.fixes ?? {}).length === 0)

// again: the new words replace the old, the chosen look stays, the old fixes and hidden words are dropped
const b = blank()
applyTranscript(b, t('one two three'))
b.captions = { ...b.captions!, look: 'neon', hidden: [1, 2], fixes: { 1: 'fixed' } }
applyTranscript(b, t('four five'))
ok('a new transcript replaces the old words', b.transcript?.words.map((w) => w.w).join(' ') === 'four five', b.transcript)
ok('the look you picked is kept', b.captions?.look === 'neon', b.captions)
ok('words fixed or hidden in the old transcript are cleared', b.captions?.hidden.length === 0 && Object.keys(b.captions?.fixes ?? {}).length === 0, b.captions)

// it works on a plain project object too (a project that is not open in the editor is patched through its file)
const file = { edit: blank() }
applyTranscript(file.edit, t('saved to a file'))
ok('works on a project loaded from disk', file.edit.transcript?.words.length === 4)

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
