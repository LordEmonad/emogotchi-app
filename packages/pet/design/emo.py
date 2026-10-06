"""The emo pack's shared pieces (DEV only until it is an item; the lab is /emopack): its palette and the bits every pet's
drawing uses (the beanie's knit, the broken-heart patch, the checkerboard, the sweatband). Each character's own file
draws its pieces with these, in its own shapes, like habibi.py for the Habibi pack.

Colours are their own hex values, so pet.css can find them by attribute: the gold rules (crowned) and the ghost rules
match fills and strokes by colour, never by element.
"""
import math

INK = "#000000"
# the beanie: a black knit (a touch of plum in it), its ribs a lighter black, its fold's shadow darker
KNIT   = "#1D1921"
KNIT2  = "#2F2934"   # the ribs, the knit's light
KNITD  = "#0E0B11"   # the cuff's fold, in shade
# the black emo hair under it: blue-black, its strands a soft grey-plum
HAIRB  = "#15121A"
HAIRB2 = "#3D3545"
# the clothes: a black tee, purple stripes (the cat's own purple, so the ghost's rule pales them), black skinny jeans,
# silver studs, a hot pink print
TEE    = "#1B171F"
TEE2   = "#2B2530"   # its folds' light
STRIPE = "#906096"
JEANS  = "#25222D"
JEANS2 = "#3B3747"
STUD   = "#C9CED8"
STUD2  = "#8A90A0"
HEART  = "#E84D7F"
HEART2 = "#B23562"
GOLDLINE = "#D9AE4A"   # the crowned clothes' gold pinstripe (its own gold: no rule recolours it)
CHECKB = "#141118"   # the checkerboard's black
CHECKW = "#F4F2F7"   # and its white (not the fur's #F8F8FF: the ghost must not turn a shoe lavender)
# the wristband: the cat's own (purple, a lavender stripe)
BAND   = "#906096"
BAND2  = "#EAC6EA"
# eyeliner: a soft black, its smudge translucent
LINER  = "#0B080D"


def fmt(v):
    return f"{v:.1f}"


def path(d, fill="none", stroke=INK, w=2.7, extra=""):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round" {extra}/>'


