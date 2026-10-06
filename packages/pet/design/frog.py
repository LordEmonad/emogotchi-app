"""Emogotchi's second character -> packages/pet/frog.svg   (working name: inverse brah)

The robed frog from the character sheet (repo root, "inverse brah/"), rigged with the same group ids as
cat.svg so rig.ts drives it without knowing which animal it has: #shadow, #figure, #tail (the cloak's
trailing corner), #body, #legL/#legR (the arms), #footL/#footR, #head, #face, the eyes with their
.open/.pupil/.lid/.closed/.happy/.squeeze/.x parts, the six mouths, #tear, #dirt, #stink, #sweat, #zzz,
#halo and #crown/#crownlift/#glint*. It has no ears, fringe, whiskers or pendant; the rig skips ids it
cannot find.

The geometry is not drawn by eye: frog_ref.py holds the lines traced off the reference, and this file
cuts them into parts that can move. Flat fills, clean black line, no wobble bake (the reference line is
clean). How the joints stay invisible:

  - Head over body. Both are the same green. The head's ink line is open at the neck and its fill dips
    a little into the body; the body runs on up underneath the head. Rotating the head about the neck
    slides its two loose ends along the body's near-vertical sides.
  - The left arm lies on the body and shares the body's outer line exactly (same curve segments), so at
    rest it is only the sleeve line of the reference. The right arm is a whole shape behind the body.
  - The cloak corner (#tail) sits behind the body; the body's line is left open where it joins.

Tunables can be overridden on the CLI:  python3 frog.py lw=2.0 ld=1.1
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import frog_ref as R

# ---- palette: measured off the reference, plus the Emonad accessories shared with the cat ----
INK    = "#000000"
GREEN  = "#5A8E43"
LIP    = "#A05649"
WHITE  = "#FFFFFF"
MAW    = "#3B1718"   # inside of the open mouth
TONGUE = "#D98A80"
TEAR   = "#A9D8F0"
MUD    = "#4A3A24"
GOLD   = "#E8D89B"
GOLD2  = "#D4A646"
RUBY   = "#8B1A2D"
TEAL   = "#2D7D8A"
LEAF   = "#6BB84A"
LAV    = "#EAC6EA"
PINK   = "#E84D7F"
PLUM   = "#502858"
LAV2   = "#B894D8"
PURPLE = "#906096"
GOLD2  = "#D4A646"
PUPIL  = "#281828"
HAIR   = "#502858"   # the witch cloth and the emo hair: the cat's own hair colour
STRAND = "#724278"
# Halloween outfits (items), the cat's colours: pumpkin orange and its candle, mummy linen, zombie stitching and brain
PUMPKIN  = "#F08A24"
PUMPKIN2 = "#C9651A"
FLAME    = "#FFD36B"
MOSS     = "#3E6B2E"
LINEN    = "#EFE6C8"
LINEN2   = "#D9CBA3"
STITCH   = "#111111"   # stitch thread: its own black so a crowned zombie's thread can turn gold by attribute
BRAIN    = "#E9A3B8"
BRAIN2   = "#C97A93"
PATCH    = "#55664F"   # a darker patch of cloth sewn onto the robe
RIP      = "#2E3B2A"
PUMPKIN3 = "#DD7A1F"   # the pumpkin's back lobes, a shade darker than the front

P = {}
def par(k, v):
    P.setdefault(k, v); return P[k]

# ---------------- path helpers ----------------
def _turn(a, b, c):
    v1 = (b[0]-a[0], b[1]-a[1]); v2 = (c[0]-b[0], c[1]-b[1])
    n1 = math.hypot(*v1) or 1; n2 = math.hypot(*v2) or 1
    return math.degrees(math.acos(max(-1, min(1, (v1[0]*v2[0] + v1[1]*v2[1]) / (n1*n2)))))

def segments(pts, closed=False, corner=48):
    """Cubic segments (p1, c1, c2, p2) through pts. Tangents are the non-uniform Catmull-Rom ones, so
    unevenly spaced trace points do not overshoot; a turn sharper than `corner` degrees stays a corner."""
    n = len(pts)
    def at(i): return pts[i % n] if closed else pts[min(max(i, 0), n-1)]
    def reach(i, step, dist=1.0):
        """The neighbour at least `dist` away along the polyline: a corner is judged over that window, so a
        traced corner that comes as two or three tightly spaced points still reads as one corner."""
        j = i; gone = 0.0
        while gone < dist:
            k = j + step
            if not closed and (k < 0 or k > n-1): break
            gone += math.hypot(at(k)[0]-at(j)[0], at(k)[1]-at(j)[1]); j = k
            if closed and (j - i) % n == 0: break
        return at(j)
    def is_corner(i):
        if not closed and (i <= 0 or i >= n-1): return True
        return _turn(reach(i, -1), at(i), reach(i, +1)) > corner
    def tangent(i, toward):
        p0, p1, p2 = at(i-1), at(i), at(i+1)
        d01 = math.hypot(p1[0]-p0[0], p1[1]-p0[1]) or 1; d12 = math.hypot(p2[0]-p1[0], p2[1]-p1[1]) or 1
        tx = d12*(p1[0]-p0[0])/d01 + d01*(p2[0]-p1[0])/d12; ty = d12*(p1[1]-p0[1])/d01 + d01*(p2[1]-p1[1])/d12
        L = math.hypot(tx, ty) or 1
        return (tx/L, ty/L)
    out = []
    for i in range(n if closed else n-1):
        p1, p2 = at(i), at(i+1); L = math.hypot(p2[0]-p1[0], p2[1]-p1[1]) or 1; h = L / 3
        chord = ((p2[0]-p1[0])/L, (p2[1]-p1[1])/L)
        t1 = chord if is_corner(i) else tangent(i, +1)
        t2 = chord if is_corner(i+1) else tangent(i+1, +1)
        out.append((p1, (p1[0] + t1[0]*h, p1[1] + t1[1]*h), (p2[0] - t2[0]*h, p2[1] - t2[1]*h), p2))
    return out

def rev(segs):
    return [(p2, c2, c1, p1) for (p1, c1, c2, p2) in reversed(segs)]

def curve(segs, move=True):
    d = [f"M{segs[0][0][0]:.2f},{segs[0][0][1]:.2f}"] if move else []
    for (_, c1, c2, p2) in segs:
        d.append(f"C{c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}")
    return " ".join(d)

def line_to(p): return f"L{p[0]:.2f},{p[1]:.2f}"
def open_path(pts, corner=48): return curve(segments(pts, False, corner))
def closed_path(pts, corner=48): return curve(segments(pts, True, corner)) + " Z"

def path(d, fill="none", stroke=INK, w=None, extra="", join="round"):
    w = LW if w is None else w
    joins = 'stroke-linejoin="miter" stroke-miterlimit="8"' if join == "miter" else 'stroke-linejoin="round"'
    s = f'stroke="{stroke}" stroke-width="{w}" {joins} stroke-linecap="round"' if stroke != "none" else 'stroke="none"'
    return f'<path d="{d}" fill="{fill}" {s} {extra}/>'

def ellipse(cx, cy, rx, ry, fill, stroke=INK, w=None, extra=""):
    w = LW if w is None else w
    s = f'stroke="{stroke}" stroke-width="{w}"' if stroke != "none" else 'stroke="none"'
    return f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx}" ry="{ry}" fill="{fill}" {s} {extra}/>'

def circle(cx, cy, r, fill):
    return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{fill}"/>'

def poly(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"

def thin_out(pts, eps):
    """Ramer-Douglas-Peucker: drop points that sit within eps of the line through their neighbours."""
    if len(pts) < 3: return list(pts)
    (ax, ay), (bx, by) = pts[0], pts[-1]; L = math.hypot(bx-ax, by-ay) or 1
    d = [abs((bx-ax)*(y-ay) - (by-ay)*(x-ax)) / L for (x, y) in pts[1:-1]]
    k = max(range(len(d)), key=d.__getitem__)
    if d[k] <= eps: return [pts[0], pts[-1]]
    return thin_out(pts[:k+2], eps)[:-1] + thin_out(pts[k+1:], eps)

def lerp(a, b, u):
    return (a[0] + (b[0]-a[0])*u, a[1] + (b[1]-a[1])*u)

def rrect(x, y, w, h, r, fill, stroke=INK, lw=None):
    d = (f"M{x+r},{y} L{x+w-r},{y} Q{x+w},{y} {x+w},{y+r} L{x+w},{y+h-r} Q{x+w},{y+h} {x+w-r},{y+h} "
         f"L{x+r},{y+h} Q{x},{y+h} {x},{y+h-r} L{x},{y+r} Q{x},{y} {x+r},{y} Z")
    return path(d, fill, stroke, lw)

def _bez(p0, c1, c2, p3, t):
    u = 1 - t
    return (u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p3[1])

def _centreline(pts, step=2.0):
    """Sample the smooth curve through pts into a polyline with unit normals."""
    c = []
    for (p0, c1, c2, p3) in segments(pts):
        n = max(4, int(math.hypot(p3[0]-p0[0], p3[1]-p0[1]) / step))
        for k in range(n + 1):
            q = _bez(p0, c1, c2, p3, k / n)
            if not c or q != c[-1]: c.append(q)
    n = len(c); out = []
    for i, (x, y) in enumerate(c):
        x0, y0 = c[max(i-1, 0)]; x1, y1 = c[min(i+1, n-1)]
        tx, ty = x1-x0, y1-y0; L = math.hypot(tx, ty) or 1
        out.append((x, y, -ty/L, tx/L))
    return out

def strip(pts, w, fill=None, crease=True):
    """A bandage: a constant-width strip along pts, outlined, with one crease line down it. Flat ends
    (they are clipped to what they wrap, or hidden under the next strip)."""
    fill = LINEN if fill is None else fill
    c = _centreline(pts)
    left = [(x + nx*w/2, y + ny*w/2) for x, y, nx, ny in c]
    right = [(x - nx*w/2, y - ny*w/2) for x, y, nx, ny in c]
    out = [path(poly(left + right[::-1]), fill, INK, LW)]
    if crease:
        k = max(1, len(c)//5)
        cr = [(x + nx*w*0.18, y + ny*w*0.18) for x, y, nx, ny in c[1::k]]
        if len(cr) > 1: out.append(path(open_path(cr), "none", LINEN2, 1.3, 'opacity="0.9"'))
    return out

def loose_end(pts, w):
    """A bandage end hanging free: tapers a touch and frays at the tip."""
    c = _centreline(pts); n = len(c)
    left = [(x + nx*w*(1 - 0.18*i/(n-1))/2, y + ny*w*(1 - 0.18*i/(n-1))/2) for i, (x, y, nx, ny) in enumerate(c)]
    right = [(x - nx*w*(1 - 0.18*i/(n-1))/2, y - ny*w*(1 - 0.18*i/(n-1))/2) for i, (x, y, nx, ny) in enumerate(c)]
    out = [path(closed_path(left + right[::-1], 60), LINEN, INK, LW)]
    k = max(1, n//4)
    cr = [(x + nx*w*0.16, y + ny*w*0.16) for x, y, nx, ny in c[1::k]]
    if len(cr) > 1: out.append(path(open_path(cr), "none", LINEN2, 1.2, 'opacity="0.9"'))
    tx, ty, nx, ny = c[-1]; bx, by = c[-3][0], c[-3][1]
    for s_ in (-0.3, 0.25):
        out.append(path(f"M{tx + nx*w*s_:.1f},{ty + ny*w*s_:.1f} L{tx + nx*w*s_ + (tx - bx)*0.5:.1f},{ty + ny*w*s_ + (ty - by)*0.5:.1f}", "none", LINEN2, 1.1))
    return out

def stitches(a, b, n=4, tick=4.6, w=1.5):
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
    out = [f'<g transform="rotate({rot} {cx} {cy})">', path(closed_path(lobes, 70), BRAIN, INK, LW)]
    out.append(path(f"M{cx:.1f},{cy-ry*0.5:.1f} Q{cx-rx*0.12:.1f},{cy+ry*0.2:.1f} {cx+rx*0.05:.1f},{cy+ry*0.95:.1f}", "none", BRAIN2, 1.4))
    for (x0, y0, x1, y1, x2, y2) in ((-0.75, -0.2, -0.5, -0.55, -0.25, -0.15), (-0.7, 0.45, -0.45, 0.2, -0.2, 0.55),
                                     (0.25, -0.35, 0.5, -0.65, 0.75, -0.25), (0.25, 0.5, 0.5, 0.15, 0.78, 0.5)):
        out.append(path(f"M{cx+rx*x0:.1f},{cy+ry*y0:.1f} Q{cx+rx*x1:.1f},{cy+ry*y1:.1f} {cx+rx*x2:.1f},{cy+ry*y2:.1f}", "none", BRAIN2, 1.2))
    out.append('</g>')
    return out

def stitched_patch(quad, fill=None):
    """A darker patch sewn on: the patch, then ticks along its top and left edges."""
    fill = PATCH if fill is None else fill
    out = [path(poly(quad), fill, INK, LD + 0.3)]
    for a, b in ((quad[0], quad[1]), (quad[0], quad[3])):
        dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L
        for i in range(4):
            m = lerp(a, b, (i + 0.5)/4)
            out.append(path(f"M{m[0]+nx*2.2:.1f},{m[1]+ny*2.2:.1f} L{m[0]-nx*2.2:.1f},{m[1]-ny*2.2:.1f}", "none", STITCH, 1.3))
    return out


def lens(cx, cy, w, h, angle=0.0, n=28):
    """A carved eye: a lens with pointed ends (two arcs), w wide and h tall, turned by angle degrees."""
    a = math.radians(angle); out = []
    for k in range(n):
        t = 2*math.pi*k/n
        x = (w/2)*math.cos(t); y = (h/2)*math.sin(t)*abs(math.sin(t))**0.55
        out.append((cx + x*math.cos(a) - y*math.sin(a), cy + x*math.sin(a) + y*math.cos(a)))
    return out

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

CAMERA_ARM = -90     # the near arm's angle when it holds the camera up to the face (rig.ts holdCamera uses the same number)

def camera_bits():
    """The press camera from frogprops.py, in its 100x70 box: boxy body, big lens, a flash dish on a bracket. Line
    weights are for the 0.4 scale it is drawn at in the sleeve."""
    W_, D_ = 4.0, 2.6
    g = []
    g.append(path("M76,26 L76,12", "none", INK, 9))
    g.append(path("M76,26 L76,12", "none", LAV2, 4))
    g.append(path("M60,20 C60,6 92,6 92,20 C92,24 86,27 76,27 C66,27 60,24 60,20 Z", LAV, INK, W_))
    g.append(path("M64,18 C66,10 86,10 88,18", "none", WHITE, 3, 'opacity="0.8"'))
    g.append('<g id="cambulb">')
    g.append(ellipse(76, 19, 5.2, 5.2, GOLD, INK, D_))
    g.append(circle(74.5, 17.5, 1.6, WHITE))
    g.append('</g>')
    g.append(rrect(8, 26, 84, 40, 6, PLUM, INK, W_))
    g.append(rrect(14, 20, 34, 9, 3, PUPIL, INK, D_))
    g.append(rrect(19, 13, 11, 8, 2, LAV2, INK, D_))
    g.append(rrect(36, 15, 8, 6, 2, GOLD, INK, D_))
    g.append(path("M14,34 L86,34", "none", "#724278", 4, 'opacity="0.7"'))
    g.append(ellipse(50, 47, 17, 17, LAV, INK, W_))
    g.append(ellipse(50, 47, 12.5, 12.5, PUPIL, INK, D_))
    g.append(ellipse(50, 47, 7, 7, PURPLE, "none", 0))
    g.append(path("M42,42 Q45,36 51,36", "none", WHITE, 3.5, 'opacity="0.85"'))
    g.append(circle(55, 51, 1.8, WHITE))
    g.append(ellipse(80, 50, 4, 4, GOLD2, INK, D_))
    return g

# ---------------- the Jewish pack: the kippah (with its payot) and the Star of David on a chain ----------------
KIPPAH   = "#FDFDFB"   # the kippah's white (pet.css: gold when crowned)
KIPSHADE = "#D5DCEA"   # its shaded side (gold's darker base when crowned)
FLAGBLUE = "#0038B8"   # the flag's blue: the kippah's two stripes and its star, the pendant's inlay
SILVER   = "#DDE3EC"   # the pendant (gold when crowned)
SILVER2  = "#A9B3C4"   # its bevel, bail and chain

def _cap_frame(theta, elev):
    """A cap on a ball, seen from the front: its axis leans `theta` degrees from straight up toward the back of the
    head (screen left) and tips `elev` degrees toward us so its top shows; e1 runs across it along the rim, e2 toward
    us. x right, y up, z toward the viewer."""
    th, el = math.radians(theta), math.radians(elev)
    def rot(v):
        x, y, z = v
        return (x*math.cos(th) - y*math.sin(th), x*math.sin(th) + y*math.cos(th), z)
    return rot((0.0, math.cos(el), math.sin(el))), rot((1.0, 0.0, 0.0)), rot((0.0, -math.sin(el), math.cos(el)))

def _on_cap(fr, rho, beta):
    """The unit normal `rho` radians from the cap's pole, at `beta` round it (0 along e1, 90 degrees toward us)."""
    a, e1, e2 = fr; cr, sr, cb, sb = math.cos(rho), math.sin(rho), math.cos(beta), math.sin(beta)
    return tuple(cr*a[i] + sr*(cb*e1[i] + sb*e2[i]) for i in range(3))

