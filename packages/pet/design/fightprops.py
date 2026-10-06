"""Fight Club's basement: the bar's cellar the pets fight in -> packages/pet/props/fight*.svg

The operator (2026-09-29): "change the fight arena to a dingy basement. like in fight club they were fighting in a
basement bar". Everything here is in the fight room's 600x460 world (x right, y down; the fighters' feet on y=400) and
runs past it on every side (x -60..660, y -30..490) so the camera can shake and zoom a little without an edge showing.

  fightback   everything behind the pets. The underside of the bar's floor for a ceiling (joists running at us, a big
              girder across, an old cast-iron pipe with a red valve wheel, a copper pipe, a cable loop, a junction box);
              the back wall in old red-brown brick, sooted toward the ceiling, water-stained under the pipe's leaky
              joints, salt-bloomed along the floor, with a patch of flaking whitewash, a boarded-up high window
              (#windowlight: the cold night through the gaps) and a rusty fuse box; on the left the bar's storage
              (shelving with bottles, a dead neon beer sign #neon, a chalkboard of tallies, two kegs, beer crates); on the
              right the stairs down from the bar's door (#doorlight: the light round the ajar door and its spill); the
              stained concrete floor in one-point perspective with a drain, a beer puddle, bottle caps, sawdust and a
              hand-chalked ring.
  fightlamp   the one lamp over the ring, on its own because it swings: the flex from the ceiling, a dented green
              enamel shade and the bare bulb (#bulb; #shadein is the shade's lit inside).
  fightfront  the foreground framing drawn OVER the pets, only at the very edges: a rusty lally column with an
              extension cord on the left, the rim of a crate of empties at the bottom left, an old timber post and a
              galvanised mop bucket on the right. It never covers x 40..560 between y 100 and 440 (where they fight).

Drawn evenly in a dim warm light: the pool of light under the bulb and the dark round the edges are the page's (CSS
over the art), so none of it is baked in. Flat fills and wobbly ink like every other room; the ink is a very dark
warm brown and the colours mid-dark and dingy, never black, so the white cat, the green frok and the orange log stand
out. One-point perspective onto VP (300, 150): P(x, y, s) takes a point on the back wall's plane (s = 1) to the
screen at depth s (s > 1 is nearer; the floor at depth s is y = 150 + 180 s). No text or letters anywhere.
Kept apart from props.py. Run: python3 packages/pet/design/fightprops.py
"""
import os, re, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_closed, smooth_open, poly
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

# ---------------------------------------------------------------- palette
INK      = "#150D09"   # the room's ink: a very dark warm brown
BRICK    = ["#6A3C2D", "#70412F", "#653829", "#734432", "#61372A", "#6D3F31", "#76482F", "#683D33"]
BRICK_MID = "#6A3D2E"  # the calm middle of the wall pulls toward this
MORTAR   = "#433730"
SOOT     = "#1C130E"
PLASTER  = "#8C8575"   # old whitewash, grimy
PLASTER_L = "#9C9585"
PLASTER_D = "#6C6456"
WOOD     = "#5A3F2D"
WOOD_L   = "#73523A"
WOOD_LL  = "#8A6547"
WOOD_D   = "#3D2A1E"
WOOD_DD  = "#2A1C14"
CONC     = "#57524B"   # the floor
CONC_D   = "#403C37"
CONC_L   = "#6A645B"
IRON     = "#302C29"
IRON_L   = "#4B4540"
RUST     = "#7A4428"
RUST_L   = "#9A5A33"
STEEL    = "#7D8184"
STEEL_D  = "#5B5F62"
STEEL_L  = "#AEB2B3"
COPPER   = "#92593A"
COPPER_L = "#BA7E52"
VERDI    = "#5C8574"
GREEN_EN = "#3E694E"   # enamel
PANEL    = "#56604F"   # the fuse box's paint
NIGHT    = "#5F7FAE"   # the window's gaps
NIGHT_L  = "#8EA9D2"
DOOR_L   = "#FFD891"   # the bar's light through the door
CHALK    = "#E6DFCD"
SLATE    = "#262E28"
B_GREEN  = "#2F5A34"; B_GREEN_L = "#5E8C5C"
B_AMBER  = "#744117"; B_AMBER_L = "#B57A3C"
B_CLEAR  = "#93A49C"; B_CLEAR_L = "#D5E0DA"
B_BROWN  = "#4A2A14"
CRATE_R  = "#7B302A"; CRATE_R_D = "#5A221E"
CRATE_G  = "#2E4A39"; CRATE_G_D = "#20362A"
CRATE_W  = "#7A5A3B"; CRATE_W_D = "#58402A"; CRATE_W_L = "#8E6C4A"

VP = (300.0, 150.0)
FLOOR = 330.0        # the back wall meets the floor
WALL_TOP = 46.0      # the brick's top (the sill plate over it)

def P(x, y, s=1.0):
    """A point on the back wall's plane (s = 1) moved to depth s (s > 1 comes toward us), on screen."""
    return (VP[0] + (x - VP[0]) * s, VP[1] + (y - VP[1]) * s)

def PS(pts, s):
    return [P(x, y, s) for x, y in pts]

def floor_s(Y):
    """The depth whose floor is on screen row Y."""
    return (Y - VP[1]) / (FLOOR - VP[1])

# ---------------------------------------------------------------- helpers
def path(d, fill="none", stroke=None, w=1.0, extra=""):
    """cat.py's path, lean: the root group carries round joins and caps; no stroke writes none."""
    stroke = INK if stroke is None else stroke
    a = f'<path d="{d}" fill="{fill}"'
    if stroke != "none" and w: a += f' stroke="{stroke}" stroke-width="{w:g}"'
    return a + (f" {extra}" if extra else "") + "/>"

def ellipse(cx, cy, rx, ry, fill, stroke=None, w=1.0, extra=""):
    stroke = INK if stroke is None else stroke
    a = f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}"'
    if stroke != "none" and w: a += f' stroke="{stroke}" stroke-width="{w:g}"'
    return a + (f" {extra}" if extra else "") + "/>"

def line(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

def rect_d(x0, y0, x1, y1):
    return f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y0:.1f} L{x1:.1f},{y1:.1f} L{x0:.1f},{y1:.1f} Z"

def box_d(x0, y0, x1, y1):
    """A rectangle in h/v shorthand (never baked: wobble.py reads only M L C Q Z)."""
    return f"M{x0:.1f},{y0:.1f}h{x1 - x0:.1f}v{y1 - y0:.1f}h{x0 - x1:.1f}z"

def ell_d(cx, cy, rx, ry, rot=0.0, n=16):
    """An ellipse as a closed smooth path (bakes; a rotated one too)."""
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        px, py = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + px * c - py * s, cy + px * s + py * c))
    return smooth_closed(pts, 0.5)

def _mix(hex_, t, to=(255, 255, 255)):
    if isinstance(to, str): to = (int(to[1:3], 16), int(to[3:5], 16), int(to[5:7], 16))
    r, g, b = int(hex_[1:3], 16), int(hex_[3:5], 16), int(hex_[5:7], 16)
    r, g, b = (round(c + (tc - c) * t) for c, tc in zip((r, g, b), to))
    return f"#{r:02X}{g:02X}{b:02X}"

def _quant(hex_, q=5):
    r, g, b = (min(255, round(int(hex_[i:i + 2], 16) / q) * q) for i in (1, 3, 5))
    return f"#{r:02X}{g:02X}{b:02X}"

def _round(body, decimals):
    def rnd(m):
        v = f"{float(m.group(0)):.{decimals}f}"
        return v.rstrip("0").rstrip(".") if decimals > 0 else v
    return re.sub(r"-?\d+\.\d+", rnd, body)

class Batch:
    """Many small shapes of one style as ONE path (subpaths), like kotelprops."""
    def __init__(self): self.d = {}
    def add(self, key, d): self.d.setdefault(key, []).append(d)
    def paths(self, style):
        return [f'<path d="{" ".join(ds)}" {style(k)}/>' for k, ds in self.d.items()]

def _blob(cx, cy, rx, ry, rng, n=7, smooth=True):
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.25, 0.25); r = rng.uniform(0.72, 1.12)
        pts.append((cx + rx * r * math.cos(a), cy + ry * r * math.sin(a)))
    return smooth_closed(pts, 0.5) if smooth else poly(pts)

def _jag(pts, rng, amt=0.6):
    return [(x + rng.uniform(-amt, amt), y + rng.uniform(-amt, amt)) for x, y in pts]

def tube(pts, w, fill, ink=None, lw=1.2, t=0.5):
    """A pipe or cord: ink stroke under a colour stroke."""
    ink = INK if ink is None else ink
    d = smooth_open(pts, t) if len(pts) > 2 else line(pts)
    return [path(d, "none", ink, w + 2 * lw), path(d, "none", fill, w)]

FLAT = "\x00"
def flat(el):
    """Leave this element unbaked (small inked detail whose wobble would cost more than it shows)."""
    return FLAT + el

def write(name, vb, parts, decimals=1):
    """parts: [(body_list, amp or None[, step])]; None = not baked. vb = (x, y, w, h)."""
    out = []
    for part in parts:
        body, amp = part[0], part[1]; step = part[2] if len(part) > 2 else 16.0
        dec = part[3] if len(part) > 3 else decimals
        if amp:
            # only the ink wobbles: a shape with no stroke (a fill, a stain, a shine) stays as drawn, which keeps the
            # file small; flat() marks an inked one to leave alone too
            body = [el[1:] if el.startswith(FLAT) else (bake(el, amp=amp, freq=0.09, step=step) if 'stroke="#' in el else el) for el in body]
        else:
            body = [el[1:] if el.startswith(FLAT) else el for el in body]
        out.append(_round("\n".join(body), dec))
    body = "\n".join(out)
    x, y, w, h = vb
    src = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:g} {y:g} {w:g} {h:g}" width="{w:g}" height="{h:g}">\n'
           f'<g id="{name}" stroke-linejoin="round" stroke-linecap="round">\n{body}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    import xml.etree.ElementTree as ET
    ET.fromstring(src)                                                    # an <img> refuses the whole file on a bad attribute
    print("wrote", name, f"{len(src) / 1024:.1f} KB")

# ================================================================ the back wall
CALM = (170.0, 430.0, 120.0, 330.0)      # behind the fighters and the crowd: low contrast, nothing on it

def _calm(x, y):
    """1 inside the calm middle of the wall, fading to 0 over 40 units outside it."""
    x0, x1, y0, y1 = CALM
    dx = max(x0 - x, 0, x - x1); dy = max(y0 - y, 0, y - y1)
    return max(0.0, 1 - math.hypot(dx, dy) / 40)

WASH = (392.0, 92.0, 66.0, 42.0)        # the old limewash still on the brick up by the lamp: centre and radii
def _wash(x, y):
    """How far inside the limewash patch (x, y) is: under 1 is inside, its edge wavy."""
    cx, cy, rx, ry = WASH
    a = math.atan2((y - cy) / ry, (x - cx) / rx)
    r = 1 + 0.12 * math.sin(2 * a + 0.6) + 0.08 * math.sin(5 * a + 2) + 0.05 * math.sin(9 * a + 1)
    return math.hypot((x - cx) / rx, (y - cy) / ry) / r

def brick_wall(rng):
    fills = Batch(); shadow, lit = [], []; wash = Batch()
    courses = []; y = FLOOR
    while y > WALL_TOP + 0.5:
        h = rng.uniform(9.3, 10.1); courses.append((max(WALL_TOP, y - h), y)); y -= h
    for k, (y0, y1) in enumerate(courses):
        x = -64 - rng.uniform(0, 26) - (13 if k % 2 else 0)
        while x < 664:
            L = rng.uniform(24, 30)
            cx, cy = x + L / 2, (y0 + y1) / 2
            base = rng.choice(BRICK); r = rng.random(); c = _calm(cx, cy)
            if r < 0.13: base = _mix(base, rng.uniform(0.2, 0.32) * (1 - c * 0.8), "#2A1810")    # a burnt one
            elif r > 0.92: base = _mix(base, rng.uniform(0.1, 0.16) * (1 - c * 0.8), "#B08A70")  # a pale one
            base = _mix(base, 0.55 * c, BRICK_MID)
            soot = max(0.0, min(1.0, (175 - cy) / 129)) ** 1.5 * 0.62
            base = _mix(base, soot, SOOT)
            damp = max(0.0, min(1.0, (cy - 292) / 38)) * 0.2
            base = _mix(base, damp, "#2A1C16")
            bx0, bw = x + 0.8, L - 1.6
            by0 = y0 + 0.8 + rng.uniform(-0.3, 0.3); bh = y1 - 0.7 - by0 + rng.uniform(-0.3, 0.3)
            by0r = round(by0); bhr = max(1, round(by0 + bh) - by0r)              # whole units: the mortar still never closes up
            fills.add(_quant(base), f"M{bx0:.0f},{by0r}h{bw:.0f}v{bhr}h{-bw:.0f}z")
            t = _wash(cx, cy)
            if t < 1.08:
                # the limewash on this brick: whole in the middle (now and then flaked right off), in scraps at the edge
                if t < 0.78 and rng.random() < 0.9:
                    wx0, ww = bx0, bw
                elif rng.random() < 0.65:
                    f = rng.uniform(0.3, 0.8); ww = bw * f
                    wx0 = bx0 if (cx < WASH[0]) == (rng.random() < 0.3) else bx0 + bw - ww
                else:
                    ww = 0
                if ww > 2:
                    tone = rng.choice(("#938C79", "#9C9582", "#88816F", "#8F8876"))
                    tone = _mix(tone, max(0.0, min(1.0, (120 - cy) / 70)) * 0.35, SOOT)
                    wash.add(_quant(tone, 8), f"M{wx0:.0f},{by0r}h{ww:.0f}v{bhr}h{-ww:.0f}z")
            x += L
        # the bed joint under the course: a line of shadow under the bricks, and their worn top edge a shade lighter
        pts = [(-64 + i * 91, y1 - 0.5 + rng.uniform(-0.3, 0.3)) for i in range(9)]
        shadow.append(line(pts))
        pts = [(-64 + i * 91, y0 + 1.3 + rng.uniform(-0.25, 0.25)) for i in range(9)]
        lit.append(line(pts))
    out = [path(rect_d(-64, WALL_TOP - 1, 664, FLOOR + 1), MORTAR, "none")]
    out += fills.paths(lambda k: f'fill="{k}"')
    # the wash also thinly over the mortar, then on the bricks
    cx, cy, rx, ry = WASH
    edge = []
    for k in range(40):
        a = 2 * math.pi * k / 40
        r = (1 + 0.12 * math.sin(2 * a + 0.6) + 0.08 * math.sin(5 * a + 2) + 0.05 * math.sin(9 * a + 1)) * 0.9
        edge.append((cx + rx * r * math.cos(a), max(WALL_TOP, cy + ry * r * math.sin(a))))
    out.append(path(smooth_closed(edge, 0.5), "#9A937F", "none", 0, 'opacity="0.3"'))
    out += wash.paths(lambda k: f'fill="{k}" opacity="0.8"')
    out.append(path(" ".join(shadow), "none", "#150D09", 1.2, 'opacity="0.55"'))
    return out, courses

