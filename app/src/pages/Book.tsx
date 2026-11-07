import { useEffect, useMemo, useRef, useState } from 'react'
import { SECTION_NAMES } from '../types'
import { logDay, update, useStore } from '../store'
import { level, mockScore } from '../score'
import SpeedButtons from '../components/SpeedButtons'

/** Private book mode: your purchased 『BJT公式模擬テスト&ガイド』 rendered by tools/book_import.py. */
interface BookData {
  title: string
  pageCount: number
  sections: { part: number; section: number; testPage: number; explPage: number; answers: number[] }[]
  ranges: Record<'test' | 'guide' | 'answers', [number, number]>
  links: Record<string, number>
  partMinutes: Record<string, number>
  audio: string[]
  audioChapters?: { file: string; chapters: Chapter[] }
}
type View = 'test' | 'review' | 'answers' | 'guide'
const SHEET_KEY = 'bjt-book-sheet-v1'
const pageSrc = (i: number) => `/private/book/pages/${String(i).padStart(3, '0')}.jpg`
const qid = (p: number, s: number, n: number) => `BOOK-${p}-${s}-${String(n).padStart(2, '0')}`

function loadSheet(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SHEET_KEY) ?? '{}') } catch { return {} }
}

export default function Book() {
  const st = useStore()
  const [book, setBook] = useState<BookData | null | 'missing'>(null)
  const [view, setView] = useState<View>('test')
  const [page, setPage] = useState<Record<View, number>>({ test: 14, review: 0, answers: 99, guide: 68 })
  const [sheet, setSheet] = useState<Record<string, number>>(loadSheet)
  const [graded, setGraded] = useState<number | null>(null) // ts of result
  const [timer, setTimer] = useState<{ part: number; left: number } | null>(null)
  const [seek, setSeek] = useState<{ t: number; n: number } | undefined>()

  useEffect(() => {
    fetch('/private/book/book.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : 'missing')).then(setBook).catch(() => setBook('missing'))
  }, [])
  useEffect(() => { try { localStorage.setItem(SHEET_KEY, JSON.stringify(sheet)) } catch { /* ignore */ } }, [sheet])
  useEffect(() => {
    if (!timer) return
    const t = setInterval(() => setTimer(x => (x && x.left > 0 ? { ...x, left: x.left - 1 } : x)), 1000)
    return () => clearInterval(t)
  }, [timer?.part]) // eslint-disable-line react-hooks/exhaustive-deps

  if (book === null) return <p className="muted">Loading book…</p>
  if (book === 'missing') return (
    <div className="card">
      <h2>Book mode</h2>
      <p>Import your copy of 『BJT公式模擬テスト&ガイド』 first:</p>
      <pre className="code">python tools/book_import.py "docs/BJT公式模擬テスト&ガイド.pdf"</pre>
      <p className="muted small">Pages are saved to <code>content/private/book/</code>, which stays on this PC and is stripped from production builds.</p>
    </div>
  )

  const goto = (v: View, p?: number) => { setView(v); if (p !== undefined) setPage(x => ({ ...x, [v]: p })) }
  const answeredCount = Object.keys(sheet).length

  const grade = () => {
    setGraded(null)
    const now = Date.now()
    // Parts with no answers at all are skipped (e.g. grading listening before doing reading),
    // so an unfinished part can't drag the score down. Unanswered items inside a started part count as wrong.
    const started = new Set(book.sections.filter(s => s.answers.some((_, i) => sheet[qid(s.part, s.section, i + 1)] !== undefined)).map(s => s.part))
    const items = book.sections.filter(s => started.has(s.part)).flatMap(s => s.answers.map((a, i) => ({ id: qid(s.part, s.section, i + 1), sec: `${s.part}-${s.section}`, correct: sheet[qid(s.part, s.section, i + 1)] === a })))
    if (!items.length) return
    const bySection: Record<string, [number, number]> = {}
    for (const it of items) { const v = bySection[it.sec] ?? [0, 0]; v[0] += it.correct ? 1 : 0; v[1]++; bySection[it.sec] = v }
    const correct = items.filter(i => i.correct).length
    const score = mockScore(items.map(i => ({ correct: i.correct, difficulty: 2 })))
    update(s => {
      for (const it of items) s.attempts.push({ qid: it.id, sec: it.sec, correct: it.correct, difficulty: 2, ts: now, mode: 'mock', ms: 0 })
      s.mocks.push({ mock: 'Book', ts: now, score, correct, total: items.length, bySection, minutes: 105 })
      logDay(s, { questions: items.length, correct, minutes: 0 })
    })
    setGraded(now); setView('review')
  }

  const result = graded ? st.mocks.find(m => m.ts === graded) : [...st.mocks].reverse().find(m => m.mock === 'Book')

  return (
    <div className="book">
      <div className="card row between wrap" style={{ marginTop: 0 }}>
        <div className="tabs">
          {([['test', '模擬テスト Test'], ['review', 'Results'], ['answers', '解答・解説 Explanations'], ['guide', 'Guide']] as const).map(([v, n]) =>
            <button key={v} className={`tab ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{n}</button>)}
        </div>
        {timer && <span className={`timer ${timer.left < 300 ? 'low' : ''}`}>第{timer.part}部 残り {String(Math.floor(timer.left / 60)).padStart(2, '0')}:{String(timer.left % 60).padStart(2, '0')}</span>}
      </div>

      {view === 'test' && (
        <div className="book-grid">
          <div>
            <SectionJumps book={book} onJump={(p, s) => {
              setPage(x => ({ ...x, test: p }))
              const c = book.audioChapters?.chapters.find(c => c.part === s.part && c.section === s.section && c.q === 0)
              if (c) setSeek(x => ({ t: c.t, n: (x?.n ?? 0) + 1 }))
            }} />
            <PageViewer range={book.ranges.test} page={page.test} setPage={p => setPage(x => ({ ...x, test: p }))} />
          </div>
          <aside className="sheet-col">
            <AudioPanel files={book.audio} chapters={book.audioChapters} seek={seek} />
            <div className="card">
              <div className="row between" style={{ marginTop: 0 }}>
                <h3 style={{ margin: 0 }}>解答用紙</h3>
                <span className="small muted">{answeredCount}/80</span>
              </div>
              <div className="row wrap small">
                {[1, 2, 3].map(p => <button key={p} className="btn small-btn" onClick={() => setTimer({ part: p, left: book.partMinutes[p] * 60 })}>⏱ Part {p}</button>)}
                {timer && <button className="link small" onClick={() => setTimer(null)}>stop timer</button>}
              </div>
              {book.sections.map(s => (
                <div key={`${s.part}-${s.section}`} className="sheet-sec">
                  <div className="small"><b>第{s.part}部 セクション{s.section}</b> <span className="muted">{SECTION_NAMES[`${s.part}-${s.section}`]}</span></div>
                  {s.answers.map((_, i) => {
                    const id = qid(s.part, s.section, i + 1)
                    return (
                      <div key={id} className="bubble-row">
                        <span className="qn">{i + 1}</span>
                        {[1, 2, 3, 4].map(c => (
                          <button key={c} className={`bubble ${sheet[id] === c ? 'on' : ''}`}
                            onClick={() => setSheet(x => { const y = { ...x }; if (y[id] === c) delete y[id]; else y[id] = c; return y })}>{c}</button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
              <div className="row">
                <button className="btn primary" onClick={() => { if (answeredCount === 80 || confirm(`${80 - answeredCount} unanswered — grade anyway?`)) grade() }}>Grade</button>
                <button className="btn" onClick={() => { if (confirm('Clear the answer sheet?')) setSheet({}) }}>Clear</button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {view === 'review' && (
        !result ? <LiveCheck book={book} sheet={sheet} /> : (
          <>
            <LiveCheck book={book} sheet={sheet} />
            <div className="card center">
              <h2>Book mock result</h2>
              <p className="hero-num">{result.correct}<span className="muted small"> / {result.total}</span></p>
              {result.total < 80 && <p className="small muted">Partial result — only the parts you answered ({result.total} questions) are counted.</p>}
              <p>Rough scaled estimate <b>{result.score}</b> <span className="pill">{level(result.score)}</span></p>
              <p className="small muted">The book's own conversion table is on <a onClick={() => goto('answers', book.links.levels)}>能力レベルの判定</a> — use that as the official reference.</p>
              <button className="link small" onClick={() => {
                if (!confirm('Delete this graded result from your history? (Your answer sheet is kept.)')) return
                const ts = result.ts
                update(s => { s.mocks = s.mocks.filter(m => m.ts !== ts); s.attempts = s.attempts.filter(a => !(a.ts === ts && a.qid.startsWith('BOOK-'))) })
                setGraded(null)
              }}>Delete this result</button>
            </div>
            <div className="card">
              {book.sections.map(s => {
                const k = `${s.part}-${s.section}`
                const [c, n] = result.bySection[k] ?? [0, s.answers.length]
                return (
                  <div key={k} className="review-sec">
                    <div className="row between" style={{ marginTop: 0 }}>
                      <b>第{s.part}部 セクション{s.section} {SECTION_NAMES[k]} — {c}/{n}</b>
                      <button className="btn" onClick={() => goto('answers', s.explPage)}>解説 →</button>
                    </div>
                    <div className="marks">
                      {s.answers.map((a, i) => {
                        const mine = sheet[qid(s.part, s.section, i + 1)]
                        return <span key={i} className={`mark ${mine === a ? 'ok' : 'ng'}`} title={`yours ${mine ?? '–'} · answer ${a}`}>{i + 1}<small>{mine ?? '–'}/{a}</small></span>
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      )}

      {view === 'answers' && (
        <>
          <SectionJumps book={book} explanations onJump={p => setPage(x => ({ ...x, answers: p }))} />
          <PageViewer range={book.ranges.answers} page={page.answers} setPage={p => setPage(x => ({ ...x, answers: p }))} />
        </>
      )}
      {view === 'guide' && <PageViewer range={book.ranges.guide} page={page.guide} setPage={p => setPage(x => ({ ...x, guide: p }))} />}
    </div>
  )
}

function SectionJumps({ book, explanations, onJump }: { book: BookData; explanations?: boolean; onJump: (p: number, s: { part: number; section: number }) => void }) {
  return (
    <div className="jumps">
      {explanations && <button className="btn small-btn" onClick={() => onJump(book.links.answerKey, { part: 0, section: 0 })}>正答一覧</button>}
      {book.sections.map(s => (
        <button key={`${s.part}-${s.section}`} className="btn small-btn" onClick={() => onJump(explanations ? s.explPage : s.testPage, s)}>{s.part}-{s.section}</button>
      ))}
      {explanations && <button className="btn small-btn" onClick={() => onJump(book.links.advice, { part: 0, section: 0 })}>アドバイス</button>}
    </div>
  )
}

// Zoom: 'page' = whole page visible (fits both width and height, the default);
// a number = % of the viewer width (100 = fit width), scroll to read.
type Zoom = 'page' | number
const ZOOMS = [100, 125, 150, 175, 200, 250, 300]
const ZOOM_KEY = 'bjt-book-zoom-v2'

function PageViewer({ range, page, setPage }: { range: [number, number]; page: number; setPage: (p: number) => void }) {
  const [zoom, setZoomState] = useState<Zoom>(() => {
    try { const v = localStorage.getItem(ZOOM_KEY); return v && v !== 'page' && +v ? +v : 'page' } catch { return 'page' }
  })
  const setZoom = (z: Zoom) => { setZoomState(z); try { localStorage.setItem(ZOOM_KEY, String(z)) } catch { /* ignore */ } }
  const step = (d: number) => {
    if (zoom === 'page') { if (d > 0) setZoom(ZOOMS[0]); return }
    const i = ZOOMS.indexOf(zoom) + d
    setZoom(i < 0 ? 'page' : ZOOMS[Math.min(i, ZOOMS.length - 1)])
  }
  const wrap = useRef<HTMLDivElement>(null)
  const p = Math.min(Math.max(page, range[0]), range[1])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowRight') setPage(Math.min(p + 1, range[1]))
      if (e.key === 'ArrowLeft') setPage(Math.max(p - 1, range[0]))
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [p, range, setPage])
  // Ctrl + mouse wheel zooms the page instead of the whole window
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const w = (e: WheelEvent) => { if (e.ctrlKey) { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1) } }
    el.addEventListener('wheel', w, { passive: false }); return () => el.removeEventListener('wheel', w)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { wrap.current?.scrollTo({ top: 0 }) }, [p])
  // size the viewer to exactly the space left below it in the window, so "Fit page" shows the whole page
  const [height, setHeight] = useState(600)
  useEffect(() => {
    const fit = () => {
      const el = wrap.current; if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(360, window.innerHeight - top - 20))
    }
    fit(); const t = setTimeout(fit, 100)
    window.addEventListener('resize', fit); return () => { clearTimeout(t); window.removeEventListener('resize', fit) }
  }, [])
  // preload neighbours for instant flipping
  useEffect(() => { [p + 1, p + 2, p - 1].forEach(i => { if (i >= range[0] && i <= range[1]) new Image().src = pageSrc(i) }) }, [p, range])
  return (
    <div className="card viewer">
      <div className="row between wrap" style={{ marginTop: 0 }}>
        <button className="btn" disabled={p <= range[0]} onClick={() => setPage(p - 1)}>← Prev</button>
        <span className="zoombar">
          <button className={`btn small-btn ${zoom === 'page' ? 'on' : ''}`} onClick={() => setZoom('page')} title="Whole page visible">Fit page</button>
          <button className={`btn small-btn ${zoom === 100 ? 'on' : ''}`} onClick={() => setZoom(100)} title="Fill the width, scroll down">Fit width</button>
          <button className="btn small-btn" onClick={() => step(-1)} disabled={zoom === 'page'}>−</button>
          <span className="zoom-label small">{zoom === 'page' ? 'page' : `${zoom}%`}</span>
          <button className="btn small-btn" onClick={() => step(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]}>＋</button>
          <span className="small muted">p.{p + 1} · ← → · Ctrl+wheel</span>
        </span>
        <button className="btn" disabled={p >= range[1]} onClick={() => setPage(p + 1)}>Next →</button>
      </div>
      <div ref={wrap} className={`page-wrap ${zoom === 'page' ? 'fit-page' : ''}`} style={{ height }}>
        <img src={pageSrc(p)} alt={`page ${p + 1}`} style={zoom === 'page' ? undefined : { width: `${zoom}%` }} />
      </div>
    </div>
  )
}

type Chapter = { label: string; part: number; section: number; q: number; t: number }

/** Single-file book audio with chapter markers (tools/book_audio_map.py). seek = {t, n} jumps when n changes. */
function ChapterPlayer({ file, chapters, seek }: { file: string; chapters: Chapter[]; seek?: { t: number; n: number } }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [now, setNow] = useState(0)
  const rate = useStore().settings.speechRate
  useEffect(() => { if (ref.current) { ref.current.playbackRate = rate; ref.current.preservesPitch = true } }, [rate])
  useEffect(() => {
    if (seek && ref.current) { ref.current.currentTime = seek.t; ref.current.play().catch(() => {}) }
  }, [seek?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = [...chapters].reverse().find(c => c.t <= now + 0.5)
  const go = (t: number) => { if (ref.current) { ref.current.currentTime = t; ref.current.play().catch(() => {}) } }
  const idx = cur ? chapters.indexOf(cur) : -1
  return (
    <div className="card">
      <b>🎧 {cur?.label ?? 'Book audio'}</b>
      <audio ref={ref} src={`/private/book/audio/${encodeURIComponent(file)}`} controls preload="metadata"
        onTimeUpdate={e => setNow((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={e => { (e.target as HTMLAudioElement).playbackRate = rate }} style={{ width: '100%', marginTop: 8 }} />
      <div style={{ marginTop: 6 }}><SpeedButtons /></div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn small-btn" disabled={idx <= 0} onClick={() => go(chapters[idx - 1].t)}>⏮</button>
        <select value={idx} onChange={e => go(chapters[+e.target.value].t)} style={{ flex: 1, minWidth: 0 }}>
          {idx < 0 && <option value={-1}>—</option>}
          {chapters.map((c, n) => <option key={n} value={n}>{c.label}</option>)}
        </select>
        <button className="btn small-btn" disabled={idx >= chapters.length - 1} onClick={() => go(chapters[idx + 1].t)}>⏭</button>
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>Exam rule: play each part straight through, don't pause or rewind. Use the chapters for review.</p>
    </div>
  )
}

function AudioPanel({ files, chapters, seek }: { files: string[]; chapters?: { file: string; chapters: Chapter[] }; seek?: { t: number; n: number } }) {
  const [i, setI] = useState(0)
  const ref = useRef<HTMLAudioElement>(null)
  const list = useMemo(() => files.map(f => ({ f, name: f.replace(/\.[^.]+$/, '') })), [files])
  if (chapters && files.includes(chapters.file)) return <ChapterPlayer file={chapters.file} chapters={chapters.chapters} seek={seek} />
  if (!files.length) return (
    <div className="card small">
      <b>🎧 Book audio not added yet</b>
      <ol>
        <li>Open <a href="https://audiobook.jp/exchange/kanken" target="_blank" rel="noreferrer">audiobook.jp/exchange/kanken</a> and enter the serial code from PDF page 95.</li>
        <li>Download the MP3s into <code>content/private/book/audio/</code></li>
        <li>Run <code>python tools/book_import.py --audio-only</code> and refresh.</li>
      </ol>
    </div>
  )
  return (
    <div className="card">
      <b>🎧 Track {i + 1}/{list.length}</b> <span className="small muted">{list[i].name}</span>
      <audio ref={ref} key={list[i].f} src={`/private/book/audio/${encodeURIComponent(list[i].f)}`} controls autoPlay={i > 0}
        onEnded={() => i < list.length - 1 && setI(i + 1)} style={{ width: '100%', marginTop: 8 }} />
      <select value={i} onChange={e => setI(+e.target.value)} style={{ width: '100%', marginTop: 6 }}>
        {list.map((t, n) => <option key={t.f} value={n}>{n + 1}. {t.name}</option>)}
      </select>
    </div>
  )
}

/** Scores whatever is filled in so far (e.g. listening only) without recording a graded attempt. */
function LiveCheck({ book, sheet }: { book: BookData; sheet: Record<string, number> }) {
  const rows = book.sections.map(s => {
    const marks = s.answers.map((a, i) => sheet[qid(s.part, s.section, i + 1)] === undefined ? null : sheet[qid(s.part, s.section, i + 1)] === a)
    return { s, answered: marks.filter(m => m !== null).length, correct: marks.filter(m => m === true).length, total: s.answers.length }
  })
  const part = (p: number) => rows.filter(r => r.s.part === p).reduce((t, r) => ({ c: t.c + r.correct, a: t.a + r.answered, n: t.n + r.total }), { c: 0, a: 0, n: 0 })
  return (
    <div className="card">
      <h3>Live check <span className="small muted">— scores what you've filled in so far; nothing is recorded until you press Grade</span></h3>
      <table className="data">
        <thead><tr><th>Section</th><th>Answered</th><th>Correct</th><th>%</th></tr></thead>
        <tbody>
          {rows.map(r => <tr key={`${r.s.part}-${r.s.section}`}><th>{r.s.part}-{r.s.section} {SECTION_NAMES[`${r.s.part}-${r.s.section}`]}</th>
            <td>{r.answered}/{r.total}</td><td>{r.correct}</td><td>{r.answered ? Math.round((r.correct / r.answered) * 100) + '%' : '–'}</td></tr>)}
          {[1, 2, 3].map(p => { const t = part(p); return <tr key={p}><th><b>第{p}部 total</b></th><td>{t.a}/{t.n}</td><td><b>{t.c}</b></td><td>{t.a ? Math.round((t.c / t.a) * 100) + '%' : '–'}</td></tr> })}
        </tbody>
      </table>
    </div>
  )
}
