import { useEffect, useState } from 'react'
import { loadContent, type Content } from './content'
import Today from './pages/Today'
import Practice, { type PracticePreset } from './pages/Practice'
import Mock from './pages/Mock'
import Flashcards from './pages/Flashcards'
import Progress from './pages/Progress'
import Settings from './pages/Settings'
import Book from './pages/Book'
import Widget from './pages/Widget'
import { stop } from './tts'
import QuestionView from './components/QuestionView'

const TABS = [
  ['today', 'Today'], ['practice', 'Practice'], ['mock', 'Mock exam'], ['book', 'Book'],
  ['cards', 'Flashcards'], ['progress', 'Progress'], ['settings', 'Settings'],
] as const
type Tab = (typeof TABS)[number][0]

export default function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'today')
  const [preset, setPreset] = useState<PracticePreset | undefined>()
  const [presetKey, setPresetKey] = useState(0)

  useEffect(() => {
    loadContent().then(r => { setContent(r.content); setErrors(r.errors) }).catch(e => setErrors([String(e)]))
  }, [])
  useEffect(() => {
    const f = () => setTab((location.hash.slice(1) as Tab) || 'today')
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f)
  }, [])

  const go = (t: string, p?: PracticePreset) => {
    stop(); setPreset(p); setPresetKey(k => k + 1); location.hash = t; setTab(t as Tab)
  }

  // desktop flashcard widget (desktop/main.js loads /#widget in a small frameless window)
  if ((tab as string) === 'widget') return content ? <Widget cards={content.cards} /> : null

  return (
    <div className="app">
      <header>
        <div className="brand">BJT <span>Trainer</span></div>
        <nav>{TABS.map(([id, name]) => <a key={id} className={tab === id ? 'active' : ''} onClick={() => go(id)}>{name}</a>)}</nav>
      </header>
      <main className={tab === 'book' ? 'wide' : ''}>
        {errors.length > 0 && <div className="card warn">Some content failed to load:<ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
        {!content ? <p className="muted">Loading content…</p> : tab.startsWith('q=') ? (
          // deep link to a single question: #q=A2-2-03
          (() => { const q = content.questions.find(x => x.id === tab.slice(2)); return q
            ? <div className="card"><QuestionView q={q} mode="practice" onAnswer={() => {}} /></div>
            : <p>No question {tab.slice(2)}</p> })()
        ) : (
          <>
            {tab === 'today' && <Today questions={content.questions} cards={content.cards} go={go} />}
            {tab === 'practice' && <Practice key={presetKey} questions={content.questions} preset={preset} />}
            {tab === 'mock' && <Mock questions={content.questions} />}
            {tab === 'book' && <Book />}
            {tab === 'cards' && <Flashcards cards={content.cards} />}
            {tab === 'progress' && <Progress questions={content.questions} cards={content.cards} />}
            {tab === 'settings' && <Settings manifest={content.manifest} counts={{ q: content.questions.length, c: content.cards.length }} />}
          </>
        )}
      </main>
    </div>
  )
}
