# python3 tools/emonad/scan.py <scandir> [glob] : what scan.cjs filmed, checked (needs numpy, scipy, pillow).
# white  = white within 1.6 px of the green: a leak (skin or white drawn with no line round it). Every move: 0.
# holes  = green enclosed by him and not ringed by hair (gaps between strands are not counted): mostly real negative
#          space (an arm against the shirt); look at any new cluster.
# pops   = a frame that changes far more than its neighbours (a jump in the picture).
# Writes <scandir>/report2.json (frame, size, x, y of each finding) for a closer look.
import sys, os, glob, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from multiprocessing import Pool
G = np.array([0, 177, 64], float)
def analyse(f):
    a = np.asarray(Image.open(f).convert('RGB')).astype(float)
    d = np.sqrt(((a - G) ** 2).sum(-1)); bg = d < 40
    dist = ndi.distance_transform_edt(~bg)
    mx, mn = a.max(-1), a.min(-1)
    white = (mn > 205) & (mx - mn < 30)
    R, Gc, B = a[..., 0], a[..., 1], a[..., 2]
    purple = (B > Gc + 25) & (R > Gc + 10) & (mx > 60)
    out = {'white': [], 'holes': []}
    m = white & (dist <= 1.6)
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    if n:
        sz = ndi.sum(m, lab, range(1, n + 1)); ce = ndi.center_of_mass(m, lab, range(1, n + 1))
        out['white'] = [(int(s), int(c[1]), int(c[0])) for s, c in zip(sz, ce) if s >= 3]
    lab, n = ndi.label(bg)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    H, Wd = bg.shape
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None or i in edge: continue
        y0, y1 = max(0, sl[0].start - 5), min(H, sl[0].stop + 5); x0, x1 = max(0, sl[1].start - 5), min(Wd, sl[1].stop + 5)
        sub = lab[y0:y1, x0:x1] == i; s = int(sub.sum())
        if s < 6 or s > 3000: continue
        ring = ndi.binary_dilation(sub, iterations=4) & ~sub & ~bg[y0:y1, x0:x1]
        pr = (purple[y0:y1, x0:x1] & ring).sum() / max(1, ring.sum())
        if pr < 0.25:
            ys, xs = np.nonzero(sub); out['holes'].append((s, int(xs.mean()) + x0, int(ys.mean()) + y0, round(float(pr), 2)))
    g = ndi.gaussian_filter(a.mean(-1), 2)
    return f, out, g
def case(cdir):
    fs = sorted(glob.glob(os.path.join(cdir, '*.png')))
    rows = []; prev = None; diffs = []
    for f in fs:
        f, r, g = analyse(f)
        diffs.append(float(np.abs(g - prev).mean()) if prev is not None and prev.shape == g.shape else 0.0); prev = g
        rows.append((os.path.basename(f), r))
    d = np.array(diffs); pops = []
    for i in range(1, len(d) - 1):
        nb = max(d[i - 1], d[i + 1], 0.05)
        if d[i] > 2.6 * nb and d[i] > 1.2: pops.append((rows[i][0], round(float(d[i]), 2)))
    return os.path.basename(cdir), {'frames': len(rows), 'rows': [(n, r) for n, r in rows if r['white'] or r['holes']], 'pops': pops}
if __name__ == '__main__':
    root = sys.argv[1]; pat = sys.argv[2] if len(sys.argv) > 2 else '*'
    cases = sorted(d for d in glob.glob(os.path.join(root, pat)) if os.path.isdir(d))
    with Pool(8) as pool: res = dict(pool.map(case, cases))
    json.dump(res, open(os.path.join(root, 'report2.json'), 'w'))
    tot = {'white': 0, 'holes': 0, 'pops': 0}
    for c, v in sorted(res.items()):
        w = sum(len(r['white']) for _, r in v['rows']); h = sum(len(r['holes']) for _, r in v['rows'])
        tot['white'] += w; tot['holes'] += h; tot['pops'] += len(v['pops'])
        if w or h or v['pops']: print(f"{c:28s} frames {v['frames']:3d}  white {w:4d}  holes {h:4d}  pops {len(v['pops'])}")
    print('TOTAL', tot)
