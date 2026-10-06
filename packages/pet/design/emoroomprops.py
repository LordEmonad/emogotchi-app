"""The emo bedroom: a room theme for the emo pack -> packages/pet/props/emoroom*.svg

A teenager's bedroom in 2006, on a rainy day. The sky in the window and the carpet are CSS (stage.css,
data-scene="emoroom"); these are the drawn pieces on top of them, all in the room's 600x460 world coordinates
(Scenery.tsx places each box):

  emoroomout     what the window looks out on: the houses across the street, a bare tree, a telegraph pole, all grey in
                 the rain (stage.css darkens it at night)
  emoroomoutlit  the same view's lights, for the night: lit windows over the street and the streetlamp's head
  emoroomwall    the back wall: dark purple wallpaper with a faint stripe, ONE window cut through it (the view shows
                 through the hole), its frame and sill, a curtain rod with two velvet curtains half drawn, three posters
                 that are pictures only (a broken heart, a cassette, a skull), stickers, the skirting board, and the fairy lights' wire and bulbs strung
                 across the top (their glow is HTML, Scenery.tsx)
  emoroombed     the bed along the wall on the left: a black iron frame and a black-and-pink checked duvet, a pillow
  emoroomstand   the nightstand by the bed, with the lava lamp's base and cap on it (its wax is HTML, moving)
  emoroomlavafront  the lamp's glass: its outline and the shine on it, drawn over the moving wax
  emoroomdesk    the desk on the right: an old beige monitor and its keyboard, a mouse, a flip phone, a CD tower, and a
                 skull with a candle on it (its flame is HTML)
  emoroomscreen  what the monitor shows: a profile page with a grid of eight friends (a generic page, no real site)
  emoroomrug     the black-and-white checked rug under the pet, in one-point perspective like the Majlis's rug
  emoroomflame   the candle's flame (it flickers: stage.css)

There are no words anywhere in the room (the operator's rule, 2026-10-02): the posters are pictures only, and the
screen's page has no lettering. Flat fills and wobbly ink like everything else; the room's ink is a near-black plum. Everything that moves (the rain on the glass, the fairy lights,
the lava lamp's wax, the screen's light, the candle) is a small HTML element of its own over these drawings
(Scenery.tsx, stage.css), never animated inside them. Kept apart from props.py. Run: python3 design/emoroomprops.py
"""
import os, re, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_closed, smooth_open, poly
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

# ---- palette ----
INK       = "#0E0812"   # the room's ink: near-black plum
WALL      = "#25163A"   # the wallpaper: deep purple-black
WALL_S    = "#2F1D47"   # its stripe
WALL_D    = "#1A0F28"
SKIRT     = "#140B1C"
FRAME     = "#A79AB8"   # the window frame: white paint in a dim room
FRAME_L   = "#C9BED6"
FRAME_D   = "#7D6F90"
CURT      = "#3E1840"   # velvet curtains: deep plum
CURT_L    = "#5E2A5C"
CURT_D    = "#260C27"
IRON      = "#141017"   # the bed's iron, the rod, the desk's black
IRON_L    = "#4A3F55"
PINK      = "#E84D7F"   # the Emonad hot pink
PINK_D    = "#B8325F"
LAV       = "#EAC6EA"
PURPLE    = "#906096"
PLUM      = "#502858"
CHECK_K   = "#17111C"   # the duvet's and the posters' black
CHECK_W   = "#A79DB2"   # the rug's white, dimmed by the room (a quieter floor, so the pets' feet read on it)
RUG_K     = "#1E1527"   # the rug's black, a shade off the ink so its binding shows
PAPER     = "#DFD5DF"
DESK      = "#1E1726"
DESK_TOP  = "#2C2238"
DESK_L    = "#4A3C58"
BEIGE     = "#CBC2B0"   # the old computer's plastic
BEIGE_D   = "#A39A87"
BEIGE_L   = "#E2DACA"
BONE      = "#E9E1CF"
BONE_D    = "#B9AE97"
WAX       = "#F2EAD8"
# the view outside, grey in the rain (stage.css darkens it at night)
OUT_FAR   = "#7F8594"
OUT_MID   = "#6A7080"
OUT_NEAR  = "#575C6B"
OUT_ROOF  = "#4C5060"
OUT_TREE  = "#3E4250"
LIT       = "#FFD58A"

FLOOR_Y = 366.0         # the wall's foot
VP = (300.0, 236.0)     # eye level, the vanishing point (the Majlis's and the Western Wall's)
D = 600.0               # how far the eye is from the wall, in wall units: sets how fast the floor comes toward us

def S(d):
    """How much bigger a thing d units out from the wall is drawn than the same thing on the wall."""
    return D / (D - d)

def P(xw, yw, d=0.0):
    """A point d units out from the wall, at (xw, yw) as it would be drawn on the wall itself."""
    s = S(d)
    return (VP[0] + (xw - VP[0]) * s, VP[1] + (yw - VP[1]) * s)

# the window (world coordinates): the glass, the frame round it, the sill
WIN = dict(x0=220.0, x1=380.0, y0=72.0, y1=212.0)
FW = 8.0                 # the frame's width
MUL = 300.0, 142.0       # the glazing bars

# ---------------------------------------------------------------- helpers (majlisprops.py's, for this room's ink)
def path(d, fill="none", stroke=None, w=1.0, extra=""):
    stroke = INK if stroke is None else stroke
    a = f'<path d="{d}" fill="{fill}"'
    if stroke != "none" and w: a += f' stroke="{stroke}" stroke-width="{w:g}"'
    return a + (f" {extra}" if extra else "") + "/>"

def ellipse(cx, cy, rx, ry, fill, stroke=None, w=1.0, extra=""):
    stroke = INK if stroke is None else stroke
    a = f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:g}" ry="{ry:g}" fill="{fill}"'
    if stroke != "none" and w: a += f' stroke="{stroke}" stroke-width="{w:g}"'
    return a + (f" {extra}" if extra else "") + "/>"

def _round(body, decimals):
    def rnd(m):
        v = f"{float(m.group(0)):.{decimals}f}"
        return v.rstrip("0").rstrip(".") if decimals > 0 else v
    return re.sub(r"-?\d+\.\d+", rnd, body)

def write(name, x0, y0, w, h, parts, decimals=1, stretch=False):
    """parts: [(body_list, amp or None[, step])]; None = not baked. Drawn in world coordinates; the box starts at (x0, y0)."""
    out = []
    for part in parts:
        body, amp = part[0], part[1]; step = part[2] if len(part) > 2 else 16.0
        s = "\n".join(body)
        if amp: s = bake(s, amp=amp, freq=0.09, step=step)
        out.append(s)
    body = _round("\n".join(out), decimals)
    body = re.sub(r"([ ,])(-?)0\.(\d)", r"\1\2.\3", body)
    body = re.sub(r" -", "-", body)
    inner = f'<g transform="translate({-x0:g} {-y0:g})">\n{body}\n</g>' if (x0 or y0) else body
    par = ' preserveAspectRatio="none"' if stretch else ""
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}"{par}>\n<g class="{name}" stroke-linejoin="round" stroke-linecap="round">\n{inner}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"{len(src) / 1024:.1f} KB")
    return len(src)

def rbox(x0, y0, x1, y1):
    return f"M{x0:.1f} {y0:.1f}H{x1:.1f}V{y1:.1f}H{x0:.1f}z"

def quad(a, b, c, d):
    return poly([a, b, c, d])

def rect_d(x0, y0, x1, y1):
    """A rectangle in absolute commands, for shapes the wobble baker bakes (it reads M/L/C/Q/Z only)."""
    return f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y0:.1f} L{x1:.1f},{y1:.1f} L{x0:.1f},{y1:.1f} Z"

def seg(x0, y0, x1, y1):
    return f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}"

def catmull(pts, n):
    """Points along a Catmull-Rom curve through pts, n between each pair (the ends included once)."""
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(pts[-1])
    return out

def dot_d(x, y):
    return f"M{x:.1f} {y:.1f}h0"

def rot(pts, cx, cy, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]

