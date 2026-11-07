import { useMemo, useRef, useState } from 'react'
import type { Question } from '../types'
import { SECTION_NAMES, secKey } from '../types'
import { useStore } from '../store'
import { recordAttempt } from '../record'
import { sectionAccuracy } from '../score'
import QuestionView from '../components/QuestionView'

export interface PracticePreset { sec?: string; source?: 'all' | 'official' | 'original'; order?: 'smart' | 'random' | 'wrong'; count?: number }

export default function Practice({ questions, preset }: { questions: Question[]; preset?: PracticePreset }) {
  const st = useStore()
  const [sec, setSec] = useState(preset?.sec ?? 'all')
  const [source, setSource] = useState(preset?.source ?? 'all')
  const [order, setOrder] = useState(preset?.order ?? 'smart')
  const [count, setCount] = useState(preset?.count ?? 10)
  const [session, setSession] = useState<Question[] | null>(null)
  const [i, setI] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const t0 = useRef(Date.now())

  const pool = useMemo(() => questions.filter(q =>
    (sec === 'all' || (sec.length === 1 ? String(q.part) === sec : secKey(q) === sec)) &&
    (source === 'all' || q.source === source)), [questions, sec, source])

  const stats = useMemo(() => {
    const seen = new Map<string, { n: number; wrong: number; last: number }>()
    for (const a of st.attempts) {
      const s = seen.get(a.qid) ?? { n: 0, wrong: 0, last: 0 }
      s.n++; if (!a.correct) s.wrong++; s.last = a.correct ? s.last : a.ts
      seen.set(a.qid, s)
    }
    return seen
  }, [st.attempts])

  const start = () => {
    let list = [...pool]
    const acc = sectionAccuracy(st.attempts)
    const rnd = () => Math.random()
    if (order === 'wrong') list = list.filter(q => (stats.get(q.id)?.wrong ?? 0) > 0)
    list.sort((a, b) => {
      if (order === 'random') return rnd() - 0.5
      // smart: unseen first, then previously-wrong, then weak sections; random tiebreak
      const sa = stats.get(a.id), sb = stats.get(b.id)
      const ka = (sa ? 2 : 0) - (sa?.wrong ? 1 : 0) + (acc[secKey(a)]?.acc ?? 0)
      const kb = (sb ? 2 : 0) - (sb?.wrong ? 1 : 0) + (acc[secKey(b)]?.acc ?? 0)
      return ka - kb || rnd() - 0.5
    })
    // keep exam order inside the session: part → section
    const chosen = list.slice(0, count).sort((a, b) => a.part - b.part || a.section - b.section)
    setSession(chosen); setI(0); setResults([]); t0.current = Date.now()
  }

  if (session) {
    if (!session.length) return <div className="card"><p>No questions match. <button className="link" onClick={() => setSession(null)}>Back</button></p></div>
    if (i >= session.length) {
      const ok = results.filter(Boolean).length
      return (
        <div className="card center">
          <h2>Session done</h2>
          <p className="hero-num">{ok}/{session.length}</p>
          <p className="muted">{Math.round((ok / session.length) * 100)}% correct</p>
          <div className="row center"><button className="btn primary" onClick={start}>Another {count}</button><button className="btn" onClick={() => setSession(null)}>Change settings</button></div>
        </div>
      )
    }
    const q = session[i]
    const done = results.length > i
    return (
      <div>
        <div className="progress-line"><div style={{ width: `${(i / session.length) * 100}%` }} /></div>
        <div className="card">
          <QuestionView key={q.id} q={q} mode="practice" index={`${i + 1}/${session.length}`}
            onAnswer={(_, correct) => {
              recordAttempt(q, correct, 'practice', Date.now() - t0.current)
              setResults(r => [...r, correct])
            }} />
          <div className="row end">
            <button className="btn" onClick={() => setSession(null)}>End</button>
            <button className="btn primary" disabled={!done} onClick={() => { setI(i + 1); t0.current = Date.now() }}>Next →</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Practice drill</h2>
      <p className="muted">Instant feedback, replayable audio and transcripts. Use this to learn; use Mock exam to measure.</p>
      <div className="form">
        <label>Section
          <select value={sec} onChange={e => setSec(e.target.value)}>
            <option value="all">All sections</option>
            {[1, 2, 3].map(p => <option key={p} value={String(p)}>第{p}部 (all)</option>)}
            {Object.entries(SECTION_NAMES).map(([k, n]) => <option key={k} value={k}>{k} {n}</option>)}
          </select>
        </label>
        <label>Source
          <select value={source} onChange={e => setSource(e.target.value as typeof source)}>
            <option value="all">All</option><option value="original">Original</option><option value="official">Official samples</option>
          </select>
        </label>
        <label>Order
          <select value={order} onChange={e => setOrder(e.target.value as typeof order)}>
            <option value="smart">Smart (unseen & weak first)</option><option value="wrong">Only ones I got wrong</option><option value="random">Random</option>
          </select>
        </label>
        <label>Questions
          <select value={count} onChange={e => setCount(+e.target.value)}>{[5, 10, 20, 40].map(n => <option key={n}>{n}</option>)}</select>
        </label>
      </div>
      <p className="muted small">{pool.length} questions available</p>
      <button className="btn primary" onClick={start} disabled={!pool.length}>Start</button>
    </div>
  )
}
