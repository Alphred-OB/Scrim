// High frequency playhead updates that bypass React (keeps playback smooth on slow PCs).
type Fn = (t: number) => void
const subs = new Set<Fn>()
let current = 0
export const timeBus = {
  emit(t: number) {
    current = t
    subs.forEach((f) => f(t))
  },
  get: () => current,
  on(f: Fn) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }
}