# ================================================================ the view outside
def emoroomout():
    """Across the street in the rain, laid out for the middle of the window (the curtains hide its sides): a house with
    its gable toward us on the left, one side-on with a chimney on the right, far roofs pale in the wet air between them,
    a bare street tree in front of the left house reaching up over the panes, the streetlamp, and the telegraph wires
    sagging across the top. All greys (stage.css darkens it at night; its lights are emoroomoutlit)."""
    x0, x1, y0, y1 = WIN["x0"] - 6, WIN["x1"] + 6, WIN["y0"] - 6, WIN["y1"] + 6
    g, near, flat, tree, wires = [], [], [], [], []
    # far: a line of roofs and treetops, pale, low behind the houses
    far = [(x0, 184), (262, 184), (268, 176), (284, 176), (290, 184), (296, 180), (302, 170), (308, 180), (318, 180), (324, 172), (340, 172), (346, 180), (x1, 180), (x1, y1), (x0, y1)]
    g.append(path(poly(far), OUT_FAR, "none", 0))
    g.append(path(smooth_closed([(296, 181), (299, 168), (305, 163), (311, 168), (313, 181)], 0.5), "#7A808F", "none", 0))
    # the left house, its gable end toward us: a wall, the roof's two edges with their eaves, a window, a door
    hl = [(x0, y1), (x0, 156), (254, 124), (292, 156), (292, y1)]
    near.append(path(poly(hl), OUT_MID, INK, 0.8))
    near.append(path(poly([(x0 - 2, 155), (254, 120), (296, 156), (292, 160), (254, 127), (x0 - 2, 161)]), OUT_ROOF, INK, 0.7))
    near.append(path(rect_d(246, 136, 262, 150), "#4C5162", INK, 0.7))
    near.append(path(rect_d(266, 166, 284, 184), "#4C5162", INK, 0.7))
    near.append(path(rect_d(240, 180, 254, y1 + 2), "#454959", INK, 0.7))
    flat.append(path("M254 136V150M246 143H262M275 166V184M266 175H284", "none", "#3D4151", 0.7))
    # the right house, side-on: its roof's long slope, a chimney, two windows
    hr = [(322, y1), (322, 160), (336, 144), (x1, 144), (x1, y1)]
    near.append(path(poly(hr), OUT_MID, INK, 0.8))
    near.append(path(poly([(319, 162), (335, 141), (x1, 141), (x1, 148), (337, 148), (323, 164)]), OUT_ROOF, INK, 0.7))
    near.append(path(rect_d(352, 126, 361, 144), OUT_ROOF, INK, 0.7))
    near.append(path(rect_d(338, 166, 354, 184), "#4C5162", INK, 0.7))
    near.append(path(rect_d(362, 166, 378, 184), "#4C5162", INK, 0.7))
    flat.append(path("M346 166V184M338 175H354M370 166V184M362 175H378", "none", "#3D4151", 0.7))
    # a hedge and the wet pavement along the bottom
    near.append(path(smooth_closed([(x0, y1 + 2), (x0, 200), (232, 197), (252, 199), (276, 196), (300, 199), (324, 196), (350, 199), (372, 196), (x1, 199), (x1, y1 + 2)], 0.4), "#4A5246", INK, 0.7))
    # the bare street tree in front of the left house: a trunk and limbs forking, thinner as they go, up over the panes
    rng = random.Random(4)
    def limb(x, y, ang, ln, wd, depth):
        x2, y2 = x + ln * math.cos(math.radians(ang)), y - ln * math.sin(math.radians(ang))
        tree.append((wd, x, y, x2, y2))
        if depth:
            for da in (rng.uniform(16, 30), -rng.uniform(14, 26)):
                limb(x2, y2, ang + da, ln * rng.uniform(0.62, 0.78), wd * 0.6, depth - 1)
    limb(272, y1 + 4, 92, 40, 4.4, 4)
    limb(271, 186, 132, 20, 2.0, 2)
    tree_paths = [path(seg(xa, ya, xb, yb), "none", OUT_TREE, round(wd, 2)) for wd, xa, ya, xb, yb in tree]
    # the streetlamp on the right, its arm reaching over the pavement; the telegraph wires across the top
    wires.append(path("M318 214L318 158Q318 150 310 150L305 150", "none", OUT_TREE, 1.8))
    wires.append(path("M301 148H309L308 152.4H302Z", OUT_TREE, "none", 0))
    for dy in (0, 9):
        wires.append(path(smooth_open([(x0, 92 + dy), (260, 100 + dy), (310, 106 + dy), (350, 103 + dy), (x1, 95 + dy)], 0.5), "none", "#3C3F4C", 0.75))
    return write("emoroomout", x0, y0, x1 - x0, y1 - y0, [(g, None), (near, 0.3, 14.0), (flat, None), (tree_paths, None), (wires, None)])

def emoroomoutlit():
    """The view's lights, shown at night only: a few windows lit across the street and the streetlamp's lamp."""
    x0, x1, y0, y1 = WIN["x0"] - 6, WIN["x1"] + 6, WIN["y0"] - 6, WIN["y1"] + 6
    g = [path(rbox(266.6, 166.6, 283.4, 183.4), LIT, "none", 0, 'opacity=".85"'),
         path(rbox(246.6, 136.6, 261.4, 149.4), "#F3B9D6", "none", 0, 'opacity=".6"'),
         path(rbox(362.6, 166.6, 377.4, 183.4), LIT, "none", 0, 'opacity=".7"'),
         path("M275 166.6V183.4M266.6 175H283.4M370 166.6V183.4M362.6 175H377.4M254 136.6V149.4M246.6 143H261.4", "none", "#7C5E34", 0.7),
         path("M302 152.4H308L307 154.4H303Z", "#FFE6A8", "none", 0)]
    return write("emoroomoutlit", x0, y0, x1 - x0, y1 - y0, [(g, None)])

def emoroombeads():
    """Rain on the glass: beads of every size scattered over the panes, each with its shine, a few bigger drops. In the
    window's own box (Scenery.tsx puts it inside the glass, over the rain falling outside, under the drops that run)."""
    rng = random.Random(31)
    x0, y0, x1, y1 = WIN["x0"], WIN["y0"], WIN["x1"], WIN["y1"]
    small, big, shine = [], [], []
    for _ in range(170):
        x, y = rng.uniform(x0 + 1, x1 - 1), rng.uniform(y0 + 1, y1 - 1)
        r = rng.choice((0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4))
        small.append(f"M{x - r:.1f} {y:.1f}a{r:g} {r * 1.12:g} 0 1 0 {2 * r:g} 0a{r:g} {r * 1.12:g} 0 1 0 {-2 * r:g} 0")
        if r >= 0.9: shine.append(dot_d(x - r * 0.35, y - r * 0.4))
    for _ in range(14):
        x, y = rng.uniform(x0 + 3, x1 - 3), rng.uniform(y0 + 3, y1 - 3)
        r = rng.uniform(1.8, 2.6)
        big.append(f"M{x - r:.1f} {y:.1f}a{r:.1f} {r * 1.2:.1f} 0 1 0 {2 * r:.1f} 0a{r:.1f} {r * 1.2:.1f} 0 1 0 {-2 * r:.1f} 0")
        shine.append(dot_d(x - r * 0.35, y - r * 0.45))
    g = [f'<path d="{"".join(small)}" fill="#DCE3EF" opacity=".42"/>',
         f'<path d="{"".join(big)}" fill="#C9D2E2" stroke="#6E768A" stroke-width=".4" opacity=".55"/>',
         f'<path d="{"".join(shine)}" fill="none" stroke="#FFFFFF" stroke-width=".8" opacity=".8"/>']
    return write("emoroombeads", x0, y0, x1 - x0, y1 - y0, [(g, None)])

# ================================================================ the back wall
LIGHTS = []   # (x, y, colour index) of each bulb's middle, for Scenery.tsx's glows
BULB = ["#FFF1CF", "#FF9DC0", "#FFF1CF", "#D9BCFF"]   # warm white, pink, warm white, lavender (unlit glass)

def poster_heart():
    """The big poster over the bed: a hot pink heart broken in two on a black field, a pale paper border round it,
    taped up at the top corners. A picture only, no words."""
    cx, cy, w, h, ang = 80.0, 156.0, 80.0, 106.0, -3.0
    x0, y0 = cx - w / 2, cy - h / 2
    g = []
    g.append(path(poly(rot([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)], cx, cy, ang)), PAPER, INK, 1.4))
    g.append(path(poly(rot([(x0 + 6, y0 + 6), (x0 + w - 6, y0 + 6), (x0 + w - 6, y0 + h - 6), (x0 + 6, y0 + h - 6)], cx, cy, ang)), CHECK_K, "none", 0))
    # the heart, broken down the middle by a jagged crack, the two halves a little apart
    hx, hy, sc, gap = cx, cy + 1, 1.85, 2.0
    def heart(dx):
        return [(hx + dx, hy - 8 * sc), (hx + dx + 4 * sc, hy - 15 * sc), (hx + dx + 12 * sc, hy - 17 * sc), (hx + dx + 18 * sc, hy - 11 * sc),
                (hx + dx + 17 * sc, hy - 1 * sc), (hx + dx + 9 * sc, hy + 9 * sc), (hx + dx, hy + 17 * sc)]
    crack = [(3 * sc, 10 * sc), (-2 * sc, 4 * sc), (2 * sc, -2 * sc)]
    right = heart(gap) + [(hx + gap + x, hy + y) for x, y in crack]
    left = [(2 * hx - x, y) for x, y in heart(gap)] + [(hx - gap + x, hy + y) for x, y in crack]
    for half in (left, right):
        g.append(path(poly(rot(half, cx, cy, ang)), PINK, INK, 1.3))
    # a shine on each lobe
    for sx_ in (-1, 1):
        g.append(path(poly(rot([(hx + sx_ * 9 * sc, hy - 13.4 * sc), (hx + sx_ * 13.6 * sc, hy - 14 * sc), (hx + sx_ * 15.4 * sc, hy - 10.6 * sc), (hx + sx_ * 13 * sc, hy - 11.6 * sc)], cx, cy, ang)), "#FF9DBB", "none", 0))
    tape = []
    for (tx, ty, ta) in ((x0 + 2, y0 + 1, -38), (x0 + w - 2, y0 + 1, 34)):
        tape.append(path(poly(rot([(tx - 8, ty - 3), (tx + 8, ty - 3), (tx + 8, ty + 3), (tx - 8, ty + 3)], tx, ty, ta + ang)), "#E8DEC0", "none", 0, 'opacity=".75"'))
    return g, [], tape

