"""Emotown: the Furnace and the park -> packages/pet/town/*.svg

The Furnace is where the town burns its $EMO: every care a pet gets costs MON and 80% of it buys EMO and burns it,
so the street has a soot-brick furnace house with a huge fire mouth, a chute of purple coins sliding in and a blank
counter plate the site writes the live burn on. The park sits behind a trimmed hedge with a flower arch, two big
lilac trees, a slide, a swing set, the giant ball of yarn (the park's landmark) and flower beds.

Everything is drawn like town.py's diner: flat fills, wobbly ink, night palette. Nothing here glows or moves; the
site adds fire flicker, embers, smoke and fairy lights at the anchors listed in ANCHORS (printed by __main__).

    python3 town_works.py [furnace hedge tree_a tree_b slide swings yarnball flowerbed]
"""
import os, sys, math, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town import *                                                   # noqa: F401,F403 (palette, helpers, svg)
from cat import INK, FUR, HAIR, STRAND, PURPLE, LAV, LAV2, PINK, GOLD, GOLD2, RUBY, GREEN, TEAL, PUPIL, \
    smooth_closed, smooth_open, poly, path, ellipse

ANCHORS = {}
STEP = 14.0   # wobble sample step: the diner uses 8; 12 keeps these big drawings under ~160 KB with the same look

# ---------------- shared helpers ----------------
def tapered_big(pts, w0, w1, t=0.5, fill=FUR, sample=7.0, stroke=INK, sw=LB):
    """props.py's tapered_big (copied: importing props.py regenerates every prop): a filled, outlined tube that
    tapers from w0 to w1, sampled coarsely so a trunk stays small."""
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

def circ(cx, cy, r, fill, stroke=INK, sw=LT, extra=""):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'

def contact(cx, y, rx, ry=7, opacity=0.42):
    """The soft contact shadow of a plane prop (an ellipse, not town.py's rect)."""
    return ellipse(cx, y, rx, ry, SHADE, "none", 0, f'opacity="{opacity}"')

def arc_pts(cx, cy, rx, ry, a0, a1, n=12):
    """Points on an ellipse from angle a0 to a1 (degrees, y down: 90 is the bottom)."""
    return [(cx + rx*math.cos(math.radians(a0 + (a1-a0)*k/n)), cy + ry*math.sin(math.radians(a0 + (a1-a0)*k/n))) for k in range(n+1)]

def arc(cx, cy, rx, ry, a0, a1, stroke=INK, sw=LM, extra="", n=10):
    return path(smooth_open(arc_pts(cx, cy, rx, ry, a0, a1, n), 0.5), "none", stroke, sw, extra)

FLAME_D = "M20,4 C24,12 30,14 30,24 C30,31 25.5,36 20,36 C14.5,36 10,31 10,24 C10,19 13,16 14,12 C15,16 17,17 18,17 C17,12 18,8 20,4 Z"
FLAME_IN = "M20,20 C22,24 24,25 24,28.5 C24,31 22.2,33 20,33 C17.8,33 16,31 16,28.5 C16,26 18,24 20,20 Z"

def xform_d(d, cx, cy, s, ox=20, oy=21, rot=0):
    """Map every absolute x,y pair of a path (flame() is drawn in a 40 box) to centre cx,cy at scale s."""
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def f(m):
        x = (float(m.group(1)) - ox) * s; y = (float(m.group(2)) - oy) * s
        return f"{cx + x*ca - y*sa:.1f},{cy + x*sa + y*ca:.1f}"
    return re.sub(r"(-?\d+\.?\d*),(-?\d+\.?\d*)", f, d)

def flame_icon(cx, cy, h, fill=GOLD, core=None, sw=1.1, rot=0):
    s = h / 32.0
    out = [path(xform_d(FLAME_D, cx, cy, s, rot=rot), fill, INK, sw)]
    if core:
        out.append(path(xform_d(FLAME_IN, cx, cy, s, rot=rot), core, "none", 0))
    return out

def emo_coin(cx, cy, r, rot=0, sw=LM):
    """The $EMO coin: purple, a darker ring, a gold flame on its face, a shine."""
    g = [f'<g transform="rotate({rot:.1f} {cx:.1f} {cy:.1f})">']
    g.append(circ(cx, cy, r, PURPLE, INK, sw))
    g.append(circ(cx, cy, r * 0.76, "none", STRAND, 1.2))
    g.extend(flame_icon(cx, cy + r*0.04, r * 1.05, GOLD, None, 1.0))
    g.append(path(f"M{cx - r*0.62:.1f},{cy - r*0.38:.1f} Q{cx - r*0.45:.1f},{cy - r*0.72:.1f} {cx - r*0.08:.1f},{cy - r*0.8:.1f}",
                  "none", "#FFFFFF", 1.3, 'opacity="0.75"'))
    g.append('</g>')
    return g

def coin_def(cid, r=13.0):
    """One $EMO coin, baked once at the origin into <defs>; place copies with coin_use (a wobbled coin is ~2 KB)."""
    return prebake(cid, emo_coin(0, 0, r, 0), step=8.0)[0]

def coin_use(cid, x, y, rot=0, scale=1.0):
    sc = f" scale({scale:.2f})" if scale != 1 else ""
    return f'<use href="#{cid}" transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f}){sc}"/>'

def merge_runs(g):
    """Fold runs of consecutive stroke-only paths that share every attribute into one path of several subpaths
    (z-order is untouched: only neighbours merge). Saves the ~120 bytes of attributes per line."""
    out = []; last_key = None
    pat = re.compile(r'^<path d="([^"]*)" (fill="none" .*)/>$')
    for e in g:
        m = pat.match(e.strip())
        if m and m.group(2) == last_key:
            prev = pat.match(out[-1].strip())
            out[-1] = f'<path d="{prev.group(1)} {m.group(1)}" {m.group(2)}/>'
        else:
            out.append(e)
            last_key = m.group(2) if m else None
    return out

def coin_edge_def(cid, rx=11.0):
    return prebake(cid, coin_edge(0, 0, rx), step=8.0)[0]

def coin_edge(cx, cy, rx, ry=None, sw=LT):
    """A coin lying flat, seen nearly edge-on (for heaps)."""
    ry = ry or rx * 0.36
    return [ellipse(cx, cy + ry*0.5, rx, ry, STRAND, INK, sw), ellipse(cx, cy, rx, ry, PURPLE, INK, sw),
            ellipse(cx, cy, rx*0.62, ry*0.55, "none", LAV2, 0.9, 'opacity="0.7"')]

def rivets(pts, r=2.0, fill="#8C7AA8", ref=None):
    """Rivets as <use> of one defs circle (a wobbled circle costs ~600 bytes; a rivet is two units wide)."""
    if ref:
        return [f'<use href="#{ref}" x="{x:.1f}" y="{y:.1f}"/>' for x, y in pts]
    return [circ(x, y, r, fill, INK, 0.9) for x, y in pts]

def rivet_def(rid, r=1.8, fill="#8C7AA8"):
    return f'<circle id="{rid}" cx="0" cy="0" r="{r}" fill="{fill}" stroke="{INK}" stroke-width="0.9"/>'

def prebake(gid, elements, step=26.0, amp=0.9):
    """Bake a layer here with its own (coarser) step and keep it in <defs>; the body shows it with a <use>, so svg()
    does not bake it a second time. For long runs of mortar or leaf ticks, where step 8 costs bytes and buys nothing."""
    body = bake("\n".join(elements), amp=amp, freq=0.09, step=step)
    body = re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}").rstrip("0").rstrip("."), body)
    return f'<g id="{gid}">{body}</g>', f'<use href="#{gid}"/>'

def brick_courses(x0, y0, x1, y1, bw, bh, skip=None, stroke="#2E1320", sw=1.1, op=0.55, off0=0.0):
    """Mortar over a brick wall, as ONE path, leaving out whatever `skip(x, y)` covers (hidden joints cost no bytes).
    Horizontal joints are merged into runs; head joints alternate by half a brick."""
    skip = skip or (lambda x, y: False)
    d = []; y = y0; row = 0
    while y < y1 - 1:
        yb = min(y + bh, y1)
        if y > y0:                                                                    # the bed joint on top of this course
            run = None; x = x0
            while x < x1:
                xe = min(x + bw / 2, x1); keep = not skip((x + xe) / 2, y)
                if keep:
                    run = (run[0], xe) if run else (x, xe)
                elif run:
                    d.append(f"M{run[0] + 1:.1f},{y:.1f} L{run[1] - 1:.1f},{y:.1f}"); run = None
                x = xe
            if run: d.append(f"M{run[0] + 1:.1f},{y:.1f} L{run[1] - 1:.1f},{y:.1f}")
        off = (bw / 2 if row % 2 else 0) + off0; x = x0 + off + bw
        while x < x1 - 3:
            if not skip(x, (y + yb) / 2):
                d.append(f"M{x:.1f},{y + 1:.1f} L{x:.1f},{yb - 1:.1f}")
            x += bw
        y += bh; row += 1
    return [path(" ".join(d), "none", stroke, sw, f'opacity="{op}"')] if d else []

def fire_sheet(x0, x1, base, peaks, edge_h, fill, stroke=INK, sw=LM, extra=""):
    """A sheet of flame: tongues rising from `base`, each (x, height, lean) with its tip flicked the way it leans,
    joined by rounded valleys; the sides start `edge_h` up."""
    d = f"M{x0:.1f},{base:.1f} L{x0:.1f},{base - edge_h:.1f} "
    prev = (x0, base - edge_h)
    for i, (px, h, lean) in enumerate(peaks):
        tip = (px + lean, base - h)
        c1 = (prev[0] + (px - prev[0]) * 0.55, prev[1] - (prev[1] - tip[1]) * 0.18)
        c2 = (tip[0] - lean * 1.6, tip[1] + h * 0.38)
        d += f"C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {tip[0]:.1f},{tip[1]:.1f} "
        if i + 1 < len(peaks):
            nx_, nh = peaks[i + 1][0], peaks[i + 1][1]
            v = ((px + nx_) / 2, base - min(h, nh) * 0.42)
        else:
            v = (x1, base - edge_h)
        c1 = (tip[0] + (v[0] - tip[0]) * 0.1 - lean * 0.2, tip[1] + (v[1] - tip[1]) * 0.45)
        c2 = (v[0] - (v[0] - px) * 0.45, v[1] - 4)
        d += f"C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {v[0]:.1f},{v[1]:.1f} "
        prev = v
    d += f"L{x1:.1f},{base:.1f} Z"
    return path(d, fill, stroke, sw, extra)

def tongue(cx, base, w, h, fill, stroke=INK, sw=LM, flip=False, lean=0.0, core=None):
    """The game's own flame prop (a teardrop with a flick on one side), stretched into a tall tongue of fire: its
    round foot sits on `base`, its tip `h` above, leaning `lean` units sideways at the top."""
    sx = (-1 if flip else 1) * w / 20.0
    def f(m):
        x, y = float(m.group(1)), float(m.group(2)); u = (36 - y) / 32.0
        return f"{cx + (x - 20) * sx + lean * u * u:.1f},{base - u * h:.1f}"
    out = [path(re.sub(r"(-?\d+\.?\d*),(-?\d+\.?\d*)", f, FLAME_D), fill, stroke, sw)]
    if core:
        out.append(path(re.sub(r"(-?\d+\.?\d*),(-?\d+\.?\d*)", f, FLAME_IN), core, "none", 0))
    return out

# ---------------- the Furnace ----------------
F_BRICK  = "#5B2A3A"     # soot-dark red-brown
F_BRICK2 = "#6E3446"     # a lit brick
F_MORTAR = "#2E1320"
F_SOOT   = "#24111B"
IRON     = "#2A2135"
IRON2    = "#3E3252"
IRON3    = "#57486F"
BAND     = "#54456C"
BRASS    = "#B08A48"
BRASS2   = "#D9B46A"
FACE     = "#E8DCBC"

