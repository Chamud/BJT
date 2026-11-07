import type { Audio, Question } from './types'
import { getState, update } from './store'

/** Live playback speed: read at every clip, so speed buttons take effect mid-question. */
const liveRate = () => getState().settings.speechRate || 1
export function setSpeed(r: number) {
  update(s => { s.settings.speechRate = r })
  if (current) current.playbackRate = r
}

/**
 * Browser speech synthesis for listening questions.
 * Best quality: Microsoft Edge (online "Nanami"/"Keita" natural voices).
 * Chrome/Windows falls back to Haruka/Ayumi/Ichiro; with a single voice, pitch distinguishes speakers.
 */
const FEMALE = /nanami|haruka|ayumi|sayaka|kyoko|mayu|aoi|shiori|female|女性/i
const MALE = /keita|ichiro|naoki|daichi|otoya|hattori|male|男性/i

let voices: SpeechSynthesisVoice[] = []
function refresh() {
  voices = speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith('ja'))
  // prefer neural/online voices
  voices.sort((a, b) => score(b) - score(a))
}
const score = (v: SpeechSynthesisVoice) => (/natural|online|neural/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1)
if (typeof speechSynthesis !== 'undefined') { refresh(); speechSynthesis.onvoiceschanged = refresh }

export const jaVoices = () => voices
export const ttsAvailable = () => typeof speechSynthesis !== 'undefined' && voices.length > 0

function voiceFor(gender: 'm' | 'f', nth: number): { voice?: SpeechSynthesisVoice; pitch: number } {
  const pool = voices.filter(v => (gender === 'f' ? FEMALE : MALE).test(v.name))
  const voice = pool[nth % Math.max(pool.length, 1)] ?? voices[0]
  const sameAsPool = pool.length > nth
  // When we have to reuse a voice, shift pitch so speakers stay distinguishable.
  const base = pool.length ? 1 : gender === 'm' ? 0.75 : 1.2
  return { voice, pitch: sameAsPool ? base : base + (nth % 2 ? -0.15 : 0.15) }
}

let token = 0
let current: HTMLAudioElement | null = null
export function stop() { token++; speechSynthesis.cancel(); current?.pause(); current = null }

/** Pre-rendered neural clips (tools/render_audio.py → content/audio/index.json). */
type ClipIndex = Record<string, { clips: { f: string; kind: 'line' | 'question' | 'choice'; i: number }[] }>
let clipIndex: Promise<ClipIndex> | null = null
const loadClips = (): Promise<ClipIndex> => (clipIndex ??= fetch('/audio/index.json', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : {}) as Promise<ClipIndex>).catch(() => ({} as ClipIndex)))
loadClips()
export async function hasNeuralAudio(id: string) { return !!(await loadClips())[id] }

function playFile(src: string, my: number): Promise<void> {
  return new Promise(res => {
    if (my !== token) return res()
    const a = new Audio(src)
    a.playbackRate = liveRate()
    a.preservesPitch = true
    current = a
    a.onended = () => res(); a.onerror = () => res(); a.onpause = () => res()
    a.play().catch(() => res())
  })
}

function say(text: string, gender: 'm' | 'f', nth: number, _rate: number, my: number): Promise<void> {
  return new Promise(res => {
    if (my !== token) return res()
    const u = new SpeechSynthesisUtterance(text)
    const v = voiceFor(gender, nth)
    if (v.voice) u.voice = v.voice
    u.lang = 'ja-JP'; u.pitch = v.pitch; u.rate = Math.min(liveRate(), 2)
    u.onend = () => res(); u.onerror = () => res()
    speechSynthesis.speak(u)
  })
}
const wait = (ms: number, my: number) => new Promise<void>(r => setTimeout(r, my === token ? ms : 0))

export type Phase = 'dialogue' | 'question' | 'choices' | 'done'

/** Plays dialogue → question → (spoken choices). Resolves when finished or stopped. */
export async function playQuestion(q: Question, rate = 1, onPhase?: (p: Phase, line?: number) => void) {
  stop()
  const my = ++token
  const a = q.audio as Audio
  const clips = (await loadClips())[q.id]
  if (my !== token) return
  if (clips) {
    for (const c of clips.clips) {
      if (my !== token) return
      if (c.kind === 'line') onPhase?.('dialogue', c.i)
      else onPhase?.(c.kind === 'question' ? 'question' : 'choices')
      await wait(c.kind === 'line' ? (c.i ? 300 : 0) : 650, my)
      await playFile(`/audio/${q.id}/${c.f}`, my)
    }
    if (my === token) onPhase?.('done')
    return
  }
  const nth: Record<string, number> = {}
  const counter = { m: 0, f: 0 }
  for (const [k, s] of Object.entries(a.speakers)) nth[k] = counter[s.gender]++
  const narrator = a.speakers.N ?? { gender: 'f' as const }
  const nN = nth.N ?? 0
  onPhase?.('dialogue', 0)
  for (let i = 0; i < a.lines.length; i++) {
    if (my !== token) return
    onPhase?.('dialogue', i)
    const l = a.lines[i]
    const sp = a.speakers[l.spk] ?? narrator
    await say(l.text, sp.gender, nth[l.spk] ?? 0, rate, my)
    await wait(350, my)
  }
  // Skip repeating the question if the script already ends with it.
  const last = a.lines[a.lines.length - 1]?.text ?? ''
  if (my === token && a.question && !last.includes(a.question.slice(0, 12))) {
    onPhase?.('question'); await wait(500, my); await say(a.question, narrator.gender, nN, rate, my)
  }
  if (q.choicesSpoken) {
    onPhase?.('choices')
    for (let i = 0; i < 4; i++) {
      await wait(700, my)
      await say(`${i + 1}. ${q.choices[i]}`, narrator.gender, nN, rate, my)
    }
  }
  if (my === token) onPhase?.('done')
}
