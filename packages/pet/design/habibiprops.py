"""The Habibi pack's item pictures -> packages/pet/props/*.svg (run by hand: python3 design/habibiprops.py)

The shop cards need each item on its own, big: the keffiyeh with its agal as it sits on a head, and the bisht on a
hanger, drawn with the pack's own helpers (habibi.py: the shemagh's check, the agal, the tassels, the gold zari), so the
card and the pets can never disagree; and the falconry block perch (a wakr) the falcon's card stands it on (the falcon
itself is taken from falcon.svg at build time). tools/items/build-art.mjs puts them on the item stage. Kept apart from
props.py so the room's props are not regenerated every time these change. No religious imagery anywhere.
"""
import os, sys, math, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_open, smooth_closed, path
from wobble import bake
import habibi as HB

INK = "#000000"
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

def svg(name, w, h, body, defs="", amp=1.0, step=4.0, decimals=1, plain=(), plain_top=()):
    """`plain` goes under `body` and `plain_top` over it, without the wobble (polygons and fine strokes: the wobble bake
    would multiply their bytes for nothing, and an item picture is stored on chain, under 120 KB)."""
    body = "\n".join(plain) + "\n" + bake("\n".join(body), amp=amp, freq=0.09, step=step) + "\n" + "\n".join(plain_top)
    defs = bake(defs, amp=amp, freq=0.09, step=step)          # a clip's outline wobbles exactly as its shape does
    rnd = lambda m: (f"{float(m.group(0)):.{decimals}f}".rstrip("0").rstrip("."))
    body = re.sub(r"-?\d+\.\d+", rnd, body); defs = re.sub(r"-?\d+\.\d+", rnd, defs)
    src = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           + (f'<defs>{defs}</defs>\n' if defs else '') + f'<g id="{name}">\n{body}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print(f"wrote {name} ({len(src) / 1024:.1f} KB)")

def pts_d(pts): return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + " Z"

def card_pattern(pid, t=5.0, x0=0.0, y0=0.0):
    """The shemagh's check drawn for a card (bigger than on a pet, so it is denser and bolder, or it reads as a net):
    red lines on the diagonal, a diamond at every crossing and a small one in every cell."""
    lw = t*0.2; d = t*0.3; e = t*0.13; c = t/2
    P = lambda pts, extra="": f'<polygon points="{" ".join(f"{x:.2f},{y:.2f}" for x, y in pts)}" fill="{HB.KF_RED}" {extra}/>'
    parts = [P([(0, c - lw/2), (t, c - lw/2), (t, c + lw/2), (0, c + lw/2)]), P([(c - lw/2, 0), (c + lw/2, 0), (c + lw/2, t), (c - lw/2, t)]),
             P([(c, c - d), (c + d, c), (c, c + d), (c - d, c)])]
    for (qx, qy) in ((0, 0), (t, 0), (0, t), (t, t)):
        parts.append(P([(qx, qy - e*1.5), (qx + e*1.5, qy), (qx, qy + e*1.5), (qx - e*1.5, qy)], 'opacity="0.9"'))
    return (f'<pattern id="{pid}" patternUnits="userSpaceOnUse" x="{x0:.2f}" y="{y0:.2f}" width="{t:.2f}" height="{t:.2f}" patternTransform="rotate(45)">'
            + "".join(parts) + '</pattern>')