def wall_wear(rng, courses):
    """Soot, water, damp and salt, missing bricks."""
    out = []
    # soot: soft dark clouds along the top of the wall, heaviest over the pipe
    for x in range(-40, 680, 80):
        out.append(path(_blob(x + rng.uniform(-10, 10), 58 + rng.uniform(-4, 8), rng.uniform(50, 64), rng.uniform(13, 20), rng), SOOT, "none", 0, 'opacity="0.22"'))
    # rising damp: a darker band along the floor with a wavy top, and the salt bloom on its tide line
    pts = [(-64, FLOOR + 1)] + [(x, 300 + 7 * math.sin(x * 0.045) + rng.uniform(-3, 3)) for x in range(-64, 672, 28)] + [(664, FLOOR + 1)]
    out.append(path(smooth_closed(pts, 0.4), "#241712", "none", 0, 'opacity="0.28"'))
    salt = Batch()
    for x0 in (-40, 30, 105, 150, 250, 330, 440, 520, 610):
        c = _calm(x0, 310)
        n = int(rng.uniform(10, 18) * (1 - 0.7 * c))
        op = 0.16 * (1 - 0.65 * c)
        out.append(path(_blob(x0, 306 + rng.uniform(-4, 4), rng.uniform(14, 26), rng.uniform(5, 9), rng, 8), "#D9D2C0", "none", 0, f'opacity="{op:.2f}"'))
        for _ in range(n):
            salt.add("s", f"M{x0 + rng.uniform(-24, 24):.1f},{rng.uniform(296, 326):.1f}h.1")
    out += salt.paths(lambda k: 'fill="none" stroke="#E4DDCB" stroke-width="1.5" opacity="0.4"')
    # water: pale streaks and dark damp running down the wall from the pipe's leaky joints
    for x, L, op in ((68, 70, 1.0), (345, 150, 0.55), (470, 130, 1.0), (-14, 110, 1.0), (200, 60, 0.7), (590, 150, 1.0), (140, 40, 0.8)):
        for dx, wdt, col, o in ((0, 8, "#241812", 0.32), (2.5, 3, "#B5A690", 0.2)):
            pts = [(x + dx, 62), (x + dx + rng.uniform(-2, 2), 62 + L * 0.35), (x + dx + rng.uniform(-3, 3), 62 + L * 0.7), (x + dx + rng.uniform(-2, 2), 62 + L)]
            out.append(path(smooth_open(pts, 0.5), "none", col, wdt, f'opacity="{o * op:.2f}"'))
    # damp: big soft blotches with a dried tide line round their edge, heaviest in the corners and under the window,
    # only a whisper of one behind the fighters
    for (x, y, rx, ry, op) in ((-24, 236, 62, 58, 0.3), (132, 212, 34, 56, 0.24), (612, 250, 56, 64, 0.3), (512, 96, 34, 26, 0.22),
                               (60, 110, 40, 22, 0.2), (300, 286, 110, 34, 0.08), (446, 196, 30, 44, 0.16)):
        b = _blob(x, y, rx, ry, rng, 9)
        out.append(path(b, "#1E1410", "none", 0, f'opacity="{op}"'))
        if op > 0.15: out.append(path(b, "none", "#B7A58A", 1.1, f'opacity="{op * 0.45:.2f}"'))
    # grime running down from the window's sill and from the fuse box
    gr = [smooth_open([(x, 110), (x + rng.uniform(-1, 1), 130), (x + rng.uniform(-1.5, 1.5), 150 + rng.uniform(0, 30))], 0.5) for x in (152, 160, 171, 186, 200)]
    out.append(path(" ".join(gr), "none", "#1E1410", 2.4, 'opacity="0.3"'))
    # missing and broken bricks (away from the middle)
    hole = Batch()
    for (xh, k) in ((-30, 21), (132, 15), (455, 12), (566, 19), (22, 3), (612, 7)):
        y0, y1 = courses[k]
        hole.add("h", rect_d(xh, y0 + 0.8, xh + 25, y1 - 0.8))
        hole.add("s", f"M{xh + 1.5:.1f},{y0 + 2.4:.1f} L{xh + 23.5:.1f},{y0 + 2.4:.1f}")
    out += hole.paths(lambda k: f'fill="#1E140F" stroke="{INK}" stroke-width="1.1"' if k == "h" else 'fill="none" stroke="#3A2A20" stroke-width="2.2" opacity="0.9"')
    chip = Batch()
    for _ in range(26):                                               # chipped corners and edges
        x = rng.uniform(-50, 650); y = rng.uniform(60, 320)
        if _calm(x, y) > 0.2: continue
        chip.add("c", poly([(x, y), (x + rng.uniform(3, 6), y + rng.uniform(-0.5, 0.5)), (x + rng.uniform(0, 2), y + rng.uniform(2.5, 4.5))]))
    out += chip.paths(lambda k: f'fill="{MORTAR}" opacity="0.9"')
    return out

def plaster_patch(rng):
    """Grime on the limewash (laid brick by brick in brick_wall): soot along its top, a tide mark and streaks under
    the weeping hub, a patch of damp, and flakes curling off its edge."""
    cx, cy, rx, ry = WASH
    out = [path(_blob(cx - 2, 60, 58, 12, rng), SOOT, "none", 0, 'opacity="0.3"')]
    out.append(path(_blob(348, 104, 11, 28, rng), "#4E3F2E", "none", 0, 'opacity="0.35"'))
    out.append(path(_blob(438, 116, 14, 11, rng), "#3A3024", "none", 0, 'opacity="0.25"'))
    streaks = [smooth_open([(x, 64), (x + rng.uniform(-1, 1), 90), (x + rng.uniform(-1.5, 1.5), 118)], 0.5) for x in (341, 350, 356)]
    out.append(path(" ".join(streaks), "none", "#4A3A2A", 1.6, 'opacity="0.3"'))
    fl = Batch()
    for _ in range(26):
        a = rng.uniform(0, 2 * math.pi)
        r = (1 + 0.12 * math.sin(2 * a + 0.6) + 0.08 * math.sin(5 * a + 2) + 0.05 * math.sin(9 * a + 1)) * rng.uniform(0.85, 1.12)
        x, y = cx + rx * r * math.cos(a), cy + ry * r * math.sin(a)
        if y < WALL_TOP + 2: continue
        fl.add("f", poly([(x, y), (x + rng.uniform(-3, 3), y + rng.uniform(1.5, 3.5)), (x + rng.uniform(1.5, 3.5), y + rng.uniform(-1, 1.5))]))
    out += fl.paths(lambda k: f'fill="{PLASTER_L}" stroke="#3A3128" stroke-width="0.5" opacity="0.85"')
    return out

def window(rng):
    """A small high window, boarded over; the night shows cold through the gaps (#windowlight)."""
    x0, x1, y0, y1 = 150.0, 206.0, 66.0, 102.0
    out = []
    # the recess: its left and top inner faces (the rest hides behind the wall)
    d = 0.93
    out.append(path(poly([(x0, y0), P(x0, y0, d), P(x0, y1, d), (x0, y1)]), "#2C2019", "none"))
    out.append(path(poly([(x0, y0), (x1, y0), P(x1, y0, d), P(x0, y0, d)]), "#241A14", "none"))
    gx0, gy0 = P(x0, y0, d); gx1, gy1 = P(x1, y1, d)
    glow = [path(rect_d(gx0, gy0, x1, y1), NIGHT, "none")]
    glow.append(path(rect_d(gx0, gy0 + 3, x1, gy0 + 10), NIGHT_L, "none", 0, 'opacity="0.55"'))
    glow.append(path(f"M{gx0 + 8:.1f},{y1 - 4:.1f} L{x1 - 6:.1f},{gy0 + 6:.1f}", "none", "#C2D4EC", 1.2, 'opacity="0.45"'))   # a streak on the glass
    # faint rays falling from it into the room
    for (a, b, c2, w) in (((160, 82), (172, 80), (226, 200), 22), ((184, 90), (196, 88), (250, 190), 20)):
        glow.append(path(poly([a, b, c2, (c2[0] - w, c2[1] + 6)]), NIGHT_L, "none", 0, 'opacity="0.035"'))
        glow.append(path(poly([(a[0] + 3, a[1]), (b[0] - 3, b[1]), (c2[0] - w * 0.3, c2[1] - 8), (c2[0] - w * 0.7, c2[1] - 6)]), NIGHT_L, "none", 0, 'opacity="0.04"'))
    out.append('<g id="windowlight">' + "".join(glow) + "</g>")
    # the boards: nailed across, with gaps
    boards = [[(146, 67), (210, 69), (210, 78), (146, 77)], [(146, 88), (210, 84), (210, 93), (146, 97)], [(152, 99), (158, 104), (206, 72), (199, 66)]]
    for b in boards:
        out.append(path(poly(b), "#5E4533", INK, 1.4))
    grain = [line([(150, 72), (178, 72.8), (206, 73.5)]), line([(150, 92.5), (180, 90.5), (206, 88)]), line([(165, 96), (196, 75)])]
    out.append(path(" ".join(grain), "none", "#3F2D20", 0.8, 'opacity="0.8"'))
    nails = Batch()
    for (nx, ny) in ((149, 72), (207, 73.5), (149, 92.5), (207, 88.5), (157, 100.5), (201, 69.5)):
        nails.add("n", f"M{nx:.1f},{ny:.1f} L{nx + 0.1:.1f},{ny:.1f}")
    out += nails.paths(lambda k: 'fill="none" stroke="#1A120D" stroke-width="2.2"')
    # the frame round the opening, and the concrete sill under it
    out.append(path(rect_d(x0, y0, x1, y1), "none", "#3B2A1E", 3.2))
    out.append(path(rect_d(x0 - 1.6, y0 - 1.6, x1 + 1.6, y1 + 1.6), "none", INK, 1.2))
    out.append(path(poly([(x0 - 6, y1 + 1.6), (x1 + 6, y1 + 1.6), (x1 + 7, y1 + 7), (x0 - 7, y1 + 7)]), "#6A645B", INK, 1.3))
    out.append(path(f"M{x0 - 5:.1f},{y1 + 3.2:.1f} L{x1 + 5:.1f},{y1 + 3.2:.1f}", "none", "#8A8478", 1.0, 'opacity="0.8"'))
    return out

def fusebox(rng):
    """A rusty electrical panel on the wall, conduit running up into the ceiling."""
    x0, x1, y0, y1 = 216.0, 254.0, 72.0, 116.0
    out = []
    out += tube([(236, y0 - 1), (236, 40)], 3.4, "#6A6E6B", lw=1.0)
    out += tube([(246, y0 - 1), (246, 60), (258, 52), (272, 52), (272, 40)], 2.6, "#6A6E6B", lw=0.9)
    out += tube([(222, y1 + 1), (222, 124), (210, 128), (204, 128)], 2.4, "#1E1A18", lw=0.8)       # a cable out of the bottom, into the wall
    out.append(path(poly([(x1, y0), (x1 + 3.2, y0 + 1.2), (x1 + 3.2, y1 - 1.2), (x1, y1)]), "#3A4036", INK, 1.2))   # its side
    out.append(path(rect_d(x0, y0, x1, y1), PANEL, INK, 1.6))
    out.append(path(rect_d(x0 + 3, y0 + 3, x1 - 3, y1 - 3), "none", "#3D4538", 1.1))                  # the door
    out.append(path(poly([(x0 + 3, y1 - 3), (x0 + 3, y0 + 3), (x1 - 3, y0 + 3)]), "none", "#7C8674", 0.9, 'opacity="0.8"'))
    out.append(path(rect_d(x1 - 7.5, (y0 + y1) / 2 - 4, x1 - 5, (y0 + y1) / 2 + 4), "#2A2E28", INK, 0.8))  # the latch
    # rust: streaks from the bottom corners and the hinges, a bloom along the bottom
    out.append(path(_blob((x0 + x1) / 2, y1 - 5, 17, 4.5, rng), RUST, "none", 0, 'opacity="0.75"'))
    for x in (x0 + 5, x0 + 14, x1 - 9):
        out.append(path(f"M{x:.1f},{y1 - 6:.1f} C{x + 0.5:.1f},{y1 + 4:.1f} {x - 0.5:.1f},{y1 + 12:.1f} {x + 0.4:.1f},{y1 + 22:.1f}", "none", RUST, 1.8, 'opacity="0.5"'))
    out.append(path(_blob(x0 + 6, y0 + 8, 4, 3, rng), RUST_L, "none", 0, 'opacity="0.7"'))
    # a warning triangle with a bolt in it (a symbol, no letters)
    tx, ty = (x0 + x1) / 2 - 2, y0 + 16
    out.append(path(poly([(tx, ty - 7), (tx + 7.5, ty + 5.5), (tx - 7.5, ty + 5.5)]), "#C9A43A", INK, 0.9))
    out.append(path(poly([(tx + 1.2, ty - 3.5), (tx - 2.4, ty + 1), (tx, ty + 1), (tx - 1.4, ty + 4.2), (tx + 2.6, ty - 0.6), (tx + 0.2, ty - 0.6)]), "#1A140F", "none"))
    return out

