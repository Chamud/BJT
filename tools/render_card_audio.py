"""Render neural-voice MP3s for every flashcard example sentence (edge-tts, Nanami).

Usage: python tools/render_card_audio.py   (only new/changed sentences are rendered)
Output: content/audio/cards/<card-id>.mp3 and content/audio/cards/index.json (ids that have audio).
"""
import asyncio, hashlib, json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent / "content"
OUT = ROOT / "audio" / "cards"
VOICE = "ja-JP-NanamiNeural"


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    cards = []
    for p in manifest["cardPacks"]:
        cards += json.loads((ROOT / p["file"]).read_text(encoding="utf-8"))["cards"]
    hashes_path = OUT / "hashes.json"
    hashes = json.loads(hashes_path.read_text(encoding="utf-8")) if hashes_path.exists() else {}
    sem = asyncio.Semaphore(6)

    async def one(c):
        h = hashlib.sha1(c["example"].encode()).hexdigest()[:12]
        f = OUT / f"{c['id']}.mp3"
        if hashes.get(c["id"]) == h and f.exists():
            return
        async with sem:
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(c["example"], VOICE, rate="-5%").save(str(f))
                    hashes[c["id"]] = h
                    return
                except Exception:
                    await asyncio.sleep(2 * (attempt + 1))

    await asyncio.gather(*(one(c) for c in cards))
    ids = sorted(c["id"] for c in cards if (OUT / f"{c['id']}.mp3").exists())
    (OUT / "index.json").write_text(json.dumps(ids), encoding="utf-8")
    hashes_path.write_text(json.dumps(hashes), encoding="utf-8")
    print(f"{len(ids)}/{len(cards)} cards have audio")


if __name__ == "__main__":
    asyncio.run(main())