def poster_cassette():
    """The poster over the desk: a big cassette tape on purple, pinned at the top. A picture only, no words: the
    label is plain pink with a black band, the tape wound thick on one reel and thin on the other."""
    cx, cy, w, h, ang = 494.0, 136.0, 82.0, 100.0, 2.6
    x0, y0 = cx - w / 2, cy - h / 2
    g = []
    g.append(path(poly(rot([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)], cx, cy, ang)), PURPLE, INK, 1.4))
    g.append(path(poly(rot([(x0 + 4, y0 + 4), (x0 + w - 4, y0 + 4), (x0 + w - 4, y0 + h - 4), (x0 + 4, y0 + h - 4)], cx, cy, ang)), "none", LAV, 0.8, 'opacity=".6"'))
    kx, ky, kw, kh = cx, cy + 2, 64.0, 42.0
    R = lambda pts: poly(rot(pts, cx, cy, ang))
    shell = [(kx - kw / 2, ky - kh / 2), (kx + kw / 2, ky - kh / 2), (kx + kw / 2, ky + kh / 2), (kx + kw / 2 - 10, ky + kh / 2), (kx + kw / 2 - 14, ky + kh / 2 - 8),
             (kx - kw / 2 + 14, ky + kh / 2 - 8), (kx - kw / 2 + 10, ky + kh / 2), (kx - kw / 2, ky + kh / 2)]
    g.append(path(R(shell), CHECK_K, INK, 1.3))
    # the label: pink, a black band across its middle where the window is
    g.append(path(R([(kx - kw / 2 + 5, ky - kh / 2 + 5), (kx + kw / 2 - 5, ky - kh / 2 + 5), (kx + kw / 2 - 5, ky + 8), (kx - kw / 2 + 5, ky + 8)]), PINK, "none", 0))
    g.append(path(R([(kx - kw / 2 + 5, ky - 6.5), (kx + kw / 2 - 5, ky - 6.5), (kx + kw / 2 - 5, ky + 4.5), (kx - kw / 2 + 5, ky + 4.5)]), CHECK_K, "none", 0))
    g.append(path(R([(kx - kw / 2 + 5, ky - kh / 2 + 9), (kx + kw / 2 - 5, ky - kh / 2 + 9), (kx + kw / 2 - 5, ky - kh / 2 + 10.6), (kx - kw / 2 + 5, ky - kh / 2 + 10.6)]), LAV, "none", 0))
    # the window, the tape wound on the reels, the reels
    g.append(path(R([(kx - 18, ky - 5.5), (kx + 18, ky - 5.5), (kx + 18, ky + 3.5), (kx - 18, ky + 3.5)]), "#2A1F30", INK, 0.8))
    for rx, tr in ((-10.5, 6.6), (10.5, 4.8)):
        px, py = rot([(kx + rx, ky - 1)], cx, cy, ang)[0]
        g.append(ellipse(px, py, tr, tr, "#5A2E26", "none", 0))
    for rx in (-10.5, 10.5):
        px, py = rot([(kx + rx, ky - 1)], cx, cy, ang)[0]
        g.append(ellipse(px, py, 3.8, 3.8, PAPER, INK, 0.8))
        g.append(ellipse(px, py, 1.4, 1.4, CHECK_K, "none", 0))
    screws = [f'<path d="{"".join(dot_d(*rot([(kx + sx_, ky + sy_)], cx, cy, ang)[0]) for sx_, sy_ in ((-kw / 2 + 2.6, -kh / 2 + 2.6), (kw / 2 - 2.6, -kh / 2 + 2.6), (-kw / 2 + 2.6, kh / 2 - 2.6), (kw / 2 - 2.6, kh / 2 - 2.6)))}" fill="none" stroke="#5A4E66" stroke-width="1.6"/>']
    pins = [ellipse(*rot([(cx, y0 + 3)], cx, cy, ang)[0], 2.2, 2.2, PINK, INK, 0.8)]
    return g, screws, pins

def poster_skull():
    """The small poster on hot pink paper, stuck up crooked between the big one and the window: a black skull with
    its eyes, nose and teeth cut through to the pink. A picture only, no words."""
    cx, cy, w, h, ang = 158.0, 210.0, 40.0, 50.0, 7.0
    x0, y0 = cx - w / 2, cy - h / 2
    PK = "#F27AA3"
    g = []
    g.append(path(poly(rot([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)], cx, cy, ang)), PK, INK, 1.1))
    sx, sy = cx, cy - 1
    skull = [(sx, sy - 16), (sx + 8, sy - 14.4), (sx + 12.6, sy - 8.6), (sx + 13.2, sy - 1.6), (sx + 11, sy + 4.4), (sx + 7.4, sy + 6.6), (sx + 7, sy + 13),
             (sx + 3, sy + 15), (sx - 3, sy + 15), (sx - 7, sy + 13), (sx - 7.4, sy + 6.6), (sx - 11, sy + 4.4), (sx - 13.2, sy - 1.6), (sx - 12.6, sy - 8.6), (sx - 8, sy - 14.4)]
    g.append(path(smooth_closed(rot(skull, cx, cy, ang), 0.35), CHECK_K, INK, 1.1))
    # the cut-outs: two eyes, the nose, the line of the teeth and the gaps between them
    for ex in (-5.6, 5.6):
        px, py = rot([(sx + ex, sy - 1.6)], cx, cy, ang)[0]
        g.append(ellipse(px, py, 3.7, 4.0, PK, "none", 0))
    g.append(path(poly(rot([(sx, sy + 3.4), (sx + 2.2, sy + 7.4), (sx - 2.2, sy + 7.4)], cx, cy, ang)), PK, "none", 0))
    teeth = [path(poly(rot([(sx - 5, sy + 10), (sx + 5, sy + 10), (sx + 5, sy + 11.2), (sx - 5, sy + 11.2)], cx, cy, ang)), PK, "none", 0)]
    for tx in (-2.6, 0, 2.6):
        a_, b_ = rot([(sx + tx, sy + 8.6), (sx + tx, sy + 13.2)], cx, cy, ang)
        teeth.append(path(seg(a_[0], a_[1], b_[0], b_[1]), "none", PK, 0.9))
    tape = [path(poly(rot([(cx - 7, y0 - 2.5), (cx + 7, y0 - 2.5), (cx + 7, y0 + 2.5), (cx - 7, y0 + 2.5)], cx, y0, ang - 4)), "#E8DEC0", "none", 0, 'opacity=".75"')]
    return g, teeth, tape