def neon_sign(rng):
    """A dead neon on a rusty backing: a beer mug with its head of foam and a few bubbles. The glass is #neon."""
    ox, oy = 30.0, 76.0        # top-left of the backing
    out = []
    # the backing and its transformer box, a cable down to the shelving
    out.append(path(rect_d(ox, oy, ox + 66, oy + 66), "#231B16", INK, 1.4))
    out.append(path(rect_d(ox + 3, oy + 3, ox + 63, oy + 63), "none", "#3A2E26", 1.0))
    out.append(path(rect_d(ox + 18, oy + 66, ox + 48, oy + 74), "#3A3632", INK, 1.2))
    out += tube([(ox + 44, oy + 74), (ox + 46, oy + 86), (ox + 52, oy + 94)], 1.8, "#141110", lw=0.6)
    out.append(path(_blob(ox + 60, oy + 58, 7, 5, rng), RUST, "none", 0, 'opacity="0.7"'))
    out.append(path(_blob(ox + 10, oy + 8, 6, 4, rng), RUST, "none", 0, 'opacity="0.6"'))
    # the glass: the mug, its handle, the foam over the rim, three bubbles
    mug = smooth_open([(ox + 18, oy + 26), (ox + 19, oy + 42), (ox + 21, oy + 56), (ox + 43, oy + 56), (ox + 45, oy + 42), (ox + 46, oy + 26)], 0.25)
    handle = smooth_open([(ox + 46, oy + 31), (ox + 55, oy + 31), (ox + 57, oy + 40), (ox + 53, oy + 48), (ox + 45, oy + 48)], 0.5)
    foam = smooth_open([(ox + 15, oy + 27), (ox + 13, oy + 20), (ox + 19, oy + 14), (ox + 25, oy + 15), (ox + 30, oy + 9), (ox + 38, oy + 11), (ox + 43, oy + 15), (ox + 50, oy + 17), (ox + 49, oy + 26)], 0.5)
    bubbles = " ".join(ell_d(bx, by, r, r, 0, 8) for bx, by, r in ((ox + 28, oy + 45, 2.4), (ox + 35, oy + 37, 1.9), (ox + 30, oy + 32, 1.5)))
    clips = Batch()
    for cx_, cy_ in ((ox + 19, oy + 40), (ox + 45, oy + 40), (ox + 32, oy + 56), (ox + 30, oy + 10)):
        clips.add("c", rect_d(cx_ - 1.6, cy_ - 1.6, cx_ + 1.6, cy_ + 1.6))
    g = []
    for d, glass, core in ((mug, "#A78352", "#D8BF8A"), (handle, "#A78352", "#D8BF8A"), (bubbles, "#A78352", "#D8BF8A"), (foam, "#B9B2A3", "#E5E0D4")):
        g.append(path(d, "none", "#0E0A08", 5.2))
        g.append(path(d, "none", glass, 3.4, 'class="tube"'))
        g.append(path(d, "none", core, 1.1, 'class="core" opacity="0.8"'))
    g += clips.paths(lambda k: f'fill="#3C3A38" stroke="{INK}" stroke-width="0.6"')
    out.append('<g id="neon">' + "".join(g) + "</g>")
    return out

def chalkboard(rng):
    """A slate of tallies on a nail: the fights so far (no words: scribbles, strokes, a circle, crossings-out)."""
    x0, x1, y0, y1 = 106.0, 154.0, 118.0, 162.0
    out = [path(f"M{x0 + 6:.1f},{y0:.1f} L130,108 L{x1 - 6:.1f},{y0:.1f}", "none", "#8C7D62", 0.9)]
    out.append(path(rect_d(x0, y0, x1, y1), SLATE, INK, 1.6))
    out.append(path(rect_d(x0 + 3, y0 + 3, x1 - 3, y1 - 3), "none", "#6B4A33", 3.2))
    out.append(path(rect_d(x0 + 4.6, y0 + 4.6, x1 - 4.6, y1 - 4.6), "none", INK, 0.7))
    out.append('<circle cx="130" cy="108" r="1.2" fill="#1A120D"/>')
    ch = []
    # rubbed-out chalk haze
    out.append(path(_blob(126, 146, 14, 7, rng), "#C8C2B4", "none", 0, 'opacity="0.12"'))
    # tallies: fours and a stroke through
    for gx, gy in ((112, 126), (126, 126), (112, 142), (140, 126)):
        for i in range(4):
            x = gx + i * 2.4
            ch.append(line([(x, gy + rng.uniform(-0.3, 0.3)), (x + rng.uniform(-0.4, 0.4), gy + 8)]))
        if (gx, gy) != (140, 126): ch.append(line([(gx - 1.5, gy + 6.5), (gx + 9.5, gy + 1.2)]))
    # scribbles: two wavy lines, a circled mark, a crossing-out
    for yy in (149.5, 154.5):
        ch.append(smooth_open([(112 + i * 3.8, yy + (1.1 if i % 2 else -1.1) + rng.uniform(-0.4, 0.4)) for i in range(7)], 0.5))
    ch.append(ell_d(142, 147, 5, 3.6, -10, 10))
    ch.append(line([(139, 145), (145, 149)]))
    ch.append(line([(126, 141), (136, 143.5)]) + " " + line([(126, 144), (135, 141)]))
    out.append(path(" ".join(ch), "none", CHALK, 1.0, 'opacity="0.78"'))
    return out

def door(rng):
    """The door at the top of the stairs, ajar: the bar's light round its edge and spilling onto the landing (#doorlight)."""
    x0, x1, y0, y1 = 550.0, 600.0, 56.0, 160.0
    out = []
    # the casing
    out.append(path(poly([(x0 - 7, y1), (x0 - 7, y0 - 7), (x1 + 7, y0 - 7), (x1 + 7, y1), (x1, y1), (x1, y0), (x0, y0), (x0, y1)]), WOOD, INK, 1.6))
    out.append(path(line([(x0 - 4, y1), (x0 - 4, y0 - 4), (x1 + 4, y0 - 4), (x1 + 4, y1)]), "none", WOOD_L, 1.0, 'opacity="0.8"'))
    # the light through the gap: the opening's back is the bar's corridor, bright and warm
    fr = 1.05; fx = 556.0
    lx0, ly0 = P(fx, y0, fr); lx1, ly1 = P(fx, y1, fr)
    light = [path(poly([(x0, y0), (lx0, ly0), (lx1, ly1), (x0, y1)]), DOOR_L, "none")]
    light.append(path(poly([(x0 + 2, y0 + 2), (x0 + 8, y0 + 2), (x0 + 8, y1), (x0 + 2, y1)]), "#FFF3D2", "none", 0, 'opacity="0.8"'))
    # its spill: down the landing, over the top steps, and a thin line along the leaf's top
    light.append(path(poly([P(x0, 160, 1.0), P(lx1 + 2, 160, 1.0), P(560, 160, 1.13), P(520, 181.25, 1.13), P(508, 181.25, 1.0)]), DOOR_L, "none", 0, 'opacity="0.35"'))
    light.append(path(poly([(x0, 160), (x0 - 8, 181), (x0 - 26, 181), (x0 - 6, 160)]), DOOR_L, "none", 0, 'opacity="0.22"'))
    light.append(path(f"M{lx0:.1f},{ly0 - 1.2:.1f} L{x1:.1f},{y0 - 0.6:.1f}", "none", DOOR_L, 1.6, 'opacity="0.9"'))
    light.append(path(poly([(x0 - 7, y0 - 7), (x0 - 1, y0), (x0 - 1, y1), (x0 - 7, y1)]), DOOR_L, "none", 0, 'opacity="0.18"'))   # on the casing's edge
    out.append('<g id="doorlight">' + "".join(light) + "</g>")
    # the leaf, swung a little toward us on hinges at its right edge; old paint, a knob
    leaf = [(lx0, ly0), (x1, y0), (x1, y1), (lx1, ly1)]
    out.append(path(poly(leaf), "#4A3526", INK, 1.5))
    for u in (0.12, 0.52):                                                # two recessed panels
        a = (lx0 + (x1 - lx0) * 0.18, ly0 + (y1 - y0) * u); b = (lx0 + (x1 - lx0) * 0.82, y0 + (y1 - y0) * u)
        c = (b[0], y0 + (y1 - y0) * (u + 0.36)); dd = (a[0], ly0 + (ly1 - ly0) * (u + 0.36))
        out.append(path(poly([a, b, c, dd]), "#3F2D20", INK, 0.9))
    out.append(path(f"M{lx0 + 1.5:.1f},{ly0 + 2:.1f} L{lx1 + 1.5:.1f},{ly1 - 2:.1f}", "none", "#FFE3AA", 1.4, 'opacity="0.6"'))   # its lit edge
    out.append(ellipse(lx0 + 4.5, (ly0 + ly1) / 2 + 4, 2.2, 2.4, "#B08A45", INK, 0.8))
    return out

# ================================================================ the ceiling
JOIST_Y0, JOIST_Y1 = 26.0, 40.0          # the joists' tops (the floor above) and bottoms, as heights on the wall's plane
def ceiling(rng):
    out = []
    out.append(path(rect_d(-64, -34, 664, WALL_TOP + 1), "#2E211A", "none"))              # the boards of the floor above
    seams = []
    for s in (1.03, 1.07, 1.12, 1.18, 1.25, 1.33, 1.42, 1.52, 1.64):
        y = VP[1] + (JOIST_Y0 - VP[1]) * s
        seams.append(line([(-64, y + rng.uniform(-0.4, 0.4)), (300, y + rng.uniform(-0.4, 0.4)), (664, y + rng.uniform(-0.4, 0.4))]))
    out.append(flat(path(" ".join(seams), "none", "#1A110C", 1.3, 'opacity="0.9"')))
    slits = []
    for (s_, xa, xb) in ((1.07, 60, 104), (1.12, 226, 262), (1.07, 318, 356), (1.12, 446, 492), (1.03, 520, 548), (1.03, 160, 196), (1.12, 118, 140), (1.07, 404, 424)):
        y = VP[1] + (JOIST_Y0 - VP[1]) * s_
        slits.append(line([(xa, y), (xb, y + rng.uniform(-0.4, 0.4))]))
    out.append(flat('<g id="floorlight">' + path(" ".join(slits), "none", "#FFC870", 1.1, 'opacity="0.55"') + path(" ".join(slits), "none", "#FFC870", 3.2, 'opacity="0.12"') + "</g>"))
    # the rim joist along the wall and the sill plate under it
    out.append(path(rect_d(-64, JOIST_Y0, 664, JOIST_Y1), "#40301F", INK, 1.4))
    out.append(path(rect_d(-64, JOIST_Y1, 664, WALL_TOP), "#56402C", INK, 1.3))
    out.append(path(f"M-64,{JOIST_Y1 + 1.5:.1f} L664,{JOIST_Y1 + 1.5:.1f}", "none", WOOD_LL, 0.9, 'opacity="0.5"'))
    # the joists, running at us: the side that faces the middle and the bottom, lit from below
    S = (VP[1] + 34) / (VP[1] - JOIST_Y1)                                  # just past the canvas top
    sides, bottoms, edges = [], [], []
    for xj in range(-72, 700, 38):
        w = 3.6
        if not -66 < xj < 666: continue
        Sj = min(S, 366 / max(1.0, abs(xj - VP[0])) + 0.02)                  # stop where it leaves the canvas at the side
        side_x = xj - w if xj > VP[0] else xj + w
        if abs(xj - VP[0]) > 6:
            sides.append(poly([P(side_x, JOIST_Y0, 1), P(side_x, JOIST_Y1, 1), P(side_x, JOIST_Y1, Sj), P(side_x, JOIST_Y0, Sj)]))
        bottoms.append(poly([P(xj - w, JOIST_Y1, 1), P(xj + w, JOIST_Y1, 1), P(xj + w, JOIST_Y1, Sj), P(xj - w, JOIST_Y1, Sj)]))
        edges.append(line([P(xj - w, JOIST_Y1, 1), P(xj - w, JOIST_Y1, Sj)]) + " " + line([P(xj + w, JOIST_Y1, 1), P(xj + w, JOIST_Y1, Sj)]))
    out.append(path(" ".join(sides), "#2A1D15", "none"))
    out.append(path(" ".join(bottoms), "#5E4533", "none"))
    out.append(path(" ".join(edges), "none", INK, 1.3))
    # a few bridging blocks between joists and an old cobweb in a corner
    blk = Batch()
    for xj in (-34, 80, 194, 422, 536):
        a = P(xj + 3.6, JOIST_Y1, 1.18); b = P(xj + 34.4, JOIST_Y1, 1.18); c = P(xj + 34.4, JOIST_Y1 - 10, 1.18); d = P(xj + 3.6, JOIST_Y1 - 10, 1.18)
        blk.add("b", poly([a, b, c, d]))
    out += blk.paths(lambda k: f'fill="#4A3526" stroke="{INK}" stroke-width="1.1"')
    # the girder across, carrying them
    s0, s1, gy0, gy1 = 1.49, 1.56, JOIST_Y1, 57.0
    fy0_, fy1_, by_ = P(0, gy0, s1)[1], P(0, gy1, s1)[1], P(0, gy1, s0)[1]
    front = [(-66, fy0_), (666, fy0_), (666, fy1_), (-66, fy1_)]
    bottom = [(-66, fy1_), (666, fy1_), (666, by_), (-66, by_)]
    out.append(path(poly(bottom), "#634938", INK, 1.5))
    out.append(path(poly(front), "#4C3727", INK, 1.8))
    fy0, fy1 = P(0, gy0, s1)[1], P(0, gy1, s1)[1]
    grain = []
    for yy in (fy0 + 5, fy0 + 11, fy1 - 6):
        grain.append(smooth_open([(-64 + i * 60, yy + rng.uniform(-1.3, 1.3)) for i in range(13)], 0.5))
    out.append(flat(path(" ".join(grain), "none", "#2F2118", 0.9, 'opacity="0.7"')))
    out.append(path(f"M-64,{fy1 - 1.8:.1f} L664,{fy1 - 1.8:.1f}", "none", WOOD_LL, 1.0, 'opacity="0.45"'))
    # checks (cracks) in it, a steel splice plate with bolts, a knot
    out.append(path(line([(88, fy0 + 7), (120, fy0 + 8), (150, fy0 + 7.5)]) + " " + line([(452, fy0 + 14), (500, fy0 + 15.5)]), "none", "#1A110C", 1.3))
    out.append(path(rect_d(158, fy0 + 2, 196, fy1 - 2), "#403A35", INK, 1.2))
    for bx in (163, 191):
        for by in (fy0 + 7, fy1 - 7): out.append(flat(ellipse(bx, by, 2, 2, "#6A625A", INK, 0.7)))
    out.append(path(_blob(172, fy1 - 4, 10, 3, rng), RUST, "none", 0, 'opacity="0.6"'))
    out.append(ellipse(418, fy0 + 12, 4.5, 3, "#3A2A1F", INK, 0.8))
    # the junction box on the girder with its cable loop sagging to a staple on a joist
    out += tube([(96, fy1 + 1), (104, fy1 + 26), (120, fy1 + 30), (134, fy1 + 14), (142, fy1 + 1)], 2.2, "#16110E", lw=0.7)
    out += tube([(206, fy1 - 4), (212, fy1 + 16), (228, fy1 + 20), (240, fy1 + 8), (243, fy1 - 2)], 2.2, "#16110E", lw=0.7)
    out.append(path(rect_d(134, fy0 + 4, 154, fy1 - 3), "#6C706C", INK, 1.2))
    out.append(ellipse(144, (fy0 + fy1) / 2 + 0.5, 3.2, 3.2, "#4E524F", INK, 0.8))
    # a cobweb in the top left corner between a joist and the girder
    web = []
    cxw, cyw = 34, fy1 + 1
    for a in (200, 225, 250, 275):
        web.append(line([(cxw, cyw), (cxw + 26 * math.cos(math.radians(a)), cyw - 26 * math.sin(math.radians(a)))]))
    for r in (8, 15, 22):
        web.append(line([(cxw + r * math.cos(math.radians(a)), cyw - r * math.sin(math.radians(a))) for a in (200, 225, 250, 275)]))
    out.append(flat(path(" ".join(web), "none", "#B8B2A6", 0.6, 'opacity="0.45"')))
    return out

