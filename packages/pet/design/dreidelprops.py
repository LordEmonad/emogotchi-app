"""The dreidel (the Jewish pack's toy item) -> packages/pet/props/dreidel*.svg

A four-sided spinning top: a square body with a pyramid point below and a short stem with a knob on top, in the
pack's colours (the flag's blue with white letters, silver stem, knob and point). The letters נ ג ה ש (nun, gimel,
hei, shin) are drawn as filled strokes on the faces, never as <text>.

The dreidel is modelled in 3-D and projected (a camera a little above it), so a spin is the faces turning past, not
the picture turning in the plane:

  dreidel.svg       16 frames of one turn (`.df.df0` .. `.df15`, every 22.5 degrees; the director shows one at a time),
                    speed rings for the fast part (`.dwhirl`), and the dreidel fallen on its side showing each letter
                    toward us, handle to the right (`.dl.dl-R-nun` ...) and to the left (`.dl-L-...`). One box for all:
                    180 x 104, the point at (90, 100) when it stands, so the director can tip it over about its point.
  dreidelbadge.svg  the result: a blue disc with the letter that came up, one group per letter (`.db-nun` ...).
  gelt.svg          a chocolate coin in gold foil with a Star of David pressed into it (gimel wins the pot).

Same flat fills and wobbly ink as props.py (a lighter wobble: 24 drawings of one object must not boil). Kept apart from
props.py so the room's props are not regenerated every time these change. Run: python3 design/dreidelprops.py
"""
import os, re, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, GOLD, GOLD2, LW, LD, path, ellipse, poly, smooth_open
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

BLUE = "#0038B8"          # the flag's blue
BLUE_DK = "#0B2470"       # a face turned from the light
BLUE_LT = "#3C6FE0"       # a face in the light
WHITE = "#FFFFFF"
SILVER = "#DDE3EC"
SILVER2 = "#A9B3C4"
GELT = "#E2B84A"          # gold foil
GELT2 = "#B8862A"

def rnd(body):
    """One decimal is plenty at this size (a fraction of the bytes, no visible change)."""
    return re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}".rstrip("0").rstrip(".") or "0"), body)

def ink(el, amp=0.45, step=6.0):
    """An inked shape with the house wobble (light: 24 drawings of one object must not boil)."""
    return bake(el, amp=amp, freq=0.09, step=step)

def svg(name, w, h, body):
    body = rnd("\n".join(body))
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"({len(src) // 1024} KB)")

# ---------------- the letters: strokes in a unit box, u to the right, v down ----------------
# Square Hebrew as it is on a dreidel, each letter a few straight strokes (the heads are the short strokes at the top).
LETTERS = {
    # nun: a small head to the left at the top, the stem down the right, the base running back to the left
    # (the head is a short stub, well under half the base: with a head as long as the base it read as kaf, כ)
    "nun": [((0.45, 0.10), (0.64, 0.10)), ((0.64, 0.10), (0.64, 0.88)), ((0.64, 0.88), (0.22, 0.88))],
    # gimel: a head to the left, the stem down the right, and a foot kicking down and out to the left from low on the stem
    "gimel": [((0.34, 0.10), (0.60, 0.10)), ((0.60, 0.10), (0.66, 0.90)), ((0.62, 0.56), (0.28, 0.92))],
    # hei: the roof across the top, the right leg down from it, the left leg standing apart under the roof
    # (the left leg starts well clear of the roof: touching it, the letter is chet, ח)
    "hei": [((0.12, 0.10), (0.88, 0.10)), ((0.88, 0.10), (0.88, 0.90)), ((0.24, 0.48), (0.24, 0.90))],
    # shin: the flat base with three arms rising from it, the right one straight, the middle and left ones leaning
    # left, each with a little head
    "shin": [((0.86, 0.10), (0.86, 0.88)), ((0.86, 0.88), (0.22, 0.88)), ((0.22, 0.88), (0.10, 0.10)),
             ((0.30, 0.84), (0.52, 0.14)), ((0.76, 0.10), (0.86, 0.10)), ((0.42, 0.14), (0.52, 0.14)), ((0.02, 0.10), (0.10, 0.10))],
}
ORDER = ["nun", "gimel", "hei", "shin"]     # round the dreidel, face 0 .. face 3

def stroke_quads(strokes, w, h, t):
    """Each stroke as a quad in the face's own units (w x h), square ends pushed out by t/2 so the joints close."""
    out = []
    for (u0, v0), (u1, v1) in strokes:
        x0, y0, x1, y1 = u0 * w, v0 * h, u1 * w, v1 * h
        L = math.hypot(x1 - x0, y1 - y0) or 1.0
        dx, dy = (x1 - x0) / L, (y1 - y0) / L
        nx, ny = -dy, dx
        x0, y0, x1, y1 = x0 - dx * t / 2, y0 - dy * t / 2, x1 + dx * t / 2, y1 + dy * t / 2
        out.append([(x0 + nx * t / 2, y0 + ny * t / 2), (x1 + nx * t / 2, y1 + ny * t / 2), (x1 - nx * t / 2, y1 - ny * t / 2), (x0 - nx * t / 2, y0 - ny * t / 2)])
    return out