def _sv(C, R, n): return (C[0] + R*n[0], C[1] - R*n[1])

def _front_arc(C, R, fr, rho, n=120):
    """The part of the circle `rho` from the pole that faces us, as svg points from where it comes into view (at the
    ball's own outline) round the front to where it leaves; the whole circle if all of it shows."""
    B = lambda k: 2*math.pi*k/n
    zs = [_on_cap(fr, rho, B(k))[2] for k in range(n)]
    if min(zs) >= 0: return [_sv(C, R, _on_cap(fr, rho, B(k))) for k in range(n + 1)]
    def edge(lo, hi, into_view):
        for _ in range(40):
            mid = (lo + hi) / 2
            if (_on_cap(fr, rho, mid)[2] >= 0) == into_view: hi = mid
            else: lo = mid
        return (lo + hi) / 2
    k0 = next(k for k in range(n) if zs[k-1] < 0 <= zs[k])
    k1 = next(k for k in range(k0, k0 + n) if zs[k % n] >= 0 > zs[(k + 1) % n])
    b0 = edge(B(k0 - 1), B(k0), True); b1 = edge(B(k1 + 1), B(k1), True)
    m = max(10, int((b1 - b0) / (2*math.pi) * n * 0.5))
    return [_sv(C, R, _on_cap(fr, rho, b0 + (b1 - b0)*k/m)) for k in range(m + 1)]

def _cap_outline(C, R, fr, alpha, n=120):
    """What shows of a cap `alpha` radians across on a ball of radius R centred at C: the front of its rim, then over
    the top along the ball's own outline back to where the rim came into view."""
    rim = _front_arc(C, R, fr, alpha, n)
    if math.hypot(rim[0][0] - rim[-1][0], rim[0][1] - rim[-1][1]) < 1e-6: return rim
    ang = lambda p: math.atan2(-(p[1] - C[1]), p[0] - C[0])
    t1, t0, tp = ang(rim[-1]), ang(rim[0]), math.atan2(fr[0][1], fr[0][0])
    ccw = (t0 - t1) % (2*math.pi)
    span = ccw if (tp - t1) % (2*math.pi) < ccw else ccw - 2*math.pi     # the way round that passes over the pole
    m = max(8, int(abs(span) / (2*math.pi) * n * 0.5))
    top = [(C[0] + R*math.cos(t1 + span*k/m), C[1] - R*math.sin(t1 + span*k/m)) for k in range(1, m)]
    return rim + top

def _ring(C, R, fr, rho_in, rho_out):
    """A stripe round the cap between two circles about its pole: the front of each, joined at the ball's outline."""
    return _front_arc(C, R, fr, rho_out) + _front_arc(C, R, fr, rho_in)[::-1]

def _cap_triangle(C, R, fr, rs, off):
    """One of the star's triangles, points `rs` radians from the pole, laid on the ball (edges follow its curve)."""
    v = [_on_cap(fr, rs, math.radians(off + 120*k)) for k in range(3)]
    out = []
    for k in range(3):
        a, b = v[k], v[(k + 1) % 3]
        for j in range(4):
            w = tuple(a[i]*(1 - j/4) + b[i]*j/4 for i in range(3)); L = math.sqrt(sum(c*c for c in w))
            out.append(_sv(C, R, tuple(c/L for c in w)))
    return out

def kippah_on(C, R, theta, elev, alpha, clip_id, cls, hidden=False):
    """The kippah as a cap `alpha` radians across on a ball of radius R centred at C, leaning `theta` and tipped
    `elev` toward us (see _cap_frame): shade under, the lit side toward the upper left, the flag's two stripes where
    the cat's are (0.06-0.15 and 0.22-0.31 of the way from the rim to the top), the flag's Star of David (two
    outlined triangles) round the top with a point to the back, the ink round it all. Returns (clip def, parts)."""
    fr = _cap_frame(theta, elev)
    outline = _cap_outline(C, R, fr, alpha)
    parts = [f'<g class="{cls}"' + (' display="none"' if hidden else '') + '>', pgon(outline, KIPSHADE), f'<g clip-path="url(#{clip_id})">']
    parts.append(pgon(_cap_outline(C, R, _cap_frame(theta + 16.0, elev + 4.0), alpha * 0.9), KIPPAH))
    for (ri, ro) in ((alpha*0.85, alpha*0.94), (alpha*0.69, alpha*0.78)):
        parts.append(pgon(_ring(C, R, fr, ri, ro), FLAGBLUE))
    for off in (-90.0, 90.0):
        parts.append(pgon(_cap_triangle(C, R, fr, alpha * 0.46, off), "none", FLAGBLUE, 1.25, join="miter"))
    parts += ['</g>', pgon(outline, "none", INK, LW), '</g>']
    pts_ = " ".join(f"{x:.1f},{y:.1f}" for x, y in outline)
    return f'<clipPath id="{clip_id}"><polygon points="{pts_}"/></clipPath>', parts

def polyline(pts, close=False):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + (" Z" if close else "")

def pgon(pts, fill, stroke="none", w=0, extra="", join="round"):
    """A <polygon>, not a path: Emotown's thinning (town_lite.py) rewrites every <path>'s points into curves, which
    rounds a star's points off and bulges a cap's rim; polygons it leaves exactly as drawn."""
    pts_ = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    st = f' stroke="{stroke}" stroke-width="{w}" stroke-linejoin="{join}" stroke-miterlimit="8"' if stroke != "none" else ' stroke="none"'
    return f'<polygon points="{pts_}" fill="{fill}"{st}{extra}/>' 

