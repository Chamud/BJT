import { useEffect, useMemo, useRef, useState } from 'react'
import type { Question } from '../types'
import { PART_MINUTES, PART_NAMES, SECTION_NAMES, secKey } from '../types'
import { logDay, update, useStore } from '../store'
import { level, mockScore } from '../score'
import { stop } from '../tts'
import QuestionView from '../components/QuestionView'

type Phase = { kind: 'pick' } | { kind: 'intro'; part: number } | { kind: 'run'; part: number } | { kind: 'result'; ts: number }

export default function Mock({ questions }: { questions: Question[] }) {
  const st = useStore()
  const mocks = useMemo(() => {
    const m = new Map<string, Question[]>()
    for (const q of questions) if (q.mock) m.set(q.mock, [...(m.get(q.mock) ?? []), q])
    return [...m.entries()].sort()
  }, [questions])
  const [mock, setMock] = useState<string>('')
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [answers, setAnswersState] = useState<Record<string, number>>({})
  // ref mirror so the timer callback (a stale closure) still grades the latest answers
  const answersRef = useRef<Record<string, number>>({})
  const setAnswers = (fn: Record<string, number> | ((a: Record<string, number>) => Record<string, number>)) => {
    answersRef.current = typeof fn === 'function' ? fn(answersRef.current) : fn
    setAnswersState(answersRef.current)
  }
  const [idx, setIdx] = useState(0)
  const [left, setLeft] = useState(0)
  const startTs = useRef(0)

  const items = useMemo(() => (mocks.find(m => m[0] === mock)?.[1] ?? [])
    .slice().sort((a, b) => a.part - b.part || a.section - b.section || a.id.localeCompare(b.id)), [mocks, mock])
  const partItems = (p: number) => items.filter(q => q.part === p)

  // timer
  useEffect(() => {
    if (phase.kind !== 'run') return
    const t = setInterval(() => setLeft(l => {
      if (l <= 1) { clearInterval(t); endPart(phase.part); return 0 }
      return l - 1
    }), 1000)
    return () => clearInterval(t)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (p: number) => { setIdx(0); setLeft(PART_MINUTES[p] * 60); setPhase({ kind: 'run', part: p }) }
  function endPart(p: number) {
    stop()
    const next = [1, 2, 3].find(n => n > p && partItems(n).length)
    if (next) setPhase({ kind: 'intro', part: next })
    else finish()
  }
  function finish() {
    const now = Date.now()
    const graded = items.map(q => ({ q, correct: answersRef.current[q.id] === q.answer }))
    const bySection: Record<string, [number, number]> = {}
    for (const g of graded) {
      const k = secKey(g.q); const v = bySection[k] ?? [0, 0]
      v[0] += g.correct ? 1 : 0; v[1]++; bySection[k] = v
    }
    const score = mockScore(graded.map(g => ({ correct: g.correct, difficulty: g.q.difficulty })))
    const minutes = (now - startTs.current) / 60000
    update(s => {
      for (const g of graded) s.attempts.push({ qid: g.q.id, sec: secKey(g.q), correct: g.correct, difficulty: g.q.difficulty, ts: now, mode: 'mock', ms: 0 })
      s.mocks.push({ mock, ts: now, score, correct: graded.filter(g => g.correct).length, total: graded.length, bySection, minutes })
      logDay(s, { questions: graded.length, correct: graded.filter(g => g.correct).length, minutes })
    })
    setPhase({ kind: 'result', ts: now })
  }

  if (!mocks.length) return <div className="card"><h2>Mock exam</h2><p>No mock packs loaded yet. Packs with a <code>"mock"</code> letter appear here.</p></div>

  if (phase.kind === 'pick') return (
    <div className="card">
      <h2>Full mock exam</h2>
      <p>Mirrors the real BJT: Part 1 聴解 45 min → Part 2 聴読解 30 min → Part 3 読解 30 min. Audio plays <b>once</b>; Part 1 choices are <b>spoken only</b>. No feedback until the end.</p>
      <p className="muted">Use headphones, sit at a desk, and don't pause. Do one every 1–2 weeks; drill in between.</p>
      <div className="mock-list">
        {mocks.map(([m, qs]) => {
          const past = st.mocks.filter(r => r.mock === m)
          return (
            <div key={m} className="mock-item">
              <div><b>Mock {m}</b> <span className="muted">· {qs.length} questions</span>
                {past.length > 0 && <div className="small muted">Last: {past[past.length - 1].score} ({level(past[past.length - 1].score)}) · taken {past.length}×</div>}
              </div>
              <button className="btn primary" onClick={() => {
                setMock(m); setAnswers({}); startTs.current = Date.now()
                setPhase({ kind: 'intro', part: Math.min(...qs.map(q => q.part)) })
              }}>{past.length ? 'Retake' : 'Start'}</button>
            </div>
          )
        })}
      </div>
      <p className="small muted">Retakes over-estimate your level (you remember answers). Prefer a fresh mock when available.</p>
    </div>
  )

  if (phase.kind === 'intro') {
    const p = phase.part
    return (
      <div className="card center">
        <h2>第{p}部 {PART_NAMES[p]}</h2>
        <p>{partItems(p).length} questions · {PART_MINUTES[p]} minutes</p>
        {p < 3 && <p className="muted">Each question's audio starts automatically and plays once. Answer, then move on.</p>}
        {p === 3 && <p className="muted">You can move freely between questions in this part.</p>}
        <button className="btn primary" onClick={() => begin(p)}>Begin part {p}</button>
      </div>
    )
  }

  if (phase.kind === 'run') {
    const list = partItems(phase.part)
    const q = list[idx]
    const listening = phase.part < 3
    const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0')
    return (
      <div className="exam">
        <div className="exam-bar">
          <span>第{phase.part}部 · {idx + 1}/{list.length}</span>
          <span className={`timer ${left < 300 ? 'low' : ''}`}>残り {mm}:{ss}</span>
          <button className="link small" onClick={() => { if (confirm('End this part now? Unanswered questions count as wrong.')) endPart(phase.part) }}>End part</button>
        </div>
        {!listening && (
          <div className="palette">
            {list.map((x, i) => <button key={x.id} className={`${i === idx ? 'cur' : ''} ${answers[x.id] !== undefined ? 'done' : ''}`} onClick={() => setIdx(i)}>{i + 1}</button>)}
          </div>
        )}
        <div className="card">
          <QuestionView key={q.id} q={q} mode="mock" autoPlayOnce={listening} chosen={answers[q.id] ?? null}
            onAnswer={c => setAnswers(a => ({ ...a, [q.id]: c }))} />
          <div className="row end">
            {!listening && idx > 0 && <button className="btn" onClick={() => setIdx(idx - 1)}>← Prev</button>}
            {idx < list.length - 1
              ? <button className="btn primary" onClick={() => { stop(); setIdx(idx + 1) }}>{listening && answers[q.id] === undefined ? 'Skip →' : 'Next →'}</button>
              : <button className="btn primary" onClick={() => endPart(phase.part)}>Finish part</button>}
          </div>
        </div>
      </div>
    )
  }

  // result
  const r = st.mocks.find(m => m.ts === phase.ts)!
  return (
    <div>
      <div className="card center">
        <h2>Mock {mock} result</h2>
        <p className="hero-num">{r.score}<span className="muted small"> / 800</span></p>
        <p><span className="pill">{level(r.score)}</span> {r.correct}/{r.total} correct · {Math.round(r.minutes)} min</p>
        <p className="small muted">Estimate only — the real BJT uses IRT scaling. Target: {st.settings.target}+ (J1+).</p>
      </div>
      <div className="card">
        <h3>By section</h3>
        <table className="data">
          <thead><tr><th>Section</th><th>Correct</th><th>%</th></tr></thead>
          <tbody>{Object.entries(r.bySection).sort().map(([k, [c, n]]) =>
            <tr key={k}><th>{k} {SECTION_NAMES[k]}</th><td>{c}/{n}</td><td>{Math.round((c / n) * 100)}%</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <h3>Review</h3>
        {items.map((q, i) => {
          const ok = answers[q.id] === q.answer
          return (
            <details key={q.id} className={`review ${ok ? 'ok' : 'ng'}`}>
              <summary>{ok ? '✓' : '✗'} {i + 1}. {SECTION_NAMES[secKey(q)]} — {q.prompt ?? q.audio?.question ?? ''}</summary>
              <ol className="review-choices">{q.choices.map((c, j) => <li key={j} className={j === q.answer ? 'right' : answers[q.id] === j ? 'wrong' : ''}>{c}</li>)}</ol>
              <p>{q.explanation}</p>
              {q.audio && <ul className="transcript">{q.audio.lines.map((l, j) => <li key={j}><b>{q.audio!.speakers[l.spk]?.role ?? l.spk}：</b>{l.text}</li>)}</ul>}
            </details>
          )
        })}
        <button className="btn" onClick={() => setPhase({ kind: 'pick' })}>Back to mocks</button>
      </div>
    </div>
  )
}
