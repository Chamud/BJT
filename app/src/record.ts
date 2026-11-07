import type { Question } from './types'
import { secKey } from './types'
import { logDay, update } from './store'

export function recordAttempt(q: Question, correct: boolean, mode: 'practice' | 'mock', ms: number) {
  update(s => {
    s.attempts.push({ qid: q.id, sec: secKey(q), correct, difficulty: q.difficulty, ts: Date.now(), mode, ms })
    logDay(s, { questions: 1, correct: correct ? 1 : 0, minutes: Math.min(ms, 10 * 60000) / 60000 })
  })
}
