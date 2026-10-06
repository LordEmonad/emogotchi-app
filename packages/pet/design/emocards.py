"""The emo pack's item pictures -> packages/pet/props/emo*card.svg (run by hand: python3 design/emocards.py)

The shop cards need each wearable on its own, big: the beanie with the black emo hair that comes with it, the clothes
as if on unseen shoulders with the checkered slip-ons under them, a pair of wristbands, and the lip piercings in a pair of lips. Drawn
with the pack's own palette and helpers (emo.py: the knit's ribs, the cuff's ribs, the broken heart, the checkerboard,
the lip ring), so a card and the pets cannot disagree. The guitar, the phone and the bedroom need nothing new: their
cards are made from the props the pets play with (tools/items/emo-cards.mjs puts everything on its card).
"""
import os, sys, math, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wobble import bake
import emo as EM
from emo import INK, path, poly, smooth_closed, smooth_open

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))
LW = 2.6          # the outline at a card's scale (a 150-wide drawing shown ~720 px wide: ~12 px, the other cards' weight)


def svg(name, w, h, body, defs="", amp=0.9, step=4.0, decimals=1, plain=(), plain_top=()):
    """`plain` goes under `body` and `plain_top` over it, without the wobble (fine strokes and patterns: the bake would
    multiply their bytes for nothing, and an item picture is stored on chain)."""
    body = "\n".join(plain) + "\n" + bake("\n".join(body), amp=amp, freq=0.09, step=step) + "\n" + "\n".join(plain_top)
    defs = bake(defs, amp=amp, freq=0.09, step=step)          # a clip's outline wobbles exactly as its shape does
    rnd = lambda m: (f"{float(m.group(0)):.{decimals}f}".rstrip("0").rstrip("."))
    body = re.sub(r"-?\d+\.\d+", rnd, body); defs = re.sub(r"-?\d+\.\d+", rnd, defs)
    src = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           + (f'<defs>{defs}</defs>\n' if defs else '') + f'<g id="{name}">\n{body}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print(f"wrote {name} ({len(src) / 1024:.1f} KB)")


def svg2(name, w, h, layers, defs_baked="", defs_plain="", amp=0.9, step=4.0, decimals=1):
    """Like svg(), with the drawing in `layers`: [(elements, baked?)], drawn in that order, so lines left plain can sit
    between baked shapes (a fringe's strands under the hat's cuff). Patterns go in `defs_plain` (the bake would turn a
    checkerboard's squares into wobbling paths)."""
    parts = []
    for items, baked in layers:
        txt = "\n".join(items)
        parts.append(bake(txt, amp=amp, freq=0.09, step=step) if baked else txt)
    body = "\n".join(parts)
    defs = bake(defs_baked, amp=amp, freq=0.09, step=step) + defs_plain
    rnd = lambda m: (f"{float(m.group(0)):.{decimals}f}".rstrip("0").rstrip("."))
    body = re.sub(r"-?\d+\.\d+", rnd, body); defs = re.sub(r"-?\d+\.\d+", rnd, defs)
    src = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           + (f'<defs>{defs}</defs>\n' if defs else '') + f'<g id="{name}">\n{body}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print(f"wrote {name} ({len(src) / 1024:.1f} KB)")


def arc(x0, x1, yend, ymid, n=15):
    """Points along a gentle arc from (x0, yend) to (x1, yend) through (mid, ymid): a band seen a little from above."""
    return [(x0 + (x1 - x0) * i / (n - 1), yend + (ymid - yend) * (1 - (2 * i / (n - 1) - 1) ** 2)) for i in range(n)]


def d_of(pts, closed=True):
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + (" Z" if closed else "")


