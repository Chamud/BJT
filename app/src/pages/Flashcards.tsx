import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Card, Deck } from '../types'
import { logDay, update, useStore } from '../store'
import { previewInterval, schedule, type Grade } from '../srs'
import { buildQueue, speakCard } from '../queue'

const DECKS: { id: Deck | 'all'; name: string }[] = [
  { id: 'all', name: 'All decks' }, { id: 'vocab', name: 'Business vocab' }, { id: 'kanji', name: 'N1 kanji' },
  { id: 'keigo', name: 'Keigo' }, { id: 'phrase', name: 'Set phrases' }, { id: 'grammar', name: 'N1 grammar' },
]

export default function Flashcards({ cards }: { cards: Card[] }) {
  const st = useStore()
  const [deck, setDeck] = useState<Deck | 'all'>('all')
  const [flipped, setFlipped] = useState(false)
  const [current, setCurrent] = useState<Card | null>(null)
  const [done, setDone] = useState(0)

  const queue = useMemo(() => buildQueue(cards, st, deck), [cards, deck, st])

  useEffect(() => {
    if (!current || !queue.all.find(c => c.id === current.id)) { setCurrent(queue.all[0] ?? null); setFlipped(false) }
  }, [queue, current])

  const grade = useCallback((g: Grade) => {
    if (!current) return
    const isNew = !st.cards[current.id]
    update(s => {
      s.cards[current.id] = schedule(s.cards[current.id], g)
      logDay(s, { cards: 1, newCards: isNew ? 1 : 0, minutes: 0.25 })
    })
    setDone(d => d + 1)
    setFlipped(false)
    setCurrent(null)
  }, [current, st.cards])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); setFlipped(f => !f) }
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) grade((+e.key - 1) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, grade])

  const counts = useMemo(() => {
    const learned = cards.filter(c => st.cards[c.id]).length
    const mature = cards.filter(c => (st.cards[c.id]?.interval ?? 0) >= 21).length
    return { learned, mature, total: cards.length }
  }, [cards, st.cards])



  return (
    <div>
      <div className="card row between wrap">
        <select value={deck} onChange={e => { setDeck(e.target.value as Deck | 'all'); setCurrent(null) }}>
          {DECKS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="stats-inline">
          <span><b>{queue.due.length}</b> due</span>
          <span><b>{queue.fresh.length}</b> new today</span>
          <span><b>{done}</b> done this session</span>
          <span className="muted">{counts.learned}/{counts.total} started · {counts.mature} mature</span>
        </div>
      </div>

      {!current ? (
        <div className="card center">
          <h2>🎉 All caught up</h2>
          <p className="muted">No cards due in this deck. New-card limit: {st.settings.newCardsPerDay}/day (change in Settings).</p>
        </div>
      ) : (
        <div className="card flash" onClick={() => !flipped && setFlipped(true)}>
          <div className="flash-meta">
            <span className="pill subtle">{DECKS.find(d => d.id === current.deck)?.name}</span>
            <span className="pill subtle">{current.level}</span>
            {!st.cards[current.id] && <span className="pill">NEW</span>}
          </div>
          <div className="flash-front" lang="ja">{current.front}</div>
          {flipped ? (
            <div className="flash-back">
              {current.reading && <div className="reading" lang="ja">{current.reading}</div>}
              <div className="meaning">{current.meaning}</div>
              {current.note && <div className="note" lang="ja">{current.note}</div>}
              <div className="example">
                <div lang="ja">{current.example} <button className="link small" onClick={e => { e.stopPropagation(); speakCard(current, st.settings.speechRate) }}>🔊</button></div>
                <div className="muted">{current.exampleEn}</div>
              </div>
              <div className="grades">
                {(['Again', 'Hard', 'Good', 'Easy'] as const).map((n, g) => (
                  <button key={n} className={`btn grade g${g}`} onClick={e => { e.stopPropagation(); grade(g as Grade) }}>
                    <span>{n}</span><small>{previewInterval(st.cards[current.id], g as Grade)} · {g + 1}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : <p className="muted center">Recall the reading & meaning — click or press Space</p>}
        </div>
      )}
    </div>
  )
}