def card_tassel(x, y, L, col, knot, lw=1.3):
    """A knotted tassel, card size: a knot, then a spray of strands flaring out (polylines: no wobble, few bytes)."""
    out = []
    for dx in (-2.4, -0.8, 0.8, 2.4):
        pts = f"{x:.1f},{y + 2:.1f} {x + dx*0.45:.1f},{y + L*0.55:.1f} {x + dx:.1f},{y + L:.1f}"
        out.append(f'<polyline points="{pts}" fill="none" stroke="{INK}" stroke-width="{lw + 1.7:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
        out.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>')
    out.append(f'<ellipse cx="{x:.1f}" cy="{y + 1.2:.1f}" rx="2.6" ry="2.2" fill="{knot}" stroke="{INK}" stroke-width="{lw:.1f}"/>')
    return out

def keffiyehcard():
    """The keffiyeh as it sits on a head, the head unseen: the shemagh over the crown and falling past the cheeks to a
    knotted point each side, the agal ringing it above the brow, and through the face's opening the inside of the cloth
    in shade, down to the point of the fold hanging at the back. Light from the upper left, like everything on the stage."""
    cx = 75.0
    dome = [(cx + 42*math.cos(math.radians(a)), 58 + 42*math.sin(math.radians(a))) for a in range(188, 353, 8)]
    # outside: the crown's dome, the falls flaring out and down to a point each, their inner edges, the back fold's point
    OUTL = ([(16, 156), (19, 132), (25, 104), (30.5, 80), (33.2, 62)] + dome + [(116.8, 62), (119.5, 80), (125, 104), (131, 132), (134, 156),
            (118, 150), (106, 136), (92, 144), (75, 151), (58, 144), (44, 136), (32, 150)])
    out_d = smooth_closed(OUTL, 0.3)
    # the front edge round the face's opening, from the inner edge of the left fall over the brow to the right one's
    HEM = [(44.0, 136.0), (43.0, 118.0), (42.6, 100.0), (43.8, 87.0), (48.5, 76.5), (57.0, 69.5), (66.5, 66.2), (75.0, 65.4),
           (83.5, 66.2), (93.0, 69.5), (101.5, 76.5), (106.2, 87.0), (107.4, 100.0), (107.0, 118.0), (106.0, 136.0)]
    hole = HEM + [(92, 144), (75, 151), (58, 144)]
    hole_d = smooth_closed(hole, 0.3)
    defs = (card_pattern("kfcardpat", 5.0, 0.6, 1.4)
            + f'<clipPath id="kfcardclip"><path d="{out_d}"/></clipPath>'
            + f'<clipPath id="kfcardhole"><path d="{hole_d}"/></clipPath>'
            + '<linearGradient id="kfcardin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A0B0E" stop-opacity=".92"/>'
              '<stop offset=".45" stop-color="#1A0B0E" stop-opacity=".8"/><stop offset="1" stop-color="#1A0B0E" stop-opacity=".7"/></linearGradient>')
    body = [path(out_d, HB.KF_WHITE, "none", 0), path(out_d, "url(#kfcardpat)", "none", 0)]
    body.append('<g clip-path="url(#kfcardclip)">')
    # shade: the far (right) side of the crown and its fall, a soft band where the agal presses, the left fall's inner fold
    body.append(path(smooth_closed([(98, 20), (114, 34), (119, 60), (124, 100), (134, 156), (112, 148), (110, 100), (108, 62), (104, 36)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.24"'))
    body.append(path(smooth_closed([(30, 50), (75, 55.5), (120, 50), (120, 58), (75, 62.5), (30, 58)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.14"'))
    body.append(path(smooth_closed([(26, 104), (38, 100), (43, 124), (40, 140), (32, 150), (22, 140)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.14"'))
    # the edge band just outside the face's opening, and the fine line beyond it
    body.append(path(HB.band_d(HB.offset_open(HEM, -3.3), 3.2), HB.KF_RED, "none", 0))
    body.append(path(smooth_open(HB.offset_open(HEM, -6.6), 0.5), "none", HB.KF_RED, 1.1))
    # creases down the falls
    for c in ([(28, 96), (26, 122), (24, 146)], [(36, 100), (36, 124), (36, 142)], [(122, 96), (124, 122), (126, 146)], [(114, 100), (114, 124), (114, 142)]):
        body.append(path(smooth_open(c, 0.5), "none", HB.KF_RED2, 1.1, 'opacity="0.4"'))
    body.append('</g>')
    # the inside of the cloth through the opening: the same cloth, deep in shade, darkest up under the brow
    body.append('<g clip-path="url(#kfcardhole)">')
    body.append(path(hole_d, "url(#kfcardin)", "none", 0))
    body.append(path(smooth_open([(58, 138), (75, 146), (92, 138)], 0.5), "none", "#000000", 1.2, 'opacity="0.35"'))
    body.append('</g>')
    body.append(path(smooth_open(HEM, 0.4), "none", INK, 2.6))
    body.append(path(out_d, "none", INK, 2.6))
    # the agal: a ring round the head above the brow, its back half over the top of the crown, its front across the brow
    # the agal the pets wear (the cat's: habibi.agal, w 7.2 on a cloth ~120 wide; here as thick for its size): ONE ring of
    # two cords side by side, snug on the cloth where the crown of the head is. Seen a little from above only its front arc
    # shows, across the cloth over the brow, its ends going round the sides (clipped to the cloth); the back half is behind
    # the head. (Drawn as a whole ring it read as a stack of tyres: the operator.)
    ab, af = HB.agal(cx, 47.4, 44.5, 5.0, 6.6, INK, 1.7, back_from=0, back_to=0)
    top = ['<g clip-path="url(#kfcardclip)">'] + af + ['</g>']
    # the knotted fringe: at each fall's point and at the back fold's
    for (x, y, k) in ((17, 152, 0), (24, 153.5, 1), (31, 150.5, 2), (119, 150.5, 2), (126, 153.5, 1), (133, 152, 0), (70, 148, 1), (80, 148, 0)):
        top += card_tassel(x, y, 9.5, HB.KF_RED if k % 2 == 0 else HB.KF_WHITE, HB.KF_RED2 if k % 2 == 0 else "#E4D8CF")
    svg("keffiyehcard", 150, 170, body, defs, plain_top=top)

def bishtcard():
    """The bisht as if on unseen shoulders, front on: from the rounded shoulders its black wool falls in long wide sleeves either side and
    straight down the front, open down the middle on its dark inside; the gold zari broad round the neck and down both
    front edges, along the shoulders and round the sleeves' mouths, catching the spotlight."""
    cx = 75.0
    # half the outline (the left), mirrored: the neck, the rounded shoulder, the sleeve's long outer edge down to its mouth,
    # the mouth, the body under the sleeve, the hem; then across the top the back of the collar, standing up behind the neck
    L = [(cx - 13, 22.0), (52, 23.4), (38.5, 26.4), (27, 31.2), (18.5, 38.6), (13.5, 49), (11.2, 62), (8.5, 90), (6.0, 118), (18, 123.5), (31, 121.5),
         (29.5, 136), (27.5, 154), (48, 156), (cx, 155.5)]
    COLLAR = [(cx + 11.5, 19.2), (cx + 5.5, 17.6), (cx, 17.2), (cx - 5.5, 17.6), (cx - 11.5, 19.2)]
    cloak = smooth_closed(L + [(150 - x, y) for x, y in reversed(L)] + COLLAR, 0.3)
    # the inside of the back of the collar, seen through the open neck: from the collar's top edge down to the neckline
    NECK = [(cx + 13, 22.6), (cx + 8, 27.0), (cx, 29.6), (cx - 8, 27.0), (cx - 13, 22.6)]
    collar_face = smooth_closed(COLLAR[::-1] + [(cx - 13, 22.0)] + NECK[::-1][1:-1] + [(cx + 13, 22.0)], 0.3)
    inside = smooth_closed([(cx - 13, 23), (cx - 8.5, 38), (cx - 7.0, 90), (cx - 7.2, 154.5), (cx + 7.2, 154.5), (cx + 7.0, 90), (cx + 8.5, 38), (cx + 13, 23), (cx, 30)], 0.3)
    body = [path(cloak, HB.BISHT, "none", 0)]
    body.append(f'<clipPath id="bishtcardclip"><path d="{cloak}"/></clipPath>')
    body.append('<g clip-path="url(#bishtcardclip)">')
    # the light on the fine wool: a broad soft sheen down each sleeve and each front panel, the shoulders lit
    for f in ([(16, 56), (12, 88), (11, 114)], [(134, 56), (138, 88), (139, 114)], [(45, 44), (43, 100), (44, 150)], [(105, 44), (107, 100), (106, 150)]):
        body.append(path(smooth_open(f, 0.5), "none", HB.BISHT_HI, 5.0, 'opacity="0.45"'))
    body.append(path(smooth_closed([(30, 30), (60, 24), (60, 30), (32, 37)], 0.5), HB.BISHT_HI, "none", 0, 'opacity="0.5"'))
    body.append(path(smooth_closed([(120, 30), (90, 24), (90, 30), (118, 37)], 0.5), HB.BISHT_HI, "none", 0, 'opacity="0.35"'))
    # the sleeves hang over the body: the shadow they cast on it, and the seam where each sleeve joins it
    for s in (-1, 1):
        X = lambda pts: [(cx + s*(x - cx), y) for x, y in pts]
        body.append(path(smooth_closed(X([(31, 121.5), (40, 122), (40, 134), (30, 136)]), 0.5), HB.BISHT_LN, "none", 0, 'opacity="0.55"'))
        body.append(path(smooth_open(X([(31, 121.5), (32.5, 90), (33, 50), (31, 34)]), 0.5), "none", HB.BISHT_LN, 2.0))
    body.append(path(inside, "#110D0A", "none", 0))      # (inside the clip: its curve overshot the hem and hung below it)
    body.append(path(collar_face, "#2E2620", "none", 0))
    body.append(path(smooth_open(NECK, 0.4), "none", "#0B0806", 1.6, 'opacity="0.8"'))   # where the collar's inside meets the dark of the neck
    body.append('</g>')
    body.append(path(cloak, "none", INK, 2.6))
    for s in (-1, 1):
        X = lambda pts: [(cx + s*(x - cx), y) for x, y in pts]
        body.append(path(smooth_open(X([(31, 121.5), (32.5, 90), (33, 50), (31, 34)]), 0.5), "none", INK, 1.6))
    # the gold
    gold = []
    # along the back of the collar, round the neck, seen inside the opening
    gold += HB.zari(HB.smooth_pts([(cx - 12.2, 21.2), (cx - 5.6, 19.8), (cx, 19.5), (cx + 5.6, 19.8), (cx + 12.2, 21.2)], 6), 3.4, INK, 1.2, 4.0)
    for s in (-1, 1):
        # down the front edge: broad over the chest, narrowing toward the hem
        edge = HB.smooth_pts(HB.offset_open([(cx + s*13.2, 22.6), (cx + s*9.4, 36), (cx + s*7.9, 52), (cx + s*7.3, 84), (cx + s*7.3, 120), (cx + s*7.6, 154.5)], -3.0*s), 6)
        ring = HB.band_pts(edge, 11.0, 5.4)
        gold.append(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in ring)}" fill="{HB.ZARI}" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>')
        for off in (-1, 1):
            inner_line = HB.band_pts(edge, 11.0*0.62, 5.4*0.62)
            half = inner_line[:len(edge)] if off < 0 else inner_line[len(edge):][::-1]
            gold.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in half)}" fill="none" stroke="{HB.ZARI2}" stroke-width=".9"/>')
        gold += HB.zari(edge, 3.0, INK, 0.0, 4.6)[3:]     # its row of little diamonds
        # the sleeve's mouth
        gold += HB.zari(HB.smooth_pts([(cx + s*(cx - 6.4), 115.5), (cx + s*(cx - 12.5), 121.4), (cx + s*(cx - 30), 119.6)], 6), 5.0, INK, 1.4, 4.0)
        # along the shoulder, from the neck out over the top of the sleeve
        gold += HB.zari(HB.smooth_pts([(cx + s*15.5, 25.0), (cx + s*27.5, 27.8), (cx + s*39.5, 32.4)], 6), 3.4, INK, 1.2, 4.0)
    # glints where the spotlight catches the gold
    gold.append(f'<polyline points="{cx - 12.4:.1f},27 {cx - 10.6:.1f},37 {cx - 9.8:.1f},48" fill="none" stroke="{HB.ZARI_HI}" stroke-width="1.5" stroke-linecap="round" opacity=".95"/>')
    gold.append(f'<polyline points="{cx + 10.8:.1f},40 {cx + 10.0:.1f},50" fill="none" stroke="{HB.ZARI_HI}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>')
    svg("bishtcard", 150, 160, body, plain_top=gold)

def falconperch():
    """The falcon's block perch (a wakr): a round block of dark wood with a padded turf top and a leather rim, on a spike
    driven into a little mound of sand. The falcon's toes grip its top at (70, 120) in falcon.svg's box, so it is drawn in
    that box, its top at y 120."""
    cx, top = 70.0, 120.0
    g = []
    # the mound of sand, and the spike's collar standing in it
    g.append(path(smooth_closed([(cx - 34, top + 46), (cx - 18, top + 38.5), (cx, top + 36.5), (cx + 18, top + 38.5), (cx + 34, top + 46), (cx, top + 48.5)], 0.4), "#E4C58C", INK, 2.2))
    g.append(path(smooth_open([(cx - 20, top + 43), (cx - 8, top + 41), (cx + 4, top + 42)], 0.5), "none", "#C9A56A", 1.4))
    g.append(path(smooth_closed([(cx - 3.6, top + 30), (cx + 3.6, top + 30), (cx + 3.2, top + 39.5), (cx - 3.2, top + 39.5)], 0.2), "#8C9097", INK, 2.0))
    # the block: a drum of dark wood, the grain, its lit and shaded sides
    g.append(path(smooth_closed([(cx - 23, top + 4), (cx + 23, top + 4), (cx + 21.5, top + 27), (cx, top + 30.5), (cx - 21.5, top + 27)], 0.25), "#6E4124", INK, 2.4))
    g.append(path(smooth_open([(cx - 15, top + 8), (cx - 14.5, top + 26)], 0.5), "none", "#95613A", 3.0, 'opacity="0.8"'))
    g.append(path(smooth_open([(cx + 13, top + 9), (cx + 13.5, top + 27)], 0.5), "none", "#4B2A15", 2.6, 'opacity="0.8"'))
    g.append(path(smooth_open([(cx - 4, top + 10), (cx - 3, top + 18), (cx - 4, top + 28)], 0.5), "none", "#4B2A15", 1.2, 'opacity="0.6"'))
    # the leather rim round its top, and the padded turf on it
    g.append(path(smooth_closed([(cx - 23.5, top + 1.8), (cx, top - 3.4), (cx + 23.5, top + 1.8), (cx + 23, top + 6.5), (cx, top + 10), (cx - 23, top + 6.5)], 0.4), "#8A5A33", INK, 2.2))
    g.append(path(smooth_closed([(cx - 20, top + 1.8), (cx, top - 1.8), (cx + 20, top + 1.8), (cx, top + 5.8)], 0.5), "#4E8A45", "none", 0))
    g.append(path(smooth_open([(cx - 14, top + 1.6), (cx - 4, top + 3.8), (cx + 8, top + 1.2)], 0.5), "none", "#6FAE5E", 1.4, 'opacity="0.9"'))
    svg("falconperch", 140, 170, g, amp=0.7, step=3.5)

if __name__ == "__main__":
    keffiyehcard()
    bishtcard()
    falconperch()
