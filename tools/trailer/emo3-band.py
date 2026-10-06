"""The band's cut-outs (the third emo trailer), measured: for each emo3-band-* take, where the pet (with its guitar) is in
its picture from its alpha, every 3rd frame from a little before its riff to after its throw, and where its riff and its
last chord are, from its sound cues. emo3-timeline.mjs places the five in one room and frames them from this.
    python3 tools/trailer/emo3-band.py          (writes trailer/emo/band3.json)
"""
import json, os, sys
from PIL import Image
import numpy as np

RAW = os.environ.get('RAW', 'trailer/emo/raw')
OUT = 'trailer/emo/band3.json'
TOP = 12
# (Sahur drops his bat on the floor to his left before he takes the guitar: in the band it is left out, from x 1100;
# emo3-timeline.mjs gives compose.js the same edge)
LEFT = {'sahur': 1100}
res = {}
for short in ['cat', 'frog', 'sahur', 'thicc', 'r3']:
    take = f'emo3-band-{short}'
    meta = json.load(open(f'{RAW}/{take}/meta.json'))
    fps = meta.get('fps', 60)
    bars = [c['t'] for c in meta['cues'] if c.get('name') == 'band.bar']
    end = next((c['t'] for c in meta['cues'] if c.get('name') == 'band.end'), None)
    riff = bars[0] if bars else None
    f0 = max(0, int((riff / 1000 - 1.0) * fps)) if riff is not None else 0
    f1 = min(meta['frames'] - 1, int(((end or riff + 6000) / 1000 + 2.4) * fps))
    boxes = []
    for f in range(f0, f1 + 1, 3):
        a = np.asarray(Image.open(f'{RAW}/{take}/f-{f:05d}.png').getchannel('A')).copy()
        # (a faint bar of the room's along the top two rows was left in every cut-out: never a pet's; compose.js drawBand
        # leaves the same rows out)
        a[:TOP] = 0
        a[:, :LEFT.get(short, 0)] = 0
        ys, xs = np.nonzero(a > 40)
        if len(xs) == 0:
            continue
        boxes.append([f, int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())])
    w, h = Image.open(f'{RAW}/{take}/f-{f0:05d}.png').size
    res[take] = {'fps': fps, 'frames': meta['frames'], 'w': w, 'h': h, 'riffMs': riff, 'endMs': end, 'bars': bars, 'boxes': boxes}
    b = np.array([x[1:] for x in boxes])
    print(f'{take}: fps {fps}, riff {riff} ms, end {end} ms, {len(boxes)} boxes, x {b[:,0].min()}..{b[:,2].max()} y {b[:,1].min()}..{b[:,3].max()}', file=sys.stderr)
json.dump(res, open(OUT, 'w'))
print(OUT)