# ================================================================ the beanie
def beaniecard():
    """The beanie as it sits on a head, front on and a little from above: the black knit rising well over the head and
    slouching off to the right and back, its ribs running up from the folded cuff; the ribbed cuff across the brow with
    its pink broken-heart patch; and under it the black emo hair that comes with it, a fringe swept across from the right
    in chunky pointed locks (long over the left, short on the right), the back hair showing at the sides."""
    edge = arc(25, 125, 88, 97)          # the cuff's lower edge
    ctop = arc(27, 123, 70, 78)          # its top: the fold
    # the knit: up from the cuff's left end, narrower than the cuff as it rises, over the crown, the slouch sagging off to
    # the right past the cuff's end
    dome = [(27, 70), (27, 57), (30, 44), (36, 32), (45, 21.5), (57, 13.5), (71, 8.5), (86, 7.5), (100, 10), (112, 15.5), (122, 23.5),
            (129.5, 33.5), (133.5, 45), (133.5, 56), (130, 65), (125.5, 70.5)]
    knit = smooth_closed(dome + [(123, 70)] + ctop[::-1][1:-1], 0.42)
    # the slouch's underside in shade, where the knit folds over and down
    sag = smooth_closed([(108, 24), (122, 34), (130, 48), (130.5, 60), (126, 69), (118, 60), (111, 44)], 0.45)
    # the hair: the back hair behind, at the sides; the fringe in front, swept from the right down to the left
    back = smooth_closed([(23, 84), (19.5, 99), (20.5, 111), (25.5, 105), (28.5, 116), (34, 106), (44, 108), (62, 100), (100, 100),
                          (114, 106), (119, 99), (125, 108), (129, 98), (128, 86)], 0.35)
    # the fringe: chunky locks from under the cuff, swept left as they fall, longer toward the left; each its own blade,
    # the ones nearer the parting (on the right) lying over their neighbours
    LOCKS = [(25, 44, 29, 119), (36, 58, 40, 124), (50, 72, 56, 122), (64, 86, 70, 117), (78, 98, 85, 112), (90, 110, 98, 107),
             (102, 120, 110, 103), (112, 127, 121, 99)]
    hair = [path(back, "#0B090E", INK, LW)]
    lines = []
    for (xa, xb, tx, ty) in LOCKS:
        r0 = 84.0
        d = (f"M{xa:.1f},{r0:.1f} C{xa - 2.5:.1f},{(r0 + ty) / 2:.1f} {tx + 2:.1f},{ty - 11:.1f} {tx:.1f},{ty:.1f} "
             f"C{tx + 7:.1f},{ty - 13:.1f} {xb + 1.5:.1f},{(r0 + ty) / 2 + 3:.1f} {xb:.1f},{r0:.1f} Z")
        hair.append(path(d, "#1D1924", INK, 2.3))
        mx = (xa + xb) / 2
        lines.append(path(smooth_open([(mx + 2, 90), (mx - 1, (90 + ty) / 2 + 1), (tx + 2.5, ty - 7)], 0.5), "none", "#5D5272", 1.4, 'opacity="0.95"'))
        lines.append(path(smooth_open([(xb - 4, 90), (xb - 6.5, 97)], 0.5), "none", "#9488AD", 1.9, 'opacity="0.75"'))
    defs = ""
    # the knit, its light, its ribs
    hat = [path(knit, EM.KNIT, "none", 0), path(sag, "#0C0A0F", "none", 0, 'opacity="0.55"')]
    hat.append(path(smooth_open([(38, 33), (50, 21.5), (66, 14.5), (84, 12.5)], 0.5), "none", "#4F475A", 9.0, 'opacity="0.35"'))
    hat.append(path(knit, "none", INK, LW))
    ribs = EM.knit_ribs(ctop, dome[1:-1], 17, w=1.5, reach=0.9, bow=0.05, skip=1, colour="#4D4556", opacity=0.95)
    # the cuff over the knit and the hair: its ribs, its fold, its outline
    band_d = d_of(edge + ctop[::-1])
    cuff = [path(band_d, EM.KNIT, "none", 0)]
    cuff_lines = EM.cuff_ribs(edge, ctop, spacing=4.4, w=1.5, lo=0.14, hi=0.8, colour="#433C4B", opacity=0.95)
    cuff_lines.append(path(smooth_open(arc(28, 122, 72.5, 80.5)), "none", "#57505F", 2.2, 'opacity="0.6"'))
    cuff_out = [path(band_d, "none", INK, LW)]
    heart = EM.broken_heart(50, 85.5, 15, fill=EM.HEART, lw=1.3, rot=-6)
    heart.append(path("M45.5,81.2 C46.6,80.0 48.2,79.6 49.4,80.2", "none", "#F7A8C4", 1.3))
    svg2("emobeaniecard", 150, 150, [(hair, True), (lines, False), (hat, True), (ribs, False), (cuff, True), (cuff_lines, False), (cuff_out, True), (heart, False)])