def furnace():
    """The Furnace: a soot-brick furnace hall, all mouth. A huge arched fire mouth at street level in a heavy riveted
    iron frame and a ring of arch bricks with a flame keystone, a grate across the coals, a chute sliding $EMO coins
    in from a hopper on the side house, the blank counter plate above (the site writes the burn there), a gable with
    a fire-lit round window and a vent cupola, and the tall stack on the right: brick pier with gauges, a valve and
    an ash door, the shaft in riveted bands with the cat's spiked collar near the top and a flared crown."""
    W, H = 500, 632; G = H - 16
    g = []
    defs = ('<linearGradient id="fwsoot" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="470">'
            f'<stop offset="0" stop-color="{F_SOOT}"/><stop offset="0.45" stop-color="#3C1B2A"/><stop offset="1" stop-color="{F_BRICK}"/></linearGradient>'
            '<radialGradient id="fwfire" cx="0.5" cy="1" r="1" fx="0.5" fy="0.92">'
            '<stop offset="0" stop-color="#FFF4B8"/><stop offset="0.2" stop-color="#FFD66B"/><stop offset="0.42" stop-color="#FF9B3D"/>'
            '<stop offset="0.64" stop-color="#E24A2B"/><stop offset="0.84" stop-color="#8E1A28"/><stop offset="1" stop-color="#4A0B1E"/></radialGradient>'
            + lit_glass("fwlit", "#FFD27A", "#E8743A")
            + rivet_def("fwrv", 1.8) + rivet_def("fwrv2", 1.5) + coin_def("fwcoin", 13.0) + coin_edge_def("fwcoinE", 11.0))
    WALL = "url(#fwsoot)"
    # key geometry
    MX, MY, MR = 246, 520, 100            # the mouth: centre of the arch's circle, radius (opening x 146..346, y 420..616)
    FR, VR = 116, 138                     # iron frame and arch-brick ring outer radii
    hall0, hall1 = 90, 402                # the hall's walls
    top = 250                             # cornice line (wall top)
    peak = 160                            # gable peak
    PX0, PX1 = 396, 492                   # the stack's pier
    SX = 444                              # the stack's centre line
    # -------- the stack's shaft (behind the hall's gable and flue) --------
    sh_y0, sh_y1 = 44, 236
    def shaft_x(y, side):                 # tapers from 80 wide at the pier to 60 at the crown
        t = (y - sh_y0) / (sh_y1 - sh_y0); half = 30 + 10 * t
        return SX + side * half
    shaft = [(shaft_x(sh_y1, -1), sh_y1), (shaft_x(sh_y0, -1), sh_y0), (shaft_x(sh_y0, 1), sh_y0), (shaft_x(sh_y1, 1), sh_y1)]
    g.append(path(poly(shaft), WALL, INK, LB))
    # courses on the shaft (clipped to it): each course a gentle downward curve so the stack reads round
    g.append('<clipPath id="fwshaftclip"><path d="' + poly(shaft) + '"/></clipPath>')
    g.append('<g clip-path="url(#fwshaftclip)">')
    y = sh_y0 + 12; row = 0; dq = []; dv = []
    while y < sh_y1:
        xl, xr = shaft_x(y, -1), shaft_x(y, 1)
        dq.append(f"M{xl:.1f},{y:.1f} Q{SX},{y + 5:.1f} {xr:.1f},{y:.1f}")
        for k in ((-0.55, -0.1, 0.35, 0.8) if row % 2 else (-0.78, -0.32, 0.12, 0.58)):
            hx = SX + k * (xr - xl) / 2
            dv.append(f"M{hx:.1f},{y + 1.5:.1f} L{hx:.1f},{y + 10.5:.1f}")
        y += 12; row += 1
    dd, u = prebake("fwm0", [path(" ".join(dq), "none", F_MORTAR, 1.0, 'opacity="0.5"'), path(" ".join(dv), "none", F_MORTAR, 1.0, 'opacity="0.45"')])
    defs += dd; g.append(u)
    # moonlight down the left of the shaft, shade down the right
    g.append(path(f"M{shaft_x(sh_y0, -1) + 6:.1f},{sh_y0 + 4} L{shaft_x(sh_y1, -1) + 7:.1f},{sh_y1}", "none", "#8E5A70", 3.0, 'opacity="0.35"'))
    g.append(path(poly([(shaft_x(sh_y0, 1) - 14, sh_y0), (shaft_x(sh_y0, 1), sh_y0), (shaft_x(sh_y1, 1), sh_y1), (shaft_x(sh_y1, 1) - 18, sh_y1)]),
                  SHADE, "none", 0, 'opacity="0.22"'))
    g.append('</g>')
    # riveted bands round the shaft (curved: it is round)
    def shaft_band(yb, h=9, fill=BAND, n=6):
        xl, xr = shaft_x(yb, -1) - 2, shaft_x(yb, 1) + 2
        xl2, xr2 = shaft_x(yb + h, -1) - 2, shaft_x(yb + h, 1) + 2
        out = [path(f"M{xl:.1f},{yb:.1f} Q{SX},{yb + 5:.1f} {xr:.1f},{yb:.1f} L{xr2:.1f},{yb + h:.1f} Q{SX},{yb + h + 5:.1f} {xl2:.1f},{yb + h:.1f} Z", fill, INK, LM)]
        pts = []
        for k in range(n):
            u = -0.8 + 1.6 * k / (n - 1); px = SX + u * (xr - xl) / 2
            pts.append((px, yb + h / 2 + 2.5 * (1 - u * u)))
        out += rivets(pts, ref="fwrv2")
        return out
    for yb in (112, 178):
        g.extend(shaft_band(yb))
    # the spiked collar: the cat's own black band with lavender studs, and spikes out at the sides
    cy0 = 62; ch = 16
    xl, xr = shaft_x(cy0, -1) - 3, shaft_x(cy0, 1) + 3
    xl2, xr2 = shaft_x(cy0 + ch, -1) - 3, shaft_x(cy0 + ch, 1) + 3
    g.append(path(poly([(xl - 11, cy0 + 6), (xl, cy0 + 2), (xl2, cy0 + ch - 1), (xl2 - 11, cy0 + ch - 4)]), LAV, INK, LT))
    g.append(path(poly([(xr + 11, cy0 + 6), (xr, cy0 + 2), (xr2, cy0 + ch - 1), (xr2 + 11, cy0 + ch - 4)]), LAV, INK, LT))
    g.append(path(f"M{xl:.1f},{cy0:.1f} Q{SX},{cy0 + 6} {xr:.1f},{cy0:.1f} L{xr2:.1f},{cy0 + ch} Q{SX},{cy0 + ch + 6} {xl2:.1f},{cy0 + ch} Z", INK, INK, LM))
    for u in (-0.66, -0.22, 0.22, 0.66):
        px = SX + u * (xr - xl) / 2; py = cy0 + ch / 2 + 3 * (1 - u * u)
        g.append(path(poly([(px - 5, py + 4), (px, py - 7), (px + 5, py + 4)]), LAV, INK, 1.0))
    g.append(path(f"M{xl + 4:.1f},{cy0 + 2.5:.1f} Q{SX},{cy0 + 8} {xr - 4:.1f},{cy0 + 2.5:.1f}", "none", "#5A4A6E", 1.2, 'opacity="0.8"'))
    # the flared crown, sooted black
    g.append(path(poly([(shaft_x(46, -1) - 1, 46), (SX - 36, 34), (SX + 36, 34), (shaft_x(46, 1) + 1, 46)]), "#2A1420", INK, LB))
    g.append(rrect(SX - 44, 20, 88, 15, 3, "#1C0E16", INK, LB))
    g.append(line(SX - 40, 24, SX + 38, 24, "#6B4A62", 1.3, 'opacity="0.55"'))
    g.append(ellipse(SX, 20.5, 36, 3.2, "#0B0508", INK, LT))                    # the dark throat
    # -------- the flue: out of the hall's roof, over to the stack, with a safety valve on its elbow --------
    FX = 356
    g.append(rect(FX - 9, 150, 18, 62, IRON2, INK, LB))                           # rises from the roof slope
    g.append(rect(FX - 9, 128, SX - 30 - FX + 9 + 2, 18, IRON2, INK, LB))         # runs to the shaft
    g.append(rrect(FX - 13, 124, 26, 26, 6, IRON3, INK, LB))                      # the elbow
    for fx, fy, fw, fh in ((FX - 12, 176, 24, 7), (FX + 26, 125, 7, 24), (SX - 40, 125, 7, 24)):
        g.append(rect(fx, fy, fw, fh, BRASS, INK, LM))
    g.append(line(FX - 5, 154, FX - 5, 200, "#8E7FB0", 1.4, 'opacity="0.5"'))
    g.append(line(FX + 14, 132, SX - 42, 132, "#8E7FB0", 1.4, 'opacity="0.5"'))
    g.append(rect(FX - 3, 110, 6, 15, BRASS, INK, LM))                            # the safety valve (steam)
    g.append(rrect(FX - 7, 104, 14, 8, 3, BRASS2, INK, LM))
    # -------- the side house on the left, with its lean-to roof and the hopper --------
    ax0, ax1 = 8, 96
    g.append(path(poly([(ax0, 372), (ax1 + 4, 346), (ax1 + 4, G), (ax0, G)]), WALL, INK, LB))
    dd, u = prebake("fwm1", brick_courses(ax0, 372, ax1, G - 20, 26, 12, skip=lambda x, y: (y < 372 - (x - ax0) * 26 / 92 + 4) or (20 < x < 66 and 500 < y < 552))); defs += dd; g.append(u)
    g.append(path(poly([(0, 366), (ax1 + 10, 336), (ax1 + 10, 346), (0, 377)]), ROOF2, INK, LB))
    g.append(line(4, 368, ax1 + 6, 339, "#7A6398", 1.4, 'opacity="0.6"'))
    # its little lit window (the stoker's room): four panes and a hanging shovel's shadow
    g.append(rect(22, 500, 44, 52, "url(#fwlit)", INK, LB))
    g.append(path(smooth_closed([(26, 552), (28, 540), (34, 534), (31, 522), (30, 512), (36, 518), (44, 518), (50, 512), (49, 522), (46, 534), (52, 540), (56, 552)], 0.35),
                  "#4A2230", "none", 0, 'opacity="0.85"'))                                         # the stoker cat, looking out
    g.append(circ(36.5, 526, 1.8, "#FFE7A0", "none", 0)); g.append(circ(43.5, 526, 1.8, "#FFE7A0", "none", 0))
    g.append(line(44, 500, 44, 552, INK, LM)); g.append(line(22, 526, 66, 526, INK, LM))
    g.append(line(26, 505, 26, 522, "#FFFFFF", 1.3, 'opacity="0.4"'))
    g.append(rect(18, 552, 52, 7, STONE, INK, LM))
    # -------- the hall --------
    g.append(path(poly([(hall0, G), (hall0, top), (hall1, top), (hall1, G)]), WALL, INK, LB))
    # the gable, with its stone coping
    g.append(path(poly([(hall0 - 4, top), ((hall0 + hall1) / 2, peak), (hall1 + 4, top)]), WALL, INK, LB))
    arch_top = MY - VR
    def hall_skip(x, y):
        if MX - VR - 2 < x < MX + VR + 2 and y > arch_top - 4:                    # the arch ring and the mouth
            if y > MY or math.hypot(x - MX, y - MY) < VR + 3: return True
        if 100 < x < 392 and 262 < y < 372: return True                           # the counter plate
        if y > G - 22: return True                                                # the plinth
        if 238 < y < 256: return True                                             # the cornice
        if y < top and (y < peak + abs(x - (hall0 + hall1) / 2) * (top - peak) / ((hall1 - hall0) / 2) + 3): return True
        if math.hypot(x - 246, y - 205) < 26: return True                         # the round window
        return False
    dd, u = prebake("fwm2", brick_courses(hall0, peak, hall1, G, 30, 12, skip=hall_skip, off0=6)); defs += dd; g.append(u)
    # soot licking up the wall above the mouth, and round the round window
    g.append(path(smooth_closed([(170, 402), (186, 384), (214, 378), (246, 376), (280, 380), (306, 384), (326, 400), (300, 392), (270, 386), (246, 388), (220, 386), (194, 392)], 0.5),
                  F_SOOT, "none", 0, 'opacity="0.55"'))
    # a few lit bricks here and there (the fire's warmth on the lower wall)
    lit = ((104, 560), (126, 452), (372, 548), (360, 440), (112, 392), (380, 392), (98, 286), (156, 232), (322, 226))
    g.append(path(" ".join(f"M{bx},{by} L{bx + 26},{by} L{bx + 26},{by + 10} L{bx},{by + 10} Z" for bx, by in lit), F_BRICK2, "none", 0, 'opacity="0.55"'))
    # the round window in the gable: lit by the fire, a cross of iron
    g.append(circ(246, 205, 22, "url(#fwlit)", INK, LB))
    g.append(line(224, 205, 268, 205, INK, LM)); g.append(line(246, 183, 246, 227, INK, LM))
    g.append(circ(246, 205, 22, "none", STONE, 5.0))
    g.append(circ(246, 205, 25, "none", INK, LM))
    g.append(circ(246, 205, 19.5, "none", INK, LT))
    g.append(path("M232,196 Q236,189 242,187", "none", "#FFFFFF", 1.4, 'opacity="0.45"'))
    # the gable's coping (a thick stone edge) and the cornice
    g.append(path(poly([(hall0 - 10, top + 2), ((hall0 + hall1) / 2, peak - 12), (hall1 + 10, top + 2), (hall1 + 10, top - 8), ((hall0 + hall1) / 2, peak - 22), (hall0 - 10, top - 8)]),
                  STONE2, INK, LB))
    g.append(line(hall0 - 4, top - 7, (hall0 + hall1) / 2, peak - 19, "#8E7FA6", 1.4, 'opacity="0.55"'))
    g.append(rect(hall0 - 8, 238, hall1 - hall0 + 16, 14, STONE2, INK, LB))
    g.append(line(hall0 - 4, 241.5, hall1 + 4, 241.5, "#8E7FA6", 1.4, 'opacity="0.55"'))
    # the vent cupola on the peak, louvred, with a flame finial
    cx = (hall0 + hall1) / 2
    g.append(rect(cx - 17, 118, 34, 30, IRON2, INK, LB))
    for ly in (124, 131, 138):
        g.append(line(cx - 12, ly, cx + 12, ly + 3, INK, LM))
    g.append(path(poly([(cx - 24, 120), (cx, 100), (cx + 24, 120)]), ROOF2, INK, LB))
    g.append(line(cx, 100, cx, 88, INK, 2.0))
    g.extend(flame_icon(cx, 78, 20, GOLD, "#F4A65C", LM))
    # a riveted steel band under the cornice, running into the stack
    g.append(rect(hall0, 256, hall1 - hall0, 9, BAND, INK, LM))
    g.extend(rivets([(x, 260.5) for x in range(hall0 + 10, hall1 - 4, 22)], ref="fwrv"))
    # the counter plate: a riveted iron frame round a blank dark plate (the site writes EMO BURNED + the number)
    PL = (116, 280, 268, 76)            # inner, blank
    g.append(rrect(PL[0] - 12, PL[1] - 12, PL[2] + 24, PL[3] + 24, 5, IRON2, INK, LB))
    g.append(rect(PL[0], PL[1], PL[2], PL[3], "#170C20", INK, LB))
    g.append(line(PL[0] + 3, PL[1] + PL[3] - 3, PL[0] + PL[2] - 3, PL[1] + PL[3] - 3, "#4E3A63", 1.2, 'opacity="0.6"'))
    g.append(line(PL[0] + PL[2] - 3, PL[1] + 3, PL[0] + PL[2] - 3, PL[1] + PL[3] - 3, "#4E3A63", 1.2, 'opacity="0.6"'))
    g.append(line(PL[0] - 8, PL[1] - 8, PL[0] + PL[2] + 8, PL[1] - 8, "#8E7FB0", 1.3, 'opacity="0.55"'))
    rv = [(PL[0] - 6 + k * (PL[2] + 12) / 12, PL[1] - 6) for k in range(13)] + [(PL[0] - 6 + k * (PL[2] + 12) / 12, PL[1] + PL[3] + 6) for k in range(13)]
    rv += [(PL[0] - 6, PL[1] + PL[3] / 2), (PL[0] + PL[2] + 6, PL[1] + PL[3] / 2)]
    g.extend(rivets(rv, ref="fwrv"))
    # brackets: two iron straps holding the plate to the wall
    for bx in (PL[0] + 30, PL[0] + PL[2] - 30):
        g.append(rect(bx - 4, PL[1] - 22, 8, 12, IRON3, INK, LM))
    # -------- the mouth --------
    # the plinth along the base first (the jambs stand on it)
    g.append(rect(hall0, G - 22, hall1 - hall0, 22, STONE2, INK, LB))
    for sx in range(hall0 + 34, hall1, 42):
        g.append(line(sx, G - 20, sx, G - 2, INK, LT, 'opacity="0.6"'))
    g.append(line(hall0 + 4, G - 19, hall1 - 4, G - 19, "#8E7FA6", 1.2, 'opacity="0.5"'))
    # the ring of arch bricks (voussoirs), jambs down to the ground, and a flame keystone
    g.append(path(arch_d(MX - VR, MY - VR, 2 * VR, G - (MY - VR)), "#63303F", INK, LB))
    for k in range(1, 16):
        a = math.pi + math.pi * k / 16
        if abs(a - 1.5 * math.pi) < 0.12: continue
        g.append(line(MX + FR * math.cos(a), MY + FR * math.sin(a), MX + VR * math.cos(a), MY + VR * math.sin(a), F_MORTAR, LM, 'opacity="0.8"'))
    for jy in range(MY + 14, G, 16):
        for side in (-1, 1):
            g.append(line(MX + side * FR, jy, MX + side * VR, jy, F_MORTAR, LM, 'opacity="0.8"'))
    g.append(path(smooth_open(arc_pts(MX, MY, VR - 5, VR - 5, 196, 262, 8), 0.5), "none", "#A0607A", 2.0, 'opacity="0.45"'))
    # the heavy iron frame
    g.append(path(arch_d(MX - FR, MY - FR, 2 * FR, G - (MY - FR)), IRON, INK, LB))
    g.append(path(smooth_open(arc_pts(MX, MY, FR - 4, FR - 4, 190, 268, 8), 0.5), "none", IRON3, 2.0, 'opacity="0.8"'))
    fr_pts = [(MX + (MR + 8) * math.cos(math.pi + math.pi * k / 14), MY + (MR + 8) * math.sin(math.pi + math.pi * k / 14)) for k in range(15)]
    fr_pts += [(MX + s * (MR + 8), yy) for s in (-1, 1) for yy in range(MY + 18, G - 8, 20)]
    g.extend(rivets(fr_pts, ref="fwrv"))
    # the fire: gradient, the back of the firebox, flames, coals, and the grate in front (all clipped to the mouth)
    mouth = arch_d(MX - MR, MY - MR, 2 * MR, G - (MY - MR))
    g.append(f'<clipPath id="fwmouth"><path d="{mouth}"/></clipPath>')
    g.append(path(mouth, "url(#fwfire)", "none", 0))
    g.append('<g clip-path="url(#fwmouth)">')
    # the firebrick lining at the back, faint, in the upper dark
    for k in range(1, 9):
        a = math.pi + math.pi * k / 9
        g.append(line(MX + 62 * math.cos(a), MY + 62 * math.sin(a), MX + 100 * math.cos(a), MY + 100 * math.sin(a), "#2A0610", 1.2, 'opacity="0.45"'))
    g.append(path(smooth_open(arc_pts(MX, MY, 62, 62, 180, 360, 12), 0.5), "none", "#2A0610", 1.2, 'opacity="0.45"'))
    # the fire: tall tongues of the game's own flame, orange at the back, yellow in front, white-hot hearts
    for (fx, fw, fh, fl, lean) in ((166, 44, 120, False, -8), (318, 44, 126, True, 8), (208, 50, 168, True, -6), (284, 50, 160, False, 7), (246, 60, 196, False, 3)):
        g.extend(tongue(fx, 612, fw, fh, "#FF7A2E", INK, LM, fl, lean))
    for (fx, fw, fh, fl, lean) in ((184, 40, 96, False, -5), (302, 40, 100, True, 6), (232, 46, 128, True, -4), (266, 44, 118, False, 5)):
        g.extend(tongue(fx, 612, fw, fh, "#FFC94D", INK, LT, fl, lean, core="#FFF3C4"))
    # the bed of coals
    coals = [(162, 600, 22, 12), (206, 598, 22, 11), (250, 602, 24, 12), (292, 598, 22, 11), (332, 601, 20, 12)]
    for (kx, ky, rx, ry) in coals:
        g.append(ellipse(kx, ky, rx, ry, "#3A0A14", INK, LT))
    for (kx, ky, rx, ry) in coals:
        g.append(path(f"M{kx - rx*0.6:.1f},{ky - ry*0.45:.1f} Q{kx:.1f},{ky - ry*1.05:.1f} {kx + rx*0.6:.1f},{ky - ry*0.45:.1f}", "none", "#FF9B3D", 2.2, 'opacity="0.9"'))
    g.append('</g>')
    # the grate across the lower mouth: a rail, bars, and their fire-lit tops
    g.append(rect(MX - MR, 562, 2 * MR, 8, IRON, INK, LM))
    for bx in range(MX - MR + 16, MX + MR - 6, 20):
        g.append(rect(bx - 3.5, 568, 7, G - 568, IRON, INK, LM))
    for bx in range(MX - MR + 16, MX + MR - 6, 20):
        g.append(line(bx - 1.5, 571, bx - 1.5, G - 4, "#FF9B3D", 1.1, 'opacity="0.6"'))
    g.append(line(MX - MR + 3, 563.5, MX + MR - 3, 563.5, "#FFB45A", 1.4, 'opacity="0.8"'))
    # fire-lit inner edge of the frame
    g.append(path(smooth_open(arc_pts(MX, MY, MR + 1.5, MR + 1.5, 185, 355, 14), 0.5), "none", "#FF9B3D", 2.0, 'opacity="0.55"'))
    # the keystone, with the flame
    kt = [(MX - 13, MY - FR + 3), (MX + 13, MY - FR + 3), (MX + 18, MY - VR - 8), (MX - 18, MY - VR - 8)]
    g.append(path(poly(kt), STONE, INK, LB))
    g.append(line(MX - 14, MY - VR - 5, MX + 14, MY - VR - 5, "#A99BC0", 1.2, 'opacity="0.6"'))
    g.extend(flame_icon(MX, MY - FR - 12, 20, GOLD, "#F4A65C", LM))
    # the hearth: an iron plate lit along its lip, a stone step onto the pavement
    g.append(rect(MX - FR - 4, G - 2, 2 * FR + 8, 9, IRON2, INK, LM))
    g.append(line(MX - MR, G - 0.5, MX + MR, G - 0.5, "#FFB45A", 1.6, 'opacity="0.75"'))
    g.append(rect(MX - FR - 16, G + 6, 2 * FR + 32, 9, STONE2, INK, LM))
    # -------- the chute: out of the hopper, down across the frame into the fire, coins riding it --------
    P0 = (58, 456); P1 = (206, 538)
    def cy_at(x): return P0[1] + (x - P0[0]) * (P1[1] - P0[1]) / (P1[0] - P0[0])
    back_wall = [(P0[0], cy_at(P0[0]) - 26), (P1[0], cy_at(P1[0]) - 26), (P1[0], cy_at(P1[0]) + 2), (P0[0], cy_at(P0[0]) + 2)]
    g.append(path(poly(back_wall), "#3A2F4E", INK, LB))
    g.append(line(P0[0] + 4, cy_at(P0[0]) - 22, P1[0] - 2, cy_at(P1[0]) - 22, "#6F5C8F", 1.3, 'opacity="0.7"'))
    # braces from the chute to the wall
    g.append(path(poly([(104, cy_at(104) + 2), (110, cy_at(104) + 2), (98, 540), (92, 540)]), IRON2, INK, LM))
    # the coins rolling down (the last one tips off the end into the fire)
    coins = [(84, 13, -20), (116, 13, 25), (148, 13, -35), (180, 13, 40)]
    for (x, r, rot) in coins:
        g.append(coin_use("fwcoin", x, cy_at(x) - r - 1, rot))
    g.append(coin_use("fwcoin", 222, 560, 62, 0.92))
    # the front lip of the chute, over the coins' lower edges
    lip = [(P0[0], cy_at(P0[0]) - 7), (P1[0] + 4, cy_at(P1[0] + 4) - 7), (P1[0] + 4, cy_at(P1[0] + 4) + 5), (P0[0], cy_at(P0[0]) + 5)]
    g.append(path(poly(lip), STEEL3, INK, LB))
    g.append(line(P0[0] + 3, cy_at(P0[0]) - 4.5, P1[0], cy_at(P1[0]) - 4.5, STEEL2, 1.3, 'opacity="0.7"'))
    g.extend(rivets([(x, cy_at(x) - 1) for x in (74, 110, 146, 182)], ref="fwrv2"))
    # the hopper: a riveted funnel on the side house, heaped with coins
    hop = [(16, 386), (100, 386), (80, 438), (72, 452), (50, 452), (40, 438)]
    for (x, y) in ((30, 381), (54, 379), (78, 381), (42, 371), (66, 370), (56, 361)):
        g.append(f'<use href="#fwcoinE" x="{x}" y="{y}"/>')
    g.append(path(poly(hop), "#5D4D78", INK, LB))
    g.append(rect(12, 382, 92, 9, IRON3, INK, LM))
    g.append(line(16, 385, 100, 385, STEEL2, 1.2, 'opacity="0.6"'))
    g.append(line(28, 396, 44, 436, "#8E7FB0", 1.4, 'opacity="0.5"'))
    g.extend(rivets([(26, 402), (58, 402), (90, 402), (46, 432), (74, 432)], ref="fwrv2"))
    g.append(coin_use("fwcoin", 58, 416, 0, 0.77))                                        # its badge: the coin
    g.append(rect(88, 404, 14, 6, IRON3, INK, LT))                                # a strap to the wall
    # -------- the stack's pier, in front of the hall's right edge --------
    g.append(path(poly([(PX0, G), (PX0, 236), (PX1, 236), (PX1, G)]), WALL, INK, LB))
    dd, u = prebake("fwm3", brick_courses(PX0, 236, PX1, G - 22, 24, 12, skip=lambda x, y: (406 < x < 484 and 540 < y) or (410 < x < 470 and 300 < y < 424))); defs += dd; g.append(u)
    g.append(rect(PX0 - 6, 226, PX1 - PX0 + 12, 14, STONE2, INK, LB))
    g.append(line(PX0 - 2, 229.5, PX1 + 2, 229.5, "#8E7FA6", 1.3, 'opacity="0.55"'))
    g.append(path(poly([(PX1 - 16, 242), (PX1, 242), (PX1, G - 22), (PX1 - 16, G - 22)]), SHADE, "none", 0, 'opacity="0.2"'))
    g.append(rect(PX0 - 4, G - 22, PX1 - PX0 + 8, 22, STONE2, INK, LB))
    g.append(line(PX0, G - 19, PX1, G - 19, "#8E7FA6", 1.2, 'opacity="0.5"'))
    # the ash door at the pier's foot, glowing at its seams
    g.append(path(arch_d(420, 548, 48, G - 22 - 548), "#FF8A34", INK, LB))
    g.append(path(arch_d(423, 551, 42, G - 22 - 551), IRON, INK, LM))
    g.extend(rivets([(430, 572), (458, 572), (430, 588), (458, 588)], ref="fwrv2"))
    g.append(rect(452, 576, 12, 5, BRASS, INK, LT))
    # a steam pipe up the pier, a valve wheel, and two brass pressure gauges (one needle deep in the red)
    PX = 480
    g.append(rect(PX - 7, 300, 14, G - 22 - 300, IRON3, INK, LB))
    g.append(line(PX - 3, 306, PX - 3, G - 26, "#8E7FB0", 1.3, 'opacity="0.6"'))
    g.append(rrect(PX - 10, 292, 20, 16, 5, IRON3, INK, LB))                      # its elbow into the pier
    for fy in (360, 440, 520):
        g.append(rect(PX - 10, fy, 20, 6, BRASS, INK, LM))
    wx, wy = PX, 484
    g.append(circ(wx, wy, 13, "none", INK, 5.0)); g.append(circ(wx, wy, 13, "none", "#B8313F", 3.0))
    for a in (0, 60, 120):
        ra = math.radians(a)
        g.append(line(wx - 12 * math.cos(ra), wy - 12 * math.sin(ra), wx + 12 * math.cos(ra), wy + 12 * math.sin(ra), INK, 2.0))
    g.append(circ(wx, wy, 3.2, BRASS2, INK, LT))
    def gauge(gx, gy, r, needle_deg):
        out = [rect(gx + r - 2, gy - 3.5, PX - 7 - (gx + r - 2), 7, BRASS, INK, LM)]     # its stub to the pipe
        out.append(circ(gx, gy, r + 4, BRASS, INK, LB))
        out.append(circ(gx, gy, r, FACE, INK, LM))
        out.append(arc(gx, gy, r - 4, r - 4, 300, 350, "#C2263A", 3.2, 'opacity="0.9"', 5))
        for k in range(7):
            a = math.radians(150 + 240 * k / 6)
            out.append(line(gx + (r - 3) * math.cos(a), gy + (r - 3) * math.sin(a), gx + (r - 6.5) * math.cos(a), gy + (r - 6.5) * math.sin(a), INK, 1.1))
        a = math.radians(needle_deg)
        out.append(path(poly([(gx + (r - 5) * math.cos(a), gy + (r - 5) * math.sin(a)), (gx + 2.2 * math.cos(a + 1.57), gy + 2.2 * math.sin(a + 1.57)),
                              (gx + 2.2 * math.cos(a - 1.57), gy + 2.2 * math.sin(a - 1.57))]), RUBY, INK, 0.9))
        out.append(circ(gx, gy, 2.4, INK, "none", 0))
        out.append(arc(gx, gy, r + 1.8, r + 1.8, 200, 250, "#FFF3C8", 1.3, 'opacity="0.7"', 5))
        return out
    g.extend(gauge(440, 336, 19, 338))
    g.extend(gauge(446, 398, 15, 250))
    # a coal shovel leaning on the side house, and a coin that missed
    g.append(line(78, G - 4, 98, G - 118, INK, 5.2)); g.append(line(78, G - 4, 98, G - 118, "#7A5238", 3.0))
    g.append(path(poly([(92, G - 118), (104, G - 118), (100, G - 128), (96, G - 128)]), IRON3, INK, LM))
    g.append(path(smooth_closed([(66, G - 2), (70, G - 26), (88, G - 28), (94, G - 4)], 0.3), IRON3, INK, LM))
    g.append(line(72, G - 22, 88, G - 24, STEEL2, 1.2, 'opacity="0.6"'))
    g.append(f'<use href="#fwcoinE" x="372" y="{G + 2}"/>')
    svg("furnace", W, H, merge_runs(g), defs=defs, step=STEP)
    ANCHORS["furnace"] = {
        "name": "furnace", "W": W, "H": H, "G": G, "kind": "building",
        "anchors": {
            "signs": [{"x": PL[0], "y": PL[1], "w": PL[2], "h": PL[3], "text": "EMO BURNED / <live number>", "style": "neon-gold",
                       "note": "blank dark iron plate in a riveted frame; big glowing digits, the label small above them"}],
            "fire": {"mouth": {"x": MX - MR, "y": MY - MR, "w": 2 * MR, "h": G - (MY - MR), "arch_r": MR, "arch_cx": MX, "arch_cy": MY},
                     "note": "flicker over the whole mouth (brighten/dim, a warm light pool on the pavement in front); embers rise from the coals",
                     "embers_from": [{"x": 200, "y": 590}, {"x": 246, "y": 584}, {"x": 296, "y": 590}],
                     "coin_drop": {"x": 222, "y": 560, "note": "the last coin tipping off the chute into the fire"}},
            "smoke": [{"x": SX, "y": 20, "note": "the stack's mouth: a thick slow smoke column, drifting"}],
            "steam": [{"x": FX, "y": 104, "note": "safety valve on the flue elbow: occasional puffs"}],
            "windows": [{"x": 224, "y": 183, "w": 44, "h": 44, "shape": "circle", "cx": 246, "cy": 205, "r": 22, "note": "fire-lit round window, flicker with the mouth"},
                        {"x": 22, "y": 500, "w": 44, "h": 52, "note": "stoker's room, fire-lit"}],
            "light": [{"x": 420, "y": 548, "w": 48, "h": G - 22 - 548, "note": "the ash door at the stack's foot: its seams glow orange, a faint pulse"},
                      {"x": 440, "y": 336, "note": "gauge 1 (needle in the red): the site may jitter the needle"}],
            "chute": {"coin_path": [[70, round(cy_at(70) - 14)], [196, round(cy_at(196) - 14)], [222, 560], [246, 592]], "coin_r": 13,
                      "note": "coin centres along the chute, then the drop into the coals: the site may slide extra $EMO coins down it"},
            "hopper": {"x": 12, "y": 360, "w": 92, "h": 92, "note": "the coin hopper (coins heaped in its mouth at y~360-386)"},
            "doors": [],
        }}

