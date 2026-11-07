import type { Card, CardPack, Manifest, Question, QuestionPack } from './types'

export interface Content { questions: Question[]; cards: Card[]; manifest: Manifest }

const getJSON = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path, { cache: 'no-store' })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r.json()
}

/** Loads every pack listed in content/manifest.json. A broken pack is skipped and reported, not fatal. */
export async function loadContent(): Promise<{ content: Content; errors: string[] }> {
  const manifest = await getJSON<Manifest>('/manifest.json')
  const errors: string[] = []
  const qPacks = await Promise.all(manifest.questionPacks.map(p =>
    getJSON<QuestionPack>('/' + p.file).catch(e => { errors.push(String(e)); return null })))
  const cPacks = await Promise.all(manifest.cardPacks.map(p =>
    getJSON<CardPack>('/' + p.file).catch(e => { errors.push(String(e)); return null })))
  const questions = qPacks.flatMap(p => p ? p.questions.map(q => ({ ...q, pack: p.id, mock: p.mock })) : [])
  const cards = cPacks.flatMap(p => p ? p.cards.map(c => ({ ...c, deck: p.deck, pack: p.id })) : [])
  return { content: { questions, cards, manifest }, errors }
}
