#!/usr/bin/env python3
"""
Pack the frames recorded by tools/record-anims.mjs into one sprite sheet per action.

The rig is SVG driven by the browser's animation engine, so the share card cannot replay it live at
video speed. These sheets are the real animations, captured once, for the card to draw frame by frame.
The art is flat vector with a small palette, so an adaptive palette costs nothing visually and roughly
halves the sheet.
"""
import json, os, shutil, sys
from PIL import Image

RAW = "/tmp/emo-anim"
OUT = "apps/web/public/anim"
CELL = int(os.environ.get("CELL", 240))
COLORS = int(os.environ.get("COLORS", 64))
MAX_FRAMES = int(os.environ.get("MAX_FRAMES", 96))

meta_in = json.load(open(f"{RAW}/meta.json"))
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

out = []
total = 0
for clip in meta_in:
    times = clip["times"]
    n = len(times)
    # thin evenly if a clip is very long, keeping the real timestamps of the frames we keep
    keep = list(range(n))
    if n > MAX_FRAMES:
        keep = sorted({round(i * (n - 1) / (MAX_FRAMES - 1)) for i in range(MAX_FRAMES)})
    frames = [Image.open(f"{RAW}/{clip['key']}-{i:03d}.png").convert("RGB").resize((CELL, CELL), Image.LANCZOS) for i in keep]
    cols = 8
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * CELL, rows * CELL), (255, 255, 255))
    for i, im in enumerate(frames):
        sheet.paste(im, ((i % cols) * CELL, (i // cols) * CELL))
    sheet = sheet.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE)
    path = f"{OUT}/{clip['key']}.png"
    sheet.save(path, optimize=True)
    kb = os.path.getsize(path) / 1024
    total += kb
    out.append({
        "key": clip["key"], "label": clip["label"],
        "cell": CELL, "cols": cols, "rows": rows, "count": len(frames),
        "times": [times[i] for i in keep],
        "duration": times[keep[-1]],
    })
    print(f"{clip['key']:<6} {clip['label']:<13} {len(frames):>3} frames  {kb:>6.0f} KB")

json.dump(out, open(f"{OUT}/anim.json", "w"))
print(f"\n{len(out)} sheets, {total/1024:.1f} MB total -> {OUT}")
