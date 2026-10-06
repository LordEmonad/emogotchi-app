"""
Emonad's rig drawing: packages/pet/emonad.svg, built from the traced sheet (emonad_traced.json, made by emonad_trace.py)
and the few pieces the sheet cannot give a rig: eyes that close and look (drawn on the sheet's own eyes, measured), the
mouths he does not make on the sheet, the far arm and leg of the side view (hidden behind the body there, and seen when
he walks), and the joints the rig redraws every frame (each knee, the side view's armpit), so a bent limb never opens
or pokes out.

    python3 packages/pet/design/emonad.py
    <scratch>/venv/bin/python packages/pet/design/emonad_morph.py      (the turn's in-betweens, read off the drawing)
    python3 packages/pet/design/emonad.py                              (again: it puts them in the drawing)

The drawing holds the four views of the sheet, each its own group (front, side facing left, back, three-quarter facing
right; the rig mirrors two of them for the other directions). Every coordinate is relative to the point between the feet
(0,0; up is negative), in the sheet's pixels, so the views stand on the same spot at the same size. Each part is a group
named for what it is (data-part) and for the bone that carries it (data-bone); the bones' pivots per view are on the
view's group (data-pivots, JSON). The rig (apps/web/src/emonad/rig.ts) moves the parts; nothing here animates.
"""
import json, os, math

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'emonad_traced.json')
OUT = os.path.join(HERE, '..', 'emonad.svg')

J = json.load(open(SRC))
COL = J['colors']
INK = COL['ink']

# ---------------------------------------------------------------- per view: origin, bones, eyes, mouths (sheet pixels)
ORIGIN = {v: tuple(J['views'][v]['origin']) for v in J['views']}

PIVOTS = {
    'front': {'hips': (197, 432), 'neck': (198, 236), 'head': (199, 214), 'hair': (196, 70),
              'armL': (131, 258), 'armR': (266, 258),
              'thighL': (165.52, 436), 'shinL': (164.3, 520), 'footL': (164, 606),
              'thighR': (228.92, 436), 'shinR': (230.5, 520), 'footR': (233, 606)},
    'side': {'hips': (490, 426), 'neck': (472, 238), 'head': (468, 214), 'hair': (478, 70),
             'armL': (494, 263), 'armR': (494, 263),   # (the shoulder joint, mid-way through the chest: further back, a
                                                        # raised arm came straight out of the shirt with its sleeve inside)
             'thighL': (487.49, 430), 'shinL': (489.65, 516), 'footL': (493, 606),
             'thighR': (487.49, 430), 'shinR': (489.65, 516), 'footR': (493, 606)},
    'back': {'hips': (785, 438), 'neck': (784, 240), 'head': (784, 216), 'hair': (782, 70),
             'armL': (719, 258), 'armR': (849, 258),
             'thighL': (752.05, 440), 'shinL': (751.65, 526), 'footL': (751, 616),
             'thighR': (814.72, 440), 'shinR': (815.03, 526), 'footR': (818, 616)},
    'quarter': {'hips': (1077, 436), 'neck': (1080, 238), 'head': (1082, 214), 'hair': (1086, 70),
                'armL': (1016, 258), 'armR': (1132, 262),
                'thighL': (1052.73, 438), 'shinL': (1048.2, 522), 'footL': (1050, 610),
                'thighR': (1104.9, 438), 'shinR': (1104.7, 522), 'footR': (1105, 600)},
}
# a plain neck under the traced one (white, a line down each side): on the sheet the hair covers the back of the neck,
# so when the head turns or nods and the hair lifts, there is neck under it, never a hole. Inside the traced neck's own
# lines where those show, so at rest it is hidden.
NECKBASE = {
    'front': [(177.5, 192), (213.5, 192), (215, 238), (176, 238)],
    'side': [(467, 192), (497, 192), (498, 228), (468, 240)],
    'quarter': [(1061, 192), (1101, 192), (1103, 238), (1062, 238)],
    'back': [(766, 192), (803, 192), (804, 228), (765, 228)],
}
# where the hair is cut in two: above it the hair stays with the face (the fringe lies over it, and the sheet has no
# face under the fringe); below it (the ends over the shoulders) it sways on its own spring
HAIR_SPLIT = {'front': 218, 'side': 218, 'quarter': 218, 'back': 220}
HAIR_FEATHER = 4.0   # (view units the hair's ends fade in over, above the split: see hair_svg)
# The knee itself is drawn by the rig every frame (rig.ts kneePath), from the leg's own edges at the knee: for the thigh
# ('t') and the shin ('s'), each edge's point on the knee's cut line and its way away from the knee, [x, y, dx, dy] in
# view units, on either side ('p' the side of +w, w = the piece's length turned a right angle; 'n' the other). Measured on
# the drawn leg by tools/emonad/knee-edges.cjs (a line fitted through 13 crossings of each edge, 3-27 units from the cut;
# every edge straight to within 0.06). On the outside of a bend the rig fills the opening between the two square ends
# with a curve that leaves each edge along its own line, and in the crease it rounds the corner a little: the disc these
# replaced was a hair wider than the leg and the side view's shin narrows below the knee, so bent, it stood out of the
# front of the knee as a knob with a notch under it.
KNEE_EDGES = {
    'front': {'L': {'t': {'p': [-48.34, -144.227, -0.02277, -0.99974], 'n': [-17.273, -143.776, 0.05042, -0.99873]},
                    's': {'p': [-48.104, -144.054, 0.0215, 0.99977], 'n': [-17.241, -143.946, -0.02908, 0.99958]}},
              'R': {'t': {'p': [18.304, -143.714, -0.04521, -0.99898], 'n': [48.77, -144.287, 0.01409, -0.9999]},
                    's': {'p': [18.489, -143.564, 0.03373, 0.99943], 'n': [48.666, -144.441, -0.01152, 0.99993]}}},
    'side': {'L': {'t': {'p': [-20.857, -146.485, -0.10963, -0.99397], 'n': [19.48, -147.498, 0.026, -0.99966]},
                    's': {'p': [-20.932, -146.234, 0.11237, 0.99367], 'n': [20.229, -147.766, 0.05075, 0.99871]}}},
    'back': {'L': {'t': {'p': [-48.685, -137.071, -0.046, -0.99894], 'n': [-17.862, -136.928, 0.03765, -0.99929]},
                    's': {'p': [-48.84, -137.112, 0.02277, 0.99974], 'n': [-17.858, -136.888, -0.02392, 0.99971]}},
              'R': {'t': {'p': [14.59, -136.944, -0.03776, -0.99929], 'n': [45.505, -137.056, 0.02441, -0.9997]},
                    's': {'p': [14.617, -136.491, 0.03348, 0.99944], 'n': [45.388, -137.507, -0.01275, 0.99992]}}},
    'quarter': {'L': {'t': {'p': [-44.095, -141.825, 0.0224, -0.99975], 'n': [-13.543, -140.177, 0.08721, -0.99619]},
                    's': {'p': [-44.128, -140.686, -0.03799, 0.99928], 'n': [-13.621, -141.31, -0.08623, 0.99628]}},
              'R': {'t': {'p': [13.621, -141.034, -0.0186, -0.99983], 'n': [42.026, -140.966, 0.03807, -0.99928]},
                    's': {'p': [13.355, -140.945, -0.01516, 0.99989], 'n': [41.895, -141.055, -0.04473, 0.999]}}},
}
KNEE_EDGES['side']['R'] = KNEE_EDGES['side']['L']   # (the far leg is the near one drawn again)
# Side on there is no shoulder piece (the near sleeve lies on the chest and turns whole), so an arm raised forward met the
# chest at a square corner, the sleeve's underside straight into the chest's front: a box stuck on. The rig rounds that
# corner every frame (rig.ts armpitSide): the sleeve's back edge, which is its underside once the arm comes forward (in
# the sleeve's drawing: its root end and its way down to the hem, and its length), and the chest's front (in the
# shirt's drawing: x as a cubic in y about y0, between ymin and ymax: the front is a curve, the chest into the belly,
# and a straight line through it left a step where the rounding ended). Measured on the drawing (scratchpad
# sideedges.cjs: the back edge is x 36.2 from y -414 to -350; the cubic is within 0.09 of the front from -400 to -332).
SIDE_ARMPIT = {'u': [36.2, -414.0, 0.0, 1.0, 64.0], 'c': [-365.0, -400.0, -332.0, -35.35444, -0.08577, 0.00120685, -1.112e-05]}
# Where a raised sleeve comes out of the shirt's outline with no shoulder piece to carry it (three-quarters, the far arm:
# it hangs behind the shirt; side on, the top of the near arm raised forward), the rig rounds the corner every frame
# (rig.ts filletPath): it finds where the sleeve's edge leaves the shirt's outline, and fills the corner between the two
# with a curve that leaves the outline along its own way and runs into the sleeve's edge along its way, the more the
# sharper the corner. So the shoulder runs on into the top of the arm, and the shirt's side into its underside. Each is
# the shirt's outline ('c', shirt's drawing, view units, from the neck's end down) and per corner the sleeve's edge ('s',
# the sleeve's drawing, from its root to its hem), which way along the outline is free of the sleeve ('free': -1 towards
# its start), which side of each line is inside ('inS', 'inC': +1 the side (-dy, dx) of the way along), and how far the
# curve may run along each ('a' the outline, 'b' the sleeve). Measured on the drawing (scratchpad spin/probe-q.cjs:
# the shirt's and the sleeves' outlines sampled every 2.5 units); re-measure after the trace changes the shirt or a sleeve.
_Q_FAR_SHIRT = [[22.0, -432.9], [24.4, -432.1], [26.5, -430.7], [28.6, -429.3], [30.7, -427.9], [32.8, -426.6], [34.7, -424.9],
                [36.1, -422.8], [37.3, -420.6], [38.5, -418.4], [39.6, -416.1], [40.7, -413.9], [41.3, -411.5], [41.4, -408.9],
                [41.6, -406.4], [41.8, -403.9], [41.9, -401.4], [42.0, -398.9], [42.2, -396.3], [42.4, -393.8], [42.5, -391.3],
                [42.7, -388.8], [42.8, -386.3], [42.9, -383.8], [43.1, -381.2], [43.3, -378.7], [43.4, -376.2], [43.5, -373.7],
                [43.6, -371.2], [43.8, -368.7], [43.9, -366.1], [44.0, -363.6], [44.1, -361.1], [44.3, -358.6], [44.3, -356.1],
                [44.1, -353.6], [44.0, -351.0], [43.9, -348.5], [43.8, -346.0]]
