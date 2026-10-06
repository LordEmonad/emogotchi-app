"""The Western Wall (the Kotel): a room theme for the Jewish pack -> packages/pet/props/kotel*.svg

The room is the plaza in front of the Wall. The sky and the plaza's base tone are CSS (stage.css,
data-scene="kotel"); these are the drawn pieces on top of them, all in the room's 600x460 world coordinates
(Scenery.tsx places each box):

  kotelwall   the Wall itself, the whole width of the room from the plaza (y=366) up to a ragged top at about
              y=60: six courses of huge Herodian ashlars, each with its drafted margin (a smooth recessed band
              round the stone's face) and its raised boss, above them the smaller, rougher later courses; caper
              and hyssop growing out of the upper joints, a few trailing down; and hundreds of folded prayer notes
              (kvitlach) tucked into the joints at reach height. A niche in the upper courses where a dove roosts.
  kotelplaza  the joints of the plaza's paving, in one-point perspective, and the ink line where it meets the Wall.
  koteldove   a rock dove in flight (#wl / #wr flap in the site, like the bat).
  kotelperch  a rock dove sitting (its #dovehead bobs in the site).

Flat fills and wobbly ink like everything else, but the Wall's ink is a warm dark brown and lighter than the pets'
black, so a white cat, a green frok and an orange log all stand out against it. The stones are baked with a coarse
wobble; the notes, leaves and bosses are small or straight and are left unbaked, which keeps the file small.
Kept apart from props.py so the other rooms are not regenerated when this one changes. Run: python3 design/kotelprops.py
"""
import os, re, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, smooth_closed, smooth_open, poly, path, ellipse
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

# ---- palette: Jerusalem limestone, warm and mid-light so the pets read against it ----
STONE      = ["#D8C8A2", "#D1BF97", "#DDCFAC", "#CBB990", "#D5C49D", "#CFBD96", "#DACAA5"]   # a boss's face, per stone
MARGIN_LIFT = 0.16    # the drafted margin: the face lightened (smooth-dressed, it catches more light)
UPPER      = ["#D8CEB3", "#CFC4A6", "#DED5BD", "#CABE9F", "#D4C9AC"]   # the later courses: paler, greyer, smaller
SINK       = "#3B2A18"   # the Wall's ink: joints and outlines (a warm dark brown, lighter than the pets' black)
LIT        = "#F1E6CB"   # a boss's lit top and left edge
SHADE      = "#9C8358"   # a boss's shadowed bottom and right edge
WEATHER    = "#8A7050"   # stains and pitting
NICHE      = "#4A3A26"   # the dark of a hole in the Wall
PAPER      = ["#FBF8EE", "#F4EEDD", "#FFFFFF", "#EFE8D4", "#F8F4E6"]
PAPER_FOLD = "#D9D0B8"
LEAF       = ["#7FA35E", "#6C9150", "#88AC66"]
LEAF_DARK  = "#4E6B34"
HYSSOP     = ["#93A77C", "#A2B48A", "#8A9E74"]
FLOWER_PINK = "#C9579B"
DOVE       = "#A7ACB8"   # rock dove grey
DOVE2      = "#C9CDD6"   # wing
DOVE3      = "#7D8290"   # tail band, bars
NECK_G     = "#6F9A86"   # the iridescent neck
NECK_P     = "#8E6E9E"

FLOOR_Y = 366.0
WALL_TOP = 30.0      # kotelwall's box: world y 30..370 (plants stand a little above the stones' top)
HEROD = [44, 43, 43, 42, 41, 39]    # the six great courses, bottom up
UPPERC = [19, 18, 17]               # the later courses above them; the last has a ragged top

def _mix(hex_, t, to=(255, 255, 255)):
    r, g, b = int(hex_[1:3], 16), int(hex_[3:5], 16), int(hex_[5:7], 16)
    r, g, b = (round(c + (tc - c) * t) for c, tc in zip((r, g, b), to))
    return f"#{r:02X}{g:02X}{b:02X}"