def pipes(rng):
    """The old cast-iron pipe across the top of the wall (a red valve wheel, clamps, a leaky joint or two) and a
    smaller copper pipe."""
    out = []
    s = 1.03; yc = 55.0; r = 5.8
    def seg(xa, xb):
        a0 = P(xa, yc - r, s); a1 = P(xb, yc - r, s); b1 = P(xb, yc + r, s); b0 = P(xa, yc + r, s)
        return [a0, a1, b1, b0]
    # its shadow on the wall
    out.append(path(poly([P(-40, yc + r + 1, 1), P(522, yc + r + 1, 1), P(522, yc + r + 6, 1), P(-40, yc + r + 6, 1)]), "#120B08", "none", 0, 'opacity="0.35"'))
    # the run: from an elbow down the wall at the far left to an elbow up into the ceiling at x 522
    run = seg(-26, 522)
    out.append(path(poly(run), IRON, INK, 1.7))
    out.append(path(line([P(-26, yc - r + 2.2, s), P(522, yc - r + 2.2, s)]), "none", IRON_L, 1.6, 'opacity="0.9"'))
    # down at the left (behind the shelving) and up at the right
    out.append(path(poly([P(-26 - r, yc, s), P(-26 + r, yc, s), P(-26 + r, FLOOR, s), P(-26 - r, FLOOR, s)]), IRON, INK, 1.7))
    out.append(path(poly([P(522 - r, yc, s), P(522 + r, yc, s), P(522 + r, JOIST_Y0 - 4, s), P(522 - r, JOIST_Y0 - 4, s)]), IRON, INK, 1.7))
    out.append(path(ell_d(*P(-26, yc, s), r + 2.2, r + 2.2, 0, 10), IRON, INK, 1.5))
    out.append(path(ell_d(*P(522, yc, s), r + 2.2, r + 2.2, 0, 10), IRON, INK, 1.5))
    # the hubs (bell joints), rusty, two of them weeping
    hubs = Batch(); rust = Batch()
    for hx in (70, 200, 345, 470, -26):
        if hx == -26: continue
        hubs.add("h", poly([P(hx - 4, yc - r - 1.8, s), P(hx + 4, yc - r - 1.8, s), P(hx + 4, yc + r + 1.8, s), P(hx - 4, yc + r + 1.8, s)]))
        rust.add("r", _blob(*P(hx, yc + 2, s), 7, 4, rng))
    for _ in range(9):
        x = rng.uniform(-20, 515)
        rust.add("r", _blob(*P(x, yc + rng.uniform(-2, 3), s), rng.uniform(2, 6), rng.uniform(1.5, 3), rng))
    out += rust.paths(lambda k: f'fill="{RUST}" opacity="0.55"')
    out += hubs.paths(lambda k: f'fill="{IRON_L}" stroke="{INK}" stroke-width="1.3"')
    # the hangers: straps up to the sill
    straps = []
    for hx in (22, 136, 262, 404, 506):
        straps.append(line([P(hx, WALL_TOP - 3, 1.0), P(hx, yc - r, s)]))
    out.append(path(" ".join(straps), "none", INK, 3.2))
    out.append(path(" ".join(straps), "none", "#5A534C", 1.6))
    # the gate valve with its red handwheel facing us
    vx, vy = P(112, yc, s)
    out.append(path(rect_d(vx - 6, vy - 9, vx + 6, vy + 9), IRON_L, INK, 1.4))
    out.append(path(rect_d(vx - 1.6, vy - 4, vx + 1.6, vy + 4), "#26221F", "none"))
    out.append(ellipse(vx, vy, 10.5, 10.5, "none", INK, 4.6))
    out.append(ellipse(vx, vy, 10.5, 10.5, "none", "#8C3A2C", 2.6))
    out.append(path(f"M{vx - 10:.1f},{vy:.1f} L{vx + 10:.1f},{vy:.1f} M{vx:.1f},{vy - 10:.1f} L{vx:.1f},{vy + 10:.1f}", "none", INK, 3.0))
    out.append(path(f"M{vx - 10:.1f},{vy:.1f} L{vx + 10:.1f},{vy:.1f} M{vx:.1f},{vy - 10:.1f} L{vx:.1f},{vy + 10:.1f}", "none", "#8C3A2C", 1.4))
    out.append(ellipse(vx, vy, 2.6, 2.6, "#5B524A", INK, 0.9))
    out.append(path(f"M{vx - 7:.1f},{vy - 7.5:.1f} C{vx - 3:.1f},{vy - 10:.1f} {vx + 3:.1f},{vy - 10:.1f} {vx + 7:.1f},{vy - 7.5:.1f}", "none", "#C36A52", 1.0, 'opacity="0.8"'))
    # a drip hanging from the weeping hub over the plaster
    dx, dy = P(345, yc + r + 2, s)
    out.append(path(f"M{dx - 1.4:.1f},{dy:.1f} C{dx - 1.6:.1f},{dy + 3:.1f} {dx + 1.6:.1f},{dy + 3:.1f} {dx + 1.4:.1f},{dy:.1f} Z", "#9FB2B8", INK, 0.6))
    # the copper pipe: along under the iron on the left, up into the ceiling before the window; again on the right,
    # coming down from the ceiling, along and down to a stop valve with a drip stain under it
    cs = 1.02; cr = 2.4
    cu = [(-64, 68), (138, 68), (144, 62), (144, JOIST_Y0 - 4)]
    out += tube([P(x, y, cs) for x, y in cu], 2 * cr, COPPER, lw=1.1, t=0.2)
    out.append(path(line([P(-64, 67, cs), P(137, 67, cs)]), "none", COPPER_L, 1.0, 'opacity="0.8"'))
    cu2 = [(362, JOIST_Y0 - 4), (362, 64), (368, 69), (474, 69), (480, 75), (480, 140)]
    out += tube([P(x, y, cs) for x, y in cu2], 2 * cr, COPPER, lw=1.1, t=0.2)
    clips = Batch()
    for x, y in ((20, 68), (90, 68), (400, 69), (452, 69), (480, 104)):
        cx_, cy_ = P(x, y, cs); clips.add("c", rect_d(cx_ - 1.6, cy_ - 3.6, cx_ + 1.6, cy_ + 3.6))
    out += clips.paths(lambda k: f'fill="#6A6A66" stroke="{INK}" stroke-width="0.7"')
    ver = Batch()
    for x in (40, 118, 420, 470):
        cx_, cy_ = P(x, 68.5, cs); ver.add("v", _blob(cx_, cy_ + 1, 3, 1.4, rng))
    out += ver.paths(lambda k: f'fill="{VERDI}" opacity="0.8"')
    vx, vy = P(480, 142, cs)
    out.append(path(rect_d(vx - 4.5, vy - 3, vx + 4.5, vy + 6), "#8A7A4A", INK, 1.1))
    out.append(path(f"M{vx:.1f},{vy - 3:.1f} L{vx:.1f},{vy - 8:.1f} M{vx - 6:.1f},{vy - 8:.1f} L{vx + 6:.1f},{vy - 8:.1f}", "none", INK, 2.6))
    out.append(path(f"M{vx - 6:.1f},{vy - 8:.1f} L{vx + 6:.1f},{vy - 8:.1f}", "none", "#8C3A2C", 1.2))
    out.append(path(f"M{vx:.1f},{vy + 6:.1f} L{vx:.1f},{vy + 10:.1f}", "none", COPPER, 2.4))
    out.append(path(smooth_open([(vx, vy + 12), (vx + 1, vy + 40), (vx - 1, vy + 70), (vx + 1, vy + 96)], 0.5), "none", "#241812", 6, 'opacity="0.2"'))
    return out

