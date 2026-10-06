"""The r3tards character -> packages/pet/r3tards.svg   (LAB ONLY: no contract, no collection; see apps/web/src/r3tards/)

The one reference is r3tards/GyjP2nSXcAIz-VS.jpeg at the repo root: a floating face, two sleepy eyes (a white glint and
a pink heart on each iris) over a big pair of brown lips with a smirk, in a thick wobbly black line, on purple. There is
no head and no skin: between the brows, the lid creases and the eyes the background shows through. The operator's bar:
"this exactly and like just a simple stick figure body. needs to be perfect".

So the face is the picture, traced (r3tards_ref.py: every line as a centreline with the reference's own width, drawn
here as a band; the fills traced under them), and under it a stick figure in the same line: a spine, two arms, two legs,
round ends, no hands or feet. The face floats on the top of the spine: the neck runs up behind the lower lip.

Rigged with the cat's group ids so rig.ts drives it without knowing what it is:
  #shadow, #figure
  #footL / #footR   the legs, each a line from the hip (they pivot there; pet css pins it), in #figure before #body
  #body             the spine, with the knots at the hips and the shoulders
  #head             the face: the lips' fill, #face (the eyes, #mouth, the face's own ink), #dirt, #tear
  #arms             #legL / #legR, the arms, drawn AFTER the head (a raised arm is in front of the face), like the frog's;
                    the rig drives #arms with every body motion
  #crown (#crownlift, #glint*), #halo, #sweat, #stink, #zzz

What had to be worked out, because the face has no skin:
  - A blink cannot be a lid-coloured cover sliding over the eye: there is no lid colour, the room shows through. So the
    eye's opening itself closes. Everything in the eye (the white, the iris) is clipped twice: by the opening where it is,
    and by the same opening as a clip that MOVES (its path carries the class `lid`, so the rig's blink slides it down):
    what shows is where the two overlap, a lens that shuts from the top. The upper lid's line is the other `.lid`: it
    travels down with it, clipped to the opening so it vanishes at the lower lid instead of crossing it. Tested in
    Chrome and WebKit. A clipPath takes shapes, not groups: the class is on the path itself.
  - The upper lid's line belongs to the open eye (`.open`): on a closed, happy, squeezed or dead eye it is gone and the
    other shape is drawn in the empty opening.
  - The lips never change shape. The mouth is the line between them (and what opens along it): #mouth holds the six
    mouths, clipped to the lips, so a yawn that scales #mouth-open stays inside them.

    python3 r3tards.py
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import r3tards_ref as R
import r3tards_ref2 as R2
import r3items

# ---- palette ----
INK    = "#000000"
BROWN  = R.BROWN_RGB   # the lips
LIDC = "#6A4A89"            # his eyelids: the reference picture's background purple (sampled: 106, 74, 137)
WHITE  = "#FFFFFF"
PINK   = R.PINK_RGB    # the hearts
PUPIL  = "#281828"     # the ground shadow, the cat's
MAW    = "#3B1420"     # inside the mouth
TONGUE = "#E8839A"
TEAR   = "#A9D8F0"
MUD    = "#4A2A1E"     # grime on the lips
GOLD   = "#E8D89B"
GOLD2  = "#D4A646"
RUBY   = "#8B1A2D"
TEAL   = "#2D7D8A"
GREEN  = "#6BB84A"
LAV    = "#EAC6EA"

S = 0.17                    # view units per reference pixel: the face is 116 wide, 70 tall
FACE_BOTTOM = 114.0         # where the lower lip's outer edge sits
def V(X, Y):
    """A point on the reference picture (pixels) -> view units. The face's box is centred on x = 100."""
    return ((X - 562.5) * S + 100.0, (Y - 778.0) * S + FACE_BOTTOM)
LW = 2 * 9.2 * S            # the reference's line: 18.4 px = 3.13 units (the cat's is 2.7)

NECK = (100.0, 111.0)       # the head unit's pivot: where the spine runs up behind the lower lip
SHOULDER = (100.0, 122.5)   # the arms' root on the spine
HIP = (100.0, 160.0)        # the legs' root, and the body's pivot
FLOOR = 212.0

# ---------------- helpers ----------------
def f2(v): return f"{v:.2f}"
def sc(pts, t=0.5):
    """A closed smooth path through pts (Catmull-Rom), two decimals."""
    n = len(pts); out = []
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3)
        if i == 0: out.append(f"M{f2(p1[0])},{f2(p1[1])}")
        out.append(f"C{f2(c1[0])},{f2(c1[1])} {f2(c2[0])},{f2(c2[1])} {f2(p2[0])},{f2(p2[1])}")
    return " ".join(out) + " Z"
def path(d, fill="none", stroke="none", w=0.0, extra=""):
    s = f'stroke="{stroke}" stroke-width="{w:.3f}" stroke-linejoin="round" stroke-linecap="round"' if stroke != "none" else 'stroke="none"'
    return f'<path d="{d}" fill="{fill}" {s} {extra}/>'
def ellipse(cx, cy, rx, ry, fill, stroke="none", w=0.0, extra=""):
    s = f'stroke="{stroke}" stroke-width="{w}"' if stroke != "none" else 'stroke="none"'
    return f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx:.3f}" ry="{ry:.3f}" fill="{fill}" {s} {extra}/>'
