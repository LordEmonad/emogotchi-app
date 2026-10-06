"""The Majlis: a room theme for the Habibi pack -> packages/pet/props/majlis*.svg

A majlis, the Arab welcome room, where guests are received with coffee and incense. The sky outside and the floor's
marble are CSS (stage.css, data-scene="majlis"); these are the drawn pieces on top of them, all in the room's 600x460
world coordinates (Scenery.tsx places each box):

  majlissky      the view through the window: Dubai's towers, the tallest a needle rising in steps to a spire. Its
                 colours are the day's (hazy glass); at night stage.css turns the towers dark and lights their windows
                 (.mj-lit) and the red beacon on the spire (.mj-beacon).
  majliswall     the room's back wall: warm plaster with ONE big arched window cut through it (the sky and the towers
                 show through the hole), a carved stucco frame round the arch, a stone sill, a wooden cornice along the
                 ceiling, and a mashrabiya screen (turned-wood lattice) either side. The lanterns' pierced light on the
                 plaster (.mj-specks) shows only at night.
  majlisseat     the seating along the wall: a long floor cushion, back cushions and bolsters, in Al Sadu weaving
                 (the Bedouin red, black and white bands of triangles and diamonds).
  majlisrug      the rug on the floor, in one-point perspective like the Western Wall's plaza.
  majlislantern  a brass lantern hanging from the ceiling (used twice); its glass (.mj-glass) glows at night.
  majlistray     coffee: a brass dallah on a round tray with three finjan cups and a dish of dates.
  majlisincense  a mabkhara, the incense burner, with a thread of smoke (.mj-smoke drifts, stage.css).

No religious imagery anywhere (no crescent, no calligraphy, no star shapes): the patterns are Al Sadu's triangles and
diamonds and plain lattice. Flat fills and wobbly ink like everything else; the room's ink is a warm dark brown, lighter
than the pets' black, so every pet stands out against it. Kept apart from props.py. Run: python3 design/majlisprops.py
"""
import os, re, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_closed, smooth_open, poly
from wobble import bake

def path(d, fill="none", stroke=None, w=1.0, extra=""):
    """cat.py's path, lean: the root group carries round joins and caps, and a shape with no stroke writes none."""
    stroke = INK if stroke is None else stroke
    a = f'<path d="{d}" fill="{fill}"'
    if stroke != "none" and w: a += f' stroke="{stroke}" stroke-width="{w:g}"'
    return a + (f" {extra}" if extra else "") + "/>"

def ellipse(cx, cy, rx, ry, fill, stroke=None, w=1.0, extra=""):
    stroke = INK if stroke is None else stroke
    a = f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:g}" ry="{ry:g}" fill="{fill}"'
    if stroke != "none" and w: a += f' stroke="{stroke}" stroke-width="{w:g}"'
    return a + (f" {extra}" if extra else "") + "/>"

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

# ---- palette ----
INK       = "#3A2414"   # the room's ink: warm dark brown
PLASTER   = "#E9D5B0"   # the wall
PLASTER_L = "#F3E4C6"   # the carved stucco frame, lit plaster
PLASTER_D = "#D5BC92"   # plaster in shade, the carving's cuts
WOOD      = "#6E4124"   # cornice, window casing, mashrabiya
WOOD_D    = "#4B2A15"
WOOD_L    = "#95613A"
SCREEN    = "#F7E6BD"   # light behind the mashrabiya lattice (day; stage.css darkens it at night)
SILL      = "#E2CFA8"
SADU_R    = "#A3262B"   # Al Sadu weaving: red, a deeper red, black, cream, and a little orange and green
SADU_RD   = "#7C1B21"
SADU_K    = "#231512"
SADU_W    = "#F1E5CA"
SADU_O    = "#D98A2B"
SADU_G    = "#3F6B4A"
BRASS     = "#C8913A"
BRASS_L   = "#EDC46E"
BRASS_D   = "#8C5C1D"
GLASS     = "#E9A94A"   # the lantern's amber glass (brighter at night: stage.css)
RUG_R     = "#8E2431"
RUG_RD    = "#6E1A26"
RUG_B     = "#27396A"
RUG_W     = "#EAD9B4"
RUG_G     = "#D39A3A"
CARPET    = "#2F5550"   # the plain carpet under the rug
CARPET_D  = "#223F3B"
# the towers by day (hazy glass; stage.css maps each to its night colour)
TW_FAR    = "#A9BCD0"
TW_MID    = "#8FA7C0"
TW_NEAR   = "#7C95B1"
TW_LIT    = "#C3D3E3"   # the sunlit face
TW_DARK   = "#6B83A0"   # the shaded face
LIT_WIN   = "#FFD98A"   # lit windows (night only)
BEACON    = "#FF3B30"

FLOOR_Y = 366.0
VP = (300.0, 236.0)     # eye level: the Western Wall's and the Backrooms'

# the window (world coordinates): the opening, and the stucco frame round it
WIN = dict(x0=194.0, x1=406.0, spring=150.0, apex=58.0, sill=272.0)
FRAME = 15.0

def _round(body, decimals):
    def rnd(m):
        v = f"{float(m.group(0)):.{decimals}f}"
        return v.rstrip("0").rstrip(".") if decimals > 0 else v
    return re.sub(r"-?\d+\.\d+", rnd, body)

_SUB = re.compile(r"M(-?[\d.]+)[ ,](-?[\d.]+)((?:[a-y][^Mm]*?)?)(?=M|$)")
def _relmoves(d):
    """A path made only of small shapes each opened by an absolute M and drawn with relative commands that end where
    they began (z, h0) or one v/h step away: every M after the first becomes a relative m from where the last shape
    left the pen. Returns d unchanged if it is anything else."""
    if re.search(r"[LCQAHVZSTlcqa]", d.replace("z", "")) and not re.fullmatch(r"(M-?[\d.]+[ ,]-?[\d.]+(?:[lhvz0-9. \-]*))+", d.strip()):
        return d
    parts = _SUB.findall(d.strip())
    if not parts or "".join(f"M{a} {b}{r}" for a, b, r in parts).replace(",", " ") != d.strip().replace(",", " "): return d
    out, pen = [], None
    for a, b, rest in parts:
        x, y = float(a), float(b)
        if pen is None: out.append(f"M{a} {b}{rest}")
        else:
            dx, dy = round(x - pen[0], 1), round(y - pen[1], 1)
            out.append(f"m{dx:g} {dy:g}{rest}".replace(" -", "-"))
        # where this shape leaves the pen
        if rest in ("h0",) or rest.endswith("z"): pen = (x, y)
        elif re.fullmatch(r"v-?[\d.]+", rest): pen = (x, y + float(rest[1:]))
        elif re.fullmatch(r"h-?[\d.]+", rest): pen = (x + float(rest[1:]), y)
        else: return d
    return "".join(out)

def write(name, x0, y0, w, h, parts, decimals=1, stretch=False):
    """parts: [(body_list, amp or None[, step])]; None = not baked. Drawn in world coordinates; the box starts at (x0, y0)."""
    out = []
    for part in parts:
        body, amp = part[0], part[1]; step = part[2] if len(part) > 2 else 16.0
        s = "\n".join(body)
        if amp: s = bake(s, amp=amp, freq=0.09, step=step)
        out.append(s)
    body = _round("\n".join(out), decimals)
    # a little shorter: no space before a minus sign, no zero before a decimal point (both still valid path data)
    body = re.sub(r"([ ,])(-?)0\.(\d)", r"\1\2.\3", body)
    body = re.sub(r" -", "-", body)
    body = re.sub(r'd="([^"]*)"', lambda m: f'd="{_relmoves(m.group(1))}"', body)
    inner = f'<g transform="translate({-x0:g} {-y0:g})">\n{body}\n</g>' if (x0 or y0) else body
    par = ' preserveAspectRatio="none"' if stretch else ""
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}"{par}>\n<g class="{name}" stroke-linejoin="round" stroke-linecap="round">\n{inner}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"{len(src) / 1024:.1f} KB")
    return len(src)

class Batch:
    """Many small shapes of one style as ONE path (subpaths)."""
    def __init__(self): self.d = {}
    def add(self, key, d): self.d.setdefault(key, []).append(d)
    def paths(self, style):
        return [f'<path d="{"".join(ds)}" {style(k)}/>' for k, ds in self.d.items()]

def soft(pts, t=None):
    """For shapes the wobble baker bakes: the points as a polygon. The baker runs its own Catmull-Rom spline through the
    samples, so the corners round off anyway, and a polygon costs a quarter of a smooth path (it emits at least four
    curves for every curve it is given)."""
    return poly(pts)