# ---------------- the park ----------------
HEDGE  = "#2E4A3A"
HEDGE2 = "#3A5E45"
HEDGE3 = "#4C7556"
HEDGE4 = "#6E9A74"
HEDGED = "#1F3328"
FENCE  = "#221A33"
FENCE2 = "#6E5C8C"
BLOOM1 = "#F07AA6"
BLOOM2 = "#C9A6EC"
BLOOM3 = "#F4EEF8"
LIL0 = "#2E2046"     # canopy shadow
LIL1 = "#46306A"     # canopy
LIL2 = "#56407E"     # clumps, lit
LIL3 = "#6A5296"     # moonlit clumps
LIL4 = "#8E78BE"     # moonlit edges

def bloom_def(bid, petal, centre=GOLD, r=3.0):
    """A small five-petal flower at the origin, baked once into <defs>."""
    g = []
    for k in range(5):
        a = math.radians(-90 + 72 * k)
        g.append(circ(r * 1.05 * math.cos(a), r * 1.05 * math.sin(a), r, petal, INK, 0.9))
    g.append(circ(0, 0, r * 0.62, centre, INK, 0.8))
    return prebake(bid, g, step=8.0, amp=0.5)[0]

def leaf_defs(prefix, fill=None, n=3):
    """Three leaf clusters at the origin (a lobed blob, an ink crease, a moonlit tick), baked once into <defs>."""
    out = ""
    for v in range(n):
        r = 12 + v; pts = []
        for k in range(9):
            a = 2 * math.pi * k / 9; rr = r * (1 + 0.2 * math.sin(3 * a + v * 1.7))
            pts.append((rr * math.cos(a), rr * 0.78 * math.sin(a)))
        g = [path(smooth_closed(pts, 0.5), fill or HEDGE2, INK, LM),
             path(f"M{-r * 0.2:.1f},{r * 0.5:.1f} Q{r * 0.05:.1f},{0:.1f} {r * 0.55:.1f},{-r * 0.2:.1f}", "none", "#1A2A22", 1.2, 'opacity="0.8"'),
             path(f"M{-r * 0.55:.1f},{-r * 0.15:.1f} Q{-r * 0.3:.1f},{-r * 0.6:.1f} {r * 0.15:.1f},{-r * 0.55:.1f}", "none", HEDGE4, 1.6, 'opacity="0.85"')]
        out += prebake(f"{prefix}{v}", g, step=8.0)[0]
    return out