def emoroomwall():
    rng = random.Random(7)
    W, H = 600.0, FLOOR_Y
    g, frame, curt, stripes, art, artink, top = [], [], [], [], [], [], []
    wx0, wx1, wy0, wy1 = WIN["x0"], WIN["x1"], WIN["y0"], WIN["y1"]
    fx0, fx1, fy0, fy1 = wx0 - FW, wx1 + FW, wy0 - FW, wy1 + FW
    # the wallpaper, with the window's glass cut through it
    g.append(f'<path d="{rbox(-2, -2, W + 2, H + 1)}{rbox(wx0, wy0, wx1, wy1)}" fill="{WALL}" fill-rule="evenodd"/>')
    # its stripe: two thin lines every 24, broken round the window
    sd = []
    for x in range(6, 600, 24):
        for xx in (x, x + 4):
            if fx0 - 2 < xx < fx1 + 2: sd.append(f"M{xx} 0V{fy0:g}M{xx} {fy1 + 8:g}V352")
            else: sd.append(f"M{xx} 0V352")
    stripes.append(f'<path d="{"".join(sd)}" fill="none" stroke="{WALL_S}" stroke-width="1.6"/>')
    # the skirting board
    g2 = [path(rbox(-2, 350, W + 2, H + 1), SKIRT, "none", 0), path("M-2 350H602", "none", "#3B2A4E", 1.4), path(f"M-2 {H - 0.5:g}H602", "none", INK, 1.4)]
    # the window: its frame, the two glazing bars, the inner edge in shade, and the sill
    frame.append(f'<path d="{rbox(fx0, fy0, fx1, fy1)}{rbox(wx0, wy0, wx1, wy1)}" fill="{FRAME}" fill-rule="evenodd"/>')
    frame.append(path(rbox(MUL[0] - 2.4, wy0, MUL[0] + 2.4, wy1), FRAME, "none", 0))
    frame.append(path(rbox(wx0, MUL[1] - 3, wx1, MUL[1] + 3), FRAME, "none", 0))
    frame.append(path(f"M{fx0 + 1.5:g} {fy0 + 1.5:g}H{fx1 - 1.5:g}", "none", FRAME_L, 1.2))
    frame.append(path(f"M{wx0:g} {wy0 + 1:g}H{wx1:g}M{wx0 + 1:g} {wy0:g}V{wy1:g}", "none", FRAME_D, 2.0, 'opacity=".8"'))
    lines = [path(poly([(fx0, fy0), (fx1, fy0), (fx1, fy1), (fx0, fy1)]), "none", INK, 1.5),
             path(poly([(wx0, wy0), (wx1, wy0), (wx1, wy1), (wx0, wy1)]), "none", INK, 1.1),
             path(f"M{MUL[0] - 2.4:g},{wy0:g} L{MUL[0] - 2.4:g},{wy1:g} M{MUL[0] + 2.4:g},{wy0:g} L{MUL[0] + 2.4:g},{wy1:g}", "none", INK, 0.9),
             path(f"M{wx0:g},{MUL[1] - 3:g} L{wx1:g},{MUL[1] - 3:g} M{wx0:g},{MUL[1] + 3:g} L{wx1:g},{MUL[1] + 3:g}", "none", INK, 0.9)]
    sx0, sx1, sy = fx0 - 8, fx1 + 8, fy1
    sill = [path(poly([(sx0, sy), (sx1, sy), (sx1 + 1, sy + 7), (sx0 - 1, sy + 7)]), FRAME_L, INK, 1.4),
            path(seg(sx0, sy + 9.5, sx1, sy + 9.5), "none", WALL_D, 3.0, 'opacity=".8"')]
    # a sticker or two on the wall: a pink star by the flyer, a black heart under the desk poster
    st = []
    for (x, y, r, col, a) in ((182, 104, 6.0, PINK, 12), (556, 202, 4.6, LAV, -10)):
        pts = [(x + (r if i % 2 == 0 else r * 0.45) * math.sin(math.pi * i / 5 + math.radians(a)), y - (r if i % 2 == 0 else r * 0.45) * math.cos(math.pi * i / 5 + math.radians(a))) for i in range(10)]
        st.append(path(poly(pts), col, INK, 0.9))
    hx, hy = 430, 170
    st.append(path(poly(rot([(hx, hy - 3), (hx + 3, hy - 6.5), (hx + 7, hy - 6), (hx + 8, hy - 2), (hx, hy + 6), (hx - 8, hy - 2), (hx - 7, hy - 6), (hx - 3, hy - 6.5)], hx, hy, -8)), CHECK_K, LAV, 0.8))
    # the posters and the flyer
    a1, i1, t1 = poster_heart()
    a2, i2, t2 = poster_cassette()
    a3, i3, t3 = poster_skull()
    art += a1 + a2 + a3; artink += i1 + i2 + i3; tapes = t1 + t2 + t3
    # the curtain rod, its rings and finials, and the two curtains half drawn, deep plum velvet, to just under the sill
    rod_y = fy0 - 10
    top.append(path(f"M{fx0 - 22:g} {rod_y:g}H{fx1 + 22:g}", "none", INK, 3.6))
    top.append(path(f"M{fx0 - 22:g} {rod_y - 0.6:g}H{fx1 + 22:g}", "none", IRON_L, 1.0))
    for ex in (fx0 - 25, fx1 + 25):
        top.append(ellipse(ex, rod_y, 4.0, 4.0, IRON, INK, 1.0))
        top.append(ellipse(ex - 1.2, rod_y - 1.3, 1.2, 1.2, IRON_L, "none", 0))
    hem = sy + 14
    def curtain(side):
        """One curtain, its top gathered on the rod; `side` -1 the left, 1 the right (mirrored about x 300)."""
        def m(x): return x if side < 0 else 600 - x
        outer, inner_top, inner_mid, inner_bot = fx0 - 18, 252.0, 246.0, 238.0
        ys = rod_y + 2
        pts = [(m(outer), ys), (m(inner_top), ys), (m(inner_top + 1), ys + 40), (m(inner_mid), ys + 100), (m(inner_bot), hem - 1)]
        # the hem, scalloped where the folds meet it
        nf = 6
        for k in range(1, nf + 1):
            t = k / nf
            x = inner_bot + (outer - 2 - inner_bot) * t
            pts.append((m(x + (outer - 2 - inner_bot) / nf * 0.5), hem + 2.2))
            pts.append((m(x), hem - 0.5 if k < nf else hem - 1))
        pts.append((m(outer - 2), ys + 80))
        body = [path(smooth_closed(pts, 0.25), CURT, INK, 1.5)]
        # folds: a darker trough and a lit ridge down each, spreading toward the hem
        folds = []
        for k in range(1, nf):
            t = k / nf
            xt = outer + (inner_top - outer) * t
            xb = outer - 2 + (inner_bot - outer + 2) * t
            folds.append(path(smooth_open([(m(xt), ys + 4), (m(xt + (xb - xt) * 0.5 + 1), ys + 70), (m(xb), hem - 2)], 0.5), "none", CURT_D, 2.6, 'opacity=".9"'))
            folds.append(path(smooth_open([(m(xt + 2.6), ys + 6), (m(xt + (xb - xt) * 0.5 + 3.6), ys + 70), (m(xb + 3), hem - 4)], 0.5), "none", CURT_L, 1.4, 'opacity=".75"'))
        # its inner edge catches the window's light
        folds.append(path(smooth_open([(m(inner_top - 1.5), ys + 3), (m(inner_top - 0.5), ys + 40), (m(inner_mid - 1.5), ys + 100), (m(inner_bot - 1.5), hem - 4)], 0.5), "none", "#8B5A88", 1.4, 'class="er-curtlit" opacity=".8"'))
        rings = [ellipse(m(x), rod_y, 2.3, 3.0, "none", IRON_L, 1.0) for x in [outer + (inner_top - outer) * (k + 0.5) / 7 for k in range(7)]]
        return body, folds, rings
    cb, cf, cr = [], [], []
    for sd_ in (-1, 1):
        b, f, r = curtain(sd_); cb += b; cf += f; cr += r
    # the fairy lights: a wire swagged across the top of the wall between five pins, a bulb every so often hanging from it
    pins = [(-12, 16), (138, 26), (300, 18), (462, 26), (612, 16)]
    sag = 30.0
    wire_pts = []
    for (ax, ay), (bx, by) in zip(pins, pins[1:]):
        for i in range(24):
            t = i / 24
            wire_pts.append((ax + (bx - ax) * t, ay + (by - ay) * t + sag * 4 * t * (1 - t)))
    wire_pts.append(pins[-1])
    wire = [path(smooth_open(wire_pts, 0.5), "none", "#1B2A1E", 1.3)]
    # bulbs along it, a fixed distance apart along the wire
    L = [0.0]
    for a, b in zip(wire_pts, wire_pts[1:]): L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = L[-1]
    step = total / 26
    bulbs, sockets, shine = [], [], []
    trng = random.Random(77)   # their own, so the glows' places (Scenery.tsx ER_LIGHTS) never move when the wall changes
    k = 0
    s = step * 0.5
    j = 0
    while s < total:
        while L[j + 1] < s: j += 1
        a, b = wire_pts[j], wire_pts[j + 1]
        t = (s - L[j]) / (L[j + 1] - L[j])
        px, py = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        if -4 < px < 604:
            tilt = trng.uniform(-14, 14)
            col = k % 4
            sock = rot([(px - 1.5, py), (px + 1.5, py), (px + 1.7, py + 3.6), (px - 1.7, py + 3.6)], px, py, tilt)
            bulb = rot([(px, py + 3.4), (px + 2.6, py + 5.6), (px + 2.6, py + 8.4), (px, py + 11.4), (px - 2.6, py + 8.4), (px - 2.6, py + 5.6)], px, py, tilt)
            sockets.append(path(poly(sock), "#1B2A1E", "none", 0))
            bulbs.append(path(smooth_closed(bulb, 0.6), BULB[col], INK, 0.7))
            c = rot([(px - 1, py + 6.4)], px, py, tilt)[0]
            shine.append(dot_d(*c))
            mid = rot([(px, py + 7.6)], px, py, tilt)[0]
            LIGHTS.append((round(mid[0], 1), round(mid[1], 1), col))
            k += 1
        s += step
    pin_marks = [ellipse(x, y, 2.4, 2.4, PINK if i % 2 else LAV, INK, 0.8) for i, (x, y) in enumerate(pins) if 0 < x < 600]
    lights = wire + sockets + bulbs + [f'<path d="{"".join(shine)}" fill="none" stroke="#FFFFFF" stroke-width="1.1" opacity=".8"/>'] + pin_marks
    return write("emoroomwall", 0, 0, W, H, [(g, None), (stripes, None), (g2, None), (frame, None), (lines, 0.35, 30.0), (sill, 0.4, 30.0),
                                              (art, 0.4, 18.0), (artink, None), (tapes, None), (st, 0.3, 10.0),
                                              (cb, 0.5, 22.0), (cf, None), (top, None), (cr, None), (lights, None)])

