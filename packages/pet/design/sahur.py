"""Emogotchi's third character -> packages/pet/sahur.svg   (Tung Tung Tung Sahur)

The wooden log with a face and a bat, from the references in "tung tung tung sahur/" at the repo root, rigged
with the same group ids as cat.svg so rig.ts drives it without knowing what it has: #shadow, #figure, #body,
#legL/#legR (the arms; the bat lives in #legL), #footL/#footR (his whole legs, hip to toes), #head, #face, the eyes
with their .open/.pupil/.lid/.closed/.happy/.squeeze/.x parts, the six mouths, #tear #dirt #stink #sweat #zzz
#halo and #crown/#crownlift/#glint*. No tail, ears, fringe, whiskers or pendant; the rig skips ids it cannot find.

He is drawn head-on, like the cat, so he never turns. Flat fills with a clean black line, no wobble bake (he is a
3-D render in the references; the clean line is what the frog uses too). How the joints stay invisible:

  - The log is cut in two at y=96 (NECK_Y), the "neck" the head unit pivots on. The head is the top of the log with the
    face, drawn over the body; its fill dips into the body and its side lines run a little past the pivot, the
    body's side lines run a little above it, so at rest the seam does not exist and a tilt reads as the log
    flexing. Wood grain stays clear of the seam on both sides, so a tilt cannot misalign it.
  - The arms are their own group #arms drawn after the head (the frog's pattern): a raised bat crosses in front
    of the face, and when the head dips into the body to eat, the arms stay in front.
  - The legs run up under the log (which is drawn after them), so a stride never bares a gap at the hip.

The bat is part of the near arm (#legL): every swing of that arm swings the bat. rig.ts keeps that arm's walk
swing small and outward, so the tip never digs into the floor.

Tunables can be overridden on the CLI:  python3 sahur.py lw=2.0
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_closed, smooth_open, poly, _centreline

# ---- palette: the references' wood, plus the Emonad accessories shared with the cat ----
INK     = "#2B1607"   # the character's edge line: a deep brown, not black (the references are rendered, not inked)
INK0    = "#000000"   # the house black, for the crown and the halo he shares with the cat
WOOD    = "#D2822E"   # the log
WOODTOP = "#E9B26A"   # end grain on top
GRAIN   = "#8A4A16"   # grain lines, rings, the shade down one side
BAT     = "#B8661F"   # the bat, a shade darker than him
BATHI   = "#E9AE6A"
WHITE   = "#FFFFFF"
IRIS    = "#5A3010"
IRIS2   = "#8E5C2A"   # the lower crescent of the iris, lit
PUPIL   = "#1A0E08"
MAW     = "#3B1718"
TONGUE  = "#D98A80"
LIP     = "#7A3A16"   # the lips' own darker wood
TEAR    = "#A9D8F0"
MUD     = "#4A3A24"
GOLD    = "#E8D89B"
GOLD2   = "#D4A646"
RUBY    = "#8B1A2D"
TEAL    = "#2D7D8A"
LEAF    = "#6BB84A"
LAV     = "#EAC6EA"
PINK    = "#E84D7F"
PLUM    = "#502858"
PURPLE  = "#906096"
# the outfits (items), in the cat's colours so pet.css's gold and ghost rules match them by attribute
HAIR     = "#502858"   # the witch cloth's brim and the emo hair
STRAND   = "#724278"
CLOTH    = "#281828"   # the witch cloth (the cat's PUPIL)
PUMPKIN  = "#F08A24"
PUMPKIN2 = "#C9651A"
PUMPKIN3 = "#DD7A1F"
MOSS     = "#3E6B2E"
LINEN    = "#EFE6C8"
LINEN2   = "#D9CBA3"
STITCH   = "#111111"   # stitch thread: its own black so a crowned zombie's thread can turn gold by attribute
BRAIN    = "#E9A3B8"
BRAIN2   = "#C97A93"
PATCH    = "#5E6A48"   # a darker patch of wood sewn on

P = {}
def par(k, v):
    P.setdefault(k, v); return P[k]

K = 0.5522847498   # a quarter ellipse as one cubic

# ---------------- helpers ----------------
def path(d, fill="none", stroke=INK, w=None, extra="", join="round"):
    w = LW if w is None else w
    joins = 'stroke-linejoin="miter" stroke-miterlimit="8"' if join == "miter" else 'stroke-linejoin="round"'
    s = f'stroke="{stroke}" stroke-width="{w}" {joins} stroke-linecap="round"' if stroke != "none" else 'stroke="none"'
    return f'<path d="{d}" fill="{fill}" {s} {extra}/>'

def ellipse(cx, cy, rx, ry, fill, stroke=INK, w=None, extra=""):
    w = LW if w is None else w
    s = f'stroke="{stroke}" stroke-width="{w}"' if stroke != "none" else 'stroke="none"'
    return f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx}" ry="{ry}" fill="{fill}" {s} {extra}/>'

def circle(cx, cy, r, fill, stroke="none", w=0):
    s = f'stroke="{stroke}" stroke-width="{w}"' if stroke != "none" else 'stroke="none"'
    return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{fill}" {s}/>'

def arc_lower(cx, cy, rx, ry):
    """The lower half of an ellipse, left to right, as two cubics (no M)."""
    return (f"C{cx-rx:.2f},{cy+ry*K:.2f} {cx-rx*K:.2f},{cy+ry:.2f} {cx:.2f},{cy+ry:.2f} "
            f"C{cx+rx*K:.2f},{cy+ry:.2f} {cx+rx:.2f},{cy+ry*K:.2f} {cx+rx:.2f},{cy:.2f}")

def arc_lower_rl(cx, cy, rx, ry):
    """The lower half of an ellipse, right to left (no M)."""
    return (f"C{cx+rx:.2f},{cy+ry*K:.2f} {cx+rx*K:.2f},{cy+ry:.2f} {cx:.2f},{cy+ry:.2f} "
            f"C{cx-rx*K:.2f},{cy+ry:.2f} {cx-rx:.2f},{cy+ry*K:.2f} {cx-rx:.2f},{cy:.2f}")

def tube(pts, width, fill=WOOD, t=0.5):
    """Outlined tube along a polyline: black stroke under a fill stroke."""
    d = smooth_open(pts, t)
    return [path(d, "none", INK, width), path(d, "none", fill, width - 2*LW)]

def lerp(a, b, u):
    return (a[0] + (b[0]-a[0])*u, a[1] + (b[1]-a[1])*u)

def tapered(pts, w0, w1, fill, t=0.5, tip_round=True, cap0=True):
    """A filled, outlined club along pts, w0 wide at the start and w1 at the tip, both ends rounded."""
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
    def cap(px, py, qx, qy, r, k):
        # a half circle round (px,py) heading (qx,qy) -> away, from the left side to the right side
        tx, ty = px-qx, py-qy; L = math.hypot(tx, ty) or 1; tx, ty = tx/L, ty/L
        a0 = math.atan2(ty, tx) - math.pi/2
        return [(px + r*math.cos(a0 + math.pi*j/k), py + r*math.sin(a0 + math.pi*j/k)) for j in range(k, -1, -1)]
    tip = cap(c[-1][0], c[-1][1], c[-2][0], c[-2][1], w1/2, 4) if tip_round else []
    base = cap(c[0][0], c[0][1], c[1][0], c[1][1], w0/2, 4)[::-1] if cap0 else []
    return path(smooth_closed(left + tip + right[::-1] + base, 0.35), fill, INK, LW)

def limb_sides(pts, w0, w1, t=0.5):
    """The two edges of a limb along pts, w0 wide at the start and w1 at the end."""
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
    return left, right

def limb_d(pts, w0, w1, t=0.5):
    left, right = limb_sides(pts, w0, w1, t)
    return smooth_closed(left + right[::-1], 0.35)

def tapered_sides(pts, w0, w1, fill, t=0.5):
    """A limb as its fill (no stroke) and its two side lines (open): no line across either end, so it can run into
    whatever it joins (a foot, an elbow) with no seam."""
    left, right = limb_sides(pts, w0, w1, t)
    return [path(smooth_closed(left + right[::-1], 0.35), fill, "none", 0), path(smooth_open(left, 0.35), "none", INK, LW), path(smooth_open(right, 0.35), "none", INK, LW)]

def strip(pts, w, crease=True):
    """A bandage: a constant-width strip along pts, outlined, with one crease line down it. Flat ends (they are
    clipped to what they wrap, or hidden under the next strip)."""
    c = _centreline(pts)
    left = [(x + nx*w/2, y + ny*w/2) for x, y, nx, ny in c]
    right = [(x - nx*w/2, y - ny*w/2) for x, y, nx, ny in c]
    out = [path(poly(left + right[::-1]), LINEN, INK, LW)]
    if crease:
        k = max(1, len(c)//5)
        cr = [(x + nx*w*0.18, y + ny*w*0.18) for x, y, nx, ny in c[1::k]]
        if len(cr) > 1: out.append(path(smooth_open(cr), "none", LINEN2, 1.2, 'opacity="0.9"'))
    return out

def stitches(a, b, n=4, tick=4.4, w=1.4):
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
    out.append(path(f"M{cx:.1f},{cy-ry*0.5:.1f} Q{cx-rx*0.12:.1f},{cy+ry*0.2:.1f} {cx+rx*0.05:.1f},{cy+ry*0.95:.1f}", "none", BRAIN2, 1.3))
    for (x0, y0, x1, y1, x2, y2) in ((-0.75, -0.2, -0.5, -0.55, -0.25, -0.15), (-0.7, 0.45, -0.45, 0.2, -0.2, 0.55),
                                     (0.25, -0.35, 0.5, -0.65, 0.75, -0.25), (0.25, 0.5, 0.5, 0.15, 0.78, 0.5)):
        out.append(path(f"M{cx+rx*x0:.1f},{cy+ry*y0:.1f} Q{cx+rx*x1:.1f},{cy+ry*y1:.1f} {cx+rx*x2:.1f},{cy+ry*y2:.1f}", "none", BRAIN2, 1.1))
    out.append('</g>')
    return out

def stitched_patch(quad):
    """A darker patch of wood sewn on: the patch, then ticks along its top and left edges."""
    out = [path(smooth_closed(quad, 0.2), PATCH, INK, LD)]
    for a, b in ((quad[0], quad[1]), (quad[0], quad[3])):
        dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L
        for i in range(4):
            m = lerp(a, b, (i + 0.5)/4)
            out.append(path(f"M{m[0]+nx*2.0:.1f},{m[1]+ny*2.0:.1f} L{m[0]-nx*2.0:.1f},{m[1]-ny*2.0:.1f}", "none", STITCH, 1.2))
    return out

def carve_grin(cx, cy, w, h):
    """The jack-o'-lantern's classic zigzag grin: a toothed top edge, a wide bottom, one tooth up from the bottom."""
    n = 8; tooth = h*0.45; yc = cy - 0.5*h; ww = w/2
    top = []
    for i in range(n + 1):
        u = -1 + 2*i/n
        y = yc + (cy - 0.1*h - yc)*(1 - u*u)
        if 0 < i < n and i % 2 == 1: y += tooth
        top.append((cx + u*ww, y))
    bot = []
    for i in range(n - 1, 0, -1):
        u = -1 + 2*i/n
        y = yc + (cy + h - yc)*(1 - u*u)**0.7
        if i == n//2: bot += [(cx + 0.14*ww, y), (cx + 0.12*ww, y - tooth*0.8), (cx - 0.12*ww, y - tooth*0.8), (cx - 0.14*ww, y)]
        else: bot.append((cx + u*ww, y))
    return poly(top + bot)

def lens_grain(x0, y0, x1, y1, sway=2.0):
    """One grain line: a gentle S down the log."""
    return smooth_open([(x0, y0), (x0 + sway, lerp((x0, y0), (x1, y1), 0.35)[1]), (x1 - sway, lerp((x0, y0), (x1, y1), 0.7)[1]), (x1, y1)])


# ---------------- the Jewish pack (kippah + payot, the Star of David): pet.css recolours these by fill ----------------
KIPPAH_W  = "#FDFDFB"   # the kippah's white (gold when crowned)
KIPPAH_SH = "#D5DCEA"   # its shaded side (the darker gold when crowned)
FLAGBLUE  = "#0038B8"   # the flag's blue: the stripes, the star, the pendant's inlay
SILVER    = "#DDE3EC"   # the pendant (gold when crowned)
SILVER2   = "#A9B3C4"   # its bevel and the chain

def _hull(pts):
    """Convex hull, counter-clockwise (monotone chain)."""
    pts = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, hi = [], []
    for q in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], q) <= 0: hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]

def _resample_closed(pts, n):
    """n points evenly spaced along a closed polyline."""
    segs = [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    lens = [math.hypot(b[0]-a[0], b[1]-a[1]) for a, b in segs]; total = sum(lens)
    out = []; k = 0; acc = 0.0
    for j in range(n):
        d = total * j / n
        while acc + lens[k] < d: acc += lens[k]; k += 1
        a, b = segs[k]; u = (d - acc) / (lens[k] or 1)
        out.append((a[0] + (b[0]-a[0])*u, a[1] + (b[1]-a[1])*u))
    return out

class Kippah:
    """The kippah as half an ellipsoid (radius A, height H) sitting on the flat top of the log, seen from a little
    above (elevation E, the same view that shows the log's end grain as a thin ellipse): P(lat, lon) projects it. The
    stripes are bands between two latitudes on its front, the star is laid on the front of the dome and bent with it."""
    def __init__(self, cx, y0, A, H, E):
        self.cx, self.y0, self.A, self.H = cx, y0, A, H
        self.se, self.ce = math.sin(math.radians(E)), math.cos(math.radians(E))
    def P(self, lat, lon):
        return (self.cx + self.A * math.cos(lat) * math.cos(lon), self.y0 - self.H * math.sin(lat) * self.ce + self.A * math.cos(lat) * math.sin(lon) * self.se)
    def outline(self):
        pts = [self.P(math.radians(la), math.radians(lo)) for la in range(0, 91, 3) for lo in range(0, 360, 4)]
        return _resample_closed(_hull(pts), 44)
    def band(self, la0, la1, spill=0.2):
        """The front of the dome between two latitudes (radians), a little past the sides (clipped to the outline)."""
        n = 36; a0, a1 = -spill, math.pi + spill
        top = [self.P(la1, a0 + (a1 - a0) * i / n) for i in range(n + 1)]
        bot = [self.P(la0, a1 - (a1 - a0) * i / n) for i in range(n + 1)]
        return top + bot
    def on_front(self, lat_c, u, v):
        """A point u across and v up (units of the kippah's own surface) from the front of latitude lat_c."""
        la = lat_c + v / math.hypot(self.A * math.sin(lat_c), self.H * math.cos(lat_c))
        lo = math.pi / 2 - u / (self.A * math.cos(la))
        return self.P(la, lo)

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

def hexagram(r, rot=0.0):
    """The two triangles of a Star of David, circumradius r, centred on 0,0, points up and down."""
    up = [(r * math.cos(math.radians(-90 + rot + 120 * k)), r * math.sin(math.radians(-90 + rot + 120 * k))) for k in range(3)]
    dn = [(r * math.cos(math.radians(90 + rot + 120 * k)), r * math.sin(math.radians(90 + rot + 120 * k))) for k in range(3)]
    return up, dn

def hexagram_outline(r):
    """The star's outer outline (12 points): the union of the two triangles."""
    out = []
    for k in range(12):
        a = math.radians(-90 + 30 * k)
        rr = r if k % 2 == 0 else r / math.sqrt(3)
        out.append((rr * math.cos(a), rr * math.sin(a)))
    return out

def ringlet(ax, y_top, y_bot, turns, w0, w1, side, clip_id, temple):
    """One of the payot: a lock of hair from the temple, wound into a tight corkscrew curl that hangs from y_top to
    y_bot about an axis at x=ax, w0 wide at the top and w1 at the tip. Drawn as a ringlet is drawn: one scalloped
    column (it bulges at every turn and tucks in between) running up into the lock at the temple, crossed by the edges
    of its turns, each a curve that runs down across the front from the outer side to the inner (half a turn) and sags
    in the middle, a shadow tucked under each edge, the bulge of every turn lit from the upper left, the tip a round
    end. side=-1 is his right (screen left). `temple` is (x on the wall, y top, y bottom) of the lock's root.
    Returns (defs, svg list)."""
    n = turns; p = (y_bot - y_top) / n
    hw = lambda y: (w0 + (w1 - w0) * min(1.0, max(0.0, (y - y_top) / (y_bot - y_top)))) / 2
    B = par("pbulge", 1.4)
    def edge(k, dy=0.0, t0=0.0, t1=1.0, m=18):
        """The k-th turn's edge across the front (outer side high, inner side half a turn lower), moved down dy."""
        out = []
        for j in range(m + 1):
            t = t0 + (t1 - t0) * j / m
            y = y_top + k * p + dy + 0.5 * p * t
            h = hw(y) + B * 0.5; y += 0.4 * h * math.sin(math.pi * t)
            out.append((ax + side * h * (1 - 2 * t), y))
        return out
    # the column: each side bulges between the points where the turns' edges meet it and tucks in at them
    outer, inner = [], []
    for j in range(0, int(n * 8) + 1):
        y = y_top + p * j / 8; ph = 2 * math.pi * j / 8
        outer.append((ax + side * (hw(y) + B * (0.5 - 0.5 * math.cos(ph))), y))
        yi = y + 0.5 * p
        if yi <= y_bot: inner.append((ax - side * (hw(yi) + B * (0.5 - 0.5 * math.cos(ph))), yi))
    # the tip: the last turn rounds off into a ball end
    r = hw(y_bot) + B * 0.4; yc = y_bot + 0.1 * p
    tip = [(ax + side * r * math.cos(a), yc + r * 0.95 * math.sin(a)) for a in [math.radians(d) for d in range(20, 180, 20)]]
    # the root: from the temple the lock sweeps out and down into the top of the column
    tx, ty0, ty1 = temple
    ox = ax + side * (hw(y_top) + B)
    root_out = [(tx - side * 0.4, ty0), ((tx + ox) / 2 + side * 0.6, ty0 + 1.2), (ax + side * (hw(y_top) + 0.5), y_top - 1.8)]
    root_in = [(ax - side * (hw(y_top) - 0.2), y_top + 1.5), (tx + side * 0.2, ty1)]
    sil = smooth_closed(root_out + outer[1:] + tip + inner[::-1] + root_in, 0.42)
    defs = f'<clipPath id="{clip_id}"><path d="{sil}"/></clipPath>'
    out = [path(sil, HAIR, "none", 0), f'<g clip-path="url(#{clip_id})">']
    # the lock at the root: strands swept from the temple
    for j, (dy, o) in enumerate(((0.8, 0.9), (2.2, 0.75), (3.6, 0.6))):
        out.append(path(smooth_open([(tx + side * 0.6, ty0 + dy), (tx - side * 2.8, ty0 + dy + 1.2), (ax + side * hw(y_top) * (0.6 - 0.5 * j), y_top + 1.0)], 0.5), "none", STRAND, 1.0, f'opacity="{o}"'))
    for k in range(0, int(math.ceil(n)) + 1):
        # the bulge of the turn, lit, and a sheen on its upper outer side
        lit = edge(k, 0.2 * p) + edge(k, 0.64 * p)[::-1]
        out.append(path(smooth_closed(lit, 0.4), STRAND, "none", 0))
        out.append(path(smooth_open(edge(k, 0.38 * p, 0.05, 0.55, 10), 0.5), "none", LAV, 1.0, 'opacity="0.75"'))
        # the shadow tucked under the turn above
        if k > 0: out.append(path(smooth_open(edge(k, 0.9, 0.0, 1.0), 0.5), "none", INK, 1.9, 'opacity="0.3"'))
    for k in range(1, int(math.ceil(n)) + 1):
        out.append(path(smooth_open(edge(k, 0.0, 0.0, 1.0), 0.5), "none", INK, LD * 0.9))
    out.append('</g>')
    out.append(path(sil, "none", INK, LD * 1.15))
    return defs, out

# ---------------- the drawing ----------------
# Measured off the references (Sahur2.webp's alpha silhouette, the sticker's outline), image pixels scaled so the
# log's top sits at y=14 and the soles on y=212. The log is three times taller than it is wide (61 x 192 px), has a
# rounded cap, tapers a little to the base, and the two eyes together span its whole width. The shoulders are at
# the mouth's height; the legs are a third of him; the feet are huge; the bat has a thin handle and a fat barrel.
CX = 100.0
TOP_Y = 14.0                              # the cap's top
CAP_R = 11.0                              # the cap's rounded corners (the references' log ends in a near dome)
TOP_W, BOT_W = 41.0, 35.0                 # the log's width at the cap and at the base (skinnier down by the legs)
BOT_Y = 138.0                             # the base
BASE_R = 4.5                              # the base's rounded corners
NECK_Y = 96.0                             # the head unit pivots here (pet.css: 100px 96px)
SHOULDER_Y = 80.0                         # the arms hang from the walls at the mouth's height
HIP_Y = 132.0                             # the legs' pivots, inside the log (pet.css)
HIPS = (93.0, 107.0)
ANKLE_Y = 192.0                           # the foot fans out below this to the toes on the floor
SHOULDER_GAP = (76.8, 83.6)               # the log's wall line breaks here on each side: the arms grow out of the gap, no line across the join
LEGL_PIVOT = (81.1, 80.2)                 # the arms' pivots, ON the walls: wall_x(80.2, ∓1) (pet.css pins them; the bat widens the near arm's box)
LEGR_PIVOT = (118.9, 80.2)
SHOULDER_R = 3.4                          # the round joint under each arm's root: half the wall gap, so its arc closes the gap

CHEEK_Y = 70.0                            # the cheeks' widest, at the smile's corners: they swell the walls a touch there

EYE_Y = 41.5                              # the eyes' centre line (the face's own constant lives with the eyes; keep them equal)

def wall_x(y, side, cheeks=True):
    """The log's wall at height y: it tapers from TOP_W at the cap to BOT_W at the base, and the head shapes itself
    round the face as in the references: the walls swell out at the eyes (the eyeballs stand proud of the head, the
    wall wrapping round them) and again, less, at the cheekbones; below the chin the log is a plain cylinder."""
    u = (y - TOP_Y) / (BOT_Y - TOP_Y)
    bulge = (1.3 * math.exp(-((y - EYE_Y) / 7.0) ** 2) + 1.7 * math.exp(-((y - 62.0) / 8.0) ** 2)) if cheeks else 0.0
    return CX + side * ((TOP_W + (BOT_W - TOP_W) * u) / 2 + bulge)

def wall_pts(y0, y1, side, step=3.0):
    """The wall as a point list from y0 to y1 (either way), following the taper and the cheek."""
    n = max(2, int(round(abs(y1 - y0) / step)))
    return [(wall_x(y0 + (y1 - y0) * k / n, side), y0 + (y1 - y0) * k / n) for k in range(n + 1)]

def curve_only(pts):
    """smooth_open without its leading M, to continue a path already at pts[0]."""
    d = smooth_open(pts, 0.5)
    return d[d.index(' ') + 1:]

# ---------------- the Habibi pack (items): keffiyeh + agal ----------------
import habibi as HB

def keffiyeh_sahur():
    """The keffiyeh on him: the shemagh over the top of the log, puffed a little past the cap's corners, its front edge
    across his brow just above the hooded lids, held on by the agal; its sides hang behind the log beside his face (his
    eyes stand proud of the walls, over them) down to his shoulders, a knotted fringe at each end, the edge band framing
    the face down both sides. Two layers of one cloth, like the cat's: #keffiyehback behind the head, #keffiyeh over it,
    the seam between them (just above the eyes' outer corners) without ink. Returns (defs, back, front)."""
    TOP = [(74.5, 30.0), (74.2, 22.0), (75.4, 14.5), (78.8, 8.8), (85.5, 5.2), (100.0, 3.9), (114.5, 5.2), (121.2, 8.8), (124.6, 14.5), (125.8, 22.0), (125.5, 30.0)]
    HEM = [(79.3, 33.4), (81.8, 29.8), (89.5, 27.6), (100.0, 27.0), (110.5, 27.6), (118.2, 29.8), (120.7, 33.4)]
    OUT = [(73.2, 78.5), (72.3, 62.0), (72.6, 46.0), (73.8, 34.0)] + TOP + [(126.2, 34.0), (127.4, 46.0), (127.7, 62.0), (126.8, 78.5), (118.0, 81.0), (100.0, 77.0), (82.0, 81.0)]
    out_d = smooth_closed(OUT, 0.4)
    front_d = smooth_closed([(74.1, 33.7)] + TOP + [(125.9, 33.7)] + HEM[::-1], 0.25)
    defs = ('<defs id="sahurkeffiyehdefs">' + HB.shemagh_pattern("sahurkfpat", 4.3, 0.4, 1.3)
            + f'<path id="sahurkfout" d="{out_d}"/><path id="sahurkffront" d="{front_d}"/>'
            + '<clipPath id="sahurkfbackclip"><use href="#sahurkfout"/></clipPath><clipPath id="sahurkffrontclip"><use href="#sahurkffront"/></clipPath></defs>')
    use = lambda ref, fill, stroke="none", w=0: f'<use href="#{ref}" fill="{fill}" stroke="{stroke}" stroke-width="{w}"/>'
    # the folds and shade, the same in both layers: light from the upper left like the log, the far (right) side in shade,
    # a soft band where the agal presses the cloth
    SH = [path(smooth_closed([(112, 6), (122, 10), (126, 22), (126, 32), (120, 30), (116, 16)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.16"'),
          path(smooth_closed([(120.5, 32), (128, 34), (128.5, 60), (127, 80), (121, 80), (121.5, 56)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.2"'),
          path(smooth_closed([(72, 36), (78.5, 34), (79, 60), (78, 80), (72.5, 80), (72, 56)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.1"'),
          path(smooth_closed([(73, 22), (100, 25.5), (127, 22), (127, 26), (100, 29.5), (73, 26)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.12"')]
    back = [f'<g id="keffiyehback" display="none">', use("sahurkfout", HB.KF_WHITE), use("sahurkfout", "url(#sahurkfpat)"), '<g clip-path="url(#sahurkfbackclip)">'] + SH
    # the edge band down each side of the face, just outside the log's wall (the eyes stand over it where they overhang)
    for side in (-1, 1):
        pts = [(wall_x(y, side, cheeks=False) + side*2.4, y) for y in range(33, 80, 3)]
        back.append(path(HB.band_d(pts, 2.2), HB.KF_RED, "none", 0))
        back.append(path(smooth_open([(x + side*2.3, y) for x, y in pts], 0.5), "none", HB.KF_RED, 0.7))
    back += ['</g>', use("sahurkfout", "none", INK, LW)]
    back += HB.tassels([(72.8, 78.0), (79.0, 80.2)], 2, 6.0, INK, 0.9, 11)
    back += HB.tassels([(121.0, 80.2), (127.2, 78.0)], 2, 6.0, INK, 0.9, 13)
    back.append('</g>')
    ab, af = HB.agal(100, 19.2, 27.5, 3.2, 4.8, INK, LW, back_from=0, back_to=0)
    front = ['<g id="keffiyeh" display="none">', use("sahurkffront", HB.KF_WHITE), use("sahurkffront", "url(#sahurkfpat)"), '<g clip-path="url(#sahurkffrontclip)">'] + SH
    front.append(path(HB.band_d(HB.offset_open(HEM, -2.3), 2.1), HB.KF_RED, "none", 0))
    front.append(path(smooth_open(HB.offset_open(HEM, -4.5), 0.5), "none", HB.KF_RED, 0.7))
    front += ['</g>', path(smooth_open(HEM, 0.5), "none", INK, LW)]
    front.append('<g clip-path="url(#sahurkfbackclip)">'); front += af; front.append('</g>')
    front.append(path(smooth_open([(74.5, 30.0)] + TOP[1:-1] + [(125.5, 30.0)], 0.4), "none", INK, LW))
    front.append('</g>')
    return defs, back, front

# ---------------- the emo pack (DEV only until it is an item; /emopack): beanie, emo clothes, wristbands, eyeliner ----------------
import emo as EM

def beanie_sahur():
    """The beanie on him: black knit over the top of the log (taller than the cap: the knit stands up off it), its folded cuff
    across his brow just above the hooded lids, a broken-heart patch on the cuff, and under it his emo hair in BLACK (the emo
    hair item's cut: parted high on the left, swept over his right eye). One group, in the head unit. Returns (defs, front)."""
    RIM = [(76.6, 34.0), (79.6, 30.2), (88.0, 27.8), (100.0, 27.0), (112.0, 27.8), (120.4, 30.2), (123.4, 34.0)]
    UP = [(x, y - 8.2) for x, y in RIM]
    DOME = [(75.4, 30.0), (75.2, 19.0), (77.3, 9.5), (82.3, 2.0), (90.5, -2.6), (100.0, -4.0), (109.5, -2.6), (117.7, 2.0), (122.7, 9.5), (124.8, 19.0), (124.6, 30.0)]
    hat_d = smooth_closed(DOME + RIM[::-1], 0.4)
    cuff_d = smooth_closed([(75.6, 26.0)] + UP[1:-1] + [(124.4, 26.0), (124.6, 30.0)] + RIM[::-1] + [(75.4, 30.0)], 0.3)
    hair = [(78.0, 44.0), (76.5, 36.0), (76.8, 24.0), (79.5, 13.0), (85.0, 7.0), (93.0, 4.0), (101.0, 3.5), (110.0, 5.0), (118.0, 9.0), (123.0, 15.0),
            (124.6, 24.0), (125.0, 38.0), (124.2, 50.0), (122.5, 60.0), (120.0, 52.0), (117.0, 62.5), (114.5, 52.0), (111.0, 58.0), (108.0, 48.0),
            (104.5, 52.0), (101.5, 42.0), (97.5, 38.0), (93.0, 35.0), (88.0, 30.5), (83.5, 30.0), (80.5, 33.0)]
    hair_d = smooth_closed(hair, 0.32)
    defs = (f'<defs id="sahurbeaniedefs"><clipPath id="sahurbeanieclip"><path d="{hat_d}"/></clipPath><clipPath id="sahurbeaniecuffclip"><path d="{cuff_d}"/></clipPath>'
            f'<clipPath id="sahurbeaniehairclip"><path d="{hair_d}"/></clipPath>{EM.checker_pattern("sahuremocheck", 2.6, 0)}</defs>')
    out = ['<g id="beanie" display="none">', path(hair_d, EM.HAIRB, INK, LW), '<g clip-path="url(#sahurbeaniehairclip)">']
    for (x0, y0, x1, y1) in ((84.0, 28.0, 92.0, 37.0), (98.0, 30.0, 107.0, 41.0), (104.0, 30.0, 115.0, 47.0), (110.0, 30.0, 120.0, 45.0), (116.0, 30.0, 123.0, 40.0), (112.0, 34.0, 118.0, 56.0)):
        out.append(path(smooth_open([(x0, y0), ((x0 + x1) / 2 - 1.5, (y0 + y1) / 2 + 1.5), (x1, y1)]), "none", EM.HAIRB2, 1.3))
    out.append('</g>')
    out.append(path(hat_d, EM.KNIT, "none", 0))
    out.append('<g clip-path="url(#sahurbeanieclip)">')
    out.append(path(smooth_closed([(78.0, 22.0), (79.5, 10.0), (86.0, 3.0), (94.0, 0.0), (88.0, 7.0), (83.0, 16.0), (81.0, 24.0)], 0.5), EM.KNIT2, "none", 0, 'opacity="0.55"'))
    for k in range(-5, 6):
        xb = 100 + k * 4.6; yb = 26.6 - 0.5 * abs(k) * 0.4
        xt = 100 + k * 2.1; yt = -2.0 + 0.10 * k * k
        out.append(path(smooth_open([(xb, yb), (100 + k * 3.9, (yb + yt) / 2 - 0.5), (xt, yt)]), "none", EM.KNITD, 0.9, 'opacity="0.8"'))
    out.append('</g>')
    out.append(path(cuff_d, EM.KNIT, "none", 0))
    out.append('<g clip-path="url(#sahurbeaniecuffclip)">')
    out.append(path(smooth_open([(x, y + 1.0) for x, y in UP], 0.5), "none", EM.KNITD, 2.4, 'opacity="0.9"'))
    for x in range(77, 124, 3):
        out.append(path(f"M{x:.1f},{27.5 - 0.004 * (x - 100) ** 2 - 5.6:.1f} L{x - 0.2:.1f},{27.5 + 0.012 * (x - 100) ** 2 - 1.2:.1f}", "none", EM.KNIT2, 0.9, 'opacity="0.75"'))
    out.append('</g>')
    out.append(path(smooth_open(UP, 0.5), "none", INK, 1.0))
    out.append(path(hat_d, "none", INK, LW))
    out += EM.broken_heart(89.0, 24.2, 8.2, rot=-6, lw=0.8)
    out.append('</g>')
    return defs, out

def build():
    global LW, LD
    LW = par("lw", 1.55)    # contour line
    LD = par("ld", 1.1)     # detail line (grain, creases, toes)
    import math as _m
    g = []

    # ---------------- the log's two halves (fills; the ink is added where each is drawn) ----------------
    r = CAP_R; lt, rt = wall_x(TOP_Y, -1), wall_x(TOP_Y, +1)
    ln, rn = wall_x(NECK_Y, -1), wall_x(NECK_Y, +1)
    cap = (f"M{lt:.2f},{TOP_Y + r} C{lt:.2f},{TOP_Y + r * (1 - K):.2f} {lt + r * (1 - K):.2f},{TOP_Y} {lt + r:.2f},{TOP_Y} "
           f"L{rt - r:.2f},{TOP_Y} C{rt - r * (1 - K):.2f},{TOP_Y} {rt:.2f},{TOP_Y + r * (1 - K):.2f} {rt:.2f},{TOP_Y + r}")
    # head: the cap, down the walls (out round the cheeks) to just past the neck, a shallow dip into the body
    wallR = wall_pts(TOP_Y + r, NECK_Y + 4, +1); wallL = wall_pts(TOP_Y + r, NECK_Y + 4, -1)
    # (the log is rigid, the halves never move apart: the head's fill just runs two units past the seam in a straight
    # cut over the body's identical fill, so no hairline can show and nothing on the body is covered by it)
    wallR = wall_pts(TOP_Y + r, NECK_Y + 2, +1); wallL = wall_pts(TOP_Y + r, NECK_Y + 2, -1)
    head_d = cap + " " + curve_only(wallR) + " " + curve_only(wallL[::-1]) + " Z"
    # body: from under the head down the walls to the base, its corners rounded
    b = BASE_R; lb, rb = wall_x(BOT_Y, -1), wall_x(BOT_Y, +1)
    body_d = (f"M{wall_x(NECK_Y - 8, -1):.2f},{NECK_Y - 8} L{wall_x(NECK_Y - 8, +1):.2f},{NECK_Y - 8} L{rb:.2f},{BOT_Y - b} "
              f"C{rb:.2f},{BOT_Y - b * (1 - K):.2f} {rb - b * (1 - K):.2f},{BOT_Y} {rb - b:.2f},{BOT_Y} L{lb + b:.2f},{BOT_Y} "
              f"C{lb + b * (1 - K):.2f},{BOT_Y} {lb:.2f},{BOT_Y - b * (1 - K):.2f} {lb:.2f},{BOT_Y - b} Z")

    # ---------------- draw order ----------------
    g.append('<defs>'
             '<linearGradient id="sahurlog" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8A4A16"/><stop offset="0.1" stop-color="#C0722A"/><stop offset="0.3" stop-color="#E6A04A"/><stop offset="0.52" stop-color="#D68A34"/><stop offset="0.8" stop-color="#B96C22"/><stop offset="1" stop-color="#7C3F0F"/></linearGradient>'
             '<linearGradient id="sahurlogU" gradientUnits="userSpaceOnUse" x1="81.5" y1="0" x2="118.5" y2="0"><stop offset="0" stop-color="#8A4A16"/><stop offset="0.1" stop-color="#C0722A"/><stop offset="0.3" stop-color="#E6A04A"/><stop offset="0.52" stop-color="#D68A34"/><stop offset="0.8" stop-color="#B96C22"/><stop offset="1" stop-color="#7C3F0F"/></linearGradient>'
             '<linearGradient id="sahurlogZ" gradientUnits="userSpaceOnUse" x1="81.5" y1="0" x2="118.5" y2="0"><stop offset="0" stop-color="#3E4A30"/><stop offset="0.1" stop-color="#5E6E44"/><stop offset="0.3" stop-color="#8FA066"/><stop offset="0.52" stop-color="#7E8E5A"/><stop offset="0.8" stop-color="#5F6E46"/><stop offset="1" stop-color="#36402A"/></linearGradient>'
             '<linearGradient id="sahurlimbZ" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4C5A3A"/><stop offset="0.38" stop-color="#8FA066"/><stop offset="0.68" stop-color="#788858"/><stop offset="1" stop-color="#46543A"/></linearGradient>'
             '<radialGradient id="sahureyewhiteZ" cx="0.42" cy="0.36" r="0.78"><stop offset="0" stop-color="#F2F0D8"/><stop offset="0.6" stop-color="#E6E3C2"/><stop offset="1" stop-color="#B7B49A"/></radialGradient>'
             '<linearGradient id="sahurarmR" gradientUnits="userSpaceOnUse" x1="120.9" y1="0" x2="127.9" y2="0"><stop offset="0" stop-color="#96531A"/><stop offset="0.38" stop-color="#E09A46"/><stop offset="0.68" stop-color="#CF8130"/><stop offset="1" stop-color="#8A4914"/></linearGradient>'
             '<linearGradient id="sahurarmRZ" gradientUnits="userSpaceOnUse" x1="120.9" y1="0" x2="127.9" y2="0"><stop offset="0" stop-color="#4C5A3A"/><stop offset="0.38" stop-color="#8FA066"/><stop offset="0.68" stop-color="#788858"/><stop offset="1" stop-color="#46543A"/></linearGradient>'
             '<linearGradient id="sahurlimb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#96531A"/><stop offset="0.38" stop-color="#E09A46"/><stop offset="0.68" stop-color="#CF8130"/><stop offset="1" stop-color="#8A4914"/></linearGradient>'
             '<linearGradient id="sahurbat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7A3F10"/><stop offset="0.35" stop-color="#C8752A"/><stop offset="0.62" stop-color="#E2A354"/><stop offset="1" stop-color="#8E4C14"/></linearGradient>'
             '<radialGradient id="sahureyewhite" cx="0.42" cy="0.36" r="0.78"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#F7F3ED"/><stop offset="1" stop-color="#C9BFB4"/></radialGradient>'
             '<radialGradient id="sahurcapglow"><stop offset="0" stop-color="#F6CB86" stop-opacity="0.8"/><stop offset="1" stop-color="#F6CB86" stop-opacity="0"/></radialGradient>'
             f'<radialGradient id="sahurlit"><stop offset="0" stop-color="{WOODTOP}" stop-opacity="0.6"/><stop offset="0.55" stop-color="{WOODTOP}" stop-opacity="0.32"/><stop offset="1" stop-color="{WOODTOP}" stop-opacity="0"/></radialGradient>'
             f'<radialGradient id="sahurshade"><stop offset="0" stop-color="{GRAIN}" stop-opacity="0.42"/><stop offset="0.6" stop-color="{GRAIN}" stop-opacity="0.22"/><stop offset="1" stop-color="{GRAIN}" stop-opacity="0"/></radialGradient>'
             '</defs>')
    # ---------------- the pumpkin's cuts and outline (defs at top level, never inside a hidden group: a clip inside a
    # display:none group does not resolve). Lobes drawn as ellipses; the carvings are real holes (a mask): one slot round
    # both eyes with their brows, a nose, the classic grin over his mouth, so his own face looks out of it. ----------------
    # (the lobes' bottoms curve up at the sides, clear of the arms' roots at the shoulders (x 72-80 and 120-128, y 77-84):
    # the arms come out from under the pumpkin, never through it; only the centre lobe reaches down over the seam)
    PK_LOBES = ((79, 41, 17, 35, PUMPKIN3), (121, 41, 17, 35, PUMPKIN3), (90, 43, 19, 38, PUMPKIN), (110, 43, 19, 38, PUMPKIN), (100, 44, 23, 44, PUMPKIN))
    slot = [(76.0, 42.0), (79.0, 33.0), (86.0, 28.5), (96.0, 28.5), (100.0, 33.0), (104.0, 28.5), (114.0, 28.5), (121.0, 33.0), (124.0, 42.0),
            (121.0, 51.5), (114.0, 55.5), (104.0, 55.5), (100.0, 51.0), (96.0, 55.5), (86.0, 55.5), (79.0, 51.5)]
    PK_HOLES = [smooth_closed(slot, 0.45), poly([(100.0, 57.0), (95.8, 66.0), (104.2, 66.0)]), carve_grin(100.0, 72.0, 34.0, 10.0)]
    g.append('<defs id="pkdefs">')
    # the head is clipped to the pumpkin's outline plus everything below the shoulders, so the log runs on under the pumpkin
    # like a post (its sides show beside the pumpkin's bottom) and nothing of the face shows past the pumpkin's edge
    g.append('<clipPath id="sahurpkclip">' + "".join(ellipse(cx_, cy_, rx_ + 0.5, ry_ + 0.5, INK, "none") for (cx_, cy_, rx_, ry_, _) in PK_LOBES)
             + '<rect x="60" y="76" width="80" height="40"/></clipPath>')
    g.append('<mask id="sahurpkmask" maskUnits="userSpaceOnUse" x="30" y="-40" width="140" height="160"><rect x="30" y="-40" width="140" height="160" fill="#FFFFFF"/>'
             + "".join(path(d, "#000000", "none") for d in PK_HOLES) + '</mask>')
    g.append('<clipPath id="sahurpkholesclip">' + "".join(f'<path d="{d}"/>' for d in PK_HOLES) + '</clipPath>')
    g.append('</defs>')
    # the kippah (Jewish pack; hidden until worn): its outline clips the stripes and the shading. Top-level defs for the
    # same reason as the pumpkin's (never inside the hidden group, or any other pet on the page loses it)
    KP = Kippah(CX, 17.0, 13.6, 9.2, 8.5)
    kp_out = smooth_closed(KP.outline(), 0.5)
    PAYOT_DEFS = []                                   # the payot's clips, filled in when the head is drawn
    KF_DEFS, KF_BACK, KF_FRONT = keffiyeh_sahur()
    g.append(KF_DEFS)
    BN_DEFS, BN_FRONT = beanie_sahur()
    g.append(BN_DEFS)
    g.append(f'<defs id="sahurkippahdefs"><clipPath id="sahurkippahclip"><path d="{kp_out}"/></clipPath>@@PAYOTDEFS@@</defs>')
    g.append('<g id="shadow"></g>')   # no ground shadow on him (the operator did not want one)

    g.append('<g id="figure">')
    # The witch robe's cape (costume; hidden until worn), first of all so it is behind everything, the legs included:
    # it hangs from his shoulders out past the log on both sides to a wavy hem just below the log's base, lining down
    # its edges, stars on the back panel, and the collar's flaps standing up behind the head. On him the rig moves it
    # with the log (it is in `heads`, pet.css pivots it at the hips).
    g.append('<g id="robeback" class="robe" display="none">')
    def star(cx_, cy_, r_):
        return path(f"M{cx_},{cy_-r_} L{cx_+r_*0.28},{cy_-r_*0.28} L{cx_+r_},{cy_} L{cx_+r_*0.28},{cy_+r_*0.28} L{cx_},{cy_+r_} "
                    f"L{cx_-r_*0.28},{cy_+r_*0.28} L{cx_-r_},{cy_} L{cx_-r_*0.28},{cy_-r_*0.28} Z", LAV, "none", 0, 'opacity="0.85"')
    g.append(path(smooth_closed([(74.0, 80.0), (62.0, 88.0), (56.0, 106.0), (54.0, 126.0), (56.0, 146.0), (62.0, 154.0), (72.0, 149.0), (84.0, 155.0), (96.0, 149.0), (108.0, 155.0),
                                 (120.0, 149.0), (132.0, 155.0), (140.0, 148.0), (146.0, 128.0), (144.0, 106.0), (138.0, 88.0), (126.0, 80.0)], 0.4), CLOTH, INK, LW))
    g.append(path(smooth_open([(64.0, 92.0), (57.0, 112.0), (55.0, 132.0), (58.0, 150.0)]), "none", PURPLE, 3.0, 'opacity="0.75"'))     # lining, the edges
    g.append(path(smooth_open([(136.0, 92.0), (143.0, 112.0), (145.0, 132.0), (142.0, 150.0)]), "none", PURPLE, 3.0, 'opacity="0.75"'))
    for (sx_, sy_, sr_) in ((62.0, 122.0, 2.6), (61.0, 142.0, 2.0), (139.0, 136.0, 1.8), (137.0, 116.0, 1.4)):
        g.append(star(sx_, sy_, sr_))
    for pts in ([(75.0, 82.0), (66.0, 70.0), (69.0, 56.0), (79.0, 63.0), (85.0, 76.0), (83.0, 84.0)], [(125.0, 82.0), (134.0, 70.0), (131.0, 56.0), (121.0, 63.0), (115.0, 76.0), (117.0, 84.0)]):   # the collar's flaps, standing up behind the head
        g.append(path(smooth_closed(pts, 0.45), CLOTH, INK, LW))
    g.append(path(smooth_closed([(72.0, 70.0), (72.5, 60.0), (78.0, 64.0), (82.0, 75.0), (79.0, 80.0)], 0.45), STRAND, "none", 0, 'opacity="0.85"'))
    g.append(path(smooth_closed([(128.0, 70.0), (127.5, 60.0), (122.0, 64.0), (118.0, 75.0), (121.0, 80.0)], 0.45), STRAND, "none", 0, 'opacity="0.85"'))
    g.append('</g>')
    # The bisht's cloak (Habibi pack; hidden until worn), behind everything like the witch's cape but long: from his
    # shoulders out past the log to below his knees, behind his legs. Its front panels are over the log (#bisht, last in
    # the head). On him the rig moves it with the log (in `heads`, pivoted at the hips).
    g.append('<g id="bishtback" class="bisht" display="none">')
    # (close to him: the operator found the first, flared one stuck out too far; it only just clears his arms)
    g.append(path(smooth_closed([(76.0, 79.0), (68.0, 86.0), (64.5, 108.0), (63.5, 134.0), (63.5, 160.0), (65.5, 175.0), (76.0, 179.0), (100.0, 180.0), (124.0, 179.0),
                                 (134.5, 175.0), (136.5, 160.0), (136.5, 134.0), (135.5, 108.0), (132.0, 86.0), (124.0, 79.0)], 0.4), HB.BISHT, INK, LW))
    g += HB.sheen([[(67.0, 112.0), (66.0, 140.0), (67.0, 170.0)], [(133.0, 112.0), (134.0, 140.0), (133.0, 170.0)]], 1.4, 0.55)
    g.append('</g>')

    # ---- the legs first, on their own (they run up under the log, and are not part of #body: the body bows from
    # the hips, pet.css `100px 134px`, and the legs stay planted), then the lower log ----
    # Legs: a real thigh tapering to the ankle, a touch of knee, ending in a big bare foot turned outward with its
    # top surface showing. The thigh runs up well under the log so a stride (rotation about the hip) never shows its end.
    for fid, hx, sgn in (("footL", HIPS[0], -1), ("footR", HIPS[1], 1)):
        o = sgn; ax = hx + o * 5.0; ay = ANKLE_Y     # outward along x is +o; the legs splay a little, so the ankle is outward of the hip and the feet stand apart
        g.append(f'<g id="{fid}" class="foot">')
        # The leg: a thigh 9 wide tapering to 6 at the ankle, the knee a touch forward, its top running up under the log.
        thigh = (hx, HIP_Y - 8); knee = (hx + o * 2.2, 160.0)
        g += tapered_sides([thigh, knee, (ax, ay + 2)], 9.0, 6.0, "url(#sahurlimb)")
        # mummy (costume; hidden until worn): two bandages round the thigh, cut to the leg's shape
        g.append(f'<clipPath id="sahurlegclip{fid[-1]}"><path d="{limb_d([thigh, knee, (ax, ay + 2)], 9.0, 6.0)}"/></clipPath>')
        g.append(f'<g id="mummy{fid}" class="mummy" display="none"><g clip-path="url(#sahurlegclip{fid[-1]})">')
        for (y0, sk) in ((146.0, 1.4), (158.0, -1.4)):
            g += strip([(hx - o * 9.0, y0 + sk), (hx + o * 0.6, y0), (hx + o * 10.0, y0 - sk)], 5.6)
        g.append('</g></g>')
        # emo clothes (item; hidden until worn): black skinny jeans down the leg to a rolled cuff above the ankle, a rip
        # across the knee with the wood showing through (on his left leg), a seam down the outside
        g.append(f'<g id="emofit{fid}" class="emofit" display="none"><g clip-path="url(#sahurlegclip{fid[-1]})">')
        g.append(path(poly([(hx - 14, HIP_Y - 10), (hx + 14, HIP_Y - 10), (hx + 14, 183.5), (hx - 14, 183.5)]), EM.JEANS, "none", 0))
        g.append(path(smooth_open([(hx + o * 3.0, 136.0), (hx + o * 3.6, 160.0), (ax + o * 2.6, 182.0)]), "none", EM.JEANS2, 1.0, 'opacity="0.9"'))
        g.append(path(poly([(hx - 14, 180.0), (hx + 14, 180.0), (hx + 14, 185.5), (hx - 14, 185.5)]), EM.JEANS2, "none", 0))
        if o < 0:
            kx, ky = hx + o * 2.4, 160.5
            g.append(path(smooth_closed([(kx - 3.6, ky), (kx, ky - 1.5), (kx + 3.6, ky - 0.2), (kx, ky + 1.6)], 0.5), "url(#sahurlimb)", INK, 0.7))
            g.append(path(f"M{kx - 3.2:.1f},{ky - 1.0:.1f} L{kx - 3.4:.1f},{ky - 2.2:.1f} M{kx + 2.6:.1f},{ky + 0.9:.1f} L{kx + 3.0:.1f},{ky + 2.1:.1f}", "none", EM.CHECKW, 0.6, 'opacity="0.8"'))
        g.append('</g>')
        g.append(path(f"M{hx - 14:.1f},185.5 L{hx + 14:.1f},185.5 M{hx - 14:.1f},180.0 L{hx + 14:.1f},180.0", "none", INK, 0.8, f'clip-path="url(#sahurlegclip{fid[-1]})"'))
        g.append(path(smooth_open(limb_sides([thigh, knee, (ax, ay + 2)], 9.0, 6.0)[0], 0.5), "none", INK, LW))
        g.append(path(smooth_open(limb_sides([thigh, knee, (ax, ay + 2)], 9.0, 6.0)[1], 0.5), "none", INK, LW))
        g.append('</g>')
        # The foot, as in the references, worked out in three dimensions: it points out to the side at about forty
        # degrees and a little toward us, seen from a camera a little above. On screen that is a long wedge running
        # from the ankle down and outward, its top surface showing, a heel behind the ankle, and at its far end the
        # five toes in a row tilted so the big toe is lowest and nearest us (the inside) and the little toe highest
        # and furthest out, every toe pointing along the foot. Its outline is open at the top with both ends inside
        # the shin, so the shin's lines run on into the foot and no line crosses the ankle.
        F = lambda x, y: (ax + o * x, ay + y)
        AXIS = (0.93, 0.37)                                                       # the foot's direction on screen (out, a little down), unit: it lies flat
        big, little = F(14.5, 14.2), F(26.0, 7.2)                                 # the big toe's root and the little toe's (+x is outward)
        foot = [F(3.0, -3.0), F(-3.4, 1.0), F(-4.8, 5.0), F(-3.2, 9.4),           # the inner ankle, back to the heel and down its back
                F(2.0, 11.6), F(8.5, 13.2), big,                                  # the near edge (the sole's, flat along the floor), out to the big toe's root
                little,                                                           # the toe line (the toes hang off it)
                F(23.5, 4.2), F(17.0, 1.0), F(10.5, -1.4), F(5.5, -2.6), F(3.0, -3.0)]   # the far edge (the instep's) back up to the outer ankle
        g.append(path(smooth_open(foot, 0.4), "url(#sahurlimb)", INK, LW))
        ix_, iy_ = F(9.0, 4.5)
        g.append(ellipse(ix_, iy_, 8.5, 4.6, "url(#sahurlit)", "none", 0, f'transform="rotate({o * 22} {ix_:.2f} {iy_:.2f})"'))     # the instep, lit from above (the axis leans out and down)
        mx_, my_ = F(19.5, 10.8)
        g.append(ellipse(mx_, my_, 8.0, 2.4, "url(#sahurshade)", "none", 0, f'transform="rotate({o * 30} {mx_:.2f} {my_:.2f})"'))   # the shadow the toes grow out of
        # the toes: stubs along the toe line from the big toe to the little one, each pointing along the foot and a
        # little bigger than the next; the big toe's underside sits lowest, on the floor (nearest us), with a nail each
        for k, (u, ln, w) in enumerate(((0.0, 6.2, 4.4), (0.22, 5.3, 3.8), (0.45, 4.6, 3.3), (0.68, 4.0, 2.9), (0.9, 3.5, 2.6))):
            rx_, ry_ = big[0] + (little[0] - big[0]) * u, big[1] + (little[1] - big[1]) * u
            cx_, cy_ = rx_ + o * AXIS[0] * ln * 0.42, ry_ + AXIS[1] * ln * 0.42
            ang = o * math.degrees(math.atan2(AXIS[1], AXIS[0]))                   # the ellipse's long axis along the foot (out and down)
            g.append(ellipse(cx_, cy_, ln / 2, w / 2, "url(#sahurlimb)", INK, LD * 1.05, f'transform="rotate({ang:.1f} {cx_:.2f} {cy_:.2f})"'))
            nx_, ny_ = rx_ + o * AXIS[0] * ln * 0.72, ry_ + AXIS[1] * ln * 0.72
            g.append(ellipse(nx_, ny_, w * 0.24, w * 0.17, "none", INK, LD * 0.75, f'opacity="0.5" transform="rotate({ang:.1f} {nx_:.2f} {ny_:.2f})"'))
        g.append('</g>')
    g.append('<g id="body">')
    g.append(path(body_d, "url(#sahurlogU)", "none"))     # the log's colour by absolute x (both halves and the joint share it: no step at the seam)
    # a shade down one side, a light down the other, and the grain, clipped to the log
    g.append(f'<clipPath id="sahurbodyclip"><path d="{body_d}"/></clipPath>')
    g.append('<g clip-path="url(#sahurbodyclip)">')
    for (x0, y0, x1, y1) in ((88.0, 102.0, 87.5, 128.0), (97.0, 100.0, 98.0, 134.0), (108.0, 104.0, 107.0, 131.0)):
        g.append(path(lens_grain(x0, y0, x1, y1, 1.2), "none", GRAIN, LD, 'opacity="0.4"'))
    g.append('</g>')
    g.append(path(f"M{wall_x(NECK_Y - 4, -1):.2f},{NECK_Y - 4} L{lb:.2f},{BOT_Y - b} C{lb:.2f},{BOT_Y - b * (1 - K):.2f} {lb + b * (1 - K):.2f},{BOT_Y} {lb + b:.2f},{BOT_Y} "
                  f"L{rb - b:.2f},{BOT_Y} C{rb - b * (1 - K):.2f},{BOT_Y} {rb:.2f},{BOT_Y - b * (1 - K):.2f} {rb:.2f},{BOT_Y - b} L{wall_x(NECK_Y - 4, +1):.2f},{NECK_Y - 4}"))   # the walls and the base
    # dirt smudges on the log (hidden; shown when hygiene is low)
    g.append('<g id="dirt" display="none">')
    for (dx, dy, rx, ry, rot) in ((91, 112, 4.6, 2.8, -20), (109, 124, 4.0, 2.4, 15), (96, 132, 3.2, 2.0, 30), (107, 106, 3.0, 1.8, -10)):
        g.append(f'<g transform="rotate({rot} {dx} {dy})">' + ellipse(dx, dy, rx, ry, MUD, "none", 0, 'opacity="0.55"') + '</g>')
    g.append('</g>')
    g.append('</g>')  # body

    # keffiyeh (item; hidden until worn): the cloth hanging behind the log beside his face (its top is after the kippah)
    g += KF_BACK
    # ---- head: the top of the log with the face ----
    g.append('<g id="head">')
    g.append(path(head_d, "url(#sahurlogU)", "none"))
    g.append(f'<clipPath id="sahurheadclip"><path d="{head_d}"/></clipPath>')
    # the eye sockets' shadows each keep to their own half of the face: the eyes nearly touch, so the two radial shadows
    # stacked between them into a dark wedge over the bridge of the nose (operator, 2026-09-25: "a little shadow that
    # overlaps and looks bad"). At the centre line both are at the same faint value, so there is no seam.
    g.append(f'<clipPath id="sahursockL"><rect x="0" y="0" width="{CX}" height="240"/></clipPath><clipPath id="sahursockR"><rect x="{CX}" y="0" width="200" height="240"/></clipPath>')
    g.append('<g clip-path="url(#sahurheadclip)">')
    g.append(ellipse(CX, TOP_Y + 6, 22.0, 9.0, "url(#sahurcapglow)", "none", 0))                                 # the cap, lit from above
    # the cap catches the light: a pale rim just inside the top edge
    g.append(path(f"M{lt + 1.2:.2f},{TOP_Y + r + 2} C{lt + 1.2:.2f},{TOP_Y + 3.5} {lt + 4:.2f},{TOP_Y + 1.4} {lt + r:.2f},{TOP_Y + 1.4} L{rt - r:.2f},{TOP_Y + 1.4} C{rt - 4:.2f},{TOP_Y + 1.4} {rt - 1.2:.2f},{TOP_Y + 3.5} {rt - 1.2:.2f},{TOP_Y + r + 2}", "none", WOODTOP, 2.6, 'opacity="0.75"'))
    g.append(ellipse(CX, TOP_Y + 4.2, 13.0, 2.2, WOODTOP, "none", 0, 'opacity="0.55"'))     # and the end grain, seen edge-on
    for (x0, y0, x1, y1) in ((84.0, 60.0, 84.5, 94.0), (116.0, 58.0, 115.5, 92.0), (93.0, 22.0, 93.3, 30.0), (106.0, 21.5, 106.3, 29.5)):
        g.append(path(lens_grain(x0, y0, x1, y1, 0.8), "none", GRAIN, LD, 'opacity="0.4"'))
    g.append('</g>')
    # the cap and the walls; each wall line stops at the shoulder and starts again below it, so an arm's edges can
    # run on from it with no line across the join
    g0, g1 = SHOULDER_GAP
    g.append(path(cap + " " + curve_only(wall_pts(TOP_Y + r, g0, +1)) + " " + smooth_open(wall_pts(TOP_Y + r, g0, -1), 0.5)))
    g.append(path(smooth_open(wall_pts(g1, NECK_Y + 4, +1), 0.5) + " " + smooth_open(wall_pts(g1, NECK_Y + 4, -1), 0.5)))
    # The shoulder joints: a disc in the log's own colour under each arm's root, its outer half edged, centred a little
    # inside the wall so at rest the arm covers all of it and nothing shows. An arm swung high used to leave the wall's
    # gap open with its flat root floating beside it (operator, 2026-09-25: "his arm kinda disconnects from his body");
    # now the joint is a circle round the pivot at any angle, and the arm's edges run into its arc.
    for side, px in ((-1, LEGL_PIVOT[0]), (+1, LEGR_PIVOT[0])):
        cx, cy, r = px - side * 1.1, LEGL_PIVOT[1], SHOULDER_R
        g.append(circle(cx, cy, r, "url(#sahurlogU)"))
        g.append(path(f"M{cx:.2f},{cy - r:.2f} A{r},{r} 0 0 {0 if side < 0 else 1} {cx:.2f},{cy + r:.2f}", "none", INK, LW))

    g.append('<g id="face">')
    EY = EYE_Y; ER = 10.6; RY = 10.0; EXL, EXR = 88.5, 111.5    # huge eyes, nearly touching in the middle, standing a little proud of the walls, which swell round them (wall_x)
    # The face's volumes, all soft gradients and all clipped to the head (nothing may show outside the log), built
    # from the references: the eyes sit deep in dark sockets under the carved brow; one big smooth mound rises under
    # each eye and runs down to the smile's corner (a faint crease right under the lid, the mound's shadow toward the
    # chin); the nose is shaded down its far side; the chin is one round knob under the lip with a real shadow beneath.
    g.append('<g clip-path="url(#sahurheadclip)">')
    for ex, sock in ((EXL, 'sahursockL'), (EXR, 'sahursockR')):
        g.append(f'<g clip-path="url(#{sock})">' + ellipse(ex, EY - 3.0, ER + 4.4, RY + 3.6, "url(#sahurshade)", "none", 0) + '</g>')   # the socket: dark over the top of the eye, under the brow, on its own side only
    for sx, ex in ((-1, EXL), (1, EXR)):
        # the cheekbone and cheek: one big mound from right under the eye down to the smile's corner, lit hard on its
        # crest (the references' cheekbones are very pronounced), a crease right under the lid, its shadow below
        cx_, cy_ = ex - sx * 0.4, EY + RY + 8.0
        g.append(ellipse(cx_, cy_, 11.4, 12.0, "url(#sahurlit)", "none", 0, f'transform="rotate({-sx * 10} {cx_:.1f} {cy_:.1f})"'))
        g.append(ellipse(cx_ - sx * 1.0, cy_ - 4.5, 7.0, 5.0, "url(#sahurlit)", "none", 0))
        g.append(ellipse(cx_ - sx * 1.6, cy_ - 5.5, 3.6, 2.4, "url(#sahurlit)", "none", 0))                       # the crest, brightest
        g.append(ellipse(ex, EY + RY + 1.6, 8.8, 2.0, "url(#sahurshade)", "none", 0))                             # the crease right under the lid
        g.append(ellipse(CX + sx * 13.2, CHEEK_Y + 8.0, 8.0, 5.2, "url(#sahurshade)", "none", 0))                  # the mound's shadow, down beside the chin
    # the nose: shade down its far side, light along the ridge
    g.append(ellipse(103.6, 60.0, 3.0, 7.4, "url(#sahurshade)", "none", 0))
    g.append(ellipse(100.2, 70.4, 4.2, 1.8, "url(#sahurshade)", "none", 0))                                        # under the tip
    g.append(ellipse(97.8, 58.5, 1.6, 6.2, "url(#sahurlit)", "none", 0))
    # the chin: one big round swell under the lower lip, lit, a crease above it and a real shadow beneath it
    g.append(ellipse(CX, 77.2, 7.2, 2.4, "url(#sahurshade)", "none", 0))
    g.append(ellipse(CX, 82.8, 9.6, 6.8, "url(#sahurlit)", "none", 0))
    g.append(ellipse(CX - 0.8, 81.2, 5.2, 3.6, "url(#sahurlit)", "none", 0))
    g.append(ellipse(CX - 1.4, 80.6, 2.6, 1.8, "url(#sahurlit)", "none", 0))
    g.append(ellipse(CX, 90.6, 10.0, 4.0, "url(#sahurshade)", "none", 0))
    g.append('</g>')
    # mummy (costume; hidden until worn): three bandages round the head, cut to it, drawn under the eyes, nose and mouth:
    # across the brow, across the cheeks under the eyes (over the bridge of the nose), and under the mouth round the chin
    g.append('<g id="mummyhead" class="mummy" display="none"><g clip-path="url(#sahurheadclip)">')
    g += strip([(72.0, 27.0), (86.0, 24.0), (100.0, 23.0), (114.0, 24.0), (128.0, 27.0)], 7.0)
    g += strip([(72.0, 61.0), (86.0, 58.5), (100.0, 57.5), (114.0, 58.5), (128.0, 61.5)], 7.0)
    g += strip([(72.0, 87.5), (86.0, 89.5), (100.0, 90.5), (114.0, 89.5), (128.0, 87.5)], 7.0)
    g.append('</g></g>')
    # the carved brow ridge over each eye, each kept to its own half: the two arcs reach the centre line and their round
    # caps crossed it, and two 0.62-opacity strokes on top of each other made a dark notch between the eyes (operator,
    # 2026-09-25, in the close-up profile pictures). Clipped, they abut at the bridge into one ridge.
    for ex, sock in ((EXL, 'sahursockL'), (EXR, 'sahursockR')):
        arc = [(ex + (ER + 1.5) * _m.cos(_m.radians(a)), EY + (RY + 1.6) * _m.sin(_m.radians(a))) for a in range(202, 339, 8)]
        g.append(f'<g clip-path="url(#{sock})">' + path(smooth_open(arc, 0.5), "none", INK, LD * 1.5, 'opacity="0.62"') + '</g>')

    def eye(eid, EX, EY, ER, RY, side):
        IX, IY = EX + side * 0.3, EY + 0.8
        IR = ER * 0.55
        e = [f'<g id="{eid}" class="eye">']
        e.append(f'<clipPath id="sahur{eid}clip"><ellipse cx="{EX}" cy="{EY}" rx="{ER + LW}" ry="{RY + LW}"/></clipPath>')
        e.append(f'<clipPath id="sahur{eid}lid"><ellipse cx="{EX}" cy="{EY}" rx="{ER + 2.8}" ry="{RY + 2.8}"/></clipPath>')
        e.append(f'<clipPath id="sahur{eid}iris"><circle cx="{IX}" cy="{IY}" r="{IR:.2f}"/></clipPath>')
        e.append('<g class="open">')
        e.append(ellipse(EX, EY, ER, RY, "url(#sahureyewhite)", INK, LW))
        e.append(f'<g class="pupil" clip-path="url(#sahur{eid}clip)">')
        e.append(circle(IX, IY, IR, IRIS))
        e.append(f'<circle cx="{IX:.2f}" cy="{IY + IR * 0.55:.2f}" r="{IR:.2f}" fill="{IRIS2}" clip-path="url(#sahur{eid}iris)"/>')
        e.append(circle(IX, IY, IR, "none", INK, LD))
        e.append(circle(IX, IY + 0.2, IR * 0.58, PUPIL))
        e.append(circle(IX - IR * 0.34, IY - IR * 0.36, IR * 0.24, WHITE))
        e.append(circle(IX + IR * 0.36, IY + IR * 0.4, IR * 0.11, WHITE))
        e.append('</g>')
        # The lid: heavy, resting a little way down the eye and sloping down to the outer corner (his look). A
        # wood-coloured cover with an inked edge, cut to a margin round the eye so it never reaches the nose. The rig
        # blinks by sliding `.lid` down 19 units; the lid rides inside a vertical stretch (undone inside it) that
        # turns those 19 into exactly the travel to the lower rim, as on the frog.
        rest = 0.14; ly = EY - RY + 2 * RY * rest
        y0 = EY - RY; travel = (EY + RY + LW / 2 + 0.3) - ly; k = travel / 19
        e.append(f'<g clip-path="url(#sahur{eid}lid)"><g transform="translate(0 {y0:.2f}) scale(1 {k:.4f}) translate(0 {-y0:.2f})"><g class="lid">'
                 f'<g transform="translate(0 {y0:.2f}) scale(1 {1/k:.4f}) translate(0 {-y0:.2f})">')
        e.append(f'<rect x="{EX - ER - 4}" y="{ly - 60:.2f}" width="{2 * ER + 8}" height="60" fill="{WOOD}"/>')
        o, i = (EX - ER - 0.5, EX + ER + 0.5) if side < 0 else (EX + ER + 0.5, EX - ER - 0.5)    # outer corner, inner corner
        e.append(path(f"M{o:.2f},{ly + 1.8:.2f} Q{EX},{ly + 5.6:.2f} {i:.2f},{ly - 1.8:.2f} Q{EX},{ly - 3.4:.2f} {o:.2f},{ly + 1.8:.2f} Z", INK, INK, LD * 1.5))
        e.append('</g></g></g></g>')
        e.append('</g>')
        # closed (asleep): the lid down, a soft line low on the eye
        e.append('<g class="closed" display="none">')
        e.append(path(f"M{EX - ER + 1},{EY + 1.5} Q{EX},{EY + 7.5} {EX + ER - 1},{EY + 1.5}", "none", INK, LW))
        e.append('</g>')
        e.append('<g class="happy" display="none">')
        e.append(path(f"M{EX - ER + 1},{EY + 3} Q{EX},{EY - 7} {EX + ER - 1},{EY + 3}", "none", INK, LW))
        e.append('</g>')
        e.append('<g class="squeeze" display="none">')
        if side < 0: e.append(path(f"M{EX - ER + 1.5},{EY - 5.5} L{EX + 2.5},{EY} L{EX - ER + 1.5},{EY + 5.5}", "none", INK, LW + 0.3))
        else:        e.append(path(f"M{EX + ER - 1.5},{EY - 5.5} L{EX - 2.5},{EY} L{EX + ER - 1.5},{EY + 5.5}", "none", INK, LW + 0.3))
        e.append('</g>')
        e.append('<g class="x" display="none">')
        e.append(path(f"M{EX - 5.5},{EY - 5.5} L{EX + 5.5},{EY + 5.5} M{EX + 5.5},{EY - 5.5} L{EX - 5.5},{EY + 5.5}", "none", INK, LW + 0.3))
        e.append('</g></g>')
        return e

    g += eye("eyeL", EXL, EY, ER, RY, -1)
    g += eye("eyeR", EXR, EY, ER, RY, +1)
    # the nose: a long thin ridge from between the brows to a small rounded tip with wings, nostrils either side
    g.append(path("M98.8,52.5 C97.4,57 96.0,61.5 95.8,65.0 C95.6,67.6 97.0,68.6 98.6,68.3 C99.4,68.1 99.7,67.6 100.2,67.6 C101.4,67.6 102.6,68.4 103.6,67.8 C104.6,67.2 104.4,65.8 103.9,64.8", "none", INK, LW * 0.95))
    g.append(path("M101.3,53 C102.4,57 103.5,61 103.9,64", "none", INK, LD, 'opacity="0.35"'))
    g.append(ellipse(97.6, 66.6, 1.0, 0.65, GRAIN, "none", 0, 'opacity="0.6"'))
    g.append(ellipse(102.4, 66.6, 1.0, 0.65, GRAIN, "none", 0, 'opacity="0.6"'))

    # ---- mouths. The resting one is the references' smirk: closed lips, wide for the log, corners curled up
    # into the cheeks, the middle sagging. The others bend the same lips. ----
    MY = 72.0
    def lips(mid, pts, lower=None, over=(), fill=None):
        out = [f'<g id="mouth-{mid}"' + (' display="none"' if mid != "idle" else '') + '>']
        if fill is not None:
            out.append(path(smooth_closed(pts, 0.45), fill, INK, LW))
        else:
            out.append(path(smooth_open(pts, 0.5), "none", INK, LW + 0.2))
        if lower: out.append(path(smooth_open(lower, 0.5), "none", INK, LD, 'opacity="0.45"'))
        out += list(over)
        out.append('</g>')
        return out
    g.append('<g id="mouth">')
    corner_notches = [ellipse(87.0, MY - 7.0, 1.2, 0.9, INK, "none", 0, 'opacity="0.7" transform="rotate(-45 87.0 %.1f)"' % (MY - 7.0)),
                      ellipse(113.0, MY - 7.5, 1.2, 0.9, INK, "none", 0, 'opacity="0.7" transform="rotate(45 113.0 %.1f)"' % (MY - 7.5)),
                      ellipse(100.0, MY + 5.6, 7.5, 1.7, "url(#sahurlit)", "none", 0)]                        # the lower lip, lit
    g += lips("idle", [(86.8, MY - 7.0), (90.0, MY - 0.5), (100.0, MY + 2.5), (110.0, MY - 0.8), (113.2, MY - 7.5)],
              [(93.5, MY + 4.6), (100.0, MY + 5.6), (106.5, MY + 4.3)], over=corner_notches)
    g += lips("smug", [(88.0, MY - 3.5), (91.5, MY + 1.5), (100.0, MY + 2.5), (109.5, MY - 1.5), (113.5, MY - 9.0)],
              [(95.0, MY + 4.8), (101.0, MY + 5.2), (107.0, MY + 3.0)])
    # open: a round "o", well inside the face so the rig can grow it (a yawn is 1.7x) and it stays on the log
    g.append('<g id="mouth-open" display="none">')
    g.append(ellipse(CX, MY + 1.5, 4.9, 4.6, LIP, INK, LW))
    g.append(f'<clipPath id="sahurmawclip"><ellipse cx="{CX}" cy="{MY + 1.6}" rx="3.3" ry="3.1"/></clipPath>')
    g.append(ellipse(CX, MY + 1.6, 3.3, 3.1, MAW, INK, LD))
    g.append('<g clip-path="url(#sahurmawclip)">' + ellipse(CX, MY + 4.0, 2.6, 1.8, TONGUE, "none", 0) + '</g>')
    g.append('</g>')
    # smile: the grin opens and shows a row of teeth
    smile_pts = [(88.0, MY - 3.5), (94.0, MY - 1.5), (100.0, MY - 1.0), (106.0, MY - 1.5), (112.0, MY - 3.5), (108.0, MY + 5.0), (100.0, MY + 7.0), (92.0, MY + 5.0)]
    teeth = [path(f"M{x},{MY - 1.0} L{x},{MY + 2.8}", "none", INK, LD * 0.8, 'opacity="0.55"') for x in (92.5, 96.5, 100.2, 104.0, 107.8)]
    gum = [path(f"M90.5,{MY + 2.4} Q100,{MY + 3.2} 109.5,{MY + 2.4}", "none", INK, LD * 0.8, 'opacity="0.5"')]
    g += lips("smile", smile_pts, over=gum + teeth, fill=WHITE)
    g += lips("frown", [(89.5, MY + 3.5), (94.0, MY - 0.5), (100.0, MY - 1.5), (106.0, MY - 0.5), (110.5, MY + 3.5)],
              [(95.0, MY - 4.0), (100.0, MY - 4.8), (105.0, MY - 4.0)])
    tongue = [path(f"M97.2,{MY + 4.5} C96.4,{MY + 9} 98.2,{MY + 11.5} 100.6,{MY + 11.5} C103,{MY + 11.5} 104.4,{MY + 9} 103.6,{MY + 4.5} Z", TONGUE, INK, LD + 0.2),
              path(f"M100.4,{MY + 6} L100.5,{MY + 9.5}", "none", INK, LD * 0.8, 'opacity="0.5"')]
    g += lips("yum", smile_pts, over=gum + teeth + tongue, fill=WHITE)
    g.append('</g>')  # mouth
    # lip piercings (emo pack; hidden until worn): two silver hoops through the lower lip, under the smirk's middle
    # (a pair for every mouth, on that mouth's own lower lip: EM.lip_rings, each a twin of its mouth)
    g.append('<g id="piercings" display="none"></g>')
    for mid, pts in EM.lipring_edges("sahur").items(): g.append(EM.lip_rings(mid, pts, 1.45, 0.75))
    g.append('</g>')  # face
    g.append('<g id="tear" display="none">')
    g.append(path("M86,53.5 C86,53.5 82.6,59.4 82.6,62 C82.6,64 84.1,65.4 86,65.4 C87.9,65.4 89.4,64 89.4,62 C89.4,59.4 86,53.5 86,53.5 Z", TEAR, INK, LD + 0.2))
    g.append('</g>')
    # zombie (costume; hidden until worn): a stitched-up crack across the brow and one down the cheek, and the cap
    # split open with the brain out of it (pet.css lifts the crown to perch on it)
    g.append('<g id="zombiehead" class="zombie" display="none">')
    g += stitches((79.5, 30.0), (93.0, 21.0), 3)
    g += stitches((113.5, 60.0), (119.5, 78.0), 3)
    g.append(path(smooth_closed([(93.0, 14.5), (96.0, 11.0), (101.0, 12.0), (106.0, 10.5), (111.0, 13.0), (113.0, 16.0), (108.0, 17.5), (102.0, 16.8), (96.0, 17.5)], 0.35), "#3A1E0A", INK, LD))
    g.append('<g class="zbrain">'); g += brain(103.0, 7.5, 9.5, 6.2, 5); g.append('</g>')   # (.zbrain: the keffiyeh covers it, pet.css)
    g.append('</g>')
    g.append(f'<clipPath id="sahurlogclip"><path d="{head_d}"/><path d="{body_d}"/></clipPath>')
    # The pieces that wrap the whole log live here at the end of the head group, over both halves and clipped to the
    # whole log (`sahurlogclip`), so a band or a patch can cross the seam and nothing draws over it afterwards.
    # zombie (costume; hidden until worn): a darker patch sewn onto the log, a stitched-up crack; the wood itself is
    # recoloured by pet.css (`.zombie` on the svg, by fill attribute)
    g.append('<g id="zombiebody" class="zombie" display="none"><g clip-path="url(#sahurlogclip)">')
    g += stitched_patch([(84.0, 102.0), (103.0, 100.0), (105.0, 120.0), (86.0, 122.0)])
    g += stitches((110.0, 124.0), (119.0, 134.0), 3)
    g.append('</g></g>')
    # mummy (costume; hidden until worn): four bandages round the log, crossing, cut to it so they wrap round it
    g.append('<g id="mummybody" class="mummy" display="none"><g clip-path="url(#sahurlogclip)">')
    for pts in ([(74.0, 96.0), (88.0, 99.0), (100.0, 102.0), (112.0, 105.0), (126.0, 108.0)],
                [(74.0, 113.0), (88.0, 110.0), (100.0, 107.0), (112.0, 104.0), (126.0, 101.0)],
                [(74.0, 120.0), (88.0, 123.0), (100.0, 125.0), (112.0, 127.0), (126.0, 130.0)],
                [(74.0, 136.0), (88.0, 134.0), (100.0, 132.0), (112.0, 130.0), (126.0, 128.0)]):
        g += strip(pts, 8.0)
    g.append('</g></g>')
    # The witch robe's yoke (costume; hidden until worn): the cloak's shoulders, one piece across the top of the body
    # under the chin, out over both arms' roots, so the sleeves and the cape hang from one garment. Its lower edge dips
    # to a V, closed by a clasp: a gold ring and a ruby, like the crown. In the head group so it moves with the log,
    # and last in it, so it lies over the seam.
    g.append('<g id="yoke" class="robe" display="none">')
    g.append(path(smooth_closed([(72.0, 86.0), (78.0, 84.0), (100.0, 88.0), (122.0, 84.0), (128.0, 86.0), (128.5, 96.0), (121.0, 100.0), (110.0, 103.0), (100.0, 108.0),
                                 (90.0, 103.0), (79.0, 100.0), (71.5, 96.0)], 0.4), HAIR, INK, LW))
    g.append(path(smooth_open([(76.0, 96.0), (88.0, 100.0), (100.0, 104.5), (112.0, 100.0), (124.0, 96.0)]), "none", PURPLE, 2.4, 'opacity="0.75"'))   # the lining at its edge
    g.append(path("M96,88 L104,88 L104,96 L96,96 Z", "none", INK, 3.4))
    g.append(path("M96,88 L104,88 L104,96 L96,96 Z", "none", GOLD, 1.9))
    g.append(ellipse(100.0, 92.0, 2.2, 2.0, RUBY, INK, 1.0))
    g.append(circle(99.3, 91.3, 0.65, WHITE))
    g.append('</g>')
    # The bisht's front (Habibi pack; hidden until worn): its two front panels over the sides of the log from the shoulders
    # to a little below the log's base, open down the middle so his own wood shows between the gold edges (where a man's
    # thobe would); the arms, drawn after the head, hang in front of them. In the head, after the yoke, so they move with
    # the log and lie over the seam.
    g.append('<g id="bisht" class="bisht" display="none">')
    for side in (-1, 1):
        X = lambda pts: [(100 + side*(100 - x), y) if side > 0 else (x, y) for x, y in pts]
        g.append(path(smooth_closed(X([(79.6, 77.0), (71.0, 82.0), (67.5, 100.0), (67.0, 126.0), (68.5, 146.0), (74.0, 152.0), (89.5, 152.5), (91.2, 128.0),
                                       (92.6, 104.0), (92.4, 91.0), (88.0, 84.0)]), 0.35), HB.BISHT, INK, LW))
        g += HB.sheen([X([(73.0, 100.0), (71.5, 124.0), (72.5, 146.0)])], 1.3, 0.5)
        g += HB.zari(X([(88.2, 83.6), (91.6, 91.0), (92.0, 104.0), (90.8, 128.0), (89.6, 151.5)]), 3.8, INK, 0.8, 3.0)
    g.append('</g>')
    # The emo clothes (item; hidden until worn): a black tee on the log from under the chin to the waist with a pink broken
    # heart on the chest, a studded belt, and below it the top of his black skinny jeans to the log's base. In the head, after
    # the bisht, clipped to the whole log so it crosses the seam; the arms hang in front of it.
    g.append('<g id="emofit" class="emofit" display="none"><g clip-path="url(#sahurlogclip)">')
    neck = [(wall_x(81.0, -1) - 1, 81.0), (84.5, 83.5), (90.0, 89.5), (95.0, 92.6), (100.0, 93.4), (105.0, 92.6), (110.0, 89.5), (115.5, 83.5), (wall_x(81.0, +1) + 1, 81.0)]
    tee = neck + [(132.0, 81.0), (132.0, 122.0), (68.0, 122.0), (68.0, 81.0)]
    g.append(path(poly(tee), EM.TEE, "none", 0))
    g.append(path(smooth_open([(86.0, 98.0), (86.6, 110.0), (87.4, 121.0)]), "none", EM.TEE2, 1.8, 'opacity="0.6"'))
    g.append(path(smooth_open([(113.0, 98.0), (112.6, 110.0), (112.0, 121.0)]), "none", EM.TEE2, 1.8, 'opacity="0.6"'))
    g += EM.broken_heart(100.0, 106.5, 11.5, lw=0.8)
    # the jeans' top: the log below the belt
    g.append(path(poly([(68.0, 125.5), (132.0, 125.5), (132.0, 140.0), (68.0, 140.0)]), EM.JEANS, "none", 0))
    g.append(path("M100,127.5 L100,138.5", "none", EM.JEANS2, 0.9))     # the fly's seam
    # the belt: black leather, a row of silver pyramid studs, a silver buckle a little off centre
    g.append(path(poly([(68.0, 120.6), (132.0, 120.6), (132.0, 126.6), (68.0, 126.6)]), EM.KNITD, "none", 0))
    for x in range(80, 122, 5):
        if 96 < x < 108: continue
        g.append(path(poly([(x, 121.9), (x + 1.7, 123.6), (x, 125.3), (x - 1.7, 123.6)]), EM.STUD, EM.STUD2, 0.4))
    g.append(path(poly([(97.4, 120.0), (104.6, 120.0), (104.6, 127.2), (97.4, 127.2)]), "none", EM.STUD, 1.5))
    g.append(path("M101,121.6 L101,125.6", "none", EM.STUD, 1.0))
    g.append('</g>')
    g.append(path(smooth_open(neck[1:-1], 0.5), "none", INK, LW))
    g.append(path("M68,120.6 L132,120.6 M68,126.6 L132,126.6 M68,122 L132,122", "none", INK, 0.8, 'clip-path="url(#sahurlogclip)"'))
    g.append('</g>')
    # The Star of David (Jewish pack; hidden until worn): a thin silver chain round the log under the chin, a silver star
    # with a blue inlay hanging from it on his chest. Last-but-one in the head so it lies over the witch's yoke and the
    # mummy's and zombie's body pieces and crosses the seam; the arms (drawn after the head) cover the chain at the sides.
    g.append('<g id="davidstar" display="none">')
    SX, SY, SR = CX, 108.6, 10.0                    # the star's centre and circumradius
    # the chain goes round the log ABOVE the arms' roots (SHOULDER_GAP starts at 76.8): he has no neck, and meeting the
    # walls lower it ran into his armpits (operator). From just above the shoulders it drapes down beside the chin.
    CY_ = SHOULDER_GAP[0] - 3.0
    chainL = [(wall_x(CY_, -1) + 0.6, CY_), (85.0, 81.5), (89.8, 88.6), (95.0, 94.6), (CX, SY - SR - 1.6)]
    chain = smooth_open(chainL, 0.5) + " " + smooth_open([(CX, SY - SR - 1.6), (105.0, 94.6), (110.2, 88.6), (115.0, 81.5), (wall_x(CY_, +1) - 0.6, CY_)], 0.5)[1:].split(" ", 1)[1]
    g.append(f'<g clip-path="url(#sahurlogclip)">' + path(chain, "none", INK, 2.6) + path(chain, "none", SILVER, 1.4)
             + path(chain, "none", SILVER2, 0.8, 'stroke-dasharray="1.3 0.8"') + '</g>')
    g += interlaced_star(SX, SY, SR, 2.5, 0.75, INK, SILVER, SILVER2, FLAGBLUE, WHITE)
    g.append('</g>')
    # The payot (the side curls that come with the kippah; hidden until worn): a corkscrew lock hanging from each temple,
    # out past the walls beside the eyes (the eyes overhang the walls, so the curls hang just outside them) down to the
    # cheeks, clear of the smirk. Last in the head: over the face and the wall line, under the hats and the hair.
    g.append('<g id="payot" display="none">')
    for side in (-1, +1):
        ax = CX + side * par("pax", 27.0)                                                            # the curl's axis: just outside the eyes
        defs, ring = ringlet(ax, 31.0, par("pbot", 64.0), par("pturns", 5.0), par("pw0", 6.0), par("pw1", 4.2), side, 'sahurpayotclip' + ('L' if side < 0 else 'R'),
                             (wall_x(25.0, side) - side * 0.9, 24.6, 30.2))
        PAYOT_DEFS.append(defs)
        g += ring
    g.append('</g>')
    g.append('</g>')  # head

    # ---- the emo hair (item; hidden until worn): the cat's black mop on him, over the cap and the top of the log, the
    # fringe swept down over his right eye in long locks, the left eye clear. Its own group beside the head (the rig
    # moves it with the head unit, which on him is the whole log). ----
    g.append('<g id="emohair" display="none">')
    # The cat's cut on him, fitted to the log: a cap of hair over the top of the log that hugs its dome and overhangs
    # the walls by no more than a few units, parted high on the left and swept across the brow to the right, where it
    # hangs over the right eye in long tapered locks (that eye gone, the left one clear, the emo look); a short lock
    # hangs beside the left wall. The strands run with the sweep.
    hair = smooth_closed([(78.0, 44.0), (76.5, 36.0), (76.8, 24.0), (79.5, 13.0), (85.0, 7.0), (93.0, 4.0), (101.0, 3.5), (110.0, 5.0), (118.0, 9.0), (123.0, 15.0),
                          (124.6, 24.0), (125.0, 38.0), (124.2, 50.0), (122.5, 60.0), (120.0, 52.0), (117.0, 62.5), (114.5, 52.0), (111.0, 58.0), (108.0, 48.0),
                          (104.5, 52.0), (101.5, 42.0), (97.5, 38.0), (93.0, 35.0), (88.0, 30.5), (83.5, 30.0), (80.5, 33.0)], 0.32)
    g.append(path(hair, HAIR, INK, LW))
    g.append(f'<clipPath id="sahuremohairclip"><path d="{hair}"/></clipPath>')
    g.append('<g clip-path="url(#sahuremohairclip)">')
    for (x0, y0, x1, y1) in ((80.0, 22.0, 86.5, 31.0), (84.0, 12.0, 98.0, 37.0), (92.0, 7.0, 107.0, 41.0), (100.0, 5.0, 115.0, 47.0), (108.0, 6.0, 120.0, 45.0), (116.0, 10.0, 123.0, 40.0), (112.0, 30.0, 118.0, 56.0)):
        g.append(path(smooth_open([(x0, y0), ((x0 + x1) / 2 - 1.5, (y0 + y1) / 2 + 1.5), (x1, y1)]), "none", STRAND, 1.4))
    g.append('</g></g>')

    # ---- the kippah (Jewish pack; hidden until worn): a white cloth dome on the flat top of the log, the flag's two blue
    # stripes round its rim and its blue star on the front, a little shade on the far side and under the rim. Its own
    # group after the emo hair (it sits on the hair when both are worn; pet.css lifts it) and before the crown and the
    # hat (a crowned sahur wears it gold and the crown is hidden; the witch hat covers it). ----
    g.append('<g id="kippah" display="none"><g class="kippahpose">')          # (pet.css moves the inner group: onto the emo hair, onto the zombie's brain)
    g.append(path(kp_out, KIPPAH_W, "none", 0))
    g.append('<g clip-path="url(#sahurkippahclip)">')
    # shade: the far (right) side and the rim's underside, light from the upper left like the log
    for dx_, rx_, o in ((12.5, 7.0, 0.4), (10.5, 9.5, 0.35), (8.5, 12.0, 0.3)):                     # soft: three layers, darkest at the far edge
        g.append(ellipse(CX + dx_, 14.0, rx_, 13.0, KIPPAH_SH, "none", 0, f'opacity="{o}"'))
    g.append(path(smooth_open([KP.P(0.0, a) for a in [i * math.pi / 24 for i in range(25)]], 0.5), "none", KIPPAH_SH, 2.2))
    for la0, la1 in ((0.10, 0.25), (0.36, 0.51)):                                                    # the two stripes
        g.append(path(smooth_closed(KP.band(la0, la1), 0.3), FLAGBLUE, "none", 0))
    g.append(ellipse(CX - 5.5, 9.8, 4.2, 2.2, "#FFFFFF", "none", 0, 'opacity="0.7" transform="rotate(-12 94.5 9.8)"'))   # the sheen on its lit shoulder
    g.append('</g>')
    # the star on the front of the dome, bent with it: two outlined triangles, like the flag's
    up, dn = hexagram(4.4)
    for tri in (up, dn):
        pts = [KP.on_front(0.98, x, -y) for x, y in tri]
        g.append(path(poly(pts), "none", FLAGBLUE, 1.05, join="miter"))
    g.append(path(kp_out, "none", INK, LW))
    g.append('</g></g>')
    # keffiyeh (item; hidden until worn): the shemagh over the top of the log and his brow, with the agal; after the kippah
    # (which it replaces) and before the pumpkin and the arms (a raised arm goes in front of it)
    g += KF_FRONT
    # beanie (emo pack; hidden until worn): the black hair and the knit over the top of the log (in `heads` like the keffiyeh)
    g += BN_FRONT

    # ---- jack-o'-lantern (costume; hidden until worn): a whole pumpkin worn over the top of the log, its carvings real
    # holes (the mask in pkdefs) so his eyes, nose and mouth look out of it. pet.css clips #head to its outline
    # (#sahurpkclip) so no wood pokes out past it. Before the arms, so a raised arm goes in front of it. ----
    g.append('<g id="pumpkin" display="none">')
    g.append('<g mask="url(#sahurpkmask)">')
    for (cx_, cy_, rx_, ry_, f_) in PK_LOBES:
        g.append(ellipse(cx_, cy_, rx_, ry_, f_, INK, LW))
    g.append(path("M100,1 Q96,44 100,87", "none", PUMPKIN2, 2.0, 'opacity="0.45"'))
    g.append(ellipse(86.0, 18.0, 6.0, 2.6, WHITE, "none", 0, 'opacity="0.22" transform="rotate(-40 86 18)"'))
    g.append('</g>')
    g.append('<g clip-path="url(#sahurpkholesclip)">')
    for d in PK_HOLES: g.append(path(d, "none", "#1E0D05", 9, 'opacity="0.3"'))    # shadow just inside the cut
    for d in PK_HOLES: g.append(path(d, "none", PUMPKIN2, 4.5))                       # the rind's thickness
    g.append('</g>')
    for d in PK_HOLES: g.append(path(d, "none", INK, LW))
    g.append(path(smooth_closed([(96.0, 2.0), (95.0, -5.0), (97.0, -12.0), (103.0, -13.0), (105.5, -6.0), (104.5, 2.0)], 0.4), MOSS, INK, LW))
    g.append(path("M105,-6 Q114,-15 118,-7 Q120,0 114,-1", "none", MOSS, 1.7))
    g.append(path("M104,-4 Q113,-14 122,-9 Q115,-1 106,-1 Z", LEAF, INK, 1.2))
    g.append(path("M106.5,-2.5 Q114,-8.5 120,-8.5", "none", INK, 0.9, 'opacity="0.5"'))
    g.append('</g>')

    # ---- the arms, in front of the head; the rig moves #arms with #body ----
    g.append('<g id="arms">')
    # the near arm carries the bat: shoulder on the log's left wall at the mouth's height, the elbow out, a fist
    # round the handle just past the log's base
    g.append('<g id="legL" class="leg">')
    # One smooth arm growing out of the log: its outline starts at the wall line's upper end, runs out and down the
    # arm's outer edge, round the wrist, and back up the inner edge to the wall line's lower end, open along the wall,
    # so nothing is drawn across the join. A little thicker at the shoulder than at the wrist, bending at the elbow.
    wl = wall_x(SHOULDER_GAP[0], -1); wl2 = wall_x(SHOULDER_GAP[1], -1)
    armL = [(wl, SHOULDER_GAP[0]), (75.8, 83.5), (72.8, 95.0), (72.3, 108.0), (75.8, 121.5), (80.4, 130.6), (83.0, 133.4), (85.6, 130.6),
            (81.6, 121.0), (77.3, 109.0), (77.6, 97.0), (79.2, 87.5), (wl2, SHOULDER_GAP[1])]
    g.append(path(smooth_open(armL, 0.42), "url(#sahurlimb)", INK, LW))
    armL_d = smooth_open(armL, 0.42) + " Z"
    g.append(f'<clipPath id="sahurarmclipL"><path d="{armL_d}"/></clipPath>')
    # the near sleeve of the witch robe (costume; hidden until worn): the upper arm in the robe's cloth, cut to the arm,
    # ending in a bell cuff with the lining in its mouth; his own wooden forearm and the fist show below it
    g.append('<g id="sleeveL" class="robe" display="none"><g clip-path="url(#sahurarmclipL)">')
    g.append(path(poly([(64.0, 76.0), (92.0, 76.0), (92.0, 105.0), (64.0, 105.0)]), HAIR, "none", 0))
    g.append(path(smooth_open([(76.0, 84.0), (74.2, 94.0), (74.6, 102.0)]), "none", INK, 1.0, 'opacity="0.35"'))   # a fold
    g.append('</g>' + path(smooth_open(armL, 0.42), "none", INK, LW))
    g.append(path(smooth_closed([(69.5, 103.0), (79.5, 103.0), (83.0, 112.5), (66.5, 113.5)], 0.4), HAIR, INK, LW))
    g.append(path(smooth_closed([(68.0, 110.5), (81.0, 110.0), (83.0, 112.5), (66.5, 113.5)], 0.4), PURPLE, "none", 0))
    g.append('</g>')
    # the bisht's near sleeve (Habibi pack; hidden until worn): the upper arm in its wool, cut to the arm, a wide cuff with gold at its mouth
    g.append('<g id="bishtsleeveL" class="bisht" display="none"><g clip-path="url(#sahurarmclipL)">')
    g.append(path(poly([(64.0, 76.0), (92.0, 76.0), (92.0, 105.0), (64.0, 105.0)]), HB.BISHT, "none", 0))
    g += HB.sheen([[(76.0, 84.0), (74.2, 94.0), (74.6, 102.0)]], 1.1, 0.55)
    g.append('</g>' + path(smooth_open(armL, 0.42), "none", INK, LW))
    g.append(path(smooth_closed([(69.5, 103.0), (79.5, 103.0), (83.0, 112.5), (66.5, 113.5)], 0.4), HB.BISHT, INK, LW))
    g += HB.zari([(66.8, 111.8), (74.8, 111.4), (82.8, 111.0)], 3.0, INK, 0.7, 2.6)
    g.append('</g>')
    # zombie (costume; hidden until worn): a stitched-up crack across the upper arm
    g.append('<g id="zombieL" class="zombie" display="none">')
    g += stitches((70.5, 98.5), (80.5, 94.5), 3, 4.0)
    g.append('</g>')
    # mummy (costume; hidden until worn): two bandages round the upper arm, cut to it
    g.append('<g id="wrapL" class="mummy" display="none"><g clip-path="url(#sahurarmclipL)">')
    for (y0, sk) in ((88.0, 1.2), (100.0, -1.2)):
        g += strip([(64.0, y0 + sk), (76.0, y0), (92.0, y0 - sk)], 5.0)
    g.append('</g></g>')
    # emo clothes (item; hidden until worn): the tee's short sleeve over the upper arm, a hem at its end
    g.append('<g id="emofitL" class="emofit" display="none"><g clip-path="url(#sahurarmclipL)">')
    g.append(path(poly([(64.0, 74.0), (92.0, 74.0), (92.0, 97.5), (64.0, 99.5)]), EM.TEE, "none", 0))
    g.append(path(smooth_open([(75.6, 86.0), (74.0, 95.0)]), "none", EM.TEE2, 1.0, 'opacity="0.7"'))
    g.append('</g>' + path(smooth_open(armL, 0.42), "none", INK, LW))
    g.append(path("M64,99.5 L92,97.5", "none", INK, 1.0, 'clip-path="url(#sahurarmclipL)"'))
    g.append('</g>')
    # wristbands (item; hidden until worn): a purple sweatband with a white stripe at the wrist, above the fist
    g.append('<g id="wristL" display="none">')
    g += EM.sweatband((78.4, 120.2), (83.2, 131.0), 0.36, 0.78, 7.4, 1.0)
    g.append('</g>')
    grip = (84.0, 134.0); tip = (48.0, 205.0)
    knob = (grip[0] + (grip[0] - tip[0]) * 0.13, grip[1] + (grip[1] - tip[1]) * 0.13)
    # the bat: a thin handle swelling into a fat barrel, rounded at both ends, its knob above the fist (its own group,
    # #batwood, so a toy that takes the hand can set it down: the emo pack's guitar)
    g.append('<g id="batwood">')
    g.append(tapered([knob, grip, lerp(grip, tip, 0.45), lerp(grip, tip, 0.8), tip], 5.2, 14.0, "url(#sahurbat)"))
    g.append(ellipse(knob[0], knob[1], 3.6, 2.2, BAT, INK, LD, f'transform="rotate(-27 {knob[0]:.1f} {knob[1]:.1f})"'))
    g.append(path(smooth_open([lerp(knob, tip, 0.28), lerp(knob, tip, 0.62), lerp(knob, tip, 0.92)]), "none", BATHI, 1.7, 'opacity="0.5" transform="translate(-2.2 -1.1)"'))
    g.append(path(smooth_open([lerp(knob, tip, 0.5), lerp(knob, tip, 0.88)]), "none", GRAIN, LD * 0.8, 'opacity="0.45" transform="translate(2.4 1.2)"'))
    g.append('</g>')
    # The fist round the handle: the back of the hand over the handle, four fingers curled round its far side as a
    # stack of knuckles, the thumb hooked over the top across the front.
    gx, gy = grip
    # the fingers wrap round the front of the handle, so the fist is a rounded block over it with the fingers as
    # bands across it (their knuckles the outer edge, a little bulge each), and the thumb hooks over the top
    fist = [(gx - 3.4, gy - 5.4), (gx + 3.0, gy - 5.6), (gx + 4.8, gy - 3.0), (gx + 4.9, gy + 1.4), (gx + 3.8, gy + 5.0), (gx - 0.2, gy + 6.0), (gx - 3.6, gy + 4.6),
            (gx - 4.7, gy + 1.4), (gx - 4.8, gy - 2.6)]
    bat_ang = math.degrees(math.atan2(tip[0] - grip[0], tip[1] - grip[1]))          # the bat leans left going down: the fist turns with it (rotate(+) swings a hanging thing left)
    g.append(f'<g transform="rotate({-bat_ang:.1f} {gx:.1f} {gy:.1f})">')
    g.append(path(smooth_closed(fist, 0.45), "url(#sahurlimb)", INK, LW))
    for k in range(3):                                              # the seams between the four fingers, bowed like knuckles
        fy = gy - 2.4 + k * 2.6
        g.append(path(f"M{gx - 4.5:.1f},{fy + 0.4:.1f} Q{gx - 0.5:.1f},{fy - 0.9:.1f} {gx + 4.5:.1f},{fy + 0.2:.1f}", "none", INK, LD * 0.9, 'opacity="0.8"'))
    g.append(path(f"M{gx - 3.0:.1f},{gy - 4.6:.1f} Q{gx - 1.0:.1f},{gy - 8.0:.1f} {gx + 2.8:.1f},{gy - 7.4:.1f} Q{gx + 5.4:.1f},{gy - 6.8:.1f} {gx + 4.4:.1f},{gy - 3.6:.1f}", WOOD, INK, LD * 0.95))   # the thumb over the top
    g.append('</g>')
    g.append('</g>')
    # the far arm hangs free down the other wall, an open hand at the end
    g.append('<g id="legR" class="leg">')
    # The free arm has an elbow: the forearm (with the hand) is its own group, #foreR, that folds at the elbow (pet.css
    # pivots it there), drawn first with a round end at the elbow; the upper arm goes over it with a round end of its
    # own, so straight it is one arm and bent it shows a rounded joint. The bowl he eats from is drawn into this hand,
    # hidden until the feed hands it over (rig.setBowl), inside #bowllevel, which the rig counter-turns so the bowl
    # stays level however the forearm folds.
    ELBOW_R = (125.2, 108.0); WRIST_R = (124.5, 132.0)
    g.append('<g id="foreR">')
    # (a fill with a round cap at the elbow and no stroke, plus its two side lines from the elbow down, like the upper
    # arm: no stroke anywhere near the joint, so at rest the two are one line and folded the cap rounds the joint)
    fl, fr = limb_sides([ELBOW_R, (125.35, 120.0), WRIST_R], 5.3, 4.0)   # leaves the elbow straight down, the way the upper arm arrives, so the contour has no kink at the joint
    ex_, ey_ = ELBOW_R
    capE = [(ex_ + 2.6 * math.cos(math.radians(a)), ey_ + 2.6 * math.sin(math.radians(a))) for a in range(180, 361, 30)]   # over the top of the elbow, left to right
    g.append(path(smooth_closed(fl + fr[::-1] + capE[::-1], 0.3), "url(#sahurarmR)", "none", 0))
    g.append(path(smooth_open(fl, 0.35), "none", INK, LW))
    g.append(path(smooth_open(fr, 0.35), "none", INK, LW))
    # the bowl: the room's bowl (props.py), a third its size, its rim in the hand
    BK = 0.34; bx0, by0 = WRIST_R[0] + 0.0 - 60 * BK, 150.0 - 32 * BK     # 41 units wide (the 60-unit prop's size at his 1.4x); its rim's centre at (124.5, 150), just past the fingertips: below the hand at rest, on top of the upturned fingers when the forearm folds
    # (two groups, the bowl's inside and food behind the hand and its front wall over the palm, so the hand holds it
    # with the fingertips on the rim; both are counter-turned by the rig and shown together)
    place = f'transform="translate({bx0:.2f} {by0:.2f}) scale({BK})"'
    g.append(f'<g id="bowl" display="none"><g id="bowllevel"><g {place}>')
    g.append(ellipse(60, 32, 50, 12, PLUM, INK0, 2.7))
    def kib(x, y, r, a):
        return f'<g transform="rotate({a} {x} {y})">' + ellipse(x, y, r, r * 0.8, GOLD, INK0, 1.6) + '</g>'
    for gid, pts in (("bowlfood3", ((42, 22, 4.6, 10), (58, 14, 5, -15), (76, 20, 4.6, 25), (50, 15, 4.2, 40), (68, 13, 4, -30), (60, 22, 4, 0), (34, 27, 4, -20), (86, 27, 4, 20))),
                     ("bowlfood2", ((46, 29, 4.4, 15), (62, 27, 4.6, -10), (78, 30, 4.2, 30), (56, 33, 3.8, 5))),
                     ("bowlfood1", ((52, 35, 3.8, -20), (70, 35, 3.6, 20)))):
        g.append(f'<g id="{gid}">' + "".join(kib(*k) for k in pts) + '</g>')
    g.append('</g></g></g>')
    BOWL_FRONT = [path(smooth_closed([(10, 32), (14, 54), (30, 68), (60, 71), (90, 68), (106, 54), (110, 32), (100, 40), (60, 44), (20, 40)], 0.5), PURPLE, INK0, 2.7),
                  path("M10,32 Q60,48 110,32", "none", INK0, 2.7),
                  path(smooth_open([(14, 36), (30, 44), (60, 47), (90, 44), (106, 36)]), "none", LAV, 3.2)]
    # The free hand hangs at his side with the palm toward him, as in the references: seen from the front it is
    # narrow, the back of the hand turning into four fingers hanging together and curling a little in toward the
    # log, the thumb lying along the inside. One outline, the clefts between the visible fingers, a knuckle crease.
    wx = 124.5
    hand = [(wx - 2.5, 130.8), (wx + 2.6, 130.8), (wx + 3.2, 136.5), (wx + 2.9, 141.5), (wx + 1.7, 145.4), (wx - 0.6, 146.2), (wx - 2.7, 144.7), (wx - 3.5, 140.5), (wx - 3.2, 136.5)]
    g.append(path(smooth_closed(hand, 0.45), "url(#sahurarmR)", INK, LW))
    g.append(path(f"M{wx - 3.0:.1f},137.8 Q{wx:.1f},136.6 {wx + 3.0:.1f},137.6", "none", INK, LD * 0.8, 'opacity="0.55"'))                 # the knuckles
    for x0 in (-0.9, 1.0):                                                                                                                # the clefts between the fingers we see
        g.append(path(f"M{wx + x0:.1f},139.2 L{wx + x0 * 1.15:.1f},145.0", "none", INK, LD * 0.8, 'opacity="0.55"'))
    g.append(ellipse(wx - 3.7, 136.4, 1.45, 3.1, WOOD, INK, LD, f'transform="rotate(12 {wx - 3.7:.1f} 136.4)"'))                          # the thumb, along the inside
    g.append(f'<g id="bowlfront" display="none"><g {place}>' + "".join(BOWL_FRONT) + '</g></g>')                                       # the bowl's front wall, over the palm
    # wristbands (item; hidden until worn): a purple sweatband with a white stripe at the wrist (in the forearm: it folds with it)
    g.append('<g id="wristR" display="none">')
    g += EM.sweatband(ELBOW_R, WRIST_R, 0.70, 0.94, 6.6, 1.0)
    g.append('</g>')
    g.append('</g>')  # foreR
    # the upper arm, open along the wall like the other, ending in a round elbow over the forearm's start
    wr = wall_x(SHOULDER_GAP[0], +1); wr2 = wall_x(SHOULDER_GAP[1], +1)
    ex_, ey_ = ELBOW_R
    outerR = [(wr, SHOULDER_GAP[0]), (124.4, 83.5), (127.3, 95.0), (127.9, ey_ + 0.6)]
    innerR = [(wr2, SHOULDER_GAP[1]), (120.9, 87.5), (122.6, 97.0), (122.6, ey_ + 0.6)]
    g.append(path(smooth_open(outerR + innerR[::-1], 0.4), "url(#sahurarmR)", "none", 0))     # the fill, closed by the wall and the elbow (both unlined)
    g.append(path(smooth_open(outerR, 0.4), "none", INK, LW))
    g.append(path(smooth_open(innerR, 0.4), "none", INK, LW))
    armR_d = smooth_open(outerR + innerR[::-1], 0.4) + " Z"
    g.append(f'<clipPath id="sahurarmclipR"><path d="{armR_d}"/></clipPath>')
    # the far sleeve (costume; hidden until worn), over the upper arm, its cuff at the elbow over the forearm
    g.append('<g id="sleeveR" class="robe" display="none"><g clip-path="url(#sahurarmclipR)">')
    g.append(path(poly([(108.0, 76.0), (136.0, 76.0), (136.0, 105.0), (108.0, 105.0)]), HAIR, "none", 0))
    g.append(path(smooth_open([(124.0, 84.0), (125.6, 94.0), (125.2, 102.0)]), "none", INK, 1.0, 'opacity="0.35"'))
    g.append('</g>' + path(smooth_open(outerR, 0.4), "none", INK, LW) + path(smooth_open(innerR, 0.4), "none", INK, LW))
    g.append(path(smooth_closed([(120.0, 103.0), (130.5, 103.0), (134.0, 112.5), (117.0, 113.5)], 0.4), HAIR, INK, LW))
    g.append(path(smooth_closed([(118.5, 110.5), (132.0, 110.0), (134.0, 112.5), (117.0, 113.5)], 0.4), PURPLE, "none", 0))
    g.append('</g>')
    # the bisht's far sleeve (Habibi pack; hidden until worn), its cuff at the elbow over the forearm
    g.append('<g id="bishtsleeveR" class="bisht" display="none"><g clip-path="url(#sahurarmclipR)">')
    g.append(path(poly([(108.0, 76.0), (136.0, 76.0), (136.0, 105.0), (108.0, 105.0)]), HB.BISHT, "none", 0))
    g += HB.sheen([[(124.0, 84.0), (125.6, 94.0), (125.2, 102.0)]], 1.1, 0.55)
    g.append('</g>' + path(smooth_open(outerR, 0.4), "none", INK, LW) + path(smooth_open(innerR, 0.4), "none", INK, LW))
    g.append(path(smooth_closed([(120.0, 103.0), (130.5, 103.0), (134.0, 112.5), (117.0, 113.5)], 0.4), HB.BISHT, INK, LW))
    g += HB.zari([(117.3, 111.8), (125.5, 111.4), (133.7, 111.0)], 3.0, INK, 0.7, 2.6)
    g.append('</g>')
    g.append('<g id="zombieR" class="zombie" display="none">')
    g += stitches((120.5, 97.5), (129.5, 93.5), 3, 4.0)
    g.append('</g>')
    g.append('<g id="wrapR" class="mummy" display="none"><g clip-path="url(#sahurarmclipR)">')
    for (y0, sk) in ((88.0, -1.2), (100.0, 1.2)):
        g += strip([(108.0, y0 + sk), (124.0, y0), (136.0, y0 - sk)], 5.0)
    g.append('</g></g>')
    g.append('<g id="emofitR" class="emofit" display="none"><g clip-path="url(#sahurarmclipR)">')
    g.append(path(poly([(108.0, 74.0), (136.0, 74.0), (136.0, 99.5), (108.0, 97.5)]), EM.TEE, "none", 0))
    g.append(path(smooth_open([(124.4, 86.0), (126.0, 95.0)]), "none", EM.TEE2, 1.0, 'opacity="0.7"'))
    g.append('</g>' + path(smooth_open(outerR, 0.4), "none", INK, LW) + path(smooth_open(innerR, 0.4), "none", INK, LW))
    g.append(path("M108,97.5 L136,99.5", "none", INK, 1.0, 'clip-path="url(#sahurarmclipR)"'))
    g.append('</g>')
    g.append('</g>')
    g.append('</g>')  # arms

    # ---- crown: the cat's crown, the same drawing, sat on the cap and a little askew ----
    cx, cy = 100, 40
    g.append('<g id="crown"><g id="crownlift">')
    g.append(f'<g transform="translate(100.5 {TOP_Y + 1.5}) rotate(-6) scale(0.58) translate({-cx} {-46})">')
    CW = 2.7
    g.append(path(poly([(70, 46), (66, 30), (74, 32), (80, 12), (88, 30), (94, 30), (100, 8),
                        (106, 30), (112, 30), (120, 12), (126, 32), (134, 30), (130, 46)]), GOLD, INK0, CW))
    g.append(path(poly([(70, 46), (130, 46), (132, 38), (68, 38)]), GOLD2, INK0, 1.8))
    for bx, by in ((80, 12), (100, 8), (120, 12)):
        g.append(ellipse(bx, by, 3.4, 3.4, GOLD, INK0, 1.8))
    g.append(ellipse(100, 33, 5, 4.2, RUBY, INK0, 1.8))
    g.append(ellipse(84, 36, 2.6, 2.6, TEAL, INK0, 1.6))
    g.append(ellipse(116, 36, 2.6, 2.6, LEAF, INK0, 1.6))
    for hx, hy, hr in ((98.4, 31.6, 1.3), (83.2, 35.2, 0.8), (115.2, 35.2, 0.8)):
        g.append(circle(hx, hy, hr, WHITE))
    def spark(sid, sx, sy, r):
        return (f'<path id="{sid}" display="none" d="M{sx},{sy-r} L{sx+r*0.22},{sy-r*0.22} L{sx+r},{sy} L{sx+r*0.22},{sy+r*0.22} '
                f'L{sx},{sy+r} L{sx-r*0.22},{sy+r*0.22} L{sx-r},{sy} L{sx-r*0.22},{sy-r*0.22} Z" fill="#FFFFFF" stroke="none"/>')
    g.append(spark("glintL", 80, 12, 7)); g.append(spark("glintC", 100, 8, 10)); g.append(spark("glintR", 120, 12, 7))
    g.append('</g></g></g>')

    # ---- witch hat (costume; hidden until worn): sat on the cap, drawn after the crown so it hides it (a crowned sahur
    # wears the golden hat, as the cat does). The brim overhangs the log; the cone leans back and curls over; the band
    # carries the cat's lavender studs and a gold buckle with a ruby, like the crown. ----
    g.append('<g id="witchhat" display="none"><g transform="rotate(3 100 14)">')
    g.append(path(smooth_closed([(64.0, 20.0), (72.0, 11.0), (86.0, 5.0), (100.0, 3.0), (114.0, 5.0), (128.0, 11.0), (136.0, 20.0), (129.0, 26.0), (114.0, 29.0), (100.0, 30.0), (86.0, 29.0), (71.0, 26.0)], 0.4), HAIR, INK, LW))   # brim
    g.append(ellipse(100.0, 16.0, 26.0, 3.6, CLOTH, "none", 0, 'opacity="0.3"'))                    # the cone seats on the brim
    cone = [(80.0, 13.0), (84.0, -4.0), (91.0, -20.0), (100.0, -34.0), (110.0, -44.0), (122.0, -46.0), (132.0, -42.0), (139.0, -34.0), (142.0, -26.0),
            (138.0, -28.0), (133.0, -35.0), (124.0, -36.0), (117.0, -29.0), (118.0, -18.0), (122.0, -2.0), (126.0, 12.0), (100.0, 18.0)]
    g.append(path(smooth_closed(cone, 0.4), CLOTH, INK, LW))
    g.append(path("M120,-33 Q127,-37 134,-35", "none", INK, 1.3, 'opacity="0.35"'))              # crease under the curl
    g.append(path("M88,-2 Q94,-16 103,-28", "none", LAV, 1.8, 'opacity="0.2"'))                    # edge light
    g.append(path(smooth_closed([(80.0, 13.0), (83.0, 3.0), (100.0, 7.0), (120.0, 3.0), (124.0, 13.0), (100.0, 17.0)], 0.4), INK, INK, 1.6))   # band
    for sx_, sy_ in ((88.0, 9.0), (94.0, 10.5), (108.0, 10.5), (114.0, 9.0)):
        g.append(f'<circle cx="{sx_}" cy="{sy_}" r="1.8" fill="{LAV}" stroke="none"/>')
    g.append(path("M97,6.5 L105,6.2 L105.5,14.5 L97.5,14.8 Z", "none", INK, 3.8))                  # buckle, ink under
    g.append(path("M97,6.5 L105,6.2 L105.5,14.5 L97.5,14.8 Z", "none", GOLD, 2.2))                 # gold over
    g.append(ellipse(101.2, 10.5, 2.2, 2.0, RUBY, INK, 1.0))
    g.append(circle(100.5, 9.8, 0.65, WHITE))
    g.append('</g></g>')

    # halo (dead), sweat, stink lines, z's
    g.append('<g id="halo" display="none">')
    g.append(ellipse(100, 1, 19, 5.2, "none", INK0, 4.6))
    g.append(ellipse(100, 1, 19, 5.2, "none", GOLD, 2.6))
    g.append(path("M86,-0.6 Q91,-4 98,-4.2", "none", WHITE, 1.2, 'opacity="0.8"'))
    g.append('</g>')
    g.append('<g id="sweat" display="none">')
    g.append(path("M70,30 C70,30 65.4,37.8 65.4,41 C65.4,43.8 67.5,45.7 70,45.7 C72.5,45.7 74.6,43.8 74.6,41 C74.6,37.8 70,30 70,30 Z", WHITE, INK, LD + 0.3))
    g.append('</g>')
    g.append(f'<g id="stink" display="none" fill="none" stroke="{LEAF}" stroke-width="2" stroke-linecap="round">')
    g.append('<path class="s s1" d="M70,124 Q73,119 70,114 Q67,109 70,104"/>')
    g.append('<path class="s s2" d="M62,140 Q65,135 62,130 Q59,125 62,120"/>')
    g.append('<path class="s s3" d="M132,120 Q135,115 132,110 Q129,105 132,100"/>')
    g.append('</g>')
    g.append(f'<g id="zzz" display="none" fill="none" stroke="{LAV}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">')
    g.append('<path class="z z1" d="M128,22 L138,22 L128,32 L138,32"/>')
    g.append('<path class="z z2" d="M140,4 L153,4 L140,17 L153,17"/>')
    g.append('<path class="z z3" d="M154,-18 L170,-18 L154,-2 L170,-2"/>')
    g.append('</g>')

    g.append('</g>')  # figure
    body = "\n".join(g).replace("@@PAYOTDEFS@@", "".join(PAYOT_DEFS))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="200" height="230">
<g id="cat" data-character="sahur">
{body}
</g>
</svg>'''

if __name__ == "__main__":
    for a in sys.argv[1:]:
        k, v = a.split("="); P[k] = float(v)
    out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sahur.svg"))
    open(out, "w").write(build())
    print("wrote", out)
