"""
Emonad's in-betweens: how each of his four drawings bends into its neighbour on the turntable, so a turn is one shape
changing all the way round rather than four drawings swapped. Read off packages/pet/emonad.svg (made by emonad.py),
written to packages/pet/design/emonad_morph.json, which emonad.py puts into the drawing (a <metadata> element) for the
rig (apps/web/src/emonad/rig.ts).

    <scratch>/venv/bin/python packages/pet/design/emonad_morph.py      (numpy, scipy, shapely)
    python3 packages/pet/design/emonad.py                              (again, to put it in the drawing)

For each pair of neighbouring drawings (front and three-quarter, three-quarter and side, side and back; and the same
with the other one mirrored, since the rig shows two of the views both ways round) and each piece of him that bends as
one (the head with its hair, face and neck; the shirt; each leg; each shoe), a smooth map from where a point of the
piece is in one drawing to where it is in the other: a thin-plate spline through matched points of the two outlines
(matched by dynamic time warping along them) and a few matched landmarks inside (the eyes, the nose, the mouth, the
chin, the joints). Halfway along that map both drawings have the same outline in the same place, which is where the rig
swaps one for the other; before that it bends the drawing shown towards the halfway shape a little more each frame.

A piece the other drawing has not got (the far eye from three-quarter to side, the face from side to back) is mapped
in under what covers it there (the hair), so it is hidden by the time of the swap rather than cut off.
"""
import json, os, re, sys, math
import numpy as np
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, LineString, MultiPolygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, '..', 'emonad.svg')
OUT = os.path.join(HERE, 'emonad_morph.json')
NS = '{http://www.w3.org/2000/svg}'

# ---------------------------------------------------------------- reading the drawing

def mat_mul(a, b):
    return (a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5])


def parse_transform(s):
    m = (1, 0, 0, 1, 0, 0)
    for fn, args in re.findall(r'(\w+)\(([^)]*)\)', s or ''):
        a = [float(x) for x in re.split(r'[ ,]+', args.strip()) if x]
        if fn == 'rotate':
            r = math.radians(a[0]); c, s_ = math.cos(r), math.sin(r)
            cx, cy = (a[1], a[2]) if len(a) > 2 else (0, 0)
            m = mat_mul(m, (1, 0, 0, 1, cx, cy)); m = mat_mul(m, (c, s_, -s_, c, 0, 0)); m = mat_mul(m, (1, 0, 0, 1, -cx, -cy))
        elif fn == 'translate':
            m = mat_mul(m, (1, 0, 0, 1, a[0], a[1] if len(a) > 1 else 0))
        elif fn == 'scale':
            m = mat_mul(m, (a[0], 0, 0, a[1] if len(a) > 1 else a[0], 0, 0))
        elif fn == 'matrix':
            m = mat_mul(m, tuple(a))
    return m


