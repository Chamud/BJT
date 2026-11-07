"""Import YOUR purchased copy of 『BJT公式模擬テスト&ガイド』 into the app as a private, local-only book mode.

Usage:  python tools/book_import.py "docs/BJT公式模擬テスト&ガイド.pdf"
        python tools/book_import.py --audio-only      # re-scan the audio folder after downloading MP3s

Writes content/private/book/  (pages/*.jpg, book.json). Keep this folder private: it is your copy of a
copyrighted book. Put the audiobook.jp MP3s in content/private/book/audio/ (any file names; sorted by name).
"""
import json, sys
from pathlib import Path

BOOK = Path(__file__).resolve().parent.parent / "content" / "private" / "book"

# Page map (0-based PDF page index) for the 2022 edition, 161-page PDF.
SECTIONS = [  # part, section, first test page, explanation page
    (1, 1, 14, 101), (1, 2, 18, 104), (1, 3, 24, 111),
    (2, 1, 30, 121), (2, 2, 34, 125), (2, 3, 45, 130),
    (3, 1, 58, 139), (3, 2, 61, 145), (3, 3, 63, 152),
]
# The book's answer key (正答一覧) is part of the book, so it is NOT stored in this repo.
# It lives in content/private/book/answer_key.json: {"1-1": [1, 2, ...], ..., "3-3": [...]} with answers 1-4
# in question order — copy it from the 正答一覧 page of your own copy (answer booklet p.2).
KEY_FILE = BOOK / "answer_key.json"


def load_key():
    if not KEY_FILE.exists():
        raise SystemExit(f"Missing {KEY_FILE}: create it from the 正答一覧 page of your copy (see comment above).")
    key = json.loads(KEY_FILE.read_text(encoding="utf-8"))
    assert sum(len(v) for v in key.values()) == 80, "answer key must have 80 answers"
    return key


RANGES = {
    "test": (10, 67),          # 模擬テスト 問題
    "guide": (68, 97),         # What's the BJT? (JA/EN)
    "answers": (98, 160),      # 解答・解説 別冊 incl. listening scripts
}
EXTRA_LINKS = {"audioInstructions": 95, "answerKey": 99, "levels": 100, "advice": 157}


def scan_audio():
    d = BOOK / "audio"
    d.mkdir(parents=True, exist_ok=True)
    exts = {".mp3", ".m4a", ".wav", ".aac", ".ogg"}
    return sorted(p.name for p in d.iterdir() if p.suffix.lower() in exts)


def write_json(page_count):
    KEY = load_key()
    data = {
        "title": "BJT公式模擬テスト&ガイド",
        "pageCount": page_count,
        "sections": [{"part": p, "section": s, "testPage": t, "explPage": e, "answers": KEY[f"{p}-{s}"]} for p, s, t, e in SECTIONS],
        "ranges": RANGES,
        "links": EXTRA_LINKS,
        "partMinutes": {"1": 45, "2": 30, "3": 30},
        "audio": scan_audio(),
    }
    old = BOOK / "book.json"
    if old.exists():  # keep chapter markers made by tools/book_audio_map.py
        prev = json.loads(old.read_text(encoding="utf-8"))
        if "audioChapters" in prev:
            data["audioChapters"] = prev["audioChapters"]
    (BOOK / "book.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"book.json written · {len(data['audio'])} audio files found in {BOOK / 'audio'}")


def main():
    if "--audio-only" in sys.argv:
        old = json.loads((BOOK / "book.json").read_text(encoding="utf-8"))
        write_json(old["pageCount"])
        return
    import fitz  # PyMuPDF
    from PIL import Image, ImageFilter, ImageOps
    pdf = Path(sys.argv[1])
    rerender = "--rerender" in sys.argv
    doc = fitz.open(pdf)
    (BOOK / "pages").mkdir(parents=True, exist_ok=True)
    for i, page in enumerate(doc):
        out = BOOK / "pages" / f"{i:03d}.jpg"
        if out.exists() and not rerender:
            continue
        # The scans are only ~72 dpi, so more dpi adds no detail. Instead: 2x upscale (smooth text edges),
        # crop the wide white margins so the text fills the screen, and lightly sharpen.
        pix = page.get_pixmap(dpi=144)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        # Optional (--crop) ink-density crop: a column/row counts as content only if it holds a meaningful amount of ink,
        # so thin header rules, page numbers and scan specks don't stretch the box to the page edge.
        ink = ImageOps.invert(img.convert("L")).point(lambda v: 1 if v > 110 else 0)
        w, h = ink.size
        px = ink.load()
        cols = [sum(px[x, y] for y in range(0, h, 2)) for x in range(w)]
        rows = [sum(px[x, y] for x in range(0, w, 2)) for y in range(h)]
        xs = [x for x, c in enumerate(cols) if c >= h * 0.004]
        ys = [y for y, c in enumerate(rows) if c >= 3]
        if xs and ys and "--crop" in sys.argv:  # cropping is optional: full pages by default (the viewer zooms)
            pad = 30
            box = (max(xs[0] - pad, 0), max(ys[0] - pad, 0), min(xs[-1] + pad, w), min(ys[-1] + pad, h))
            img = img.crop(box)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=2))
        img.save(out, quality=88)
        if i % 20 == 0:
            print(f"  page {i}/{doc.page_count}", flush=True)
    write_json(doc.page_count)


if __name__ == "__main__":
    main()