# ================================================================ the clothes
def fitcard():
    """The fit, as if on unseen shoulders: a black band tee with the pink broken heart over a black-and-purple striped long-sleeve, the
    long sleeves hanging out under the tee's short ones down to their cuffs; under it, on the floor, the checkered
    slip-ons, side by side, toes to the left."""
    cx = 75.0
    defs, pats = [], []
    # the long sleeves (drawn for the left side; s = -1 is its mirror): tubes hanging from the shoulders down beside the
    # tee, striped across, a ribbed purple cuff at the end
    sleeves, sleeve_lines = [], []
    for s in (1, -1):
        M = lambda x: cx + s * (x - cx)
        X = lambda pts: [(M(x), y) for x, y in pts]
        outer = X([(27, 50), (20, 76), (16, 102), (15, 120)])
        inner = X([(41, 62), (36, 82), (31, 104), (30, 120)])
        sh = smooth_closed(outer + [(M(14.6), 121.2), (M(30.2), 121.2)] + inner[::-1], 0.25)
        cid = f"emofitsleeve{'L' if s > 0 else 'R'}"
        defs.append(f'<clipPath id="{cid}"><path d="{sh}"/></clipPath>')
        sleeves.append(path(sh, EM.TEE, "none", 0))
        stripes = []
        for k in range(10):
            y0 = 58 + k * 6.6
            stripes.append(f'<path d="M{M(8):.1f},{y0:.1f} L{M(50):.1f},{y0 + 3:.1f} L{M(50):.1f},{y0 + 6.3:.1f} L{M(8):.1f},{y0 + 3.3:.1f} Z" fill="{EM.STRIPE}"/>')
        sleeve_lines.append(f'<g clip-path="url(#{cid})">' + "".join(stripes)
                            + path(smooth_open([(M(27), 60), (M(23), 90), (M(21), 116)], 0.5), "none", "#B98AC0", 2.4, 'opacity="0.45"') + '</g>')
        c0, c1 = outer[3], inner[3]
        cuff = [(c0[0], 113), (c1[0], 113), (c1[0] + s * 0.6, 121.6), (c0[0] - s * 0.6, 121.6)]
        sleeve_lines.append(path(d_of(cuff), EM.BAND, INK, 1.8))
        for t in (0.2, 0.4, 0.6, 0.8):
            x = c0[0] + (c1[0] - c0[0]) * t
            sleeve_lines.append(path(f"M{x:.1f},114.2 L{x:.1f},120.6", "none", "#6E4874", 1.2, 'opacity="0.8"'))
        sleeve_lines.append(path(sh, "none", INK, LW))
    # the tee: its shoulders, short sleeves, straight down to a hem
    L = [(cx - 12.5, 29.5), (cx - 24, 33.5), (cx - 40, 41), (cx - 50, 49.5), (cx - 57, 60), (cx - 49, 66.5), (cx - 40, 65), (cx - 38.5, 92),
         (cx - 38, 126), (cx - 20, 127.5), (cx, 127)]
    tee = smooth_closed(L + [(2 * cx - x, y) for x, y in reversed(L[:-1])] + [(cx + 6, 33), (cx, 34), (cx - 6, 33)], 0.28)
    shirt = [path(tee, EM.TEE, "none", 0)]
    defs.append(f'<clipPath id="emofittee"><path d="{tee}"/></clipPath>')
    shirt.append('<g clip-path="url(#emofittee)">')
    for f in ([(cx - 30, 70), (cx - 31.5, 98), (cx - 30, 124)], [(cx + 30, 70), (cx + 31.5, 98), (cx + 30, 124)], [(cx - 45, 53), (cx - 41, 62)], [(cx + 45, 53), (cx + 41, 62)]):
        shirt.append(path(smooth_open(f, 0.5), "none", EM.TEE2, 3.4, 'opacity="0.9"'))
    shirt.append(path(smooth_closed([(cx - 36, 40), (cx - 16, 34), (cx - 14, 39), (cx - 33, 46)], 0.5), "#3A3340", "none", 0, 'opacity="0.7"'))
    shirt.append('</g>')
    # the neck: the striped long-sleeve's collar showing inside the tee's ribbed one
    shirt.append(path(smooth_closed([(cx - 11, 30.5), (cx - 6, 36.5), (cx, 38.5), (cx + 6, 36.5), (cx + 11, 30.5), (cx, 33.5)], 0.4), "#120F16", "none", 0))
    shirt.append(path(smooth_open([(cx - 9.5, 32.5), (cx - 4.5, 35.8), (cx, 36.6), (cx + 4.5, 35.8), (cx + 9.5, 32.5)], 0.4), "none", EM.STRIPE, 2.6))
    shirt.append(path(tee, "none", INK, LW))
    shirt.append(path(smooth_open([(cx - 12.5, 29.5), (cx - 6.5, 36.2), (cx, 38.6), (cx + 6.5, 36.2), (cx + 12.5, 29.5)], 0.4), "none", INK, 1.8))
    shirt.append(path(smooth_open([(cx - 40, 65), (cx - 40.5, 58)], 0.5), "none", INK, 1.6))
    shirt.append(path(smooth_open([(cx + 40, 65), (cx + 40.5, 58)], 0.5), "none", INK, 1.6))
    # the print: the pack's broken heart, big on the chest
    heart = EM.broken_heart(cx, 79, 34, fill=EM.HEART, lw=1.8, rot=-4)
    heart.append(path("M64.5,69.5 C66.5,67.4 69.5,66.6 72,67.6", "none", "#F7A8C4", 1.8))
    # the slip-ons: the far shoe behind and to the right, the near one in front; toes to the left
    shoes, shoe_fills = [], []
    for k, (ox, oy, sc) in enumerate([(70, 165.5, 1.1), (24, 170.5, 1.16)]):
        P = lambda x, y: (ox + x * sc, oy + y * sc)
        sole = [P(-1, 0), P(50, 0), P(51.5, -3), P(51, -7), P(-1.5, -7), P(-3, -3.6)]
        upper = [P(1, -7), P(0.5, -11), P(4.5, -15.5), P(13, -18), P(23, -19.2), P(37, -20.5), P(48, -21), P(50.8, -16), P(50.8, -7)]
        up = smooth_closed(upper, 0.25)
        cid = f"emofitshoe{k}"
        defs.append(f'<clipPath id="{cid}"><path d="{up}"/></clipPath>')
        pats.append(EM.checker_pattern(f"emochk{k}", 3.9 * sc, -8))
        op = smooth_closed([P(22, -19.4), P(36, -21.6), P(48.2, -21.4), P(47, -17.8), P(34.5, -16.6), P(23, -16.9)], 0.4)
        shoe = [path(up, f"url(#emochk{k})", "none", 0),
                f'<g clip-path="url(#{cid})">' + path(smooth_open([P(4, -13), P(13, -16.3), P(23, -17.6)], 0.5), "none", "#FFFFFF", 2.0, 'opacity="0.35"') + '</g>',
                path(op, "#120F16", INK, 1.4),
                path(smooth_open([P(21, -17.5), P(17.5, -14), P(16.5, -9)], 0.5), "none", INK, 1.2, 'opacity="0.8"'),
                path(up, "none", INK, 2.0),
                path(smooth_closed(sole, 0.25), EM.CHECKW, INK, 2.0),
                path(smooth_open([P(-1.5, -3.6), P(25, -3.6), P(51, -3.4)], 0.4), "none", "#B9B2C2", 1.3)]
        shoes.append(shoe)
    stripes_only = [x for x in sleeve_lines if x.startswith('<g clip-path')]
    sleeve_rest = [x for x in sleeve_lines if not x.startswith('<g clip-path')]
    svg2("emofitcard", 150, 172, [(sleeves, True), (stripes_only, False), (sleeve_rest, True), (shirt, True), (heart, False),
                                 (shoes[0], True), (shoes[1], True)], defs_baked="".join(defs), defs_plain="".join(pats))