def _round(body, decimals):
    def rnd(m):
        v = f"{float(m.group(0)):.{decimals}f}"
        return v.rstrip("0").rstrip(".") if decimals > 0 else v
    return re.sub(r"-?\d+\.\d+", rnd, body)

def write(name, w, h, parts, decimals=1, dy=0.0):
    """parts: [(body_list, amp or None[, step])]; None = not baked. dy shifts world coordinates into the box."""
    out = []
    for part in parts:
        body, amp = part[0], part[1]; step = part[2] if len(part) > 2 else 16.0
        s = "\n".join(body)
        if amp: s = bake(s, amp=amp, freq=0.09, step=step)
        out.append(s)
    body = _round("\n".join(out), decimals)
    inner = f'<g transform="translate(0 {-dy:g})">\n{body}\n</g>' if dy else body
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{inner}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"{len(src) / 1024:.1f} KB")

def rect_d(x0, y0, x1, y1):
    return f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y0:.1f} L{x1:.1f},{y1:.1f} L{x0:.1f},{y1:.1f} Z"

def _row_joints(rng, x_from, x_to, wmin, wmax, avoid, gap=22.0):
    """Joint positions across a course, stones wmin..wmax wide, never within `gap` of a joint in `avoid` (the course
    below), so the bond staggers like a real wall."""
    xs = [x_from]; x = x_from
    while x < x_to:
        for _ in range(12):
            w = rng.uniform(wmin, wmax)
            if all(abs(x + w - a) > gap for a in avoid): break
        x += w; xs.append(x)
    return xs

# ================================================================ the Wall
class Batch:
    """Many small shapes of one style as ONE path (subpaths): a wall of notes, speckles or leaves costs a few paths."""
    def __init__(self): self.d = {}
    def add(self, key, d): self.d.setdefault(key, []).append(d)
    def paths(self, style):
        return [f'<path d="{" ".join(ds)}" {style(k)}/>' for k, ds in self.d.items()]

def _rot(pts, x, y, a):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    return [(x + px * c - py * s, y + px * s + py * c) for px, py in pts]

