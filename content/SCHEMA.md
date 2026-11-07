# BJT content packs — schema

All study content lives in `content/` and is served to the app as static files.
To add content: write a pack file, run `node tools/validate.mjs <file>`, add it to `content/manifest.json`. No rebuild needed.

## manifest.json
```json
{
  "questionPacks": [{ "file": "packs/questions/mock-a-part1.json", "title": "Mock A – Part 1" }],
  "cardPacks":     [{ "file": "packs/cards/business-vocab-1.json", "title": "Business vocab 1" }]
}
```

## Question pack
```json
{ "id": "mock-a-part1", "title": "Mock A – Part 1 Listening", "mock": "A", "questions": [ Question, ... ] }
```
`mock` (optional): questions from packs sharing the same `mock` letter form one full 80-question mock exam.

### Question
| field | type | required | notes |
|---|---|---|---|
| id | string | yes | globally unique, e.g. `A1-1-03` (mock A, part 1, section 1, #3) |
| part | 1, 2, 3 | yes | 1 聴解, 2 聴読解, 3 読解 |
| section | 1, 2, 3 | yes | see table below |
| source | "official" or "original" | yes | |
| difficulty | 1, 2, 3 | yes | 1 ≈ J3, 2 ≈ J2/J1, 3 ≈ J1+ |
| tags | string[] | yes | e.g. `["keigo","phone"]` |
| scene | string | P1 always; optional elsewhere | Japanese, 1–2 sentences describing the photo/illustration the examinee sees. Must NOT give away the answer or reuse choice wording. |
| audio | Audio | P1 and P2: yes. P3: no | the script that is spoken |
| prompt | string | P2, P3: yes. P1: optional | the printed question text |
| material | Material | P2 S2/S3 usually; P3 S3 optional | chart / table / document shown on screen |
| passage | string | P3 S3: yes | reading text (email, notice, article…). `\n` for line breaks |
| choices | string[4] | yes | exactly 4 |
| choicesSpoken | boolean | P1: true | true = in exam mode the choices are only heard, buttons show 1–4 |
| answer | 0–3 | yes | index into choices |
| explanation | string | yes | English, quoting the key Japanese. Why the answer is right AND why the main distractor is wrong. 2–5 sentences |
| video | string | official only | YouTube ID |
| image | string | optional | URL of an image |
| ref | string | official only | URL of the source page |

### Audio
```json
{ "lines": [ { "spk": "A", "text": "…" }, { "spk": "B", "text": "…" } ],
  "speakers": { "A": { "gender": "m", "role": "部長" }, "B": { "gender": "f", "role": "社員" }, "N": { "gender": "f", "role": "ナレーター" } },
  "question": "…" }
```
- `N` = narrator. Typical script: N sets the scene → dialogue → N asks the question.
- `question`: the spoken question (also repeated by the app after the dialogue). For choicesSpoken items the app reads the 4 choices after it.
- Write in natural spoken Japanese, no furigana, no romaji.

### Material
One of:
```json
{ "kind": "chart", "chart": { "type": "bar" | "line" | "pie", "title": "…", "unit": "億円", "labels": ["2023","2024"], "series": [{ "name": "売上", "values": [12, 15] }] } }
{ "kind": "html", "title": "…", "html": "<table>…</table>" }
```
`html` may use only: table, thead, tbody, tr, th, td, p, b, strong, ul, ol, li, br, div, span, h4, small. No styles/scripts. Use it for ads, schedules, quotes (見積書), email screens, floor maps as tables, etc.

## Section map (real exam: 80 items = 25 + 25 + 30, ~105 min — confirmed by the official book's answer key)
| part | section | name | real count | what it tests |
|---|---|---|---|---|
| 1 聴解 (~45 min) | 1 | 場面把握問題 | 5 | photo → pick the statement that describes it (choices spoken) |
| | 2 | 発言聴解問題 | 10 | photo + situation → pick the appropriate thing to say (keigo, manners) |
| | 3 | 総合聴解問題 | 10 | longer conversation/meeting/phone call → comprehension |
| 2 聴読解 (~30 min) | 1 | 状況把握問題 | 5 | listen to a workplace exchange, judge the situation/topic |
| | 2 | 資料聴読解問題 | 10 | chart/table/ad + audio → interpret the material |
| | 3 | 総合聴読解問題 | 10 | document + longer audio → integrated judgement |
| 3 読解 (30 min) | 1 | 語彙・文法問題 | 10 | business vocabulary & grammar fill-in (`prompt` has a ＿＿ blank) |
| | 2 | 表現読解問題 | 10 | appropriate expression for a business situation (keigo, cushion words) |
| | 3 | 総合読解問題 | 10 | emails, notices, reports, articles → comprehension |

## Card pack
```json
{ "id": "business-vocab-1", "title": "…", "deck": "vocab" | "kanji" | "keigo" | "phrase" | "grammar", "cards": [ Card, ... ] }
```
### Card
| field | required | notes |
|---|---|---|
| id | yes | unique, e.g. `bv1-001` |
| front | yes | the Japanese word/expression/grammar pattern |
| reading | yes | hiragana reading (for grammar: same as front or empty string) |
| meaning | yes | concise English |
| example | yes | natural business-context Japanese sentence |
| exampleEn | yes | English translation |
| note | no | usage nuance, keigo level, confusables |
| level | yes | "N2", "N1" or "BJT" (business-specific) |