# ================================================================ the floor
RING = (300.0, 404.0, 235.0, 44.0)
def floor_art(rng):
    out = []
    out.append(path(rect_d(-64, FLOOR, 664, 494), CONC, "none"))
    # patches of a different pour and grime: lighter in the middle where it is swept, darker along the walls
    for (x, y, rx, ry, col, op) in ((300, 410, 190, 40, CONC_L, 0.35), (120, 452, 90, 22, CONC_L, 0.22), (500, 360, 80, 14, CONC_L, 0.18),
                                    (-20, 420, 110, 60, CONC_D, 0.4), (640, 430, 110, 60, CONC_D, 0.4), (300, 486, 300, 16, CONC_D, 0.3)):
        out.append(path(_blob(x, y, rx, ry, rng, 9), col, "none", 0, f'opacity="{op}"'))
    out.append(path(poly([(-64, FLOOR), (664, FLOOR), (664, FLOOR + 9), (-64, FLOOR + 9)]), "#1E1612", "none", 0, 'opacity="0.35"'))   # dirt in the corner
    # the control joints, toward the vanishing point, and two across
    joints, lits = [], []
    S = floor_s(496)
    for xw in (50, 200, 400, 550, -100, 700):
        a = P(xw, FLOOR, 1.0); b = P(xw, FLOOR, S)
        pts = [(a[0] + (b[0] - a[0]) * t + rng.uniform(-0.6, 0.6), a[1] + (b[1] - a[1]) * t) for t in (0, 0.25, 0.5, 0.75, 1.0)]
        joints.append(line(pts)); lits.append(line([(x + 1.2, y) for x, y in pts]))
    for s in (1.1, 1.72):
        Y = VP[1] + (FLOOR - VP[1]) * s
        pts = [(-64 + i * 58, Y + rng.uniform(-0.5, 0.5)) for i in range(14)]
        joints.append(line(pts)); lits.append(line([(x, y + 1.2) for x, y in pts]))
    out.append(path(" ".join(joints), "none", "#2C2723", 1.5, 'opacity="0.8"'))
    out.append(path(" ".join(lits), "none", "#7D776C", 0.8, 'opacity="0.35"'))
    # the aggregate: a dust of light and dark specks
    sp = Batch()
    for _ in range(170):
        x = rng.uniform(-60, 660); y = rng.uniform(FLOOR + 4, 492)
        sp.add("d" if rng.random() < 0.55 else "l", f"M{x:.1f},{y:.1f}h.1")
    out += sp.paths(lambda k: f'fill="none" stroke="{"#34302B" if k == "d" else "#8A8478"}" stroke-width="1.3" opacity="0.55"')
    # oil stains with darker cores
    for (x, y, rx, ry) in ((118, 432, 30, 7), (482, 470, 34, 8), (30, 372, 22, 5), (566, 392, 20, 5), (212, 478, 16, 4)):
        out.append(path(_blob(x, y, rx, ry, rng, 9), "#221D1A", "none", 0, 'opacity="0.35"'))
        out.append(path(_blob(x + rng.uniform(-4, 4), y, rx * 0.5, ry * 0.55, rng, 7), "#15110F", "none", 0, 'opacity="0.35"'))
    # cracks
    cr = [[(176, 336), (188, 344), (184, 352), (199, 364), (196, 372)], [(188, 344), (204, 346)],
          [(436, 474), (455, 470), (470, 480), (497, 482), (512, 490)], [(470, 480), (474, 490)],
          [(40, 440), (58, 452), (54, 462), (70, 478), (66, 492)], [(596, 350), (606, 360), (626, 362)],
          [(330, 338), (338, 343), (352, 342)]]
    out.append(path(" ".join(line(_jag(c, rng, 0.8)) for c in cr), "none", "#1C1714", 1.2, 'opacity="0.85"'))
    # the drain, with the wet dark ring the floor slopes into
    dx, dy = 300.0, 452.0
    out.append(path(_blob(dx, dy + 1, 34, 10, rng, 9), "#2B2521", "none", 0, 'opacity="0.35"'))
    out.append(path(_blob(dx + 4, dy + 1, 26, 7.5, rng, 8), RUST, "none", 0, 'opacity="0.2"'))
    out.append(ellipse(dx, dy, 19, 6.2, "#46403A", INK, 1.5))
    out.append(ellipse(dx, dy + 0.5, 15, 4.6, "#161210", INK, 0.9))
    bars = " ".join(f"M{dx + t:.1f},{dy + 0.5 - 4.4 * math.sqrt(max(0, 1 - (t / 15) ** 2)):.1f} L{dx + t:.1f},{dy + 0.5 + 4.4 * math.sqrt(max(0, 1 - (t / 15) ** 2)):.1f}" for t in (-10, -5, 0, 5, 10))
    out.append(path(bars + f" M{dx - 14:.1f},{dy + 0.5:.1f} L{dx + 14:.1f},{dy + 0.5:.1f}", "none", "#5E574F", 1.6))
    # the beer puddle running to it, with its shine
    pud = [(314, 458), (330, 455), (350, 459), (372, 457), (394, 462), (404, 470), (392, 477), (366, 479), (344, 476), (326, 472), (318, 465)]
    out.append(path(smooth_closed([(x + 1, y + 1.5) for x, y in pud], 0.5), "#1E1813", "none", 0, 'opacity="0.35"'))
    out.append(path(smooth_closed(pud, 0.5), "#7A6440", "none", 0, 'opacity="0.6"'))
    out.append(path(smooth_closed([(x * 0.8 + 360 * 0.2, y * 0.7 + 467 * 0.3) for x, y in pud], 0.5), "#9A8052", "none", 0, 'opacity="0.45"'))
    out.append(path("M334,462 C348,459 364,460 380,463 M348,471 L368,472", "none", "#F2E2B4", 1.4, 'opacity="0.6"'))
    out.append(path("M390,466 L396,468", "none", "#F2E2B4", 1.0, 'opacity="0.5"'))
    # sawdust kicked out round the ring, thickest at the back and sides; scuffs inside it
    saw = Batch()
    cx, cy, rx, ry = RING
    for _ in range(220):
        a = rng.uniform(0, 2 * math.pi); d = 1 + rng.gauss(0, 0.07)
        x = cx + rx * d * math.cos(a); y = cy + ry * d * math.sin(a)
        if y > 446 and abs(x - 300) < 40: continue                        # not over the drain
        saw.add(rng.choice(("a", "b")), f"M{x:.1f},{y:.1f}h{rng.uniform(0.3, 1.2):.1f}")
    for _ in range(90):
        x = rng.uniform(70, 530); y = rng.uniform(372, 442)
        if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 0.95: saw.add("a", f"M{x:.1f},{y:.1f}h.6")
    out += saw.paths(lambda k: f'fill="none" stroke="{"#A88C60" if k == "a" else "#8C7550"}" stroke-width="1.5" opacity="0.7"')
    sc = []
    for _ in range(14):
        x = rng.uniform(120, 480); y = rng.uniform(378, 436)
        if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.8: continue
        L = rng.uniform(7, 16); a = rng.uniform(-0.25, 0.25); bend = rng.uniform(-0.8, 0.8)
        sc.append(smooth_open([(x, y), (x + L * 0.5 * math.cos(a), y + L * 0.5 * math.sin(a) * 0.3 + bend), (x + L * math.cos(a), y + L * math.sin(a) * 0.3)], 0.5))
        if rng.random() < 0.5: sc.append(line([(x + 2, y + 1.6), (x + L * 0.6, y + 1.6 + L * 0.6 * math.sin(a) * 0.3)]))
    out.append(path(" ".join(sc), "none", "#221E1B", 1.3, 'opacity="0.28"'))
    # bottle caps and a bit of glass, mostly outside the ring
    caps = Batch()
    for (x, y, col) in ((84, 394, "g"), (152, 474, "s"), (424, 456, "r"), (536, 426, "g"), (246, 486, "s"), (386, 346, "r"),
                        (58, 470, "g"), (544, 474, "s"), (590, 412, "r"), (18, 404, "s"), (474, 350, "g")):
        caps.add(col, ell_d(x, y, 3.4, 1.5, rng.uniform(-10, 10), 8))
    out += caps.paths(lambda k: f'fill="{ {"g": "#B38E3E", "s": "#9A9E9F", "r": "#8E302A"}[k] }" stroke="{INK}" stroke-width="0.7"')
    glass = Batch()
    for (x, y) in ((566, 440), (574, 446), (40, 424)):
        glass.add("g", poly([(x, y), (x + 5, y - 1.5), (x + 3, y + 2)]))
    out += glass.paths(lambda k: f'fill="{B_GREEN_L}" stroke="{INK}" stroke-width="0.6" opacity="0.9"')
    return out

def chalk_ring(rng):
    """The ring chalked by hand: broken, overlapping strokes round an ellipse, and some rubbed-in chalk dust."""
    cx, cy, rx, ry = RING
    strokes, dust = [], []
    arcs = [(-8, 70), (58, 136), (124, 198), (186, 252), (244, 318), (306, 360), (22, 96), (150, 230), (268, 344), (100, 160)]
    for i, (a0, a1) in enumerate(arcs):
        dx, dy = rng.uniform(-2.5, 2.5), rng.uniform(-1.2, 1.2); drx, dry = rng.uniform(-4, 4), rng.uniform(-1.6, 1.6)
        pts = []
        n = max(4, int((a1 - a0) / 9))
        for k in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * k / n)
            pts.append((cx + dx + (rx + drx) * math.cos(a) + rng.uniform(-0.8, 0.8), cy + dy + (ry + dry) * math.sin(a) + rng.uniform(-0.4, 0.4)))
        w = rng.uniform(2.0, 3.4); op = rng.uniform(0.55, 0.85) if i < 6 else rng.uniform(0.3, 0.5)
        strokes.append(path(smooth_open(pts, 0.5), "none", CHALK, w, f'opacity="{op:.2f}"'))
        if i < 6: dust.append(path(smooth_open(pts, 0.5), "none", CHALK, 7, 'opacity="0.07"'))
    # a scratch mark where the ring was started over
    strokes.append(path(line([(cx - rx - 6, cy - 4), (cx - rx + 8, cy + 6)]), "none", CHALK, 1.6, 'opacity="0.5"'))
    return dust + strokes

# ================================================================ the left: the bar's storage
def bottle(kind, x, base, s, rng):
    """One bottle standing with its base at (x, base) on the wall's plane, at depth s. -> (colour key, outline, shine)"""
    if kind == "wine":   h, w, neck, nw = 30, 8.4, 11, 2.8
    elif kind == "beer": h, w, neck, nw = 22, 6.4, 9, 2.4
    elif kind == "liq":  h, w, neck, nw = 26, 9.6, 7, 3.0
    else:                h, w, neck, nw = 20, 7.0, 6, 3.2          # "jug": a squat flagon
    body_top = base - (h - neck)
    if kind == "liq":
        pts = [(x - w / 2, base), (x - w / 2, body_top + 1), (x - nw / 2, body_top - 2), (x - nw / 2, base - h), (x + nw / 2, base - h), (x + nw / 2, body_top - 2), (x + w / 2, body_top + 1), (x + w / 2, base)]
        d = poly(PS(pts, s))
    else:
        sh = 4 if kind == "wine" else 5
        pts = [(x - w / 2, base), (x - w / 2, body_top + sh * 0.4), (x - w / 2 + 0.6, body_top - sh * 0.3), (x - nw / 2, body_top - sh), (x - nw / 2, base - h),
               (x + nw / 2, base - h), (x + nw / 2, body_top - sh), (x + w / 2 - 0.6, body_top - sh * 0.3), (x + w / 2, body_top + sh * 0.4), (x + w / 2, base)]
        d = poly(PS(pts, s))
    shine = line(PS([(x - w / 2 + 1.8, base - 3), (x - w / 2 + 1.8, body_top)], s))
    cap = rect_d(*P(x - nw / 2 - 0.4, base - h - 1.6, s), *P(x + nw / 2 + 0.4, base - h + 1.8, s))
    return d, shine, cap

def storage(rng):
    out = []
    X0, X1, s0, s1 = -44.0, 104.0, 1.0, 1.1
    TOP = 160.0
    shelves = (168.0, 212.0, 256.0, 292.0)
    # the uprights at the back (against the wall; they show to the right of the front ones)
    posts_b = []
    for x in (X0, 30, X1):
        posts_b.append(poly([P(x - 2.5, TOP, s0), P(x + 2.5, TOP, s0), P(x + 2.5, FLOOR, s0), P(x - 2.5, FLOOR, s0)]))
    out.append(path(" ".join(posts_b), WOOD_D, INK, 1.3))
    # a shadow on the wall behind the rack
    out.append(path(poly([P(X0, TOP + 4, 1), P(X1 + 6, TOP + 4, 1), P(X1 + 6, FLOOR, 1), P(X0, FLOOR, 1)]), "#140D09", "none", 0, 'opacity="0.3"'))
    # the shelves: the top (seen from above below eye level), the front edge, the right end
    sh = []
    for y in shelves:
        top = [P(X0 - 4, y, s0), P(X1 + 3, y, s0), P(X1 + 3, y, s1), P(X0 - 4, y, s1)]
        front = [P(X0 - 4, y, s1), P(X1 + 3, y, s1), P(X1 + 3, y + 4, s1), P(X0 - 4, y + 4, s1)]
        end = [P(X1 + 3, y, s0), P(X1 + 3, y, s1), P(X1 + 3, y + 4, s1), P(X1 + 3, y + 4, s0)]
        sh.append((y, top, front, end))
    items_under = []
    # plastic crates of empties on the floor under the bottom shelf
    for (cx0, cx1, col, cold) in ((-40, -2, CRATE_G, CRATE_G_D), (0, 40, CRATE_R, CRATE_R_D), (42, 82, CRATE_G, CRATE_G_D)):
        items_under += crate_plastic(cx0, cx1, FLOOR - 26, FLOOR, 1.03, 1.09, col, cold, rng, bottles=True)
    # bottles, boxes and a coil of hose on the shelves
    shelf_items = []
    for y, top, front, end in sh:
        shelf_items.append((y, []))
    def bottles_on(y, plan):
        B = Batch(); shines = []; caps = Batch()
        for kind, x, col in plan:
            d, shine, cap = bottle(kind, x, y, 1.05, rng)
            B.add(col, d); shines.append((col, shine)); caps.add("foil" if kind == "wine" else "cap", cap)
        res = B.paths(lambda k: f'fill="{ {"g": B_GREEN, "a": B_AMBER, "c": B_CLEAR, "b": B_BROWN}[k] }" stroke="{INK}" stroke-width="1.1"')
        sh_b = Batch()
        for col, d in shines: sh_b.add(col, d)
        res += sh_b.paths(lambda k: f'fill="none" stroke="{ {"g": B_GREEN_L, "a": B_AMBER_L, "c": B_CLEAR_L, "b": "#8A5A34"}[k] }" stroke-width="1.3" opacity="0.8"')
        res += caps.paths(lambda k: f'fill="{"#7A2A26" if k == "foil" else "#B39A5A"}" stroke="{INK}" stroke-width="0.6"')
        return res
    plan1 = [("box", 0, 0)]
    plans = {
        212.0: [("wine", -38, "g"), ("wine", -28, "g"), ("beer", -16, "a"), ("beer", -8, "a"), ("wine", 6, "b"), ("wine", 16, "g"), ("liq", 30, "c"), ("liq", 42, "c"), ("beer", 55, "a"), ("beer", 63, "a"), ("wine", 77, "g"), ("wine", 87, "b"), ("beer", 98, "a")],
        256.0: [("liq", -38, "c"), ("jug", -24, "b"), ("beer", -10, "g"), ("beer", -2, "g"), ("wine", 12, "g"), ("liq", 26, "a"), ("beer", 40, "a"), ("beer", 48, "a"), ("jug", 62, "b"), ("wine", 78, "g"), ("liq", 93, "c")],
    }
    # the top shelf: two cardboard boxes and a coil of hose
    top_items = []
    for (bx0, bx1, bh, col) in ((-40, -10, 20, "#7C6446"), (40, 76, 22, "#6E583E"), (78, 98, 13, "#7A6A50")):
        top_items.append(path(poly([P(bx0, 168, 1.05), P(bx1, 168, 1.05), P(bx1, 168 - bh, 1.05), P(bx0, 168 - bh, 1.05)]), col, INK, 1.2))
        top_items.append(path(poly([P(bx0, 168 - bh, 1.05), P(bx1, 168 - bh, 1.05), P(bx1, 168 - bh, 1.0), P(bx0, 168 - bh, 1.0)]), _mix(col, 0.15), INK, 1.0))
        top_items.append(path(line([P((bx0 + bx1) / 2, 168 - bh, 1.05), P((bx0 + bx1) / 2, 168 - bh + 8, 1.05)]), "none", "#B8A07A", 1.4))
    for rr in (9, 6.5):
        cx_, cy_ = P(14, 162, 1.05)
        top_items.append(ellipse(cx_, cy_, rr + 4, rr * 0.55 + 1.5, "none", INK, 4.4))
        top_items.append(ellipse(cx_, cy_, rr + 4, rr * 0.55 + 1.5, "none", "#3E5A3A", 2.4))
    # the rack: shelves bottom to top so each sits over what is below; the items on each
    for y, top, front, end in sh:
        out.append(path(poly(top), WOOD_L, INK, 1.2))
        out.append(path(poly(end), WOOD_D, INK, 1.1))
    out += items_under
    out += top_items
    for y in (212.0, 256.0):
        out += bottles_on(y, plans[y])
    # a crate on the bottom shelf, and dust
    out += crate_plastic(52, 96, 292 - 22, 292, 1.02, 1.08, CRATE_R, CRATE_R_D, rng, bottles=True)
    out += crate_plastic(-40, 4, 292 - 22, 292, 1.02, 1.08, CRATE_G, CRATE_G_D, rng, bottles=True)
    for y, top, front, end in sh:
        out.append(path(poly(front), WOOD, INK, 1.3))
        out.append(path(line([front[0], front[1]]), "none", WOOD_LL, 0.9, 'opacity="0.6"'))
    # the front uprights (over the shelves' fronts)
    posts_f = []
    for x in (X0, 30, X1):
        posts_f.append(poly([P(x - 2.8, TOP, s1), P(x + 2.8, TOP, s1), P(x + 2.8, FLOOR, s1), P(x - 2.8, FLOOR, s1)]))
    out.append(path(" ".join(posts_f), WOOD, INK, 1.4))
    out.append(path(" ".join(line([P(x - 1.2, TOP + 2, s1), P(x - 1.2, FLOOR - 2, s1)]) for x in (X0, 30, X1)), "none", WOOD_LL, 0.9, 'opacity="0.55"'))
    # the right end's side rails
    rails = [poly([P(X1 + 2.5, y - 1, s0), P(X1 + 2.8, y - 1, s1), P(X1 + 2.8, y + 3, s1), P(X1 + 2.5, y + 3, s0)]) for y in (TOP + 2, 290)]
    out.append(path(" ".join(rails), WOOD_D, INK, 1.0))
    return out