def use(uid, x, y, scale=1.0, rot=0):
    t = f"translate({x:.1f} {y:.1f})" + (f" rotate({rot:.0f})" if rot else "") + (f" scale({scale:.2f})" if scale != 1 else "")
    return f'<use href="#{uid}" transform="{t}"/>'

def union_outline(circles, cx, cy, n=150):
    """The outline of a union of circles, by rays from a point inside it: a cloud with real cusps between clumps."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n; ux, uy = math.cos(a), math.sin(a); best = 0.0
        for (x, y, r) in circles:
            dx, dy = cx - x, cy - y; b = dx * ux + dy * uy; c = dx * dx + dy * dy - r * r; disc = b * b - c
            if disc >= 0:
                t = -b + math.sqrt(disc)
                best = max(best, t)
        pts.append((cx + best * ux, cy + best * uy))
    return pts

def resample(pts, spacing, closed=True):
    """Points every `spacing` units along a polyline."""
    seq = pts + [pts[0]] if closed else pts
    out = [seq[0]]; acc = 0.0
    for i in range(1, len(seq)):
        (x0, y0), (x1, y1) = seq[i - 1], seq[i]; L = math.hypot(x1 - x0, y1 - y0); t = 0.0
        while acc + L * (1 - t) >= spacing:
            t += (spacing - acc) / L; acc = 0.0
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
        acc += L * (1 - t)
    return out[:-1] if closed and math.dist(out[-1], out[0]) < spacing * 0.5 else out

def bumps(pts, cx, cy, depth, sub=4, closed=True, outward=True):
    """A chain of little leafy bulges between consecutive points, pushed away from (cx, cy), as a plain polyline
    (short straight segments cost the baker ~12 bytes a point; a curve costs ~150)."""
    out = []; n = len(pts); rng = n if closed else n - 1
    for i in range(rng):
        p, q = pts[i], pts[(i + 1) % n]
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        ux, uy = mx - cx, my - cy; L = math.hypot(ux, uy) or 1
        sgn = 1 if outward else -1
        c = (mx + sgn * ux / L * depth * 2, my + sgn * uy / L * depth * 2)
        for k in range(0 if i == 0 and not closed else 1, sub + 1):
            t = k / sub
            out.append(((1 - t) ** 2 * p[0] + 2 * (1 - t) * t * c[0] + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * c[1] + t * t * q[1]))
    return out

def polyline(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

def canopy(pid, circles, cx, cy, light_side=-1, moon=None, leaf=13.0):
    """A tree's canopy in night lilac: one cloud outline with a leafy scalloped edge; inside it every clump, from the
    back (top) to the front (bottom), is a shadowed ball with a lit cap and a scalloped ink crease under it; small
    moonlit caps and rims on the light side. Returns (elements, outline points)."""
    pts = union_outline(circles, cx, cy, 180)
    edge = bumps(resample(pts, leaf), cx, cy, 2.2, 3)
    d = poly(edge)
    g = [path(d, LIL0, INK, 4.4)]                                                # the inner half gets covered
    g.append(f'<clipPath id="{pid}clip"><path d="{d}"/></clipPath>')
    g.append(f'<g clip-path="url(#{pid}clip)">')
    order = sorted(circles, key=lambda c: -c[1])                                  # shingled: low clumps behind, each
    for (x, y, r) in order:                                                       # higher one over them with its shadow
        g.append(circ(x - light_side * r * 0.04, y + r * 0.14, round(r * 0.97, 1), LIL0, "none", 0))
        g.append(circ(x, y, round(r * 0.97, 1), LIL1, "none", 0))
        g.append(circ(x + light_side * r * 0.1, y - r * 0.16, round(r * 0.8, 1), LIL2, "none", 0))
        crease = [(x + r * 0.97 * math.cos(math.radians(a)), y + r * 0.97 * math.sin(math.radians(a))) for a in range(20, 161, 4)]
        g.append(path(polyline(bumps(resample(crease, 11, False), x, y, 2.4, 3, False)), "none", INK, LM, 'opacity="0.9"'))
    moon = moon if moon is not None else [c for c in order if (c[0] - cx) * light_side > -c[2] * 0.4 and c[1] < cy + 10]
    for (x, y, r) in moon:
        g.append(circ(x + light_side * r * 0.3, y - r * 0.38, round(r * 0.36, 1), LIL3, "none", 0))
    for (x, y, r) in moon:
        a0, a1 = (192, 262) if light_side < 0 else (278, 348)
        g.append(arc(x + light_side * r * 0.1, y - r * 0.16, r * 0.8 - 2.5, r * 0.8 - 2.5, a0, a1, LIL4, 2.0, 'opacity="0.75"', 6))
    g.append('</g>')
    return g, edge

def outline_at(pts, cx, cy, deg, inset=8):
    """The point of an outline in the direction `deg` from its centre (y down), pulled `inset` units inward."""
    a = math.radians(deg); best = None
    for (x, y) in pts:
        da = abs((math.atan2(y - cy, x - cx) - a + math.pi) % (2 * math.pi) - math.pi)
        if best is None or da < best[0]: best = (da, x, y)
    x, y = best[1], best[2]; L = math.hypot(x - cx, y - cy)
    return {"x": round(x - (x - cx) / L * inset), "y": round(y - (y - cy) / L * inset)}

def bark(x0, y0, x1, y1, n, seed):
    """A few bark lines up a trunk (short slightly curved strokes)."""
    import random
    rnd = random.Random(seed); out = []
    for k in range(n):
        t = (k + 0.5) / n; y = y0 + (y1 - y0) * t; x = x0 + (x1 - x0) * t + rnd.uniform(-6, 6)
        L = rnd.uniform(14, 26)
        out.append(f"M{x:.1f},{y:.1f} Q{x + rnd.uniform(-3, 3):.1f},{y - L / 2:.1f} {x + rnd.uniform(-2, 2):.1f},{y - L:.1f}")
    return path(" ".join(out), "none", WOOD2, LM, 'opacity="0.9"')

def hedge():
    """The park's back edge: a trimmed hedge (tileable: it runs flush off both sides), a low iron fence in front of
    it, and a gap in the middle under an iron arch grown over with climbing roses and wisteria."""
    W, H = 640, 170; G = H - 16
    g = []
    defs = bloom_def("hgbl1", BLOOM1) + bloom_def("hgbl2", BLOOM2) + bloom_def("hgbl3", BLOOM3, PINK)
    defs += leaf_defs("hglf")
    TOP = 50; GAP0, GAP1 = 270, 370
    N = 36; sp = W / N
    def top_edge(xa, xb):
        """Trimmed top: a row of soft leafy bumps, periodic in W so the strip tiles."""
        d = []; k = math.floor(xa / sp)
        while k * sp < xb:
            x = k * sp; x2 = x + sp; h = 5 + 1.5 * math.sin(k * 2.1)
            d.append((x, x2, h)); k += 1
        return d
    def block(xa, xb, round_left, round_right):
        bumps = [(x, x2, h) for (x, x2, h) in top_edge(xa, xb)]
        s_ = f"M{xa:.1f},{G:.1f} "
        if round_left:
            s_ += f"L{xa:.1f},{TOP + 18:.1f} Q{xa:.1f},{TOP:.1f} {xa + 18:.1f},{TOP:.1f} "
        else:
            s_ += f"L{xa:.1f},{TOP:.1f} "
        for (x, x2, h) in bumps:
            lo, hi = max(x, xa + (18 if round_left else 0)), min(x2, xb - (18 if round_right else 0))
            if hi - lo < 4: continue
            s_ += f"L{lo:.1f},{TOP:.1f} Q{(lo + hi) / 2:.1f},{TOP - h * 1.6 * (hi - lo) / sp:.1f} {hi:.1f},{TOP:.1f} "
        if round_right:
            s_ += f"L{xb - 18:.1f},{TOP:.1f} Q{xb:.1f},{TOP:.1f} {xb:.1f},{TOP + 18:.1f} "
        else:
            s_ += f"L{xb:.1f},{TOP:.1f} "
        s_ += f"L{xb:.1f},{G:.1f} Z"
        return s_
    # beyond the gap: the park goes on (a far hedge, dim, no ink)
    g.append(path(smooth_closed([(GAP0 + 4, G), (GAP0 + 4, 108), (300, 98), (330, 102), (356, 96), (GAP1 - 4, 106), (GAP1 - 4, G)], 0.4), "#1B2B25", "none", 0))
    g.append(path(f"M{GAP0 + 10},{G} L{GAP1 - 10},{G} L{(GAP0 + GAP1) / 2 + 12},{G - 18} L{(GAP0 + GAP1) / 2 - 12},{G - 18} Z", "#3B3150", "none", 0, 'opacity="0.8"'))
    left = block(-8, GAP0, False, True); right = block(GAP1, W + 8, True, False)
    for i, bd in enumerate((left, right)):
        xa, xb = (-8, GAP0 - 3) if i == 0 else (GAP1 + 3, W + 8)
        g.append(path(bd, HEDGE3, INK, LB))                                                  # the clipped top, moonlit
        face = f"M{xa},{TOP + 12} " + " ".join(f"Q{x + 11:.1f},{TOP + 19 + 1.5 * math.sin(x):.1f} {min(x + 22, xb):.1f},{TOP + 12}" for x in range(int(xa), int(xb) - 4, 22))
        face += f" L{xb},{G - 1.5} L{xa},{G - 1.5} Z"
        g.append(path(face, HEDGE, "none", 0))
        g.append(rect(xa, G - 28, xb - xa, 26.5, HEDGED, "none", 0, 'opacity="0.8"'))          # its shadowed foot
    # leaf clumps on the faces and the leaf ticks (one prebaked path)
    import random
    rnd = random.Random(7); clumps = []; ticks = []
    for k in range(34):
        x = rnd.uniform(0, W); y = rnd.uniform(TOP + 26, G - 26)
        if GAP0 - 14 < x < GAP1 + 14: continue
        r = rnd.uniform(9, 15)
        clumps.append((x, y, r))
    for (x, y, r) in clumps:
        pts = [(x + r * math.cos(a) * (1 + 0.14 * math.sin(3 * a)), y + r * 0.7 * math.sin(a) * (1 + 0.14 * math.sin(3 * a))) for a in [2 * math.pi * k / 7 for k in range(7)]]
        g.append(path(smooth_closed(pts, 0.5), HEDGE2, "none", 0))
    for (x, y, r) in clumps:
        g.append(arc(x, y, r, r * 0.7, 20, 150, "#1A2A22", 1.3, 'opacity="0.8"', 6))
    for k in range(150):
        x = rnd.uniform(4, W - 4); y = rnd.uniform(TOP + 6, G - 14)
        if GAP0 - 6 < x < GAP1 + 6: continue
        ticks.append(f"M{x - 3:.1f},{y - 2:.1f} Q{x:.1f},{y + 2.5:.1f} {x + 3:.1f},{y - 2:.1f}")
    dd, u = prebake("hgticks", [path(" ".join(ticks[:90]), "none", HEDGE4, 1.3, 'opacity="0.55"'), path(" ".join(ticks[90:]), "none", "#15241C", 1.2, 'opacity="0.6"')], step=24)
    defs += dd; g.append(u)
    # the arch: two iron posts and a round top, a lattice between the bars, grown over
    AX = (GAP0 + GAP1) / 2; AY = 64; RO, RI = 50, 41
    for sx in (-1, 1):
        x0 = AX + sx * RI; x1 = AX + sx * RO
        g.append(rect(min(x0, x1), AY, abs(x1 - x0), G - AY, "none", INK, LM))
    arch_d = (f"M{AX - RO},{G} L{AX - RO},{AY} C{AX - RO},{AY - RO * 0.55:.1f} {AX - RO * 0.55:.1f},{AY - RO} {AX},{AY - RO} "
              f"C{AX + RO * 0.55:.1f},{AY - RO} {AX + RO},{AY - RO * 0.55:.1f} {AX + RO},{AY} L{AX + RO},{G} L{AX + RI},{G} L{AX + RI},{AY} "
              f"C{AX + RI},{AY - RI * 0.55:.1f} {AX + RI * 0.55:.1f},{AY - RI} {AX},{AY - RI} C{AX - RI * 0.55:.1f},{AY - RI} {AX - RI},{AY - RI * 0.55:.1f} {AX - RI},{AY} L{AX - RI},{G} Z")
    g.append(path(arch_d, FENCE, INK, LM))
    lat = []
    for k in range(9):
        a = math.pi + math.pi * k / 8
        lat.append(f"M{AX + RI * math.cos(a):.1f},{AY + RI * math.sin(a):.1f} L{AX + RO * math.cos(a):.1f},{AY + RO * math.sin(a):.1f}")
    for yy in range(AY + 12, G, 14):
        for sx in (-1, 1):
            lat.append(f"M{AX + sx * RI:.1f},{yy} L{AX + sx * RO:.1f},{yy + 7}")
    g.append(path(" ".join(lat), "none", FENCE2, 1.2, 'opacity="0.8"'))
    # climbing leaves over the arch: leaf clusters all along it, thick at the top, a few trailing down the posts
    lv = []
    for k in range(15):
        a = math.pi + math.pi * k / 14
        lv.append((AX + (RO - 3) * math.cos(a), AY + (RO - 3) * math.sin(a), 1.0 + 0.15 * math.sin(k * 1.3), k * 47))
    for (x, y) in ((AX - RO + 2, 96), (AX - RO + 4, 122), (AX - RO + 1, G - 16), (AX - RO + 6, G - 40), (AX + RO - 2, 98), (AX + RO - 5, 128), (AX + RO - 1, G - 28)):
        lv.append((x, y, 0.85, int(x * 3 + y) % 360))
    for i, (x, y, sc, rot) in enumerate(lv):
        g.append(use(f"hglf{i % 3}", x, y, sc, rot))
    blooms = [(AX - RO + 6, G - 34, 1), (AX - RO - 2, G - 70, 2), (AX - RO + 8, 112, 1), (AX - RO + 2, 86, 3), (AX - 44, 46, 2), (AX - 30, 24, 1),
              (AX - 10, 12, 3), (AX + 12, 14, 1), (AX + 32, 24, 2), (AX + 46, 44, 1), (AX + RO - 4, 76, 3), (AX + RO + 2, 106, 2), (AX + RO - 6, G - 56, 1),
              (AX + RO + 4, G - 30, 2), (AX - RO - 6, 58, 1), (AX + RO + 8, 60, 2), (AX - 18, 30, 2), (AX + 22, 30, 3)]
    for (x, y, k) in blooms:
        g.append(use(f"hgbl{k}", x, y, 1.15 if k == 1 else 1.0))
    # hanging wisteria drops from the top of the arch
    for (x, y, n) in ((AX - 22, 24, 4), (AX + 4, 20, 5), (AX + 26, 26, 4)):
        for j in range(n):
            g.append(use("hgbl2", x + (j % 2) * 2 - 1, y + 6 + j * 6, 0.62))
    # the iron fence in front (tileable: pickets every 16, posts every 128), stopping at two gate posts
    PT = G - 52; R1, R2 = G - 40, G - 12
    for v in range(3):
        pk = [path(f"M-2.5,{G:.1f} L-2.5,{PT + 7:.1f} L-5,{PT + 9:.1f} L0,{PT:.1f} L5,{PT + 9:.1f} L2.5,{PT + 7:.1f} L2.5,{G:.1f} Z", FENCE, INK, LT),
              line(-1, PT + 10, -1, G - 4, FENCE2, 1.1, 'opacity="0.6"')]
        body = bake("\n".join(pk), amp=0.7, freq=0.09, step=10.0 + 3 * v)
        body = re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}").rstrip("0").rstrip("."), body)
        defs += f'<g id="hgpk{v}">{body}</g>'
    xs = [x for x in range(8, W, 16) if not (GAP0 - 14 < x < GAP1 + 14)]
    rails = []
    for (xa, xb) in ((-4, GAP0 - 10), (GAP1 + 10, W + 4)):
        rails.append(rect(xa, R1 - 2.5, xb - xa, 5, FENCE, INK, LT))
        rails.append(rect(xa, R2 - 2.5, xb - xa, 5, FENCE, INK, LT))
    g.extend(rails)
    for x in xs:
        if x % 128 == 72: continue
        g.append(f'<use href="#hgpk{(x // 16) % 3}" x="{x}" y="0"/>')
    posts = [x for x in range(72, W, 128) if not (GAP0 - 20 < x < GAP1 + 20)] + [GAP0 - 10, GAP1 + 10]
    for x in posts:
        big = x in (GAP0 - 10, GAP1 + 10)
        w = 12 if big else 8; top_ = PT - (14 if big else 6)
        g.append(rect(x - w / 2, top_ + 6, w, G - top_ - 6, FENCE, INK, LM))
        g.append(circ(x, top_, 7 if big else 5, FENCE, INK, LM))
        g.append(line(x - w / 2 + 2.5, top_ + 10, x - w / 2 + 2.5, G - 4, FENCE2, 1.2, 'opacity="0.7"'))
        g.append(path(f"M{x - 4:.1f},{top_ - 2:.1f} Q{x - 3:.1f},{top_ - 5:.1f} {x:.1f},{top_ - 5:.1f}", "none", "#B9A6D6", 1.2, 'opacity="0.7"'))
    # the planting strip's edge along the foot
    g.append(rect(-4, G, W + 8, 7, "#2A2138", INK, LM))
    g.append(line(-2, G + 2, W + 2, G + 2, "#4C3E62", 1.2, 'opacity="0.7"'))
    svg("hedge", W, H, merge_runs(g), defs=defs, step=STEP, amp=0.75)
    ANCHORS["hedge"] = {"name": "hedge", "W": W, "H": H, "G": G, "kind": "strip",
                        "anchors": {"tileable": "yes: repeats seamlessly side by side (hedge top, fence and rails are periodic in 640)",
                                    "gap": {"x": GAP0, "y": 0, "w": GAP1 - GAP0, "h": G, "note": "the arch's opening; a far dim hedge shows through"},
                                    "light": [{"x": AX, "y": AY - RO, "note": "top of the flower arch: a lantern or fairy lights can hang from here"}],
                                    "signs": [], "windows": [], "doors": []}}

BARK  = "#5B3A4E"
BARK2 = "#43293A"
BARKL = "#8A6A86"

def trunk_parts(parts, bark_lines):
    """Tapered limbs (props.py style) in bark, then bark strokes and a moonlit edge."""
    g = []
    for (pts, w0, w1) in parts:                                       # ink pass: every limb, twice the width
        g.extend(tapered_big(pts, w0, w1, 0.5, BARK, 7.0, INK, 2 * LB))
    for (pts, w0, w1) in parts:                                       # fill pass: the seams between limbs vanish
        g.extend(tapered_big(pts, w0, w1, 0.5, BARK, 7.0, "none", 0))
    g.extend(bark_lines)
    return g

def foliage(pid, lobes, cx, cy, holes=(), seed=1):
    """A canopy drawn as foliage, not a pile of balls (operator, 2026-09-27: "the trees need a little work"). One
    leafy outline over the whole crown; inside it, lobe by lobe from the lowest to the highest, a shadow cast down-right
    onto what is below, then the lobe's own leafy mass lit from the upper left, then its brightest leaves. The clumps
    are told apart by light and shadow, with only a short soft crease under each; small leaf strokes give it texture;
    a couple of gaps let the sky and the twigs behind show through. Only the four canopy colours (LIL0..3) are used, so
    town_seasons.py can recolour it. Returns (elements, outline points)."""
    import random
    rnd = random.Random(seed)
    pts = union_outline(lobes, cx, cy, 200)
    edge = bumps(resample(pts, 12.0), cx, cy, 2.4, 3)
    full = poly(edge)
    for (hx, hy, hrx, hry) in holes:
        ring = [(hx + hrx * math.cos(2 * math.pi * k / 18), hy + hry * math.sin(2 * math.pi * k / 18)) for k in range(18)]
        full += " " + poly(bumps(resample(ring, 6.0), hx, hy, 1.3, 2, outward=False))
    g = [path(full, LIL0, INK, 4.4, 'fill-rule="evenodd"')]
    g.append(f'<clipPath id="{pid}clip"><path d="{full}" clip-rule="evenodd"/></clipPath>')
    g.append(f'<g clip-path="url(#{pid}clip)">')
    def blob(x, y, r, fill, depth=2.2):
        ring = [(x + r * math.cos(2 * math.pi * k / 40), y + r * math.sin(2 * math.pi * k / 40)) for k in range(40)]
        return path(poly(bumps(resample(ring, 9.0), x, y, depth, 3)), fill, "none", 0)
    top = min(y - r for (x, y, r) in lobes); bottom = max(y + r for (x, y, r) in lobes)
    order = sorted(lobes, key=lambda c: -c[1])                  # the lowest first: each higher lobe over the ones below
    for (x, y, r) in order:
        g.append(blob(x + r * 0.10, y + r * 0.16, r * 0.96, LIL0))        # its shadow on whatever is below it
        # its leafy mass: a main clump and two smaller ones either side of it, so no lobe is a plain ball
        g.append(blob(x - r * 0.04, y - r * 0.06, r * 0.80, LIL1))
        for side in (-1, 1):
            a = math.radians(-90 + side * rnd.uniform(48, 70))
            g.append(blob(x + r * 0.5 * math.cos(a), y + r * 0.5 * math.sin(a) + r * 0.1, r * rnd.uniform(0.42, 0.52), LIL1))
        lift = 1 - (y - top) / max(1, bottom - top)                      # the higher, the more light it catches
        rl = r * (0.34 + 0.18 * lift)
        g.append(blob(x - r * 0.30, y - r * 0.30, rl, LIL2, 1.8))
        g.append(blob(x - r * 0.08, y - r * 0.46, rl * 0.7, LIL2, 1.6))
        crease = [(x - r * 0.06 + r * 0.9 * math.cos(math.radians(a)), y - r * 0.08 + r * 0.9 * math.sin(math.radians(a))) for a in range(28, 97, 4)]
        g.append(path(polyline(bumps(resample(crease, 10, False), x, y, 2.0, 3, False)), "none", INK, LT, 'opacity="0.45"'))
    # the brightest leaves: little leafy dabs along the lit rims of the upper lobes
    for (x, y, r) in sorted(lobes, key=lambda c: c[1])[:max(2, len(lobes) // 2)]:
        for k in range(3):
            a = math.radians(rnd.uniform(200, 260)); rr = r * rnd.uniform(0.45, 0.72)
            g.append(blob(x + rr * math.cos(a), y + rr * math.sin(a), rnd.uniform(4.5, 7.5), LIL3, 1.2))
    # leaf strokes: small curved marks, dark over the lit leaves and light over the shade
    dark, light = [], []
    for k in range(70):
        (x, y, r) = rnd.choice(lobes); a = rnd.uniform(0, 2 * math.pi); rr = r * math.sqrt(rnd.uniform(0.05, 0.85))
        px, py = x + rr * math.cos(a), y + rr * math.sin(a); s = rnd.uniform(3.2, 5.0); tilt = rnd.uniform(-0.6, 0.6)
        d = f"M{px - s:.1f},{py - s * 0.4 + tilt:.1f} Q{px:.1f},{py + s * 0.55:.1f} {px + s:.1f},{py - s * 0.4 - tilt:.1f}"
        (light if (math.cos(a) + math.sin(a)) > 0.3 else dark).append(d)
    dd, u = prebake(f"{pid}lv", [path(" ".join(dark), "none", LIL0, 1.3, 'opacity="0.75"'), path(" ".join(light), "none", LIL3, 1.2, 'opacity="0.7"')], step=24)
    g.append(u)
    g.append('</g>')
    return g, edge, dd

def limbs_under(cx, y, rx, ry=14):
    """The crown's shade on the limbs just under it."""
    return ellipse(cx, y, rx, ry, SHADE, "none", 0, 'opacity="0.22"')

