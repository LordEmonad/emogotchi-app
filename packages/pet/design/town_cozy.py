"""Emotown's cosy buildings -> packages/pet/town/{gate,shop,inn,bench}.svg

The town gate at the far left where new pets walk in, the item shop, the Sleepy Inn and a park bench. Drawn like
the diner in town.py: flat night fills, wobbly black ink, lit glass as a gradient, the story inside the windows.
No text anywhere: every sign is a blank board whose rectangle the site fills with glowing type (see ANCHORS).

    python3 town_cozy.py                 # all four
    python3 town_cozy.py gate shop       # some
"""
import os, sys, math, random, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town import *
from cat import MOSS, LINEN, LINEN2, PUMPKIN, PUMPKIN2, PUMPKIN3, FLAME, lens, carve_mouth, strip

ANCHORS = {}

IRON  = "#231733"      # wrought iron, a shade off ink so the highlight can sit on it
IRONH = "#6E5C8F"      # the moon on iron

_RAW = {}
def raw(elems, step=14.0, amp=0.9):
    """Bake some elements with a coarser wobble than the rest (long faint lines, fills whose ink is drawn again on
    top, clip paths) and keep them out of svg()'s own bake: a placeholder now, swapped in by save()."""
    from wobble import bake
    if isinstance(elems, str): elems = [elems]
    body = bake("\n".join(e for e in elems if e), amp=amp, freq=0.09, step=step)
    body = re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}").rstrip("0").rstrip("."), body)
    k = f"<!--RAW{len(_RAW)}-->"; _RAW[k] = body
    return k

def _num(t):
    """tenths -> the shortest decimal: 5 -> '.5', -15 -> '-1.5', 20 -> '2'."""
    neg = t < 0; t = abs(t); a, b = divmod(t, 10)
    s = (str(a) if a else "") + (f".{b}" if b else "")
    s = s or "0"
    return ("-" if neg else "") + s

def _join(nums):
    out = ""
    for k, n in enumerate(nums):
        if k and not n.startswith("-") and not (n.startswith(".") and "." in nums[k - 1] and "e" not in nums[k - 1]):
            out += " "
        out += n
    return out

def rel_d(d):
    """An absolute M/L/C/Z path (what the wobble writes) as relative commands at 0.1 precision: the same points to
    the tenth (deltas are taken between the rounded absolutes, so nothing drifts), about 40% fewer bytes."""
    toks = re.findall(r"[MLCZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[A-Za-z]", d)
    if any(t.isalpha() and t not in "MLCZ" for t in toks): return d
    i = 0; out = []; cur = (0, 0); start = (0, 0); prev = None
    T = lambda v: int(round(float(v) * 10))
    while i < len(toks):
        c = toks[i]; i += 1
        if c == "M":
            p = (T(toks[i]), T(toks[i + 1])); i += 2
            out.append("M" + _join([_num(p[0]), _num(p[1])])); cur = start = p; prev = "M"
            while i < len(toks) and not toks[i].isalpha():      # implicit linetos after a moveto
                q = (T(toks[i]), T(toks[i + 1])); i += 2
                out.append("l" + _join([_num(q[0] - cur[0]), _num(q[1] - cur[1])])); cur = q; prev = "l"
        elif c == "L":
            while i < len(toks) and not toks[i].isalpha():
                q = (T(toks[i]), T(toks[i + 1])); i += 2
                s_ = _join([_num(q[0] - cur[0]), _num(q[1] - cur[1])])
                out.append(("" if prev == "l" and s_.startswith("-") else (" " if prev == "l" else "l")) + s_); cur = q; prev = "l"
        elif c == "C":
            while i < len(toks) and not toks[i].isalpha():
                v = [T(x) for x in toks[i:i + 6]]; i += 6
                nums = [_num(v[0] - cur[0]), _num(v[1] - cur[1]), _num(v[2] - cur[0]), _num(v[3] - cur[1]), _num(v[4] - cur[0]), _num(v[5] - cur[1])]
                s_ = _join(nums)
                out.append(("" if prev == "c" and s_.startswith("-") else (" " if prev == "c" else "c")) + s_)
                cur = (v[4], v[5]); prev = "c"
        elif c == "Z":
            out.append("Z"); cur = start; prev = "Z"
        else:
            return d
    return "".join(out)

def keep(elem):
    """Leave an element out of the wobble altogether (tiny dots: flowers, rivets, beads), swapped in by save()."""
    k = f"<!--RAW{len(_RAW)}-->"
    _RAW[k] = re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}").rstrip("0").rstrip("."), elem)
    return k

