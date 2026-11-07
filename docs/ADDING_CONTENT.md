# Growing the content bank

Every question and flashcard is a JSON **pack** in `content/packs/`. The app reads `content/manifest.json` on load, so:

1. Create the pack file (format: [`content/SCHEMA.md`](../content/SCHEMA.md)).
2. Check it: `cd app && npm run validate` (or `node tools/validate.mjs path/to/pack.json`).
3. Add one line to `content/manifest.json`.
4. Refresh the browser. No rebuild needed. Your progress is kept, because it's keyed by question/card ID.

**Never reuse or renumber an ID.** Progress history is attached to IDs.

## Roadmap: batch sizes

| Batch | Questions | Cards | When |
|---|---|---|---|
| **1 (done)** | 24 official + Mock A + Mock B (160) | ~500: vocab 150, N1 kanji 100, keigo 80, phrases 90, grammar 80 | Week 1 |
| 2 | Mock C + D (160) | +300: vocab 2, kanji 2 | When Mock A and B are done, about week 3 |
| 3 | Targeted drill packs: +40 for each of your 3 weakest sections (from the Today page) | +200 cards for weak decks (e.g. keigo 2) | About week 5 |
| 4 | Mock E + F, harder: mostly difficulty 3 | +200 N1 vocab / news vocab | About 2–3 weeks before the exam |
| Official | The BJT公式模擬テスト&ガイド book. Do its mock **on paper with its audio**, as your final benchmark, about 10 days before the exam. Don't type it into the app. | | |

Rule of thumb: take a **fresh** mock every 10–14 days. A retaken mock inflates your score because you remember the answers, so new mocks are the most valuable thing to add.

## Prompt to ask Claude for a new batch

> Read `content/SCHEMA.md` and the existing packs in `content/packs/`. Write `content/packs/questions/mock-c-part1.json` (and part2, part3) as mock "C": 80 original questions with the same section counts as the real exam. Use topics that are **not** already used in Mock A or B (check them). Target JLPT N2 → BJT 600+, mostly difficulty 2–3. Run `node tools/validate.mjs` on each file until it passes, then add the packs to `content/manifest.json`.

For targeted drills:

> Look at my weakest sections on the Progress page: [paste]. Write `content/packs/questions/drill-2-3-a.json` with 40 original 総合聴読解 questions (part 2, section 3), no `mock` field, IDs `D23A-01…`. Validate, then add to the manifest.

For flashcards:

> Write `content/packs/cards/business-vocab-2.json`: 150 new business vocabulary cards. Check every existing card pack first and include no duplicate `front` values. Validate, then add to the manifest.

## Audio for new packs

After adding a pack with listening questions, run `python tools/render_audio.py`. It renders neural-voice clips for any new or changed question.