def _blob(cx, cy, rx, ry, rng, n=6, smooth=True):
    """An irregular closed shape round (cx, cy): a stain (smooth), or a pocket worn into a joint (angular: a crack)."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.25, 0.25); r = rng.uniform(0.7, 1.15)
        pts.append((cx + rx * r * math.cos(a), cy + ry * r * math.sin(a)))
    return smooth_closed(pts, 0.5) if smooth else poly(pts)

def _arc_leaf(x, y, rx, ry, rot):
    """A round leaf as two arcs (short, and batchable into one path)."""
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    ax, ay = x - rx * c, y - rx * s; bx, by = x + rx * c, y + rx * s
    return f"M{ax:.1f},{ay:.1f} A{rx:.1f},{ry:.1f} {rot:.0f} 1 1 {bx:.1f},{by:.1f} A{rx:.1f},{ry:.1f} {rot:.0f} 1 1 {ax:.1f},{ay:.1f} Z"

PLANT_INK = "#2C4420"   # the plants' outline: a deep green, softer than black at this size

def kotelwall():
    rng = random.Random(1967)
    fills, joints, detail, pockets = [], [], [], []
    notes, speck, leaves, edges, stains = Batch(), Batch(), Batch(), Batch(), Batch()
    # --- the six Herodian courses ---
    y_bot = FLOOR_Y; prev = []; courses = []
    for k, h in enumerate(HEROD):
        y_top = y_bot - h
        # stones from nearly square to four times as long as tall, the bond staggered over the course below
        xs = _row_joints(rng, rng.uniform(-120, -30), 640, h * 1.5, h * 4.2 - k * 6, prev)
        xs = [x for x in xs]
        courses.append((y_top, y_bot, [x for x in xs[1:-1] if -2 < x < 602]))
        joints.append(f"M-6,{y_bot:.1f} L606,{y_bot:.1f}")
        for i in range(len(xs) - 1):
            x0, x1 = xs[i], xs[i + 1]
            if x1 < -4 or x0 > 604: continue
            if 0 < x0 < 600: joints.append(f"M{x0:.1f},{y_top:.1f} L{x0:.1f},{y_bot:.1f}")
            face = rng.choice(STONE)
            tone = rng.random()
            if tone < 0.18: face = _mix(face, rng.uniform(0.10, 0.18), (120, 108, 92))     # greyed, weathered
            elif tone > 0.86: face = _mix(face, rng.uniform(0.10, 0.2))                       # bleached pale
            if k <= 1: face = _mix(face, 0.08, (70, 54, 34))                                  # the lowest: darkened by hands
            cx0, cx1 = max(x0, -6), min(x1, 606)
            fills.append(f'<path d="{rect_d(cx0, y_top, cx1, y_bot)}" fill="{_mix(face, MARGIN_LIFT)}"/>')
            m = 4.6 + rng.uniform(-0.5, 0.8)                                                  # the drafted margin
            bx0, by0, bx1, by1 = x0 + m, y_top + m * 0.85, x1 - m, y_bot - m
            if bx1 - bx0 < 8: continue
            detail.append(f'<path d="{rect_d(max(bx0, -6), by0, min(bx1, 606), by1)}" fill="{face}"/>')
            edges.add("lit", f"M{bx0:.1f},{by1 - 1:.1f} L{bx0:.1f},{by0:.1f} L{bx1 - 1:.1f},{by0:.1f}")
            edges.add("shade", f"M{bx0 + 1:.1f},{by1:.1f} L{bx1:.1f},{by1:.1f} L{bx1:.1f},{by0 + 1:.1f}")
            # weathering: soft stains, a bleached patch now and then, the rough-dressed boss speckled
            for _ in range(rng.randint(1, 2)):
                sx = rng.uniform(bx0 + 6, max(bx0 + 7, bx1 - 6)); sy = rng.uniform(by0 + 4, max(by0 + 5, by1 - 4))
                col = WEATHER if rng.random() < 0.7 else "#FFFFFF"
                stains.add((col, rng.choice((0.08, 0.13))), _blob(sx, sy, rng.uniform(6, min(22, (bx1 - bx0) / 2)), rng.uniform(3, 8), rng, 5))
            for _ in range(int((bx1 - bx0) * (by1 - by0) / 300)):
                px = rng.uniform(bx0 + 2, bx1 - 2); py = rng.uniform(by0 + 2, by1 - 2)
                speck.add("d" if rng.random() < 0.65 else "l", f"M{px:.1f},{py:.1f}h.1")
        prev = xs; y_bot = y_top
    herod_top = y_bot
    # --- the later courses: smaller, rougher, no margins; the top ragged; a niche where a dove roosts ---
    upper_rows = []
    for k, h in enumerate(UPPERC):
        y_top = y_bot - h
        xs = _row_joints(rng, rng.uniform(-60, -8), 630, h * 1.4, h * 3.4, prev, gap=8.0)
        upper_rows.append((y_top, y_bot, xs)); prev = xs; y_bot = y_top
    NICHE_X = (84.0, 124.0)
    ragged = []
    last_tops = []                                                        # each top stone's chipped edge, for seating the plants on it
    for r, (y_top, y_bot, xs) in enumerate(upper_rows):
        last = r == len(upper_rows) - 1
        for i in range(len(xs) - 1):
            x0, x1 = xs[i], xs[i + 1]
            if x1 < -4 or x0 > 604: continue
            face = rng.choice(UPPER)
            if rng.random() < 0.2: face = _mix(face, rng.uniform(0.08, 0.16), (110, 100, 86))
            if r == 0 and x0 < NICHE_X[1] and x1 > NICHE_X[0]:
                ragged.append(path(rect_d(x0, y_top, x1, y_bot), NICHE, SINK, 1.9))           # the stone is gone: a dark hole
                detail.append(path(f"M{x0 + 2:.1f},{y_bot - 1.6:.1f} L{x1 - 2:.1f},{y_bot - 1.6:.1f}", "none", "#6B5536", 2.6, 'opacity="0.9"'))
                continue
            top = y_top - (rng.uniform(-2.5, 4.5) if last else 0)
            if last and rng.random() < 0.2: top = y_top + rng.uniform(3, 7)
            cx0, cx1 = max(x0, -6), min(x1, 606)
            if last:
                # the last course: each stone its own outline, the top edge chipped
                pts = [(cx0, y_bot), (cx0, top + rng.uniform(0, 2.5)), (cx0 + (cx1 - cx0) * rng.uniform(0.2, 0.45), top + rng.uniform(-1.2, 1.5)),
                       (cx0 + (cx1 - cx0) * rng.uniform(0.55, 0.8), top + rng.uniform(-1.2, 1.5)), (cx1, top + rng.uniform(0, 2.5)), (cx1, y_bot)]
                ragged.append(path(poly(pts), face, SINK, 1.8))
                last_tops.append(pts[1:5])
            else:
                fills.append(f'<path d="{rect_d(cx0, y_top, cx1, y_bot)}" fill="{face}"/>')
                if 0 < x0 < 600: joints.append(f"M{x0:.1f},{y_top:.1f} L{x0:.1f},{y_bot:.1f}")
            edges.add("lit2", f"M{x0 + 2:.1f},{y_bot - 2:.1f} L{x0 + 2:.1f},{top + 2.5:.1f} L{x1 - 3:.1f},{top + 2.5:.1f}")
            for _ in range(int((x1 - x0) * (y_bot - top) / 240)):
                speck.add("d" if rng.random() < 0.6 else "l", f"M{rng.uniform(x0 + 2, x1 - 2):.1f},{rng.uniform(top + 2, y_bot - 2):.1f}h.1")
        joints.append(f"M-6,{y_bot:.1f} L606,{y_bot:.1f}")
    # the later wall stands a little back on the Herodian top: a shadow under its first course
    detail.append(path(f"M-6,{herod_top - 1.2:.1f} L606,{herod_top - 1.2:.1f}", "none", SHADE, 2.4, 'opacity="0.5"'))
    # water stains, long and faint, down from where the plants grow
    for x, y, L in ((68, 118, 76), (398, 116, 104), (544, 156, 64), (262, 166, 50), (470, 80, 40)):
        detail.append(path(f"M{x:.1f},{y:.1f} C{x + 2:.1f},{y + L * 0.4:.1f} {x - 2:.1f},{y + L * 0.7:.1f} {x + 1:.1f},{y + L:.1f}", "none", WEATHER, 8.0, 'opacity="0.09"'))

    # --- the notes (kvitlach): pushed into the joints and the pockets worn into them, packed at reach height ---
    def note(x, y, a, scale=1.0):
        w = rng.uniform(7.0, 11.5) * scale; hgt = rng.uniform(3.4, 5.4) * scale
        shape = [(-w / 2, -hgt / 2 + rng.uniform(0, 1)), (w / 2, -hgt / 2), (w / 2 - rng.uniform(0.3, 1.4), hgt / 2), (-w / 2 + rng.uniform(0, 1), hgt / 2)]
        notes.add(rng.choice(PAPER), poly(_rot(shape, x, y, a)))
        if w > 10:                                                        # the fold, on the bigger ones
            crease = _rot([(-w / 2 + 0.8, 0.2), (w / 2 - 0.8, -0.1)], x, y, a)
            notes.add("crease", f"M{crease[0][0]:.1f},{crease[0][1]:.1f} L{crease[1][0]:.1f},{crease[1][1]:.1f}")
    # the pockets: where the joints have worn open, dark, with notes crammed in; thickest at reach height
    for k, (y_top, y_bot, xs) in enumerate(courses[:5]):
        dens = (1.0, 1.25, 1.15, 0.8, 0.35)[k]
        for _ in range(int(13 * dens)):                                   # along the course's top joint
            x = rng.triangular(6, 594, 300); L = rng.uniform(10, 28)
            pockets.append(_blob(x, y_top, L / 2, rng.uniform(2.6, 4.4), rng, 6, False))
            for j in range(rng.randint(2, 6) if dens > 0.9 else rng.randint(1, 3)):
                note(x + rng.uniform(-L / 2.4, L / 2.4), y_top + rng.uniform(-1.8, 1.8), rng.uniform(-40, 40))
        for x in xs:                                                      # and down its vertical joints
            if rng.random() < 0.9 * min(1, dens):
                h = y_bot - y_top; L = rng.uniform(12, h * 0.75); y = rng.uniform(y_top + L / 2 + 2, y_bot - L / 2 - 2)
                pockets.append(_blob(x, y, rng.uniform(2.2, 3.4), L / 2, rng, 6, False))
                for j in range(rng.randint(1, 4)):
                    note(x + rng.uniform(-0.8, 0.8), y + rng.uniform(-L / 2.6, L / 2.6), rng.uniform(50, 130))
    for (y_top, y_bot, xs) in courses[:5]:                                # single notes along the thin joints too
        for _ in range(14 if y_bot > 236 else 6):
            note(rng.triangular(8, 592, 300), y_top + rng.uniform(-0.8, 0.8), rng.uniform(-28, 28), 0.85)

    # --- the plants: caper bushes hanging from the upper joints, hyssop in tufts, grass along the top ---
    def caper(x, y, d, size, trail, flowers=1):
        """A caper bush out of a joint: a mound of round blue-green leaves, a few strands falling away down the stone,
        a white flower or two with a spray of long pink stamens."""
        out = []
        for s in range(rng.randint(2, 3)):                                # the trailing strands, stems first
            L = trail * rng.uniform(0.6, 1.0); sx = x + d * rng.uniform(-size * 0.3, size * 0.5)
            pts = [(sx, y + 2), (sx + d * L * 0.18, y + L * 0.35), (sx + d * L * 0.12 + rng.uniform(-4, 4), y + L * 0.7), (sx + d * L * 0.2, y + L)]
            out.append(path(smooth_open(pts, 0.5), "none", LEAF_DARK, 1.2))
            for t in (0.25, 0.42, 0.58, 0.72, 0.85, 0.96):
                i = min(int(t * 3), 2); u = t * 3 - i
                px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u; py = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u
                r = 4.2 - 2.0 * t
                leaves.add(rng.choice(LEAF), _arc_leaf(px + rng.choice((-1, 1)) * r * 0.8, py, r, r * 0.8, rng.uniform(0, 180)))
        for j in range(int(size * 0.9)):                                  # the mound
            a = rng.uniform(math.pi * 1.05, math.pi * 1.95); rr = rng.uniform(0, 1) ** 0.6
            px = x + math.cos(a) * size * 0.55 * rr + d * size * 0.12; py = y + 3 + math.sin(a) * size * 0.34 * rr
            r = rng.uniform(3.4, 4.8)
            leaves.add(rng.choice(LEAF), _arc_leaf(px, py, r, r * 0.82, rng.uniform(0, 180)))
        for f in range(flowers):
            fx = x + rng.uniform(-size * 0.3, size * 0.3); fy = y - size * 0.18 + rng.uniform(-2, 3)
            for a in (0, 90, 180, 270):
                ex, ey = fx + 2.6 * math.cos(math.radians(a + 45)), fy + 2.6 * math.sin(math.radians(a + 45))
                out.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="2.3" fill="#FFFFFF" stroke="{PLANT_INK}" stroke-width="0.6"/>')
            stam = " ".join(f"M{fx:.1f},{fy:.1f} L{fx + 6.5 * math.cos(math.radians(a)):.1f},{fy + 6.5 * math.sin(math.radians(a)):.1f}" for a in (-150, -120, -90, -60, -30))
            out.append(path(stam, "none", FLOWER_PINK, 0.8))
            out.append(f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="1.2" fill="#E8D26A"/>')
        return out

    def hyssop(x, y, n=9, size=13):
        """An upright tuft of small grey-green leaves out of a joint (the ezov that grows in the Wall)."""
        out = []
        for j in range(n):
            a = math.radians(-90 + (j - (n - 1) / 2) * (130 / n) + rng.uniform(-6, 6))
            L = size * rng.uniform(0.55, 1.0)
            tx, ty = x + L * math.cos(a), y + L * math.sin(a)
            mx, my = (x + tx) / 2, (y + ty) / 2; nx, ny = -math.sin(a) * 2.2, math.cos(a) * 2.2
            leaves.add(rng.choice(HYSSOP), f"M{x:.1f},{y:.1f} Q{mx + nx:.1f},{my + ny:.1f} {tx:.1f},{ty:.1f} Q{mx - nx:.1f},{my - ny:.1f} {x:.1f},{y:.1f} Z")
        return out

    def grass(x, y, n=5, size=9):
        d = " ".join(f"M{x:.1f},{y:.1f} Q{x + size * 0.3 * math.cos(a) + 1.5:.1f},{y + size * 0.5 * math.sin(a):.1f} {x + size * r * math.cos(a):.1f},{y + size * r * math.sin(a):.1f}"
                     for a, r in ((math.radians(-90 + (j - (n - 1) / 2) * 17 + rng.uniform(-5, 5)), rng.uniform(0.6, 1.1)) for j in range(n)))
        return [path(d, "none", "#6E8B4E", 1.3)]

    plants = []
    ut = [r[0] for r in upper_rows]                                       # tops of the later courses
    plants += caper(66, herod_top + 1, 1, 30, 44, 2)
    plants += caper(400, herod_top - 1, -1, 34, 58, 2)
    plants += caper(546, courses[5][1] + 1, 1, 24, 36, 1)
    plants += caper(262, courses[4][1] + 1, -1, 20, 26, 1)
    plants += caper(476, ut[1] + 2, 1, 22, 24, 1)
    plants += hyssop(186, ut[0] + 1, 10, 15)
    plants += hyssop(320, ut[1] + 1, 9, 13)
    plants += hyssop(508, courses[3][1] + 1, 7, 10)
    plants += hyssop(24, courses[4][1] + 1, 8, 12)
    plants += hyssop(574, ut[0] + 1, 8, 13)
    plants += hyssop(138, courses[5][1] + 1, 6, 10)
    def top_at(x):
        """The top of the wall at x: on the chipped edge of the stone there (a tuft set at the course's nominal top
        floated in the sky wherever the stone under it was chipped lower)."""
        for t in last_tops:
            if t[0][0] <= x <= t[-1][0]:
                for (xa, ya), (xb, yb) in zip(t, t[1:]):
                    if xa <= x <= xb: return ya + (yb - ya) * (x - xa) / max(1e-6, xb - xa)
        return ut[2]
    for gx in (20, 132, 214, 290, 350, 430, 522, 588):
        gx += rng.uniform(-6, 6); dy = rng.uniform(0, 2)                  # (the same draws as before, so nothing else moves)
        plants += grass(gx, top_at(gx) + 1.4 + dy * 0.3, rng.randint(3, 6), rng.uniform(7, 11))
    plants += hyssop(252, top_at(252) + 1.2, 9, 14)
    plants += hyssop(462, top_at(462) + 1.2, 8, 12)

    leaf_paths = leaves.paths(lambda k: f'fill="{k}" stroke="{PLANT_INK}" stroke-width="0.8" stroke-linejoin="round"')
    note_paths = notes.paths(lambda k: ('fill="none" stroke="#B9AF97" stroke-width="0.7"' if k == "crease" else
                                        f'fill="{PAPER_FOLD}" opacity="0.5"' if k == "fold" else
                                        f'fill="{k}" stroke="{SINK}" stroke-width="0.8" stroke-linejoin="round"'))
    edge_paths = edges.paths(lambda k: {"lit": f'fill="none" stroke="{LIT}" stroke-width="1.4" opacity="0.9"',
                                        "shade": f'fill="none" stroke="{SHADE}" stroke-width="1.8" opacity="0.85"',
                                        "lit2": f'fill="none" stroke="{LIT}" stroke-width="1.1" opacity="0.55"'}[k])
    stain_paths = stains.paths(lambda k: f'fill="{k[0]}" opacity="{k[1]}"')
    speck_paths = speck.paths(lambda k: f'fill="none" stroke="{WEATHER if k == "d" else "#F4EBD2"}" stroke-width="{1.5 if k == "d" else 1.3}" stroke-linecap="round" opacity="{0.4 if k == "d" else 0.55}"')
    # the order: stone fills, the bosses and weathering, the speckle, the joints (baked), the pockets, the ragged top,
    # then the notes (over the pockets) and the plants
    write("kotelwall", 600, 340, [(fills, None), (detail, None), (stain_paths, None), (edge_paths, None), (speck_paths, None), ([f'<path d="{" ".join(joints)}" fill="none" stroke="{SINK}" stroke-width="2" stroke-linecap="round"/>'], 0.9, 30.0),
                                  ([f'<path d="{" ".join(pockets)}" fill="{NICHE}" stroke="{SINK}" stroke-width="1" stroke-linejoin="round"/>'], None), (ragged, 0.8, 24.0), (note_paths, None), (leaf_paths, None), (plants, None)], decimals=1, dy=WALL_TOP)

# ================================================================ the plaza's paving
PLAZA_TOP = 362.0            # kotelplaza's box: world y 362..460 (the Wall's foot line at 366)
VP = (300.0, 236.0)          # eye level, the same as the Backrooms
def _px(xw, y):
    """x at screen row y of the joint that meets the Wall's foot at xw (one-point perspective onto VP)."""
    return VP[0] + (xw - VP[0]) * (y - VP[1]) / (FLOOR_Y - VP[1])

