export type Part = 1 | 2 | 3
export type Section = 1 | 2 | 3

export interface Speaker { gender: 'm' | 'f'; role?: string }
export interface Audio {
  lines: { spk: string; text: string }[]
  speakers: Record<string, Speaker>
  question: string
}
export interface ChartSpec {
  type: 'bar' | 'line' | 'pie'
  title?: string
  unit?: string
  labels: string[]
  series: { name: string; values: number[] }[]
}
export type Material =
  | { kind: 'chart'; chart: ChartSpec }
  | { kind: 'html'; title?: string; html: string }

export interface Question {
  id: string
  part: Part
  section: Section
  source: 'official' | 'original'
  difficulty: 1 | 2 | 3
  tags: string[]
  scene?: string
  audio?: Audio
  prompt?: string
  material?: Material
  passage?: string
  choices: string[]
  choicesSpoken?: boolean
  choicesOnPage?: boolean
  selfCheck?: boolean
  answer: number
  explanation: string
  video?: string
  image?: string
  ref?: string
  // filled in by loader
  pack?: string
  mock?: string
}

export interface QuestionPack { id: string; title: string; mock?: string; questions: Question[] }

export type Deck = 'vocab' | 'kanji' | 'keigo' | 'phrase' | 'grammar'
export interface Card {
  id: string; front: string; reading: string; meaning: string
  example: string; exampleEn: string; note?: string; level: string
  deck?: Deck; pack?: string
}
export interface CardPack { id: string; title: string; deck: Deck; cards: Card[] }

export interface Manifest {
  questionPacks: { file: string; title: string }[]
  cardPacks: { file: string; title: string }[]
}

export const SECTION_NAMES: Record<string, string> = {
  '1-1': '場面把握', '1-2': '発言聴解', '1-3': '総合聴解',
  '2-1': '状況把握', '2-2': '資料聴読解', '2-3': '総合聴読解',
  '3-1': '語彙・文法', '3-2': '表現読解', '3-3': '総合読解',
}
export const PART_NAMES: Record<number, string> = { 1: '聴解 Listening', 2: '聴読解 Listening-Reading', 3: '読解 Reading' }
/** Question count per section in the real exam (80 total). */
export const REAL_COUNTS: Record<string, number> = {
  '1-1': 5, '1-2': 10, '1-3': 10, '2-1': 5, '2-2': 10, '2-3': 10, '3-1': 10, '3-2': 10, '3-3': 10,
}
/** Real exam time limits per part, in minutes. */
export const PART_MINUTES: Record<number, number> = { 1: 45, 2: 30, 3: 30 }
export const secKey = (q: { part: number; section: number }) => `${q.part}-${q.section}`