def rbox(x0, y0, x1, y1):
    """A rectangle in the fewest characters (for shapes that are not baked: the baker reads M/L/C/Q/Z only)."""
    return f"M{x0:.1f} {y0:.1f}H{x1:.1f}V{y1:.1f}H{x0:.1f}z"

def rect_d(x0, y0, x1, y1):
    return f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y0:.1f} L{x1:.1f},{y1:.1f} L{x0:.1f},{y1:.1f} Z"

def diamond_d(cx, cy, rx, ry):
    return f"M{cx:.1f} {cy - ry:.1f}l{rx:.1f} {ry:.1f} {-rx:.1f} {ry:.1f} {-rx:.1f} {-ry:.1f}z"

def diamond_a(cx, cy, rx, ry):
    """The same diamond in absolute commands, for shapes the wobble baker bakes (it reads M/L/C/Q/Z only)."""
    return f"M{cx:.1f},{cy - ry:.1f} L{cx + rx:.1f},{cy:.1f} L{cx:.1f},{cy + ry:.1f} L{cx - rx:.1f},{cy:.1f} Z"

def dot_d(x, y):
    """A zero-length segment: drawn with a round (or square) cap of the path's stroke width it is a dot. The shortest
    way to write hundreds of beads or lit windows."""
    return f"M{x:.1f} {y:.1f}h0"

def clip_seg(P, Q, conv):
    """The part of the segment PQ inside the convex polygon conv (Cyrus-Beck), or None."""
    c0 = (sum(x for x, _ in conv) / len(conv), sum(y for _, y in conv) / len(conv))
    t0, t1 = 0.0, 1.0
    for e in range(len(conv)):
        a, b = conv[e], conv[(e + 1) % len(conv)]
        nx_, ny_ = -(b[1] - a[1]), b[0] - a[0]
        if (c0[0] - a[0]) * nx_ + (c0[1] - a[1]) * ny_ < 0: nx_, ny_ = -nx_, -ny_
        den = (Q[0] - P[0]) * nx_ + (Q[1] - P[1]) * ny_; num = (P[0] - a[0]) * nx_ + (P[1] - a[1]) * ny_
        if abs(den) < 1e-12:
            if num < 0: return None
            continue
        t = -num / den
        if den > 0: t0 = max(t0, t)
        else: t1 = min(t1, t)
    if t1 - t0 < 1e-6: return None
    return [(P[0] + (Q[0] - P[0]) * t0, P[1] + (Q[1] - P[1]) * t0), (P[0] + (Q[0] - P[0]) * t1, P[1] + (Q[1] - P[1]) * t1)]

def inside_convex(p, conv, margin=0.0):
    """p inside the convex polygon conv, at least `margin` from every edge."""
    c0 = (sum(x for x, _ in conv) / len(conv), sum(y for _, y in conv) / len(conv))
    for e in range(len(conv)):
        a, b = conv[e], conv[(e + 1) % len(conv)]
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        cr = lambda q: ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L
        if cr(p) * (1 if cr(c0) > 0 else -1) < margin: return False
    return True

def arch_pts(x0, x1, spring, apex, bottom, n=18):
    """A pointed arch window's outline, clockwise from the bottom left: up the left jamb, over the two curves to the
    apex, down the right jamb. Each curve is a cubic sampled into points (the wobble baker wants plain segments)."""
    cx = (x0 + x1) / 2; w = x1 - x0
    def bez(p0, c1, c2, p3, t):
        u = 1 - t
        return (u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p3[1])
    left = [bez((x0, spring), (x0, spring - (spring - apex) * 0.62), (cx - w * 0.2, apex + 6), (cx, apex), k / n) for k in range(n + 1)]
    right = [(2 * cx - x, y) for x, y in left[::-1]]
    return [(x0, bottom)] + left + right[1:] + [(x1, bottom)]

# ================================================================ the view: Dubai
# the towers by day, per depth (each fades further into the haze); stage.css maps each to its night colour
TW_FAR2   = "#C4D1DE"   # the farthest: the sea's horizon and the hotel on it
TW_FAR    = "#AFC1D3"
TW_MID    = "#93AAC2"
TW_NEAR   = "#7C95B1"
SAIL      = "#EEF1F4"   # the sail-shaped hotel's white fabric
TORUS     = "#C7D0DA"   # the torus building's steel
TORUS_D   = "#9EABBA"
GREEN_D   = "#7FA36B"   # the park round the torus, the palms
SEA       = "#9FC0DA"
LAKE      = "#7FA8CC"
LAKE_L    = "#C9DDEE"
JET       = "#FFFFFF"

