"""Thiccums -> packages/pet/thiccums.svg   (a white seal with a big round bouncy butt; LAB ONLY, nothing on chain)

From the one reference in "thiccumsgotchi/" at the repo root (a white seal on black: a big round head turned to look up
over its right shoulder, black bead eyes with a shine, a small nose over a "w" smile, two whiskers a side; it sits on a
big round butt seen from behind, the far cheek bulging out on its left, a tail fin on the floor to the left, a flipper
tucked up behind on the left and the near one hanging down its right side). The bar is that it IS that picture, so every
line here is traced off it (thiccums_ref.py, in the reference's pixels, mapped by V()) and drawn at the reference's own
widths, tapering where its lines taper. The reference has no outline (white on black): on the room's walls the silhouette
gets the house's black contour. Flat fills, a clean line, no wobble bake, no shading.

Rigged with the cat's group ids so rig.ts drives it without knowing what it has: #shadow, #figure, #tail (the fin),
#body, #legL (the far flipper, behind the body), #legR (the near flipper, in front), #head (the head unit, with #face),
the eyes with their .open/.pupil/.lid/.closed/.happy/.squeeze/.x parts, the seven mouths, #whiskers, #tear #dirt #stink
#sweat #zzz #halo and #crown/#crownlift/#glint*. Two groups of its own, both inside #body: #buttfar (the far cheek, whose
outline is part of the silhouette) and #butt (the near cheek, all lines inside the silhouette), which the character's
own module (apps/web/src/thiccums/) jiggles with a spring on every move the body makes.

How the parts overlap, and why it holds together when they move:

  - The head is drawn last. Its line runs from where it meets the far flipper, round the top, to the right shoulder, and
    on as a chin line each side; its fill dips down into the body between the chins with no line, so a nod or a tilt
    never shows a seam.
  - The two flippers are the same size and shape (the operator: "his far arm is like his close one ... the same size as
    his other but we really dont need to see much of it as that side is turned away from us"). The near one hangs from its
    shoulder under the head IN FRONT of him: its outer edge the silhouette, its inner edge a line down the belly, a round
    tip; its root is inside the body with no line, so a lifted flipper runs straight into him, and under it the body
    carries its own round side (RIGHT_SIDE), inked and hidden at rest. The far one hangs from its shoulder BEHIND him:
    only its top shows past his side at rest (the picture's lobe, with his side's line, SIDE_L, in front of it), the rest
    of it is behind his side and the far cheek, and a lift swings the whole flipper out from behind him.
  - Every line that meets the head's (the flippers' outer edges, the body's sides) carries on up under the head, hidden,
    and so does the body's white: a nod, a tilt or a look never opens the neck.
  - The fin (#tail) is BEHIND the tail stock, its root under it; the two little creases where the fin leaves the stock
    belong to the body and sit over the root.
  - The far cheek's outline ends at two creases (under the far flipper, and where it meets the tail), and the near
    cheek's lines are all inside the silhouette, so the cheeks can wobble without the outline coming apart. The far cheek
    wobbles by bending its outline (thiccums/moves.ts reshapes it from the points in its data-morph), so it stays round.

He is drawn once and never mirrors (he looks up to our right, as in the picture).

    python3 thiccums.py
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_closed, smooth_open, poly, lens
import cat as C
import thiccums_ref as R

# ---- palette: white seal, black line; the white is the cat's (pet.css's ghost and zombie rules recolour it by fill) ----
INK    = "#000000"
FUR    = "#F8F8FF"
WHITE  = "#FFFFFF"
PUPIL  = "#281828"   # the ground shadow, the cat's
MAW    = "#5A1E2E"   # inside the mouth
TONGUE = "#E8839A"
TEAR   = "#A9D8F0"
MUD    = "#502858"   # grime, the cat's plum smudges
GOLD   = "#E8D89B"
GOLD2  = "#D4A646"
RUBY   = "#8B1A2D"
TEAL   = "#2D7D8A"
GREEN  = "#6BB84A"
LAV    = "#EAC6EA"
HAIR     = "#502858"
STRAND   = "#724278"
PURPLE   = "#906096"
CLOTH    = "#281828"
PUMPKIN  = "#F08A24"
PUMPKIN2 = "#C9651A"
PUMPKIN3 = "#DD7A1F"
MOSS     = "#3E6B2E"

# ---- the reference -> the view: 0.58 view units a pixel, the silhouette's box centred, its bottom on the floor ----
S = 0.58
LW = 2.6            # the contour (the reference has none: the house's weight, a hair under the cat's 2.7)
KL = 1.3            # the lines inside: the reference's own widths, a touch heavier so they read at pet size
X0, Y0 = 189.3, 342.6

def V(X, Y):
    """A point on the reference picture (pixels) -> view units."""
    return ((X - X0) * S + 100.0, (Y - Y0) * S + 212.0 - LW / 2)

def VS(samples, k=KL, lo=0.45):
    """Traced (x, y, w) samples -> view units, widths scaled."""
    return [(*V(x, y), max(lo, w * S * k)) for x, y, w in samples]

def VP(pts):
    return [V(x, y) for x, y in pts]

# ---------------- helpers ----------------
def path(d, fill="none", stroke="none", w=0.0, extra=""):
    s = f'stroke="{stroke}" stroke-width="{w:.3f}" stroke-linejoin="round" stroke-linecap="round"' if stroke != "none" else 'stroke="none"'
    return f'<path d="{d}" fill="{fill}" {s} {extra}/>'

def ellipse(cx, cy, rx, ry, fill, stroke="none", w=0.0, extra=""):
    s = f'stroke="{stroke}" stroke-width="{w}"' if stroke != "none" else 'stroke="none"'
    return f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx:.3f}" ry="{ry:.3f}" fill="{fill}" {s} {extra}/>'

def circle(cx, cy, r, fill):
    return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.3f}" fill="{fill}" stroke="none"/>'

def band(samples, cap0=True, cap1=True):
    """A line of varying width as a filled outline: `samples` are (x, y, width) along its centre; round ends (seal.py's)."""
    n = len(samples); L = []; Rr = []
    for i, (x, y, w) in enumerate(samples):
        x0, y0 = samples[max(i - 1, 0)][:2]; x1, y1 = samples[min(i + 1, n - 1)][:2]
        tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1; nx, ny = -ty / m, tx / m
        L.append((x + nx * w / 2, y + ny * w / 2)); Rr.append((x - nx * w / 2, y - ny * w / 2))
    def cap(i, j):
        x, y, w = samples[i]; px, py = samples[j][:2]
        tx, ty = x - px, y - py; m = math.hypot(tx, ty) or 1; tx, ty = tx / m, ty / m
        a0 = math.atan2(ty, tx); r = w / 2
        return [(x + r * math.cos(a0 - math.pi / 2 + math.pi * k / 6), y + r * math.sin(a0 - math.pi / 2 + math.pi * k / 6)) for k in range(1, 6)]
    end = cap(n - 1, n - 2) if cap1 else []
    start = cap(0, 1) if cap0 else []
    ring = L + end[::-1] + Rr[::-1] + start[::-1]
    return smooth_closed(ring, 0.25)

def line(pts, w, cap0=True, cap1=True):
    """A constant-width ink line through pts (smoothed), as a band."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, 0.5))[0][1]; c = []
    for sg in segs:
        smp = _samples(sg, 1.2); c += smp if not c else smp[1:]
    return band([(x, y, w) for x, y in c], cap0, cap1)

def taper(pts, w0, w1, w2):
    """A line through pts whose width goes w0 -> w1 (middle) -> w2."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, 0.5))[0][1]; c = []
    for sg in segs:
        smp = _samples(sg, 1.0); c += smp if not c else smp[1:]
    n = len(c); out = []
    for i, (x, y) in enumerate(c):
        u = i / (n - 1)
        w = w0 + (w1 - w0) * (u / 0.5) if u < 0.5 else w1 + (w2 - w1) * ((u - 0.5) / 0.5)
        out.append((x, y, w))
    return band(out)

def ink(d, extra=""):
    return path(d, INK, "none", 0, extra)

def stroke(pts, w=LW, extra=""):
    """A constant-width contour line (a plain stroke: the silhouette's line is even all round)."""
    return path(smooth_open(pts, 0.5), "none", INK, w, extra)

def contour(pts, start=LW, end=LW, run=5.0, w=LW):
    """A piece of the silhouette's line: even at `w`, thinning to `start` / `end` over the last `run` units at each end,
    so where two or three lines meet in a sharp crease they come to a fine point, as in the picture, instead of piling
    their round ends into a blob."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, 0.5))[0][1]; c = []
    for sg in segs:
        smp = _samples(sg, 1.0); c += smp if not c else smp[1:]
    L = [0.0]
    for (x0, y0), (x1, y1) in zip(c, c[1:]):
        L.append(L[-1] + math.hypot(x1 - x0, y1 - y0))
    tot = L[-1]; out = []
    for (x, y), s in zip(c, L):
        k = w
        if s < run: k = start + (w - start) * (s / run)
        if tot - s < run: k = min(k, end + (w - end) * ((tot - s) / run))
        out.append((x, y, k))
    return band(out)

def contour_w(pts, start=0.3, end=0.3, run0=6.0, run1=6.0):
    """contour() for a line whose width changes along it: `pts` are (x, y, width); the widths are carried along the smoothed
    curve by length, and each end thins to `start` / `end` over `run0` / `run1` units."""
    from wobble import parse, _samples
    P = [q[:2] for q in pts]; W = [q[2] for q in pts]
    Lp = [0.0]
    for (x0, y0), (x1, y1) in zip(P, P[1:]):
        Lp.append(Lp[-1] + math.hypot(x1 - x0, y1 - y0))
    segs = parse(smooth_open(P, 0.5))[0][1]; c = []
    for sg in segs:
        smp = _samples(sg, 1.0); c += smp if not c else smp[1:]
    L = [0.0]
    for (x0, y0), (x1, y1) in zip(c, c[1:]):
        L.append(L[-1] + math.hypot(x1 - x0, y1 - y0))
    tot = L[-1]; out = []
    def w_at(f):
        t = f * Lp[-1]
        for i in range(1, len(Lp)):
            if Lp[i] >= t:
                k = (t - Lp[i - 1]) / ((Lp[i] - Lp[i - 1]) or 1)
                return W[i - 1] + (W[i] - W[i - 1]) * k
        return W[-1]
    for (x, y), s_ in zip(c, L):
        k = w_at(s_ / tot if tot else 0)
        if s_ < run0: k = min(k, start + (k - start) * (s_ / run0))
        if tot - s_ < run1: k = min(k, end + (k - end) * ((tot - s_) / run1))
        out.append((x, y, k))
    return band(out)

# ---------------- the traced silhouette, cut into its parts ----------------
O = [V(x, y) for x, y in R.OUTLINE]
N = len(O)
I_JR, I_TIP, I_N3, I_LOBE, I_NTT, I_N2, I_N1, I_JL = 129, 229, 423, 492, 549, 564, 635, 676   # thiccums_ref landmarks (see the tracer)

def seg(i0, i1, step=2):
    """The outline from index i0 to i1 (clockwise, wrapping), every `step` points, both ends kept."""
    idx = list(range(i0, i1 + (N if i1 < i0 else 0) + 1, step))
    if (idx[-1] - i1) % N:
        idx.append(i1 + (N if i1 < i0 else 0))
    return [O[i % N] for i in idx]

HEAD_O  = seg(I_JL, I_JR)            # from the far flipper round the top to the right shoulder
# the near flipper's outer edge, down to its tip. The picture has a little notch above the tip (a "hand"): lifted, that read
# as a hooked hand on an arm (the operator: "they should be smooth like the other seals"), so the end is one smooth round
I_ARMEND = 196
# (its top is a round shoulder that curves in under the head, hidden at rest: when the head moves, the head's line crosses
# over the shoulder instead of leaving a line end or a fork in the neck)
ARM_O   = [(167.6, 89.0), (170.8, 89.9), (173.0, 91.8), (173.6, 94.4), (173.2, 96.6), (173.5, 98.6)] + [p for p in seg(I_JR, I_ARMEND)[1:] if p[1] >= 99.9] + VP([(347.4, 235.5), (344.4, 244.5)])
BELLY_O = seg(I_TIP, I_N3)           # the body: from the flipper's tip round the bottom to the tail (it starts at the near flipper's round cap: see TIPBOT_R)
FIN_O   = seg(I_N3, I_NTT)           # the fin: both lobes
# The black wedge between the fin's top lobe and the far cheek comes to a sharp point where the cheek's line and the top
# of the tail's stock run together into one line, the cheek's foot (read off the pixels: the silhouette tracer rounds it
# off, since it paints every line thinner than ~10 px as the body's, so the last of the wedge is put back by hand)
WEDGE = V(119.0, 288.5)
I_CHEEK = 568                        # where the traced outline is back on the cheek's true edge above the wedge's point
STOCK_O = [O[I_NTT]] + VP([(101.0, 289.6), (111.0, 289.4)]) + [WEDGE]   # the top of the tail's stock, flat to the point
CHEEK_O = [WEDGE] + seg(I_CHEEK, I_N1)                                   # the far cheek (the haunch), round to the crease under the far flipper
# the far flipper's outline starts where the body's line in front of it (SIDE_L) comes out to the silhouette; the
# little stretch below that, down to the crease, is the body's side
I_FT = min(range(I_N1, I_JL), key=lambda i: math.hypot(R.OUTLINE[i][0] - R.SIDE_L[-1][0], R.OUTLINE[i][1] - R.SIDE_L[-1][1]))
SIDE_O  = seg(I_N1, I_FT, 1)         # the body's side, from the crease up to the flipper
FLIPL_O = seg(I_FT, I_JL)            # the far flipper's outline, up to the head

J_R, J_L = O[I_JR], O[I_JL]
TIP, N3, NTT, N2, N1 = O[I_TIP], O[I_N3], O[I_NTT], O[I_N2], O[I_N1]

# the lines inside, in view units
CHIN_R = VS(R.CHIN_R); SIDE_L = VS(R.SIDE_L); CHIN_L0 = VS(R.CHIN_L)
FLIP_EDGE = VS(R.FLIP_EDGE); CHEEK_ARC = VS(R.CHEEK_ARC); CHEEK_LOW = VS(R.CHEEK_LOW)
# the foot line ends in the wedge's point (its traced centreline stops short where the two lines merge)
CHEEK_FOOT = [p for p in VS(R.CHEEK_FOOT) if p[0] >= V(136.0, 0)[0]]
CHEEK_FOOT = CHEEK_FOOT + [(*V(130.0, 289.4), CHEEK_FOOT[-1][2]), (*V(124.0, 288.9), CHEEK_FOOT[-1][2]), (*WEDGE, CHEEK_FOOT[-1][2])]
# the head's lower edge on the left leaves the far flipper's line where the two fork (a "lambda" in the picture: the
# body's line runs on down in front of the flipper, the chin line turns off under the head)
FORK = V(142.5, 146.5)
CHIN_L = [(J_L[0], J_L[1], CHIN_L0[0][2] * 1.1), (*V(140.2, 142.6), CHIN_L0[0][2] * 1.1), (*FORK, CHIN_L0[0][2])] + CHIN_L0

# The far flipper, the near one's twin in size, hanging from its shoulder BEHIND him: its outer edge is the picture's lobe
# (FLIPL_O) down to where his side's line meets it (I_FT), then carries on down behind his side and the far cheek to a round
# tip, and its inner edge goes back up behind him to the shoulder under the head. (Its outer edge also carries on round
# under the head, hidden, so a moved head leaves the silhouette whole.)
FLIPL_DOWN = [(77.0, 93.6), (74.2, 93.4), (72.0, 93.5), J_L] + FLIPL_O[::-1][1:] + \
             [(63.4, 118.6), (64.6, 122.6), (65.6, 127.2), (66.2, 132.2), (66.4, 137.6), (66.2, 143.0), (66.4, 148.0)]
TIPC_L, TIP_L = (70.6, 150.2), 4.3
TIPCAP_L = [(TIPC_L[0] + TIP_L * math.cos(math.radians(a)), TIPC_L[1] + TIP_L * math.sin(math.radians(a))) for a in range(180, -1, -15)]
FLIPL_UP = [(74.9, 148.4), (76.4, 142.4), (78.0, 134.6), (79.2, 125.6), (79.6, 116.4), (79.0, 107.6), (77.4, 100.2), (75.8, 94.8)]
ROOT_L = [(77.2, 91.0)]      # under the head, back round to the top of the outer edge
# his left side, the silhouette below the far flipper (SIDE_O, the traced notch smoothed out of it) and the picture's line
# in front of the flipper up to his chin (SIDE_L), on up under the head
SIDE_OS = [N1, (60.6, 123.2), (61.2, 121.5), (61.8, 119.9), (62.2, 118.3), (62.4, 116.8), (62.5, 115.9)]
# his far shoulder, rounding off from the top of his side's line in under the head (hidden at rest; a head that lifts or
# leans shows a round shoulder there, where a neck going straight up showed as a white tab, the operator)
NECK_L = [(71.3, 90.6), (72.6, 89.0), (74.8, 87.9), (78.0, 87.4)]
LEFT_SIL = SIDE_OS + [p[:2] for p in SIDE_L[::-1]] + NECK_L
# The near flipper's end: one round cap from its outer edge to its inner one (a U, like the other seals' paddles; the
# picture's end is a point where the two lines meet the belly's, which lifted read as a hook). At rest it sits on the belly
# line where the flipper's tip rests on it.
TIPC_R, TIP_R = (184.6, 158.9), 4.2
TIPCAP_R = [(TIPC_R[0] + TIP_R * math.cos(math.radians(a)), TIPC_R[1] + TIP_R * math.sin(math.radians(a))) for a in range(14, 181, 15)]
BELLY_O = [(181.2, 162.4), (179.9, 165.2)] + [p for p in BELLY_O if p[1] > 166.5]    # (from under the cap, curving on down: see RIGHT_SIDE)
# the near flipper's root, back from the top of its inner edge (on the belly) up under the head to where its outer edge
# leaves the head's line: inside the body the whole way, and never inked, so a lifted flipper runs straight into him
ROOT_R = [(160.6, 122.4), (158.6, 117.6), (158.2, 112.2), (159.6, 106.6), (162.6, 101.6), (165.0, 95.0), (165.4, 90.2)]
# the body's own right side under the near flipper (hidden at rest): round, just inside the flipper's outer edge all the
# way down, from under the head's corner to the tip, so a lifted flipper uncovers a round belly, not a cut
RIGHT_SIDE = [(165.0, 88.6), (168.6, 90.0), (170.8, 92.6), (171.2, 96.4), (172.4, 100.2), (176.0, 104.8), (180.4, 111.2), (184.4, 119.0), (186.2, 128.0), (186.4, 137.0),
              (185.4, 146.0), (183.6, 154.0), (182.2, 159.0), (181.2, 162.4)]
# the head's fill dips a little under the chin, between the ends of the two chin lines (right to left)
DIP = [(140.0, 113.0), (126.0, 116.0), (108.0, 115.5), (92.0, 111.5)]
NECKLINE = [CHIN_R[-1][:2]] + DIP + [CHIN_L[-1][:2]]

# ---- the far cheek, as points the page can bend (moves.ts, the Jiggle: each outline point moves along its outward
# normal by an amount that is 0 at both ends and most in the middle, so the cheek bulges and sags and stays round, its two
# creases fixed). c: its outline from the wedge (t=0) up to the crease (t=1), with the line's width; i: the rest of its
# fill's edge, from the crease round inside him back to the wedge. far_polys() is the ONE way both sides draw them.
def _dense(pts, step):
    from wobble import parse, _samples
    out = []
    for sg in parse(smooth_open(pts, 0.5))[0][1]:
        smp = _samples(sg, step); out += smp if not out else smp[1:]
    return out

def _far_morph():
    c = _dense(CHEEK_O, 0.6)
    L = [0.0]
    for (x0, y0), (x1, y1) in zip(c, c[1:]):
        L.append(L[-1] + math.hypot(x1 - x0, y1 - y0))
    tot = L[-1]; cw = []
    for (x, y), s_ in zip(c, L):
        w = LW
        if s_ < 5.0: w = 0.9 + (LW - 0.9) * s_ / 5.0            # thin into the wedge's point
        cw.append((x, y, w, s_ / tot))
    inner = _dense([N1] + VP([(140, 200), (170, 212)]) + [p[:2] for p in CHEEK_ARC] + [p[:2] for p in CHEEK_FOOT[1:]], 1.0)
    return {"c": cw, "i": inner[1:-1]}

def far_polys(c, inner):
    """(fill d, line d) for the far cheek from its outline points c [(x, y, w, t)] and inner edge: the same arithmetic as
    moves.ts farPolys(), so the drawing at rest and the page's reshaped one match to the digit."""
    f = lambda v: f"{v:.2f}"
    fill = "M" + " L".join(f"{f(x)},{f(y)}" for x, y, *_ in c) + " L" + " L".join(f"{f(x)},{f(y)}" for x, y in inner) + " Z"
    n = len(c); Lp = []; Rp = []
    for i, (x, y, w, _) in enumerate(c):
        x0, y0 = c[max(i - 1, 0)][:2]; x1, y1 = c[min(i + 1, n - 1)][:2]
        tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1; nx, ny = -ty / m, tx / m
        Lp.append((x + nx * w / 2, y + ny * w / 2)); Rp.append((x - nx * w / 2, y - ny * w / 2))
    def cap(i, j):
        x, y, w, _ = c[i]; px, py = c[j][:2]
        tx, ty = x - px, y - py; m = math.hypot(tx, ty) or 1; a0 = math.atan2(ty / m, tx / m)
        return [(x + w / 2 * math.cos(a0 - math.pi / 2 + math.pi * k / 6), y + w / 2 * math.sin(a0 - math.pi / 2 + math.pi * k / 6)) for k in range(1, 6)]
    ring = Lp + cap(n - 1, n - 2)[::-1] + Rp[::-1] + cap(0, 1)[::-1]
    line = "M" + " L".join(f"{f(x)},{f(y)}" for x, y in ring) + " Z"
    return fill, line

FAR_MORPH = _far_morph()
_rc = [(round(x, 2), round(y, 2), round(w, 2), round(t, 4)) for x, y, w, t in FAR_MORPH["c"]]
_ri = [(round(x, 2), round(y, 2)) for x, y in FAR_MORPH["i"]]
FAR_FILL_D, FAR_LINE_D = far_polys(_rc, _ri)

# pivots (thiccums.css pins them to these view-box points)
NECK = V(222.0, 175.0)          # the head unit
LEGL_PIVOT = (73.0, 99.0)       # the far flipper's shoulder, behind him under the chin on his left
LEGR_PIVOT = V(310.0, 168.0)    # the near flipper's shoulder, under the head
FIN_PIVOT = ((NTT[0] + N3[0]) / 2, (NTT[1] + N3[1]) / 2)   # the fin's root: halfway between the two creases where it leaves the stock, so both barely move
BODY_PIVOT = V(200.0, 342.6)    # where he sits
BUTT_PIVOT = V(228.0, 322.0)    # the near cheek's bottom: it squashes onto it
BUTTFAR_AXIS = V(118.0, 240.0)  # the far cheek bulges out from the line between its two creases (x = 118 px)

def build():
    g = []
    # ---------------- the fills ----------------
    # head: its line from the far flipper round to the shoulder, down the right chin line, a dip into the body with no
    # line (it covers only the body's white), up to the end of the left chin line and back along it
    # (a shallow dip: under it is only the body's white, so a nod or a tilt shows nothing; and when he wears a cape, the dip's
    # bottom is where the cape's collar starts, and it gets a line: NECKLINE, shown by thiccums.css under a cape)
    head_d = smooth_closed(HEAD_O + [p[:2] for p in CHIN_R[3:]] + DIP + [p[:2] for p in CHIN_L[::-1][:-1]], 0.3)
    # body: its bottom from the flipper's tip round to the tail, a hidden end to the stock under the fin's root, the top of
    # the stock, then up INSIDE the far cheek (the cheek's own group covers it), its own line up in front of the far
    # flipper to the head, across under the head, and down its right side under the near flipper to the tip
    stock_end = VP([(92, 296), (88, 306)])
    # (the body's own white runs out to the silhouette under the top of the far cheek and along his side up to the far
    # flipper: when the cheek squashes down onto its bottom, or the far flipper swings out, what they uncover is him)
    cheek_in = VP([(124, 276), (130, 248), (132, 220)]) + [(64.5, 131.0), (61.9, 126.2)]
    under_head = [(82.0, 80.0), (100.0, 77.0), (140.0, 77.0), (172.0, 80.0)]   # (all of it under the head)
    body_d = smooth_closed(BELLY_O + stock_end + STOCK_O + cheek_in + LEFT_SIL + under_head + RIGHT_SIDE[:-1], 0.3)
    # the far flipper: its outer edge down to the round tip, its inner edge back up, its root under the head
    flipL_d = smooth_closed(FLIPL_DOWN + TIPCAP_L + FLIPL_UP + ROOT_L, 0.3)
    # the near flipper: its outer edge down to the round cap, its inner edge (a line on the belly) back up, and its root
    # inside the body up under the head (no line: see ROOT_R)
    inner_r = [p[:2] for p in FLIP_EDGE if p[1] <= TIPC_R[1] - 0.6][::-1]
    flipR_d = smooth_closed(ARM_O + TIPCAP_R + inner_r + ROOT_R, 0.3)
    # the fin: its outline round both lobes, and a root hidden under the stock
    fin_d = smooth_closed(FIN_O + VP([(104, 292), (106, 306)]), 0.3)
    # the far cheek: the haunch's outline (from the wedge up to the crease under the far flipper), across to the top of
    # the near cheek, down its arc and back along the foot line (the cheek's own crease on the tail). Drawn as dense
    # polylines from FAR_MORPH, which is also what the page bends to wobble it (moves.ts), so at rest the two are the same
    farcheek_d = FAR_FILL_D
    # the near cheek: inside its arc, closed across the top (no line: the belly's white)
    # (the arc runs from its top down to the bottom, then the lower line on round to the right: drawn the other way round
    # the outline crossed itself and left a hole in the cheek's top left, which cut the bandages clipped to it)
    nearcheek_d = smooth_closed([p[:2] for p in CHEEK_ARC] + [p[:2] for p in CHEEK_LOW[1:]] + VP([(292, 240), (262, 212), (215, 205)]), 0.3)

    # ---------------- the ink ----------------
    # (every piece of the silhouette's line thins into the creases it meets: see contour())
    # his left side as one line: the silhouette from the far cheek's crease up to the far flipper, on up in front of the
    # flipper at the picture's own width to his chin, and on under the head (thinning out there)
    # (only up to the fork: above it the chin line draws the lambda's top, and his neck on up is the far flipper's edge
    # along the head's line; a body line there too stood beside the chin line and the head's line as a double line
    # whenever the head leaned, the operator: "his left shoulder behind it looks a bit weird")
    left_w = [(x, y, LW) for x, y in SIDE_OS] + [(x, y, w) for x, y, w in SIDE_L[::-1] if y >= 99.4]   # (up to where it meets the chin line)
    body_ink = [ink(contour(BELLY_O, LW, 1.1)), ink(contour(STOCK_O, 1.1, 0.9, 4.0)), ink(contour_w(left_w, LW, 1.2, 0.5, 2.0)),
                ink(contour([SIDE_L[0][:2]] + NECK_L, 1.2, 0.4, 2.5, 4.0))]   # the far shoulder's round top
    right_ink = contour(RIGHT_SIDE, 0.4, LW, 5.0, LW)   # the body's side under the near flipper (hidden at rest), from under the head
    notch_ink = [band([(x, y, w * (0.55 if i == len(R.NOTCH_FLIP) - 1 else 1)) for i, (x, y, w) in enumerate(VS(R.NOTCH_FLIP, 1.5, 0.6))]),
                 band(VS(R.NOTCH_TAILTOP, 1.6, 0.6)), band(VS(R.NOTCH_TAILLOW, 1.6, 0.6))]
    fin_ink = [ink(contour(FIN_O, 1.1, 1.1)), taper([O[I_LOBE], V(64.5, 285.6), V(67.0, 287.2)], 1.9, 1.3, 0.5)]
    # the far flipper's line, the near one's way: from under the head down its outer edge, round the tip, up its inner
    # edge, into the head's chin line where the two fork
    fwl = [(x, y, LW) for x, y in FLIPL_DOWN + TIPCAP_L + FLIPL_UP]
    flipL_ink = ink(contour_w(fwl, 0.5, 0.5, 5.0, 5.0))
    # the near flipper's line: ONE line from under the head down its outer edge, round the cap and up its inner edge onto
    # the belly, thinning out at both ends into the body (no line across the root)
    fw = [(x, y, LW) for x, y in ARM_O] + [(x, y, LW - (LW - 2.2) * k / (len(TIPCAP_R) - 1)) for k, (x, y) in enumerate(TIPCAP_R)] + \
         [(x, y, w) for x, y, w in FLIP_EDGE[::-1] if y <= TIPC_R[1] - 0.6]
    flipR_ink = [ink(contour_w(fw, LW * 0.85, 0.2, 3.0, 11.0))]
    # (the chin lines start thin at the junctions too, for the same reason)
    thin0 = lambda P, run: [(x, y, w * (0.25 + 0.75 * min(1.0, i / run))) for i, (x, y, w) in enumerate(P)]
    head_ink = [ink(contour(HEAD_O, 0.5, 0.5, 4.5)), band(thin0(CHIN_R, 5)), band(thin0(CHIN_L, 3))]
    foot = [(x, y, w if i < len(CHEEK_FOOT) - 4 else w * (0.45 + 0.55 * (len(CHEEK_FOOT) - 1 - i) / 4)) for i, (x, y, w) in enumerate(CHEEK_FOOT)]
    cheek_far_ink = [ink(FAR_LINE_D), band(foot)]
    cheek_near_ink = [band(CHEEK_ARC), band(CHEEK_LOW)]

    # ---------------- draw order ----------------
    # every clip the items use, at the top level (a clip inside a hidden group does not resolve, and with several pets on a
    # page url(#id) finds the first one in the document, so the ids are his own)
    PK = pumpkin_geometry()
    KF_DEFS, KF_BACK, KF_DRAPE, KF_FRONT = keffiyeh()
    g.append('<defs id="thiccdefs">'
             f'<clipPath id="thicchead"><path d="{head_d}"/></clipPath>'
             f'<clipPath id="thiccbody"><path d="{body_d}"/></clipPath>'
             f'<clipPath id="thiccflipL"><path d="{flipL_d}"/></clipPath>'
             f'<clipPath id="thiccflipR"><path d="{flipR_d}"/></clipPath>'
             f'<clipPath id="thiccfin"><path d="{fin_d}"/></clipPath>'
             f'<clipPath id="thiccfarcheek"><path id="thiccfarclippath" d="{farcheek_d}"/></clipPath>'
             f'<clipPath id="thiccnearcheek"><path d="{nearcheek_d}"/></clipPath>'
             f'<clipPath id="thiccbutt"><path d="{farcheek_d}"/><path d="{nearcheek_d}"/><path d="{body_d}"/></clipPath>'
             f'<clipPath id="thiccfarclip"><rect x="-60" y="{N1[1] - 0.4:.2f}" width="320" height="200"/></clipPath>'
             f'<clipPath id="thiccrobeclip"><path d="{CAPE_D}"/></clipPath>'
             f'<clipPath id="thiccnothead"><path clip-rule="evenodd" d="M-60,-80 H260 V280 H-60 Z {head_d}"/></clipPath>'
             f'<clipPath id="thicchairclip"><path d="{HAIR_D}"/></clipPath>'
             f'<clipPath id="thiccbnclip"><path d="{BN_HAT_D}"/></clipPath><clipPath id="thiccbncuffclip"><path d="{BN_CUFF_D}"/></clipPath>'
             f'<clipPath id="thiccbnhair"><path d="{BN_HAIR_D}"/></clipPath><clipPath id="thiccbnhairb"><path d="{BN_HAIRB_D}"/></clipPath>'
             f'<clipPath id="thiccpkclip">' + "".join(ellipse(cx_, cy_, rx_ + 0.6, ry_ + 0.6, "#000000", "none", 0, PK["rot"]) for (cx_, cy_, rx_, ry_, _) in PK["lobes"]) + f'<rect x="0" y="{PK["neck"]:.1f}" width="200" height="60"/></clipPath>'
             '<mask id="thiccpkmask" maskUnits="userSpaceOnUse" x="-30" y="-40" width="260" height="220"><rect x="-30" y="-40" width="260" height="220" fill="#FFFFFF"/>'
             + "".join(path(d, "#000000") for d in PK["holes"]) + '</mask>'
             '<clipPath id="thiccpkholesclip">' + "".join(f'<path d="{d}"/>' for d in PK["holes"]) + '</clipPath>'
             + KIPPAH_DEFS + KF_DEFS +
             '</defs>')
    g.append('<g id="shadow">')
    g.append(ellipse(*V(206, 343.5), 80, 6.0, PUPIL, "none", 0, 'opacity="0.5"'))
    g.append('</g>')
    g.append('<g id="figure">')
    # keffiyeh (item): the cloth's fall behind his face, on the far side, behind everything
    g += KF_BACK
    g.append('<g id="body">')
    # the fin, behind the tail's stock, INSIDE the body so it squashes and leans with it (outside it, the body's bounce
    # pulled the stock off the fin's root). Not #tail: the shared rig swings a tail by as much as 22 degrees, which a fin
    # lying on the floor cannot take; his own module moves it (moves.ts: a spring, and the bounce), about its root
    g.append('<g id="fin">')
    g.append(path(fin_d, FUR))
    g.append(fin_ink[0]); g.append(ink(fin_ink[1]))
    g += fin_wraps()
    g.append('</g>')
    # the far flipper, behind him
    g.append('<g id="legL" class="leg">')
    g.append(path(flipL_d, FUR))
    g.append(flipL_ink.replace('<path', '<path id="thiccinkL"', 1))
    g += sleeve(-1); g += bishtsleeve(-1); g += flip_wraps(-1); g += flip_scars(-1); g += emofit_sleeve(-1); g += wristband_thicc(-1)
    g.append('</g>')
    g.append(path(body_d, FUR))
    g.append(ink(right_ink))
    g += body_ink
    g += [ink(d) for d in notch_ink]
    g += body_wraps()
    # the far cheek (its outline is the silhouette's), then the near one (all inside): the butt. Each carries its own
    # mummy wraps (and the near one the zombie's patch), so they bounce with it
    # (the far cheek squashes and stretches about its bottom, the wedge's point, like the near one: a fixed clip keeps its
    # top from riding up over the body's line when it stretches)
    import json
    morph = json.dumps({"c": [[round(x, 2), round(y, 2), round(w, 2), round(t, 4)] for x, y, w, t in FAR_MORPH["c"]],
                        "i": [[round(x, 2), round(y, 2)] for x, y in FAR_MORPH["i"]]}, separators=(",", ":"))
    g.append(f"<g id=\"buttfar\" data-morph='{morph}'>")
    g.append(path(farcheek_d, FUR).replace('<path', '<path id="thiccfarfill"', 1))
    g += cheek_wraps(-1)
    g.append(cheek_far_ink[0].replace('<path', '<path id="thiccfarline"', 1)); g.append(ink(cheek_far_ink[1]))
    g.append('</g>')
    g.append('<g clip-path="url(#thiccbutt)"><g id="butt">')
    g.append(path(nearcheek_d, FUR))
    g += cheek_wraps(+1)
    g += butt_patch()
    g += [ink(d) for d in cheek_near_ink]
    g.append('</g></g>')
    # dirt smudges (hidden; shown when hygiene is low)
    g.append('<g id="dirt" display="none">')
    for (dx, dy, rx, ry, rot) in ((230, 290, 11, 6.5, -12), (180, 245, 9, 5.2, 20), (300, 230, 8, 4.6, -30), (150, 215, 7, 4.2, 8), (260, 200, 6.5, 3.8, 14)):
        cx, cy = V(dx, dy)
        g.append(f'<g transform="rotate({rot} {cx:.2f} {cy:.2f})">' + ellipse(cx, cy, rx * S, ry * S, MUD, "none", 0, 'opacity="0.5"') + '</g>')
    g.append('</g>')
    # the capes over his back (witch, bisht): over the top of the cheeks, under the near flipper
    g += robe(); g += bisht_front(); g += yoke(); g += emofit_thicc()
    # the near flipper, in front
    g.append('<g id="legR" class="leg">')
    g.append(path(flipR_d, FUR))
    g.append(flipR_ink[0].replace('<path', '<path id="thiccinkR"', 1))
    g += sleeve(+1); g += bishtsleeve(+1); g += flip_wraps(+1); g += flip_scars(+1); g += emofit_sleeve(+1); g += wristband_thicc(+1)
    g.append('</g>')
    # the necklace, over the near flipper's root: round the front of his neck and up under his chin on both sides (drawn
    # under the flipper, its end was hidden by his arm and it did not read as going round his neck)
    g += davidstar()
    g.append('</g>')  # body

    # ---- the head unit ----
    g.append('<g id="head">')
    g.append(path(head_d, FUR))
    g += [head_ink[0], ink(head_ink[1]), ink(head_ink[2])]
    g.append(f'<g class="thiccneck" display="none">' + ink(taper(NECKLINE, 1.2, LW * 0.8, 1.2)) + '</g>')   # the cape's collar under his chin (thiccums.css)
    g += head_wraps()
    g += payot()
    g.append('<g id="face">')
    g += eyes()
    g += mouths()
    g += piercings()
    g += nose()
    g += whiskers()
    g.append('</g>')  # face
    g += head_scars()
    g.append('<g id="tear" display="none">')
    tx, ty = V(214, 104)
    g.append(path(f"M{tx},{ty} C{tx},{ty} {tx-3.4},{ty+5.9} {tx-3.4},{ty+8.5} C{tx-3.4},{ty+10.5} {tx-1.9},{ty+11.9} {tx},{ty+11.9} "
                  f"C{tx+1.9},{ty+11.9} {tx+3.4},{ty+10.5} {tx+3.4},{ty+8.5} C{tx+3.4},{ty+5.9} {tx},{ty} {tx},{ty} Z", TEAR, INK, 1.4))
    g.append('</g>')
    g.append('</g>')  # head

    # keffiyeh (item): the cloth's end down his back, over the back of his head and his body: it comes out from under the
    # hood (drawn after it), and the head's own fill, which dips into the body under the chin, must not cut it
    g += KF_DRAPE
    g += emohair()
    g += beanie_thicc()
    g += kippah()
    g += KF_FRONT
    g += crown()
    g += pumpkin(PK)
    g += witchhat()
    # halo (dead): a gold ring floating over the head
    hx, hy = V(236, -12)
    g.append('<g id="halo" display="none">')
    g.append(ellipse(hx, hy, 24, 6.5, "none", INK, LW))
    g.append(ellipse(hx, hy, 24, 6.5, "none", GOLD, 3.4))
    g.append(path(f"M{hx-18:.1f},{hy-2:.1f} Q{hx-12:.1f},{hy-6:.1f} {hx-4:.1f},{hy-6:.1f}", "none", WHITE, 1.6, 'opacity="0.8"'))
    g.append('</g>')
    # sweat drop (tense), at the back of the head, away from the face
    sx, sy = V(165, 52)
    g.append('<g id="sweat" display="none">')
    g.append(path(f"M{sx},{sy} C{sx},{sy} {sx-6},{sy+10} {sx-6},{sy+14} C{sx-6},{sy+17.5} {sx-3.3},{sy+20} {sx},{sy+20} C{sx+3.3},{sy+20} {sx+6},{sy+17.5} {sx+6},{sy+14} C{sx+6},{sy+10} {sx},{sy} {sx},{sy} Z", WHITE, INK, 1.7))
    g.append('</g>')
    # stink lines, off the butt
    g.append(f'<g id="stink" display="none" fill="none" stroke="{GREEN}" stroke-width="2" stroke-linecap="round">')
    for cls, (px, py) in (("s s1", (60, 225)), ("s s2", (40, 262)), ("s s3", (372, 205))):
        x, y = V(px, py)
        g.append(f'<path class="{cls}" d="M{x:.1f},{y:.1f} Q{x+3:.1f},{y-5:.1f} {x:.1f},{y-10:.1f} Q{x-3:.1f},{y-15:.1f} {x:.1f},{y-20:.1f}"/>')
    g.append('</g>')
    zx, zy = V(345, 60)
    g.append(f'<g id="zzz" display="none" fill="none" stroke="{LAV}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">')
    g.append(f'<path class="z z1" d="M{zx:.1f},{zy:.1f} l10,0 l-10,10 l10,0"/>')
    g.append(f'<path class="z z2" d="M{zx+12:.1f},{zy-20:.1f} l13,0 l-13,13 l13,0"/>')
    g.append(f'<path class="z z3" d="M{zx+24:.1f},{zy-44:.1f} l16,0 l-16,16 l16,0"/>')
    g.append('</g>')
    g.append('</g>')  # figure
    body = "\n".join(g)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="200" height="230">
<g id="cat" data-character="thiccums">
{body}
</g>
</svg>'''

# ---------------- the face ----------------
def eyes():
    """Black beads with a shine, the seal's eyes (seal.py): the bead and its shine are the `.pupil`, and a white lid with
    a "u" edge slides down over each one to blink."""
    out = []
    for eid, e, hi in (("eyeL", R.EYEL, R.EYEL_HI), ("eyeR", R.EYER, R.EYER_HI)):
        cx, cy = V(e["cx"], e["cy"]); rx, ry, rot = e["rx"] * S, e["ry"] * S, e["rot"]
        hx, hy = V(hi["cx"], hi["cy"]); hr = hi["r"] * S
        T = f'transform="rotate({rot} {cx:.2f} {cy:.2f})"'
        a = math.radians(rot)
        HW = math.hypot(rx * math.cos(a), ry * math.sin(a)); HH = math.hypot(ry * math.cos(a), rx * math.sin(a))
        out.append(f'<g id="{eid}" class="eye">')
        out.append(f'<clipPath id="thicc{eid}lid"><ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx + 3.2:.3f}" ry="{ry + 3.2:.3f}" {T}/></clipPath>')
        out.append('<g class="open">')
        out.append('<g class="pupil">')
        out.append(ellipse(cx, cy, rx, ry, INK, "none", 0, T))
        out.append(circle(hx, hy, hr, WHITE))
        out.append('</g>')
        y_rest = cy - HH - 5.6
        y_shut = cy + HH * 0.8
        travel = y_shut - y_rest; k = travel / 19.0
        d = HH * 0.55
        W = HW + 4.0
        U = lambda y0, span, n=12: [(cx + span * u, y0 - d * (span * u / W) ** 2) for u in [i / n - 1 for i in range(2 * n + 1)]]
        edge = [(cx + W * u, y_rest - d * u * u) for u in [i / 10 - 1 for i in range(21)]]
        # (only as tall as a shut lid needs: the clip hides the rest, but a box's size ignores clips, and a taller cover
        # made the head measure taller than it is, so a ball balanced on it floated over it)
        cover = edge + [(cx + W, y_rest - d - 2 * HH - 8), (cx - W, y_rest - d - 2 * HH - 8)]
        out.append(f'<g clip-path="url(#thicc{eid}lid)">')
        out.append(f'<g transform="translate(0 {y_rest:.2f}) scale(1 {k:.4f}) translate(0 {-y_rest:.2f})"><g class="lid">'
                   f'<g transform="translate(0 {y_rest:.2f}) scale(1 {1 / k:.4f}) translate(0 {-y_rest:.2f})">')
        out.append(path(poly(cover), FUR))
        out.append(ink(line(U(y_rest, HW * 0.96), LW * 0.85)))
        out.append('</g></g></g>')
        out.append('</g>')
        out.append('</g>')  # open
        LE = LW * 0.85
        out.append('<g class="closed" display="none">' + ink(line(U(y_shut, HW * 0.96), LE)) + '</g>')
        happy = [(cx + HW * 1.05 * u, cy + HH * 0.14 - HH * 0.5 * (1 - u * u)) for u in [i / 12 - 1 for i in range(25)]]
        out.append('<g class="happy" display="none">' + ink(line(happy, LE)) + '</g>')
        sgn = 1 if eid == "eyeL" else -1
        sq = [(cx - sgn * HW * 0.78, cy - HH * 0.5), (cx + sgn * HW * 0.66, cy), (cx - sgn * HW * 0.78, cy + HH * 0.5)]
        out.append('<g class="squeeze" display="none">' + ink(band([(x, y, LE + 0.3) for (x, y) in densify(sq, 0.8)])) + '</g>')
        q = 5.0
        out.append('<g class="x" display="none">' + ink(line([(cx - q, cy - q), (cx + q, cy + q)], LE + 0.2)) + ink(line([(cx + q, cy - q), (cx - q, cy + q)], LE + 0.2)) + '</g>')
        out.append('</g>')
    return out

def densify(pts, step):
    out = [pts[0]]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        out += [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(1, n + 1)]
    return out

# the smile: its two arcs meet under the nose at J; the left one (toward us) dips lower than the right, the face being
# turned to our right
J = V(265.6, 92.4)
ML = [(x, y, w) for x, y, w in VS(R.MOUTH_L) if y >= J[1] - 0.05]       # from the junction down and left
MR = VS(R.MOUTH_R)
ML = [(J[0], J[1], ML[0][2])] + ML
MR = [(J[0], J[1], MR[0][2])] + MR[1:]
MW = sum(p[2] for p in ML + MR) / len(ML + MR)

def nose():
    pts = VP(R.NOSE)
    nb = V(266.0, 89.6)
    return ['<g id="nose">', path(smooth_closed(pts, 0.35), INK), ink(line([nb, (J[0], J[1] + 0.3)], MW * 0.95)), '</g>']

def mouths():
    """The resting mouth is the picture's smile; the others bend the same two arcs."""
    out = ['<g id="mouth">']
    def m(mid, parts):
        return [f'<g id="mouth-{mid}"' + (' display="none"' if mid != "idle" else '') + '>'] + parts + ['</g>']
    arcs = lambda A, B: [ink(band(A)), ink(band(B))]
    out += m("idle", arcs(ML, MR))
    # smug: the right arc curls higher at its end, the left flattens
    smugL = [(x, y - 0.5 * ((J[0] - x) / (J[0] - ML[-1][0])) ** 2 * 2.2, w) for x, y, w in ML]
    smugR = [(x, y - 2.4 * ((x - J[0]) / (MR[-1][0] - J[0])) ** 2, w) for x, y, w in MR]
    out += m("smug", arcs(smugL, smugR))
    # open: a small open mouth hanging from the junction under the nose, drawn on the turned face: an egg a little wider on
    # the near side (our left) than the far, its level tipped up to our right like his eyes and his smile, a tongue in it
    # (a round front-on "o" read as a mouth stuck on a face that looks away)
    def egg(cx, cy, rl, rr, ry, rot, n=28):
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            x, y = math.cos(a), math.sin(a)
            x *= rr if x > 0 else rl
            y *= ry * (0.9 if y < 0 else 1.0)
            c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
            pts.append((cx + x * c - y * s_, cy + x * s_ + y * c))
        return smooth_closed(pts, 0.3)
    OPEN_AT = (J[0] - 0.7, J[1] + 4.2)
    o_d = egg(OPEN_AT[0], OPEN_AT[1], 3.9, 3.0, 3.9, -12)
    out += m("open", [f'<clipPath id="thiccmaw"><path d="{o_d}"/></clipPath>', path(o_d, MAW, INK, MW),
                      '<g clip-path="url(#thiccmaw)">' + ellipse(OPEN_AT[0] - 0.4, OPEN_AT[1] + 3.4, 3.0, 1.9, TONGUE, "none", 0, f'transform="rotate(-12 {OPEN_AT[0]:.2f} {OPEN_AT[1]:.2f})"') + '</g>'])
    # smile: the arcs opened into a grin: a round lower lip under them and a tongue
    Lx0, Ly0 = ML[-1][:2]; Rx1, Ry1 = MR[-1][:2]
    low = [(Rx1 - 0.6, Ry1 + 1.2), (Rx1 - 3.0, J[1] + 4.6), (J[0] + 0.5, J[1] + 7.2), (Lx0 + 4.2, Ly0 + 3.6), (Lx0 + 0.6, Ly0 + 0.6)]
    top = [p[:2] for p in ML[::-1]] + [p[:2] for p in MR[1:]]
    grin = smooth_open(top, 0.5) + " " + smooth_open(low, 0.5).replace("M", "L", 1) + " Z"
    out += m("smile", [path(grin, MAW), f'<clipPath id="thiccgrin"><path d="{grin}"/></clipPath>',
                       f'<g clip-path="url(#thiccgrin)">' + ellipse(J[0], J[1] + 5.0, 4.2, 2.4, TONGUE) + '</g>',
                       ink(line(low, MW))] + arcs(ML, MR))
    # frown: one arch over the junction, the near half (our left) longer and lower than the far one, both ends turned down;
    # it hangs under the nose the way the smile does (turning the smile's arcs over pushed the far one up into his nose)
    frL = [(J[0], J[1], 2.3), (J[0] - 2.6, J[1] + 0.45, 2.25), (J[0] - 5.2, J[1] + 1.55, 2.1), (J[0] - 7.5, J[1] + 3.2, 1.9),
           (J[0] - 9.3, J[1] + 5.2, 1.55), (J[0] - 10.4, J[1] + 7.0, 1.05)]
    frR = [(J[0], J[1], 2.1), (J[0] + 2.6, J[1] + 0.35, 2.05), (J[0] + 5.2, J[1] + 1.35, 1.9), (J[0] + 7.3, J[1] + 2.9, 1.65),
           (J[0] + 8.6, J[1] + 4.7, 1.0)]
    out += m("frown", arcs(frL, frR))
    # yum: the smile with the tongue out under the junction
    tq = [(J[0] - 2.5, J[1] + 0.8), (J[0] - 2.8, J[1] + 4.6), (J[0], J[1] + 6.5), (J[0] + 2.8, J[1] + 4.6), (J[0] + 2.5, J[1] + 0.8)]
    out += m("yum", [path(smooth_open(tq, 0.5), TONGUE, INK, 1.2), path(f"M{J[0]:.2f},{J[1] + 1.9:.2f} L{J[0]:.2f},{J[1] + 4.3:.2f}", "none", INK, 0.9, 'opacity="0.5"')] + arcs(ML, MR))
    # gape: wide open to catch a fish: the arcs stay the upper lip, and the mouth drops open under them into a round jaw
    xl, xr = ML[-1][0] + 1.5, MR[-1][0] - 1.0
    yl, yr = ML[-1][1] + 0.5, MR[-1][1] + 0.6
    jaw = [(xr, yr), (xr + 0.6, yr + 4.6), (J[0] + 7.6, J[1] + 11.4), (J[0] + 3.6, J[1] + 14.4), (J[0] - 0.6, J[1] + 15.0),
           (J[0] - 5.0, J[1] + 14.0), (J[0] - 9.4, J[1] + 10.4), (xl - 0.6, yl + 4.0), (xl, yl)]
    upper = [p[:2] for p in ML[::-1] if p[0] >= xl] + [p[:2] for p in MR[1:] if p[0] <= xr]
    maw_d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in upper) + " " + smooth_open(jaw, 0.5).replace("M", "L", 1) + " Z"
    out += m("gape", [path(maw_d, MAW), f'<clipPath id="thiccgape"><path d="{maw_d}"/></clipPath>',
                      f'<g clip-path="url(#thiccgape)">' + ellipse(J[0] - 0.6, J[1] + 12.6, 6.0, 3.4, TONGUE) + '</g>',
                      ink(line(jaw, MW))] + arcs(ML, MR))
    out.append('</g>')
    return out

def piercings():
    """The emo pack's lip piercings (hidden until worn): a silver hoop under each arc of the smile, where his lower lip is."""
    # (a pair for every mouth, under that mouth's own lower edge: EM.lip_rings, each a twin of its mouth)
    out = ['<g id="piercings" display="none"></g>']
    for mid, pts in EM.lipring_edges("thiccums").items(): out.append(EM.lip_rings(mid, pts, 1.6, 0.85))
    return out

def whiskers():
    out = ['<g id="whiskers">']
    for k in ("WL1", "WL2", "WR1", "WR2"):
        out.append(ink(band(VS(getattr(R, k)))))
    out.append('</g>')
    return out

def crown():
    """The cat's crown, the same drawing, sat on the top of the head a little askew (the head's top leans to our left:
    he is looking up to the right)."""
    out = ['<g id="crown"><g id="crownlift">']
    cx, cy = 100, 40
    tx, ty = V(233, 14)
    out.append(f'<g transform="translate({tx - 100:.2f} {ty - 40 - 4:.2f})"><g transform="rotate(-9 {cx} {cy}) translate({cx} {cy + 3}) scale(1.08) translate({-cx} {-cy})">')
    out.append(path(poly([(70, 46), (66, 30), (74, 32), (80, 12), (88, 30), (94, 30), (100, 8),
                          (106, 30), (112, 30), (120, 12), (126, 32), (134, 30), (130, 46)]), GOLD, INK, 2.7))
    out.append(path(poly([(70, 46), (130, 46), (132, 38), (68, 38)]), GOLD2, INK, 1.6))
    for bx, by in ((80, 12), (100, 8), (120, 12)):
        out.append(ellipse(bx, by, 3.4, 3.4, GOLD, INK, 1.6))
    out.append(ellipse(100, 33, 5, 4.2, RUBY, INK, 1.6))
    out.append(ellipse(84, 36, 2.6, 2.6, TEAL, INK, 1.4))
    out.append(ellipse(116, 36, 2.6, 2.6, GREEN, INK, 1.4))
    for hx, hy, hr in ((98.4, 31.6, 1.3), (83.2, 35.2, 0.8), (115.2, 35.2, 0.8)):
        out.append(circle(hx, hy, hr, WHITE))
    def spark(sid, sx, sy, r):
        return (f'<path id="{sid}" display="none" d="M{sx},{sy-r} L{sx+r*0.22},{sy-r*0.22} L{sx+r},{sy} L{sx+r*0.22},{sy+r*0.22} '
                f'L{sx},{sy+r} L{sx-r*0.22},{sy+r*0.22} L{sx-r},{sy} L{sx-r*0.22},{sy-r*0.22} Z" fill="#FFFFFF" stroke="none"/>')
    out.append(spark("glintL", 80, 12, 7)); out.append(spark("glintC", 100, 8, 10)); out.append(spark("glintR", 120, 12, 7))
    out.append('</g></g></g></g>')
    return out

# ================= the items (all hidden until worn; the rig shows them by id, COSTUME_PARTS in rig.ts) =================
# His pose decides where things go: he sits with his back to us, looking up over his right shoulder, so a cloak lies over
# his back (a short cape that stops above the butt: the butt is the point of him), a hat sits on the top of his round head,
# and the face is on the right of the head (the right eye is the far one).
HTOP = (126.0, 22.5)                      # the top of his head (view units): hats, the crown, the kippah sit here

def _contour_x(side, y):
    """Where the head's line is at height y, on the left (side -1) or the right (+1)."""
    xs = []
    for (x0, y0), (x1, y1) in zip(HEAD_O, HEAD_O[1:]):
        if (y0 - y) * (y1 - y) <= 0 and y0 != y1: xs.append(x0 + (x1 - x0) * (y - y0) / (y1 - y0))
    return min(xs) if side < 0 else max(xs)

def _grow(pts, cx, cy, by):
    """Points pushed out from (cx, cy) by `by`."""
    out = []
    for x, y in pts:
        dx, dy = x - cx, y - cy; m = math.hypot(dx, dy) or 1
        out.append((x + dx / m * by, y + dy / m * by))
    return out

def _star(cx_, cy_, r_):
    return path(f"M{cx_},{cy_-r_} L{cx_+r_*0.28},{cy_-r_*0.28} L{cx_+r_},{cy_} L{cx_+r_*0.28},{cy_+r_*0.28} L{cx_},{cy_+r_} "
                f"L{cx_-r_*0.28},{cy_+r_*0.28} L{cx_-r_},{cy_} L{cx_-r_*0.28},{cy_-r_*0.28} Z", LAV, "none", 0, 'opacity="0.85"')

# ---------------- the witch outfit: the hat, a cape over his back, its collar, the clasp, a sleeve on each flipper ----------------
def witchhat():
    """The cat's witch hat (seal.py's drawing), a size down, on the top of his head, tipped with it."""
    out = ['<g id="witchhat" display="none">']
    cx, cy = 100, 44
    out.append(f'<g transform="translate({HTOP[0] - cx:.2f} {HTOP[1] + 6 - cy:.2f}) rotate(-6 {cx} {cy}) translate({cx} {cy}) scale(0.86) translate({-cx} {-cy})">')
    out.append(path(smooth_closed([(36, 40), (50, 31), (74, 27), (100, 26), (126, 27), (150, 31), (164, 40),
                                   (154, 50), (130, 55), (100, 57), (70, 55), (46, 50)], 0.5), HAIR, INK, LW))     # brim
    out.append(path("M44,45 Q100,39 156,45", "none", STRAND, 1.8, 'opacity="0.65"'))
    out.append(ellipse(100, 44, 34, 4.5, CLOTH, "none", 0, 'opacity="0.3"'))
    out.append(ellipse(56, 47, 5, 1.8, "#FFFFFF", "none", 0, 'opacity="0.18"'))
    cone = [(62, 38), (67, 16), (76, -6), (90, -22), (106, -32), (122, -32), (136, -26), (146, -16), (150, -6),
            (146, -8), (138, -18), (126, -20), (116, -12), (118, 0), (126, 22), (138, 38), (100, 44)]
    out.append(path(smooth_closed(cone, 0.5), CLOTH, INK, LW))
    out.append(path("M120,-20 Q128,-24 136,-23", "none", INK, 1.5, 'opacity="0.35"'))
    out.append(path("M72,26 Q79,8 90,-8", "none", LAV, 2.0, 'opacity="0.2"'))
    out.append(path(smooth_closed([(62, 38), (66, 25), (100, 31), (134, 25), (138, 38), (100, 44)], 0.45), INK, INK, 1.8))   # band
    for sx, sy in ((74, 34), (82, 36), (118, 36), (126, 34)):
        out.append(circle(sx, sy, 2.2, LAV))
    out.append(path("M94,32 L106,31.5 L106.5,43 L94.5,43.5 Z", "none", INK, 4.6))
    out.append(path("M94,32 L106,31.5 L106.5,43 L94.5,43.5 Z", "none", GOLD, 2.6))
    out.append(ellipse(100.3, 37.5, 2.8, 2.5, RUBY, INK, 1.2))
    out.append(circle(99.5, 36.7, 0.8, "#FFFFFF"))
    out.append('</g></g>')
    return out

# The cloak. We see him from behind, so it lies over his back: from his neck (the head hides its top) down over his
# shoulders and back to a hem that just reaches the top of his butt (the butt is the point of him: a long cloak would hide
# it), its left edge just outside his side (the far flipper comes out from under it in its own sleeve), its front edge
# down his chest on the right from the clasp at his throat. A high collar stands up at the back of his neck, behind his
# head, lined in the lining's purple (the witch's collar, as the cat's and Sahur's have). Folds run down it from the neck;
# the lining shows along the hem and the front edge. It sways with him (moves.ts: the jiggle's spring, about the neck).
CAPE_HEM = [(166.5, 141.0), (156.0, 140.0), (145.0, 137.5), (133.0, 139.5), (120.0, 137.0), (106.0, 140.0), (92.0, 139.0), (80.0, 136.0), (69.0, 131.0), (61.0, 126.0)]
CAPE_FRONT = [(157.5, 112.0), (160.5, 120.0), (163.5, 130.0), (166.5, 141.0)]
CAPE_FOLDS = [[(86.0, 104.0), (82.0, 120.0), (80.0, 134.0)], [(104.0, 107.0), (103.0, 122.0), (102.0, 137.0)],
              [(124.0, 109.0), (125.0, 123.0), (126.0, 136.0)], [(144.0, 110.0), (146.0, 123.0), (148.0, 135.0)]]
def _cape():
    side = [(x - 1.6, y) for x, y in SIDE_OS] + [(x - 1.6, y) for x, y, w in SIDE_L[::-1]]   # up his left side, just over his line
    top = [(70.0, 90.0), (100.0, 97.0), (130.0, 100.0), (150.0, 101.0)]
    return side + top + CAPE_FRONT + CAPE_HEM[1:]
CAPE_D = smooth_closed(_cape(), 0.3)

def robe():
    out = ['<g id="robe" class="robe" display="none">']
    # (no standing collar: behind his head on the far side it read as a spike, the operator: "just remove that")
    cd = CAPE_D   # (its clip, thiccrobeclip, is in the top-level defs: a clip inside a hidden group does not resolve)
    out.append(path(cd, CLOTH, "none", 0))
    out.append('<g clip-path="url(#thiccrobeclip)">')
    for f in CAPE_FOLDS:                                                                  # folds from the neck
        out.append(path(smooth_open(f, 0.5), "none", STRAND, 1.8, 'opacity="0.85"'))
    out.append(path(smooth_open([(x, y - 2.2) for x, y in CAPE_HEM], 0.5), "none", PURPLE, 3.4))   # the lining along the hem
    out.append(path(smooth_open([(x - 2.0, y) for x, y in CAPE_FRONT], 0.5), "none", PURPLE, 3.2))  # and down the front edge
    for (sx_, sy_, sr_) in ((78.0, 112.0, 2.4), (96.0, 126.0, 1.9), (114.0, 112.0, 2.2), (136.0, 125.0, 1.8), (70.0, 101.0, 1.5), (154.0, 131.0, 1.6)):
        out.append(_star(sx_, sy_, sr_))
    out.append('</g>')
    out.append(path(cd, "none", INK, LW))
    out.append('</g>')
    return out

def yoke():
    """The clasp that holds the cloak at his throat (gold with a ruby), just under his chin on the right."""
    out = ['<g id="yoke" class="robe" display="none">']
    x, y = 156.0, 112.0
    out.append(ellipse(x, y, 5.0, 4.3, GOLD, INK, 1.8))
    out.append(ellipse(x, y, 2.3, 2.0, RUBY, INK, 1.0))
    out.append(circle(x - 0.7, y - 0.8, 0.7, "#FFFFFF"))
    out.append('</g>')
    return out

def sleeve(side):
    """A cloak sleeve over the root of a flipper (the top of each, under the head), a lining cuff at its edge,
    clipped to the flipper; the flipper's own line goes back over it."""
    k = "L" if side < 0 else "R"
    out = [f'<g id="sleeve{k}" class="robe" display="none"><g clip-path="url(#thiccflip{k})">']
    if side > 0:
        edge = [(158.0, 127.0), (170.0, 131.0), (182.0, 131.0), (198.0, 124.0)]
        out.append(path(poly([(150.0, 90.0), (205.0, 90.0)] + edge[::-1]), CLOTH, "none", 0))
        out.append(path(HB_band(edge, 5.2), PURPLE, INK, 1.6))
    else:
        edge = [(54.0, 108.0), (62.0, 105.8), (70.0, 103.6), (79.0, 100.4)]
        out.append(path(poly([(50.0, 78.0), (84.0, 78.0)] + edge[::-1]), CLOTH, "none", 0))
        out.append(path(HB_band(edge, 4.2), PURPLE, INK, 1.6))
    out.append('</g>')
    out.append(f'<use href="#thiccink{k}"/>')
    out.append('</g>')
    return out

def HB_band(pts, w):
    """A ribbon of width w along a smooth curve through pts."""
    import habibi as HB
    return HB.band_d(HB.smooth_pts(pts, 8), w)

# ---------------- the bisht (Habibi pack): the same cape in black wool, gold zari down its front edge; sleeves ----------------
import habibi as HB

def bisht_front():
    """The bisht: the cloak's shape in its warm black wool, with the gold zari down its front edge from his throat (broad
    at the top, as a bisht's is) and a band of it along the neck under his chin; sheen down its folds."""
    out = ['<g id="bisht" class="bisht" display="none">']
    out.append(path(CAPE_D, HB.BISHT, "none", 0))
    out.append('<g clip-path="url(#thiccrobeclip)">')
    out += HB.sheen([[(x, y) for x, y in f] for f in CAPE_FOLDS], 1.8, 0.55)
    out.append('</g>')
    out.append(path(CAPE_D, "none", INK, LW))
    z = HB.smooth_pts([(150.0, 104.0)] + [(x - 1.5, y) for x, y in CAPE_FRONT], 8)
    ring = HB.band_pts(z, 6.6, 3.2)
    out.append(f'<polygon points="{" ".join(f"{x:.2f},{y:.2f}" for x, y in ring)}" fill="{HB.ZARI}" stroke="{INK}" stroke-width="1.0" stroke-linejoin="round"/>')
    out += HB.zari(z[3:], 3.0, INK, 0.0, 3.2)[1:]
    out.append('</g>')
    return out

def bishtsleeve(side):
    k = "L" if side < 0 else "R"
    out = [f'<g id="bishtsleeve{k}" class="bisht" display="none"><g clip-path="url(#thiccflip{k})">']
    if side > 0:
        E = HB.smooth_pts([(158.0, 127.0), (170.0, 131.0), (182.0, 131.0), (198.0, 124.0)], 8)
        out.append(f'<polygon points="{" ".join(f"{x:.2f},{y:.2f}" for x, y in E + [(205.0, 88.0), (150.0, 88.0)])}" fill="{HB.BISHT}" stroke="none"/>')
        out += HB.zari(HB.offset_open(E, 1.2), 5.0, INK, 1.0, 3.4)
    else:
        E = HB.smooth_pts([(54.0, 108.0), (62.0, 105.8), (70.0, 103.6), (79.0, 100.4)], 8)
        out.append(f'<polygon points="{" ".join(f"{x:.2f},{y:.2f}" for x, y in E + [(84.0, 78.0), (50.0, 78.0)])}" fill="{HB.BISHT}" stroke="none"/>')
        out += HB.zari(HB.offset_open(E, 1.2), 4.4, INK, 1.0, 3.4)
    out.append('</g>')
    out.append(f'<use href="#thiccink{k}"/>')
    out.append('</g>')
    return out

# ---------------- the mummy: bandages clipped to what they wrap (the cheeks carry their own, so they bounce with them) ----------------
# Wrapped the way the cat is (cat.py): bands at different angles, crossing, each curving round the shape it wraps (a band
# round a ball bows the way the ball does), a little of him showing between them. The first version was level stripes
# all over, which read as a jumper (the operator: "look weird on his butt"). Each piece is clipped to what it wraps, and
# the cheeks carry their own, so they bounce with them.
def head_wraps():
    out = ['<g id="mummyhead" class="mummy" display="none"><g clip-path="url(#thicchead)">']
    out += C.strip([(56.0, 86.0), (70.0, 60.0), (92.0, 36.0), (122.0, 18.0)], 11)                         # up the back of his head
    out += C.strip([(58.0, 54.0), (92.0, 40.0), (128.0, 33.0), (162.0, 34.5), (196.0, 45.0)], 10)         # round his brow, over both eyes
    out += C.strip([(120.0, 12.0), (150.0, 20.0), (178.0, 34.0), (198.0, 52.0)], 10)                      # over the top to the far side
    out += C.strip([(58.0, 104.0), (86.0, 93.0), (120.0, 86.0), (156.0, 80.0), (196.0, 71.0)], 10)       # under his eyes, the mouth left clear
    out += C.strip(*BAND_JAW)                                                                               # across the back of his jaw (the body has it too)
    out.append('</g></g>')
    return out

# The bands in the drawing's own units. Where one crosses a join that has no line (under the chin, the flippers' roots,
# the fin's root under the stock) BOTH parts draw it, each clipped to itself, so at rest it is one band with no cut end,
# and a part that moves takes its piece of the band with it.
BAND_BACK = ([(52.0, 119.0), (80.0, 123.5), (110.0, 125.0), (140.0, 123.0), (168.0, 117.0), (198.0, 108.0)], 9)   # round his upper back, under both flippers
BAND_JAW = ([(64.0, 70.0), (78.0, 96.0), (98.0, 118.0)], 9)                                                    # across the back of his jaw, down under his chin
BAND_TAIL = ([(2.0, 184.0), (22.0, 190.5), (44.0, 193.5), (66.0, 189.0)], 8.5)                               # round the stock and the fin's root
# round the near cheek: the cheek's own edge on the right, from its lower line up to the belly, has no line, so the body
# carries the band on over it (a band clipped there was cut off short, the operator)
BAND_NEAR = ([(76.0, 176.0), (100.0, 160.0), (128.0, 153.0), (156.0, 160.0), (184.0, 178.0)], 11)

def body_wraps():
    out = ['<g id="mummybody" class="mummy" display="none"><g clip-path="url(#thiccbody)">']
    for pts, w in (BAND_JAW, BAND_BACK, BAND_TAIL, BAND_NEAR):
        out += C.strip(pts, w)
    out.append('</g></g>')
    return out

def cheek_wraps(side):
    """The butt's bandages: the far cheek's (#mummyfootL) and the near cheek's (#mummyfootR). The cat's foot ids, which the
    rig already shows and hides with the mummy; on him they are the two cheeks, inside the groups that bounce. Wrapped
    round each cheek like a ball, two bands each bowed the way the cheek is round, all of them inside the cheek's lines
    (a band across a cheek's top, where it has no line, was cut off short there)."""
    k = "L" if side < 0 else "R"
    clip = "thiccfarcheek" if side < 0 else "thiccnearcheek"
    out = [f'<g id="mummyfoot{k}" class="mummy" display="none"><g clip-path="url(#{clip})">']
    if side < 0:
        out += C.strip([(36.0, 148.0), (58.0, 153.5), (86.0, 149.0)], 10)
        out += C.strip([(38.0, 168.0), (60.0, 173.0), (86.0, 168.0)], 9)
    else:
        out += C.strip(*BAND_NEAR)
        out += C.strip([(76.0, 134.0), (90.0, 150.0), (110.0, 170.0), (138.0, 188.0), (170.0, 196.0)], 10)   # (from outside the cheek's arc: a band's end inside the cheek showed as a stub)
    out.append('</g></g>')
    return out

def flip_wraps(side):
    k = "L" if side < 0 else "R"
    out = [f'<g id="wrap{k}" class="mummy" display="none"><g clip-path="url(#thiccflip{k})">']
    if side < 0:
        out += C.strip([(54.0, 111.0), (66.0, 107.5), (80.0, 103.0)], 6.5)
        out += C.strip([(58.0, 128.0), (70.0, 131.5), (84.0, 129.0)], 7)
    else:
        out += C.strip(*BAND_BACK)                                                   # the back's band, on over his shoulder
        out += C.strip([(158.0, 138.0), (176.0, 132.0), (202.0, 127.0)], 8.5)
        out += C.strip([(164.0, 155.0), (182.0, 149.0), (202.0, 143.0)], 8)
    out.append('</g></g>')
    return out

def fin_wraps():
    out = ['<g id="mummytail" class="mummy" display="none"><g clip-path="url(#thiccfin)">']
    out += C.strip(*BAND_TAIL)                                                       # the stock's band, on over the fin's root
    out += C.strip([(22.0, 156.0), (29.0, 168.0), (35.0, 181.0)], 7.5)              # round the top lobe
    out.append('</g></g>')
    return out

# ---------------- the zombie: pet.css turns his white mossy; here the brain out of the top of his head, stitched scars, a patch on the butt ----------------
BRAIN_AT = (124.0, 20.5, -8)
def head_scars():
    out = ['<g id="zombiehead" class="zombie" display="none">']
    bx, by, br = BRAIN_AT
    out.append(f'<g clip-path="url(#thicchead)">' + ellipse(bx, by + 5.5, 18.0, 6.0, "#3A2A1C", INK, 1.6, f'transform="rotate({br} {bx} {by + 5.5})"') + '</g>')   # the skull split open
    out += ['<g class="zbrain">'] + C.brain(bx, by, 20.0, 11.0, br) + ['</g>']   # (.zbrain: the keffiyeh covers it, pet.css)
    out.append(path("M108,74 Q118,80 128,74", "none", "#6F8C68", 2.0, 'opacity="0.55"'))                                         # a shadow under the near eye
    out += C.stitches((82.0, 38.0), (94.0, 54.0), 3)
    out += C.stitches((170.0, 30.0), (184.0, 40.0), 3)
    out.append('</g>')
    return out

def butt_patch():
    """A darker patch sewn onto the near cheek (inside it, so it bounces with it), and a stitched seam down the cheek."""
    out = ['<g id="zombiebody" class="zombie" display="none"><g clip-path="url(#thiccnearcheek)">']
    out += C.stitched_patch([(118.0, 156.0), (142.0, 152.0), (146.0, 174.0), (121.0, 179.0)])
    out += C.stitches((100.0, 166.0), (106.0, 188.0), 3)
    out.append('</g></g>')
    return out

def flip_scars(side):
    k = "L" if side < 0 else "R"
    out = [f'<g id="zombie{k}" class="zombie" display="none">']
    if side < 0: out += C.stitches((64.0, 94.0), (60.0, 108.0), 3, 4.4)
    else: out += C.stitches((176.0, 118.0), (184.0, 132.0), 3, 4.6)
    out.append('</g>')
    return out

# ---------------- the emo hair: a plum mop over the top of his head, swept down over the far (right) eye ----------------
_hc = (126.0, 64.0)
_topL = [(x, y) for x, y in HEAD_O if x < 126 and y < 60]           # the head's line from his left side over the top
_topR = [(x, y) for x, y in HEAD_O if x >= 126 and y < 64]          # and down his right side past the far eye
_top = _grow(_topL + _topR, *_hc, 2.4)
_top.sort(key=lambda p: math.atan2(p[1] - _hc[1], p[0] - _hc[0]))
FRINGE = [(188.0, 64.0), (182.0, 70.0), (176.0, 62.0), (170.0, 70.0), (163.0, 62.0), (156.0, 66.0), (152.0, 56.0), (148.0, 50.0),
          (141.0, 44.0), (134.0, 46.0), (128.0, 39.0), (120.0, 43.0), (112.0, 38.0), (104.0, 44.0), (96.0, 40.0), (88.0, 48.0),
          (80.0, 45.0), (74.0, 54.0), (69.0, 58.0)]
HAIR_D = smooth_closed(_top + FRINGE, 0.35)

def emohair():
    out = ['<g id="emohair" display="none">']
    out.append(path(HAIR_D, HAIR, INK, LW))
    out.append('<g clip-path="url(#thicchairclip)">')
    for (x0, y0, x1, y1, bend) in ((80, 34, 88, 50, -3), (94, 26, 104, 44, -4), (110, 22, 122, 42, -5), (126, 22, 140, 46, -5),
                                   (142, 26, 154, 58, -5), (156, 32, 166, 66, -4), (168, 40, 176, 68, -3), (178, 48, 184, 66, -2)):
        mx, my = (x0 + x1) / 2 + bend, (y0 + y1) / 2
        out.append(path(smooth_open([(x0, y0), (mx, my), (x1, y1)]), "none", STRAND, 1.5))
    out.append(path("M90,30 Q112,20 138,24", "none", LAV, 1.8, 'opacity="0.35"'))
    out.append('</g>')
    out.append('</g>')
    return out

# ---------------- the emo pack (DEV only until it is an item; /emopack): beanie, emo clothes, wristbands, eyeliner ----------------
import emo as EM

# The beanie on him: its lower edge (the cuff's fold) across his brow just over both eyes (he looks up to our right, so it
# climbs to the right), left to right; the cuff a band 11 tall above it; the knit rising well over the top of his round head
# and slouching back to the left, a soft bag hanging over the back of his head.
BN_RIM = [(65.5, 63.0), (75.0, 54.5), (87.0, 48.5), (101.0, 45.0), (117.0, 43.2), (133.0, 42.2), (149.0, 41.4), (164.0, 41.0), (175.0, 42.4), (183.0, 46.5)]
def _bn_up(rim, h):
    out = []
    for i, (x, y) in enumerate(rim):
        x0, y0 = rim[max(i - 1, 0)]; x1, y1 = rim[min(i + 1, len(rim) - 1)]
        tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1
        out.append((x + ty / m * h, y - tx / m * h))
    return out
BN_UP = _bn_up(BN_RIM, 11.0)
# the knit over the top, from the cuff's right corner over his head to its left corner, the slouch hanging out at the back
_bn_top = [(185.5, 33.0), (184.5, 21.0), (178.5, 9.5), (167.0, 0.0), (151.0, -6.0), (133.0, -8.5), (115.0, -7.5), (98.5, -3.0), (84.0, 4.5), (72.0, 14.5),
           (63.5, 26.0), (59.0, 38.0), (59.5, 48.5)]
BN_HAT_D = smooth_closed(BN_RIM + _bn_top, 0.3)
BN_CUFF_D = smooth_closed(BN_RIM + BN_UP[::-1], 0.3)
# the hair under it: chunky pointed locks from under the cuff over his far eye (clear of his nose and mouth), and a few
# at the back of his head
BN_HAIR = [(142.0, 43.0), (148.5, 58.5), (153.5, 49.0), (158.0, 72.5), (163.5, 55.0), (169.0, 76.0), (174.0, 57.0), (180.0, 72.0), (183.5, 55.0), (185.0, 45.0),
           (170.0, 37.0), (150.0, 37.0)]
BN_HAIRB = [(66.0, 57.0), (63.0, 70.0), (69.5, 61.0), (72.0, 68.5), (76.0, 57.5), (79.0, 63.0), (82.0, 51.0), (72.0, 50.0)]
BN_HAIR_D = smooth_closed(BN_HAIR, 0.32)
BN_HAIRB_D = smooth_closed(BN_HAIRB, 0.32)

def beanie_thicc():
    """The beanie on him: a black knit slouch beanie, its ribbed cuff across his brow just over both eyes (climbing to the
    right, where he looks), a broken-heart patch on it, and under it his emo hair in BLACK: pointed locks over his far eye
    and a few at the back. One group with the head unit (thiccums.css pivots it with the head)."""
    out = ['<g id="beanie" display="none">']
    for d, strands in ((BN_HAIR_D, ((147.0, 44.0, 149.0, 55.0), (156.0, 44.0, 157.5, 68.0), (166.0, 44.0, 168.0, 71.0), (176.0, 46.0, 179.0, 67.0))),
                       (BN_HAIRB_D, ((70.0, 54.0, 66.0, 65.0), (77.0, 54.0, 75.0, 63.0)))):
        out.append(path(d, EM.HAIRB, INK, LW))
        out.append(f'<g clip-path="url(#{"thiccbnhair" if d is BN_HAIR_D else "thiccbnhairb"})">')
        for (x0, y0, x1, y1) in strands:
            out.append(path(smooth_open([(x0, y0), ((x0 + x1) / 2 - 1.2, (y0 + y1) / 2), (x1, y1)]), "none", EM.HAIRB2, 1.4))
        out.append('</g>')
    out.append(path(BN_HAT_D, EM.KNIT))
    out.append('<g clip-path="url(#thiccbnclip)">')
    out.append(path(smooth_closed([(102.0, -1.0), (118.0, -5.5), (138.0, -7.0), (150.0, -5.0), (136.0, -3.0), (118.0, -2.0), (106.0, 1.5)], 0.5), EM.KNIT2, "none", 0, 'opacity="0.5"'))
    out += EM.knit_ribs(BN_UP, _bn_top[::-1], 19, 1.0, reach=0.9, bow=0.05)
    # (no crease line along the slouch: the operator wants only the knit's ribs on it)
    out.append('</g>')
    out.append(path(BN_CUFF_D, EM.KNIT))
    out.append('<g clip-path="url(#thiccbncuffclip)">')
    out.append(path(smooth_open([(x * 0.14 + ux * 0.86, y * 0.14 + uy * 0.86) for (x, y), (ux, uy) in zip(BN_RIM, BN_UP)]), "none", EM.KNITD, 3.0, 'opacity="0.9"'))
    out += EM.cuff_ribs(BN_RIM, BN_UP, 3.2)
    out.append('</g>')
    out.append(path(smooth_open(BN_UP), "none", INK, 1.4))
    out.append(path(BN_HAT_D, "none", INK, LW))
    out += EM.broken_heart(118.0, 38.0, 12.5, rot=-5, lw=1.1)
    out.append('</g>')
    return out

# the tee's hem, just above the butt (the butt is the point of him), and the band of his back it covers
TEE_HEM = [(52.0, 127.0), (64.0, 133.5), (78.0, 138.5), (94.0, 141.5), (110.0, 142.8), (126.0, 142.2), (142.0, 141.0), (158.0, 139.0), (172.0, 136.0), (190.0, 131.0)]
def emofit_thicc():
    """The emo clothes on him: a black tee over his back and his chest (we see his back), down to a hem just above the butt,
    a big pink broken heart printed across his back, clipped to him; short sleeves on both flippers (emofit_sleeve)."""
    region = [(40.0, 50.0), (205.0, 50.0), (205.0, TEE_HEM[-1][1])] + TEE_HEM[::-1] + [(40.0, TEE_HEM[0][1])]
    out = ['<g id="emofit" class="emofit" display="none"><g clip-path="url(#thiccbutt)">', path(poly(region), EM.TEE)]
    for f in ([(84.0, 104.0), (82.0, 120.0), (80.0, 136.0)], [(146.0, 110.0), (148.0, 124.0), (150.0, 138.0)]):
        out.append(path(smooth_open(f, 0.5), "none", EM.TEE2, 2.0, 'opacity="0.7"'))
    out += EM.broken_heart(101.0, 128.0, 15.0, rot=-6, lw=1.2)   # low on his back: the head covers the top of it
    out.append(path(smooth_open(TEE_HEM, 0.5), "none", INK, LW))
    out.append(path(smooth_open([(x, y - 3.0) for x, y in TEE_HEM], 0.5), "none", EM.TEE2, 1.0, 'opacity="0.8"'))
    out.append('</g></g>')
    return out

def emofit_sleeve(side):
    """A short tee sleeve over the root of a flipper, a hem at its edge, clipped to the flipper; its own line back over it."""
    k = "L" if side < 0 else "R"
    out = [f'<g id="emofit{k}" class="emofit" display="none"><g clip-path="url(#thiccflip{k})">']
    edge = [(158.0, 125.0), (170.0, 129.0), (182.0, 129.0), (198.0, 122.0)] if side > 0 else [(54.0, 106.0), (62.0, 103.8), (70.0, 101.6), (79.0, 98.4)]
    box = [(150.0, 88.0), (205.0, 88.0)] if side > 0 else [(50.0, 76.0), (84.0, 76.0)]
    out.append(path(poly(box + edge[::-1]), EM.TEE))
    out.append(path(smooth_open(edge, 0.5), "none", INK, 1.6))
    out.append(path(smooth_open([(x, y - 2.6) for x, y in edge], 0.5), "none", EM.TEE2, 1.0, 'opacity="0.8"'))
    out.append('</g>')
    out.append(f'<use href="#thiccink{k}"/>')
    out.append('</g>')
    return out

def wristband_thicc(side):
    """A purple sweatband with a white stripe round a flipper near its tip, clipped to the flipper."""
    k = "L" if side < 0 else "R"
    root, tip = (LEGR_PIVOT, TIPC_R) if side > 0 else (LEGL_PIVOT, TIPC_L)
    out = [f'<g id="wrist{k}" display="none"><g clip-path="url(#thiccflip{k})">']
    out += EM.sweatband(root, tip, 0.70, 0.83, 30.0, 1.4)
    out.append('</g>')
    out.append(f'<use href="#thiccink{k}"/>')
    out.append('</g>')
    return out

# ---------------- the Jewish pack: the kippah with the payot, the Star of David ----------------
KIPPAH_DEFS, KIPPAH_PARTS = C.kippah_cap(HTOP[0] - 2.0, HTOP[1] + 7.0, 50.0, 15.0, 3.2, rot=-7, lw=LW, clip_id="thicckippahclip")

def kippah():
    # (the inner group is what thiccums.css moves: up onto the emo hair, onto the zombie's brain)
    return ['<g id="kippah" display="none"><g class="kippahpose">'] + KIPPAH_PARTS + ['</g></g>']

def ringlet_on(axis, y0, y1, turns, r0, r1, w0, w1, phase, lw=1.4, root=0.12, tip=0.14):
    """A payot curl (seal.py's seal_ringlet): a tube wound as a helix hanging from y0 to y1, its axis at x = axis(y), the
    back half-turns shaded and drawn first, thinned in at the root and to a point at the tip."""
    T = 2 * math.pi * turns; n = max(8, int(28 * turns)); pts = []
    for i in range(n + 1):
        u = i / n; t = T * u; y = y0 + (y1 - y0) * u
        r = r0 + (r1 - r0) * u; w = w0 + (w1 - w0) * u
        if u < root: w *= 0.35 + 0.65 * (u / root)
        if u > 1 - tip: w *= max(0.12, (1 - u) / tip)
        ax = axis(y)
        pts.append((ax + r * math.sin(t + phase), y, w, math.cos(t + phase) > 0))
    runs, cur = [], [pts[0]]
    for q in pts[1:]:
        cur.append(q)
        if q[3] != cur[0][3] or q is pts[-1]:
            runs.append(cur); cur = [q]
    back, front = [], []
    for run in runs:
        k = len(run); fr = sum(1 for q in run if q[3]) > k / 2
        Lp, Rp = [], []
        for i, (x, y, w, _) in enumerate(run):
            xa, ya = run[max(i - 1, 0)][:2]; xb, yb = run[min(i + 1, k - 1)][:2]
            dx, dy = xb - xa, yb - ya; m = math.hypot(dx, dy) or 1
            nx, ny = -dy / m, dx / m
            Lp.append((x + nx * w / 2, y + ny * w / 2)); Rp.append((x - nx * w / 2, y - ny * w / 2))
        body = smooth_open(Lp, 0.5) + " L" + smooth_open(Rp[::-1], 0.5)[1:] + " Z"
        o = [C.path(body, HAIR, "none", 0)]
        if not fr:
            o.append(C.path(body, INK, "none", 0, 'opacity="0.24"'))
        else:
            hl = [(a[0] * 0.62 + b[0] * 0.38, a[1] * 0.62 + b[1] * 0.38) for a, b in zip(Lp, Rp)][max(1, k // 6):k - max(1, k // 6)]
            if len(hl) > 2: o.append(C.path(smooth_open(hl, 0.5), "none", STRAND, lw * 0.9))
        o.append(C.path(smooth_open(Lp, 0.5), "none", INK, lw))
        o.append(C.path(smooth_open(Rp, 0.5), "none", INK, lw))
        (front if fr else back).append("\n".join(o))
    return back + front

def payot():
    """The payot, where side locks hang on a face turned three-quarters to our right: the near one from his near temple,
    between his near eye and the back of his head, down his near cheek just outside his whiskers to below his jaw; the far
    one from behind his far jaw, only its outer half showing past the head's line (clipped to outside the head: it is
    behind it) and all of it below the jaw, over his shoulder. (On the head's outline both sides, the first version, one
    hung off the back of his head and the other stood off his muzzle like earmuffs.) In the plum of the emo hair, so the
    ghost and zombie rules recolour them; under the face, so the whiskers lie over the near one."""
    out = ['<g id="payot" display="none">']
    near = lambda y: 95.6 - 0.04 * (y - 44.0)                      # hanging almost plumb, a touch in toward his jaw
    out += ringlet_on(near, 44.0, 104.0, 4.6, 3.6, 3.0, 6.2, 4.6, 0.4)
    far = lambda y: (_contour_x(1, min(y, 90.0)) + 2.6) if y <= 90.0 else _contour_x(1, 90.0) + 2.6 - (y - 90.0) * 0.12
    out.append('<g clip-path="url(#thiccnothead)">')
    out += ringlet_on(far, 52.0, 106.0, 4.2, 3.2, 2.7, 5.4, 4.2, 0.4 + math.pi)
    out.append('</g>')
    out.append('</g>')
    return out

def davidstar():
    """The Star of David on a silver chain round his neck. We see him from behind: the chain comes round the back of his
    neck from under the back of his head, runs along close under his head (just below its line, the neck), comes round to
    the front of his neck under his chin, where it dips to the star on his chest, and goes up behind his chin on the far
    side (the near flipper's shoulder covers its end). Crowned, pet.css turns the silver gold."""
    SX, SY, SR = 151.5, 128.5, 8.4
    top = SY - SR - 1.6
    chain = (smooth_open([(74.6, 96.4), (77.0, 104.0), (86.0, 111.5), (100.0, 116.8), (116.0, 119.2), (131.0, 119.0), (142.0, 117.2), (148.0, 117.4), (SX, top)], 0.5) + " "
             + smooth_open([(SX, top), (155.8, 114.2), (159.0, 108.6), (161.4, 102.6)], 0.5).split(" ", 1)[1])
    out = ['<g id="davidstar" display="none">']
    out.append(path(chain, "none", INK, 2.4) + path(chain, "none", C.SILVER, 1.3) + path(chain, "none", C.SILVER2, 0.7, 'stroke-dasharray="1.3 0.8"'))
    out += C.interlaced_star(SX, SY, SR, 2.3, 0.85, INK, C.SILVER, C.SILVER2, C.ISRAEL)
    out.append('</g>')
    return out

# ---------------- the keffiyeh (Habibi pack): the shemagh as a hood over his head with the agal, its ends down his back ----------------
def keffiyeh():
    """The shemagh over his round head like a hood, a little proud of the head's line, its front edge across his brow above
    both eyes and down in front of his near cheek (beside the whiskers) to his neck; the agal round the head over the brow.
    Its fall behind his face on the far side (#keffiyehback, behind everything) and its end down his back
    (#keffiyehdrape, over his body, under the head), each with a knotted fringe. Returns (defs, back, drape, front)."""
    # the hood's front edge (the face's opening), from the far side of the head above the far eye, across the brow, and
    # down in front of the near cheek to his neck
    HEM = [(_contour_x(1, 50.0) + 0.5, 50.0), (179.0, 38.0), (164.0, 32.0), (146.0, 33.0), (128.0, 39.0), (112.0, 46.0), (102.0, 57.0),
           (97.0, 71.0), (96.5, 86.0), (99.0, 100.0), (102.0, 108.0)]
    FALL = lambda y: 2.8 + 3.2 * min(1.0, max(0.0, (y - 40.0) / 50.0))
    # the head's line from its left side (at the neck) over the top to the far side above the far eye, pushed out
    Lside = [(x, y) for x, y in HEAD_O if x < 126]
    Rtop = [(x, y) for x, y in HEAD_O if x >= 126 and y <= 50.0]
    ring = _grow(Lside + Rtop, 126.0, 66.0, 0.0)
    TOPO = [(x + (x - 126.0) / (math.hypot(x - 126.0, y - 66.0) or 1) * FALL(y), y + (y - 66.0) / (math.hypot(x - 126.0, y - 66.0) or 1) * FALL(y)) for x, y in ring]
    front_pts = TOPO + HEM + [(86.0, 110.0), (70.0, 102.0)]
    front_d = smooth_closed(front_pts, 0.3)
    # the face's opening (the emo hair shows only there under the hood)
    open_d = smooth_closed(HEM + [(150.0, 110.0), (200.0, 100.0), (205.0, 40.0)], 0.3)
    # its fall behind the face on the far side, onto his shoulder
    back_pts = [(172.0, 44.0), (190.0, 50.0), (198.0, 66.0), (200.0, 88.0), (198.0, 108.0), (184.0, 112.0), (178.0, 96.0), (176.0, 70.0)]
    back_d = smooth_closed(back_pts, 0.35)
    # its end down his back, from under the back of his head over his upper back, to a knotted fringe above the butt
    drape_pts = [(70.0, 84.0), (62.0, 100.0), (58.0, 116.0), (60.0, 128.0), (74.0, 132.0), (92.0, 131.0), (108.0, 124.0), (116.0, 110.0), (104.0, 96.0), (86.0, 88.0)]
    drape_d = smooth_closed(drape_pts, 0.35)
    defs = ('<defs id="thicckeffiyehdefs">' + HB.shemagh_pattern("thicckfpat", 5.6, 0.9, 1.7)
            + f'<path id="thicckffront" d="{front_d}"/><path id="thicckfback" d="{back_d}"/><path id="thicckfdrape" d="{drape_d}"/>'
            + '<clipPath id="thicckffrontclip"><use href="#thicckffront"/></clipPath><clipPath id="thicckfdrapeclip"><use href="#thicckfdrape"/></clipPath>'
            + f'<clipPath id="thicckfopen"><path d="{open_d}"/></clipPath></defs>')
    use = lambda ref, fill, stroke="none", w=0: f'<use href="#{ref}" fill="{fill}" stroke="{stroke}" stroke-width="{w}"/>'
    back = ['<g id="keffiyehback" display="none">', use("thicckfback", HB.KF_WHITE), use("thicckfback", "url(#thicckfpat)"),
            path(smooth_closed([(186.0, 60.0), (196.0, 76.0), (196.0, 100.0), (188.0, 104.0)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.2"'),
            use("thicckfback", "none", INK, LW)]
    back += HB.tassels([(180.0, 110.0), (190.0, 111.0), (198.0, 107.0)], 3, 7.0, INK, 1.0, 19)
    back.append('</g>')
    drape = ['<g id="keffiyehdrape" display="none">', use("thicckfdrape", HB.KF_WHITE), use("thicckfdrape", "url(#thicckfpat)"),
             '<g clip-path="url(#thicckfdrapeclip)">',
             path(smooth_closed([(60.0, 100.0), (72.0, 96.0), (80.0, 130.0), (60.0, 130.0)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.14"')]
    for crease in ([(72.0, 98.0), (70.0, 114.0), (72.0, 128.0)], [(90.0, 96.0), (92.0, 112.0), (90.0, 128.0)]):
        drape.append(path(smooth_open(crease, 0.5), "none", HB.KF_RED2, 0.9, 'opacity="0.35"'))
    drape += ['</g>', use("thicckfdrape", "none", INK, LW)]
    drape += HB.tassels([(62.0, 129.0), (76.0, 132.0), (92.0, 131.0), (106.0, 126.0)], 4, 7.0, INK, 1.0, 17)
    drape.append('</g>')
    ab, af = HB.agal(128.0, 37.0, 60.0, 8.0, 6.8, INK, 1.6, rot=-12, back_from=0, back_to=0)
    front = ['<g id="keffiyeh" display="none">', use("thicckffront", HB.KF_WHITE), use("thicckffront", "url(#thicckfpat)"),
             '<g clip-path="url(#thicckffrontclip)">',
             path(smooth_closed([(72.0, 60.0), (88.0, 40.0), (96.0, 60.0), (92.0, 96.0), (76.0, 100.0)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.14"'),
             path(HB.band_d(HB.offset_open(HEM, 2.9), 2.7), HB.KF_RED),
             path(smooth_open(HB.offset_open(HEM, 5.8), 0.5), "none", HB.KF_RED, 0.9)]
    front += af
    front += ['</g>', path(smooth_open(HEM, 0.5), "none", INK, LW), path(smooth_open(TOPO, 0.4), "none", INK, LW), '</g>']
    return defs, back, drape, front

# ---------------- the pumpkin: a whole jack-o'-lantern worn over his head, its carvings real holes round his face ----------------
def pumpkin_geometry():
    T = 'transform="rotate(-6 127 58)"'
    lobes = ((78.0, 58.0, 30.0, 42.0, PUMPKIN3), (176.0, 56.0, 30.0, 42.0, PUMPKIN3), (101.0, 57.0, 36.0, 46.0, PUMPKIN), (153.0, 56.0, 36.0, 46.0, PUMPKIN), (127.0, 56.0, 38.0, 48.0, PUMPKIN))
    eL, eR = R.EYEL, R.EYER
    ex1, ey1 = V(eL["cx"], eL["cy"]); ex2, ey2 = V(eR["cx"], eR["cy"])
    holes = [smooth_closed(lens(ex1 - 0.5, ey1 - 0.5, 27.0, 21.0, 90 + eL["rot"]), 0.5), smooth_closed(lens(ex2 + 0.5, ey2 - 0.5, 25.0, 18.0, 90 + eR["rot"] * 1.2), 0.5)]
    cx, cy = J[0], J[1]
    grin = [(cx - 14.0, cy + 1.6), (cx - 8.0, cy - 0.6), (cx - 6.2, cy - 10.0), (cx - 2.8, cy - 13.0), (cx + 2.6, cy - 13.4), (cx + 6.0, cy - 10.6), (cx + 7.4, cy - 3.0),
            (cx + 13.0, cy - 4.4), (cx + 12.2, cy + 3.4), (cx + 8.2, cy + 7.8), (cx + 5.8, cy + 8.6), (cx + 4.8, cy + 4.8), (cx + 1.6, cy + 5.2), (cx + 1.0, cy + 9.6),
            (cx - 7.6, cy + 10.4), (cx - 12.0, cy + 7.0)]
    holes.append(poly(grin))
    return {"lobes": lobes, "holes": holes, "rot": T, "neck": 104.0}

def pumpkin(PK):
    out = ['<g id="pumpkin" display="none">']
    out.append('<g mask="url(#thiccpkmask)">')
    out.append(f'<g {PK["rot"]}>')
    for (cx_, cy_, rx_, ry_, f_) in PK["lobes"]:
        out.append(ellipse(cx_, cy_, rx_, ry_, f_, INK, LW))
    out.append(path("M127,10 Q121,56 127,104", "none", PUMPKIN2, 2.6, 'opacity="0.45"'))
    out.append(ellipse(88.0, 26.0, 9.0, 3.8, "#FFFFFF", "none", 0, 'opacity="0.22" transform="rotate(-38 88 26)"'))
    out.append('</g>')
    out.append('</g>')
    out.append('<g clip-path="url(#thiccpkholesclip)">')
    for d in PK["holes"]: out.append(path(d, "none", "#1E0D05", 8, 'opacity="0.3"'))
    for d in PK["holes"]: out.append(path(d, "none", PUMPKIN2, 4))
    out.append('</g>')
    for d in PK["holes"]: out.append(path(d, "none", INK, LW))
    out.append(f'<g {PK["rot"]}>')
    out.append(path(smooth_closed([(122.0, 11.0), (120.0, 2.0), (123.0, -7.0), (131.0, -9.0), (134.0, 1.0), (133.0, 11.0)], 0.4), MOSS, INK, LW))    # the stem
    out.append(path("M133,0 Q145,-10 151,0 Q153,9 146,8", "none", MOSS, 2.0))
    out.append(path("M131,3 Q143,-8 154,-2 Q145,7 133,7 Z", "#6BB84A", INK, 1.6))
    out.append(path("M134,5 Q143,-2 151,-1", "none", INK, 1.0, 'opacity="0.5"'))
    out.append('</g>')
    out.append('</g>')
    return out

if __name__ == "__main__":
    out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "thiccums.svg"))
    open(out, "w").write(build())
    print("wrote", out)
