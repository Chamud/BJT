import { useEffect, useRef, useState } from 'react'
import type { Question } from '../types'
import { SECTION_NAMES, secKey } from '../types'
import { hasNeuralAudio, playQuestion, stop, ttsAvailable, type Phase } from '../tts'
import { getState } from '../store'
import Chart from './Chart'
import SpeedButtons from './SpeedButtons'

interface Props {
  q: Question
  mode: 'practice' | 'mock'
  /** chosen index (or null if not yet answered) — controlled by parent in mock mode */
  chosen?: number | null
  onAnswer: (choice: number, correct: boolean) => void
  /** mock listening: auto-play once and disallow replay */
  autoPlayOnce?: boolean
  index?: string
}

const ALLOWED = new Set('table thead tbody tr th td p b strong ul ol li br div span h4 small'.split(' '))
/** Content packs are local, but strip anything outside the schema's allow-list anyway. */
function clean(html: string) {
  return html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag: string, attrs: string) => {
    if (!ALLOWED.has(tag.toLowerCase())) return ''
    const keep = (attrs.match(/\s(colspan|rowspan)="\d+"/g) ?? []).join('')
    return m.startsWith('</') ? `</${tag}>` : `<${tag}${keep}>`
  })
}

export default function QuestionView({ q, mode, chosen: chosenProp, onAnswer, autoPlayOnce, index }: Props) {
  const [chosenLocal, setChosenLocal] = useState<number | null>(null)
  const chosen = chosenProp !== undefined ? chosenProp : chosenLocal
  const [phase, setPhase] = useState<Phase | 'idle'>('idle')
  const [plays, setPlays] = useState(0)
  const [showChoiceText, setShowChoiceText] = useState(false)
  const [selfMark, setSelfMark] = useState<number | null>(null)
  const started = useRef(false)
  const rate = getState().settings.speechRate
  const answered = chosen !== null && chosen !== undefined
  const feedback = mode === 'practice' && answered
  const hasAudio = !!q.audio && q.source === 'original'
  const [neural, setNeural] = useState(false)
  useEffect(() => { hasNeuralAudio(q.id).then(setNeural) }, [q.id])

  useEffect(() => {
    setChosenLocal(null); setPhase('idle'); setPlays(0); setShowChoiceText(false); setSelfMark(null); started.current = false
    return () => stop()
  }, [q.id])

  const play = () => {
    if (!hasAudio) return
    setPlays(p => p + 1)
    playQuestion(q, rate, p => setPhase(p)).then(() => setPhase(p => (p === 'done' ? 'done' : p)))
  }
  useEffect(() => {
    if (autoPlayOnce && hasAudio && !started.current) { started.current = true; const t = setTimeout(play, 600); return () => clearTimeout(t) }
  }, [q.id, autoPlayOnce]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (i: number) => {
    if (answered && mode === 'practice') return
    if (q.selfCheck && mode === 'practice') { setChosenLocal(i); return } // wait for self-mark
    setChosenLocal(i)
    onAnswer(i, i === q.answer)
  }
  const hideText = q.choicesOnPage || (q.choicesSpoken && (mode === 'mock' || (!answered && !showChoiceText)))
  const canReplay = mode === 'practice' || !autoPlayOnce

  return (
    <div className="question">
      <div className="q-head">
        {index && <span className="q-index">{index}</span>}
        <span className="pill">第{q.part}部 · {SECTION_NAMES[secKey(q)]}</span>
        <span className="pill subtle">{q.source === 'official' ? '公式サンプル' : 'Original'}</span>
        <span className="pill subtle" title="difficulty">{'●'.repeat(q.difficulty)}{'○'.repeat(3 - q.difficulty)}</span>
      </div>

      {q.video && (
        <div className="video">
          <iframe src={`https://www.youtube-nocookie.com/embed/${q.video}?rel=0`} title={q.id}
            allow="encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}
      {q.image && <img className={`q-image ${q.source === 'original' ? 'q-photo' : ''}`} src={q.image} alt={q.scene ?? 'question'} referrerPolicy="no-referrer" />}
      {q.choicesOnPage && q.ref && (
        <p className="hint">The choices for this official question are printed on the <a href={q.ref} target="_blank" rel="noreferrer">official sample page ↗</a>
          {q.part < 3 ? ' (or read aloud in the video)' : ''}. Answer with 1–4 here to track your progress.</p>
      )}

      {q.scene && (q.image && q.source === 'original'
        // generated picture is shown above; keep the text as an optional description
        ? <details className="scene-toggle small muted"><summary>Show description</summary>{q.scene}</details>
        : <div className="scene"><span className="scene-tag">{q.part === 1 && q.section === 3 ? 'イラスト' : '写真'}</span>{q.scene}</div>
      )}

      {hasAudio && (
        <div className="audio-bar">
          {neural || ttsAvailable() ? (
            <>
              <button className="btn" onClick={play} disabled={!canReplay && plays > 0}>
                {phase === 'idle' ? '▶ Play audio' : canReplay ? '↻ Replay' : 'Played (once only)'}
              </button>
              {phase !== 'idle' && phase !== 'done' && <span className="playing">● {phase === 'dialogue' ? '会話' : phase === 'question' ? '質問' : '選択肢'}</span>}
              {phase !== 'idle' && phase !== 'done' && <button className="link small" onClick={() => { stop(); setPhase('done') }}>stop</button>}
              <SpeedButtons />
            </>
          ) : <span className="warn">No Japanese voice found — open in Microsoft Edge, or install a Japanese voice in Windows Settings → Time &amp; language → Speech.</span>}
        </div>
      )}

      {q.material && (
        <div className="material">
          {q.material.kind === 'chart'
            ? <Chart spec={q.material.chart} />
            : <div>{q.material.title && !q.material.html.includes(q.material.title) && <h4>{q.material.title}</h4>}<div className="doc" dangerouslySetInnerHTML={{ __html: clean(q.material.html) }} /></div>}
        </div>
      )}

      {q.passage && <div className="passage">{q.passage}</div>}
      {q.prompt && q.source === 'original' && <p className="prompt">{q.prompt}</p>}
      {q.prompt && q.source === 'official' && <p className="prompt muted">{q.prompt}</p>}

      <div className={`choices ${hideText ? 'numbers' : ''}`}>
        {q.choices.map((c, i) => {
          const cls = ['choice']
          if (chosen === i) cls.push('chosen')
          if (feedback && !q.selfCheck) { if (i === q.answer) cls.push('right'); else if (chosen === i) cls.push('wrong') }
          return (
            <button key={i} className={cls.join(' ')} onClick={() => choose(i)} disabled={feedback && !q.selfCheck}>
              <span className="num">{i + 1}</span>{!hideText && <span>{c}</span>}
            </button>
          )
        })}
      </div>
      {q.choicesSpoken && mode === 'practice' && !answered && !showChoiceText &&
        <button className="link small" onClick={() => setShowChoiceText(true)}>Show choice text (easier than the real exam)</button>}

      {q.selfCheck && mode === 'practice' && answered && selfMark === null && (
        <div className="selfcheck">
          <p>This one is self-marked: open the <a href={q.ref} target="_blank" rel="noreferrer">official page ↗</a>, click 解答を見る for this question, then:</p>
          <button className="btn good" onClick={() => { setSelfMark(1); onAnswer(chosen!, true) }}>I was right</button>
          <button className="btn bad" onClick={() => { setSelfMark(0); onAnswer(chosen!, false) }}>I was wrong</button>
        </div>
      )}

      {feedback && (!q.selfCheck || selfMark !== null) && (
        <div className={`feedback ${(q.selfCheck ? selfMark === 1 : chosen === q.answer) ? 'ok' : 'ng'}`}>
          <strong>{(q.selfCheck ? selfMark === 1 : chosen === q.answer) ? '正解 Correct' : `不正解 — answer: ${q.answer + 1}`}</strong>
          {!q.selfCheck && q.choicesSpoken && <p className="muted">{q.choices.map((c, i) => `${i + 1}. ${c}`).join('　')}</p>}
          <p>{q.explanation}</p>
          {q.audio && q.source === 'original' && (
            <details>
              <summary>Transcript スクリプト</summary>
              <ul className="transcript">
                {q.audio.lines.map((l, i) => <li key={i}><b>{q.audio!.speakers[l.spk]?.role ?? l.spk}：</b>{l.text}</li>)}
                <li><b>質問：</b>{q.audio.question}</li>
              </ul>
            </details>
          )}
          {q.ref && <a href={q.ref} target="_blank" rel="noreferrer" className="small">Official page ↗</a>}
        </div>
      )}
    </div>
  )
}
