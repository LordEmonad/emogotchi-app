"""Emo Pets character generator -> packages/pet/cat.svg

The cat, re-rigged for a tamagotchi: front legs and hind feet are their
own groups so it can walk, plus hidden extras (tear, dirt, more mouths and eyes, a
ground shadow) for the pet states.

Sibling of the Emonad mascot: white cat, huge plum emo mop swept over one eye
with inked strand lines, one big purple half-lidded eye, black $EMO tee,
purple/white wristbands on both front legs, gold jewelled crown askew in the
hair. Flat fills, wobbly black ink line, no shading.

Every shape is a point list in a 200x230 viewBox. Tune numbers, re-run,
render with render.py, look. Tunables can be overridden on the CLI:
    python3 cat.py tilt=0 lid=0.3 wobble=1.6
"""
import math, random, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---- Emonad brand palette (reference/emonads-palette.png) ----
INK    = "#000000"
FUR    = "#F8F8FF"
HAIR   = "#502858"
STRAND = "#724278"
PURPLE = "#906096"
LAV    = "#EAC6EA"
LAV2   = "#B894D8"   # iris light (gear palette)
PINK   = "#E84D7F"
GOLD   = "#E8D89B"
GOLD2  = "#D4A646"
RUBY   = "#8B1A2D"
GREEN  = "#6BB84A"
TEAL   = "#2D7D8A"
PUPIL  = "#281828"
TEE    = "#000000"
# Halloween outfits (items): pumpkin orange and its candle, mummy linen, zombie stitching and brain.
PUMPKIN  = "#F08A24"
PUMPKIN2 = "#C9651A"
FLAME    = "#FFD36B"
MOSS     = "#3E6B2E"
LINEN    = "#EFE6C8"
LINEN2   = "#D9CBA3"
STITCH   = "#111111"   # stitch thread: its own black so a crowned zombie's thread can turn gold by attribute
BRAIN    = "#E9A3B8"
BRAIN2   = "#C97A93"
PATCH    = "#93AD8C"   # a darker patch of fur sewn on
PUMPKIN3 = "#DD7A1F"   # the pumpkin's back lobes, a shade darker than the front
BRAIN_AT = (116, 36, -7)   # the zombie's brain: centre and tilt; out of the top of the skull, where a crown sits on it

LW = 2.7   # contour ink
LD = 1.7   # detail ink (toes, whiskers, mouth, band edges)

P = {}
def par(k, v):
    P.setdefault(k, v); return P[k]

# ---------------- path helpers ----------------
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