def majlissky():
    """The view through the window, in depth: the sea's horizon far off on the left with the sail-shaped hotel standing
    in it, a far row of towers fading into the haze, then the middle distance (the twin towers with their pointed tops,
    the torus on its green mound, the tower that twists as it rises), then the tallest tower in the world rising in
    setbacks to its spire, and in front of everything the lake at its foot with the fountain. The haze thickens between
    the layers by day. Night-only pieces: the full moon (.mj-moon), lit windows (.mj-lit), a few lights that twinkle
    (.mj-tw), the tall tower's LED sweep (.mj-led, clipped to its outline), the spire's beacon (.mj-beacon). The fountain's
    jets (.mj-jet) play a short show every half minute (stage.css). Animated pieces come LAST in the drawing, so nothing
    static sits above them (an animated SVG element is a layer of its own, and anything painted over it would be one too)."""
    rng = random.Random(143)
    x0, x1 = WIN["x0"] - 4, WIN["x1"] + 4
    top, bottom = WIN["apex"] - 4, WIN["sill"] + 4
    SHORE = 250.0                 # the lake's far shore: every tower stands on it
    g, wins, faces = [], [], []
    def haze(y_from, n, op):
        """Stacked pale bands from y_from down, each adding a little: haze that thickens toward the ground, no hard edge."""
        return ['<g class="mj-haze">'] + [path(rbox(x0, y_from + k * ((SHORE - y_from) / n), x1, bottom + 4), "#F1E3C9", "none", 0, f'opacity="{op}"') for k in range(n)] + ['</g>']
    def tower(xa, xb, ytop, fill, crown=None, lit=True, p=0.3, face=True):
        body = [(xa, SHORE + 1), (xa, ytop), (xb, ytop), (xb, SHORE + 1)]
        if crown == "slant": body = [(xa, SHORE + 1), (xa, ytop + (xb - xa) * 0.5), (xb, ytop), (xb, SHORE + 1)]
        if crown == "point": body = [(xa, SHORE + 1), (xa, ytop + 12), ((xa + xb) / 2, ytop - 8), (xb, ytop + 12), (xb, SHORE + 1)]
        if crown == "round": body = [(xa, SHORE + 1), (xa, ytop + 6)] + [((xa + xb) / 2 - (xb - xa) / 2 * math.cos(math.pi * k / 8), ytop + 6 - (xb - xa) * 0.3 * math.sin(math.pi * k / 8)) for k in range(1, 8)] + [(xb, ytop + 6), (xb, SHORE + 1)]
        g.append(path(poly(body), fill, INK, 0.9))
        yt = ytop + (xb - xa) * 0.5 if crown == "slant" else ytop + 12 if crown in ("point", "round") else ytop
        if face: g.append(path(rbox(xa + 0.7, yt + 1.5, xa + (xb - xa) * 0.3, SHORE), TW_LIT, "none", 0, 'opacity="0.5"'))
        if lit:
            y = yt + 6
            while y < SHORE - 3:
                x = xa + 3.0
                while x < xb - 2.5:
                    if rng.random() < p: wins.append(dot_d(x, y))
                    x += 3.8
                y += 5.2
    # ---- the farthest: the sea's horizon on the left, the sail-shaped hotel standing in it
    g.append(path(rbox(x0, 232, 262, SHORE + 1), SEA, "none", 0))
    g.append(path(f"M{x0:g} 232H262", "none", "#DDE8F1", 1.0, 'opacity="0.8"'))
    SX = 212.0                    # the hotel: a mast up its back, a sail bellying out to the right, the helipad's disc near the top
    sail = [(SX, 233), (SX, 170), (SX + 3, 166), (SX + 13, 178), (SX + 20, 196), (SX + 22, 214), (SX + 19, 233)]
    g.append(path(soft(sail), SAIL, INK, 0.8))
    g.append(path(f"M{SX + 2:g} 170L{SX + 13:g} 226M{SX + 2:g} 184L{SX + 18:g} 222M{SX + 2:g} 198L{SX + 20:g} 216", "none", TORUS_D, 0.6, 'opacity="0.7"'))
    g.append(path(f"M{SX - 1.5:g} 233V160", "none", INK, 1.1))
    g.append(path(f"M{SX - 1:g} 187H{SX - 9:g}", "none", INK, 0.9))
    g.append(ellipse(SX - 10, 187, 3.4, 1.1, SAIL, INK, 0.6))
    g += haze(170, 4, 0.06)
    # ---- the far row, pale
    for xa, xb, yt in ((262, 280, 214), (280, 296, 224), (312, 328, 206), (330, 346, 218), (362, 380, 210), (380, 398, 222), (398, 414, 200)):
        tower(xa, xb, yt, TW_FAR, p=0.16, face=False)
    g += haze(190, 5, 0.06)
    # ---- the middle distance
    tower(376, 390, 150, TW_MID, crown="point")                     # the twin towers with the pointed tops
    tower(393, 406, 168, TW_MID, crown="point")
    tower(262, 276, 182, TW_MID, crown="slant")
    # the torus: an upright ring of steel on a green mound, the sky through its hole
    TX, TY = 244.0, 212.0
    g.append(path(soft([(226, SHORE + 1), (230, 240), (238, 234), (250, 233), (258, 237), (263, SHORE + 1)]), GREEN_D, INK, 0.8))
    ring = f"M{TX + 14:g} {TY:g}C{TX + 14:g} {TY + 11:g} {TX + 7.7:g} {TY + 20:g} {TX:g} {TY + 20:g}C{TX - 7.7:g} {TY + 20:g} {TX - 14:g} {TY + 11:g} {TX - 14:g} {TY:g}C{TX - 14:g} {TY - 11:g} {TX - 7.7:g} {TY - 20:g} {TX:g} {TY - 20:g}C{TX + 7.7:g} {TY - 20:g} {TX + 14:g} {TY - 11:g} {TX + 14:g} {TY:g}Z"
    hole = f"M{TX + 5.5:g} {TY - 1:g}C{TX + 5.5:g} {TY + 6:g} {TX + 3:g} {TY + 11:g} {TX:g} {TY + 11:g}C{TX - 3:g} {TY + 11:g} {TX - 5.5:g} {TY + 6:g} {TX - 5.5:g} {TY - 1:g}C{TX - 5.5:g} {TY - 8:g} {TX - 3:g} {TY - 12:g} {TX:g} {TY - 12:g}C{TX + 3:g} {TY - 12:g} {TX + 5.5:g} {TY - 8:g} {TX + 5.5:g} {TY - 1:g}Z"
    g.append(f'<path d="{ring}{hole}" fill="{TORUS}" fill-rule="evenodd" stroke="{INK}" stroke-width="0.9"/>')
    g.append(path(f"M{TX - 10:g} {TY - 12:g}Q{TX - 13:g} {TY:g} {TX - 9:g} {TY + 13:g}M{TX + 9:g} {TY - 14:g}Q{TX + 12:g} {TY - 2:g} {TX + 10:g} {TY + 12:g}", "none", TORUS_D, 1.1, 'opacity="0.8"'))
    g.append(path(f"M{TX - 4:g} {TY - 17:g}Q{TX:g} {TY - 18.5:g} {TX + 4:g} {TY - 17:g}", "none", "#FFFFFF", 1.0, 'opacity="0.7"'))
    # the tower that twists as it rises: slanted bands across a tapering body
    tw = [(284, SHORE + 1), (285, 186), (290, 150), (301, 142), (309, 150), (312, 186), (313, SHORE + 1)]
    g.append(path(poly(tw), TW_MID, INK, 0.9))
    for k in range(9):
        y = 156 + k * 11
        faces.append(path(f"M285.5 {y + 4:g}L311.5 {y - 3:g}", "none", TW_LIT, 1.3, 'opacity="0.7"'))
        for j in range(4):
            if rng.random() < 0.45: wins.append(dot_d(289 + j * 6, y + 3 + (3 - j) * 1.6))
    g += faces; faces = []
    g += haze(206, 4, 0.05)
    # ---- the tallest tower in the world: a core rising in setbacks that step round it, into a long spire
    cx = 352.0
    steps = [(SHORE + 1, 16.0, 16.0), (238, 15.0, 16.0), (222, 15.0, 13.5), (204, 12.5, 13.5), (188, 12.5, 11.0), (171, 10.0, 11.0),
             (157, 10.0, 8.5), (143, 7.5, 8.5), (131, 7.5, 6.2), (121, 5.2, 6.2), (112, 5.2, 4.2), (104, 3.4, 4.2), (97, 3.4, 2.6), (91, 2.2, 2.6)]
    L, R = [], []
    for i, (y, hl, hr) in enumerate(steps):
        nxt = steps[i + 1][0] if i + 1 < len(steps) else y - 6
        L += [(cx - hl, y), (cx - hl, nxt)] if i == 0 or steps[i - 1][1] == hl else [(cx - steps[i - 1][1], y), (cx - hl, y), (cx - hl, nxt)]
        R += [(cx + hr, y), (cx + hr, nxt)] if i == 0 or steps[i - 1][2] == hr else [(cx + steps[i - 1][2], y), (cx + hr, y), (cx + hr, nxt)]
    spire_base = steps[-1][0] - 6
    tip = 68.0
    outline = L + [(cx - 1.6, spire_base), (cx - 0.5, tip + 4), (cx, tip), (cx + 0.5, tip + 4), (cx + 1.6, spire_base)] + R[::-1]
    near = [path(poly(outline), TW_NEAR, INK, 1.1)]
    for i, (y, hl, hr) in enumerate(steps):
        nxt = steps[i + 1][0] if i + 1 < len(steps) else y - 6
        faces.append(path(rbox(cx - hl + 0.7, nxt + 0.6, cx - hl * 0.35, y), TW_LIT, "none", 0, 'opacity="0.7"'))
        faces.append(path(rbox(cx + hr * 0.45, nxt + 0.6, cx + hr - 0.7, y), TW_DARK, "none", 0, 'opacity="0.45"'))
        for yy in range(int(nxt) + 3, int(y) - 1, 5):
            for xx in (cx - hl + 2.4, cx - hl * 0.45, cx + hr * 0.25, cx + hr * 0.62):
                if rng.random() < 0.5: wins.append(dot_d(xx, yy))
    faces.append(path(f"M{cx:g} {spire_base:g}V{SHORE:g}", "none", TW_DARK, 0.8, 'opacity="0.5"'))
    # the tower to its right, close by
    tower(372, 384, 196, TW_NEAR, crown="round", p=0.34)
    # ---- the lake at its foot: the promenade's edge, the water, ripples; by night the city's lights lie in it (.mj-lit)
    lake = [path(rbox(x0, SHORE, x1, bottom + 4), LAKE, "none", 0),
            path(f"M{x0:g} {SHORE:g}H{x1:g}", "none", INK, 0.9),
            path(f"M{x0:g} {SHORE + 1.5:g}H{x1:g}", "none", "#E6EEF5", 1.0, 'opacity="0.7"')]
    rip = "".join(f"M{x:.1f} {y:.1f}h{w:g}" for x, y, w in ((200, 256, 14), (226, 261, 20), (262, 257, 12), (292, 266, 18), (318, 259, 10), (382, 263, 16), (398, 257, 9), (240, 270, 12), (340, 270, 14)))
    lake.append(path(rip, "none", LAKE_L, 1.2, 'opacity="0.9"'))
    refl = "".join(f"M{x:.1f} {y:.1f}v{h:g}" for x, y, h in ((350, 253, 12), (353, 256, 16), (356, 254, 9), (378, 254, 8), (296, 253, 7), (300, 257, 9), (270, 254, 6), (212, 253, 6), (398, 253, 7)))
    lake.append(f'<path class="mj-lit" d="{refl}" fill="none" stroke="{LIT_WIN}" stroke-width="1.3" opacity="0.8"/>')
    # ---- the full moon (night only; round, never a crescent)
    moon = ['<g class="mj-moon">', ellipse(232, 98, 13, 13, "#F6EFD9", INK, 0.8),
            f'<path d="M225 94a3 3 0 1 0 .1 0zM236 104a2.2 2.2 0 1 0 .1 0zM238 92a1.6 1.6 0 1 0 .1 0z" fill="#E2D7B8"/>', '</g>']
    win_paths = [f'<path class="mj-lit" d="{"".join(wins)}" fill="none" stroke="{LIT_WIN}" stroke-width="1.7" stroke-linecap="square"/>']
    # (the fountain, the LED sweep, the twinkling lights and the beacon are HTML elements over this drawing, placed by
    # Scenery.tsx: an animation inside an SVG repaints it every frame, one on an element of its own is only composited)
    global BURJ_OUTLINE, BURJ_BOX
    xs_, ys_ = [p[0] for p in outline], [p[1] for p in outline]
    BURJ_BOX = (min(xs_), min(ys_), max(xs_), max(ys_))
    BURJ_OUTLINE = poly([(x - BURJ_BOX[0], y - BURJ_BOX[1]) for x, y in outline])
    return write("majlissky", x0, top, x1 - x0, bottom - top,
                 [(g, None), (near, 0.3, 26.0), (faces, None), (win_paths, None), (moon, None), (lake, None)])

