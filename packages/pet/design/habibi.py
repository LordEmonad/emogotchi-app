"""The Habibi pack's pieces, shared by every character's design script (cat.py, frog.py, sahur.py, seal.py).

The keffiyeh is the red-and-white shemagh (the Gulf's and Jordan's; never the black-and-white one) held on with the black
agal cord; the bisht is the sheer black cloak with gold embroidery down its front edges. Everything here returns plain
SVG strings with explicit attributes, so each script can drop them into its own groups. The shemagh's check is a
<pattern> of polygons (the wobble bake leaves polygons alone, so the tile stays seamless); the pattern and every clip
go in a top-level <defs> per character (a def inside a hidden group does not resolve, and with several pets on one
page url(#id) resolves to the first element with that id in the document, so the ids carry the character's prefix).
Colours are the pack's own so pet.css can recolour them by attribute: crowned, the agal turns gold and the bisht's cloth
turns a gold camel; a ghost pales the cloth.
"""
import math

KF_WHITE = "#FAF6F0"   # the shemagh's cotton (warm, not FUR: the ghost and zombie rules recolour FUR by attribute)
KF_SHADE = "#6B3F3F"   # its folds and the side away from the light, laid over the check at a low opacity so the check shows through
KF_RED   = "#C8102E"   # the check
KF_RED2  = "#9E0B24"   # the check in shade, the tassels' knots
AGAL     = "#1C1A1A"   # the agal's cord (its own black, so a crowned pet's agal can turn gold by attribute)
AGAL_HI  = "#4A4646"   # the light along the cord
BISHT    = "#221C17"   # the bisht's wool, a warm black (crowned: a gold camel)
BISHT_HI = "#3A3129"   # its lit folds
BISHT_LN = "#15110E"   # its fold lines
ZARI     = "#D9A93C"   # the gold embroidery (zari) down the front edges
ZARI2    = "#A5761C"   # its shade and the stitched pattern
ZARI_HI  = "#F6DC8E"   # its glints

def _pts(ps): return " ".join(f"{x:.2f},{y:.2f}" for x, y in ps)
def poly(ps, fill, extra=""): return f'<polygon points="{_pts(ps)}" fill="{fill}" stroke="none" {extra}/>'

def shemagh_pattern(pid, tile=5.4, x0=0.0, y0=0.0, red=KF_RED, rot=45):
    """The shemagh's check as a <pattern> in the user space of whatever uses it: a red grid of thin lines with a small
    diamond at every crossing and a tiny one in every cell (the fabric's fine houndstooth, read at pet size), turned 45
    degrees: the cloth is a square folded corner to corner, so on the head its check runs on the diagonal to the edge.
    Only the red is drawn: the cloth is filled white underneath, then again with url(#pid)."""
    t = tile; lw = t*0.15; d = t*0.21; e = t*0.09
    c = t/2
    parts = [
        poly([(0, c - lw/2), (t, c - lw/2), (t, c + lw/2), (0, c + lw/2)], red),
        poly([(c - lw/2, 0), (c + lw/2, 0), (c + lw/2, t), (c - lw/2, t)], red),
        poly([(c, c - d), (c + d, c), (c, c + d), (c - d, c)], red),
    ]
    for (qx, qy) in ((0, 0), (t, 0), (0, t), (t, t)):     # the small diamond in each cell, centred on the tile's corners
        parts.append(poly([(qx, qy - e*1.6), (qx + e*1.6, qy), (qx, qy + e*1.6), (qx - e*1.6, qy)], red, 'opacity="0.85"'))
    return (f'<pattern id="{pid}" patternUnits="userSpaceOnUse" x="{x0:.2f}" y="{y0:.2f}" width="{t:.2f}" height="{t:.2f}" patternTransform="rotate({rot})">'
            + "".join(parts) + '</pattern>')

