"""Generate candidate images for original Part 1 questions on the local GPU (SDXL, RealVisXL).

Usage: python tools/gen_images.py [--n 3] [--only A1-1-01,B1-1-04]
Reads  content/images/prompts.json
Writes content/images/candidates/<id>_<k>.jpg  (review them, then run tools/pick_images.py)
"""
import argparse, json
from pathlib import Path

import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

ROOT = Path(__file__).resolve().parent.parent / "content" / "images"
MODEL = "SG161222/RealVisXL_V4.0"
STYLE = {
    "photo": ("candid documentary photograph, {p}, Japanese people, realistic office lighting, natural colors, 35mm, sharp focus",
              "text, letters, watermark, logo, cartoon, anime, illustration, deformed hands, extra fingers, extra people, blurry"),
    "lineart": ("black and white line art illustration, clean thin ink outlines, simple flat drawing, no shading, plain white background, textbook illustration of {p}, Japanese office workers",
                "photo, photorealistic, color, gradient, shading, text, letters, watermark, deformed hands, extra fingers, blurry"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    prompts = {k: v for k, v in json.loads((ROOT / "prompts.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
    if a.only:
        prompts = {k: prompts[k] for k in a.only.split(",")}
    out = ROOT / "candidates"
    out.mkdir(parents=True, exist_ok=True)

    pipe = StableDiffusionXLPipeline.from_pretrained(MODEL, torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
    pipe.enable_model_cpu_offload()  # fits 8 GB VRAM
    pipe.vae.enable_slicing()

    for qid, spec in prompts.items():
        pos, neg = STYLE[spec["style"]]
        for k in range(a.n):
            f = out / f"{qid}_{k}.jpg"
            if f.exists():
                continue
            g = torch.Generator("cuda").manual_seed(1000 * k + sum(map(ord, qid)))
            img = pipe(pos.format(p=spec["prompt"]), negative_prompt=neg, width=1024, height=768,
                       num_inference_steps=28, guidance_scale=5.5, generator=g).images[0]
            if spec["style"] == "lineart":
                img = img.convert("L").convert("RGB")
            img.resize((768, 576)).save(f, quality=85)
        print(qid, "done", flush=True)


if __name__ == "__main__":
    main()
