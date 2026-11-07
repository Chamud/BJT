import { useMemo } from 'react'
import type { Card, Question } from '../types'
import { REAL_COUNTS, SECTION_NAMES } from '../types'
import { streak, today, useStore } from '../store'
import { estimateScore, level, sectionAccuracy } from '../score'
import type { PracticePreset } from './Practice'

interface Props { questions: Question[]; cards: Card[]; go: (tab: string, preset?: PracticePreset) => void }

export default function Today({ questions, cards, go }: Props) {
  const st = useStore()
  const d = st.days[today()] ?? { minutes: 0, cards: 0, newCards: 0, questions: 0, correct: 0 }
  const est = estimateScore(st.attempts)
  const acc = sectionAccuracy(st.attempts)
  const now = Date.now()
  const due = cards.filter(c => st.cards[c.id] && st.cards[c.id].due <= now).length
  const newLeft = Math.max(0, Math.min(st.settings.newCardsPerDay - d.newCards, cards.filter(c => !st.cards[c.id]).length))
  const daysLeft = st.settings.examDate ? Math.ceil((new Date(st.settings.examDate).getTime() - now) / 86400000) : null
  const lastMock = st.mocks[st.mocks.length - 1]
  const mockDue = !lastMock || now - lastMock.ts > 10 * 86400000

  // weakest sections: lowest accuracy, unseen sections count as weakest; weight by real-exam size
  const weak = useMemo(() => Object.keys(REAL_COUNTS)
    .filter(k => questions.some(q => `${q.part}-${q.section}` === k))
    .map(k => ({ k, acc: acc[k].n ? acc[k].acc : -1, n: acc[k].n, gain: (1 - (acc[k].n ? acc[k].acc : 0)) * REAL_COUNTS[k] }))
    .sort((a, b) => (a.n < 3 ? -1 : 0) - (b.n < 3 ? -1 : 0) || b.gain - a.gain).slice(0, 3), [acc, questions])

  const qGoal = st.settings.dailyQuestions
  const tasks = [
    { done: due === 0 && newLeft === 0, label: `Flashcards — ${due} due, ${newLeft} new`, action: () => go('cards') },
    { done: d.questions >= qGoal, label: `Practice questions — ${d.questions}/${qGoal}`, action: () => go('practice', { sec: weak[0]?.k, count: 10 }) },
    ...(mockDue ? [{ done: false, label: lastMock ? 'Full mock exam (last one was over 10 days ago)' : 'Take your first full mock exam to get a baseline', action: () => go('mock') }] : []),
  ]

  return (
    <div className="grid">
      <div className="card hero">
        <div>
          <div className="muted small">Estimated BJT score</div>
          <div className="hero-num">{est.confidence === 'none' ? '—' : est.score}<span className="muted small"> / 800</span></div>
          <div>{est.confidence !== 'none' && <span className="pill">{level(est.score)}</span>}
            <span className="muted small"> target {st.settings.target}+ (J1+){est.confidence === 'low' ? ' · low confidence — answer more questions in every section' : ''}</span></div>
          {est.confidence !== 'none' && <Meter value={est.score} target={st.settings.target} />}
        </div>
        <div className="hero-side">
          <div><div className="big">{streak(st)}</div><div className="muted small">day streak</div></div>
          <div><div className="big">{daysLeft ?? '—'}</div><div className="muted small">{daysLeft === null ? <a onClick={() => go('settings')}>set exam date</a> : 'days to exam'}</div></div>
          <div><div className="big">{Math.round(d.minutes)}</div><div className="muted small">min today</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Today's plan</h3>
        <ul className="tasks">
          {tasks.map(t => <li key={t.label} className={t.done ? 'done' : ''}><span>{t.done ? '✓' : '○'}</span><a onClick={t.action}>{t.label}</a></li>)}
        </ul>
        <p className="small muted">Suggested daily routine (~75 min): 20 min flashcards · 20 min listening drill (Part 1/2) · 20 min reading drill · 15 min reviewing mistakes. Full mock every 1–2 weeks.</p>
      </div>

      <div className="card">
        <h3>Focus next</h3>
        <p className="small muted">Ranked by how many points you can gain (low accuracy × number of items in the real exam).</p>
        {weak.map(w => (
          <div key={w.k} className="focus-row">
            <div><b>{w.k} {SECTION_NAMES[w.k]}</b><div className="small muted">{w.n < 3 ? 'not enough data yet' : `${Math.round(w.acc * 100)}% (difficulty-weighted, last ${w.n})`}</div></div>
            <button className="btn" onClick={() => go('practice', { sec: w.k, count: 10 })}>Drill 10</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Meter({ value, target }: { value: number; target: number }) {
  const bands = [[0, 200, 'J5'], [200, 320, 'J4'], [320, 420, 'J3'], [420, 530, 'J2'], [530, 600, 'J1'], [600, 800, 'J1+']] as const
  return (
    <div className="meter" aria-label={`score ${value} of 800`}>
      {bands.map(([a, b, n]) => <div key={n} className="band" style={{ width: `${((b - a) / 800) * 100}%` }}><span>{n}</span></div>)}
      <div className="needle" style={{ left: `${(value / 800) * 100}%` }} />
      <div className="target" style={{ left: `${(target / 800) * 100}%` }} />
    </div>
  )
}