def circle(cx, cy, r, fill, extra=""):
    return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.3f}" fill="{fill}" stroke="none" {extra}/>'
def polyline(pts):
    return "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in pts) + " Z"

def band(samples, cap0=True, cap1=True):
    """A line of varying width as a filled outline: `samples` are (x, y, width) along its centre; round ends. Every ink
    line here is one, so a line swells and thins exactly where the reference's does."""
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
    return sc(ring, 0.25)
def ink(d, extra=""):
    return path(d, INK, "none", 0, extra)
# The pale edge. The reference sits on a mid purple; the pet's room is far darker, and by night a black line all but
# vanishes into it (the stick body most of all). So every ink shape that can stand against the room carries a thin pale
# edge, like a sticker's: the shape is defined once (KEPT, written into <defs>) and drawn twice, first as a pale stroke
# (half of it shows outside the shape), then filled black. Every edge is drawn before any black it could cross: within a
# group, and across the groups that move apart (build(): the stick's, the face's and the jaw's edges are all in twin
# groups under everything), so an edge never cuts across a line it meets.
RIM = "#D9CAFB"; RIMW = 1.36
KEPT = []
def keep(d):
    KEPT.append(f'<path id="r3k{len(KEPT)}" d="{d}"/>'); return f"r3k{len(KEPT) - 1}"
def edges(ids):
    return "".join(f'<use href="#{i}" fill="none" stroke="{RIM}" stroke-width="{RIMW}" stroke-linejoin="round" class="r3rim"/>' for i in ids)
def blacks(ids):
    return "".join(f'<use href="#{i}" fill="{INK}"/>' for i in ids)
def edged(*ds):
    ids = [keep(d) for d in ds]; return edges(ids) + blacks(ids)
def disc_d(cx, cy, r):
    return f"M{f2(cx - r)},{f2(cy)} a{f2(r)},{f2(r)} 0 1,0 {f2(2 * r)},0 a{f2(r)},{f2(r)} 0 1,0 {f2(-2 * r)},0 Z"
def spline(pts, step=0.9, t=0.5):
    """Points along a smooth open curve through pts, about `step` apart."""
    out = []; n = len(pts)
    for i in range(n - 1):
        p0 = pts[max(i - 1, 0)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(i + 2, n - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3)
        k = max(2, int(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step))
        for j in range(k if i < n - 2 else k + 1):
            u = j / k; a = (1 - u) ** 3; b = 3 * (1 - u) ** 2 * u; c = 3 * (1 - u) * u * u; d = u ** 3
            out.append((a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]))
    return out
def wobble(pts, amp=0.42, wave=24.0, phase=0.0):
    """The reference's line is drawn by hand: it wanders a little either side of where it is going. A drawn line gets the
    same, so it sits with the traced ones: each point pushed off the line by a slow wave (nothing at the two ends)."""
    n = len(pts); out = []; d = 0.0
    total = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(n - 1)) or 1.0
    for i, (x, y) in enumerate(pts):
        if i: d += math.hypot(x - pts[i - 1][0], y - pts[i - 1][1])
        x0, y0 = pts[max(i - 1, 0)]; x1, y1 = pts[min(i + 1, n - 1)]
        tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1.0
        fade = min(1.0, d / 5.0, (total - d) / 5.0)
        k = amp * fade * (math.sin(2 * math.pi * d / wave + phase) + 0.45 * math.sin(2 * math.pi * d / (wave * 0.43) + phase * 1.7))
        out.append((x - ty / m * k, y + tx / m * k))
    return out
def line(pts, w=None, cap0=True, cap1=True):
    """A constant-width ink line through pts (smoothed), as a band."""
    w = LW if w is None else w
    return band([(x, y, w) for x, y in spline(pts)], cap0, cap1)
def limb(pts, phase):
    """A limb of the stick figure: a line through pts with the hand-drawn wander."""
    return band([(x, y, LW) for x, y in wobble(spline(pts), 0.27, 31.0, phase)])

# the traced strokes and shapes, in view units
ST = {k: [(*V(x, y), 2 * hw * S) for x, y, hw in v] for k, v in R.STROKES.items()}
PV = lambda pts: [V(x, y) for x, y in pts]

def lower_y(side, x):
    """The lower lid's centreline height at x (side 0: the left eye)."""
    s = ST["lowerL" if side == 0 else "lowerR"]
    best = min(range(len(s) - 1), key=lambda i: abs((s[i][0] + s[i + 1][0]) / 2 - x))
    (x0, y0, _), (x1, y1, _) = s[best], s[best + 1]
    if abs(x1 - x0) < 1e-6: return y0
    u = min(1.0, max(0.0, (x - x0) / (x1 - x0))); return y0 + (y1 - y0) * u
def lid_y(side, x):
    s = ST["lidL" if side == 0 else "lidR"]
    best = min(range(len(s) - 1), key=lambda i: abs((s[i][0] + s[i + 1][0]) / 2 - x))
    (x0, y0, _), (x1, y1, _) = s[best], s[best + 1]
    if abs(x1 - x0) < 1e-6: return y0
    u = min(1.0, max(0.0, (x - x0) / (x1 - x0))); return y0 + (y1 - y0) * u

