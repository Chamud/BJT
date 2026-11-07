import { useRef, useState } from 'react'
import type { Manifest } from '../types'
import { exportJSON, importJSON, resetAll, update, useStore } from '../store'
import { jaVoices } from '../tts'

export default function Settings({ manifest, counts }: { manifest: Manifest; counts: { q: number; c: number } }) {
  const st = useStore()
  const s = st.settings
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => update(x => { x.settings[k] = v })

  // plays a pre-rendered neural clip (same voices as the listening questions), so it works in the
  // desktop app too, where the browser's built-in speech voices aren't available
  const testVoice = () => {
    const a = new Audio('/audio/test-voice.mp3')
    a.playbackRate = s.speechRate; a.preservesPitch = true
    a.play().catch(() => setMsg('Could not play the test clip.'))
  }

  return (
    <div className="grid">
      <div className="card">
        <h3>Study settings</h3>
        <div className="form col">
          <label>Exam date<input type="date" value={s.examDate} onChange={e => set('examDate', e.target.value)} /></label>
          <label>Target score<input type="number" min={400} max={800} step={10} value={s.target} onChange={e => set('target', +e.target.value)} /></label>
          <label>New flashcards per day<input type="number" min={0} max={100} value={s.newCardsPerDay} onChange={e => set('newCardsPerDay', +e.target.value)} /></label>
          <label>Daily question goal<input type="number" min={0} max={200} value={s.dailyQuestions} onChange={e => set('dailyQuestions', +e.target.value)} /></label>
          <label>Speech speed ({s.speechRate.toFixed(2)}×)
            <input type="range" min={0.75} max={2} step={0.05} value={s.speechRate} onChange={e => set('speechRate', +e.target.value)} />
          </label>
        </div>
        <button className="btn" onClick={testVoice}>🔊 Test voice</button>
        <p className="small muted">Listening questions and flashcards use pre-made neural voices (Microsoft Nanami / Keita), so they sound the same everywhere.
          Browser voices are only a fallback for questions without audio files{jaVoices().length ? ` (found: ${jaVoices().map(v => v.name).join(', ')})` : ' (none available here, which is fine)'}.
          The real exam plays at 1×. Training at 1.25–1.5× makes 1× feel easy; use 2× for review only.</p>
      </div>

      <div className="card">
        <h3>Desktop widget</h3>
        <div className="form col">
          <label>Cards per set<input type="number" min={1} max={6} value={s.widgetBatch} onChange={e => set('widgetBatch', Math.min(6, Math.max(1, +e.target.value)))} /></label>
          <label>New set every ({s.widgetMins} minutes)
            <input type="range" min={5} max={60} step={5} value={s.widgetMins} onChange={e => set('widgetMins', +e.target.value)} />
          </label>
          <label>If untouched, pop up this long before the set changes
            <select value={s.widgetWarnSecs} onChange={e => set('widgetWarnSecs', +e.target.value)}>
              {[30, 60, 120, 180].map(v => <option key={v} value={v}>{v < 60 ? `${v} seconds` : `${v / 60} minute${v > 60 ? 's' : ''}`}</option>)}
            </select>
          </label>
          <label>Quiet hours — no pop-ups from<input type="time" value={s.quietStart} onChange={e => set('quietStart', e.target.value)} /></label>
          <label>until<input type="time" value={s.quietEnd} onChange={e => set('quietEnd', e.target.value)} /></label>
        </div>
        <p className="small muted">Leave quiet hours empty to disable. The widget only pops up in the desktop app (start-desktop.bat); pause it from the widget's ⏸ or the tray icon.</p>
      </div>

      <div className="card">
        <h3>Backup</h3>
        <p className="small muted">Progress is stored in this browser only. Export regularly.</p>
        <div className="row wrap">
          <button className="btn" onClick={exportJSON}>Export progress</button>
          <button className="btn" onClick={() => file.current?.click()}>Import…</button>
          <button className="btn bad" onClick={() => { if (confirm('Delete ALL progress? Export first if unsure.')) resetAll() }}>Reset</button>
        </div>
        <input ref={file} type="file" accept="application/json" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return
          try { importJSON(await f.text()); setMsg('Imported ✓') } catch (err) { setMsg(String(err)) }
        }} />
        {msg && <p className="small">{msg}</p>}
      </div>

      <div className="card wide">
        <h3>Content ({counts.q} questions · {counts.c} cards)</h3>
        <ul className="small">
          {manifest.questionPacks.map(p => <li key={p.file}>📝 {p.title} <span className="muted">{p.file}</span></li>)}
          {manifest.cardPacks.map(p => <li key={p.file}>🃏 {p.title} <span className="muted">{p.file}</span></li>)}
        </ul>
        <p className="small muted">To add more: drop a pack into <code>content/packs/…</code>, run <code>npm run validate</code>, add it to <code>content/manifest.json</code>, refresh. See <code>docs/ADDING_CONTENT.md</code>.</p>
      </div>
    </div>
  )
}