_Q_FAR_OUTER = [[43.4, -422.8], [45.2, -421.1], [46.3, -418.9], [48.0, -417.0], [49.6, -415.0], [50.9, -412.8], [52.2, -410.5],
                [53.3, -408.2], [54.2, -405.8], [54.8, -403.3], [55.4, -400.8], [55.9, -398.3], [56.4, -395.8], [56.8, -393.2],
                [57.3, -390.7], [57.8, -388.2], [58.2, -385.7], [58.6, -383.1], [58.9, -380.6], [59.3, -378.0], [59.7, -375.5],
                [60.1, -373.0], [60.6, -370.4], [61.0, -367.9], [61.4, -365.4], [61.9, -362.8], [62.0, -360.3]]
_Q_FAR_INNER = [[31.2, -422.6], [29.6, -420.9], [29.7, -418.4], [29.8, -415.9], [30.1, -413.3], [30.3, -410.8], [30.6, -408.2],
                [30.9, -405.7], [31.2, -403.2], [31.5, -400.6], [31.7, -398.1], [32.0, -395.6], [32.3, -393.0], [32.6, -390.5],
                [32.8, -388.0], [33.1, -385.4], [33.4, -382.9], [33.7, -380.4], [34.0, -377.8], [34.3, -375.3], [34.6, -372.8],
                [34.8, -370.2], [35.1, -367.7], [35.4, -365.2], [35.7, -362.6], [36.0, -360.1], [36.3, -357.6], [36.6, -355.0]]
_S_CHEST = [[-25.6, -418.1], [-26.8, -416.2], [-27.5, -414.3], [-28.0, -412.3], [-28.4, -410.4], [-28.8, -408.4], [-29.2, -406.5],
            [-29.6, -404.5], [-30.0, -402.6], [-30.4, -400.6], [-30.7, -398.6], [-31.1, -396.7], [-31.4, -394.7], [-31.8, -392.7],
            [-32.1, -390.8], [-32.5, -388.8], [-32.8, -386.8]]
_S_FRONT = [[-4.6, -414.9], [-7.1, -414.9], [-9.2, -413.9], [-9.7, -411.5], [-9.8, -409.0], [-9.7, -406.5], [-9.6, -404.0],
            [-9.6, -401.4], [-9.5, -398.9], [-9.4, -396.4], [-9.4, -393.8], [-9.3, -391.3], [-9.2, -388.8], [-9.1, -386.3],
            [-9.1, -383.7], [-9.0, -381.2], [-8.9, -378.7], [-8.8, -376.1], [-8.8, -373.6], [-8.7, -371.1], [-8.6, -368.6],
            [-8.5, -366.0], [-8.5, -363.5], [-8.4, -361.0], [-8.3, -358.5], [-8.2, -355.9], [-8.1, -353.4]]
FILLETS = {
    'quarter': {'R': {'c': _Q_FAR_SHIRT, 'subs': [
        dict(s=_Q_FAR_OUTER, free=-1, inS=1, inC=1, a=17, b=15),      # the shoulder: the shirt's side into the sleeve's top
        dict(s=_Q_FAR_INNER, free=1, inS=-1, inC=1, a=7, b=8)]}},     # the armpit: the shirt's side into its underside
    'side': {'L': {'c': _S_CHEST, 'subs': [dict(s=_S_FRONT, free=-1, inS=-1, inC=-1, a=6, b=10)]}},   # raised forward: the chest into its top
}
# (where each goes: before the shirt three-quarters, so the shirt lies over its inner end; after the near sleeve side on)
FILLET_BEFORE = {'quarter': 'torso'}
FILLET_AFTER = {'side': 'sleeveL'}
# Side on, the far leg's trousers are a shade off black: both legs are black with no line between them (the sheet draws
# them as one shape), so in a stride the far knee and shin merged into the near leg's outline as a knob with a notch under
# it, and nobody could tell which leg was which. A hair lighter, the far one reads as behind (it is hidden at rest).
FAR_INK = '#1A1520'
# the thigh's top is round about the hip (half the leg's width there, measured on the drawn leg; the hip pivots above are
# the leg's middle there, both re-measured after the trace stopped widening the leg's top under the hands and the shirt):
# turned, a square top stood out of the shirt's side and, side on, out of the seat as steps
HIP_R = {'front': {'L': 18.91, 'R': 18.29}, 'side': {'L': 27.26, 'R': 27.26}, 'back': {'L': 19.23, 'R': 18.67}, 'quarter': {'L': 17.85, 'R': 16.8}}
# Side on, the thigh's front and back edges are straight lines below the seat (measured on the drawn thigh, view units:
# two points each); the hip pivot above sits where both are 27.26 from it, so a disc of that radius has both edges as
# tangents at any turn. Above y_s the turning thigh is the disc and those two lines (the drawing's flare at the back, the
# seat, is cut off it); the flare is the butt, a piece on the hips (seat_svg), round underneath.
SIDE_THIGH = {'front': ((-29.1, -225.0), (-24.5, -180.0)), 'back': ((23.75, -220.0), (20.35, -180.0)), 'ys': -212.0,
              'butt': ((14.0, -238.0), 17.0)}

# the eyes: measured in emonad_trace.py (EYES), which also keeps them out of the hair
EYES = {v: J['views'][v].get('eyes', {}) for v in J['views']}

# the mouths: 'neutral' is the sheet's own (traced); the rest are drawn at the same place in the same line
MOUTH = {   # centre, half-width, line weight, slope (degrees)
    'front': ((197.6, 184.8), 11.7, 1.7, -2.4),
    'quarter': ((1098.2, 183.0), 13.0, 1.7, -12.5),
    'side': ((425.6, 186.9), 4.2, 1.6, 4.0),
}


def loc(v, p):
    o = ORIGIN[v]
    return (p[0] - o[0], p[1] - o[1])


def f(x):
    return f'{x:.2f}'.rstrip('0').rstrip('.')


def P(*pts):
    return ' '.join(f'{f(x)} {f(y)}' for x, y in pts)