def crate_plastic(x0, x1, y0, y1, s0, s1, col, cold, rng, bottles=False):
    """A plastic beer crate (front face and the side or top that shows), with the necks of empties poking out."""
    out = []
    left = x1 < VP[0]
    side_x = x1 if left else x0
    if bottles:
        nk = Batch(); caps = Batch()
        n = int((x1 - x0) / 7)
        for i in range(n):
            bx = x0 + (i + 0.5) * (x1 - x0) / n
            for sd in (s0 + (s1 - s0) * 0.3, s0 + (s1 - s0) * 0.75):
                a = P(bx - 1.4, y0 + 2, sd); b = P(bx + 1.4, y0 - 7, sd)
                nk.add(rng.choice(("a", "a", "g", "b")), box_d(a[0], b[1], b[0], a[1]))
        out += [flat(e) for e in nk.paths(lambda k: f'fill="{ {"a": B_AMBER, "g": B_GREEN, "b": B_BROWN}[k] }" stroke="{INK}" stroke-width="0.8"')]
    top = [P(x0, y0, s0), P(x1, y0, s0), P(x1, y0, s1), P(x0, y0, s1)]
    out.append(path(poly(top), "none", INK, 1.0))
    side = [P(side_x, y0, s0), P(side_x, y0, s1), P(side_x, y1, s1), P(side_x, y1, s0)]
    out.append(path(poly(side), cold, INK, 1.1))
    front = [P(x0, y0, s1), P(x1, y0, s1), P(x1, y1, s1), P(x0, y1, s1)]
    out.append(path(poly(front), col, INK, 1.3))
    # its grid of slots, a handle hole, the rim
    fx0, fy0 = front[0]; fx1, fy1 = front[2]
    slots = []
    rows = 2; cols = max(2, int((fx1 - fx0) / 8))
    for r in range(rows):
        for c in range(cols):
            sx0 = fx0 + 2.5 + c * (fx1 - fx0 - 5) / cols; sx1 = sx0 + (fx1 - fx0 - 5) / cols - 2
            sy0 = fy0 + 7 + r * (fy1 - fy0 - 9) / rows; sy1 = sy0 + (fy1 - fy0 - 9) / rows - 2
            if sx1 - sx0 > 1.5 and sy1 - sy0 > 1.5: slots.append(box_d(sx0, sy0, sx1, sy1))
    out.append(path(" ".join(slots), cold, "none"))
    out.append(path(rect_d((fx0 + fx1) / 2 - 6, fy0 + 2, (fx0 + fx1) / 2 + 6, fy0 + 5.2), "#120C09", "none"))
    out.append(path(line([(fx0 + 1, fy0 + 1.2), (fx1 - 1, fy0 + 1.2)]), "none", _mix(col, 0.3), 1.0, 'opacity="0.8"'))
    return out

def crate_wood(x0, x1, y0, y1, s0, s1, rng, lid=True, shade=0.0):
    """A wooden crate standing on the floor: front boards, the visible side, and its top (a lid of boards)."""
    out = []
    col, cold, coll = (_mix(c, shade, "#1A120C") for c in (CRATE_W, CRATE_W_D, CRATE_W_L))
    left = x1 < VP[0]
    side_x = x1 if left else x0
    top = [P(x0, y0, s0), P(x1, y0, s0), P(x1, y0, s1), P(x0, y0, s1)]
    side = [P(side_x, y0, s0), P(side_x, y0, s1), P(side_x, y1, s1), P(side_x, y1, s0)]
    front = [P(x0, y0, s1), P(x1, y0, s1), P(x1, y1, s1), P(x0, y1, s1)]
    out.append(path(poly(side), cold, INK, 1.2))
    out.append(path(poly(front), col, INK, 1.5))
    out.append(path(poly(top), coll, INK, 1.3))
    # boards: two across the front with a gap, corner posts; the lid's boards run side to side
    fx0, fy0 = front[0]; fx1, fy1 = front[2]
    h = fy1 - fy0
    gaps = [rect_d(fx0 + 3, fy0 + h * 0.46, fx1 - 3, fy0 + h * 0.54)]
    out.append(path(" ".join(gaps), "#2A1D14", "none"))
    out.append(path(line([(fx0 + 3.5, fy0 + 1.5), (fx0 + 3.5, fy1 - 1.5)]) + " " + line([(fx1 - 3.5, fy0 + 1.5), (fx1 - 3.5, fy1 - 1.5)]), "none", INK, 1.0))
    grain = [line([(fx0 + 5, fy0 + h * 0.25 + rng.uniform(-1, 1)), (fx1 - 5, fy0 + h * 0.25 + rng.uniform(-1, 1))]), line([(fx0 + 5, fy0 + h * 0.76), (fx1 - 5, fy0 + h * 0.78)])]
    out.append(path(" ".join(grain), "none", cold, 0.8, 'opacity="0.8"'))
    out.append(path(line([(fx0 + 1.5, fy0 + 1.2), (fx1 - 1.5, fy0 + 1.2)]), "none", coll, 1.0, 'opacity="0.8"'))
    # a stamp mark on the front (a ring and a star-less roundel; no letters)
    out.append(ellipse((fx0 + fx1) / 2, fy0 + h * 0.27, 4.2, 2.6, "none", "#2A1D14", 1.0, 'opacity="0.55"'))
    # the side's hand hole
    sx = (side[0][0] + side[1][0]) / 2; sy = (side[0][1] + side[2][1]) / 2 - h * 0.15
    out.append(ellipse(sx, sy, 2.6, 1.8, "#140D09", "none", 0))
    if lid:
        seams = []
        for u in (0.33, 0.66):
            a = P(x0, y0, s0 + (s1 - s0) * u); b = P(x1, y0, s0 + (s1 - s0) * u)
            seams.append(line([a, b]))
        out.append(path(" ".join(seams), "none", cold, 1.0))
    return out

def kegs(rng):
    """A steel keg standing and one on its side, end on."""
    out = []
    # standing: centre on the floor at (xw, s)
    xw, s, r, h = 93.0, 1.12, 15.0, 42.0
    cx, cy = P(xw, FLOOR, s)
    rx = r * s; ry = rx * 0.26
    topy = P(xw, FLOOR - h, s)[1]
    out.append(path(_blob(cx + 2, cy + 1, rx + 5, ry + 1.5, rng), "#100B08", "none", 0, 'opacity="0.45"'))
    body = f"M{cx - rx:.1f},{topy:.1f} L{cx - rx:.1f},{cy:.1f} C{cx - rx:.1f},{cy + ry * 1.33:.1f} {cx + rx:.1f},{cy + ry * 1.33:.1f} {cx + rx:.1f},{cy:.1f} L{cx + rx:.1f},{topy:.1f} Z"
    out.append(path(body, STEEL, INK, 1.5))
    out.append(path(f"M{cx - rx * 0.55:.1f},{topy + 3:.1f} L{cx - rx * 0.55:.1f},{cy - 2:.1f}", "none", STEEL_L, 3.0, 'opacity="0.7"'))
    out.append(path(f"M{cx + rx * 0.62:.1f},{topy + 3:.1f} L{cx + rx * 0.62:.1f},{cy - 1:.1f}", "none", STEEL_D, 3.4, 'opacity="0.8"'))
    for u in (0.3, 0.72):                                                 # the rolling rings
        yy = topy + (cy - topy) * u
        out.append(path(f"M{cx - rx - 0.8:.1f},{yy:.1f} C{cx - rx:.1f},{yy + ry * 1.3:.1f} {cx + rx:.1f},{yy + ry * 1.3:.1f} {cx + rx + 0.8:.1f},{yy:.1f}", "none", INK, 3.4))
        out.append(path(f"M{cx - rx - 0.8:.1f},{yy:.1f} C{cx - rx:.1f},{yy + ry * 1.3:.1f} {cx + rx:.1f},{yy + ry * 1.3:.1f} {cx + rx + 0.8:.1f},{yy:.1f}", "none", "#9A9EA0", 1.6))
    out.append(ellipse(cx, topy, rx, ry, "#8E9294", INK, 1.4))
    out.append(ellipse(cx, topy + 0.6, rx * 0.72, ry * 0.62, "#6E7275", INK, 0.9))
    out.append(ellipse(cx, topy + 0.2, 3.2, 1.3, "#3A3A38", INK, 0.8))
    out.append(path(_blob(cx - rx * 0.2, cy - 6, 6, 2.5, rng), RUST, "none", 0, 'opacity="0.35"'))
    # on its side, end on to us, rolled against the rack
    xw2, s2, r2 = 85.0, 1.22, 16.0
    fcx, fcy = P(xw2, FLOOR - r2, s2); bcx, bcy = P(xw2, FLOOR - r2, s2 - 0.1)
    R, Rb = r2 * s2, r2 * (s2 - 0.1)
    out.append(path(_blob(fcx + 4, P(xw2, FLOOR, s2)[1] + 1, R + 4, 3.5, rng), "#100B08", "none", 0, 'opacity="0.45"'))
    # the body between the two ends (the part that shows behind the near end, up and toward the middle)
    ang = math.atan2(bcy - fcy, bcx - fcx) + math.pi / 2
    hull = [(fcx + R * math.cos(ang), fcy + R * math.sin(ang)), (bcx + Rb * math.cos(ang), bcy + Rb * math.sin(ang)),
            (bcx - Rb * math.cos(ang), bcy - Rb * math.sin(ang)), (fcx - R * math.cos(ang), fcy - R * math.sin(ang))]
    out.append(path(ell_d(bcx, bcy, Rb, Rb, 0, 12), STEEL_D, INK, 1.3))
    out.append(path(poly(hull), STEEL_D, "none"))
    out.append(path(line([hull[0], hull[1]]) + " " + line([hull[2], hull[3]]), "none", INK, 1.3))
    out.append(ellipse(fcx, fcy, R, R, STEEL, INK, 1.5))
    out.append(ellipse(fcx, fcy, R - 3.2, R - 3.2, "#8A8E90", INK, 1.0))
    out.append(ellipse(fcx, fcy, R - 7, R - 7, "#6E7275", INK, 0.9))
    out.append(ellipse(fcx, fcy, 3.4, 3.4, "#3A3A38", INK, 0.9))                # the spear's coupler
    out.append(path(f"M{fcx - R + 3:.1f},{fcy - 3:.1f} C{fcx - R + 4:.1f},{fcy - 10:.1f} {fcx - 9:.1f},{fcy - R + 4:.1f} {fcx - 3:.1f},{fcy - R + 3:.1f}", "none", STEEL_L, 1.6, 'opacity="0.8"'))
    for a in (40, 140):                                                   # the handle cut-outs in the chime
        hx, hy = fcx + (R - 1.6) * math.cos(math.radians(-a)), fcy + (R - 1.6) * math.sin(math.radians(-a))
        out.append(path(ell_d(hx, hy, 4.2, 1.2, -a + 90, 8), "#2E2E2D", "none"))
    return out

# ================================================================ the right: the stairs down from the bar
L0, RUN, RISE, NSTEP, SF = 546.0, 24.0, 170.0 / 8, 8, 1.13     # the landing's nosing, a tread's run, a riser, how many, the stair's front
def tread(k):
    """Tread k (0 = the landing at the door, NSTEP - 1 = the lowest): its left x, right x and height on the wall's plane."""
    y = 160.0 + k * RISE
    if k == 0: return L0, 700.0, y
    return L0 - k * RUN, L0 - (k - 1) * RUN, y