def majlisjet():
    """One jet of the fountain: a column of water widening a little to a head of spray. Stretched to each jet's span
    (Scenery.tsx), so it is drawn filling its box, the base at the bottom."""
    d = "M3.4 60C3.8 36 3 12 2.6 7C3.6 2.4 6.4 2.4 7.4 7C7 12 6.2 36 6.6 60z"
    spray = "M1 9h0M9 11h0M3.6 2h0M7 4h0M1.8 15h0M8.6 18h0"
    return write("majlisjet", 0, 0, 10, 60, [([f'<path d="{d}" fill="{JET}"/><path d="{spray}" fill="none" stroke="{JET}" stroke-width="1.6"/>'], None)], stretch=True)

def majlismist():
    """The spray rolling on the lake at the jets' foot."""
    return write("majlismist", 300, 248, 100, 10, [([f'<path d="M300 256q12-7 24-2q10-6 22-1q12-6 24 0q12-5 28 1q-50 5-98 2z" fill="{JET}"/>'], None)])

# ================================================================ things passing the window
def majliscloud():
    """A small flat cumulus for the sky behind the towers (no ink: it is far away). stage.css drifts it across."""
    # round puffs on a flat base: the underside a pale blue-grey, the tops white, a lit edge on the biggest puff
    puffs = ((16, 22, 10), (30, 15, 13), (46, 13, 12), (60, 19, 10), (70, 24, 7))
    d = "".join(f"M{x - r:g} {y:g}a{r:g} {r:g} 0 1 1 {2 * r:g} 0a{r:g} {r:g} 0 1 1 {-2 * r:g} 0z" for x, y, r in puffs)
    g = [f'<path d="{d}M8 26a32 5 0 1 0 64 0a32 5 0 1 0-64 0z" fill="#D9E5F0"/>',
         f'<path d="{"".join(f"M{x - r + 1:g} {y - 1:g}a{r - 1:g} {r - 1.5:g} 0 1 1 {2 * r - 2:g} 0a{r - 1:g} {r - 1.5:g} 0 1 1 {-2 * r + 2:g} 0z" for x, y, r in puffs)}" fill="#FFFFFF"/>']
    return write("majliscloud", 0, 0, 80, 32, [(g, None)])

def _gull(x, y, s, k):
    """A gull seen side on in flight: a small body and its two wings as one M-shaped stroke (.mj-wing flaps: stage.css)."""
    return (f'<g transform="translate({x:g} {y:g}) scale({s:g})"><path class="mj-wing mj-wing-{k}" d="M-8 0Q-4.5-4.5-1 0Q0 .8 1 0Q4.5-4.5 8 0" fill="none" stroke="#3E3A46" stroke-width="1.5"/>'
            f'<ellipse cx="0" cy=".3" rx="1.6" ry="1" fill="#3E3A46"/></g>')

def majlisbird():
    return write("majlisbird", -9, -6, 18, 9, [([_gull(0, 0, 1, 0)], None)])

def majlisplane():
    """An airliner very high: by day a pale silhouette with a contrail; by night only its lights (.mj-planenight)."""
    g = ['<g class="mj-planeday">', path("M-40 3.2H-2", "none", "#FFFFFF", 1.2, 'opacity="0.6"'),
         path("M-2 3.2H10", "none", "#C8D2DC", 1.6), path("M3 3.2L-1 0.2M3 3.2L-1 6.2", "none", "#C8D2DC", 1.2), '</g>',
         '<g class="mj-planenight"><circle cx="9" cy="3.2" r="1" fill="#FFFFFF"/></g>']
    return write("majlisplane", -40, -0.3, 52, 7, [(g, None)])   # (whole-number box: props.ts fit() rewrites integer sizes only)

# ================================================================ the back wall
LANTERNS = [(153.0, 108.0), (447.0, 108.0)]   # each lantern: (x, top of its cap) in world units, as Scenery.tsx hangs it (scale LANTERN_K)
LANTERN_K = 1.25
LANTERN_BODY = 39 * 1.25                        # cap top to the middle of the glass, in world units