def offset_open(pts, dist):
    """A polyline offset sideways by dist (positive: to the left of the direction of travel)."""
    out = []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        xa, ya = pts[max(i-1, 0)]; xb, yb = pts[min(i+1, n-1)]
        dx, dy = xb - xa, yb - ya; m = math.hypot(dx, dy) or 1
        out.append((x - dy/m*dist, y + dx/m*dist))
    return out

def ellipse_arc(cx, cy, rx, ry, a0, a1, n=40, rot=0.0):
    """Points along an ellipse from angle a0 to a1 (degrees; 0 = right, 90 = down), turned by rot degrees about its centre."""
    r = math.radians(rot); out = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0)*k/n)
        x, y = rx*math.cos(a), ry*math.sin(a)
        out.append((cx + x*math.cos(r) - y*math.sin(r), cy + x*math.sin(r) + y*math.cos(r)))
    return out

def band_d(pts, w0, w1=None):
    """A ribbon along pts, w0 wide at the start and w1 at the end, as a closed path (straight segments)."""
    w1 = w0 if w1 is None else w1
    n = len(pts)
    L, R = [], []
    for i, (x, y) in enumerate(pts):
        u = i/(n-1) if n > 1 else 0; w = (w0 + (w1 - w0)*u)/2
        xa, ya = pts[max(i-1, 0)]; xb, yb = pts[min(i+1, n-1)]
        dx, dy = xb - xa, yb - ya; m = math.hypot(dx, dy) or 1
        L.append((x - dy/m*w, y + dx/m*w)); R.append((x + dy/m*w, y - dx/m*w))
    ring = L + R[::-1]
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in ring) + " Z"

def line_d(pts):
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts)

def agal(cx, cy, rx, ry, w, ink="#000000", lw=1.4, rot=0.0, back_from=180, back_to=360):
    """The agal, the doubled black cord that holds the shemagh on, seen from the front a little above: an ellipse round the
    head, its back half (a0..a1 over the top) drawn first and thinner, then its front half over the cloth. Each half is two
    cords side by side (a line splits the band) with a light along the top cord. Polygons and polylines (the wobble bake
    leaves them alone: a cord is smooth, and it keeps the bytes down). Returns (back, front) lists of strings."""
    def half(a0, a1, ww):
        pts = ellipse_arc(cx, cy, rx, ry, a0, a1, 40, rot)
        ring = band_pts(pts, ww)
        out = [f'<polygon points="{_pts(ring)}" fill="{AGAL}" stroke="{ink}" stroke-width="{lw:.2f}" stroke-linejoin="round"/>']
        out.append(f'<polyline points="{_pts(pts[1:-1])}" fill="none" stroke="{ink}" stroke-width="{lw*0.55:.2f}" opacity="0.9"/>')
        hi = offset_open(pts, ww*0.26)[4:-4]
        out.append(f'<polyline points="{_pts(hi)}" fill="none" stroke="{AGAL_HI}" stroke-width="{max(0.5, ww*0.14):.2f}" stroke-linecap="round"/>')
        return out
    back = half(back_from, back_to, w*0.78) if back_from < back_to else []
    front = half(0, 180, w)
    return back, front

def band_pts(pts, w0, w1=None):
    """The ribbon of band_d as a point ring."""
    w1 = w0 if w1 is None else w1
    n = len(pts); L, R = [], []
    for i, (x, y) in enumerate(pts):
        u = i/(n-1) if n > 1 else 0; w = (w0 + (w1 - w0)*u)/2
        xa, ya = pts[max(i-1, 0)]; xb, yb = pts[min(i+1, n-1)]
        dx, dy = xb - xa, yb - ya; m = math.hypot(dx, dy) or 1
        L.append((x - dy/m*w, y + dx/m*w)); R.append((x + dy/m*w, y - dx/m*w))
    return L + R[::-1]