def stair_anchor(k, s=None):
    x0, x1, y = tread(k)
    s = (1 + SF) / 2 if s is None else s
    return P((x0 + x1) / 2, y, s)

def stairs(rng):
    out = []
    xb = L0 - (NSTEP - 1) * RUN                                          # the bottom riser
    def nose_y(x): return 160.0 + (L0 - x) / RUN * RISE
    # under the stairs: the wall in deep shadow, junk stored there
    under = [(xb + 8, FLOOR), (L0 + 10, 190), (L0 + 10, FLOOR)]
    out.append(path(poly(under), "#120B08", "none", 0, 'opacity="0.55"'))
    junk = []
    # a broken chair on its side and a stack of boxes, dark
    junk.append(path(poly([(470, 330), (470, 300), (500, 300), (500, 330)]), "#3A2C20", INK, 1.2))
    junk.append(path(poly([(474, 300), (474, 282), (496, 282), (496, 300)]), "#44342A", INK, 1.2))
    junk.append(path(line([(512, 330), (516, 262), (524, 262), (520, 330)]), "none", "#2A1E16", 2.2))
    junk.append(path(line([(514, 292), (530, 292)]), "none", "#2A1E16", 2.2))
    junk.append(path(line([(536, 330), (542, 230)]), "none", "#2A1E16", 2.4))
    out += junk
    out.append(path(poly(under), "#120B08", "none", 0, 'opacity="0.3"'))
    # the back rail's posts and rail against the wall (drawn first: the steps come over their feet)
    rail_h = 52.0
    posts = []
    for k in (7, 5, 3, 1):
        x0, x1, y = tread(k); xm = (x0 + x1) / 2
        posts.append(poly([P(xm - 2, y, 1.02), P(xm + 2, y, 1.02), P(xm + 2, y - rail_h + nose_y(xm) - y, 1.02), P(xm - 2, y - rail_h + nose_y(xm) - y, 1.02)]))
    out.append(path(" ".join(posts), WOOD_D, INK, 1.2))
    r0 = (xb - 4, nose_y(xb - 4) - rail_h); r1 = (L0 + 16, 160 - rail_h)
    rl = [P(r0[0], r0[1], 1.02), P(L0, nose_y(L0) - rail_h, 1.02), P(r1[0], r1[1], 1.02)]
    out += tube(rl, 3.6, WOOD, lw=1.2, t=0.1)
    out.append(path(line([(a[0], a[1] - 1) for a in rl]), "none", WOOD_LL, 1.0, 'opacity="0.7"'))
    # the landing: its top and its fascia
    land_top = [P(L0, 160, 1.0), P(700, 160, 1.0), P(700, 160, SF), P(L0, 160, SF)]
    out.append(path(poly(land_top), WOOD_L, INK, 1.3))
    # treads and risers, top to bottom
    treads, risers, nosings, wear = [], [], [], []
    for k in range(1, NSTEP):
        x0, x1, y = tread(k)
        yu = y - RISE                                                    # the tread above (its riser is at x1)
        risers.append(poly([P(x1, yu, 1.0), P(x1, yu, SF), P(x1, y, SF), P(x1, y, 1.0)]))
        treads.append(poly([P(x0, y, 1.0), P(x1, y, 1.0), P(x1, y, SF), P(x0, y, SF)]))
        nosings.append(line([P(x0, y + 0.3, 1.0), P(x0, y + 0.3, SF)]))
        cx_, cy_ = P((x0 + x1) / 2, y, (1 + SF) / 2)
        wear.append(ell_d(cx_, cy_, 5.5, 3.2 * (cy_ - VP[1]) / 150, 0, 8))
    # the lowest riser, from the floor up to the lowest tread
    risers.append(poly([P(xb, 160 + (NSTEP - 1) * RISE, 1.0), P(xb, 160 + (NSTEP - 1) * RISE, SF), P(xb, FLOOR, SF), P(xb, FLOOR, 1.0)]))
    out.append(path(" ".join(risers), "#3F2C1F", INK, 1.2))
    out.append(path(" ".join(treads), WOOD_L, INK, 1.2))
    out.append(path(" ".join(wear), WOOD_LL, "none", 0, 'opacity="0.45"'))
    out.append(path(" ".join(nosings), "none", "#A07A55", 1.0, 'opacity="0.6"'))
    # the front stringer: the steps' profile at the front and a board under it down to the floor
    prof = [(xb, FLOOR)]
    for k in range(NSTEP - 1, 0, -1):
        x0, x1, y = tread(k)
        prof += [(x0, y), (x1, y)]
    prof += [(L0, 160.0), (700, 160.0), (700, 172.0), (L0 + 14, 172.0)]
    # the stringer's straight underside, from under the landing back down to the floor
    xf = xb + 36
    prof += [(L0 + 14, 172.0 + 2), (xf, FLOOR)]
    face = PS(prof, SF)
    out.append(path(poly(face), WOOD, INK, 1.6))
    out.append(flat(path(" ".join(line(PS([(tread(k)[0] + 1.5, tread(k)[2] + 1.8), (tread(k)[1] - 1.5, tread(k)[2] + 1.8)], SF)) for k in range(1, NSTEP)), "none", WOOD_LL, 1.0, 'opacity="0.55"')))
    # grain and nails along the stringer
    nails = Batch()
    for k in range(1, NSTEP):
        x0, x1, y = tread(k)
        nx, ny = P(x0 + 4, y + 4, SF); nails.add("n", f"M{nx:.1f},{ny:.1f} L{nx + 0.1:.1f},{ny:.1f}")
    out += nails.paths(lambda k: 'fill="none" stroke="#1A120D" stroke-width="1.8"')
    # the landing's fascia and the post under it
    fas = PS([(L0, 160), (700, 160), (700, 172), (L0, 172)], SF)
    out.append(path(poly(fas), WOOD, INK, 1.4))
    post = PS([(L0 + 6, 172), (L0 + 14, 172), (L0 + 14, FLOOR), (L0 + 6, FLOOR)], SF)
    out.append(path(poly(post), WOOD_D, INK, 1.4))
    # the newel post at the bottom front with its cap
    nx0, nx1 = xb - 3, xb + 5
    newel = PS([(nx0, FLOOR), (nx0, 268), (nx1, 268), (nx1, FLOOR)], SF)
    out.append(path(poly(newel), WOOD, INK, 1.6))
    cap = PS([(nx0 - 2, 268), (nx0 - 2, 262), (nx1 + 2, 262), (nx1 + 2, 268)], SF)
    out.append(path(poly(cap), WOOD_L, INK, 1.4))
    kx, ky = P((nx0 + nx1) / 2, 256, SF)
    out.append(ellipse(kx, ky, 5.2, 5.6, WOOD_L, INK, 1.4))
    out.append(path(line(PS([(nx0 + 1.5, 270), (nx0 + 1.5, FLOOR - 2)], SF)), "none", WOOD_LL, 1.0, 'opacity="0.6"'))
    # the front rail from the newel up to the landing, only above head height of anyone standing on the steps
    return out

def crates_standing(rng):
    """The two short stacks along the back wall that onlookers stand on."""
    out = []
    # left: two wooden crates, front face x 90..150 on screen
    s0, s1 = 1.02, 1.16
    xa = VP[0] + (90 - VP[0]) / s1; xb_ = VP[0] + (150 - VP[0]) / s1
    ytop = VP[1] + (305 - VP[1]) / ((s0 + s1) / 2)
    mid = (FLOOR + ytop) / 2
    out.append(path(_blob(*P((xa + xb_) / 2 + 4, FLOOR, s1 - 0.02), 38, 5, rng), "#100B08", "none", 0, 'opacity="0.45"'))
    out += crate_wood(xa, xb_, mid, FLOOR, s0, s1, rng, lid=False, shade=0.12)
    out += crate_wood(xa + 1.5, xb_ + 1, ytop, mid, s0, s1 - 0.005, rng, lid=True)
    left_anchor = P((xa + xb_) / 2, ytop, (s0 + s1) / 2)
    # right: a plastic crate with a wooden one on it, in front of the foot of the stairs, front face x 455..515
    s0, s1 = SF + 0.01, SF + 0.11
    xa = VP[0] + (462 - VP[0]) / s1; xb_ = VP[0] + (522 - VP[0]) / s1
    ytop = VP[1] + (305 - VP[1]) / ((s0 + s1) / 2)
    mid = (FLOOR + ytop) / 2 + 2
    out.append(path(_blob(*P((xa + xb_) / 2 - 4, FLOOR, s1 - 0.02), 38, 5, rng), "#100B08", "none", 0, 'opacity="0.45"'))
    out += crate_plastic(xa, xb_, mid, FLOOR, s0, s1, CRATE_R, CRATE_R_D, rng, bottles=False)
    out += crate_wood(xa - 1, xb_ + 1, ytop, mid, s0, s1, rng, lid=True)
    right_anchor = P((xa + xb_) / 2, ytop, (s0 + s1) / 2)
    return out, left_anchor, right_anchor

# ================================================================ the files
def fightback():
    rng = random.Random(1999)
    wall, courses = brick_wall(rng)
    wear = wall_wear(rng, courses)
    plaster = plaster_patch(rng)
    win = window(rng)
    fuse = fusebox(rng)
    neon = neon_sign(rng)
    chalk = chalkboard(rng)
    dr = door(rng)
    fl = floor_art(rng)
    ring = chalk_ring(rng)
    ceil = ceiling(rng)
    pp = pipes(rng)
    stor = storage(rng)
    kg = kegs(rng)
    st = stairs(rng)
    cr, la, ra = crates_standing(rng)
    wall_foot = [path("M-64,330 L664,330", "none", INK, 1.8)]
    # decimals: whole units wherever the shape is big or rough enough not to show it (at 2x a unit is two pixels
    # and the ink wobbles by about one anyway); tenths for the small, round and fine things
    parts = [(wall, None), (wear, None, 0, 0), (plaster, 0.7, 16.0, 0), (win, 0.6, 16.0, 0), (fuse, 0.6, 18.0, 0), (neon, None), (chalk, 0.4, 20.0),
             (dr, 0.6, 20.0, 0), (fl, None, 0, 0), (wall_foot, 0.8, 30.0, 0), (ring, None, 0, 0), (ceil, 0.8, 30.0, 0), (pp, 0.7, 30.0, 0),
             (stor, None, 0, 0), (kg, 0.5, 18.0), (st, 0.7, 20.0, 0), (cr, 0.6, 16.0, 0)]
    write("fightback", (-60, -30, 720, 520), parts)
    print("  left crate top", tuple(round(v, 1) for v in la), " right crate top", tuple(round(v, 1) for v in ra))
    for k in range(1, NSTEP):
        print("  step", k, tuple(round(v, 1) for v in stair_anchor(k)))

def fightlamp():
    out = []
    cx = 300.0
    # the flex, twisted, from the ceiling to the cap
    flex = smooth_open([(cx, -30), (cx + 0.6, 0), (cx - 0.4, 24), (cx, 44)], 0.5)
    out.append(path(flex, "none", INK, 3.2))
    out.append(path(flex, "none", "#3A302A", 1.6))
    tw = " ".join(f"M{cx - 1.2:.1f},{y:.1f} L{cx + 1.2:.1f},{y + 2:.1f}" for y in range(-28, 42, 5))
    out.append(path(tw, "none", "#6A5A4C", 0.7, 'opacity="0.8"'))
    # the cap and the neck of the shade
    out.append(path(rect_d(cx - 5, 42, cx + 5, 50), "#2E4A38", INK, 1.3))
    out.append(path(rect_d(cx - 3, 38, cx + 3, 42.5), "#6B645C", INK, 1.0))
    # the shade: a flared cone in green enamel, lighter on the left, dented, chipped to the iron
    rim_y, rx, ry = 80.0, 32.0, 6.0
    shade = f"M{cx - 6:.1f},49 C{cx - 9:.1f},58 {cx - 20:.1f},66 {cx - rx:.1f},{rim_y:.1f} C{cx - rx + 2:.1f},{rim_y + ry * 1.3:.1f} {cx + rx - 2:.1f},{rim_y + ry * 1.3:.1f} {cx + rx:.1f},{rim_y:.1f} C{cx + 20:.1f},66 {cx + 9:.1f},58 {cx + 6:.1f},49 Z"
    out.append(path(shade, GREEN_EN, INK, 1.8))
    out.append(path(f"M{cx - 4:.1f},51 C{cx - 7:.1f},59 {cx - 15:.1f},67 {cx - 24:.1f},{rim_y + 1:.1f} L{cx - 17:.1f},{rim_y + 3:.1f} C{cx - 10:.1f},68 {cx - 5:.1f},60 {cx - 2:.1f},51 Z", "#5F8E6E", "none", 0, 'opacity="0.8"'))
    out.append(path(f"M{cx + 4:.1f},51 C{cx + 8:.1f},60 {cx + 17:.1f},68 {cx + 29:.1f},{rim_y + 1:.1f} L{cx + 20:.1f},{rim_y + 4:.1f} C{cx + 12:.1f},69 {cx + 6:.1f},60 {cx + 2:.1f},51 Z", "#2A4A36", "none", 0, 'opacity="0.8"'))
    # a dent and chips
    out.append(path(ell_d(cx + 12, 66, 5, 3, 25, 8), "#2F5440", "none"))
    out.append(path(f"M{cx + 8:.1f},64.5 C{cx + 11:.1f},63 {cx + 15:.1f},64 {cx + 17:.1f},67", "none", "#7EAA8A", 0.9, 'opacity="0.8"'))
    for (x, y, r) in ((cx - 12, 70, 1.8), (cx + 22, 75, 1.5), (cx - 3, 57, 1.2), (cx - 22, 77, 1.4)):
        out.append(path(ell_d(x, y, r * 1.3, r, 0, 7), "#1E1A17", "none"))
        out.append(path(ell_d(x + 0.4, y + 0.3, r * 1.9, r * 1.5, 0, 7), "none", RUST, 0.8, 'opacity="0.7"'))
    # the inside seen from below, lit (#shadein), and the bulb (#bulb)
    inner = [ellipse(cx, rim_y, rx - 0.6, ry - 0.3, "#F2E3BE", INK, 1.4)]
    inner.append(ellipse(cx, rim_y - 1.2, rx - 8, ry - 2.6, "#FFF4D6", "none", 0, 'opacity="0.9"'))
    out.append('<g id="shadein">' + "".join(inner) + "</g>")
    out.append(path(rect_d(cx - 4.2, rim_y - 3, cx + 4.2, rim_y + 1.5), "#B8A26A", INK, 0.9))     # the socket's collar
    bulb = [path(f"M{cx - 3.8:.1f},{rim_y + 1:.1f} C{cx - 4:.1f},{rim_y + 4:.1f} {cx - 8.5:.1f},{rim_y + 6:.1f} {cx - 8.5:.1f},{rim_y + 11:.1f} C{cx - 8.5:.1f},{rim_y + 17:.1f} {cx - 4:.1f},{rim_y + 19.5:.1f} {cx:.1f},{rim_y + 19.5:.1f} "
                 f"C{cx + 4:.1f},{rim_y + 19.5:.1f} {cx + 8.5:.1f},{rim_y + 17:.1f} {cx + 8.5:.1f},{rim_y + 11:.1f} C{cx + 8.5:.1f},{rim_y + 6:.1f} {cx + 4:.1f},{rim_y + 4:.1f} {cx + 3.8:.1f},{rim_y + 1:.1f} Z", "#FFF0C4", INK, 1.1)]
    bulb.append(ellipse(cx, rim_y + 12, 5.2, 5.4, "#FFFBEA", "none", 0))
    bulb.append(path(f"M{cx - 2.6:.1f},{rim_y + 12:.1f} C{cx - 1.8:.1f},{rim_y + 9:.1f} {cx - 0.6:.1f},{rim_y + 15:.1f} {cx:.1f},{rim_y + 12:.1f} C{cx + 0.6:.1f},{rim_y + 9:.1f} {cx + 1.8:.1f},{rim_y + 15:.1f} {cx + 2.6:.1f},{rim_y + 12:.1f}", "none", "#F0A040", 0.9))
    bulb.append(path(f"M{cx - 2.6:.1f},{rim_y + 12:.1f} L{cx - 1.8:.1f},{rim_y + 3:.1f} M{cx + 2.6:.1f},{rim_y + 12:.1f} L{cx + 1.8:.1f},{rim_y + 3:.1f}", "none", "#B89A60", 0.6))
    out.append('<g id="bulb">' + "".join(bulb) + "</g>")
    write("fightlamp", (250, -30, 100, 130), [(out[:3], None), (out[3:], None)])