# ================================================================ the bed
def emoroombed():
    """The bed along the wall on the left, its foot end toward the middle of the room: a black iron frame with a
    rail of bars at the foot, a mattress under a duvet in black and pink checks that hangs over the front and the
    foot, a pillow at the head (off to the left). In one-point perspective onto VP."""
    XL, XR, TOP, DROP, D0, D1 = -90.0, 166.0, 300.0, 336.0, 3.0, 94.0
    g, checks, ink, iron = [], [], [], []
    # its shadow on the floor
    g.append(path(quad(P(XL, FLOOR_Y, 0), P(XR + 8, FLOOR_Y, 0), P(XR + 8, FLOOR_Y, D1 + 4), P(XL, FLOOR_Y, D1 + 4)), "#0B0610", "none", 0, 'opacity=".55"'))
    # the frame under the duvet: the side rail, a leg at the foot's front corner and one at the back
    for (xw, d) in ((XR - 3, D1 - 2), (XR - 3, D0 + 4)):
        a, b = P(xw - 3, DROP + 4, d), P(xw + 3, FLOOR_Y, d)
        iron.append(path(quad((a[0], a[1]), (b[0], a[1]), (b[0], b[1]), (a[0], b[1])), IRON, INK, 1.2))
    iron.append(path(quad(P(XL, DROP + 2, D1 - 2), P(XR, DROP + 2, D1 - 2), P(XR, DROP + 10, D1 - 2), P(XL, DROP + 10, D1 - 2)), IRON, INK, 1.3))
    # the duvet: its top (seen from above), the front it hangs down, the foot end it hangs over
    top = [P(XL, TOP, D0), P(XR, TOP, D0), P(XR, TOP, D1), P(XL, TOP, D1)]
    front = [P(XL, TOP, D1), P(XR, TOP, D1), P(XR, DROP, D1 + 2), P(XL, DROP, D1 + 2)]
    end = [P(XR, TOP, D0), P(XR, TOP, D1), P(XR + 1, DROP, D1 + 2), P(XR + 1, DROP, D0)]
    # checks: 22 a side on the front and the end, the top's in perspective, the colours running on over the edges
    SQ = 22.0
    tops = []
    nx = int((XR - XL) / SQ) + 1
    dz = [D0 + (D1 - D0) * k / 4 for k in range(5)]
    for i in range(nx):
        xa, xb = XR - (i + 1) * SQ, XR - i * SQ
        for j in range(4):
            if (i + j) % 2: continue
            tops.append(quad(P(xa, TOP, dz[j]), P(xb, TOP, dz[j]), P(xb, TOP, dz[j + 1]), P(xa, TOP, dz[j + 1])))
        for j, (ya, yb) in enumerate(((TOP, TOP + 18), (TOP + 18, DROP))):
            if (i + j + 4) % 2: continue
            tops.append(quad(P(xa, ya, D1 + 2 * j / 2), P(xb, ya, D1 + 2 * j / 2), P(xb, yb, D1 + 2 * (j + 1) / 2), P(xa, yb, D1 + 2 * (j + 1) / 2)))
    for j in range(4):
        for jj, (ya, yb) in enumerate(((TOP, TOP + 18), (TOP + 18, DROP))):
            if (j + jj) % 2 == 0: continue
            tops.append(quad(P(XR, ya, dz[j]), P(XR, ya, dz[j + 1]), P(XR + 1, yb, dz[j + 1]), P(XR + 1, yb, dz[j])))
    g.append(path(poly(end), PINK_D, "none", 0))
    g.append(path(poly(front), PINK, "none", 0))
    g.append(path(poly(top), "#F06A93", "none", 0))
    checks.append(f'<path d="{"".join(tops)}" fill="{CHECK_K}"/>')
    # the edges round where the duvet folds over, a lit line along them, and the ink round it all
    ink.append(path(smooth_open([P(XL, TOP + 1, D1), P(XR - 4, TOP + 1, D1), P(XR, TOP + 4, D1 - 4)], 0.4), "none", "#FFB3CB", 1.3, 'opacity=".55"'))
    outline = [P(XL, TOP, D0), P(XR - 3, TOP, D0), P(XR, TOP + 2, D0 + 2), P(XR, TOP + 3, D1 - 3), P(XR + 1, DROP - 2, D1 + 1), P(XR - 2, DROP, D1 + 2), P(XL, DROP, D1 + 2)]
    ink.append(path(poly(outline), "none", INK, 1.5))
    ink.append(path(f"M{P(XR, TOP + 3, D1 - 3)[0]:.1f},{P(XR, TOP + 3, D1 - 3)[1]:.1f} L{P(XR, TOP + 2, D0 + 2)[0]:.1f},{P(XR, TOP + 2, D0 + 2)[1]:.1f}", "none", INK, 1.0))
    ink.append(path(f"M{P(XL, TOP, D1)[0]:.1f},{P(XL, TOP, D1)[1]:.1f} L{P(XR - 3, TOP, D1)[0]:.1f},{P(XR - 3, TOP, D1)[1]:.1f} L{P(XR, TOP + 3, D1 - 3)[0]:.1f},{P(XR, TOP + 3, D1 - 3)[1]:.1f}", "none", INK, 1.1))
    # the pillow at the head (the head of the bed is off to the left), lavender with a black heart on it
    pc = P(44, TOP - 6, 36)
    pil = [(pc[0] - 38, pc[1] + 8), (pc[0] - 36, pc[1] - 8), (pc[0] - 10, pc[1] - 13), (pc[0] + 20, pc[1] - 11), (pc[0] + 30, pc[1] - 3), (pc[0] + 27, pc[1] + 9), (pc[0] - 2, pc[1] + 12)]
    pillow = [path(smooth_closed(pil, 0.55), LAV, INK, 1.4),
              path(smooth_open([(pc[0] - 20, pc[1] + 5), (pc[0] + 2, pc[1] + 2), (pc[0] + 20, pc[1] + 4)], 0.5), "none", "#C9A3C9", 1.3)]
    hx, hy = pc[0] + 6, pc[1] - 3
    pillow.append(path(poly([(hx, hy - 1.5), (hx + 2.5, hy - 4.5), (hx + 5.5, hy - 4), (hx + 6, hy - 1), (hx, hy + 4.5), (hx - 6, hy - 1), (hx - 5.5, hy - 4), (hx - 2.5, hy - 4.5)]), CHECK_K, "none", 0))
    # the iron foot rail: two posts with ball tops, a top rail, and bars between, in the plane of the foot end
    FT = 266.0
    for d in (D0 + 1, D1 + 1):
        a, b = P(XR + 2, FT - 2, d), P(XR + 2, FLOOR_Y, d)
        w = 2.6 * S(d)
        iron.append(path(quad((a[0] - w, a[1]), (a[0] + w, a[1]), (b[0] + w, b[1]), (b[0] - w, b[1])), IRON, INK, 1.2))
        iron.append(ellipse(a[0], a[1] - 3.2 * S(d), 3.6 * S(d), 3.6 * S(d), IRON, INK, 1.1))
        iron.append(ellipse(a[0] - 1.2, a[1] - 4.4 * S(d), 1.1, 1.1, IRON_L, "none", 0))
    rail = [P(XR + 2, FT + 4, D0 + 1), P(XR + 2, FT + 4, D1 + 1)]
    bars = [path(f"M{rail[0][0]:.1f},{rail[0][1]:.1f} L{rail[1][0]:.1f},{rail[1][1]:.1f}", "none", IRON, 3.4)]
    for k in range(1, 6):
        d = D0 + 1 + (D1 - D0) * k / 6
        a, b = P(XR + 2, FT + 4, d), P(XR + 2, TOP + 1, d)
        bars.append(path(f"M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}", "none", IRON, 1.6))
        if k % 2:
            m = P(XR + 2, FT + 15, d)
            bars.append(ellipse(m[0], m[1], 2.0, 3.4, "none", IRON, 1.2))
    bars.append(path(f"M{rail[0][0]:.1f},{rail[0][1] - 1.2:.1f} L{rail[1][0]:.1f},{rail[1][1] - 1.2:.1f}", "none", IRON_L, 0.9, 'opacity=".9"'))
    bx0, by0 = -2.0, math.floor(FT - 14)
    return write("emoroombed", bx0, by0, 182 - bx0, 400 - by0, [(g, 0.45, 18.0), (checks, None), (pillow, 0.4, 12.0), (ink, 0.45, 18.0), (iron, 0.35, 12.0), (bars, None)])

# ================================================================ the nightstand and the lava lamp
LAVA = {}   # the lamp's glass in world coordinates, for Scenery.tsx's wax and its clip