# ---------------------------------------------------------------- pieces
def split_d(d):
    """A path's subpaths in groups that fill the same alone as together: each outline with the holes cut in it (the
    subpaths it directly contains, by nesting depth), every other subpath on its own. The turn bends a small piece as a
    whole (a transform) and has to rewrite a big one point by point every frame: one path of forty strands of shading
    across the whole head is a big one, forty paths are small ones. (Subpaths that cross one another are kept together
    whenever one starts inside the other.)"""
    import re
    subs = [s for s in re.split(r'(?=M)', d) if s.strip()]
    if len(subs) < 2:
        return [d]
    polys = []
    for s_ in subs:
        nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', s_)]
        polys.append(list(zip(nums[0::2], nums[1::2])))
    def inside(pt, poly):
        x, y = pt; c = False
        for i in range(len(poly)):
            x1, y1 = poly[i]; x2, y2 = poly[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
                c = not c
        return c
    def box(p):
        xs, ys = [q[0] for q in p], [q[1] for q in p]
        return min(xs), min(ys), max(xs), max(ys)
    boxes = [box(p) for p in polys]
    def within(i, j):
        a, b = boxes[i], boxes[j]
        return a[0] >= b[0] and a[1] >= b[1] and a[2] <= b[2] and a[3] <= b[3] and inside(polys[i][0], polys[j])
    cont = [[j for j in range(len(subs)) if j != i and within(i, j)] for i in range(len(subs))]
    depth = [len(c) for c in cont]
    root = list(range(len(subs)))
    for i in range(len(subs)):
        if depth[i] % 2 == 1:
            # a hole: goes with the smallest outline round it
            root[i] = max(cont[i], key=lambda j: depth[j])
    groups = {}
    for i in range(len(subs)):
        groups.setdefault(root[i], []).append(i)
    return [''.join(subs[i] for i in g) for _, g in sorted(groups.items(), key=lambda kv: kv[1][0])]


# the hair's texture (strands and shading): the rig eases it into the hair's colour at a turn's swap
DETAIL = ('hairlight', 'hairdeep', 'hairshade', 'hairdark')


def layers_svg(layers):
    out = []
    for l in layers:
        fill = COL[l['fill']]
        cls = ' class="hd"' if l['fill'] in DETAIL else ''
        for d in split_d(l['d']):
            out.append(f'<path{cls} fill="{fill}" fill-rule="{l.get("rule", "evenodd")}" d="{d}"/>')
    return ''.join(out)


# From the back his hair has nothing that moves across it as he turns (a face does from the front): at dead-back the
# picture stood still for a few frames of a 360. So there its strands and shading are in groups of their own (class
# `slide`) that the rig slides across as he turns past (rig.ts slideHair), clipped to the hair's own shape (the fill's
# paths, used in a clip, so they follow the turn's bend).
SLIDE = ('back',)


def slide_layers_svg(layers, art):
    out, fills, run = [], [], []
    clip = f'{art}-clip'
    def flush():
        if run:
            out.append(f'<g clip-path="url(#{clip})"><g class="slide">{"".join(run)}</g></g>')
            run.clear()
    for l in layers:
        fill = COL[l['fill']]
        detail = l['fill'] in DETAIL
        for d in split_d(l['d']):
            if detail:
                run.append(f'<path class="hd" fill="{fill}" fill-rule="{l.get("rule", "evenodd")}" d="{d}"/>')
                continue
            flush()
            if l['fill'] == 'hair':
                fid = f'{art}-f{len(fills)}'; fills.append(fid)
                out.append(f'<path id="{fid}" fill="{fill}" fill-rule="{l.get("rule", "evenodd")}" d="{d}"/>')
            else:
                out.append(f'<path fill="{fill}" fill-rule="{l.get("rule", "evenodd")}" d="{d}"/>')
    flush()
    uses = ''.join(f'<use href="#{fid}"/>' for fid in fills)
    return f'<clipPath id="{clip}" clip-rule="evenodd">{uses}</clipPath>' + ''.join(out)


def quad_through(a, apex, b):
    """The control point of a quadratic from a to b that passes through apex at its middle."""
    return (2 * apex[0] - (a[0] + b[0]) / 2, 2 * apex[1] - (a[1] + b[1]) / 2)


def eye_svg(v, name, e):
    wu, wl = J['views'][v].get('eye_w') or (1.6, 1.15)
    L = loc(v, e['L']); R = loc(v, e['R']); T = loc(v, e['T']); B = loc(v, e['B']); Pp = loc(v, e['P']); pr = e['pr']
    cu = quad_through(L, T, R); cl = quad_through(R, B, L)
    almond = f'M{P(L)}Q{P(cu)} {P(R)}Q{P(cl)} {P(L)}Z'
    upper = f'M{P(L)}Q{P(cu)} {P(R)}'
    lower = f'M{P(R)}Q{P(cl)} {P(L)}'
    cx = (L[0] + R[0]) / 2; cy = (T[1] + B[1]) / 2
    # closed: the lid down on the lower lid, a little lifted, the line heavier than the upper lid (and the eye's top
    # contour over it, the fold, thin: a crease), so a shut eye reads as shut, not as an empty eye
    mid = ((L[0] + R[0]) / 2, (L[1] + R[1]) / 2)
    B2 = (mid[0] + (B[0] - mid[0]) * 0.55, mid[1] + (B[1] - mid[1]) * 0.55)
    cc = quad_through(L, B2, R)
    closed = f'M{P(L)}Q{P(cc)} {P(R)}'
    clip = f'emonad-{v}-{name}-clip'
    geom = {'L': L, 'R': R, 'cu': cu, 'cl': cl, 'cc': cc, 'P': Pp, 'pr': pr}
    geom = json.dumps({k: (round(x, 2) if isinstance(x, float) else [round(a, 2) for a in x]) for k, x in geom.items()})
    # (under it all, the open eye's whole shape in skin, a lid's width over its edge, and over it the open eye's top
    # contour, shown while a lid is down: the rig lowers a lid by shrinking the white, and the face around the eye does
    # not reach in under it everywhere, so a lowered or shut lid showed the background between the eye and the fringe;
    # the contour keeps the eye's top edge against the hair, the lid line drops inside it)
    return (f'<g class="part eye" data-part="{name}" data-bone="head" data-geom=\'{geom}\'>'
            f'<clipPath id="{clip}"><path class="eye-clip" d="{almond}"/></clipPath>'
            f'<path class="eye-skin" fill="{COL["skin"]}" stroke="{COL["skin"]}" stroke-width="{f(wu * 0.6)}" stroke-linejoin="round" d="{almond}"/>'
            f'<g class="eye-open">'
            f'<path class="eye-white" fill="{COL["skin"]}" d="{almond}"/>'
            f'<g clip-path="url(#{clip})"><g class="pupil"><circle cx="{f(Pp[0])}" cy="{f(Pp[1])}" r="{f(pr)}" fill="{INK}"/></g></g>'
            f'<path class="lower" fill="none" stroke="{INK}" stroke-width="{f(wl)}" stroke-linecap="round" d="{lower}"/>'
            f'<path class="lid" fill="none" stroke="{INK}" stroke-width="{f(wu)}" stroke-linecap="round" d="{upper}"/>'
            f'</g>'
            f'<path class="eye-fold" display="none" fill="none" stroke="{INK}" stroke-width="{f(wu * 0.66)}" stroke-linecap="round" d="{upper}"/>'
            f'<path class="eye-closed" display="none" fill="none" stroke="{INK}" stroke-width="{f(wu * 1.3)}" stroke-linecap="round" d="{closed}"/>'
            f'</g>')


def mouths_svg(v, neutral_layers):
    c, hw, lw, slope = MOUTH[v]
    c = loc(v, c)
    x0, x1 = c[0] - hw, c[0] + hw
    y = c[1]
    st = f'fill="none" stroke="{INK}" stroke-width="{f(lw)}" stroke-linecap="round" stroke-linejoin="round"'
    curve = lambda dy_end, dy_mid, skew=0: f'<path {st} d="M{P((x0, y + dy_end))}Q{P((c[0] + skew, y + dy_mid))} {P((x1, y + dy_end - skew * 0.3))}"/>'
    side = v == 'side'
    m = {
        'neutral': layers_svg(neutral_layers),
        'flat': f'<path {st} d="M{P((x0, y))}L{P((x1, y))}"/>',
        'frown': curve(1.8, -2.6),
        'sad': curve(3.0, -3.6),
        'smile': curve(-1.2, 3.2),
        'smirk': f'<path {st} d="M{P((x0 + (1 if side else 0.5), y + 0.6))}Q{P((c[0] + hw * 0.2, y + 1.1))} {P((x1, y - (1.6 if side else 2.6)))}"/>',
        'open': f'<ellipse cx="{f(c[0] + (-0.8 if side else 0))}" cy="{f(y + 0.8)}" rx="{f(hw * (0.45 if side else 0.3))}" ry="{f(2.9)}" fill="{INK}"/>',
        'gasp': f'<ellipse cx="{f(c[0] + (-0.8 if side else 0))}" cy="{f(y + 1.2)}" rx="{f(hw * (0.4 if side else 0.24))}" ry="{f(4.0)}" fill="{INK}"/>',
        'sigh': f'<ellipse cx="{f(c[0] + (-0.6 if side else 0))}" cy="{f(y + 0.4)}" rx="{f(hw * (0.36 if side else 0.22))}" ry="{f(1.9)}" fill="{INK}"/>',
    }
    g = []
    for k, d in m.items():
        rot = '' if k == 'neutral' else f' transform="rotate({slope} {f(c[0])} {f(c[1])})"'
        g.append(f'<g class="mouth-shape" data-mouth="{k}"{"" if k == "neutral" else " display=\"none\""}{rot}>{d}</g>')
    geom = json.dumps({'c': [round(c[0], 2), round(c[1], 2)], 'hw': hw, 'lw': lw, 'slope': slope})
    g.append(f'<g class="mouth-shape" data-mouth="talk" display="none" transform="rotate({slope} {f(c[0])} {f(c[1])})">'
             f'<ellipse class="talk" cx="{f(c[0] + (-0.8 if side else 0))}" cy="{f(y + 0.6)}" rx="{f(hw * (0.42 if side else 0.3))}" ry="1" fill="{INK}"/></g>')
    return f'<g class="part mouth" data-part="mouth" data-bone="head" data-geom=\'{geom}\'>{"".join(g)}</g>'


def below_curve(c, uw, shift):
    """The region on the hand's side of a curve across the arm (the band's lower line's lower edge), the curve moved
    shift along the arm (negative: up it, under the band), run on far to each side and closed far down the arm."""
    nn = (-uw[1], uw[0]); R_ = 300
    c = [(q[0] + uw[0] * shift, q[1] + uw[1] * shift) for q in c]
    poly = [(c[0][0] - (c[-1][0] - c[0][0]) * 20, c[0][1] - (c[-1][1] - c[0][1]) * 20)] + list(c) + \
           [(c[-1][0] + (c[-1][0] - c[0][0]) * 20, c[-1][1] + (c[-1][1] - c[0][1]) * 20)]
    poly += [(poly[-1][0] + uw[0] * R_, poly[-1][1] + uw[1] * R_), (poly[0][0] + uw[0] * R_, poly[0][1] + uw[1] * R_)]
    return 'M' + 'L'.join(P(q) for q in poly) + 'Z'


def stump_svg(stp, uw, reach=None, band_r=None, lw=2.0):
    """The wrist's stump, under the hand: along the arm, from the pivot (the band's middle) down past where the hand's
    sides start under the band. Below the band's lower line it is as wide as the hand there (black to the outline's outer
    edge, the skin over it); above the line it narrows at once to sit inside the band (the hand flares a little wider
    than the band on the sheet) and runs on up to the pivot, where it is round. Turned with the hand, its sides are the
    hand's sides run on up, so a bent wrist comes out from under the band in one line; the rest stays under the band."""
    Pv, C, rs, wo = stp['p'], stp['c'], stp['rs'], stp['wo']
    nn = (-uw[1], uw[0])
    dC = (C[0] - Pv[0]) * uw[0] + (C[1] - Pv[1]) * uw[1]
    dLow = dC - 0.6                       # the band's lower line's lower edge (the hand's sides start a little below it)
    dTop = dLow - lw                      # its upper edge: from here up the stump is inside the band
    # (down past the hand's top, wherever the forearm ends: a band drawn without a lower line ends its forearm lower)
    depth = dC + 0.9
    if reach is not None:
        depth = max(depth, (reach[0] - Pv[0]) * uw[0] + (reach[1] - Pv[1]) * uw[1] + 0.9)
    hw = rs + wo
    top = min(hw, band_r - 0.3) if band_r else hw
    at = lambda d, h: (Pv[0] + uw[0] * d + nn[0] * h, Pv[1] + uw[1] * d + nn[1] * h)
    out = []
    for inset, col in ((0.04, INK), (wo - 0.02, COL['skin'])):
        a, b = max(0.5, top - inset), max(0.5, hw - inset)
        q = [at(0, a), at(dTop, a), at(dLow + 0.15, b), at(depth, b), at(depth, -b), at(dLow + 0.15, -b), at(dTop, -a), at(0, -a)]
        out.append(f'<path fill="{col}" d="M{"L".join(P(x) for x in q)}Z"/><circle cx="{f(Pv[0])}" cy="{f(Pv[1])}" r="{f(a)}" fill="{col}"/>')
    return f'<g class="stump">{"".join(out)}</g>'


def wjoint_c(w):
    """Where the hand turns: on the band line's lower edge, where the arm's middle (the hand's skin's middle under the
    band, the stump's) crosses it."""
    st, uw = w['stump'], w['u']
    A = st['c']; nn = (-uw[1], uw[0]); q = w['wcut']
    s_ = [(p[0] - A[0]) * nn[0] + (p[1] - A[1]) * nn[1] for p in q]
    for i in range(len(q) - 1):
        if s_[i] == 0 or s_[i] * s_[i + 1] < 0:
            t = s_[i] / (s_[i] - s_[i + 1]) if s_[i] != s_[i + 1] else 0
            return (q[i][0] + (q[i + 1][0] - q[i][0]) * t, q[i][1] + (q[i + 1][1] - q[i][1]) * t)
    return (A[0] - uw[0] * 0.6, A[1] - uw[1] * 0.6)


def wjoint_data(w):
    """The wrist as the rig draws it every frame (rig.ts wristJoint), like the elbow: the hand turns about the middle of
    the band line's lower edge (C); on the outside of the bend a wedge of skin with its outline (round about C) fills
    the gap between the band and the hand; on the inside the band is cut away below the line from C to where the band's
    side and the hand's side cross, and its lower line follows that cut. The band line's lower edge, its two ends (the
    outline's middle at each side), the hand's half width to its outline's middle, the line widths."""
    st = w['stump']
    C = wjoint_c(w)
    # (the band line's lower edge run on at each end, along its own way there, out to the hand's outline: on some arms
    # the sheet's band line stops short of the outline on one side (by up to 2.7), and the joint's corners are its ends)
    uw = w['u']; nn = (-uw[1], uw[0]); wh = st['rs'] + st['wo'] / 2
    q = [list(p_) for p_ in w['wcut']]
    across = lambda p_: (p_[0] - C[0]) * nn[0] + (p_[1] - C[1]) * nn[1]
    for end, prev in ((0, 1), (len(q) - 1, len(q) - 2)):
        a_e, a_p = across(q[end]), across(q[prev])
        if abs(a_e) < wh - 0.05 and abs(a_e - a_p) > 1e-6:
            k = (math.copysign(wh, a_e) - a_e) / (a_e - a_p)
            ext = [round(q[end][0] + (q[end][0] - q[prev][0]) * k, 2), round(q[end][1] + (q[end][1] - q[prev][1]) * k, 2)]
            if end == 0: q.insert(0, ext)
            else: q.append(ext)
    return {'c': [round(C[0], 3), round(C[1], 3)], 'u': [round(w['u'][0], 5), round(w['u'][1], 5)], 'wcut': q,
            'wh': round(st['rs'] + st['wo'] / 2, 3), 'wo': st['wo'], 'wi': st.get('wi', st['wo'] * 0.85)}


def wjoint_stump(wj, stp, uw, reach):
    """The wrist's stump for the joint: as wide as the hand (black to the outline's outer edge, the skin over it), its top
    the two chords from C to the band line's ends (above the band's lower edge, which bows down between them: hidden at
    rest), down past where the hand's own drawing starts. Turned about C, its top on the outside of the bend is the
    joint's wedge's edge exactly, so the two meet with no gap."""
    C = wj['c']; nn = (-uw[1], uw[0]); wo = stp['wo']; hw = stp['rs'] + wo
    ends = sorted(wj['wcut'][::max(1, len(wj['wcut']) - 1)], key=lambda q: (q[0] - C[0]) * nn[0] + (q[1] - C[1]) * nn[1])
    def corner(q, h):
        # (the chord from C through the end q, run on to the half width h across the arm)
        dq = ((q[0] - C[0]) * nn[0] + (q[1] - C[1]) * nn[1])
        k = h / abs(dq) if abs(dq) > 1e-6 else 1
        return (C[0] + (q[0] - C[0]) * k - uw[0] * 0.15, C[1] + (q[1] - C[1]) * k - uw[1] * 0.15)
    depth = max(0.9, (reach[0] - C[0]) * uw[0] + (reach[1] - C[1]) * uw[1] + 0.9) if reach is not None else 1.5
    out = []
    for inset, col in ((0.04, INK), (wo - 0.02, COL['skin'])):
        h = max(0.5, hw - inset)
        a0, a1 = corner(ends[0], h), corner(ends[1], h)
        top = (C[0] - uw[0] * 0.15, C[1] - uw[1] * 0.15)
        dn = lambda q: (q[0] + uw[0] * (depth - ((q[0] - C[0]) * uw[0] + (q[1] - C[1]) * uw[1])), q[1] + uw[1] * (depth - ((q[0] - C[0]) * uw[0] + (q[1] - C[1]) * uw[1])))
        q = [a0, top, a1, dn(a1), dn(a0)]
        out.append(f'<path fill="{col}" d="M{"L".join(P(x) for x in q)}Z"/>')
    return f'<g class="stump">{"".join(out)}</g>'


def arm_svg(v, p, name, far=False, rest_from=None):
    """An arm in three, at the elbow and the wrist: the hand, the forearm and the upper arm, each the whole traced arm
    (one drawing, used three times) clipped to its stretch. At the elbow the rig moves the clips as it bends (the inside
    of the bend is cut on the line halving the angle, so the two outlines meet in a clean corner; the outside on each
    part's own square cut, round over a black disc as wide as the arm: the outline carries on round the elbow), and a
    white disc over both hides the seam. At the wrist the forearm's band is drawn over the hand's top: the hand turns
    under it on the same pair of discs, black as wide as the band, white as wide as the hand's skin."""
    e = p['elbow']; w = p['wrist']; side = name[-1]
    E = (e['x'], e['y']); u = e['u']; r = e['r']; rin = e['r_in'] - 0.35
    uw = w['u']
    # the wrist's cut, a little below the band, across the hand where its sides run straight: the hand turns about its
    # middle; the forearm (band and all) keeps everything above it and is drawn over the hand
    Wc = (w['cx'] + uw[0] * 0, w['y'] + uw[1] * w['cd'])
    # (the forearm ends at the band's own lower line; the strip between it and the cut is the joint's discs, which at
    # rest are the hand's sides and skin there, and turned carry the outline round without a stub of the forearm's)
    # (with the band's curve to end on, the straight cut sits a little lower and only bounds the rig's elbow clip)
    wf = w['lw'] + 0.15 + (0.9 if 'wcut' in w else 0)
    Wf = (w['x'] + uw[0] * wf, w['y'] + uw[1] * wf)
    cls = 'part far' if far else 'part'
    def half(C, uu, sign):   # the side of the square cut through C across uu (sign -1: towards the shoulder)
        n = (-uu[1], uu[0]); R = 400
        a = (C[0] + n[0] * R, C[1] + n[1] * R); b = (C[0] - n[0] * R, C[1] - n[1] * R)
        c = (b[0] + sign * uu[0] * R, b[1] + sign * uu[1] * R); d = (a[0] + sign * uu[0] * R, a[1] + sign * uu[1] * R)
        return f'M{P(a)}L{P(b)}L{P(c)}L{P(d)}Z'
    def band(C1, u1, C2, u2):   # between the cut through C1 (keeping +u1) and the one through C2 (keeping -u2)
        n = (-u1[1], u1[0]); R = 400
        pts = [(C1[0] + n[0] * R, C1[1] + n[1] * R), (C1[0] - n[0] * R, C1[1] - n[1] * R)]
        m = (-u2[1], u2[0])
        pts += [(C2[0] - m[0] * R, C2[1] - m[1] * R), (C2[0] + m[0] * R, C2[1] + m[1] * R)]
        return 'M' + 'L'.join(P(q) for q in pts) + 'Z'
    art, up_id, lo_id, hd_id = (f'emonad-{v}-{name}-{k}' for k in ('art', 'up', 'lo', 'hd'))
    data = json.dumps({'x': round(E[0], 2), 'y': round(E[1], 2), 'u': [round(u[0], 4), round(u[1], 4)], 'r': r, 'rin': round(rin, 2),
                       'w': [round(Wf[0], 2), round(Wf[1], 2), round(uw[0], 4), round(uw[1], 4)]})
    use = f'<use href="#{art}"/>'
    # the hand's other shapes (open, fist, pointing: emonad_trace.py hand_set), hidden until a move asks for one
    shapes = ''.join(f'<g class="hand-{k}" display="none">{layers_svg(L)}</g>' for k, L in p.get('hands', {}).items())
    rest = f'<g class="hand-rest" clip-path="url(#{hd_id})">{use}</g>'
    sub = ''
    if rest_from:
        # (the sheet shows this hand only in part, behind the leg; when the arm moves it needs all of it: another view's
        # whole hand, set on this wrist, turned to this arm, sized to this hand and seen from the other side)
        sp = rest_from
        ws = sp['wrist']; us = ws['u']
        Wcs = (ws['cx'], ws['y'] + us[1] * ws['cd'])
        k = ((w['cr'] + w['crin']) / 2) / ((ws['cr'] + ws['crin']) / 2)
        ns = (us[1], -us[0]); nq = (uw[1], -uw[0])
        M = [[uw[0] * k * us[0] - nq[0] * k * ns[0], uw[0] * k * us[1] - nq[0] * k * ns[1]],
             [uw[1] * k * us[0] - nq[1] * k * ns[0], uw[1] * k * us[1] - nq[1] * k * ns[1]]]
        tx = Wc[0] - (M[0][0] * Wcs[0] + M[0][1] * Wcs[1]); ty = Wc[1] - (M[1][0] * Wcs[0] + M[1][1] * Wcs[1])
        sub_id = f'emonad-{v}-{name}-subhand'
        sub = f'<defs><g id="{sub_id}">{layers_svg(sp["layers"])}</g></defs>'
        mat = ' '.join(f(x) for x in (M[0][0], M[1][0], M[0][1], M[1][1], tx, ty))
        rest = f'<g class="hand-rest" clip-path="url(#{hd_id})"><g transform="matrix({mat})"><use href="#{sub_id}"/></g></g>'
    # The wrist (see stump_svg): the hand's drawing starts just under the band's lower line (the forearm, drawn over
    # it, ends exactly on that line; the hand half a unit lower, so none of the band's purple that runs under the line
    # comes with the hand), and under the hand is the stump, which fills that half unit and carries the hand's own sides
    # on up round the pivot in the band's middle. At rest nothing of it shows: the outline is the drawing's own.
    stp = w.get('stump')
    if stp and 'wcut' in w:
        clip_d = below_curve(w['wcut'], uw, 0.55)
        top = max(w['wcut'], key=lambda q: (q[0] - stp['p'][0]) * uw[0] + (q[1] - stp['p'][1]) * uw[1])
        reach = (top[0] + uw[0] * 0.55, top[1] + uw[1] * 0.55)
    else:
        clip_d = half((Wf[0] + uw[0] * 0.12, Wf[1] + uw[1] * 0.12), uw, 1)
        reach = (Wf[0] + uw[0] * 0.12, Wf[1] + uw[1] * 0.12)
    wj = wjoint_data(w) if stp and 'wcut' in w else None
    joint = wjoint_stump(wj, stp, uw, reach) if wj else stump_svg(stp, uw, reach, w.get('r'), w.get('lw', 2.0)) if stp else (f'<circle cx="{f(Wc[0])}" cy="{f(Wc[1])}" r="{f(w["cr"] - 0.1)}" fill="{INK}"/>'
                                           f'<circle class="seam" cx="{f(Wc[0])}" cy="{f(Wc[1])}" r="{f(w["crin"] - 0.15)}" fill="{COL["skin"]}"/>')
    wjd = f" data-wjoint='{json.dumps(wj)}'" if wj else ''
    hand = (f'<g class="{cls}" data-part="hand{side}" data-bone="hand{side}"{wjd}>'
            f'<clipPath id="{hd_id}"><path d="{clip_d}"/></clipPath>'
            f'{joint}' + (f'<path class="wj-skin" fill="{COL["skin"]}" d=""/><path class="wj-ink" fill="none" stroke="{INK}" '
                          f'stroke-width="{f(wj["wo"])}" stroke-linejoin="round" stroke-linecap="round" d=""/>' if wj else '') +
            f'{rest}{shapes}</g>')
    wc_id = f'emonad-{v}-{name}-wc'
    if 'wcut' in w:
        # the forearm ends along the band's bottom line's lower edge (a curve), run on far to each side and closed up the arm
        c = w['wcut']; nn = (-uw[1], uw[0]); R_ = 300
        a_ = (c[0][0] - nn[0] * R_ * (1 if (c[0][0] - c[-1][0]) * nn[0] + (c[0][1] - c[-1][1]) * nn[1] > 0 else -1), c[0][1])
        poly = [(c[0][0] - (c[-1][0] - c[0][0]) * 20, c[0][1] - (c[-1][1] - c[0][1]) * 20)] + [tuple(q) for q in c] + \
               [(c[-1][0] + (c[-1][0] - c[0][0]) * 20, c[-1][1] + (c[-1][1] - c[0][1]) * 20)]
        poly += [(poly[-1][0] - uw[0] * R_, poly[-1][1] - uw[1] * R_), (poly[0][0] - uw[0] * R_, poly[0][1] - uw[1] * R_)]
        wclip = f'<clipPath id="{wc_id}"><path d="M{"L".join(P(q) for q in poly)}Z"/></clipPath>'
        inner_use = f'<g clip-path="url(#{wc_id})">{use}</g>'
    else:
        wclip, inner_use = '', use
    wx_id = f'emonad-{v}-{name}-wx'
    if wj:
        inner_use = f'<clipPath id="{wx_id}"><path class="wj-clip" d="M-400 -1000H400V400H-400Z"/></clipPath><g clip-path="url(#{wx_id})">{inner_use}</g>'
    wline = (f'<path class="wj-line" fill="none" stroke="{INK}" stroke-width="{f(wj["wi"])}" stroke-linecap="round" d=""/>' if wj else '')
    fore = (f'<g class="{cls}" data-part="fore{side}" data-bone="fore{side}" data-elbow=\'{data}\'>'
            f'<clipPath id="{lo_id}"><path class="cut" d="{band(E, u, Wf, uw)}"/></clipPath>{wclip}'
            f'<circle cx="{f(E[0])}" cy="{f(E[1])}" r="{f(r)}" fill="{INK}"/>'
            f'<g clip-path="url(#{lo_id})">{inner_use}</g>{wline}</g>')
    upper = (f'<g class="{cls}" data-part="arm{side}" data-bone="arm{side}">'
             f'<clipPath id="{up_id}"><path class="cut" d="{half(E, u, -1)}"/></clipPath>'
             f'<g clip-path="url(#{up_id})">{use}</g>'
             f'<circle class="seam" cx="{f(E[0])}" cy="{f(E[1])}" r="{f(rin)}" fill="{COL["skin"]}"/></g>')
    return f'<defs><g id="{art}">{layers_svg(p["layers"])}</g></defs>' + sub + hand + fore + upper


def shoulder_svg(v, side, g):
    """The shoulder between the shirt (cut along N-A) and the sleeve (cut along T-I): the rig redraws it every frame from
    where the arm is (rig.ts, shoulderPath); this is the same drawing at rest, so the file alone shows the sheet."""
    q = {k: (loc(v, val) if k in ('N', 'T', 'I', 'A') else val) for k, val in g.items()}
    d = shoulder_path(q['N'], q['tN'], q['T'], q['tT'], q['I'], q['tI'], q['A'], q['tA'], 1 if side == 'L' else -1, q['a'], q['b'])
    data = json.dumps({k: ([round(a, 4) for a in val] if isinstance(val, (list, tuple)) else round(val, 4)) for k, val in q.items()})
    return f'<g class="part shoulder" data-part="shoulder{side}" data-bone="spine" data-arm="arm{side}" data-shoulder=\'{data}\'><path fill="{INK}" d="{d}"/></g>'


def armpit(I, tT, A, tA):
    """The armpit: the shirt's side (up from A, against tA) and the sleeve's underside (back from I towards the root,
    against tT) run on until they meet, and the corner between them is rounded a little. Where they would meet far
    up (the arm still close to the body), the side runs up at most 10 and the underside comes straight to it."""
    # A - s tA = I - u tT
    det = (-tA[0]) * tT[1] - (-tA[1]) * tT[0]
    s_ = None
    if abs(det) > 1e-6:
        rx, ry = I[0] - A[0], I[1] - A[1]
        s_ = (rx * tT[1] - ry * tT[0]) / det
        u_ = ((-tA[0]) * ry - (-tA[1]) * rx) / det
        if s_ < -14 or u_ < 0:      # (they may meet below A, on the shirt's side further down)
            s_ = None
    s_ = 10.0 if s_ is None else min(10.0, s_)
    X = (A[0] - tA[0] * s_, A[1] - tA[1] * s_)
    li = math.hypot(X[0] - I[0], X[1] - I[1]); la = math.hypot(X[0] - A[0], X[1] - A[1])
    # (rounded the more the arm is raised; rig.ts armpitPath, the same: at rest, hanging, it is 3)
    op = math.degrees(math.acos(max(-1.0, min(1.0, tA[0] * tT[0] + tA[1] * tT[1]))))
    kk = max(0.0, min(1.0, (op - 25) / 75)); kk = kk * kk * (3 - 2 * kk)
    rr = 3 + 9 * kk
    r = min(rr, 0.45 * li, max(0.0, s_) + 10)
    p1 = (X[0] + (I[0] - X[0]) * r / max(li, 1e-6), X[1] + (I[1] - X[1]) * r / max(li, 1e-6))
    p2 = (X[0] + tA[0] * r, X[1] + tA[1] * r)
    return p1, X, p2


def shoulder_path(N, tN, T, tT, I, tI, A, tA, inward, ha, hb):
    """(rig.ts's shoulderPath does the same arithmetic)"""
    dist = math.hypot(T[0] - N[0], T[1] - N[1])
    c1 = (N[0] + tN[0] * ha * dist, N[1] + tN[1] * ha * dist)
    c2 = (T[0] - tT[0] * hb * dist, T[1] - tT[1] * hb * dist)
    p1, X, p2 = armpit(I, tI, A, tA)
    o = lambda p_, dx, dy: (p_[0] + dx, p_[1] + dy)
    return (f'M{P(N)}C{P(c1)} {P(c2)} {P(T)}L{P(o(T, tT[0] * 3, tT[1] * 3))}L{P(o(I, tI[0] * 3, tI[1] * 3))}L{P(I)}'
            f'L{P(p1)}Q{P(X)} {P(p2)}L{P(A)}L{P(o(A, inward * 4, 0))}L{P(o(N, inward * 4, 4))}Z')


BONE = {'thighL': 'thighL', 'shinL': 'shinL', 'shoeL': 'footL', 'thighR': 'thighR', 'shinR': 'shinR', 'shoeR': 'footR',
        'torso': 'spine', 'neck': 'neck', 'armL': 'armL', 'sleeveL': 'sleeveL', 'armR': 'armR', 'sleeveR': 'sleeveR',
        'hairback': 'hair', 'hairfront': 'hair', 'face': 'head'}


# skin that the hair covers at rest has no outline of its own (the sheet never drew one): a black stroke of the face's and
# the neck's skin edges (a trap), each its own part on its own bone, drawn under everything of the head (the rig puts them
# first in the head's group), so it is hidden wherever any skin, line or hair covers it (the face and the neck cover each
# other's where they meet) and is a clean outline wherever a turn of the head or a swing of the hair uncovers an edge
TRAP_W = 2.0


def trap_svg(p, bone):
    d = ''.join(f'<path fill="none" stroke="{INK}" stroke-width="{TRAP_W}" stroke-linejoin="round" d="{l["d"]}"/>'
                for l in p['layers'] if l['fill'] == 'skin')
    return f'<g class="part" data-part="{p["name"]}Trap" data-bone="{bone}">{d}</g>'


UNDER = os.path.join(HERE, 'emonad_under.json')


def under_svg(v):
    """Side on, the head's whole shape in the hair's colour, outlined (emonad_morph.py makes it: see UNDER_PARTS there),
    under everything of the head. Hidden but while the side view bends towards the back, when the face going round
    under the hair would otherwise uncover the room."""
    if not os.path.exists(UNDER):
        return ''
    u = json.load(open(UNDER)).get(v)
    if not u:
        return ''
    return (f'<g class="part under" data-part="headUnder" data-bone="head" display="none">'
            f'<path fill="{COL["hair"]}" fill-rule="evenodd" d="{u["fill"]}"/>'
            f'<path fill="{INK}" fill-rule="evenodd" d="{u["ring"]}"/></g>')


def knee_cut(v, name):
    """A leg piece cut square at the knee, across its own length: the thigh keeps what is above the knee, the shin what
    is below (each a hair past it, black on black). Bent, the two square ends open a wedge on the outside of the knee,
    which the rig's knee fills to a curve (rig.ts kneePath), and overlap on the inside, the crease. (Uncut, each ran on
    past the knee and its corners stood out of the bend as a spur.)"""
    side = name[-1]
    H, Kp, A = (loc(v, PIVOTS[v][k + side]) for k in ('thigh', 'shin', 'foot'))
    if name.startswith('thigh'):
        d = (Kp[0] - H[0], Kp[1] - H[1]); keep = -1
    else:
        d = (A[0] - Kp[0], A[1] - Kp[1]); keep = 1
    n = (d[0] ** 2 + d[1] ** 2) ** 0.5; u = (d[0] / n, d[1] / n); w = (-u[1], u[0]); R = 400
    C = (Kp[0] - keep * u[0] * 0.5, Kp[1] - keep * u[1] * 0.5)      # (the line a hair past the knee, into the other piece)
    q = [(C[0] + w[0] * R, C[1] + w[1] * R), (C[0] - w[0] * R, C[1] - w[1] * R)]
    q += [(q[1][0] + keep * u[0] * R, q[1][1] + keep * u[1] * R), (q[0][0] + keep * u[0] * R, q[0][1] + keep * u[1] * R)]
    cid = f'emonad-{v}-{name}-kc'
    if name.startswith('thigh') and v == 'side':
        # (side on: the disc, the two edges as tangents from it down to y_s, and everything below y_s to the knee)
        r = HIP_R[v][side]
        def foot(a, b):
            d = (b[0] - a[0], b[1] - a[1]); n_ = (d[0] ** 2 + d[1] ** 2) ** 0.5; d = (d[0] / n_, d[1] / n_)
            t = (H[0] - a[0]) * d[0] + (H[1] - a[1]) * d[1]
            return (a[0] + d[0] * t, a[1] + d[1] * t), d
        (Tf, df), (Tb, db) = foot(*SIDE_THIGH['front']), foot(*SIDE_THIGH['back'])
        ys = SIDE_THIGH['ys']
        Bf = (Tf[0] + df[0] * (ys - Tf[1]) / df[1], ys); Bb = (Tb[0] + db[0] * (ys - Tb[1]) / db[1], ys)
        quad = [Tf, Tb, Bb, Bf]
        low = [(-400, ys), (400, ys), (C[0] + w[0] * R, C[1] + w[1] * R), (C[0] - w[0] * R, C[1] - w[1] * R)]
        if low[2][0] < low[3][0]:
            low[2], low[3] = low[3], low[2]
        return cid, (f'<clipPath id="{cid}"><circle cx="{f(H[0])}" cy="{f(H[1])}" r="{f(r)}"/>'
                     f'<path d="M{"L".join(P(x) for x in quad)}Z"/><path d="M{"L".join(P(x) for x in low)}Z"/></clipPath>')
    if name.startswith('thigh'):
        # (and at the top: from the hip's line across the leg down, and round over the hip, so that turning about the
        # hip it never shows a corner; above the hip it is under the shirt)
        q = [(H[0] + w[0] * R, H[1] + w[1] * R), (H[0] - w[0] * R, H[1] - w[1] * R), (C[0] - w[0] * R, C[1] - w[1] * R), (C[0] + w[0] * R, C[1] + w[1] * R)]
        r = HIP_R[v][side]
        return cid, (f'<clipPath id="{cid}"><path d="M{"L".join(P(x) for x in q)}Z"/>'
                     f'<circle cx="{f(H[0])}" cy="{f(H[1])}" r="{f(r)}"/></clipPath>')
    return cid, f'<clipPath id="{cid}"><path d="M{"L".join(P(x) for x in q)}Z"/></clipPath>'


def seat_svg(v, p):
    """Side on, the seat and the butt: the trousers between the shirt's hem and the hip, and the seat's flare at the back
    down to where the thigh's back edge runs straight (round underneath, the fold under the butt), as one piece on the
    hips, under the shirt and the near thigh. Side on the seat is wider than the leg at the hip, so it cannot turn with a
    thigh (the near and far thighs swung it two ways at once: steps at the back of the hips in every stride); it stays
    with the hips, and the thighs, a disc and two straight edges at the top (knee_cut), turn under it."""
    H = loc(v, PIVOTS[v]['thighL'])
    (bc, br) = SIDE_THIGH['butt']
    cid = f'emonad-{v}-seat'
    return (f'<g class="part" data-part="seat" data-bone="hips"><clipPath id="{cid}"><rect x="-400" y="{f(H[1] - 400)}" width="800" height="400"/>'
            f'<circle cx="{f(bc[0])}" cy="{f(bc[1])}" r="{f(br)}"/></clipPath>'
            f'<g clip-path="url(#{cid})">{layers_svg(p["layers"])}</g></g>')


# Each trouser leg's hem (measured off the drawing: its bottom, and its edges 1 and 7 units above that), for the leg's run
# on down inside its shoe: drawn under the trousers, hidden by the shoe at rest; as a foot tips (toe off, heel strike, a
# jump's pointed toes) the shoe turns about the ankle above it, its collar dropped away from the hem's corner on one side,
# and the background showed in the gap. (The far leg's trousers are one flat shape with no outline: so is this.)
HEM = {
    'side': {'L': (-36.8, (-6.23, 24.10), (-8.14, 23.88))},
    'front': {'L': (-42.8, (-50.71, -18.04), (-49.48, -18.87)), 'R': (-42.8, (19.83, 52.13), (20.53, 50.96))},
    'quarter': {'L': (-36.8, (-47.05, -6.65), (-46.94, -8.21)), 'R': (-48.8, (12.78, 45.05), (12.77, 44.85))},
    'back': {'L': (-30.8, (-51.0, -18.76), (-51.10, -18.68)), 'R': (-30.8, (16.53, 51.25), (16.59, 51.23))},
}
HEM_RUN = 11


def hem_run(v, side):
    yb, (l1, r1), (l7, r7) = HEM[v][side]
    # (flush with the trousers' own edges, a hair inside: inset any more, it showed as a step where the hem ends)
    k = 0.15
    pts = [(l7 + k, yb - 7), (l1 + k, yb - 1), (l1 + k + 0.4, yb + HEM_RUN - 3), (l1 + k + 3, yb + HEM_RUN),
           (r1 - k - 3, yb + HEM_RUN), (r1 - k - 0.4, yb + HEM_RUN - 3), (r1 - k, yb - 1), (r7 - k, yb - 7)]
    return f'<path class="hemrun" fill="{INK}" d="M{P(*pts)}Z"/>'


# Each trouser leg's bottom (the last 24 units of it, up past the top of the shoe's tongue, measured off the drawing), drawn again in its SHOE's frame, under
# the shoe: at rest exactly on the trouser (a hair inside it). As a foot tips the shoe turns about the ankle, above the
# hem, and its tongue swings away from the trouser's front edge: the background showed in the pocket between them. This
# goes with the tongue and fills it, as the hem run fills under the hem's corners.
HEM_FOOT = {"side": {"L": [[-6.0, -36.8], [24.1, -36.8], [23.4, -60.8], [-13.1, -60.8], [-10.6, -50.9], [-7.6, -43.3]]}, "front": {"L": [[-50.8, -42.8], [-17.9, -42.8], [-18.9, -50.1], [-18.8, -66.8], [-46.9, -66.8], [-46.9, -57.6], [-49.6, -50.2]], "R": [[19.8, -42.8], [52.2, -42.8], [51.3, -49.6], [48.3, -58.1], [48.1, -66.8], [20.6, -66.8], [20.7, -54.5]]}, "quarter": {"R": [[12.8, -48.8], [45.1, -48.8], [44.4, -63.6], [43.4, -64.3], [40.5, -65.1], [40.0, -65.7], [39.8, -72.8], [12.6, -72.8]], "L": [[-47.1, -36.8], [-6.6, -36.8], [-7.3, -44.5], [-10.8, -45.6], [-16.1, -53.1], [-17.4, -54.4], [-19.2, -55.3], [-19.2, -60.8], [-46.6, -60.8]]}, "back": {"L": [[-50.9, -30.8], [-18.8, -30.8], [-19.1, -54.8], [-47.4, -54.8], [-48.8, -46.8], [-50.9, -43.4]], "R": [[16.5, -30.8], [51.2, -30.8], [50.9, -41.1], [49.1, -42.5], [47.0, -46.5], [44.9, -54.8], [16.7, -54.8]]}}


def hem_foot(v, side, fill, dx=0.0):
    pts = HEM_FOOT[v][side]
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    sx, sy = 1 - 0.8 / (max(xs) - min(xs)), 1 - 0.8 / (max(ys) - min(ys))
    return f'<path class="hemfoot" fill="{fill}" d="M{P(*[(cx + (x - cx) * sx + dx, cy + (y - cy) * sy) for x, y in pts])}Z"/>'


def part_svg(v, p, name=None, bone=None, extra=''):
    name = name or p['name']
    bone = bone or BONE[p['name']]
    if name[:-1] in ('thigh', 'shin') and name[-1] in 'LR':
        cid, cdef = knee_cut(v, name)
        kd = f' data-knee=\'{json.dumps(KNEE_EDGES[v][name[-1]])}\'' if name.startswith('shin') else ''
        run = hem_run(v, p['name'][-1]) if name.startswith('shin') and p['name'][-1] in HEM.get(v, {}) else ''
        return f'<g class="part" data-part="{name}" data-bone="{bone}"{kd}>{cdef}{run}<g clip-path="url(#{cid})">{layers_svg(p["layers"])}</g>{extra}</g>'
    hf = ''
    if name.startswith('shoe') and p['name'][-1] in HEM_FOOT.get(v, {}):
        # (the side view's far shoe stands 5 units ahead of its shin's end, rig.ts REST.side.footR: the patch, which must lie
        # on the trousers, goes back by as much)
        far = v == 'side' and name[-1] == 'R'
        hf = hem_foot(v, p['name'][-1], FAR_INK if far else INK, 5.0 if far else 0.0)
    return f'<g class="part" data-part="{name}" data-bone="{bone}">{hf}{layers_svg(p["layers"])}{extra}</g>'


# a pocket the trace left unfilled inside the side view's neck, at its foot (the sheet's white collar band): filled with
# skin under the neck's own lines (found by mapping what covers each point there: nothing did)
NECK_PATCH = {'side': [(464.5, 238.5), (474.5, 238.5), (474.5, 248), (464.5, 248)]}


def neckbase_svg(v):
    pts = [loc(v, p) for p in NECKBASE[v]]
    patch = ''.join(f'<path fill="{COL["skin"]}" d="M{P(*[loc(v, q) for q in NECK_PATCH[v]])}Z"/>' for _ in [0] if v in NECK_PATCH)
    a, b, c, d = pts
    st = f'fill="none" stroke="{INK}" stroke-width="2.3" stroke-linecap="round"'
    # (under it a black plug a little larger: the head is drawn over the shirt, and where the neck's foot meets the collar
    # a hairline seam let the background through at the throat; the plug's edge stays inside the neck's own lines, and
    # below the collar it is black on the black shirt)
    return (f'<g class="part" data-part="neckbase" data-bone="neck">'
            f'<path fill="{INK}" stroke="{INK}" stroke-width="3.4" stroke-linejoin="round" d="M{P(*pts)}Z"/>'
            f'<path fill="{COL["skin"]}" d="M{P(*pts)}Z"/>{patch}'
            f'<path {st} d="M{P(a, d)}"/><path {st} d="M{P(b, c)}"/></g>')


# Islands the trace left in the hair, a few units across (with their own ink), lying off the hair itself: the front's and
# the three-quarter's over the neck, by the collar's end, where they sat in the hair at rest and slid onto the white
# collar as a black spot whenever the hair's ends swung (a sigh, a nod); two dots at the top of the side view's hair.
# Each box holds one island's whole outline (view units).
STRAY_HAIR = {
    ('front', 'hairback'): [(56.5, -426.5, 62.5, -421.0), (9.0, -433.0, 15.5, -428.0)],
    ('quarter', 'hairback'): [(8.8, -429.5, 16.0, -424.0)],
    ('side', 'hairfront'): [(-86.5, -603.0, -82.5, -599.5), (0.3, -626.7, 3.7, -623.1)],
}


def drop_stray(v, name, layers):
    import re
    boxes = STRAY_HAIR.get((v, name))
    if not boxes:
        return layers
    out = []
    for l in layers:
        keep = []
        # (subpath by subpath: grouped with an outline it starts inside, an island would be kept with it)
        for d in [q for q in re.split(r'(?=M)', l['d']) if q.strip()]:
            nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', d)]
            xs, ys = nums[0::2], nums[1::2]
            if any(min(xs) >= b[0] and min(ys) >= b[1] and max(xs) <= b[2] and max(ys) <= b[3] for b in boxes):
                continue
            keep.append(d)
        if keep:
            out.append({**l, 'd': ''.join(keep)})
    return out


def hair_svg(v, p, name):
    """A hair part in two at the split: the same drawing used twice, the top clipped to above the split and the ends
    over it faded in across the split (HAIR_FEATHER). The ends spring on a bone of their own, and cut there with a hard
    edge they showed it as a faint line across the hair whenever they were a hair's breadth off the top."""
    y = loc(v, (0, HAIR_SPLIT[v]))[1]
    art = f'emonad-{v}-{name}-art'
    up, lo = f'emonad-{v}-{name}-up', f'emonad-{v}-{name}-lo'
    R = 400
    layers = drop_stray(v, name, p['layers'])
    body = slide_layers_svg(layers, art) if v in SLIDE else layers_svg(layers)
    a, b = y - HAIR_FEATHER, y + 1.5
    return (f'<defs><g id="{art}">{body}</g></defs>'
            f'<g class="part" data-part="{name}" data-bone="hair">'
            f'<clipPath id="{up}"><rect x="-{R}" y="-{R * 3}" width="{R * 2}" height="{f(R * 3 + b)}"/></clipPath>'
            f'<use href="#{art}" clip-path="url(#{up})"/></g>'
            f'<g class="part" data-part="{name}Lo" data-bone="hairlo">'
            f'<linearGradient id="{lo}-g" gradientUnits="userSpaceOnUse" x1="0" y1="{f(a)}" x2="0" y2="{f(b)}">'
            f'<stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>'
            f'<mask id="{lo}" maskUnits="userSpaceOnUse" x="-{R}" y="{f(a)}" width="{R * 2}" height="{R}">'
            f'<rect x="-{R}" y="{f(a)}" width="{R * 2}" height="{R}" fill="url(#{lo}-g)"/></mask>'
            # (the drawing made one layer before it is masked: WebKit masks each piece of a group on its own otherwise, and
            # in the fade the pieces under the strands showed through them)
            f'<g mask="url(#{lo})"><use href="#{art}" opacity="0.999"/></g></g>')


def knee(v, side):
    """The knee: a path the rig draws every frame (rig.ts kneePath, from KNEE_EDGES); empty at rest, where the thigh and
    the shin meet edge to edge."""
    return f'<path class="knee" fill="{INK}" d=""/>'


def layers_box(layers):
    """A drawing's bounding box (view units) from its paths' points (control points count: a hair loose, which is fine)."""
    import re
    xs, ys = [], []
    for l in layers:
        nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', l['d'])]
        xs += nums[0::2]; ys += nums[1::2]
    return [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)] if xs else None


