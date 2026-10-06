"""Emotown's Fight Club (2026-09-28, the Fight Club sandbox) -> packages/pet/town/arena.svg

The dive bar at the far end of the street, with the fights in the basement under it (the film's bar; its first fight was
out in the lot). Drawn like the rest of the town (town.py: flat fills, wobbly black ink, the night palette), and the
darkest, dingiest thing on the street: a two-storey front of old soot-streaked brick, patched and cracked, under a
rusty sheet-metal cornice; on the roof a steel lattice holding a blank dark board (the site writes the bar's name in
neon over it), a wooden water tank on its stand and a rusty air-conditioning unit.

Upstairs, five sash windows: one faintly lit behind a torn blind, one with an old window unit dripping down the brick,
one patched with cardboard, a pigeon on a sill; a fire escape zig-zags over the two on the left (a balcony, a ladder up
to the roof, a stair hanging down), and a drainpipe runs down past a broken joint. Downstairs: a barred front window of
dark amber glass (the back bar, the counter and stools barely there inside) with two unlit neon tubes in it, a beer
glass and an empty sign frame (#neon-beer, #neon-open), a narrow barred window with an unlit cocktail glass
(#neon-cocktail), the scuffed red door with its wired-glass window and a step, and a small blank chalkboard beside it
(the site writes on it). Torn fight posters (two pets squaring up; pictures only) are pasted on the brick by the
dumpster; trash bags, kegs and beer crates stand at the foot, and a puddle lies on the pavement.

At the right end, the way down: the ground floor's last bay stands open, a dark recess under the beam. Inside, the
stair runs down along its back wall from a lit landing by the gate, step by step into the dark (its lit zigzag is what
reads as steps at street size), a pipe handrail following it down; at the bottom the basement's steel door, only its top
half above the street, a peephole slot in it and a sliver of light down its edge (#doorcrack). An iron railing with
spear tops guards the drop along the pavement, its gate swung open; a caged bulb hangs over it (#bulb) with its cone and
pool of light (#bulbpool). No text anywhere: every word is HTML over the drawing.

    python3 packages/pet/design/town_arena.py            (--anchors prints the rects the site lays light over)
"""
import os, sys, math, json, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town import (rect, rrect, rrect_d, line, lit_glass, path, ellipse, poly, smooth_closed, smooth_open,
                  INK, PINK, GOLD, GOLD2, RUBY, LAV, FUR, LB, LM, LT, NIGHT, ROOF, ROOF2, WALL4, TRIM, TRIM2,
                  STEEL3, BRICK, BRICK2, STONE, STONE2, WOOD, WOOD2, LIT, LIT2, LITDIM, DARKWIN, SHADE)
from town_spooky import svgx, Raw, wpath, clip

W, H = 620, 470
G = H - 16

# ---- the bar's own colours: the town's night palette, dirtier ----
BR    = "#44203A"   # soot-dark brick
BR2   = "#2C1224"   # mortar
BRL   = "#57294A"   # a lighter brick here and there
BRD   = "#361830"   # a darker one
BRP   = "#6A3450"   # the patch: newer brick, not yet sooted
SOOT  = "#0E0614"
RUST  = "#7A3E36"; RUST2 = "#55262A"; RUSTL = "#A45A3E"
CON   = "#5A506A"; CON2 = "#433A52"; CONL = "#786D8A"; COND = "#241D2E"
STL   = "#2A2136"; STLH = "#5E4E78"          # the sign frame's steel, its moonlit edge
BOARD = "#150C20"
DOOR  = "#8B1A2D"; DOORD = "#62121F"; DOORL = "#B5424F"
FRAME = "#2E1A26"
SASH  = "#4A3A5C"; SASH2 = "#35294A"
IRONB = "#1C1426"                            # the window bars
TUBE  = "#7E6F92"; TUBEC = "#B2A6C4"         # an unlit neon tube: dark glass, its pale core
DUMP  = "#26433F"; DUMPL = "#36605A"; DUMPD = "#1A2E2C"
KEG   = "#7A7090"; KEGL = "#A89EBB"; KEGD = "#554C68"
CRATE_R = "#7B302A"; CRATE_RD = "#55201D"; CRATE_G = "#2E4A39"; CRATE_GD = "#1F3428"
BAG   = "#1B1724"; BAGL = "#4A4262"
PIGEON = "#8A809E"; PIGEON2 = "#6A6080"
SLATEB = "#20262A"                           # the chalkboard
CHALK = "#D8D2C6"

ANCH = {}
def box(name, x, y, w, h, **kw):
    ANCH[name] = dict({"x": round(x, 1), "y": round(y, 1), "w": round(w, 1), "h": round(h, 1)}, **kw)

def fr(a, b, s):
    out = []; v = a
    while v < b - 1e-6: out.append(v); v += s
    return out

def solid(rects, fill, op=None):
    """Many little unbaked rectangles in one path (brick tones, grime specks): no wobble, no per-shape overhead."""
    d = "".join(f"M{x:.0f},{y:.0f}h{w:.0f}v{h:.0f}h{-w:.0f}z" for (x, y, w, h) in rects)
    o = f' opacity="{op}"' if op is not None else ""
    return Raw(f'<path d="{d}" fill="{fill}"{o}/>')