def emoroomstand():
    """A small black nightstand by the bed with one drawer, and on it the lava lamp: a rocket of a lamp, a tapering
    purple base, the glass (wider low down, narrowing to the top), a cone cap. The glass is LAVA (the wax moves in it,
    HTML); its outline and shine are drawn over the wax by emoroomlavafront."""
    XA, XB, D0, D1, TOPY = 178.0, 216.0, 6.0, 56.0, 316.0
    g, ink = [], []
    # the stand: its top, its front, its right side (seen, left of the middle), a drawer, a knob
    top = [P(XA, TOPY, D0), P(XB, TOPY, D0), P(XB, TOPY, D1), P(XA, TOPY, D1)]
    front = [P(XA, TOPY, D1), P(XB, TOPY, D1), P(XB, FLOOR_Y, D1), P(XA, FLOOR_Y, D1)]
    side = [P(XB, TOPY, D0), P(XB, TOPY, D1), P(XB, FLOOR_Y, D1), P(XB, FLOOR_Y, D0)]
    g.append(path(quad(P(XA - 2, FLOOR_Y, D0), P(XB + 4, FLOOR_Y, D0), P(XB + 4, FLOOR_Y, D1 + 4), P(XA - 2, FLOOR_Y, D1 + 4)), "#0B0610", "none", 0, 'opacity=".55"'))
    g.append(path(poly(side), "#120B17", INK, 1.2))
    g.append(path(poly(front), DESK, INK, 1.3))
    g.append(path(poly(top), DESK_TOP, INK, 1.3))
    dr = [P(XA + 4, TOPY + 8, D1), P(XB - 4, TOPY + 8, D1), P(XB - 4, TOPY + 24, D1), P(XA + 4, TOPY + 24, D1)]
    g.append(path(poly(dr), "#251D2E", INK, 1.0))
    kn = P((XA + XB) / 2, TOPY + 16, D1)
    ink.append(ellipse(kn[0], kn[1], 2.0, 2.0, LAV, INK, 0.7))
    ink.append(path(f"M{top[3][0]:.1f} {top[3][1] + 0.8:.1f}L{top[2][0]:.1f} {top[2][1] + 0.8:.1f}", "none", DESK_L, 1.2))
    # the lamp, standing in the middle of the stand's top
    bx, by = P((XA + XB) / 2, TOPY, (D0 + D1) / 2)
    lamp = []
    base = [(bx - 11, by), (bx + 11, by), (bx + 6.5, by - 20), (bx - 6.5, by - 20)]
    lamp.append(ellipse(bx, by, 11, 2.4, "#3A2440", INK, 1.0))
    lamp.append(path(poly(base), PURPLE, INK, 1.3))
    lamp.append(path(f"M{bx - 8:.1f},{by - 3:.1f} L{bx - 4.6:.1f},{by - 18:.1f}", "none", "#C9A6D0", 1.6, 'opacity=".8"'))
    lamp.append(path(f"M{bx - 9.4:.1f},{by - 6:.1f} L{bx + 9.4:.1f},{by - 6:.1f}", "none", PLUM, 1.0, 'opacity=".9"'))
    # the glass: from the base's top (by-20) up 46, widest a third of the way up
    gb, gt = by - 20, by - 62
    # its left side as a smooth curve through four points, sampled (the same points clip the wax, Scenery.tsx), mirrored
    side = catmull([(bx - 6.2, gb), (bx - 9.4, gb - 12), (bx - 8.0, gt + 13), (bx - 4.2, gt)], 6)
    glass = side + [(2 * bx - x, y) for x, y in side[::-1]]
    LAVA["glass"] = glass
    LAVA["box"] = (bx - 10, gt, 20, gb - gt)
    cap = [(bx - 4.6, gt + 0.5), (bx + 4.6, gt + 0.5), (bx + 2.4, gt - 11), (bx - 2.4, gt - 11)]
    lamp.append(path(poly(cap), PURPLE, INK, 1.2))
    lamp.append(path(f"M{bx - 3:.1f},{gt - 1:.1f} L{bx - 1.6:.1f},{gt - 9:.1f}", "none", "#C9A6D0", 1.2, 'opacity=".8"'))
    # its cord down the back of the stand
    ink.append(path(smooth_open([(bx + 6, by - 2), (bx + 14, by + 1), (P(XB, TOPY + 2, D0 + 6)[0] + 1, P(XB, TOPY + 2, D0 + 6)[1])], 0.5), "none", INK, 1.1))
    xs = [p[0] for p in top + front + side]
    x0, x1 = math.floor(min(xs)) - 4, math.ceil(max(xs)) + 4
    y0 = math.floor(gt - 14)
    LAVA["standbox"] = (x0, y0, x1 - x0, 400 - y0)
    return write("emoroomstand", x0, y0, x1 - x0, 400 - y0, [(g, 0.4, 14.0), (ink, None), (lamp, 0.3, 8.0)])

def emoroomlavafront():
    """The lamp's glass drawn over the moving wax: its outline and a long shine down its left side."""
    gl = LAVA["glass"]
    bx = (gl[0][0] + gl[-1][0]) / 2
    gb, gt = gl[0][1], min(y for _, y in gl)
    g = [path(poly(gl), "none", INK, 1.2),
         path(smooth_open([(bx - 5.8, gb - 4), (bx - 7.4, gb - 15), (bx - 5.6, gt + 11), (bx - 3.2, gt + 3)], 0.5), "none", "#FFFFFF", 1.3, 'opacity=".55"'),
         path(f"M{bx + 5.4:.1f},{gb - 10:.1f} L{bx + 6.2:.1f},{gb - 18:.1f}", "none", "#FFFFFF", 0.9, 'opacity=".35"')]
    x0, y0 = math.floor(bx - 12), math.floor(gt - 2)
    return write("emoroomlavafront", x0, y0, 24, math.ceil(gb + 2 - y0), [(g, None)])

# ================================================================ the desk
DESKBOX = {}