def twigs(specs):
    """Thin twigs behind the canopy (they show through its gaps), each a tapered tube."""
    g = []
    for (pts, w0, w1) in specs:
        g.extend(tapered_big(pts, w0, w1, 0.5, BARK, 6.0, INK, LM))
    return g

def birdhouse(bx, by, snow=False):
    g = [line(bx, by - 30, bx, by - 22, INK, 2.0), rect(bx - 15, by - 22, 30, 32, "#6A4462", INK, LM),
         path(poly([(bx - 20, by - 18), (bx, by - 34), (bx + 20, by - 18)]), PINK, INK, LM)]
    if snow:
        g.append(path(smooth_closed([(bx - 21, by - 18), (bx - 12, by - 26), (bx, by - 36), (bx + 12, by - 26), (bx + 21, by - 18), (bx + 12, by - 22), (bx, by - 30), (bx - 12, by - 22)], 0.35), SNOW, INK, LT))
    g.append(path(f"M{bx},{by + 1} C{bx - 6},{by - 4} {bx - 7},{by - 10} {bx - 3.5},{by - 12} C{bx - 1.5},{by - 13} {bx},{by - 11.5} {bx},{by - 10} "
                  f"C{bx},{by - 11.5} {bx + 1.5},{by - 13} {bx + 3.5},{by - 12} C{bx + 7},{by - 10} {bx + 6},{by - 4} {bx},{by + 1} Z", "#150B1E", INK, 1.2))
    g.append(line(bx - 4, by + 5, bx + 4, by + 5, INK, 2.2))
    g.append(line(bx - 11, by - 16, bx - 11, by + 6, "#FFFFFF", 1.2, 'opacity="0.25"'))
    return g