def fightfront():
    rng = random.Random(826)
    out = []
    # ---- left: the lally column, mostly off frame, with its plates; an orange extension cord hung on it
    cx, r = -2.0, 22.0
    out.append(path(rect_d(cx - r, -34, cx + r, 482), "#3C423E", INK, 2.2))
    out.append(path(rect_d(cx + r - 9, -30, cx + r - 3, 478), "#2A2F2B", "none", 0, 'opacity="0.9"'))
    out.append(path(rect_d(cx + 2, -30, cx + 7, 478), "#68706A", "none", 0, 'opacity="0.8"'))
    rs = Batch()
    for y0 in (18, 96, 170, 260, 330, 410):
        x = rng.uniform(cx - 10, cx + 12); L = rng.uniform(26, 70)
        rs.add("r", smooth_open([(x, y0), (x + rng.uniform(-1, 1), y0 + L * 0.5), (x + rng.uniform(-1.5, 1.5), y0 + L)], 0.5))
    out += rs.paths(lambda k: f'fill="none" stroke="{RUST}" stroke-width="3" opacity="0.55"')
    for (y, yy) in ((-30, -16), (470, 482)):
        out.append(path(rect_d(cx - r - 12, y, cx + r + 12, yy), "#4A4F4B", INK, 1.8))
        out.append(path(line([(cx - r - 10, y + 2), (cx + r + 10, y + 2)]), "none", "#7A827C", 1.0, 'opacity="0.7"'))
        for bx in (cx - r - 6, cx + r + 6):
            out.append(ellipse(bx, (y + yy) / 2, 2.4, 2.4, "#6A6E6A", INK, 0.9))
    out.append(path(_blob(cx + 8, 486, 46, 6, rng), "#0E0906", "none", 0, 'opacity="0.5"'))
    # the cord: a hook, three loops hanging, and the plug end
    hk = (18.0, 118.0)
    out.append(path(f"M{hk[0] - 4:.1f},{hk[1] - 6:.1f} L{hk[0] + 2:.1f},{hk[1] - 6:.1f} C{hk[0] + 6:.1f},{hk[1] - 6:.1f} {hk[0] + 6:.1f},{hk[1] + 2:.1f} {hk[0] + 2:.1f},{hk[1] + 2:.1f}", "none", "#1A1612", 2.4))
    for (lx0, lx1, bottom) in ((6, 32, 196), (2, 36, 222), (10, 30, 178)):
        out += tube([(hk[0] - 1, hk[1] + 1), (lx0, (hk[1] + bottom) / 2), (lx0 + 4, bottom - 6), ((lx0 + lx1) / 2, bottom), (lx1 - 3, bottom - 6), (lx1, (hk[1] + bottom) / 2), (hk[0] + 2, hk[1] + 1)], 3.0, "#C0602A", lw=1.1)
    out += tube([(hk[0] + 1, hk[1] + 2), (26, 190), (30, 250), (24, 282)], 3.0, "#C0602A", lw=1.1)
    out.append(path(rect_d(19, 282, 29, 296), "#2A2622", INK, 1.2))
    out.append(path(f"M21.5,296 L21.5,302 M26.5,296 L26.5,302", "none", "#B39A5A", 1.4))
    out.append(path(f"M{hk[0] - 2:.1f},{hk[1] + 30:.1f} C{hk[0] - 3:.1f},{hk[1] + 50:.1f} {hk[0] - 1:.1f},{hk[1] + 70:.1f} {hk[0] + 1:.1f},{hk[1] + 80:.1f}", "none", "#E3905A", 1.0, 'opacity="0.6"'))
    # ---- bottom left: the rim of a crate of empties nearer the camera
    cr = []
    cr.append(path(poly([(-64, 452), (66, 452), (70, 494), (-64, 494)]), CRATE_G, INK, 2.0))
    cr.append(path(poly([(-64, 452), (66, 452), (66, 459), (-64, 459)]), "#3E5E4B", INK, 1.4))
    slots = " ".join(rect_d(x, 466, x + 13, 480) for x in range(-56, 60, 18))
    cr.append(path(slots, CRATE_G_D, "none"))
    cr.append(path(rect_d(-4, 462, 22, 468), "#0E0A08", "none"))
    necks = Batch(); caps = Batch(); shine = []
    for i, x in enumerate(range(-52, 36, 13)):
        top = 432 + (i % 3) * 3 + rng.uniform(-1, 1)
        col = ("a", "g", "a", "b", "a", "g", "a", "b")[i % 8]
        necks.add(col, poly([(x - 3.2, 453), (x - 3.2, top + 12), (x - 2.2, top + 3), (x + 2.2, top + 3), (x + 3.2, top + 12), (x + 3.2, 453)]))
        caps.add("c", rect_d(x - 2.6, top, x + 2.6, top + 3.4))
        shine.append(line([(x - 1.6, top + 6), (x - 1.6, 450)]))
    cr += necks.paths(lambda k: f'fill="{ {"a": B_AMBER, "g": B_GREEN, "b": B_BROWN}[k] }" stroke="{INK}" stroke-width="1.2"')
    cr += caps.paths(lambda k: f'fill="#B39A5A" stroke="{INK}" stroke-width="0.8"')
    cr.append(path(" ".join(shine), "none", "#D3A56A", 1.1, 'opacity="0.6"'))
    cr.append(path(poly([(-64, 452), (66, 452), (66, 459), (-64, 459)]), "#3E5E4B", INK, 1.4))
    out += cr
    # ---- right: the old timber post, and the mop bucket with its mop leaning on the post
    px0, px1 = 586.0, 626.0
    out.append(path(rect_d(px0, -34, px1, 486), "#4C3526", INK, 2.2))
    out.append(path(rect_d(px1 - 11, -30, px1 - 1.5, 484), "#35251A", "none", 0, 'opacity="0.9"'))
    out.append(path(rect_d(px0 + 3, -30, px0 + 7, 484), "#6E4F38", "none", 0, 'opacity="0.8"'))
    g = []
    for i in range(6):
        x = px0 + 8 + i * 4.6 + rng.uniform(-1, 1)
        g.append(smooth_open([(x, -30), (x + rng.uniform(-1.5, 1.5), 120), (x + rng.uniform(-1.5, 1.5), 260), (x + rng.uniform(-1.5, 1.5), 400), (x, 484)], 0.5))
    out.append(path(" ".join(g), "none", "#2E2016", 0.9, 'opacity="0.7"'))
    out.append(path(line([(px0 + 12, 40), (px0 + 13, 90), (px0 + 11, 128)]) + " " + line([(px0 + 22, 300), (px0 + 23, 352)]), "none", "#150D09", 1.8))   # checks
    out.append(ellipse(px0 + 18, 210, 5, 8, "#3A281C", INK, 1.2))
    out.append(ellipse(px0 + 18, 210, 2.2, 4, "#2A1D14", "none", 0))
    for (nx, ny) in ((px0 + 6, 150), (px0 + 30, 236), (px0 + 9, 372)):
        out.append(ellipse(nx, ny, 1.8, 1.8, "#6A625A", INK, 0.8))
    out.append(path(f"M{px0 + 6:.1f},150 L{px0 - 1:.1f},147", "none", "#4E4843", 1.6))       # a bent nail, with a rag on it
    out.append(path(f"M{px0 - 1:.1f},146 C{px0 - 6:.1f},160 {px0 - 2:.1f},176 {px0 - 5:.1f},190 L{px0 + 4:.1f},192 C{px0 + 5:.1f},176 {px0 + 2:.1f},160 {px0 + 5:.1f},148 Z", "#8A7F6A", INK, 1.2))
    out.append(path(_blob(606, 488, 50, 6, rng), "#0E0906", "none", 0, 'opacity="0.5"'))
    # the mop handle, then the bucket over its foot
    out += tube([(572, 452), (586, 236)], 4.2, "#8A6A45", lw=1.3)
    out.append(path(line([(571.4, 448), (585.2, 240)]), "none", "#B0906A", 1.0, 'opacity="0.7"'))
    bx0, bx1, by0 = 556.0, 648.0, 446.0
    body = f"M{bx0:.1f},{by0:.1f} L{bx0 + 8:.1f},494 L{bx1 - 8:.1f},494 L{bx1:.1f},{by0:.1f} Z"
    out.append(path(body, "#8E9598", INK, 2.0))
    out.append(path(f"M{bx0 + 12:.1f},{by0 + 6:.1f} L{bx0 + 17:.1f},492", "none", "#C3C9CB", 3.0, 'opacity="0.7"'))
    out.append(path(f"M{bx1 - 16:.1f},{by0 + 6:.1f} L{bx1 - 20:.1f},492", "none", "#6A7073", 5.0, 'opacity="0.7"'))
    for yy in (462, 480):                                                  # its pressed ribs
        out.append(path(line([(bx0 + 3 + (yy - by0) / 6, yy), (bx1 - 3 - (yy - by0) / 6, yy)]), "none", "#6A7073", 1.6))
    out.append(ellipse((bx0 + bx1) / 2, by0, (bx1 - bx0) / 2, 5.5, "#3E3A33", INK, 1.8))
    out.append(path(f"M{bx0 + 6:.1f},{by0 + 1:.1f} C{bx0 + 30:.1f},{by0 + 5:.1f} {bx1 - 30:.1f},{by0 + 5:.1f} {bx1 - 6:.1f},{by0 + 1:.1f}", "none", "#5E6B5A", 3.0, 'opacity="0.7"'))
    # the mop's strands over the rim, grey and matted
    st = []
    for i in range(9):
        x = 564 + i * 3.4 + rng.uniform(-1, 1)
        st.append(smooth_open([(x + 4, by0 - 3), (x, by0 + 4), (x - 2 + rng.uniform(-1, 1), by0 + 14 + rng.uniform(0, 8))], 0.5))
    out.append(path(" ".join(st), "none", INK, 3.4))
    out.append(path(" ".join(st), "none", "#A6A08E", 1.8))
    # the handle's bail and the wringer on the far side
    out.append(path(f"M{bx0 + 2:.1f},{by0 + 2:.1f} C{bx0 + 10:.1f},{by0 - 26:.1f} {bx1 - 10:.1f},{by0 - 26:.1f} {bx1 - 2:.1f},{by0 + 2:.1f}", "none", INK, 3.2))
    out.append(path(f"M{bx0 + 2:.1f},{by0 + 2:.1f} C{bx0 + 10:.1f},{by0 - 26:.1f} {bx1 - 10:.1f},{by0 - 26:.1f} {bx1 - 2:.1f},{by0 + 2:.1f}", "none", "#8E9598", 1.6))
    out.append(path(poly([(624, 432), (648, 432), (650, 448), (622, 448)]), "#7E8588", INK, 1.6))
    write("fightfront", (-60, -30, 720, 520), [(out, 0.7, 14.0)])

if __name__ == "__main__":
    fightback()
    fightlamp()
    fightfront()
