"""Emotown, the civic heart of the street -> packages/pet/town/{hall,crownboard,baths,fountain}.svg

The town hall (the centrepiece: steps, fat columns, a crowned pediment, a clock tower with a dome and a golden crown),
the crown board that stands in front of it (the site writes the live crowned pets on it), the bathhouse (a sento in
teal tiles with a rubber duck on the ridge) and the fountain (two tiers, a cat on top). Drawn with town.py's toolkit
in the diner's style. No text anywhere: every board is blank and the site writes on it.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town import *

# ---- the civic palette: pale weathered stone that stays mid-dark at night, gold accents ----
STONE_L = "#9D8BB5"   # trims, cornices, nosings
STONE_M = "#7E6C96"   # the columns and the lit faces
STONE_D = "#3F3357"   # the recess behind the colonnade
STONE_X = "#352A4B"   # deep joints / the tympanum's shadow
SLATE   = "#43345F"   # the dome
DUSK    = "#2A1F40"   # an unlit interior

def tapered_big(pts, w0, w1, t=0.5, fill=FUR, sample=7.0, stroke=INK):
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
    return [path(smooth_closed(left + tip + right[::-1], 0.4), fill, stroke)]

# ---------------- a compact writer ----------------
# town.svg() bakes the wobble and writes absolute coordinates with every stroke attribute on every element; the
# hall has ~10,000 curve segments, so that came to 400 KB. This writes the SAME baked geometry (same bake, same
# step, same rounding to 0.1) as relative path data, and puts the shared stroke attributes on the root group.
# Translucent shading with no ink edge is passed through `flat()` and is not baked at all (a wobble on an edge
# nobody can see is only bytes).
import re as _re
from wobble import bake as _bake
_TOK = _re.compile(r"[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?")
_FLAT = _re.compile(r"<!--FLAT-->(.*?)<!--/FLAT-->", _re.S)

def flat(el):
    return f"<!--FLAT-->{el}<!--/FLAT-->"

def _fmt(n):
    s = "-" if n < 0 else ""; a, b = divmod(abs(n), 10)
    return s + (str(a) if b == 0 else (str(a) if a else "") + "." + str(b))

def compact_d(d):
    toks = _TOK.findall(d); i = 0; cx = cy = sx = sy = 0; cmd = None; parts = []; pc2 = None
    T = lambda v: int(round(float(v) * 10))
    while i < len(toks):
        t = toks[i]
        if t in "MLCZ":
            cmd = t; i += 1
            if t == "Z": parts.append(("z", [])); cx, cy = sx, sy; pc2 = None
            continue
        if cmd == "M":
            x, y = T(toks[i]), T(toks[i+1]); i += 2
            parts.append(("m", [x - cx, y - cy])); cx, cy = sx, sy = x, y; cmd = "L"
        elif cmd == "L":
            x, y = T(toks[i]), T(toks[i+1]); i += 2
            parts.append(("l", [x - cx, y - cy])); cx, cy = x, y
        else:
            v = [T(toks[i+k]) for k in range(6)]; i += 6
            # the bake's Catmull-Rom curves are smooth inside each baked segment: the first control point is the
            # previous curve's second one reflected through the current point, which is exactly what `s` means
            if pc2 is not None and abs(v[0] - (2*cx - pc2[0])) <= 1 and abs(v[1] - (2*cy - pc2[1])) <= 1:
                parts.append(("s", [v[2]-cx, v[3]-cy, v[4]-cx, v[5]-cy]))
            else:
                parts.append(("c", [v[0]-cx, v[1]-cy, v[2]-cx, v[3]-cy, v[4]-cx, v[5]-cy]))
            pc2 = (v[2], v[3]); cx, cy = v[4], v[5]
            continue
        pc2 = None
    out = []; lastc = None; last = None
    for c, nums in parts:
        if c != lastc or c in "mz": out.append(c); last = None
        lastc = c
        for n in nums:
            f = _fmt(n)
            if last is not None and not (f[0] == "-" or (f[0] == "." and "." in last)): out.append(" ")
            out.append(f); last = f
    return "".join(out)

def svg_compact(name, w, h, body, amp=0.9, step=8.0, defs=""):
    src = "\n".join(body)
    keep = []
    def stash(m):
        keep.append(m.group(1)); return f"<!--F{len(keep)-1}-->"
    src = _FLAT.sub(stash, src)
    src = _bake(src, amp=amp, freq=0.09, step=step)
    src = _re.sub(r'(?<=\s)d="([^"]*)"', lambda m: f'd="{compact_d(m.group(1))}"', src)
    src = src.replace(' stroke-linejoin="round"', "").replace(' stroke-linecap="round"', "")
    src = src.replace(' stroke="#000000"', "").replace(' stroke="none" stroke-width="0"', ' stroke="none"')
    src = _re.sub(r"\s+/>", "/>", src)
    src = _re.sub(r"<!--F(\d+)-->", lambda m: keep[int(m.group(1))], src)
    out = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           f'<defs>{defs}</defs>\n<g id="{name}" stroke="#000" stroke-linejoin="round" stroke-linecap="round">\n{src}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(out)
    print("wrote", name, f"{len(out)//1024} KB")
    return len(out)

# ---------------- shared pieces ----------------
def crown(cx, by, w, h, sw=LM, gems=True, shine=True):
    """The pets' crown (cat.py's outline), centred on cx with its band's bottom at by, w wide and h tall."""
    sx = w / 68.0; sy = h / 38.0
    P = lambda x, y: (cx + (x - 100) * sx, by - (46 - y) * sy)
    out = []
    pts = [(70, 46), (66, 30), (74, 32), (80, 12), (88, 30), (94, 30), (100, 8), (106, 30), (112, 30), (120, 12),
           (126, 32), (134, 30), (130, 46)]
    out.append(path(poly([P(*p) for p in pts]), GOLD, INK, sw))
    out.append(path(poly([P(70, 46), P(130, 46), P(132, 38), P(68, 38)]), GOLD2, INK, round(sw * 0.8, 2)))
    for bx, byy in ((80, 12), (100, 8), (120, 12)):
        X, Y = P(bx, byy); out.append(ellipse(X, Y, 3.4 * sx, 3.4 * sx, GOLD, INK, round(sw * 0.8, 2)))
    X, Y = P(100, 33); out.append(ellipse(X, Y, 5 * sx, 4.2 * sx, RUBY, INK, round(sw * 0.8, 2)))
    if gems:
        for gx, col in ((84, TEAL), (116, GREEN)):
            X, Y = P(gx, 36); out.append(ellipse(X, Y, 2.6 * sx, 2.6 * sx, col, INK, round(sw * 0.7, 2)))
    if shine:
        X, Y = P(98.4, 31.6); out.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{1.3*sx:.1f}" fill="#FFFFFF" stroke="none"/>')
        a = P(74, 30); b = P(79, 16)
        out.append(line(a[0], a[1], b[0], b[1], "#FFFFFF", 1.2 * sx, 'opacity="0.55"'))
    return out

def leaf(cx, cy, L, w, ang, fill=GOLD, sw=0.9):
    """A pointed leaf (two quadratic sides), L long and w wide, turned `ang` degrees about its centre."""
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v: (cx + u * ca - v * sa, cy + u * sa + v * ca)
    p0 = P(-L / 2, 0); p1 = P(L / 2, 0); q0 = P(0, -w); q1 = P(0, w)
    return path(f"M{p0[0]:.1f},{p0[1]:.1f} Q{q0[0]:.1f},{q0[1]:.1f} {p1[0]:.1f},{p1[1]:.1f} Q{q1[0]:.1f},{q1[1]:.1f} {p0[0]:.1f},{p0[1]:.1f} Z", fill, INK, sw)