def kotelplaza():
    rng = random.Random(70)
    rows = [366.0, 373.0, 382.0, 393.0, 406.0, 422.0, 441.0, 462.0]
    joints, lit, g_tones = [], [], []
    SLAB = 44.0                                                          # a slab's width where it meets the Wall
    for r in range(len(rows) - 1):
        y0, y1 = rows[r], rows[r + 1]
        off = (SLAB / 2) * (r % 2)
        k = -12
        while True:
            xw = VP[0] + (k * SLAB + off) - 0
            xa, xb = _px(xw, y0), _px(xw, y1)
            if min(xa, xb) > 640: break
            if max(xa, xb) > -40:
                joints.append(f"M{xa:.1f},{y0:.1f} L{xb:.1f},{y1:.1f}")
                # now and then a slab a shade apart
                if rng.random() < 0.22:
                    xw2 = xw + SLAB
                    q = [(xa, y0), (_px(xw2, y0), y0), (_px(xw2, y1), y1), (xb, y1)]
                    g_tones.append(path(poly(q), rng.choice(["#FFFFFF", "#7A6440"]), "none", 0, f'opacity="{rng.uniform(0.05, 0.10):.2f}"'))
            k += 1
    for y in rows[1:-1]:
        joints.append(f"M-4,{y:.1f} L604,{y:.1f}")
        lit.append(f"M-4,{y + 1.3:.1f} L604,{y + 1.3:.1f}")                  # each row's lit front edge
    g_lines = [f'<path d="{" ".join(joints)}" fill="none" stroke="#8F7C5A" stroke-width="1.1" stroke-linecap="round" opacity="0.55"/>',
               f'<path d="{" ".join(lit)}" fill="none" stroke="#FFF6E0" stroke-width="0.9" opacity="0.35"/>']
    foot = [path(f"M-4,{FLOOR_Y:.1f} L604,{FLOOR_Y:.1f}", "none", INK, 1.8, 'opacity="0.8"')]
    write("kotelplaza", 600, 98, [(g_tones, None), (g_lines, 0.5, 40.0), (foot, 0.6, 30.0)], decimals=1, dy=PLAZA_TOP)