def majliswall():
    rng = random.Random(9)
    W, H = 600.0, FLOOR_Y
    g, fx, lines = [], [], []
    opening = arch_pts(WIN["x0"], WIN["x1"], WIN["spring"], WIN["apex"], WIN["sill"], 12)
    outer = arch_pts(WIN["x0"] - FRAME, WIN["x1"] + FRAME, WIN["spring"], WIN["apex"] - FRAME * 1.05, WIN["sill"], 12)
    # the plaster, with the window cut through it (the sky and the towers show through the hole)
    g.append(f'<path d="{rbox(-2, -2, W + 2, H + 1)}{poly(opening)}" fill="{PLASTER}" fill-rule="evenodd"/>')
    # soft mottling of the plaster (kept faint: stronger, the pale ones read as clouds)
    mot = Batch()
    for _ in range(7):
        x, y = rng.uniform(0, W), rng.uniform(40, H - 30)
        if WIN["x0"] - 26 < x < WIN["x1"] + 26 and y < WIN["sill"] + 10: continue
        rx, ry = rng.uniform(22, 44), rng.uniform(10, 20)
        pts = [(x + rx * math.cos(a) * rng.uniform(0.8, 1.15), y + ry * math.sin(a) * rng.uniform(0.8, 1.15)) for a in [k * math.pi / 3 for k in range(6)]]
        mot.add(rng.choice(["l", "d", "d"]), smooth_closed(pts, 0.5))
    g += mot.paths(lambda k: f'fill="{PLASTER_L if k == "l" else PLASTER_D}" opacity="{0.2 if k == "l" else 0.16}"')
    # the carved stucco frame round the arch, a row of little carved diamonds along its middle
    fx.append(f'<path d="{poly(outer)} {poly(opening)}" fill="{PLASTER_L}" fill-rule="evenodd"/>')
    carve = Batch()
    mid_arch = arch_pts(WIN["x0"] - FRAME / 2, WIN["x1"] + FRAME / 2, WIN["spring"], WIN["apex"] - FRAME * 0.52, WIN["sill"], 40)
    seg = list(zip(mid_arch, mid_arch[1:]))
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in seg)
    step = total / round(total / 13.0)
    t = step / 2
    for a, b in seg:
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        while t <= L:
            carve.add("d", diamond_d(a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L, 3.2, 3.2))
            t += step
        t -= L
    fx += carve.paths(lambda k: f'fill="{PLASTER_D}" stroke="{INK}" stroke-width="0.6" opacity="0.9"')
    # the arch's ink, and the casing's dark wood just inside the opening
    lines.append(path(poly(outer)[:-2], "none", INK, 1.8))
    lines.append(path(poly(opening)[:-2], "none", WOOD, 4.2))
    lines.append(path(poly(opening)[:-2], "none", INK, 1.3))
    # the sill: a stone ledge across the bottom, a little wider than the frame, and its shadow on the wall
    sx0, sx1, sy = WIN["x0"] - FRAME - 7, WIN["x1"] + FRAME + 7, WIN["sill"]
    fx.append(path(poly([(sx0, sy - 1), (sx1, sy - 1), (sx1 + 2, sy + 9), (sx0 - 2, sy + 9)]), SILL, INK, 1.6))
    fx.append(path(f"M{sx0 + 2:.1f},{sy + 1.5:.1f} L{sx1 - 2:.1f},{sy + 1.5:.1f}", "none", "#FFF6E0", 1.2, 'opacity="0.7"'))
    fx.append(path(f"M{sx0:.1f},{sy + 11.5:.1f} L{sx1:.1f},{sy + 11.5:.1f}", "none", PLASTER_D, 3.0, 'opacity="0.7"'))
    # the ceiling's edge: a dark beam, a band of coffers (sunk panels framed in wood, a raised panel in each with a carved
    # lozenge, brass studs where the frames meet), and under it a moulding carved with Al Sadu triangles
    CB = 34.0                                          # the bottom of it all
    fx.append(path(rbox(-2, -2, W + 2, 9), WOOD_D, "none", 0))
    fx.append(path(rbox(-2, 9, W + 2, 27), WOOD, "none", 0))
    cof, raised, loz, studs = [], [], [], []
    for x in range(-12, 612, 30):
        cof.append(f"M{x + 3.5:g} 11.5H{x + 26.5:g}V24.5H{x + 3.5:g}z")
        raised.append(f"M{x + 7:g} 14H{x + 23:g}V22H{x + 7:g}z")
        loz.append(diamond_d(x + 15, 18, 4.2, 2.6))
        studs.append(dot_d(x + 0.5, 11) + dot_d(x + 0.5, 25))
    fx.append(f'<path d="{"".join(cof)}" fill="{WOOD_D}"/>')
    fx.append(f'<path d="{"".join(raised)}" fill="{WOOD_L}" opacity="0.55"/>')
    fx.append(f'<path d="{"".join(loz)}" fill="{WOOD_D}" opacity="0.8"/>')
    fx.append(f'<path d="{"".join(studs)}" fill="none" stroke="{BRASS_L}" stroke-width="2.2"/>')
    fx.append(path(rbox(-2, 27, W + 2, CB), WOOD, "none", 0))
    teeth = "".join(f"M{x:g} {CB:g}l5-6 5 6z" for x in range(-4, 606, 10))
    fx.append(f'<path d="{teeth}" fill="{WOOD_L}"/>')
    fx.append(path("M-2 9H602", "none", INK, 1.2, 'opacity="0.8"'))
    fx.append(path("M-2 27H602", "none", INK, 1.2))
    fx.append(path(f"M-2 {CB:g}H602", "none", INK, 1.6))
    fx.append(path(rbox(-2, CB + 0.5, W + 2, CB + 5), PLASTER_D, "none", 0, 'opacity="0.55"'))
    # a mashrabiya screen either side: a dark wood frame, a lattice of turned spindles crossing on the diagonal with a
    # bead at every crossing, over the light behind it (.mj-screen: stage.css dims it at night), and a carved wooden
    # panel across the bottom
    scr, light, front_, panels, lat, beads = [], [], [], [], [], []
    for (ax, bx) in ((24.0, 128.0), (472.0, 576.0)):
        top, spring, bot = 76.0, 104.0, 250.0
        panel = 198.0                                  # the lattice stops here; the carved panel is below
        ow = arch_pts(ax, bx, spring, top, bot, 12)
        iw = arch_pts(ax + 7, bx - 7, spring + 3, top + 9, panel, 12)
        scr.append(path(poly(ow), WOOD, INK, 1.8))
        light.append(path(poly(iw), SCREEN, "none", 0, 'class="mj-screen"'))
        # the lattice: lines at +-45 degrees `gap` apart, cut to the (convex) opening; a bead where they cross
        cx_ = (ax + bx) / 2; gap = 11.0
        for k in range(-24, 25):
            for d in (1, -1):
                c = k * gap
                P, Q = (cx_ - 160, panel - 160 * d + c), (cx_ + 160, panel + 160 * d + c)
                sg = clip_seg(P, Q, iw)
                if sg: lat.append(f"M{sg[0][0]:.1f} {sg[0][1]:.1f}L{sg[1][0]:.1f} {sg[1][1]:.1f}")
        for i in range(-24, 25):
            for j in range(-24, 25):
                a_ = panel - cx_ + i * gap; b_ = panel + cx_ + j * gap          # y - x = a_, y + x = b_
                px, py = (b_ - a_) / 2, (a_ + b_) / 2
                if inside_convex((px, py), iw, 1.5): beads.append(dot_d(px, py))
        front_.append(path(poly(iw), "none", INK, 1.2))
        # the carved panel: a sunk rectangle with a lozenge in it
        panels.append(path(rbox(ax + 7, panel, bx - 7, bot - 7), WOOD_D, INK, 1.2))
        panels.append(path(rbox(ax + 12, panel + 5, bx - 12, bot - 12), WOOD, "none", 0))
        panels.append(path(diamond_d(cx_, (panel + bot - 7) / 2, (bx - ax) * 0.3, (bot - 7 - panel) * 0.32), WOOD_L, INK, 0.9))
        panels.append(path(diamond_d(cx_, (panel + bot - 7) / 2, (bx - ax) * 0.12, (bot - 7 - panel) * 0.14), WOOD_D, "none", 0))
        front_.append(path(rect_d(ax - 4, bot, bx + 4, bot + 6), WOOD_D, INK, 1.4))    # a little ledge under it
    lat_paths = [f'<path d="{"".join(lat)}" fill="none" stroke="{WOOD_D}" stroke-width="1.5" stroke-linecap="round"/>',
                 f'<path d="{"".join(beads)}" fill="none" stroke="{WOOD_L}" stroke-width="2.8" stroke-linecap="round"/>']
    foot = [path(f"M-2 {H - 0.5:g}H602", "none", INK, 1.6)]
    return write("majliswall", 0, 0, W, H, [(g, None), (fx, None), (scr, 0.5, 40.0), (light, None), (lat_paths, None), (front_, 0.5, 30.0), (panels, None), (lines, 0.6, 26.0), (foot, None)])

# ================================================================ the lanterns' light on the wall (night)
def majlisspecks():
    """At night each lantern throws its pierced pattern on the plaster: rays of little diamonds, smaller going out, never
    on the window's glass or the seating. Drawn for the LEFT lantern in a 300 x 300 box centred on its glass (world
    3..303, 7..307); the room is symmetric about x 300, so the right lantern's is the same drawing mirrored (stage.css).
    It sits inside the lantern's glow (Scenery.tsx), so it flickers with the flame."""
    lx, cy = LANTERNS[0][0], LANTERNS[0][1] + LANTERN_BODY
    sp = []
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        for r, sz in ((38, 3.6), (60, 3.1), (86, 2.5), (114, 2.0)):
            px, py = lx + r * math.cos(a), cy + r * 0.86 * math.sin(a)
            if WIN["x0"] - FRAME - 4 < px < WIN["x1"] + FRAME + 4 and py < WIN["sill"] + 12: continue
            if py < 40 or py > 284: continue
            sp.append(diamond_d(px, py, sz, sz * 1.4))
    return write("majlisspecks", lx - 150, cy - 150, 300, 300, [([f'<path d="{"".join(sp)}" fill="#FFDC8E" opacity="0.9"/>'], None)])