# ---------------- the model ----------------
S = 15.0        # half the body's width
HB = 32.0       # body height
HP = 22.0       # the point below it
STEM = (32.0, 45.0, 3.0)    # stem from, to, radius
KNOB = (49.0, 5.2)          # knob centre, radius
ELEV = math.radians(20)     # the camera looks down a little
LIGHT = (-0.55, 0.55, 0.63) # from the upper left, in front

def norm(v):
    L = math.sqrt(sum(c * c for c in v)); return tuple(c / L for c in v)
LIGHT = norm(LIGHT)
VIEW = (0.0, math.sin(ELEV), math.cos(ELEV))

def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def matmul(M, v): return tuple(sum(M[i][j] * v[j] for j in range(3)) for i in range(3))

def rot_y(deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    # x' = x c + z s ; z' = -x s + z c  (turning a point at +z toward +x as deg grows: faces slide to the right)
    return ((c, 0, s), (0, 1, 0), (-s, 0, c))

def frame_from(n_local, a_local, n_world, a_world):
    """The rotation taking the local pair (normal, axis) onto the world pair (both orthonormal)."""
    bl = cross(n_local, a_local); bw = cross(n_world, a_world)
    Ml = (n_local, a_local, bl); Mw = (n_world, a_world, bw)
    # R = Mw_cols * Ml_cols^T
    return tuple(tuple(sum(Mw[k][i] * Ml[k][j] for k in range(3)) for j in range(3)) for i in range(3))

def face_normal(k):
    a = math.radians(90 * k); return (math.sin(a), 0.0, math.cos(a))

def corner(k, side, y):
    """Corner of face k: side -1 its left edge (seen from outside), +1 its right; at height y."""
    a = math.radians(90 * k + side * 45); r = S * math.sqrt(2)
    return (r * math.sin(a), y, r * math.cos(a))

def shade(n, lo, hi):
    b = max(0.0, min(1.0, 0.5 + 0.8 * dot(n, LIGHT)))
    def mix(c0, c1, t):
        a = [int(c0[i:i + 2], 16) for i in (1, 3, 5)]; b2 = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
        return "#" + "".join(f"{round(a[i] + (b2[i] - a[i]) * t):02X}" for i in range(3))
    return mix(lo, BLUE, b * 2) if b < 0.5 else mix(BLUE, hi, (b - 0.5) * 2)

def draw(R, origin, letters_on=True, whirl=False):
    """The dreidel turned by R, its point at `origin` (screen), as a list of svg elements in paint order."""
    ox, oy = origin
    def P(p):
        q = matmul(R, (p[0], p[1] + HP, p[2]))     # local y=0 is the body's foot; the point is HP below it
        return (ox + q[0], oy - q[1] * math.cos(ELEV) + q[2] * math.sin(ELEV))
    def depth(p):
        q = matmul(R, (p[0], p[1] + HP, p[2])); return dot(q, VIEW)
    parts = []   # (depth, [elements])
    # the body's four faces
    for k in range(4):
        n = matmul(R, face_normal(k))
        if dot(n, VIEW) <= 0.02: continue
        tl, tr = corner(k, -1, HB), corner(k, 1, HB); bl, br = corner(k, -1, 0), corner(k, 1, 0)
        els = [ink(path(poly([P(tl), P(tr), P(br), P(bl)]), shade(n, BLUE_DK, BLUE_LT), INK, 2.2))]
        if letters_on:
            # the letter in an inset box on the face: u along the top edge, v down the face
            iu, iv = 0.20, 0.16
            fw, fh = 2 * S * (1 - 2 * iu), HB * (1 - 2 * iv)
            def F(x, y):
                u, v = iu + x / (2 * S), iv + y / HB
                top = tuple(tl[i] + (tr[i] - tl[i]) * u for i in range(3))
                return P((top[0], top[1] - v * HB, top[2]))
            for q in stroke_quads(LETTERS[ORDER[k]], fw, fh, 3.3):
                els.append(path(poly([F(x, y) for x, y in q]), WHITE, "none", 0))
        c = tuple((tl[i] + br[i]) / 2 for i in range(3))
        parts.append((depth(c), els))
    # the point: a triangle under each face
    tip = (0.0, -HP, 0.0)
    for k in range(4):
        bl, br = corner(k, -1, 0), corner(k, 1, 0)
        e1 = tuple(br[i] - bl[i] for i in range(3)); e2 = tuple(tip[i] - bl[i] for i in range(3))
        n = norm(matmul(R, cross(e2, e1)))
        if dot(n, VIEW) <= 0.02: continue
        c = tuple((bl[i] + br[i] + tip[i]) / 3 for i in range(3))
        parts.append((depth(c) - 0.5, [ink(path(poly([P(bl), P(br), P(tip)]), shade(n, BLUE_DK, BLUE), INK, 2.2))]))
    # the top: a lighter square round the foot of the stem
    ntop = matmul(R, (0, 1, 0))
    if dot(ntop, VIEW) > 0.02:
        pts = [P(corner(k, -1, HB)) for k in range(4)]
        parts.append((depth((0, HB, 0)), [ink(path(poly(pts), SILVER, INK, 2.2))]))
    # the stem and the knob (on the axis, outside the body: drawn over it)
    a0, a1 = P((0, STEM[0], 0)), P((0, STEM[1], 0)); kn = P((0, KNOB[0], 0))
    stem = [path(f"M{a0[0]:.2f},{a0[1]:.2f} L{a1[0]:.2f},{a1[1]:.2f}", "none", INK, 2 * STEM[2] + 2.4),
            path(f"M{a0[0]:.2f},{a0[1]:.2f} L{a1[0]:.2f},{a1[1]:.2f}", "none", SILVER, 2 * STEM[2] - 0.6),
            ink(ellipse(kn[0], kn[1], KNOB[1], KNOB[1], SILVER, INK, 2.0), step=4.0),
            f'<circle cx="{kn[0] - 1.8:.2f}" cy="{kn[1] - 1.8:.2f}" r="1.5" fill="{WHITE}"/>']
    parts.append((depth((0, STEM[1], 0)) + 100, stem))
    # a glint of silver on the point's tip
    t = P(tip)
    parts.append((depth(tip) + 50, [ink(ellipse(t[0], t[1] - 2.2, 2.2, 2.2, SILVER, INK, 1.4), step=3.0)]))
    parts.sort(key=lambda p: p[0])
    out = []
    for _, els in parts: out += els
    return out

def whirl(origin):
    """Speed rings round the spinning body: the front halves of three flat ellipses, and a few streaks."""
    ox, oy = origin; g = []
    for y, rx, op in ((HP + 6, 23, 0.7), (HP + 18, 26, 0.85), (HP + 30, 24, 0.6)):
        cy = oy - y * math.cos(ELEV); ry = rx * math.sin(ELEV)
        g.append(ink(path(f"M{ox - rx:.1f},{cy:.1f} C{ox - rx:.1f},{cy + ry * 1.3:.1f} {ox + rx:.1f},{cy + ry * 1.3:.1f} {ox + rx:.1f},{cy:.1f}", "none", WHITE, 2.2, f'opacity="{op}"')))
    for dx, y, L in ((-30, HP + 12, 9), (30, HP + 24, 11), (-28, HP + 30, 7), (31, HP + 8, 8)):
        cy = oy - y * math.cos(ELEV); s = 1 if dx > 0 else -1
        g.append(path(f"M{ox + dx:.1f},{cy:.1f} L{ox + dx + s * L:.1f},{cy:.1f}", "none", WHITE, 2.0, 'opacity="0.75"'))
    return g

def lowest(R):
    """How far below the point (on screen) the lowest corner of the body falls, turned by R."""
    ys = []
    for k in range(4):
        for y in (0.0, HB):
            q = matmul(R, (lambda c: (c[0], c[1] + HP, c[2]))(corner(k, -1, y)))
            ys.append(-q[1] * math.cos(ELEV) + q[2] * math.sin(ELEV))
    return max(ys)

LAND_X = 31.5    # where the fallen body's centre lies, from the standing point (the director's topple lands it here)
BOX_W, BOX_H = 180, 104
TIP = (90.0, 100.0)
FRAMES = 16

def dreidel():
    g = []
    for i in range(FRAMES):
        g.append(f'<g class="df df{i}" opacity="{1 if i == 0 else 0}">')
        g += draw(rot_y(i * 360 / FRAMES), TIP)
        g.append('</g>')
    g.append('<g class="dwhirl" opacity="0">'); g += whirl(TIP); g.append('</g>')
    # fallen over: the axis level, the result face turned up toward us (a cartoon: lying on an edge, so the letter reads);
    # the body sits where the tipped-over body lands (the director tips the standing frames about the point)
    TILT = math.radians(38)
    m = (0.0, math.sin(TILT), math.cos(TILT))
    for side, sgn in (("R", 1), ("L", -1)):
        for k, name in enumerate(ORDER):
            R = frame_from(face_normal(k), (0.0, 1.0, 0.0), m, (float(sgn), 0.0, 0.0))
            # the body's centre where the tipped-over standing one's lands (the director tips it about its point), its
            # lowest corner on the floor line
            ox = TIP[0] + sgn * (LAND_X - (HP + HB / 2))
            origin = (ox, TIP[1] - lowest(R) + 1.0)
            g.append(f'<g class="dl dl-{side}-{name}" opacity="0">')
            g += draw(R, origin)
            g.append('</g>')
    svg("dreidel", BOX_W, BOX_H, g)

def badge():
    """The letter that came up, big on a blue disc with a silver rim."""
    g = []
    cx = cy = 30; r = 25
    g.append(ink(ellipse(cx, cy, r + 2.5, r + 2.5, SILVER, INK, LW), 0.5, 4.0))
    g.append(ink(ellipse(cx, cy, r - 1.5, r - 1.5, BLUE, INK, 1.6), 0.5, 4.0))
    g.append(path(f"M{cx - 15:.1f},{cy - 12:.1f} Q{cx - 10:.1f},{cy - 19:.1f} {cx - 1:.1f},{cy - 20:.1f}", "none", "#FFFFFF", 2.2, 'opacity="0.55"'))
    for name in ORDER:
        g.append(f'<g class="db db-{name}" opacity="0">')
        w = h = 26
        for q in stroke_quads(LETTERS[name], w, h, 4.4):
            g.append(path(poly([(cx - w / 2 + x, cy - h / 2 + y + 1) for x, y in q]), WHITE, "none", 0))
        g.append('</g>')
    svg("dreidelbadge", 60, 60, g)

def star_d(cx, cy, r):
    """A Star of David as two triangle outlines (one path, two subpaths)."""
    up = [(cx + r * math.sin(math.radians(a)), cy - r * math.cos(math.radians(a))) for a in (0, 120, 240)]
    dn = [(cx + r * math.sin(math.radians(a)), cy - r * math.cos(math.radians(a))) for a in (60, 180, 300)]
    return poly(up) + " " + poly(dn)

def gelt():
    """Chanukah gelt: a chocolate coin in gold foil, a Star of David pressed into it."""
    g = [ellipse(20, 20, 17, 17, GELT, INK, LW), ellipse(20, 20, 13.2, 13.2, "none", GELT2, 1.5),
         path(star_d(20, 20.6, 8.2), "none", GELT2, 1.7),
         path("M9,14 Q11,9 16,7.5", "none", "#FFF6D8", 2.0, 'opacity="0.9"')]
    svg("gelt", 40, 40, [ink(e, 0.5, 4.0) for e in g])

def coin_flat(cx, cy, r):
    """A piece of gelt lying flat, seen from a little above: its edge, its gold face and the star pressed into it."""
    ry = r * 0.42
    g = [ink(ellipse(cx, cy + 2.6, r, ry, GELT2, INK, 1.6), 0.4, 3.0),
         ink(ellipse(cx, cy, r, ry, GELT, INK, 1.6), 0.4, 3.0),
         ellipse(cx, cy, r * 0.76, ry * 0.76, "none", GELT2, 1.0)]
    up = [(cx + r * 0.46 * math.sin(math.radians(a)), cy - ry * 0.46 * math.cos(math.radians(a))) for a in (0, 120, 240)]
    dn = [(cx + r * 0.46 * math.sin(math.radians(a)), cy - ry * 0.46 * math.cos(math.radians(a))) for a in (60, 180, 300)]
    g.append(path(poly(up) + " " + poly(dn), "none", GELT2, 1.0))
    g.append(path(f"M{cx - r * 0.6:.1f},{cy - ry * 0.35:.1f} Q{cx - r * 0.3:.1f},{cy - ry * 0.8:.1f} {cx + r * 0.1:.1f},{cy - ry * 0.85:.1f}", "none", "#FFF6D8", 1.3, 'opacity="0.9"'))
    return g

def dreidelcard():
    """The item's own picture (the shop card, build-art.mjs): one dreidel standing on its point, leaning a little as if
    spinning, turned so gimel faces us with nun on its left face; gelt at its feet, a little stack and a single piece."""
    W, H = 120, 100
    tip = (60.0, 94.0)
    g = [f'<ellipse cx="{tip[0]:.1f}" cy="{tip[1] + 1:.1f}" rx="15" ry="3" fill="#000000" opacity="0.3"/>']
    g += coin_flat(20, 93, 10) + coin_flat(21, 88.5, 10) + coin_flat(99, 94, 9.5)
    g.append(f'<g transform="rotate(-6 {tip[0]:.1f} {tip[1]:.1f})">')
    g += draw(rot_y(-58), tip)
    g.append('</g>')
    svg("dreidelcard", W, H, g)

if __name__ == "__main__":
    dreidel(); badge(); gelt(); dreidelcard()