def poly(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


def smooth_closed(pts, t=0.5):
    n = len(pts); out = []
    for i in range(n):
        p0, p1, p2, p3 = pts[(i-1) % n], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        c1 = (p1[0] + (p2[0]-p0[0])*t/3, p1[1] + (p2[1]-p0[1])*t/3)
        c2 = (p2[0] - (p3[0]-p1[0])*t/3, p2[1] - (p3[1]-p1[1])*t/3)
        if i == 0: out.append(f"M{p1[0]:.1f},{p1[1]:.1f}")
        out.append(f"C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}")
    return " ".join(out) + " Z"


def smooth_open(pts, t=0.5):
    n = len(pts); out = [f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"]
    for i in range(n-1):
        p0 = pts[max(i-1, 0)]; p1 = pts[i]; p2 = pts[i+1]; p3 = pts[min(i+2, n-1)]
        c1 = (p1[0] + (p2[0]-p0[0])*t/3, p1[1] + (p2[1]-p0[1])*t/3)
        c2 = (p2[0] - (p3[0]-p1[0])*t/3, p2[1] - (p3[1]-p1[1])*t/3)
        out.append(f"C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}")
    return " ".join(out)


def broken_heart(cx, cy, s, fill=HEART, ink=INK, lw=1.2, rot=0.0):
    """A small heart split down the middle by a zigzag crack, its two halves a hair apart: the pack's mark (the beanie's
    patch, a print). `s` is its width. Returns a list of paths."""
    def heart_half(side):
        pts = []
        # the heart's outline, from the bottom point up round one lobe to the top dip
        for k in range(0, 21):
            t = math.pi * k / 20
            x = 16*math.sin(t)**3
            y = -(13*math.cos(t) - 5*math.cos(2*t) - 2*math.cos(3*t) - math.cos(4*t))
            pts.append((x*side, y))
        return pts
    crack = [(0, -5.4), (-2.2, -1.6), (1.6, 1.8), (-1.4, 5.6), (0.9, 9.2), (0, 16)]
    out = []
    for side in (-1, 1):
        half = heart_half(side)          # from (0, -5) at the dip... t=0 is the top dip, t=pi the bottom point
        shift = 0.9*side
        pts = [(x + shift, y) for x, y in half] + [(x + shift, y) for x, y in crack[::-1]]
        sc = s/32.0; ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        P = [(cx + (x*ca - y*sa)*sc, cy + (x*sa + y*ca)*sc) for x, y in pts]
        out.append(path(poly(P), fill, ink, lw))
    return out


def checker_pattern(pid, size, rot=0.0):
    """A black-and-white checkerboard as a <pattern> (in user space), squares `size` wide, turned `rot` degrees."""
    s = size
    return (f'<pattern id="{pid}" patternUnits="userSpaceOnUse" width="{2*s:.2f}" height="{2*s:.2f}" patternTransform="rotate({rot:.1f})">'
            f'<rect x="0" y="0" width="{2*s:.2f}" height="{2*s:.2f}" fill="{CHECKW}"/>'
            f'<rect x="0" y="0" width="{s:.2f}" height="{s:.2f}" fill="{CHECKB}"/><rect x="{s:.2f}" y="{s:.2f}" width="{s:.2f}" height="{s:.2f}" fill="{CHECKB}"/></pattern>')


def stripes_across(a, b, u_from, u_to, width, period, duty, fill):
    """Bands across a straight limb from a to b (fractions along it), `period` and `duty` as fractions of the length:
    the stripes of a striped sleeve. Each band is a quad as wide as the limb."""
    dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L
    h = width/2; out = []; u = u_from
    while u < u_to - 1e-6:
        u1 = min(u + period*duty, u_to)
        p0 = (a[0] + dx*u, a[1] + dy*u); p1 = (a[0] + dx*u1, a[1] + dy*u1)
        out.append(path(poly([(p0[0]+nx*h, p0[1]+ny*h), (p1[0]+nx*h, p1[1]+ny*h), (p1[0]-nx*h, p1[1]-ny*h), (p0[0]-nx*h, p0[1]-ny*h)]), fill, "none", 0))
        u += period
    return out


def sweatband(a, b, u0, u1, width, lw=1.8):
    """A sweatband across a straight limb from a to b, between fractions u0..u1: a purple band with a white stripe round
    its middle (the cat's own wristband, cat.py band())."""
    dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L
    p0 = (a[0] + dx*u0, a[1] + dy*u0); p1 = (a[0] + dx*u1, a[1] + dy*u1); h = width/2
    quad = [(p0[0]+nx*h, p0[1]+ny*h), (p1[0]+nx*h, p1[1]+ny*h), (p1[0]-nx*h, p1[1]-ny*h), (p0[0]-nx*h, p0[1]-ny*h)]
    m = (a[0] + dx*(u0+u1)/2, a[1] + dy*(u0+u1)/2); inner = h - lw*0.9
    stripe = f"M{m[0]+nx*inner:.1f},{m[1]+ny*inner:.1f} L{m[0]-nx*inner:.1f},{m[1]-ny*inner:.1f}"
    sw = max(1.6, (u1 - u0)*L*0.32)
    return [path(poly(quad), BAND, INK, lw), path(stripe, "none", BAND2, sw)]


def lip_ring(cx, cy, r, w=1.0):
    """A small silver hoop through the lower lip (a snakebite): the ring open at its top, where it goes into the lip, an
    ink edge under the silver, a glint. Crowned it is gold (pet.css: by its silver)."""
    a0, a1 = math.radians(-35), math.radians(215)
    n = 14; pts = [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts)
    return [path(d, "none", INK, w + 0.9), path(d, "none", STUD, w), f'<circle cx="{cx - r * 0.45:.2f}" cy="{cy + r * 0.72:.2f}" r="{max(0.35, w * 0.32):.2f}" fill="#FFFFFF"/>']


# where each pet's lip rings go into its lower lip, per mouth: {pet: {mouth: [[x, y], ...]}}, the lowest point of that
# mouth's ink at each ring's column (tools/shots/lip-measure.mjs --write measures the drawings and writes it)
import json as _json, os as _os
_LR = _os.path.join(_os.path.dirname(__file__), "liprings.json")
def lipring_edges(pet):
    try:
        with open(_LR) as f: return _json.load(f).get(pet, {})
    except FileNotFoundError:
        return {}

def lip_rings(mid, pts, r, w, tuck=0.5):
    """The lip rings for one mouth: a hoop at each (x, edge), its two ends going into the lower lip `tuck` above the lip's
    edge. A twin of #mouth-<mid> (rig.ts), so it shows and fades with that mouth and, when the rig scales the mouth (a
    chew, a yawn, a scream), each hoop moves with the lip at its own point without growing (`data-at`: that point).
    Hidden unless the pet wears the piercings (pet.css .haspiercings)."""
    out = [f'<g class="lipring" data-twin="mouth-{mid}"' + ('' if mid == "idle" else ' display="none"') + '>']
    for (x, edge) in pts:
        at = edge - tuck
        out.append(f'<g class="hoop" data-at="{x:.2f} {at:.2f}">' + "".join(lip_ring(x, at + 0.57 * r, r, w)) + '</g>')
    out.append('</g>')
    return "".join(out)


def _resample(pts, n):
    """`n` points evenly spaced along the polyline `pts` (by length), first and last included."""
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]
    total = sum(seg) or 1.0
    out = []
    for k in range(n):
        d = total * k / (n - 1); i = 0
        while i < len(seg) - 1 and d > seg[i]: d -= seg[i]; i += 1
        t = d / (seg[i] or 1.0)
        out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t))
    return out