# ================================================================ a lantern
FLAME, FRONT = [], []
def majlislantern():
    """A brass lantern on a chain from the ceiling: an onion-domed cap, a six-sided body of amber glass behind brass
    fretwork (pointed arches, a row of dots), a bottom cone and a drop. The glass is .mj-glass (stage.css lights it at night).
    Drawn round x=0, the chain from the cornice (y 26) to the cap (y 96)."""
    ly = 96.0
    g, glass = [], []
    ch = "".join(f"M0 {y:g}m-1.5 0a1.5 2.6 0 1 0 3 0a1.5 2.6 0 1 0-3 0" if i % 2 == 0 else f"M0 {y - 2.4:g}v4.8" for i, y in enumerate(range(41, int(ly) - 4, 5)))
    chain = [f'<path d="{ch}" fill="none" stroke="{BRASS_D}" stroke-width="1.3"/>']
    g.append(path(poly([(-5, 37), (5, 37), (3, 40), (-3, 40)]), BRASS_D, INK, 1.0))                # the ceiling rose, under the moulding
    g.append(ellipse(0, ly - 2.5, 2.6, 2.6, "none", INK, 1.3))                                        # the top ring
    # the cap: an onion dome with a finial
    cap = [(-12, ly + 18), (-13, ly + 12), (-9, ly + 6), (-3.5, ly + 2.5), (0, ly), (3.5, ly + 2.5), (9, ly + 6), (13, ly + 12), (12, ly + 18)]
    g.append(path(soft(cap, 0.4), BRASS, INK, 1.4))
    g.append(path(f"M-8,{ly + 9:.1f} Q-5,{ly + 4:.1f} -1,{ly + 3:.1f}", "none", BRASS_L, 1.6, 'opacity="0.9"'))
    for dx in (-6, 0, 6):
        g.append(ellipse(dx, ly + 13, 1.2, 1.2, BRASS_D, "none", 0))
    g.append(path(rect_d(-14, ly + 18, 14, ly + 22), BRASS_D, INK, 1.2))                             # the collar
    # the body: a centre face and two narrower side faces, each glass behind a brass frame with a pointed arch cut in it
    y0, y1 = ly + 22, ly + 56
    faces = [(-15, -8, 0.78), (-8, 8, 1.0), (8, 15, 0.78)]
    for xa, xb, lit in faces:
        g.append(path(rect_d(xa, y0, xb, y1), BRASS if lit == 1.0 else BRASS_D, INK, 1.2))
        ia, ib = xa + (1.6 if lit == 1.0 else 1.2), xb - (1.6 if lit == 1.0 else 1.2)
        arch = arch_pts(ia, ib, y0 + 12, y0 + 3, y1 - 5, 6)
        glass.append(path(poly(arch), GLASS if lit == 1.0 else "#C98A33", INK, 0.8, 'class="mj-glass"'))
        if lit == 1.0:
            # the flame: a halo, the flame and its white heart; the outer group flickers with the light on the walls, the
            # inner one quivers on its own quicker clock
            fy = y1 - 5.5
            FLAME.append(f'<g class="mj-flame"><g class="mj-flame-in"><ellipse cx="0" cy="{fy - 10:.1f}" rx="7.5" ry="11" fill="#FFF0B0" opacity=".5"/>'
                         f'<path d="M0 {fy - 21:.1f}C4.8 {fy - 12:.1f} 5.6 {fy - 5:.1f} 0 {fy:.1f}C-5.6 {fy - 5:.1f} -4.8 {fy - 12:.1f} 0 {fy - 21:.1f}Z" fill="#FFB52E"/>'
                         f'<path d="M0 {fy - 13:.1f}C2.6 {fy - 7.5:.1f} 3 {fy - 3.5:.1f} 0 {fy - 0.8:.1f}C-3 {fy - 3.5:.1f} -2.6 {fy - 7.5:.1f} 0 {fy - 13:.1f}Z" fill="#FFF8DC"/></g></g>')
            g2 = [(0, y0 + 6), (0, y1 - 5)]
            FRONT.append(path(f"M0,{y0 + 6:.1f} L0,{y1 - 5:.1f} M{ia:.1f},{y0 + 20:.1f} L{ib:.1f},{y0 + 20:.1f}", "none", BRASS_D, 1.1))
            FRONT.append(f'<path d="{dot_d(-3.5, y0 + 27)}{dot_d(3.5, y0 + 27)}{dot_d(-3.5, y0 + 14)}{dot_d(3.5, y0 + 14)}" fill="none" stroke="{BRASS_D}" stroke-width="2" stroke-linecap="round"/>')
    g2 = [path(rect_d(-15, y1, 15, y1 + 4), BRASS_D, INK, 1.2)]                                    # the base band
    g2.append(path(soft([(-13, y1 + 4), (13, y1 + 4), (7, y1 + 12), (2, y1 + 16), (-2, y1 + 16), (-7, y1 + 12)], 0.35), BRASS, INK, 1.3))
    g2.append(ellipse(0, y1 + 19.5, 2.8, 3.2, BRASS, INK, 1.1))                                      # the drop
    g2.append(path(f"M0,{y1 + 22.7:.1f} L0,{y1 + 27:.1f}", "none", INK, 1.2))
    n = write("majlislantern", -18, 24, 36, y1 + 30 - 24, [(chain, None), (g, 0.35, 12.0), (glass, None), (g2, 0.35, 12.0)])
    # the flame (flickers: stage.css) and the fretwork drawn over it, each in the lantern's own box so they line up
    n += write("majlisflame", -7.5, y1 - 27, 15, 23, [([f.replace('<g class="mj-flame"><g class="mj-flame-in">', "").replace("</g></g>", "") for f in FLAME], None)])
    n += write("majlislanternfront", -18, 24, 36, y1 + 30 - 24, [(FRONT, None)])
    return n

# ================================================================ the seating
def sadu_band(x0, x1, y0, y1, rich=True):
    """An Al Sadu band: black ground, white triangles along both edges pointing in, a row of small diamonds between,
    one in three orange."""
    h = y1 - y0; tw = h * (0.8 if rich else 0.62)
    tri, dia, ora = [], [], []
    x = x0
    while rich and x < x1 - tw * 0.5:
        tri.append(f"M{x:.1f} {y1:.1f}l{tw / 2:.1f} {-h * 0.3:.1f} {tw / 2:.1f} {h * 0.3:.1f}zM{x:.1f} {y0:.1f}l{tw / 2:.1f} {h * 0.3:.1f} {tw / 2:.1f} {-h * 0.3:.1f}z")
        x += tw
    x = x0 + tw / 2; i = 0
    while x < x1 - 2:
        (ora if i % 3 == 1 else dia).append(diamond_d(x, (y0 + y1) / 2, tw * 0.28, h * 0.17)); x += tw; i += 1
    return [path(rect_d(x0, y0, x1, y1), SADU_K, "none", 0), f'<path d="{"".join(tri + dia)}" fill="{SADU_W}"/>', f'<path d="{"".join(ora)}" fill="{SADU_O}"/>']

def majlisseat():
    top, base_top, base_front, bottom = 292.0, 326.0, 334.0, 374.0
    cush, pat, ends, front, lines = [], [], [], [], []
    # back cushions against the wall, a row of them, puffy, alternately red and deep red, a Sadu band across each
    x = -12.0; i = 0
    while x < 612:
        w = 74.0
        xa, xb = x + 1.5, x + w - 1.5
        yt = top + (i % 2) * 3
        pts = [(xa, base_top + 4), (xa - 1, yt + 12), (xa + 4, yt + 2), ((xa + xb) / 2, yt - 2), (xb - 4, yt + 2), (xb + 1, yt + 12), (xb, base_top + 4)]
        cush.append(path(soft(pts, 0.35), SADU_R if i % 2 == 0 else SADU_RD, INK, 1.4))
        pat += sadu_band(xa + 3, xb - 3, yt + 13, yt + 22, rich=False)
        pat.append(path(f"M{xa + 8:.1f},{yt + 6:.1f} Q{(xa + xb) / 2:.1f},{yt + 1:.1f} {xb - 8:.1f},{yt + 6:.1f}", "none", "#FFFFFF", 1.2, 'opacity="0.25"'))
        x += w; i += 1
    NCUSH = len(pat)
    # armrests: firm cushions lying on the seat, pointing into the room, so we see their square ends, each with a Sadu
    # diamond; at both ends and either side of the middle
    for bx_ in (18.0, 188.0, 412.0, 582.0):
        bw, y0, y1 = 26.0, 300.0, base_top + 2
        ends.append(path(soft([(bx_ - bw / 2, y1), (bx_ - bw / 2 - 0.5, y0 + 5), (bx_ - bw / 2 + 3, y0), (bx_ + bw / 2 - 3, y0), (bx_ + bw / 2 + 0.5, y0 + 5), (bx_ + bw / 2, y1)], 0.25), SADU_RD, INK, 1.4))
        cy_ = (y0 + y1) / 2
        pat.append(path(diamond_d(bx_, cy_, 9.5, 11.5), SADU_K, "none", 0))
        pat.append(path(diamond_d(bx_, cy_, 6.5, 8), SADU_W, "none", 0))
        pat.append(path(diamond_d(bx_, cy_, 3.4, 4.2), SADU_R, "none", 0))
        pat.append(path(f"M{bx_ - bw / 2 + 2:.1f} {y0 + 3:.1f}H{bx_ + bw / 2 - 2:.1f}", "none", SADU_W, 1.0, 'opacity="0.6"'))
    # the seat: a long floor cushion; its top seen from above, its front face with a wide Sadu band and piping
    front.append(path(poly([(-4, base_top), (604, base_top), (606, base_front), (-6, base_front)]), "#B8343A", INK, 1.4))
    front.append(path(rect_d(-6, base_front, 606, bottom), SADU_R, INK, 1.5))
    pat2 = sadu_band(-6, 606, base_front + 9, base_front + 26)
    pat2.append(path(f"M-6,{base_front + 9:.1f} L606,{base_front + 9:.1f} M-6,{base_front + 26:.1f} L606,{base_front + 26:.1f}", "none", INK, 0.9, 'opacity="0.8"'))
    pat2.append(path(f"M-6,{base_front + 3.5:.1f} L606,{base_front + 3.5:.1f}", "none", SADU_O, 1.6, 'opacity="0.9"'))
    pat2.append(path(f"M-6,{bottom - 4:.1f} L606,{bottom - 4:.1f}", "none", SADU_G, 1.6, 'opacity="0.9"'))
    pat2.append(path(rect_d(-6, bottom, 606, bottom + 3.5), "#3A2414", "none", 0, 'opacity="0.18"'))   # its shadow on the floor
    # tassels hanging from its bottom edge, orange and cream by turns
    cords = "".join(f"M{x:g} {bottom - 1:g}v4" for x in range(4, 600, 14))
    tas = {0: [], 1: []}
    for i, x in enumerate(range(4, 600, 14)): tas[i % 2].append(f"M{x:g} {bottom + 2.5:g}l2 1.4 -.6 5.6h-2.8l-.6-5.6z")
    pat2.append(path(cords, "none", SADU_K, 0.9))
    pat2.append(f'<path d="{"".join(tas[0])}" fill="{SADU_O}" stroke="{INK}" stroke-width=".6"/>')
    pat2.append(f'<path d="{"".join(tas[1])}" fill="{SADU_W}" stroke="{INK}" stroke-width=".6"/>')
    return write("majlisseat", 0, 286, 600, 100, [(cush, 0.55, 22.0), (pat[:NCUSH], None), (ends, 0.45, 16.0), (pat[NCUSH:], None), (front, 0.45, 90.0), (pat2, None)])