def view_boxes(v):
    """Each part's box at rest (view units), for the rig's turn: it tweens every part from where it sits in one drawing
    to where it sits in the next, so the drawings meet before they swap. (Shoulders are worked out by the rig.)"""
    V = J['views'][v]
    out = {}
    for p in V['parts']:
        nm = p['name']
        if p['kind'] == 'eye':
            e = EYES[v][nm]; pts = [loc(v, e[k]) for k in ('L', 'R', 'T', 'B')]
            out[nm] = [round(min(q[0] for q in pts), 2), round(min(q[1] for q in pts), 2), round(max(q[0] for q in pts), 2), round(max(q[1] for q in pts), 2)]
            continue
        b = layers_box(p['layers'])
        if not b:
            continue
        if 'elbow' in p:
            for k in ('arm', 'fore', 'hand'):
                out[k + nm[-1]] = b
        elif p['kind'] == 'hair':
            out[nm] = b; out[nm + 'Lo'] = b
        else:
            out[nm] = b
    if v == 'side':
        for nm in ('thigh', 'shin', 'shoe', 'arm', 'fore', 'hand', 'sleeve'):
            if nm + 'L' in out:
                out[nm + 'R'] = out[nm + 'L']
    pts = [loc(v, q) for q in NECKBASE[v]]
    out['neckbase'] = [round(min(q[0] for q in pts), 2), round(min(q[1] for q in pts), 2), round(max(q[0] for q in pts), 2), round(max(q[1] for q in pts), 2)]
    return out