# ---------------- the eyes ----------------
def pg(pts):
    """A closed polygon, straight sided: for the shapes traced exactly off the reference (r3tards_ref2.py), whose points
    are a third of a pixel apart in tolerance; a smoothed curve through them would round the eyes' sharp corners."""
    return "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in pts) + " Z"
def eyes():
    """Two layers per eye. UNDER the face's ink: the upper lid's line (it moves) and the shapes of the shut eyes. OVER the
    ink: the white and the iris, in the exact shape the reference shows (R2.EYES2 "eye"). The white used to be a grown
    shape tucked under the lines round it, so its visible edge was the lines' edges: bands rebuilt from centrelines, lumpy
    wherever lines meet (the operator: the right eye's corner "kinda blotchy", "a black bump on the line" by the pupil).
    Drawn on top, the white's own traced edge is the edge; a 5 px ring under it (part on the lid, so it travels with the
    blink; part with the ink) closes any gap where a band falls short of it."""
    out = []; over = []
    for side, (eid, e) in enumerate((("eyeL", R.EYES[0]), ("eyeR", R.EYES[1]))):
        tag = "L" if side == 0 else "R"
        e2 = R2.EYES2[side]
        op = PV(e["opening"]); xs = [p[0] for p in op]
        x0, x1 = min(xs), max(xs)
        over.append(f'<g id="{eid}top" class="eye"><g class="open">')
        # the white and the iris, where the eye and the moving eye overlap (the blink: see the top of the file)
        over.append(f'<g clip-path="url(#r3open{tag})"><g clip-path="url(#r3shut{tag})">')
        over.append(path(pg(PV(e2["eye"])), WHITE))
        over.append('<g class="pupil">')
        over.append(path(pg(PV(e2["iris"])), INK))
        for gl in e["glints"]: over.append(path(sc(PV(gl)), WHITE))
        over.append(path(sc(PV(e["heart"])), PINK))
        over.append('</g>')
        over.append('</g></g></g></g>')
        out.append(f'<g id="{eid}" class="eye">')
        out.append('<g class="open">')
        out.append("".join(path(pg(PV(r)), INK) for r in e2["ringends"] if len(r) >= 4))
        # the upper lid's line: it is the lid, and travels with the blink, clipped to the opening and its own band
        out.append(f'<g clip-path="url(#r3lid{tag})"><g class="lid">')
        lid_ids = [keep(band(ST["lidL" if side == 0 else "lidR"]))]
        if side == 1: lid_ids.append(keep(sc(PV(R.PATCHES[1]))))   # the crook where the right iris meets its lid
        # (its pale edge only on its upper side, against the room: below it is the white of the eye, where a pale line shows)
        out.append(f'<g clip-path="url(#r3rim{tag})">' + edges(lid_ids) + '</g>' + blacks(lid_ids))
        out.append("".join(path(pg(PV(r)), INK) for r in e2["ringup"] if len(r) >= 4))
        out.append('</g></g>')
        out.append('</g>')  # open
        # ---- the other eyes, drawn in the empty opening ----
        # the eye's two corners: where the lids meet, a little in from the opening's tips
        m = 4.2
        xa, xb = x0 + m, x1 - m; cx = (xa + xb) / 2; hw = (xb - xa) / 2
        ya = (lower_y(side, xa) + lid_y(side, xa)) / 2; yb = (lower_y(side, xb) + lid_y(side, xb)) / 2
        n = 28
        chord = lambda t: (xa + (xb - xa) * t, ya + (yb - ya) * t)
        # asleep: the lids have met. One line from corner to corner, sagging a little, with the reference's own weight
        shut = [(chord(i / n)[0], chord(i / n)[1] + 2.3 * math.sin(math.pi * i / n)) for i in range(n + 1)]
        out.append('<g class="closed" display="none">' + edged(band([(x, y, LW) for x, y in wobble(shut, 0.34, 19.0, 1.1 + side)])) + '</g>')
        # happy: one clean arch between the same corners
        arch = [(chord(i / n)[0], chord(i / n)[1] - 6.4 * math.sin(math.pi * i / n) ** 0.85) for i in range(n + 1)]
        out.append('<g class="happy" display="none">' + edged(band([(x, y, LW) for x, y in wobble(arch, 0.34, 21.0, 2.3 + side)])) + '</g>')
        # squeezed shut: > on the left eye, < on the right, pointing at the bridge
        sgn = 1 if side == 0 else -1
        my = (lower_y(side, cx) + lid_y(side, cx)) / 2 + 0.6
        sq = [(cx - sgn * hw * 0.66, my - 5.2), (cx + sgn * hw * 0.52, my), (cx - sgn * hw * 0.66, my + 5.2)]
        dense = []
        for (ax, ay), (bx, by) in zip(sq, sq[1:]):
            k = max(2, int(math.hypot(bx - ax, by - ay) / 0.8)); dense += [(ax + (bx - ax) * j / k, ay + (by - ay) * j / k) for j in range(k)]
        dense.append(sq[-1])
        out.append('<g class="squeeze" display="none">' + edged(band([(x, y, LW) for x, y in dense])) + '</g>')
        # dead: x
        q = 5.4
        out.append('<g class="x" display="none">' + edged(line([(cx - q, my - q), (cx + q, my + q)]), line([(cx + q, my - q), (cx - q, my + q)])) + '</g>')
        out.append('</g>')
    return out, over