def emoroomdesk():
    """The desk on the right, black, a drawer column under its right end: on it an old beige monitor (its screen is
    emoroomscreen, drawn over it), the keyboard and a mouse, a pink flip phone, a CD tower at the left end, and at the
    right end a skull with a white candle on it, the wax run down over the bone (the flame is emoroomflame)."""
    XA, XB, D0, D1, TOPY, TH = 398.0, 572.0, 2.0, 86.0, 288.0, 7.0
    g, ink, things = [], [], []
    g.append(path(quad(P(XA, FLOOR_Y, D0), P(XB + 10, FLOOR_Y, D0), P(XB + 10, FLOOR_Y, D1 + 4), P(XA - 4, FLOOR_Y, D1 + 4)), "#0B0610", "none", 0, 'opacity=".55"'))
    # the left side panel (seen: right of the middle, its left face shows), the drawer column at the right end
    side = [P(XA, TOPY + TH, D0), P(XA, TOPY + TH, D1 - 2), P(XA, FLOOR_Y, D1 - 2), P(XA, FLOOR_Y, D0)]
    g.append(path(poly(side), "#18121F", INK, 1.2))
    leg = [P(XA, TOPY + TH, D1 - 2), P(XA + 9, TOPY + TH, D1 - 2), P(XA + 9, FLOOR_Y, D1 - 2), P(XA, FLOOR_Y, D1 - 2)]
    g.append(path(poly(leg), DESK, INK, 1.2))
    under = [P(XA + 9, TOPY + TH, D1 - 2), P(XB - 50, TOPY + TH, D1 - 2), P(XB - 50, TOPY + TH + 10, D1 - 2), P(XA + 9, TOPY + TH + 10, D1 - 2)]
    g.append(path(poly(under), DESK, INK, 1.0))
    col = [P(XB - 50, TOPY + TH, D1 - 2), P(XB + 30, TOPY + TH, D1 - 2), P(XB + 30, FLOOR_Y, D1 - 2), P(XB - 50, FLOOR_Y, D1 - 2)]
    g.append(path(poly(col), DESK, INK, 1.3))
    for ya, yb in ((TOPY + TH + 4, TOPY + TH + 30), (TOPY + TH + 34, FLOOR_Y - 6)):
        dd = [P(XB - 46, ya, D1 - 2), P(XB + 30, ya, D1 - 2), P(XB + 30, yb, D1 - 2), P(XB - 46, yb, D1 - 2)]
        g.append(path(poly(dd), "#241C2D", INK, 1.0))
        hp = P(XB - 26, (ya + yb) / 2, D1 - 2)
        ink.append(path(f"M{hp[0] - 7:.1f} {hp[1]:.1f}H{hp[0] + 7:.1f}", "none", LAV, 2.0))
    # the top: seen from above, a lit front edge
    top = [P(XA - 3, TOPY, D0), P(XB + 30, TOPY, D0), P(XB + 30, TOPY, D1), P(XA - 3, TOPY, D1)]
    edge = [P(XA - 3, TOPY, D1), P(XB + 30, TOPY, D1), P(XB + 30, TOPY + TH, D1), P(XA - 3, TOPY + TH, D1)]
    g.append(path(poly(top), DESK_TOP, INK, 1.3))
    g.append(path(poly(edge), DESK, INK, 1.3))
    ink.append(path(f"M{edge[0][0]:.1f} {edge[0][1] + 0.9:.1f}L{edge[1][0]:.1f} {edge[1][1] + 0.9:.1f}", "none", DESK_L, 1.3))
    # the CD tower at the left end: a black stand with a stack of jewel cases, their spines in every colour
    cds = []
    TX0, TX1, TD, TT = 403.0, 419.0, 26.0, 202.0
    tf = [P(TX0, TT, TD), P(TX1, TT, TD), P(TX1, TOPY, TD), P(TX0, TOPY, TD)]
    ts = [P(TX0, TT, TD - 14), P(TX0, TT, TD), P(TX0, TOPY, TD), P(TX0, TOPY, TD - 14)]
    cds.append(path(poly(ts), "#120C16", INK, 1.0))
    cds.append(path(poly(tf), IRON, INK, 1.2))
    spines = [PINK, LAV, "#6BB84A", "#F2EAD8", PURPLE, "#2D7D8A", "#E8D89B", "#FF9DBB", "#B894D8", "#F2EAD8", PINK, "#5A8E43", LAV, "#D4A646", "#906096", "#F2EAD8", "#2D7D8A", PINK, "#EAC6EA", "#E8D89B", "#6BB84A", LAV, "#F27AA3", "#B894D8"]
    cr = random.Random(5)
    y = TT + 3.0
    i = 0
    sp = []
    while y < TOPY - 4:
        h = 3.0
        a, b = P(TX0 + 2, y, TD), P(TX1 - 2, y + h - 0.6, TD)
        sp.append(f'<path d="{rbox(a[0], a[1], b[0], b[1])}" fill="{spines[i % len(spines)]}"/>')
        if cr.random() < 0.5:
            sp.append(f'<path d="M{a[0] + 1.5:.1f} {(a[1] + b[1]) / 2:.1f}H{a[0] + 1.5 + cr.uniform(3, 8):.1f}" stroke="{INK}" stroke-width=".5" opacity=".5"/>')
        y += h; i += 1
    # the monitor: a deep beige box, the front its bezel, its left side going back to the wall, a foot under it
    MX0, MX1, MY0, MY1, MD = 432.0, 510.0, 216.0, 280.0, 58.0
    f0, f1 = P(MX0, MY0, MD), P(MX1, MY1, MD)
    b0, b1 = P(MX0 + 8, MY0 + 7, 8), P(MX1 - 8, MY1 - 7, 8)
    mon = []
    mon.append(path(quad(P(MX0 + 18, TOPY, MD - 6), P(MX1 - 18, TOPY, MD - 6), P(MX1 - 24, MY1 + 2, MD - 10), P(MX0 + 24, MY1 + 2, MD - 10)), BEIGE_D, INK, 1.2))
    mon.append(path(quad((f0[0], f0[1]), (b0[0], b0[1]), (b0[0], b1[1]), (f0[0], f1[1])), BEIGE_D, INK, 1.3))
    mon.append(path(rect_d(f0[0], f0[1], f1[0], f1[1]), BEIGE, INK, 1.5))
    sx0, sy0, sx1, sy1 = round(f0[0] + 8), round(f0[1] + 7), round(f1[0] - 8), round(f1[1] - 11)   # whole numbers: the screen is a box of its own (props.ts fit() rewrites integer sizes only)
    DESKBOX["screen"] = (sx0, sy0, sx1 - sx0, sy1 - sy0)
    mon.append(path(rect_d(sx0 - 3, sy0 - 3, sx1 + 3, sy1 + 3), BEIGE_D, INK, 1.0))
    bez = [path(rbox(sx0 - 0.5, sy0 - 0.5, sx1 + 0.5, sy1 + 0.5), "#101318", "none", 0),
           path(f"M{f0[0] + 2:.1f} {f0[1] + 1.6:.1f}H{f1[0] - 2:.1f}", "none", BEIGE_L, 1.3),
           path(f"M{f1[0] - 18:.1f} {f1[1] - 5:.1f}h0M{f1[0] - 12:.1f} {f1[1] - 5:.1f}h0", "none", BEIGE_D, 2.0),
           ellipse(f1[0] - 6, f1[1] - 5, 1.4, 1.4, "#7BE07B", "none", 0, 'class="er-led"'),
           path(f"M{f0[0] + 8:.1f} {f1[1] - 5:.1f}H{f0[0] + 22:.1f}", "none", BEIGE_D, 1.6)]
    # the keyboard in front of it, the mouse beside, the cords
    kb = [P(436, TOPY, 66), P(504, TOPY, 66), P(505, TOPY, 79), P(435, TOPY, 79)]
    kf = [P(435, TOPY, 79), P(505, TOPY, 79), P(505, TOPY - 2.4, 79), P(435, TOPY - 2.4, 79)]
    keys = []
    for r_ in range(4):
        dA, dB = 67.5 + r_ * 2.9, 69.4 + r_ * 2.9
        for c_ in range(15):
            xa = 438.5 + c_ * 4.3
            if r_ == 3 and 3 < c_ < 11:
                if c_ == 4:
                    keys.append(quad(P(xa, TOPY - 1, dA), P(xa + 4.3 * 7 - 1.2, TOPY - 1, dA), P(xa + 4.3 * 7 - 1.2, TOPY - 1, dB), P(xa, TOPY - 1, dB)))
                continue
            keys.append(quad(P(xa, TOPY - 1, dA), P(xa + 3.1, TOPY - 1, dA), P(xa + 3.1, TOPY - 1, dB), P(xa, TOPY - 1, dB)))
    things.append(path(poly(kb), BEIGE, INK, 1.2))
    things.append(path(poly(kf), BEIGE_D, INK, 1.0))
    things.append(f'<path d="{"".join(keys)}" fill="{BEIGE_L}" stroke="{BEIGE_D}" stroke-width=".35"/>')
    mc = P(519, TOPY, 74)
    things.append(path(smooth_open([P(470, TOPY, 66), P(470, TOPY, 61), (mc[0] - 4, mc[1] - 9), (mc[0], mc[1] - 4)], 0.5), "none", INK, 0.9))
    things.append(ellipse(mc[0], mc[1], 4.2, 2.8, BEIGE, INK, 1.0))
    things.append(path(f"M{mc[0]:.1f} {mc[1] - 2.6:.1f}V{mc[1] - 0.6:.1f}", "none", BEIGE_D, 0.8))
    # the flip phone, closed, pink, lying by the keyboard
    ph = [P(527, TOPY, 66), P(541, TOPY, 64), P(543, TOPY, 72), P(529, TOPY, 74)]
    things.append(path(poly(ph), PINK, INK, 1.1))
    things.append(path(poly([P(530, TOPY, 67.2), P(538, TOPY, 66), P(539, TOPY, 69.4), P(531, TOPY, 70.6)]), "#2A1F30", "none", 0))
    things.append(path(f"M{P(531, TOPY, 72.6)[0]:.1f} {P(531, TOPY, 72.6)[1]:.1f}L{P(542, TOPY, 70.4)[0]:.1f} {P(542, TOPY, 70.4)[1]:.1f}", "none", "#FFB3CB", 0.8))
    # the skull at the right end, a candle on its crown, wax run down over the bone
    sk = []
    kx, ky = P(553, TOPY, 44)
    kx -= 2
    cr_ = [(kx - 10, ky - 13), (kx - 9.6, ky - 22), (kx - 5, ky - 27.5), (kx + 2, ky - 29), (kx + 8.6, ky - 25.5), (kx + 11, ky - 18), (kx + 10, ky - 11), (kx + 6, ky - 8.6), (kx + 5.4, ky - 1), (kx - 5.4, ky - 1), (kx - 6, ky - 8.6)]
    sk.append(path(smooth_closed(cr_, 0.45), BONE, INK, 1.3))
    sk.append(path(smooth_closed([(kx - 7.5, ky - 17), (kx - 3.4, ky - 19.5), (kx - 1.4, ky - 15.5), (kx - 4.6, ky - 12.6)], 0.6), INK, "none", 0))
    sk.append(path(smooth_closed([(kx + 7.6, ky - 17), (kx + 3.6, ky - 19.5), (kx + 1.6, ky - 15.5), (kx + 4.8, ky - 12.6)], 0.6), INK, "none", 0))
    sk.append(path(poly([(kx, ky - 12.4), (kx + 1.6, ky - 9.4), (kx - 1.6, ky - 9.4)]), INK, "none", 0))
    teeth = [path(f"M{kx - 4.6:.1f} {ky - 5.8:.1f}H{kx + 4.6:.1f}M{kx - 2.8:.1f} {ky - 7.6:.1f}V{ky - 2.2:.1f}M{kx:.1f} {ky - 7.8:.1f}V{ky - 2:.1f}M{kx + 2.8:.1f} {ky - 7.6:.1f}V{ky - 2.2:.1f}", "none", INK, 0.8)]
    sk.append(path(smooth_open([(kx - 8.4, ky - 21), (kx - 4, ky - 26), (kx + 3, ky - 27)], 0.5), "none", "#FFFFFF", 1.1, 'opacity=".6"'))
    # the candle: white, short, its wax run in drips down the skull's crown
    cx_, ctop, cbot = kx + 1, ky - 41, ky - 28
    sk.append(path(poly([(cx_ - 7, cbot + 1.5), (cx_ - 5, cbot - 0.5), (cx_ + 5, cbot - 0.5), (cx_ + 7.6, cbot + 1.8), (cx_ + 6.4, cbot + 6), (cx_ + 4.8, cbot + 2.8), (cx_ + 2, cbot + 3.2), (cx_ - 1, cbot + 7.4), (cx_ - 3, cbot + 3), (cx_ - 6, cbot + 4.6)]), WAX, INK, 1.0))
    sk.append(path(rect_d(cx_ - 4.4, ctop, cx_ + 4.4, cbot), WAX, INK, 1.1))
    sk.append(path(smooth_closed([(cx_ - 4.4, ctop + 0.4), (cx_ + 4.4, ctop + 0.4), (cx_ + 4.4, ctop + 4), (cx_ + 2.6, ctop + 6.4), (cx_ + 1.4, ctop + 3.4), (cx_ - 4.4, ctop + 3)], 0.4), "#FFFFFF", "none", 0, 'opacity=".7"'))
    teeth.append(path(f"M{cx_:.1f} {ctop:.1f}V{ctop - 3:.1f}", "none", INK, 0.9))
    DESKBOX["flame"] = (cx_, ctop - 2.6)
    x0, y0 = 396.0, math.floor(TT - 6)
    return write("emoroomdesk", x0, y0, 600 - x0, 400 - y0, [(g, 0.4, 16.0), (ink, None), (cds, 0.3, 10.0), (sp, None), (mon, 0.35, 12.0), (bez, None), (things, None), (sk, 0.25, 6.0), (teeth, None)])

