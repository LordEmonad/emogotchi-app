# Flashes in a cut: frames that differ from BOTH neighbours while the neighbours agree (a one- or two-frame pop), found
# tile by tile so a small one (a row lighting up, a button blinking) is not lost in a moving scene. Reads the takes'
# frames the cut uses, from a list made by the timeline:
#   node -e 'import("./tools/trailer/demo-timeline.mjs").then(m=>console.log(JSON.stringify(m.build().clips.filter(c=>c.take).map(c=>({id:c.id,take:c.take,from:c.from??0,len:c.len})))))' > clips.json
#   python3 tools/trailer/flicker.py trailer/demo/raw clips.json [out_dir]
# Prints each suspect (clip, take second, tile, score) and saves a strip of the frames around it into out_dir.
import json, os, sys
import numpy as np
from PIL import Image

raw, clips_path = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
clips = json.load(open(clips_path))
GW, GH = 16, 9          # tiles
TW, TH = 24, 24         # px per tile after downscale (384 x 216)
cache = {}

def frame(take, i):
    k = (take, i)
    if k in cache: return cache[k]
    p = os.path.join(raw, take, f'f-{i:05d}.png')
    if not os.path.exists(p): return None
    im = Image.open(p).convert('L').resize((GW * TW, GH * TH), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32)
    cache[k] = a
    if len(cache) > 400: cache.pop(next(iter(cache)))
    return a

def tiles(d):
    return d.reshape(GH, TH, GW, TW).mean(axis=(1, 3))

found = []
for c in clips:
    meta = json.load(open(os.path.join(raw, c['take'], 'meta.json')))
    n = meta['frames']
    if n <= 3: continue
    f0 = int(round(c['from'] * 60)); f1 = min(n - 1, f0 + c['len'])
    for gap in (1, 2):   # a pop that lasts one frame, or two
        for i in range(max(1, f0 + 1), f1 - gap):
            a, b, z = frame(c['take'], i - 1), frame(c['take'], i), frame(c['take'], i + gap)
            if a is None or b is None or z is None: continue
            ab, bz, az = tiles(np.abs(a - b)), tiles(np.abs(b - z)), tiles(np.abs(a - z))
            score = np.minimum(ab, bz) - az      # big where frame i is unlike both sides and the sides agree
            t = np.unravel_index(np.argmax(score), score.shape)
            s = float(score[t])
            if s > 6:
                found.append((c['id'], c['take'], i, gap, t, s))
seen = set()
for cid, take, i, gap, t, s in sorted(found, key=lambda x: -x[5]):
    key = (take, i // 6)
    if key in seen: continue
    seen.add(key)
    print(f'{cid:10s} {take:14s} frame {i} ({i / 60:.2f}s) lasts {gap} tile {t} score {s:.1f}')
    if out:
        os.makedirs(out, exist_ok=True)
        strip = [Image.open(os.path.join(raw, take, f'f-{j:05d}.png')).convert('RGB') for j in range(i - 1, i + gap + 1)]
        w, h = strip[0].size; sc = 480 / w
        s2 = Image.new('RGB', (480 * len(strip), int(h * sc)))
        for k, im in enumerate(strip): s2.paste(im.resize((480, int(h * sc))), (480 * k, 0))
        s2.save(os.path.join(out, f'{cid}-{i}.png'))
print(len(seen), 'suspects')
