"""Writes packages/pet/town/manifest.json: every town drawing's size, read off its viewBox (the site places them by it)."""
import os, re, json
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "town"))
m = {}
for f in sorted(os.listdir(OUT)):
    if not f.endswith(".svg") or f.startswith("._"): continue   # "._x.svg": macOS AppleDouble metadata, not a drawing
    src = open(os.path.join(OUT, f)).read(400)
    v = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', src)
    if v: m[f[:-4]] = [float(v.group(1)), float(v.group(2))]
json.dump(m, open(os.path.join(OUT, "manifest.json"), "w"), indent=0)
print(len(m), "drawings:", ", ".join(m))