SNOW = "#F4F3FF"
def bare_crown(roots, seed, depth=4):
    """Winter: the limbs go on branching, finer and finer, into a full crown of twigs; snow lies along the top of every
    limb that leans. The stout limbs are outlined tubes; the fine ones are two strokes, ink under bark, merged by width
    (a tube per twig made a winter tree 430 KB)."""
    import random
    rnd = random.Random(seed); tubes = []; fine = {}; snow = []
    def grow(x, y, ang, length, w, d):
        bend = rnd.uniform(-10, 10)
        mx, my = x + length * 0.5 * math.sin(math.radians(ang + bend)), y - length * 0.5 * math.cos(math.radians(ang + bend))
        ex, ey = x + length * math.sin(math.radians(ang)), y - length * math.cos(math.radians(ang))
        pts = [(x, y), (mx, my), (ex, ey)]
        if w >= 5: tubes.append((pts, w, w * 0.62))
        else: fine.setdefault(round(max(1.2, w), 1), []).append(pts)
        if abs(ang) > 24 and w > 2.6:
            snow.append(([(px, py - w * 0.42) for (px, py) in pts], max(2.2, w * 0.66), max(1.1, w * 0.32)))
        if d > 0:
            n = 2 if d > 2 else rnd.choice([2, 3, 3])
            for k in range(n):
                spread = (k - (n - 1) / 2) * rnd.uniform(24, 34)
                grow(ex, ey, ang * 0.75 + spread + rnd.uniform(-6, 6), length * rnd.uniform(0.66, 0.8), w * 0.64, d - 1)
    for (x, y, ang, length, w) in roots:
        grow(x, y, ang, length, w, depth)
    g = []
    for (pts, w0, w1) in tubes:
        g.extend(tapered_big(pts, w0, w1, 0.5, BARK, 6.0, INK, LB if w0 >= 8 else LM))
    for w, segs in sorted(fine.items(), reverse=True):
        d = " ".join(f"M{a[0]:.1f},{a[1]:.1f} Q{b[0]:.1f},{b[1]:.1f} {c[0]:.1f},{c[1]:.1f}" for (a, b, c) in segs)
        g.append(path(d, "none", INK, round(w + 2.2, 1)))
        g.append(path(d, "none", BARK, w))
    for (pts, w0, w1) in snow:
        g.extend(tapered_big(pts, w0, w1, 0.5, SNOW, 6.0, INK, LT))
    return g

def tree_a(winter=False):
    """A broad old park oak: a chunky trunk forking into three limbs that climb into a big domed crown of leaves, a
    birdhouse with a heart door on the trunk, the moon catching the upper left. `winter`: bare, with snow."""
    W, H = 270, 400; B = H - 8
    g = [contact(135, B, 96, 9)]
    defs = ""
    parts = [([(122, B - 22), (108, B - 6), (92, B + 1), (76, B + 2)], 22, 5), ([(146, B - 22), (160, B - 6), (176, B + 1), (194, B + 2)], 22, 5),
             ([(132, B + 2), (131, B - 50), (128, B - 100), (131, B - 128)], 48, 34),
             ([(129, B - 122), (112, B - 150), (92, B - 176), (74, B - 202), (62, B - 228)], 26, 11),
             ([(134, B - 124), (154, B - 152), (174, B - 180), (190, B - 208), (202, B - 234)], 26, 11),
             ([(131, B - 126), (133, B - 160), (130, B - 196), (134, B - 232)], 20, 9)]
    g.extend(trunk_parts(parts, [bark(126, B - 20, 132, B - 120, 5, 3),
                                 path(smooth_open([(118, B - 6), (114, B - 60), (114, B - 110)], 0.5), "none", BARKL, 2.2, 'opacity="0.55"'),
                                 path(smooth_open([(150, B - 10), (150, B - 70), (146, B - 120)], 0.5), "none", SHADE, 5, 'opacity="0.25"')]))
    if winter:
        g.extend(bare_crown([(62, B - 228, -30, 44, 11), (202, B - 234, 32, 44, 11), (134, B - 232, 2, 50, 9), (92, B - 176, -64, 34, 7), (174, B - 180, 64, 34, 7),
                             (112, B - 150, -40, 30, 6), (154, B - 152, 42, 30, 6)], 21))
        g.append(path(smooth_closed([(128, B - 126), (131, B - 132), (136, B - 128), (132, B - 124)], 0.5), SNOW, INK, LT))   # the fork's crotch
        g.extend(birdhouse(132, B - 84, snow=True))
        g.append(path(smooth_closed([(62, B + 3), (90, B - 5), (135, B - 8), (182, B - 5), (208, B + 3), (135, B + 6)], 0.4), SNOW, INK, LT))
        svg("tree-a-winter", W, H, merge_runs(g), defs=defs, step=STEP)
        return
    g.append(limbs_under(134, B - 188, 64, 16))
    g.extend(birdhouse(132, B - 84))
    lobes = [(135, 74, 56), (86, 96, 46), (186, 92, 48), (48, 142, 36), (224, 138, 38), (92, 150, 46), (178, 150, 46), (135, 126, 54),
             (62, 184, 28), (210, 180, 28), (135, 170, 32)]
    cg, pts, dd = foliage("ta", lobes, 135, 128, seed=4)
    defs += dd; g.extend(cg)
    svg("tree-a", W, H, merge_runs(g), defs=defs, step=STEP)
    lights = [outline_at(pts, 135, 128, a, 10) for a in (165, 140, 112, 70, 40, 15)]
    ANCHORS["tree-a"] = {"name": "tree-a", "W": W, "H": H, "base": B, "kind": "prop",
                         "anchors": {"fairy_lights": lights, "note_lights": "a garland along the canopy's lower edge, left to right",
                                     "light": [{"x": 132, "y": B - 90, "note": "birdhouse door: optional tiny warm glow"}]}}