# ================================================================ the rug
def _px(xw, y):
    """x at screen row y of a line on the floor that meets the wall's foot at xw (one-point perspective onto VP)."""
    return VP[0] + (xw - VP[0]) * (y - VP[1]) / (FLOOR_Y - VP[1])

def majlisrug():
    """The rug under the pet, from just in front of the seating out past the bottom of the room: a border of indigo with
    cream hooks, gold guard stripes, and a red field with a stepped diamond medallion in the middle (a tribal rug's,
    geometric, no figures). Its sides run to the vanishing point."""
    back_y, bot = 382.0, 466.0
    XL, XR = 126.0, 474.0                     # where its sides would meet the wall's foot
    def pt(u, y): return (_px(XL + (XR - XL) * u, y), y)
    def quad(u0, u1, y0, y1): return [pt(u0, y0), pt(u1, y0), pt(u1, y1), pt(u0, y1)]
    g, hooks, lines = [], [], []
    # the carpet under the rug, wall to wall: a deep green, bound along its back edge
    CXL, CXR = -120.0, 720.0
    def cpt(u, y): return (_px(CXL + (CXR - CXL) * u, y), y)
    g.append(path(poly([cpt(0, 377), cpt(1, 377), cpt(1, bot), cpt(0, bot)]), CARPET, "none", 0))
    g.append(path(poly([cpt(0, 377), cpt(1, 377), cpt(1, 379.5), cpt(0, 379.5)]), CARPET_D, "none", 0))
    g.append(path(f"M-4 {381.2:g}H604", "none", SADU_W, 0.8, 'opacity="0.5"'))
    g.append(path(poly(quad(0, 1, back_y, bot)), RUG_B, "none", 0))
    bw = 0.075; bh = 9.0
    g.append(path(poly(quad(bw - 0.012, 1 - bw + 0.012, back_y + bh - 1.4, bot)), RUG_G, "none", 0))
    g.append(path(poly(quad(bw, 1 - bw, back_y + bh, bot)), RUG_R, "none", 0))
    u = 0.02
    while u < 0.98:
        a, b, c = pt(u, back_y + 2.2), pt(u + 0.012, back_y + 5.8), pt(u + 0.024, back_y + 2.2)
        hooks.append(f"M{a[0]:.1f} {a[1]:.1f}l{b[0] - a[0]:.1f} {b[1] - a[1]:.1f} {c[0] - b[0]:.1f} {c[1] - b[1]:.1f}")
        u += 0.034
    y = back_y + 14
    while y < bot:
        for u_mid in (bw / 2, 1 - bw / 2):
            a, b, c = pt(u_mid - 0.02, y), pt(u_mid, y + 3.5 + (y - back_y) * 0.05), pt(u_mid + 0.02, y)
            hooks.append(f"M{a[0]:.1f} {a[1]:.1f}l{b[0] - a[0]:.1f} {b[1] - a[1]:.1f} {c[0] - b[0]:.1f} {c[1] - b[1]:.1f}")
        y += 7 + (y - back_y) * 0.12
    def stepped(u_c, y_c, hu, hy, n):
        """A stepped diamond round (u_c, y_c): n steps from the top point to the side points, in rug coordinates."""
        tl = [(u_c - hu * k / n, y_c - hy * (1 - k / n)) for k in range(n + 1)]
        left = []
        for (ua, ya), (ub, yb) in zip(tl, tl[1:]): left += [(ua, ya), (ub, ya)]
        left.append(tl[-1])
        low = [(uu, 2 * y_c - yy) for uu, yy in left[::-1]]
        half = left + low[1:]
        ring = half + [(2 * u_c - uu, yy) for uu, yy in half[::-1]][1:-1]
        return [pt(uu, yy) for uu, yy in ring]
    cy_ = 420.0
    g.append(path(poly(stepped(0.5, cy_, 0.19, 26, 4)), RUG_B, "none", 0))
    g.append(path(poly(stepped(0.5, cy_, 0.15, 20, 4)), RUG_W, "none", 0))
    g.append(path(poly(stepped(0.5, cy_, 0.11, 14.5, 3)), RUG_RD, "none", 0))
    g.append(path(poly(stepped(0.5, cy_, 0.05, 7, 2)), RUG_G, "none", 0))
    for du in (-0.27, 0.27):
        g.append(path(poly(stepped(0.5 + du, cy_, 0.045, 7, 2)), RUG_W, "none", 0))
        g.append(path(poly(stepped(0.5 + du, cy_, 0.02, 3.4, 1)), RUG_B, "none", 0))
    for dy in (-34, 34):
        if cy_ + dy > back_y + 12: g.append(path(poly(stepped(0.5, cy_ + dy, 0.035, 5, 2)), RUG_G, "none", 0))
    fringe = "".join(f"M{pt(k / 64, back_y)[0]:.1f} {back_y:g}v-3.2" for k in range(65))
    fr = [f'<path d="{fringe}" fill="none" stroke="{RUG_W}" stroke-width="1" stroke-linecap="round"/>']
    lines.append(path(poly(quad(0, 1, back_y, bot + 4)), "none", INK, 1.3))
    return write("majlisrug", 0, 374, 600, 86, [(g, None), ([f'<path d="{"".join(hooks)}" fill="none" stroke="{RUG_W}" stroke-width="1.1" stroke-linejoin="round"/>'], None), (fr, None), (lines, 0.4, 44.0)])