def view_svg(v):
    V = J['views'][v]
    parts = {p['name']: p for p in V['parts']}
    out = []
    order = [p['name'] for p in V['parts']]
    if v == 'side':
        # the far arm and leg: the near ones again, behind everything (the rig gives them their own bones)
        for nm in ('thighL', 'shinL', 'shoeL'):
            far = nm[:-1] + 'R'
            extra = knee(v, 'R') if nm.startswith('shin') else ''
            svg_ = part_svg(v, parts[nm], far, BONE[far], extra).replace('class="part"', 'class="part far"', 1)
            if not nm.startswith('shoe'):
                svg_ = svg_.replace(f'fill="{INK}"', f'fill="{FAR_INK}"')
            out.append(svg_)
        out.append(arm_svg(v, parts['armL'], 'armR', far=True))
        out.append(part_svg(v, parts['sleeveL'], 'sleeveR', 'sleeveR').replace('class="part"', 'class="part far"', 1))
    def fillets():
        return ''.join(f'<g class="part fillet" data-part="fillet{side}" data-bone="spine" data-arm="arm{side}" data-fillet=\'{json.dumps(f)}\'>'
                       + ''.join(f'<path fill="{INK}" d=""/>' for _ in f['subs']) + '</g>' for side, f in FILLETS.get(v, {}).items())
    for nm in order:
        p = parts[nm]
        if FILLET_BEFORE.get(v) == nm:
            out.append(fillets())
        if v == 'side' and nm == 'torso':
            out.append(seat_svg(v, parts['thighL']))
        if nm == 'neck' or (v == 'back' and nm == 'armL'):
            out.append(under_svg(v))
            for tn, tb in (('face', 'head'), ('neck', 'neck')):
                if tn in parts: out.append(trap_svg(parts[tn], tb))
            out.append(neckbase_svg(v))
        if p['kind'] == 'hair':
            out.append(hair_svg(v, p, nm))
            continue
        if p['kind'] == 'eye':
            out.append(eye_svg(v, nm, EYES[v][nm]))
        elif nm == 'mouth':
            out.append(mouths_svg(v, p['layers']))
        elif 'elbow' in p:
            out.append(arm_svg(v, p, nm))
        elif nm.startswith('sleeve'):
            out.append(part_svg(v, p))
            if v == 'side':
                out.append(f'<g class="part armpit" data-part="armpit{nm[-1]}" data-bone="spine" data-armpit=\'{json.dumps(SIDE_ARMPIT)}\'>'
                           f'<path fill="{INK}" d=""/></g>')
            if FILLET_AFTER.get(v) == nm:
                out.append(fillets())
            # (both shoulders after the last sleeve of the view: over the arms and sleeves, under the hair)
            sh = V.get('shoulders', {})
            rest = [q['name'] for q in V['parts'][V['parts'].index(p) + 1:] if q['name'].startswith('sleeve')]
            if sh and not rest:
                for side in ('L', 'R'):
                    if side in sh:
                        out.append(shoulder_svg(v, side, sh[side]))
        else:
            extra = knee(v, nm[-1]) if nm.startswith('shin') else ''
            out.append(part_svg(v, p, extra=extra))
    piv = {k: [round(x, 2) for x in loc(v, pt)] for k, pt in PIVOTS[v].items()}
    for side, g in V.get('shoulders', {}).items():
        # the arm turns about a point a little way in from where the sleeve starts, towards the armpit
        T, I = g['T'], g['I']   # (T as fitted to the sheet)
        piv['arm' + side] = [round(x, 2) for x in loc(v, (T[0] + 0.38 * (I[0] - T[0]), T[1] + 0.38 * (I[1] - T[1])))]
    for p in V['parts']:
        if 'elbow' in p:
            piv['fore' + p['name'][-1]] = [round(p['elbow']['x'], 2), round(p['elbow']['y'], 2)]
            w = p['wrist']
            # (the hand turns about the middle of the band line's lower edge: see wjoint_data)
            # (and where the turn's in-betweens split the hand from the forearm: the band's middle, under the band, where
            # the two pieces' fits differing never shows)
            if 'stump' in w:
                piv['split' + p['name'][-1]] = [round(x, 3) for x in w['stump']['p']]
            piv['hand' + p['name'][-1]] = ([round(x, 3) for x in wjoint_c(w)] if 'stump' in w and 'wcut' in w
                                           else [round(x, 3) for x in w['stump']['p']] if 'stump' in w
                                           else [round(w['cx'], 2), round(w['y'] + w['u'][1] * w['cd'], 2)])
    if v == 'side':
        piv['foreR'] = piv['foreL']
        piv['handR'] = piv['handL']
        if 'splitL' in piv: piv['splitR'] = piv['splitL']
    piv['sleeveL'], piv['sleeveR'] = piv['armL'], piv['armR']
    piv['spine'] = piv['hips']   # the shirt bends from the waist
    piv['hairlo'] = [piv['hair'][0], round(loc(v, (0, HAIR_SPLIT[v]))[1], 2)]
    hidden = '' if v == 'front' else ' display="none"'
    return (f'<g class="view" data-view="{v}" data-pivots=\'{json.dumps(piv)}\' data-boxes=\'{json.dumps(view_boxes(v))}\'{hidden}>'
            f'{"".join(out)}</g>')


MORPH = os.path.join(HERE, 'emonad_morph.json')


def main():
    views = ''.join(view_svg(v) for v in ('front', 'side', 'back', 'quarter'))
    # the turn's in-betweens (emonad_morph.py, read off this drawing; run it again after any change here, then this again)
    morph = ''
    if os.path.exists(MORPH):
        morph = f'<metadata class="emonad-morph">{open(MORPH).read()}</metadata>'
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -660 260 680" width="260" height="680" data-character="emonad">'
           f'{morph}<g class="emonad-root">{views}</g></svg>')
    open(OUT, 'w').write(svg)
    print('wrote', os.path.relpath(OUT), len(svg) // 1024, 'KB')


if __name__ == '__main__':
    main()
