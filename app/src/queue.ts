import type { Card, Deck } from './types'
import type { State } from './store'
import { today } from './store'

/** Today's flashcard queue: due reviews (oldest first), then new cards interleaved across decks up to the daily limit. */
export function buildQueue(cards: Card[], st: State, deck: Deck | 'all' = 'all', now = Date.now()) {
  const newLeft = Math.max(0, st.settings.newCardsPerDay - (st.days[today()]?.newCards ?? 0))
  const inDeck = cards.filter(c => deck === 'all' || c.deck === deck)
  const due = inDeck.filter(c => st.cards[c.id] && st.cards[c.id].due <= now).sort((a, b) => st.cards[a.id].due - st.cards[b.id].due)
  const byDeck = new Map<string, Card[]>()
  for (const c of inDeck) if (!st.cards[c.id]) byDeck.set(c.deck!, [...(byDeck.get(c.deck!) ?? []), c])
  const lists = [...byDeck.values()]
  const fresh: Card[] = []
  for (let i = 0; fresh.length < newLeft && lists.some(l => l.length > i); i++)
    for (const l of lists) if (l[i] && fresh.length < newLeft) fresh.push(l[i])
  return { due, fresh, all: [...due, ...fresh], newLeft }
}

/** Neural audio for card example sentences (tools/render_card_audio.py), falling back to the browser voice. */
let cardAudio: Promise<Set<string>> | null = null
const loadCardAudio = () => (cardAudio ??= fetch('/audio/cards/index.json', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : [])).then((ids: string[]) => new Set(ids)).catch(() => new Set<string>()))
let playing: HTMLAudioElement | null = null
export async function speakCard(c: Card, rate = 1) {
  playing?.pause(); speechSynthesis.cancel()
  if ((await loadCardAudio()).has(c.id)) {
    playing = new Audio(`/audio/cards/${c.id}.mp3`); playing.playbackRate = rate; playing.play().catch(() => {}); return
  }
  const u = new SpeechSynthesisUtterance(c.example); u.lang = 'ja-JP'; u.rate = Math.min(rate, 2); speechSynthesis.speak(u)
}
