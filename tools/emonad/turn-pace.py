# <venv>/bin/python tools/emonad/turn-pace.py <outdir>   (numpy, opencv; the stills from turn-pace.cjs)
# The turn's pace from how much changes on the page per degree, between stills a few degrees apart (the head by optical
# flow, the body by how far its colour regions' edges move: see edge_disp); the jumps
# where one drawing gives way to the next left out (they happen in an instant, whatever the pace); made the same both
# ways round (a turn to his left and one to his right pass the same drawings mirrored); smoothed.
#
# The head and the body are paced apart (their own rows of the stills: the head above his shoulders, the body below the
# hair's ends), because they change most at different angles (the body's outline stands still at the front, the back
# and side on, where it is widest or narrowest, and changes fastest just before a swap; the head does not), and one pace
# for both evened out neither. Both are paced on one phase, on which every drawing has its own place (where the whole
# figure's change puts it), so the head and the body come to each drawing together; between two drawings each goes at
# its own pace.
#
# Prints rig.ts's PACE_PSI (the phase at each knot: six to a pair of drawings), PACE_HEAD and PACE_BODY (the angle at
# each knot), and writes <outdir>/pace.json. SIG: the smoothing (degrees), FLOOR: the least change per degree counted,
# as a share of the mean (where nothing changes the pace would run away), HEAD/BODY: the rows (px of the stills).
import sys, glob, os, json, math
import numpy as np, cv2

d = sys.argv[1]
fs = sorted(glob.glob(os.path.join(d, '*.png')))
angs = np.array([int(os.path.basename(f)[:-4]) / 10 for f in fs])
step = angs[1] - angs[0]
SWAPS = [22.5, 67.5, 135, 225, 292.5, 337.5]
DRAWN = [0, 45, 90, 180, 270, 315, 360]
SUB = 6   # knots to 45 degrees
SIG = float(os.environ.get('SIG', 4))
FLOOR = float(os.environ.get('FLOOR', 0.25))


K3 = np.ones((3, 3), np.uint8)


def load(f):
    im = cv2.imread(f); g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    bg = (hsv[..., 0] > 45) & (hsv[..., 0] < 85) & (hsv[..., 1] > 120)
    # (the colour regions: the room, black, white, the purples)
    dark = ~bg & (g < 45); light = ~bg & (g > 190)
    return cv2.GaussianBlur(g, (5, 5), 1.0), ~bg, [bg, dark, light, ~bg & ~dark & ~light]


def edge_disp(A, B, y0, y1):
    """How far the colour regions' edges moved: the area that changed region over the length of the edges (px). Flow
    has nothing to track on his flat black shirt and trousers, and read noise there as motion."""
    x = p = 0
    for ma, mb in zip(A, B):
        ma, mb = ma[y0:y1], mb[y0:y1]
        x += (ma ^ mb).sum()
        for m in (ma, mb):
            m8 = m.astype(np.uint8); p += 0.5 * (m8 - cv2.erode(m8, K3)).sum()
    return x / max(p, 1)