def dot(cx, cy, r, fill, sw=1.0, stroke=INK):
    return keep(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

def save(name, w, h, body, defs="", step=8.0):
    """town.svg, then a diet: the round joins and caps every path repeats move up to the root group (they inherit),
    and the ink is written short. Nothing drawn changes."""
    import io, contextlib
    with contextlib.redirect_stdout(io.StringIO()):
        svg(name, w, h, body, step=step, defs=defs)
    f = os.path.join(OUT, name + ".svg"); src = open(f).read()
    src = re.sub(r"<!--RAW\d+-->", lambda m: _RAW[m.group(0)], src)
    src = src.replace(' stroke-linejoin="round" stroke-linecap="round"', "").replace('"#000000"', '"#000"')
    src = src.replace(f'<g id="{name}">', f'<g id="{name}" stroke-linejoin="round" stroke-linecap="round">', 1)
    src = re.sub(r' stroke="none" stroke-width="0"', ' stroke="none"', src)
    src = re.sub(r' d="([^"]*)"', lambda m: ' d="' + rel_d(m.group(1)) + '"', src)
    open(f, "w").write(src)
    print("wrote", name, f"{len(src)//1024} KB")

# ---------------- small shared pieces ----------------
def multiline(segs, stroke=INK, sw=LM, extra=""):
    """Many straight strokes as one path (one set of attributes): mortar joints, slates, boards, ticks."""
    if not segs: return ""
    d = " ".join(f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" for x0, y0, x1, y1 in segs)
    return path(d, "none", stroke, sw, extra)

def ticks(segs, stroke=INK, sw=1.2, opacity=0.9, seed=5):
    """Short straight strokes left unbaked (a 20-unit line has no wobble to speak of): polylines in one styled group,
    each nudged a little by hand so they do not look ruled. Cheap: a mortar joint costs ~40 bytes, not ~250."""
    if not segs: return ""
    rnd = random.Random(seed)
    j = lambda: rnd.uniform(-0.5, 0.5)
    pl = "".join(f'<polyline points="{x0+j():.1f},{y0+j():.1f} {x1+j():.1f},{y1+j():.1f}"/>' for x0, y0, x1, y1 in segs)
    return f'<g fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" opacity="{opacity}">{pl}</g>'

def heart_d(cx, cy, w):
    """The Emonad heart (props._heart), sized by width, centred on (cx, cy)."""
    k = w / 28.0
    return (f"M{cx:.1f},{cy+11*k:.1f} C{cx-12*k:.1f},{cy+2*k:.1f} {cx-14*k:.1f},{cy-6*k:.1f} {cx-8*k:.1f},{cy-10*k:.1f} "
            f"C{cx-4*k:.1f},{cy-13*k:.1f} {cx:.1f},{cy-10*k:.1f} {cx:.1f},{cy-7*k:.1f} C{cx:.1f},{cy-10*k:.1f} {cx+4*k:.1f},{cy-13*k:.1f} {cx+8*k:.1f},{cy-10*k:.1f} "
            f"C{cx+14*k:.1f},{cy-6*k:.1f} {cx+12*k:.1f},{cy+2*k:.1f} {cx:.1f},{cy+11*k:.1f} Z")

def heart(cx, cy, w, fill=PINK, lw=1.4):
    return path(heart_d(cx, cy, w), fill, INK, lw)

def poly_raw(pts, fill, opacity=1.0):
    """An unbaked polygon: for soft tints that need no ink (cheap, the wobble would be lost under them anyway)."""
    p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    return f'<polygon points="{p}" fill="{fill}" opacity="{opacity}"/>'

def lantern(cx, cy, s=1.0, gid="lampglass", ring=True):
    """A hanging lantern, (cx, cy) the middle of its glass: a ring, a pointed iron cap, lit glass with a candle
    flame and a bar, an iron base with a drip. About 24s wide and 44s tall."""
    g = []; top = cy - 12*s; bot = cy + 11*s
    if ring:
        g.append(f'<circle cx="{cx:.1f}" cy="{top-12*s:.1f}" r="{3.2*s:.1f}" fill="none" stroke="{INK}" stroke-width="1.8"/>')
    g.append(path(poly([(cx-13*s, top), (cx+13*s, top), (cx+5*s, top-7*s), (cx, top-9.5*s), (cx-5*s, top-7*s)]), IRON, INK, LM))
    g.append(line(cx-8*s, top-2.4*s, cx-2*s, top-7*s, IRONH, 1.2, 'opacity="0.8"'))
    g.append(path(poly([(cx-9.5*s, top), (cx+9.5*s, top), (cx+7.5*s, bot), (cx-7.5*s, bot)]), f"url(#{gid})", INK, LM))
    g.append(path(f"M{cx:.1f},{cy+5*s:.1f} C{cx-3.4*s:.1f},{cy+1*s:.1f} {cx-1.2*s:.1f},{cy-4*s:.1f} {cx:.1f},{cy-7*s:.1f} "
                  f"C{cx+1.2*s:.1f},{cy-4*s:.1f} {cx+3.4*s:.1f},{cy+1*s:.1f} {cx:.1f},{cy+5*s:.1f} Z", "#FFF8E0", "none", 0))
    g.append(line(cx-6*s, top+1.5*s, cx-5*s, bot-1.5*s, IRON, 1.4))
    g.append(line(cx+6*s, top+1.5*s, cx+5*s, bot-1.5*s, IRON, 1.4))
    g.append(path(poly([(cx-10*s, bot), (cx+10*s, bot), (cx+6.5*s, bot+4.5*s), (cx-6.5*s, bot+4.5*s)]), IRON, INK, LM))
    g.append(path(poly([(cx-2.2*s, bot+4.5*s), (cx+2.2*s, bot+4.5*s), (cx, bot+9*s)]), IRON, INK, LT))
    return g

def curl_pts(cx, cy, r, a0, turns=1.1, d=1, n=14):
    """A spiral from radius r inward, starting at angle a0 (degrees), direction d."""
    out = []
    for k in range(n + 1):
        t = k / n; a = math.radians(a0) + d * t * turns * 2 * math.pi; rr = r * (1 - 0.72 * t)
        out.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return out

def bracket(wx, y, lx, s=1.0):
    """A wrought-iron wall bracket: a plate on the wall at wx, an arm out to lx at height y ending in a hook, a
    quarter-round brace under it and one curl on top."""
    d = 1 if lx > wx else -1; L = abs(lx - wx)
    g = [rrect(wx - 4*s, y - 10*s, 8*s, 34*s, 3.5*s, IRON, INK, LM)]
    # the brace: a quarter round from the plate up to the arm
    r = min(L * 0.8, 16*s)
    g.append(path(f"M{wx:.1f},{y + r:.1f} C{wx + d*r*0.55:.1f},{y + r:.1f} {wx + d*r:.1f},{y + r*0.55:.1f} {wx + d*r:.1f},{y:.1f}", "none", INK, 2.6*s))
    g.append(path(f"M{wx:.1f},{y:.1f} L{lx + d*3*s:.1f},{y:.1f}", "none", INK, 4.2*s))
    g.append(path(f"M{wx + d*3*s:.1f},{y - 0.8*s:.1f} L{lx:.1f},{y - 0.8*s:.1f}", "none", IRONH, 1.0, 'opacity="0.6"'))
    # a curl riding on the arm
    g.append(path(smooth_open(curl_pts(wx + d*L*0.45, y - 6*s, 5*s, 90, 0.95, d)), "none", INK, 2.0*s))
    g.append(path(f"M{lx:.1f},{y:.1f} L{lx:.1f},{y + 6*s:.1f}", "none", INK, 2.2*s))
    g.append(f'<circle cx="{wx:.1f}" cy="{y - 5*s:.1f}" r="{1.4*s:.1f}" fill="{IRONH}" stroke="none"/>')
    g.append(f'<circle cx="{wx:.1f}" cy="{y + 18*s:.1f}" r="{1.4*s:.1f}" fill="{IRONH}" stroke="none"/>')
    return g

def courses(x0, y0, x1, y1, bh, seed, bw=(28, 52), stroke="#56464F", tints=("#877482", "#5A4A56"), p=0.16, qu=None):
    """Stone block courses over a wall already filled: mortar lines from the ground up so the bottom course is whole,
    staggered joints, a few blocks tinted lighter or darker. qu=(a, b): quoins, long and short blocks alternating at
    both edges."""
    rnd = random.Random(seed); segs = []; vsegs = []; tint = []
    rows = []; y = y1
    while y > y0 + 0.5:
        ya = max(y0, y - bh); rows.append((ya, y)); y = ya
    for i, (ya, yb) in enumerate(rows):
        if ya > y0 + 0.5:
            segs.append((x0 + 1, ya, x1 - 1, ya))
        joints = []
        if qu:
            a, b = qu[i % 2], qu[(i + 1) % 2]
            joints = [x0 + a, x1 - b]
            tint.append(poly_raw([(x0, ya), (x0 + a, ya), (x0 + a, yb), (x0, yb)], tints[0], 0.55))
            tint.append(poly_raw([(x1 - b, ya), (x1, ya), (x1, yb), (x1 - b, yb)], tints[0], 0.55))
            lo, hi = x0 + a, x1 - b
        else:
            lo, hi = x0, x1
        x = lo + rnd.uniform(bw[0] * 0.3, bw[1] * 0.9)
        prev = lo
        while x < hi - bw[0] * 0.5:
            joints.append(x)
            if rnd.random() < p:
                tint.append(poly_raw([(prev + 1, ya + 1), (x - 1, ya + 1), (x - 1, yb - 1), (prev + 1, yb - 1)], rnd.choice(tints), 0.45))
            prev = x; x += rnd.uniform(*bw)
        for jx in joints:
            vsegs.append((jx, ya + 1, jx, yb - 1))
    return tint + [raw(multiline(segs, stroke, 1.2, 'opacity="0.9"'), 16), ticks(vsegs, stroke, 1.2, 0.9, seed)]

def tuft(x, y, s=1.0, fill="#3E5A34"):
    """A tuft of grass at a wall's foot."""
    pts = [(x - 9*s, y), (x - 7*s, y - 9*s), (x - 4*s, y - 3*s), (x - 1*s, y - 13*s), (x + 2*s, y - 3*s), (x + 6*s, y - 10*s), (x + 8*s, y - 2*s), (x + 10*s, y)]
    return path(poly(pts), fill, INK, LT)

def leaf(x, y, ang, s=1.0, fill="#3F6B3A"):
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v: (x + (u*ca - v*sa)*s, y + (u*sa + v*ca)*s)
    pts = [P(0, 0), P(4, -4), P(9, -3.5), P(13, 0), P(9, 3.5), P(4, 4)]
    return path(smooth_closed(pts, 0.5), fill, INK, 1.0)

# ---------------- the gate ----------------
GST  = "#6F5D69"    # warm grey stone, a touch redder than the civic stone
GST2 = "#56464F"    # mortar and shadow
GST3 = "#877482"    # dressed stone: the arch ring, the quoins, the bands
GST4 = "#473A44"    # deep shadow

def gate():
    """The town gate at the far left end of the street, where new pets walk in: a crenellated gatehouse whose arched
    passage (left half) is dark inside, with the raised portcullis's teeth in its crown, a lantern hanging in it and
    the moonlit country beyond the far end; a tower (right half) with a pointed slate roof, a pennant on its spire, a
    pink banner with the heart hanging down its face, a lit window and a cross slit; lanterns on iron brackets either
    side of the arch; a blank plaque over the arch for the town's name."""
    W, H = 320, 574; G = H - 16
    g = []
    defs = (lit_glass("gatelamp", "#FFF0B8", "#F4A65C") + lit_glass("gatewin", "#FFE3A0", "#EE9A58")
            + '<linearGradient id="gatefar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1030"/>'
              '<stop offset="0.7" stop-color="#34245A"/><stop offset="1" stop-color="#4A3470"/></linearGradient>'
            + '<linearGradient id="gatepass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0719"/>'
              '<stop offset="1" stop-color="#1E1233"/></linearGradient>')
    # ---- the gatehouse block (left) ----
    BX0, BX1 = 4, 206
    WT = G - 318                                   # top of the wall under the parapet
    g.append(poly_raw([(BX0, WT), (BX1, WT), (BX1, G), (BX0, G)], GST))
    g.extend(courses(BX0, WT, BX1, G - 14, 22, 11))
    g.append(rect(BX0, WT, BX1 - BX0, G - WT, "none", INK, LB))
    # parapet on corbels, with merlons
    PB = WT; PT = WT - 22
    merl = []; m, c = 24, 19.5; x = BX0 + 0.5
    for i in range(5):
        merl.append((x, x + m)); x += m + c
    for (a, b) in merl:
        g.append(rect(a, PT - 24, b - a, 26, GST3, INK, LB))
        g.append(line(a + 3, PT - 20, b - 3, PT - 20, "#A08E9C", 1.4, 'opacity="0.6"'))
    g.append(rect(BX0, PT, BX1 - BX0 + 2, 22, GST3, INK, LB))
    g.append(line(BX0 + 2, PT + 4, BX1 - 2, PT + 4, "#A08E9C", 1.4, 'opacity="0.6"'))
    for cx in range(14, 204, 21):                   # corbels under the parapet
        g.append(path(f"M{cx-6},{PB} L{cx+6},{PB} L{cx+6},{PB+7} Q{cx+6},{PB+13} {cx},{PB+13} Q{cx-6},{PB+13} {cx-6},{PB+7} Z", GST3, INK, LM))
    g.append(rect(BX0, PB + 13, BX1 - BX0, 5, GST4, "none", 0, 'opacity="0.5"'))   # the shadow the parapet throws
    # the arch: ring, passage, far end, portcullis, lantern
    AX, AW, AH = 46, 116, 222; ACX = AX + AW / 2; AT = G - AH; R = AW / 2; SPR = AT + R
    RW = 16
    g.append(path(arch_d(AX - RW, AT - RW, AW + 2*RW, AH + RW), GST3, INK, LB))
    g.append(raw(path(arch_d(AX, AT, AW, AH), "url(#gatepass)", "none", 0), 16))
    # inside: the passage's far end, a moonlit field and a hill; floor; the vault's lines
    FW, FH = 62, 124; FX = ACX - FW / 2; FB = G - 30; FT = FB - FH
    g.append(f'<clipPath id="gatearch">' + raw(f'<path d="{arch_d(AX, AT, AW, AH)}"/>', 16) + '</clipPath>')
    g.append('<g clip-path="url(#gatearch)">')
    g.append(path(poly([(AX, G), (AX + AW, G), (FX + FW, FB), (FX, FB)]), "#22163A", "none", 0))     # the floor
    for k in range(1, 4):
        u = k / 4; yy = FB + (G - FB) * u * u
        xa = FX + (AX - FX) * u * u; xb = FX + FW + (AX + AW - FX - FW) * u * u
        g.append(line(xa, yy, xb, yy, "#3A2A58", 1.1, 'opacity="0.7"'))
    g.append(path(arch_d(FX, FT, FW, FH), "url(#gatefar)", INK, LM))
    g.append(path(f"M{FX},{FB-18} Q{FX+20},{FB-34} {FX+40},{FB-24} Q{FX+54},{FB-18} {FX+FW},{FB-26} L{FX+FW},{FB} L{FX},{FB} Z", "#1F1536", "none", 0))
    g.append(path(f"M{FX+44},{FB-24} L{FX+44},{FB-44} M{FX+44},{FB-34} L{FX+50},{FB-40} M{FX+44},{FB-38} L{FX+39},{FB-44}", "none", "#1F1536", 2.2))
    for (sx, sy, r) in ((FX + 16, FT + 36, 1.6), (FX + 42, FT + 26, 1.3), (FX + 30, FT + 56, 1.1), (FX + 50, FT + 48, 1.4)):
        g.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{r}" fill="{LAV}" stroke="none" opacity="0.85"/>')
    for (x0, y0, x1, y1) in ((AX, SPR, FX, FT + FW / 2), (AX + AW, SPR, FX + FW, FT + FW / 2), (AX, G, FX, FB), (AX + AW, G, FX + FW, FB)):
        g.append(line(x0, y0, x1, y1, "#3A2A58", 1.3, 'opacity="0.8"'))
    # the portcullis, raised: its bottom and teeth hang in the arch's crown
    PY = AT + 42
    for bx in range(int(AX + 9), int(AX + AW), 15):
        g.append(path(f"M{bx-2.6},{AT-4} L{bx+2.6},{AT-4} L{bx+2.6},{PY} L{bx},{PY+9} L{bx-2.6},{PY} Z", "#3B2D52", INK, 1.3))
    for hy in (AT + 14, AT + 32):
        g.append(rect(AX - 4, hy - 2.6, AW + 8, 5.2, "#3B2D52", INK, 1.3))
        g.append(line(AX, hy - 1, AX + AW, hy - 1, IRONH, 1.0, 'opacity="0.5"'))
    g.append('</g>')
    # the lantern hanging in the passage
    LCY = AT + 96
    g.append(path(f"M{ACX},{AT} L{ACX},{LCY - 27}", "none", INK, 1.8))
    for k in range(5):
        cy = AT + 8 + k * 9
        g.append(ellipse(ACX, cy, 1.8, 3.4, "none", INK, 1.2))
    g.extend(lantern(ACX, LCY, 1.1, "gatelamp"))
    # the ring's joints and keystone, over the passage
    g.append(path(arch_d(AX, AT, AW, AH), "none", INK, LB))
    for k in range(1, 9):
        a = math.pi * k / 9
        if k == 4 or k == 5: continue
        ca, sa = math.cos(a), math.sin(a)
        g.append(line(ACX - R * ca, SPR - R * sa, ACX - (R + RW) * ca, SPR - (R + RW) * sa, INK, LM))
    for jy in range(int(SPR + 10), int(G - 10), 26):
        g.append(line(AX - RW, jy, AX, jy, INK, LM)); g.append(line(AX + AW, jy + 13, AX + AW + RW, jy + 13, INK, LM))
    KT = AT - RW - 8
    g.append(path(poly([(ACX - 9, AT + 3), (ACX + 9, AT + 3), (ACX + 14, KT), (ACX - 14, KT)]), GST3, INK, LB))
    g.append(line(ACX - 10, KT + 4, ACX + 10, KT + 4, "#A08E9C", 1.3, 'opacity="0.7"'))
    # the welcome plaque (blank; the site writes EMOTOWN)
    PX0, PX1 = 22, 186; PY0, PY1 = PB + 18, KT - 6
    g.append(rrect(PX0, PY0, PX1 - PX0, PY1 - PY0, 5, GST3, INK, LB))
    g.append(rrect(PX0 + 6, PY0 + 6, PX1 - PX0 - 12, PY1 - PY0 - 12, 3, "#231634", INK, LM))
    g.append(rrect(PX0 + 10, PY0 + 10, PX1 - PX0 - 20, PY1 - PY0 - 20, 2, "none", GOLD2, 1.3, 'opacity="0.75"'))
    for (rx, ry) in ((PX0 + 3.5, PY0 + 3.5), (PX1 - 3.5, PY0 + 3.5), (PX0 + 3.5, PY1 - 3.5), (PX1 - 3.5, PY1 - 3.5)):
        g.append(f'<circle cx="{rx}" cy="{ry}" r="2" fill="{GOLD2}" stroke="{INK}" stroke-width="0.9"/>')
    ANCHORS.setdefault("gate", {})["signs"] = [{"x": PX0 + 8, "y": PY0 + 8, "w": PX1 - PX0 - 16, "h": PY1 - PY0 - 16,
                                               "text": "EMOTOWN", "style": "plaque"}]
    # plinth along the foot
    g.append(rect(BX0, G - 14, BX1 - BX0, 14, GST2, INK, LM))
    g.append(line(BX0 + 2, G - 12, BX1 - 2, G - 12, GST3, 1.2, 'opacity="0.6"'))
    # ---- the tower (right) ----
    TX0, TX1 = 202, 312; TCX = (TX0 + TX1) / 2; TT = G - 420
    g.append(poly_raw([(TX0, TT), (TX1, TT), (TX1, G), (TX0, G)], GST))
    g.extend(courses(TX0, TT, TX1, G - 22, 22, 23, qu=(14, 26), p=0.12))
    g.append(poly_raw([(TX0, TT), (TX0 + 5, TT), (TX0 + 5, G - 22), (TX0, G - 22)], GST4, 0.35))
    g.append(rect(TX0, TT, TX1 - TX0, G - TT, "none", INK, LB))
    # battered foot
    g.append(path(poly([(TX0 - 6, G), (TX1 + 6, G), (TX1 + 2, G - 24), (TX0 - 2, G - 24)]), GST2, INK, LB))
    g.append(line(TX0, G - 20, TX1, G - 20, GST3, 1.2, 'opacity="0.6"'))
    # corbelled top and the slate roof
    CB = TT
    g.append(rect(TX0 - 5, CB - 14, TX1 - TX0 + 10, 14, GST3, INK, LB))
    for cx in range(int(TX0 + 8), int(TX1), 16):
        g.append(path(f"M{cx-5},{CB} L{cx+5},{CB} L{cx+5},{CB+5} Q{cx+5},{CB+10} {cx},{CB+10} Q{cx-5},{CB+10} {cx-5},{CB+5} Z", GST3, INK, LM))
    RB = CB - 14; RTIP = G - 514; RX0, RX1 = 196, 316
    roof = f"M{RX0},{RB} Q{RX0+14},{RB-6} {RX0+22},{RB-16} L{TCX},{RTIP} L{RX1-22},{RB-16} Q{RX1-14},{RB-6} {RX1},{RB} Z"
    g.append(raw(path(roof, ROOF2, "none", 0), 16))
    g.append(f'<clipPath id="gateroof">' + raw(f'<path d="{roof}"/>', 16) + '</clipPath>')
    g.append('<g clip-path="url(#gateroof)">')
    y = RB - 11; row = 0; hs = []; vs = []
    while y > RTIP + 8:
        hs.append((RX0, y, RX1, y))
        half = (y - RTIP) / (RB - RTIP) * (RX1 - RX0) / 2
        xs = TCX - half + (6 if row % 2 else 0)
        while xs < TCX + half:
            vs.append((xs, y, xs, y + 11)); xs += 12
        y -= 11; row += 1
    g.append(raw(multiline(hs, INK, 1.2, 'opacity="0.55"'), 16)); g.append(ticks(vs, INK, 1.0, 0.4))
    g.append(path(f"M{TCX-6},{RTIP+10} L{RX0+24},{RB-14}", "none", TRIM2, 2.2, 'opacity="0.45"'))
    g.append('</g>')
    g.append(path(roof, "none", INK, LB))
    g.append(path(f"M{RX0+2},{RB-1} Q{RX0+14},{RB-7} {RX0+22},{RB-17}", "none", TRIM, 1.6, 'opacity="0.6"'))
    # finial, pole and pennant
    g.append(line(TCX, RTIP - 2, TCX, RTIP - 36, INK, 2.6))
    g.append(f'<circle cx="{TCX}" cy="{RTIP - 3}" r="4.5" fill="{GOLD2}" stroke="{INK}" stroke-width="1.4"/>')
    g.append(f'<circle cx="{TCX}" cy="{RTIP - 37}" r="2.8" fill="{GOLD2}" stroke="{INK}" stroke-width="1.2"/>')
    pn = [(TCX + 1, RTIP - 34), (TCX + 20, RTIP - 34), (TCX + 42, RTIP - 28), (TCX + 34, RTIP - 24), (TCX + 44, RTIP - 19), (TCX + 20, RTIP - 16), (TCX + 1, RTIP - 16)]
    g.append(path(smooth_open(pn[:3], 0.3) + f" L{pn[3][0]},{pn[3][1]} L{pn[4][0]},{pn[4][1]} Q{TCX+22},{RTIP-18} {TCX+1},{RTIP-16} Z", PINK, INK, LM))
    g.append(line(TCX + 4, RTIP - 30, TCX + 26, RTIP - 28, "#FFFFFF", 1.2, 'opacity="0.35"'))
    # the belfry near the top: an open arch, dark inside, the gold bell that rings a new pet in
    WX, WY, WW, WH = TCX - 22, TT + 30, 44, 66
    g.append(path(arch_d(WX - 8, WY - 8, WW + 16, WH + 8), GST3, INK, LB))
    g.append(path(arch_d(WX, WY, WW, WH), "#170D28", INK, LB))
    g.append(path(f"M{WX + 4},{WY + WH} L{WX + 4},{WY + 22} M{WX + WW - 4},{WY + WH} L{WX + WW - 4},{WY + 22}", "none", "#2E2046", 2.0))
    BLY = WY + 10                                                                 # the bell's pivot (its yoke)
    g.append(rect(WX + 2, BLY - 3, WW - 4, 5, WOOD2, INK, 1.3))
    g.append(line(TCX, BLY + 2, TCX, BLY + 7, INK, 2.2))
    bell = (f"M{TCX-8},{BLY+9} C{TCX-8},{BLY+5} {TCX-4},{BLY+4} {TCX},{BLY+4} C{TCX+4},{BLY+4} {TCX+8},{BLY+5} {TCX+8},{BLY+9} "
            f"L{TCX+10},{BLY+26} Q{TCX+12},{BLY+30} {TCX+16},{BLY+31} L{TCX-16},{BLY+31} Q{TCX-12},{BLY+30} {TCX-10},{BLY+26} Z")
    g.append(path(bell, GOLD2, INK, LM))
    g.append(path(f"M{TCX-5},{BLY+10} Q{TCX-6},{BLY+20} {TCX-8},{BLY+27}", "none", "#FFF1C0", 1.6, 'opacity="0.75"'))
    g.append(line(TCX - 14, BLY + 28, TCX + 14, BLY + 28, "#A07A2E", 1.2, 'opacity="0.8"'))
    g.append(dot(TCX + 1, BLY + 33.5, 3.2, GOLD2, 1.1))
    g.append(rect(TX0 - 3, WY + WH, TX1 - TX0 + 6, 8, GST3, INK, LM))           # the sill, run on round the tower as a band
    g.append(line(TX0, WY + WH + 2, TX1, WY + WH + 2, "#A08E9C", 1.2, 'opacity="0.6"'))
    # the banner: an iron rod with knobs, the pink cloth with a swallowtail, gold edging and the heart
    BY = PT + 30; BL, BR = TX0 + 18, TX1 - 18; BBOT = BY + 128
    g.append(line(BL - 10, BY, BR + 10, BY, INK, 3.4))
    for kx in (BL - 12, BR + 12):
        g.append(f'<circle cx="{kx}" cy="{BY}" r="3.6" fill="{GOLD2}" stroke="{INK}" stroke-width="1.2"/>')
    ban = f"M{BL},{BY} L{BR},{BY} L{BR},{BBOT} L{TCX},{BBOT-22} L{BL},{BBOT} Z"
    g.append(path(ban, PINK, INK, LB))
    g.append(path(f"M{BL+6},{BY+4} L{BR-6},{BY+4} L{BR-6},{BBOT-10} L{TCX},{BBOT-30} L{BL+6},{BBOT-10} Z", "none", GOLD2, 1.6, 'opacity="0.9"'))
    for fx in (BL + 18, BR - 16):
        g.append(line(fx, BY + 8, fx, BBOT - 26, "#B8325F", 2.2, 'opacity="0.55"'))
    g.append(heart(TCX, BY + 54, 34, GOLD, 1.8))
    g.append(path(f"M{TCX-9},{BY+47} Q{TCX-7},{BY+43} {TCX-3},{BY+44}", "none", "#FFFFFF", 1.6, 'opacity="0.6"'))
    for (lx, ly) in ((BL + 2, BY + 2), (BR - 2, BY + 2)):
        g.append(f'<circle cx="{lx}" cy="{ly}" r="2.4" fill="{GOLD2}" stroke="{INK}" stroke-width="1"/>')
    # the gatekeeper's window, low on the tower: lit, two bars, a stone sill and a box of pink flowers
    KX, KY, KW, KH = TCX - 16, G - 176, 32, 46
    g.append(path(arch_d(KX - 6, KY - 6, KW + 12, KH + 6), GST3, INK, LB))
    g.append(path(arch_d(KX, KY, KW, KH), "url(#gatewin)", INK, LB))
    g.append(path(f"M{KX + 5},{KY + KH - 2} C{KX + 7},{KY + KH - 14} {KX + 13},{KY + KH - 18} {KX + 16},{KY + KH - 18} C{KX + 12},{KY + KH - 24} {KX + 14},{KY + KH - 30} {KX + 18},{KY + KH - 30} C{KX + 23},{KY + KH - 30} {KX + 24},{KY + KH - 24} {KX + 20},{KY + KH - 18} C{KX + 25},{KY + KH - 18} {KX + 29},{KY + KH - 12} {KX + 29},{KY + KH - 2} Z", "#2A1838", "none", 0, 'opacity="0.8"'))
    g.append(path(f"M{KX + 13},{KY + KH - 27} L{KX + 12.5},{KY + KH - 36} L{KX + 17.5},{KY + KH - 30} Z M{KX + 18.5},{KY + KH - 30} L{KX + 23.5},{KY + KH - 36} L{KX + 23},{KY + KH - 27} Z", "#2A1838", "none", 0, 'opacity="0.8"'))
    for bx in (KX + 11, KX + 21):
        g.append(line(bx, KY + 3, bx, KY + KH, IRON, 2.2))
    g.append(line(KX + 5, KY + 10, KX + 5, KY + KH - 4, "#FFFFFF", 1.3, 'opacity="0.35"'))
    g.append(rect(KX - 8, KY + KH, KW + 16, 6, GST3, INK, LM))
    FBX, FBY = KX - 6, KY + KH + 6
    for (fx, fy, fc) in ((FBX + 4, FBY - 2, PINK), (FBX + 11, FBY - 5, LAV), (FBX + 18, FBY - 3, PINK), (FBX + 26, FBY - 6, PINK), (FBX + 33, FBY - 2, LAV), (FBX + 40, FBY - 4, PINK)):
        g.append(leaf(fx - 4, fy + 4, -30, 0.7, "#3F6B3A"))
        g.append(dot(fx, fy, 3.4, fc))
    g.append(rect(FBX, FBY, KW + 12, 11, WOOD, INK, LM))
    g.append(line(FBX + 3, FBY + 3, FBX + KW + 9, FBY + 3, "#8A5E70", 1.2, 'opacity="0.7"'))
    # ---- lanterns on brackets either side of the arch ----
    LY = G - 206
    lamps = []
    # left: on the outer pier; right: on the pier between the arch and the tower
    g.extend(bracket(26, LY, 15, 1.0)); g.extend(lantern(15, LY + 28, 1.0, "gatelamp", ring=False)); lamps.append((15, LY + 28))
    g.extend(bracket(184, LY, 198, 1.0)); g.extend(lantern(198, LY + 28, 1.0, "gatelamp", ring=False)); lamps.append((198, LY + 28))
    # ---- ivy over the left corner, grass at the foot ----
    for (stem, lv) in (([(8, PT - 26), (13, PT - 6), (10, PT + 26), (15, PT + 62), (11, PT + 92), (14, PT + 112)],
                         [(5, PT - 24, 200), (13, PT - 14, -20), (8, PT - 2, 150), (15, PT + 10, 10), (7, PT + 22, 170), (14, PT + 36, 30),
                          (9, PT + 52, 160), (17, PT + 66, 20), (10, PT + 82, 150), (16, PT + 96, 40), (12, PT + 110, 120)]),
                        ([(30, PT - 26), (34, PT - 8), (28, PT + 18), (32, PT + 44)],
                         [(29, PT - 22, 160), (36, PT - 10, 10), (27, PT + 4, 170), (35, PT + 18, 30), (28, PT + 32, 150), (33, PT + 44, 60)])):
        g.append(path(smooth_open(stem), "none", "#223522", 2.4))
        for i, (x, y, a) in enumerate(lv):
            ca = math.cos(math.radians(a))
            if ca < 0: x = max(x, 3 + 13.6 * -ca)              # keep every leaf inside the picture's left edge
            g.append(leaf(x, y, a, 1.05, ("#3F6B3A", "#355C33", "#4A7A40")[i % 3]))
    for (tx, s) in ((34, 1.0), (178, 0.8), (222, 1.1), (300, 0.9)):
        g.append(tuft(tx, G + 1, s))
    a = ANCHORS.setdefault("gate", {})
    a.update({"name": "gate", "W": W, "H": H, "G": G, "kind": "building",
              "windows": [{"x": KX, "y": KY, "w": KW, "h": KH, "note": "the gatekeeper's window, a cat silhouette in it"}],
              "bell": {"x": TCX, "y": BLY, "w": 32, "h": 34, "note": "the belfry's bell, pivot at (x,y): swing it when a new pet walks in"},
              "doors": [{"x": AX, "y": AT, "w": AW, "h": AH, "note": "the passage: pets appear from here (walk out toward +x)"}],
              "light": [{"x": ACX, "y": LCY, "what": "lantern in the passage: warm glow + slow flicker"}]
                       + [{"x": x, "y": y, "what": "bracket lantern: warm glow + flicker"} for x, y in lamps],
              "flag": [{"x": TCX + 1, "y": RTIP - 34, "w": 43, "h": 18, "what": "pennant on the spire (optional gentle flutter, pivot at its left edge)"},
                       {"x": BL, "y": BY, "w": BR - BL, "h": BBOT - BY, "what": "banner (optional sway, pivot at the rod)"}],
              "spawn": {"x": ACX, "y": G, "note": "centre of the passage floor"}})
    save("gate", W, H, g, defs)

# ---------------- the item shop ----------------
WINE  = "#5A2C47"    # the shop's painted wood (BRICK)
WINE2 = "#47223A"
WINE3 = "#6E3A58"    # raised panels, casings
WINED = "#331527"
TEALD = "#23505A"    # the door
AWL   = "#B58BCB"    # awning stripes
AWP   = "#6A3F8A"

def _T(pts, ox, oy, k, cx0=0, cy0=0):
    return [(ox + (x - cx0) * k, oy + (y - cy0) * k) for x, y in pts]

def witch_on_stand(cx, base):
    """The witch hat (props.witchhat's cone and brim, smaller) on a brass hat stand."""
    g = [ellipse(cx, base - 2, 14, 3.6, GOLD2, INK, LM)]
    g.append(rect(cx - 2, base - 50, 4, 48, GOLD2, INK, 1.3))
    g.append(line(cx - 0.6, base - 48, cx - 0.6, base - 6, "#FFF1C0", 1.0, 'opacity="0.6"'))
    k = 0.5; ox, oy = cx, base - 54
    T = lambda pts: _T(pts, ox, oy, k, 58, 108)
    cone = [(34, 106), (36, 82), (42, 58), (52, 36), (65, 18), (77, 7), (88, 4), (96, 9), (96, 16), (89, 16), (80, 21), (72, 40), (67, 66), (69, 106)]
    g.append(path(smooth_closed(T(cone), 0.5), PUPIL, INK, LM))
    g.append(path(smooth_open(T([(44, 62), (51, 44), (62, 30)])), "none", LAV, 1.6, 'opacity="0.35"'))
    g.append(path(smooth_closed(T([(30, 103), (32, 85), (73, 81), (77, 99)]), 0.45), INK, INK, 1.2))
    for sx, sy in ((38, 95), (45, 93), (63, 90), (70, 89)):
        x, y = T([(sx, sy)])[0]
        g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1.3" fill="{LAV}" stroke="none"/>')
    bx, by = T([(54.4, 90.4)])[0]
    g.append(f'<rect x="{bx-3.6:.1f}" y="{by-3.4:.1f}" width="7.2" height="6.8" fill="none" stroke="{GOLD}" stroke-width="1.4"/>')
    g.append(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="1.7" fill="{RUBY}" stroke="none"/>')
    brim = [(6, 108), (18, 100), (34, 96), (54, 94), (74, 95), (92, 99), (110, 106), (102, 114), (86, 120), (62, 123), (38, 121), (18, 116)]
    g.append(path(smooth_closed(T(brim), 0.5), HAIR, INK, LM))
    g.append(path(smooth_open(T([(22, 107), (54, 101), (96, 108)])), "none", STRAND, 1.4, 'opacity="0.7"'))
    return g

def pumpkin_on_box(cx, base):
    """The pumpkin head, carved and lit, on a gold-edged box."""
    g = [rect(cx - 21, base - 22, 42, 22, WINE3, INK, LM)]
    g.append(line(cx - 18, base - 19, cx + 18, base - 19, GOLD2, 1.3, 'opacity="0.8"'))
    py = base - 44
    for (dx, rx, ry, f) in ((-11, 12, 19, PUMPKIN3), (11, 12, 19, PUMPKIN3), (0, 14, 21, PUMPKIN)):
        g.append(ellipse(cx + dx, py, rx, ry, f, INK, LM))
    g.append(path(f"M{cx},{py-20} Q{cx-3},{py} {cx},{py+20}", "none", PUMPKIN2, 1.6, 'opacity="0.5"'))
    for (ex, d) in ((-8, 1), (8, -1)):
        g.append(path(poly([(cx + ex - 5*d, py - 4), (cx + ex + 3*d, py - 10), (cx + ex + 4*d, py - 1)]), FLAME, INK, 1.2))
    g.append(path(poly([(cx - 12, py + 5), (cx - 8, py + 8), (cx - 5, py + 5), (cx - 2, py + 9), (cx + 2, py + 5), (cx + 5, py + 9), (cx + 8, py + 5), (cx + 12, py + 5), (cx + 8, py + 13), (cx, py + 15), (cx - 8, py + 13)]), FLAME, INK, 1.2))
    g.append(path(smooth_closed([(cx - 3, py - 19), (cx - 4, py - 26), (cx - 1, py - 30), (cx + 3, py - 28), (cx + 2, py - 19)], 0.4), MOSS, INK, 1.3))
    g.append(path(f"M{cx+2},{py-25} Q{cx+10},{py-31} {cx+13},{py-25} Q{cx+8},{py-22} {cx+2},{py-23} Z", GREEN, INK, 1.1))
    g.append(ellipse(cx - 7, py - 12, 3.4, 1.6, "#FFFFFF", "none", 0, f'opacity="0.3" transform="rotate(-40 {cx-7} {py-12})"'))
    return g

def wig_on_head(cx, base):
    """A mannequin head on a stand wearing the emo hair (props.emohair's sweep)."""
    g = [ellipse(cx, base - 2, 13, 3.4, GOLD2, INK, LM)]
    g.append(rect(cx - 2, base - 26, 4, 24, GOLD2, INK, 1.3))
    g.append(path(poly([(cx - 7, base - 26), (cx + 7, base - 26), (cx + 5, base - 38), (cx - 5, base - 38)]), "#D9C4BC", INK, LM))
    g.append(ellipse(cx, base - 58, 16, 21, "#E6D3C8", INK, LM))
    g.append(path(f"M{cx-6},{base-52} Q{cx-9},{base-48} {cx-6},{base-45}", "none", "#B89C92", 1.3))
    g.append(path(f"M{cx-11},{base-56} Q{cx-8},{base-58} {cx-5},{base-56}", "none", "#B89C92", 1.2))
    k = 0.4
    T = lambda pts: _T(pts, cx + 4, base - 83, k, 68, 5)
    hair = [(10, 58), (16, 34), (30, 16), (52, 6), (80, 5), (104, 12), (120, 26), (128, 44), (130, 62), (122, 58), (118, 76), (111, 62),
            (104, 94), (97, 72), (88, 104), (81, 78), (70, 100), (64, 78), (54, 92), (48, 74), (38, 82), (32, 66), (20, 70)]
    # the right side hangs lower: stretch the lower half of the sweep over the eye
    hd = smooth_closed(T(hair), 0.22)
    g.append(path(hd, HAIR, INK, LM))
    for (x0, y0, L) in ((40, 14, 70), (58, 8, 84), (76, 6, 90), (94, 10, 78)):
        x1, y1 = x0 + L * 0.16, y0 + L
        g.append(path(smooth_open(T([(x0, y0), ((x0 + x1) / 2 - 4, (y0 + y1) / 2), (x1, y1)])), "none", STRAND, 1.3))
    g.append(path(smooth_open(T([(34, 22), (56, 12), (84, 11)])), "none", PURPLE, 1.6, 'opacity="0.8"'))
    return g

def bandage_roll(cx, base):
    """A roll of mummy linen on its side on a little round table, its loose end hanging over the edge."""
    g = [ellipse(cx, base - 2, 11, 3, GOLD2, INK, LM)]
    g.append(rect(cx - 2, base - 32, 4, 30, GOLD2, INK, 1.3))
    ty = base - 34
    g.append(ellipse(cx, ty, 20, 4.6, WINE3, INK, LM))
    g.append(line(cx - 16, ty - 1, cx + 14, ty - 1, GOLD2, 1.1, 'opacity="0.7"'))
    # the loose end first (behind the roll): off the roll's top, over the table's edge and hanging, frayed
    g.extend(strip([(cx + 2, ty - 22), (cx + 14, ty - 18), (cx + 20, ty - 4), (cx + 19, ty + 10), (cx + 21, ty + 24)], 8, 0.5, LINEN, True, 1.2))
    g.append(path(f"M{cx+17},{ty+24} L{cx+16.5},{ty+28} M{cx+20},{ty+25} L{cx+20.5},{ty+29} M{cx+23},{ty+24} L{cx+24},{ty+27.5}", "none", LINEN2, 1.1))
    # the roll: a short cylinder lying down, its near end the spiral
    rx0, rx1, rcy, rr = cx - 10, cx + 10, ty - 13, 11
    g.append(path(f"M{rx0},{rcy - rr} L{rx1},{rcy - rr} C{rx1 + 5},{rcy - rr} {rx1 + 5},{rcy + rr} {rx1},{rcy + rr} L{rx0},{rcy + rr} Z", LINEN2, INK, LM))
    for yy in (rcy - 5, rcy + 3):
        g.append(line(rx0 + 2, yy, rx1 + 2, yy, "#B8A983", 1.1))
    g.append(ellipse(rx0, rcy, 6.2, rr, LINEN, INK, LM))
    sp = curl_pts(rx0, rcy, 8.6, -90, 2.2, 1, 22)
    g.append(path(smooth_open([(x0 * 0.72 + rx0 * 0.28, y) for x0, y in sp]), "none", "#B8A983", 1.2))
    return g

def framed(x, y, w, h, kind):
    """A little framed picture for the shop's back wall: 'spooky' (the haunted room: moon, bat, a stone) or
    'corridor' (the Backrooms: a yellow corridor running away)."""
    g = [rect(x, y, w, h, GOLD2, INK, LM)]
    ix, iy, iw, ih = x + 4, y + 4, w - 8, h - 8
    if kind == "spooky":
        g.append(rect(ix, iy, iw, ih, "#2B1840", INK, 1.0))
        g.append(f'<circle cx="{ix + iw*0.7:.1f}" cy="{iy + ih*0.32:.1f}" r="{ih*0.2:.1f}" fill="{GOLD}" stroke="none"/>')
        g.append(path(f"M{ix},{iy+ih} L{ix},{iy+ih*0.78} Q{ix+iw*0.5},{iy+ih*0.6} {ix+iw},{iy+ih*0.8} L{ix+iw},{iy+ih} Z", "#140B24", "none", 0))
        tx = ix + iw * 0.28; tyy = iy + ih * 0.52
        g.append(path(f"M{tx-3.5},{iy+ih*0.78} L{tx-3.5},{tyy+3} Q{tx},{tyy-2} {tx+3.5},{tyy+3} L{tx+3.5},{iy+ih*0.76} Z", "#6B5A7E", "none", 0))
        bx, by = ix + iw * 0.42, iy + ih * 0.3
        g.append(path(f"M{bx-6},{by} Q{bx-3},{by-3} {bx-1},{by+1} L{bx},{by-1} L{bx+1},{by+1} Q{bx+3},{by-3} {bx+6},{by} Q{bx+3},{by+1} {bx},{by+3} Q{bx-3},{by+1} {bx-6},{by} Z", INK, "none", 0))
    else:
        g.append(rect(ix, iy, iw, ih, "#D9BE58", INK, 1.0))
        cx, cy = ix + iw * 0.5, iy + ih * 0.5; ew, eh = iw * 0.28, ih * 0.34
        g.append(path(poly([(ix, iy + ih), (ix + iw, iy + ih), (cx + ew/2, cy + eh/2), (cx - ew/2, cy + eh/2)]), "#A88E3E", "none", 0))
        g.append(path(poly([(ix, iy), (ix + iw, iy), (cx + ew/2, cy - eh/2), (cx - ew/2, cy - eh/2)]), "#EFE2A4", "none", 0))
        g.append(rect(cx - ew/2, cy - eh/2, ew, eh, "#8C7430", "none", 0))
        g.append(path(f"M{ix},{iy} L{cx-ew/2},{cy-eh/2} M{ix+iw},{iy} L{cx+ew/2},{cy-eh/2} M{ix},{iy+ih} L{cx-ew/2},{cy+eh/2} M{ix+iw},{iy+ih} L{cx+ew/2},{cy+eh/2}", "none", "#7A6428", 0.9))
        g.append(rect(cx - 3, iy + 1.5, 6, 2, "#FFFBE8", "none", 0))
    g.append(rect(ix, iy, iw, ih, "none", INK, 1.0))
    return g

def hatboxes(cx, base):
    """Two round striped hat boxes, stacked, a bow on top."""
    g = []
    for (w, h, y, a, b) in ((36, 24, base, PINK, "#F4A6C3"), (28, 19, base - 24, AWL, LAV)):
        x = cx - w / 2
        g.append(rect(x, y - h, w, h, a, INK, LM))
        g.append(ticks([(x + i, y - h + 5, x + i, y - 1) for i in range(6, int(w), 6)], b, 2.6, 0.9))
        g.append(rect(x - 2, y - h - 1, w + 4, 6, b, INK, 1.3))
    g.append(path(f"M{cx},{base-47} Q{cx-7},{base-53} {cx-8},{base-47} Q{cx-7},{base-43} {cx},{base-46} Q{cx+7},{base-43} {cx+8},{base-47} Q{cx+7},{base-53} {cx},{base-47} Z", PINK, INK, 1.1))
    return g

def cat_silhouette(cx, base, s=1.0, fill="#2A1530", fringe=True):
    """A cat sitting with its back to us, seen through a lit window: ears, the emo fringe's bump, the tail round
    its feet."""
    P = lambda pts: [(cx + x * s, base + y * s) for x, y in pts]
    body = P([(-12, 0), (-13, -12), (-9, -24), (-7, -30), (-10, -38), (-9, -46), (-5, -50), (5, -50), (9, -46), (10, -38), (7, -30), (9, -24), (13, -12), (12, 0)])
    g = [path(smooth_closed(body, 0.45), fill, "none", 0)]
    g.append(path(poly(P([(-9, -43), (-10, -57), (-2, -49)])), fill, "none", 0))
    g.append(path(poly(P([(9, -43), (10, -57), (2, -49)])), fill, "none", 0))
    if fringe:
        g.append(path(smooth_closed(P([(-10, -44), (-6, -52), (2, -52), (8, -46), (12, -36), (6, -40)]), 0.4), fill, "none", 0))
    g.append(path(smooth_open(P([(10, -2), (20, -4), (24, -12), (20, -20)])), "none", fill, 4.2 * s))
    return g

def shop():
    """The item shop: a two-storey boutique in wine-red painted wood with gold trim. A bay window at street level
    shows the real items of the game on stands, lit warm (the witch hat on a hat stand, the carved pumpkin head, a
    roll of mummy linen, the emo hair on a mannequin head, the Spooky and the Backrooms as two framed pictures, and a
    stack of hat boxes) under a lavender-and-purple striped awning with a scalloped edge. A teal door with a heart in
    its transom and a bell over it; upstairs a cat sits in a lit window and hat boxes wait in the other; a hanging
    sign on an iron bracket (blank: the site writes ITEM SHOP); a curved gable with a round window and a crown."""
    W, H = 500, 498; G = H - 16
    g = []
    defs = (lit_glass("shopback", "#FFE2A2", "#E9A061") + lit_glass("shopwin", "#FFDF9C", "#EF9C5A")
            + lit_glass("shopdoor", "#FFD98C", "#E9965A"))
    X0, X1 = 12, 488
    TOP = G - 386
    # ---- the wall ----
    g.append(poly_raw([(X0, TOP), (X1, TOP), (X1, G), (X0, G)], WINE))
    g.append(ticks([(x, TOP + 3, x, G - 290) for x in range(X0 + 14, X1, 14)], WINE2, 1.6, 0.9, 3))
    g.append(poly_raw([(X0, G - 290), (X1, G - 290), (X1, G - 284), (X0, G - 284)], WINED, 0.6))
    # ---- the gable, with a round lit window and a crown ----
    GB = G - 398; GCX = 250
    gp = [(150, GB), (156, GB - 18), (178, GB - 26), (196, GB - 30), (206, GB - 44), (228, GB - 54), (250, GB - 57), (272, GB - 54), (294, GB - 44), (304, GB - 30), (322, GB - 26), (344, GB - 18), (350, GB)]
    gd = smooth_open(gp, 0.5) + " Z"
    g.append(path(gd, WINE, INK, LB))
    gi = [(160, GB), (164, GB - 13), (182, GB - 20), (200, GB - 24), (210, GB - 37), (230, GB - 46), (250, GB - 49), (270, GB - 46), (290, GB - 37), (300, GB - 24), (318, GB - 20), (336, GB - 13), (340, GB)]
    g.append(path(smooth_open(gi, 0.5), "none", GOLD2, 1.6, 'opacity="0.9"'))
    g.append(f'<circle cx="{GCX}" cy="{GB - 24}" r="17" fill="{WINE3}" stroke="{INK}" stroke-width="{LB}"/>')
    g.append(f'<circle cx="{GCX}" cy="{GB - 24}" r="12" fill="url(#shopwin)" stroke="{INK}" stroke-width="{LM}"/>')
    g.append(path(f"M{GCX},{GB-36} L{GCX},{GB-12} M{GCX-12},{GB-24} L{GCX+12},{GB-24}", "none", INK, 1.4))
    cy0 = GB - 57
    crown = [(GCX - 11, cy0 - 1), (GCX - 13, cy0 - 13), (GCX - 6, cy0 - 7), (GCX, cy0 - 17), (GCX + 6, cy0 - 7), (GCX + 13, cy0 - 13), (GCX + 11, cy0 - 1)]
    g.append(path(poly(crown), GOLD2, INK, LM))
    g.append(f'<circle cx="{GCX}" cy="{cy0 - 5}" r="2.2" fill="{RUBY}" stroke="{INK}" stroke-width="0.9"/>')
    for (bx, by) in ((GCX - 13, cy0 - 14), (GCX, cy0 - 18), (GCX + 13, cy0 - 14)):
        g.append(f'<circle cx="{bx}" cy="{by}" r="2" fill="{GOLD}" stroke="{INK}" stroke-width="0.9"/>')
    # ---- the cornice with dentils, and iron cresting along the flat roof either side ----
    spikes = []
    for x in list(range(10, 150, 11)) + list(range(354, 492, 11)):
        spikes.append(f"M{x-3},{GB} L{x},{GB-10} L{x+3},{GB} Z")
    g.append(path(" ".join(spikes), IRON, INK, 1.2))
    g.append(line(8, GB - 1, 150, GB - 1, INK, 2.2)); g.append(line(350, GB - 1, 492, GB - 1, INK, 2.2))
    g.append(rect(4, GB, 492, 12, WINED, INK, LB))
    g.append(line(8, GB + 3, 492, GB + 3, GOLD2, 1.4, 'opacity="0.85"'))
    g.append('<g fill="%s" stroke="%s" stroke-width="1">' % (WINE3, INK) + "".join(
        f'<polygon points="{x},{GB+12} {x+5},{GB+12} {x+5},{GB+18} {x},{GB+18}"/>' for x in range(12, 488, 11)) + '</g>')
    # ---- upstairs: the cat's window, the hat-box window, the hanging sign ----
    UY, UH, UW = G - 372, 70, 76
    for (ux, kind) in ((64, "cat"), (212, "boxes")):
        g.append(rect(ux - 7, UY - 9, UW + 14, 8, WINE3, INK, LM))
        g.append(line(ux - 4, UY - 7, ux + UW + 4, UY - 7, GOLD2, 1.2, 'opacity="0.8"'))
        g.append(rect(ux - 5, UY - 1, UW + 10, UH + 2, WINE3, INK, LM))
        g.append(rect(ux, UY, UW, UH, "url(#shopwin)", INK, LB))
        cl = f"shopu{ux}"
        g.append(f'<clipPath id="{cl}">' + raw(f'<rect x="{ux}" y="{UY}" width="{UW}" height="{UH}"/>', 20) + '</clipPath>')
        g.append(f'<g clip-path="url(#{cl})">')
        if kind == "cat":
            g.extend(cat_silhouette(ux + UW * 0.5 - 2, UY + UH - 4, 0.9))
            curt = "#B8416E"
        else:
            g.extend(hatboxes(ux + UW * 0.56, UY + UH - 2))
            curt = "#7E4C9E"
        for side in (0, 1):
            x0 = ux if side == 0 else ux + UW
            d = 1 if side == 0 else -1
            g.append(path(f"M{x0},{UY} L{x0 + d*20},{UY} C{x0 + d*16},{UY + 22} {x0 + d*8},{UY + 34} {x0 + d*5},{UY + 40} C{x0 + d*8},{UY + 50} {x0 + d*9},{UY + 60} {x0 + d*12},{UY + UH} L{x0},{UY + UH} Z", curt, INK, 1.3))
            g.append(path(f"M{x0 + d*12},{UY + 4} C{x0 + d*10},{UY + 20} {x0 + d*6},{UY + 30} {x0 + d*4},{UY + 38}", "none", INK, 1.0, 'opacity="0.35"'))
            g.append(ellipse(x0 + d*5, UY + 40, 3.2, 2.2, GOLD2, INK, 1.0))
        g.append(rect(ux, UY, UW, 9, curt, INK, 1.2))
        g.append('</g>')
        g.append(rect(ux, UY, UW, UH, "none", INK, LB))
        g.append(rect(ux - 8, UY + UH, UW + 16, 7, WINE3, INK, LM))
        g.append(line(ux - 6, UY + UH + 1.5, ux + UW + 6, UY + UH + 1.5, GOLD2, 1.2, 'opacity="0.85"'))
    # the hanging sign: a bracket off the wall on the right, two chains, the board (blank), a crown on top
    SY = G - 372
    g.extend(bracket(478, SY, 334, 1.1))
    SBX, SBY, SBW, SBH = 340, G - 350, 128, 48
    for chx in (SBX + 12, SBX + SBW - 12):
        g.append(path(f"M{chx},{SY + 2} L{chx},{SBY}", "none", INK, 1.4))
        for k in range(3):
            g.append(ellipse(chx, SY + 6 + k * 6.5, 1.6, 3.0, "none", INK, 1.1))
    g.append(rrect(SBX, SBY, SBW, SBH, 8, WINED, INK, LB))
    g.append(rrect(SBX + 5, SBY + 5, SBW - 10, SBH - 10, 5, "none", GOLD2, 1.6, 'opacity="0.9"'))
    ccx = SBX + SBW / 2; ccy = SBY - 1
    g.append(path(poly([(ccx - 9, ccy), (ccx - 11, ccy - 11), (ccx - 5, ccy - 6), (ccx, ccy - 14), (ccx + 5, ccy - 6), (ccx + 11, ccy - 11), (ccx + 9, ccy)]), GOLD2, INK, 1.4))
    for (bx, by) in ((ccx - 11, ccy - 12), (ccx, ccy - 15), (ccx + 11, ccy - 12)):
        g.append(f'<circle cx="{bx}" cy="{by}" r="1.7" fill="{GOLD}" stroke="{INK}" stroke-width="0.8"/>')
    # ---- the fascia: gold lines and a row of studs like the cat's collar ----
    FY0, FY1 = G - 284, G - 254
    g.append(rect(X0 - 4, FY0, X1 - X0 + 8, FY1 - FY0, WINED, INK, LB))
    g.append(line(X0, FY0 + 4, X1, FY0 + 4, GOLD2, 1.5, 'opacity="0.9"'))
    g.append(line(X0, FY1 - 4, X1, FY1 - 4, GOLD2, 1.5, 'opacity="0.9"'))
    g.append('<g stroke="%s" stroke-width="0.9">' % INK + "".join(
        f'<path d="M{x-3.4},{FY0 + 19} L{x},{FY0 + 10} L{x+3.4},{FY0 + 19} Z" fill="{LAV2}"/>' for x in range(X0 + 12, X1 - 4, 16)) + '</g>')
    # ---- pilasters ----
    for (px0, px1) in ((6, 30), (470, 494)):
        g.append(rect(px0, FY1, px1 - px0, G - 8 - FY1, WINE2, INK, LB))
        g.append(rect(px0 + 5, FY1 + 18, px1 - px0 - 10, G - 8 - FY1 - 44, "none", GOLD2, 1.3, 'opacity="0.85"'))
        g.append(rect(px0 - 3, FY1, px1 - px0 + 6, 10, WINE3, INK, LM))
        g.append(line(px0 - 1, FY1 + 7, px1 + 1, FY1 + 7, GOLD2, 1.2))
    # ---- the bay window ----
    BX0, BX1 = 38, 336; BY0, BY1 = G - 214, G - 52; M1, M2 = 86, 288
    g.append(rect(BX0 - 6, BY0 - 6, BX1 - BX0 + 12, BY1 - BY0 + 10, WINE3, INK, LB))
    g.append(rect(BX0, BY0, BX1 - BX0, BY1 - BY0, "url(#shopback)", INK, LB))
    g.append(f'<clipPath id="shopbay">' + raw(f'<rect x="{BX0}" y="{BY0}" width="{BX1 - BX0}" height="{BY1 - BY0}"/>', 20) + '</clipPath>')
    g.append('<g clip-path="url(#shopbay)">')
    # faint wallpaper hearts, then the things
    for (hx, hy) in ((110, BY0 + 30), (160, BY0 + 60), (214, BY0 + 34), (268, BY0 + 64), (140, BY0 + 96), (300, BY0 + 30), (60, BY0 + 120), (320, BY0 + 110)):
        g.append(path(heart_d(hx, hy, 9), "#E8935A", "none", 0, 'opacity="0.55"'))
    g.extend(framed(46, BY0 + 14, 34, 28, "spooky"))
    g.extend(framed(46, BY0 + 52, 34, 28, "corridor"))
    for (fx, fy) in ((63, BY0 + 14), (63, BY0 + 52)):
        g.append(path(f"M{fx-10},{fy+1} L{fx},{fy-8} L{fx+10},{fy+1}", "none", INK, 1.0, 'opacity="0.6"'))
    PL = BY1 - 14
    g.append(rect(BX0 - 2, PL, BX1 - BX0 + 4, 16, "#7A2A4A", INK, LM))
    g.append(line(BX0, PL + 2, BX1, PL + 2, GOLD2, 1.4))
    g.extend(hatboxes(63, PL))
    g.extend(witch_on_stand(128, PL))
    g.extend(pumpkin_on_box(190, PL))
    g.extend(wig_on_head(248, PL))
    g.extend(bandage_roll(307, PL))
    # the side panes are the bay's angled faces: a touch of reflection over them
    for (a, b) in ((BX0, M1), (M2, BX1)):
        g.append(poly_raw([(a, BY0), (b, BY0), (b, BY1), (a, BY1)], "#3A1830", 0.18))
        g.append(line(a + 8, BY0 + 20, a + 22, BY0 + 58, "#FFFFFF", 1.6, 'opacity="0.35"'))
    g.append(line(M1 + 14, BY0 + 18, M1 + 30, BY0 + 52, "#FFFFFF", 1.8, 'opacity="0.3"'))
    g.append(line(M1 + 22, BY0 + 18, M1 + 34, BY0 + 42, "#FFFFFF", 1.2, 'opacity="0.25"'))
    g.append('</g>')
    g.append(rect(BX0, BY0, BX1 - BX0, BY1 - BY0, "none", INK, LB))
    for mx in (M1, M2):
        g.append(rect(mx - 3.5, BY0, 7, BY1 - BY0, WINE3, INK, LM))
        g.append(line(mx - 0.5, BY0 + 2, mx - 0.5, BY1 - 2, GOLD2, 1.1, 'opacity="0.85"'))
    # the stallriser under the bay: panels, the side ones in shadow (the bay's angled faces)
    SR0, SR1 = BY1 + 4, G - 8
    g.append(rect(BX0 - 6, SR0, BX1 - BX0 + 12, SR1 - SR0, WINE2, INK, LB))
    for (a, b, tint) in ((BX0, M1, 0.28), (M1, M2, 0.0), (M2, BX1, 0.28)):
        g.append(rect(a + 5, SR0 + 7, b - a - 10, SR1 - SR0 - 13, WINE3, INK, 1.3))
        g.append(line(a + 8, SR0 + 10, b - 8, SR0 + 10, GOLD2, 1.1, 'opacity="0.7"'))
        if tint: g.append(poly_raw([(a, SR0), (b, SR0), (b, SR1), (a, SR1)], "#1A0812", tint))
    for mx in (M1, M2):
        g.append(line(mx, SR0, mx, SR1, INK, LM))
    # ---- the awning: stripes converging, scallops, a rod along its top ----
    AT_, AB_, SCB = G - 258, G - 226, G - 214
    ax0t, ax1t, ax0b, ax1b = BX0 - 2, BX1 + 2, BX0 - 12, BX1 + 12
    n = 15
    for i in range(n):
        u0, u1 = i / n, (i + 1) / n
        xt0 = ax0t + (ax1t - ax0t) * u0; xt1 = ax0t + (ax1t - ax0t) * u1
        xb0 = ax0b + (ax1b - ax0b) * u0; xb1 = ax0b + (ax1b - ax0b) * u1
        col = AWL if i % 2 == 0 else AWP
        xm = (xb0 + xb1) / 2
        g.append(path(f"M{xt0:.1f},{AT_} L{xt1:.1f},{AT_} L{xb1:.1f},{AB_} Q{xb1:.1f},{SCB} {xm:.1f},{SCB} Q{xb0:.1f},{SCB} {xb0:.1f},{AB_} Z", col, INK, 1.3))
    g.append(path(f"M{ax0t},{AT_} L{ax1t},{AT_} L{ax1b},{AB_} L{ax0b},{AB_} Z", "none", INK, LB))
    g.append(line(ax0b + 2, AB_ - 3, ax1b - 2, AB_ - 3, "#FFFFFF", 1.2, 'opacity="0.25"'))
    g.append(rect(ax0t - 6, AT_ - 5, ax1t - ax0t + 12, 6, GOLD2, INK, LM))
    # ---- the door: a teal door, lit glass, a heart in the transom, the bell ----
    DX0, DX1 = 356, 440
    g.append(rect(DX0 - 8, FY1, DX1 - DX0 + 16, G - FY1, WINE3, INK, LB))
    g.append(line(DX0 - 4, FY1 + 4, DX0 - 4, G - 2, GOLD2, 1.2, 'opacity="0.8"'))
    g.append(line(DX1 + 4, FY1 + 4, DX1 + 4, G - 2, GOLD2, 1.2, 'opacity="0.8"'))
    TY0, TY1 = FY1 + 8, G - 200
    g.append(rect(DX0, TY0, DX1 - DX0, TY1 - TY0, "url(#shopdoor)", INK, LM))
    g.append(heart((DX0 + DX1) / 2, (TY0 + TY1) / 2 + 1, 26, PINK, 1.4))
    g.append(path(f"M{DX0},{(TY0+TY1)/2+1} L{(DX0+DX1)/2-12},{(TY0+TY1)/2+1} M{(DX0+DX1)/2+12},{(TY0+TY1)/2+1} L{DX1},{(TY0+TY1)/2+1}", "none", INK, 1.2))
    DT = G - 196
    g.append(rect(DX0, DT, DX1 - DX0, G - DT, TEALD, INK, LB))
    g.append(path(arch_d(DX0 + 12, DT + 12, DX1 - DX0 - 24, 84), "url(#shopdoor)", INK, LM))
    g.append(line(DX0 + 42, DT + 14, DX0 + 42, DT + 96, INK, 1.4))
    g.append(line(DX0 + 12, DT + 60, DX1 - 12, DT + 60, INK, 1.4))
    g.append(line(DX0 + 18, DT + 40, DX0 + 18, DT + 90, "#FFFFFF", 1.4, 'opacity="0.35"'))
    g.append(rect(DX0 + 12, DT + 110, DX1 - DX0 - 24, 62, "#1B3F48", INK, LM))
    g.append(line(DX0 + 15, DT + 113, DX1 - 15, DT + 113, "#3F7A84", 1.2, 'opacity="0.7"'))
    g.append(rect(DX0 + 4, G - 16, DX1 - DX0 - 8, 12, GOLD2, INK, LM))
    g.append(f'<circle cx="{DX1 - 12}" cy="{DT + 104}" r="4" fill="{GOLD2}" stroke="{INK}" stroke-width="1.2"/>')
    # the bell on a little curl over the door
    BLX = (DX0 + DX1) / 2
    g.append(path(smooth_open(curl_pts(BLX - 8, DT - 1, 5, 180, 0.9, -1)), "none", INK, 1.8))
    g.append(path(f"M{BLX-12},{DT-1} L{BLX},{DT-1} L{BLX},{DT+4}", "none", INK, 2.0))
    g.append(path(f"M{BLX-7},{DT+15} C{BLX-7},{DT+6} {BLX-4},{DT+4} {BLX},{DT+4} C{BLX+4},{DT+4} {BLX+7},{DT+6} {BLX+7},{DT+15} L{BLX+9},{DT+17} L{BLX-9},{DT+17} Z", GOLD2, INK, 1.3))
    g.append(f'<circle cx="{BLX}" cy="{DT+19}" r="2" fill="{GOLD2}" stroke="{INK}" stroke-width="1"/>')
    g.append(path(f"M{BLX-4},{DT+14} Q{BLX-4},{DT+8} {BLX-1},{DT+7}", "none", "#FFF3C4", 1.1, 'opacity="0.8"'))
    # ---- base and step ----
    g.append(rect(X0 - 8, G - 8, X1 - X0 + 16, 8, "#3B2230", INK, LM))
    g.append(rect(DX0 - 14, G - 1, DX1 - DX0 + 28, 9, STONE, INK, LM))
    g.append(rect(DX0 - 20, G + 7, DX1 - DX0 + 40, 8, STONE2, INK, LM))
    # the wall's own outline last
    g.append(path(f"M{X0},{GB + 12} L{X0},{G - 8} M{X1},{GB + 12} L{X1},{G - 8}", "none", INK, LB))
    ANCHORS["shop"] = {"name": "shop", "W": W, "H": H, "G": G, "kind": "building",
        "signs": [{"x": SBX + 8, "y": SBY + 8, "w": SBW - 16, "h": SBH - 16, "text": "ITEM SHOP", "style": "neon-gold",
                   "note": "hanging board; optional slow sway, pivot at its chains' tops y=%d" % SY}],
        "windows": [{"x": BX0, "y": BY0, "w": BX1 - BX0, "h": BY1 - BY0, "note": "the display"},
                    {"x": 64, "y": UY, "w": UW, "h": UH, "note": "cat silhouette"}, {"x": 212, "y": UY, "w": UW, "h": UH},
                    {"x": GCX - 12, "y": GB - 36, "w": 24, "h": 24, "note": "round gable window"},
                    {"x": DX0, "y": TY0, "w": DX1 - DX0, "h": TY1 - TY0, "note": "transom with the heart"}],
        "doors": [{"x": DX0, "y": DT, "w": DX1 - DX0, "h": G - DT}],
        "light": [{"x": 190, "y": PL - 44, "what": "pumpkin: a flicker in its carved face"},
                  {"x": BLX, "y": DT + 11, "what": "the bell: a tiny swing when a pet walks in"}]}
    save("shop", W, H, g, defs)

# ---------------- the Sleepy Inn ----------------
IWOOD  = "#684349"   # warm wood boards
IWOOD2 = "#4E3036"   # the boards' shadow lines
IWOOD3 = "#7E5558"
CREAM  = "#CDB791"   # window trims, bargeboards
CREAM2 = "#A8926E"
PORCH  = "#7C5446"   # posts and railing: a mid brown so a white cat still reads in front of it
PORCH2 = "#5C3C34"
PORCHH = "#9C7462"
DECK   = "#553632"
DOOR   = "#33406E"   # the inn's door: night blue

def crescent_d(cx, cy, r, turn=0.0):
    """A crescent moon: the outer circle, the bite a second circle offset to the upper right."""
    K = 0.5523
    # outer arc from the top round the left to the bottom, inner arc back up
    a = math.radians(turn); ca, sa = math.cos(a), math.sin(a)
    R = lambda x, y: (cx + x * ca - y * sa, cy + x * sa + y * ca)
    p = [R(0.35 * r, -0.94 * r), R(-0.95 * r, -0.6 * r), R(-1.05 * r, 0.55 * r), R(0.3 * r, 0.95 * r), R(-0.35 * r, 0.45 * r), R(-0.4 * r, -0.4 * r)]
    return (f"M{p[0][0]:.1f},{p[0][1]:.1f} C{p[1][0]:.1f},{p[1][1]:.1f} {p[2][0]:.1f},{p[2][1]:.1f} {p[3][0]:.1f},{p[3][1]:.1f} "
            f"C{p[4][0]:.1f},{p[4][1]:.1f} {p[5][0]:.1f},{p[5][1]:.1f} {p[0][0]:.1f},{p[0][1]:.1f} Z")

def star_d(cx, cy, r):
    pts = []
    for k in range(8):
        rr = r if k % 2 == 0 else r * 0.38
        a = -math.pi / 2 + k * math.pi / 4
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return poly(pts)

def sleeping_cat(cx, base, s=1.0, fill="#3A2030"):
    """A cat curled up asleep, a silhouette on a cushion: a round back, the head tucked down at the left with both
    ears up, the tail wrapped round the front."""
    P = lambda pts: [(cx + x * s, base + y * s) for x, y in pts]
    g = [path(smooth_closed(P([(-10, 0), (-9, -9), (-2, -15), (8, -15), (15, -10), (18, -2), (16, 0)]), 0.5), fill, "none", 0)]
    g.append(path(smooth_closed(P([(-21, -1), (-22, -8), (-17, -13), (-9, -13), (-5, -8), (-6, -1)]), 0.5), fill, "none", 0))
    g.append(path(poly(P([(-21, -9), (-22, -20), (-15, -12)])), fill, "none", 0))
    g.append(path(poly(P([(-12, -12), (-7, -21), (-6, -9)])), fill, "none", 0))
    g.append(path(smooth_open(P([(16, -3), (10, 1.5), (-4, 2), (-14, 0.5)])), "none", fill, 3.6 * s))
    return g

def inn_window(g, x, y, w, h, gid, curt=None, lit=True, story=None, moon=False, box=False, cl=None):
    """A sash window with a cream casing and sill: lit (curtains, a story inside) or dark (the moon in the glass)."""
    g.append(rect(x - 6, y - 6, w + 12, h + 12, CREAM, INK, LM))
    g.append(path(f"M{x-10},{y-6} L{x+w+10},{y-6} L{x+w+6},{y-13} L{x-6},{y-13} Z", CREAM, INK, LM))
    g.append(poly_raw([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], f"url(#{gid})" if lit else DARKWIN))
    if lit:
        if cl:
            g.append(f'<clipPath id="{cl}">' + raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>', 20) + '</clipPath>')
            g.append(f'<g clip-path="url(#{cl})">')
        if story: g.extend(story)
        if curt:
            for side in (0, 1):
                x0 = x if side == 0 else x + w; d = 1 if side == 0 else -1
                g.append(path(f"M{x0},{y} L{x0 + d*w*0.3},{y} C{x0 + d*w*0.24},{y + h*0.3} {x0 + d*w*0.12},{y + h*0.45} {x0 + d*w*0.1},{y + h*0.55} C{x0 + d*w*0.12},{y + h*0.7} {x0 + d*w*0.16},{y + h*0.85} {x0 + d*w*0.2},{y + h} L{x0},{y + h} Z", curt, INK, 1.2))
                g.append(dot(x0 + d*w*0.1, y + h*0.55, 2.2, CREAM, 0.9))
            g.append(path(f"M{x},{y} L{x+w},{y} L{x+w},{y+8} Q{x+w*0.75},{y+13} {x+w*0.5},{y+8} Q{x+w*0.25},{y+13} {x},{y+8} Z", curt, INK, 1.2))
        if cl: g.append('</g>')
    else:
        g.append(path(crescent_d(x + w * 0.66, y + h * 0.3, min(w, h) * 0.13, -20), GOLD, "none", 0, 'opacity="0.55"'))
        g.append(line(x + w * 0.15, y + h * 0.9, x + w * 0.45, y + h * 0.45, "#FFFFFF", 1.4, 'opacity="0.18"'))
        g.append(line(x + w * 0.3, y + h * 0.95, x + w * 0.5, y + h * 0.66, "#FFFFFF", 1.1, 'opacity="0.12"'))
    # sash bar and muntin
    g.append(line(x, y + h * 0.5, x + w, y + h * 0.5, CREAM, 3.0)); g.append(line(x, y + h * 0.5 - 1.5, x + w, y + h * 0.5 - 1.5, INK, 1.0, 'opacity="0.6"'))
    if not lit: g.append(line(x + w / 2, y, x + w / 2, y + h, CREAM, 2.2))
    g.append(rect(x, y, w, h, "none", INK, LB))
    if lit: g.append(line(x + 5, y + 5, x + 5, y + h * 0.45, "#FFFFFF", 1.3, 'opacity="0.35"'))
    g.append(rect(x - 9, y + h + 5, w + 18, 7, CREAM, INK, LM))
    if box:
        by = y + h + 12
        for (fx, fc) in ((x - 2, PINK), (x + 8, LAV), (x + 18, "#F2C14E"), (x + 28, PINK), (x + 38, LAV), (x + 48, PINK), (x + w, "#F2C14E")):
            g.append(leaf(fx - 3, by - 2, -60, 0.8, "#3F6B3A"))
            g.append(dot(fx + 2, by - 5, 3.6, fc))
        g.append(rect(x - 7, by, w + 14, 12, PORCH, INK, LM))
        g.append(line(x - 4, by + 3, x + w + 4, by + 3, PORCHH, 1.2, 'opacity="0.8"'))

def inn():
    """The Sleepy Inn: a cosy three-storey timber house (warm boards, cream trims) with a porch across most of its
    front (a raised deck, a railing, a roof on posts with lanterns hanging under it), a night-blue door with a moon
    in its glass, windows with curtains (two of them dark with the moon in the glass, one with a cat asleep on the
    sill), flower boxes, a hipped roof with dormers and a front gable, a chimney, a cat weathervane, the inn's board
    with a crescent moon (blank: the site writes SLEEPY INN) and a little vacancy board under the porch."""
    W, H = 520, 580; G = H - 16
    g = []
    defs = lit_glass("innglass", "#FFE0A0", "#F09E5C") + lit_glass("innlamp", "#FFF0B8", "#F4A65C")
    X0, X1 = 26, 494
    EAV = G - 392; DK = G - 22; PB = G - 258
    # ---- the roof (behind everything) ----
    RB, RT = EAV, G - 462
    roof = [(6, RB), (514, RB), (404, RT), (116, RT)]
    g.append(raw(path(poly(roof), ROOF2, "none", 0), 16))
    hs = []; vs = []; y = RB - 12; row = 0
    while y > RT + 2:
        u = (RB - y) / (RB - RT); xa = 6 + 110 * u; xb = 514 - 110 * u
        hs.append((xa + 2, y, xb - 2, y))
        xs = xa + (7 if row % 2 else 14)
        while xs < xb - 6:
            vs.append((xs, y, xs, y + 12)); xs += 16
        y -= 12; row += 1
    g.append(raw(multiline(hs, "#453164", 1.4), 16)); g.append(ticks(vs, "#453164", 1.2, 0.9))
    g.append(path(poly(roof), "none", INK, LB))
    g.append(line(120, RT + 3, 400, RT + 3, TRIM, 1.6, 'opacity="0.5"'))
    # the chimney on the right, bricks, a cap
    CX0, CX1, CT = 450, 480, G - 494
    g.append(rect(CX0, CT, CX1 - CX0, (G - 418) - CT, "#5A2F3C", INK, LB))
    g.extend(bricks(CX0, CT + 10, CX1, G - 420, 15, 9, "#43222D"))
    g.append(rect(CX0 - 5, CT - 2, CX1 - CX0 + 10, 10, "#6E3B48", INK, LB))
    g.append(rect(CX0 + 5, CT - 9, 8, 8, "#43222D", INK, LM)); g.append(rect(CX1 - 13, CT - 9, 8, 8, "#43222D", INK, LM))
    # dormers on the hip, left lit, right dark
    for (dcx, lit) in ((116, True), (404, False)):
        dx0, dx1 = dcx - 26, dcx + 26; dy1 = G - 400; dy0 = G - 446
        g.append(rect(dx0, dy0, dx1 - dx0, dy1 - dy0, IWOOD, INK, LB))
        g.append(path(poly([(dx0 - 8, dy0 + 2), (dcx, dy0 - 26), (dx1 + 8, dy0 + 2)]), ROOF2, INK, LB))
        g.append(path(f"M{dx0-4},{dy0} L{dcx},{dy0-21} L{dx1+4},{dy0}", "none", CREAM, 2.6))
        inn_window(g, dcx - 15, dy0 + 10, 30, 30, "innglass", "#C24A7A" if lit else None, lit, moon=not lit, cl=f"inndm{dcx}")
    # ---- the front gable over the middle, with the attic window and the weathervane ----
    GX0, GX1, GP = 184, 336, G - 488; GCX = 260
    g.append(path(poly([(GX0, EAV + 2), (GCX, GP), (GX1, EAV + 2)]), IWOOD, INK, LB))
    bats = []
    for x in range(GX0 + 12, GX1 - 6, 12):
        top = GP + abs(x - GCX) * (EAV - GP) / ((GX1 - GX0) / 2) + 4
        bats.append((x, top, x, EAV - 1))
    g.append(ticks(bats, IWOOD2, 1.6, 0.9, 8))
    AW_, AH_ = 38, 50; AX_ = GCX - AW_ / 2; AY_ = G - 460
    g.append(path(arch_d(AX_ - 6, AY_ - 6, AW_ + 12, AH_ + 6), CREAM, INK, LM))
    g.append(path(arch_d(AX_, AY_, AW_, AH_), "url(#innglass)", INK, LB))
    g.append(f'<clipPath id="innattic">' + raw(f'<path d="{arch_d(AX_, AY_, AW_, AH_)}"/>', 20) + '</clipPath>')
    g.append('<g clip-path="url(#innattic)">')
    g.append(path(f"M{AX_},{AY_} L{AX_+AW_},{AY_} L{AX_+AW_},{AY_+AH_} L{AX_+AW_-10},{AY_+AH_} C{AX_+AW_-8},{AY_+30} {AX_+AW_-6},{AY_+18} {AX_+AW_-12},{AY_} Z", "#9A6FC0", INK, 1.2))
    g.append(path(f"M{AX_},{AY_} L{AX_+12},{AY_} C{AX_+6},{AY_+18} {AX_+8},{AY_+30} {AX_+10},{AY_+AH_} L{AX_},{AY_+AH_} Z", "#9A6FC0", INK, 1.2))
    g.append(path(star_d(GCX, AY_ + 16, 6), GOLD, INK, 1.0))
    g.append('</g>')
    g.append(path(arch_d(AX_, AY_, AW_, AH_), "none", INK, LB))
    g.append(rect(AX_ - 8, AY_ + AH_, AW_ + 16, 6, CREAM, INK, LM))
    # bargeboards with a scalloped edge
    for d in (-1, 1):
        x0 = GCX + d * ((GX1 - GX0) / 2 + 10); y0 = EAV + 6
        g.append(path(poly([(GCX, GP - 8), (x0, y0), (x0 - d * 12, y0 + 2), (GCX, GP + 6)]), CREAM, INK, LB))
        n = 8
        for k in range(1, n):
            u = k / n; px = GCX + (x0 - d * 6 - GCX) * u; py = GP + 6 + (y0 + 2 - GP - 6) * u
            g.append(dot(px, py + 3, 2.6, CREAM))
    # the weathervane: a rod, the compass arms, an arrow and a brass cat walking along it
    VX = GCX; VB = GP - 8
    g.append(line(VX, VB, VX, VB - 32, INK, 2.8))
    g.append(line(VX - 16, VB - 15, VX + 16, VB - 15, INK, 2.2))
    for bx in (VX - 17, VX + 17):
        g.append(f'<circle cx="{bx}" cy="{VB - 15}" r="2.6" fill="{GOLD2}" stroke="{INK}" stroke-width="1"/>')
    g.append(f'<circle cx="{VX}" cy="{VB - 15}" r="3.2" fill="{GOLD2}" stroke="{INK}" stroke-width="1"/>')
    AY2 = VB - 32
    g.append(line(VX - 30, AY2, VX + 26, AY2, INK, 2.4))
    g.append(path(poly([(VX + 34, AY2), (VX + 22, AY2 - 6), (VX + 24, AY2), (VX + 22, AY2 + 6)]), GOLD2, INK, 1.2))
    g.append(path(poly([(VX - 30, AY2), (VX - 38, AY2 - 7), (VX - 34, AY2), (VX - 38, AY2 + 7)]), GOLD2, INK, 1.2))
    # the cat: walking toward the arrowhead (right), its tail up and curled behind it
    cb = AY2 - 1.2
    C = lambda pts: [(VX + x, cb + y) for x, y in pts]
    tail = C([(-11, -10), (-17, -13), (-20, -21), (-17, -27), (-13, -25)])
    g.append(path(smooth_open(tail), "none", INK, 5.4)); g.append(path(smooth_open(tail), "none", GOLD2, 2.6))
    catp = C([(-12, 0), (-11, -7), (-13, -11), (-10, -14.5), (4, -14.5), (9, -16), (10, -21), (11, -28), (14.5, -22.5), (17, -22.5),
              (20.5, -28), (20.5, -20), (23, -16.5), (19, -12.5), (13, -12), (12, -7), (13, 0), (9, 0), (8, -6), (-6, -6), (-7, 0)])
    g.append(path(poly(catp), GOLD2, INK, 1.4))
    g.append(line(VX - 8, cb - 12, VX + 7, cb - 12, "#FFF1C0", 1.1, 'opacity="0.6"'))
    g.append(dot(VX + 17.5, cb - 18.5, 1.1, INK, 0))
    # ---- the upper storey wall ----
    g.append(poly_raw([(X0, EAV), (X1, EAV), (X1, PB), (X0, PB)], IWOOD))
    g.append(raw(multiline([(X0 + 1, y, X1 - 1, y) for y in range(EAV + 12, PB - 18, 12)], IWOOD2, 1.4, 'opacity="0.9"'), 26))
    g.append(raw(rect(X0 - 12, EAV - 4, X1 - X0 + 24, 10, CREAM2, INK, LB), 12))
    g.append(poly_raw([(X0, EAV + 6), (X1, EAV + 6), (X1, EAV + 11), (X0, EAV + 11)], IWOOD2, 0.7))
    # corner boards
    for cx in (X0, X1 - 10):
        g.append(rect(cx, EAV + 6, 10, PB - EAV - 6, CREAM2, INK, LM))
    # upstairs windows: two either side, the outer ones with flower boxes; the third is dark
    UY, UW, UH = G - 364, 52, 60
    ups = [(44, "#C24A7A", True, True), (124, "#E0A33E", True, False), (344, None, False, False), (424, "#9A6FC0", True, True)]
    for i, (ux, curt, lit, box) in enumerate(ups):
        story = None
        if i == 1:                              # a guest asleep: headboard, pillow, a head with two ears, the quilt
            bx = ux + UW / 2; by = UY + UH
            story = [path(f"M{bx-20},{by} L{bx-20},{by-24} Q{bx-20},{by-30} {bx-10},{by-30} L{bx+10},{by-30} Q{bx+20},{by-30} {bx+20},{by-24} L{bx+20},{by} Z", "#6E3A2E", INK, 1.2),
                     ellipse(bx - 3, by - 16, 11, 4.6, "#FFF3D8", INK, 1.1),
                     f'<circle cx="{bx - 2}" cy="{by - 18.5}" r="5.2" fill="#3A2030"/>',
                     path(poly([(bx - 6.8, by - 20.5), (bx - 7, by - 27), (bx - 2.5, by - 22.5)]), "#3A2030", "none", 0),
                     path(poly([(bx + 0.5, by - 22.5), (bx + 4, by - 27), (bx + 3.3, by - 20)]), "#3A2030", "none", 0),
                     path(f"M{bx-24},{by} L{bx-24},{by-14} Q{bx},{by-19} {bx+24},{by-14} L{bx+24},{by} Z", "#9A6FC0", INK, 1.2),
                     path(f"M{bx-24},{by-7} Q{bx},{by-11} {bx+24},{by-7}", "none", PINK, 2.6),
                     path(f"M{bx-24},{by-13} Q{bx},{by-18} {bx+24},{by-13}", "none", "#FFF3D8", 1.4, 'opacity="0.7"')]
        inn_window(g, ux, UY, UW, UH, "innglass", curt, lit, story=story, box=box, cl=f"innu{i}")
    # the inn's board: a moon disc and a blank board, mounted on two short posts on the porch roof
    SBX0, SBX1, SBY0, SBY1 = 208, 340, G - 348, G - 306
    for px in (SBX0 + 20, SBX1 - 20):
        g.append(rect(px - 3, SBY1, 6, 22, PORCH2, INK, LM))
    g.append(rrect(SBX0, SBY0, SBX1 - SBX0, SBY1 - SBY0, 7, "#2A1B38", INK, LB))
    g.append(rrect(SBX0 + 5, SBY0 + 5, SBX1 - SBX0 - 10, SBY1 - SBY0 - 10, 4, "none", CREAM, 1.5, 'opacity="0.85"'))
    MCX, MCY, MR = SBX0 - 8, (SBY0 + SBY1) / 2, 25
    g.append(f'<circle cx="{MCX}" cy="{MCY}" r="{MR}" fill="#2A1B38" stroke="{INK}" stroke-width="{LB}"/>')
    g.append(f'<circle cx="{MCX}" cy="{MCY}" r="{MR - 5}" fill="none" stroke="{CREAM}" stroke-width="1.5" opacity="0.85"/>')
    g.append(path(crescent_d(MCX - 1, MCY + 1, 14, -15), GOLD, INK, 1.4))
    g.append(path(star_d(MCX + 9, MCY - 8, 4.5), GOLD, INK, 0.9))
    # ---- the porch roof on its beam ----
    PR0, PR1 = G - 282, PB
    g.append(raw(path(poly([(10, PR1), (510, PR1), (496, PR0), (24, PR0)]), ROOF2, INK, LB), 12))
    g.append(raw(multiline([(16 + (PR1 - y) * 0.5, y, 504 - (PR1 - y) * 0.5, y) for y in (PR1 - 8, PR1 - 16)], "#453164", 1.4), 16))
    g.append(line(26, PR0 + 3, 494, PR0 + 3, TRIM, 1.4, 'opacity="0.5"'))
    g.append(raw(rect(16, PB, 488, 12, CREAM2, INK, LB), 12))
    g.append(line(20, PB + 3, 500, PB + 3, CREAM, 1.3, 'opacity="0.8"'))
    # ---- the ground floor behind the porch ----
    g.append(poly_raw([(X0, PB + 12), (X1, PB + 12), (X1, DK), (X0, DK)], IWOOD2))
    g.append(raw(multiline([(X0 + 1, y, X1 - 1, y) for y in range(PB + 26, DK - 4, 12)], "#3E262B", 1.4, 'opacity="0.9"'), 40))
    DWN = G - 180; DWH = 82; DWW = 56
    downs = [(62, "#A33A4A", "sleep"), (140, "#C24A7A", "lamp"), (324, "#9A6FC0", "plant"), (402, "#E0A33E", "clock")]
    for i, (dx, curt, st) in enumerate(downs):
        story = []
        if st == "sleep":
            story = [path(smooth_closed([(dx + 8, DWN + DWH), (dx + 9, DWN + DWH - 8), (dx + 28, DWN + DWH - 11), (dx + 47, DWN + DWH - 8), (dx + 48, DWN + DWH)], 0.5), "#C24A7A", INK, 1.2)]
            story += sleeping_cat(dx + DWW / 2 + 1, DWN + DWH - 9, 1.1)
        elif st == "lamp":
            story = [path(f"M{dx+22},{DWN+44} L{dx+34},{DWN+44} L{dx+38},{DWN+56} L{dx+18},{DWN+56} Z", "#8B1A2D", INK, 1.1),
                     line(dx + 28, DWN + 56, dx + 28, DWN + 76, "#3A2030", 2.2), rect(dx + 14, DWN + 76, 28, 8, "#5E3444", "none", 0, 'opacity="0.8"'),
                     ellipse(dx + 28, DWN + 58, 9, 3, "#FFF6D6", "none", 0, 'opacity="0.7"')]
        elif st == "plant":
            story = [path(f"M{dx+20},{DWN+DWH} L{dx+36},{DWN+DWH} L{dx+34},{DWN+DWH-12} L{dx+22},{DWN+DWH-12} Z", "#6E3A2E", "none", 0, 'opacity="0.85"')]
            for (a, L_) in ((-60, 20), (-95, 24), (-125, 19), (-80, 16), (-110, 15)):
                r_ = math.radians(a); story.append(path(f"M{dx+28},{DWN+DWH-12} Q{dx+28+math.cos(r_)*L_*0.4},{DWN+DWH-12+math.sin(r_)*L_*0.8} {dx+28+math.cos(r_)*L_},{DWN+DWH-12+math.sin(r_)*L_}", "none", "#2F4A2E", 3.2))
        elif st == "clock":
            story = [f'<circle cx="{dx+28}" cy="{DWN+30}" r="10" fill="#FFF3D0" stroke="#5A3038" stroke-width="2.4"/>',
                     line(dx + 28, DWN + 30, dx + 28, DWN + 23, "#5A3038", 1.8), line(dx + 28, DWN + 30, dx + 33, DWN + 32, "#5A3038", 1.8),
                     line(dx + 28, DWN + 40, dx + 28, DWN + 56, "#5A3038", 1.4),
                     f'<circle cx="{dx+28}" cy="{DWN+58}" r="3.4" fill="#C98A4E" stroke="#5A3038" stroke-width="1.2"/>']
        inn_window(g, dx, DWN, DWW, DWH, "innglass", curt, True, story=story, cl=f"innd{i}")
    # the door: night blue, a round lit window with a crescent in it, cream casing, a little lamp over it
    DX0, DX1, DT = 228, 292, G - 210
    g.append(rect(DX0 - 9, DT - 12, DX1 - DX0 + 18, DK - DT + 12, CREAM, INK, LB))
    g.append(rect(DX0, DT, DX1 - DX0, DK - DT, DOOR, INK, LB))
    DCX = (DX0 + DX1) / 2
    g.append(f'<circle cx="{DCX}" cy="{DT + 40}" r="19" fill="{CREAM}" stroke="{INK}" stroke-width="{LM}"/>')
    g.append(f'<circle cx="{DCX}" cy="{DT + 40}" r="14.5" fill="url(#innglass)" stroke="{INK}" stroke-width="{LM}"/>')
    g.append(path(crescent_d(DCX - 1, DT + 41, 9, -15), "#33406E", "none", 0, 'opacity="0.85"'))
    for (yy, hh) in ((DT + 72, 46), (DT + 128, 46)):
        g.append(rect(DX0 + 10, yy, DX1 - DX0 - 20, hh, "#2A3560", INK, 1.3))
        g.append(line(DX0 + 13, yy + 3, DX1 - 13, yy + 3, "#5A6AA0", 1.2, 'opacity="0.7"'))
    g.append(f'<circle cx="{DX1 - 10}" cy="{DT + 104}" r="3.6" fill="{GOLD2}" stroke="{INK}" stroke-width="1.1"/>')
    # ---- the deck, the steps ----
    g.append(raw(rect(18, DK, 484, 7, PORCH, INK, LB), 13))
    g.append(line(22, DK + 2, 498, DK + 2, PORCHH, 1.3, 'opacity="0.8"'))
    g.append(raw(rect(18, DK + 7, 484, G - DK - 7, DECK, INK, LB), 13))
    lat = []
    for x in range(10, 520, 14):
        lat.append((max(20, x), DK + 8 + (max(20, x) - x), min(500, x + 13), DK + 8 + (min(500, x + 13) - x)))
        lat.append((max(20, x), G - 1 - (max(20, x) - x), min(500, x + 13), G - 1 - (min(500, x + 13) - x)))
    g.append(ticks([s_ for s_ in lat if s_[0] < s_[2]], "#3C2522", 1.6, 0.9))
    # steps up to the door
    SX0, SX1 = 218, 302
    g.append(rect(SX0, DK, SX1 - SX0, 11, PORCH, INK, LM))
    g.append(line(SX0 + 3, DK + 2, SX1 - 3, DK + 2, PORCHH, 1.2, 'opacity="0.8"'))
    g.append(rect(SX0 - 8, DK + 11, SX1 - SX0 + 16, 11, PORCH, INK, LM))
    g.append(line(SX0 - 5, DK + 13, SX1 + 5, DK + 13, PORCHH, 1.2, 'opacity="0.8"'))
    g.append(rect(SX0 - 16, G, SX1 - SX0 + 32, 8, STONE2, INK, LM))
    # ---- railing, posts, lanterns, the vacancy board ----
    posts = [26, 128, 212, 308, 392, 494]
    RT_, RB_ = G - 76, DK - 6
    for (a, b) in ((posts[0], posts[2]), (posts[3], posts[5])):
        bal = [(x, RT_ + 6, x, RB_) for x in range(int(a) + 12, int(b) - 6, 11)]
        g.append(ticks(bal, INK, 5.2, 1.0, 12)); g.append(ticks(bal, PORCH, 2.8, 1.0, 12))
        g.append(rect(a, RB_, b - a, 5, PORCH2, INK, LM))
        g.append(rect(a - 2, RT_, b - a + 4, 7, PORCH, INK, LM))
        g.append(line(a, RT_ + 2, b, RT_ + 2, PORCHH, 1.2, 'opacity="0.8"'))
    for px in posts:
        g.append(raw(rect(px - 6, PB + 12, 12, DK - PB - 12, PORCH, INK, LB), 13))
        g.append(line(px - 3, PB + 16, px - 3, DK - 4, PORCHH, 1.2, 'opacity="0.7"'))
        g.append(rect(px - 8, PB + 12, 16, 7, PORCH2, INK, LM))
        g.append(rect(px - 8, DK - 7, 16, 7, PORCH2, INK, LM))
        # a gingerbread bracket each side of the post's top
        for d in (-1, 1):
            if (px == posts[0] and d < 0) or (px == posts[-1] and d > 0): continue
            g.append(path(f"M{px + d*6},{PB + 12} L{px + d*24},{PB + 12} Q{px + d*10},{PB + 16} {px + d*6},{PB + 30} Z", CREAM, INK, 1.3))
    lamps = []
    for lx in (77, 170, 443):
        g.append(line(lx, PB + 12, lx, PB + 16, INK, 1.8))
        g.extend(lantern(lx, PB + 40, 0.95, "innlamp"))
        lamps.append((lx, PB + 40))
    VX0, VX1, VY0, VY1 = 322, 378, PB + 30, PB + 52
    for chx in (VX0 + 8, VX1 - 8):
        g.append(line(chx, PB + 12, chx, VY0, INK, 1.2))
    g.append(rrect(VX0, VY0, VX1 - VX0, VY1 - VY0, 4, "#2A1B38", INK, LM))
    g.append(rrect(VX0 + 3, VY0 + 3, VX1 - VX0 - 6, VY1 - VY0 - 6, 2, "none", CREAM, 1.0, 'opacity="0.7"'))
    ANCHORS["inn"] = {"name": "inn", "W": W, "H": H, "G": G, "kind": "building",
        "signs": [{"x": SBX0 + 8, "y": SBY0 + 7, "w": SBX1 - SBX0 - 16, "h": SBY1 - SBY0 - 14, "text": "SLEEPY INN", "style": "neon-lav",
                   "note": "the moon disc beside it at (%d,%d) r%d is drawn" % (MCX, MCY, MR)},
                  {"x": VX0 + 4, "y": VY0 + 3, "w": VX1 - VX0 - 8, "h": VY1 - VY0 - 6, "text": "VACANCY", "style": "neon-pink",
                   "note": "small hanging board; could blink"}],
        "windows": [{"x": x, "y": UY, "w": UW, "h": UH} for (x, c, l, b) in ups if l]
                   + [{"x": x, "y": DWN, "w": DWW, "h": DWH} for (x, c, s_) in downs]
                   + [{"x": AX_, "y": AY_, "w": AW_, "h": AH_, "note": "attic"}, {"x": 116 - 15, "y": G - 436, "w": 30, "h": 30, "note": "left dormer"},
                      {"x": DCX - 14.5, "y": DT + 25.5, "w": 29, "h": 29, "note": "door's round window"}],
        "dark_windows": [{"x": 344, "y": UY, "w": UW, "h": UH}, {"x": 404 - 15, "y": G - 436, "w": 30, "h": 30}],
        "doors": [{"x": DX0, "y": DT, "w": DX1 - DX0, "h": DK - DT, "note": "on the deck; its sill is y=%d" % DK}],
        "porch": {"deck_y": DK, "x0": 20, "x1": 500, "roof_underside_y": PB + 12, "steps": {"x": SX0 - 8, "w": SX1 - SX0 + 16},
                  "note": "dozing pets can sit on the deck line (y=%d) between the posts; clear height to the beam %d" % (DK, DK - PB - 12)},
        "light": [{"x": x, "y": y, "what": "porch lantern: warm glow + flicker"} for x, y in lamps],
        "smoke": [{"x": (CX0 + CX1) / 2, "y": CT - 9, "what": "chimney smoke, slow and soft"}],
        "vane": {"x": VX, "y": AY2, "note": "cat weathervane (optional: a slow quarter-turn wobble)"}}
    save("inn", W, H, g, defs)

# ---------------- the park bench ----------------
SLAT  = "#7A4E44"
SLAT2 = "#5C3833"
SLATH = "#A0705C"

def bench():
    """A park bench seen from the front: wooden slats (three in the back, the seat's top and front edge) between two
    wrought-iron ends, each an upright with a scrolled arm, a curled foot and a little pink heart, plus a middle leg.
    Its feet stand on y = H - 8 with a soft contact shadow."""
    W, H = 170, 90; B = H - 8
    BI, BIH = "#33254A", "#8C78B0"          # painted iron, a shade lighter than the town's so it reads on the paving
    g = []
    g.append(ellipse(W / 2, B, 80, 5.5, SHADE, "none", 0, 'opacity="0.38"'))
    L0, L1 = 24, 146                    # the uprights' centres
    # back legs and the back rail, behind
    for x in (L0 + 12, L1 - 12):
        g.append(rect(x - 2.2, 62, 4.4, B - 64, "#1A1026", INK, 1.2))
    g.append(rect(L0, 40, L1 - L0, 4, "#1A1026", INK, 1.0))
    # the backrest slats
    for (y0, y1) in ((9, 17), (20, 28), (31, 39)):
        g.append(rect(L0, y0, L1 - L0, y1 - y0, SLAT, INK, LM))
        g.append(line(L0 + 3, y0 + 2.2, L1 - 3, y0 + 2.2, SLATH, 1.2, 'opacity="0.75"'))
    # the seat: two slats seen from above (lit by the lamps), then the front edge in shadow
    g.append(rect(L0 - 6, 47, L1 - L0 + 12, 5, SLATH, INK, LM))
    g.append(rect(L0 - 7, 52, L1 - L0 + 14, 5, "#8C5E4E", INK, LM))
    g.append(rect(L0 - 8, 57, L1 - L0 + 16, 7, SLAT2, INK, LM))
    g.append(line(L0 - 5, 59, L1 + 5, 59, SLAT, 1.1, 'opacity="0.8"'))
    # the middle leg
    g.append(path(f"M{W/2 - 2.4},64 L{W/2 + 2.4},64 L{W/2 + 2.4},{B - 4} L{W/2 + 7},{B} L{W/2 - 7},{B} L{W/2 - 2.4},{B - 4} Z", BI, INK, 1.3))
    # the iron ends
    for d, cx in ((-1, L0), (1, L1)):
        g.append(rect(cx - 3, 6, 6, B - 8, BI, INK, 1.4))
        g.append(line(cx - 1, 8, cx - 1, B - 6, BIH, 1.0, 'opacity="0.7"'))
        g.append(dot(cx, 5, 3.2, BI, 1.2))
        leg = [(cx, 57), (cx + d * 4, 67), (cx + d * 10, 75), (cx + d * 16, B - 1)]
        g.append(path(smooth_open(leg), "none", INK, 5.2)); g.append(path(smooth_open(leg), "none", BI, 2.6))
        g.append(path(smooth_open(curl_pts(cx + d * 16, B - 5, 4.2, 90, 0.9, d)), "none", INK, 2.4))
        arm = [(cx, 38), (cx + d * 8, 35), (cx + d * 15, 36), (cx + d * 18, 41)]
        g.append(path(smooth_open(arm), "none", INK, 5.4)); g.append(path(smooth_open(arm), "none", BI, 2.8))
        g.append(path(smooth_open(curl_pts(cx + d * 15.5, 44.5, 4.6, -40 if d > 0 else 220, 0.95, d)), "none", INK, 2.6))
        g.append(line(cx + d * 3, 36.2, cx + d * 13, 34.6, BIH, 0.9, 'opacity="0.7"'))
        g.append(heart(cx + d * 12, 55, 11, PINK, 1.2))
    ANCHORS["bench"] = {"name": "bench", "W": W, "H": H, "base": B, "kind": "prop",
                        "seat": {"y": 47, "x0": L0 - 6, "x1": L1 + 6, "note": "a pet sitting on it: its bottom on y~52"}}
    save("bench", W, H, g)

if __name__ == "__main__":
    which = sys.argv[1:] or ["gate", "shop", "inn", "bench"]
    for w in which: globals()[w]()
    out = os.environ.get("ANCHORS_OUT")
    if out:
        old = json.load(open(out)) if os.path.exists(out) else {}
        old.update(ANCHORS); json.dump(old, open(out, "w"), indent=1)
