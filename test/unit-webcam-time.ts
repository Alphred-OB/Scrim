// Checks when the webcam bubble has footage to show. Run: npx tsx test/unit-webcam-time.ts
import { webcamTimeAt, WEBCAM_TAIL_S } from '../src/shared/webcamTime'

let fails = 0
const ok = (name: string, cond: boolean, info?: unknown) => {
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(info))
  if (!cond) fails++
}
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-9

// the project that showed two bubbles: 438 s recording, webcam file 441.38 s long starting 0.225 s early,
// then a second video joined at 438 s
const OFFSET = -0.225
const CAM_LEN = 441.38

ok('inside the recording: the time in the webcam file', near(webcamTimeAt(100, OFFSET, 0, CAM_LEN), 100.225), webcamTimeAt(100, OFFSET, 0, CAM_LEN))
ok('sync offset moves it', near(webcamTimeAt(100, OFFSET, 0.5, CAM_LEN), 99.725))
ok('a webcam that starts later has no bubble before it starts', webcamTimeAt(5, 10, 0, CAM_LEN) === null)
ok('negative offset: the very first frame already has footage', near(webcamTimeAt(0, OFFSET, 0, CAM_LEN), 0.225))
ok('just past the end (within the tail) still shows', webcamTimeAt(CAM_LEN + OFFSET + WEBCAM_TAIL_S - 0.01, OFFSET, 0, CAM_LEN) !== null)
// the bug: 9 s into the joined video the webcam file is over, the bubble froze on its last frame
ok('9 s into the joined video: no bubble', webcamTimeAt(438 + 9, OFFSET, 0, CAM_LEN) === null, webcamTimeAt(447, OFFSET, 0, CAM_LEN))
ok('far past the end: no bubble', webcamTimeAt(900, OFFSET, 0, CAM_LEN) === null)
// a video joined at the start pushes the webcam later by its length
ok('video joined at the start: no bubble over it', webcamTimeAt(30, OFFSET + 120, 0, CAM_LEN) === null)
ok('...and the webcam is back, in step, after it', near(webcamTimeAt(130, OFFSET + 120, 0, CAM_LEN), 10.225))
// the part the first fix missed: the webcam file is 3.4 s longer than the recording (441.38 vs 438.03), so for 3.4 s
// after the join the bubble still showed on top of the joined video's own. `until` is where the first recording ends.
const UNTIL = 438.03
ok('before the join point the bubble shows', webcamTimeAt(430, OFFSET, 0, CAM_LEN, UNTIL) !== null)
ok('right at the join point it still shows', webcamTimeAt(UNTIL, OFFSET, 0, CAM_LEN, UNTIL) !== null)
ok('1 s into the joined video: no bubble (the file still has footage)', webcamTimeAt(UNTIL + 1, OFFSET, 0, CAM_LEN, UNTIL) === null, webcamTimeAt(UNTIL + 1, OFFSET, 0, CAM_LEN, UNTIL))
ok('3 s into the joined video: no bubble', webcamTimeAt(UNTIL + 3, OFFSET, 0, CAM_LEN, UNTIL) === null)
ok('no `until` (older projects): unchanged', webcamTimeAt(UNTIL + 1, OFFSET, 0, CAM_LEN) !== null)
ok('`until` with an unknown file length still cuts', webcamTimeAt(UNTIL + 1, OFFSET, 0, NaN, UNTIL) === null)

// a recorder WebM can report no length at all: then nothing to compare against
for (const len of [Infinity, NaN, 0, -1]) ok(`unknown length (${len}) never hides the bubble`, near(webcamTimeAt(500, OFFSET, 0, len), 500.225))

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
