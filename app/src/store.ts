import { useSyncExternalStore } from 'react'

/** All progress lives in one localStorage key. Use Settings → Export to back it up. */
export interface Attempt { qid: string; sec: string; correct: boolean; difficulty: number; ts: number; mode: 'practice' | 'mock'; ms: number }
export interface CardState { due: number; interval: number; ease: number; reps: number; lapses: number; last: number }
export interface MockResult { mock: string; ts: number; score: number; correct: number; total: number; bySection: Record<string, [number, number]>; minutes: number }
export interface DayLog { minutes: number; cards: number; newCards: number; questions: number; correct: number }
export interface Settings {
  newCardsPerDay: number; dailyQuestions: number; examDate: string; speechRate: number; target: number
  /** desktop widget: cards per set, minutes per set (5–60), seconds before the end to pop on top, quiet hours "HH:MM" */
  widgetBatch: number; widgetMins: number; widgetWarnSecs: number; quietStart: string; quietEnd: string
}

export interface State {
  version: 1
  attempts: Attempt[]
  cards: Record<string, CardState>
  mocks: MockResult[]
  days: Record<string, DayLog>
  settings: Settings
}

const KEY = 'bjt-trainer-v1'
const fresh = (): State => ({
  version: 1, attempts: [], cards: {}, mocks: [], days: {},
  settings: { newCardsPerDay: 15, dailyQuestions: 20, examDate: '', speechRate: 1, target: 600, widgetBatch: 3, widgetMins: 10, widgetWarnSecs: 60, quietStart: '', quietEnd: '' },
})

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw); return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } } }
  } catch { /* fall through */ }
  return fresh()
}

let state = load()
const listeners = new Set<() => void>()

export function update(fn: (s: State) => void) {
  const next: State = structuredClone(state)
  fn(next)
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage full or blocked */ }
  listeners.forEach(l => l())
}
export const getState = () => state

// Keep several windows (desktop widget + main window, or two browser tabs) in sync:
// when another window saves, reload instead of overwriting its changes later.
if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if (e.key !== KEY) return
  state = load()
  listeners.forEach(l => l())
})

/** True when "now" is inside the quiet-hours window (handles windows that cross midnight). */
export function inQuietHours(s: Settings, d = new Date()): boolean {
  if (!s.quietStart || !s.quietEnd || s.quietStart === s.quietEnd) return false
  const m = (t: string) => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi }
  const now = d.getHours() * 60 + d.getMinutes(), a = m(s.quietStart), b = m(s.quietEnd)
  return a < b ? now >= a && now < b : now >= a || now < b
}
export function useStore(): State {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => state)
}

export const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export function logDay(s: State, patch: Partial<DayLog>) {
  const d = s.days[today()] ?? { minutes: 0, cards: 0, newCards: 0, questions: 0, correct: 0 }
  for (const [k, v] of Object.entries(patch)) (d as unknown as Record<string, number>)[k] += v as number
  s.days[today()] = d
}

/** Consecutive days (ending today or yesterday) with any activity. */
export function streak(s: State): number {
  let n = 0
  const d = new Date()
  if (!active(s.days[today(d)])) d.setDate(d.getDate() - 1)
  while (active(s.days[today(d)])) { n++; d.setDate(d.getDate() - 1) }
  return n
}
const active = (l?: DayLog) => !!l && (l.cards + l.questions) > 0

/** Book-mode answer sheet lives under its own key; include it in backups. */
const BOOK_SHEET_KEY = 'bjt-book-sheet-v1'
export function exportJSON() {
  let bookSheet: unknown = undefined
  try { bookSheet = JSON.parse(localStorage.getItem(BOOK_SHEET_KEY) ?? 'null') ?? undefined } catch { /* ignore */ }
  const blob = new Blob([JSON.stringify({ ...state, bookSheet }, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `bjt-progress-${today()}.json`
  a.click()
}
export function importJSON(text: string) {
  const s = JSON.parse(text)
  if (s?.version !== 1 || !Array.isArray(s.attempts)) throw new Error('Not a BJT trainer backup')
  const { bookSheet, ...rest } = s
  if (bookSheet) try { localStorage.setItem(BOOK_SHEET_KEY, JSON.stringify(bookSheet)) } catch { /* ignore */ }
  // merge settings with defaults: older backups (e.g. from the browser version) lack newer settings
  update(cur => Object.assign(cur, fresh(), rest, { settings: { ...fresh().settings, ...(rest.settings ?? {}) } }))
}
export function resetAll() { update(cur => Object.assign(cur, fresh())) }