def owl(ox, oy, snow=False):
    g = [path(smooth_closed([(ox - 10, oy), (ox - 11, oy - 16), (ox - 8, oy - 26), (ox, oy - 29), (ox + 8, oy - 26), (ox + 11, oy - 16), (ox + 10, oy)], 0.5), "#6A5078", INK, LM),
         path(poly([(ox - 9, oy - 25), (ox - 11, oy - 34), (ox - 4, oy - 28)]), "#6A5078", INK, 1.2),
         path(poly([(ox + 9, oy - 25), (ox + 11, oy - 34), (ox + 4, oy - 28)]), "#6A5078", INK, 1.2),
         path(smooth_closed([(ox - 6, oy - 2), (ox - 7, oy - 11), (ox, oy - 15), (ox + 7, oy - 11), (ox + 6, oy - 2)], 0.5), "#A58FB3", "none", 0)]
    for ex in (-4.5, 4.5):
        g.append(circ(ox + ex, oy - 20, 4.2, GOLD, INK, 1.1)); g.append(circ(ox + ex, oy - 20, 1.8, INK, "none", 0))
    g.append(path(poly([(ox - 2, oy - 16), (ox + 2, oy - 16), (ox, oy - 12)]), GOLD2, INK, 0.9))
    g.append(line(ox - 5, oy + 1, ox - 5, oy + 4, INK, 1.4)); g.append(line(ox + 5, oy + 1, ox + 5, oy + 4, INK, 1.4))
    if snow: g.append(path(smooth_closed([(ox - 9, oy - 28), (ox, oy - 32), (ox + 9, oy - 28), (ox, oy - 29)], 0.4), SNOW, INK, 0.9))
    return g

def tree_b(winter=False):
    """A leaning blossom tree: a crooked trunk, a side bough holding a lower cloud of leaves on the left and an owl,
    two limbs climbing into the main crown up and right, pink blossom over the moonlit side, petals on the ground.
    `winter`: bare, with snow, the owl still on its bough."""
    W, H = 250, 400; B = H - 8
    g = [contact(118, B, 80, 8)]
    defs = bloom_def("tbbl1", "#F28CB3", "#FFE3A0", 3.2) + bloom_def("tbbl2", "#F9D3E3", PINK, 3.0)
    parts = [([(108, B - 20), (96, B - 5), (82, B + 1), (68, B + 2)], 20, 5), ([(124, B - 20), (136, B - 5), (150, B + 1), (164, B + 2)], 20, 5),
             ([(116, B + 2), (112, B - 50), (102, B - 100), (100, B - 136), (110, B - 170)], 42, 28),
             ([(102, B - 124), (80, B - 140), (58, B - 150), (40, B - 164)], 20, 8),
             ([(110, B - 166), (126, B - 194), (142, B - 224), (152, B - 252)], 24, 10),
             ([(108, B - 170), (98, B - 204), (94, B - 238)], 16, 7)]
    g.extend(trunk_parts(parts, [bark(104, B - 20, 104, B - 150, 5, 11),
                                 path(smooth_open([(104, B - 8), (100, B - 60), (92, B - 110)], 0.5), "none", BARKL, 2.2, 'opacity="0.55"')]))
    if winter:
        g.extend(bare_crown([(40, B - 164, -58, 30, 8), (152, B - 252, 22, 46, 10), (94, B - 238, -16, 42, 7), (126, B - 194, 52, 30, 6), (70, B - 145, -30, 22, 5)], 33))
        g.extend(owl(84, B - 150, snow=True))
        g.append(path(smooth_closed([(56, B + 3), (86, B - 5), (118, B - 7), (152, B - 5), (178, B + 3), (118, B + 6)], 0.4), SNOW, INK, LT))
        svg("tree-b-winter", W, H, merge_runs(g), defs=defs, step=STEP)
        return
    g.append(limbs_under(128, B - 206, 42, 12))
    low = [(44, 182, 30), (72, 188, 28), (26, 198, 24), (58, 206, 24)]
    cg1, pts1, dd1 = foliage("tbl", low, 50, 194, seed=7)
    defs += dd1; g.extend(cg1)
    g.extend(owl(84, B - 150))
    main = [(140, 86, 54), (98, 100, 40), (188, 104, 42), (150, 44, 40), (110, 56, 34), (190, 62, 34), (126, 132, 40), (176, 138, 38)]
    cg2, pts2, dd2 = foliage("tbm", main, 146, 96, seed=9)
    defs += dd2; g.extend(cg2)
    import random
    rnd = random.Random(5); bl = []
    for (x, y, r) in main + low:
        n = 3 if x < 150 else 2
        for k in range(n):
            a = rnd.uniform(0, 2 * math.pi); rr = rnd.uniform(0.2, 0.75) * r
            bl.append((x + rr * math.cos(a), y + rr * math.sin(a) - 4, 1 + (k % 2)))
    for (x, y, k) in bl:
        g.append(use(f"tbbl{k}", x, y, rnd.uniform(0.85, 1.15), int(rnd.uniform(0, 72))))
    for (x, y) in ((70, B + 2), (96, B + 5), (150, B + 4), (176, B + 1), (122, B + 6), (58, B - 1)):
        g.append(ellipse(x, y, 3.2, 1.8, "#F28CB3", INK, 0.8))
    svg("tree-b", W, H, merge_runs(g), defs=defs, step=STEP)
    lights = [outline_at(pts1, 50, 194, a, 8) for a in (150, 90)] + [outline_at(pts2, 146, 96, a, 10) for a in (140, 105, 70, 30)]
    ANCHORS["tree-b"] = {"name": "tree-b", "W": W, "H": H, "base": B, "kind": "prop",
                         "anchors": {"fairy_lights": lights, "note_lights": "two on the lower cloud, four under the crown, left to right",
                                     "light": [{"x": 79.5, "y": B - 170, "note": "owl's left eye"}, {"x": 88.5, "y": B - 170, "note": "owl's right eye: the site may blink them"}]}}

def tree_a_winter(): tree_a(winter=True)
def tree_b_winter(): tree_b(winter=True)

PLAY_L  = "#9678C4"     # playground lavender, at night
PLAY_L2 = "#BFA6E2"
PLAY_L0 = "#6A5093"
SLIDE   = "#D9487F"     # the chute
SLIDE2  = "#F48AB0"
SLIDE0  = "#9E2F5C"
SWING   = "#3F7F8C"     # the swing set's teal
SWING2  = "#79B6BE"
SWING0  = "#2A5864"