# ================================================================ the wristbands
def band(cx, cy, R, r, H, light=1.0, tag="a"):
    """A sweatband standing on its end, seen a little from above: a short, soft purple terry tube, its sides a little
    full, the white stripe round its middle, the rolled rim and the dark inside at the top. Returns (shapes to bake, lines
    and texture to leave plain, the stipple pattern's def)."""
    fr = lambda a, yo=0.0: (cx - R * math.cos(a) - (1.6 * math.sin(a) ** 6) * 0 , cy + r * math.sin(a) + yo)
    front = [fr(math.pi * i / 28) for i in range(29)]
    bulge = lambda y: 1.4 * math.sin(math.pi * min(max((y - cy) / H, 0), 1))
    left = [(cx - R - bulge(cy + H * t), cy + H * t) for t in (0, .25, .5, .75, 1)]
    right = [(cx + R + bulge(cy + H * t), cy + H * t) for t in (1, .75, .5, .25, 0)]
    bottom = [(x, y + H) for x, y in front]
    side = smooth_open(left, 0.5) + " L" + " L".join(f"{x:.2f},{y:.2f}" for x, y in bottom[1:-1]) + " L" + smooth_open(right, 0.5)[1:] + " L" + " L".join(f"{x:.2f},{y:.2f}" for x, y in front[::-1][1:]) + " Z"
    pid = f"emoterry{tag}"
    pat = (f'<pattern id="{pid}" patternUnits="userSpaceOnUse" width="2.4" height="2.4"><circle cx=".6" cy=".6" r=".42" fill="#4E2C56" fill-opacity=".55"/>'
           f'<circle cx="1.8" cy="1.8" r=".42" fill="#D4B4DA" fill-opacity=".35"/></pattern>')
    out, fine = [], []
    out.append(path(side, EM.BAND, "none", 0))
    h0, h1 = H * 0.38, H * 0.62
    stripe = poly([(x, y + h0) for x, y in front] + [(x, y + h1) for x, y in front[::-1]])
    fine.append(path(side, f"url(#{pid})", "none", 0))
    fine.append(path(stripe, "#F4EAF6", "none", 0))
    # the shade on the right, the light on the left, over the stripe too
    shade = [(x, y) for x, y in front if x > cx + R * 0.3]
    fine.append(path(poly(shade + [(x, y + H) for x, y in shade[::-1]]), "#4A2752", "none", 0, 'opacity="0.42"'))
    lit = [(x, y) for x, y in front if cx - R * 0.8 < x < cx - R * 0.35]
    fine.append(path(poly(lit + [(x, y + H) for x, y in lit[::-1]]), "#F2DDF6", "none", 0, f'opacity="{0.28 * light:.2f}"'))
    fine.append(path(smooth_open([(x, y + h0) for x, y in front], 0.5), "none", "#7E5486", 1.0, 'opacity="0.55"'))
    fine.append(path(smooth_open([(x, y + h1) for x, y in front], 0.5), "none", "#7E5486", 1.0, 'opacity="0.55"'))
    # the top: the rolled rim, and the inside going down into the dark
    top = [f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{R:.1f}" ry="{r:.1f}" fill="#A87FAE"/>',
           f'<ellipse cx="{cx:.1f}" cy="{cy + 1:.1f}" rx="{R - 6:.1f}" ry="{r - 2.8:.1f}" fill="#3B2142"/>',
           f'<ellipse cx="{cx:.1f}" cy="{cy + 2.4:.1f}" rx="{R - 9:.1f}" ry="{r - 4.4:.1f}" fill="#1E1024"/>']
    rim = [path(f"M{cx - R + 3:.1f},{cy - 1:.1f} C{cx - R + 8:.1f},{cy - r + 1:.1f} {cx - 6:.1f},{cy - r - 0.4:.1f} {cx + 4:.1f},{cy - r + 0.2:.1f}", "none", "#E6D1EA", 1.8, 'opacity="0.75"')]
    outline = [path(side, "none", INK, LW),
               f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{R:.1f}" ry="{r:.1f}" fill="none" stroke="{INK}" stroke-width="{LW}"/>',
               f'<ellipse cx="{cx:.1f}" cy="{cy + 1:.1f}" rx="{R - 6:.1f}" ry="{r - 2.8:.1f}" fill="none" stroke="{INK}" stroke-width="1.5"/>']
    return out, fine, top, rim, outline, pat


