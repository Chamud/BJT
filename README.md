# BJT Trainer

A personal study app for the BJT ビジネス日本語能力テスト, built for a goal of JLPT N2 → **600+ (J1+)**.

## Run it
Double-click `start.bat`, or:
```
cd app
npm install      # first time only
npm run dev      # opens http://localhost:5180
```
Use **Microsoft Edge** for the best Japanese voices in listening questions.

## What's inside
| Tab | What it does |
|---|---|
| **Today** | Estimated score vs. 600, streak, days to exam, today's checklist, and the 3 sections where you can gain the most points |
| **Practice** | Drills by section with instant feedback, audio replay, transcripts and explanations. Smart order: unseen and weak first |
| **Mock exam** | Full 80-question timed exam (45 / 30 / 30 min). Audio plays once, Part 1 choices are spoken only, no feedback until the end. Then a score, level, per-section breakdown and review |
| **Flashcards** | Spaced repetition (SM-2) over vocab, N1 kanji, keigo, set phrases and N1 grammar. Keys: Space flips, 1–4 grades |
| **Progress** | Score trend, accuracy per section, 12-week activity heatmap, coverage, mock history |
| **Settings** | Exam date, new cards per day, daily goal, speech speed, backup export/import |

## Book mode (your purchased 公式模擬テスト&ガイド)
- `python tools/book_import.py "docs/BJT公式模擬テスト&ガイド.pdf"` turns the PDF into page images in `content/private/book/`. This is already done.
- The **Book** tab shows the test pages with a bubble answer sheet, per-part timers and automatic grading against the official answer key. It also has the 解答・解説 pages (explanations and listening scripts) and the guide.
- **Audio:** go to audiobook.jp/exchange/kanken and enter the serial code from PDF page 95. Save the MP3s to `content/private/book/audio/`, then run `python tools/book_import.py --audio-only`.
- `content/private/` stays on this PC: production builds remove it automatically. Don't share or upload it.

## Natural listening audio (original questions)
`python tools/render_audio.py` makes neural-voice MP3s (Microsoft Nanami and Keita, through edge-tts) for every original listening question, saved to `content/audio/`. It only re-renders questions that are new or changed, so run it after adding packs. Questions without clips fall back to browser voices.

## Content
- `content/packs/questions/official-samples.json`: the 24 official sample questions. They use the official YouTube videos and images, with the answer key. Their text stays on kanken.or.jp.
- `content/packs/questions/mock-*.json`: original mock exams written in the real format. These are **not** real past papers.
- `content/packs/cards/*.json`: flashcard decks.
- Add more: see [docs/ADDING_CONTENT.md](docs/ADDING_CONTENT.md).

## Important limits
- The score is an **estimate**. The real BJT uses IRT scaling. Use it to track your trend, not as a promise.
- Progress is stored in this browser's localStorage. Use **Settings → Export** weekly.
- Part 1 "photos" are text descriptions (`scene`), so they're easier than the real photos.
- Buy the official book BJT公式模擬テスト&ガイド (¥1,870). Its audio comes through audiobook.jp using a serial code inside the book. It's the best final benchmark.

## Desktop app (tray + flashcard widget)
Double-click **`BJT Trainer.lnk`** (or `BJT Trainer.vbs`): no console windows appear. It rebuilds the app silently, then starts a tray icon (漢) and a small flashcard widget.
- The widget shows a set of cards (default 3) as kanji only. Click one to reveal and grade it. A new set appears every 10 minutes (adjustable 5–60 in Settings). There is no countdown on screen.
- If a set is untouched, 1 minute before it changes the widget pops on top of all windows with a short flashing animation (あと1分！) until you click it. It doesn't take your keyboard focus.
- Pause from the widget's ⏸ or the tray (30 min, 1 h, 3 h, until tomorrow). Set quiet hours, set size and timing in Settings → Desktop widget.
- ⤢ (or tray → Open BJT Trainer) opens the full trainer. Tray → **Start with Windows** makes it launch at login.
- The desktop app has its own storage. To move your progress: Edge → Settings → Export, then desktop app → Settings → Import.
- Flashcard 🔊 uses neural audio (`python tools/render_card_audio.py` after adding card packs).
