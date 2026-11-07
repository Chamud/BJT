import type { CardState } from './store'

export type Grade = 0 | 1 | 2 | 3 // Again, Hard, Good, Easy
const DAY = 86400000

/** SM-2 variant. New cards: Again → 10 min, Good → 1 day, Easy → 3 days. */
export function schedule(prev: CardState | undefined, g: Grade, now = Date.now()): CardState {
  const s: CardState = prev ? { ...prev } : { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, last: now }
  s.last = now
  if (g === 0) {
    s.lapses++; s.reps = 0; s.interval = 0
    s.ease = Math.max(1.3, s.ease - 0.2)
    s.due = now + 10 * 60000
    return s
  }
  s.ease = Math.max(1.3, s.ease + [0, -0.15, 0, 0.15][g])
  if (s.reps === 0) s.interval = g === 3 ? 3 : 1
  else if (s.reps === 1) s.interval = g === 1 ? 2 : g === 3 ? 6 : 4
  else s.interval = Math.round(s.interval * (g === 1 ? 1.2 : g === 3 ? s.ease * 1.3 : s.ease))
  s.reps++
  s.due = now + s.interval * DAY
  return s
}

export function previewInterval(prev: CardState | undefined, g: Grade): string {
  const s = schedule(prev, g)
  if (g === 0) return '10m'
  return s.interval >= 30 ? `${Math.round(s.interval / 30)}mo` : `${s.interval}d`
}