def dot(cx, cy, r, fill, sw=1.0, stroke=INK):
    """A small round stud or bulb, unbaked (a wobble on a 3-unit circle is invisible and costs 300 bytes)."""
    return flat(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

def heart(cx, cy, s, fill=PINK, sw=1.2):
    """A small heart, s = its width."""
    k = s / 20.0
    d = (f"M{cx},{cy+8*k} C{cx-9*k},{cy+1*k} {cx-10*k},{cy-6*k} {cx-5*k},{cy-9*k} C{cx-2*k},{cy-11*k} {cx},{cy-9*k} {cx},{cy-7*k} "
         f"C{cx},{cy-9*k} {cx+2*k},{cy-11*k} {cx+5*k},{cy-9*k} C{cx+10*k},{cy-6*k} {cx+9*k},{cy+1*k} {cx},{cy+8*k} Z")
    return path(d, fill, INK, sw)

def contact(cx, y, rx, ry=6, opacity=0.42):
    return [ellipse(cx, y, rx, ry, SHADE, "none", 0, f'opacity="{opacity}"')]

def quoins(x, y0, y1, w0=14, w1=9, h=14, left=True, fill=STONE_L):
    """Alternating corner blocks down one edge of a wall."""
    out = []; y = y0; k = 0
    while y + h <= y1 + 0.1:
        w = w0 if k % 2 == 0 else w1
        xx = x if left else x - w
        out.append(rect(xx, y, w, h, fill, INK, LT))
        y += h; k += 1
    return out

def chandelier(cx, top, span=30, drop=26):
    """A little gold chandelier hanging from `top`: a chain, a bowl, arms and five candle bulbs."""
    out = [line(cx, top, cx, top + drop - 6, "#6B3F4F", 1.4, 'opacity="0.9"')]
    y = top + drop
    out.append(path(f"M{cx-span/2:.1f},{y-4:.1f} Q{cx:.1f},{y+10:.1f} {cx+span/2:.1f},{y-4:.1f}", "none", GOLD2, 2.0))
    out.append(ellipse(cx, y + 2, 5, 4, GOLD2, INK, 1.1))
    for dx in (-span / 2, -span / 4, 0, span / 4, span / 2):
        yy = y - 4 + (0 if abs(dx) > span / 3 else (4 if dx else 6)) - 5
        out.append(dot(cx + dx, yy, 2.6, "#FFF8DE", 0.9))
    return out

def drapes(x, y, w, h, fill=RUBY, fold="#5E0F1F"):
    """Velvet curtains tied back at both sides of a window, and a swag across the top."""
    out = []
    tie = y + h * 0.58; cw = w * 0.28
    for side in (0, 1):
        if side == 0:
            pts = [(x - 1, y), (x + cw, y), (x + cw * 0.55, tie - 12), (x + cw * 0.35, tie), (x + cw * 0.5, y + h * 0.9), (x - 1, y + h + 1)]
        else:
            X = x + w
            pts = [(X + 1, y), (X - cw, y), (X - cw * 0.55, tie - 12), (X - cw * 0.35, tie), (X - cw * 0.5, y + h * 0.9), (X + 1, y + h + 1)]
        out.append(path(poly(pts), fill, INK, LT))
        fx = x + cw * 0.3 if side == 0 else x + w - cw * 0.3
        out.append(line(fx, y + 4, fx, tie - 4, fold, 1.4, 'opacity="0.8"'))
        tx = x + cw * 0.42 if side == 0 else x + w - cw * 0.42
        out.append(ellipse(tx, tie, 3.2, 2.2, GOLD, INK, 0.9))
    out.append(path(f"M{x-1:.1f},{y:.1f} L{x+w+1:.1f},{y:.1f} L{x+w+1:.1f},{y+7:.1f} Q{x+w*0.75:.1f},{y+15:.1f} {x+w/2:.1f},{y+8:.1f} "
                    f"Q{x+w*0.25:.1f},{y+15:.1f} {x-1:.1f},{y+7:.1f} Z", fill, INK, LT))
    return out

# ================================================================================================================
#  THE TOWN HALL
# ================================================================================================================
def cat_statue(cx, base, h=40, fill=GOLD2, lit=GOLD, sw=LM, tail=1):
    """A sitting cat seen from the front, as a statue: body, head with pointed ears, a tail curled round its feet."""
    k = h / 40.0
    P = lambda x, y: (cx + x * k, base + y * k)
    out = []
    # the tail first, curling round the right foot
    tl = [P(tail * 8, -3), P(tail * 16, -4), P(tail * 19, -12), P(tail * 16, -20)]
    out.append(path(smooth_open(tl), "none", INK, 5.4 * k))
    out.append(path(smooth_open(tl), "none", fill, 2.6 * k))
    body = [P(-12, 0), P(-13.5, -9), P(-11, -19), P(-6.5, -26), P(6.5, -26), P(11, -19), P(13.5, -9), P(12, 0)]
    out.append(path(smooth_closed(body, 0.45), fill, INK, sw))
    # the head with its ears, one outline
    hc = P(0, -31); r = 9.5 * k
    pts = []
    for i in range(20):
        a = -math.pi / 2 + 2 * math.pi * i / 20
        pts.append((hc[0] + r * math.cos(a), hc[1] + r * 0.9 * math.sin(a)))
    ear = lambda sgn: [(hc[0] + sgn * 3.5 * k, hc[1] - 8.4 * k), (hc[0] + sgn * 8.5 * k, hc[1] - 15.5 * k), (hc[0] + sgn * 9.4 * k, hc[1] - 4 * k)]
    # rebuild: top of head, right ear, right side ... left ear
    ring = [p for p in pts if not (hc[1] - p[1] > 4 * k and abs(p[0] - hc[0]) > 2.5 * k)]
    top = [p for p in ring if p[1] < hc[1] and abs(p[0] - hc[0]) <= 2.5 * k]
    right = sorted([p for p in ring if p[0] > hc[0] + 2.5 * k or (p[1] >= hc[1] and p[0] >= hc[0])], key=lambda p: p[1])
    left = sorted([p for p in ring if p[0] < hc[0] - 2.5 * k or (p[1] >= hc[1] and p[0] < hc[0])], key=lambda p: -p[1])
    outline = sorted(top, key=lambda p: p[0]) + ear(1) + right + left + ear(-1)[::-1]
    out.append(path(poly(outline), fill, INK, sw))
    # paws, a lit edge, the ear insides
    for sx in (-1, 1):
        out.append(path(f"M{P(sx*2, 0)[0]:.1f},{P(sx*2,0)[1]:.1f} Q{P(sx*6,-6)[0]:.1f},{P(sx*6,-6)[1]:.1f} {P(sx*9,0)[0]:.1f},{P(sx*9,0)[1]:.1f}", "none", INK, 1.1 * k))
    a = P(-9.5, -18); b = P(-11, -6)
    out.append(line(a[0], a[1], b[0], b[1], lit, 1.6 * k, 'opacity="0.9"'))
    a = P(-6, -36); b = P(-3, -39)
    out.append(line(a[0], a[1], b[0], b[1], lit, 1.4 * k, 'opacity="0.9"'))
    return out

def steps_flight(levels, fill, nose, shade_op=0.18, ink=LM):
    """A flight of steps seen from the front as ONE outline: levels = [(y_top, height, x0, x1)] top step first."""
    pts = []
    for (y, h, x0, x1) in levels:
        pts += [(x0, y), (x0, y + h)]
    y, h, x0, x1 = levels[-1]
    right = []
    for (y, h, x0, x1) in levels:
        right += [(x1, y), (x1, y + h)]
    out = [path(poly(pts + right[::-1]), fill, INK, ink)]
    for i, (y, h, x0, x1) in enumerate(levels):
        if i: out.append(line(x0, y, x1, y, INK, ink))
        out.append(line(x0 + 3, y + 2, x1 - 3, y + 2, nose, 1.6, 'opacity="0.75"'))
        out.append(flat(f'<rect x="{x0+1}" y="{y+h-3}" width="{x1-x0-2}" height="3" fill="#000" opacity="{shade_op}"/>'))
    return out

def hall():
    """Emotown Hall: a broad flight of steps with a red carpet up the middle, four fat Ionic columns, a pediment with
    the golden crown in laurels and two gilded cats on its corners, lit tall windows with velvet drapes, big double
    doors, balustraded wings with a flag on each corner, and a clock tower (lit face, no hands: the site draws them)
    under a dome that wears the game's crown."""
    W, H = 660, 600; G = H - 16
    U = lambda v: G - v
    g = []
    defs = (lit_glass("hallglass", "#FFE6A8", "#F2A45E") + lit_glass("halldoorglass", "#FFD98C", "#E9965A")
            + '<radialGradient id="hallclock" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#FFF8E2"/>'
              '<stop offset="0.7" stop-color="#FBE3A6"/><stop offset="1" stop-color="#EDBE72"/></radialGradient>'
            + lit_glass("hallbell", "#FFD98C", "#C98A4E"))
    A = {}   # anchors

    CX = 330
    SY = U(34)                  # the top step: the portico's floor
    ARCH_B = U(248)             # architrave bottom = column tops
    CORN_T = U(290)             # cornice top = pediment base
    APEX = U(366)
    PX0, PX1 = 96, 564
    TX0, TX1 = 262, 398
    CLK_Y = U(414); CLK_R = 40
    TWR_T = U(462)

    # ================= the tower, behind the pediment =================
    g.append(rect(TX0, TWR_T, TX1 - TX0, CORN_T - TWR_T + 4, STONE, INK, LB))
    g.append(line(TX0 + 5, TWR_T + 6, TX0 + 5, U(330), STONE_L, 2.2, 'opacity="0.45"'))
    g.append(flat(f'<rect x="{TX1-15}" y="{TWR_T+2}" width="13" height="{CORN_T-TWR_T}" fill="#000" opacity="0.16"/>'))
    g.extend(quoins(TX0, TWR_T + 14, U(326), 14, 9, 13, True))
    g.extend(quoins(TX1, TWR_T + 14, U(326), 14, 9, 13, False))
    g.append(rrect(CX - CLK_R - 14, CLK_Y - CLK_R - 14, 2 * CLK_R + 28, 2 * CLK_R + 28, 10, STONE_M, INK, LM))
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.append(dot(CX + sx * (CLK_R + 5), CLK_Y + sy * (CLK_R + 5), 3.2, GOLD2, 1.1))
    g.append(f'<circle cx="{CX}" cy="{CLK_Y}" r="{CLK_R + 6}" fill="{GOLD2}" stroke="{INK}" stroke-width="{LB}"/>')
    g.append(f'<circle cx="{CX}" cy="{CLK_Y}" r="{CLK_R + 3}" fill="none" stroke="{GOLD}" stroke-width="1.6" opacity="0.9"/>')
    g.append(f'<circle cx="{CX}" cy="{CLK_Y}" r="{CLK_R}" fill="url(#hallclock)" stroke="{INK}" stroke-width="{LM}"/>')
    for k in range(12):
        a = math.radians(k * 30); big = k % 3 == 0
        r0 = CLK_R * (0.70 if big else 0.78); r1 = CLK_R * 0.9
        g.append(line(CX + r0 * math.sin(a), CLK_Y - r0 * math.cos(a), CX + r1 * math.sin(a), CLK_Y - r1 * math.cos(a),
                      "#3A2150", 3.2 if big else 1.8))
    g.append(path(f"M{CX-CLK_R*0.62:.1f},{CLK_Y-CLK_R*0.5:.1f} Q{CX-CLK_R*0.2:.1f},{CLK_Y-CLK_R*0.9:.1f} {CX+CLK_R*0.3:.1f},{CLK_Y-CLK_R*0.82:.1f}",
                  "none", "#FFFFFF", 2.0, 'opacity="0.55"'))
    A["clock"] = dict(cx=CX, cy=CLK_Y, r=CLK_R, note="lit face, hour ticks only; draw hour and minute hands here (hands up to ~0.62r / 0.85r)")
    # the tower's cornice
    g.append(rect(TX0 - 10, TWR_T - 12, TX1 - TX0 + 20, 12, STONE_L, INK, LB))
    g.append(rect(TX0 - 4, TWR_T, TX1 - TX0 + 8, 5, STONE2, INK, LT))
    # -- the belfry --
    BX0, BX1 = 282, 378; BB = TWR_T - 12; BT = BB - 26
    g.append(rect(BX0, BT, BX1 - BX0, BB - BT, STONE, INK, LB))
    g.append(path(arch_d(CX - 15, BT + 5, 30, BB - BT - 5), DUSK, INK, LM))
    g.append(path(f"M{CX-9},{BB-5} C{CX-9},{BB-17} {CX-6},{BT+12} {CX},{BT+12} C{CX+6},{BT+12} {CX+9},{BB-17} {CX+9},{BB-5} "
                  f"L{CX+11},{BB-3} L{CX-11},{BB-3} Z", "url(#hallbell)", INK, LM))
    g.append(line(CX - 4, BT + 17, CX - 6, BB - 7, "#FFFFFF", 1.3, 'opacity="0.5"'))
    for sx in (-1, 1):
        g.append(f'<circle cx="{CX + sx*31}" cy="{(BT+BB)/2:.1f}" r="6" fill="url(#hallglass)" stroke="{INK}" stroke-width="{LM}"/>')
    A["bell"] = dict(x=CX, y=BT + 16, note="the belfry's bell (could swing / chime on the hour)")
    g.append(rect(BX0 - 8, BT - 7, BX1 - BX0 + 16, 7, STONE_L, INK, LM))
    # -- the dome --
    DB = BT - 7; DR = 44; DH = 24
    g.append(path(f"M{CX-DR},{DB} C{CX-DR},{DB-DH*0.75} {CX-DR*0.55},{DB-DH} {CX},{DB-DH} C{CX+DR*0.55},{DB-DH} {CX+DR},{DB-DH*0.75} {CX+DR},{DB} Z",
                  SLATE, INK, LB))
    for fx in (-0.62, -0.25, 0.25, 0.62):
        g.append(path(f"M{CX+fx*DR:.1f},{DB} Q{CX+fx*DR*0.9:.1f},{DB-DH*0.8:.1f} {CX:.1f},{DB-DH+1:.1f}", "none", GOLD2, 1.8, 'opacity="0.9"'))
    g.append(path(f"M{CX-DR*0.72:.1f},{DB-6} Q{CX-DR*0.6:.1f},{DB-DH*0.8:.1f} {CX-DR*0.2:.1f},{DB-DH+4:.1f}", "none", "#FFFFFF", 2.0, 'opacity="0.3"'))
    g.append(rect(CX - DR - 4, DB - 4, 2 * DR + 8, 6, GOLD2, INK, LM))
    # -- the crown --
    g.append(rect(CX - 14, DB - DH - 4, 28, 5, GOLD2, INK, LM))
    CRB = DB - DH - 3; CRH = 30
    g.extend(crown(CX, CRB, 58, CRH, sw=LM))
    A["crown"] = dict(x=CX, y=CRB - CRH * 0.55, top=round(CRB - CRH * 38 / 38 - 3, 1), note="the golden crown on the dome: a slow glint / sparkle")

    # ================= the wings =================
    for (x0, x1) in ((14, PX0 + 8), (PX1 - 8, 646)):
        g.append(rect(x0, ARCH_B, x1 - x0, SY - ARCH_B + 4, STONE, INK, LB))
        yy = ARCH_B + 22
        while yy < U(66):
            g.append(line(x0 + 3, yy, x1 - 3, yy, STONE2, 1.2, 'opacity="0.55"'))
            yy += 22
    for (x0, x1) in ((10, PX0 + 8), (PX1 - 8, 650)):
        g.append(rect(x0, U(56), x1 - x0, 56, STONE2, INK, LB))
        g.append(line(x0 + 2, U(28), x1 - 2, U(28), STONE_X, 1.4, 'opacity="0.9"'))
        for k, yy in enumerate((U(56), U(28))):
            for i in range(3):
                xx = x0 + 30 + (15 if k else 0) + 36 * i
                if xx < x1 - 6: g.append(line(xx, yy + 2, xx, yy + 26, STONE_X, 1.4, 'opacity="0.9"'))
        g.append(line(x0 + 3, U(54), x1 - 3, U(54), STONE_L, 1.6, 'opacity="0.5"'))
        g.append(rect(x0 - 2, U(62), x1 - x0 + 4, 7, STONE_L, INK, LM))
    for (x, y, pts) in ((40, U(96), [(0, 0), (4, 7), (1, 12), (6, 20)]), (618, U(236), [(0, 0), (-3, 6), (1, 11), (-2, 17)]),
                        (70, U(40), [(0, 0), (5, 5), (3, 11)]), (600, U(22), [(0, 0), (-5, 4), (-4, 9)])):
        g.append(path(smooth_open([(x + a, y + b) for (a, b) in pts], 0.2), "none", STONE_X, 1.2, 'opacity="0.8"'))
    for (x, y0, y1) in ((58, ARCH_B + 8, ARCH_B + 40), (604, ARCH_B + 8, ARCH_B + 30)):
        g.append(flat(f'<path d="M{x-3},{y0} L{x+3},{y0} L{x+2},{y1} L{x-1},{y1-6} Z" fill="#000" opacity="0.12"/>'))
    g.extend(quoins(14, ARCH_B + 4, U(64), 16, 10, 16, True))
    g.extend(quoins(646, ARCH_B + 4, U(64), 16, 10, 16, False))
    WW, WH = 50, 150; WY = U(222)
    A["windows"] = []
    for i, wx in enumerate((34, 576)):
        g.append(path(arch_d(wx - 5, WY - 5, WW + 10, WH + 5), STONE_L, INK, LM))
        g.append(path(arch_d(wx, WY, WW, WH), "url(#hallglass)", INK, LB))
        cid = f"hallwing{i}"
        g.append(f'<clipPath id="{cid}"><path d="{arch_d(wx, WY, WW, WH)}"/></clipPath>')
        g.append(f'<g clip-path="url(#{cid})">')
        g.append(flat(f'<rect x="{wx}" y="{WY+WH-30}" width="{WW}" height="30" fill="#C98A4E" opacity="0.45"/>'))
        if i == 0:   # a crowned cat's portrait in a gold frame
            fx, fy = wx + WW / 2, WY + 72
            g.append(rect(fx - 13, fy - 16, 26, 32, GOLD2, INK, 1.2))
            g.append(rect(fx - 9, fy - 12, 18, 24, "#3A2150", INK, 0.9))
            g.append(path(f"M{fx-6},{fy+12} L{fx-6},{fy-1} L{fx-5},{fy-7} L{fx-2},{fy-3} L{fx+2},{fy-3} L{fx+5},{fy-7} L{fx+6},{fy-1} L{fx+6},{fy+12} Z", FUR, INK, 0.8))
            g.append(path(f"M{fx-5},{fy-4} L{fx-5},{fy-10} L{fx-2},{fy-7} L{fx},{fy-11} L{fx+2},{fy-7} L{fx+5},{fy-10} L{fx+5},{fy-4} Z", GOLD, INK, 0.7))
        else:
            g.extend(chandelier(wx + WW / 2, WY, 26, 40))
        g.extend(drapes(wx, WY + 8, WW, WH - 14))
        g.append('</g>')
        g.append(path(arch_d(wx, WY, WW, WH), "none", INK, LB))
        g.append(line(wx + WW / 2, WY + 2, wx + WW / 2, WY + WH, STEEL3, 2.0))
        g.append(line(wx, WY + 58, wx + WW, WY + 58, STEEL3, 2.0))
        g.append(line(wx + 6, WY + 30, wx + 6, WY + WH - 8, "#FFFFFF", 1.4, 'opacity="0.3"'))
        g.append(rect(wx - 7, WY + WH, WW + 14, 8, STONE_L, INK, LM))
        g.append(path(poly([(wx + WW/2 - 7, WY - 8), (wx + WW/2 + 7, WY - 8), (wx + WW/2 + 5, WY + 8), (wx + WW/2 - 5, WY + 8)]), STONE_L, INK, LM))
        A["windows"].append(dict(x=wx, y=WY, w=WW, h=WH, shape="arch"))
    # ================= the portico =================
    g.append(rect(PX0 + 8, ARCH_B, PX1 - PX0 - 16, SY - ARCH_B + 2, STONE_D, INK, LB))
    g.append(flat(f'<rect x="{PX0+9}" y="{ARCH_B+1}" width="{PX1-PX0-18}" height="16" fill="#000" opacity="0.28"/>'))
    # the doors
    DX0, DX1 = CX - 52, CX + 52; DT = U(204)
    g.append(rect(DX0 - 10, DT - 44, DX1 - DX0 + 20, SY - DT + 44, STONE_M, INK, LB))
    fan = f"M{DX0},{DT-4} C{DX0},{DT-30} {DX0+26},{DT-38} {CX},{DT-38} C{DX1-26},{DT-38} {DX1},{DT-30} {DX1},{DT-4} Z"
    g.append(path(fan, "url(#hallglass)", INK, LM))
    for k in range(1, 6):
        a = math.pi * k / 6
        g.append(line(CX - 11 * math.cos(a), DT - 8 - 8 * math.sin(a), CX - 50 * math.cos(a), DT - 5 - 32 * math.sin(a), "#6B3F4F", 1.4, 'opacity="0.85"'))
    g.append(heart(CX, DT - 11, 17, PINK, 1.2))
    g.append(rect(DX0 - 4, DT - 6, DX1 - DX0 + 8, 6, STONE_L, INK, LM))
    g.append(rect(DX0, DT, DX1 - DX0, SY - DT, "#4A2A48", INK, LB))
    for side in (0, 1):
        lx = DX0 + 7 if side == 0 else CX + 5
        lw = 40
        g.append(path(arch_d(lx, DT + 12, lw, 66), "url(#halldoorglass)", INK, LM))
        g.append(line(lx + lw / 2, DT + 16, lx + lw / 2, DT + 78, "#6B3F4F", 1.6))
        g.append(line(lx, DT + 50, lx + lw, DT + 50, "#6B3F4F", 1.6))
        g.append(line(lx + 5, DT + 34, lx + 5, DT + 74, "#FFFFFF", 1.3, 'opacity="0.35"'))
        g.append(rrect(lx, DT + 92, lw, 62, 4, "#5A3354", INK, LM))
        g.append(rrect(lx + 6, DT + 98, lw - 12, 50, 3, "none", "#7A4A6E", 1.4, 'opacity="0.8"'))
    g.append(line(CX, DT, CX, SY, INK, LB))
    for sx in (-1, 1):
        g.append(f'<circle cx="{CX + sx*8}" cy="{DT+88}" r="4" fill="{GOLD}" stroke="{INK}" stroke-width="1.2"/>')
    A["doors"] = [dict(x=DX0, y=DT, w=DX1 - DX0, h=SY - DT, note="double doors; lit panes in the upper halves")]
    A["windows"].append(dict(x=DX0, y=DT - 38, w=DX1 - DX0, h=34, shape="fanlight"))
    # the bay windows between the columns
    BW_, BH_ = 44, 136; BY_ = U(210)
    for i, wx in enumerate((169, 447)):
        g.append(path(arch_d(wx - 5, BY_ - 5, BW_ + 10, BH_ + 5), STONE_M, INK, LM))
        g.append(path(arch_d(wx, BY_, BW_, BH_), "url(#hallglass)", INK, LB))
        cid = f"hallbay{i}"
        g.append(f'<clipPath id="{cid}"><path d="{arch_d(wx, BY_, BW_, BH_)}"/></clipPath>')
        g.append(f'<g clip-path="url(#{cid})">')
        g.append(flat(f'<rect x="{wx}" y="{BY_+BH_-28}" width="{BW_}" height="28" fill="#C98A4E" opacity="0.45"/>'))
        g.extend(chandelier(wx + BW_ / 2, BY_, 24, 38))
        g.extend(drapes(wx, BY_ + 8, BW_, BH_ - 14))
        g.append('</g>')
        g.append(path(arch_d(wx, BY_, BW_, BH_), "none", INK, LB))
        g.append(line(wx + BW_ / 2, BY_ + 2, wx + BW_ / 2, BY_ + BH_, STEEL3, 2.0))
        g.append(line(wx, BY_ + 54, wx + BW_, BY_ + 54, STEEL3, 2.0))
        g.append(rect(wx - 6, BY_ + BH_, BW_ + 12, 7, STONE_L, INK, LM))
        A["windows"].append(dict(x=wx, y=BY_, w=BW_, h=BH_, shape="arch"))
    # ---- the entablature ----
    # a shadowed backing behind the whole band: the cornice ends at y 298 and the frieze starts at 302, and the dentils
    # drawn between them had nothing behind them (the operator saw the sky through it, 2026-09-26)
    g.append(rect(8, U(292), 644, 26, "#2B2340", "none", 0))
    g.append(rect(10, U(260), 640, 12, STONE_L, INK, LB))
    g.append(rect(12, U(282), 636, 22, STONE, INK, LB))
    g.append(rrect(CX - 118, U(280), 236, 18, 3, STONE_X, INK, LM))
    A["signs"] = [dict(x=CX - 114, y=U(279), w=228, h=16, text="EMOTOWN HALL", style="neon-gold")]
    for sx in (-1, 1):
        for k in range(3):
            g.append(dot(CX + sx * (150 + 70 * k), U(271), 4.2, GOLD2, 1.1))
    g.append(line(20, U(286), 640, U(286), STONE2, 5.0, 'stroke-dasharray="5 5" opacity="0.9"'))
    g.append(rect(4, U(296), 652, 10, STONE_L, INK, LB))
    g.append(line(8, U(293), 652, U(293), "#FFFFFF", 1.4, 'opacity="0.3"'))
    # ---- the pediment ----
    g.append(path(poly([(PX0, CORN_T - 6), (CX, APEX), (PX1, CORN_T - 6)]), STONE_L, INK, LB))
    g.append(path(poly([(PX0 + 22, CORN_T - 7), (CX, APEX + 12), (PX1 - 22, CORN_T - 7)]), STONE2, INK, LM))
    g.append(line(PX0 + 8, CORN_T - 9, CX - 6, APEX + 4, "#FFFFFF", 1.4, 'opacity="0.3"'))
    CRY = CORN_T - 14
    for sx in (-1, 1):
        stem = [(CX + sx * 32, CRY + 1), (CX + sx * 70, CRY - 3), (CX + sx * 104, CRY - 11)]
        g.append(path(smooth_open(stem), "none", GOLD2, 2.2))
        for k in range(6):
            t = (k + 0.5) / 6
            px = CX + sx * (32 + 72 * t); py = CRY + 1 - 12 * t * t
            for up in (1, -1):
                g.append(leaf(px, py - 4.5 * up, 11, 4.6, (-25 if up > 0 else 25) * sx + (180 if sx < 0 else 0)))
    g.extend(crown(CX, CRY + 3, 68, 40, sw=LM))
    # ---- the wings' roofs: balustrades, a gilded cat on each end of the pediment, flags on the outer corners ----
    for (x0, x1) in ((10, PX0 + 4), (PX1 - 4, 650)):
        g.append(rect(x0 + 4, U(322), x1 - x0 - 8, 6, STONE_L, INK, LM))
        g.append(rect(x0 + 4, U(302), x1 - x0 - 8, 6, STONE_L, INK, LM))
        n = 5; span = (x1 - x0 - 44)
        for k in range(n):
            bx = x0 + 24 + span * (k + 0.5) / n
            g.append(path(smooth_closed([(bx - 3, U(302)), (bx - 6, U(306)), (bx - 5.5, U(310)), (bx - 2.5, U(313)), (bx - 4, U(316)), (bx - 3.5, U(316.5)),
                                         (bx + 3.5, U(316.5)), (bx + 4, U(316)), (bx + 2.5, U(313)), (bx + 5.5, U(310)), (bx + 6, U(306)), (bx + 3, U(302))], 0.3), STONE_M, INK, LT))
    for px in (22, 638):
        g.append(rect(px - 12, U(330), 24, 36, STONE, INK, LM))
        g.append(rect(px - 15, U(336), 30, 7, STONE_L, INK, LM))
    for side, px in ((-1, PX0 - 4), (1, PX1 + 4)):
        g.append(rect(px - 12, U(326), 24, 30, STONE, INK, LM))
        g.append(rect(px - 15, U(331), 30, 6, STONE_L, INK, LM))
        g.extend(cat_statue(px, U(331), 38, tail=side))
    A["light"] = [dict(x=PX0 - 4, y=U(352), note="gilded cat statue: a faint gold glint"), dict(x=PX1 + 4, y=U(352), note="gilded cat statue: a faint gold glint")]
    A["flags"] = []
    for side, px in ((-1, 22), (1, 638)):
        top = U(418)
        g.append(rect(px - 2.5, top, 5, U(336) - top, "#2A1F40", INK, 1.2))
        g.append(f'<circle cx="{px}" cy="{top - 3}" r="4.2" fill="{GOLD}" stroke="{INK}" stroke-width="1.1"/>')
        d = -side
        fx = px + d * 3
        fl = [(fx, top + 4), (fx + d * 19, top + 0), (fx + d * 38, top + 6), (fx + d * 50, top + 3),
              (fx + d * 43, top + 21), (fx + d * 50, top + 38), (fx + d * 36, top + 36), (fx + d * 19, top + 42), (fx, top + 38)]
        g.append(path(smooth_closed(fl, 0.25), PINK, INK, LM))
        g.append(path(smooth_open([(fx + d * 3, top + 11), (fx + d * 19, top + 7), (fx + d * 36, top + 12)]), "none", "#FFFFFF", 1.4, 'opacity="0.4"'))
        g.extend(crown(fx + d * 21, top + 28, 20, 13, sw=0.9, gems=False, shine=False))
        A["flags"].append(dict(pole_tip=(px, top - 7), hoist=(fx, top + 4), fly_end=(fx + d * 50, top + 21), flies="right" if d > 0 else "left",
                               note="static flag on a pole; the site may ripple it"))
    # ---- the columns ----
    COLS = (136, 244, 416, 524)
    for cx in COLS:
        b0, b1 = SY, ARCH_B
        g.append(rect(cx - 31, b0 - 9, 62, 9, STONE_L, INK, LM))
        g.append(rrect(cx - 28, b0 - 18, 56, 10, 5, STONE_M, INK, LM))
        sh_b, sh_t = b0 - 18, b1 + 22
        g.append(path(f"M{cx-25},{sh_b} C{cx-27},{sh_b-60} {cx-25},{sh_t+50} {cx-22},{sh_t} L{cx+22},{sh_t} C{cx+25},{sh_t+50} {cx+27},{sh_b-60} {cx+25},{sh_b} Z",
                      STONE_M, INK, LB))
        g.append(flat(f'<path d="M{cx+10},{sh_b-1} C{cx+13},{sh_b-60} {cx+12},{sh_t+50} {cx+10},{sh_t+1} L{cx+21},{sh_t+1} C{cx+24},{sh_t+50} {cx+25.5},{sh_b-60} {cx+24},{sh_b-1} Z" fill="#000" opacity="0.2"/>'))
        for fx in (-13, -4, 5, 14):
            g.append(line(cx + fx, sh_b - 6, cx + fx * 0.9, sh_t + 6, STONE2, 1.3, 'opacity="0.8"'))
        g.append(line(cx - 18, sh_b - 10, cx - 16, sh_t + 10, "#FFFFFF", 2.0, 'opacity="0.28"'))
        g.append(rrect(cx - 27, b1 + 12, 54, 10, 4, STONE_L, INK, LM))
        for sx in (-1, 1):
            vx = cx + sx * 25
            g.append(f'<circle cx="{vx}" cy="{b1+15}" r="8" fill="{STONE_L}" stroke="{INK}" stroke-width="{LM}"/>')
            g.append(dot(vx, b1 + 15, 3.2, GOLD2, 1.0))
        g.append(rect(cx - 32, b1, 64, 8, STONE_L, INK, LM))
    # ---- the steps, a red carpet, gold stair rods ----
    levels = [(SY, 10, 96, 564), (U(24), 10, 88, 572), (U(14), 10, 80, 580), (U(4), 10, 72, 588), (G + 6, 9, 64, 596)]
    g.extend(steps_flight(levels, STONE_M, STONE_L))
    g.append(rect(CX - 34, SY, 68, H - 1 - SY, RUBY, INK, LM))
    g.append(line(CX - 29, SY + 2, CX - 29, H - 3, GOLD2, 1.4, 'opacity="0.9"'))
    g.append(line(CX + 29, SY + 2, CX + 29, H - 3, GOLD2, 1.4, 'opacity="0.9"'))
    for (y, h, x0, x1) in levels:
        g.append(line(CX - 38, y + 1.5, CX + 38, y + 1.5, GOLD, 2.4))
    A["steps"] = dict(top_y=SY, x0=64, x1=596, carpet=(CX - 34, CX + 34), note="the steps hang below G to H; pets on the pavement stand in front")
    svg_compact("hall", W, H, g, defs=defs)
    return dict(name="hall", W=W, H=H, G=G, kind="building", anchors=A)

# ================================================================================================================
#  THE CROWN BOARD
# ================================================================================================================
def band_path(top, bot, t=0.5):
    """A closed band between two open polylines (same direction): top forward, bottom back."""
    a = smooth_open(top, t); b = smooth_open(bot[::-1], t)
    return a + " L" + b[1:] + " Z"

def crownboard():
    """The crown board: a noticeboard on two posts under a little gabled roof strung with bulbs, a gold crown on
    the apex, a small title plaque in the gable and a big blank dark board (the site writes the live top crowned
    pets on it)."""
    W, H = 240, 244; BASE = H - 8
    g = []
    A = {}
    CX = W / 2
    g.extend(contact(CX, BASE, 108, 6.5, 0.45))
    # posts on stone footings, a crossbar under the board
    for px in (24, W - 24):
        g.append(rect(px - 8, 76, 16, BASE - 76 - 8, WOOD, INK, LB))
        g.append(line(px - 4, 86, px - 4, BASE - 18, "#7A5068", 1.6, 'opacity="0.8"'))
        g.append(rect(px - 13, BASE - 18, 26, 18, STONE2, INK, LM))
        g.append(line(px - 10, BASE - 15, px + 10, BASE - 15, STONE_L, 1.3, 'opacity="0.6"'))
    g.append(rect(28, 208, W - 56, 8, WOOD2, INK, LM))
    # the board
    BX0, BY0, BX1, BY1 = 28, 94, W - 28, 210
    g.append(rrect(BX0, BY0, BX1 - BX0, BY1 - BY0, 5, WOOD, INK, LB))
    g.append(rect(BX0 + 6, BY0 + 6, BX1 - BX0 - 12, BY1 - BY0 - 12, GOLD2, INK, LM))
    IX0, IY0, IX1, IY1 = BX0 + 10, BY0 + 10, BX1 - 10, BY1 - 10
    g.append(rect(IX0, IY0, IX1 - IX0, IY1 - IY0, "#1A1030", INK, LM))
    g.append(line(IX0 + 4, IY0 + 4, IX1 - 4, IY0 + 4, "#4A3A6E", 1.2, 'opacity="0.8"'))
    g.append(line(IX0 + 4, IY0 + 4, IX0 + 4, IY1 - 4, "#4A3A6E", 1.2, 'opacity="0.6"'))
    for (tx, ty) in ((BX0 + 3.5, BY0 + 3.5), (BX1 - 3.5, BY0 + 3.5), (BX0 + 3.5, BY1 - 3.5), (BX1 - 3.5, BY1 - 3.5)):
        g.append(dot(tx, ty, 2.6, GOLD, 1.0))
    A["board"] = dict(x=IX0, y=IY0, w=IX1 - IX0, h=IY1 - IY0, lines=5, line_h=18,
                      note="BLANK dark board: the site writes the top crowned pets here, 5 lines of ~18")
    # the gable: wooden face with vertical boards and the title plaque
    AY = 40; EY = 88; X0, X1 = 2, W - 2
    slope = (EY - AY) / (CX - X0)
    g.append(path(poly([(X0 + 22, EY - 2), (CX, AY + 16), (X1 - 22, EY - 2)]), WOOD2, INK, LM))
    for k in range(-3, 4):
        x = CX + k * 17
        top = AY + 16 + abs(x - CX) * slope + 4
        if top < EY - 6: g.append(line(x, top, x, EY - 4, "#2E1A28", 1.3, 'opacity="0.75"'))
    PW, PH = 64, 16; PY0 = 67
    g.append(rrect(CX - PW / 2 - 3, PY0 - 3, PW + 6, PH + 6, 4, GOLD2, INK, LM))
    g.append(rrect(CX - PW / 2, PY0, PW, PH, 3, "#1A1030", INK, 1.2))
    A["signs"] = [dict(x=CX - PW / 2 + 2, y=PY0 + 1, w=PW - 4, h=PH - 2, text="CROWNS", style="neon-gold")]
    for sgn in (-1, 1):                                                    # laurel sprigs either side of the plaque
        x0 = CX + sgn * (PW / 2 + 5)
        g.append(path(smooth_open([(x0, PY0 + PH), (x0 + sgn * 9, PY0 + PH - 6), (x0 + sgn * 15, PY0 + PH - 16)]), "none", GOLD2, 1.6))
        for k, (dx, dy) in enumerate(((4, -3), (9, -8), (13, -13))):
            g.append(leaf(x0 + sgn * dx - sgn * 3, PY0 + PH + dy - 3, 8, 3.2, -60 * sgn + (180 if sgn < 0 else 0), GOLD, 0.8))
            g.append(leaf(x0 + sgn * dx + sgn * 3, PY0 + PH + dy + 1, 8, 3.2, 20 * sgn + (180 if sgn < 0 else 0), GOLD, 0.8))
    # the roof: two thick shingled slabs meeting at the apex, overhanging the posts
    TH = 13
    for sgn in (-1, 1):
        xe = CX + sgn * (CX - X0)
        slab = [(CX, AY - 2), (xe, EY - 4), (xe - sgn * 3, EY + TH - 6), (CX, AY + TH)]
        g.append(path(poly(slab), ROOF2, INK, LB))
        for t in (0.22, 0.44, 0.66, 0.88):
            x = CX + sgn * (CX - X0) * t; y = AY - 2 + (EY - AY - 2) * t
            g.append(line(x, y + 1.5, x - sgn * 2, y + TH - 2, TRIM, 1.3, 'opacity="0.85"'))
        g.append(line(CX + sgn * 6, AY + 1, xe - sgn * 8, EY - 3, TRIM2, 1.4, 'opacity="0.55"'))
        g.append(line(CX + sgn * 8, AY + TH - 1.5, xe - sgn * 10, EY + TH - 8.5, PINK, 2.0, 'opacity="0.9"'))
        for k in range(1, 7):
            t = k / 7.2
            x = CX + sgn * (CX - X0 - 6) * t; y = AY + TH + (EY + TH - 8 - AY - TH) * t
            g.append(dot(x, y + 2.5, 2.8, GOLD, 1.0))
    # the crown on the apex
    g.append(rect(CX - 9, AY - 7, 18, 7, GOLD2, INK, LM))
    g.extend(crown(CX, AY - 5, 46, 28, sw=LM))
    A["light"] = [dict(x=CX, y=AY - 20, note="the crown on the apex: glint"),
                  dict(x=CX, y=EY + 4, note="bulbs under both eaves: twinkle; a faint glow over the board")]
    svg_compact("crownboard", W, H, g)
    return dict(name="crownboard", W=W, H=H, base=BASE, kind="prop", anchors=A)

# ================================================================================================================
#  THE BATHS
# ================================================================================================================
TEAL1 = "#2D7D8A"; TEAL2 = "#245E6E"; TEAL3 = "#1D4B5A"; GROUT = "#8FD3D0"; AQUA = "#BFF3EF"
DUCK = "#F4C542"; DUCK2 = "#D99A2B"; BEAK = "#F08A24"

def duck(x, y, s=1.0):
    """A rubber duck sitting at (x, y), facing right."""
    P = lambda u, v: (x + u * s, y + v * s)
    out = []
    body = [P(-16, -2), P(-20, -9), P(-23, -19), P(-15, -15), P(-4, -16), P(8, -15), P(16, -9), P(15, -2), P(4, 2), P(-9, 1.5)]
    out.append(path(smooth_closed(body, 0.45), DUCK, INK, LM))
    out.append(path(smooth_open([P(-11, -8), P(-4, -5), P(5, -8)]), "none", DUCK2, 1.6))
    # the head sits down INTO the body (it used to just touch it at one point and read as a separate ball): its lower
    # part overlaps the back, and a fill-only neck covers both outlines where they cross
    hc = P(7, -21)
    out.append(f'<circle cx="{hc[0]:.1f}" cy="{hc[1]:.1f}" r="{8.5*s:.1f}" fill="{DUCK}" stroke="{INK}" stroke-width="{LM}"/>')
    nk = P(6.5, -14.2)
    out.append(f'<ellipse cx="{nk[0]:.1f}" cy="{nk[1]:.1f}" rx="{7.2*s:.1f}" ry="{3.6*s:.1f}" fill="{DUCK}" stroke="none"/>')
    out.append(path(poly([P(13, -23), P(23, -21), P(22, -17), P(13, -17)]), BEAK, INK, 1.3))
    out.append(dot(P(9, -23)[0], P(9, -23)[1], 1.6, INK, 0))
    a = P(0, -26); b = P(4, -29)
    out.append(line(a[0], a[1], b[0], b[1], "#FFFFFF", 1.6, 'opacity="0.8"'))
    a = P(-12, -12); b = P(-4, -13)
    out.append(line(a[0], a[1], b[0], b[1], "#FFFFFF", 1.4, 'opacity="0.6"'))
    return out

def lantern(cx, cy, rx=11, ry=15, gid="bathlantern"):
    """A paper lantern (chochin), lit."""
    out = [line(cx, cy - ry - 12, cx, cy - ry, INK, 1.2)]
    out.append(rect(cx - rx * 0.55, cy - ry - 3, rx * 1.1, 5, "#2A1830", INK, 1.1))
    out.append(ellipse(cx, cy, rx, ry, f"url(#{gid})", INK, LM))
    for f in (-0.55, 0, 0.55):
        y = cy + f * ry
        w = rx * math.sqrt(1 - f * f)
        out.append(path(f"M{cx-w:.1f},{y:.1f} Q{cx:.1f},{y+2.5:.1f} {cx+w:.1f},{y:.1f}", "none", "#8B1A2D", 1.0, 'opacity="0.7"'))
    out.append(rect(cx - rx * 0.55, cy + ry - 2, rx * 1.1, 5, "#2A1830", INK, 1.1))
    out.append(line(cx, cy + ry + 3, cx, cy + ry + 8, GOLD2, 1.4))
    return out

def onsen(cx, cy, s, col="#EAC6EA"):
    """The hot-spring icon: a bowl and three wavy rising lines."""
    out = [path(f"M{cx-12*s:.1f},{cy:.1f} Q{cx-12*s:.1f},{cy+10*s:.1f} {cx:.1f},{cy+10*s:.1f} Q{cx+12*s:.1f},{cy+10*s:.1f} {cx+12*s:.1f},{cy:.1f}", "none", col, 2.6 * s)]
    for dx in (-6, 0, 6):
        x = cx + dx * s
        out.append(path(f"M{x:.1f},{cy+2*s:.1f} C{x-4*s:.1f},{cy-3*s:.1f} {x+4*s:.1f},{cy-7*s:.1f} {x:.1f},{cy-12*s:.1f} C{x-4*s:.1f},{cy-16*s:.1f} {x+2*s:.1f},{cy-18*s:.1f} {x+1*s:.1f},{cy-20*s:.1f}",
                        "none", col, 2.2 * s))
    return out

def baths():
    """The bathhouse: a sento in deep teal tiles under a curved roof with upturned eaves and a rubber duck on the
    ridge; a karahafu canopy over the door with a blank name board beneath, split noren with the hot-spring mark,
    paper lanterns, a big lit porthole with bubbles (and a cat soaking with a towel on its head), a lit lattice
    window with the buckets and a towel, and a tall chimney (the site puffs steam from it)."""
    W, H = 440, 480; G = H - 16
    g = []; A = {}
    defs = ('<linearGradient id="bathwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6FFF9"/>'
            '<stop offset="0.45" stop-color="#9EE6E0"/><stop offset="1" stop-color="#3FA7B3"/></linearGradient>'
            + lit_glass("bathlit", "#FFE6A8", "#F2A45E")
            + '<radialGradient id="bathlantern" cx="0.45" cy="0.4" r="0.65"><stop offset="0" stop-color="#FFE0C2"/>'
              '<stop offset="0.55" stop-color="#FF8F7A"/><stop offset="1" stop-color="#D83E5E"/></radialGradient>')
    EY = 200; RY = 122; RX0, RX1 = 86, 354
    FX0, FX1 = 26, W - 26; FB = G - 20; WAIN = 368
    # ---- the chimney, behind everything ----
    CH0, CH1, CHT = 344, 376, 22
    g.append(rect(CH0, CHT + 14, CH1 - CH0, 186 - CHT, BRICK, INK, LB))
    g.extend(bricks(CH0, CHT + 14, CH1, 186, 16, 10, BRICK2, 1.0, 'opacity="0.7"'))
    g.append(rect(CH0 - 2, 62, CH1 - CH0 + 4, 12, TEAL1, INK, LM))
    g.append(line(CH0 + 1, 65, CH1 - 1, 65, AQUA, 1.3, 'opacity="0.5"'))
    g.append(rect(CH0 - 5, CHT + 4, CH1 - CH0 + 10, 10, "#2A1830", INK, LB))
    g.append(rect(CH0 - 2, CHT, CH1 - CH0 + 4, 5, "#1A1024", INK, LM))
    g.append(flat(f'<rect x="{CH1-9}" y="{CHT+15}" width="7" height="{170-CHT}" fill="#000" opacity="0.18"/>'))
    A["steam"] = [dict(x=(CH0 + CH1) / 2, y=CHT, note="chimney top: a steady plume of steam")]
    # ---- the facade ----
    g.append(rect(FX0, EY, FX1 - FX0, FB - EY, TEAL1, INK, LB))
    y = EY + 14
    while y < WAIN - 2:
        g.append(line(FX0 + 2, y, FX1 - 2, y, GROUT, 1.0, 'opacity="0.35"')); y += 14
    x = FX0 + 14
    while x < FX1 - 2:
        g.append(line(x, EY + 2, x, WAIN - 2, GROUT, 1.0, 'opacity="0.35"')); x += 14
    g.append(rect(FX0, WAIN, FX1 - FX0, 14, "#D8F3EE", INK, LM))
    n = int((FX1 - FX0 - 4) // 20); x0w = FX0 + (FX1 - FX0 - n * 20) / 2
    wave = f"M{x0w:.1f},{WAIN+7}"
    for k in range(n):
        xx = x0w + k * 20
        wave += f" Q{xx+5:.1f},{WAIN+1:.1f} {xx+10:.1f},{WAIN+7:.1f} Q{xx+15:.1f},{WAIN+13:.1f} {xx+20:.1f},{WAIN+7:.1f}"
    g.append(path(wave, "none", TEAL1, 1.8))
    g.append(rect(FX0, WAIN + 14, FX1 - FX0, FB - WAIN - 14, TEAL2, INK, LB))
    g.extend(bricks(FX0, WAIN + 14, FX1, FB, 28, 13, TEAL3, 1.2, 'opacity="0.8"'))
    g.append(line(FX0 + 3, WAIN + 17, FX1 - 3, WAIN + 17, GROUT, 1.2, 'opacity="0.35"'))
    g.append(rect(FX0 - 6, FB, FX1 - FX0 + 12, G - FB, STONE2, INK, LB))
    g.append(line(FX0 - 2, FB + 3, FX1 + 2, FB + 3, STONE_L, 1.3, 'opacity="0.5"'))
    for xx in range(FX0 + 30, FX1, 48):
        if not (178 < xx < 298): g.append(line(xx, FB + 2, xx, G - 2, STONE_X, 1.3, 'opacity="0.9"'))
    # ---- the porthole ----
    PX, PY, PR = 96, 296, 46
    g.append(f'<circle cx="{PX}" cy="{PY}" r="{PR+9}" fill="{GOLD2}" stroke="{INK}" stroke-width="{LB}"/>')
    g.append(f'<circle cx="{PX}" cy="{PY}" r="{PR+4}" fill="none" stroke="{GOLD}" stroke-width="1.6" opacity="0.8"/>')
    for k in range(12):
        a = 2 * math.pi * k / 12 + 0.26
        g.append(dot(PX + (PR + 5.5) * math.cos(a), PY + (PR + 5.5) * math.sin(a), 1.9, "#8A6A2A", 0.8))
    g.append(f'<circle cx="{PX}" cy="{PY}" r="{PR}" fill="url(#bathwater)" stroke="{INK}" stroke-width="{LM}"/>')
    g.append(f'<clipPath id="bathport"><circle cx="{PX}" cy="{PY}" r="{PR}"/></clipPath>')
    g.append('<g clip-path="url(#bathport)">')
    WL = PY + 8
    g.append(flat(f'<rect x="{PX-PR}" y="{PY-PR}" width="{2*PR}" height="{WL-PY+PR}" fill="#FFF6E0" opacity="0.35"/>'))
    cx0, cy0 = PX + 6, WL - 3
    head = [(cx0 - 17, cy0 + 6), (cx0 - 17, cy0 - 8), (cx0 - 14, cy0 - 26), (cx0 - 6, cy0 - 18), (cx0 + 6, cy0 - 18), (cx0 + 14, cy0 - 26), (cx0 + 17, cy0 - 8), (cx0 + 17, cy0 + 6)]
    g.append(path(poly(head), "#F4F0FF", INK, LM))
    g.append(path(f"M{cx0-12},{cy0-18} L{cx0-14},{cy0-26} L{cx0-8},{cy0-19} Z", PINK, "none", 0))
    g.append(path(f"M{cx0+12},{cy0-18} L{cx0+14},{cy0-26} L{cx0+8},{cy0-19} Z", PINK, "none", 0))
    g.append(path(f"M{cx0-9},{cy0-7} Q{cx0-6},{cy0-10} {cx0-3},{cy0-7}", "none", INK, 1.5))
    g.append(path(f"M{cx0+3},{cy0-7} Q{cx0+6},{cy0-10} {cx0+9},{cy0-7}", "none", INK, 1.5))
    g.append(ellipse(cx0 - 10, cy0 - 2, 3, 1.6, PINK, "none", 0, 'opacity="0.7"'))
    g.append(ellipse(cx0 + 10, cy0 - 2, 3, 1.6, PINK, "none", 0, 'opacity="0.7"'))
    g.append(path(poly([(cx0 - 11, cy0 - 17), (cx0 - 9, cy0 - 25), (cx0 + 10, cy0 - 25), (cx0 + 12, cy0 - 17)]), "#FFFFFF", INK, 1.3))
    g.append(line(cx0 - 8, cy0 - 21, cx0 + 9, cy0 - 21, PINK, 1.3, 'opacity="0.8"'))
    surf = f"M{PX-PR},{WL}"
    for k in range(10):
        x0 = PX - PR + k * (2 * PR / 10)
        surf += f" Q{x0 + PR/20:.1f},{WL + (-3 if k % 2 else 3)} {x0 + PR/10:.1f},{WL}"
    surf += f" L{PX+PR},{PY+PR} L{PX-PR},{PY+PR} Z"
    g.append(path(surf, "#5CC3C8", INK, 1.3, 'opacity="0.92"'))
    g.append(path(f"M{PX-PR+8},{WL+6} Q{PX-20},{WL+3} {PX-8},{WL+7}", "none", "#FFFFFF", 1.6, 'opacity="0.6"'))
    for (bx, by, br) in ((PX - 30, PY + 28, 5), (PX - 20, PY + 38, 3), (PX + 28, PY + 26, 4), (PX + 18, PY + 36, 2.6), (PX - 34, PY - 10, 4.4),
                         (PX - 26, PY - 24, 2.8), (PX + 32, PY - 18, 3.4), (PX + 26, PY - 32, 5), (PX - 8, PY + 40, 3.6), (PX + 38, PY + 6, 2.4)):
        g.append(f'<circle cx="{bx}" cy="{by}" r="{br}" fill="#FFFFFF" fill-opacity="0.25" stroke="#FFFFFF" stroke-width="1.2" opacity="0.9"/>')
        g.append(dot(bx - br * 0.35, by - br * 0.35, round(br * 0.28, 1), "#FFFFFF", 0, "none"))
    g.append('</g>')
    g.append(path(f"M{PX-PR*0.72:.1f},{PY-PR*0.5:.1f} Q{PX-PR*0.45:.1f},{PY-PR*0.85:.1f} {PX:.1f},{PY-PR*0.92:.1f}", "none", "#FFFFFF", 2.4, 'opacity="0.55"'))
    A["windows"] = [dict(x=PX - PR, y=PY - PR, w=2 * PR, h=2 * PR, shape="circle", cx=PX, cy=PY, r=PR, note="porthole, lit aqua")]
    A["bubbles"] = dict(cx=PX, cy=PY, r=PR, water_y=WL, note="bubbles can rise inside the porthole (clip to the circle)")
    # ---- the lattice window ----
    LX0, LY0, LW_, LH_ = 330, 252, 64, 92
    g.append(rect(LX0 - 7, LY0 - 7, LW_ + 14, LH_ + 14, WOOD, INK, LB))
    g.append(rect(LX0, LY0, LW_, LH_, "url(#bathlit)", INK, LM))
    g.append(f'<clipPath id="bathlattice"><rect x="{LX0}" y="{LY0}" width="{LW_}" height="{LH_}"/></clipPath>')
    g.append('<g clip-path="url(#bathlattice)">')
    g.append(rect(LX0, LY0 + 62, LW_, 5, "#8A5A3A", "none", 0, 'opacity="0.8"'))
    for i, (bx, by) in enumerate(((LX0 + 18, LY0 + 62), (LX0 + 18, LY0 + 50), (LX0 + 18, LY0 + 38))):
        g.append(path(poly([(bx - 11, by - 12), (bx + 11, by - 12), (bx + 9, by), (bx - 9, by)]), "#E0A24A" if i % 2 == 0 else "#F2C75C", INK, 1.1, 'opacity="0.9"'))
    g.append(rrect(LX0 + 38, LY0 + 52, 20, 10, 3, "#FFFFFF", INK, 1.0, extra='opacity="0.9"'))
    g.append(line(LX0 + 40, LY0 + 56, LX0 + 56, LY0 + 56, PINK, 1.2))
    g.append('</g>')
    for k in (1, 2, 3):
        g.append(line(LX0 + k * LW_ / 4, LY0, LX0 + k * LW_ / 4, LY0 + LH_, WOOD2, 2.2))
    for k in (1, 2, 3, 4, 5):
        g.append(line(LX0, LY0 + k * LH_ / 6, LX0 + LW_, LY0 + k * LH_ / 6, WOOD2, 1.4))
    g.append(rect(LX0, LY0, LW_, LH_, "none", INK, LB))
    g.append(rect(LX0 - 10, LY0 + LH_ + 7, LW_ + 20, 7, WOOD2, INK, LM))
    A["windows"].append(dict(x=LX0, y=LY0, w=LW_, h=LH_, shape="rect", note="lattice window, warm light"))
    # ---- the doorway ----
    DCX = 238; DX0, DX1 = DCX - 48, DCX + 48; DT = G - 154
    g.append(rect(DX0 - 10, DT - 8, DX1 - DX0 + 20, G - DT + 8, WOOD, INK, LB))
    g.append(rect(DX0, DT, DX1 - DX0, G - 8 - DT, "url(#bathlit)", INK, LM))
    g.append(rect(DX0, G - 36, DX1 - DX0, 28, "#B7773F", INK, LM))
    g.append(line(DX0 + 2, G - 33, DX1 - 2, G - 33, "#FFE6A8", 1.4, 'opacity="0.7"'))
    for sx in (-1, 1):
        g.append(ellipse(DCX + sx * 11, G - 39, 8, 3, PINK, INK, 1.1))
    g.append(rect(DX0 - 14, G - 8, DX1 - DX0 + 28, 9, STONE, INK, LM))             # the stone step
    g.append(line(DX0 - 10, G - 6, DX1 + 10, G - 6, STONE_L, 1.3, 'opacity="0.6"'))
    g.append(line(DX0 - 4, DT + 4, DX1 + 4, DT + 4, "#2A1830", 3.2))
    NB = DT + 70
    for side in (0, 1):
        x0 = DX0 + 2 if side == 0 else DCX + 1
        x1 = DCX - 1 if side == 0 else DX1 - 2
        d = f"M{x0},{DT+4} L{x1},{DT+4} L{x1},{NB} Q{(x0*0.25+x1*0.75):.1f},{NB+3} {(x0+x1)/2:.1f},{NB} Q{(x0*0.75+x1*0.25):.1f},{NB-3} {x0},{NB} Z"
        g.append(path(d, HAIR, INK, LM))
        g.append(line(x0 + 3, DT + 8, x0 + 3, NB - 4, STRAND, 1.6, 'opacity="0.8"'))
    g.extend(onsen(DCX, DT + 42, 1.3, LAV))
    A["doors"] = [dict(x=DX0, y=DT, w=DX1 - DX0, h=G - DT, note="doorway with split noren; warm light inside")]
    # the name board under the canopy
    SBX0, SBY0, SBW, SBH = DCX - 56, DT - 40, 112, 28
    g.append(rect(SBX0, SBY0, SBW, SBH, "#6B4A36", INK, LB))
    g.append(rect(SBX0 + 4, SBY0 + 4, SBW - 8, SBH - 8, "#3E271D", INK, 1.2))
    A["signs"] = [dict(x=SBX0 + 5, y=SBY0 + 5, w=SBW - 10, h=SBH - 10, text="BATHS", style="painted")]
    # ---- the karahafu canopy ----
    KH = 94; KP = DT - 92; KD = 40; BEAM = DT - 50
    prof = [(0, 0), (0.15, 0.03), (0.3, 0.13), (0.45, 0.34), (0.6, 0.62), (0.75, 0.86), (0.88, 0.99), (1.0, 0.9)]
    curve = [(DCX - KH * u, KP + KD * f) for (u, f) in prof[::-1]] + [(DCX + KH * u, KP + KD * f) for (u, f) in prof[1:]]
    g.append(rect(DCX - 76, BEAM, 152, 8, WOOD2, INK, LM))
    shade = [(x, y + 8) for (x, y) in curve]
    g.append(path(smooth_open(shade) + f" L{DCX+70},{BEAM+1} L{DCX-70},{BEAM+1} Z", "#1A1024", INK, LM))
    for sx in (-1, 1):                                                                     # brackets
        g.append(path(poly([(DCX + sx * 70, BEAM + 8), (DCX + sx * 70, BEAM + 20), (DCX + sx * 62, BEAM + 8)]), WOOD2, INK, 1.3))
    top = [(x, y - 14) for (x, y) in curve]
    g.append(path(band_path(top, curve), ROOF2, INK, LB))
    for k in range(-5, 6):
        i = int(round((k + 5) / 10 * (len(curve) - 1)))
        (x, y) = curve[i]
        g.append(line(x, y - 12, x, y - 2, "#3A2A5A", 1.6, 'opacity="0.9"'))
    bb = [(x, y + 8) for (x, y) in curve]
    g.append(path(band_path(curve, bb), WOOD, INK, LM))
    g.append(path(smooth_open([(x, y + 4) for (x, y) in curve]), "none", GOLD2, 1.6, 'opacity="0.95"'))
    g.append(path(f"M{DCX-9},{KP+8} Q{DCX},{KP+22} {DCX+9},{KP+8} Z", GOLD2, INK, 1.3))
    g.append(dot(DCX, KP + 13, 2.3, GOLD, 0.9))
    for sx in (-1, 1):
        g.extend(lantern(DCX + sx * 72, DT - 16, 11, 15))
    A["light"] = [dict(x=DCX - 72, y=DT - 16, note="paper lantern: warm red glow, gentle sway"),
                  dict(x=DCX + 72, y=DT - 16, note="paper lantern: warm red glow, gentle sway")]
    # ---- the main roof ----
    roof = (f"M{2},{EY-22} C{10},{EY-10} {24},{EY-2} {50},{EY} L{W-50},{EY} C{W-24},{EY-2} {W-10},{EY-10} {W-2},{EY-22} "
            f"C{W-20},{EY-24} {W-44},{EY-34} {W-62},{EY-46} C{W-78},{EY-58} {RX1-4},{RY+14} {RX1},{RY} L{RX0},{RY} "
            f"C{RX0+4},{RY+14} {78},{EY-58} {62},{EY-46} C{44},{EY-34} {20},{EY-24} {2},{EY-22} Z")
    g.append(path(roof, ROOF2, INK, LB))
    for k in range(1, 16):
        t = k / 16
        xe = 20 + (W - 40) * t; xr = RX0 + (RX1 - RX0) * t
        g.append(path(f"M{xr:.1f},{RY+6} C{xr + (xe-xr)*0.1:.1f},{RY+40} {xe - (xe-xr)*0.35:.1f},{EY-26} {xe:.1f},{EY-6}", "none", "#3E2C60", 2.4, 'opacity="0.95"'))
    g.append(path(f"M{4},{EY-20} C{12},{EY-10} {26},{EY-4} {50},{EY-3} L{W-50},{EY-3} C{W-26},{EY-4} {W-12},{EY-10} {W-4},{EY-20}", "none", TRIM, 2.0, 'opacity="0.8"'))
    g.append(path(f"M{RX0+4},{RY+4} C{RX0},{RY+20} {80},{EY-60} {62},{EY-48}", "none", TRIM, 1.6, 'opacity="0.55"'))
    for k in range(18):
        x = 56 + k * (W - 112) / 17
        g.append(dot(x, EY + 1, 3.4, ROOF, 1.1))
    g.append(rect(RX0 - 8, RY - 10, RX1 - RX0 + 16, 12, "#1A1024", INK, LB))
    g.append(line(RX0 - 4, RY - 7, RX1 + 4, RY - 7, TRIM, 1.4, 'opacity="0.6"'))
    for sgn, x in ((-1, RX0 - 8), (1, RX1 + 8)):
        d = (f"M{x},{RY+2} C{x+sgn*6},{RY} {x+sgn*10},{RY-10} {x+sgn*8},{RY-22} C{x+sgn*6},{RY-30} {x-sgn*4},{RY-28} {x-sgn*3},{RY-20} "
             f"C{x-sgn*2},{RY-14} {x+sgn*3},{RY-14} {x+sgn*3},{RY-19} L{x},{RY-10} Z")
        g.append(path(d, "#1A1024", INK, LM))
        g.append(dot(x + sgn * 2, RY - 21, 2.4, GOLD2, 1.0))
    g.extend(duck(166, RY - 10, 1.3))
    A["duck"] = dict(x=166, y=RY - 10, note="rubber duck on the ridge (could bob gently)")
    svg_compact("baths", W, H, g, defs=defs)
    return dict(name="baths", W=W, H=H, G=G, kind="building", anchors=A)

# ================================================================================================================
#  THE FOUNTAIN
# ================================================================================================================
def fountain():
    """A two-tier stone fountain on a wide round basin, water spilling from both tiers, a cat on top and a cat's
    face on the basin's front with a little spout."""
    W, H = 230, 220; BASE = H - 8
    g = []; A = {}
    defs = ('<linearGradient id="fountwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FA6EA"/>'
            '<stop offset="1" stop-color="#4E4B9A"/></linearGradient>')
    CX = W / 2
    # ---- the basin: back rim, water, front wall and rim ----
    BY = 162; BRX = 104; BRY = 16
    # it stands on its own footprint: the ground's shadow is the basin's bottom ellipse, a little wider and darker at
    # the front (it used to be a faint thin strip, and the basin read as hovering just above the paving)
    g.append(flat(f'<ellipse cx="{CX}" cy="{BASE - BRY + 3}" rx="{BRX + 9}" ry="{BRY + 3}" fill="#000" opacity="0.42"/>'))
    g.append(flat(f'<ellipse cx="{CX}" cy="{BASE - 3}" rx="{BRX - 6}" ry="{7}" fill="#000" opacity="0.3"/>'))
    g.append(ellipse(CX, BY, BRX, BRY, STONE_M, INK, LB))
    g.append(ellipse(CX, BY + 1, BRX - 9, BRY - 6, "url(#fountwater)", INK, LM))
    # the basin's front wall
    # straight sides down to where the bottom ellipse (the rim's own shape) starts, then its front half
    BOT = BASE - BRY * 1.1
    wall = (f"M{CX-BRX},{BY} L{CX-BRX+2},{BOT:.1f} C{CX-BRX+6},{BASE-BRY*0.35:.1f} {CX-BRX*0.55:.1f},{BASE+0.5} {CX},{BASE+0.5} "
            f"C{CX+BRX*0.55:.1f},{BASE+0.5} {CX+BRX-6},{BASE-BRY*0.35:.1f} {CX+BRX-2},{BOT:.1f} L{CX+BRX},{BY} "
            f"C{CX+BRX-10},{BY+BRY*1.3} {CX-BRX+10},{BY+BRY*1.3} {CX-BRX},{BY} Z")
    g.append(path(wall, STONE, INK, LB))
    g.append(path(f"M{CX-BRX},{BY} C{CX-BRX+10},{BY+BRY*1.3} {CX+BRX-10},{BY+BRY*1.3} {CX+BRX},{BY}", "none", STONE_L, 5.0))
    g.append(path(f"M{CX-BRX},{BY} C{CX-BRX+10},{BY+BRY*1.3} {CX+BRX-10},{BY+BRY*1.3} {CX+BRX},{BY}", "none", INK, LM))
    g.append(path(f"M{CX-BRX+4},{BY+7} C{CX-BRX+14},{BY+BRY*1.3+6} {CX+BRX-14},{BY+BRY*1.3+6} {CX+BRX-4},{BY+7}", "none", INK, 1.2, 'opacity="0.6"'))
    # panels on the wall
    for k in (-2, -1, 1, 2):
        px = CX + k * 40
        g.append(rrect(px - 14, BY + 26 - abs(k) * 2, 28, 18, 4, "none", STONE2, 1.6))
    g.append(flat(f'<path d="M{CX+BRX-30},{BY+18} C{CX+BRX-18},{BY+14} {CX+BRX-8},{BY+8} {CX+BRX-2},{BY+4} L{CX+BRX-1},{BASE-9} C{CX+BRX-12},{BASE-4} {CX+BRX-22},{BASE-3} {CX+BRX-30},{BASE-2} Z" fill="#000" opacity="0.16"/>'))
    # a cat's face on the front with a spout of water from its mouth
    fx, fy = CX, BY + 34
    face = [(fx - 13, fy + 8), (fx - 14, fy - 4), (fx - 12, fy - 16), (fx - 6, fy - 9), (fx + 6, fy - 9), (fx + 12, fy - 16), (fx + 14, fy - 4), (fx + 13, fy + 8), (fx, fy + 12)]
    g.append(path(smooth_closed(face, 0.25), STONE_M, INK, LM))
    g.append(path(f"M{fx-8},{fy-2} Q{fx-5},{fy-5} {fx-2},{fy-2}", "none", INK, 1.3))
    g.append(path(f"M{fx+2},{fy-2} Q{fx+5},{fy-5} {fx+8},{fy-2}", "none", INK, 1.3))
    g.append(ellipse(fx, fy + 4, 2.6, 2, STONE_X, INK, 1.0))
    # ---- the pedestal and the lower tier ----
    g.append(path(f"M{CX-14},{BY+4} C{CX-10},{BY-12} {CX-16},{BY-26} {CX-9},{BY-40} L{CX+9},{BY-40} C{CX+16},{BY-26} {CX+10},{BY-12} {CX+14},{BY+4} Z", STONE_M, INK, LB))
    g.append(line(CX - 9, BY - 2, CX - 7, BY - 34, STONE_L, 1.6, 'opacity="0.7"'))
    T1 = 108; T1R = 60
    g.append(path(f"M{CX-T1R},{T1} C{CX-T1R+6},{T1+22} {CX-18},{T1+26} {CX-10},{T1+30} L{CX+10},{T1+30} C{CX+18},{T1+26} {CX+T1R-6},{T1+22} {CX+T1R},{T1} Z", STONE, INK, LB))
    g.append(path(f"M{CX-T1R+10},{T1+10} C{CX-T1R+18},{T1+20} {CX-24},{T1+22} {CX-14},{T1+25}", "none", STONE_L, 1.6, 'opacity="0.6"'))
    g.append(ellipse(CX, T1, T1R, 8, STONE_L, INK, LB))
    g.append(ellipse(CX, T1 + 0.5, T1R - 6, 4.8, "url(#fountwater)", INK, 1.2))
    # the upper stem and tier
    g.append(path(f"M{CX-7},{T1+1} C{CX-5},{T1-10} {CX-9},{T1-20} {CX-5},{T1-30} L{CX+5},{T1-30} C{CX+9},{T1-20} {CX+5},{T1-10} {CX+7},{T1+1} Z", STONE_M, INK, LM))
    T2 = 72; T2R = 32
    g.append(path(f"M{CX-T2R},{T2} C{CX-T2R+4},{T2+12} {CX-10},{T2+14} {CX-6},{T2+16} L{CX+6},{T2+16} C{CX+10},{T2+14} {CX+T2R-4},{T2+12} {CX+T2R},{T2} Z", STONE, INK, LB))
    g.append(ellipse(CX, T2, T2R, 5, STONE_L, INK, LM))
    g.append(ellipse(CX, T2 + 0.3, T2R - 5, 2.8, "url(#fountwater)", INK, 1.0))
    # ---- water: streams off both tiers ----
    SW = LAV2
    for sgn in (-1, 1):
        # translucent sheets of water under the streams
        x0 = CX + sgn * (T2R - 1); x1 = CX + sgn * (T2R + 14)
        g.append(flat(f'<path d="M{x0:.1f},{T2+1} C{x0+sgn*9:.1f},{T2-2} {x1:.1f},{T2+6} {x1:.1f},{T1-1} L{x1-sgn*9:.1f},{T1-1} C{x1-sgn*9:.1f},{T2+10} {x0+sgn*3:.1f},{T2+4} {x0:.1f},{T2+3} Z" fill="{LAV2}" opacity="0.28"/>'))
        x0 = CX + sgn * (T1R - 3); x1 = CX + sgn * (T1R + 26)
        g.append(flat(f'<path d="M{x0:.1f},{T1+2} C{x0+sgn*14:.1f},{T1-3} {x1:.1f},{T1+12} {x1:.1f},{BY-2} L{x1-sgn*22:.1f},{BY-2} C{x1-sgn*22:.1f},{T1+16} {x0+sgn*4:.1f},{T1+6} {x0:.1f},{T1+5} Z" fill="{LAV2}" opacity="0.25"/>'))
        for k, (dx, fall) in enumerate(((0, 0), (5, 3), (-4, 1))):
            x0 = CX + sgn * (T2R - 2 + dx * 0.2); y0 = T2 + 1
            x1 = CX + sgn * (T2R + 10 + dx); y1 = T1 - 1
            g.append(path(f"M{x0:.1f},{y0:.1f} C{x0+sgn*8:.1f},{y0-2:.1f} {x1:.1f},{y0+8:.1f} {x1:.1f},{y1:.1f}", "none", "#FFFFFF" if k == 0 else SW, 2.8 if k == 0 else 1.9, f'opacity="{0.9 if k == 0 else 0.7}"'))
        for k, (dx, w) in enumerate(((0, 2.6), (7, 1.8), (-6, 1.8), (13, 1.4))):
            x0 = CX + sgn * (T1R - 3); y0 = T1 + 2
            x1 = CX + sgn * (T1R + 12 + dx); y1 = BY - 2
            g.append(path(f"M{x0:.1f},{y0:.1f} C{x0+sgn*12:.1f},{y0-3:.1f} {x1:.1f},{y0+14:.1f} {x1:.1f},{y1:.1f}", "none", "#FFFFFF" if k == 0 else SW, w + 0.4, f'opacity="{0.9 if k == 0 else 0.65}"'))
        # splash rings where they land
        g.append(ellipse(CX + sgn * (T1R + 13), BY - 1, 9, 2.4, "none", "#FFFFFF", 1.2, 'opacity="0.6"'))
        g.append(ellipse(CX + sgn * (T2R + 10), T1 - 1, 5, 1.4, "none", "#FFFFFF", 1.0, 'opacity="0.6"'))
    # wishes at the bottom of the basin
    for (cx_, cy_) in ((CX - 70, BY + 3), (CX - 44, BY + 6), (CX + 48, BY + 5), (CX + 76, BY + 2)):
        g.append(ellipse(cx_, cy_, 3.4, 1.5, GOLD2, INK, 0.8, 'opacity="0.75"'))
    # ripples on the basin water
    for (a0, a1, yy) in ((-62, -26, 2), (28, 66, 3), (-36, -10, 7), (8, 40, 7)):
        g.append(path(f"M{CX+a0},{BY+yy} Q{CX+(a0+a1)/2},{BY+yy-3} {CX+a1},{BY+yy}", "none", "#FFFFFF", 1.3, 'opacity="0.5"'))
    # ---- the cat on top ----
    g.append(ellipse(CX, T2 - 4, 11, 3.8, STONE_L, INK, LM))
    g.extend(cat_statue(CX, T2 - 5, 36, tail=1))
    A["spouts"] = [dict(x=CX, y=T2 - 2, note="top bowl: water wells up round the cat's feet (sparkle)"),
                   dict(x=CX - T2R, y=T2 + 1), dict(x=CX + T2R, y=T2 + 1), dict(x=CX - T1R, y=T1 + 2), dict(x=CX + T1R, y=T1 + 2)]
    A["water"] = dict(cx=CX, cy=BY + 1, rx=BRX - 9, ry=BRY - 6, note="the basin's water surface: ripples/spray land here")
    svg_compact("fountain", W, H, g, defs=defs)
    return dict(name="fountain", W=W, H=H, base=BASE, kind="prop", anchors=A)


if __name__ == "__main__":
    which = sys.argv[1:] or ["hall", "crownboard", "baths", "fountain"]
    for w in which:
        print(globals()[w]())