def wristcard():
    """A pair of wristbands standing on their ends, the far one behind and to the right, a little higher."""
    a = band(96, 30, 31, 10.5, 25, 0.8, "a")
    b = band(57, 47, 33, 11.5, 27, 1.0, "b")
    layers = []
    for (out, fine, top, rim, outline, _) in (a, b):
        layers += [(out, True), (fine, False), (top, True), (rim, False), (outline, True)]
    svg2("emowristcard", 150, 88, layers, defs_plain=a[5] + b[5])


# ================================================================ the lip piercings
def lipcard():
    """The lip piercings, in a pair of lips: a full mouth in a deep berry, closed in a smirk (the right corner up), and
    the two silver hoops through the lower lip near its corners: snakebites."""
    Lc, Rc = (14.0, 56.0), (138.0, 49.0)
    upper_top = [Lc, (22, 49), (34, 40), (47, 33.5), (58, 31.5), (66, 33.5), (75, 39), (84, 32.5), (94, 30.5), (106, 32.5), (119, 38), (130, 44), Rc]
    seam = [Lc, (28, 59), (46, 60.5), (62, 61), (75, 61.5), (90, 60.5), (106, 58), (121, 54), Rc]
    lower = [Lc, (21, 66), (33, 77), (48, 85), (64, 89), (79, 89.5), (95, 87), (110, 81), (123, 71), (132, 60), Rc]
    up = smooth_open(upper_top, 0.5) + " L" + smooth_open(seam[::-1], 0.5)[1:] + " Z"
    lo = smooth_open(seam, 0.5) + " L" + smooth_open(lower[::-1], 0.5)[1:] + " Z"
    out = []
    out.append(path(lo, "#B8336A", "none", 0))
    out.append(path(up, "#8E2152", "none", 0))
    defs = f'<clipPath id="emoliplow"><path d="{lo}"/></clipPath><clipPath id="emolipup"><path d="{up}"/></clipPath>'
    shine = ['<g clip-path="url(#emoliplow)">',
             path(smooth_closed([(44, 72), (62, 66.5), (86, 66.5), (104, 71), (90, 77), (62, 77.5)], 0.5), "#E0679A", "none", 0, 'opacity="0.75"'),
             path(smooth_closed([(56, 70.5), (70, 68.4), (82, 68.8), (74, 72.4), (60, 73)], 0.5), "#FFC2D9", "none", 0, 'opacity="0.85"'),
             path(smooth_open([(30, 74), (54, 85.5), (80, 88), (108, 81)], 0.5), "none", "#7A1A44", 4.0, 'opacity="0.45"'),
             '</g>',
             '<g clip-path="url(#emolipup)">',
             path(smooth_open([(40, 41), (55, 35.5), (64, 36.5)], 0.5), "none", "#C04878", 3.2, 'opacity="0.8"'),
             path(smooth_open([(88, 35.5), (100, 34), (114, 38.5)], 0.5), "none", "#C04878", 3.2, 'opacity="0.8"'),
             path(smooth_open([(30, 56), (60, 58.2), (96, 57.2), (124, 51)], 0.5), "none", "#5E1236", 3.0, 'opacity="0.55"'),
             '</g>']
    out.append(path(up, "none", INK, LW))
    out.append(path(lo, "none", INK, LW))
    out.append(path(smooth_open(seam, 0.5), "none", INK, 2.4))
    # the snakebites: a hoop through the lower lip near each corner, going in a little above its edge
    rings = []
    for x, edge in ((42.0, 83.0), (104.0, 83.6)):
        r = 7.2
        rings += EM.lip_ring(x, edge - 1.8 + 0.57 * r, r, 2.4)
        rings.append(f'<circle cx="{x - r * 0.5:.1f}" cy="{edge + 2.8:.1f}" r="1.1" fill="#FFFFFF"/>')
    svg2("emolipcard", 150, 104, [(out[:2], True), (shine, False), (out[2:], True), (rings, False)], defs_baked=defs)