def apply(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


TOK = re.compile(r'[MLCQZmlcqz]|-?\d*\.?\d+(?:e-?\d+)?')


def path_polylines(d, m):
    """A path's subpaths as point lists (curves sampled), through the matrix m."""
    out, cur, pt, start = [], [], (0, 0), (0, 0)
    toks = TOK.findall(d)
    i, cmd = 0, None
    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; i += 1
            if cmd in 'Zz':
                if cur: out.append(cur)
                cur = []; pt = start
                continue
        if cmd == 'M':
            if cur: out.append(cur)
            pt = (num(), num()); start = pt; cur = [pt]; cmd = 'L'
        elif cmd == 'L':
            pt = (num(), num()); cur.append(pt)
        elif cmd == 'C':
            p1 = (num(), num()); p2 = (num(), num()); p3 = (num(), num())
            for s in np.linspace(0.2, 1, 5):
                u = 1 - s
                cur.append((u ** 3 * pt[0] + 3 * u * u * s * p1[0] + 3 * u * s * s * p2[0] + s ** 3 * p3[0],
                            u ** 3 * pt[1] + 3 * u * u * s * p1[1] + 3 * u * s * s * p2[1] + s ** 3 * p3[1]))
            pt = p3
        elif cmd == 'Q':
            p1 = (num(), num()); p2 = (num(), num())
            for s in np.linspace(0.25, 1, 4):
                u = 1 - s
                cur.append((u * u * pt[0] + 2 * u * s * p1[0] + s * s * p2[0], u * u * pt[1] + 2 * u * s * p1[1] + s * s * p2[1]))
            pt = p2
        else:
            raise ValueError('path command ' + str(cmd))
    if cur: out.append(cur)
    return [[apply(m, x, y) for x, y in c] for c in out]


class Drawing:
    def __init__(self, path=SVG):
        self.tree = ET.parse(path)
        root = self.tree.getroot()
        self.ids = {el.get('id'): el for el in root.iter() if el.get('id')}
        self.views = {}
        for g in root.iter(NS + 'g'):
            if g.get('class') == 'view':
                v = g.get('data-view')
                parts = {}
                for p in g:
                    if p.tag == NS + 'g' and 'part' in (p.get('class') or '').split():
                        parts[p.get('data-part')] = p
                self.views[v] = {'g': g, 'piv': json.loads(g.get('data-pivots')), 'boxes': json.loads(g.get('data-boxes')), 'parts': parts}

    def shapes(self, el, m=(1, 0, 0, 1, 0, 0), hidden_ok=False):
        """Every filled or stroked shape under el as shapely geometry (what it covers), in view units."""
        out = []
        if el.tag in (NS + 'clipPath', NS + 'defs', NS + 'mask'):
            return out
        if not hidden_ok and el.get('display') == 'none':
            return out
        m = mat_mul(m, parse_transform(el.get('transform')))
        tag = el.tag[len(NS):]
        if tag == 'use':
            ref = self.ids.get((el.get('href') or el.get('{http://www.w3.org/1999/xlink}href') or '')[1:])
            if ref is not None:
                for c in ref: out += self.shapes(c, m, hidden_ok)
            return out
        if tag == 'path' and el.get('d'):
            fill = el.get('fill', '#000')
            sw = float(el.get('stroke-width', '0') or 0) if el.get('stroke') not in (None, 'none') else 0
            for pl in path_polylines(el.get('d'), m):
                if fill != 'none' and len(pl) >= 3:
                    pg = Polygon(pl).buffer(0)
                    if not pg.is_empty: out.append(pg)
                if sw > 0 and len(pl) >= 2:
                    out.append(LineString(pl).buffer(sw / 2))
        elif tag == 'circle':
            x, y = apply(m, float(el.get('cx', 0)), float(el.get('cy', 0)))
            from shapely.geometry import Point
            out.append(Point(x, y).buffer(float(el.get('r', 0))))
        elif tag == 'ellipse':
            from shapely.geometry import Point
            from shapely import affinity
            cx, cy, rx, ry = (float(el.get(k, 0)) for k in ('cx', 'cy', 'rx', 'ry'))
            e = affinity.scale(Point(0, 0).buffer(1), rx, ry)
            e = affinity.affine_transform(e, [m[0], m[2], m[1], m[3], m[0] * cx + m[2] * cy + m[4], m[1] * cx + m[3] * cy + m[5]])
            out.append(e)
        for c in el:
            out += self.shapes(c, m, hidden_ok)
        return out

    def silhouette(self, v, names, smooth=1.2):
        from shapely import affinity
        geo = []
        for n in names:
            p = self.views[v]['parts'].get(n)
            if p is None: continue
            sh = self.shapes(p)
            off = REST.get(v, {}).get(n)
            if off: sh = [affinity.translate(g, off[0], off[1]) for g in sh]
            geo += sh
        u = unary_union(geo)
        if smooth:
            u = u.buffer(smooth).buffer(-smooth)
        if isinstance(u, MultiPolygon):
            u = max(u.geoms, key=lambda g: g.area)
        return u


# ---------------------------------------------------------------- matching two outlines

def resample(ring, n):
    p = np.asarray(ring, float)
    if np.allclose(p[0], p[-1]): p = p[:-1]
    # counter-clockwise on the page (y down): positive shoelace in a y-up frame
    a = np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if a > 0: p = p[::-1]
    q = np.vstack([p, p[:1]])
    seg = np.hypot(*np.diff(q, axis=0).T); s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.stack([np.interp(t, s, q[:, 0]), np.interp(t, s, q[:, 1])], 1)


def match_outlines(A, B, n=240, anchors=()):
    """Matched points along two closed outlines: B's point for each of A's n points. The outlines are compared in their
    own boxes (so a narrower drawing of the same shape still matches part for part), the best rotation of B's start
    is found, then dynamic time warping along both. anchors: pairs (a point near A's outline, a point near B's) that
    must match (the chin to the chin)."""
    a, b = resample(A, n), resample(B, n)
    def norm(p):
        lo, hi = p.min(0), p.max(0)
        return (p - (lo + hi) / 2) / np.maximum(hi - lo, 1e-6)
    an, bn = norm(a), norm(b)
    ta = np.gradient(an, axis=0); tb = np.gradient(bn, axis=0)
    ta /= np.linalg.norm(ta, axis=1, keepdims=True) + 1e-9; tb /= np.linalg.norm(tb, axis=1, keepdims=True) + 1e-9
    best, bs = 1e18, 0
    for s in range(n):
        c = np.sum((an - np.roll(bn, -s, 0)) ** 2)
        if c < best: best, bs = c, s
    if anchors:
        ia = int(np.argmin(np.hypot(*(a - np.asarray(anchors[0][0])).T)))
        ib = int(np.argmin(np.hypot(*(b - np.asarray(anchors[0][1])).T)))
        bs = (ib - ia) % n
    b = np.roll(b, -bs, 0); bn = np.roll(bn, -bs, 0); tb = np.roll(tb, -bs, 0)
    # DTW in a band, cost = place + a little direction
    D = np.hypot(*(an[:, None, :] - bn[None, :, :]).transpose(2, 0, 1)) + 0.15 * (1 - np.einsum('ik,jk->ij', ta, tb))
    W = n // 5
    big = 1e18
    acc = np.full((n, n), big)
    acc[0, 0] = D[0, 0]
    for i in range(n):
        j0, j1 = max(0, i - W), min(n, i + W + 1)
        for j in range(j0, j1):
            if i == 0 and j == 0: continue
            m = min(acc[i - 1, j] if i else big, acc[i, j - 1] if j else big, acc[i - 1, j - 1] if i and j else big)
            acc[i, j] = D[i, j] + m
    # walk back
    i, j = n - 1, n - 1
    pairs = [(i, j)]
    while i or j:
        cands = []
        if i and j: cands.append((acc[i - 1, j - 1], i - 1, j - 1))
        if i: cands.append((acc[i - 1, j], i - 1, j))
        if j: cands.append((acc[i, j - 1], i, j - 1))
        _, i, j = min(cands)
        pairs.append((i, j))
    pairs.reverse()
    sumb = np.zeros((n, 2)); cnt = np.zeros(n)
    for i, j in pairs:
        sumb[i] += b[j]; cnt[i] += 1
    return a, sumb / cnt[:, None]


# ---------------------------------------------------------------- the thin-plate spline

def U(r2):
    with np.errstate(divide='ignore', invalid='ignore'):
        u = 0.5 * r2 * np.log(r2)
    return np.nan_to_num(u)


SC = 100.0   # (fitted in hundreds of units: the system stays well conditioned)


def tps_fit(src, dst, lam=0.0):
    s = np.asarray(src, float) / SC; d = np.asarray(dst, float) / SC
    n = len(s)
    r2 = np.sum((s[:, None, :] - s[None, :, :]) ** 2, axis=2)
    K = U(r2) + lam * np.eye(n)
    P = np.hstack([np.ones((n, 1)), s])
    A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = P; A[n:, :n] = P.T
    rhs = np.zeros((n + 3, 2)); rhs[:n] = d
    sol = np.linalg.solve(A, rhs)
    return {'c': s, 'w': sol[:n], 'a': sol[n:]}


def tps_eval(T, pts):
    p = np.asarray(pts, float) / SC
    r2 = np.sum((p[:, None, :] - T['c'][None, :, :]) ** 2, axis=2)
    out = U(r2) @ T['w'] + T['a'][0] + p @ T['a'][1:]
    return out * SC


def jacobian(T, p, h=0.5):
    p = np.asarray(p, float)
    q = tps_eval(T, [p + [h, 0], p - [h, 0], p + [0, h], p - [0, h]])
    return np.stack([(q[0] - q[1]) / (2 * h), (q[2] - q[3]) / (2 * h)], 1)   # columns: d/dx, d/dy


# ---------------------------------------------------------------- what bends as one, and what matches what

SIDE_OF = {'front': {'L': 'r', 'R': 'l'}, 'quarter': {'L': 'r', 'R': 'l'}, 'side': {'L': 'l', 'R': 'r'}, 'back': {'L': 'l', 'R': 'r'}}
SWAP = {'r': 'l', 'l': 'r'}
HEAD_PARTS = ['hairback', 'hairbackLo', 'hairfront', 'hairfrontLo', 'face', 'eyeL', 'eyeR', 'mouth', 'neck', 'neckbase', 'neckTrap', 'faceTrap', 'headUnder']
HAIR_PARTS = ['hairback', 'hairbackLo', 'hairfront', 'hairfrontLo']
# Landmarks the outlines do not give, read off each drawing (view units): the tip of the nose and the bottom of the chin
NOSE = {'front': (1.5, -495.5), 'quarter': (22.7, -495.5), 'side': (-80.8, -497.2)}
CHIN = {'front': (1.2, -447.0), 'quarter': (8.0, -443.5), 'side': (-56.3, -447.0)}
# Side to back: the face goes round behind the hair. In the side view's own frame (facing left) it slides back and in
# (towards the middle of the head, where it would be at three-quarters round), narrowing, under the hair drawn over it.
FACE_AWAY = {'x0': -26.0, 'sx': 0.22, 'tx': 26.0, 'sy': 0.9, 'y0': -470.0}
HEAD_LAM = 0.004
# Side on, under everything of the head, the head's whole shape (hair, face, neck) in the hair's colour with an outline
# (emonad.py draws it from emonad_under.json, written here; the rig shows it only while the side view bends towards the
# back): as the face goes round under the hair, what it uncovers is the side of his head, never the room behind him. It
# is a little inside the shape it is made from, so it never shows past it, and by the swap it has become the halfway
# shape of the hair (its own map, 'full': the hair's map taken halfway, then that shape), so nothing of it is left over.
UNDER_PARTS = HAIR_PARTS + ['face', 'neck', 'neckbase']
UNDER_INSET = 1.4
UNDER_RING = 2.2
# (its face and neck opened by this much: the nose, the lips and the chin are taken off them, so where it shows in front
# of the face going away it is the round of his head, not a dark copy of his profile; the hair is not, or the opening
# took the gaps between the fringe's spikes too, and the room showed through them)
UNDER_OPEN = 7.0
UNDER_OUT = os.path.join(HERE, 'emonad_under.json')
# Where the rig draws a part at rest when that is not where the drawing has it (rig.ts REST: side on, the far leg stands
# a little further back, so higher on the page, and its shoe a little ahead): the maps are fitted to the parts as drawn
REST = {'side': {'thighR': (0.0, -9.0), 'shinR': (0.0, -9.0), 'shoeR': (-5.0, -9.0)}}
REST_PIV = {'side': {'thighR': (0.0, -9.0), 'shinR': (0.0, -9.0), 'footR': (-5.0, -9.0)}}


def under_shape(D, v='side'):
    """The head's whole shape a little inside its outline, as one polygon (its holes kept: background at rest)."""
    s0 = D.silhouette(v, UNDER_PARTS, smooth=0)
    hair = D.silhouette(v, HAIR_PARTS, smooth=0)
    skin = D.silhouette(v, [p for p in UNDER_PARTS if p not in HAIR_PARTS], smooth=0)
    # (and the skin in the narrow gaps between the hair's locks, which the opening took: the room showed in them)
    between = skin.intersection(hair.buffer(UNDER_OPEN + 1).buffer(-UNDER_OPEN - 1))
    u = unary_union([hair, skin.buffer(-UNDER_OPEN).buffer(UNDER_OPEN), between]).intersection(s0).buffer(-UNDER_INSET)
    if isinstance(u, MultiPolygon): u = max(u.geoms, key=lambda g: g.area)
    # (a hole that is not the room's at rest, but a pocket of skin the opening took, filled)
    keep = [r for r in u.interiors if Polygon(r).intersection(s0).area < 0.5 * Polygon(r).area]
    u = Polygon(u.exterior, keep)
    return u.simplify(0.12)


def poly_d(g):
    rings = [g.exterior] + list(g.interiors) if isinstance(g, Polygon) else [r for q in g.geoms for r in [q.exterior] + list(q.interiors)]
    return ''.join('M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in list(r.coords)[:-1]) + 'Z' for r in rings)


def write_under(D):
    U = under_shape(D, 'side')
    ring = U.difference(U.buffer(-UNDER_RING))
    json.dump({'side': {'fill': poly_d(U), 'ring': poly_d(ring)}}, open(UNDER_OUT, 'w'))
    print('wrote', os.path.relpath(UNDER_OUT), 'area', round(U.area), 'holes', len(U.interiors))


def turn_pairs():
    """Each pair of neighbouring drawings as the rig meets them: (A, B, rm), rm = A's mirror times B's. Both ways."""
    out = []
    for a, b, rm in [('front', 'quarter', 1), ('front', 'quarter', -1), ('quarter', 'side', -1), ('side', 'back', -1), ('side', 'back', 1)]:
        out += [(a, b, rm), (b, a, rm)]
    return out


def key(a, b, rm):
    return f'{a}>{b}{"+" if rm > 0 else "-"}'


def groups_of(D, v, split_face):
    """The groups that bend as one in a view: name -> its parts."""
    parts = D.views[v]['parts']
    g = {}
    # (the side view's head underlay: in the map even before the drawing has it, the first time it is made)
    head = [p for p in HEAD_PARTS if p in parts or (p == 'headUnder' and v == 'side')]
    if split_face:
        g['hair'] = [p for p in head if p in HAIR_PARTS]
        g['face'] = [p for p in head if p not in HAIR_PARTS and p != 'headUnder']
        if 'headUnder' in head: g['under'] = ['headUnder']
    else:
        g['head'] = head
    g['torso'] = ['torso']
    for s in 'LR':
        sd = SIDE_OF[v][s]
        if 'sleeve' + s in parts: g['sleeve_' + sd] = ['sleeve' + s]
        if 'thigh' + s in parts: g['leg_' + sd] = [p for p in ('thigh' + s, 'shin' + s) if p in parts]
        if 'shoe' + s in parts: g['shoe_' + sd] = ['shoe' + s]
        if 'arm' + s in parts: g['arm_' + sd] = [p for p in ('arm' + s, 'fore' + s, 'hand' + s) if p in parts]
    return {k: v_ for k, v_ in g.items() if v_}


def other_group(name, rm):
    if name[-2:] in ('_r', '_l') and rm < 0:
        return name[:-1] + SWAP[name[-1]]
    return name


class Frame:
    """Where B's points are in A's own frame: mirrored by rm, and (for the head) moved so the necks meet."""
    def __init__(self, D, a, b, rm, head):
        self.rm = rm
        na, nb = D.views[a]['piv']['neck'], D.views[b]['piv']['neck']
        self.off = (na[0] - rm * nb[0], na[1] - nb[1]) if head else (0.0, 0.0)

    def __call__(self, p):
        p = np.asarray(p, float)
        q = p.copy(); q[..., 0] = self.rm * p[..., 0] + self.off[0]; q[..., 1] = p[..., 1] + self.off[1]
        return q


def eye_units(D, v):
    out = {}
    for nm in ('eyeL', 'eyeR'):
        el = D.views[v]['parts'].get(nm)
        if el is not None:
            out['eye_' + SIDE_OF[v][nm[-1]]] = (nm, json.loads(el.get('data-geom')))
    return out


def head_landmarks(D, v):
    V = D.views[v]
    lm = {'neck': V['piv']['neck'], 'head': V['piv']['head']}
    if v in NOSE: lm['nose'] = NOSE[v]; lm['chin'] = CHIN[v]
    for u, (nm, g) in eye_units(D, v).items(): lm[u] = g['P']
    if 'mouth' in V['parts']: lm['mouth'] = json.loads(V['parts']['mouth'].get('data-geom'))['c']
    return lm


def body_landmarks(D, v, group):
    """Points of a group of the body that match between drawings, by name (the joints, and an arm's fingertips)."""
    piv = dict(D.views[v]['piv'])
    for b, off in REST_PIV.get(v, {}).items():
        if b in piv: piv[b] = [piv[b][0] + off[0], piv[b][1] + off[1]]
    side = {SIDE_OF[v]['L']: 'L', SIDE_OF[v]['R']: 'R'}
    if group == 'torso':
        return {'neck': piv['neck'], 'hips': piv['hips'], 'arm_r': piv['arm' + side['r']], 'arm_l': piv['arm' + side['l']]}
    kind, sd = group.split('_')
    s = side[sd]
    if kind == 'leg': return {'hip': piv['thigh' + s], 'knee': piv['shin' + s], 'ankle': piv['foot' + s]}
    if kind == 'shoe': return {'ankle': piv['foot' + s]}
    if kind == 'sleeve': return {'shoulder': piv['arm' + s]}
    if kind == 'arm':
        # (and the fingertips: the arm's drawing's furthest point down the forearm's way. Without it nothing said where
        # each drawing's hand points, and either side of a turn's swap the resting hand leaned opposite ways)
        E, Wr = piv['fore' + s], piv['hand' + s]
        d = np.array([Wr[0] - E[0], Wr[1] - E[1]], float); d /= max(1e-6, np.hypot(*d))
        ext = np.asarray(D.silhouette(v, ['arm' + s]).exterior.coords)
        off = REST.get(v, {}).get('arm' + s)
        tip = ext[int(np.argmax((ext - np.array(Wr)) @ d))]
        return {'shoulder': piv['arm' + s], 'elbow': E, 'wrist': Wr, 'tip': [float(tip[0]), float(tip[1])]}
    return {}


FRINGE = ['hairfront', 'hairfrontLo']


def visible_face(D, v, parts):
    """The face's skin as seen: the fringe over it taken off (the largest piece, smoothed). parts 'visible' for that, or
    a list of parts for their silhouette."""
    if parts != 'visible':
        return D.silhouette(v, parts, smooth=3.0)
    face = D.silhouette(v, ['face'], smooth=0)
    hair = D.silhouette(v, [p for p in FRINGE if p in D.views[v]['parts']], smooth=0)
    u = face.difference(hair).buffer(2.0).buffer(-3.0).buffer(1.0)
    if isinstance(u, MultiPolygon): u = max(u.geoms, key=lambda g: g.area)
    return u


def fit_group(D, a, b, rm, ga, gb, lm_a, lm_b, frame, lam, n=240, step=5, inner=()):
    """The spline for a group: through matched points of its outline, of any inner outlines (inner: pairs of part lists,
    A's and B's: the face inside the head, so the skin lands where the other drawing's skin is), and its landmarks."""
    A = D.silhouette(a, ga)
    B = D.silhouette(b, gb)
    bx = frame(np.asarray(B.exterior.coords))
    ca, cb = match_outlines(np.asarray(A.exterior.coords), bx, n=n)
    src, dst = [ca[::step]], [cb[::step]]
    errs = []
    for pa, pb in inner:
        IA, IB = visible_face(D, a, pa), visible_face(D, b, pb)
        ia, ib = match_outlines(np.asarray(IA.exterior.coords), frame(np.asarray(IB.exterior.coords)), n=160)
        src.append(ia[::step]); dst.append(ib[::step]); errs.append((ia, ib))
    keys = [k for k in lm_a if k in lm_b]
    if keys:
        src.append(np.array([lm_a[k] for k in keys])); dst.append(frame(np.array([lm_b[k] for k in keys])))
    T = tps_fit(np.vstack(src), np.vstack(dst), lam)
    err = np.hypot(*(tps_eval(T, ca) - cb).T)
    rep = {'outline_err_median': float(np.median(err)), 'outline_err_max': float(err.max()), 'landmarks': keys}
    for ia, ib in errs:
        e = np.hypot(*(tps_eval(T, ia) - ib).T)
        rep['landmarks'] = rep['landmarks'] + [f'inner {np.median(e):.2f}/{e.max():.2f}']
    return T, rep


def collapse_tps(x0, sx, tx, y0, sy, ty=0.0):
    """An affine map as a spline with no centres: x' = x0 + (x - x0) sx + tx, y' = y0 + (y - y0) sy + ty."""
    a = np.array([[(x0 * (1 - sx) + tx) / SC, (y0 * (1 - sy) + ty) / SC], [sx, 0.0], [0.0, sy]])
    return {'c': np.zeros((0, 2)), 'w': np.zeros((0, 2)), 'a': a}


def export_tps(T):
    r = lambda x: [float(f'{v:.6g}') for v in x]
    return {'c': [r(c) for c in T['c']], 'w': [r(w) for w in T['w']], 'a': [r(x) for x in T['a']]}


def mid_point(T, kind, p):
    q = tps_eval(T, [p])[0]
    return q if kind == 'full' else (np.asarray(p, float) + q) / 2


def mid_dir(T, kind, p, t):
    J = jacobian(T, p)
    if kind == 'half': J = (np.eye(2) + J) / 2
    v = J @ np.asarray(t, float)
    return v / (np.linalg.norm(v) + 1e-12)


def build(D):
    out = {'sc': SC, 'maps': {}, 'report': {}}
    for a, b, rm in turn_pairs():
        split = {a, b} == {'side', 'back'}
        GA, GB = groups_of(D, a, split), groups_of(D, b, split)
        maps, parts_of, report = {}, {}, {}
        hair_T = None
        for gname, ga in GA.items():
            gb_name = other_group(gname, rm)
            head = gname in ('head', 'hair', 'face')
            frame = Frame(D, a, b, rm, head)
            if gname == 'under':
                # the head's shape (as drawn here) to the halfway shape of the hair, whose map is already made
                Th = hair_T
                U = under_shape(D, a)
                hs = D.silhouette(a, GA['hair'])
                ext = np.asarray(hs.exterior.coords)
                mid = (ext + tps_eval(Th, ext)) / 2
                tgt = Polygon(mid).buffer(0).buffer(-UNDER_INSET)
                if isinstance(tgt, MultiPolygon): tgt = max(tgt.geoms, key=lambda g_: g_.area)
                ca, cb = match_outlines(np.asarray(U.exterior.coords), np.asarray(tgt.exterior.coords), n=240)
                la = {k: v_ for k, v_ in head_landmarks(D, a).items() if k in ('neck', 'head')}
                src = np.vstack([ca[::4], np.array(list(la.values()))])
                dst = np.vstack([cb[::4], np.array([mid_point(Th, 'half', p) for p in la.values()])])
                T = tps_fit(src, dst, HEAD_LAM)
                err = np.hypot(*(tps_eval(T, ca) - cb).T)
                maps[gname] = {'kind': 'full', **export_tps(T)}
                report[gname] = {'outline_err_median': float(np.median(err)), 'outline_err_max': float(err.max()), 'landmarks': list(la)}
            elif gname == 'face' and a == 'side':
                # (the face has nothing to match on the back: it goes round under the hair, all the way by the swap)
                F = FACE_AWAY
                T = collapse_tps(F['x0'], F['sx'], F['tx'], F['y0'], F['sy'])
                maps[gname] = {'kind': 'full', **export_tps(T)}
                report[gname] = 'away'
            elif gname == 'face' and a == 'back':
                # (the back's plain neck goes with the hair)
                gb = GB.get('hair')
                continue
            else:
                gb = GB.get(gb_name)
                if not gb:
                    report[gname] = 'no partner'
                    continue
                if head:
                    la, lb = head_landmarks(D, a), head_landmarks(D, b)
                    if rm < 0:
                        lb = {(('eye_' + SWAP[k[-1]]) if k.startswith('eye_') else k): v_ for k, v_ in lb.items()}
                    if split:
                        la = {k: v_ for k, v_ in la.items() if k in ('neck', 'head')}
                    inner = []
                    if not split and 'face' in ga and 'face' in gb:
                        # (the face as it is seen, the fringe over it taken off: the two drawings' faces then show the same
                        # at the swap. Matched as whole skin, the fringe stayed down over the three-quarter face while the
                        # profile's face is open: at the swap the face went from a sliver to a big white profile in a frame)
                        inner.append(('visible', 'visible'))
                    T, rep = fit_group(D, a, b, rm, ga, gb, la, lb, frame, lam=HEAD_LAM, step=4, inner=inner)
                else:
                    la = body_landmarks(D, a, gname); lb = body_landmarks(D, b, gb_name)
                    if rm < 0 and gname == 'torso':
                        lb = {(('arm_' + SWAP[k[-1]]) if k.startswith('arm_') else k): v_ for k, v_ in lb.items()}
                    T, rep = fit_group(D, a, b, rm, ga, gb, la, lb, frame, lam=0.01, n=160, step=4)
                maps[gname] = {'kind': 'half', **export_tps(T)}
                report[gname] = rep
                if gname == 'hair': hair_T = T
            for p in ga: parts_of[p] = gname
        if split and a == 'back':
            parts_of['neckbase'] = 'hair'
        # the eyes, worked out here (the rig draws them from these points every frame): where each of A's eyes is at the
        # swap; one with nothing to match on B (the far eye going round behind the nose, the eye going round under the
        # hair) shrinks to nothing at its inner corner by then
        eyes = {}
        eb = eye_units(D, b)
        for u, (nm, g) in eye_units(D, a).items():
            gmap = maps.get(parts_of.get(nm, ''))
            if not gmap: continue
            T = {'c': np.asarray(gmap['c']).reshape(-1, 2), 'w': np.asarray(gmap['w']).reshape(-1, 2), 'a': np.asarray(gmap['a'])}
            ub = ('eye_' + SWAP[u[-1]]) if rm < 0 else u
            pts = {k: g[k] for k in ('L', 'R', 'cu', 'cl', 'cc', 'P')}
            if ub in eb or gmap['kind'] == 'full':
                m = {k: [round(float(x), 3) for x in mid_point(T, gmap['kind'], p)] for k, p in pts.items()}
            else:
                # the inner corner: the one nearer the nose
                nose = NOSE.get(a, pts['P'])
                inner = min(('L', 'R'), key=lambda k: abs(pts[k][0] - nose[0]))
                c = mid_point(T, 'half', pts[inner])
                m = {k: [round(float(c[0]), 3), round(float(c[1]), 3)] for k in pts}
            eyes[nm] = m
        # the shoulders (the rig draws them every frame from these points): the shirt's points by the shirt's map, the
        # sleeve's by the sleeve's
        shoulders = {}
        for nm, el in D.views[a]['parts'].items():
            if not nm.startswith('shoulder'): continue
            q = json.loads(el.get('data-shoulder'))
            s = nm[-1]
            tm, sm = maps.get('torso'), maps.get('sleeve_' + SIDE_OF[a][s])
            if not tm or not sm: continue
            tt = {k: np.asarray(v_).reshape(-1, 2) if k != 'a' else np.asarray(v_) for k, v_ in tm.items() if k in ('c', 'w', 'a')}
            ss = {k: np.asarray(v_).reshape(-1, 2) if k != 'a' else np.asarray(v_) for k, v_ in sm.items() if k in ('c', 'w', 'a')}
            m = dict(q)
            for pk, dk, T in (('N', 'tN', tt), ('A', 'tA', tt), ('T', 'tT', ss), ('I', 'tI', ss)):
                m[pk] = [round(float(x), 3) for x in mid_point(T, 'half', q[pk])]
                m[dk] = [round(float(x), 5) for x in mid_dir(T, 'half', q[pk], q[dk])]
            shoulders[nm] = m
        k_ = key(a, b, rm)
        out['maps'][k_] = {'groups': maps, 'parts': parts_of, 'eyes': eyes, 'shoulders': shoulders}
        out['report'][k_] = report
    return out


def main():
    D = Drawing()
    write_under(D)
    res = build(D)
    rep = res.pop('report')
    for k, r in rep.items():
        print(k)
        for g, x in r.items():
            print('   ', g, x if isinstance(x, str) else f"outline err median {x['outline_err_median']:.2f} max {x['outline_err_max']:.2f}  lm {','.join(x['landmarks'])}")
    s = json.dumps(res, separators=(',', ':'))
    open(OUT, 'w').write(s)
    print('wrote', os.path.relpath(OUT), len(s) // 1024, 'KB')


if __name__ == '__main__':
    main()