def tassels(pts, n, length, ink="#000000", lw=0.9, seed=0):
    """The shemagh's knotted fringe hanging from a hem: n tassels spaced along pts (a polyline), red and white by turns,
    each a little knot and a spray of strands. Polylines and polygons only (no wobble, few bytes)."""
    import random
    rnd = random.Random(seed)
    segs = [math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1)]
    total = sum(segs); out = []
    for k in range(n):
        s = total*(k + 0.5)/n; i = 0
        while i < len(segs) - 1 and s > segs[i]: s -= segs[i]; i += 1
        u = s/segs[i] if segs[i] else 0
        x = pts[i][0] + (pts[i+1][0]-pts[i][0])*u; y = pts[i][1] + (pts[i+1][1]-pts[i][1])*u
        col = KF_RED if k % 2 == 0 else KF_WHITE
        L = length*rnd.uniform(0.85, 1.1)
        spray = [(x - 2.0, y + L), (x - 0.7, y + L + 0.8), (x + 0.7, y + L + 0.8), (x + 2.0, y + L)]
        body = [(x - 1.1, y + 1.5)] + spray + [(x + 1.1, y + 1.5)]
        out.append(f'<polygon points="{_pts(body)}" fill="{col}" stroke="{ink}" stroke-width="{lw:.2f}" stroke-linejoin="round"/>')
        out.append(f'<polyline points="{x:.2f},{y+3:.2f} {x:.2f},{y+L:.2f}" fill="none" stroke="{KF_RED2 if k % 2 == 0 else KF_SHADE}" stroke-width="0.6"/>')
        out.append(f'<ellipse cx="{x:.2f}" cy="{y+1.4:.2f}" rx="1.9" ry="1.5" fill="{KF_RED2 if k % 2 == 0 else KF_SHADE}" stroke="{ink}" stroke-width="{lw:.2f}"/>')
    return out

def zari(pts, w, ink="#000000", lw=0.9, gap=3.4, seed=0):
    """The bisht's gold embroidery (zari) as a band along pts: gold with a darker stitched line down each side, a row of
    little diamonds down its middle and a glint now and then, inked along both edges. Polygons and polylines only."""
    ring = band_pts(pts, w)
    out = [f'<polygon points="{_pts(ring)}" fill="{ZARI}" stroke="{ink}" stroke-width="{lw:.2f}" stroke-linejoin="round"/>']
    for side in (1, -1):
        out.append(f'<polyline points="{_pts(offset_open(pts, side*w*0.27))}" fill="none" stroke="{ZARI2}" stroke-width="{max(0.35, w*0.09):.2f}"/>')
    # resample the centreline every `gap` for the diamonds
    segs = [math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1)]
    total = sum(segs); k = 0; s = gap/2
    r = w*0.2
    while s < total:
        i = 0; t = s
        while i < len(segs) - 1 and t > segs[i]: t -= segs[i]; i += 1
        u = t/segs[i] if segs[i] else 0
        x = pts[i][0] + (pts[i+1][0]-pts[i][0])*u; y = pts[i][1] + (pts[i+1][1]-pts[i][1])*u
        col = ZARI_HI if k % 3 == 1 else ZARI2
        out.append(f'<polygon points="{_pts([(x, y - r), (x + r, y), (x, y + r), (x - r, y)])}" fill="{col}"/>')
        s += gap; k += 1
    return out

def sheen(lines, w=1.6, opacity=0.5):
    """The bisht's fine wool catching the light: soft lighter strokes down its folds."""
    return [f'<polyline points="{_pts(l)}" fill="none" stroke="{BISHT_HI}" stroke-width="{w:.2f}" stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}"/>' for l in lines]

def smooth_pts(pts, per=8):
    """Points along a Catmull-Rom curve through pts, `per` samples a span: a smooth polyline for zari()/band_pts()."""
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        for k in range(per):
            t = k/per; t2 = t*t; t3 = t2*t
            out.append(tuple(0.5*((2*p1[j]) + (-p0[j] + p2[j])*t + (2*p0[j] - 5*p1[j] + 4*p2[j] - p3[j])*t2 + (-p0[j] + 3*p1[j] - 3*p2[j] + p3[j])*t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out