# ================================================================ coffee
def majlistray():
    """Arabic coffee, the welcome: a brass dallah (a round belly, a narrow waist, a flared rim, a tall peaked lid, a long
    beaked spout and a handle) on a round brass tray, two small handleless finjan cups in front of the spout, and a dish
    of dates. Drawn in world units: the tray's middle at x 548 on the floor at y 390."""
    TX, TY = 548.0, 388.0
    g, d = [], []
    # the tray: its rim's underside, then the top
    g.append(ellipse(TX, TY + 2.6, 42, 8.5, BRASS_D, INK, 1.4))
    g.append(ellipse(TX, TY, 42, 8.5, BRASS, INK, 1.4))
    rim = [ellipse(TX, TY, 36, 6.6, "none", BRASS_L, 1.2, 'opacity="0.8"'),
           ellipse(TX, TY, 30, 5.2, "none", BRASS_D, 0.7, 'opacity="0.7"'),
           f'<path d="{"".join(dot_d(TX + 33 * math.cos(2 * math.pi * k / 26), TY + 6 * math.sin(2 * math.pi * k / 26)) for k in range(26))}" fill="none" stroke="{BRASS_D}" stroke-width="1.1"/>']
    tray, g = g, []
    # the dallah: its profile, mirrored
    DX, DB = 557.0, TY + 1.5
    prof = [(12, 0), (11.5, -2.5), (15, -8), (15.5, -13), (13, -19), (7.5, -25), (6.5, -28), (8.5, -31), (11.5, -34), (10, -35.5),
            (9, -37), (7, -42), (4, -46.5), (1.8, -48.5), (2.8, -50.5), (1.6, -53.5), (0, -58)]
    body = [(DX + x, DB + y) for x, y in prof] + [(DX - x, DB + y) for x, y in prof[::-1]][1:]
    # the spout first (behind the belly): from low on the belly's left, up and out to a beak at rim height
    # (a long beak: wide where it leaves the belly, curving up and out, narrowing to a pointed lip above the rim)
    spout = [(DX - 11, DB - 21), (DX - 17, DB - 26), (DX - 22, DB - 33), (DX - 25.5, DB - 40), (DX - 29.5, DB - 45.5), (DX - 33.5, DB - 47.5),
             (DX - 30, DB - 42), (DX - 27, DB - 35), (DX - 23.5, DB - 26), (DX - 19, DB - 16), (DX - 14, DB - 9)]
    g.append(path(soft(spout, 0.3), BRASS, INK, 1.3))
    g.append(path(f"M{DX - 17:.1f},{DB - 20:.1f} Q{DX - 22.5:.1f},{DB - 28:.1f} {DX - 26:.1f},{DB - 39:.1f}", "none", BRASS_L, 1.4, 'opacity="0.85"'))
    # the handle (behind the body on the right): out from the rim, down to the belly
    g.append(path(f"M{DX + 10:.1f},{DB - 32:.1f} C{DX + 22:.1f},{DB - 33:.1f} {DX + 23:.1f},{DB - 20:.1f} {DX + 14:.1f},{DB - 12:.1f}", "none", INK, 4.8))
    g.append(path(f"M{DX + 10:.1f},{DB - 32:.1f} C{DX + 22:.1f},{DB - 33:.1f} {DX + 23:.1f},{DB - 20:.1f} {DX + 14:.1f},{DB - 12:.1f}", "none", BRASS_D, 2.6))
    g.append(path(soft(body, 0.3), BRASS, INK, 1.4))
    # its bands and light: a lit strip down the left, a shaded right, the rim and the waist banded
    g.append(path(f"M{DX - 11:.1f},{DB - 5:.1f} Q{DX - 14:.1f},{DB - 13:.1f} {DX - 10:.1f},{DB - 20:.1f}", "none", BRASS_L, 2.2, 'opacity="0.85"'))
    g.append(path(f"M{DX + 9:.1f},{DB - 4:.1f} Q{DX + 13:.1f},{DB - 12:.1f} {DX + 9:.1f},{DB - 20:.1f}", "none", BRASS_D, 2.4, 'opacity="0.55"'))
    g.append(path(f"M{DX - 14.5:.1f},{DB - 12:.1f} Q{DX:.1f},{DB - 9:.1f} {DX + 14.5:.1f},{DB - 12:.1f}", "none", BRASS_D, 1.3))
    g.append(path(f"M{DX - 7:.1f},{DB - 26.5:.1f} Q{DX:.1f},{DB - 25:.1f} {DX + 7:.1f},{DB - 26.5:.1f}", "none", BRASS_D, 1.3))
    g.append(path(f"M{DX - 10.5:.1f},{DB - 34.5:.1f} Q{DX:.1f},{DB - 33:.1f} {DX + 10.5:.1f},{DB - 34.5:.1f}", "none", INK, 1.1))
    g.append(path(f"M{DX - 4:.1f},{DB - 44:.1f} Q{DX - 2:.1f},{DB - 47:.1f} {DX:.1f},{DB - 47.5:.1f}", "none", BRASS_L, 1.4, 'opacity="0.9"'))
    # two finjan cups (white with a gold rim and a green band), one with coffee in it, in front of the spout
    for cx_, cy_, full in ((518.0, TY + 3.5, True), (532.0, TY + 5.0, False)):
        d.append(path(soft([(cx_ - 5.5, cy_ - 7), (cx_ + 5.5, cy_ - 7), (cx_ + 4.4, cy_ - 2.5), (cx_ + 2.6, cy_), (cx_ - 2.6, cy_), (cx_ - 4.4, cy_ - 2.5)], 0.3), "#FBF6EC", INK, 1.1))
        d.append(path(f"M{cx_ - 5:.1f},{cy_ - 4.6:.1f} L{cx_ + 5:.1f},{cy_ - 4.6:.1f}", "none", SADU_G, 1.3))
        d.append(ellipse(cx_, cy_ - 7, 5.5, 1.5, "#C9A06A" if full else "#FBF6EC", INK, 0.9))
        d.append(ellipse(cx_, cy_ - 7, 5.5, 1.5, "none", "#D9A63A", 0.8))
    # a small dish of dates
    g.append(path(soft([(568, TY - 1.5), (588, TY - 1.5), (585, TY + 3), (571, TY + 3)], 0.3), "#E9DCC4", INK, 1.1))
    for dx_, dy_ in ((572, -3.2), (577, -3.8), (582, -3.2), (574.5, -5.8), (579.5, -5.8), (577, -7.8)):
        d.append(f'<ellipse cx="{dx_:.1f}" cy="{TY + dy_:.1f}" rx="2.9" ry="1.9" fill="#6B3418" stroke="{INK}" stroke-width="0.8"/>')
    return write("majlistray", 504, 326, 92, 74, [(tray, 0.3, 11.0), (rim, None), (g, 0.3, 11.0), (d, None)])

def majlissteam():
    """A wisp of steam, curling up from its foot (bottom middle); Scenery.tsx puts two at the dallah's spout."""
    pts = [(5, 30), (8, 24), (4, 18), (8.5, 11), (5.5, 4)]
    return write("majlissteam", 0, 0, 12, 32, [([path(smooth_open(pts, 0.5), "none", "#FFFFFF", 1.6, 'opacity="0.75"')], None)])

def majlissmoke():
    """A thread of incense smoke rising from its foot (bottom middle); Scenery.tsx puts three over the burner's bowl."""
    pts = [(6, 66), (9, 54), (4, 42), (10, 28), (7, 14), (11, 2)]
    return write("majlissmoke", 0, 0, 16, 68, [([path(smooth_open(pts, 0.5), "none", "#EFE8DE", 1.8, 'opacity="0.75"')], None)])

# ================================================================ incense
def majlisincense():
    """A mabkhara, the incense burner guests are offered: dark wood flaring up from a square foot to a wide top, studded
    and edged in brass with a little mirror inlaid, a bowl of glowing coals on top (.mj-ember), and three threads of
    smoke rising (.mj-smoke, each drifting on its own clock: stage.css). World units: its foot on the floor at x 50, y 392."""
    MX, MB = 50.0, 392.0
    g, smoke = [], []
    g.append(path(poly([(MX - 15, MB), (MX + 15, MB), (MX + 13, MB - 5), (MX - 13, MB - 5)]), WOOD_D, INK, 1.3))      # the foot
    g.append(path(poly([(MX - 6, MB - 5), (MX + 6, MB - 5), (MX + 5, MB - 13), (MX - 5, MB - 13)]), WOOD, INK, 1.2))      # the stem
    g.append(path(poly([(MX - 10, MB - 13), (MX + 10, MB - 13), (MX + 16, MB - 34), (MX - 16, MB - 34)]), WOOD_D, INK, 1.4))   # the body
    g.append(path(rect_d(MX - 18, MB - 38, MX + 18, MB - 34), BRASS, INK, 1.2))                                          # the rim
    g.append(path(poly([(MX - 9, MB - 16), (MX + 9, MB - 16), (MX + 13.5, MB - 31), (MX - 13.5, MB - 31)]), "none", BRASS, 1.2))
    g.append(path(diamond_a(MX, MB - 23.5, 4.5, 5), "#CFE6EF", INK, 0.8))                                                 # the mirror
    g.append(path(f"M{MX - 1.4:.1f},{MB - 26:.1f} L{MX + 0.8:.1f},{MB - 23.5:.1f}", "none", "#FFFFFF", 0.9))
    studs = [f'<path d="{dot_d(MX - 9, MB - 20)}{dot_d(MX + 9, MB - 20)}{dot_d(MX - 11, MB - 27)}{dot_d(MX + 11, MB - 27)}{dot_d(MX - 5, MB - 9)}{dot_d(MX + 5, MB - 9)}" fill="none" stroke="{BRASS_L}" stroke-width="2.2" stroke-linecap="round"/>']
    # the bowl with the coals and the resin smouldering on them
    bowl = []
    bowl.append(path(smooth_closed([(MX - 12, MB - 38), (MX + 12, MB - 38), (MX + 9, MB - 43), (MX - 9, MB - 43)], 0.3), BRASS_D, INK, 1.2))
    bowl.append(ellipse(MX, MB - 43, 9.5, 2.6, "#3A1A0E", INK, 1.0))
    ember = [f'<path class="mj-ember" d="{dot_d(MX - 4, MB - 43.3)}{dot_d(MX + 1, MB - 42.6)}{dot_d(MX + 5, MB - 43.4)}" fill="none" stroke="#FF8A2A" stroke-width="2.6" stroke-linecap="round"/>']
    return write("majlisincense", 30, 340, 40, 54, [(g, 0.3, 10.0), (studs, None), (bowl, 0.3, 10.0), (ember, None)])

if __name__ == "__main__":
    total = 0
    for fn in (majlissky, majlisjet, majlismist, majliscloud, majlisbird, majlisplane, majliswall, majlisspecks, majlisseat, majlisrug, majlislantern, majlistray, majlissteam, majlisincense, majlissmoke):
        total += fn()
    print(f"total {total / 1024:.1f} KB")
    print("BURJ_BOX", BURJ_BOX)
    print("BURJ_OUTLINE", BURJ_OUTLINE)