def eye_defs():
    out = []
    for side, e in enumerate(R.EYES):
        tag = "L" if side == 0 else "R"
        op = pg(PV(R2.EYES2[side]["eye"]))
        out.append(f'<clipPath id="r3open{tag}"><path d="{op}"/></clipPath>')
        out.append(f'<clipPath id="r3shut{tag}"><path class="lid" d="{op}"/></clipPath>')
        out.append(f'<clipPath id="r3lid{tag}"><path d="{sc(PV(e["lidclip"]))}"/></clipPath>')
        # everything above the upper lid's centreline (it travels with the lid: it is used inside the moving group)
        # (not round its two ends: there it runs into other lines, and its edge showed as a pale speck beside them)
        c = [(x, y) for x, y, _ in ST["lidL" if side == 0 else "lidR"]][5:-5]
        out.append(f'<clipPath id="r3rim{tag}"><path d="{polyline(c + [(c[-1][0], c[-1][1] - 16), (c[0][0], c[0][1] - 16)])}"/></clipPath>')
    return out

# ---------------- the mouths ----------------
# The lips never change; the mouth is the line between them, and what opens along it. Idle is the reference's own line
# (the smirk hooking up on the right). The others are drawn, not nudged: each is a line of its own through points given
# in the reference's pixels, in the reference's weight, starting where the reference's line starts (the notch in the
# outline at the left corner of the mouth), so every mouth joins the lips the same way.
MOUTH = R.STROKES["mouth"]     # (X, Y, half-width) in reference pixels, from the left corner to the hook's free end
CORNER = (MOUTH[0][0], MOUTH[0][1])
MW = sorted(hw for _, _, hw in MOUTH)[len(MOUTH) // 2] * 2 * S      # the mouth line's own weight
def mline(pts, w=None, cap0=True, cap1=True, phase=0.0):
    return band([(x, y, MW if w is None else w) for x, y in wobble(spline(PV(pts), 0.7), phase=phase)], cap0, cap1)
LIPS = None   # the lips' fill in view units (set in build): every mouth must lie inside it
def inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0): c = not c
    return c
def check_inside(name, samples, scale=(1.0, 1.0), origin=(0.0, 0.0)):
    """Every point of a mouth's line (its two edges, at its own width) must be inside the lips, or the lips' clip cuts
    it off flat: the operator saw exactly that ("it looks weird when the smile gets big like its cut off")."""
    bad = 0
    for i, (x, y, w) in enumerate(samples):
        x0, y0 = samples[max(i - 1, 0)][:2]; x1, y1 = samples[min(i + 1, len(samples) - 1)][:2]
        tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1.0
        for sgn in (-1, 1):
            px, py = x - ty / m * w / 2 * sgn, y + tx / m * w / 2 * sgn
            px, py = origin[0] + (px - origin[0]) * scale[0], origin[1] + (py - origin[1]) * scale[1]
            if not inside((px, py), LIPS): bad += 1
    if bad: raise SystemExit(f"mouth '{name}' leaves the lips at {bad} points (scale {scale}): it would be cut off")