ims = [load(f) for f in fs]
n = len(ims)
Hpx = ims[0][0].shape[0]
h0, h1 = (int(x) for x in os.environ.get('HEAD', '0,255').split(','))
b0, b1 = (int(x) for x in os.environ.get('BODY', f'310,{Hpx}').split(','))
# (between stills LAG degrees apart: a degree apart the motion is under a pixel; a step across a swap is left out and
# filled from its neighbours.) The head by optical flow (its hair's strands give it something to track), the body by its
# edges, the whole figure by both, each as a share of its own mean.
LAG = int(os.environ.get('LAG', 4))
rate = {'all': np.full(n, np.nan), 'head': np.full(n, np.nan), 'body': np.full(n, np.nan)}
for i in range(n):
    j = (i + LAG) % n
    lo, hi = angs[i], angs[i] + LAG * step
    # (and a degree and a half either side: a drawing's last degree before a swap can change fast, the far eye going
    # under the fringe, which a turn only ever passes in the frame of the swap itself)
    if any(lo - 1.5 < s_ < hi + 1.5 or lo - 1.5 < s_ + 360 < hi + 1.5 for s_ in SWAPS):
        continue
    (g0, m0, c0), (g1, m1, c1) = ims[i], ims[j]
    fl = cv2.calcOpticalFlowFarneback(g0[h0:h1], g1[h0:h1], None, 0.5, 4, 21, 4, 7, 1.5, 0)
    mag = np.hypot(fl[..., 0], fl[..., 1]); mm = (m0 | m1)[h0:h1]
    c = (i + LAG // 2) % n   # (the step's middle: the rate there)
    rate['head'][c] = (mag[mm].mean() if mm.any() else 0) / (LAG * step)
    rate['body'][c] = edge_disp(c0, c1, b0, b1) / (LAG * step)
for k in ('head', 'body'):
    v = rate[k]; ok = ~np.isnan(v); idx = np.arange(n)
    rate[k] = np.interp(idx, np.concatenate([idx[ok] - n, idx[ok], idx[ok] + n]), np.tile(v[ok], 3))
WH = float(os.environ.get('WHEAD', 0.4))
rate['all'] = WH * rate['head'] / rate['head'].mean() + (1 - WH) * rate['body'] / rate['body'].mean()


def even(v):
    v = v.copy()
    # both ways round: the step from a to a+step and the one from 360-a-step to 360-a are the same drawings mirrored
    w = 0.5 * (v + np.roll(v[::-1], -1))
    k = np.arange(-int(4 * SIG / step), int(4 * SIG / step) + 1) * step
    ker = np.exp(-0.5 * (k / SIG) ** 2); ker /= ker.sum()
    pad = len(k) // 2
    sm = np.convolve(np.concatenate([w[-pad:], w, w[:pad]]), ker, mode='valid')
    return np.maximum(sm, FLOOR * sm.mean())


sm = {k: even(v) for k, v in rate.items()}
A = np.concatenate([angs, [360.0]])
cum = {k: np.concatenate([[0], np.cumsum(v * step)]) for k, v in sm.items()}
# each drawing's place on the phase: where the whole figure's change puts it
psiD = [360 * np.interp(a, A, cum['all']) / cum['all'][-1] for a in DRAWN]
psi, head, body = [], [], []
for j in range(len(DRAWN) - 1):
    a0, a1 = DRAWN[j], DRAWN[j + 1]
    sub = round(SUB * (a1 - a0) / 45)
    for q in range(sub):
        u = q / sub
        psi.append(psiD[j] + u * (psiD[j + 1] - psiD[j]))
        for k, out in (('head', head), ('body', body)):
            c0, c1 = np.interp(a0, A, cum[k]), np.interp(a1, A, cum[k])
            out.append(float(np.interp(c0 + u * (c1 - c0), cum[k], A)))
psi.append(360.0); head.append(360.0); body.append(360.0)
for k in ('all', 'head', 'body'):
    print('%-4s rate per degree, smoothed: min %.2f max %.2f mean %.2f' % (k, sm[k].min(), sm[k].max(), sm[k].mean()))
print('drawings at', ' '.join('%g:%.1f' % (a, p) for a, p in zip(DRAWN, psiD)))
f2 = lambda xs: ', '.join('%.2f' % x for x in xs)
print('const PACE_PSI = [' + f2(psi) + '];')
print('const PACE_HEAD = [' + f2(head) + '];')
print('const PACE_BODY = [' + f2(body) + '];')
json.dump({'angle': angs.tolist(), 'raw': {k: v.tolist() for k, v in rate.items()}, 'smooth': {k: v.tolist() for k, v in sm.items()},
           'psi': psi, 'head': head, 'body': body}, open(os.path.join(d, 'pace.json'), 'w'))
