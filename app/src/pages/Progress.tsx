import { useMemo } from 'react'
import type { Card, Question } from '../types'
import { REAL_COUNTS, SECTION_NAMES } from '../types'
import { today, useStore } from '../store'
import { estimateScore, sectionAccuracy } from '../score'
import Chart from '../components/Chart'

export default function Progress({ questions, cards }: { questions: Question[]; cards: Card[] }) {
  const st = useStore()

  // estimate history: replay attempts day by day
  const trend = useMemo(() => {
    const days = [...new Set(st.attempts.map(a => today(new Date(a.ts))))].sort()
    const labels = days.map(d => d.slice(5))
    const est = days.map(d => {
      const upTo = st.attempts.filter(a => today(new Date(a.ts)) <= d)
      const e = estimateScore(upTo); return e.confidence === 'none' ? NaN : e.score
    })
    const mock = days.map(d => { const m = st.mocks.filter(x => today(new Date(x.ts)) === d); return m.length ? m[m.length - 1].score : NaN })
    return { labels, est, mock }
  }, [st.attempts, st.mocks])

  const acc = sectionAccuracy(st.attempts)
  const secs = Object.keys(REAL_COUNTS)

  const heat = useMemo(() => {
    const cells: { d: string; v: number }[] = []
    const end = new Date()
    const start = new Date(end); start.setDate(start.getDate() - 7 * 12 - end.getDay())
    for (const x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) {
      const k = today(x); const l = st.days[k]
      cells.push({ d: k, v: l ? Math.round(l.minutes) : 0 })
    }
    return cells
  }, [st.days])
  const heatStep = (v: number) => v === 0 ? 0 : v < 15 ? 1 : v < 40 ? 2 : v < 75 ? 3 : 4

  const coverage = secs.map(k => {
    const qs = questions.filter(q => `${q.part}-${q.section}` === k)
    const seen = new Set(st.attempts.filter(a => a.sec === k).map(a => a.qid))
    return { k, total: qs.length, seen: qs.filter(q => seen.has(q.id)).length }
  })
  const decks = ['vocab', 'kanji', 'keigo', 'phrase', 'grammar'].map(dk => {
    const cs = cards.filter(c => c.deck === dk)
    return { dk, total: cs.length, started: cs.filter(c => st.cards[c.id]).length, mature: cs.filter(c => (st.cards[c.id]?.interval ?? 0) >= 21).length }
  }).filter(d => d.total)

  return (
    <div className="grid">
      <div className="card wide">
        <h3>Score trend</h3>
        {trend.labels.length ? (
          <Chart spec={{ type: 'line', labels: trend.labels, series: [{ name: 'Estimate', values: trend.est }, { name: 'Mock exam', values: trend.mock }] }}
            yMin={0} yMax={800} refLine={{ value: st.settings.target, label: `target ${st.settings.target}` }} points={[false, true]} />
        ) : <p className="muted">Answer some questions to see your trend.</p>}
      </div>

      <div className="card wide">
        <h3>Accuracy by section</h3>
        <p className="small muted">Difficulty-weighted, last 40 attempts per section. For J1+ aim for roughly 80%+ everywhere.</p>
        <Chart spec={{ type: 'bar', unit: '%', labels: secs.map(k => `${k} ${SECTION_NAMES[k]}`), series: [{ name: 'Accuracy', values: secs.map(k => Math.round(acc[k].acc * 100)) }] }}
          horizontal yMax={100} refLine={{ value: 80, label: '80%' }} />
      </div>

      <div className="card wide">
        <h3>Study minutes — last 12 weeks</h3>
        <div className="heat">
          {heat.map(c => <div key={c.d} className={`h${heatStep(c.v)}`} title={`${c.d}: ${c.v} min`} />)}
        </div>
        <div className="heat-legend small muted">less <i className="h0" /><i className="h1" /><i className="h2" /><i className="h3" /><i className="h4" /> more</div>
      </div>

      <div className="card">
        <h3>Question coverage</h3>
        <table className="data">
          <thead><tr><th>Section</th><th>Seen</th><th>Bank</th></tr></thead>
          <tbody>{coverage.map(c => <tr key={c.k}><th>{c.k} {SECTION_NAMES[c.k]}</th><td>{c.seen}</td><td>{c.total}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="card">
        <h3>Flashcards</h3>
        <table className="data">
          <thead><tr><th>Deck</th><th>Started</th><th>Mature (21d+)</th><th>Total</th></tr></thead>
          <tbody>{decks.map(d => <tr key={d.dk}><th>{d.dk}</th><td>{d.started}</td><td>{d.mature}</td><td>{d.total}</td></tr>)}</tbody>
        </table>
      </div>

      {st.mocks.length > 0 && (
        <div className="card wide">
          <h3>Mock exam history</h3>
          <table className="data">
            <thead><tr><th>Date</th><th>Mock</th><th>Score</th><th>Correct</th><th>Minutes</th></tr></thead>
            <tbody>{[...st.mocks].reverse().map(m => <tr key={m.ts}><td>{today(new Date(m.ts))}</td><td>{m.mock}</td><td><b>{m.score}</b></td><td>{m.correct}/{m.total}</td><td>{Math.round(m.minutes)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