def mouths():
    out = ['<g id="mouth">']
    CLIP = lambda inner: '<g clip-path="url(#r3lips)">' + inner + '</g>'
    def m(mid, parts, clipped=False):
        g = f'<g id="mouth-{mid}"{"" if mid == "idle" else " display=\"none\""}>' + "".join(parts) + '</g>'
        # `clipped`: the clip is OUTSIDE the mouth's group, so when the rig scales the group (a yawn, a scream) the clip
        # stays the lips' size
        out.append(CLIP(g) if clipped else g)
    def drawn(name, pts, phase, skip=4):
        smp = [(x, y, MW) for x, y in wobble(spline(PV(pts), 0.7), phase=phase)]
        check_inside(name, smp[skip:])          # (its first few points sit in the notch of the outline, where it joins)
        return smp
    m("idle", [ink(band([(*V(x, y), 2 * hw * S) for x, y, hw in MOUTH]))])
    # smug: flatter than the smirk, and the one corner pulled up harder
    m("smug", [CLIP(ink(band(drawn("smug", [CORNER, (338, 600), (432, 626), (545, 644), (652, 650), (742, 638), (800, 614), (834, 592), (846, 584)], 0.8))))])
    # smile: a deep curve, low in the middle, both ends up
    SMILE = [CORNER, (322, 606), (405, 654), (515, 688), (630, 692), (735, 664), (800, 626), (838, 596)]
    smile = drawn("smile", SMILE, 2.1)
    m("smile", [CLIP(ink(band(smile)))])
    # frown: the smirk gone. The line arches a little and droops away to the right, its end turned down, inside the lip
    m("frown", [CLIP(ink(band(drawn("frown", [CORNER, (332, 594), (428, 610), (535, 613), (640, 620), (722, 640), (770, 664), (790, 684)], 3.4))))])
    # open: the lips part along the line. The upper lip's edge stays about where the line was and the lower lip drops
    # away under it; the line runs on to the notch at the left corner and up into the hook at the right, as at rest.
    # The rig scales `#mouth-open` (down for a chew, up for a yawn); on a line drawing that is a fat or a pinched line and
    # a mouth cut off by the lips, so on him that scaling is switched off (r3tards.css) and this is drawn at its one size.
    TOP = [(342, 616), (430, 614), (545, 624), (660, 626), (750, 628), (790, 630)]
    BOT = [(790, 630), (772, 664), (704, 684), (590, 712), (470, 698), (388, 664), (342, 616)]
    top = wobble(spline(PV(TOP), 1.5), 0.3, 22.0, 0.6); bot = spline(PV(BOT), 1.5)
    hole = top + bot[1:-1]
    hole_d = "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in hole) + " Z"
    tongue = spline(PV([(452, 712), (500, 674), (580, 662), (665, 668), (716, 700)]), 0.7) + PV([(716, 760), (452, 760)])
    tongue_d = "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in tongue) + " Z"
    crease = spline(PV([(578, 674), (582, 694)]), 0.7)
    ring = [(x, y, MW) for x, y in hole + [hole[0]]]
    # the two ends are the traced line's own: from the left corner in to the hole, and from the hole out along the hook
    joinL = [(*V(x, y), MW) for x, y, _ in MOUTH if x <= 342] + [(*V(342, 616), MW)]
    joinR = [(*V(790, 630), MW)] + [(*V(x, y), MW) for x, y, _ in MOUTH[len(MOUTH) // 2:] if x >= 792]
    check_inside("open", ring)
    m("open", [path(hole_d, MAW),
               '<g clip-path="url(#r3maw)">' + path(tongue_d, TONGUE) + ink(band([(x, y, MW * 0.42) for x, y in crease])) + '</g>',
               ink(band(ring, False, False)), ink(band(joinL)), ink(band(joinR))], clipped=True)
    # gape: the yawn. The same mouth with the jaw dropped: the lower lip hangs down out of the lips' own outline (a brown
    # rim of its own round the bottom of the hole), the tongue lying in it. Not clipped to the lips: it is their shape
    # that changes. Its pale edge shows only outside the face's own silhouette (#r3beyond).
    GB = [(790, 630), (800, 700), (752, 772), (650, 814), (540, 816), (440, 784), (366, 708), (342, 616)]
    gbot = spline(PV(GB), 2.0)
    ghole = top + gbot[1:-1]
    ghole_d = "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in ghole) + " Z"
    # the jaw's outer line: out of the notch at the left corner, round under everything the lower lip was (its old
    # outline and pale edge are all under the jaw's fill), and up into the face's own outline on the right
    RIMOUT = [CORNER, (222, 600), (204, 676), (254, 772), (346, 834), (450, 862), (545, 868), (650, 858), (752, 822), (842, 756), (900, 678), (916, 612), (888, 562)]
    rimout = spline(PV(RIMOUT), 2.0)
    jaw_d = "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in rimout + [(x, y) for x, y in top][::-1]) + " Z"
    gtongue = spline(PV([(446, 800), (486, 740), (566, 716), (652, 728), (712, 786)]), 0.7) + PV([(712, 880), (446, 880)])
    gtongue_d = "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in gtongue) + " Z"
    gcrease = spline(PV([(574, 736), (582, 786)]), 0.7)
    jaw_pts = wobble(rimout, 0.3, 26.0, 1.4)
    jaw_line = band([(x, y, MW) for x, y in jaw_pts])
    jaw_mid = "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in jaw_pts)
    m("gape", [path(jaw_d, BROWN), path(ghole_d, MAW),
               '<g clip-path="url(#r3gape)">' + path(gtongue_d, TONGUE) + ink(band([(x, y, MW * 0.5) for x, y in gcrease])) + '</g>',
               ink(jaw_line), ink(band([(x, y, MW) for x, y in ghole + [ghole[0]]], False, False)), ink(band(joinL)), ink(band(joinR))])
    # yum: the smile, and the tongue out: it hangs from the line over the lower lip and out past the lips' edge
    TG = [(578, 690), (574, 738), (596, 782), (640, 800), (684, 786), (708, 742), (706, 682)]
    tg = spline(PV(TG), 0.7)
    tg_d = "M" + " L".join(f"{f2(x)},{f2(y)}" for x, y in tg) + " Z"
    m("yum", [path(tg_d, TONGUE), ink(band([(x, y, MW * 0.86) for x, y in tg])),
              ink(band([(x, y, MW * 0.5) for x, y in spline(PV([(640, 712), (642, 760)]), 0.7)])), CLIP(ink(band(smile)))])
    out.append('</g>')
    return out, (hole_d, ghole_d, jaw_mid)

# ---------------- the crown (the cat's, floating over the brows) ----------------
def crown():
    out = ['<g id="crown"><g id="crownlift">']
    cx, cy = 100, 40
    P = lambda pts: "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"
    out.append(f'<g transform="translate(-3 3.4) rotate(-5 {cx} {cy}) translate({cx} {cy + 3}) scale(0.92) translate({-cx} {-cy})">')
    out.append(path(P([(70, 46), (66, 30), (74, 32), (80, 12), (88, 30), (94, 30), (100, 8), (106, 30), (112, 30), (120, 12), (126, 32), (134, 30), (130, 46)]), GOLD, INK, 2.7))
    out.append(path(P([(70, 46), (130, 46), (132, 38), (68, 38)]), GOLD2, INK, 1.6))
    for bx, by in ((80, 12), (100, 8), (120, 12)): out.append(ellipse(bx, by, 3.4, 3.4, GOLD, INK, 1.6))
    out.append(ellipse(100, 33, 5, 4.2, RUBY, INK, 1.6))
    out.append(ellipse(84, 36, 2.6, 2.6, TEAL, INK, 1.4))
    out.append(ellipse(116, 36, 2.6, 2.6, GREEN, INK, 1.4))
    for hx, hy, hr in ((98.4, 31.6, 1.3), (83.2, 35.2, 0.8), (115.2, 35.2, 0.8)): out.append(circle(hx, hy, hr, WHITE))
    def spark(sid, sx, sy, r):
        return (f'<path id="{sid}" display="none" d="M{sx},{sy-r} L{sx+r*0.22},{sy-r*0.22} L{sx+r},{sy} L{sx+r*0.22},{sy+r*0.22} '
                f'L{sx},{sy+r} L{sx-r*0.22},{sy+r*0.22} L{sx-r},{sy} L{sx-r*0.22},{sy-r*0.22} Z" fill="#FFFFFF" stroke="none"/>')
    out.append(spark("glintL", 80, 12, 7)); out.append(spark("glintC", 100, 8, 10)); out.append(spark("glintR", 120, 12, 7))
    out.append('</g></g></g>')
    return out

# ---------------- the stick figure ----------------
# a hand-drawn line like the face's: each limb leans a little off straight, and no two are the same
SPINE = [(100.2, 104.5), (99.5, 122.0), (100.7, 142.0), HIP]
ARM_L = [SHOULDER, (92.6, 133.0), (84.6, 145.0), (78.2, 156.5)]     # on the picture's left (the rig's #legL)
ARM_R = [SHOULDER, (108.2, 132.6), (116.2, 144.2), (122.0, 156.0)]
LEG_L = [HIP, (95.0, 176.0), (89.0, 194.0), (84.6, FLOOR - LW / 2)]  # #footL
LEG_R = [HIP, (105.6, 175.0), (111.2, 193.5), (115.8, FLOOR - LW / 2)]
# Where the limbs meet (the hip, the shoulder) there is no knot: three round-ended lines running into one point, as a
# stick figure is drawn. Their pale edges are all drawn under all of their black (build()), so the joint is solid black
# with the outline running round the outside of it.

def build():
    global LIPS
    g = []
    LIPS = PV(R.BROWN)
    lips_d = sc(LIPS)
    mouth_parts, (hole_d, ghole_d, jaw_mid) = mouths()
    eye_parts, eye_tops = eyes()
    # the face's own ink: every traced line but the two upper lids (they are the eyes' lids) and the mouth (the mouths)
    face_ids = [keep(band(sv)) for name, sv in ST.items() if name not in ("lidL", "lidR", "mouth", "browL", "browR")]
    # his two brows, apart (class r3brow): what is worn on a head takes their place (r3tards.css hides them under a hat,
    # the hair, the hood, a zombie's brain; the operator: "his 2 lil hairs you can have the hats cover")
    brow_ids = [keep(band(ST["browL"])), keep(band(ST["browR"]))]
    face_ids += [keep(sc(PV(R.PATCHES[0]))), keep(sc(PV(R.PATCHES[2])))]
    legL, legR = keep(limb(LEG_L, 0.3)), keep(limb(LEG_R, 1.9))
    spine = keep(limb(SPINE, 4.0))
    armL, armR = keep(limb(ARM_L, 2.6)), keep(limb(ARM_R, 5.2))
    # the shop's items, drawn on him (r3items.py), by where each piece goes
    brown_top = " ".join(pg(PV(c)) for c in R2.BROWN2)
    IT = r3items.make(dict(RIM=RIM, RIMW=RIMW, INK=INK, spline=spline, ARM_L=ARM_L, ARM_R=ARM_R, LEG_L=LEG_L, LEG_R=LEG_R, SPINE=SPINE, brown_d=brown_top))
    J = lambda k: "".join(IT[k])
    g.append('<g id="shadow">' + ellipse(100, FLOOR + 0.6, 27, 4.4, PUPIL, "none", 0, 'opacity="0.5"') + '</g>')
    g.append('<g id="figure">')
    # ONE outline round the whole of him. A pale edge drawn in its own limb's group cuts across whatever limb is drawn
    # before it (and clipping it away at the joints left bare black there: the operator, "where the leg meets the body
    # theres like black ... the outline around his body and arms clean, not like its overlapping parts"). So every pale
    # edge of the stick, of the face and of the yawn's jaw is drawn FIRST, each in a twin group of the part it edges
    # (`data-twin`: the rig gives a twin every animation, fade and show its part gets, rig.ts one()), and every black
    # after: what shows of the edges is the outline of the union, in any pose.
    # a cape goes FIRST, with its own edge under it: it is behind all of him, the pale edges of his sticks included (the
    # operator: with his clothes on "he should still have the white outline around his body")
    g += IT["rims_behind"]
    g += IT["behind"]
    g.append('<g id="footLrim" data-twin="footL">' + edges([legL]) + J("rim_footL") + '</g>')
    g.append('<g id="footRrim" data-twin="footR">' + edges([legR]) + J("rim_footR") + '</g>')
    g.append('<g id="bodyrim" data-twin="body">' + edges([spine]) + J("rim_body") + '</g>')
    g.append('<g id="armsrim" data-twin="arms"><g id="legLrim" data-twin="legL">' + edges([armL]) + J("rim_legL") + '</g><g id="legRrim" data-twin="legR">' + edges([armR]) + J("rim_legR") + '</g></g>')
    g.append('<g id="headrim" data-twin="head">' + edges(face_ids) + '<g class="r3brow">' + edges(brow_ids) + '</g>' + J("rim_head")
             + '<g id="mouth-gaperim" data-twin="mouth-gape" display="none">' + path(jaw_mid, "none", RIM, MW + RIMW) + '</g></g>')
    g += IT["rims_top"]            # the edges of what is worn on the head (each a twin of its piece)
    # the legs behind the body (each turns about the hip), the spine, then the arms: over the body and BEHIND the face,
    # so when the face comes down (to eat, a nod, a squat) it is in front of the shoulders, never cut across by them
    # (the operator: "when hes eating his face goes behind his body")
    g.append('<g id="footL">' + blacks([legL]) + J("footL") + '</g>')
    g.append('<g id="footR">' + blacks([legR]) + J("footR") + '</g>')
    g.append(f'<g id="body" data-top="[{SPINE[0][0]}, {SPINE[0][1]}]">' + blacks([spine]) + J("body") + '</g>')   # (data-top: the spine's top, for tools/r3-check.mjs)
    g.append('<g id="arms"><g id="legL" class="leg">' + blacks([armL]) + J("legL") + '</g><g id="legR" class="leg">' + blacks([armR]) + J("legR") + '</g></g>')
    g += IT["over_arms"]           # at his throat, over the arms: a cape's collar and clasp, the Star of David
    g += IT["pre_head"]            # what is behind the face (the pumpkin's hollow)

    # ---- the head unit: the floating face ----
    g.append('<g id="head">')
    g.append(J("head_under"))      # a head behind the face, for what gives him one (the zombie's skull, the dark inside the mummy's wrappings)
    g.append(path(lips_d, BROWN))
    g.append('<g id="face">')
    # His eyelids: in the reference they are the picture's own purple (he has no skin, so the background shows between
    # the crease and the lid). On a room that was empty space; they are that purple now, a shape under the lines from each
    # crease down to the lower lid, so a blink shuts a purple lid over the eye (the operator: "his eyelids should be the
    # purple from the ref image background, instead of empty space").
    P2 = lambda k, rev=False: [(x, y) for x, y, _ in (ST[k][::-1] if rev else ST[k])]
    lidL = P2("topL", True) + P2("creaseL") + P2("bridge") + P2("lowerL", True) + P2("cornerL", True)     # (both run in under the bridge's line: no gap beside it)
    lidR = P2("creaseR") + P2("cornerR") + P2("lowerR", True) + P2("bridge", True)
    g.append('<g class="r3lid">' + path(pg(lidL), LIDC) + path(pg(lidR), LIDC) + '</g>')
    g += eye_parts
    g.append(blacks(face_ids) + '<g class="r3brow">' + blacks(brow_ids) + '</g>')
    # the rest of the ring round each eye (see eyes()), then the brown again in its exact traced shape, over the ink: the
    # edge between the lips and their lines is then the reference's own, not the bands' (the fill under the ink stays,
    # for wherever a band falls short of it, and under the mouth's slit, which this shape leaves open)
    g.append("".join(path(pg(PV(r)), INK) for e2 in R2.EYES2 for r in e2["ringlow"] if len(r) >= 4))
    g.append(path(" ".join(pg(PV(c)) for c in R2.BROWNRING), INK, "none", 0, 'fill-rule="evenodd"'))
    g.append(path(brown_top, BROWN, "none", 0, 'fill-rule="evenodd"'))
    g.append(J("head_mid"))        # what lies on the lips, under the eyes and the mouth (bandages, stitches; the brain)
    g += eye_tops
    g += mouth_parts     # after the ink: a tongue that is out hangs over the lips' outline
    # lip piercings (emo pack; hidden until worn): two silver hoops through his lower lip, at its edge (measured off the lips)
    import emo as EM
    def lip_edge(x):
        ys = []
        for (x0, y0), (x1, y1) in zip(LIPS, LIPS[1:] + LIPS[:1]):
            if (x0 - x) * (x1 - x) <= 0 and x0 != x1: ys.append(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
        return max(ys) if ys else 110.0
    # (a pair for every mouth: on the lips' own edge for every mouth drawn inside them, under the tongue's sides for yum,
    # on the dropped jaw's edge for the yawn: EM.lip_rings, each a twin of its mouth)
    g.append('<g id="piercings" display="none"></g>')
    RR = 2.6
    for mid, pts in EM.lipring_edges("r3tards").items():
        if mid == "gape": g.append(EM.lip_rings(mid, pts, RR, 1.3, tuck=1.2)); continue
        g.append(EM.lip_rings(mid, [(x, lip_edge(x) - 0.4 - 0.57 * RR) for x, _ in pts], RR, 1.3, tuck=0.0))
    g.append('</g>')  # face
    # grime: smudges on the lips (hidden; shown when hygiene is low)
    g.append('<g id="dirt" display="none" clip-path="url(#r3lips)">')
    for (dx, dy, rx, ry, rot) in ((62, 92, 5.2, 2.6, -14), (88, 104, 4.6, 2.3, 10), (121, 100, 5.0, 2.4, -8), (139, 88, 3.6, 2.0, 16), (104, 91, 3.0, 1.7, 4)):
        g.append(f'<g transform="rotate({rot} {dx} {dy})">' + ellipse(dx, dy, rx, ry, MUD, "none", 0, 'opacity="0.55"') + '</g>')
    g.append('</g>')
    # a tear: it wells at the OUTER corner of his left eye, the far side from his nose, and runs down the side of his face
    # (the operator: on the lip it read as coming from his mouth; under the iris, "make sure the tear comes out of the far
    # side of his eye")
    g.append('<g id="tear" display="none">')
    tx = 57.4; ty = 61.6
    g.append(path(f"M{tx},{ty} C{tx},{ty} {tx-3.5},{ty+6.2} {tx-3.5},{ty+8.9} C{tx-3.5},{ty+11.0} {tx-1.95},{ty+12.4} {tx},{ty+12.4} "
                  f"C{tx+1.95},{ty+12.4} {tx+3.5},{ty+11.0} {tx+3.5},{ty+8.9} C{tx+3.5},{ty+6.2} {tx},{ty} {tx},{ty} Z", TEAR, INK, 1.4))
    g.append(path(f"M{tx-1.5},{ty+7.4} Q{tx-1.7},{ty+9.6} {tx-0.4},{ty+10.4}", "none", WHITE, 0.9, 'opacity="0.85"'))
    g.append('</g>')
    g.append(J("head_end"))        # the payot
    g.append('</g>')  # head

    g += IT["post_a"]              # the hair, the kippah, the keffiyeh: where the crown sits (it gives way to them)
    g += crown()
    g += IT["post_b"]              # the pumpkin, the witch hat: over everything
    # an empty twin of the left arm, in front of everything: what he carries on that arm rides here (the falcon: on the arm
    # itself it was behind his face, which is drawn after the arms). It gets every animation the arm gets (data-twin).
    g.append('<g id="armsover" data-twin="arms"><g id="legLover" data-twin="legL"></g></g>')
    # halo (dead): a gold ring floating over the brows
    g.append('<g id="halo" display="none">')
    g.append(ellipse(99, 28, 24, 6.5, "none", INK, 2.7))
    g.append(ellipse(99, 28, 24, 6.5, "none", GOLD, 3.4))
    g.append(path("M81,26 Q87,22 95,22", "none", WHITE, 1.6, 'opacity="0.8"'))
    g.append('</g>')
    # sweat drop (tense), out past the right brow
    g.append('<g id="sweat" display="none">')
    sx, sy = 158.0, 46.0
    g.append(path(f"M{sx},{sy} C{sx},{sy} {sx-6},{sy+10} {sx-6},{sy+14} C{sx-6},{sy+17.5} {sx-3.3},{sy+20} {sx},{sy+20} C{sx+3.3},{sy+20} {sx+6},{sy+17.5} {sx+6},{sy+14} C{sx+6},{sy+10} {sx},{sy} {sx},{sy} Z", WHITE, INK, 1.7))
    g.append('</g>')
    g.append(f'<g id="stink" display="none" fill="none" stroke="{GREEN}" stroke-width="2" stroke-linecap="round">')
    g.append('<path class="s s1" d="M34,150 Q37,145 34,140 Q31,135 34,130"/>')
    g.append('<path class="s s2" d="M22,116 Q25,111 22,106 Q19,101 22,96"/>')
    g.append('<path class="s s3" d="M172,134 Q175,129 172,124 Q169,119 172,114"/>')
    g.append('</g>')
    g.append(f'<g id="zzz" display="none" fill="none" stroke="{LAV}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">')
    g.append('<path class="z z1" d="M158,44 L168,44 L158,54 L168,54"/>')
    g.append('<path class="z z2" d="M170,24 L183,24 L170,37 L183,37"/>')
    g.append('<path class="z z3" d="M182,0 L198,0 L182,16 L198,16"/>')
    g.append('</g>')
    g.append('</g>')  # figure
    defs = ('<defs id="r3defs">' + "".join(eye_defs())
            + f'<clipPath id="r3lips"><path d="{lips_d}"/></clipPath>'
            + f'<clipPath id="r3maw"><path d="{hole_d}"/></clipPath><clipPath id="r3gape"><path d="{ghole_d}"/></clipPath>'
            # (the items' clips, masks and patterns in one group: the on-chain bake drops it whole, tools/bake-art.mjs)
            + '<g id="r3itemdefs">' + J("defs") + '</g>' + "".join(KEPT) + '</defs>')
    body = defs + "\n" + "\n".join(g)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="200" height="230">
<g id="cat" data-character="r3tards" data-jointed="1">
{body}
</g>
</svg>'''

if __name__ == "__main__":
    out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "r3tards.svg"))
    svg = build()
    open(out, "w").write(svg)
    print("wrote", out, len(svg), "bytes")