def payah(root, length, turns, r0, r1, w0, w1, stem=5.0, tilt=0.45, lean=0.0, lw=1.0, phase=math.pi):
    """A payot curl, the cat's ringlet on him (cat.py `ringlet`): a lock of hair wound into a corkscrew hanging from
    `root`, a short lock straight down (`stem`), then `turns` turns over `length`, its loops `r0` -> `r1` across and
    the lock `w0` -> `w1` wide. A helix seen a little from above: the half-turns at the back go down first, shaded,
    and the near ones over them, each with a strand of light; the last near half-turn is thinner and ends round.
    Drawn as outlined strokes (the ink a little wider under the hair), not as offset outlines: the lock turns tighter
    than it is wide, and offset edges fold over themselves there into little black ticks. Use turns = n + 0.75 (with
    the default phase) so it ends at the end of a near half-turn. Returns svg pieces."""
    N = int(20 * turns) + 6
    c = [(root[0], root[1], -1.0, 0.0)]
    for k in range(N + 1):
        s_ = k / N
        r = r0 + (r1 - r0)*s_; ph = phase + 2*math.pi*turns*s_
        c.append((root[0] + lean*length*s_ + r*math.sin(ph), root[1] + stem + length*s_ + tilt*r*math.cos(ph), math.cos(ph), s_))
    runs = []; cur = [0]
    for i in range(1, len(c)):
        if (c[i][2] >= 0) == (c[cur[0]][2] >= 0): cur.append(i)
        else: runs.append(cur); cur = [i]
    runs.append(cur)
    last = len(c) - 1
    line = lambda i0, i1: polyline([c[i][:2] for i in range(max(0, i0), min(last, i1) + 1)])
    stroke = lambda d, col, w, cap="round", extra="": f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w:.2f}" stroke-linecap="{cap}" stroke-linejoin="round"{extra}/>'
    back, front = [], []
    for run in runs:
        near = c[run[0]][2] >= 0
        w = w0 + (w1 - w0)*c[(run[0] + run[-1]) // 2][3]
        if run[-1] == last: w *= 0.78                  # the end of the curl, a little finer
        if not near:
            d = line(run[0] - 1, run[-1] + 1)
            back += [stroke(d, INK, w + 2*lw), stroke(d, HAIR, w), stroke(d, INK, w, "round", ' opacity="0.24"')]   # the far side of the curl, in shade
            continue
        # a near half-turn: its ink only over its own span (butt ends; round at the very end), its hair over a little
        # more, so where it turns into the far half behind there is no line across the lock, just the outline running on
        front += [stroke(line(run[0], run[-1]), INK, w + 2*lw, "round" if run[-1] == last else "butt"), stroke(line(run[0] - 1, run[-1] + 1), HAIR, w)]
        pts = [c[i][:2] for i in range(run[0], run[-1] + 1)]
        if len(pts) > 6:   # a strand of light along its upper side
            hl = []
            for j in range(2, len(pts) - 2):
                (x0, y0), (x1, y1) = pts[j - 1], pts[j + 1]; L = math.hypot(x1 - x0, y1 - y0) or 1
                nx, ny = -(y1 - y0)/L, (x1 - x0)/L
                if ny > 0: nx, ny = -nx, -ny
                hl.append((pts[j][0] + nx*w*0.2, pts[j][1] + ny*w*0.2))
            front.append(stroke(polyline(hl), STRAND, max(0.8, w*0.22)))
    return back + front

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

# ---------------- the drawing ----------------
# ---------------- the Habibi pack (items): keffiyeh + agal ----------------
import habibi as HB

def keffiyeh_frog():
    """The keffiyeh on him, in his three-quarter view: the shemagh over the top and the back of his head, its front edge
    across his brow just over both eyes, the face left open down the back of his near eye and cheek, the cloth falling
    down the back of his neck onto his shoulder (behind the near sleeve, which is drawn after the head), a knotted fringe
    at its end. The agal goes round the head over the brow. On the far side the cloth turns round behind the head: a
    little of it shows past the far eye (#keffiyehback, behind the head). Returns (defs, back, front)."""
    OUT = [(60, 112), (57, 96), (57, 80), (59, 64), (63, 48), (69, 34), (78, 22), (90, 13), (104, 9), (120, 9), (135, 12),
           (147, 19), (154, 28), (157.5, 37.5)]
    # the front edge, from the front corner back across the brow over both eyes (dipping between them), then down behind
    # the near eye and the cheek to the neck
    HEM = [(157.5, 37.5), (151, 34.5), (142, 32.5), (132, 32.4), (124, 34.6), (119, 34.8), (113, 33.2), (103, 33.4), (94, 35.5),
           (88, 39.5), (84.5, 46), (83, 55), (83.5, 66), (85.5, 76), (88.5, 86)]
    LOW = [(88.5, 86), (88, 98), (86, 110), (74, 114)]
    ring = OUT + HEM[1:] + LOW[1:]
    d = closed_path(ring, 150)
    # the far side: the cloth hanging down behind his head, past the far eye
    FAR = [(151, 30), (157.5, 37.5), (160.5, 46), (160.5, 56), (157, 63.5), (151, 62), (149, 48)]
    far_d = closed_path(FAR, 150)
    defs = ('<defs id="frogkeffiyehdefs">' + HB.shemagh_pattern("frogkfpat", 5.2, 0.6, 1.1)
            + f'<clipPath id="frogkfclip"><path d="{d}"/></clipPath>'
            + '<clipPath id="frogkfdrapeclip"><rect x="40" y="84" width="60" height="50"/></clipPath>'
            # the face's opening in the cloth: the emo hair shows only there while the keffiyeh is on (pet.css), or its back
            # stuck out past the cloth
            + f'<clipPath id="frogkfhairclip"><path d="{closed_path(HEM + [(88.5, 150), (210, 150), (210, 37.5)], 150)}"/></clipPath></defs>')
    back = ['<g id="keffiyehback" display="none">', path(far_d, HB.KF_WHITE, "none"), path(far_d, "url(#frogkfpat)", "none"),
            path(far_d, HB.KF_SHADE, "none", extra=' opacity="0.22"'), path(far_d, "none", INK, LW), '</g>']
    cloth = [path(d, HB.KF_WHITE, "none"), path(d, "url(#frogkfpat)", "none"), '<g clip-path="url(#frogkfclip)">']
    front = cloth
    # folds: the back of the cloth in shade, a soft band under the agal, creases down the fall onto the shoulder
    front.append(path(closed_path([(57, 60), (66, 58), (74, 72), (76, 96), (72, 114), (56, 114)], 150), HB.KF_SHADE, "none", extra=' opacity="0.16"'))
    front.append(path(closed_path([(60, 38), (100, 26), (156, 26), (156, 33), (100, 33), (62, 46)], 150), HB.KF_SHADE, "none", extra=' opacity="0.12"'))
    for crease in ([(66, 70), (68, 90), (66, 110)], [(76, 76), (79, 96), (78, 112)]):
        front.append(path(open_path(crease, 150), "none", HB.KF_RED2, 0.9, extra=' opacity="0.3"'))
    # the edge band just inside the front edge, all along it
    front.append(path(HB.band_d(HB.offset_open(HEM, 2.6), 2.3), HB.KF_RED, "none"))
    front.append(path(open_path(HB.offset_open(HEM, 5.0), 150), "none", HB.KF_RED, 0.8))
    # the agal, round the head over the brow (its front half, clipped to the cloth so its ends go round the sides)
    ab, af = HB.agal(108, 25.5, 52, 7.5, 6.2, INK, LW, rot=-6, back_from=0, back_to=0)
    cloth += af
    cloth.append('</g>')
    cloth.append(path(d, "none", INK, LW))
    front = ['<g id="keffiyeh" display="none">'] + cloth + ['</g>']
    # the fall of the cloth onto his shoulder, again, drawn AFTER the arms: the near sleeve comes out from under it (with the
    # head's layer alone, the sleeve's flat top lay across the cloth). The same drawing cut below the neck, so the two meet
    # with no seam.
    drape = ['<g id="keffiyehdrape" display="none"><g clip-path="url(#frogkfdrapeclip)">'] + cloth
    drape += HB.tassels([(60, 112), (68, 114.5), (78, 114.5)], 3, 7, INK, 0.9, 7)
    drape.append('</g></g>')
    return defs, back, front, drape

# ---------------- the emo pack (DEV only until it is an item; /emopack): beanie, emo clothes, wristbands, eyeliner ----------------
import emo as EM

# The beanie on him, in his three-quarter view. Its lower edge (the cuff's fold) lies across his brow just over both eyes
# (they stay whole: the eyes are the frok), dips a little into the cleft between them, and wraps round the side of his
# head to the back. The cuff is a band 10.5 tall above that edge; the knit rises from it well over the top of his head and
# slouches back, a soft bag hanging down behind his head. Front to back.
FROG_BN_EDGE = [(154.5, 35.0), (149.0, 30.8), (141.0, 29.2), (131.0, 30.0), (125.0, 31.6), (119.0, 30.4), (110.0, 29.4), (100.0, 30.2), (92.0, 32.4),
                (84.5, 36.5), (77.5, 42.0), (70.5, 48.5), (64.5, 55.0)]
FROG_BN_CUFF = 10.5

def beanie_frog():
    """The beanie on him: a black knit slouch beanie (FROG_BN_EDGE), its ribbed cuff across his brow with a broken-heart patch
    over his near eye, and under it his emo hair in BLACK: chunky pointed locks swept down over the far eye from under the
    cuff and a few at the back of his head; the near eye stays clear. One group in the head unit (#beanie: the hair, then
    the hat); pet.css hides the emo hair item under it. Returns (defs, front)."""
    edge = FROG_BN_EDGE
    # the cuff's top: the edge moved up (and back, at the side of his head) by the cuff's height
    top = []
    for i, (x, y) in enumerate(edge):
        x0, y0 = edge[max(i - 1, 0)]; x1, y1 = edge[min(i + 1, len(edge) - 1)]
        tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1
        nx, ny = -ty / m, tx / m          # (the run goes front to back, right to left: this side is up)
        if ny > 0: nx, ny = -nx, -ny
        top.append((x + nx * FROG_BN_CUFF, y + ny * FROG_BN_CUFF))
    # the knit over the top: from the cuff's front corner up over his head, the slouch hanging out behind, down to the
    # cuff's back corner
    crown = [(156.0, 23.0), (155.0, 11.5), (150.0, 1.5), (141.5, -6.5), (128.0, -11.0), (112.0, -12.5), (96.0, -11.0), (81.5, -6.5), (69.0, 0.5),
             (58.5, 9.5), (50.5, 20.0), (46.5, 31.0), (47.5, 41.0), (52.5, 48.5), (58.5, 51.5)]
    hat_d = closed_path(edge + crown[::-1], 140)
    cuff_d = closed_path(edge + top[::-1], 140)
    # the hair under it: chunky locks hanging from under the cuff, the long ones over the far eye
    hair = [(129.0, 31.0), (127.5, 41.0), (125.0, 62.0), (119.5, 53.5), (114.5, 64.5), (109.0, 54.5), (103.0, 63.0), (98.0, 53.0), (92.0, 59.5), (88.0, 47.0),
            (81.5, 53.5), (79.0, 44.5), (72.0, 55.0), (70.0, 47.5), (63.0, 58.0), (63.5, 52.0), (72.0, 44.0), (84.0, 34.0), (100.0, 29.0), (118.0, 28.5)]
    hair_d = closed_path(hair, 40)
    defs = (f'<defs id="frogbeaniedefs"><clipPath id="frogbeanieclip"><path d="{hat_d}"/></clipPath><clipPath id="frogbeaniecuffclip"><path d="{cuff_d}"/></clipPath>'
            f'<clipPath id="frogbeaniehairclip"><path d="{hair_d}"/></clipPath>{EM.checker_pattern("frogemocheck", 3.0, 18)}</defs>')
    front = ['<g id="beanie" display="none">', path(hair_d, EM.HAIRB, INK, LW), '<g clip-path="url(#frogbeaniehairclip)">']
    # strands down each lock, with the sweep's lean
    for (x0, y0, x1, y1) in ((125.0, 33.0, 123.5, 56.0), (119.0, 33.0, 117.0, 58.0), (113.5, 32.0, 112.0, 57.0), (107.5, 32.5, 105.0, 55.0), (101.5, 33.0, 99.5, 55.0),
                             (95.5, 35.0, 92.5, 52.0), (89.0, 38.0, 86.0, 50.0), (81.5, 42.0, 79.0, 51.0), (74.0, 47.0, 71.5, 53.0)):
        front.append(path(open_path([(x0, y0), ((x0 + x1) / 2 - 1.5, (y0 + y1) / 2), (x1, y1)]), "none", EM.HAIRB2, 1.3))
    front.append('</g>')
    # the knit: black, a soft light over its upper back, ribs running up from the cuff and back into the slouch
    front.append(path(hat_d, EM.KNIT, "none"))
    front.append('<g clip-path="url(#frogbeanieclip)">')
    front.append(path(closed_path([(84.0, -2.0), (98.0, -8.0), (118.0, -10.5), (130.0, -9.0), (116.0, -6.0), (100.0, -4.0), (88.0, 0.5)], 60), EM.KNIT2, "none", extra=' opacity="0.5"'))
    front += EM.knit_ribs(top, crown, 17, 0.95, reach=0.9, bow=0.05)
    # (no crease line along the slouch: the operator wants only the knit's ribs on it)
    front.append('</g>')
    # the cuff: a folded band, darker under its fold, short ribs across it
    front.append(path(cuff_d, EM.KNIT, "none"))
    front.append('<g clip-path="url(#frogbeaniecuffclip)">')
    front.append(path(open_path([(x + (ux - x) * 0.86, y + (uy - y) * 0.86) for (x, y), (ux, uy) in zip(edge, top)], 140), "none", EM.KNITD, 2.8, ' opacity="0.9"'))
    front += EM.cuff_ribs(edge, top, 3.0)
    front.append('</g>')
    front.append(path(open_path(top, 140), "none", INK, 1.3))     # the fold's edge
    front.append(path(hat_d, "none", INK, LW))
    front += EM.broken_heart(141.0, 26.8, 10.5, rot=-6, lw=0.9)   # the patch on the cuff, over his near eye
    front.append('</g>')
    return defs, front

def build():
    global LW, LD
    LW = par("lw", 1.55)    # contour ink, as measured off the reference
    LD = par("ld", 0.75)    # only used for the faces the reference does not show (closed eyes, the tongue)
    S = list(R.SIL)
    # the cleft between the two bumps of the head is a sharp V in the reference (the brow's crease starts in it);
    # the trace rounds its bottom over two points, so they are put back together as one corner
    cleft = [i for i, p in enumerate(S) if abs(p[0] - 116.4) < 1.6 and abs(p[1] - 21.9) < 1.0]
    if len(cleft) == 2: S[cleft[0]:cleft[1] + 1] = [((S[cleft[0]][0] + S[cleft[1]][0]) / 2, S[cleft[0]][1] + 0.5)]
    N = len(S)
    g = []

    def near(pt): return min(range(N), key=lambda i: (S[i][0]-pt[0])**2 + (S[i][1]-pt[1])**2)
    SEG = segments(S, closed=True)                      # SEG[i] is the curve from S[i] to S[i+1]: the one true outline
    def sil(i, j):
        """The outline's own curve segments from landmark i forward (clockwise, as traced) to landmark j."""
        out = []
        while i != j: out.append(SEG[i]); i = (i + 1) % N
        return out
    def cut(seg, t):
        """de Casteljau: split one cubic at t."""
        p0, p1, p2, p3 = seg; q0 = lerp(p0, p1, t); q1 = lerp(p1, p2, t); q2 = lerp(p2, p3, t); r0 = lerp(q0, q1, t); r1 = lerp(q1, q2, t); m = lerp(r0, r1, t)
        return (p0, q0, r0, m), (m, r1, q2, p3)

    # ---- cut the traced silhouette into parts. Landmarks are found by position, so a re-trace keeps working. ----
    iNECK_L, iNECK_R = near((70.1, 79.3)), near((125.9, 91.1))     # where the head's line meets the body's, back and front
    iNOTCH = near((64.9, 168.9))                                   # the little step where the sleeve ends and the cloak flares
    iHEM_END = near((73.2, 191.9))                                 # the hem, left of the left foot, where the cloak corner starts
    iARMR_A, iARMR_B = near((126.1, 100.0)), near((125.9, 171.6))  # the right arm's outer line leaves the body and comes back
    NOTCH, HEM_END, NECK_L, NECK_R = S[iNOTCH], S[iHEM_END], S[iNECK_L], S[iNECK_R]

    # Every part that shares a stretch of outline uses the outline's own segments for it, so where two parts meet
    # their lines are the same curve, tangent and all: no kink at the neck, no doubled line down the sleeve.
    # The mouth is part of the outline: the lips make the front of the snout. So the head's own line stops at the
    # nose and starts again under the chin, and every mouth shape brings its own piece of profile between them.
    iSNOUT_A, iSNOUT_B = near((149.8, 71.8)), near((141.7, 83.0))
    head_segs = sil(iNECK_L, iSNOUT_A) + sil(iSNOUT_B, iNECK_R)
    snout_segs = sil(iSNOUT_A, iSNOUT_B)
    # unseen: the head's fill dips into the body. It leaves both ends of the neck sideways first, so it never lies
    # over the body's own line just below the neck (that would shave the line to half its weight there).
    head_dip = [(NECK_R[0] - 2.6, NECK_R[1] + 0.2), (121.0, 93.6), (115.0, 93.4), (96.0, 92.2), (81.0, 90.2), (75.0, 86.5), (NECK_L[0] + 2.6, NECK_L[1] + 0.3)]

    back_segs = sil(iNOTCH, iNECK_L)                                 # the body's back, bottom to top
    # the front: neck, the body's edge past the right arm, the rounded hem corner, the hem across both feet
    lower_right = [(125.6, 177.0), (124.4, 181.7), (122.7, 185.4)]
    hem = [(120.4, 188.1), (118.2, 189.8), (114.3, 190.8), (106.6, 190.8), (102.0, 190.1), (99.0, 189.6), (93.4, 189.6), (89.4, 190.6),
           (86.7, 192.1), (83.6, 193.1), (79.0, 193.3), (75.5, 192.9)]
    front_pts = [S[(iNECK_R - 1) % N], NECK_R, S[iARMR_A]] + R.BODY_EDGE_R + [S[iARMR_B]] + lower_right + hem + [HEM_END]
    front_segs = segments(front_pts)[1:]                            # the first point only sets the tangent at the neck to the outline's
    # unseen: the body carries on up under the head, with short stubs of line so a lifted head never bares an unlined neck
    top_r = [(124.9, 84.6), (121.5, 79.5), (114.0, 76.5)]
    # the left arm lies on the body: the sleeve line of the reference, and the body's own back line from the sleeve's top down to the notch
    def at_y(seg, y):
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2; ym = cut(seg, mid)[0][3][1]
            if (ym > y) == (seg[0][1] > seg[3][1]): lo = mid
            else: hi = mid
        return (lo + hi) / 2
    up = cut(SEG[iNECK_L], 0.4)[0]                                 # the outline itself for a short way above the neck, then in under the head
    top_l = [up[3], (72.4, 71.0), (78.0, 69.0)]
    y_arm = R.ARM_L[-1][1]
    k = next(i for i, sg in enumerate(back_segs) if min(sg[0][1], sg[3][1]) <= y_arm <= max(sg[0][1], sg[3][1]))
    arm_outer = back_segs[:k] + [cut(back_segs[k], at_y(back_segs[k], y_arm))[0]]      # NOTCH up to level with the sleeve's top
    sleeve = R.ARM_L[::-1]                                                  # top to bottom
    arm_line = curve(segments(sleeve)) + " " + line_to(NOTCH) + " " + curve(arm_outer, move=False)
    arm_fill = arm_line + " Z"
    # the right arm hangs behind the body: its outer line is the outline, the rest is hidden by the body
    armR_d = curve(sil(iARMR_A, iARMR_B)) + " " + curve(segments([S[iARMR_B], (122.5, 172.6), (119.5, 166.0), (118.5, 140.0), (119.5, 112.0), (121.8, 102.0), S[iARMR_A]]), move=False) + " Z"

    # The cloak's trailing corner. The reference crops its very tip at the picture's edge; the two edges are run on
    # to where they meet. Only the last stretch of the tip is the rigged #tail (it flutters; a whole corner swinging
    # like a paddle looked wrong); the rest of the corner is drawn with the body, which also covers the tip's base.
    corner = [SEG[i][0] for i in range(iHEM_END, iNOTCH)] + [NOTCH]            # hem end, the cropped tip, up to the notch
    xcut = min(p[0] for p in corner) + 0.4
    low_edge = [p for p in corner[:len(corner)//2] if p[0] > xcut]; top_edge = [p for p in corner[len(corner)//2:] if p[0] > xcut]
    cloak = top_edge[::-1] + [(53.7, 181.5), (52.9, 182.3), (53.6, 183.0)] + low_edge[::-1]      # NOTCH .. tip .. HEM_END
    cloak_segs = segments(cloak)
    TIP_X = 61.5
    def x_cut(seg, x):
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2; xm = cut(seg, mid)[0][3][0]
            if (xm > x) == (seg[0][0] > seg[3][0]): lo = mid
            else: hi = mid
        return (lo + hi) / 2
    kt = next(i for i, sg in enumerate(cloak_segs) if min(sg[0][0], sg[3][0]) <= TIP_X <= max(sg[0][0], sg[3][0]))
    kb = next(i for i in range(len(cloak_segs) - 1, -1, -1) if min(cloak_segs[i][0][0], cloak_segs[i][3][0]) <= TIP_X <= max(cloak_segs[i][0][0], cloak_segs[i][3][0]))
    top_run = cloak_segs[:kt] + [cut(cloak_segs[kt], x_cut(cloak_segs[kt], TIP_X))[0]]          # NOTCH out to the tip's base, top edge
    low_run = [cut(cloak_segs[kb], x_cut(cloak_segs[kb], TIP_X))[1]] + cloak_segs[kb + 1:]      # tip's base back to HEM_END, lower edge
    tip_segs = [cut(cloak_segs[kt], x_cut(cloak_segs[kt], TIP_X))[1]] + cloak_segs[kt + 1:kb] + [cut(cloak_segs[kb], x_cut(cloak_segs[kb], TIP_X))[0]]
    tip_top, tip_low = tip_segs[0][0], tip_segs[-1][3]

    # feet: placed by hand on the traced toes, because the reference's toes are straight-edged and come to points.
    # Each ends in a stub that runs up under the robe, so a dangling foot never shows a gap.
    footL = [(89.5, 191.3), (91.6, 197.0), (93.6, 201.4), (94.9, 205.6), (95.4, 208.9), (88.2, 201.9), (83.6, 211.4), (76.3, 205.0), (73.0, 206.7), (72.95, 192.2),
             (78.5, 190.4), (79.0, 185.0), (88.6, 184.0)]
    footR = [(119.9, 189.5), (126.2, 193.4), (130.5, 197.6), (123.7, 197.4), (123.9, 199.0), (126.4, 203.4), (128.1, 207.5), (123.0, 206.2), (116.9, 203.1),
             (115.4, 203.2), (115.5, 204.7), (116.1, 205.9), (108.9, 200.8), (101.5, 194.6), (99.6, 192.3), (99.0, 190.1), (100.5, 183.0), (118.8, 183.0)]
    armR_in = [S[iARMR_B], (120.6, 176.4), (118.6, 163.0), (118.5, 140.0), (119.5, 112.0), (121.8, 102.0), S[iARMR_A]]   # the sleeve's end comes to a point, like the near arm's

    def body_block(g, M=lambda p: p, ids=True, arms=None):
        """The whole body (cloak tip, feet, robe, moon) with every point through M. With ids=False it is a plain
        copy: the squeezed body, drawn once with the robe pinched, so nothing has to be rigged twice. The two arms
        go into `arms` (a separate list): they are drawn *after* the head, in their own group, so a raised arm is
        in front of his face; the rig moves that group with the body."""
        arms = g if arms is None else arms
        ms = lambda segs: [tuple(M(p) for p in seg) for seg in segs]
        mp = lambda pts: [M(p) for p in pts]
        RIGGED_SQ = ("legL", "legR", "robeback", "sleeveL", "sleeveR", "yoke", "mummybody", "wrapL", "wrapR", "zombiebody", "zombieL", "davidstar",
                     "bishtback", "bisht", "bishtsleeveL", "bishtsleeveR",
                     "emofitback", "emofit", "emofitL", "emofitR", "emofitfootL", "emofitfootR", "wristL", "wristR")   # the pinched copy's arms are rigged too (flung out), and it wears the costume
        I = lambda name: f' id="{name}"' if ids else (f' id="{name}sq"' if name in RIGGED_SQ else '')
        tip = ms(tip_segs); tt = tip[0][0]
        # The witch robe's cape (costume; hidden until worn), behind everything, as the cat's: it hangs from his
        # shoulders out past his robe on both sides to a wavy hem below his own, lining down its edges, stars on
        # the back panel. His green robe, his moon and his sleeves' ends stay in view in front of it.
        g.append(f'<g{I("robeback")} class="robe" display="none">')
        def star(cx, cy, r):
            return path(f"M{cx},{cy-r} L{cx+r*0.28},{cy-r*0.28} L{cx+r},{cy} L{cx+r*0.28},{cy+r*0.28} L{cx},{cy+r} "
                        f"L{cx-r*0.28},{cy+r*0.28} L{cx-r},{cy} L{cx-r*0.28},{cy-r*0.28} Z", LAV, "none", 0, 'opacity="0.85"')
        # (its back hem lifts clear of the cloak tip, which hangs out past it over the room: a black line on the dark
        # cloth vanished, and the tip looked covered)
        # a short cape: its hem sits at his waist on both sides, above the cloak tip and clear of his own hem
        g.append(path(closed_path(mp([(72.0, 82.0), (54.0, 94.0), (40.0, 120.0), (35.0, 146.0), (40.0, 164.0), (52.0, 160.0), (66.0, 166.0), (80.0, 160.0), (96.0, 166.0),
                                      (112.0, 160.0), (128.0, 166.0), (142.0, 160.0), (148.0, 144.0), (146.0, 124.0), (140.0, 108.0), (132.0, 92.0), (126.0, 88.0)]), 36), PUPIL, INK, LW))
        g.append(path(open_path(mp([(52.0, 100.0), (42.0, 126.0), (37.0, 146.0), (40.0, 162.0)])), "none", PURPLE, 3.4, 'opacity="0.75"'))     # lining, back edge
        g.append(path(open_path(mp([(134.0, 100.0), (143.0, 122.0), (147.0, 144.0), (143.0, 160.0)])), "none", PURPLE, 3.0, 'opacity="0.65"'))  # lining, front edge
        for (sx, sy, sr) in ((45.0, 130.0, 2.8), (44.0, 152.0, 2.0), (144.0, 136.0, 1.8)):
            mx, my = M((sx, sy)); g.append(star(mx, my, sr))
        for pts in ([(64.0, 96.0), (56.0, 82.0), (62.0, 72.0), (74.0, 80.0), (80.0, 96.0)], [(126.0, 100.0), (132.0, 84.0), (140.0, 78.0), (138.0, 92.0), (124.0, 102.0)]):   # the collar's flaps, standing up behind the head
            g.append(path(closed_path(mp(pts), 60), PUPIL, INK, LW))
        g.append('</g>')
        # The bisht's cloak (item; hidden until worn), behind everything like the witch's cape but long: from his shoulders
        # to just above his hem, out past his back and his front; its front edge, where it shows past his chest, in gold.
        g.append(f'<g{I("bishtback")} class="bisht" display="none">')
        # (close to him: the operator found the first, flared one stuck out too far)
        g.append(path(closed_path(mp([(72.0, 82.0), (61.0, 91.0), (54.0, 116.0), (51.0, 146.0), (50.5, 172.0), (53.0, 186.0), (62.0, 190.0), (90.0, 192.0),
                                      (122.0, 191.0), (134.5, 186.5), (138.5, 168.0), (139.0, 140.0), (137.0, 114.0), (133.0, 98.0), (126.0, 88.0)]), 36), HB.BISHT, INK, LW))
        g += HB.sheen([mp([(57.0, 120.0), (53.5, 146.0), (53.5, 176.0)]), mp([(135.5, 124.0), (136.5, 150.0), (135.5, 176.0)])], 1.4, 0.55)
        g += HB.zari(mp([(131.5, 101.0), (135.0, 118.0), (136.6, 144.0), (136.3, 168.0), (133.2, 184.5)]), 3.2, INK, 0.8, 3.2)
        g.append('</g>')
        # The emo hoodie's hood (item; hidden until worn), bunched behind the back of his neck, under everything
        g.append(f'<g{I("emofitback")} class="emofit" display="none">')
        g.append(path(closed_path(mp([(84.0, 82.0), (74.0, 76.0), (62.0, 76.0), (54.0, 84.0), (52.5, 96.0), (57.0, 106.0), (66.0, 109.0), (72.0, 100.0), (76.0, 92.0)]), 50), EM.TEE, INK, LW))
        g.append(path(open_path(mp([(78.0, 80.0), (66.0, 80.0), (58.5, 88.0), (58.0, 99.0)])), "none", EM.TEE2, 2.4, ' opacity="0.8"'))     # its lining's edge, in the light
        g.append(path(open_path(mp([(72.0, 88.0), (63.0, 92.0), (62.0, 101.0)])), "none", INK, 0.9, ' opacity="0.5"'))
        g.append('</g>')
        g.append(f'<g{I("tail")}>')
        g.append(path(curve(tip) + " " + line_to(M((TIP_X + 6, tip_low[1] - 1))) + " " + line_to(M((TIP_X + 6, tip_top[1] + 1))) + " Z", GREEN, "none"))
        g.append(path(curve(tip)))
        g.append('</g>')
        for fid, pts in (("footL", footL), ("footR", footR)):
            g.append(f'<g{I(fid)} class="foot">')
            g.append(path(closed_path(mp(pts), 30), WHITE, join="miter"))      # the reference's toes come to points
            # emo clothes (item; hidden until worn): checkered slip-ons, the foot's own shape in a black-and-white check
            g.append(f'<g{I("emofit" + fid)} class="emofit" display="none">')
            g.append(path(closed_path(mp(pts), 30), "url(#frogemocheck)", "none"))
            g.append(path(closed_path(mp(pts), 30), "none", INK, LW, join="miter"))
            g.append('</g>')
            g.append('</g>')
        # The right arm is mirrored twice (once outside the rigged group, once inside), which leaves the drawing
        # where it is but turns the rig's rotation round: a swipe then swings this arm out from behind the body
        # toward what it is swiping at, instead of further in behind the robe where nobody would see it.
        MX = 'transform="translate(248 0) scale(-1 1)"'
        arms.append(f'<g {MX}><g{I("legR")} class="leg"><g {MX}>')
        armR = curve(ms(sil(iARMR_A, iARMR_B))) + " " + curve(ms(segments(armR_in)), move=False) + " Z"
        # its outer line, and its inner edge as a sleeve line running up from the cuff and ending open below the
        # shoulder, like the near arm's; the top of the shape, where it meets the body, is not inked: it goes into green
        armR_edge = curve(ms(sil(iARMR_A, iARMR_B))) + " " + curve(ms(segments(armR_in[:-1])))
        arms.append(path(armR, GREEN, "none"))
        arms.append(path(armR_edge))
        # the far sleeve of the witch robe (costume; hidden until worn): the upper arm in the robe's cloth with a
        # lining cuff, the arm's own end left showing, as the cat's sleeves leave its paws
        clipR = "armclipR" if ids else "armclipRsq"
        arms.append(f'<g{I("sleeveR")} class="robe" display="none"><clipPath id="{clipR}"><path d="{armR}"/></clipPath><g clip-path="url(#{clipR})">')
        x0, x1 = M((114.0, 0))[0], M((134.0, 0))[0]
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 99.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 150.0))[1] - M((0, 99.0))[1]:.1f}" fill="{HAIR}"/>')
        arms.append(path(open_path(mp([(127.5, 104.0), (129.0, 126.0), (129.0, 146.0)])), "none", INK, 1.2, 'opacity="0.35"'))   # a fold
        arms.append('</g>' + path(armR_edge))
        # the bell cuff: wider than the arm, lining showing inside its mouth (this arm pivots on a fixed point, so it may flare)
        arms.append(path(closed_path(mp([(117.5, 138.0), (129.5, 138.0), (135.5, 152.5), (111.5, 153.5)]), 40), HAIR, INK, LW))
        arms.append(path(closed_path(mp([(113.5, 150.0), (133.5, 149.5), (135.5, 152.5), (111.5, 153.5)]), 40), PURPLE, "none", 0))
        arms.append('</g>')
        # the bisht's far sleeve (item; hidden until worn): the upper arm in its wool, a wide cuff with gold at its mouth
        bclipR = "bishtclipR" if ids else "bishtclipRsq"
        arms.append(f'<g{I("bishtsleeveR")} class="bisht" display="none"><clipPath id="{bclipR}"><path d="{armR}"/></clipPath><g clip-path="url(#{bclipR})">')
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 99.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 150.0))[1] - M((0, 99.0))[1]:.1f}" fill="{HB.BISHT}"/>')
        arms += HB.sheen([mp([(127.5, 104.0), (129.0, 126.0), (129.0, 144.0)])], 1.3, 0.55)
        arms.append('</g>' + path(armR_edge))
        arms.append(path(closed_path(mp([(117.5, 138.0), (129.5, 138.0), (135.5, 152.5), (111.5, 153.5)]), 40), HB.BISHT, INK, LW))
        arms += HB.zari(mp([(112.2, 151.0), (123.5, 150.6), (134.8, 150.2)]), 3.6, INK, 0.8, 3.0)
        arms.append('</g>')
        # emo clothes (item; hidden until worn): the hoodie's far sleeve, black to its ribbed cuff, the arm's own end showing
        eclipR = "emoclipR" if ids else "emoclipRsq"
        arms.append(f'<g{I("emofitR")} class="emofit" display="none"><clipPath id="{eclipR}"><path d="{armR}"/></clipPath><g clip-path="url(#{eclipR})">')
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 99.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 147.0))[1] - M((0, 99.0))[1]:.1f}" fill="{EM.TEE}"/>')
        arms.append(path(open_path(mp([(127.5, 104.0), (129.0, 126.0), (129.0, 138.0)])), "none", EM.TEE2, 1.6, 'opacity="0.8"'))
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 140.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 147.0))[1] - M((0, 140.0))[1]:.1f}" fill="{EM.KNITD}"/>')
        for xx in range(114, 136, 3):
            a_, b_ = M((xx, 140.6)), M((xx, 146.4)); arms.append(path(f"M{a_[0]:.1f},{a_[1]:.1f} L{b_[0]:.1f},{b_[1]:.1f}", "none", EM.KNIT2, 0.8, 'opacity="0.8"'))
        arms.append('</g>' + path(armR_edge))
        arms.append('</g>')
        # wristbands (item; hidden until worn): a purple sweatband with a white stripe at the far sleeve's end, cut to the arm
        wbR = "wristclipR" if ids else "wristclipRsq"
        arms.append(f'<g{I("wristR")} display="none"><clipPath id="{wbR}"><path d="{armR}"/></clipPath><g clip-path="url(#{wbR})">')
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 139.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 148.0))[1] - M((0, 139.0))[1]:.1f}" fill="{EM.BAND}"/>')
        arms.append(path(f"M{x0:.1f},{M((0, 143.5))[1]:.1f} L{x1:.1f},{M((0, 143.5))[1]:.1f}", "none", EM.BAND2, 2.4))
        arms.append('</g>')
        arms.append(path(f"M{x0:.1f},{M((0, 139.0))[1]:.1f} L{x1:.1f},{M((0, 139.0))[1]:.1f} M{x0:.1f},{M((0, 148.0))[1]:.1f} L{x1:.1f},{M((0, 148.0))[1]:.1f}", "none", INK, 1.0, f'clip-path="url(#{wbR})"'))
        arms.append(path(armR_edge))
        arms.append('</g>')
        # mummy (costume; hidden until worn): two bandages round the far arm, cut to the arm's shape
        wclipR = "wrapclipR" if ids else "wrapclipRsq"
        arms.append(f'<g{I("wrapR")} class="mummy" display="none"><clipPath id="{wclipR}"><path d="{armR}"/></clipPath><g clip-path="url(#{wclipR})">')
        for (y0, sk) in ((113.0, 2.0), (137.0, -2.0)):
            arms += strip(mp([(108.0, y0 + sk), (124.0, y0), (140.0, y0 - sk)]), 9)
        arms.append('</g></g>')
        arms.append('</g></g></g>')
        # low_run is traced from the tip's base back to the hem's end; the outline arrives at the hem's end going the
        # other way, so it is reversed here (drawn forwards it started its first curve from the wrong point and left
        # a small spike where the corner meets the hem)
        front, low, top, back = ms(front_segs), ms(rev(low_run)), ms(top_run), ms(back_segs)
        g.append(path(curve(front) + " " + curve(low, move=False) + " " + line_to(tt) + " " + curve(rev(top), move=False) + " " + curve(back, move=False)
                      + " " + " ".join(line_to(p) for p in mp(top_l + top_r[::-1])) + " Z", GREEN, "none"))
        g.append(path(curve(ms([up])) + " " + curve(ms(segments(top_l)), move=False)))
        g.append(path(curve(ms(segments([NECK_R] + top_r)))))
        g.append(path(curve(rev(top)) + " " + curve(back, move=False)))          # the corner's top edge in to the notch, then up the back
        g.append(path(curve(front) + " " + curve(low, move=False)))              # down the front, along the hem, out along the corner's lower edge
        # zombie (costume; hidden until worn): a darker patch sewn onto the robe, rips torn up from the hem
        g.append(f'<g{I("zombiebody")} class="zombie" display="none">')
        g += stitched_patch(mp([(101.0, 150.0), (124.0, 152.5), (122.0, 174.0), (98.5, 171.5)]))
        for (x0, x1, x2, yt) in ((82.5, 85.5, 89.0, 179.0), (105.0, 108.0, 111.0, 181.5)):
            g.append(path(poly(mp([(x0, 192.0), (x1, yt), (x2, 191.0)])), RIP, "none", 0, 'opacity="0.85"'))
        g.append('</g>')
        # the crescent on the chest, exactly as inked: the black shape, the white over it
        g.append(f'<g{I("moon")}>')
        g.append(path(closed_path(mp(R.MOON_INK), 25), INK, "none"))
        g.append(path(closed_path(mp(R.MOON), 25), WHITE, "none"))
        g.append('</g>')
        # mummy (costume; hidden until worn): four bandages round the robe, crossing, cut to the body so they
        # wrap round it; drawn over the moon, which a bandage across the chest covers
        body_d = curve(front) + " " + curve(low, move=False) + " " + line_to(tt) + " " + curve(rev(top), move=False) + " " + curve(back, move=False) + " " + " ".join(line_to(p) for p in mp(top_l + top_r[::-1])) + " Z"
        wrapclip = "frogbodywrapclip" if ids else "frogbodywrapclipsq"   # (prefixed: the cat uses the plain names, and the labs put both on one page)
        g.append(f'<clipPath id="{wrapclip}"><path d="{body_d}"/></clipPath>')
        g.append(f'<g{I("mummybody")} class="mummy" display="none"><g clip-path="url(#{wrapclip})">')
        for pts in ([(56.0, 125.0), (80.0, 119.0), (104.0, 113.0), (126.0, 110.0), (144.0, 109.0)],
                    [(56.0, 131.0), (80.0, 135.0), (104.0, 140.0), (126.0, 145.0), (144.0, 148.0)],
                    [(56.0, 148.0), (80.0, 146.0), (104.0, 146.0), (126.0, 147.0), (144.0, 149.0)],
                    [(56.0, 167.0), (80.0, 162.0), (104.0, 157.0), (126.0, 154.0), (144.0, 153.0)],
                    [(56.0, 173.0), (80.0, 177.0), (104.0, 181.0), (126.0, 185.0), (142.0, 187.0)]):
            g += strip(mp(pts), 10)
        g.append('</g></g>')
        if ids:
            g.append('<g id="dirt" display="none">')
            for (dx, dy, rx, ry, rot) in ((90, 138, 5.5, 3.2, -20), (112, 160, 4.6, 2.8, 15), (82, 176, 4.0, 2.4, 30), (108, 128, 3.2, 2.0, -10)):
                g.append(f'<g transform="rotate({rot} {dx} {dy})">' + ellipse(dx, dy, rx, ry, MUD, "none", 0, 'opacity="0.5"') + '</g>')
            g.append('</g>')
        arms.append(f'<g{I("legL")} class="leg">')
        arm = curve(ms(segments(sleeve))) + " " + line_to(M(NOTCH)) + " " + curve(ms(arm_outer), move=False)
        arms.append(path(arm + " Z", GREEN, "none"))
        arms.append(path(arm))
        # the near sleeve of the witch robe (costume; hidden until worn): the upper sleeve in the robe's cloth with
        # a lining cuff, the sleeve's own green end left showing
        clipL = "armclipL" if ids else "armclipLsq"
        arms.append(f'<g{I("sleeveL")} class="robe" display="none"><clipPath id="{clipL}"><path d="{arm} Z"/></clipPath><g clip-path="url(#{clipL})">')
        # (pet.css pins this arm's pivot to a fixed point, so the cuff may flare past the arm; see LEGL_PIVOT)
        x0, x1 = M((56.0, 0))[0], M((90.0, 0))[0]
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 94.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 148.0))[1] - M((0, 94.0))[1]:.1f}" fill="{HAIR}"/>')
        arms.append(path(open_path(mp([(78.0, 100.0), (76.5, 122.0), (77.0, 140.0)])), "none", INK, 1.2, 'opacity="0.35"'))   # a fold
        arms.append('</g>' + path(arm))
        arms.append(path(closed_path(mp([(67.0, 138.0), (80.0, 138.0), (85.5, 152.5), (61.0, 153.5)]), 40), HAIR, INK, LW))
        arms.append(path(closed_path(mp([(63.0, 150.5), (83.5, 149.5), (85.5, 152.5), (61.0, 153.5)]), 40), PURPLE, "none", 0))
        arms.append('</g>')
        # the bisht's near sleeve (item; hidden until worn): the upper sleeve in its wool, a wide cuff with gold at its mouth
        bclipL = "bishtclipL" if ids else "bishtclipLsq"
        arms.append(f'<g{I("bishtsleeveL")} class="bisht" display="none"><clipPath id="{bclipL}"><path d="{arm} Z"/></clipPath><g clip-path="url(#{bclipL})">')
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 94.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 148.0))[1] - M((0, 94.0))[1]:.1f}" fill="{HB.BISHT}"/>')
        arms += HB.sheen([mp([(78.0, 100.0), (76.5, 122.0), (77.0, 140.0)])], 1.3, 0.55)
        arms.append('</g>' + path(arm))
        arms.append(path(closed_path(mp([(67.0, 138.0), (80.0, 138.0), (85.5, 152.5), (61.0, 153.5)]), 40), HB.BISHT, INK, LW))
        arms += HB.zari(mp([(61.8, 151.0), (73.4, 150.6), (84.8, 150.2)]), 3.6, INK, 0.8, 3.0)
        arms.append('</g>')
        # emo clothes (item; hidden until worn): the hoodie's near sleeve, black to its ribbed cuff, the arm's own end showing
        eclipL = "emoclipL" if ids else "emoclipLsq"
        arms.append(f'<g{I("emofitL")} class="emofit" display="none"><clipPath id="{eclipL}"><path d="{arm} Z"/></clipPath><g clip-path="url(#{eclipL})">')
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 94.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 147.0))[1] - M((0, 94.0))[1]:.1f}" fill="{EM.TEE}"/>')
        arms.append(path(open_path(mp([(78.0, 100.0), (76.5, 122.0), (77.0, 138.0)])), "none", EM.TEE2, 1.6, 'opacity="0.8"'))
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 140.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 147.0))[1] - M((0, 140.0))[1]:.1f}" fill="{EM.KNITD}"/>')
        for xx in range(60, 90, 3):
            a_, b_ = M((xx, 140.6)), M((xx, 146.4)); arms.append(path(f"M{a_[0]:.1f},{a_[1]:.1f} L{b_[0]:.1f},{b_[1]:.1f}", "none", EM.KNIT2, 0.8, 'opacity="0.8"'))
        arms.append('</g>' + path(arm))
        arms.append('</g>')
        # wristbands (item; hidden until worn): a purple sweatband with a white stripe at the near sleeve's end, cut to the arm
        wbL = "wristclipL" if ids else "wristclipLsq"
        arms.append(f'<g{I("wristL")} display="none"><clipPath id="{wbL}"><path d="{arm} Z"/></clipPath><g clip-path="url(#{wbL})">')
        arms.append(f'<rect x="{x0:.1f}" y="{M((0, 139.0))[1]:.1f}" width="{x1 - x0:.1f}" height="{M((0, 148.0))[1] - M((0, 139.0))[1]:.1f}" fill="{EM.BAND}"/>')
        arms.append(path(f"M{x0:.1f},{M((0, 143.5))[1]:.1f} L{x1:.1f},{M((0, 143.5))[1]:.1f}", "none", EM.BAND2, 2.4))
        arms.append(path(f"M{x0:.1f},{M((0, 139.0))[1]:.1f} L{x1:.1f},{M((0, 139.0))[1]:.1f} M{x0:.1f},{M((0, 148.0))[1]:.1f} L{x1:.1f},{M((0, 148.0))[1]:.1f}", "none", INK, 1.0))
        arms.append('</g>' + path(arm))
        arms.append('</g>')
        # zombie (costume; hidden until worn): a stitched-up scar across the near sleeve
        arms.append(f'<g{I("zombieL")} class="zombie" display="none">')
        arms += stitches(M((66.5, 129.0)), M((81.0, 124.0)), 3)
        arms.append('</g>')
        # mummy (costume; hidden until worn): two bandages round the near arm, cut to the sleeve's shape
        wclipL = "wrapclipL" if ids else "wrapclipLsq"
        arms.append(f'<g{I("wrapL")} class="mummy" display="none"><clipPath id="{wclipL}"><path d="{arm} Z"/></clipPath><g clip-path="url(#{wclipL})">')
        for (y0, sk) in ((110.0, -2.0), (134.0, 2.0)):
            arms += strip(mp([(58.0, y0 + sk), (74.0, y0), (92.0, y0 - sk)]), 9)
        arms.append('</g></g>')
        arms.append('</g>')
        # The yoke (costume; hidden until worn): the cloak's shoulders, one piece across the top of the body from the
        # back of the neck to the front, over both arms' tops, so the sleeves and the cape hang from the same
        # garment. Its lower edge dips to a V above the moon, closed by a clasp: gold ring and a ruby, like the crown
        # and the hat's buckle.
        g.append(f'<g{I("yoke")} class="robe" display="none">')
        g.append(path(closed_path(mp([(66.0, 84.0), (76.0, 82.0), (96.0, 88.0), (118.0, 90.0), (128.0, 92.0), (133.0, 104.0), (128.0, 110.0), (116.0, 104.0), (100.0, 97.0),
                                      (84.0, 104.0), (70.0, 110.0), (62.0, 100.0)]), 40), HAIR, INK, LW))
        g.append(path(open_path(mp([(72.0, 106.0), (86.0, 100.0), (100.0, 94.0), (114.0, 100.0), (128.0, 106.0)])), "none", PURPLE, 2.6, 'opacity="0.75"'))   # the lining at its edge
        cx_, cy_ = M((100.0, 96.0))
        g.append(path(f"M{cx_-4.5:.1f},{cy_-4.5:.1f} L{cx_+4.5:.1f},{cy_-4.5:.1f} L{cx_+4.5:.1f},{cy_+4.5:.1f} L{cx_-4.5:.1f},{cy_+4.5:.1f} Z", "none", INK, 3.6))
        g.append(path(f"M{cx_-4.5:.1f},{cy_-4.5:.1f} L{cx_+4.5:.1f},{cy_-4.5:.1f} L{cx_+4.5:.1f},{cy_+4.5:.1f} L{cx_-4.5:.1f},{cy_+4.5:.1f} Z", "none", GOLD, 2.0))
        g.append(ellipse(cx_, cy_, 2.4, 2.1, RUBY, INK, 1.0))
        g.append(circle(cx_ - 0.7, cy_ - 0.7, 0.7, WHITE))
        g.append('</g>')
        # The bisht's front (item; hidden until worn): its shoulders and its two front panels over his robe, open down the
        # middle so his own robe and the moon show between its gold edges (his green robe is the thobe under it); the arms,
        # drawn after, hang in front of the panels, and the gold runs on below them to the hem.
        g.append(f'<g{I("bisht")} class="bisht" display="none">')
        g.append(path(closed_path(mp([(66.0, 83.0), (79.0, 81.5), (91.5, 87.0), (88.0, 100.0), (86.2, 120.0), (85.2, 150.0), (84.8, 189.0), (76.0, 191.5), (68.0, 190.0),
                                      (64.0, 170.0), (62.0, 140.0), (61.5, 110.0), (62.0, 95.0)]), 36), HB.BISHT, INK, LW))
        g.append(path(closed_path(mp([(111.0, 89.0), (122.0, 90.0), (127.0, 93.5), (127.8, 112.0), (127.0, 142.0), (126.5, 170.0), (124.0, 186.0), (118.2, 188.4),
                                      (117.0, 160.0), (115.8, 130.0), (113.8, 104.0)]), 36), HB.BISHT, INK, LW))
        g += HB.sheen([mp([(70.0, 150.0), (71.0, 172.0), (73.0, 186.0)]), mp([(122.0, 150.0), (121.5, 170.0), (120.5, 184.0)])], 1.4, 0.5)
        g += HB.zari(mp([(90.8, 87.5), (87.6, 100.0), (86.0, 120.0), (85.0, 150.0), (84.6, 188.5)]), 4.4, INK, 0.9, 3.4)
        g += HB.zari(mp([(111.6, 89.5), (114.2, 104.0), (116.0, 130.0), (117.0, 160.0), (118.0, 187.5)]), 4.4, INK, 0.9, 3.4)
        g.append('</g>')
        # The emo hoodie's front (item; hidden until worn): a black zip-up worn open over his robe, its two panels down to a
        # ribbed hem at his hips, the zip's silver teeth down each edge, purple drawstrings from the neck; his own robe and the
        # moon show between them (as the bisht's), the arms hang in front of the panels
        g.append(f'<g{I("emofit")} class="emofit" display="none">')
        backp = mp([(66.0, 83.0), (79.0, 81.5), (91.5, 87.0), (88.0, 100.0), (86.2, 120.0), (85.4, 150.0), (85.2, 163.0), (62.5, 165.0), (62.0, 140.0), (61.5, 110.0), (62.0, 95.0)])
        frontp = mp([(111.0, 89.0), (122.0, 90.0), (127.0, 93.5), (127.8, 112.0), (127.0, 142.0), (126.6, 161.5), (114.8, 162.5), (115.8, 130.0), (113.8, 104.0)])
        for pts in (backp, frontp):
            g.append(path(closed_path(pts, 36), EM.TEE, INK, LW))
        g += [path(open_path(mp([(68.0, 128.0), (68.5, 150.0), (70.0, 160.0)])), "none", EM.TEE2, 2.0, 'opacity="0.7"')]
        # the ribbed hem
        for (xa, xb, ya) in ((62.5, 85.2, 157.5), (114.8, 126.6, 156.0)):
            hem_ = mp([(xa, ya), (xb, ya - 0.6), (xb, ya + 6.0), (xa, ya + 6.8)])
            g.append(path(poly(hem_), EM.KNITD, INK, 0.9))
            for xx in range(int(xa) + 2, int(xb), 3):
                a_, b_ = M((xx, ya + 0.8)), M((xx, ya + 5.6)); g.append(path(f"M{a_[0]:.1f},{a_[1]:.1f} L{b_[0]:.1f},{b_[1]:.1f}", "none", EM.KNIT2, 0.7, 'opacity="0.8"'))
        # the zip's teeth down each open edge
        for pts in ([(91.0, 88.0), (87.9, 100.0), (86.3, 120.0), (85.6, 150.0), (85.4, 162.0)], [(111.4, 89.6), (114.0, 104.0), (115.6, 130.0), (115.2, 161.0)]):
            g.append(path(open_path(mp(pts)), "none", EM.STUD, 1.6, 'stroke-dasharray="1.1 1.0"'))
        # drawstrings, purple (crowned: gold), from the neck down each side, an aglet at each end
        g.append('<g class="emostripe">')
        for pts in ([(90.0, 92.0), (91.5, 106.0), (90.0, 118.0)], [(113.0, 94.0), (114.0, 108.0), (115.5, 120.0)]):
            g.append(path(open_path(mp(pts)), "none", INK, 2.6)); g.append(path(open_path(mp(pts)), "none", EM.STRIPE, 1.5))
        g.append('</g><g class="emogold" display="none">')
        for pts in ([(90.0, 92.0), (91.5, 106.0), (90.0, 118.0)], [(113.0, 94.0), (114.0, 108.0), (115.5, 120.0)]):
            g.append(path(open_path(mp(pts)), "none", INK, 2.6)); g.append(path(open_path(mp(pts)), "none", EM.GOLDLINE, 1.5))
        g.append('</g>')
        g.append('</g>')
        # The Star of David (item; hidden until worn): a silver chain round his neck, hanging in a U round the moon so both
        # read, the star below it on his chest. It comes round from the back of his neck (his silhouette at x 69, below
        # where the head's line meets the body's) and goes back round at his throat under the chin (127, 90), so it runs
        # just BELOW the head's lower edge (`head_dip`) all the way: last in the body, under the head, so when he bows or
        # nods his chin comes down over it. (Two wrong turns, both the operator's catch: ending under his jaw it seemed to
        # stop short; drawn over the head, with the arms, it crossed his face whenever he bowed.) On the pinched body the
        # chain follows the pinch but the star is metal: only its centre moves.
        ds = [f'<g{I("davidstar")} display="none">']
        # (its ends stop just past his outline, which is at x 69.3 at the back of the neck and 126.2 at the throat, measured
        # off the fills: ending at 65.6 it stood out from his neck like a hoop, operator)
        chain = mp([(68.4, 85.6), (72.8, 87.5), (78.0, 90.8), (83.0, 94.5), (87.0, 102.5), (91.0, 111.0), (95.5, 118.0), (100.5, 122.8), (107.0, 124.6),
                    (113.5, 123.2), (119.0, 117.0), (121.9, 107.5), (122.8, 97.5), (124.2, 92.8), (125.5, 90.6)])
        ds.append(path(open_path(chain), "none", INK, 2.6))
        ds.append(path(open_path(chain), "none", SILVER, 1.4))
        ds.append(path(open_path(chain), "none", SILVER2, 0.8, 'stroke-dasharray="1.3 0.8"'))
        sx_, sy_ = M((107.0, 136.3))
        ds += interlaced_star(sx_, sy_, 10.5, 2.6, 0.75, INK, SILVER, SILVER2, FLAGBLUE, WHITE)
        ds.append('</g>')
        g += ds

    # The squeezed robe: pinched hard where the claw closes (y about 138), bulging above and below the grip,
    # the feet splayed. A pure horizontal warp about the body's own axis, so every line still meets.
    def pinch(p):
        x, y = p; cx = 97.0
        f = 1 - 0.5 * math.exp(-((y - 138) / 15) ** 2) + 0.46 * math.exp(-((y - 104) / 20) ** 2) + 0.42 * math.exp(-((y - 180) / 20) ** 2)
        return (cx + (x - cx) * f, y)

    # ---------------- the kippah: a cap on the far bump of his head ----------------
    # The far bump (the top-back of his head in this three-quarter view) is a ball: a circle fitted to the traced
    # outline from the back of the head over the bump to the cleft is centred at (100.8, 38.7), radius 22.1, within a
    # unit everywhere. The kippah is a cap on that ball (its surface a little proud of the head: KIP_R), leaning back
    # and tipped toward us so its top and the star show; what shows of it is worked out in 3-D (_cap_outline).
    # Over the emo hair the ball is bigger: the hair's outline over the same stretch sits on a circle about the same
    # centre of radius 28.3 (within 1.6), so there the cap is the same width on that ball, and pet.css shows that one
    # while the hair is worn.
    KIP_C, KIP_TH, KIP_EL = (100.8, 38.7), par("kip_th", 27.0), par("kip_el", 20.0)
    KIP_R, KIP_AL = 23.2, math.radians(par("kip_al", 54.0))
    KIP_R2 = 28.3; KIP_AL2 = math.asin(KIP_R * math.sin(KIP_AL) / KIP_R2)
    kip_def, kip_parts = kippah_on(KIP_C, KIP_R, KIP_TH, KIP_EL, KIP_AL, "frogkippahclip", "kiphead")
    kip_def2, kip_parts2 = kippah_on(KIP_C, KIP_R2, KIP_TH, KIP_EL, KIP_AL2, "frogkippahclip2", "kiphair", hidden=True)

    # ---------------- the pumpkin's cuts and outline (defs, outside every hidden group; see cat.py) ----------------
    global PK_LOBES, PK_HOLES
    PK_LOBES = ((76, 54, 18, 38, PUMPKIN3), (146, 54, 17, 39, PUMPKIN3), (90, 52, 24, 44, PUMPKIN), (135, 52, 24, 44, PUMPKIN), (116, 50, 28, 47, PUMPKIN))
    slot = [(88.5, 47.0), (91.5, 36.5), (100.5, 30.5), (112.0, 29.3), (121.0, 32.0), (125.3, 36.8), (130.0, 32.2), (140.0, 30.3), (150.0, 32.8),
            (156.5, 41.0), (156.3, 51.0), (151.0, 59.8), (141.0, 62.8), (130.0, 61.8), (125.3, 59.3), (120.0, 62.3), (108.0, 62.8), (96.0, 60.3), (89.5, 54.5)]
    grin = [(99.0, 74.5), (106.0, 73.0), (108.5, 73.0), (111.0, 78.5), (113.5, 72.8), (122.0, 72.5), (131.0, 72.6), (134.5, 72.8), (137.0, 78.2), (139.5, 73.2),
            (147.5, 73.8), (146.0, 79.5), (141.0, 85.0), (132.0, 89.0), (122.0, 90.0), (112.0, 88.5), (104.0, 84.0), (100.0, 79.0)]
    PK_HOLES = [closed_path(slot, 70), poly(grin)]
    g.append('<defs id="pkdefs">')
    g.append('<clipPath id="frogpkclip">' + "".join(ellipse(cx_, cy_, rx_ + 0.5, ry_ + 0.5, INK, "none") for (cx_, cy_, rx_, ry_, _) in PK_LOBES) + '</clipPath>')
    g.append('<mask id="frogpkmask" maskUnits="userSpaceOnUse" x="30" y="-40" width="160" height="160"><rect x="30" y="-40" width="160" height="160" fill="#FFFFFF"/>'
             + "".join(path(d, "#000000", "none") for d in PK_HOLES) + '</mask>')
    g.append('<clipPath id="frogpkholesclip">' + "".join(f'<path d="{d}"/>' for d in PK_HOLES) + '</clipPath>')
    g.append('</defs>')
    # the Jewish pack's defs: the kippah's shape (it clips its own shading, stripes and star), and for the far side
    # curl a mask of everything but his head, so that curl shows only where it hangs out past his face. In a defs of
    # their own that is never inside a hidden group (a clip defined in a display:none tree does not resolve), with
    # frog-prefixed ids (with several pets on a page, url(#id) finds the first in the document).
    KF_DEFS, KF_BACK, KF_FRONT, KF_DRAPE = keffiyeh_frog()
    g.append(KF_DEFS)
    BN_DEFS, BN_FRONT = beanie_frog()
    g.append(BN_DEFS)
    g.append('<defs id="frogkippahdefs">')
    g.append(kip_def); g.append(kip_def2)
    head_mask = curve(sil(iNECK_L, iSNOUT_A)) + " " + curve(segments([S[iSNOUT_A], (147.0, 75.5), (145.6, 79.5), S[iSNOUT_B]]), move=False) + " " + curve(sil(iSNOUT_B, iNECK_R), move=False) + " Z"
    g.append(f'<mask id="frogpayotmask" maskUnits="userSpaceOnUse" x="20" y="-40" width="200" height="200"><rect x="20" y="-40" width="200" height="200" fill="#FFFFFF"/>'
             f'<path d="{head_mask}" fill="#000000" stroke="#000000" stroke-width="{LW}"/></mask>')
    g.append('</defs>')

    # ---------------- draw order ----------------
    g.append('<g id="shadow">')
    g.append(ellipse(97, 211.5, 44, 5.5, PUPIL, "none", 0, 'opacity="0.55"'))
    g.append('</g>')
    g.append('<g id="figure">')

    # the cloak tip rides inside the body group (first, so the body is drawn over its base): when the frog bows from
    # the hips the whole robe goes with it, tip included
    arms, armssq = [], []
    g.append('<g id="body">')
    body_block(g, arms=arms)
    g.append('</g>')  # body
    g.append('<g id="bodysq" display="none">')
    body_block(g, pinch, ids=False, arms=armssq)
    g.append('</g>')

    # ---- head + face ----
    def eye(eid, white, inked, pupil, lights, side, lid_ends):
        xs = [p[0] for p in white]; ys = [p[1] for p in white]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        EX, EY = (x0 + x1) / 2, (y0 + y1) / 2
        white_d = closed_path(white, 40)
        # the upper lid runs between the eye's two corners (given, because the eye next to the divider has its
        # corner up at the top, not at its widest point)
        n = len(white); nearest = lambda pt: min(range(n), key=lambda i: (white[i][0]-pt[0])**2 + (white[i][1]-pt[1])**2)
        iL, iR = nearest(lid_ends[0]), nearest(lid_ends[1])
        top = []; i = iL
        while True:
            top.append(white[i])
            if i == iR: break
            i = (i + 1) % n
        e = [f'<g id="{eid}" class="eye">']
        e.append(f'<clipPath id="frog{eid}clip"><path d="{white_d}"/></clipPath>')
        e.append('<g class="open">')
        if inked: e.append(path(closed_path(inked, 40), INK, "none"))   # the rims exactly as inked (heavy upper lids, fine lower ones): one shape for both eyes
        e.append(path(white_d, WHITE, "none"))
        e.append(f'<g clip-path="url(#frog{eid}clip)"><g class="pupil">')
        e.append(circle(pupil[0], pupil[1], pupil[2], INK))
        for (hx, hy, hr) in lights: e.append(circle(hx, hy, hr, WHITE))
        e.append('</g></g>')
        # The lid: a green shade with an inked edge, cut to the eyeball's shape and parked just above it, out of
        # sight. The rig blinks by sliding `.lid` down 19 units, which suits the cat's eye; this eye is taller, so
        # the lid rides inside a vertical stretch (undone again inside it) that turns those 19 into a full close.
        park = LW / 2 + 0.2; travel = (y1 - y0) + park + 1.0; k = travel / 19
        e.append(f'<g clip-path="url(#frog{eid}clip)"><g transform="translate(0 {y0:.2f}) scale(1 {k:.4f}) translate(0 {-y0:.2f})"><g class="lid">'
                 f'<g transform="translate(0 {y0 - park:.2f}) scale(1 {1/k:.4f}) translate(0 {-y0:.2f})">')
        shade = curve(segments(top)) + f" L{x1+3:.1f},{top[-1][1]:.1f} L{x1+3:.1f},{y0-50:.1f} L{x0-3:.1f},{y0-50:.1f} L{x0-3:.1f},{top[0][1]:.1f} Z"
        e.append(path(shade, GREEN, "none"))
        e.append(path(open_path(top), "none", INK, LW))
        e.append('</g></g></g></g>')
        e.append('</g>')
        # closed (asleep): the lids meet low on the eyeball, as a drooping line
        e.append('<g class="closed" display="none">')
        e.append(path(f"M{x0+1.5:.1f},{EY+2:.1f} Q{EX:.1f},{EY+13:.1f} {x1-1.5:.1f},{EY+2:.1f}", "none", INK, LW))
        e.append('</g>')
        e.append('<g class="happy" display="none">')
        e.append(path(f"M{x0+2.5:.1f},{EY+6:.1f} Q{EX:.1f},{EY-11:.1f} {x1-2.5:.1f},{EY+6:.1f}", "none", INK, LW))
        e.append('</g>')
        e.append('<g class="squeeze" display="none">')
        if side < 0: e.append(path(f"M{x0+3:.1f},{EY-7.5:.1f} L{x1-4:.1f},{EY:.1f} L{x0+3:.1f},{EY+7.5:.1f}", "none", INK, LW + 0.3))
        else:        e.append(path(f"M{x1-3:.1f},{EY-7.5:.1f} L{x0+4:.1f},{EY:.1f} L{x1-3:.1f},{EY+7.5:.1f}", "none", INK, LW + 0.3))
        e.append('</g>')
        e.append('<g class="x" display="none">')
        e.append(path(f"M{EX-7.5:.1f},{EY-7.5:.1f} L{EX+7.5:.1f},{EY+7.5:.1f} M{EX+7.5:.1f},{EY-7.5:.1f} L{EX-7.5:.1f},{EY+7.5:.1f}", "none", INK, LW + 0.3))
        e.append('</g></g>')
        return e

    # keffiyeh (item; hidden until worn): the far side of the cloth, behind the head (its top and agal are after the kippah)
    g += KF_BACK
    g.append('<g id="head">')
    # The head's fill follows the pursed profile at the snout, not the lips' bumps: the lips paint their own bulge,
    # and with the lips gone (the round open mouth) no green may stand past the profile line.
    A_, B_ = S[iSNOUT_A], S[iSNOUT_B]
    pursed = segments([A_, (147.0, 75.5), (145.6, 79.5), B_])
    g.append(path(curve(sil(iNECK_L, iSNOUT_A)) + " " + curve(pursed, move=False) + " " + curve(sil(iSNOUT_B, iNECK_R), move=False) + " " + " ".join(line_to(p) for p in head_dip) + " Z", GREEN, "none"))
    # the snout with the mouth shut and pursed: a plain profile from the nose to the chin, drawn under the face so
    # the lips (which bulge past it) cover it, and it shows only when the lips go (the round open mouth)
    g.append(path(curve(pursed), "none", INK, LW))
    g.append(path(curve(sil(iSNOUT_B, iNECK_R))))      # under the chin to the neck: under the face, so a tongue or a wide-open mouth can hang over it
    g.append('<g id="face">')
    # brow, lids, bags and cheek lines: the ink itself, so every swell and taper is the reference's
    g.append('<g id="creases">')
    for rings in R.FACE_INK: g.append(path(" ".join(closed_path(ring, 35) for ring in rings), INK, "none", extra='fill-rule="evenodd"'))
    g.append('</g>')
    # mummy (costume; hidden until worn): two bandages crossing the brow between the bumps and the eyes, one
    # under the eyes across the cheek, cut to the head so they wrap round it, drawn over the face's creases and under the eyes, lips and mouths.
    head_d = curve(sil(iNECK_L, iSNOUT_A)) + " " + curve(pursed, move=False) + " " + curve(sil(iSNOUT_B, iNECK_R), move=False) + " " + " ".join(line_to(p) for p in head_dip) + " Z"
    g.append(f'<clipPath id="frogheadwrapclip"><path d="{head_d}"/></clipPath>')
    g.append('<g id="mummyhead" class="mummy" display="none">')
    g.append('<g clip-path="url(#frogheadwrapclip)">')
    g += strip([(64.0, 46.0), (80.0, 36.0), (96.0, 30.0), (116.0, 28.0), (136.0, 28.0), (156.0, 33.0)], 7)
    g += strip([(64.0, 20.0), (84.0, 17.0), (104.0, 17.5), (124.0, 20.0), (144.0, 27.0), (158.0, 36.0)], 7)
    g += strip([(64.0, 66.0), (90.0, 65.0), (112.0, 65.0), (134.0, 65.5), (154.0, 68.0)], 8)
    g.append('</g>')
    g.append('</g>')
    g += eye("eyeR", R.EYE_R, R.EYES_INK, R.PUPIL_R, R.LIGHTS_R, +1, ((125.7, 39.1), (153.2, 46.0)))     # drawn first: it carries the inked rims of both eyes
    g += eye("eyeL", R.EYE_L, None, R.PUPIL_L, R.LIGHTS_L, -1, ((91.5, 46.1), (124.8, 39.3)))

    # ---- mouths. The resting one is the reference's. The others are the same lips bent about the snout end,
    # which is part of the head's outline and stays where it is. ----
    XR, XL = 148.0, 89.5
    def bend(pts, corner_dy, mid_dy, power=2.0):
        out = []
        for (x, y) in pts:
            u = max(0.0, min(1.0, (XR - x) / (XR - XL)))
            out.append((x, y + corner_dy * u**power + mid_dy * math.sin(math.pi * u)))
        return out
    def lips(mid, corner_dy=0.0, mid_dy=0.0, power=2.0, over=()):
        out = [f'<g id="mouth-{mid}"' + (' display="none"' if mid != "idle" else '') + '>']
        out.append(path(closed_path(bend(R.LIPS_INK, corner_dy, mid_dy, power), 35), INK, "none"))
        out.append(path(closed_path(bend(R.LIPS, corner_dy, mid_dy, power), 35), LIP, "none"))
        out.append(path(curve(snout_segs)))                          # the lips' front is the snout's profile
        out += list(over)
        out.append('</g>')
        return out
    tongue = [path("M124.5,78.6 C124.0,85.5 126.5,89.6 130.6,89.4 C134.8,89.2 136.6,85.0 135.8,78.4 Z", TONGUE, INK, LD + 0.15),
              path("M130.2,80.5 L130.4,85.5", "none", INK, LD * 0.8, 'opacity="0.5"')]
    g.append('<g id="mouth">')
    g += lips("idle")
    g += lips("smug", -5.5, 1.0, 3.0)
    # open: a round "o" toward the front of the face. The rig scales this group (small for a chew, big for a
    # yawn), so it has to be a shape that can grow and shrink inside the face, like the cat's.
    # open: the lips pucker into a round "o" at the front of the snout; behind it the profile is a plain pursed
    # curve from the nose to the chin in place of the lip bumps.
    # open: a round "o" where the mouth is, well inside the face, so the rig can grow it for a yawn (1.7x) without
    # it leaving his head; the snout behind it is the pursed profile drawn under the face above
    g.append('<g id="mouth-open" display="none">')
    g.append(ellipse(129.0, 79.2, 9.6, 7.4, LIP, INK, LD + 0.3))
    g.append(f'<clipPath id="mawclip"><ellipse cx="129.0" cy="79.4" rx="6.0" ry="4.3"/></clipPath>')
    g.append(ellipse(129.0, 79.4, 6.0, 4.3, MAW, INK, LD))
    g.append(f'<g clip-path="url(#mawclip)">' + ellipse(128.6, 82.9, 4.3, 2.5, TONGUE, "none", 0) + '</g>')
    g.append('</g>')
    g += lips("smile", -7.0, 2.6)
    g += lips("frown", 5.0, -2.2)
    g += lips("yum", -7.0, 2.6, over=tongue)
    g.append('</g>')  # mouth
    # lip piercings (emo pack; hidden until worn): two silver hoops through the lower lip (its lowest edge, measured off the lips)
    def lowest(x):
        pts = [p_ for p_ in R.LIPS if abs(p_[0] - x) < 2.2]
        return max(p_[1] for p_ in pts) if pts else 82.0
    # (a pair for every mouth, on that mouth's own lower lip: EM.lip_rings, each a twin of its mouth)
    g.append('<g id="piercings" display="none"></g>')
    for mid, pts in EM.lipring_edges("frog").items(): g.append(EM.lip_rings(mid, pts, 1.7, 0.85))
    g.append('</g>')  # face
    g.append(path(curve(sil(iNECK_L, iSNOUT_A))))      # the back, the crown and the brow down to the nose go on last, over the eyes' whites: the eye whites and the lips run in under it
    # zombie (costume; hidden until worn): the brain out of the near bump of the head, a stitched-up scar over
    # the far bump and one down the back of the head. The skin recolours in pet.css (`.zombie` on the svg).
    g.append('<g id="zombiehead" class="zombie" display="none">')
    g += stitches((85.0, 33.0), (107.0, 22.5), 4)
    g += stitches((72.0, 56.0), (83.0, 72.0), 3)
    g.append('<g class="zbrain">'); g += brain(131.0, 13.0, 11.5, 7.5, 6); g.append('</g>')   # (.zbrain: the keffiyeh covers it, pet.css)
    g.append('</g>')
    # a slap mark on the cheek (hidden; the rig shows it after a slap): a palm and four fingers, red, see-through
    g.append('<g id="slapmark" display="none" opacity="0.5">')
    g.append(f'<g transform="rotate(-28 114 64)">' + ellipse(114, 64.5, 6.5, 4.8, PINK, "none", 0) + "".join(
        f'<g transform="rotate({r} 114 64.5)">' + ellipse(114, 55.5, 1.9, 4.4, PINK, "none", 0) + '</g>' for r in (-30, -10, 10, 30)) + '</g>')
    g.append('</g>')
    g.append('<g id="tear" display="none">')
    g.append(path("M101,61.5 C101,61.5 97.6,67.4 97.6,70 C97.6,72 99.1,73.4 101,73.4 C102.9,73.4 104.4,72 104.4,70 C104.4,67.4 101,61.5 101,61.5 Z", TEAR, INK, LD + 0.2))
    g.append('</g>')
    # payot (they come with the kippah; hidden until worn): a corkscrew curl hanging from each temple in the hair's
    # colours, last in the head so every head motion carries them. The near one hangs down the side of his face
    # beside the far eye's outer corner, to the corner of his mouth; the far one hangs behind his head and shows only
    # where it hangs out past his face, below the near eye (a mask of everything but the head).
    g.append('<g id="payot" display="none">')
    g.append('<g mask="url(#frogpayotmask)">')
    g += payah((par("pf_x", 152.5), par("pf_y", 53.0)), par("pf_len", 17.0), 2.75, 3.4, 2.8, 4.8, 3.8, stem=3.0)
    g.append('</g>')
    g += payah((par("pn_x", 82.0), par("pn_y", 37.0)), par("pn_len", 34.0), par("pn_turns", 4.75), 3.8, 3.0, 5.6, 4.2, stem=4.0)
    g.append('</g>')
    g.append('</g>')  # head

    # ---- emo hair (item; hidden until worn): a black fringe swept from the back of the head down over the far
    # eye, the cat's own hair on him. In the head unit so it rides the neck. It leaves the crown's seat clear. ----
    g.append('<g id="emohair" display="none">')
    # The cat's cut on him: the whole top of the head in hair, the back hanging down to the neck in points, and the
    # fringe swept from the back over the brow and down across the far eye in long locks; it stops short of the
    # near eye, which stays clear. Emo: one eye showing.
    hair = closed_path([(80.0, 22.0), (90.0, 13.0), (100.0, 11.0), (116.0, 15.0), (130.0, 12.0), (142.0, 17.0), (152.0, 26.0), (157.0, 36.0), (146.0, 37.0), (138.0, 40.0),
                        (134.0, 64.0), (128.0, 50.0), (124.0, 74.0), (117.0, 56.0), (110.0, 68.0), (103.0, 52.0), (94.0, 58.0), (88.0, 48.0), (80.0, 50.0), (76.0, 58.0),
                        (70.0, 46.0), (64.0, 52.0), (62.0, 38.0), (68.0, 28.0)], 30)
    g.append(path(hair, HAIR, INK, LW))
    g.append(f'<clipPath id="emohairclip"><path d="{hair}"/></clipPath>')
    g.append('<g clip-path="url(#emohairclip)">')
    # the strands run down the hair, near vertical with the sweep's slight lean, like the cat's; nothing across it
    for (x0, y0, L) in ((74.0, 28.0, 30.0), (86.0, 18.0, 44.0), (98.0, 14.0, 52.0), (110.0, 14.0, 56.0), (122.0, 14.0, 54.0), (134.0, 16.0, 40.0), (146.0, 22.0, 18.0)):
        x1, y1 = x0 + L * 0.18, y0 + L
        g.append(path(open_path([(x0, y0), ((x0 + x1) / 2 - 2.5, (y0 + y1) / 2), (x1, y1)]), "none", STRAND, 1.5))
    g.append('</g></g>')

    # ---- kippah (item; hidden until worn): white with the flag's two blue stripes round it near the rim and the
    # flag's blue Star of David (two outlined triangles) on top; on the far bump, the top-back of his head, leaning
    # back with it, so both eyes stay clear. In the head unit after the emo hair (it sits on the hair) and before the
    # arms, the crown and the witch hat (which covers it: pet.css). Crowned it is the golden kippah and the rig hides
    # the crown. Its shape, stripes and star are the cap on his head's ball, worked out in 3-D (see kippah_on). ----
    g.append('<g id="kippah" display="none">')
    g += kip_parts
    g += kip_parts2    # on the emo hair (pet.css shows this one while the hair is worn)
    g.append('</g>')
    # keffiyeh (item; hidden until worn): the shemagh over the top and back of his head with the agal, in the head unit after
    # the kippah (which it replaces) and before the arms, so the near sleeve hangs in front of the cloth on his shoulder
    g += KF_FRONT
    # beanie (emo pack; hidden until worn): the black hair and the knit over his head, in the head unit like the keffiyeh
    g += BN_FRONT

    # jack-o'-lantern (costume; hidden until worn): a whole pumpkin worn over his head, turned with his three-quarter
    # view (the front lobe is where he looks). Its carvings are real holes (a mask): one slot round both eyes and a
    # grin over his lips, so his own eyes and mouth look out of it and every expression still reads. The rig puts
    # `.pumpkinhead` on the svg and pet.css clips #head to the pumpkin's outline (#frogpkclip), so nothing on his
    # face pokes out past it. Drawn before the arms, so a raised sleeve goes in front of it; the rig hides the crown
    # while it is worn (crowned: the golden pumpkin).
    g.append('<g id="pumpkin" display="none">')
    g.append('<g mask="url(#frogpkmask)">')
    for (cx_, cy_, rx_, ry_, f_) in PK_LOBES:
        g.append(ellipse(cx_, cy_, rx_, ry_, f_, INK, LW))
    g.append(path("M116,5 Q111,50 116,96", "none", PUMPKIN2, 2.2, 'opacity="0.45"'))
    g.append(ellipse(94, 20, 7, 3, WHITE, "none", 0, 'opacity="0.22" transform="rotate(-40 94 20)"'))
    g.append('</g>')
    g.append('<g clip-path="url(#frogpkholesclip)">')
    for d in PK_HOLES: g.append(path(d, "none", "#1E0D05", 10, 'opacity="0.3"'))    # shadow just inside the cut
    for d in PK_HOLES: g.append(path(d, "none", PUMPKIN2, 5))                         # the rind's thickness
    g.append('</g>')
    for d in PK_HOLES: g.append(path(d, "none", INK, LW))
    g.append(path(closed_path([(110.0, 8.0), (108.5, -1.0), (111.0, -9.0), (118.0, -10.5), (120.5, -2.0), (119.5, 8.0)], 60), MOSS, INK, LW))
    g.append(path("M120,-3 Q130,-12 135,-3 Q137,4 131,3", "none", MOSS, 1.8))
    g.append(path("M118.5,-1 Q128,-11 138,-6 Q130,2 120,2 Z", LEAF, INK, 1.3))
    g.append(path("M121,0.5 Q129,-5.5 136,-5.5", "none", INK, 0.9, 'opacity="0.5"'))
    g.append('</g>')

    # ---- the arms, in front of the head (see body_block); the rig moves #arms with #body, #armssq with #bodysq ----
    g.append('<g id="arms">'); g += arms; g.append('</g>')
    g.append('<g id="armssq" display="none">'); g += armssq; g.append('</g>')
    # keffiyeh (item; hidden until worn): its fall onto the shoulder, over the near sleeve's top (in the head unit: the rig moves it with the head)
    g += KF_DRAPE

    # ---- crown: the cat's crown, the same drawing, sat between the two bumps of the head ----
    cx, cy = 100, 40
    g.append('<g id="crown"><g id="crownlift">')
    g.append(f'<g transform="translate(113 24.5) rotate(-8) scale(0.66) translate({-cx} {-46})">')
    CW = 2.7
    g.append(path(poly([(70, 46), (66, 30), (74, 32), (80, 12), (88, 30), (94, 30), (100, 8),
                        (106, 30), (112, 30), (120, 12), (126, 32), (134, 30), (130, 46)]), GOLD, INK, CW))
    g.append(path(poly([(70, 46), (130, 46), (132, 38), (68, 38)]), GOLD2, INK, 1.8))
    for bx, by in ((80, 12), (100, 8), (120, 12)):
        g.append(ellipse(bx, by, 3.4, 3.4, GOLD, INK, 1.8))
    g.append(ellipse(100, 33, 5, 4.2, RUBY, INK, 1.8))
    g.append(ellipse(84, 36, 2.6, 2.6, TEAL, INK, 1.6))
    g.append(ellipse(116, 36, 2.6, 2.6, LEAF, INK, 1.6))
    for hx, hy, hr in ((98.4, 31.6, 1.3), (83.2, 35.2, 0.8), (115.2, 35.2, 0.8)):
        g.append(circle(hx, hy, hr, WHITE))
    def spark(sid, sx, sy, r):
        return (f'<path id="{sid}" display="none" d="M{sx},{sy-r} L{sx+r*0.22},{sy-r*0.22} L{sx+r},{sy} L{sx+r*0.22},{sy+r*0.22} '
                f'L{sx},{sy+r} L{sx-r*0.22},{sy+r*0.22} L{sx-r},{sy} L{sx-r*0.22},{sy-r*0.22} Z" fill="#FFFFFF" stroke="none"/>')
    g.append(spark("glintL", 80, 12, 7)); g.append(spark("glintC", 100, 8, 10)); g.append(spark("glintR", 120, 12, 7))
    g.append('</g></g></g>')

    # ---- witch hat (costume; hidden until worn): in the head unit, drawn after the crown so it hides it (a crowned inversebrah wears the golden hat, as the cat does). The brim sits on the two bumps
    # of the head, tilted with the three-quarter view; the cone leans back and curls over; the band carries the
    # cat's lavender studs and a gold buckle with a ruby, like the crown. ----
    g.append('<g id="witchhat" display="none"><g transform="rotate(4 115 24)">')
    g.append(path(closed_path([(66.0, 28.0), (78.0, 19.0), (96.0, 13.0), (118.0, 12.0), (138.0, 14.0), (154.0, 20.0), (164.0, 29.0),
                               (155.0, 36.0), (138.0, 40.0), (116.0, 41.0), (94.0, 39.0), (74.0, 35.0)], 40), HAIR, INK, LW))   # brim
    g.append(ellipse(116, 24, 36, 4.5, PUPIL, "none", 0, 'opacity="0.3"'))                    # the cone seats on the brim
    cone = [(78.0, 22.0), (83.0, 2.0), (92.0, -18.0), (104.0, -34.0), (118.0, -44.0), (132.0, -44.0), (144.0, -38.0), (152.0, -28.0), (156.0, -18.0),
            (152.0, -20.0), (145.0, -30.0), (133.0, -32.0), (124.0, -24.0), (126.0, -12.0), (134.0, 8.0), (146.0, 22.0), (116.0, 28.0)]
    g.append(path(closed_path(cone, 40), PUPIL, INK, LW))
    g.append(path("M128,-32 Q136,-36 144,-35", "none", INK, 1.5, 'opacity="0.35"'))        # crease under the curl
    g.append(path("M90,8 Q97,-10 108,-24", "none", LAV, 2.0, 'opacity="0.2"'))               # edge light
    g.append(path(closed_path([(78.0, 22.0), (82.0, 9.0), (116.0, 15.0), (150.0, 9.0), (146.0, 22.0), (116.0, 28.0)], 40), INK, INK, 1.8))   # band
    for sx, sy in ((90.0, 18.0), (98.0, 20.0), (134.0, 20.0), (142.0, 18.0)):
        g.append(f'<circle cx="{sx}" cy="{sy}" r="2.2" fill="{LAV}" stroke="none"/>')
    g.append(path("M110,16 L122,15.5 L122.5,27 L110.5,27.5 Z", "none", INK, 4.6))              # buckle, ink under
    g.append(path("M110,16 L122,15.5 L122.5,27 L110.5,27.5 Z", "none", GOLD, 2.6))             # gold over
    g.append(ellipse(116.3, 21.5, 2.8, 2.5, RUBY, INK, 1.2))
    g.append(circle(115.5, 20.7, 0.8, WHITE))
    g.append('</g></g>')


    # The camera, held. It is drawn in the near sleeve's own coordinates, at the sleeve's end, but as its own group
    # over the head: in the sleeve it would be under the face (the head is drawn over the body), and a camera held
    # up is in front of the face. The rig turns it in lockstep with #legL, about the sleeve's own pivot (pet.css
    # gives #camera the same origin), so wherever the arm swings the camera goes with it. Hidden until the
    # screenshot. Turned so it sits level when the arm is held at CAMERA_ARM degrees (the holding pose in rig.ts).
    # Two animated groups: #camera turns with the arm about the sleeve's pivot; inside it #camlevel turns the
    # camera back about its own centre (83, 154 here) so he holds it level at any arm angle. The placement is on
    # an inner group of its own: a CSS transform-origin would re-centre a baked transform too.
    g.append(f'<g id="camera" display="none"><g id="camlevel"><g transform="rotate({-CAMERA_ARM} 70 152) translate(42 118) scale(0.6)">')
    g += camera_bits()
    g.append('</g></g></g>')

    # halo (dead), sweat, stink lines, z's
    g.append('<g id="halo" display="none">')
    g.append(ellipse(113, 3, 21, 5.6, "none", INK, 4.6))
    g.append(ellipse(113, 3, 21, 5.6, "none", GOLD, 2.6))
    g.append(path("M97,1.4 Q102,-2 110,-2.2", "none", WHITE, 1.2, 'opacity="0.8"'))
    g.append('</g>')
    g.append('<g id="sweat" display="none">')
    g.append(path("M74,22 C74,22 69.4,29.8 69.4,33 C69.4,35.8 71.5,37.7 74,37.7 C76.5,37.7 78.6,35.8 78.6,33 C78.6,29.8 74,22 74,22 Z", WHITE, INK, LD + 0.3))
    g.append('</g>')
    g.append(f'<g id="stink" display="none" fill="none" stroke="{LEAF}" stroke-width="2" stroke-linecap="round">')
    g.append('<path class="s s1" d="M52,150 Q55,145 52,140 Q49,135 52,130"/>')
    g.append('<path class="s s2" d="M44,168 Q47,163 44,158 Q41,153 44,148"/>')
    g.append('<path class="s s3" d="M146,132 Q149,127 146,122 Q143,117 146,112"/>')
    g.append('</g>')
    g.append(f'<g id="zzz" display="none" fill="none" stroke="{LAV}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">')
    g.append('<path class="z z1" d="M156,18 L166,18 L156,28 L166,28"/>')
    g.append('<path class="z z2" d="M168,0 L181,0 L168,13 L181,13"/>')
    g.append('<path class="z z3" d="M182,-22 L198,-22 L182,-6 L198,-6"/>')
    g.append('</g>')

    g.append('</g>')  # figure
    body = "\n".join(g)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="200" height="230">
<g id="cat" data-character="frog">
{body}
</g>
</svg>'''

if __name__ == "__main__":
    for a in sys.argv[1:]:
        k, v = a.split("="); P[k] = float(v)
    out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frog.svg"))
    open(out, "w").write(build())
    print("wrote", out)
