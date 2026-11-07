"""Pre-render listening audio for ORIGINAL questions with Microsoft neural voices (edge-tts).

Usage:  python tools/render_audio.py            # render everything new or changed
        python tools/render_audio.py --force    # re-render all
Output: content/audio/<question-id>/<nn>.mp3 plus content/audio/index.json (read by the app).
The app plays these clips in order and falls back to browser voices for anything missing.

edge-tts only has two Japanese neural voices (Nanami F, Keita M), so extra speakers of the same
gender get a pitch/rate offset to stay distinguishable. The narrator is a calm, slightly slower Nanami/Keita.
"""
import asyncio, hashlib, json, sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent / "content"
OUT = ROOT / "audio"
VOICE = {"f": "ja-JP-NanamiNeural", "m": "ja-JP-KeitaNeural"}
# (pitch, rate) variants per gender, assigned in order of first appearance
VARIANTS = [("+0Hz", "+0%"), ("-14Hz", "-4%"), ("+14Hz", "+6%"), ("-26Hz", "+2%")]
NARRATOR = ("-4Hz", "-6%")
CONCURRENCY = 6


def plan(q):
    a = q["audio"]
    speakers = a["speakers"]
    narr = speakers.get("N", {"gender": "f"})
    seen = {"f": 0, "m": 0}
    voice_of = {}
    for line in a["lines"]:
        k = line["spk"]
        if k in voice_of:
            continue
        g = speakers.get(k, narr)["gender"]
        if k == "N":
            voice_of[k] = (VOICE[g], *NARRATOR)
        else:
            voice_of[k] = (VOICE[g], *VARIANTS[seen[g] % len(VARIANTS)])
            seen[g] += 1
    nv = (VOICE[narr["gender"]], *NARRATOR)
    clips = [("line", i, l["text"], voice_of[l["spk"]]) for i, l in enumerate(a["lines"])]
    last = a["lines"][-1]["text"] if a["lines"] else ""
    if a.get("question") and a["question"][:12] not in last:
        clips.append(("question", 0, a["question"], nv))
    if q.get("choicesSpoken"):
        clips += [("choice", i, f"{i + 1}。{c}", nv) for i, c in enumerate(q["choices"])]
    return clips


async def render(text, voice, out, sem):
    v, pitch, rate = voice
    async with sem:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(text, v, pitch=pitch, rate=rate).save(str(out))
                return
            except Exception as e:  # network hiccups / throttling
                if attempt == 3:
                    raise
                await asyncio.sleep(2 * (attempt + 1))


async def main():
    force = "--force" in sys.argv
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    questions = []
    for p in manifest["questionPacks"]:
        pack = json.loads((ROOT / p["file"]).read_text(encoding="utf-8"))
        questions += [q for q in pack["questions"] if q.get("source") == "original" and q.get("audio")]
    idx_path = OUT / "index.json"
    index = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() and not force else {}
    sem = asyncio.Semaphore(CONCURRENCY)
    todo = []
    for q in questions:
        clips = plan(q)
        h = hashlib.sha1(json.dumps(clips, ensure_ascii=False).encode()).hexdigest()[:12]
        d = OUT / q["id"]
        if index.get(q["id"], {}).get("hash") == h and all((d / c["f"]).exists() for c in index[q["id"]]["clips"]):
            continue
        d.mkdir(parents=True, exist_ok=True)
        entry = {"hash": h, "clips": []}
        for n, (kind, i, text, voice) in enumerate(clips):
            f = f"{n:02d}.mp3"
            entry["clips"].append({"f": f, "kind": kind, "i": i})
            todo.append(render(text, voice, d / f, sem))
        index[q["id"]] = entry
    print(f"{len(questions)} listening questions, rendering {len(todo)} clips…", flush=True)
    done = 0
    for coro in asyncio.as_completed(todo):
        await coro
        done += 1
        if done % 50 == 0:
            print(f"  {done}/{len(todo)}", flush=True)
    # drop entries for questions that no longer exist
    ids = {q["id"] for q in questions}
    index = {k: v for k, v in index.items() if k in ids}
    OUT.mkdir(exist_ok=True)
    idx_path.write_text(json.dumps(index, ensure_ascii=False, indent=0), encoding="utf-8")
    print("done:", idx_path)


if __name__ == "__main__":
    asyncio.run(main())