def tube_band(pts, w, fill, t=0.5, sample=6.0):
    """A constant-width band along a smooth line, filled and inked (tapered_big with w0 = w1, blunt ends)."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, t))[0][1]; c = []
    for seg in segs:
        smp = _samples(seg, sample); c += smp if not c else smp[1:]
    n = len(c); left = []; right = []
    for i, (x, y) in enumerate(c):
        x0, y0 = c[max(i - 1, 0)]; x1, y1 = c[min(i + 1, n - 1)]
        tx, ty = x1 - x0, y1 - y0; L = math.hypot(tx, ty) or 1; nx, ny = -ty / L, tx / L
        left.append((x + nx * w / 2, y + ny * w / 2)); right.append((x - nx * w / 2, y - ny * w / 2))
    return left, right, c

def slide():
    """A playground slide: a lavender ladder up to a railed platform with a heart on its side, a pink chute
    curving down to a run-out, lavender legs."""
    W, H = 212, 190; B = H - 8
    g = [contact(112, B, 96, 7)]
    PY = 64                                                         # the platform's top
    # the far legs, darker, behind everything
    g.append(rect(92, PY + 10, 7, B - PY - 10, PLAY_L0, INK, LM))
    g.append(rect(150, 130, 6, B - 130, PLAY_L0, INK, LM))
    # the ladder: two rails and the rungs between them
    rails = [((22, B), (54, PY + 2)), ((42, B), (74, PY + 2))]
    for k in range(1, 7):
        t = k / 7.0
        x0 = 22 + (54 - 22) * t; x1 = 42 + (74 - 42) * t; y = B + (PY + 2 - B) * t
        g.append(rect(x0 - 1, y - 2.8, x1 - x0 + 2, 5.6, PLAY_L2, INK, LT))
    for (p0, p1) in rails:
        g.append(path(poly([(p0[0] - 3.5, p0[1]), (p1[0] - 3.5, p1[1]), (p1[0] + 3.5, p1[1]), (p0[0] + 3.5, p0[1])]), PLAY_L, INK, LM))
    g.append(line(20.5, B - 4, 51, PY + 8, PLAY_L2, 1.3, 'opacity="0.8"'))
    # the guard rail round the platform: two posts and a rounded top rail (behind the deck's front)
    rail = [(56, PY + 2), (56, PY - 26), (60, PY - 32), (100, PY - 32), (106, PY - 26), (106, PY + 2)]
    g.append(path(smooth_open(rail, 0.25), "none", INK, 6.6)); g.append(path(smooth_open(rail, 0.25), "none", PLAY_L, 3.6))
    g.append(path(smooth_open([(81, PY - 31), (81, PY + 1)], 0.5), "none", INK, 5.0)); g.append(path(smooth_open([(81, PY - 31), (81, PY + 1)], 0.5), "none", PLAY_L, 2.2))
    g.append(path(smooth_open([(58, PY - 22), (60, PY - 29), (70, PY - 30.5)], 0.5), "none", PLAY_L2, 1.4, 'opacity="0.9"'))
    # the platform: a deck and its side panel with a heart
    g.append(rect(50, PY, 60, 8, PLAY_L2, INK, LB))
    g.append(rect(54, PY + 8, 52, 18, PLAY_L, INK, LM))
    hx, hy = 80, PY + 22
    g.append(path(f"M{hx},{hy} C{hx - 7},{hy - 5} {hx - 8},{hy - 11} {hx - 4},{hy - 13} C{hx - 2},{hy - 14} {hx},{hy - 12.5} {hx},{hy - 11} "
                  f"C{hx},{hy - 12.5} {hx + 2},{hy - 14} {hx + 4},{hy - 13} C{hx + 8},{hy - 11} {hx + 7},{hy - 5} {hx},{hy} Z", SLIDE, INK, 1.2))
    g.append(rect(96, PY + 26, 7, B - PY - 26, PLAY_L, INK, LM))                 # the near leg under the platform
    g.append(line(98, PY + 30, 98, B - 3, PLAY_L2, 1.2, 'opacity="0.7"'))
    g.append(rect(199, B - 20, 7, 20, PLAY_L, INK, LM))                          # the run-out's little leg
    g.append(rect(148, 128, 7, B - 128, PLAY_L, INK, LM))                        # the chute's middle leg
    g.append(line(150, 134, 150, B - 3, PLAY_L2, 1.2, 'opacity="0.7"'))
    # the chute: its far wall (dark), the bed, the near wall's lip (light)
    chute = [(104, PY + 3), (124, PY + 16), (146, PY + 50), (164, PY + 86), (180, B - 20), (196, B - 16), (208, B - 18)]
    L, R, c = tube_band(chute, 18, SLIDE)
    g.append(path(poly(L + R[::-1]), SLIDE, INK, LB))
    g.append(path(smooth_open([(p[0] + 0, p[1] - 2) for p in chute[1:-1]], 0.5), "none", SLIDE2, 2.4, 'opacity="0.85"'))
    lipL, lipR, _ = tube_band([(x, y + 7) for (x, y) in chute], 5, SLIDE0)
    g.append(path(smooth_open([(x - 1, y + 6) for (x, y) in chute[:-1]], 0.5), "none", SLIDE0, 3.0, 'opacity="0.75"'))
    for fx in (22, 42, 99.5, 151.5, 202.5):
        g.append(rect(fx - 6, B - 3, 12, 4, PLAY_L0, INK, LT))
    svg("slide", W, H, merge_runs(g), step=STEP)
    ANCHORS["slide"] = {"name": "slide", "W": W, "H": H, "base": B, "kind": "prop",
                        "anchors": {"platform": {"x": 50, "y": PY, "w": 60, "note": "the deck a pet could stand on"},
                                    "chute": {"top": [106, PY], "bottom": [206, B - 26], "note": "a pet sliding: follow the chute's top edge"}}}

def swings():
    """An A-frame swing set in teal with two swings on chains (pink and lavender seats). Each swing is its own
    group (#swing1, #swing2) hanging from its pivot, so the site can rock them."""
    W, H = 232, 204; B = H - 8
    g = [contact(116, B, 104, 7)]
    BY = 20                                                          # the beam's top
    # the A-frames: back legs darker, then the beam, then the front legs
    for (ax, s_) in ((30, -1), (202, 1)):
        g.extend(tapered_big([(ax, BY + 8), (ax + 22 * (-1 if s_ < 0 else 1) * -1, B)], 9, 8, 0.5, SWING0, 7.0, INK, LM))
    g.append(rrect(14, BY, 204, 12, 5, SWING, INK, LB))
    g.append(line(20, BY + 3.5, 212, BY + 3.5, SWING2, 1.6, 'opacity="0.8"'))
    for (ax, s_) in ((30, -1), (202, 1)):
        g.extend(tapered_big([(ax, BY + 8), (ax + 22 * (-1 if s_ < 0 else 1), B)], 11, 10, 0.5, SWING, 7.0, INK, LB))
        g.append(rect(ax - 18, B - 72, 36, 7, SWING, INK, LM))                   # the A's crossbar
        g.append(circ(ax, BY + 6, 5, SWING2, INK, LM))                           # the bolt at the apex
    for fx in (8, 52, 180, 224):
        g.append(rect(fx - 7, B - 3, 14, 5, SWING0, INK, LT))
    # the swings, each in its own group; chains are ink under steel with link ticks
    for (sid, cx, seat, seat2) in (("swing1", 80, SLIDE, SLIDE2), ("swing2", 152, PLAY_L, PLAY_L2)):
        g.append(f'<g id="{sid}">')
        for hx in (cx - 18, cx + 18):
            g.append(circ(hx, BY + 14, 3, STEEL2, INK, 1.1))
            g.append(line(hx, BY + 16, hx, 150, INK, 3.6))
            g.append(line(hx, BY + 16, hx, 150, STEEL2, 1.6, 'stroke-dasharray="4 3"'))
        g.append(rrect(cx - 26, 148, 52, 10, 4, seat, INK, LB))
        g.append(line(cx - 21, 151, cx + 21, 151, seat2, 1.6, 'opacity="0.9"'))
        g.append('</g>')
    g.append(ellipse(80, B - 1, 26, 3.5, SHADE, "none", 0, 'opacity="0.3"'))
    g.append(ellipse(152, B - 1, 26, 3.5, SHADE, "none", 0, 'opacity="0.3"'))
    svg("swings", W, H, merge_runs(g), step=STEP)
    ANCHORS["swings"] = {"name": "swings", "W": W, "H": H, "base": B, "kind": "prop",
                         "anchors": {"swing_groups": [{"id": "swing1", "pivot": [80, BY + 14], "seat": {"x": 54, "y": 148, "w": 52, "h": 10}},
                                                      {"id": "swing2", "pivot": [152, BY + 14], "seat": {"x": 126, "y": 148, "w": 52, "h": 10}}],
                                     "note": "rock a group with transform-origin at its pivot (a few degrees, slow); a pet can sit on a seat"}}

def yarnball():
    """The park's landmark: a giant ball of pink yarn on a stone plinth, two knitting needles stuck in its crown,
    the loose end trailing down the plinth and curling on the grass; a blank plaque on the plinth."""
    W, H = 156, 164; B = H - 8
    CX, CY, R = 76, 58, 48
    g = [contact(78, B, 66, 7)]
    # the plinth: a base slab, the block with its plaque, a cap
    g.append(rect(18, B - 14, 118, 14, STONE2, INK, LB))
    g.append(rect(28, B - 50, 98, 37, STONE, INK, LB))
    g.append(rect(22, B - 58, 110, 10, STONE2, INK, LB))
    g.append(line(26, B - 55, 128, B - 55, "#A99BC0", 1.4, 'opacity="0.6"'))
    g.append(line(32, B - 46, 32, B - 16, "#A99BC0", 1.4, 'opacity="0.5"'))
    g.append(path(poly([(110, B - 47), (124, B - 47), (124, B - 15), (110, B - 15)]), SHADE, "none", 0, 'opacity="0.2"'))
    PQ = (50, B - 42, 54, 20)
    g.append(rect(PQ[0], PQ[1], PQ[2], PQ[3], "#3A2A52", INK, LM))
    g.append(rect(PQ[0] + 2.5, PQ[1] + 2.5, PQ[2] - 5, PQ[3] - 5, "none", GOLD2, 1.1, 'opacity="0.7"'))
    # the knitting needles, behind the ball (their points in it)
    for (x0, y0, x1, y1) in ((92, 30, 128, 2), (100, 38, 142, 20)):
        g.append(line(x0, y0, x1, y1, INK, 6.0)); g.append(line(x0, y0, x1, y1, LAV2, 3.4))
        g.append(circ(x1, y1, 5, GOLD, INK, LM))
    # the ball, with its wound bands clipped inside
    g.append(circ(CX, CY, R, PINK, INK, LB))
    g.append(f'<clipPath id="ybclip"><circle cx="{CX}" cy="{CY}" r="{R - 0.8}"/></clipPath>')
    g.append('<g clip-path="url(#ybclip)">')
    g.append(circ(CX + 13, CY + 15, R, RUBY, "none", 0, 'opacity="0.26"'))
    k = R / 25.0
    d1 = []; d2 = []; d3 = []
    for j in range(-4, 5):
        off = j * 6.2 * k * 0.72
        d1.append(smooth_open([(CX - 30 * k + off * 0.4, CY - 24 * k + off), (CX - 6 * k + off * 0.6, CY - 4 * k + off * 0.9), (CX + 30 * k + off * 0.4, CY + 18 * k + off * 0.8)], 0.6))
    for j in range(-4, 5):
        off = j * 6.6 * k * 0.72
        d2.append(smooth_open([(CX + 18 * k + off, CY - 32 * k), (CX + 2 * k + off * 0.9, CY - 2 * k), (CX - 14 * k + off * 0.8, CY + 30 * k)], 0.6))
    for j in range(0, 4):
        off = j * 7 * k * 0.7
        d3.append(smooth_open([(CX - 28 * k, CY + 4 * k + off), (CX, CY + 10 * k + off * 1.1), (CX + 28 * k, CY + 4 * k + off)], 0.6))
    g.append(path(" ".join(d1), "none", RUBY, 2.2, 'opacity="0.5"'))
    g.append(path(" ".join(d2), "none", RUBY, 2.2, 'opacity="0.42"'))
    g.append(path(" ".join(d3), "none", RUBY, 2.0, 'opacity="0.38"'))
    g.append('</g>')
    g.append(circ(CX, CY, R, "none", INK, LB))
    # two strands on top, then the one that becomes the loose end and trails down the plinth to a curl on the grass
    for pts in ([(CX - 36, CY - 30), (CX - 8, CY - 40), (CX + 26, CY - 36), (CX + 44, CY - 18)],
                [(CX - 46, CY + 8), (CX - 20, CY + 22), (CX + 18, CY + 30), (CX + 42, CY + 22)]):
        g.append(path(smooth_open(pts, 0.6), "none", INK, 6.4)); g.append(path(smooth_open(pts, 0.6), "none", PINK, 3.6))
    tail = [(CX - 14, CY - 38), (CX - 38, CY - 10), (CX - 44, CY + 26), (30, B - 60), (22, B - 44), (14, B - 26), (12, B - 8), (22, B - 2), (30, B - 8), (22, B - 14), (8, B - 4)]
    g.append(path(smooth_open(tail, 0.6), "none", INK, 6.4)); g.append(path(smooth_open(tail, 0.6), "none", PINK, 3.6))
    # the shine
    g.append(path(f"M{CX - 26},{CY - 24} Q{CX - 16},{CY - 38} {CX + 2},{CY - 40}", "none", "#FFFFFF", 3.6, 'opacity="0.85"'))
    g.append(circ(CX + 12, CY - 34, 2.4, "#FFFFFF", "none", 0, 'opacity="0.9"'))
    svg("yarnball", W, H, merge_runs(g), step=STEP)
    ANCHORS["yarnball"] = {"name": "yarnball", "W": W, "H": H, "base": B, "kind": "prop",
                           "anchors": {"signs": [{"x": PQ[0], "y": PQ[1], "w": PQ[2], "h": PQ[3], "text": "THE BIG YARN", "style": "plaque"}],
                                       "light": [{"x": CX, "y": CY, "r": R, "note": "the ball: a soft pink uplight / spotlight from the ground"}]}}

def flowerbed():
    """A low raised bed: a stone kerb of rounded blocks, a dark mound of leaves, and flowers standing out of it:
    pink tulips, lavender spikes, white daisies, a few pink roses."""
    W, H = 172, 72; B = H - 8
    g = [contact(86, B, 80, 5, 0.38)]
    defs = bloom_def("fbbl1", BLOOM1) + bloom_def("fbbl3", BLOOM3, GOLD, 3.4) + bloom_def("fbbl2", BLOOM2, "#FFE3A0", 2.8)
    # the leaves: a mound behind the kerb
    mound = [(8, 48), (14, 34), (30, 28), (48, 32), (66, 26), (86, 30), (104, 25), (124, 30), (142, 27), (158, 33), (166, 48)]
    g.append(path(smooth_open(mound, 0.5) + f" L166,50 L8,50 Z", HEDGE, INK, LM))
    for (x, y) in ((24, 36), (58, 34), (94, 34), (130, 34), (152, 40), (42, 42), (112, 42)):
        g.append(path(f"M{x - 6},{y + 3} Q{x},{y - 3} {x + 6},{y + 3}", "none", HEDGE4, 1.4, 'opacity="0.7"'))
    # tulips and lavender spikes first (stems down into the leaves), then the round blooms
    for (x, y, h) in ((30, 30, 16), (76, 26, 18), (118, 27, 17), (150, 30, 14)):
        g.append(line(x, y + 8, x, y - h + 10, "#3E6B3E", 2.2))
        top = y - h
        g.append(path(f"M{x - 6},{top + 4} L{x - 6},{top + 10} Q{x},{top + 16} {x + 6},{top + 10} L{x + 6},{top + 4} L{x + 3},{top + 7} L{x},{top + 2} L{x - 3},{top + 7} Z", PINK, INK, 1.2))
        g.append(line(x - 3.5, top + 6, x - 3.5, top + 11, "#FFFFFF", 1.1, 'opacity="0.5"'))
    for (x, y) in ((46, 30), (98, 26), (136, 28)):
        g.append(line(x, y + 8, x, y - 18, "#3E6B3E", 1.8))
        for j in range(5):
            g.append(ellipse(x + (1.4 if j % 2 else -1.4), y - 2 - j * 4.2, 2.6, 2.2, LAV2, INK, 0.9))
    for (x, y, k, sc) in ((18, 32, 3, 1.0), (40, 24, 1, 1.0), (60, 22, 3, 1.1), (88, 22, 1, 1.05), (108, 20, 3, 1.0), (128, 22, 1, 1.0),
                          (160, 34, 3, 0.9), (68, 34, 2, 1.0), (22, 44, 1, 0.9), (148, 42, 1, 0.9), (84, 38, 3, 0.9), (116, 38, 2, 1.0)):
        g.append(use(f"fbbl{k}", x, y, sc, int(x * 7) % 72))
    # the stone kerb: rounded blocks, moonlit tops
    xs = [4, 30, 58, 86, 112, 140, 168]
    for i in range(len(xs) - 1):
        g.append(rrect(xs[i] + 0.5, 46, xs[i + 1] - xs[i] - 1, B - 46, 5, STONE if i % 2 == 0 else "#62537A", INK, LM))
    g.append(path(" ".join(f"M{xs[i] + 5},{49.5} L{xs[i + 1] - 5},{49.5}" for i in range(len(xs) - 1)), "none", "#A99BC0", 1.3, 'opacity="0.6"'))
    svg("flowerbed", W, H, merge_runs(g), defs=defs, step=STEP)
    ANCHORS["flowerbed"] = {"name": "flowerbed", "W": W, "H": H, "base": B, "kind": "prop", "anchors": {}}

if __name__ == "__main__":
    which = sys.argv[1:] or ["furnace", "hedge", "tree_a", "tree_b", "tree_a_winter", "tree_b_winter", "slide", "swings", "yarnball", "flowerbed"]
    for w in which: globals()[w]()
    print(json.dumps([ANCHORS[k] for k in ANCHORS], indent=1))
