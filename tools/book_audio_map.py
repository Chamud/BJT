"""Build per-section / per-question chapter markers for the single-file audiobook.jp MP3 of
『BJT公式模擬テスト&ガイド』 and store them in content/private/book/book.json.

Usage: python tools/book_audio_map.py   (expects content/private/book/audio/book_full.mp3)

How it works: each question ends with a fixed answer pause (Part 1: 5 s, Part 2 S1: 8 s, S2: 16 s, S3: 10 s).
ffmpeg's silencedetect finds those pauses; anchors (verified by listening/ASR) mark where each section's
practice item ends, so question k starts at the end of pause k-1.
"""
import json, re, shutil, subprocess
from pathlib import Path

BOOK = Path(__file__).resolve().parent.parent / "content" / "private" / "book"
MP3 = BOOK / "audio" / "book_full.mp3"

# part, section, section start (instructions), first question start (after 練習), n questions, pause length (s)
ANCHORS = [
    (1, 1, 0.0, 157.2, 5, 5),
    (1, 2, 335.1, 446.2, 10, 5),
    (1, 3, 922.0, 1055.2, 10, 5),
    (2, 1, 2262.2, 2378.0, 5, 8),
    (2, 2, 2615.9, 2698.6, 10, 16),
    (2, 3, 3021.2, 3142.9, 10, 10),
]


def silences():
    ff = shutil.which("ffmpeg") or "ffmpeg"
    out = subprocess.run([ff, "-hide_banner", "-nostats", "-i", str(MP3), "-af", "silencedetect=noise=-40dB:d=1.5", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    return [(float(e) - float(d), float(e), float(d)) for e, d in re.findall(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", out)]


def main():
    sil = silences()
    chapters = []
    for i, (p, s, sec_start, q1, n, pause) in enumerate(ANCHORS):
        sec_end = ANCHORS[i + 1][2] if i + 1 < len(ANCHORS) else 1e9
        gaps = [e for st, e, d in sil if q1 < st < sec_end and abs(d - pause) < 0.8]
        if len(gaps) < n:
            raise SystemExit(f"{p}-{s}: expected {n} answer pauses of {pause}s, found {len(gaps)} — check anchors")
        starts = [q1] + gaps[: n - 1]
        chapters.append({"label": f"第{p}部 セクション{s}（説明・練習）", "part": p, "section": s, "q": 0, "t": round(sec_start, 1)})
        chapters += [{"label": f"{p}-{s} 問題{k + 1}", "part": p, "section": s, "q": k + 1, "t": round(max(t - 0.3, 0), 1)} for k, t in enumerate(starts)]
    data = json.loads((BOOK / "book.json").read_text(encoding="utf-8"))
    data["audioChapters"] = {"file": MP3.name, "chapters": chapters}
    (BOOK / "book.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(chapters)} chapters written ({sum(1 for c in chapters if c['q'])} questions)")


if __name__ == "__main__":
    main()
