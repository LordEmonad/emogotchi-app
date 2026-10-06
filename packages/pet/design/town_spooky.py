"""Emotown, the spooky end of the street -> packages/pet/town/{haunted,backrooms,graveyard-back,obelisk,tomb-a,tomb-b,tomb-c}.svg

Drawn with town.py's toolkit and the diner's look: flat fills, wobbly black ink, a few soft highlight and shadow strokes.
The haunted house leans, sags and glows a sickly green; the Backrooms block is the one thing on the street that is lit
wrong; the graveyard's back fence, the memorial obelisk and three gravestones stand at the far end. Long repeated lines
(clapboards, shingle rows, balusters, scallops) are drawn as pre-wobbled polylines with a coarse step so the files stay
small; everything else goes through svg()'s wobble bake like the diner.
"""
import os, sys, math, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town import *
from cat import MOSS, LINEN, LINEN2, FLAME
from wobble import noise

# ---------------------------------------------------------------- helpers
def tapered_big(pts, w0, w1, t=0.5, fill=FUR, sample=7.0, stroke=INK, sw=LB):
    """props.py's tapered_big (copied: importing props.py regenerates every prop)."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, t))[0][1]
    c = []
    for seg in segs:
        smp = _samples(seg, sample)
        c += smp if not c else smp[1:]
    n = len(c); left = []; right = []
    for i, (x, y) in enumerate(c):
        x0, y0 = c[max(i-1, 0)]; x1, y1 = c[min(i+1, n-1)]
        tx, ty = x1-x0, y1-y0; L = math.hypot(tx, ty) or 1; nx, ny = -ty/L, tx/L
        w = (w0 + (w1-w0)*i/(n-1))/2
        left.append((x+nx*w, y+ny*w)); right.append((x-nx*w, y-ny*w))
    tipx, tipy = c[-1]; x0, y0 = c[-2]; tx, ty = tipx-x0, tipy-y0; L = math.hypot(tx, ty) or 1
    r = w1/2; ang0 = math.atan2(-ty/L, -tx/L) + math.pi/2
    tip = [(tipx + r*math.cos(ang0 + math.pi*k/4), tipy + r*math.sin(ang0 + math.pi*k/4)) for k in range(3, 0, -1)]
    return [path(smooth_closed(left + tip + right[::-1], 0.4), fill, stroke, sw)]

ID = lambda p: p
def lean(k, y0, dx=0.0):
    """A shear: points lean right by k per unit of height above y0 (k < 0 leans left)."""
    return lambda p: (p[0] + k * (y0 - p[1]) + dx, p[1])
def rot(cx, cy, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return lambda p: (cx + (p[0]-cx)*c - (p[1]-cy)*s, cy + (p[0]-cx)*s + (p[1]-cy)*c)
def comp(*ms):
    """comp(a, b)(p) = a(b(p))."""
    def f(p):
        for m in reversed(ms): p = m(p)
        return p
    return f

_PAIR = re.compile(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
def mapd(d, m):
    return _PAIR.sub(lambda mo: "%.1f,%.1f" % m((float(mo.group(1)), float(mo.group(2)))), d)
def rect_d(x, y, w, h):
    return f"M{x:.1f},{y:.1f} L{x+w:.1f},{y:.1f} L{x+w:.1f},{y+h:.1f} L{x:.1f},{y+h:.1f} Z"
def P(m, d, fill, stroke=INK, sw=LB, extra=""):
    return path(mapd(d, m), fill, stroke, sw, extra)
def R(m, x, y, w, h, fill, stroke=INK, sw=LB, extra=""):
    return P(m, rect_d(x, y, w, h), fill, stroke, sw, extra)
def L(m, x0, y0, x1, y1, stroke=INK, sw=LM, extra=""):
    return P(m, f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}", "none", stroke, sw, extra)
def E(m, cx, cy, rx, ry, fill, stroke=INK, sw=LM, extra=""):
    x, y = m((cx, cy)); return ellipse(x, y, rx, ry, fill, stroke, sw, extra)
def C(m, cx, cy, r, fill, stroke=INK, sw=LM, extra=""):
    x, y = m((cx, cy))
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'

AMP = 0.9; FREQ = 0.09
class Raw(str):
    """An element already wobbled by hand: svgx() keeps it out of the bake."""

def wpath(lines, stroke, sw, op=None, seg=22.0, m=ID):
    """Many pre-wobbled open polylines in ONE path element (a clapboard wall, a row of slates): no per-line overhead."""
    d = []
    for pts in lines:
        pts = [m(p) for p in pts]; out = []
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i+1]
            n = max(1, int(round(math.dist(pts[i], pts[i+1]) / seg)))
            for k in range(n + (1 if i == len(pts) - 2 else 0)):
                t = k / n; x = x0 + (x1-x0)*t; y = y0 + (y1-y0)*t
                dx, dy = noise(x, y, AMP, FREQ); out.append((x + dx, y + dy))
        d.append(f"M{_f(out[0][0])},{_f(out[0][1])}l" + " ".join(f"{_f(x1-x0)},{_f(y1-y0)}" for (x0, y0), (x1, y1) in zip(out, out[1:])))
    o = f' opacity="{op}"' if op is not None else ""
    return Raw(f'<path d="{"".join(d)}" fill="none" stroke="{stroke}" stroke-width="{sw}" '
               f'stroke-linecap="round" stroke-linejoin="round"{o}/>')

def _f(v):
    """A compact number: one decimal, no trailing .0, no leading zero."""
    t = f"{v:.1f}"
    if t.endswith(".0"): t = t[:-2]
    if t == "-0": t = "0"
    return t.replace("0.", ".", 1) if t.startswith(("0.", "-0.")) else t

def wscallops(rows, stroke, sw, op=None, m=ID):
    """Rows of fish-scale shingles, each row a chain of relative quadratic U's: rows = [(x0, x1, y, w, depth)]."""
    d = []
    for (x0, x1, y, w, depth) in rows:
        x = x0; pts = [m((x, y))]; segs = []
        while x < x1:
            jx, jy = noise(x * 1.7, y * 1.3, 1.0, 0.3)
            c = m((x + w / 2 + jx * 0.6, y + w * depth + jy * 0.8)); e = m((x + w, y + jy * 0.3))
            segs.append((c, e)); x += w
        cur = pts[0]; q = []
        for (c, e) in segs:
            q.append(f"{_f(c[0]-cur[0])},{_f(c[1]-cur[1])} {_f(e[0]-cur[0])},{_f(e[1]-cur[1])}"); cur = e
        d.append(f"M{_f(pts[0][0])},{_f(pts[0][1])}q" + " ".join(q))
    o = f' opacity="{op}"' if op is not None else ""
    return Raw(f'<path d="{"".join(d)}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{o}/>')

def hand(el, seg=12.0):
    """Wobble a straight-edged <path> by hand: every edge resampled about every `seg` units and displaced by the bake's
    own noise field (so it matches the baked curves beside it), written in compact relative coordinates."""
    from wobble import parse
    mo = re.match(r'<path d="([^"]*)"(.*)$', el, re.S)
    d, rest = mo.group(1), mo.group(2)
    out = []
    for closed, segs in parse(d):
        if not segs: continue
        pts = []
        for sg in segs:
            (x0, y0), (x1, y1) = sg[1], sg[-1]
            n = max(1, int(round(math.dist((x0, y0), (x1, y1)) / seg)))
            for k in range(n):
                t = k / n; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
                dx, dy = noise(x, y, AMP, FREQ); pts.append((x + dx, y + dy))
        if not closed:
            x, y = segs[-1][-1]; dx, dy = noise(x, y, AMP, FREQ); pts.append((x + dx, y + dy))
        out.append(f"M{_f(pts[0][0])},{_f(pts[0][1])}l" + " ".join(f"{_f(b_[0]-a_[0])},{_f(b_[1]-a_[1])}" for a_, b_ in zip(pts, pts[1:])) + ("z" if closed else ""))
    return f'<path d="{"".join(out)}"{rest}'

_SMALL = re.compile(r'<(circle|ellipse)\b[^>]*\br[xy]?="([\d.]+)"')
def svgx(name, w, h, body, amp=0.9, step=8.0, decimals=1, defs="", step_lines=None):
    """town.svg with two economies: Raw elements (wobbled by hand) are spliced back in after the bake, and straight-
    edged paths can be baked at a coarser step (`step_lines`) than curves. Same noise, same rounding, same file."""
    from wobble import bake
    raws = []; items = []
    for el in body:
        m_ = _SMALL.match(el) if not isinstance(el, Raw) else None
        if isinstance(el, Raw) or (m_ and float(m_.group(2)) <= 4.5):
            items.append(f"<!--RAW{len(raws)}-->"); raws.append(str(el))
        elif step_lines and el.startswith("<path") and not re.search(r'd="[^"]*[CQ]', el):
            items.append(f"<!--RAW{len(raws)}-->"); raws.append(hand(el, step_lines))
        else: items.append(el)
    b = bake("\n".join(items), amp=amp, freq=0.09, step=step)
    for i, r in enumerate(raws): b = b.replace(f"<!--RAW{i}-->", r)
    if decimals is not None:
        def rnd(m_):
            v = f"{float(m_.group(0)):.{decimals}f}"
            return v.rstrip("0").rstrip(".") if decimals > 0 else v
        b = re.sub(r"-?\d+\.\d+", rnd, b)
    src = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           f'<defs>{defs}</defs>\n<g id="{name}">\n{b}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"{len(src)//1024} KB")