def poly(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"

def path(d, fill="none", stroke=INK, w=LW, extra=""):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round" {extra}/>'

def ellipse(cx, cy, rx, ry, fill, stroke=INK, w=LW, extra=""):
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" {extra}/>'

def tube(pts, width, fill=FUR, t=0.5):
    """Outlined tube along a polyline: black stroke under a fill stroke."""
    d = smooth_open(pts, t)
    return [path(d, "none", INK, width), path(d, "none", fill, width - 2*LW)]

def tapered(pts, w0, w1, t=0.5, fill=FUR):
    """Filled, outlined tube that tapers from w0 at the start to w1 at the tip."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, t))[0][1]
    c = []
    for seg in segs:
        smp = _samples(seg, 2.0)
        c += smp if not c else smp[1:]
    n = len(c); left = []; right = []
    for i, (x, y) in enumerate(c):
        x0, y0 = c[max(i-1, 0)]; x1, y1 = c[min(i+1, n-1)]
        tx, ty = x1-x0, y1-y0; L = math.hypot(tx, ty) or 1; nx, ny = -ty/L, tx/L
        w = (w0 + (w1-w0)*i/(n-1))/2
        left.append((x+nx*w, y+ny*w)); right.append((x-nx*w, y-ny*w))
    tipx, tipy = c[-1]; x0, y0 = c[-2]; tx, ty = tipx-x0, tipy-y0; L = math.hypot(tx, ty) or 1
    r = w1/2; ang0 = math.atan2(-ty/L, -tx/L) + math.pi/2  # from the left side round the tip
    # The arc must run from the left side round to the right, because the polygon is assembled as
    # left + tip + reversed right. Swept the other way it starts on the right side and ends on the left,
    # so the outline crosses the tail's width twice at the tip and the stroke on those crossings shows
    # as a little black dash past the fur. (The on-chain art was baked with the dash; the site is live.)
    tip = [(tipx + r*math.cos(ang0 + math.pi*k/4), tipy + r*math.sin(ang0 + math.pi*k/4)) for k in range(3, 0, -1)]
    poly_pts = left + tip + right[::-1]
    return [path(smooth_closed(poly_pts, 0.4), fill)]

def lerp(a, b, u):
    return (a[0] + (b[0]-a[0])*u, a[1] + (b[1]-a[1])*u)

def band(a, b, u0, u1, width):
    """Wristband across a straight leg from a to b, between fractions u0..u1."""
    dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy); nx, ny = -dy/L, dx/L
    p0, p1 = lerp(a, b, u0), lerp(a, b, u1); h = width/2
    quad = [(p0[0]+nx*h, p0[1]+ny*h), (p1[0]+nx*h, p1[1]+ny*h),
            (p1[0]-nx*h, p1[1]-ny*h), (p0[0]-nx*h, p0[1]-ny*h)]
    m = lerp(a, b, (u0+u1)/2); inner = width/2 - LW
    stripe = f"M{m[0]+nx*inner:.1f},{m[1]+ny*inner:.1f} L{m[0]-nx*inner:.1f},{m[1]-ny*inner:.1f}"
    return [path(poly(quad), PURPLE, INK, 1.8), path(stripe, "none", LAV, 2.6)]

def letters(cx, cy, h, color, w_stroke=2.4):
    """Hand-drawn $EMO, centred on (cx, cy), cap height h."""
    out = []; w = h*0.58; gap = h*0.36; x = cx - (4*w + 3*gap)/2
    sx = x + w/2; r = w/2
    S = (f"M{sx+r*0.9:.1f},{cy-h*0.30:.1f} "
         f"C{sx+r*0.9:.1f},{cy-h*0.62:.1f} {sx-r*1.1:.1f},{cy-h*0.62:.1f} {sx-r*1.0:.1f},{cy-h*0.22:.1f} "
         f"C{sx-r*0.9:.1f},{cy+h*0.08:.1f} {sx+r*1.0:.1f},{cy-h*0.06:.1f} {sx+r*1.0:.1f},{cy+h*0.24:.1f} "
         f"C{sx+r*1.0:.1f},{cy+h*0.62:.1f} {sx-r*1.0:.1f},{cy+h*0.62:.1f} {sx-r*0.95:.1f},{cy+h*0.30:.1f}")
    out.append(path(S, "none", color, w_stroke))
    for off in (-r*0.28, r*0.28):
        out.append(path(f"M{sx+off:.1f},{cy-h*0.66:.1f} L{sx+off:.1f},{cy+h*0.66:.1f}", "none", color, w_stroke*0.7))
    x += w + gap
    out.append(path(f"M{x+w:.1f},{cy-h/2:.1f} L{x:.1f},{cy-h/2:.1f} L{x:.1f},{cy+h/2:.1f} L{x+w:.1f},{cy+h/2:.1f} M{x:.1f},{cy} L{x+w*0.8:.1f},{cy}", "none", color, w_stroke))
    x += w + gap
    out.append(path(f"M{x:.1f},{cy+h/2:.1f} L{x:.1f},{cy-h/2:.1f} L{x+w/2:.1f},{cy+h*0.1:.1f} L{x+w:.1f},{cy-h/2:.1f} L{x+w:.1f},{cy+h/2:.1f}", "none", color, w_stroke))
    x += w + gap
    out.append(ellipse(x+w/2, cy, w/2, h/2, "none", color, w_stroke))
    return out

def _centreline(pts, t=0.5, step=2.0):
    """Sample a smooth open curve through pts into a polyline with unit normals."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, t))[0][1]
    c = []
    for seg in segs:
        smp = _samples(seg, step)
        c += smp if not c else smp[1:]
    n = len(c); out = []
    for i, (x, y) in enumerate(c):
        x0, y0 = c[max(i-1, 0)]; x1, y1 = c[min(i+1, n-1)]
        tx, ty = x1-x0, y1-y0; L = math.hypot(tx, ty) or 1
        out.append((x, y, -ty/L, tx/L))
    return out

def strip(pts, w, t=0.5, fill=None, crease=True, lw=None):
    """A bandage: a constant-width strip along pts, outlined, with one crease line down it. Flat ends
    (they are clipped to the body they wrap, or hidden under the next strip)."""
    fill = LINEN if fill is None else fill; lw = LW if lw is None else lw
    c = _centreline(pts, t)
    left = [(x + nx*w/2, y + ny*w/2) for x, y, nx, ny in c]
    right = [(x - nx*w/2, y - ny*w/2) for x, y, nx, ny in c]
    out = [path(poly(left + right[::-1]), fill, INK, lw)]
    if crease:
        k = max(1, len(c)//5)
        cr = [(x + nx*w*0.18, y + ny*w*0.18) for x, y, nx, ny in c[1::k]]
        if len(cr) > 1: out.append(path(smooth_open(cr), "none", LINEN2, 1.5, 'opacity="0.9"'))
    return out

def loose_end(pts, w):
    """A bandage end hanging free: tapers a touch and frays at the tip."""
    out = tapered(pts, w, w*0.82, 0.5, LINEN)
    c = _centreline(pts, 0.5)
    k = max(1, len(c)//4)
    cr = [(x + nx*w*0.16, y + ny*w*0.16) for x, y, nx, ny in c[1::k]]
    if len(cr) > 1: out.append(path(smooth_open(cr), "none", LINEN2, 1.4, 'opacity="0.9"'))
    tx, ty, nx, ny = c[-1]
    for s_ in (-0.3, 0.25):
        out.append(path(f"M{tx + nx*w*s_:.1f},{ty + ny*w*s_:.1f} L{tx + nx*w*s_ + (tx - c[-3][0])*0.5:.1f},{ty + ny*w*s_ + (ty - c[-3][1])*0.5:.1f}", "none", LINEN2, 1.3))
    return out

def stitches(a, b, n=4, tick=5.0, w=1.8):
    """A stitched-up scar from a to b: the seam and n cross ticks."""
    dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L
    out = [path(f"M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}", "none", STITCH, w)]
    for i in range(n):
        u = (i + 0.5) / n; m = lerp(a, b, u); h = tick/2
        out.append(path(f"M{m[0]+nx*h:.1f},{m[1]+ny*h:.1f} L{m[0]-nx*h:.1f},{m[1]-ny*h:.1f}", "none", STITCH, w*0.85))
    return out

def brain(cx, cy, rx, ry, rot=0):
    """Two pink lobes with a sulcus between and a few folds, poking out of an opened skull."""
    lobes = [(cx-rx, cy+ry*0.3), (cx-rx*0.95, cy-ry*0.35), (cx-rx*0.6, cy-ry*0.95), (cx-rx*0.15, cy-ry*0.8), (cx, cy-ry*0.45),
             (cx+rx*0.15, cy-ry*0.85), (cx+rx*0.6, cy-ry), (cx+rx*0.95, cy-ry*0.4), (cx+rx, cy+ry*0.3), (cx+rx*0.7, cy+ry*0.9),
             (cx+rx*0.2, cy+ry), (cx-rx*0.3, cy+ry*0.95), (cx-rx*0.75, cy+ry*0.85)]
    out = [f'<g transform="rotate({rot} {cx} {cy})">', path(smooth_closed(lobes, 0.45), BRAIN, INK, LW)]
    out.append(path(f"M{cx:.1f},{cy-ry*0.5:.1f} Q{cx-rx*0.12:.1f},{cy+ry*0.2:.1f} {cx+rx*0.05:.1f},{cy+ry*0.95:.1f}", "none", BRAIN2, 1.7))
    for (x0, y0, x1, y1, x2, y2) in ((-0.75, -0.2, -0.5, -0.55, -0.25, -0.15), (-0.7, 0.45, -0.45, 0.2, -0.2, 0.55),
                                     (0.25, -0.35, 0.5, -0.65, 0.75, -0.25), (0.25, 0.5, 0.5, 0.15, 0.78, 0.5)):
        out.append(path(f"M{cx+rx*x0:.1f},{cy+ry*y0:.1f} Q{cx+rx*x1:.1f},{cy+ry*y1:.1f} {cx+rx*x2:.1f},{cy+ry*y2:.1f}", "none", BRAIN2, 1.5))
    out.append('</g>')
    return out

def stitched_patch(quad, fill=None):
    """A darker patch of fur sewn on: the patch, then ticks along its top and left edges."""
    fill = PATCH if fill is None else fill
    out = [path(smooth_closed(quad, 0.2), fill, INK, LD)]
    for a, b in ((quad[0], quad[1]), (quad[0], quad[3])):
        dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L
        for i in range(4):
            m = lerp(a, b, (i + 0.5)/4)
            out.append(path(f"M{m[0]+nx*2.4:.1f},{m[1]+ny*2.4:.1f} L{m[0]-nx*2.4:.1f},{m[1]-ny*2.4:.1f}", "none", STITCH, 1.5))
    return out


def lens(cx, cy, w, h, angle=0.0, n=28):
    """A carved eye: a lens with pointed ends (two arcs), w wide and h tall, turned by angle degrees."""
    a = math.radians(angle); out = []
    for k in range(n):
        t = 2*math.pi*k/n
        x = (w/2)*math.cos(t); y = (h/2)*math.sin(t)*abs(math.sin(t))**0.55
        out.append((cx + x*math.cos(a) - y*math.sin(a), cy + x*math.sin(a) + y*math.cos(a)))
    return out

# ---------------- the Jewish pack (items): kippah + payot, Star of David ----------------
KIPPAH   = "#FDFDFB"   # the kippah's white (not FUR: the ghost and zombie rules recolour FUR by attribute)
KIPPAH2  = "#D5DCEA"   # its shaded side
ISRAEL   = "#0038B8"   # the flag's blue: the stripes and the star
SILVER   = "#DDE3EC"   # the pendant; crowned, pet.css turns these gold
SILVER2  = "#A9B3C4"

def ringlet(x0, y0, length, turns, r0, r1, w0, w1, phase=0.0, hand=1, lw=1.5, tip=0.14, density=28):
    """A payot curl: a lock of hair wound into a corkscrew, hanging from (x0, y0). The lock is a tube round a helix
    seen side-on; the half-turns at the back go down first, shaded, and the ones at the front over them. Each half-turn
    is a fill plus its two side lines with no ends, so the tube's outline runs on unbroken where front meets back. The
    last `tip` of the length tapers to a point. Returns the pieces in draw order."""
    T = 2*math.pi*turns
    n = max(8, int(density*turns))            # samples per turn (the item card, stored on chain, uses fewer)
    pts = []
    for i in range(n + 1):
        u = i/n; t = T*u
        r = r0 + (r1 - r0)*u
        w = w0 + (w1 - w0)*u
        if u > 1 - tip: w *= max(0.12, (1 - u)/tip)
        pts.append((x0 + hand*r*math.sin(t + phase), y0 + u*length, w, math.cos(t + phase) > 0))
    runs, cur = [], [pts[0]]
    for q in pts[1:]:
        cur.append(q)
        if q[3] != cur[0][3] or q is pts[-1]:
            runs.append(cur); cur = [q]
    # the flag flips mid-run: a run is front if most of it is
    back, front = [], []
    for run in runs:
        k = len(run); fr = sum(1 for q in run if q[3]) > k/2
        L, R = [], []
        for i, (x, y, w, _) in enumerate(run):
            xa, ya = run[max(i-1, 0)][:2]; xb, yb = run[min(i+1, k-1)][:2]
            dx, dy = xb - xa, yb - ya; m = math.hypot(dx, dy) or 1
            nx, ny = -dy/m, dx/m
            L.append((x + nx*w/2, y + ny*w/2)); R.append((x - nx*w/2, y - ny*w/2))
        body = smooth_open(L, 0.5) + " L" + smooth_open(R[::-1], 0.5)[1:] + " Z"
        out = [path(body, HAIR, "none", 0)]
        if not fr:
            out.append(path(body, INK, "none", 0, 'opacity="0.24"'))
        else:
            hl = [(a[0]*0.62 + b[0]*0.38, a[1]*0.62 + b[1]*0.38) for a, b in zip(L, R)][max(1, k//6):k - max(1, k//6)]
            if len(hl) > 2: out.append(path(smooth_open(hl, 0.5), "none", STRAND, lw*0.9))
        out.append(path(smooth_open(L, 0.5), "none", INK, lw))
        out.append(path(smooth_open(R, 0.5), "none", INK, lw))
        (front if fr else back).append("\n".join(out))
    return back + front

def hexagram(cx, cy, r, sy=1.0, rot=0.0):
    """The Star of David's two triangles (point up, point down), r to the points, squashed by sy for a surface seen at a slant."""
    a0 = math.radians(rot)
    def tri(off):
        return [(cx + r*math.cos(a0 + off + k*2*math.pi/3), cy + sy*r*math.sin(a0 + off + k*2*math.pi/3)) for k in range(3)]
    return tri(-math.pi/2), tri(math.pi/2)

def star_outline(cx, cy, r, sy=1.0, rot=0.0):
    """The hexagram's outer outline, twelve corners (the points and the notches between them, at r/sqrt(3))."""
    a0 = math.radians(rot); out = []
    for k in range(12):
        rr = r if k % 2 == 0 else r/math.sqrt(3)
        a = a0 - math.pi/2 + k*math.pi/6
        out.append((cx + rr*math.cos(a), cy + sy*rr*math.sin(a)))
    return out

def interlaced_star(cx, cy, R, w, lw, ink, silver, silver2, blue, white="#FFFFFF"):
    """A Star of David charm: the two triangles as silver bands with the flag's blue inlaid down each, the middle open,
    woven over and under at alternate crossings (all polygons, no clips: a clip defined inside a hidden group breaks for
    the pets after it on a page). A bail at the top point for the chain. Crowned, pet.css turns the silver gold.
    R is the outer point radius, w the band's width."""
    import math
    def tri(rr, up):
        a0 = -math.pi/2 if up else math.pi/2
        return [(cx + rr*math.cos(a0 + k*2*math.pi/3), cy + rr*math.sin(a0 + k*2*math.pi/3)) for k in range(3)]
    def pts(ps): return " ".join(f"{x:.2f},{y:.2f}" for x, y in ps)
    def poly(ps, fill, stroke="none", sw=0, extra=""):
        return f'<polygon points="{pts(ps)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw:.2f}" stroke-linejoin="miter" {extra}/>'
    def line(ps, stroke, sw, extra=""):
        return f'<polyline points="{pts(ps)}" fill="none" stroke="{stroke}" stroke-width="{sw:.2f}" stroke-linecap="butt" {extra}/>'
    Rm, Ri = R - w, R - 2*w                      # the band's centre line and inner edge (circumradii)
    out = []
    rb = max(0.9, w*0.42)                        # the bail
    out.append(f'<circle cx="{cx:.2f}" cy="{cy - R - rb*0.7:.2f}" r="{rb:.2f}" fill="none" stroke="{ink}" stroke-width="{lw*1.9:.2f}"/>')
    out.append(f'<circle cx="{cx:.2f}" cy="{cy - R - rb*0.7:.2f}" r="{rb:.2f}" fill="none" stroke="{silver2}" stroke-width="{lw*0.9:.2f}"/>')
    def band(up):
        o, i, m = tri(R, up), tri(Ri, up), tri(Rm, up)
        ring = o + [o[0]] + [i[0], i[2], i[1], i[0]]
        return [poly(ring, silver, extra='fill-rule="evenodd"'), poly(m, "none", blue, w*0.3), poly(o, "none", ink, lw), poly(i, "none", ink, lw)]
    out += band(True) + band(False)              # the point-down triangle over the point-up one everywhere...
    # ...then the point-up one back over it at every other crossing: the first crossing along each of its edges
    A, B = tri(Rm, True), tri(Rm, False)
    def cross(p, q, r, s):
        d = (q[0]-p[0])*(s[1]-r[1]) - (q[1]-p[1])*(s[0]-r[0])
        if abs(d) < 1e-9: return None
        t = ((r[0]-p[0])*(s[1]-r[1]) - (r[1]-p[1])*(s[0]-r[0])) / d
        u = ((r[0]-p[0])*(q[1]-p[1]) - (r[1]-p[1])*(q[0]-p[0])) / d
        return t if 0 < t < 1 and 0 < u < 1 else None
    def meet(p1, d1, p2, d2):
        det = d1[0]*d2[1] - d1[1]*d2[0]
        t = ((p2[0]-p1[0])*d2[1] - (p2[1]-p1[1])*d2[0]) / det
        return (p1[0] + d1[0]*t, p1[1] + d1[1]*t)
    def unit(p, q):
        ex, ey = q[0]-p[0], q[1]-p[1]; el = math.hypot(ex, ey); return (ex/el, ey/el)
    def inside(P, a, b, c):                       # P on the same side of the line ab as the point c
        cr = lambda u, v, w_: (v[0]-u[0])*(w_[1]-u[1]) - (v[1]-u[1])*(w_[0]-u[0])
        return cr(a, b, P) * cr(a, b, c) >= 0
    def clip_poly(poly_, conv):                   # Sutherland-Hodgman: poly_ cut to the convex polygon conv
        c0 = (sum(x for x, _ in conv)/len(conv), sum(y for _, y in conv)/len(conv))
        out_ = poly_
        for e in range(len(conv)):
            a, b = conv[e], conv[(e+1) % len(conv)]
            src, out_ = out_, []
            for i_ in range(len(src)):
                P, Q = src[i_], src[(i_+1) % len(src)]
                pin, qin = inside(P, a, b, c0), inside(Q, a, b, c0)
                if pin: out_.append(P)
                if pin != qin: out_.append(meet(P, (Q[0]-P[0], Q[1]-P[1]), a, (b[0]-a[0], b[1]-a[1])))
            if not out_: break
        return out_
    def clip_seg(P, Q, conv):                     # the part of the segment PQ inside conv
        c0 = (sum(x for x, _ in conv)/len(conv), sum(y for _, y in conv)/len(conv))
        t0, t1 = 0.0, 1.0
        for e in range(len(conv)):
            a, b = conv[e], conv[(e+1) % len(conv)]
            nx_, ny_ = -(b[1]-a[1]), b[0]-a[0]
            if (c0[0]-a[0])*nx_ + (c0[1]-a[1])*ny_ < 0: nx_, ny_ = -nx_, -ny_
            den = (Q[0]-P[0])*nx_ + (Q[1]-P[1])*ny_; num = (P[0]-a[0])*nx_ + (P[1]-a[1])*ny_
            if abs(den) < 1e-12:
                if num < 0: return None
                continue
            t = -num/den
            if den > 0: t0 = max(t0, t)
            else: t1 = min(t1, t)
        if t1 - t0 < 1e-6: return None
        return [(P[0] + (Q[0]-P[0])*t0, P[1] + (Q[1]-P[1])*t0), (P[0] + (Q[0]-P[0])*t1, P[1] + (Q[1]-P[1])*t1)]
    m = lw*1.2                                   # past the crossing on both sides, to cover the other band's ink
    Ao, Ai = tri(R, True), tri(Ri, True)
    for k in range(3):
        p, q = A[k], A[(k+1) % 3]
        hits = sorted((t, j) for j in range(3) for t in [cross(p, q, B[j], B[(j+1) % 3])] if t is not None)
        if not hits: continue
        j = hits[0][1]
        uA = unit(p, q); nA = (-uA[1], uA[0])
        uB = unit(B[j], B[(j+1) % 3]); nB = (-uB[1], uB[0])
        side = {}
        for sa in (1, -1):
            pa = (p[0] + nA[0]*sa*w/2, p[1] + nA[1]*sa*w/2)
            ends = sorted((meet(pa, uA, (B[j][0] + nB[0]*sb*w/2, B[j][1] + nB[1]*sb*w/2), uB) for sb in (1, -1)),
                          key=lambda P: P[0]*uA[0] + P[1]*uA[1])
            side[sa] = [(ends[0][0] - uA[0]*m, ends[0][1] - uA[1]*m), (ends[1][0] + uA[0]*m, ends[1][1] + uA[1]*m)]
        # this edge's stretch of the band (outer edge, inner edge, and the mitre lines at its two corners): the patch
        # stays inside it, so near a corner it cannot run past the inner corner or over the other edge's band
        trap = [Ao[k], Ao[(k+1) % 3], Ai[(k+1) % 3], Ai[k]]
        inset = lambda P, sa: (P[0] - nA[0]*sa*lw/2, P[1] - nA[1]*sa*lw/2)
        fill = clip_poly([inset(side[1][0], 1), inset(side[1][1], 1), inset(side[-1][1], -1), inset(side[-1][0], -1)], trap)
        if len(fill) >= 3: out.append(poly(fill, silver))
        mid = [((side[1][0][0] + side[-1][0][0])/2, (side[1][0][1] + side[-1][0][1])/2), ((side[1][1][0] + side[-1][1][0])/2, (side[1][1][1] + side[-1][1][1])/2)]
        # the inlay runs on a little past the patch's slanted ends so no sliver of silver shows over it (the patch's fill
        # stops short of the band's edge lines, which the redrawn ones then cover, so those need no more)
        ext = lambda seg, e: [(seg[0][0] - uA[0]*e, seg[0][1] - uA[1]*e), (seg[1][0] + uA[0]*e, seg[1][1] + uA[1]*e)]
        for seg, col, sw in ((ext(mid, w*0.2), blue, w*0.3), (side[1], ink, lw), (side[-1], ink, lw)):
            # the edges are ON the trapezoid's sides: grow it a hair so they are not cut away as outside
            c = clip_seg(seg[0], seg[1], [(x + (x - cx)*0.02, y + (y - cy)*0.02) for x, y in trap[:2]] + [(x - (x - cx)*0.02, y - (y - cy)*0.02) for x, y in trap[2:]])
            if c: out.append(line(c, col, sw))
    # a glint on the upper left band
    o = tri(R - w*0.5, True)
    g0 = (o[0][0] + (o[2][0]-o[0][0])*0.22, o[0][1] + (o[2][1]-o[0][1])*0.22); g1 = (o[0][0] + (o[2][0]-o[0][0])*0.42, o[0][1] + (o[2][1]-o[0][1])*0.42)
    out.append(line([g0, g1], white, max(0.5, w*0.22), 'opacity="0.9"'))
    return out

def kippah_cap(cx, rim_y, w, h, bulge, rot=0.0, lw=LW, clip_id="kippahclip"):
    """A kippah on top of a head, seen from the front a little from above: a dome of cloth whose front rim dips toward
    us. White, the flag's two blue stripes running round it near the rim, a blue Star of David on its front slope, the
    far side in shade. `cx, rim_y` is the middle of the rim, w its width, h the dome's height, bulge the rim's dip.
    Returns (defs, parts): the clip goes in a <defs> that is never inside a hidden group (a clip defined in a
    display:none tree does not resolve, and with several pets on a page url(#id) finds the first one in the document)."""
    hw = w/2
    def lat(v, n=24):
        """The latitude line at height v (0 rim .. 1 top) across the front of the dome, left to right."""
        rw = hw*math.sqrt(max(0.0, 1 - v*v)); b = bulge*math.sqrt(max(0.0, 1 - v*v))
        yc = rim_y - h*v
        return [(cx - rw*math.cos(math.pi*k/n), yc + b*math.sin(math.pi*k/n)) for k in range(n + 1)]
    dome = [(cx - hw*math.cos(math.pi*k/28), rim_y - h*math.sin(math.pi*k/28)) for k in range(29)]     # left rim, over the top, right rim
    rim = lat(0.0)[::-1]                                                                                  # right to left along the front
    outline = dome + rim[1:-1]
    d = smooth_closed(outline, 0.45)
    out = [f'<g transform="rotate({rot} {cx} {rim_y})">']
    out.append(path(d, KIPPAH, "none", 0))
    defs = f'<clipPath id="{clip_id}"><path d="{d}"/></clipPath>'
    out.append(f'<g clip-path="url(#{clip_id})">')
    out.append(ellipse(cx + hw*0.62, rim_y - h*0.2, hw*0.62, h*0.95, KIPPAH2, "none", 0, 'opacity="0.95"'))    # the side away from the light
    def band(v0, v1):
        a, b = lat(v0), lat(v1)
        return path(smooth_open(a, 0.5) + " L" + smooth_open(b[::-1], 0.5)[1:] + " Z", ISRAEL, "none", 0)
    out.append(band(0.1, 0.23))
    out.append(band(0.34, 0.47))
    out.append(path(smooth_open(lat(0.03), 0.5), "none", KIPPAH2, 1.2, 'opacity="0.9"'))                  # the rim's stitched edge
    sc, sr = rim_y - h*0.73, h*0.33
    for t in hexagram(cx - hw*0.04, sc, sr, sy=0.72):
        out.append(path(poly(t), "none", ISRAEL, max(1.2, lw*0.55)))
    out.append('</g>')
    out.append(path(d, "none", INK, lw))
    out.append('</g>')
    return defs, out

# ---------------- the Habibi pack (items): keffiyeh + agal, bisht ----------------
import habibi as HB

def keffiyeh_cat(HEAD_T, head_d):
    """The keffiyeh on the cat: the red-and-white shemagh over her head, tented over her ears, held on by the agal, its
    front edge across her upper forehead (her fringe falls out from under it) and its sides hanging behind her face onto
    her shoulders, a knotted fringe of tassels at the ends. Two layers of one cloth: #keffiyehback behind the head (and
    behind the body, like her back hair, which it replaces) and #keffiyeh over the head (the top, the edge, the agal). The
    two share one pattern in one user space and the same folds, and the seam between them (from the temples out to the
    sides) has no ink, so it cannot be seen. Returns (defs, back, front)."""
    def dome(a):   # the cloth over the crown: a dome hugging the head, a soft bump over each ear
        x = 100 + 58*math.cos(math.radians(a)); y = 60 + 36*math.sin(math.radians(a))
        y -= 4.5*(math.exp(-((x - 62)/11)**2) + math.exp(-((x - 138)/11)**2))
        return (x, y)
    TOP = [dome(a) for a in range(192, 349, 8)]
    OUT = ([(33, 150), (32, 126), (34, 100), (37, 78), (40, 62)] + TOP + [(160, 62), (163, 78), (166, 100), (168, 126), (167, 150),
           (150, 150), (128, 138), (100, 134), (72, 138), (50, 150)])
    out_d = smooth_closed(OUT, 0.4)
    NT = len(TOP) + 10   # the index in OUT past the top's last point on the right (the top line runs OUT[2:NT])
    # the front edge across the forehead: from the face's outline at the left temple over the brow to the right temple
    HEM = [(52.5, 93), (57, 82), (67, 73), (83, 68.2), (100, 67), (117, 68.2), (133, 73), (143, 82), (147.5, 93)]
    # the front layer: the cloth above the edge, out to the sides at the height the edge meets the face (the seam, no ink)
    FRONT = [(34.2, 100.5), (34, 100)] + OUT[3:NT - 2] + [(166, 100), (165.8, 100.5)] + HEM[::-1]
    front_d = smooth_closed(FRONT, 0.25)
    # the folds, the same shapes in both layers: the cloth turning back beside the face, and the far side in shade
    FOLDS = [path(smooth_closed([(47, 76), (54, 98), (58, 128), (53, 149), (41, 147), (42, 118), (42, 92)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.13"'),
             path(smooth_closed([(153, 76), (146, 98), (142, 128), (147, 149), (163, 147), (162, 116), (160, 90)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.2"'),
             path(smooth_closed([(118, 30), (138, 28), (152, 40), (156, 56), (148, 55), (134, 42)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.14"'),
             path(smooth_closed([(42, 57), (100, 63), (158, 57), (158, 64), (100, 70), (42, 64)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.13"')]   # the agal presses the cloth: a soft band under it
    # the edge band framing the face down each side, behind the head: from the temple along just outside the face's outline
    # to the ends of the cloth (the forehead's stretch of it is on the front layer)
    def face_side(side, extra=0.0):
        """Just outside the face's outline, from the temple (where the front edge meets it) down the cheek to where the cloth
        goes behind the collar: the head's own ellipse (upper and lower halves, as build() draws it, without the cheek
        tufts), offset out by 2.9 at the temple (the forehead band's own offset) growing to 7.2 past the tufts."""
        def outline(a):
            r = math.radians(a)
            if math.sin(r) > 0: return (100 + 51*math.cos(r), 99 + 40*math.sin(r))
            return (100 + 47*math.cos(r), 96 + 43*math.sin(r))
        angs = [184 - k*4 for k in range(18)] if side < 0 else [356 + k*4 for k in range(18)]
        pts = []
        for n_, a in enumerate(angs):
            (x, y) = outline(a); (x2, y2) = outline(a + (0.5 if side < 0 else -0.5)); (x0, y0) = outline(a - (0.5 if side < 0 else -0.5))
            tx, ty = x2 - x0, y2 - y0; m = math.hypot(tx, ty) or 1
            nx, ny = (ty/m, -tx/m) if side < 0 else (-ty/m, tx/m)        # the outward normal
            if (nx*(x - 100) + ny*(y - 97)) < 0: nx, ny = -nx, -ny
            d = 2.9 + (7.2 - 2.9)*min(1.0, n_/4.0) + extra
            pts.append((x + nx*d, y + ny*d))
        return pts
    SIDEBAND = [(face_side(-1), face_side(-1, 2.7)), (face_side(1), face_side(1, 2.7))]
    CREASES = [path(smooth_open([(37, 106), (39, 128), (37, 147)]), "none", HB.KF_RED2, 1.0, 'opacity="0.3"'),
               path(smooth_open([(163, 106), (161, 128), (163, 147)]), "none", HB.KF_RED2, 1.0, 'opacity="0.3"')]
    # each outline is drawn once, in the defs, and used three times (white, the check, the ink): the wobble bake resamples
    # every path densely, and three copies of it were most of the keffiyeh's bytes
    defs = ('<defs id="keffiyehdefs">' + HB.shemagh_pattern("kfpat", 5.4, 1.3, 2.0)
            + f'<path id="kfout" d="{out_d}"/><path id="kffront" d="{front_d}"/>'
            + '<clipPath id="kffrontclip"><use href="#kffront"/></clipPath><clipPath id="kfbackclip"><use href="#kfout"/></clipPath>'
            # her face: while the keffiyeh is on, the fringe shows only inside it (pet.css), tucked under the cloth; it used to
            # spill out past her cheek over the cloth's side and poke a lock out at the left temple (the operator: "weird")
            + f'<clipPath id="kffaceclip"><path d="{head_d}"/></clipPath></defs>')
    use = lambda ref, fill, stroke="none", w=0: f'<use href="#{ref}" fill="{fill}" stroke="{stroke}" stroke-width="{w}"/>'
    # the back layer: the whole cloth (the head covers its middle); the folds lie inside its outline
    back = [f'<g id="keffiyehback" display="none"><g {HEAD_T}>', use("kfout", HB.KF_WHITE), use("kfout", "url(#kfpat)")]
    back.append('<g clip-path="url(#kfbackclip)">')
    back += FOLDS + CREASES
    for sb, sb2 in SIDEBAND:
        back.append(path(HB.band_d(sb, 2.6), HB.KF_RED, "none", 0))
        back.append(path(smooth_open(sb2, 0.5), "none", HB.KF_RED, 0.9))
    back.append('</g>')
    back.append(use("kfout", "none", INK, LW))
    back += HB.tassels([(34, 149), (44, 151), (56, 147)], 4, 8, INK, 1.0, 3)
    back += HB.tassels([(144, 147), (156, 151), (166, 149)], 4, 8, INK, 1.0, 5)
    back.append('</g></g>')
    ab, af = HB.agal(100, 50.5, 62, 5.5, 7.2, INK, 1.5, back_from=0, back_to=0)   # the front of it only, a thick double cord across the brow; its ends go round the sides (clipped to the cloth)
    front = [f'<g id="keffiyeh" display="none"><g {HEAD_T}>', use("kffront", HB.KF_WHITE), use("kffront", "url(#kfpat)"),
             '<g clip-path="url(#kffrontclip)">'] + FOLDS + ['</g>']
    # the border along the edge: a red band just above it and a fine line over that, the shemagh's edge
    front.append(path(HB.band_d(HB.offset_open(HEM, -2.9), 2.6), HB.KF_RED, "none", 0))
    front.append(path(smooth_open(HB.offset_open(HEM, -5.6), 0.5), "none", HB.KF_RED, 0.9))
    # the edge's shadow on her brow and her hair, so the hair goes in under the cloth instead of being cut off flat
    front.append('<g clip-path="url(#kffaceclip)">')
    front.append(path(HB.band_d(HB.offset_open(HEM, 3.4), 6.0), "#1A0E1E", "none", 0, 'opacity="0.22"'))
    front.append(path(HB.band_d(HB.offset_open(HEM, 2.2), 3.0), "#1A0E1E", "none", 0, 'opacity="0.18"'))
    front.append('</g>')
    front.append(path(smooth_open(HEM, 0.5), "none", INK, LW))                                  # the edge
    front.append('<g clip-path="url(#kfbackclip)">'); front += ab + af; front.append('</g>')
    front.append(path(smooth_open(OUT[2:NT - 2], 0.4), "none", INK, LW))                       # the top, the same line as behind (over the agal's ends)
    front.append('</g></g>')
    return defs, back, front

def bisht_cat():
    """The bisht on the cat: the sheer black cloak with gold embroidery. #bishtback hangs from her shoulders behind her
    to the floor, flaring out past her hips (its right edge stops short of the tail, as the witch's robe does, so the tail
    comes out from under it); #bisht is its two front panels down her flanks, over her hips and under her front legs,
    the open front's gold edges running down beside her legs (her white chest between them, where a man's thobe would
    show); her front legs are in its sleeves (#bishtsleeveL/R, in the leg groups), gold at the cuffs. Returns (back, front)."""
    back = ['<g id="bishtback" class="bisht" display="none">']
    # (slim on her left: the darbuka stands there, its head at her shoulder's height, and a flared cloak hid part of it)
    cape = smooth_closed([(62, 132), (52, 142), (46.5, 154), (44.5, 167), (41.5, 184), (40, 200), (41, 211), (60, 214), (100, 215), (128, 212), (146, 213), (158, 210),
                          (163, 196), (165, 176), (157, 152), (139, 133), (100, 139)], 0.4)
    back.append(path(cape, HB.BISHT, INK, LW))
    back += HB.sheen([[(46, 168), (43.5, 186), (43, 206)], [(158, 162), (161, 186), (158, 204)]], 1.8, 0.55)
    back.append('</g>')
    front = ['<g id="bisht" class="bisht" display="none">']
    for side in (-1, 1):
        X = lambda pts: [(100 + side*(100 - x), y) if side > 0 else (x, y) for x, y in pts]
        panel = X([(64, 131), (54, 137), (47.5, 150), (44, 166), (41, 182), (41, 192), (44.5, 197), (48, 194), (47.5, 176), (50, 159), (55, 146), (61, 136)])
        front.append(path(smooth_closed(panel, 0.35), HB.BISHT, INK, LW))
        front += HB.sheen([X([(46, 164), (43.5, 180), (43.5, 191)])], 1.6, 0.6)
        # the open front's gold, from the collar's end down the flank beside the leg to the hem
        front += HB.zari(X([(59.5, 136.5), (53, 145.5), (48.5, 158), (46.5, 175), (46.8, 193)]), 5.2, INK, 1.0, 3.6)
    front.append('</g>')
    return back, front

# ---------------- the emo pack (DEV only until it is an item; /emopack): beanie, emo clothes, eyeliner ----------------
import emo as EM

def beanie_cat(HEAD_T, back_hair_d, fringe_d, rnd):
    """The beanie on the cat: a black knit beanie pulled down over her head, two soft bumps where her ears are under it, a
    folded cuff across her brow with a broken-heart patch, and under it her own mop in BLACK: the same fringe swept over
    her right eye and the same hair down behind her head (pet.css hides her plum mop and her ears while it is on). Two
    groups in the head unit: #beanieback (the black back hair, behind the head) and #beanie (the black fringe, then the hat
    over it). Crowned, the patch is gold and the crown sits on top of the hat (rig.ts BEANIE_CROWN). Returns (defs, back, front)."""
    def cuff_bottom(x):   # the cuff's lower edge across the brow (lower at the temples)
        u = (x - 100)/60.0
        return 73.5 + 13.5*u*u
    def cuff_top(x):
        u = (x - 100)/60.0
        return 61.5 + 13.0*u*u
    # the hat's outline: up the left side, over two bumps where the ears are, down the right side, then the cuff's lower edge back
    TOP = [(39.5, 88), (37.5, 72), (40, 55), (46.5, 40), (55, 28), (63, 21.5), (71, 21), (79, 25.5), (89, 27.5), (100, 27), (111, 27.5),
           (121, 25.5), (129, 21), (137, 21.5), (145, 28), (153.5, 40), (160, 55), (162.5, 72), (160.5, 88)]
    BOTTOM = [(x, cuff_bottom(x)) for x in range(152, 47, -8)]
    out = TOP + BOTTOM
    hat_d = smooth_closed(out, 0.42)
    cuff = [(x, cuff_top(x)) for x in range(38, 163, 8)] + [(162, cuff_top(162)), (160.5, 88)] + BOTTOM + [(39.5, 88)]
    cuff_d = smooth_closed(cuff, 0.3)
    defs = (f'<defs id="beaniedefs"><clipPath id="beanieclip"><path d="{hat_d}"/></clipPath>'
            f'<clipPath id="beaniecuffclip"><path d="{cuff_d}"/></clipPath>'
            f'<clipPath id="beaniefringeclip"><path d="{fringe_d}"/></clipPath>'
            f'<clipPath id="beaniebackclip"><path d="{back_hair_d}"/></clipPath></defs>')
    # the black hair behind her head: her own back hair's shape, black, its strands grey-plum
    back = [f'<g id="beanieback" display="none"><g {HEAD_T}>', path(back_hair_d, EM.HAIRB), '<g clip-path="url(#beaniebackclip)">']
    for i in range(7):
        x0 = 45 + i*4 + rnd.uniform(-1, 1); y0 = 72 + rnd.uniform(-6, 8); y1 = y0 + rnd.uniform(30, 56)
        back.append(path(smooth_open([(x0, y0), (x0-2.5, (y0+y1)/2), (x0+0.5, y1)]), "none", EM.HAIRB2, 1.4))
    for i in range(7):
        x0 = 131 + i*4 + rnd.uniform(-1, 1); y0 = 70 + rnd.uniform(-6, 8); y1 = y0 + rnd.uniform(30, 56)
        back.append(path(smooth_open([(x0, y0), (x0+2.5, (y0+y1)/2), (x0-0.5, y1)]), "none", EM.HAIRB2, 1.4))
    back.append('</g></g></g>')
    front = [f'<g id="beanie" display="none"><g {HEAD_T}>']
    # the black fringe first (the hat's cuff lies over its roots): her own fringe, swept over her right eye
    front.append(path(fringe_d, EM.HAIRB))
    front.append('<g clip-path="url(#beaniefringeclip)">')
    for i in range(9):
        x0 = 58 + i*10 + rnd.uniform(-3, 3); y0 = 60 + rnd.uniform(0, 6) + i*0.8
        L = rnd.uniform(30, 56); x1 = x0 + L*0.5; y1 = y0 + L*0.9
        front.append(path(smooth_open([(x0, y0), ((x0+x1)/2 - 4, (y0+y1)/2), (x1, y1)]), "none", EM.HAIRB2, 1.5))
    front.append('</g>')
    # the hat: knit black, its ribs running up to the crown, a soft light on its upper left
    front.append(path(hat_d, EM.KNIT, "none", 0))
    front.append('<g clip-path="url(#beanieclip)">')
    front.append(path(smooth_closed([(44, 60), (48, 40), (60, 26), (76, 24), (70, 34), (58, 48), (52, 62)], 0.5), EM.KNIT2, "none", 0, 'opacity="0.55"'))
    for k in range(-7, 8):
        xb = 100 + k*8.2
        if not 40 < xb < 160: continue
        yb = cuff_top(xb) + 1
        xt = 100 + k*4.4; yt = 26 + 0.12*abs(k)**2
        xm = 100 + k*6.9; ym = (yb + yt)/2 - 1
        front.append(path(smooth_open([(xb, yb), (xm, ym), (xt, yt)]), "none", EM.KNITD, 1.1, 'opacity="0.8"'))
    # the cuff: a folded band, darker at its fold, short ribs across it
    front.append(path(cuff_d, EM.KNIT, "none", 0))
    front.append('<g clip-path="url(#beaniecuffclip)">')
    front.append(path(smooth_open([(x, cuff_top(x) + 1.2) for x in range(36, 166, 8)]), "none", EM.KNITD, 3.2, 'opacity="0.9"'))
    for x in range(40, 162, 4):
        front.append(path(f"M{x:.1f},{cuff_top(x) + 2.5:.1f} L{x - 0.3:.1f},{cuff_bottom(x) - 1.5:.1f}", "none", EM.KNIT2, 1.2, 'opacity="0.75"'))
    front.append('</g>')
    front.append('</g>')
    front.append(path(smooth_open([(x, cuff_top(x)) for x in range(38, 163, 8)] + [(162, cuff_top(162))], 0.4), "none", INK, 1.6))   # the fold's edge
    front.append(path(hat_d, "none", INK, LW))
    front += EM.broken_heart(77, 70.5, 14.5, rot=-10, lw=1.4)   # the patch on the cuff, over her left brow
    front.append('</g></g>')
    return defs, back, front

def emofit_cat(torso_d):
    """The emo clothes on the cat: a black long-sleeve with purple stripes on her chest (#emofit, over the torso, under her
    front legs, the collar and the tag), its sleeves down her front legs to her wristbands (#emofitL/R, built in the leg
    loop: emofit_sleeve), and checkered slip-ons on her hind feet (#emofitfootL/R: emofit_shoe). Returns the torso's piece."""
    front = ['<g id="emofit" class="emofit" display="none">', f'<clipPath id="emotorsoclip"><path d="{torso_d}"/></clipPath>',
             path(torso_d, EM.TEE, "none", 0), '<g clip-path="url(#emotorsoclip)">']
    # (crowned: thin gold pinstripes on the black instead of the purple bands; gold bands on black read as a bee)
    front.append('<g class="emostripe">')
    for y in range(140, 212, 12):
        front.append(path(poly([(40, y), (160, y - 1.5), (160, y + 5.2), (40, y + 6.7)]), EM.STRIPE, "none", 0))
    front.append('</g><g class="emogold" display="none">')
    for y in range(140, 212, 12):
        front.append(path(f"M40,{y + 3.3:.1f} L160,{y + 1.8:.1f}", "none", EM.GOLDLINE, 1.6))
    front.append('</g>')
    front.append(path(smooth_open([(58, 150), (62, 178), (70, 200)]), "none", EM.TEE2, 3, 'opacity="0.5"'))   # a fold down each side
    front.append(path(smooth_open([(142, 150), (138, 178), (130, 200)]), "none", EM.TEE2, 3, 'opacity="0.5"'))
    front.append('</g>')
    front.append(path(torso_d, "none", INK, LW))
    front.append('</g>')
    return front

def emofit_sleeve(lid, a, b, leg_w):
    """A striped sleeve down a front leg to just under the wristband (the band at 0.70 sits over its end)."""
    end = lerp(a, b, 0.74); w = leg_w + 4
    out = [f'<g id="emofit{lid[-1]}" class="emofit" display="none">']
    out += tube([a, end], w, EM.TEE)
    out.append('<g class="emostripe">'); out += EM.stripes_across(a, end, 0.10, 1.0, w - 2*LW, 0.21, 0.42, EM.STRIPE); out.append('</g>')
    out.append('<g class="emogold" display="none">'); out += EM.stripes_across(a, end, 0.18, 1.0, w - 2*LW, 0.21, 0.07, EM.GOLDLINE); out.append('</g>')
    out.append('</g>')
    return out

def emofit_shoe(fid, fx, fy):
    """A checkered slip-on on a hind foot: the foot's own oval in a black-and-white check, a white rubber sole along its
    bottom and a black collar round the opening."""
    sid = f'emoshoe{fid[-1]}'
    shoe = smooth_closed([(fx - 12, fy + 1), (fx - 10, fy - 5.5), (fx - 3, fy - 8), (fx + 5, fy - 7.5), (fx + 11, fy - 4), (fx + 12.5, fy + 2),
                          (fx + 10, fy + 6.5), (fx, fy + 7.5), (fx - 10, fy + 6.5)], 0.5)
    return [f'<g id="emofit{fid}" class="emofit" display="none">', f'<clipPath id="{sid}"><path d="{shoe}"/></clipPath>',
            path(shoe, "url(#emocheck)", "none", 0),
            f'<g clip-path="url(#{sid})">', path(poly([(fx - 14, fy + 3.4), (fx + 14, fy + 3.4), (fx + 14, fy + 10), (fx - 14, fy + 10)]), EM.CHECKW, "none", 0),
            path(f"M{fx - 14:.1f},{fy + 3.4:.1f} L{fx + 14:.1f},{fy + 3.4:.1f}", "none", INK, 1.2), '</g>',
            path(smooth_open([(fx - 8, fy - 5.6), (fx - 2, fy - 7.4), (fx + 5, fy - 6.8), (fx + 9.5, fy - 4)]), "none", INK, 2.4),
            path(shoe, "none", INK, LW), '</g>']

PK_MOUTHS = ("idle", "smug", "open", "smile", "frown", "yum")
def carve_mouth(kind, cx, cy, w, h):
    """The jack-o'-lantern's carved mouth for each of the rig's six mouths: the classic zigzag grin (idle), a wider
    and deeper grin (smile, yum), a lopsided one (smug), the grin turned upside down (frown), a round O (open)."""
    if kind == "open":
        return [(cx + w*0.16*math.cos(2*math.pi*k/20), cy + h*0.3 + h*0.8*math.sin(2*math.pi*k/20)) for k in range(20)]
    up = {"idle": .5, "smug": .5, "smile": .85, "yum": .85, "frown": .5}[kind]
    deep = {"idle": 1.0, "smug": .85, "smile": 1.3, "yum": 1.3, "frown": 1.0}[kind]
    ww = w/2 * (1.08 if kind in ("smile", "yum") else 1.0)
    n = 8; tooth = h*0.45; yc = cy - up*h
    top = []
    for i in range(n + 1):
        u = -1 + 2*i/n
        y = yc + (cy - 0.1*h - yc)*(1 - u*u)
        if 0 < i < n and i % 2 == 1: y += tooth
        top.append((cx + u*ww, y))
    bot = []
    for i in range(n - 1, 0, -1):
        u = -1 + 2*i/n
        y = yc + (cy + deep*h - yc)*(1 - u*u)**0.7
        if i == n//2: bot += [(cx + 0.14*ww, y), (cx + 0.12*ww, y - tooth*0.8), (cx - 0.12*ww, y - tooth*0.8), (cx - 0.14*ww, y)]   # one tooth up from the bottom
        else: bot.append((cx + u*ww, y))
    pts = top + bot
    if kind == "smug": pts = [(x, y - 0.3*h*(x - cx)/ww) for x, y in pts]
    if kind == "frown": pts = [(x, 2*cy + 0.3*h - y) for x, y in pts]
    return pts

# ---------------- the drawing ----------------
def build():
    rnd = random.Random(11)
    g = []
    tilt = par("tilt", -3)
    HEAD_T = f'transform="rotate({tilt} 100 140)"'

    # head
    HX, HY, HRX, HRY = 100, 96, 47, 43
    head_pts = []
    for k in range(72):
        a = 2*math.pi*k/72; deg = k*5
        if math.sin(a) > 0:
            x, y = HX + (HRX+4)*math.cos(a), HY + (HRY-3)*math.sin(a) + 3
        else:
            x, y = HX + HRX*math.cos(a), HY + HRY*math.sin(a)
        if deg in (150, 170, 10, 30):          # cheek fluff: two small tufts per side
            x += 4.5*math.cos(a); y += 4.5*math.sin(a)
        head_pts.append((x, y))
    head = smooth_closed(head_pts, 0.35)

    back_hair = smooth_closed([
        (100, 30), (122, 32), (142, 40), (156, 56), (162, 76), (163, 96),
        (161, 116), (156, 136), (150, 124), (142, 142), (134, 128),
        (72, 128), (64, 144), (54, 130), (46, 140), (40, 120),
        (37, 96), (38, 76), (44, 56), (58, 40), (78, 32),
    ], 0.45)

    fringe = smooth_closed([
        (46, 52), (56, 40), (72, 33), (100, 28), (130, 33), (148, 44), (158, 60), (162, 84),
        (158, 106), (152, 126), (147, 126), (141, 116), (132, 130), (127, 130), (120, 118),
        (115, 122), (111, 122), (103, 108), (96, 90), (88, 79), (80, 82), (70, 77), (64, 82),
        # hanging lock over the left temple
        (58, 86), (54, 94), (49, 103), (45, 92), (43, 76),
    ], 0.25)

    earL = [(54, 12), (45, 36), (42, 62), (82, 48), (67, 26)]
    earR = [(146, 12), (155, 36), (158, 62), (118, 48), (133, 26)]
    def inner(tri, s=0.5):
        cx = sum(p[0] for p in tri)/len(tri); cy = sum(p[1] for p in tri)/len(tri)
        return [(cx + (x-cx)*s, cy + (y-cy)*s) for x, y in tri]

    # ---- body geometry: sitting white cat, front legs down the chest ----
    torso = smooth_closed([(74, 128), (60, 138), (50, 158), (50, 184), (64, 204), (100, 208), (136, 204),
                           (150, 184), (150, 158), (140, 138), (126, 128)], 0.5)
    hipL = [(40, 170), (36, 192), (44, 208), (66, 211), (76, 200), (70, 174), (56, 162)]
    hipR = [(160, 170), (164, 192), (156, 208), (134, 211), (124, 200), (130, 174), (144, 162)]
    LEG_W = 22
    legL = ((66, 146), (78, 202))
    legR = ((134, 146), (122, 202))

    # ---------------- the pumpkin's cuts and outline (defs; the pumpkin itself is drawn with the head unit) ----------------
    global PK_LOBES, PK_HOLES
    PK_LOBES = ((62, 88, 27, 52, PUMPKIN3), (138, 88, 27, 52, PUMPKIN3), (80, 87, 30, 57, PUMPKIN), (120, 87, 30, 57, PUMPKIN), (100, 86, 31, 60, PUMPKIN))
    grin = [(100, 112), (106.5, 120), (112, 121.5), (117, 123), (119, 123.2), (121.5, 128.5), (124, 123.8), (129, 124.5), (127.5, 129.5), (121, 135),
            (111, 139), (100, 140.5), (89, 139), (79, 135), (72.5, 129.5), (71, 124.5), (76, 123.8), (78.5, 128.5), (81, 123.2), (83, 123), (88, 121.5), (93.5, 120)]
    PK_HOLES = [smooth_closed(lens(77, 104, 37, 33, 0), 0.5), smooth_closed(lens(122, 102.5, 39, 35, 0), 0.5), poly(grin)]
    g.append('<defs id="pkdefs">')
    g.append('<clipPath id="pkclip">' + "".join(ellipse(cx_, cy_, rx_ + 0.6, ry_ + 0.6, "#000000", "none", 0, HEAD_T) for (cx_, cy_, rx_, ry_, _) in PK_LOBES) + '</clipPath>')
    g.append('<mask id="pkmask" maskUnits="userSpaceOnUse" x="0" y="-20" width="200" height="200"><rect x="0" y="-20" width="200" height="200" fill="#FFFFFF"/>'
             + "".join(path(d, "#000000", "none", 0) for d in PK_HOLES) + '</mask>')
    g.append('<clipPath id="pkholesclip">' + "".join(f'<path d="{d}"/>' for d in PK_HOLES) + '</clipPath>')
    g.append('</defs>')

    # ---------------- draw order ----------------
    # ground shadow (shrinks when the cat is in the air)
    g.append('<g id="shadow">')
    g.append(ellipse(100, 212, 66, 7, PUPIL, "none", 0, 'opacity="0.55"'))
    g.append('</g>')
    # everything that moves as a body (the shadow stays on the floor)
    g.append('<g id="figure">')
    # tail
    g.append('<g id="tail">')
    tail_pts = [(150, 200), (176, 198), (188, 178), (180, 156), (166, 148)]
    g += tapered(tail_pts, 16, 10, 0.6)
    # mummy (costume; hidden until worn): two bandages round the tail, placed along its centreline
    g.append('<g id="mummytail" class="mummy" display="none">')
    tc = _centreline(tail_pts, 0.6); tn = len(tc)
    for f in (0.30, 0.62):
        i0, i1 = int((f - 0.055) * (tn - 1)), int((f + 0.055) * (tn - 1)); w_ = (16 + (10 - 16) * f) / 2 + 1.2
        x0, y0, nx0, ny0 = tc[i0]; x1, y1, nx1, ny1 = tc[i1]
        g.append(path(poly([(x0+nx0*w_, y0+ny0*w_), (x1+nx1*w_, y1+ny1*w_), (x1-nx1*w_, y1-ny1*w_), (x0-nx0*w_, y0-ny0*w_)]), LINEN, INK, 1.8))
        xm, ym, nxm, nym = tc[(i0+i1)//2]
        g.append(path(f"M{xm+nxm*(w_-2):.1f},{ym+nym*(w_-2):.1f} L{xm-nxm*(w_-2):.1f},{ym-nym*(w_-2):.1f}", "none", LINEN2, 1.3, 'opacity="0.9"'))
    g.append('</g>')  # mummytail
    g.append('</g>')  # tail

    # head stack (ears, back hair) - tilts with the head
    g.append(f'<g id="headstack"><g {HEAD_T}>')
    for eid, tri in (("earL", earL), ("earR", earR)):
        g.append(f'<g id="{eid}">')
        g.append(path(smooth_closed(tri, 0.4), FUR))
        g.append(path(smooth_closed(inner(tri, 0.48), 0.4), LAV, INK, 1.4))
        if eid == "earR":
            # mummy: one ear bandaged (the other left free), a strip across it clipped to the ear so it wraps
            g.append(f'<clipPath id="earwrapclip"><path d="{smooth_closed(tri, 0.4)}"/></clipPath>')
            g.append('<g id="earwrap" class="mummy" display="none"><g clip-path="url(#earwrapclip)">')
            g += strip([(112, 46), (136, 40), (162, 36)], 9)
            g.append('</g></g>')
        g.append('</g>')
    g.append('<g id="hairback">')
    g.append(path(back_hair, HAIR))
    g.append(f'<clipPath id="backclip"><path d="{back_hair}"/></clipPath>')
    g.append('<g clip-path="url(#backclip)">')
    for i in range(7):
        x0 = 45 + i*4 + rnd.uniform(-1, 1); y0 = 66 + rnd.uniform(-8, 8); y1 = y0 + rnd.uniform(34, 62)
        g.append(path(smooth_open([(x0, y0), (x0-2.5, (y0+y1)/2), (x0+0.5, y1)]), "none", STRAND, 1.4))
    for i in range(7):
        x0 = 131 + i*4 + rnd.uniform(-1, 1); y0 = 62 + rnd.uniform(-8, 8); y1 = y0 + rnd.uniform(34, 62)
        g.append(path(smooth_open([(x0, y0), (x0+2.5, (y0+y1)/2), (x0-0.5, y1)]), "none", STRAND, 1.4))
    g.append('</g>')
    g.append('</g></g></g>')
    # keffiyeh (item; hidden until worn): the cloth hanging behind the head, where the back hair was (pet.css hides the
    # ears and the back hair while it is worn); its top and agal are drawn over the head, after the kippah
    KF_DEFS, KF_BACK, KF_FRONT = keffiyeh_cat(HEAD_T, head)
    g.append(KF_DEFS)
    g += KF_BACK
    # beanie (emo pack; hidden until worn): the black hair behind her head, where her plum back hair was (pet.css hides
    # it and her ears while the beanie is on); the hat and the black fringe are drawn over the head, after the keffiyeh
    BN_DEFS, BN_BACK, BN_FRONT = beanie_cat(HEAD_T, back_hair, fringe, random.Random(23))
    g.append(BN_DEFS)
    g.append('<defs id="emodefs">' + EM.checker_pattern("emocheck", 3.4, 0) + '</defs>')
    g += BN_BACK

    # hips, hind feet, torso, front legs, wristbands, collar and pendant
    g.append('<g id="body">')
    # witch robe (costume; hidden until worn). First in the body group so it squashes and crouches
    # with the body. A dark cape from under the collar, out past the hips to a wavy hem, lining on
    # the inner edges, a stand-up collar behind the cheeks, a few stars. Its right edge stops short of
    # the tail, so the tail comes out from under the hem instead of through the panel. The sleeves
    # live inside the leg groups so they swing with the legs.
    g.append('<g id="robe" display="none">')
    g.append(path(smooth_closed([(62, 134), (36, 152), (24, 178), (22, 202), (30, 212), (48, 214), (70, 212), (100, 215),
                                 (128, 212), (146, 213), (158, 210), (163, 196), (165, 176), (156, 152), (138, 134),
                                 (100, 140)], 0.4), PUPIL, INK, LW))
    g.append(path(smooth_open([(57, 141), (40, 162), (31, 190), (35, 209)]), "none", PURPLE, 4.4, 'opacity="0.8"'))
    g.append(path(smooth_open([(143, 141), (157, 162), (162, 190), (157, 208)]), "none", PURPLE, 4.4, 'opacity="0.8"'))
    for wing in ([(60, 136), (48, 124), (42, 110), (57, 108), (71, 121), (74, 137)],
                 [(140, 136), (152, 124), (158, 110), (143, 108), (129, 121), (126, 137)]):
        g.append(path(smooth_closed(wing, 0.45), PUPIL, INK, LW))
    g.append(path(smooth_closed([(51, 127), (46, 116), (57, 114), (67, 125), (67, 135)], 0.45), STRAND, "none", 0, 'opacity="0.85"'))
    g.append(path(smooth_closed([(149, 127), (154, 116), (143, 114), (133, 125), (133, 135)], 0.45), STRAND, "none", 0, 'opacity="0.85"'))
    def star(cx, cy, r):
        return path(f"M{cx},{cy-r} L{cx+r*0.28},{cy-r*0.28} L{cx+r},{cy} L{cx+r*0.28},{cy+r*0.28} L{cx},{cy+r} "
                    f"L{cx-r*0.28},{cy+r*0.28} L{cx-r},{cy} L{cx-r*0.28},{cy-r*0.28} Z", LAV, "none", 0, 'opacity="0.85"')
    g.append(star(30, 190, 3.2)); g.append(star(40, 170, 2.2)); g.append(star(27, 206, 1.7)); g.append(star(160, 176, 2.2))
    g.append('</g>')
    # bisht (item; hidden until worn): the cloak behind her, from her shoulders to the floor; its front panels go over the torso
    BISHT_BACK, BISHT_FRONT = bisht_cat()
    g += BISHT_BACK
    g.append(path(smooth_closed(hipL, 0.6), FUR))
    g.append(path(smooth_closed(hipR, 0.6), FUR))
    for fid, fx, toes in (("footL", 50, (46, 52)), ("footR", 150, (148, 154))):
        g.append(f'<g id="{fid}" class="foot">')
        g.append(ellipse(fx, 205, 11, 6.5, FUR))
        for lx in toes:
            g.append(path(f"M{lx},211 L{lx},206", "none", INK, LD))
        g += emofit_shoe(fid, fx, 205)   # emo clothes (item; hidden until worn): a checkered slip-on
        g.append('</g>')
    g.append(path(torso, FUR))
    # emo clothes (item; hidden until worn): the striped long-sleeve on her chest, under her front legs, the collar and the tag
    g += emofit_cat(torso)
    # zombie (costume; hidden until worn): a darker patch of fur sewn onto the flank, a stitched-up scar on
    # the hip. The skin itself is recoloured by pet.css (`.zombie` on the svg), like the ghost.
    g.append(f'<clipPath id="bodywrapclip"><path d="{torso}"/><path d="{smooth_closed(hipL, 0.6)}"/><path d="{smooth_closed(hipR, 0.6)}"/></clipPath>')
    g.append('<g id="zombiebody" class="zombie" display="none"><g clip-path="url(#bodywrapclip)">')
    g += stitched_patch([(28, 168), (58, 163), (62, 194), (32, 202)])
    g += stitches((150, 176), (162, 198), 3)
    g.append('</g></g>')
    # mummy (costume; hidden until worn): three bandages round the torso and hips, crossing, clipped to the
    # body so they wrap round it instead of sticking out; the collar and pendant stay on top of them.
    g.append('<g id="mummybody" class="mummy" display="none"><g clip-path="url(#bodywrapclip)">')
    g += strip([(36, 188), (66, 174), (100, 164), (132, 156), (166, 152)], 11)
    g += strip([(36, 158), (70, 164), (100, 172), (130, 182), (166, 194)], 11)
    g += strip([(34, 196), (66, 191), (100, 187), (132, 190), (168, 195)], 10)
    g.append('</g></g>')
    # bisht (item; hidden until worn): its front panels down her flanks, over the hips and the torso's sides, under the front legs
    g += BISHT_FRONT
    # dirt smudges on the fur (hidden; shown when hygiene is low)
    g.append('<g id="dirt" display="none">')
    for (dx, dy, rx, ry, rot) in ((84, 170, 6, 3.6, -20), (128, 186, 5, 3, 15), (60, 190, 4.2, 2.6, 30), (118, 158, 3.6, 2.2, -10)):
        g.append(f'<g transform="rotate({rot} {dx} {dy})">' + ellipse(dx, dy, rx, ry, HAIR, "none", 0, 'opacity="0.55"') + '</g>')
    g.append('</g>')
    for lid_, (a, b), pawx, toes in (("legL", legL, 78, (72, 80)), ("legR", legR, 122, (120, 128))):
        g.append(f'<g id="{lid_}" class="leg">')
        g += tube([a, b], LEG_W, FUR)
        # robe sleeve (costume; hidden until worn): the upper leg in the robe's cloth, a lining cuff,
        # the paw and the wristband left out. In the leg group so it swings with the leg.
        g.append(f'<g id="sleeve{lid_[-1]}" class="robe" display="none">')
        g += tube([a, lerp(a, b, 0.60)], LEG_W + 6, PUPIL)
        dx_, dy_ = b[0]-a[0], b[1]-a[1]; L_ = math.hypot(dx_, dy_); nx_, ny_ = -dy_/L_, dx_/L_
        c0, c1 = lerp(a, b, 0.53), lerp(a, b, 0.62); hw = (LEG_W + 6) / 2 - 0.4
        g.append(path(poly([(c0[0]+nx_*hw, c0[1]+ny_*hw), (c1[0]+nx_*hw, c1[1]+ny_*hw),
                            (c1[0]-nx_*hw, c1[1]-ny_*hw), (c0[0]-nx_*hw, c0[1]-ny_*hw)]), PURPLE, INK, 1.8))
        g.append('</g>')
        # bisht sleeve (item; hidden until worn): the upper leg in the cloak's wool, a gold embroidered cuff, the paw and the
        # wristband left out, like the witch's
        g.append(f'<g id="bishtsleeve{lid_[-1]}" class="bisht" display="none">')
        g += tube([a, lerp(a, b, 0.60)], LEG_W + 6, HB.BISHT)
        g += HB.sheen([[lerp(a, b, 0.08), lerp(a, b, 0.5)]], 1.6, 0.5)
        cz0, cz1 = lerp(a, b, 0.52), lerp(a, b, 0.62); zw = (LEG_W + 6) / 2 - 0.2
        g += HB.zari([(cz0[0] + nx_*zw, (cz0[1] + cz1[1])/2 + ny_*zw), (cz0[0] - nx_*zw, (cz0[1] + cz1[1])/2 - ny_*zw)][::(1 if lid_ == 'legL' else -1)], c1[1] - c0[1] + 1.5, INK, 1.2, 3.0)
        g.append('</g>')
        # emo clothes (item; hidden until worn): the long-sleeve's striped sleeve, down to just under the wristband
        g += emofit_sleeve(lid_, a, b, LEG_W)
        # zombie (costume; hidden until worn): a stitched-up scar across the upper leg
        g.append(f'<g id="zombie{lid_[-1]}" class="zombie" display="none">')
        za, zb = lerp(a, b, 0.22), lerp(a, b, 0.40)
        g += stitches((za[0] - nx_*7, za[1] - ny_*7), (zb[0] + nx_*7, zb[1] + ny_*7), 3, 4.6)
        g.append('</g>')
        # mummy bandages (costume; hidden until worn): two slanted bands round the upper leg, the wristband
        # and the paw left out. In the leg group so they swing with the leg.
        g.append(f'<g id="wrap{lid_[-1]}" class="mummy" display="none">')
        bw = LEG_W + 2; bh = bw/2
        for (u0, u1, sk) in ((0.02, 0.20, 0.04), (0.29, 0.48, -0.04)):
            p0L, p1L = lerp(a, b, u0 + sk), lerp(a, b, u1 + sk); p0R, p1R = lerp(a, b, u0 - sk), lerp(a, b, u1 - sk)
            g.append(path(poly([(p0L[0]+nx_*bh, p0L[1]+ny_*bh), (p1L[0]+nx_*bh, p1L[1]+ny_*bh), (p1R[0]-nx_*bh, p1R[1]-ny_*bh), (p0R[0]-nx_*bh, p0R[1]-ny_*bh)]), LINEN, INK, 1.8))
            m0, m1 = lerp(a, b, (u0+u1)/2 + sk*0.4), lerp(a, b, (u0+u1)/2 - sk*0.4)
            g.append(path(f"M{m0[0]+nx_*(bh-2.2):.1f},{m0[1]+ny_*(bh-2.2):.1f} L{m1[0]-nx_*(bh-2.2):.1f},{m1[1]-ny_*(bh-2.2):.1f}", "none", LINEN2, 1.4, 'opacity="0.9"'))
        g.append('</g>')
        g.append(ellipse(pawx, 203, 14.5, 8, FUR))
        for lx in toes:
            g.append(path(f"M{lx},210 L{lx},204.5", "none", INK, LD))
        g += band(a, b, 0.70, 0.86, LEG_W - 2*LW + 1.2)
        g.append('</g>')
    # collar: black band under the chin (its top tucks under the head), lavender studs
    g.append('<g id="collar">')
    g.append(path(smooth_closed([(60, 128), (80, 136), (100, 139), (120, 136), (140, 128),
                                 (142, 138), (124, 149), (100, 152), (76, 149), (58, 138)], 0.5), INK, INK, LW))
    for sx, sy in ((70, 140), (85, 145), (115, 145), (130, 140)):
        g.append(f'<circle cx="{sx}" cy="{sy}" r="2.2" fill="{LAV}" stroke="none"/>')
    # pendant group: D-ring on the collar, link, round purple tag with a bevel, a shine and $EMO
    g.append('<g id="pendant">')
    g.append(f'<circle cx="100" cy="153" r="2.8" fill="none" stroke="{INK}" stroke-width="{LD}"/>')
    g.append(path("M100,155.8 L100,158.5", "none", INK, LD))
    g.append('<g id="emotag">')      # the $EMO tag; the Star of David takes its place on the ring (pet.css)
    g.append(ellipse(100, 173.5, 15, 15, PURPLE, INK, LW))
    g.append(ellipse(100, 173.5, 12.2, 12.2, "none", STRAND, 1.2))
    g.append(path("M90.5,166.5 Q93,161.5 98.5,160.5", "none", "#FFFFFF", 1.6, 'opacity="0.85"'))
    g += letters(100, 173.5, 6.8, INK, 1.5)
    g.append('</g>')
    # Star of David (item; hidden until worn): a silver star on the collar's ring instead of the tag, so it swings like the tag did
    g.append('<g id="davidstar" display="none">')
    g += interlaced_star(100, 174.5, 17.5, 3.8, 1.2, INK, SILVER, SILVER2, ISRAEL)
    g.append('</g>')
    g.append('</g>')
    g.append('</g>')
    g.append('</g>')

    # head + face
    def eye(eid, EX, EY, ER, wing):
        RY = ER*1.06
        IX, IY = EX + 0.5, EY + 1.2                 # iris centre
        e = [f'<g id="{eid}" class="eye">']
        e.append(f'<clipPath id="{eid}clip"><ellipse cx="{EX}" cy="{EY}" rx="{ER+LW}" ry="{RY+LW}"/></clipPath>')
        e.append(f'<clipPath id="{eid}iris"><circle cx="{IX}" cy="{IY}" r="{ER*0.8:.1f}"/></clipPath>')
        e.append('<g class="open">')
        e.append(ellipse(EX, EY, ER, RY, "#FFFFFF", INK, LW))
        e.append(f'<g class="pupil" clip-path="url(#{eid}clip)">')
        e.append(f'<circle cx="{IX}" cy="{IY}" r="{ER*0.8:.1f}" fill="{PURPLE}"/>')
        e.append(f'<circle cx="{IX}" cy="{IY+ER*0.34:.1f}" r="{ER*0.8:.1f}" fill="{LAV2}" clip-path="url(#{eid}iris)"/>')
        e.append(f'<circle cx="{IX}" cy="{IY+0.3:.1f}" r="{ER*0.5:.1f}" fill="{PUPIL}"/>')
        e.append(f'<circle cx="{EX-ER*0.26:.1f}" cy="{EY-ER*0.2:.1f}" r="{ER*0.25:.1f}" fill="#FFFFFF"/>')
        e.append(f'<circle cx="{EX+ER*0.32:.1f}" cy="{EY+ER*0.38:.1f}" r="{ER*0.11:.1f}" fill="#FFFFFF"/>')
        e.append('</g>')
        lid = par("lid", 0.28); ly = EY - RY + 2*RY*lid
        ox = EX - ER if wing < 0 else EX + ER
        e.append('<g class="lid">')
        # cover above the lid: fur-coloured, reaches far above the eye and is not clipped, so the eye's
        # rim stays hidden when the lid group is lowered or scaled by an animation
        e.append(f'<rect x="{EX-ER-3}" y="{EY-RY-40}" width="{2*ER+6}" height="{ly-(EY-RY-40):.1f}" fill="{FUR}"/>')
        # lash: a crescent, thick in the middle, tapering to the corners
        e.append(path(f"M{EX-ER},{ly-0.5:.1f} Q{EX},{ly+4.8:.1f} {EX+ER},{ly-0.5:.1f} Q{EX},{ly-2.2:.1f} {EX-ER},{ly-0.5:.1f} Z", INK, INK, LD))
        # eyeliner wing at the outer corner
        e.append(path(f"M{ox:.1f},{ly-0.5:.1f} L{ox + wing*5.8:.1f},{ly-5.2:.1f} L{ox + wing*1.4:.1f},{ly+1.6:.1f} Z", INK, INK, LD))
        e.append('</g></g>')
        # closed eye (sleep): a soft downward curve with the wing
        e.append('<g class="closed" display="none">')
        e.append(path(f"M{EX-ER+1},{EY-2} Q{EX},{EY+7} {EX+ER-1},{EY-2}", "none", INK, LW))
        e.append(path(f"M{ox - wing*0.5:.1f},{EY-2} L{ox + wing*4.5:.1f},{EY-5.5}", "none", INK, LW))
        e.append('</g>')
        # happy eye (victory): an upward arc
        e.append('<g class="happy" display="none">')
        e.append(path(f"M{EX-ER+1},{EY+3} Q{EX},{EY-9} {EX+ER-1},{EY+3}", "none", INK, LW))
        e.append('</g>')
        # squeezed shut (straining, scrubbing): a tight > < with a crease
        e.append('<g class="squeeze" display="none">')
        # a tight > (or <) pointing at the nose, thick at the corner, plus the wing
        if wing < 0:
            e.append(path(f"M{EX-ER+1},{EY-7} L{EX+3},{EY} L{EX-ER+1},{EY+7}", "none", INK, LW+0.4))
        else:
            e.append(path(f"M{EX+ER-1},{EY-7} L{EX-3},{EY} L{EX+ER-1},{EY+7}", "none", INK, LW+0.4))
        e.append(path(f"M{ox - wing*0.5:.1f},{EY-6} L{ox + wing*4.5:.1f},{EY-9}", "none", INK, LW))
        e.append('</g>')
        # x eyes (dead)
        e.append('<g class="x" display="none">')
        e.append(path(f"M{EX-7},{EY-7} L{EX+7},{EY+7} M{EX+7},{EY-7} L{EX-7},{EY+7}", "none", INK, LW+0.2))
        e.append('</g></g>')
        return e

    g.append(f'<g id="head"><g {HEAD_T}>')
    g.append(path(head, FUR))
    # mummy (costume; hidden until worn): a bandage across the lower cheek to the chin, under the face so the
    # eye, whiskers, nose and mouth sit over it; clipped to the head
    g.append(f'<clipPath id="cheekwrapclip"><path d="{head}"/></clipPath>')
    g.append('<g id="mummyface" class="mummy" display="none"><g clip-path="url(#cheekwrapclip)">')
    g += strip([(36, 100), (54, 114), (76, 128), (100, 140)], 10)
    g.append('</g></g>')
    # payot (the kippah item; hidden until worn): a corkscrew lock at each temple in the cat's own hair colour, hanging
    # from under the hair (the lock over the left temple and the fringe on the right cover their roots) past the jaw;
    # under the face so the whiskers lie over them
    g.append('<g id="payot" display="none">')
    g += ringlet(46, 88, 64, 5.2, 4.8, 3.9, 7.4, 5.6, phase=0.4, hand=1)
    g += ringlet(154, 92, 60, 4.9, 4.8, 3.9, 7.4, 5.6, phase=0.4 + math.pi, hand=1)
    g.append('</g>')
    g.append('<g id="face">')
    g += eye("eyeR", 122, 102, 13.5, +1)     # under the fringe; revealed by the hair flick
    g += eye("eyeL", 78, 104, 13.5, -1)
    g.append(path(smooth_closed([(96.3, 115.6), (103.7, 115.6), (100, 120.6)], 0.3), PINK, INK, 1.4))
    g.append(path("M100,120 L100,123", "none", INK, 1.6))
    g.append('<g id="mouth">')
    g.append(path("M92,124 Q96,127 100,124 Q104,127 108,124", "none", INK, 1.8, 'id="mouth-idle"'))
    g.append(path("M93,125 Q101,129 109,121", "none", INK, 1.8, 'id="mouth-smug" display="none"'))
    g.append('<g id="mouth-open" display="none">')
    g.append(ellipse(100, 127, 5.2, 4.4, PUPIL, INK, 1.8))
    g.append(ellipse(100, 129.5, 2.8, 1.6, PINK, "none", 0))
    g.append('</g>')
    g.append(path("M90,122 Q100,133 110,122", "none", INK, 1.8, 'id="mouth-smile" display="none"'))
    g.append(path("M92,127 Q100,121 108,127", "none", INK, 1.8, 'id="mouth-frown" display="none"'))
    g.append('<g id="mouth-yum" display="none">')
    g.append(path("M91,122 Q100,132 109,122", "none", INK, 1.8))
    g.append(path("M97,126.5 Q97,133 101,132.5 Q105,132 104,126", PINK, INK, 1.4))
    g.append('</g>')
    g.append('</g>')
    # lip piercings (emo pack; hidden until worn): two silver hoops through the lower lip, either side of the middle, a pair
    # for every mouth on that mouth's own lower lip (EM.lip_rings: each a twin of its mouth); #piercings only says they are on
    g.append('<g id="piercings" display="none"></g>')
    for mid, pts in EM.lipring_edges("cat").items(): g.append(EM.lip_rings(mid, pts, 1.75, 0.9))
    g.append('<g id="whiskers">')
    g.append(path("M44,110 L60,113 M45,120 L60,119", "none", INK, LD))
    g.append(path("M156,112 L144,115 M156,122 L144,121", "none", INK, LD))
    g.append('</g>')
    g.append('</g>')  # face
    # tear below the visible eye (hidden; sad)
    g.append('<g id="tear" display="none">')
    g.append(path("M68,116 C68,116 64,123 64,126 C64,128.5 65.8,130 68,130 C70.2,130 72,128.5 72,126 C72,123 68,116 68,116 Z", LAV2, INK, LD))
    g.append('</g>')

    # fringe + strands that follow the sweep
    if par("fringe", 1):
        g.append('<g id="fringe">')
        g.append(path(fringe, HAIR))
        g.append(f'<clipPath id="fringeclip"><path d="{fringe}"/></clipPath>')
        g.append('<g clip-path="url(#fringeclip)">')
        for i in range(9):
            x0 = 58 + i*10 + rnd.uniform(-3, 3); y0 = 33 + rnd.uniform(0, 8) + i*0.8
            L = rnd.uniform(36, 66); x1 = x0 + L*0.5; y1 = y0 + L*0.9
            g.append(path(smooth_open([(x0, y0), ((x0+x1)/2 - 4, (y0+y1)/2), (x1, y1)]), "none", STRAND, 1.5))
        g.append('</g></g>')
    # mummy (costume; hidden until worn): two bandages crossing over the top of the head, clipped to the head
    # and hair so they wrap round it.
    g.append(f'<clipPath id="headwrapclip"><path d="{head}"/><path d="{back_hair}"/><path d="{fringe}"/></clipPath>')
    g.append('<g id="mummyhead" class="mummy" display="none">')
    g.append('<g clip-path="url(#headwrapclip)">')
    g += strip([(40, 92), (56, 70), (76, 54), (102, 46), (130, 44), (162, 58)], 11)
    g += strip([(40, 64), (60, 44), (86, 34), (112, 36), (136, 46), (162, 68)], 11)
    g.append('</g>')
    g.append('</g>')
    # zombie (costume; hidden until worn; after the mummy's head wraps, so the brain comes out through them): the brain poking out of the top of the hair, a stitched-up scar on
    # the cheek under the good eye, a shadow under that eye. The fur and iris recolour in pet.css.
    g.append('<g id="zombiehead" class="zombie" display="none">')
    g.append(path("M64,118 Q78,127 91,117", "none", "#6F8C68", 2.0, 'opacity="0.55"'))
    g += stitches((73, 129), (90, 136), 4)     # clear of the tear's track (x 64-72) and the mouth (x 92+)
    g.append('<g class="zbrain">'); g += brain(BRAIN_AT[0], BRAIN_AT[1], 22, 12.5, BRAIN_AT[2]); g.append('</g>')     # big enough to show round a crown sat on it (.zbrain: the keffiyeh covers it, pet.css)
    g.append('</g>')
    g.append('</g></g>')  # head

    # kippah (item; hidden until worn): in the head unit like the crown, whose place it takes (the rig hides the crown
    # while it is worn and pet.css makes it the golden kippah). It sits on the crown of the mop, between the ears.
    kdefs, kparts = kippah_cap(100, 32.5, 66, 21, 3.6, rot=-5)
    g.append(f'<defs id="kippahdefs">{kdefs}</defs>')
    g.append(f'<g id="kippah" display="none"><g {HEAD_T}>')
    g += kparts
    g.append('</g></g>')
    # keffiyeh (item; hidden until worn): its top over the head, the edge across the brow and the agal, in the head unit like
    # the kippah (the rig hides the crown while it is worn: crowned, pet.css makes the agal gold)
    g += KF_FRONT
    # beanie (emo pack; hidden until worn): the black fringe over her right eye and the hat over it, in the head unit (the
    # crown sits on top of it: rig.ts BEANIE_CROWN)
    g += BN_FRONT

    # crown
    cx, cy = 100, 40
    g.append(f'<g id="crown"><g id="crownlift"><g {HEAD_T}>')
    g.append(f'<g transform="rotate(-7 {cx} {cy}) translate({cx} {cy+3}) scale(1.1) translate({-cx} {-cy})">')
    g.append(path(poly([(70, 46), (66, 30), (74, 32), (80, 12), (88, 30), (94, 30), (100, 8),
                        (106, 30), (112, 30), (120, 12), (126, 32), (134, 30), (130, 46)]), GOLD))
    g.append(path(poly([(70, 46), (130, 46), (132, 38), (68, 38)]), GOLD2, INK, 1.6))
    for bx, by in ((80, 12), (100, 8), (120, 12)):
        g.append(ellipse(bx, by, 3.4, 3.4, GOLD, INK, 1.6))
    g.append(ellipse(100, 33, 5, 4.2, RUBY, INK, 1.6))
    g.append(ellipse(84, 36, 2.6, 2.6, TEAL, INK, 1.4))
    g.append(ellipse(116, 36, 2.6, 2.6, GREEN, INK, 1.4))
    for hx, hy, hr in ((98.4, 31.6, 1.3), (83.2, 35.2, 0.8), (115.2, 35.2, 0.8)):
        g.append(f'<circle cx="{hx}" cy="{hy}" r="{hr}" fill="#FFFFFF" stroke="none"/>')
    # victory sparkles, one per crown point (hidden until the state shows them)
    def spark(sid, cx, cy, r):
        return (f'<path id="{sid}" display="none" d="M{cx},{cy-r} L{cx+r*0.22},{cy-r*0.22} L{cx+r},{cy} L{cx+r*0.22},{cy+r*0.22} '
                f'L{cx},{cy+r} L{cx-r*0.22},{cy+r*0.22} L{cx-r},{cy} L{cx-r*0.22},{cy-r*0.22} Z" fill="#FFFFFF" stroke="none"/>')
    g.append(spark("glintL", 80, 12, 7))
    g.append(spark("glintC", 100, 8, 10))
    g.append(spark("glintR", 120, 12, 7))
    g.append('</g></g></g></g>')

    # jack-o'-lantern (costume; hidden until worn): a whole pumpkin worn over the head. Its carvings are real holes
    # (a mask), and through them you see the cat's own face: both eyes (pet.css hides the fringe while it is worn), and a
    # cat's nose-and-grin cut as one opening, so the pink nose and the real mouth show and every expression still
    # reads. The rig puts `.pumpkinhead` on the svg: pet.css hides #headstack (ears, back hair) and clips #head to
    # the pumpkin's outline (#pkclip), so nothing on the face can poke out past it. Lobes back to front so the ribs
    # are their outlines; inside each cut, a shadow and the rind's thickness. In the head unit, drawn before the witch
    # hat so a hat can sit on it; the rig hides the crown while it is worn (crowned, it is the golden pumpkin).
    g.append(f'<g id="pumpkin" display="none"><g {HEAD_T}>')
    g.append('<g mask="url(#pkmask)">')
    for (cx_, cy_, rx_, ry_, f_) in PK_LOBES:
        g.append(ellipse(cx_, cy_, rx_, ry_, f_, INK, LW))
    g.append(path("M100,30 Q94,86 100,144", "none", PUMPKIN2, 2.6, 'opacity="0.45"'))
    g.append(ellipse(70, 50, 8, 3.4, "#FFFFFF", "none", 0, 'opacity="0.22" transform="rotate(-42 70 50)"'))
    g.append('</g>')
    g.append('<g clip-path="url(#pkholesclip)">')
    for d in PK_HOLES: g.append(path(d, "none", "#1E0D05", 12, 'opacity="0.3"'))    # shadow just inside the cut
    for d in PK_HOLES: g.append(path(d, "none", PUMPKIN2, 6))                         # the rind's thickness
    g.append('</g>')
    for d in PK_HOLES: g.append(path(d, "none", INK, LW))
    g.append(path(smooth_closed([(95, 30), (93, 21), (96, 12), (104, 10), (107, 20), (106, 30)], 0.4), MOSS, INK, LW))
    g.append(path("M106,19 Q118,9 124,19 Q126,28 119,27", "none", MOSS, 2.0))
    g.append(path("M104,22 Q116,11 127,17 Q118,26 106,26 Z", GREEN, INK, 1.6))
    g.append(path("M107,24 Q116,17 124,18", "none", INK, 1.0, 'opacity="0.5"'))
    g.append('</g></g>')
    # witch hat (costume; hidden until worn). Lives in the head unit like the crown so every head
    # movement carries it. Brim first, then the cone seated on it, so the band stays in view: the band
    # is the cat's own collar (black, lavender studs) and the buckle carries a ruby like the crown.
    # The ears poke up through the brim.
    g.append(f'<g id="witchhat" display="none"><g {HEAD_T}>')
    g.append('<g transform="rotate(-5 100 44)">')
    g.append(path(smooth_closed([(36, 40), (50, 31), (74, 27), (100, 26), (126, 27), (150, 31), (164, 40),
                                 (154, 50), (130, 55), (100, 57), (70, 55), (46, 50)], 0.5), HAIR, INK, LW))   # brim
    g.append(path("M44,45 Q100,39 156,45", "none", STRAND, 1.8, 'opacity="0.65"'))
    g.append(ellipse(100, 44, 34, 4.5, PUPIL, "none", 0, 'opacity="0.3"'))                    # cone seats on the brim
    g.append(ellipse(56, 47, 5, 1.8, "#FFFFFF", "none", 0, 'opacity="0.18"'))
    cone = [(62, 38), (67, 16), (76, -6), (90, -22), (106, -32), (122, -32), (136, -26), (146, -16), (150, -6),
            (146, -8), (138, -18), (126, -20), (116, -12), (118, 0), (126, 22), (138, 38), (100, 44)]
    g.append(path(smooth_closed(cone, 0.5), PUPIL, INK, LW))
    g.append(path("M120,-20 Q128,-24 136,-23", "none", INK, 1.5, 'opacity="0.35"'))        # crease under the curl
    g.append(path("M72,26 Q79,8 90,-8", "none", LAV, 2.0, 'opacity="0.2"'))                  # edge light
    g.append(path(smooth_closed([(62, 38), (66, 25), (100, 31), (134, 25), (138, 38), (100, 44)], 0.45), INK, INK, 1.8))   # band
    for sx, sy in ((74, 34), (82, 36), (118, 36), (126, 34)):
        g.append(f'<circle cx="{sx}" cy="{sy}" r="2.2" fill="{LAV}" stroke="none"/>')
    g.append(path("M94,32 L106,31.5 L106.5,43 L94.5,43.5 Z", "none", INK, 4.6))              # buckle, ink under
    g.append(path("M94,32 L106,31.5 L106.5,43 L94.5,43.5 Z", "none", GOLD, 2.6))             # gold over
    g.append(ellipse(100.3, 37.5, 2.8, 2.5, RUBY, INK, 1.2))
    g.append(f'<circle cx="99.5" cy="36.7" r="0.8" fill="#FFFFFF" stroke="none"/>')
    g.append('</g></g></g>')
    # halo (dead): a gold ring floating over the hair
    g.append('<g id="halo" display="none">')
    g.append(ellipse(100, 14, 24, 6.5, "none", INK, LW))
    g.append(ellipse(100, 14, 24, 6.5, "none", GOLD, 3.4))
    g.append(path("M82,12 Q88,8 96,8", "none", "#FFFFFF", 1.6, 'opacity="0.8"'))
    g.append('</g>')
    # sweat drop (tense), on the visible-eye side of the head
    g.append('<g id="sweat" display="none">')
    g.append(path("M50,76 C50,76 44,86 44,90 C44,93.5 46.7,96 50,96 C53.3,96 56,93.5 56,90 C56,86 50,76 50,76 Z", "#FFFFFF", INK, LD))
    g.append('</g>')
    # sleep z's, drawn last so they float over the hair
    g.append('<g id="stink" display="none" fill="none" stroke="%s" stroke-width="2" stroke-linecap="round">' % GREEN)
    g.append('<path class="s s1" d="M36,150 Q39,145 36,140 Q33,135 36,130"/>')
    g.append('<path class="s s2" d="M26,166 Q29,161 26,156 Q23,151 26,146"/>')
    g.append('<path class="s s3" d="M168,120 Q171,115 168,110 Q165,105 168,100"/>')
    g.append('</g>')
    g.append('<g id="zzz" display="none" fill="none" stroke="%s" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' % LAV)
    g.append('<path class="z z1" d="M152,62 L162,62 L152,72 L162,72"/>')
    g.append('<path class="z z2" d="M164,44 L177,44 L164,57 L177,57"/>')
    g.append('<path class="z z3" d="M178,22 L194,22 L178,38 L194,38"/>')
    g.append('</g>')

    g.append('</g>')  # figure
    body = "\n".join(g)
    from wobble import bake
    body = bake(body, amp=par("wobble", 1.1), freq=0.09, step=4.0)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="200" height="230">
<g id="cat">
{body}
</g>
</svg>'''

if __name__ == "__main__":
    for a in sys.argv[1:]:
        k, v = a.split("="); P[k] = float(v)
    out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cat.svg"))
    open(out, "w").write(build())
    print("wrote", out)