def knit_ribs(cuff_top, outline, n, w=1.0, reach=0.9, bow=0.06, skip=1, colour=KNITD, opacity=0.8):
    """The knit's ribs: `n` lines running from the cuff's top up to the hat's outline, like meridians: the i-th starts at
    the i-th of n evenly spaced points along `cuff_top` and runs toward the i-th along `outline` (both given in the same
    order, front to back), so no two ever cross; each stops at `reach` of the way, bowed a little outward (`bow` of its
    length) so the knit reads round. The first and last `skip` are left out (they would lie along the hat's edge)."""
    a = _resample(cuff_top, n); b = _resample(outline, n)
    cx = sum(p[0] for p in outline) / len(outline); cy = sum(p[1] for p in outline) / len(outline)
    out = []
    for i in range(skip, n - skip):
        (x0, y0), (x1, y1) = a[i], b[i]
        x1, y1 = x0 + (x1 - x0) * reach, y0 + (y1 - y0) * reach
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        L = math.hypot(x1 - x0, y1 - y0) or 1.0
        nx, ny = -(y1 - y0) / L, (x1 - x0) / L
        if (mx - cx) * nx + (my - cy) * ny < 0: nx, ny = -nx, -ny   # bow away from the hat's middle
        c = (mx + nx * L * bow, my + ny * L * bow)
        out.append(path(f"M{x0:.1f},{y0:.1f} Q{c[0]:.1f},{c[1]:.1f} {x1:.1f},{y1:.1f}", "none", colour, w, f'opacity="{opacity}"'))
    return out


def cuff_ribs(edge, top, spacing=3.2, w=1.1, lo=0.14, hi=0.74, colour=KNIT2, opacity=0.75):
    """The cuff's ribs: short lines across the folded band, evenly spaced along it (`spacing` apart), each from `lo` to
    `hi` of the way from its lower edge (`edge`) to its top (`top`, the same points moved up)."""
    L = sum(math.hypot(edge[i + 1][0] - edge[i][0], edge[i + 1][1] - edge[i][1]) for i in range(len(edge) - 1))
    n = max(3, int(L / spacing) + 1)
    a = _resample(edge, n); b = _resample(top, n)
    return [path(f"M{x0 + (x1 - x0) * lo:.1f},{y0 + (y1 - y0) * lo:.1f} L{x0 + (x1 - x0) * hi:.1f},{y0 + (y1 - y0) * hi:.1f}", "none", colour, w, f'opacity="{opacity}"')
            for (x0, y0), (x1, y1) in zip(a[1:-1], b[1:-1])]