ANCH = {}
def bbox(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return {"x": round(min(xs), 1), "y": round(min(ys), 1), "w": round(max(xs) - min(xs), 1), "h": round(max(ys) - min(ys), 1)}
def pt(p, **kw):
    return dict({"x": round(p[0], 1), "y": round(p[1], 1)}, **kw)
def quad(m, x, y, w, h):
    return [m(p) for p in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]

def heart_d(cx, cy, w):
    """The Emonad heart (props.py's _heart), centred, by width."""
    k = w / 28.0
    return (f"M{cx:.1f},{cy+11*k:.1f} C{cx-12*k:.1f},{cy+2*k:.1f} {cx-14*k:.1f},{cy-6*k:.1f} {cx-8*k:.1f},{cy-10*k:.1f} "
            f"C{cx-4*k:.1f},{cy-13*k:.1f} {cx:.1f},{cy-10*k:.1f} {cx:.1f},{cy-7*k:.1f} C{cx:.1f},{cy-10*k:.1f} {cx+4*k:.1f},{cy-13*k:.1f} {cx+8*k:.1f},{cy-10*k:.1f} "
            f"C{cx+14*k:.1f},{cy-6*k:.1f} {cx+12*k:.1f},{cy+2*k:.1f} {cx:.1f},{cy+11*k:.1f} Z")

def ppoly(pts, extra=""):
    """An unbaked polygon (for clip paths and soft overlays, where the wobble would only cost bytes)."""
    return f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" {extra}/>'
def clip(cid, pts):
    return f'<clipPath id="{cid}">{ppoly(pts)}</clipPath>'
def inset(pts, d=1.6):
    """Shrink a convex-ish polygon toward its centroid by about d units (so clipped texture stops inside the ink)."""
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    out = []
    for (x, y) in pts:
        L_ = math.hypot(x - cx, y - cy) or 1; out.append((x - (x - cx) / L_ * d, y - (y - cy) / L_ * d))
    return out

def tuft(x, y, h, lean_=0.0, dark="#27303A", light=MOSS):
    """A grass tuft: three bent blades in one path (straight segments, so the bake keeps it tiny)."""
    d = ""
    for dx, hh, l in ((-3, h*0.7, -2.5 + lean_), (0, h, lean_), (3, h*0.8, 2.5 + lean_)):
        d += f"M{x+dx:.1f},{y:.1f} L{x+dx+l*0.4:.1f},{y-hh*0.55:.1f} L{x+dx+l*1.4:.1f},{y-hh:.1f} "
    return [path(d, "none", dark, 2.4),
            path(f"M{x+1:.1f},{y:.1f} L{x+1+lean_*0.3:.1f},{y-h*0.4:.1f} L{x+lean_+1.5:.1f},{y-h*0.72:.1f}", "none", light, 1.5, 'opacity="0.8"')]

def shadow_ellipse(cx, cy, rx, ry=6.0, op=0.45):
    return ellipse(cx, cy, rx, ry, SHADE, "none", 0, f'opacity="{op}"')

# ---------------------------------------------------------------- the haunted house
# its own colours: grey-violet clapboard, slate roofs, pale peeling trim, and the green
CLAP   = "#524A6C"; CLAPL = "#6A628A"; CLAPD = "#3D3654"   # clapboard, its lip highlight, its shadow line
TCLAP  = "#484062"                                        # the tower's boards, a shade darker so it stands forward
HTRIM  = "#877E9F"; HTRIM2 = "#645B80"                     # trim, peeling; trim in shade
SLATE  = "#352B4E"; SLATE2 = "#261F3C"; SLATE3 = "#4A3F66"  # slate roofs
HWOOD  = "#4B4262"; HWOOD2 = "#383050"                     # porch boards, weathered
DOOR   = "#3A2336"; DOOR2 = "#2A1827"
IRON   = "#241B30"
GHOST  = "#EEF8DC"
SICK1, SICK2 = "#D8F29A", "#6BB84A"
SICKDIM = "#9ACB6A"

def haunted():
    """A crooked Victorian haunted house: a steep front gable with a round attic window over the left bay, a sagging
    hipped roof with iron cresting and a crumbling chimney, a tower on the right under a bent witch-hat spire, a porch
    with a broken railing, and every lit window a sickly green: a ghost upstairs, a candelabra downstairs, a cat on the
    tower sill and two eyes in the belfry. The pumpkin, dead tree and cobweb props dress it on the site."""
    W, H = 500, 580; G = H - 16
    g = []
    defs = lit_glass("hhglass", SICK1, SICK2) + lit_glass("hhglass2", "#E4F7B4", "#7CC456")
    mM = lean(-0.018, 534)                      # the main block leans a touch left
    tM = lean(0.034, 534)                       # the tower leans right
    FND = 534                                   # top of the foundation

    # ---------- the main roof: hipped, sagging, slate, iron cresting on the ridge
    ridge = [(70, 132), (130, 138), (190, 142), (250, 139), (304, 132)]
    eave = [(8, 208), (120, 212), (240, 216), (352, 210)]
    rd = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in [mM(eave[0])] + [mM(p) for p in ridge] + [mM(p) for p in eave[::-1]]) + " Z"
    roof_poly = [mM(eave[0])] + [mM(p) for p in ridge] + [mM(p) for p in eave[::-1]]
    g.append(clip("hhroofclip", inset(roof_poly)))
    g.append(path(rd, SLATE, INK, LB))
    g.append('<g clip-path="url(#hhroofclip)">')
    rows = []; ticks = []
    for i, y in enumerate(range(146, 214, 11)):
        rows.append([(0, y), (120, y + 4), (240, y + 5), (360, y)])
        off = 7 if i % 2 else 0
        for x in range(20 + off, 350, 15):
            yy = y + 4 * math.sin(math.pi * min(max(x, 0), 360) / 360)
            ticks.append([(x, yy), (x, yy + 10)])
    g.append(wpath(rows, SLATE2, 1.6, 0.9, m=mM)); g.append(wpath(ticks, SLATE2, 1.1, 0.6, m=mM))
    # a few slipped slates and a hole
    for (sx, sy, a) in ((226, 180, 16), (310, 194, -14)):
        g.append(P(comp(mM, rot(sx, sy, a)), rect_d(sx - 7, sy - 4, 14, 9), SLATE, INK, 1.2))
    g.append(P(mM, smooth_closed([(214, 170), (228, 166), (238, 174), (232, 184), (218, 183)], 0.5), NIGHT, INK, 1.3))
    g.append(P(mM, "M216,184 L212,190 M232,184 L236,191", "none", SLATE3, 1.4))
    g.append('</g>')
    g.append(wpath([[(74, 136), (130, 142), (190, 146), (250, 143), (300, 136)]], SLATE3, 2.0, 0.7, m=mM))   # lit ridge line
    # iron cresting along the ridge: little spikes (the cat's collar, on a roof)
    for i, x in enumerate(range(96, 300, 13)):
        yb = 132 + 10 * math.sin(math.pi * (x - 70) / 234)
        h = 12 if i % 2 else 8
        g.append(P(mM, f"M{x-2.6:.1f},{yb:.1f} L{x:.1f},{yb-h:.1f} L{x+2.6:.1f},{yb:.1f} Z", IRON, INK, 1.0))
    g.append(wpath([[(92, 132 + 10*math.sin(math.pi*22/234)), (196, 142), (300, 132 + 10*math.sin(math.pi*230/234))]], IRON, 2.2, m=mM))

    # ---------- the chimney: crooked brick, crumbling at the top (smoke goes at its mouth)
    cM = comp(lean(0.07, 170), mM)
    g.append(P(cM, poly([(262, 170), (262, 92), (268, 88), (274, 90), (280, 86), (292, 88), (292, 170)]), BRICK, INK, LB))
    mort = [[(262, y), (292, y)] for y in range(100, 168, 10)]
    for j, y in enumerate(range(90, 166, 10)):
        for x in ((270, 284) if j % 2 else (276,)):
            mort.append([(x, y + 1), (x, y + 9)])
    g.append(wpath(mort, BRICK2, 1.1, 0.9, m=cM))
    g.append(R(cM, 256, 94, 42, 9, "#6A3654", INK, LM))                                           # the cap
    g.append(R(cM, 264, 124, 10, 7, NIGHT, INK, 1.0))                                              # a missing brick
    g.append(L(cM, 265, 106, 265, 160, "#8A5A78", 1.4, 'opacity="0.55"'))

    # ---------- the main walls
    g.append(R(mM, 22, 206, 318, FND - 206, CLAP, INK, LB))
    g.append(wpath([[(24, y), (338, y)] for y in range(218, FND - 2, 10)], CLAPD, 1.3, 0.9, m=mM))
    g.append(wpath([[(24, y + 2.2), (338, y + 2.2)] for y in range(218, FND - 2, 10)], CLAPL, 1.0, 0.35, m=mM, seg=40))
    # missing boards and a split board
    for (bx, by, bw) in ((28, 288, 34), (300, 404, 26), (176, 494, 30)):
        g.append(R(mM, bx, by, bw, 6, NIGHT, INK, 1.0))
    g.append(P(mM, f"M186,{248} L200,{252} L214,{247}", "none", INK, 1.2, 'opacity="0.7"'))
    streaks = [[(x, y0), (x + 0.6, y0 + ln)] for (x, y0, ln) in ((96, 326, 40), (132, 324, 26), (246, 326, 48), (270, 330, 30),
                                                               (64, 496, 30), (110, 494, 22), (186, 226, 60), (208, 228, 34))]
    g.append(wpath(streaks, SHADE, 3.2, 0.16, m=mM))
    # corner boards, belt course, frieze under the eave
    g.append(R(mM, 22, 206, 9, FND - 206, HTRIM2, INK, LM))
    g.append(R(mM, 331, 206, 9, FND - 206, HTRIM2, INK, LM))
    g.append(R(mM, 18, 328, 326, 10, HTRIM, INK, LM))
    g.append(L(mM, 22, 341, 338, 341, SHADE, 3.0, 'opacity="0.3"'))
    g.append(R(mM, 18, 206, 326, 14, HTRIM2, INK, LM))
    g.append(L(mM, 22, 223, 338, 223, SHADE, 4.0, 'opacity="0.3"'))
    for x in range(40, 336, 24):                                                                   # eave brackets
        g.append(P(mM, f"M{x-4},220 L{x+4},220 L{x+4},226 Q{x},234 {x-4},226 Z", HTRIM, INK, 1.1))

    # ---------- the front gable over the left bay (fish-scale shingles, bargeboards, the round attic window)
    gpts = [(16, 214), (116, 66), (212, 214)]
    gd = poly([mM(p) for p in gpts])
    g.append(clip("hhgableclip", inset([mM(p) for p in gpts], 2.0)))
    g.append(path(gd, CLAP, INK, LB))
    g.append('<g clip-path="url(#hhgableclip)">')
    sc = []
    for i, y in enumerate(range(92, 212, 10)):
        off = 5 if i % 2 else 0
        half = (y - 66) / 148 * 98 + 8
        sc.append((116 - half + off - 10, 116 + half + 6, y, 10, 0.75))
    g.append(wscallops(sc, CLAPD, 1.2, 0.9, m=mM))
    g.append('</g>')
    # the bargeboards, with a drip of gingerbread under them
    for (a, b) in (((10, 218), (116, 58)), ((116, 58), (222, 218))):
        ax, ay = mM(a); bx, by = mM(b)
        dx, dy = bx - ax, by - ay; Lg = math.hypot(dx, dy); nx, ny = -dy / Lg * 9, dx / Lg * 9
        if nx < 0 and a[0] < 116: nx, ny = -nx, -ny
        if ny < 0: nx, ny = -nx, -ny
        g.append(path(poly([(ax, ay), (bx, by), (bx + nx, by + ny), (ax + nx, ay + ny)]), HTRIM, INK, LM))
        for t in [i / 9 for i in range(1, 9)]:
            px, py = ax + dx * t + nx, ay + dy * t + ny
            g.append(ellipse(px, py + 3.5, 2.6, 3.4, HTRIM, INK, 1.0))
    ax, ay = mM((116, 58))
    g.append(path(f"M{ax:.1f},{ay-2:.1f} L{ax:.1f},{ay-22:.1f}", "none", IRON, 2.6))                    # the finial spike
    g.append(path(f"M{ax-4:.1f},{ay-14:.1f} L{ax:.1f},{ay-26:.1f} L{ax+4:.1f},{ay-14:.1f} Z", IRON, INK, 1.0))
    g.append(C(ID, ax, ay - 8, 3.2, IRON, INK, 1.0))
    # the round attic window: lit green, four panes, one cracked
    ox, oy = mM((116, 146))
    g.append(f'<circle cx="{ox:.1f}" cy="{oy:.1f}" r="25" fill="{HTRIM}" stroke="{INK}" stroke-width="{LB}"/>')
    g.append(f'<circle cx="{ox:.1f}" cy="{oy:.1f}" r="18" fill="url(#hhglass)" stroke="{INK}" stroke-width="{LM}"/>')
    g.append(path(f"M{ox-18:.1f},{oy:.1f} L{ox+18:.1f},{oy:.1f} M{ox:.1f},{oy-18:.1f} L{ox:.1f},{oy+18:.1f}", "none", HTRIM2, 3.2))
    g.append(path(f"M{ox-18:.1f},{oy:.1f} L{ox+18:.1f},{oy:.1f} M{ox:.1f},{oy-18:.1f} L{ox:.1f},{oy+18:.1f}", "none", INK, 1.0, 'opacity="0.7"'))
    g.append(path(f"M{ox+4:.1f},{oy-14:.1f} L{ox+9:.1f},{oy-8:.1f} L{ox+7:.1f},{oy-4:.1f} L{ox+14:.1f},{oy-3:.1f}", "none", INK, 1.0))
    g.append(path(f"M{ox-13:.1f},{oy-6:.1f} Q{ox-11:.1f},{oy-12:.1f} {ox-6:.1f},{oy-14:.1f}", "none", "#FFFFFF", 1.6, 'opacity="0.5"'))
    # moonlight on the left rake
    g.append(wpath([[(20, 208), (116, 70)]], LAV, 1.6, 0.3, m=mM))

    # ---------- windows of the main block
    def sash_window(m, x, y, w, h, fill, rail=None, sill=True, cap=True):
        out = [R(m, x - 6, y - 6, w + 12, h + 10, HTRIM2, INK, LM)]                     # casing
        if cap:
            out.append(P(m, poly([(x - 12, y - 6), (x + w + 12, y - 6), (x + w + 6, y - 16), (x - 6, y - 16)]), HTRIM, INK, LM))
        out.append(R(m, x, y, w, h, fill, INK, LB))
        return out
    def sill_of(m, x, y, w, h, lit=False):
        out = [R(m, x - 9, y + h, w + 18, 7, HTRIM, INK, LM), L(m, x - 6, y + h + 9, x + w + 6, y + h + 9, SHADE, 2.6, 'opacity="0.35"')]
        if lit:                                                   # the green light catching the sill
            out.append(L(m, x - 5, y + h + 2, x + w + 5, y + h + 2, SICK1, 1.8, 'opacity="0.6"'))
        return out
    def shutter(m, x, y, w, h, fill=HTRIM2):
        out = [R(m, x, y, w, h, fill, INK, LM)]
        for yy in range(int(y + 6), int(y + h - 3), 6):
            out.append(L(m, x + 3, yy, x + w - 3, yy + 2, INK, 1.0, 'opacity="0.55"'))
        return out

    # 1) upstairs left: the ghost window
    gx, gy, gw, gh = 88, 236, 58, 80
    g += sash_window(mM, gx, gy, gw, gh, "url(#hhglass)")
    g.append(clip("hhghostclip", [mM(p) for p in ((gx, gy), (gx + gw, gy), (gx + gw, gy + gh), (gx, gy + gh))]))
    g.append('<g clip-path="url(#hhghostclip)">')
    gm = mM
    for side in (-1, 1):                                          # tattered curtains
        x0 = gx if side < 0 else gx + gw
        cp = [(x0, gy), (x0 + side * 16, gy), (x0 + side * 12, gy + 26), (x0 + side * 6, gy + 44),
              (x0 + side * 9, gy + 60), (x0 + side * 4, gy + 66), (x0 + side * 5, gy + 80), (x0, gy + 80)]
        g.append(P(gm, poly(cp), "#3E2A52", INK, 1.1, 'opacity="0.9"'))
    cx0 = gx + gw / 2 + 1
    ghost = [(cx0, gy + 12), (cx0 + 12, gy + 16), (cx0 + 17, gy + 30), (cx0 + 25, gy + 40), (cx0 + 22, gy + 45), (cx0 + 18, gy + 44),
             (cx0 + 19, gy + 58), (cx0 + 22, gy + 70), (cx0 + 14, gy + 66), (cx0 + 8, gy + 72), (cx0, gy + 66),
             (cx0 - 8, gy + 72), (cx0 - 14, gy + 66), (cx0 - 22, gy + 70), (cx0 - 19, gy + 58), (cx0 - 18, gy + 44),
             (cx0 - 22, gy + 45), (cx0 - 25, gy + 40), (cx0 - 17, gy + 30), (cx0 - 12, gy + 16)]
    g.append(P(gm, smooth_closed(ghost, 0.45), GHOST, INK, LM, 'opacity="0.95"'))
    g.append(P(gm, f"M{cx0+12},{gy+22} Q{cx0+15},{gy+40} {cx0+13},{gy+62}", "none", "#B6D59A", 2.4, 'opacity="0.7"'))
    g.append(E(gm, cx0 - 6, gy + 30, 3.4, 5.0, PUPIL, "none", 0))
    g.append(E(gm, cx0 + 6, gy + 30, 3.4, 5.0, PUPIL, "none", 0))
    g.append(E(gm, cx0, gy + 44, 2.8, 3.8, PUPIL, "none", 0))
    g.append('</g>')
    g.append(R(mM, gx, gy + 48, gw, 4, HTRIM2, INK, 1.0))                        # the meeting rail, below the face
    g.append(R(mM, gx, gy, gw, gh, "none", INK, LB))
    g.append(L(mM, gx + 5, gy + 6, gx + 5, gy + 42, "#FFFFFF", 1.6, 'opacity="0.35"'))
    g += sill_of(mM, gx, gy, gw, gh, True)
    g += shutter(mM, gx - 26, gy - 2, 17, gh + 4)
    g += shutter(comp(mM, rot(gx + gw + 8, gy - 2, 24)), gx + gw + 8, gy - 2, 17, gh + 4)            # hanging by its top hinge
    g.append(C(mM, gx + gw + 9, gy + 1, 1.8, IRON, INK, 0.8))

    # 2) upstairs right: boarded up
    bx, by, bw, bh = 232, 236, 58, 80
    g += sash_window(mM, bx, by, bw, bh, DARKWIN)
    g.append(clip("hhboardclip", [mM(p) for p in ((bx, by), (bx + bw, by), (bx + bw, by + bh), (bx, by + bh))]))
    g.append('<g clip-path="url(#hhboardclip)">')
    g.append(P(mM, poly([(bx + 10, by + 30), (bx + 24, by + 22), (bx + 30, by + 40), (bx + 40, by + 34), (bx + 36, by + 56), (bx + 18, by + 58)]), "#0F0920", "none", 0))
    g.append(L(mM, bx + 6, by + 10, bx + 22, by + 26, "#FFFFFF", 1.4, 'opacity="0.25"'))
    g.append('</g>')
    g.append(R(mM, bx, by, bw, bh, "none", INK, LB))
    for (px, py, pw, ph, a) in ((bx - 8, by + 14, bw + 16, 13, -9), (bx - 6, by + 44, bw + 14, 13, 6), (bx - 4, by + 62, bw + 10, 12, -3)):
        pm = comp(mM, rot(px + pw / 2, py + ph / 2, a))
        g.append(R(pm, px, py, pw, ph, WOOD, INK, LM))
        g.append(L(pm, px + 4, py + ph * 0.45, px + pw - 10, py + ph * 0.5, WOOD2, 1.1, 'opacity="0.8"'))
        g.append(L(pm, px + 3, py + 2.5, px + pw - 3, py + 2.5, "#8A6A80", 1.1, 'opacity="0.55"'))
        for nx_ in (px + 5, px + pw - 5):
            g.append(C(pm, nx_, py + ph / 2, 1.5, STEEL2, INK, 0.7))
    g += sill_of(mM, bx, by, bw, bh)
    g.append(C(mM, bx - 9, by + 12, 1.8, IRON, INK, 0.8)); g.append(C(mM, bx - 9, by + 66, 1.8, IRON, INK, 0.8))   # hinges, shutter gone
    g += shutter(mM, bx + bw + 9, by - 2, 17, bh + 4)
    g.append(L(mM, bx + bw + 16, by + 20, bx + bw + 21, by + 44, INK, 1.1))                                   # its crack

    # 3) downstairs left: the candelabra window
    lx, ly, lw, lh = 60, 382, 58, 104
    g += sash_window(mM, lx, ly, lw, lh, "url(#hhglass2)")
    g.append(clip("hhcandleclip", [mM(p) for p in ((lx, ly), (lx + lw, ly), (lx + lw, ly + lh), (lx, ly + lh))]))
    g.append('<g clip-path="url(#hhcandleclip)">')
    for side in (-1, 1):
        x0 = lx if side < 0 else lx + lw
        cp = [(x0, ly), (x0 + side * 18, ly), (x0 + side * 10, ly + 30), (x0 + side * 7, ly + 50), (x0 + side * 12, ly + 72),
              (x0 + side * 6, ly + 80), (x0 + side * 8, ly + 104), (x0, ly + 104)]
        g.append(P(mM, poly(cp), "#3E2A52", INK, 1.1, 'opacity="0.9"'))
    cxl = lx + lw / 2
    sil = "#1B1230"
    g.append(R(mM, lx + 8, ly + 84, lw - 16, 5, sil, "none", 0))                                 # the table
    g.append(R(mM, lx + 12, ly + 89, 3, 16, sil, "none", 0)); g.append(R(mM, lx + lw - 15, ly + 89, 3, 16, sil, "none", 0))
    g.append(P(mM, f"M{cxl-7},{ly+84} L{cxl+7},{ly+84} L{cxl+3},{ly+78} L{cxl+2},{ly+58} L{cxl-2},{ly+58} L{cxl-3},{ly+78} Z", sil, "none", 0))
    g.append(P(mM, f"M{cxl-15},{ly+50} Q{cxl-15},{ly+62} {cxl},{ly+62} Q{cxl+15},{ly+62} {cxl+15},{ly+50}", "none", sil, 3.0))
    for dx_ in (-15, 0, 15):
        top = ly + (42 if dx_ else 36)
        g.append(R(mM, cxl + dx_ - 4, top + 8, 8, 4, sil, "none", 0))
        g.append(R(mM, cxl + dx_ - 2.5, top, 5, 9, LINEN, INK, 0.9))
        g.append(P(mM, f"M{cxl+dx_},{top-9} Q{cxl+dx_+3},{top-3} {cxl+dx_},{top-1} Q{cxl+dx_-3},{top-3} {cxl+dx_},{top-9} Z", "#FFF6C0", INK, 0.8))
    g.append(L(mM, cxl, ly + 58, cxl, ly + 46, sil, 3.0))
    g.append('</g>')
    g.append(R(mM, lx, ly + 52, lw, 4, HTRIM2, INK, 1.0))
    g.append(R(mM, lx, ly, lw, lh, "none", INK, LB))
    g.append(L(mM, lx + 5, ly + 6, lx + 5, ly + 46, "#FFFFFF", 1.6, 'opacity="0.35"'))
    g += sill_of(mM, lx, ly, lw, lh, True)
    g += shutter(comp(mM, rot(lx - 9, ly - 2, -16)), lx - 26, ly - 2, 17, lh + 4)                 # hanging askew
    g += shutter(mM, lx + lw + 9, ly - 2, 17, lh + 4)
    g.append(C(mM, lx - 9, ly + 1, 1.8, IRON, INK, 0.8))

    # ---------- the tower (right), leaning right, clapboard, three levels
    TX0, TX1, TOP = 338, 444, 176
    g.append(R(tM, TX0, TOP, TX1 - TX0, FND - TOP, TCLAP, INK, LB))
    g.append(wpath([[(TX0 + 2, y), (TX1 - 2, y)] for y in range(TOP + 12, FND - 2, 10)], CLAPD, 1.3, 0.9, m=tM))
    g.append(wpath([[(TX0 + 2, y + 2.2), (TX1 - 2, y + 2.2)] for y in range(TOP + 12, FND - 2, 10)], CLAPL, 1.0, 0.3, m=tM, seg=40))
    g.append(R(tM, TX0, TOP, 8, FND - TOP, HTRIM2, INK, LM))
    g.append(R(tM, TX1 - 8, TOP, 8, FND - TOP, HTRIM2, INK, LM))
    g.append(R(tM, TX0 - 4, 330, TX1 - TX0 + 8, 10, HTRIM, INK, LM))
    g.append(R(tM, TX0 - 4, 242, TX1 - TX0 + 8, 9, HTRIM, INK, LM))
    g.append(L(tM, TX0, 253, TX1, 253, SHADE, 3.0, 'opacity="0.3"')); g.append(L(tM, TX0, 342, TX1, 342, SHADE, 3.0, 'opacity="0.3"'))
    g.append(wpath([[(TX0 + 2, FND - 4), (TX0 + 2, TOP + 4)]], LAV, 1.6, 0.3, m=tM))
    # the flared eave with brackets
    g.append(P(tM, poly([(TX0 - 14, TOP + 2), (TX1 + 14, TOP + 2), (TX1 + 6, TOP + 12), (TX0 - 6, TOP + 12)]), HTRIM, INK, LM))
    for x in range(TX0 + 8, TX1 - 4, 16):
        g.append(P(tM, f"M{x-3},{TOP+12} L{x+3},{TOP+12} L{x+3},{TOP+17} Q{x},{TOP+23} {x-3},{TOP+17} Z", HTRIM, INK, 1.0))
    # the spire: a tall witch hat, leaning further and flopping over at the tip; fish-scale slates
    b0 = tM((TX0 - 16, TOP + 3)); b1 = tM((TX1 + 16, TOP + 3))
    sp = [b0, (b0[0] + 18, b0[1] - 12), (b0[0] + 34, b0[1] - 40), (b0[0] + 46, b0[1] - 80), (b0[0] + 56, b0[1] - 118),
          (b0[0] + 64, b0[1] - 144), (b0[0] + 76, b0[1] - 160), (b0[0] + 92, b0[1] - 164), (b0[0] + 104, b0[1] - 156),
          (b0[0] + 94, b0[1] - 150), (b0[0] + 86, b0[1] - 138), (b0[0] + 84, b0[1] - 116), (b0[0] + 90, b0[1] - 78),
          (b0[0] + 104, b0[1] - 38), (b1[0] - 16, b1[1] - 12), b1]
    sd = smooth_closed(sp, 0.35)
    from wobble import parse, _samples
    spp = []
    for seg in parse(sd)[0][1]: spp += _samples(seg, 6.0)[:-1]
    g.append(clip("hhspireclip", inset(spp, 2.0)))
    g.append(path(sd, SLATE, INK, LB))
    g.append('<g clip-path="url(#hhspireclip)">')
    sc = []
    for i, y in enumerate(range(int(b0[1] - 150), int(b0[1] + 4), 10)):
        off = 5 if i % 2 else 0
        xs = [p[0] for p in spp if abs(p[1] - y) < 6]
        if not xs: continue
        sc.append((min(xs) - 10 + off, max(xs) + 4, y, 10, 0.75))
    g.append(wscallops(sc, SLATE2, 1.2, 0.9))
    g.append(path(smooth_open([(b0[0] + 64, b0[1] - 150), (b0[0] + 56, b0[1] - 110), (b0[0] + 42, b0[1] - 60), (b0[0] + 22, b0[1] - 14)], 0.5), "none", LAV, 2.0, 'opacity="0.28"'))
    g.append('</g>')
    tipx, tipy = b0[0] + 104, b0[1] - 156
    g.append(C(ID, tipx + 2, tipy + 3, 3.4, IRON, INK, 1.0))
    # the tower's windows
    # a) belfry: a dark lancet with two green eyes in it
    ex, ey, ew, eh = 377, 190, 28, 42
    g.append(P(tM, arch_d(ex - 5, ey - 5, ew + 10, eh + 8), HTRIM2, INK, LM))
    g.append(P(tM, arch_d(ex, ey, ew, eh), DARKWIN, INK, LB))
    e1 = tM((ex + 9, ey + 24)); e2 = tM((ex + 19, ey + 24))
    for (xx, yy) in (e1, e2):
        g.append(ellipse(xx, yy, 3.2, 2.0, SICK1, INK, 0.8))
        g.append(ellipse(xx, yy, 0.8, 1.8, PUPIL, "none", 0))
    # b) first floor: arched, lit, a cat on the sill
    wx, wy, ww, wh = 368, 262, 46, 60
    g.append(P(tM, arch_d(wx - 6, wy - 6, ww + 12, wh + 10), HTRIM2, INK, LM))
    g.append(P(tM, arch_d(wx, wy, ww, wh), "url(#hhglass)", INK, LB))
    cm = tM; cx_, cy_ = wx + 30, wy + wh
    catd = (f"M{cx_-9},{cy_} C{cx_-11},{cy_-10} {cx_-9},{cy_-18} {cx_-6},{cy_-21} L{cx_-8},{cy_-31} L{cx_-3},{cy_-26} "
            f"C{cx_-1},{cy_-27} {cx_+1},{cy_-27} {cx_+3},{cy_-26} L{cx_+8},{cy_-31} L{cx_+6},{cy_-21} "
            f"C{cx_+9},{cy_-18} {cx_+11},{cy_-10} {cx_+9},{cy_} Z")
    g.append(P(cm, catd, "#140C22", "none", 0))
    g.append(P(cm, f"M{cx_+8},{cy_-2} C{cx_+18},{cy_-2} {cx_+20},{cy_-10} {cx_+16},{cy_-16}", "none", "#140C22", 3.2))
    g.append(P(tM, f"M{wx},{wy+30} L{wx+ww},{wy+30} M{wx+ww/2},{wy} L{wx+ww/2},{wy+30}", "none", HTRIM2, 3.0))
    g.append(P(tM, arch_d(wx, wy, ww, wh), "none", INK, LB))
    g += sill_of(tM, wx, wy, ww, wh, True)
    # c) ground floor: dark, behind the porch
    dx0, dy0, dw0, dh0 = 370, 384, 44, 92
    g += sash_window(tM, dx0, dy0, dw0, dh0, DARKWIN)
    g.append(R(tM, dx0, dy0 + 44, dw0, 4, HTRIM2, INK, 1.0))
    g.append(L(tM, dx0 + 8, dy0 + 34, dx0 + 26, dy0 + 10, "#FFFFFF", 1.6, 'opacity="0.22"'))
    g.append(L(tM, dx0 + 8, dy0 + 82, dx0 + 22, dy0 + 60, "#FFFFFF", 1.4, 'opacity="0.18"'))
    g.append(P(tM, poly([(dx0, dy0), (dx0 + 16, dy0), (dx0 + 8, dy0 + 40), (dx0, dy0 + 44)]), "#3E2A52", INK, 1.0))
    g += sill_of(tM, dx0, dy0, dw0, dh0)

    # ---------- the foundation
    g.append(R(mM, 18, FND, 326, G - FND, STONE2, INK, LB))
    g.append(R(tM, TX0 - 4, FND, TX1 - TX0 + 8, G - FND, STONE2, INK, LB))
    for (x0, x1, m) in ((18, 344, mM), (TX0 - 4, TX1 + 4, tM)):
        jl = [[(x0 + 2, FND + 15), (x1 - 2, FND + 15)]]
        for j, yy in enumerate((FND, FND + 15)):
            for x in range(int(x0) + (14 if j else 26), int(x1) - 6, 32):
                jl.append([(x, yy + 2), (x, yy + 13)])
        g.append(wpath(jl, NIGHT, 1.2, 0.7, m=m))
    g.append(R(mM, 40, 541, 30, 16, NIGHT, INK, LM))                                           # cellar vent
    for x in (47, 55, 63):
        g.append(L(mM, x, 542, x, 556, IRON, 2.0))

    # ---------- the porch
    PX0, PX1 = 146, 388
    DECK = 528
    # shadow under the porch roof on the walls behind
    g.append(ppoly([(PX0 - 6, 350), (PX1 + 6, 350), (PX1 + 6, DECK), (PX0 - 6, DECK)], f'fill="{SHADE}" opacity="0.2"'))
    # the door: heavy, arched, planked, iron straps, a round knocker, a green fanlight
    DX, DW, DY = 228, 70, 360
    g.append(P(mM, arch_d(DX - 10, DY - 10, DW + 20, DECK - DY + 10), HTRIM2, INK, LB))
    g.append(P(mM, arch_d(DX, DY, DW, DECK - DY), DOOR, INK, LB))
    fr = DW / 2
    fan = f"M{DX},{DY+fr} C{DX},{DY+fr-fr*0.5523} {DX+fr-fr*0.5523},{DY} {DX+fr},{DY} C{DX+fr+fr*0.5523},{DY} {DX+DW},{DY+fr-fr*0.5523} {DX+DW},{DY+fr} Z"
    g.append(P(mM, fan, "url(#hhglass)", INK, LM))
    for a in (30, 60, 90, 120, 150):
        r_ = math.radians(a)
        g.append(L(mM, DX + fr, DY + fr, DX + fr - fr * math.cos(r_), DY + fr - fr * math.sin(r_), HTRIM2, 2.0))
    g.append(L(mM, DX, DY + fr, DX + DW, DY + fr, HTRIM2, 3.0))
    for x in range(DX + 12, DX + DW - 4, 12):
        g.append(L(mM, x, DY + fr + 3, x, DECK - 2, DOOR2, 1.4, 'opacity="0.9"'))
    for yy in (DY + fr + 22, DECK - 34):
        g.append(R(mM, DX + 2, yy, DW - 4, 7, IRON, INK, 1.1))
        for xx in (DX + 8, DX + DW - 8):
            g.append(C(mM, xx, yy + 3.5, 1.4, STEEL3, "none", 0))
    kx, ky = mM((DX + fr, DY + 88))
    g.append(f'<circle cx="{kx:.1f}" cy="{ky-8:.1f}" r="4.2" fill="{GOLD2}" stroke="{INK}" stroke-width="1.1"/>')
    g.append(f'<circle cx="{kx:.1f}" cy="{ky+2:.1f}" r="9" fill="none" stroke="{INK}" stroke-width="5"/>')
    g.append(f'<circle cx="{kx:.1f}" cy="{ky+2:.1f}" r="9" fill="none" stroke="{GOLD2}" stroke-width="2.4"/>')
    g.append(E(mM, DX + DW - 12, DY + 104, 2.2, 3.2, NIGHT, INK, 0.8))                              # keyhole
    g.append(L(mM, DX + 5, DY + fr + 6, DX + 5, DECK - 6, LAV, 1.4, 'opacity="0.25"'))
    # the deck and the lattice skirt under it
    g.append(R(ID, PX0 - 6, DECK, PX1 - PX0 + 12, 10, HWOOD, INK, LM))
    g.append(L(ID, PX0 - 4, DECK + 2.5, PX1 + 4, DECK + 2.5, LAV, 1.2, 'opacity="0.3"'))
    g.append(R(ID, PX0 - 2, DECK + 10, PX1 - PX0 + 4, G - DECK - 10, NIGHT, INK, LM))
    lat = [wpath([ln for x in range(PX0 - 40, PX1 + 20, 12) for ln in ([(x, G), (x + 26, DECK + 10)], [(x, DECK + 10), (x + 26, G)])], HWOOD2, 2.2, seg=40)]
    g.append(clip("hhlatclip", [(PX0, DECK + 11), (PX1 - 2, DECK + 11), (PX1 - 2, G - 1), (PX0, G - 1)]))
    g.append('<g clip-path="url(#hhlatclip)">'); g.extend(lat)
    g.append(path(smooth_closed([(PX0 + 24, G - 2), (PX0 + 30, DECK + 16), (PX0 + 44, DECK + 18), (PX0 + 50, G - 2)], 0.5), NIGHT, INK, 1.0))  # a hole kicked in it
    g.append('</g>')
    # the steps (wood, one tread broken), hanging below the ground line
    SX0, SX1 = 218, 316
    for i, (ins_, y0, y1) in enumerate(((0, DECK, DECK + 12), (-8, DECK + 12, DECK + 24), (-16, DECK + 24, G + 3))):
        g.append(R(ID, SX0 + ins_, y0, SX1 - SX0 - 2 * ins_, y1 - y0, HWOOD, INK, LM))
        g.append(L(ID, SX0 + ins_ + 3, y0 + 2.5, SX1 - ins_ - 3, y0 + 2.5, LAV, 1.2, 'opacity="0.3"'))
        g.append(L(ID, SX0 + ins_ + 2, y1 - 2, SX1 - ins_ - 2, y1 - 2, SHADE, 2.0, 'opacity="0.3"'))
    g.append(path(poly([(284, DECK + 12), (300, DECK + 12), (296, DECK + 18), (290, DECK + 16), (286, DECK + 21)]), NIGHT, INK, 1.0))
    g.append(ppoly([(DX + 2, DECK), (DX + DW - 2, DECK), (SX1 - 2, G + 2), (SX0 + 2, G + 2)], f'fill="{SICK1}" opacity="0.13"'))
    # the porch roof: a sagging band of slate over a trim beam
    beam = [(PX0 - 12, 344), (266, 349), (PX1 + 12, 343)]
    roofb = [(PX0 - 16, 330), (PX0 - 10, 322), (PX1 + 10, 321), (PX1 + 16, 329)]
    g.append(path(smooth_closed([(PX0 - 16, 344), (PX0 - 12, 322), (266, 326), (PX1 + 12, 320), (PX1 + 16, 343), (266, 350)], 0.12), SLATE, INK, LB))
    g.append(wpath([[(PX0 - 12, 333), (266, 338), (PX1 + 12, 332)]], SLATE2, 1.6, 0.9, seg=30))
    g.append(path(smooth_closed([(PX0 - 14, 342), (266, 348), (PX1 + 14, 341), (PX1 + 14, 356), (266, 362), (PX0 - 14, 357)], 0.12), HTRIM, INK, LM))
    g.append(wpath([[(PX0 - 10, 345.5), (266, 351.5), (PX1 + 10, 344.5)]], "#FFFFFF", 1.2, 0.3, seg=30))
    # posts, turned, one leaning; gingerbread brackets at their tops
    posts = [(PX0, 0.0), (212, 0.0), (322, 0.0), (PX1 - 4, 0.045)]
    for (px, k) in posts:
        topy = 357 + 5 * math.sin(math.pi * (px - PX0) / (PX1 - PX0))
        pm = lean(k, DECK)
        g.append(R(pm, px - 4, topy, 8, DECK - topy, HTRIM, INK, LM))
        for yy in (topy + 10, DECK - 16):
            g.append(E(pm, px, yy, 6, 3, HTRIM, INK, 1.1))
        g.append(L(pm, px - 1.5, topy + 16, px - 1.5, DECK - 22, "#FFFFFF", 1.1, 'opacity="0.35"'))
        for sgn in (-1, 1):
            if (px == PX0 and sgn < 0) or (px == PX1 - 4 and sgn > 0): continue
            g.append(P(pm, f"M{px},{topy} L{px+sgn*18},{topy} Q{px+sgn*6},{topy+4} {px},{topy+18} Z", HTRIM, INK, 1.1))
            g.append(C(pm, px + sgn * 6, topy + 5, 2.0, NIGHT, "none", 0))
    # the railings: the left one broken in the middle, the right one tipping with its post
    def railing(x0, x1, m, broken=False):
        out = []
        top, bot = 470, 516
        if broken:
            mid = (x0 + x1) / 2
            out.append(P(m, poly([(x0 + 4, top), (mid - 2, top + 9), (mid - 2, top + 15), (x0 + 4, top + 6)]), HTRIM, INK, LM))
            out.append(P(m, poly([(mid + 3, top + 12), (x1 - 4, top), (x1 - 4, top + 6), (mid + 3, top + 18)]), HTRIM, INK, LM))
        else:
            out.append(R(m, x0 + 4, top, x1 - x0 - 8, 6, HTRIM, INK, LM))
        out.append(R(m, x0 + 4, bot, x1 - x0 - 8, 5, HTRIM, INK, LM))
        xs = list(range(int(x0) + 10, int(x1) - 6, 8)); bal = []
        for i, x in enumerate(xs):
            if broken and i in (3,): continue
            t0 = top + 6
            if broken:
                mid = (x0 + x1) / 2
                t0 = top + 6 + 9 * (1 - abs(x - mid) / ((x1 - x0) / 2))
            bal.append([(x, t0), (x, bot)])
        out.append(wpath(bal, INK, 4.6, m=m, seg=40)); out.append(wpath(bal, HTRIM2, 2.6, m=m, seg=40))
        if broken:
            hx = xs[3]
            out.append(P(comp(m, rot(hx, bot, -28)), rect_d(hx - 1.6, top + 26, 3.2, bot - top - 26), HTRIM2, INK, 0.8))
        return out
    g += railing(PX0, 212, ID, broken=True)
    g += railing(322, PX1 - 4, lean(0.045, DECK))
    # a porch lantern hanging from the beam in the right bay, lit green
    lnx, lny = 347, 386
    g.append(path(f"M{lnx:.1f},{358} L{lnx:.1f},{lny-12:.1f}", "none", IRON, 1.6))
    g.append(path(poly([(lnx - 7, lny - 4), (lnx + 7, lny - 4), (lnx + 5, lny + 18), (lnx - 5, lny + 18)]), "url(#hhglass)", INK, LM))
    g.append(path(poly([(lnx - 9, lny - 4), (lnx, lny - 12), (lnx + 9, lny - 4)]), IRON, INK, 1.1))
    g.append(path(f"M{lnx-6:.1f},{lny+18:.1f} L{lnx+6:.1f},{lny+18:.1f} L{lnx:.1f},{lny+24:.1f} Z", IRON, INK, 1.1))
    g.append(path(f"M{lnx:.1f},{lny-2:.1f} L{lnx:.1f},{lny+17:.1f}", "none", IRON, 1.0, 'opacity="0.6"'))

    # ---------- a dead creeper up the tower's right corner
    V = "#170F22"
    vx = lambda y: tM((446, y))[0]
    g.append(path(smooth_open([(vx(564) + 4, 564), (vx(520) - 3, 520), (vx(470) + 3, 470), (vx(420) - 2, 420)], 0.5), "none", V, 4.4))
    g.append(path(smooth_open([(vx(420) - 2, 420), (vx(370) + 3, 370), (vx(320) - 1, 320), (vx(280) + 2, 282)], 0.5), "none", V, 3.0))
    for (y0, dx_, up) in ((500, -1, 1), (452, 1, -1), (398, -1, 1), (346, 1, 1), (300, -1, -1)):
        x0 = vx(y0)
        g.append(path(f"M{x0:.1f},{y0} C{x0+dx_*10:.1f},{y0-4*up} {x0+dx_*16:.1f},{y0+6} {x0+dx_*10:.1f},{y0+10} C{x0+dx_*6:.1f},{y0+12} {x0+dx_*5:.1f},{y0+6} {x0+dx_*8:.1f},{y0+5}", "none", V, 1.8))
    for (y0, a) in ((486, -40), (432, 30), (380, -30), (330, 40), (292, -20)):
        x0 = vx(y0) + (3 if a < 0 else -3)
        g.append(P(rot(x0, y0, a), f"M{x0:.1f},{y0} Q{x0+5:.1f},{y0-5} {x0+10:.1f},{y0} Q{x0+5:.1f},{y0+4} {x0:.1f},{y0} Z", "#2E1E36", INK, 0.9))
    # a broken gutter hanging off the eave on the right
    g.append(P(mM, f"M232,221 L300,221", "none", INK, 5.2))
    g.append(P(mM, f"M232,221 L300,221", "none", HTRIM2, 3.0))
    gp = comp(rot(mM((300, 221))[0], 221, 64), mM)
    g.append(P(gp, "M300,221 L338,221", "none", INK, 5.2))
    g.append(P(gp, "M300,221 L338,221", "none", HTRIM2, 3.0))

    flames = [mM((cxl + dx_, ly + (42 if dx_ else 36) - 5)) for dx_ in (-15, 0, 15)]
    ANCH["haunted"] = {"name": "haunted", "W": W, "H": H, "G": G, "kind": "building", "anchors": {
        "signs": [],
        "windows": [dict(bbox([(ox - 18, oy - 18), (ox + 18, oy + 18)]), what="round attic window, green"),
                    dict(bbox(quad(mM, gx, gy, gw, gh)), what="upstairs, the ghost"),
                    dict(bbox(quad(mM, lx, ly, lw, lh)), what="downstairs, the candelabra"),
                    dict(bbox(quad(tM, wx, wy, ww, wh)), what="tower, the cat on the sill"),
                    dict(bbox(quad(mM, DX, DY, DW, fr)), what="the door's fanlight"),
                    dict(bbox([(lnx - 7, lny - 4), (lnx + 7, lny + 18)]), what="porch lantern glass")],
        "doors": [bbox(quad(mM, DX, DY, DW, DECK - DY))],
        "smoke": [pt(cM((279, 84)), what="thin grey-green wisps from the crumbling chimney")],
        "fire": [pt(f, what="candle flame in the window, flicker") for f in flames],
        "light": [pt((lnx, lny + 7), what="porch lantern, green, slow flicker"),
                  pt(((DX + DW / 2), G), what="green light pool on the steps under the fanlight")],
        "eyes": [pt(e1, what="belfry eyes: blink now and then"), pt(e2)],
        "ghost": dict(bbox(quad(mM, gx + 4, gy + 10, gw - 8, 62)), what="the ghost in the window: could bob 2-3 units or fade"),
        "props": {"pumpkin": [pt((186, G), what="pumpkin.svg at ~0.55, base on G, left of the steps (on the lattice)"),
                              pt((354, G), what="second pumpkin at ~0.45, right of the steps")],
                  "cobweb": [pt((150, 358), what="cobweb.svg top-left corner here at ~0.65: the porch's left bay, under the beam")],
                  "deadtree": [dict(bbox([(-150, G - 336 + 8), (62, G + 8)]), what="deadtree.svg box, not mirrored, left of the house: its high bough reaches over the house's left corner")]}}}
    svgx("haunted", W, H, g, defs=defs, step=8, step_lines=12)

