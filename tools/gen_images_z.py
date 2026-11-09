"""Generate Part 1 candidate images with the local Z-Image Turbo skill (imagegen, `claude` profile).

Usage: python tools/gen_images_z.py [--only A1-1-01,B1-1-04] [--n 2] [--n1 4] [--quality balanced]
Reads  content/images/prompts.json   (style: photo | lineart)
Writes content/images/candidates/<id>_<k>.jpg  (review them, then: python tools/pick_images.py ID=k ...)

Section-1 questions (場面把握) get more candidates (--n1) because the photo must match the correct
answer exactly; the others only set the scene.
"""
import argparse, json, subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "content" / "images"
IMAGEGEN = r"C:\Projects\ImageGenerator\imagegen.cmd"
STYLE = {
    "photo": "Candid documentary photograph, realistic. {p}. All people are Japanese adults in business clothes. "
             "Natural office lighting, 35mm lens, eye-level, realistic skin and hands, no visible text or logos.",
    "lineart": "Clean black and white line drawing for a Japanese business textbook, thin even ink outlines, flat, "
               "no shading, no color, plain white background, simple uncluttered composition. {p}. "
               "All people are Japanese office workers. No text.",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--n", type=int, default=2)
    ap.add_argument("--n1", type=int, default=4)
    ap.add_argument("--quality", default="balanced")
    a = ap.parse_args()
    prompts = {k: v for k, v in json.loads((ROOT / "prompts.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
    if a.only:
        prompts = {k: prompts[k] for k in a.only.split(",")}
    out = ROOT / "candidates"
    out.mkdir(parents=True, exist_ok=True)
    for qid, spec in prompts.items():
        n = a.n1 if qid.split("-")[1] == "1" else a.n
        if all((out / f"{qid}_{k}.jpg").exists() for k in range(n)):
            continue
        prompt = STYLE[spec["style"]].format(p=spec["prompt"].rstrip("."))
        made = 0
        for k in range(n):  # one image per call: batches of several run out of memory on 8 GB GPUs
            f = out / f"{qid}_{k}.jpg"
            if f.exists():
                made += 1; continue
            r = subprocess.run([IMAGEGEN, "gen", prompt, "--profile", "claude", "--json", "--size", "photo",
                                "-q", a.quality, "--seed", str(1000 * k + sum(map(ord, qid)))],
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            try:
                data = json.loads(r.stdout[r.stdout.index("{"):])
            except Exception:
                print(qid, k, "FAILED", " ".join((r.stdout + r.stderr)[-200:].split()), flush=True)
                continue
            im = Image.open(data["images"][0]["path"]).convert("RGB")
            if spec["style"] == "lineart":
                im = im.convert("L").convert("RGB")
            im.thumbnail((1024, 1024))
            im.save(f, quality=86)
            made += 1
            print(qid, k, f"{data.get('seconds', 0):.0f}s", flush=True)
        print(qid, "ok", made, "/", n, flush=True)


if __name__ == "__main__":
    main()