def dots(pts, r, fill, op=None, stroke=None, sw=0.8):
    o = f' opacity="{op}"' if op is not None else ""
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return [Raw(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}"{s}{o}/>') for (x, y) in pts]

# ---------------------------------------------------------------- pieces
def brickwork(x0, y0, x1, y1, bw=30, bh=11, op=0.85, seed=1, tones=True):
    """Mortar over a wall already filled with brick, and a scatter of lighter and darker bricks."""
    rows = [[(x0 + 1, y), (x1 - 1, y)] for y in fr(y0 + bh, y1 - 1, bh)]
    joints = []; light = []; dark = []
    rnd = random.Random(seed); row = 0
    for y in fr(y0, y1 - 1, bh):
        off = bw / 2 if row % 2 else 0
        xs = [x0] + [x for x in fr(x0 + off + bw, x1 - 2, bw)] + [x1]
        for x in xs[1:-1]:
            joints.append([(x, y + 1), (x, min(y + bh, y1) - 1)])
        if tones:
            for a, b in zip(xs, xs[1:]):
                r = rnd.random()
                if r < 0.10: light.append((a + 1, y + 1, b - a - 2, min(bh, y1 - y) - 2))
                elif r < 0.22: dark.append((a + 1, y + 1, b - a - 2, min(bh, y1 - y) - 2))
        row += 1
    out = []
    if light: out.append(solid(light, BRL, 0.7))
    if dark: out.append(solid(dark, BRD, 0.8))
    out.append(wpath(rows, BR2, 1.25, op, seg=34)); out.append(wpath(joints, BR2, 1.1, op))
    return out

def sash(x, y, w, h, glass=DARKWIN):
    """A sash window in a brick wall: a soldier-course lintel, the painted frame, the glass."""
    out = [rect(x - 6, y - 12, w + 12, 12, BRD, INK, LM)]
    out.append(wpath([[(xx, y - 11), (xx, y - 1)] for xx in fr(x - 1, x + w + 4, 7)][1:], BR2, 1.0, 0.8))
    out.append(rect(x - 3, y - 3, w + 6, h + 5, SASH2, INK, LM))
    out.append(rect(x, y, w, h, glass, INK, LB))
    return out

def sill(x, y, w, h):
    return [rect(x - 8, y + h + 2, w + 16, 7, STONE2, INK, LM), line(x - 6, y + h + 11, x + w + 6, y + h + 11, SHADE, 2.6, 'opacity="0.35"')]

def muntins(x, y, w, h):
    rail = y + h * 0.48
    return [rect(x, rail - 2, w, 5, SASH, INK, 1.1), line(x + w / 2, y + 2, x + w / 2, y + h - 2, SASH, 3.0),
            line(x + w / 2, y + 2, x + w / 2, y + h - 2, INK, 0.9, 'opacity="0.6"')]

def tube(d, width=4.2, core=2.0):
    """An unlit neon tube: dark glass with its pale core."""
    return [path(d, "none", INK, width), path(d, "none", TUBE, width - 1.6), path(d, "none", TUBEC, core * 0.55, 'opacity="0.7"')]

def pet_cat(cx, fy, s, fill, flip=1):
    """A cat's silhouette standing up to fight: ears, a round head, a body, a raised paw (for posters)."""
    k = lambda x, y: (cx + x * s * flip, fy + y * s)
    body = [k(-9, 0), k(-10, -16), k(-8, -26), k(-11, -34), k(-12, -46), k(-9, -52), k(-6, -48), k(0, -50), k(6, -48),
            k(9, -52), k(12, -44), k(11, -34), k(8, -26), k(12, -22), k(16, -28), k(19, -26), k(14, -16), k(9, -14), k(9, 0)]
    return [path(smooth_closed(body, 0.3), fill, "none", 0)]

def pet_log(cx, fy, s, fill, flip=1):
    """Sahur's silhouette: the tall log, stick legs, the bat raised."""
    k = lambda x, y: (cx + x * s * flip, fy + y * s)
    P = lambda x, y: f"{k(x, y)[0]:.1f},{k(x, y)[1]:.1f}"
    out = [path(smooth_closed([k(-8, -16), k(-9, -52), k(-6, -56), k(6, -56), k(9, -52), k(8, -16)], 0.3), fill, "none", 0)]
    out.append(path(f"M{P(-4,-17)} L{P(-6,0)} M{P(4,-17)} L{P(6,0)}", "none", fill, 3.2 * s))
    out.append(path(f"M{P(-8,-36)} L{P(-15,-44)}", "none", fill, 3.4 * s))
    out.append(path(f"M{P(-14,-42)} L{P(-20,-64)}", "none", fill, 5.0 * s))
    return out

def pet_frok(cx, fy, s, fill, flip=1):
    """The frok's silhouette: the big round head with its eye bumps, the robe, a fist up."""
    k = lambda x, y: (cx + x * s * flip, fy + y * s)
    return [path(smooth_closed([k(-12, 0), k(-10, -22), k(-12, -32), k(-14, -42), k(-10, -50), k(-4, -52), k(0, -56), k(6, -55),
                                k(10, -50), k(14, -44), k(11, -34), k(10, -24), k(15, -22), k(19, -30), k(21, -27), k(15, -16),
                                k(10, -14), k(12, 0)], 0.3), fill, "none", 0)]

def jag(a, b, n=13, amp=1.5, seed=0):
    """A torn paper edge from a to b: n little zigzags either side of the straight line."""
    rnd = random.Random(seed); dx, dy = b[0] - a[0], b[1] - a[1]; L_ = math.hypot(dx, dy) or 1; nx, ny = -dy / L_, dx / L_
    pts = [a]
    for i in range(1, n):
        t = i / n + (rnd.random() - 0.5) * 0.6 / n; o = amp * (rnd.random() * 2 - 1) + amp * 0.6 * (1 if i % 3 == 0 else 0)
        pts.append((a[0] + dx * t + nx * o, a[1] + dy * t + ny * o))
    return pts + [b]

def poster(x, y, w, h, bg, ink, left, right, tear=None, star=GOLD2, cid="brp"):
    """A wild-posted fight bill: two pets squaring up under a star burst, blank bands where the words would go.
    `tear` = 'tr' | 'bl' | 'br': that corner is torn off along a ragged edge, the brick showing through."""
    A, B, C, D = (x, y), (x + w, y), (x + w, y + h), (x, y + h)
    edge = None
    if tear == "tr":
        edge = jag((x + w * 0.52, y), (x + w, y + h * 0.42), seed=len(cid)); outline = [A] + edge + [C, D]
    elif tear == "bl":
        edge = jag((x + w * 0.5, y + h), (x, y + h * 0.56), seed=len(cid) + 3); outline = [A, B, C] + edge
    elif tear == "br":
        edge = jag((x + w, y + h * 0.5), (x + w * 0.45, y + h), seed=len(cid) + 5); outline = [A, B] + edge + [D]
    else:
        outline = [A, B, C, D]
    out = [path(poly(outline), bg, INK, LM), clip(cid, outline), Raw(f'<g clip-path="url(#{cid})">')]
    fy = y + h - 10; s = w / 64
    out += left(x + w * 0.29, fy, s, ink, 1); out += right(x + w * 0.71, fy, s, ink, -1)
    cx, cy = x + w / 2, y + h * 0.42; r0, r1 = w * 0.14, w * 0.07
    burst = [(cx + (r0 if i % 2 == 0 else r1) * math.cos(math.pi * i / 6), cy + (r0 if i % 2 == 0 else r1) * math.sin(math.pi * i / 6)) for i in range(12)]
    out.append(path(poly(burst), star, INK, LT))
    out.append(rect(x + 4, y + 4, w - 8, h * 0.13, ink, "none", 0, 'opacity="0.55"'))
    out.append(rect(x + 5, y + h - 8, w - 10, 4, ink, "none", 0, 'opacity="0.5"'))
    out.append(Raw('</g>'))
    if edge:
        out.append(path(smooth_open(edge, 0.1), "none", "#E6DCC8", 0.9, 'opacity="0.6"'))
    return out

def pigeon(x, y, s=1.0, flip=1):
    k = lambda a, b: (x + a * s * flip, y + b * s)
    P = lambda a, b: f"{k(a, b)[0]:.1f},{k(a, b)[1]:.1f}"
    out = [path(smooth_closed([k(-9, -2), k(-4, -8), k(4, -8), k(8, -5), k(7, 0), k(-2, 1), k(-12, -1)], 0.45), PIGEON, INK, 1.1)]
    out.append(path(smooth_closed([k(4, -8), k(6, -13), k(10, -13), k(11, -9), k(8, -5)], 0.5), PIGEON2, INK, 1.0))
    out.append(path(f"M{P(11,-11)} L{P(14,-10)}", "none", INK, 1.0))
    out.append(path(f"M{P(-3,-5)} Q{P(1,-3)} {P(5,-5)}", "none", PIGEON2, 1.2))
    out += dots([k(9, -11)], 0.9, INK)
    return out

# ---------------------------------------------------------------- the bar
def arena():
    g = []
    defs = (lit_glass("brglass", "#6E4826", "#2E1C12")
            + lit_glass("brdim", "#8E5A34", "#4A2A1A")
            + '<linearGradient id="brsoot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0614" stop-opacity="0.75"/>'
              '<stop offset="0.35" stop-color="#0E0614" stop-opacity="0.2"/><stop offset="0.75" stop-color="#0E0614" stop-opacity="0"/>'
              '<stop offset="1" stop-color="#0E0614" stop-opacity="0.35"/></linearGradient>'
            + '<linearGradient id="brdown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07040B" stop-opacity="0"/><stop offset="0.45" stop-color="#07040B" stop-opacity="0.35"/><stop offset="1" stop-color="#07040B" stop-opacity="0.95"/></linearGradient>'
            + '<linearGradient id="brback" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E1428"/><stop offset="0.5" stop-color="#2A1A30"/><stop offset="1" stop-color="#0E0914"/></linearGradient>'
            + '<linearGradient id="brland" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3E3550"/><stop offset="1" stop-color="#6A5E7E"/></linearGradient>'
            + '<radialGradient id="brpool" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFE3A0" stop-opacity="0.55"/><stop offset="1" stop-color="#FFE3A0" stop-opacity="0"/></radialGradient>'
            + '<linearGradient id="brcone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3A0" stop-opacity="0.3"/><stop offset="1" stop-color="#FFE3A0" stop-opacity="0.05"/></linearGradient>')

    X0, X1 = 20, 600          # the front
    TOP = 128                 # under the cornice
    BEAM = 286                # the storefront beam over the ground floor

    # ================================================================ the roof: AC unit, vent, sign lattice, water tank
    g.append(rect(36, 78, 70, 34, "#4E4562", INK, LB))
    g.append(wpath([[(40, y), (66, y)] for y in fr(84, 108, 4.5)], "#2E2740", 1.3, 0.9))
    g.append(f'<circle cx="86" cy="95" r="13" fill="#2A2236" stroke="{INK}" stroke-width="{LM}"/>')
    g.append(path("M86,82 L86,108 M73,95 L99,95 M77,86 L95,104 M95,86 L77,104", "none", "#4E4562", 1.3))
    g.append(f'<circle cx="86" cy="95" r="3" fill="#6A6080" stroke="{INK}" stroke-width="0.9"/>')
    g.append(path("M36,108 L106,108 L106,112 L36,112 Z", RUST2, INK, LM))
    g.append(line(40, 80, 100, 80, "#7A6E92", 1.3, 'opacity="0.6"'))
    g.append(path("M100,112 L100,100 C100,94 104,92 110,92 L118,92 L118,100 L110,100 L108,112 Z", "#3E3650", INK, LM))
    g.append(wpath([[(58, 106), (58, 112)], [(82, 108), (80, 112)]], RUSTL, 2.0, 0.5))
    g.append(rect(124, 70, 8, 42, "#3A3148", INK, LM))
    g.append(path("M118,70 L138,70 L134,64 L122,64 Z", "#4E4562", INK, LM))
    # the sign: a steel lattice holding the blank board (the site writes the name in neon on it)
    BX, BY, BW, BH = 138, 8, 270, 60
    for px in (158, 273, 388):
        g.append(rect(px - 4, BY + BH - 4, 8, 112 - (BY + BH - 4), STL, INK, LM))
        g.append(line(px - 2, BY + BH, px - 2, 110, STLH, 1.1, 'opacity="0.55"'))
    for (a, b) in ((158, 273), (273, 388)):
        g.append(line(a + 4, BY + BH + 3, b - 4, 101, STL, 2.4)); g.append(line(b - 4, BY + BH + 3, a + 4, 101, STL, 2.4))
        g.append(line(a + 4, BY + BH + 3, b - 4, 101, INK, 0.8, 'opacity="0.7"')); g.append(line(b - 4, BY + BH + 3, a + 4, 101, INK, 0.8, 'opacity="0.7"'))
    g.append(rect(150, 100, 246, 5, STL, INK, 1.2))
    g.append(rect(150, BY + BH + 1, 246, 4, STL, INK, 1.0))
    g.append(rect(BX, BY, BW, BH, STL, INK, LB))
    g.append(rect(BX + 6, BY + 6, BW - 12, BH - 12, BOARD, INK, LM))
    g.append(line(BX + 3, BY + 3, BX + BW - 3, BY + 3, STLH, 1.4, 'opacity="0.6"'))
    g += dots([(BX + 3, BY + 3), (BX + BW - 3, BY + 3), (BX + 3, BY + BH - 3), (BX + BW - 3, BY + BH - 3), (BX + BW / 2, BY + 3), (BX + BW / 2, BY + BH - 3)], 1.6, "#6A5A80", None, INK, 0.7)
    g.append(wpath([[(BX + 44, BY + BH), (BX + 45, BY + BH + 14)], [(BX + 200, BY + BH), (BX + 199, BY + BH + 20)]], RUSTL, 1.8, 0.45))
    g.append(path(f"M{BX + BW - 30},{BY + BH} C{BX + BW - 28},{BY + BH + 16} {BX + BW - 40},{BY + BH + 20} {BX + BW - 42},112", "none", INK, 1.6))
    box("sign", BX + 6, BY + 6, BW - 12, BH - 12)
    # the water tank on its stand
    TX, TW = 474, 84; tcx = TX + TW / 2
    for lx in (TX + 6, TX + 30, TX + TW - 30, TX + TW - 6):
        g.append(rect(lx - 3, 72, 6, 40, STL, INK, 1.2))
    g.append(line(TX + 8, 76, TX + TW - 8, 106, STL, 2.2)); g.append(line(TX + TW - 8, 76, TX + 8, 106, STL, 2.2))
    g.append(rect(TX - 4, 66, TW + 8, 7, "#3A2F4A", INK, LM))
    g.append(path(f"M{TX + 2},28 L{TX + TW - 2},28 L{TX + TW},66 L{TX},66 Z", WOOD, INK, LB))
    g.append(wpath([[(x, 30), (x + (x - tcx) * 0.02, 64)] for x in fr(TX + 8, TX + TW - 4, 8)], WOOD2, 1.1, 0.85))
    g.append(path(f"M{TX + TW - 18},30 L{TX + TW - 2},30 L{TX + TW},64 L{TX + TW - 16},64 Z", SHADE, "none", 0, 'opacity="0.25"'))
    g.append(line(TX + 6, 32, TX + 5, 62, "#8A6A80", 1.6, 'opacity="0.45"'))
    for hy in (36, 48, 60):
        g.append(path(f"M{TX + 1},{hy} Q{tcx},{hy + 4} {TX + TW - 1},{hy}", "none", "#1E1828", 2.2))
    g.append(path(f"M{TX - 4},29 L{tcx},8 L{TX + TW + 4},29 Z", ROOF2, INK, LB))
    g.append(line(TX + 2, 27, tcx - 2, 11, "#6E5E88", 1.4, 'opacity="0.5"'))
    g.append(path(f"M{tcx - 7},18 L{tcx + 7},18 L{tcx + 5},23 L{tcx - 5},23 Z", "#3A2F4A", INK, 1.0))
    g += dots([(tcx, 6)], 2.6, "#3A2F4A", None, INK, 0.9)
    g.append(wpath([[(TX - 9, yy), (TX - 3, yy)] for yy in fr(36, 112, 7)], STL, 1.3))
    g.append(line(TX - 9, 30, TX - 9, 112, STL, 1.6)); g.append(line(TX - 3, 30, TX - 3, 112, STL, 1.6))
    g.append(wpath([[(TX + 40, 66), (TX + 41, 78)], [(TX + 62, 66), (TX + 62, 74)]], "#2A1828", 2.4, 0.5))

    # ================================================================ the front wall
    g.append(rect(X0, TOP, X1 - X0, G - TOP, BR, INK, LB))
    g += brickwork(X0, TOP + 2, X1, BEAM, 30, 11, 0.85, 3)
    g += brickwork(X0, BEAM + 14, X1, G - 14, 30, 11, 0.6, 5)
    patch = [(300, 140), (344, 140), (344, 151), (360, 151), (360, 173), (330, 173), (330, 162), (300, 162)]
    g.append(path(poly(patch), BRP, "none", 0, 'opacity="0.75"'))
    g.append(wpath([[(300, 151), (344, 151)], [(330, 162), (360, 162)], [(315, 140), (315, 151)], [(330, 151), (330, 162)], [(345, 162), (345, 173)]], BR2, 1.1, 0.9))
    g.append(path("M262,262 L266,272 L262,280 L268,286", "none", INK, 1.2, 'opacity="0.8"'))
    g.append(path("M560,200 L556,214 L562,224 L558,236", "none", INK, 1.1, 'opacity="0.7"'))
    g.append(rect(X0 + 1, TOP, X1 - X0 - 2, G - TOP, "url(#brsoot)", "none", 0))

    # ================================================================ upstairs windows
    WY, WH, WW = 160, 88, 58
    wins = [88, 200, 312, 424, 536]
    for i, cx in enumerate(wins):
        x = cx - WW / 2
        glass = "url(#brdim)" if i == 3 else DARKWIN
        g += sash(x, WY, WW, WH, glass)
        if i == 0:
            g.append(path(f"M{x},{WY} L{x + 16},{WY} L{x + 10},{WY + 30} L{x + 14},{WY + 50} L{x},{WY + 58} Z", "#3A2848", "none", 0, 'opacity="0.9"'))
            g.append(path(f"M{x + 34},{WY + 10} L{x + 40},{WY + 20} L{x + 36},{WY + 26} L{x + 46},{WY + 30}", "none", "#8E86A6", 1.1, 'opacity="0.8"'))
        if i == 2:
            g.append(rect(x + 31, WY + 48, 24, 36, "#7A5A3B", INK, 1.1))
            g.append(line(x + 33, WY + 60, x + 53, WY + 58, "#5E4430", 1.4, 'opacity="0.8"'))
            g.append(line(x + 31, WY + 52, x + 55, WY + 50, "#C8B890", 2.2, 'opacity="0.7"'))
        if i == 3:
            bl = [(x, WY), (x + WW, WY), (x + WW, WY + 52), (x + 50, WY + 56), (x + 46, WY + 50), (x + 40, WY + 60), (x + 33, WY + 54),
                  (x + 26, WY + 62), (x + 20, WY + 53), (x + 12, WY + 58), (x + 6, WY + 51), (x, WY + 55)]
            g.append(path(poly(bl), "#A8845A", "none", 0, 'opacity="0.9"'))
            g.append(path(smooth_open(bl[2:], 0.2), "none", "#6A4630", 1.3))
            g.append(path(f"M{x + 22},{WY + 16} L{x + 30},{WY + 36} L{x + 26},{WY + 40} L{x + 18},{WY + 22} Z", "#E0A868", INK, 0.9, 'opacity="0.85"'))
            for yy in (WY + 14, WY + 28, WY + 42):
                g.append(line(x + 3, yy, x + WW - 3, yy, "#A07A50", 1.0, 'opacity="0.55"'))
            g.append(path(f"M{x + 28},{WY + 57} L{x + 28},{WY + 68}", "none", "#3A2418", 1.0))
            g += dots([(x + 28, WY + 69)], 1.6, "#3A2418")
            g.append(path(f"M{x + 40},{WY + WH} L{x + 40},{WY + 72} L{x + 43},{WY + 66} L{x + 46},{WY + 72} L{x + 46},{WY + WH} Z", "#2A1810", "none", 0))
            box("win_up_lit", x, WY, WW, WH, note="faint warm light behind a torn blind")
        g += muntins(x, WY, WW, WH)
        g.append(rect(x, WY, WW, WH, "none", INK, LB))
        g.append(line(x + 5, WY + 5, x + 5, WY + 36, "#FFFFFF", 1.4, 'opacity="0.18"'))
        if i == 1:
            g.append(rect(x + 3, WY + 50, WW - 6, 32, "#5E5672", INK, LM))
            g.append(wpath([[(x + 8, y), (x + WW - 8, y)] for y in fr(WY + 56, WY + 78, 4)], "#3A3248", 1.2, 0.9))
            g.append(rect(x - 2, WY + 80, WW + 4, 5, "#3E3650", INK, 1.1))
            g.append(wpath([[(x + 40, WY + 90), (x + 41, WY + 150)]], "#12080E", 4.0, 0.3))
        g += sill(x, WY, WW, WH)
        g.append(wpath([[(x + 2, WY + WH + 12), (x + 1, WY + WH + 26)], [(x + WW - 3, WY + WH + 12), (x + WW - 2, WY + WH + 30)]], SOOT, 3.0, 0.3))
    g += pigeon(546, WY + WH + 1, 0.9, -1)

    # ================================================================ the cornice (rusty sheet metal on brackets)
    g.append(rect(8, 104, 604, 10, RUST, INK, LB))
    g.append(rect(14, 113, 592, 15, RUST2, INK, LB))
    g.append(line(12, 106, 608, 106, RUSTL, 1.4, 'opacity="0.6"'))
    for bx in fr(30, 600, 36):
        g.append(path(f"M{bx - 5},128 L{bx + 5},128 L{bx + 5},134 Q{bx},142 {bx - 5},134 Z", RUST, INK, 1.1))
    g.append(path("M226,113 L262,113 L258,128 L230,128 Z", NIGHT, INK, 1.1))
    g.append(path("M258,114 L270,120 L266,134 L256,126 Z", RUST, INK, 1.1))
    g.append(wpath([[(x, 136), (x + 0.5, 136 + ln)] for (x, ln) in ((46, 40), (118, 22), (190, 52), (244, 30), (334, 44), (406, 26), (478, 60), (550, 34))], RUSTL, 2.4, 0.28))
    g.append(wpath([[(x, 134), (x + 0.3, 134 + ln)] for (x, ln) in ((82, 70), (154, 90), (282, 60), (370, 110), (442, 80), (514, 70), (586, 96))], SOOT, 5.0, 0.22))
    g += pigeon(150, 104, 1.0, 1); g += pigeon(452, 104, 0.95, -1)
    g += dots([(150, 116), (152, 124), (451, 118), (448, 130)], 1.2, "#E8E4EC", 0.7)

    # ================================================================ the fire escape (over the two left windows)
    FE0, FE1, FY = 40, 246, 256
    g.append(path(f"M{FE0 + 96},{FY + 6} L{FE0 + 18},{FY + 76} L{FE0 + 10},{FY + 76} L{FE0 + 88},{FY + 6} Z", "none", IRONB, 2.6))
    g.append(wpath([[(FE0 + 88 - k * 11, FY + 6 + k * 9.9), (FE0 + 96 - k * 11, FY + 6 + k * 9.9)] for k in range(1, 8)], IRONB, 2.2))
    g.append(line(FE0 + 104, FY - 28, FE0 + 26, FY + 44, IRONB, 2.0))
    g.append(line(FE0 + 26, FY + 44, FE0 + 18, FY + 76, IRONB, 2.0))
    g.append(rect(FE0 + 98, FY + 8, 10, 14, "#3A3148", INK, 1.2))
    g.append(rect(FE0, FY, FE1 - FE0, 6, IRONB, INK, LM))
    g.append(wpath([[(x, FY + 1), (x, FY + 5)] for x in fr(FE0 + 4, FE1 - 2, 6)], "#4A3E5E", 1.0, 0.8))
    for bx in (FE0 + 20, FE0 + 104, FE1 - 20):
        g.append(line(bx, FY + 6, bx + 14, FY + 28, IRONB, 2.4))
    g.append(line(FE0, FY - 34, FE1, FY - 34, IRONB, 3.0))
    g.append(line(FE0, FY - 34, FE1, FY - 34, "#6A5A82", 1.0, 'opacity="0.5"'))
    g.append(line(FE0, FY - 20, FE1, FY - 20, IRONB, 1.8))
    g.append(wpath([[(x, FY - 34), (x, FY)] for x in fr(FE0 + 8, FE1 - 2, 8)], IRONB, 1.3))
    for px in (FE0, FE1):
        g.append(line(px, FY - 36, px, FY + 2, IRONB, 3.2))
    LX = 238
    g.append(path(f"M{LX},{FY - 34} L{LX},112 C{LX},100 {LX + 4},96 {LX + 10},96 L{LX + 16},96", "none", IRONB, 2.4))
    g.append(path(f"M{LX + 10},{FY - 34} L{LX + 10},112 C{LX + 10},106 {LX + 12},104 {LX + 16},104", "none", IRONB, 2.4))
    g.append(wpath([[(LX, y), (LX + 10, y)] for y in fr(118, FY - 34, 9)], IRONB, 1.8))
    g.append(line(LX + 1, 116, LX + 1, FY - 36, "#6A5A82", 0.9, 'opacity="0.45"'))
    g.append(wpath([[(FE0 + 60, FY + 8), (FE0 + 61, FY + 30)], [(FE1 - 40, FY + 8), (FE1 - 39, FY + 24)]], RUSTL, 1.8, 0.35))

    # ================================================================ the drainpipe
    DPX = 478
    dp = f"M{DPX - 14},126 L{DPX - 14},136 L{DPX - 4},148 L{DPX - 4},{G - 12}"
    g.append(path(dp, "none", INK, 9.0)); g.append(path(dp, "none", "#4A4058", 6.0))
    g.append(line(DPX - 6, 152, DPX - 6, G - 14, "#7A6E90", 1.2, 'opacity="0.55"'))
    for yy in (180, 250, 330, 400):
        g.append(rect(DPX - 10, yy, 12, 4, "#2E2640", INK, 1.0))
    g.append(rect(DPX - 9, 214, 10, 8, RUST, INK, 1.1))
    g.append(path(f"M{DPX - 9},222 C{DPX - 16},240 {DPX - 6},262 {DPX - 14},300 L{DPX - 4},300 C{DPX - 2},262 {DPX + 2},240 {DPX - 1},222 Z", "#12080E", "none", 0, 'opacity="0.35"'))
    g.append(path(f"M{DPX - 8},{G - 14} L{DPX - 8},{G - 6} L{DPX + 6},{G - 2} L{DPX + 6},{G - 8} Z", "#4A4058", INK, 1.3))

    # ================================================================ the storefront beam
    g.append(rect(X0 - 2, BEAM, X1 - X0 + 4, 14, RUST2, INK, LB))
    g.append(line(X0, BEAM + 3, X1, BEAM + 3, RUSTL, 1.3, 'opacity="0.55"'))
    g += dots([(x, BEAM + 7) for x in fr(30, 600, 20)], 1.4, RUST, None, INK, 0.6)
    g.append(wpath([[(x, BEAM + 14), (x + 0.4, BEAM + 14 + ln)] for (x, ln) in ((70, 20), (140, 30), (250, 18), (392, 26), (520, 34), (590, 16))], RUSTL, 2.2, 0.3))

    # ================================================================ ground floor, left: posters over the dumpster
    g += poster(36, 314, 44, 58, "#8A3A4A", "#1E1024", pet_cat, pet_log, tear="tr", cid="brpa")
    g += poster(84, 322, 42, 56, "#9C7E4A", "#221426", pet_frok, pet_cat, tear="bl", star=PINK, cid="brpbb")
    g += poster(128, 312, 26, 38, "#5A4A7A", "#1A1024", pet_cat, pet_frok, tear="br", cid="brpccc")
    g.append(wpath([[(40, 312), (40, 309)], [(78, 312), (78, 309)], [(88, 320), (88, 317)]], "#C8B890", 2.0, 0.8))

    # ================================================================ the front window (barred, dark amber, the bar inside)
    AX, AY, AW, AH = 164, 318, 124, 80
    g.append(rect(AX - 6, AY - 6, AW + 12, AH + 12, FRAME, INK, LB))
    g.append(rect(AX, AY, AW, AH, "url(#brglass)", INK, LB))
    g.append(clip("brwinA", [(AX, AY), (AX + AW, AY), (AX + AW, AY + AH), (AX, AY + AH)]))
    g.append(Raw('<g clip-path="url(#brwinA)">'))
    IN = "#1E120C"
    g.append(rect(AX, AY + 20, AW, 3, IN, "none", 0, 'opacity="0.6"'))
    g.append(rect(AX, AY + 34, AW, 3, IN, "none", 0, 'opacity="0.6"'))
    bottles = []
    for bx in fr(AX + 6, AX + AW - 4, 9):
        h = 9 + (int(bx) * 7 % 5)
        bottles.append(f"M{bx:.0f},{AY + 20}v{-h + 4}l2,-3v-3h2v3l2,3v{h - 4}z")
        bottles.append(f"M{bx + 4:.0f},{AY + 34}v-7l2,-3v-2h2v2l2,3v7z")
    g.append(Raw(f'<path d="{"".join(bottles)}" fill="{IN}" opacity="0.55"/>'))
    g.append(rect(AX, AY + 52, AW, 28, IN, "none", 0, 'opacity="0.55"'))
    g.append(line(AX, AY + 52, AX + AW, AY + 52, "#C88A4E", 1.6, 'opacity="0.45"'))
    for sx in fr(AX + 14, AX + AW, 26):
        g.append(ellipse(sx, AY + 62, 8, 3, "#140A08", "none", 0, 'opacity="0.7"'))
        g.append(line(sx, AY + 64, sx, AY + 80, "#140A08", 2.2, 'opacity="0.7"'))
    g.append(ellipse(AX + 88, AY + 8, 12, 4, "#E0A060", "none", 0, 'opacity="0.18"'))
    g.append(Raw('</g>'))
    g.append(Raw('<g id="neon-beer">'))
    g += tube(f"M{AX + 15},{AY + 24} L{AX + 17},{AY + 60} L{AX + 39},{AY + 60} L{AX + 41},{AY + 24}")
    g += tube(smooth_open([(AX + 12, AY + 25), (AX + 12, AY + 17), (AX + 19, AY + 12), (AX + 26, AY + 15), (AX + 33, AY + 10), (AX + 41, AY + 14), (AX + 44, AY + 22), (AX + 42, AY + 30)], 0.45))
    g += tube(f"M{AX + 41},{AY + 30} C{AX + 52},{AY + 30} {AX + 52},{AY + 50} {AX + 40},{AY + 50}")
    g.append(Raw('</g>'))
    box("neon-beer", AX + 10, AY + 8, 42, 54, lit="#F6B23C", note="amber beer glass, white foam")
    g.append(Raw('<g id="neon-open">'))
    g += tube(rrect_d(AX + 60, AY + 20, 56, 30, 8))
    g += tube(rrect_d(AX + 64, AY + 24, 48, 22, 5), 3.0)
    g.append(line(AX + 70, AY - 6, AX + 66, AY + 20, "#4A4058", 1.0)); g.append(line(AX + 106, AY - 6, AX + 110, AY + 20, "#4A4058", 1.0))
    g.append(Raw('</g>'))
    box("neon-open", AX + 58, AY + 18, 60, 34, lit="#FF3B6E", note="an OPEN sign's frame; the word goes inside")
    g.append(wpath([[(x, AY - 4), (x, AY + AH + 4)] for x in fr(AX + 11, AX + AW - 4, 14)], IRONB, 2.6))
    g.append(wpath([[(x - 0.8, AY), (x - 0.8, AY + AH)] for x in fr(AX + 11, AX + AW - 4, 14)], "#5E5078", 0.8, 0.6))
    g.append(rect(AX - 2, AY + 18, AW + 4, 4, IRONB, INK, 1.0)); g.append(rect(AX - 2, AY + 58, AW + 4, 4, IRONB, INK, 1.0))
    g.append(line(AX + 5, AY + 6, AX + 5, AY + 44, "#FFFFFF", 1.4, 'opacity="0.15"'))
    g.append(rect(AX - 10, AY + AH + 6, AW + 20, 7, STONE2, INK, LM))
    box("win_front", AX, AY, AW, AH, note="dark amber glass: a dim warm glow")

    # ================================================================ the door, the step, the chalkboard
    DX0, DW, DY = 298, 62, 312
    g.append(rect(DX0 - 7, DY - 7, DW + 14, G - DY + 1, FRAME, INK, LB))
    g.append(rect(DX0, DY, DW, G - 6 - DY, DOOR, INK, LB))
    g.append(path(f"M{DX0 + 6},{DY + 6} L{DX0 + DW - 6},{DY + 6} L{DX0 + DW - 6},{G - 36} L{DX0 + 6},{G - 36} Z", "none", DOORD, 2.0, 'opacity="0.8"'))
    WX0, WY0, WWd, WHd = DX0 + 16, DY + 14, 30, 30
    g.append(rect(WX0 - 3, WY0 - 3, WWd + 6, WHd + 6, DOORD, INK, LM))
    g.append(rect(WX0, WY0, WWd, WHd, "url(#brglass)", INK, LM))
    mesh = []
    for k in range(-6, 7):
        mesh.append([(WX0 + k * 5, WY0), (WX0 + k * 5 + WHd, WY0 + WHd)]); mesh.append([(WX0 + k * 5 + WHd, WY0), (WX0 + k * 5, WY0 + WHd)])
    g.append(clip("brwire", [(WX0, WY0), (WX0 + WWd, WY0), (WX0 + WWd, WY0 + WHd), (WX0, WY0 + WHd)]))
    g.append(Raw('<g clip-path="url(#brwire)">')); g.append(wpath(mesh, "#1A0E0A", 0.8, 0.8, seg=60)); g.append(Raw('</g>'))
    g.append(line(WX0 + 4, WY0 + 4, WX0 + 10, WY0 + 12, "#FFFFFF", 1.2, 'opacity="0.25"'))
    box("win_door", WX0, WY0, WWd, WHd, note="the door's wired glass")
    g.append(path(f"M{DX0 + 8},{G - 30} C{DX0 + 18},{G - 36} {DX0 + 30},{G - 28} {DX0 + 44},{G - 34} L{DX0 + 50},{G - 22} L{DX0 + 10},{G - 20} Z", "#5A3A2E", "none", 0, 'opacity="0.8"'))
    g.append(rect(DX0 + 4, G - 22, DW - 8, 14, "#5E5672", INK, LM))
    g.append(path(f"M{DX0 + 14},{G - 20} L{DX0 + 20},{G - 14} M{DX0 + 38},{G - 19} L{DX0 + 42},{G - 12}", "none", INK, 1.0, 'opacity="0.7"'))
    g.append(rect(DX0 + 8, DY + 54, 12, 8, "#D8C890", INK, 0.9)); g.append(rect(DX0 + 24, DY + 58, 10, 10, "#8E3A56", INK, 0.9))
    g.append(rect(DX0 + 40, DY + 55, 14, 7, "#3E6A78", INK, 0.9, 'opacity="0.9"'))
    g.append(rect(DX0 + DW - 14, DY + 72, 6, 22, "#6A6080", INK, 1.1))
    g += dots([(DX0 + DW - 11, DY + 66)], 2.0, GOLD2, None, INK, 0.7)
    g.append(wpath([[(DX0 + 30, DY + 90), (DX0 + 34, DY + 96)], [(DX0 + 12, DY + 104), (DX0 + 20, DY + 102)], [(DX0 + 44, DY + 110), (DX0 + 50, DY + 116)]], DOORL, 1.4, 0.7))
    g.append(path(f"M{DX0 - 10},{G - 6} L{DX0 + DW + 10},{G - 6} L{DX0 + DW + 12},{G + 5} L{DX0 - 12},{G + 5} Z", CON, INK, LM))
    g.append(line(DX0 - 8, G - 4, DX0 + DW + 8, G - 4, CONL, 1.2, 'opacity="0.6"'))
    g.append(path(f"M{DX0 + DW + 2},{G - 6} L{DX0 + DW + 10},{G - 6} L{DX0 + DW + 8},{G} Z", COND, "none", 0))
    box("door", DX0, DY, DW, G - 6 - DY, cx=DX0 + DW / 2)
    CX0, CY0, CW, CH = 372, 322, 46, 60
    g.append(rect(CX0 - 4, CY0 - 4, CW + 8, CH + 8, WOOD, INK, LM))
    g.append(rect(CX0, CY0, CW, CH, SLATEB, INK, LM))
    g.append(path(f"M{CX0 + 6},{CY0 + 40} C{CX0 + 14},{CY0 + 36} {CX0 + 24},{CY0 + 44} {CX0 + 38},{CY0 + 38}", "none", CHALK, 3.0, 'opacity="0.1"'))
    g.append(path(f"M{CX0 + 8},{CY0 + 16} C{CX0 + 18},{CY0 + 12} {CX0 + 30},{CY0 + 20} {CX0 + 40},{CY0 + 14}", "none", CHALK, 4.0, 'opacity="0.08"'))
    g.append(rect(CX0 + 2, CY0 + CH + 4, CW - 4, 3, WOOD2, INK, 0.9))
    g.append(rect(CX0 + 30, CY0 + CH + 1, 8, 3, CHALK, "none", 0))
    g.append(line(CX0 + CW / 2, CY0 - 4, CX0 + CW / 2, CY0 - 10, INK, 1.2)); g += dots([(CX0 + CW / 2, CY0 - 11)], 1.6, "#6A6080", None, INK, 0.7)
    box("chalkboard", CX0, CY0, CW, CH)
    BX_, BY_, BW_, BH_ = 428, 318, 40, 80
    g.append(rect(BX_ - 5, BY_ - 5, BW_ + 10, BH_ + 10, FRAME, INK, LB))
    g.append(rect(BX_, BY_, BW_, BH_, "url(#brglass)", INK, LB))
    g.append(rect(BX_, BY_ + 52, BW_, 28, "#1E120C", "none", 0, 'opacity="0.5"'))
    g.append(Raw('<g id="neon-cocktail">'))
    g += tube(f"M{BX_ + 6},{BY_ + 14} L{BX_ + 34},{BY_ + 14} L{BX_ + 20},{BY_ + 36} Z")
    g += tube(f"M{BX_ + 20},{BY_ + 36} L{BX_ + 20},{BY_ + 56} M{BX_ + 11},{BY_ + 58} L{BX_ + 29},{BY_ + 58}")
    g += tube(f"M{BX_ + 26},{BY_ + 8} L{BX_ + 16},{BY_ + 26}", 3.2)
    g.append(f'<circle cx="{BX_ + 15}" cy="{BY_ + 22}" r="3.2" fill="{TUBE}" stroke="{INK}" stroke-width="1.2"/>')
    g.append(Raw('</g>'))
    box("neon-cocktail", BX_ + 3, BY_ + 5, 34, 56, lit="#4FD3E8", note="a cocktail glass (cyan) with a pink olive")
    g.append(wpath([[(x, BY_ - 3), (x, BY_ + BH_ + 3)] for x in fr(BX_ + 10, BX_ + BW_ - 2, 10)], IRONB, 2.6))
    g.append(rect(BX_ - 2, BY_ + 40, BW_ + 4, 4, IRONB, INK, 1.0))
    g.append(rect(BX_ - 8, BY_ + BH_ + 5, BW_ + 16, 7, STONE2, INK, LM))
    box("win_side", BX_, BY_, BW_, BH_, note="dark amber glass: a dim warm glow")

    # ================================================================ the way down: the basement stairwell at the right end
    # The ground floor's last bay is open: a dark recess under the beam. Inside, the stair runs down along its back wall
    # from a landing by the gate, step by step into the dark, a pipe handrail following it down; at the bottom the
    # basement's steel door, only its top half out of the dark. An iron railing guards the drop along the pavement, its
    # gate swung open; a caged bulb hangs over it all.
    OX0, OX1, OY0 = 492, 598, 300              # the recess
    LAND = G - 54                              # the landing's back edge (street level, seen from above): the stair starts here
    RUN, RISE = 10.0, 13.0
    FX0, FX1, FTOP = 498, 534, 378             # the basement door, down at the bottom on the left
    SX = 576                                   # where the landing ends and the first step drops
    # the recess: its back wall, dark, faint brick
    g.append(path(f"M{OX0},{H} L{OX0},{OY0} L{OX1},{OY0} L{OX1},{H}", "url(#brback)", INK, LB))
    g.append(clip("brrecess", [(OX0 + 1, OY0 + 1), (OX1 - 1, OY0 + 1), (OX1 - 1, H), (OX0 + 1, H)]))
    g.append(Raw('<g clip-path="url(#brrecess)">'))
    g += brickwork(OX0, OY0 + 2, OX1, H, 26, 10, 0.5, 11, tones=False)
    g.append(Raw('</g>'))
    # the door in the back wall, sunk: its foot is far below the street
    g.append(rect(FX0 - 4, FTOP - 5, FX1 - FX0 + 8, H - FTOP + 5, "#241E2E", INK, LM))
    g.append(rect(FX0, FTOP, FX1 - FX0, H - FTOP, "#4A4458", INK, LM))
    g.append(rect(FX0 + 4, FTOP + 4, FX1 - FX0 - 8, H - FTOP - 4, "none", "#2E2A3A", 1.3))
    g.append(line(FX0 + 3, FTOP + 3, FX0 + 3, FTOP + 40, "#7A7090", 1.4, 'opacity="0.55"'))
    g.append(rect(FX0 + 10, FTOP + 13, 20, 6, "#0A0610", INK, 1.0))                               # the peephole slot
    g.append(rect(FX0 + 9, FTOP + 11, 8, 10, "#6A6080", INK, 0.9))                               # its slide, pushed aside
    g += dots([(FX0 + 5, FTOP + 5), (FX1 - 5, FTOP + 5), (FX0 + 5, FTOP + 32), (FX1 - 5, FTOP + 32)], 1.0, "#8A80A0")
    g.append(rect(FX1 - 10, FTOP + 40, 5, 12, "#2E2A3A", INK, 0.9))
    g.append(Raw('<g id="doorcrack">'))
    g.append(path(f"M{FX1 - 2},{FTOP + 1} L{FX1 + 2},{FTOP + 1} L{FX1 + 2},{H} L{FX1 - 2},{H} Z", "#FFD891", "none", 0))
    g.append(path(f"M{FX1 + 2},{FTOP + 2} L{FX1 + 10},{FTOP + 6} L{FX1 + 12},{H} L{FX1 + 2},{H} Z", "#FFD891", "none", 0, 'opacity="0.15"'))
    g.append(Raw('</g>'))
    box("doorcrack", FX1 - 2, FTOP, 14, H - FTOP, lit="#FFD891", note="light round the ajar basement door")
    # the stair: from the landing by the gate, down to the left along the back wall; each step darker; past the
    # street line the dark takes it
    steps = [(OX1 - 1, H), (OX1 - 1, LAND)]
    x, y = float(SX), LAND
    steps.append((x, y))
    treads = []
    while x > FX1 + 4 and y < H + 12:
        treads.append((x - RUN, x, y + RISE))
        y += RISE; steps.append((x, y)); x -= RUN; steps.append((x, y))
    steps.append((x, H + 2)); 
    g.append(path(poly(steps), CON2, INK, LM))
    g.append(path(f"M{SX},{LAND} L{OX1 - 1},{LAND} L{OX1 - 1},{G} L{SX},{G} Z", "url(#brland)", INK, 1.2))   # the landing floor, running back from the gate
    g.append(wpath([[(SX + 1, y_), (OX1 - 2, y_)] for y_ in (LAND + 12, LAND + 27, LAND + 45)], CON2, 1.0, 0.7))
    shade = ["#62577A", "#4E4462", "#3A324C", "#2A2338", "#1C1726", "#120E1A"]
    for i, (xa, xb, yy) in enumerate(treads):
        g.append(rect(xa + 0.8, yy + 0.8, RUN - 1.6, H - yy, shade[min(i, len(shade) - 1)], "none", 0))
        g.append(line(xa + 1, yy + 1, xb - 1, yy + 1, "#CFC2E2", 1.9, f'opacity="{max(0.1, 0.9 - i * 0.17):.2f}"'))   # the nosing, catching the bulb
        g.append(line(xb - 0.6, yy - RISE + 1, xb - 0.6, yy, "#0A0710", 1.4, 'opacity="0.7"'))                                  # the riser's edge
    g.append(line(SX + 1, LAND + 1.2, SX + 1, G - 2, "#C9A94A", 1.8, 'opacity="0.6"'))                    # worn yellow on the top step's edge
    # the stair's profile, caught by the bulb: a lit zigzag down to the dark (this is what reads as steps at street size)
    zz = [(OX1 - 2, LAND + 0.8), (SX, LAND + 0.8)]
    for k in range(1, 5):
        zz += [(SX - RUN * (k - 1), LAND + RISE * k), (SX - RUN * k, LAND + RISE * k)]
    for i in range(0, len(zz) - 1):
        op = max(0.12, 0.85 - 0.1 * i)
        g.append(Raw(f'<path d="M{zz[i][0]:.1f},{zz[i][1]:.1f}L{zz[i + 1][0]:.1f},{zz[i + 1][1]:.1f}" stroke="#D6CAE8" stroke-width="1.7" stroke-linecap="round" opacity="{op:.2f}"/>'))
    g.append(Raw(f'<rect x="{OX0 + 1}" y="{G - 26}" width="{SX - OX0 - 1}" height="{H - G + 26}" fill="url(#brdown)"/>'))
    # the handrail on the back wall, running down with the stair
    kend = (SX - (FX1 + 6)) / RUN                                                              # it stops at the door's jamb
    hr = [(OX1 - 3, LAND - 28), (SX, LAND - 28)] + [(SX - RUN * k, LAND - 28 + RISE * k) for k in (1, 2, 3)] + [(SX - RUN * kend, LAND - 28 + RISE * kend)]
    g.append(path("M" + " L".join(f"{p[0]:.1f},{p[1]:.1f}" for p in hr), "none", IRONB, 3.6))
    g.append(path("M" + " L".join(f"{p[0]:.1f},{p[1] - 1:.1f}" for p in hr[:5]), "none", "#C8B8E4", 1.3, 'opacity="0.8"'))
    for p in (hr[1], hr[3], hr[-1]):
        g.append(line(p[0], p[1], p[0], p[1] - 7, IRONB, 1.8))                                  # its wall brackets
    g.append(rect(OX0, OY0, OX1 - OX0, 6, SHADE, "none", 0, 'opacity="0.45"'))                      # the soffit's shadow
    # the caged bulb, hanging from the beam, and its pool of light
    BCX, BCY = 558, 322
    g.append(Raw('<g id="bulbpool">'))
    g.append(Raw(f'<polygon points="{BCX - 7},{BCY + 7} {BCX + 7},{BCY + 7} {OX1 + 14},{G + 6} {OX0 + 40},{G + 6}" fill="url(#brcone)" opacity="0.8"/>'))
    g.append(Raw(f'<ellipse cx="{BCX}" cy="{BCY + 4}" rx="40" ry="26" fill="url(#brpool)"/>'))
    g.append(Raw(f'<ellipse cx="{BCX + 6}" cy="{G + 3}" rx="58" ry="7" fill="url(#brpool)" opacity="0.8"/>'))
    g.append(Raw('</g>'))
    box("bulbpool", OX0 + 20, BCY - 26, OX1 + 20 - (OX0 + 20), G + 10 - (BCY - 26), note="the cone and the pool on the pavement: dim it with the bulb")
    g.append(path(f"M{BCX},{OY0} L{BCX},{BCY - 12}", "none", IRONB, 2.2))
    g.append(Raw('<g id="bulb">'))
    g.append(path(f"M{BCX},{BCY - 6} C{BCX + 5},{BCY - 6} {BCX + 6},{BCY + 1} {BCX + 3},{BCY + 5} L{BCX - 3},{BCY + 5} C{BCX - 6},{BCY + 1} {BCX - 5},{BCY - 6} {BCX},{BCY - 6} Z", "#FFE6A0", INK, 1.1))
    g.append(line(BCX - 1.5, BCY - 3, BCX - 2.5, BCY + 1, "#FFFFFF", 1.2, 'opacity="0.8"'))
    g.append(Raw('</g>'))
    g.append(path(f"M{BCX - 7},{BCY - 8} L{BCX + 7},{BCY - 8} L{BCX + 7},{BCY + 6} Q{BCX},{BCY + 11} {BCX - 7},{BCY + 6} Z", "none", IRONB, 1.4))
    g.append(path(f"M{BCX - 3.5},{BCY - 8} L{BCX - 3.5},{BCY + 8} M{BCX + 3.5},{BCY - 8} L{BCX + 3.5},{BCY + 8} M{BCX - 7},{BCY - 1} L{BCX + 7},{BCY - 1}", "none", IRONB, 1.1))
    g.append(rect(BCX - 8, BCY - 12, 16, 5, "#2E2640", INK, 1.1))
    box("bulb", BCX - 7, BCY - 8, 14, 18, cx=BCX, cy=BCY, lit="#FFE3A0")
    # the jambs of the recess
    g.append(rect(OX0 - 6, OY0, 7, G - OY0, CON, INK, LM)); g.append(rect(OX1 - 1, OY0, 6, G - OY0, CON, INK, LM))
    # the railing along the drop: a concrete kerb, pickets with spear tops, the gate swung open at the landing
    RT = G - 24
    RG = 572                                   # the gate's hinge post
    g.append(rect(OX0 - 6, H - 5, OX1 - OX0 + 11, 5, CON, INK, 1.4))
    pk = [x for x in fr(OX0 + 6, RG - 3, 9.0)]
    g.append(wpath([[(x, RT - 4), (x, H - 5)] for x in pk], IRONB, 1.7))
    g.append(Raw('<path d="' + "".join(f"M{x - 2.4:.1f},{RT - 3:.1f}l2.4,-5l2.4,5z" for x in pk) + f'" fill="{IRONB}"/>'))
    g.append(line(OX0 - 2, RT, RG, RT, IRONB, 2.8)); g.append(line(OX0 - 2, H - 12, RG, H - 12, IRONB, 2.2))
    g.append(line(OX0, RT - 0.8, RG, RT - 0.8, "#7E6E9A", 0.9, 'opacity="0.5"'))
    for px in (OX0 - 2, RG):
        g.append(rect(px - 2.5, RT - 8, 5, H - 5 - (RT - 8), IRONB, INK, 0.8))
        g += dots([(px, RT - 9)], 3.0, IRONB, None, INK, 0.8)
    g.append(path(f"M{RG},{RT} L{RG + 16},{RT + 7} M{RG},{H - 12} L{RG + 16},{H - 3} M{RG + 16},{RT + 5} L{RG + 16},{H - 2}", "none", IRONB, 2.2))
    g.append(wpath([[(RG + d, RT + 2 + d * 0.42), (RG + d, H - 11 + d * 0.55)] for d in (4, 8, 12)], IRONB, 1.6))
    # chalk on the jamb: an arrow pointing down
    g.append(path(f"M{OX1 + 2},{G - 96} L{OX1 + 2},{G - 74} M{OX1 - 1},{G - 81} L{OX1 + 2},{G - 73} L{OX1 + 5},{G - 81}", "none", CHALK, 1.3, 'opacity="0.6"'))
    ANCH["stairs"] = {"x": 587, "x0": SX, "x1": 597, "y": G, "note": "the landing by the open gate, at street level: pets step in here and go down to the left"}
    ANCH["basement_door"] = {"x": FX0, "y": FTOP, "w": FX1 - FX0, "h": G - FTOP, "cx": (FX0 + FX1) / 2, "note": "the sunken steel door's top half; its foot is below the street"}
    ANCH["recess"] = {"x": OX0, "y": OY0, "w": OX1 - OX0, "h": G - OY0, "note": "the dark stairwell bay"}

    # ================================================================ the foot: plinth, dumpster, bags, kegs, crates, puddle
    g.append(rect(X0, G - 12, DX0 - 7 - X0, 12, "#2E2238", INK, LM))
    g.append(rect(DX0 + DW + 7, G - 12, 486 - (DX0 + DW + 7), 12, "#2E2238", INK, LM))
    g.append(path("M24,396 L138,396 L132,448 L30,448 Z", DUMP, INK, LB))
    g.append(line(30, 404, 132, 404, DUMPL, 1.4, 'opacity="0.6"'))
    g.append(rect(26, 410, 110, 8, DUMPD, INK, 1.2))
    g.append(wpath([[(x, 420), (x - 0.5, 444)] for x in (54, 80, 106)], DUMPD, 1.4, 0.9))
    g.append(path("M38,424 C46,420 54,428 50,436 C44,440 38,434 38,424 Z", RUST, "none", 0, 'opacity="0.6"'))
    g.append(path("M20,396 L80,396 L78,388 L22,390 Z", "#1E3432", INK, LM))
    g.append(path("M80,396 L140,396 L142,392 L84,376 Z", "#1E3432", INK, LM))
    g.append(path(smooth_closed([(92, 395), (98, 384), (110, 382), (120, 388), (116, 396)], 0.5), BAG, INK, 1.2))
    g += dots([(38, 450), (124, 450)], 3.6, "#1A1622", None, INK, 1.0)
    for (bx, by, s) in ((150, G, 1.0), (170, G, 0.8)):
        k = lambda x, y: (bx + x * s, by + y * s)
        g.append(path(smooth_closed([k(-16, 0), k(-18, -12), k(-12, -24), k(-4, -28), k(-2, -34), k(2, -34), k(4, -28), k(12, -24), k(18, -12), k(16, 0)], 0.5), BAG, INK, LM))
        a_, b_, c_ = k(-10, -18), k(-6, -8), k(-8, -3)
        g.append(path(f"M{a_[0]:.1f},{a_[1]:.1f} Q{b_[0]:.1f},{b_[1]:.1f} {c_[0]:.1f},{c_[1]:.1f}", "none", BAGL, 1.6, 'opacity="0.7"'))
    for (kx, ky) in ((417, G), (443, G - 1)):
        g.append(path(f"M{kx - 12},{ky - 30} L{kx + 12},{ky - 30} L{kx + 13},{ky - 22} L{kx + 13},{ky - 8} L{kx + 12},{ky} L{kx - 12},{ky} L{kx - 13},{ky - 8} L{kx - 13},{ky - 22} Z", KEG, INK, LM))
        g.append(rect(kx - 12, ky - 36, 24, 7, KEGD, INK, 1.2)); g.append(rect(kx - 5, ky - 34, 10, 3, "#2A2436", "none", 0))   # the top chime, its hand hole
        g.append(rect(kx - 14, ky - 23, 28, 3.5, KEGL, INK, 1.1)); g.append(rect(kx - 14, ky - 10, 28, 3.5, KEGL, INK, 1.1))  # the rolling rings
        g.append(line(kx - 7, ky - 28, kx - 7, ky - 2, "#C8C0D8", 1.3, 'opacity="0.5"'))
        g.append(rect(kx - 4, ky - 40, 8, 4, "#3E3650", INK, 1.0))
    g.append(rect(454, G - 20, 30, 20, CRATE_G, INK, LM))
    g.append(rect(452, G - 38, 32, 18, CRATE_R, INK, LM))
    for (cy_, cd) in ((G - 20, CRATE_GD), (G - 38, CRATE_RD)):
        g.append(rect(461, cy_ + 5, 18, 5, cd, INK, 0.9))
    g += dots([(458 + 5 * i, G - 40) for i in range(5)], 2.0, "#2E4A2C", None, INK, 0.7)
    g.append(path(smooth_closed([(222, G + 4), (262, G + 1), (318, G + 3), (330, G + 8), (290, G + 12), (236, G + 11)], 0.5), "#0E0818", "none", 0, 'opacity="0.75"'))
    g.append(line(248, G + 7, 272, G + 6, "#E8A45A", 1.2, 'opacity="0.35"'))
    g.append(line(282, G + 8, 300, G + 8, "#E84D7F", 1.0, 'opacity="0.3"'))
    g.append(Raw(f'<rect x="{X0 - 4}" y="{G - 2}" width="{484 - X0}" height="9" rx="4.5" fill="#000" opacity="0.32"/>'))

    svgx("arena", W, H, g, defs=defs, step=10.0, step_lines=12.0)

if __name__ == "__main__":
    arena()
    if "--anchors" in sys.argv:
        print(json.dumps(ANCH, indent=1))