# ================================================================ the screen
def emoroomscreen():
    """What the monitor shows: someone's profile page, done up the way they were in 2006: a black-and-pink checked
    background behind white panels, a header bar, their picture (a black fringe over one eye), a few lines of text, and
    their eight friends in two rows of four, with no lettering anywhere. A generic page of no real site. Drawn in the
    screen's own box."""
    x, y, w, h = DESKBOX["screen"]
    g = []
    # the background: checks
    cb = []
    sq = 5.0
    for i in range(int(w / sq) + 1):
        for j in range(int(h / sq) + 1):
            if (i + j) % 2 == 0: cb.append(rbox(x + i * sq, y + j * sq, min(x + w, x + (i + 1) * sq), min(y + h, y + (j + 1) * sq)))
    g.append(path(rbox(x, y, x + w, y + h), "#E07AA2", "none", 0))
    g.append(f'<path d="{"".join(cb)}" fill="#1A1220"/>')
    # the header bar across the top
    g.append(path(rbox(x + 2, y + 2, x + w - 2, y + 7), "#3E2E6E", "none", 0))
    g.append(path(f"M{x + 4:.1f} {y + 4.5:.1f}h9", "none", "#FFFFFF", 1.4))
    g.append(path(f"M{x + w - 16:.1f} {y + 4.5:.1f}h4M{x + w - 10:.1f} {y + 4.5:.1f}h6", "none", "#B9A8E8", 1.2))
    # the left panel: their picture and their lines
    lx0, ly0, lx1, ly1 = x + 3, y + 9, x + w * 0.42, y + h - 3
    g.append(path(rbox(lx0, ly0, lx1, ly1), "#F4F0F6", "none", 0))
    px0, py0 = lx0 + 2.2, ly0 + 2.2
    g.append(path(rbox(px0, py0, px0 + 11, py0 + 12), "#2A2030", "none", 0))
    g.append(ellipse(px0 + 5.5, py0 + 8, 3.6, 4.2, "#F2D9C8", "none", 0))
    g.append(path(f"M{px0 + 1:.1f} {py0 + 7:.1f}Q{px0 + 4:.1f} {py0 + 1:.1f} {px0 + 10:.1f} {py0 + 3:.1f}L{px0 + 9.8:.1f} {py0 + 6:.1f}Q{px0 + 6:.1f} {py0 + 5:.1f} {px0 + 3.4:.1f} {py0 + 9.4:.1f}Z", "#14101A", "none", 0))
    for k, wd in enumerate((12, 9, 13, 8)):
        g.append(path(f"M{px0 + 13:.1f} {py0 + 1.5 + k * 3:.1f}h{wd * 0.95:.1f}", "none", "#7B6A90" if k else "#D9437A", 1.3))
    for k in range(5):
        g.append(path(f"M{lx0 + 2.2:.1f} {py0 + 16 + k * 3.4:.1f}h{(lx1 - lx0 - 5) * (0.9 if k % 2 else 0.68):.1f}", "none", "#9B8FAA", 1.1))
    # the right panel: the eight friends
    rx0, ry0, rx1, ry1 = x + w * 0.46, y + 9, x + w - 3, y + h - 3
    g.append(path(rbox(rx0, ry0, rx1, ry1), "#F4F0F6", "none", 0))
    friend = ["#E84D7F", "#6BB84A", "#906096", "#2D7D8A", "#E8D89B", "#F8F8FF", "#B894D8", "#D2822E"]
    fw = (rx1 - rx0 - 2 * 2.2 - 3 * 1.6) / 4
    for k in range(8):
        fx, fy = rx0 + 2.2 + (k % 4) * (fw + 1.6), ry0 + 3.6 + (k // 4) * (fw + 4.4)
        g.append(path(rbox(fx, fy, fx + fw, fy + fw), friend[k], "#2A2030", 0.5))
        g.append(ellipse(fx + fw / 2, fy + fw * 0.62, fw * 0.24, fw * 0.24, "#2A2030", "none", 0, 'opacity=".55"'))
        g.append(path(f"M{fx + 0.6:.1f} {fy + fw + 1.6:.1f}h{fw - 1.2:.1f}", "none", "#9B8FAA", 0.8))
    # the glass's glare
    g.append(path(f"M{x + 3:.1f} {y + h * 0.55:.1f}Q{x + w * 0.2:.1f} {y + 6:.1f} {x + w * 0.62:.1f} {y + 2:.1f}", "none", "#FFFFFF", 4.0, 'opacity=".12"'))
    return write("emoroomscreen", x, y, w, h, [(g, None)], decimals=2)

# ================================================================ the rug
def emoroomrug():
    """The checked rug under the pet, black and white, its tiles square on the floor (the rows close up with distance,
    one-point perspective onto VP), bound with a black edge."""
    XA, XB, D0 = 132.0, 468.0, 16.0
    T = (XB - XA) / 8
    rows = [D0]
    while S(rows[-1]) * 130 + VP[1] < 470: rows.append(rows[-1] + T)
    g, k_, w_ = [], [], []
    g.append(path(quad(P(XA - 3, FLOOR_Y, D0 - 3), P(XB + 3, FLOOR_Y, D0 - 3), P(XB + 3, FLOOR_Y, rows[-1]), P(XA - 3, FLOOR_Y, rows[-1])), RUG_K, "none", 0))
    for j in range(len(rows) - 1):
        for i in range(8):
            q = quad(P(XA + i * T, FLOOR_Y, rows[j]), P(XA + (i + 1) * T, FLOOR_Y, rows[j]), P(XA + (i + 1) * T, FLOOR_Y, rows[j + 1]), P(XA + i * T, FLOOR_Y, rows[j + 1]))
            ((w_ if (i + j) % 2 == 0 else k_)).append(q)
    g.append(f'<path d="{"".join(w_)}" fill="{CHECK_W}"/>')
    lines = [path(quad(P(XA - 3, FLOOR_Y, D0 - 3), P(XB + 3, FLOOR_Y, D0 - 3), P(XB + 3, FLOOR_Y, rows[-1]), P(XA - 3, FLOOR_Y, rows[-1])), "none", INK, 1.3)]
    return write("emoroomrug", 0, 366, 600, 94, [(g, None), (lines, 0.4, 40.0)])

# ================================================================ the candle's flame
def emoroomflame():
    """A candle flame, its foot at the bottom middle of its box: a soft halo, the flame and its pale heart."""
    g = ['<ellipse cx="5" cy="9" rx="5" ry="7.5" fill="#FFE7A0" opacity=".35"/>',
         '<path d="M5 1.4C7.6 6 8.2 10 5 14.6C1.8 10 2.4 6 5 1.4Z" fill="#FFB43A"/>',
         '<path d="M5 6.6C6.3 9 6.5 11 5 13.6C3.5 11 3.7 9 5 6.6Z" fill="#FFF6D6"/>']
    return write("emoroomflame", 0, 0, 10, 16, [(g, None)])

if __name__ == "__main__":
    total = 0
    for fn in (emoroomout, emoroomoutlit, emoroombeads, emoroomwall, emoroombed, emoroomstand, emoroomlavafront, emoroomdesk, emoroomscreen, emoroomrug, emoroomflame):
        total += fn()
    print(f"total {total / 1024:.1f} KB")
    print("LIGHTS", "[" + ", ".join(f"[{x:g}, {y:g}, {c}]" for x, y, c in LIGHTS) + "]")
    gx0, gy0 = math.floor(min(x for x, _ in LAVA["glass"])), math.floor(min(y for _, y in LAVA["glass"]))
    print("LAVA box", gx0, gy0, math.ceil(max(x for x, _ in LAVA["glass"])) - gx0, math.ceil(max(y for _, y in LAVA["glass"])) - gy0)
    print("LAVA clip", "polygon(" + ", ".join(f"{x - gx0:.1f}px {y - gy0:.1f}px" for x, y in LAVA["glass"]) + ")")
    print("DESK screen", tuple(round(v, 2) for v in DESKBOX["screen"]), "flame", tuple(round(v, 1) for v in DESKBOX["flame"]))