# ================================================================ the doves
def _dove_body(g, perch=False):
    """A rock dove, side on, facing right: grey body, the iridescent neck, a dark band on the tail, two bars on the wing."""
    g.append(path(smooth_closed([(8, 21), (16, 16), (28, 14), (38, 15), (44, 20), (40, 26), (28, 28), (16, 27)], 0.5), DOVE, INK, 1.4))
    g.append(path("M2,20 L10,17 L12,26 L3,25 Z", DOVE, INK, 1.3))                             # the tail
    g.append(path("M2.6,20.4 L5.4,19.3 L6.3,25.4 L3.3,25.1 Z", DOVE3, "none", 0))              # its dark band
    return g

def koteldove():
    """In flight: #wl (far wing, behind) and #wr (near wing, in front) flap about the shoulder (stage.css)."""
    g = []
    g.append(f'<g id="wl">{path("M26,17 C22,6 16,1 8,2 C13,7 16,12 20,18 Z", DOVE3, INK, 1.2)}</g>')
    g = _dove_body(g)
    g.append(path(smooth_closed([(38, 15), (44, 11), (50, 12), (52, 16), (48, 20), (42, 21)], 0.5), DOVE, INK, 1.3))   # the head
    g.append(path("M40,17 C42,14 45,14 46,17 C45,20 42,21 40,20 Z", NECK_G, "none", 0, 'opacity="0.9"'))
    g.append(path("M40,19 C42,18 44,19 45,20", "none", NECK_P, 1.6, 'opacity="0.8"'))
    g.append(path("M52,15.5 L56,16.6 L52,17.8 Z", "#3A3440", INK, 0.8))                       # the beak
    g.append('<circle cx="48.3" cy="14.6" r="1.2" fill="#E07A2E"/><circle cx="48.3" cy="14.6" r="0.55" fill="#111111"/>')
    near = path("M24,18 C24,8 30,1 40,0 C38,6 35,12 32,19 Z", DOVE2, INK, 1.2)
    bars = path("M28,11 L34,9 M27,14.5 L33,12.5", "none", DOVE3, 1.3)
    g.append(f'<g id="wr">{near}{bars}</g>')
    write("koteldove", 58, 30, [(g, 0.45)], decimals=1)

