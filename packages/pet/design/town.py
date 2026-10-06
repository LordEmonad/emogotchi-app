"""Emotown -> packages/pet/town/*.svg

The town the pets live in, drawn the way the pets and their props are drawn: flat fills, wobbly black ink, the
Emonad palette, here under night light. Every building is its own SVG in town units (1 unit = 1 town unit: a cat
stands about 140 tall), with its ground line at y = G = H - 16 so steps and kerbs can hang just below it. The site
places it with its ground on the street's BASE line and adds everything that glows or moves (signs, window light,
steam, smoke, flicker) as HTML over it, so the drawings stay still and cheap.
"""
import os, sys, math, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, FUR, HAIR, STRAND, PURPLE, LAV, LAV2, PINK, GOLD, GOLD2, RUBY, GREEN, TEAL, PUPIL, smooth_closed, smooth_open, poly, path, ellipse
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "town"))
os.makedirs(OUT, exist_ok=True)

# ---- line weights at town scale (a pet's 2.7 ink is ~2 town units on the street) ----
LB = 2.4    # outlines
LM = 1.6    # details
LT = 1.1    # fine details

# ---- the night palette ----
NIGHT   = "#140B24"   # the darkest thing that is not ink
ROOF    = "#1F1433"
ROOF2   = "#2B1C45"
WALL1   = "#3A2556"   # deep violet
WALL2   = "#46295F"
WALL3   = "#533268"   # plum
WALL4   = "#2F2148"
TRIM    = "#6E4E8C"
TRIM2   = "#8D6FAE"
STEEL   = "#9A86B7"   # the diner's stainless, at night
STEEL2  = "#C4B3DA"
STEEL3  = "#6F5C8F"
BRICK   = "#5A2C47"
BRICK2  = "#47223A"
STONE   = "#6B5A7E"
STONE2  = "#51446A"
WOOD    = "#5B3A4E"
WOOD2   = "#43293A"
LIT     = "#FFD98C"   # a lit window's glass
LIT2    = "#F4A65C"
LITDIM  = "#C98A4E"
DARKWIN = "#1A1030"
GLASS   = "#2A1F46"
SHADE   = "#000000"

def svg(name, w, h, body, amp=0.9, step=8.0, decimals=1, defs=""):
    body = bake("\n".join(body), amp=amp, freq=0.09, step=step)
    if decimals is not None:
        def rnd(m):
            v = f"{float(m.group(0)):.{decimals}f}"
            return v.rstrip("0").rstrip(".") if decimals > 0 else v
        body = re.sub(r"-?\d+\.\d+", rnd, body)
    src = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           f'<defs>{defs}</defs>\n<g id="{name}">\n{body}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"{len(src)//1024} KB")

# ---------------- shapes ----------------
def rect(x, y, w, h, fill, stroke=INK, sw=LB, extra=""):
    return path(f"M{x:.1f},{y:.1f} L{x+w:.1f},{y:.1f} L{x+w:.1f},{y+h:.1f} L{x:.1f},{y+h:.1f} Z", fill, stroke, sw, extra)

def rrect_d(x, y, w, h, r, top=True, bottom=True):
    rt = r if top else 0; rb = r if bottom else 0; K = 0.5523
    d = f"M{x+rt:.1f},{y:.1f} L{x+w-rt:.1f},{y:.1f} "
    d += f"C{x+w-rt+rt*K:.1f},{y:.1f} {x+w:.1f},{y+rt-rt*K:.1f} {x+w:.1f},{y+rt:.1f} " if rt else ""
    d += f"L{x+w:.1f},{y+h-rb:.1f} "
    d += f"C{x+w:.1f},{y+h-rb+rb*K:.1f} {x+w-rb+rb*K:.1f},{y+h:.1f} {x+w-rb:.1f},{y+h:.1f} " if rb else ""
    d += f"L{x+rb:.1f},{y+h:.1f} "
    d += f"C{x+rb-rb*K:.1f},{y+h:.1f} {x:.1f},{y+h-rb+rb*K:.1f} {x:.1f},{y+h-rb:.1f} " if rb else ""
    d += f"L{x:.1f},{y+rt:.1f} "
    d += f"C{x:.1f},{y+rt-rt*K:.1f} {x+rt-rt*K:.1f},{y:.1f} {x+rt:.1f},{y:.1f} " if rt else ""
    return d + "Z"