# ---------------------------------------------------------------- the Backrooms block
BR_WALL  = "#E9D77A"; BR_WALL2 = "#D9C25C"; BR_WALL3 = "#C9B04E"; BR_END = "#F1E3A4"
BR_CEIL  = "#E6DFB9"; BR_GAP = "#B4A97A"; BR_FLUORO = "#F3F7D8"; BR_CARPET = "#C4AD63"; BR_CARPET2 = "#B09A55"

def backrooms():
    """The Backrooms bleeding into the town: a flat, clean, yellow concrete block lit by nothing, one plain doorway with
    the yellow corridor running away inside it (one-point perspective, a turning off to the right at the far end), a
    blank box sign over it (the site writes EXIT), one fluorescent tube (the site flickers it), a hazard stripe along
    the foot. Nothing else: it is the one thing on the street that nobody drew with care, and that is the joke."""
    W, H = 300, 340; G = H - 16
    g = []
    defs = ('<linearGradient id="brface" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCC864"/>'
            '<stop offset="1" stop-color="#CDB854"/></linearGradient>'
            '<linearGradient id="brfar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6EBB4"/>'
            '<stop offset="1" stop-color="#EBDB8C"/></linearGradient>')
    X0, X1, TOP = 14, 286, 30
    g.append(rect(X0, TOP, X1 - X0, G - TOP, "url(#brface)", INK, LB))
    g.append(rect(X0 - 3, TOP - 7, X1 - X0 + 6, 12, BR_WALL3, INK, LM))                      # the coping
    g.append(line(X0 + 2, TOP + 8, X1 - 2, TOP + 8, SHADE, 2.2, 'opacity="0.12"'))
    # concrete: two faint seams, form-tie holes in a grid. Nothing else. Too clean.
    for x in (64, 236):
        g.append(line(x, TOP + 8, x, G - 22, "#B9A246", 1.2, 'opacity="0.55"'))
    g.append(line(X0 + 2, 176, 98, 176, "#B9A246", 1.2, 'opacity="0.55"'))
    g.append(line(202, 176, X1 - 2, 176, "#B9A246", 1.2, 'opacity="0.55"'))
    for x in (36, 92, 208, 264):
        for y in (60, 120, 228, 280):
            if 90 < x < 210 and y > 62: continue
            g.append(f'<circle cx="{x}" cy="{y}" r="1.9" fill="#B39C42" stroke="none" opacity="0.8"/>')
    # ---- the doorway and the corridor seen through it
    A, B, Cc, D = (102, 118), (198, 118), (198, G), (102, G)
    VP = (133.0, 222.0)
    def Pt(s, p): return (VP[0] + s * (p[0] - VP[0]), VP[1] + s * (p[1] - VP[1]))
    S_JAMB, S_END, S_FAR = 0.92, 0.42, 0.2
    q = lambda pts: poly(pts)
    g.append(clip("brdoorclip", [A, B, Cc, D]))
    g.append('<g clip-path="url(#brdoorclip)">')
    g.append(path(q([A, B, Cc, D]), BR_WALL2, "none", 0))
    fa, fb, fc, fd = Pt(S_FAR, A), Pt(S_FAR, B), Pt(S_FAR, Cc), Pt(S_FAR, D)
    eb, ec = Pt(S_END, B), Pt(S_END, Cc)
    ja, jb, jc, jd = Pt(S_JAMB, A), Pt(S_JAMB, B), Pt(S_JAMB, Cc), Pt(S_JAMB, D)
    # the far wall, lit; and the passage turning off to the right, unlit: its back wall (flat to us, so its ceiling
    # and floor edges run level, not toward the vanishing point), its ceiling and its carpet
    g.append(path(q([fa, fb, fc, fd]), "url(#brfar)", INK, 1.0))
    g.append(path(q([fb, (eb[0] + 2, fb[1]), (eb[0] + 2, fc[1]), fc]), "#B79E45", "none", 0))
    g.append(path(q([fb, (eb[0] + 2, fb[1]), (eb[0] + 2, eb[1] - 1), eb]), "#CBC196", "none", 0))
    g.append(path(q([fc, (eb[0] + 2, fc[1]), (eb[0] + 2, ec[1] + 1), ec]), "#A48E4B", "none", 0))
    for x in (fb[0] + 4, fb[0] + 8.5):
        g.append(line(x, fb[1] + 2, x, fc[1] - 2, "#A58C3C", 1.0, 'opacity="0.7"'))
    # the ceiling: tiles in a grid toward the vanishing point, fluorescent panels down the middle
    g.append(path(q([ja, jb, eb, fb, fa]), BR_CEIL, "none", 0))
    for X in (124, 150, 176):
        p0, p1 = Pt(S_JAMB, (X, A[1])), Pt(S_FAR, (X, A[1]))
        g.append(line(p0[0], p0[1], p1[0], p1[1], BR_GAP, 1.0, 'opacity="0.8"'))
    for z in (1.2, 1.5, 1.85, 2.3, 2.9, 3.7, 4.4):
        s_ = 1 / z; p0, p1 = Pt(s_, A), Pt(s_, B)
        g.append(line(p0[0], p0[1], p1[0], p1[1], BR_GAP, 1.0, 'opacity="0.8"'))
    for (z0, z1) in ((1.02, 1.17), (1.52, 1.72), (2.3, 2.6), (3.7, 4.2)):
        s0, s1 = 1 / z0, 1 / z1
        pa, pb, pc, pd = Pt(s0, (126, A[1])), Pt(s0, (174, A[1])), Pt(s1, (174, A[1])), Pt(s1, (126, A[1]))
        g.append(path(q([pa, pb, pc, pd]), BR_FLUORO, INK, 0.9))
    # carpet
    g.append(path(q([jd, jc, ec, fc, fd]), BR_CARPET, "none", 0))
    for z in (1.35, 1.9, 2.8):
        s_ = 1 / z; p0, p1 = Pt(s_, D), Pt(s_, Cc)
        g.append(line(p0[0], p0[1], p1[0], p1[1], BR_CARPET2, 1.0, 'opacity="0.3"'))
    # the left wall, the wallpaper's stripes closing up toward the end
    g.append(path(q([ja, fa, fd, jd]), "#DCC766", "none", 0))
    for z in (1.12, 1.3, 1.52, 1.8, 2.15, 2.6, 3.2, 4.0):
        s_ = 1 / z; p0, p1 = Pt(s_, A), Pt(s_, D)
        g.append(line(p0[0], p0[1] + 2, p1[0], p1[1] - 2, BR_WALL3, 1.2, 'opacity="0.55"'))
    # the right wall, lit, ending where the passage turns off; its end face catches the light
    g.append(path(q([jb, eb, ec, jc]), BR_WALL, "none", 0))
    for z in (1.12, 1.3, 1.55, 1.85, 2.2):
        s_ = 1 / z; p0, p1 = Pt(s_, B), Pt(s_, Cc)
        g.append(line(p0[0], p0[1] + 2, p1[0], p1[1] - 2, BR_WALL3, 1.2, 'opacity="0.5"'))
    g.append(path(q([eb, (eb[0] + 3.4, eb[1] - 1.2), (ec[0] + 3.4, ec[1] + 1.2), ec]), BR_END, INK, 0.9))
    # the edges, inked thin
    for (a, b) in ((ja, fa), (jd, fd), (jb, eb), (jc, ec), (fa, fb), (fd, fc)):
        g.append(line(a[0], a[1], b[0], b[1], INK, 1.0, 'opacity="0.75"'))
    g.append(line(fb[0], fb[1], eb[0] + 3, fb[1], INK, 1.0, 'opacity="0.75"'))
    g.append(line(fc[0], fc[1], eb[0] + 3, fc[1], INK, 1.0, 'opacity="0.75"'))
    g.append(line(fb[0], fb[1], fc[0], fc[1], INK, 1.0, 'opacity="0.75"'))
    # the jambs and the soffit: the wall's thickness, plain concrete
    g.append(path(q([A, ja, jd, D]), "#C1AA4C", INK, 1.0))
    g.append(path(q([B, jb, jc, Cc]), "#CDB752", INK, 1.0))
    g.append(path(q([A, B, jb, ja]), "#B8A146", INK, 1.0))
    g.append('</g>')
    g.append(rect(A[0], A[1], B[0] - A[0], G - A[1], "none", INK, LB))
    g.append(line(A[0] + 3, G - 1, B[0] - 3, G - 1, INK, 1.4, 'opacity="0.6"'))       # the threshold
    # ---- the blank box sign (the site writes EXIT in red) and the one tube over it
    g.append(rect(122, 84, 56, 24, "#1C1714", INK, LB))
    g.append(rect(125.5, 87.5, 49, 17, "none", "#3B312A", 1.2))
    g.append(line(150, 108, 150, 118, INK, 1.8))
    g.append(rect(100, 56, 100, 12, "#CFCBB6", INK, LM))                                       # the batten
    g.append(line(104, 59, 196, 59, "#FFFFFF", 1.2, 'opacity="0.5"'))
    g.append(rect(104, 66, 92, 6, BR_FLUORO, INK, 1.2))                                        # the tube
    g.append(line(107, 68.2, 193, 68.2, "#FFFFFF", 1.4, 'opacity="0.85"'))
    for x in (104, 196):
        g.append(rect(x - 3.5, 64, 7, 10, "#A9A490", INK, 1.1))
    # ---- the hazard stripe along the foot (not across the doorway)
    for (x0, x1, cid) in ((X0, 102, "brhz1"), (198, X1, "brhz2")):
        g.append(clip(cid, [(x0, G - 18), (x1, G - 18), (x1, G), (x0, G)]))
        g.append(rect(x0, G - 18, x1 - x0, 18, "#E3B22A", "none", 0))
        g.append(f'<g clip-path="url(#{cid})">')
        for x in range(x0 - 24, x1 + 24, 20):
            g.append(path(poly([(x, G), (x + 10, G), (x + 28, G - 18), (x + 18, G - 18)]), "#1A1510", "none", 0))
        g.append('</g>')
        g.append(rect(x0, G - 18, x1 - x0, 18, "none", INK, LM))
    g.append(line(X0, G, X1, G, INK, LB))
    ANCH["backrooms"] = {"name": "backrooms", "W": W, "H": H, "G": G, "kind": "building", "anchors": {
        "signs": [{"x": 125.5, "y": 87.5, "w": 49, "h": 17, "text": "EXIT", "style": "neon-pink (make it red, #FF3B30)", "box": {"x": 122, "y": 84, "w": 56, "h": 24}}],
        "windows": [],
        "doors": [dict(bbox([A, Cc]), what="the open doorway, the corridor drawn inside")],
        "light": [pt((150, 69), what="the fluorescent tube (x 104..196, y 66..72): flicker, a cold buzz"),
                  pt((150, G), what="flat pale-yellow light spilling out of the doorway onto the pavement")],
        "corridor_panels": [bbox([Pt(1 / z0, (126, A[1])), Pt(1 / z1, (174, A[1]))]) for (z0, z1) in ((1.02, 1.17), (1.52, 1.72), (2.3, 2.6), (3.7, 4.2))]}}
    svgx("backrooms", W, H, g, defs=defs, step_lines=12)