def kotelperch():
    """Sitting in the niche: the body at rest, the wing folded with its two bars, pink feet; #dovehead bobs (stage.css)."""
    g = []
    g.append(path("M1,24 L10,20 L12,28 L2,29 Z", DOVE, INK, 1.3))                              # the tail, down behind
    g.append(path("M1.6,24.4 L4.4,23.2 L5.3,28.6 L2.3,28.8 Z", DOVE3, "none", 0))
    g.append(path(smooth_closed([(8, 24), (14, 18), (24, 15), (33, 17), (37, 23), (33, 30), (22, 32), (12, 30)], 0.5), DOVE, INK, 1.4))
    g.append(path(smooth_closed([(12, 23), (20, 18), (29, 19), (30, 25), (22, 28), (14, 27)], 0.5), DOVE2, INK, 1.1))   # the folded wing
    g.append(path("M16,22 L23,20.5 M15.5,25 L22.5,23.5", "none", DOVE3, 1.3))
    g.append(path("M21,32 L20,35 M25,32 L25,35", "none", "#D9637A", 1.6))                     # feet
    head = [path(smooth_closed([(29, 17), (33, 11), (39, 10), (42, 14), (39, 19), (33, 21)], 0.5), DOVE, INK, 1.3)]
    head.append(path("M30,17 C32,14 35,14 37,17 C36,20 33,21 31,20 Z", NECK_G, "none", 0, 'opacity="0.9"'))
    head.append(path("M31,19.5 C33,18.5 35,19.5 36,20.5", "none", NECK_P, 1.6, 'opacity="0.8"'))
    head.append(path("M42,13 L45.5,14.2 L41.8,15.4 Z", "#3A3440", INK, 0.8))
    head.append('<circle cx="38.4" cy="12.8" r="1.15" fill="#E07A2E"/><circle cx="38.4" cy="12.8" r="0.55" fill="#111111"/>')
    body = bake("\n".join(g), amp=0.45, freq=0.09, step=4.0)
    headb = bake("\n".join(head), amp=0.45, freq=0.09, step=4.0)
    src_parts = [(["\n".join([body, f'<g id="dovehead">{headb}</g>'])], None)]
    write("kotelperch", 46, 36, src_parts, decimals=1)

if __name__ == "__main__":
    for fn in (kotelwall, kotelplaza, koteldove, kotelperch):
        fn()