def rrect(x, y, w, h, r, fill, stroke=INK, sw=LB, top=True, bottom=True, extra=""):
    return path(rrect_d(x, y, w, h, r, top, bottom), fill, stroke, sw, extra)

def line(x0, y0, x1, y1, stroke=INK, sw=LM, extra=""):
    return path(f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}", "none", stroke, sw, extra)

def arch_d(x, y, w, h):
    """A round-topped opening: a rectangle with a half-circle on top (y is the top of the arch)."""
    r = w / 2; K = 0.5523; cx = x + r
    return (f"M{x:.1f},{y+h:.1f} L{x:.1f},{y+r:.1f} C{x:.1f},{y+r-r*K:.1f} {cx-r*K:.1f},{y:.1f} {cx:.1f},{y:.1f} "
            f"C{cx+r*K:.1f},{y:.1f} {x+w:.1f},{y+r-r*K:.1f} {x+w:.1f},{y+r:.1f} L{x+w:.1f},{y+h:.1f} Z")

def bulbs(pts, r=3.0, fill=GOLD):
    return [f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" stroke="{INK}" stroke-width="1.1"/>' for x, y in pts]

def bulbs_rrect(x, y, w, h, r, gap=13.0, br=3.0, fill=GOLD):
    """Bulbs spaced along a rounded rectangle's edge, inset a little."""
    from wobble import parse, _samples, _seg_len
    segs = parse(rrect_d(x, y, w, h, r))[0][1]
    pts = []; acc = 0.0
    for seg in segs:
        smp = _samples(seg, 1.0)
        for i in range(1, len(smp)):
            acc += math.dist(smp[i-1], smp[i])
            if acc >= gap: acc = 0.0; pts.append(smp[i])
    return bulbs(pts, br, fill)

def lit_glass(gid, top=LIT, bottom=LIT2):
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>'

def ribs(x0, x1, y0, y1, gap, stroke, sw=1.2, extra='opacity="0.6"'):
    out = []; x = x0 + gap
    while x < x1 - 2:
        out.append(line(x, y0, x, y1, stroke, sw, extra)); x += gap
    return out

def bricks(x0, y0, x1, y1, bw=26, bh=11, stroke=BRICK2, sw=1.1, extra='opacity="0.8"'):
    """Mortar lines over a wall already filled with brick."""
    out = []; y = y0 + bh; row = 0
    while y < y1 - 1:
        out.append(line(x0 + 1, y, x1 - 1, y, stroke, sw, extra)); y += bh
    y = y0; row = 0
    while y < y1 - 1:
        off = (bw / 2) if row % 2 else 0; x = x0 + off + bw
        while x < x1 - 2:
            out.append(line(x, y + 1, x, min(y + bh, y1) - 1, stroke, sw, extra)); x += bw
        y += bh; row += 1
    return out

def shadow_under(x0, x1, y, h=10, opacity=0.45):
    """A soft contact shadow where something meets the ground."""
    return [f'<rect x="{x0}" y="{y - h*0.2}" width="{x1-x0}" height="{h}" rx="{h/2}" fill="{SHADE}" opacity="{opacity}"/>']

# ---------------- the buildings ----------------
def diner():
    """Emo Diner: a streamlined all-night diner in night-lit steel. A long lit window run with the counter, stools and
    pendant lamps inside, a door with a porthole at the right end, a violet fascia for the neon name (HTML), a rooftop
    sign with a bowl on it ringed in bulbs, and the classic bulb arrow pointing at the door."""
    W, H = 540, 420; G = H - 16
    g = []
    defs = lit_glass("dinerglass", "#FFE6A8", "#F2A45E") + lit_glass("dinerdoor", "#FFD98C", "#E9965A")
    # rooftop sign: two poles, the board ringed with bulbs, a bowl on it (the site lights the word)
    for px in (96, 196):
        g.append(rect(px - 4, 58, 8, 102, ROOF2, INK, LM))
        g.append(line(px - 1, 62, px - 1, 156, TRIM, 1.2, 'opacity="0.7"'))
    g.append(line(92, 120, 200, 138, INK, 2.2)); g.append(line(92, 138, 200, 120, INK, 2.2))
    g.append(rrect(36, 14, 222, 70, 18, "#2A1840", INK, LB))
    g.append(rrect(44, 22, 206, 54, 12, "none", PINK, 2.0, extra='opacity="0.85"'))
    g.extend(bulbs_rrect(36, 14, 222, 70, 18, gap=15, br=3.2))
    # the arrow: bulbs along a chunky arrow that points at the door
    for px in (330, 420):                                                        # the arrow's posts, down to the roof
        g.append(rect(px - 4, 100, 8, 56, ROOF2, INK, LM))
    g.append(line(330, 124, 420, 140, INK, 1.8)); g.append(line(330, 140, 420, 124, INK, 1.8))
    arrow = [(300, 54), (452, 54), (452, 30), (498, 78), (452, 126), (452, 102), (300, 102)]
    g.append(path(poly(arrow), "#3A2150", INK, LB))
    g.append(path(poly([(308, 62), (460, 62), (460, 48), (488, 78), (460, 108), (460, 94), (308, 94)]), "none", PINK, 2.0, 'opacity="0.9"'))
    ax = [(312 + i * 16, 78) for i in range(9)]
    g.extend(bulbs(ax, 3.0))
    # roof cap
    g.append(rrect(14, 150, 512, 16, 8, ROOF, INK, LB))
    # the body: fascia, the window band, the steel skirt
    body_y = 162; body_h = G - 22 - body_y
    g.append(rrect(20, body_y, 500, body_h, 30, STEEL, INK, LB, bottom=False))
    g.append(rect(20, body_y + 8, 500, 48, WALL1, INK, LB))                      # fascia for the neon name
    g.append(line(26, body_y + 14, 514, body_y + 14, STEEL2, 1.6, 'opacity="0.55"'))
    g.append(line(26, body_y + 50, 514, body_y + 50, INK, 1.2, 'opacity="0.5"'))
    # the skirt: ribbed steel with a pink stripe
    sk0 = 298; sk1 = G - 22
    g.extend(ribs(20, 520, sk0 + 22, sk1, 11, STEEL2, 1.3, 'opacity="0.55"'))
    g.append(rect(20, sk0, 500, 14, PINK, INK, LM))
    g.append(line(24, sk0 + 3, 516, sk0 + 3, "#FFFFFF", 1.4, 'opacity="0.35"'))
    g.append(rect(20, sk0 + 14, 500, 6, STEEL3, INK, LT))
    # windows, with the room inside: back wall, menu boards, pendant lamps, the counter and its stools
    wx = [40, 110, 180, 250, 320]; wy = 222; ww = 62; wh = 70
    for x in wx:
        g.append(rect(x, wy, ww, wh, "url(#dinerglass)", INK, LB))
    # interior (one set of shapes across all the glass; the frames go back on top)
    g.append(f'<clipPath id="dinerwin">' + "".join(f'<rect x="{x}" y="{wy}" width="{ww}" height="{wh}"/>' for x in wx) + '</clipPath>')
    g.append('<g clip-path="url(#dinerwin)">')
    for mx in (70, 180, 300):
        g.append(rect(mx - 26, wy + 12, 52, 14, "#7A4B52", "none", 0, 'opacity="0.55"'))
        g.append(line(mx - 20, wy + 17, mx + 12, wy + 17, "#FFF1C8", 1.2, 'opacity="0.6"'))
        g.append(line(mx - 20, wy + 21, mx + 4, wy + 21, "#FFF1C8", 1.2, 'opacity="0.5"'))
    for lx in (75, 145, 215, 285, 355):
        g.append(line(lx, wy, lx, wy + 30, "#6B3F4F", 1.4, 'opacity="0.8"'))
        g.append(path(f"M{lx-10},{wy+38} Q{lx},{wy+24} {lx+10},{wy+38} Z", "#8B1A2D", INK, 1.1))
        g.append(ellipse(lx, wy + 40, 12, 4, "#FFF6D6", "none", 0, 'opacity="0.7"'))
    g.append(rect(30, wy + 50, 380, 26, "#5E3444", "none", 0, 'opacity="0.78"'))    # the counter
    g.append(line(30, wy + 50, 410, wy + 50, "#FFE9B8", 2.0, 'opacity="0.7"'))
    for sx in range(52, 400, 34):
        g.append(ellipse(sx, wy + 60, 10, 4.2, PINK, INK, 1.1))
        g.append(line(sx, wy + 64, sx, wy + 76, "#3A2030", 2.4))
    g.append('</g>')
    for x in wx:
        g.append(rect(x, wy, ww, wh, "none", INK, LB))
        g.append(line(x + 5, wy + 6, x + 5, wy + wh - 8, "#FFFFFF", 1.6, 'opacity="0.35"'))
        g.append(rect(x - 3, wy + wh, ww + 6, 7, STEEL2, INK, LM))          # sill
    g.append(rect(34, wy - 8, 356, 6, STEEL3, INK, LM))                       # the lintel over the run
    # the door, with a porthole, a push bar, and two steps onto the pavement
    dx, dw = 418, 70
    g.append(rect(dx - 6, 214, dw + 12, G - 214, STEEL3, INK, LB))
    g.append(rect(dx, 222, dw, G - 222, "#5B3F7E", INK, LB))
    g.append(f'<circle cx="{dx + dw/2}" cy="258" r="20" fill="url(#dinerdoor)" stroke="{INK}" stroke-width="{LB}"/>')
    g.append(f'<circle cx="{dx + dw/2}" cy="258" r="14" fill="none" stroke="#FFFFFF" stroke-width="1.4" opacity="0.4"/>')
    g.append(rect(dx + 8, 300, dw - 16, 7, STEEL2, INK, LM))
    g.append(line(dx + 8, 340, dx + dw - 8, 340, INK, 1.2, 'opacity="0.4"'))
    g.append(rect(dx - 10, G - 2, dw + 20, 9, STONE, INK, LM))
    g.append(rect(dx - 18, G + 6, dw + 36, 9, STONE2, INK, LM))
    # a little steel detail at each end: the rounded ends get a highlight
    g.append(path(f"M28,{body_y + 64} L28,{sk0 - 6}", "none", STEEL2, 3.0, 'opacity="0.6"'))
    g.append(path(f"M512,{body_y + 64} L512,{sk0 - 6}", "none", STEEL3, 3.0, 'opacity="0.6"'))
    # the foundation, dark brick
    g.append(rect(24, G - 22, 492, 22, BRICK, INK, LB))
    g.extend(bricks(24, G - 22, 516, G, 24, 11, BRICK2))
    # a menu board in the last window's corner and a heart on the door
    g.append(path(f"M{dx + dw/2},{374} C{dx + dw/2 - 9},{367} {dx + dw/2 - 10},{360} {dx + dw/2 - 5},{357} C{dx + dw/2 - 2},{355} {dx + dw/2},{357} {dx + dw/2},{359} C{dx + dw/2},{357} {dx + dw/2 + 2},{355} {dx + dw/2 + 5},{357} C{dx + dw/2 + 10},{360} {dx + dw/2 + 9},{367} {dx + dw/2},{374} Z", PINK, INK, 1.2))
    # the bowl on the rooftop sign (the site's own bowl, small)
    g.append(ellipse(210, 49, 24, 6, HAIR, INK, 1.6))
    for (kx, ky) in ((198, 44), (206, 40), (214, 42), (222, 45), (210, 47)):
        g.append(f'<circle cx="{kx}" cy="{ky}" r="3" fill="{GOLD}" stroke="{INK}" stroke-width="1"/>')
    g.append(path(smooth_closed([(185, 49), (188, 60), (198, 67), (222, 67), (232, 60), (235, 49), (222, 53), (198, 53)], 0.5), PURPLE, INK, 1.6))
    svg("diner", W, H, g, defs=defs)

if __name__ == "__main__":
    which = sys.argv[1:] or ["diner"]
    for w in which: globals()[w]()