# ---------------------------------------------------------------- the back of the graveyard
IRONF = "#2E253F"; IRONHI = "#8A7BA8"
MOUND = "#1C1630"; MOUND2 = "#241D3B"; DISTANT = "#110A1E"

def graveyard_back():
    """What stands at the graveyard's back edge: a low grassy mound with a few far crosses and stones and a small bare
    tree, a path running up it from the gate, and in front a wrought-iron fence between two stone gate pillars with an
    iron arch (a heart in it, a lantern under it), the right leaf of the gate standing ajar."""
    W, H = 680, 156; G = H - 16
    g = []
    defs = lit_glass("gvlamp", SICK1, SICK2)
    # the mound(s): a far ridge with the moon on its crest, a nearer swell in front
    ridge = [(0, G - 60), (90, G - 74), (200, G - 96), (330, G - 88), (470, G - 104), (590, G - 80), (680, G - 66)]
    g.append(path(smooth_open(ridge, 0.5) + f" L680,{G} L0,{G} Z", MOUND, INK, LM))
    g.append(path(smooth_open([(x, y + 2.5) for (x, y) in ridge], 0.5), "none", LAV, 2.0, 'opacity="0.22"'))
    def ridge_y(x):
        from wobble import parse, _samples
        best = None
        for seg in parse(smooth_open(ridge, 0.5))[0][1]:
            for (px, py) in _samples(seg, 4.0):
                if best is None or abs(px - x) < abs(best[0] - x): best = (px, py)
        return best[1]
    for x in range(14, 680, 23):
        if 250 < x < 430: continue
        g += tuft(x, ridge_y(x) + 1, 5 + (x * 7) % 4, ((x * 13) % 5 - 2) * 0.5, MOUND, MOUND)
    g.append(path(smooth_open([(0, G - 36), (120, G - 52), (260, G - 60), (400, G - 54), (540, G - 62), (680, G - 40)], 0.5)
                  + f" L680,{G} L0,{G} Z", MOUND2, INK, LM))
    g.append(path(smooth_open([(0, G - 34), (120, G - 50), (260, G - 58), (400, G - 52), (540, G - 60), (680, G - 38)], 0.5), "none", LAV, 1.6, 'opacity="0.12"'))
    # far crosses and stones on the ridge
    far = [(140, G - 86, 'x', 0), (214, G - 97, 's', -6), (240, G - 95, 'x', 8), (420, G - 99, 's', 4), (452, G - 104, 'x', -5), (520, G - 96, 's', 10), (610, G - 80, 'x', 3), (58, G - 72, 's', -8)]
    for (x, y, kind, a) in far:
        m = rot(x, y, a)
        if kind == 'x':
            g.append(P(m, poly([(x - 2, y + 4), (x - 2, y - 14), (x - 7, y - 14), (x - 7, y - 18), (x - 2, y - 18), (x - 2, y - 23),
                                (x + 2, y - 23), (x + 2, y - 18), (x + 7, y - 18), (x + 7, y - 14), (x + 2, y - 14), (x + 2, y + 4)]), DISTANT, "#3A2E55", 1.0))
        else:
            g.append(P(m, f"M{x-7},{y+4} L{x-7},{y-8} Q{x-7},{y-16} {x},{y-16} Q{x+7},{y-16} {x+7},{y-8} L{x+7},{y+4} Z", DISTANT, "#3A2E55", 1.0))
    # a little bare tree on the hill
    T = lambda pts, w0, w1: tapered_big(pts, w0, w1, 0.5, DISTANT, 5.0, DISTANT, 0)
    g.extend(T([(560, G - 84), (562, G - 110), (556, G - 132)], 7, 2.2))
    g.extend(T([(561, G - 106), (574, G - 118), (582, G - 130)], 3.2, 1.2))
    g.extend(T([(558, G - 120), (546, G - 128), (542, G - 138)], 2.6, 1.0))
    g.extend(T([(556, G - 132), (560, G - 144)], 1.8, 0.8))
    # the path from the gate up the hill
    g.append(path(smooth_closed([(314, G), (330, G - 30), (352, G - 58), (366, G - 74), (372, G - 74), (364, G - 56), (358, G - 28), (366, G)], 0.4), "#342A4C", "none", 0, 'opacity="0.9"'))
    # the stone curb the fence stands on
    g.append(rect(0, G - 9, 268, 9, STONE2, INK, LM))
    g.append(rect(412, G - 9, 268, 9, STONE2, INK, LM))
    for x in range(40, 268, 46): g.append(line(x, G - 8, x, G - 1, NIGHT, 1.1, 'opacity="0.7"'))
    for x in range(452, 680, 46): g.append(line(x, G - 8, x, G - 1, NIGHT, 1.1, 'opacity="0.7"'))
    # the fence: rails, spear-topped pickets, posts with ball finials; one picket bent, one gone
    def picket(x, top, bent=0.0):
        m = rot(x, G - 9, bent)
        return [P(m, f"M{x-1.8},{G-9} L{x-1.8},{top+6} L{x-4.2},{top+8} L{x},{top} L{x+4.2},{top+8} L{x+1.8},{top+6} L{x+1.8},{G-9} Z", IRONF, INK, 1.1)]
    for (x0, x1) in ((0, 268), (412, 680)):
        g.append(rect(x0 - 2, G - 70, x1 - x0 + 4, 5, IRONF, INK, 1.1))
        g.append(rect(x0 - 2, G - 28, x1 - x0 + 4, 5, IRONF, INK, 1.1))
        g.append(line(x0, G - 69, x1, G - 69, IRONHI, 1.0, 'opacity="0.35"'))
        for i, x in enumerate(range(x0 + 8, x1 - 2, 13)):
            if x in (99, 529): continue
            bend = -12 if x in (190,) else (9 if x in (620,) else 0)
            g += picket(x, G - 84 + (3 if i % 2 else 0), bend)
        for px in (x0 + 4 if x0 else 4, x1 - 6 if x1 < 680 else 676, (x0 + x1) // 2):
            if px in (268 - 6, 412 + 4): continue
            g.append(rect(px - 4, G - 80, 8, 72, IRONF, INK, 1.2))
            g.append(f'<circle cx="{px}" cy="{G-84}" r="5" fill="{IRONF}" stroke="{INK}" stroke-width="1.2"/>')
            g.append(line(px - 2, G - 78, px - 2, G - 12, IRONHI, 1.0, 'opacity="0.35"'))
    # grass along the foot
    for x in range(6, 680, 17):
        if 268 < x < 412: continue
        g += tuft(x, G, 7 + (x * 7) % 6, ((x * 13) % 5 - 2) * 0.6, "#221C30", "#34503A")
    # the gate pillars
    for (x0, x1) in ((266, 304), (376, 414)):
        g.append(rect(x0, 44, x1 - x0, G - 44, STONE, INK, LB))
        for y in range(62, G - 4, 18):
            g.append(line(x0 + 2, y, x1 - 2, y, STONE2, 1.3, 'opacity="0.9"'))
        for j, y in enumerate(range(44, G - 4, 18)):
            xx = x0 + (12 if j % 2 else 24)
            g.append(line(xx, y + 2, xx, min(y + 16, G - 3), STONE2, 1.2, 'opacity="0.9"'))
        g.append(line(x0 + 4, 50, x0 + 4, G - 6, LAV, 1.6, 'opacity="0.3"'))
        g.append(rect(x0 - 6, 34, x1 - x0 + 12, 12, "#7A6A90", INK, LM))                     # the cap
        g.append(path(f"M{x0-2},{34} L{(x0+x1)/2},{22} L{x1+2},{34} Z", "#7A6A90", INK, LM))
        g.append(f'<circle cx="{(x0+x1)/2}" cy="15" r="8" fill="#7A6A90" stroke="{INK}" stroke-width="{LM}"/>')
        g.append(path(f"M{(x0+x1)/2-5},11 Q{(x0+x1)/2-2},8 {(x0+x1)/2+1},9", "none", "#FFFFFF", 1.4, 'opacity="0.35"'))
        g.append(path(smooth_closed([(x0 - 5, 40), (x0 + 6, 36), (x0 + 16, 39), (x0 + 12, 44), (x0 + 4, 47)], 0.5), MOSS, INK, 1.0))
    # the iron arch over the gate, a heart at its crown, a lantern hanging from it
    ad = "M304,52 C312,20 368,20 376,52"
    g.append(path(ad, "none", INK, 6.0)); g.append(path(ad, "none", IRONF, 3.6))
    ad2 = "M304,64 C314,36 366,36 376,64"
    g.append(path(ad2, "none", INK, 4.6)); g.append(path(ad2, "none", IRONF, 2.4))
    for (x, y) in ((314, 44), (326, 36), (354, 36), (366, 44)):
        g.append(f'<circle cx="{x}" cy="{y}" r="4" fill="none" stroke="{INK}" stroke-width="3.4"/>')
        g.append(f'<circle cx="{x}" cy="{y}" r="4" fill="none" stroke="{IRONF}" stroke-width="1.6"/>')
    g.append(path(heart_d(340, 22, 18), IRONF, INK, 1.4))
    g.append(path(heart_d(340, 22, 9), "none", IRONHI, 1.0, 'opacity="0.5"'))
    g.append(line(340, 42, 340, 47, INK, 1.4))
    g.append(path(poly([(334, 52), (346, 52), (344, 64), (336, 64)]), "url(#gvlamp)", INK, 1.4))
    g.append(path(poly([(332, 53), (340, 46), (348, 53)]), IRONF, INK, 1.1))
    g.append(path(f"M335,64 L345,64 L340,69 Z", IRONF, INK, 1.1))
    # the gate: left leaf shut, right leaf swung open toward us (narrow, its free edge nearer and taller)
    def leaf(pts_top, pts_bot, xs, m=ID):
        out = []
        (tlx, tly), (trx, try_) = pts_top; (blx, bly), (brx, bry) = pts_bot
        out.append(P(m, f"M{tlx},{tly} L{trx},{try_}", "none", INK, 5.0)); out.append(P(m, f"M{tlx},{tly} L{trx},{try_}", "none", IRONF, 3.0))
        out.append(P(m, f"M{blx},{bly} L{brx},{bry}", "none", INK, 5.0)); out.append(P(m, f"M{blx},{bly} L{brx},{bry}", "none", IRONF, 3.0))
        mly, mry = (tly + bly) / 2 + 6, (try_ + bry) / 2 + 6
        out.append(P(m, f"M{tlx},{mly} L{trx},{mry}", "none", INK, 4.2)); out.append(P(m, f"M{tlx},{mly} L{trx},{mry}", "none", IRONF, 2.2))
        for t in xs:
            x_t = tlx + (trx - tlx) * t; yt = tly + (try_ - tly) * t; xb = blx + (brx - blx) * t; yb = bly + (bry - bly) * t
            out.append(P(m, f"M{x_t-1.7},{yb} L{x_t-1.7},{yt-4} L{x_t-3.8},{yt-3} L{x_t},{yt-12} L{x_t+3.8},{yt-3} L{x_t+1.7},{yt-4} L{x_t+1.7},{yb} Z", IRONF, INK, 1.0))
        return out
    g += leaf(((306, 76), (340, 80)), ((306, G - 4), (340, G - 4)), [0.04, 0.26, 0.5, 0.74, 0.96])
    g += leaf(((374, 78), (352, 72)), ((374, G - 4), (352, G + 2)), [0.04, 0.36, 0.68, 0.96])
    for y in (82, G - 14):
        g.append(rect(301, y, 7, 5, IRONF, INK, 1.0)); g.append(rect(372, y, 7, 5, IRONF, INK, 1.0))
    ANCH["graveyard-back"] = {"name": "graveyard-back", "W": W, "H": H, "G": G, "kind": "strip", "anchors": {
        "signs": [], "windows": [],
        "doors": [dict(bbox([(304, 44), (376, G)]), what="the gate between the pillars, right leaf ajar")],
        "light": [pt((340, 58), what="the lantern under the arch, green, flicker")],
        "heart": pt((340, 22), what="iron heart at the arch's crown")}}
    svgx("graveyard-back", W, H, g, defs=defs, step_lines=12)

# ---------------------------------------------------------------- the memorial obelisk
OB1 = "#9C91B1"; OB2 = "#7F7497"; OB3 = "#B9AFCB"; OB4 = "#8B80A2"

def obelisk():
    """The Great Starvation's memorial: a weathered obelisk on a stepped plinth, a heart carved near its top, a big blank
    plaque on the die (the site writes the date and the live numbers), and at its foot candles, flowers and an empty bowl."""
    W, H = 150, 352; B = H - 8
    g = []
    g.append(shadow_ellipse(75, B, 72, 7, 0.45))
    # the steps
    g.append(rect(4, B - 22, 142, 22, OB4, INK, LB))
    g.append(line(7, B - 19, 143, B - 19, OB3, 1.6, 'opacity="0.55"'))
    g.append(line(7, B - 3, 143, B - 3, SHADE, 2.4, 'opacity="0.25"'))
    g.append(rect(12, B - 40, 126, 18, OB1, INK, LB))
    g.append(line(15, B - 37, 135, B - 37, OB3, 1.6, 'opacity="0.55"'))
    for (x, y, h) in ((38, B - 22, 14), (112, B - 22, 14), (60, B - 40, 12), (100, B - 40, 12)):
        g.append(line(x, y + 3, x, y + 3 + h, OB2, 1.2, 'opacity="0.8"'))
    # the die, with its base moulding and cornice, and the plaque
    g.append(rect(20, 200, 110, B - 50 - 200, OB1, INK, LB))
    g.append(rect(15, B - 50, 120, 10, OB4, INK, LM))
    g.append(line(18, B - 47, 132, B - 47, OB3, 1.3, 'opacity="0.5"'))
    g.append(rect(10, 188, 130, 14, OB4, INK, LM))
    g.append(line(13, 191, 137, 191, OB3, 1.4, 'opacity="0.6"'))
    g.append(line(14, 204, 136, 204, SHADE, 3.0, 'opacity="0.25"'))
    g.append(line(24, 206, 24, B - 54, OB3, 1.6, 'opacity="0.5"'))
    g.append(line(125, 206, 125, B - 54, OB2, 3.2, 'opacity="0.6"'))
    g.append(rrect(28, 208, 94, 78, 3, "#2A2137", INK, LB))                                    # the plaque, blank
    g.append(rrect(32.5, 212.5, 85, 69, 2, "none", GOLD2, 1.2, extra='opacity="0.75"'))
    for (x, y) in ((33, 213), (117, 213), (33, 281), (117, 281)):
        g.append(f'<circle cx="{x}" cy="{y}" r="1.8" fill="{GOLD2}" stroke="{INK}" stroke-width="0.7"/>')
    # the shaft: its base block, the tapering shaft with a chamfer in shade on the right, the pyramidion
    g.append(rect(36, 170, 78, 19, OB4, INK, LM))
    g.append(line(39, 173, 111, 173, OB3, 1.3, 'opacity="0.55"'))
    shaft = [(44, 170), (54, 46), (96, 46), (106, 170)]
    g.append(path(poly(shaft), OB1, INK, LB))
    g.append(path(poly([(92, 47), (96, 47), (105, 169), (96, 169)]), OB2, "none", 0, 'opacity="0.9"'))
    g.append(line(94, 49, 100.5, 168, INK, 1.0, 'opacity="0.35"'))
    g.append(path(poly([(54, 46), (75, 8), (96, 46)]), OB1, INK, LB))
    g.append(path(poly([(75, 9), (95, 45), (84, 45)]), OB2, "none", 0, 'opacity="0.9"'))
    g.append(line(50, 162, 58, 54, OB3, 1.8, 'opacity="0.55"'))
    g.append(line(59, 42, 72, 16, OB3, 1.6, 'opacity="0.55"'))
    # the carved heart: a recess, shadowed along its top, a trace of old pink paint in it
    g.append(path(heart_d(74, 82, 28), "#6C6187", INK, 1.3))
    g.append(path(heart_d(74, 84, 22), "#94607E", "none", 0, 'opacity="0.9"'))
    g.append(path("M63,76 C65,71 70,71 73,75 M76,75 C79,71 84,71 86,75", "none", SHADE, 1.5, 'opacity="0.45"'))
    # weathering: a crack, streaks down from the pyramidion, a chipped corner, moss
    g.append(path("M89,110 L84,124 L88,132 L81,150", "none", INK, 1.1, 'opacity="0.7"'))
    for (x, y, ln) in ((62, 100, 26), (77, 104, 40), (86, 98, 18), (57, 132, 20)):
        g.append(line(x, y, x - 0.8, y + ln, OB2, 1.3, 'opacity="0.5"'))
    g.append(path(poly([(133, 188), (140, 188), (140, 195), (136, 196)]), OB2, INK, 1.0))
    g.append(path(smooth_closed([(6, B - 22), (16, B - 29), (30, B - 26), (42, B - 22)], 0.5), MOSS, INK, 1.0))
    g.append(path(smooth_closed([(104, B - 40), (116, B - 45), (130, B - 43), (137, B - 40)], 0.5), MOSS, INK, 1.0))
    g.append(path(smooth_closed([(36, 170), (45, 164), (54, 167), (58, 170)], 0.5), MOSS, INK, 0.9))
    g.append(path(smooth_closed([(10, 188), (16, 183), (26, 184), (30, 188)], 0.5), MOSS, INK, 0.9))
    for (x, y) in ((14, B - 25), (28, B - 24), (120, B - 43), (18, 186)):
        g.append(f'<circle cx="{x}" cy="{y}" r="1.4" fill="{GREEN}" stroke="none"/>')
    # at its foot: the empty bowl in the middle, flowers against the right of the plinth, candles
    g.append(ellipse(75, B - 22, 19, 4.6, HAIR, INK, 1.4))
    g.append(path(smooth_closed([(56, B - 22), (59, B - 13), (66, B - 9), (84, B - 9), (91, B - 13), (94, B - 22), (84, B - 19), (66, B - 19)], 0.5), PURPLE, INK, 1.4))
    g.append(path(f"M62,{B-17} Q75,{B-11} 88,{B-17}", "none", "#FFFFFF", 1.2, 'opacity="0.3"'))
    stems = ((112, B - 22, 104, B - 76), (117, B - 22, 116, B - 84), (122, B - 22, 128, B - 72), (114, B - 22, 110, B - 60), (120, B - 22, 122, B - 62))
    for (x0, y0, x1, y1) in stems:
        g.append(path(f"M{x0},{y0} Q{(x0+x1)/2+2},{(y0+y1)/2} {x1},{y1}", "none", MOSS, 2.0))
    g.append(path(f"M113,{B-42} Q105,{B-50} 100,{B-47} Q106,{B-40} 113,{B-42} Z", GREEN, INK, 0.9))
    g.append(path(f"M121,{B-48} Q129,{B-56} 134,{B-52} Q128,{B-45} 121,{B-48} Z", GREEN, INK, 0.9))
    for (x, y, c, r) in ((104, B - 78, PINK, 3.0), (116, B - 86, LAV, 3.0), (128, B - 74, PINK, 3.0), (110, B - 62, LAV2, 2.4), (122, B - 64, GOLD, 2.4)):
        for k in range(5):
            a = 2 * math.pi * k / 5 + 0.3
            g.append(f'<circle cx="{x + r*1.15*math.cos(a):.1f}" cy="{y + r*1.15*math.sin(a):.1f}" r="{r}" fill="{c}" stroke="{INK}" stroke-width="0.8"/>')
        g.append(f'<circle cx="{x}" cy="{y}" r="{r*0.6:.1f}" fill="{GOLD2 if c != GOLD else PINK}" stroke="{INK}" stroke-width="0.7"/>')
    g.append(path(f"M106,{B-32} L128,{B-32} L125,{B-22} L109,{B-22} Z", LAV, INK, 1.0))            # the paper round them
    g.append(line(108, B - 29, 126, B - 29, "#FFFFFF", 1.0, 'opacity="0.4"'))
    # candles: two on the left, one between the bowl and the flowers
    for (x, h, w) in ((17, 22, 8), (30, 15, 7), (100, 12, 7)):
        y = B - 22
        g.append(rrect(x - w / 2, y - h, w, h, 1.5, LINEN, INK, 1.1))
        g.append(path(f"M{x-w/2+1},{y-h+2} Q{x-w/2+2},{y-h+7} {x-w/2+1.4},{y-h+9}", "none", LINEN2, 1.6))
        g.append(line(x, y - h, x, y - h - 3, INK, 1.0))
        g.append(path(f"M{x},{y-h-13} Q{x+4},{y-h-6} {x},{y-h-3} Q{x-4},{y-h-6} {x},{y-h-13} Z", FLAME, INK, 0.9))
        g.append(path(f"M{x},{y-h-9} Q{x+1.6},{y-h-6} {x},{y-h-4.5} Q{x-1.6},{y-h-6} {x},{y-h-9} Z", "#FFFBEA", "none", 0))
        g.append(ellipse(x, y - 0.5, w / 2 + 2, 1.6, LINEN2, INK, 0.8))                        # a pool of wax
    ANCH["obelisk"] = {"name": "obelisk", "W": W, "H": H, "base": B, "kind": "prop", "anchors": {
        "signs": [{"x": 33, "y": 213, "w": 84, "h": 68, "text": "The Great Starvation · Sep 24, 2026 + live numbers", "style": "plaque",
                   "plate": {"x": 28, "y": 208, "w": 94, "h": 78}}],
        "fire": [pt((x, B - 22 - h - 8), what="candle flame, flicker") for (x, h) in ((17, 22), (30, 15), (100, 12))],
        "heart": pt((74, 82), what="the carved heart (a faint pink glow would suit it)")}}
    svgx("obelisk", W, H, g, step_lines=12)

# ---------------------------------------------------------------- the gravestones
def paw_d(cx, cy, s=1.0):
    out = [ellipse(cx, cy + 3 * s, 5.2 * s, 4.2 * s, "#4F4468", INK, 0.9)]
    for (dx, dy) in ((-5.6, -3), (-2, -6.4), (2, -6.4), (5.6, -3)):
        out.append(ellipse(cx + dx * s, cy + dy * s, 1.9 * s, 2.3 * s, "#4F4468", INK, 0.8))
    return out

def tomb_a():
    """A rounded headstone with cat ears, a paw carved in it."""
    W, H = 96, 128; B = H - 8
    g = [shadow_ellipse(48, B, 42, 6, 0.45)]
    S1, S2, S3 = "#7A6E96", "#5F5479", "#A198BC"
    d = (f"M16,{B} L16,52 C16,42 18,34 20,28 L22,12 L36,22 C40,20 44,19 48,19 C52,19 56,20 60,22 L74,12 L76,28 "
         f"C78,34 80,42 80,52 L80,{B} Z")
    g.append(rect(10, B - 10, 76, 10, S2, INK, LM))
    g.append(path(d, S1, INK, LB))
    g.append(path(f"M24,17 L25,26 L31,23 Z", "#665A80", "none", 0))
    g.append(path(f"M72,17 L71,26 L65,23 Z", "#665A80", "none", 0))
    g.append(path(f"M21,48 C21,36 26,28 34,24", "none", S3, 2.0, 'opacity="0.6"'))
    g.append(line(22, 56, 22, B - 14, S3, 1.6, 'opacity="0.35"'))
    g.append(line(74, 50, 74, B - 14, S2, 3.0, 'opacity="0.6"'))
    g.append(rrect(26, 60, 44, 40, 4, "none", S2, 1.4, extra='opacity="0.8"'))                  # the blank face
    g += paw_d(48, 44, 1.0)
    g.append(path("M70,70 L66,80 L69,86", "none", INK, 1.0, 'opacity="0.6"'))
    for (x, h, l) in ((8, 11, -2), (14, 14, -1), (80, 12, 2), (88, 9, 3), (40, 7, 0)):
        g += tuft(x, B, h, l)
    ANCH["tomb-a"] = {"name": "tomb-a", "W": W, "H": H, "base": B, "kind": "prop", "anchors": {"face": {"x": 26, "y": 60, "w": 44, "h": 40, "note": "blank; room for a tiny name if wanted"}}}
    svgx("tomb-a", W, H, g, step_lines=12)

def tomb_b():
    """A stone cross, a little out of true, moss on its arms, a heart where the arms meet."""
    W, H = 86, 156; B = H - 8
    g = [shadow_ellipse(43, B, 38, 6, 0.45)]
    S1, S2, S3 = "#665A80", "#4F4468", "#8E84AA"
    g.append(rect(18, B - 22, 50, 22, S2, INK, LB))
    g.append(line(21, B - 19, 65, B - 19, S3, 1.4, 'opacity="0.5"'))
    m = rot(43, B - 22, -4)
    cross = poly([(35, B - 22), (35, 64), (13, 64), (13, 46), (35, 46), (35, 18), (51, 18), (51, 46), (73, 46), (73, 64), (51, 64), (51, B - 22)])
    g.append(P(m, cross, S1, INK, LB))
    g.append(P(m, "M38,B L38,22".replace("B", str(B - 26)), "none", S3, 1.8, 'opacity="0.5"'))
    g.append(P(m, "M16,49 L33,49", "none", S3, 1.6, 'opacity="0.5"'))
    g.append(P(m, "M48,66 L48,B".replace("B", str(B - 26)), "none", S2, 2.6, 'opacity="0.6"'))
    g.append(P(m, heart_d(43, 56, 11), "#4F4468", INK, 1.0))
    g.append(P(m, smooth_closed([(13, 46), (20, 42), (30, 43), (35, 46), (28, 49), (18, 49)], 0.5), MOSS, INK, 1.0))
    g.append(P(m, smooth_closed([(51, 46), (60, 43), (70, 44), (73, 47), (64, 49)], 0.5), MOSS, INK, 1.0))
    g.append(P(m, smooth_closed([(35, 18), (41, 14), (48, 15), (51, 19), (44, 21)], 0.5), MOSS, INK, 0.9))
    g.append(P(m, "M57,52 L62,57 L60,62", "none", INK, 1.0, 'opacity="0.6"'))
    for (x, h, l) in ((10, 12, -2), (16, 9, -1), (70, 13, 2), (76, 10, 3), (30, 8, -1), (56, 9, 1)):
        g += tuft(x, B, h, l)
    ANCH["tomb-b"] = {"name": "tomb-b", "W": W, "H": H, "base": B, "kind": "prop", "anchors": {}}
    svgx("tomb-b", W, H, g, step_lines=12)

def tomb_c():
    """A small old slab leaning back and to the right, chipped, cracked, half grown over with moss."""
    W, H = 104, 100; B = H - 8
    g = [shadow_ellipse(52, B, 44, 6, 0.45)]
    S1, S2, S3 = "#584D70", "#443A5A", "#7B7196"
    m = rot(52, B, 9)
    d = f"M28,{B+2} L28,36 C28,24 38,20 52,20 C66,20 76,24 76,36 L76,{B+2} Z"
    g.append(P(m, d, S1, INK, LB))
    g.append(P(m, poly([(70, 26), (78, 32), (78, 44), (72, 40)]), NIGHT, INK, 1.0))              # chipped corner
    g.append(P(m, "M33,40 C33,30 40,26 48,25", "none", S3, 1.8, 'opacity="0.55"'))
    g.append(P(m, "M70,48 L70,86", "none", S2, 3.0, 'opacity="0.6"'))
    g.append(P(m, "M44,30 L48,44 L44,52 L50,66", "none", INK, 1.1, 'opacity="0.7"'))
    g.append(P(m, heart_d(58, 44, 10), "#3F3555", INK, 0.9))
    g.append(P(m, smooth_closed([(28, 52), (34, 48), (40, 56), (38, 72), (42, 84), (34, 92), (28, 90)], 0.5), MOSS, INK, 1.0))
    g.append(P(m, smooth_closed([(42, 22), (52, 18), (62, 21), (58, 25), (48, 26)], 0.5), MOSS, INK, 0.9))
    for (x, y) in ((34, 60), (36, 76), (52, 21), (31, 86)):
        g.append(C(m, x, y, 1.3, GREEN, "none", 0))
    for (x, h, l) in ((14, 10, -2), (22, 15, -1), (30, 12, 1), (68, 11, 2), (78, 15, 3), (86, 10, 2), (48, 9, 0), (58, 8, 1)):
        g += tuft(x, B, h, l)
    ANCH["tomb-c"] = {"name": "tomb-c", "W": W, "H": H, "base": B, "kind": "prop", "anchors": {}}
    svgx("tomb-c", W, H, g, step_lines=12)

ALL = ["haunted", "backrooms", "graveyard_back", "obelisk", "tomb_a", "tomb_b", "tomb_c"]
if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for w in (args or ALL): globals()[w.replace("-", "_")]()
    if "--anchors" in sys.argv:
        import json; print(json.dumps(list(ANCH.values()), indent=1, ensure_ascii=False))
