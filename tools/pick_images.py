"""Install reviewed candidate images into the question packs.

Usage: python tools/pick_images.py A1-1-01=2 A1-1-02=0 B1-1-04=none ...
  <id>=<k>     copy candidates/<id>_<k>.jpg to content/images/<id>.jpg and set the question's "image"
  <id>=none    remove the image (question falls back to its text 写真 description)
"""
import json, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "content"
IMG = ROOT / "images"


def main():
    picks = dict(a.split("=", 1) for a in sys.argv[1:])
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    done = set()
    for p in manifest["questionPacks"]:
        path = ROOT / p["file"]
        pack = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for q in pack["questions"]:
            k = picks.get(q["id"])
            if k is None or q.get("source") != "original":
                continue
            if k == "none":
                q.pop("image", None)
                (IMG / f"{q['id']}.jpg").unlink(missing_ok=True)
            else:
                shutil.copyfile(IMG / "candidates" / f"{q['id']}_{k}.jpg", IMG / f"{q['id']}.jpg")
                q["image"] = f"/images/{q['id']}.jpg"
            changed = True
            done.add(q["id"])
        if changed:
            path.write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    missing = set(picks) - done
    print(f"updated {len(done)} questions" + (f"; not found: {sorted(missing)}" if missing else ""))


if __name__ == "__main__":
    main()