# ================================================================ the holders' edition's marks
# The free, soulbound edition for $EMO holders wears its own frame (tools/items/emo-cards.mjs): holographic foil round
# the card, and in its corners a round foil seal lettered EMO HOLDER • SOULBOUND, a heart padlock on a chain, and two
# foil broken hearts. The foil is `url(#holo)`, a gradient the card defines (each shape's own box, so every piece shows
# the whole spectrum); these pieces are only ever drawn on a holders' card.
FONT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "node_modules", ".pnpm",
                                     "@fontsource-variable+space-grotesk@5.3.0", "node_modules", "@fontsource-variable",
                                     "space-grotesk", "files", "space-grotesk-latin-wght-normal.woff2"))
FOIL_INK = "#1A0A1E"


def ring_text(text, cx, cy, r, cap, fill):
    """`text` set round a circle in the site's own face (Space Grotesk, bold; SIL Open Font License), its baseline on a
    circle of radius `r`, reading clockwise from the top, spaced out to go exactly once round. The letters are their
    outlines, paths: a picture stored on chain cannot load a font."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    font = instantiateVariableFont(TTFont(FONT), {"wght": 700})
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    sc = cap / font["OS/2"].sCapHeight
    names = [cmap[ord(ch)] for ch in text]
    advs = [hmtx[n][0] * sc for n in names]
    gap = (2 * math.pi * r - sum(advs)) / len(text)       # the tracking that closes the ring
    out, at = [], 0.0
    for n, adv in zip(names, advs):
        th = (at + adv / 2) / r                               # the glyph's middle, as an angle from the top
        c, s_ = math.cos(th), math.sin(th)
        px, py = cx + r * math.sin(th), cy - r * math.cos(th)
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (sc * c, sc * s_, sc * s_, -sc * c, px - c * adv / 2, py - s_ * adv / 2)))
        d = pen.getCommands()
        if d: out.append(d)
        at += adv + gap
    return f'<path d="{" ".join(out)}" fill="{fill}"/>'


def holderseal():
    """The seal: a scalloped foil rosette, EMO HOLDER • SOULBOUND • round its ring in dark letters, and the pack's pink
    broken heart in a dark middle."""
    c = 100.0
    ros = [(c + (97.5 if k % 2 == 0 else 91.5) * math.sin(math.pi * k / 30), c - (97.5 if k % 2 == 0 else 91.5) * math.cos(math.pi * k / 30)) for k in range(60)]
    base = [path(smooth_closed(ros, 0.5), "url(#holo)", INK, 3.2),
            f'<circle cx="{c}" cy="{c}" r="66" fill="#140816"/>',
            f'<circle cx="{c}" cy="{c}" r="66" fill="none" stroke="{INK}" stroke-width="3"/>']
    fine = [f'<circle cx="{c}" cy="{c}" r="86.5" fill="none" stroke="{FOIL_INK}" stroke-width="1.6" stroke-dasharray="1.2 3.6" stroke-linecap="round" opacity=".55"/>',
            ring_text("EMO HOLDER • SOULBOUND • ", c, c, 70.5, 13.6, FOIL_INK)]
    heart = EM.broken_heart(c, c + 3, 64, fill=EM.HEART, lw=2.6, rot=-6)
    shine = [path("M78.8,78 C82.6,73.4 88.8,71.2 94.4,73.2", "none", "#F7A8C4", 2.6),
             f'<circle cx="{c}" cy="{c}" r="61" fill="none" stroke="url(#holo)" stroke-width="1.6" opacity=".7"/>']
    svg2("emoholdseal", 200, 200, [(base, False), (fine, False), (heart, False), (shine, False)], decimals=1)


def holderlock():
    """The heart padlock on its chain, hanging from the frame: three links of silver chain, a thick silver shackle, a
    glossy pink heart body with a keyhole."""
    SIL, SIL_HI, SIL_DK = "#D3D7E0", "#F6F8FC", "#8C92A2"
    out, fine = [], []
    # the shackle
    sh = "M37,98 L37,82 C37,62 47,54 60,54 C73,54 83,62 83,82 L83,98"
    out.append(path(sh, "none", INK, 15))
    out.append(path(sh, "none", SIL, 9.4))
    fine.append(path("M41.4,90 L41.4,81 C41.4,67 48.4,60 58,59", "none", SIL_HI, 2.6))
    fine.append(path("M78.6,84 L78.6,92", "none", SIL_DK, 2.2))
    # the heart: its outline from the shape every broken heart uses, whole
    pts = []
    for k in range(64):
        t = 2 * math.pi * k / 64
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((60 + x * 3.15, 121 + y * 3.15))
    heart = smooth_closed(pts, 0.5)
    out.append(path(heart, EM.HEART, "none", 0))
    out.append(f'<clipPath id="emoholdlockclip"><path d="{heart}"/></clipPath>')
    out.append('<g clip-path="url(#emoholdlockclip)">'
               + path("M96,96 C102,128 86,156 54,170 L120,170 L120,96 Z", EM.HEART2, "none", 0, 'opacity=".85"')
               + path(smooth_open([(20, 112), (27, 96), (40, 87), (52, 89)], 0.5), "none", "#FF9DC0", 7.0, 'opacity=".9"')
               + '</g>')
    out.append(path(heart, "none", INK, 3.4))
    out.append(path("M54,119 C54,112 66,112 66,119 C66,123 63.6,124.6 62.6,126 L64.6,137 L55.4,137 L57.4,126 C56.4,124.6 54,123 54,119 Z", "#1A0A1E", INK, 1.6))
    fine.append(f'<circle cx="31" cy="102" r="3.4" fill="#FFFFFF" opacity=".95"/>')
    fine.append(path("M24,104 C21,113 22,124 27,133", "none", "url(#holo)", 2.4, 'opacity=".9"'))
    svg2("emoholdlock", 120, 172, [(out, False), (fine, False)])


def holderheart():
    """A small foil broken heart, for a corner of the frame."""
    h = EM.broken_heart(32, 34, 58, fill="url(#holo)", lw=2.8, rot=-8)
    svg2("emoholdheart", 64, 64, [(h, False), ([path("M14,22 C16.8,17 21.6,14.6 26.4,15.6", "none", "#FFFFFF", 2.4, 'opacity=".8"')], False)])


if __name__ == "__main__":
    beaniecard()
    fitcard()
    wristcard()
    lipcard()
    holderseal()
    holderlock()
    holderheart()
