import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../types'
import { inQuietHours, logDay, update, useStore } from '../store'
import { previewInterval, schedule, type Grade } from '../srs'
import { buildQueue, speakCard } from '../queue'

/** Bridge exposed by desktop/preload.js. Absent in a normal browser tab, where the widget still works (no pop-up). */
interface DesktopBridge {
  raise(): void
  lower(): void
  resize(height: number, width?: number): void
  openMain(hash?: string): void
  getPause(): Promise<number>
  setPause(until: number): void
  onPause(cb: (until: number) => void): void
}
declare global { interface Window { bjtDesktop?: DesktopBridge } }
const bridge = () => window.bjtDesktop

const H_COMPACT = 196
const H_OPEN = 470
const W_MIN = 380
/** tiles are ~130 px tall in the compact widget, so this keeps short words square */
const TILE_MIN = 130
const W_MAX = 900

/** "45 min", "1 h 20 min" */
function pauseLeft(ms: number) {
  const m = Math.max(1, Math.ceil(ms / 60000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
}
/** "14:30", or "tomorrow 04:00" */
function pauseEnd(until: number) {
  const d = new Date(until), t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? t : `tomorrow ${t}`
}

/** Font size and tile width so the whole word fits: shorter words are bigger; long phrases wrap to 2 lines. */
function tileSize(front: string) {
  const len = [...front].length
  const font = len <= 2 ? 34 : len === 3 ? 30 : len === 4 ? 26 : len <= 6 ? 22 : len <= 8 ? 19 : 17
  const lines = len > 8 ? 2 : 1
  const width = Math.min(Math.max(Math.ceil(len / lines) * font * 1.05 + 26, TILE_MIN), 280)
  return { font, width, lines }
}
const frontFont = (front: string) => { const len = [...front].length; return len <= 4 ? 40 : len <= 7 ? 32 : len <= 10 ? 26 : 22 }

/**
 * Desktop flashcard widget: shows a small set of cards (kanji side), click one to reveal and grade it.
 * Every `widgetMins` minutes a new set appears. If the set hasn't been touched, `widgetWarnSecs` seconds before the
 * end the desktop app raises the widget above all windows until you interact with it.
 */
export default function Widget({ cards }: { cards: Card[] }) {
  const st = useStore()
  const s = st.settings
  const interval = Math.min(60, Math.max(5, s.widgetMins || 10)) * 60000
  const warn = Math.max(10, s.widgetWarnSecs || 60) * 1000
  const queue = useMemo(() => buildQueue(cards, st), [cards, st])
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards])

  const [batch, setBatch] = useState<string[]>([])
  const [graded, setGraded] = useState<Record<string, Grade>>({})
  const [start, setStart] = useState(() => Date.now())
  const [touched, setTouched] = useState(false)
  const [raised, setRaised] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [pausedUntil, setPausedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [menu, setMenu] = useState(false)
  const queueRef = useRef(queue)
  queueRef.current = queue

  useEffect(() => { document.documentElement.classList.add('widget-mode') }, [])
  useEffect(() => {
    const b = bridge(); if (!b) return
    b.getPause().then(setPausedUntil)
    b.onPause(setPausedUntil)
  }, [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  // widen the window to fit the current words (the desktop app grows it toward the screen centre)
  const tilesWidth = useMemo(() => batch.reduce((t, id) => { const c = byId.get(id); return t + (c ? tileSize(c.front).width : TILE_MIN) }, 0)
    + 8 * Math.max(0, batch.length - 1) + 20 + 14, [batch, byId])
  const openWidth = open ? Math.min(Math.max(W_MIN, [...(byId.get(open)?.front ?? '')].length * frontFont(byId.get(open)?.front ?? '') + 90), 620) : 0
  const winWidth = Math.min(W_MAX, Math.max(W_MIN, open ? openWidth : tilesWidth))
  useEffect(() => { bridge()?.resize(open ? H_OPEN : H_COMPACT, winWidth) }, [open, winWidth])

  const lower = useCallback(() => { if (raised) { bridge()?.lower(); setRaised(false) } }, [raised])
  const newBatch = useCallback(() => {
    setBatch(queueRef.current.all.slice(0, Math.max(1, s.widgetBatch)).map(c => c.id))
    setGraded({}); setStart(Date.now()); setTouched(false); setOpen(null)
  }, [s.widgetBatch])

  const paused = pausedUntil > now
  const quiet = inQuietHours(s, new Date(now))
  const allDone = batch.length > 0 && batch.every(id => graded[id] !== undefined)
  const dayDone = queue.all.length === 0 && (batch.length === 0 || allDone)
  const remaining = start + interval - now

  // the scheduler: runs every second
  useEffect(() => {
    if (!batch.length) { if (queue.all.length) newBatch(); return }
    if (paused || quiet || dayDone) { lower(); return }
    if (!touched && !allDone && remaining <= warn && !raised) { bridge()?.raise(); setRaised(true) }
    if (remaining <= 0) {
      if (touched || allDone) { lower(); newBatch() }
      else setStart(Date.now()) // ignored: keep the same words, stay on top
    }
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps

  // Any press on the widget counts as "seen" and cancels the pop-up. Presses inside the pause menu or the
  // header buttons must NOT close the menu, or the option's click would never arrive.
  const interact = (e: React.MouseEvent) => {
    setTouched(true); lower()
    // close the pause menu on any press except its own options and the ⏸ toggle
    if (!(e.target as HTMLElement).closest('.w-menu-inline button, .w-pause-btn')) setMenu(false)
  }
  // clicking outside the widget (it loses focus) also closes the menu
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    window.addEventListener('blur', close); return () => window.removeEventListener('blur', close)
  }, [menu])

  const grade = (id: string, g: Grade) => {
    const isNew = !st.cards[id]
    update(x => { x.cards[id] = schedule(x.cards[id], g); logDay(x, { cards: 1, newCards: isNew ? 1 : 0, minutes: 0.25 }) })
    setGraded(m => ({ ...m, [id]: g }))
    const next = batch.find(b => b !== id && graded[b] === undefined)
    setOpen(next ?? null)
  }
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (['1', '2', '3', '4'].includes(e.key)) grade(open, (+e.key - 1) as Grade); if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const pause = (ms: number | 'tomorrow' | 0) => {
    let until = 0
    if (ms === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(4, 0, 0, 0); until = d.getTime() }
    else if (ms) until = Date.now() + ms
    setPausedUntil(until); bridge()?.setPause(until); setMenu(false)
  }

  const card = open ? byId.get(open) : undefined
  const left = queue.all.length

  return (
    <div key={raised ? `nag-${start}` : 'calm'} className={`widget ${raised ? 'nag' : ''} ${paused ? 'is-paused' : ''} ${menu ? 'menu-open' : ''}`} onMouseDown={interact}>
      <div className="w-head">
        <span className="w-title">BJT 単語</span>
        <span className="w-status" title={paused ? `Paused until ${pauseEnd(pausedUntil)} — no pop-ups until then` : undefined}>
          {paused ? <>⏸ <b>Paused</b> · {pauseLeft(pausedUntil - now)} left</>
            : quiet ? '🌙 quiet hours'
            : dayDone ? '完了' : allDone ? '✓ next set soon' : raised ? `あと${Math.max(1, Math.round(s.widgetWarnSecs / 60))}分！` : ''}
          {!dayDone && !paused && !menu && <span className="w-left">{quiet || allDone || raised ? ' · ' : ''}{left} left today</span>}
        </span>
        {paused && <button className="w-resume" onClick={() => pause(0)}>Resume</button>}
        {menu && !paused && (
          <span className="w-menu-inline">
            <button onClick={() => pause(30 * 60000)}>30 min</button>
            <button onClick={() => pause(60 * 60000)}>1 hour</button>
            <button onClick={() => pause('tomorrow')}>Tomorrow</button>
          </span>
        )}
        <span className="w-actions">
          {!paused && <button className="w-pause-btn" title="Pause" onClick={() => setMenu(m => !m)}>⏸</button>}
          <button title="Open full trainer" onClick={() => { const b = bridge(); if (b) b.openMain('today'); else window.open('/#today') }}>⤢</button>
        </span>
      </div>

      {dayDone ? (
        <div className="w-done">今日の分は完了 🎉<small>New cards return tomorrow.</small></div>
      ) : card ? (
        <div className="w-card">
          <button className="w-back" onClick={() => setOpen(null)}>←</button>
          <div className="w-front" lang="ja" style={{ fontSize: frontFont(card.front) }}>{card.front}</div>
          {card.reading && <div className="w-reading" lang="ja">{card.reading}</div>}
          <div className="w-meaning">{card.meaning}</div>
          {card.note && <div className="w-note" lang="ja">{card.note}</div>}
          <div className="w-example" lang="ja">{card.example} <button onClick={() => speakCard(card, s.speechRate)}>🔊</button></div>
          <div className="w-example-en">{card.exampleEn}</div>
          <div className="w-grades">
            {(['Again', 'Hard', 'Good', 'Easy'] as const).map((n, g) => (
              <button key={n} className={`g${g}`} onClick={() => grade(card.id, g as Grade)}>{n}<small>{previewInterval(st.cards[card.id], g as Grade)}</small></button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="w-tiles">
            {batch.map(id => {
              const c = byId.get(id); if (!c) return null
              const done = graded[id] !== undefined
              const t = tileSize(c.front)
              return (
                <button key={id} className={`w-tile ${done ? 'done' : ''}`} onClick={() => !done && setOpen(id)} lang="ja"
                  style={{ fontSize: t.font, flex: `1 0 ${t.width}px`, lineHeight: t.lines > 1 ? 1.25 : 1.1 }}>
                  {c.front}{done && <span className="w-check">✓</span>}
                </button>
              )
            })}
          </div>
          {allDone && left > 0 && <button className="w-more" onClick={newBatch}>More now →</button>}
        </>
      )}
    </div>
  )
}
