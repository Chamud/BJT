import type { Attempt } from './store'
import { REAL_COUNTS } from './types'

/**
 * Rough BJT score estimate. The real test uses IRT, so this is only a guide:
 * each section's recent accuracy is weighted by difficulty (harder items count more),
 * then sections are weighted by how many items they have in the real exam.
 */
export function sectionAccuracy(attempts: Attempt[], window = 40): Record<string, { acc: number; n: number }> {
  const out: Record<string, { acc: number; n: number }> = {}
  for (const sec of Object.keys(REAL_COUNTS)) {
    const recent = attempts.filter(a => a.sec === sec).slice(-window)
    const w = recent.reduce((t, a) => t + a.difficulty, 0)
    const c = recent.reduce((t, a) => t + (a.correct ? a.difficulty : 0), 0)
    out[sec] = { acc: w ? c / w : 0, n: recent.length }
  }
  return out
}

export function estimateScore(attempts: Attempt[]): { score: number; confidence: 'none' | 'low' | 'ok' } {
  const acc = sectionAccuracy(attempts)
  const covered = Object.values(acc).filter(a => a.n >= 3).length
  if (covered === 0) return { score: 0, confidence: 'none' }
  let s = 0
  for (const [sec, n] of Object.entries(REAL_COUNTS)) s += (n / 80) * (acc[sec].n ? acc[sec].acc : 0.25)
  // Map to 0–800. Random guessing (25%) ≈ 200; IRT compresses the top, so we square-root-ease the curve.
  const score = Math.round(800 * Math.max(0, (s - 0.25) / 0.75) ** 0.9)
  return { score, confidence: covered >= 9 && Object.values(acc).every(a => a.n >= 5) ? 'ok' : 'low' }
}

export function mockScore(items: { correct: boolean; difficulty: number }[]): number {
  const w = items.reduce((t, a) => t + a.difficulty, 0)
  const c = items.reduce((t, a) => t + (a.correct ? a.difficulty : 0), 0)
  const s = w ? c / w : 0
  return Math.round(800 * Math.max(0, (s - 0.25) / 0.75) ** 0.9)
}

export const level = (score: number) =>
  score >= 600 ? 'J1+' : score >= 530 ? 'J1' : score >= 420 ? 'J2' : score >= 320 ? 'J3' : score >= 200 ? 'J4' : 'J5'
