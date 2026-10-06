"""Emotown, the street furniture and the sky's two parallax layers -> packages/pet/town/*.svg

Street furniture (plane props, depth-sorted with the pets; base at y = H - 8 with a soft contact shadow):
    lamp, hydrant, mailbox, planter, bin
The sky (strips, flat bottom edge that disappears behind what is in front of it):
    skyline  the far city on the horizon, two depths of pure silhouette with sparse tiny windows and one beacon
    hills    the mid distance: rolling hills, houses, trees, a radio mast, and the EMOTOWN hillside sign

    python3 town_street.py [lamp hydrant ...]      (no names = all)
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town import *

def tapered_big(pts, w0, w1, t=0.5, fill=FUR, sample=7.0, stroke=INK, sw=None):
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
    return [path(smooth_closed(left + tip + right[::-1], 0.4), fill, stroke, sw if sw is not None else LM)]

# ---------------- shared bits ----------------
def soft_shadow(gid):
    """A contact shadow that fades out at its rim (no blur: a radial gradient)."""
    return (f'<radialGradient id="{gid}" cx="0.5" cy="0.5" r="0.5">'
            f'<stop offset="0" stop-color="#000" stop-opacity="0.7"/>'
            f'<stop offset="0.55" stop-color="#000" stop-opacity="0.45"/>'
            f'<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>')

def contact(gid, cx, cy, rx, ry):
    return ellipse(cx, cy, rx, ry, f"url(#{gid})", "none", 0)

def heart_d(cx, cy, w):
    """A heart centred on (cx, cy), w wide (the diner's heart, scaled)."""
    s = w / 20.0
    P = lambda x, y: f"{cx + x*s:.1f},{cy + y*s:.1f}"
    return (f"M{P(0, 9)} C{P(-9, 2)} {P(-10, -5)} {P(-5, -8)} C{P(-2, -10)} {P(0, -8)} {P(0, -6)} "
            f"C{P(0, -8)} {P(2, -10)} {P(5, -8)} C{P(10, -5)} {P(9, 2)} {P(0, 9)} Z")

def crown_d(cx, top, w, h):
    """A little three-pointed crown, points at `top`, band at the bottom."""
    x0 = cx - w/2; x1 = cx + w/2; b = top + h
    return poly([(x0, b), (x0, top + h*0.18), (x0 + w*0.25, top + h*0.52), (cx, top), (x1 - w*0.25, top + h*0.52),
                 (x1, top + h*0.18), (x1, b)])


def dot(x, y, r, fill, extra=""):
    """A tiny round light as an octagon. Not wobbled: at this size a baked circle is 600 bytes of nothing."""
    pts = " ".join(f"{x + r * math.cos(k * math.pi / 4 + math.pi / 8):.1f},{y + r * math.sin(k * math.pi / 4 + math.pi / 8):.1f}" for k in range(8))
    return f'<polygon points="{pts}" fill="{fill}" {extra}/>'

def straight_lines(segs, stroke, sw, extra=""):
    """Thin straight steel (a lattice, a brace) as plain polylines: straight is right for steel, and cheap."""
    return (f'<g fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" {extra}>' +
            "".join(f'<polyline points="{a[0]:.1f},{a[1]:.1f} {b[0]:.1f},{b[1]:.1f}"/>' for a, b in segs) + '</g>')

IRON  = "#2E2048"   # cast iron at night: the darkest violet that still reads against the facades
IRON2 = "#1E1432"
IRONH = "#6E57A0"   # iron's highlight

# =============================================================== the lamp
def lamp():
    """A classic cast-iron street lamp: a stepped plinth and a bell base, a spiked collar (the cat's, in iron), a
    fluted post, the ladder bar with ball ends, a flared lantern with three lit panes and a hot mantle, a bell
    canopy, and a little gold crown for a finial. The site adds the glow and the light pool at the glass."""
    W, H = 70, 340; B = H - 8; cx = W / 2
    defs = soft_shadow("lampshade")
    defs += ('<radialGradient id="lampglass" cx="0.5" cy="0.56" r="0.62">'
             '<stop offset="0" stop-color="#FFF8DC"/><stop offset="0.45" stop-color="#FFDE94"/>'
             '<stop offset="1" stop-color="#EF9A55"/></radialGradient>')
    g = [contact("lampshade", cx, B, 31, 6)]
    # plinth: two steps
    g.append(rect(13, B - 13, 44, 13, IRON, INK, LB))
    g.append(line(16, B - 10, 54, B - 10, IRONH, 1.3, 'opacity="0.55"'))
    g.append(rect(17, B - 21, 36, 8, IRON, INK, LB))
    # the bell base, and the collar ring on it
    g.append(path(f"M19,{B-21} C19,{B-36} 27,{B-42} 27,{B-56} L43,{B-56} C43,{B-42} 51,{B-36} 51,{B-21} Z", IRON, INK, LB))
    g.append(path(f"M23,{B-25} C23,{B-36} 29,{B-42} 30,{B-52}", "none", IRONH, 1.6, 'opacity="0.6"'))
    g.append(rrect(24, B - 64, 22, 9, 3, IRON, INK, LB))
    g.append(line(27, B - 61, 43, B - 61, IRONH, 1.2, 'opacity="0.55"'))
    # the lower sleeve and the spiked collar (the cat's collar, cast in iron)
    g.append(rect(28, B - 92, 14, 28, IRON, INK, LB))
    g.append(line(31, B - 89, 31, B - 67, IRONH, 1.4, 'opacity="0.55"'))
    cy = B - 100
    for sx in (1, -1):                                            # side spikes stick out past the band
        x = cx + sx * 12
        g.append(path(poly([(x, cy - 4.5), (x + sx * 9, cy), (x, cy + 4.5)]), STEEL2, INK, 1.3))
    g.append(rrect(22, cy - 6.5, 26, 13, 3, "#15101F", INK, LB))
    for sx in (-7, 0, 7):                                         # studs facing us
        g.append(path(poly([(cx + sx - 3.2, cy + 3.2), (cx + sx, cy - 4.2), (cx + sx + 3.2, cy + 3.2)]), STEEL2, INK, 1.1))
        g.append(line(cx + sx - 0.8, cy + 1.6, cx + sx, cy - 1.8, "#FFFFFF", 0.9, 'opacity="0.7"'))
    g.append(rect(28, B - 114, 14, 7.5, IRON, INK, LM))
    # the fluted post, tapering a touch
    top = 124; bot = B - 114
    g.append(path(poly([(29, bot), (30.2, top), (39.8, top), (41, bot)]), IRON, INK, LB))
    for fx, col, op in ((32.4, IRONH, 0.75), (35, IRON2, 0.9), (37.6, IRON2, 0.9)):
        g.append(line(fx, top + 4, fx, bot - 4, col, 1.2, f'opacity="{op}"'))
    # the collar and the ladder bar with its ball ends
    g.append(rect(27, 114, 16, 10, IRON, INK, LB))
    g.append(rrect(10, 107, 50, 6, 3, IRON, INK, LM))
    g.append(line(14, 108.6, 56, 108.6, LIT, 1.1, 'opacity="0.45"'))       # lamplight on its top
    for bx in (9, 61):
        g.append(f'<circle cx="{bx}" cy="110" r="3.6" fill="{IRON}" stroke="{INK}" stroke-width="{LM}"/>')
    # the cup under the lantern and its drop
    g.append(path(poly([(21, 96), (49, 96), (42, 106), (28, 106)]), IRON, INK, LB))
    g.append(line(25, 98.5, 45, 98.5, LIT, 1.4, 'opacity="0.55"'))
    # the lantern: lit glass, three panes (a hexagonal lantern, front on), a hot mantle
    glass = [(23, 96), (15, 50), (55, 50), (47, 96)]
    g.append(path(poly(glass), "url(#lampglass)", INK, LB))
    g.append(ellipse(35, 76, 4.2, 6.2, "#FFFDF2", "none", 0, 'opacity="0.9"'))
    g.append(line(35, 82, 35, 94, "#B8703A", 1.4, 'opacity="0.7"'))
    g.append(line(19.5, 58, 22.5, 90, "#FFFFFF", 1.6, 'opacity="0.5"'))
    for (x0, x1) in ((30, 27), (40, 43)):
        g.append(line(x0, 96, x1, 50, IRON, 3.0))
        g.append(line(x0, 96, x1, 50, INK, 1.0, 'opacity="0.6"'))
    g.append(path(poly(glass), "none", INK, LB))
    # the top rim and the bell canopy
    g.append(rect(12, 44, 46, 7, IRON, INK, LB))
    g.append(line(15, 49.2, 55, 49.2, LIT, 1.3, 'opacity="0.5"'))
    g.append(path("M8,45 C14,36 24,31 29,26 L41,26 C46,31 56,36 62,45 Z", IRON, INK, LB))
    g.append(path("M16,40 C22,35 27,32 31,29", "none", IRONH, 1.6, 'opacity="0.6"'))
    g.append(rect(30, 20, 10, 7, IRON, INK, LM))
    g.append(f'<circle cx="35" cy="17" r="4" fill="{IRON}" stroke="{INK}" stroke-width="{LM}"/>')
    # the crown finial
    g.append(path(crown_d(35, 1.5, 20, 12), GOLD2, INK, 1.4))
    g.append(line(26.5, 11.5, 43.5, 11.5, GOLD, 1.2, 'opacity="0.8"'))
    for (px, py) in ((25, 3.4), (35, 1.5), (45, 3.4)):
        g.append(f'<circle cx="{px}" cy="{py}" r="1.8" fill="{GOLD}" stroke="{INK}" stroke-width="0.9"/>')
    svg("lamp", W, H, g, defs=defs)
    return dict(name="lamp", W=W, H=H, base=B, kind="prop",
                anchors=dict(light=[dict(x=35, y=73, what="lantern glass centre: warm glow + light pool on the pavement below")]))

# =============================================================== the hydrant
def hydrant():
    """A chunky teal fire hydrant: a bolted foot, the barrel, a collar, a dome bonnet and its nut, gold caps on
    the two side outlets and the big pumper outlet on the front, one cap on a little chain."""
    W, H = 48, 90; B = H - 8; cx = W / 2
    T1 = TEAL; T2 = "#1F5B66"; TH = "#7FC9CF"
    defs = soft_shadow("hydshade")
    g = [contact("hydshade", cx, B, 22, 4.5)]
    g.append(rect(7, B - 9, 34, 9, T2, INK, LB))                                   # foot flange
    for bx in (12, 24, 36):
        g.append(f'<circle cx="{bx}" cy="{B-4.5}" r="1.6" fill="{GOLD2}" stroke="{INK}" stroke-width="0.8"/>')
    g.append(rect(11, B - 46, 26, 37, T1, INK, LB))                                # barrel
    g.append(rect(30, B - 44, 6, 33, T2, "none", 0, 'opacity="0.6"'))
    g.append(line(15, B - 42, 15, B - 13, TH, 1.8, 'opacity="0.6"'))
    # side outlets
    for sx in (-1, 1):
        x0 = cx + sx * 13; x1 = cx + sx * 19
        g.append(rect(min(x0, x1), B - 38, 6, 11, T1, INK, LM))
        cxp = cx + sx * 21
        g.append(rrect(cxp - 3, B - 40, 6, 15, 2, GOLD2, INK, LM))
        g.append(line(cxp - sx * 1, B - 38, cxp - sx * 1, B - 28, GOLD, 1.1, 'opacity="0.8"'))
    # the chain from the left cap, sagging
    for (lx, ly) in ((cx - 20, B - 23), (cx - 18, B - 20), (cx - 15.5, B - 18.6), (cx - 13, B - 19.4)):
        g.append(ellipse(lx, ly, 1.5, 1.1, "none", GOLD2, 1.0))
    # front pumper outlet
    g.append(f'<circle cx="{cx}" cy="{B-26}" r="7.5" fill="{GOLD2}" stroke="{INK}" stroke-width="{LM}"/>')
    g.append(path(poly([(cx - 3, B - 29), (cx + 3, B - 29), (cx + 4.5, B - 26), (cx + 3, B - 23), (cx - 3, B - 23), (cx - 4.5, B - 26)]), "#A9812E", INK, 1.0))
    g.append(path(f"M{cx-5},{B-29} Q{cx-4},{B-32} {cx-1},{B-32.5}", "none", GOLD, 1.2, 'opacity="0.9"'))
    # collar and bonnet
    g.append(rect(8, B - 53, 32, 8, T2, INK, LB))
    for bx in (13, 24, 35):
        g.append(f'<circle cx="{bx}" cy="{B-49}" r="1.5" fill="{GOLD2}" stroke="{INK}" stroke-width="0.8"/>')
    g.append(path(f"M11,{B-53} C11,{B-65} 16,{B-70} 24,{B-70} C32,{B-70} 37,{B-65} 37,{B-53} Z", T1, INK, LB))
    g.append(path(f"M15,{B-57} C15,{B-63} 18,{B-66} 22,{B-67}", "none", TH, 1.8, 'opacity="0.65"'))
    g.append(path(poly([(19, B - 69), (19, B - 75), (22, B - 77), (26, B - 77), (29, B - 75), (29, B - 69)]), GOLD2, INK, LM))
    g.append(line(21, B - 74.5, 24, B - 76, GOLD, 1.1, 'opacity="0.9"'))
    svg("hydrant", W, H, g, defs=defs)
    return dict(name="hydrant", W=W, H=H, base=B, kind="prop", anchors={})

# =============================================================== the mailbox
def mailbox():
    """A round-top pillar box in ruby with pink light on its left: the domed cap, the slot with a letter half
    posted (a heart seal on it), a gold crown where the royal cipher would be, a blank collection plate, the
    door's seam and keyhole, a black plinth."""
    W, H = 64, 150; B = H - 8; cx = W / 2
    R1 = RUBY; R2 = "#5E1020"; RH = PINK
    defs = soft_shadow("mailshade")
    g = [contact("mailshade", cx, B, 30, 5.5)]
    g.append(rect(8, B - 13, 48, 13, "#211630", INK, LB))                         # plinth
    g.append(line(11, B - 10, 53, B - 10, IRONH, 1.2, 'opacity="0.5"'))
    g.append(rect(11, B - 100, 42, 88, R1, INK, LB))                               # the pillar
    g.append(rect(42, B - 98, 10, 85, R2, "none", 0, 'opacity="0.55"'))
    g.append(line(16, B - 94, 16, B - 17, RH, 2.2, 'opacity="0.55"'))
    g.append(rect(10, B - 21, 44, 8, R2, INK, LM))                                 # the foot band
    # the door seam and keyhole
    g.append(rrect(17, B - 61, 30, 39, 3, "none", INK, 1.1, extra='opacity="0.45"'))
    g.append(path(f"M{cx-1.6},{B-32} L{cx+1.6},{B-32} L{cx+1},{B-27} L{cx-1},{B-27} Z", "#1A0710", "none", 0))
    g.append(f'<circle cx="{cx}" cy="{B-33}" r="2" fill="#1A0710"/>')
    # collection plate (blank)
    g.append(rrect(20, B - 56, 24, 13, 2, "#E6D9F0", INK, LM))
    g.append(line(24, B - 51.8, 40, B - 51.8, "#9C88B5", 1.1, 'opacity="0.7"'))
    g.append(line(24, B - 47.8, 36, B - 47.8, "#9C88B5", 1.1, 'opacity="0.7"'))
    # the crown
    g.append(path(crown_d(cx, B - 76, 18, 11), GOLD2, INK, 1.3))
    g.append(line(cx - 7.5, B - 67.2, cx + 7.5, B - 67.2, GOLD, 1.1, 'opacity="0.8"'))
    for (px, py) in ((cx - 9, B - 74), (cx, B - 76), (cx + 9, B - 74)):
        g.append(f'<circle cx="{px}" cy="{py}" r="1.6" fill="{GOLD}" stroke="{INK}" stroke-width="0.8"/>')
    # the slot, a letter stuck half in it (heart seal), and the slot's hood over the letter's top
    g.append(rect(18, B - 95, 28, 6, "#1A0710", INK, LM))
    g.append('<g transform="rotate(-8 33 -0)">'.replace("-0", str(B - 92)))
    g.append(path(poly([(23, B - 93), (43, B - 93), (43, B - 82), (23, B - 82)]), "#F2E8D8", INK, 1.3))
    g.append(path(f"M23,{B-93} L33,{B-86.5} L43,{B-93}", "none", "#B9A48F", 1.1))
    g.append(path(heart_d(33, B - 86.5, 6), PINK, INK, 0.9))
    g.append('</g>')
    g.append(rect(15, B - 100, 34, 6, R2, INK, LM))
    # the cap: a rim band and the dome
    g.append(rect(6, B - 110, 52, 10, R1, INK, LB))
    g.append(rect(6, B - 104, 52, 4, R2, "none", 0, 'opacity="0.6"'))
    g.append(path(f"M9,{B-110} C9,{B-128} 19,{B-136} 32,{B-136} C45,{B-136} 55,{B-128} 55,{B-110} Z", R1, INK, LB))
    g.append(path(f"M15,{B-114} C15,{B-124} 21,{B-130} 29,{B-132}", "none", RH, 2.2, 'opacity="0.6"'))
    g.append(line(9, B - 107.5, 55, B - 107.5, RH, 1.2, 'opacity="0.4"'))
    g.append(f'<circle cx="{cx}" cy="{B-137}" r="3" fill="{R1}" stroke="{INK}" stroke-width="{LM}"/>')
    svg("mailbox", W, H, g, defs=defs)
    return dict(name="mailbox", W=W, H=H, base=B, kind="prop", anchors={})

# =============================================================== the planter
def planter():
    """A wooden planter box: corner posts, planks, a cap rail with a heart cut in the front board, a lush mound of
    leaves, and flowers in the house accents (pink, lavender, gold) on stems of different heights."""
    W, H = 100, 112; B = H - 8
    WD = WOOD; WD2 = WOOD2; WDL = "#76506A"
    LEAF = "#2C5638"; LEAF2 = "#4F8A4E"; LEAFD = "#1D3B28"
    defs = soft_shadow("plantshade")
    g = [contact("plantshade", 50, B, 47, 5.5)]
    for fx in (14, 78):                                                            # feet
        g.append(rect(fx, B - 8, 8, 8, WD2, INK, LM))
    # the back of the mound
    g.append(path(smooth_closed([(8, 64), (9, 50), (18, 40), (30, 40), (38, 32), (52, 33), (62, 29), (76, 35), (86, 38), (93, 50), (93, 64)], 0.5), LEAFD, INK, LM))
    for (lx, ly, a) in ((20, 42, -40), (46, 34, -10), (70, 34, 20), (88, 44, 45)):
        g.append(f'<g transform="rotate({a} {lx} {ly})">')
        g.append(path(f"M{lx-8},{ly} C{lx-4},{ly-6} {lx+4},{ly-6} {lx+8},{ly} C{lx+4},{ly+5} {lx-4},{ly+5} {lx-8},{ly} Z", LEAFD, INK, 1.1))
        g.append('</g>')
    flowers = [(18, 30, PINK, 1.0), (33, 20, GOLD, 0.95), (47, 10, LAV2, 1.1), (62, 18, PINK, 1.05), (80, 26, LAV2, 1.0),
               (27, 40, LAV2, 0.85), (55, 34, GOLD, 0.9), (72, 40, PINK, 0.85), (41, 42, PINK, 0.8)]
    for (fx, fy, col, k) in flowers:                                               # stems
        g.append(path(f"M{fx},{fy+4} Q{fx+(50-fx)*0.08},{fy+16} {fx+(50-fx)*0.16},{58}", "none", LEAF2, 1.8))
    for (fx, fy, col, k) in flowers:                                               # heads
        r = 6.4 * k
        for i in range(5):
            a = -math.pi / 2 + i * 2 * math.pi / 5 + (fx % 7) * 0.1
            g.append(f'<circle cx="{fx + math.cos(a)*r*0.88:.1f}" cy="{fy + math.sin(a)*r*0.88:.1f}" r="{r*0.6:.1f}" fill="{col}" stroke="{INK}" stroke-width="1.0"/>')
        g.append(f'<circle cx="{fx}" cy="{fy}" r="{r*0.42:.1f}" fill="{GOLD2 if col != GOLD else RUBY}" stroke="{INK}" stroke-width="0.9"/>')
        g.append(f'<circle cx="{fx - r*0.5:.1f}" cy="{fy - r*0.9:.1f}" r="{r*0.18:.1f}" fill="#FFFFFF" opacity="0.6"/>')
    # the front row of leaves, over the stems
    for (lx, ly, a) in ((13, 56, -35), (25, 51, -12), (38, 54, 8), (51, 49, -6), (63, 53, 14), (76, 50, 28), (88, 56, 40)):
        g.append(f'<g transform="rotate({a} {lx} {ly})">')
        g.append(path(f"M{lx-10},{ly} C{lx-5},{ly-7.5} {lx+5},{ly-7.5} {lx+10},{ly} C{lx+5},{ly+6.5} {lx-5},{ly+6.5} {lx-10},{ly} Z", LEAF, INK, 1.2))
        g.append(line(lx - 7, ly, lx + 7, ly - 0.5, LEAF2, 1.1, 'opacity="0.85"'))
        g.append('</g>')
    # the box: a slight flare, planks, posts, the cap rail
    g.append(path(poly([(11, 62), (89, 62), (86, B - 8), (14, B - 8)]), WD, INK, LB))
    for py in (75, 87):
        g.append(line(13, py, 87, py, WD2, 1.5))
    g.append(path(heart_d(50, 81, 13), "#1C1020", INK, 1.1))
    g.append(path(poly([(11, 62), (20, 62), (20, B - 8), (14, B - 8)]), WDL, INK, LM))
    g.append(path(poly([(80, 62), (89, 62), (86, B - 8), (80, B - 8)]), WDL, INK, LM))
    g.append(line(15.5, 66, 16.5, B - 11, "#A57C98", 1.2, 'opacity="0.55"'))
    g.append(rect(6, 56, 88, 8, WDL, INK, LB))
    g.append(line(9, 58.5, 91, 58.5, "#A87E9C", 1.2, 'opacity="0.6"'))
    # two leaves spilling over the rail, so the plant sits in the box and not behind it
    g.append(path("M66,56 C70,63 77,68 85,68 C83,61 76,56 66,56 Z", LEAF, INK, 1.2))
    g.append(path("M78,60 C79,63 81,65 84,66", "none", LEAF2, 1.0))
    g.append(path("M30,56 C27,62 22,66 15,67 C17,61 22,57 30,56 Z", LEAF, INK, 1.2))
    svg("planter", W, H, g, defs=defs)
    return dict(name="planter", W=W, H=H, base=B, kind="prop", anchors={})

# =============================================================== the bin
def bin_():
    """A cast-iron litter bin (the lamp's iron) with a gold band and a pink heart on it, an open top, and the
    evidence of a cat's raid: a fish skeleton poking out head first, a crumpled paper ball, a pink can."""
    W, H = 58, 112; B = H - 8; cx = W / 2
    BONE = "#EDE6F4"
    defs = soft_shadow("binshade")
    g = [contact("binshade", cx, B, 26, 4.8)]
    g.append(rect(12, B - 6, 34, 6, IRON2, INK, LM))                               # foot ring
    # the trash, inside and behind the rim
    g.append(path(poly([(38, 44), (38.5, 30), (48, 29.5), (47.5, 44)]), PINK, INK, 1.3))       # a can
    g.append(ellipse(43.2, 30, 4.8, 1.6, "#F7A9C2", INK, 1.0))
    g.append(line(40.6, 33, 40.8, 42, "#FFFFFF", 1.1, 'opacity="0.5"'))
    g.append(path(poly([(9, 44), (10, 33), (14, 26), (20, 25), (24, 20), (31, 23), (34, 30), (33, 38), (30, 44)]), "#E9E1F2", INK, LM))
    g.append(path("M14,26 L18,33 L11,37 M18,33 L25,30 L24,20 M25,30 L30,37 M18,33 L20,42 M25,30 L33,31", "none", "#9C8BB6", 1.1))
    # the fish skeleton: tail down in the bin, the skull out, leaning right
    g.append('<g transform="translate(33 42) rotate(-62)">')
    g.append(path(poly([(-2, 0), (-9, -6), (-7, 0), (-9, 6)]), BONE, INK, 1.1))                  # tail
    g.append(line(-2, 0, 28, 0, BONE, 2.6))
    g.append(line(-2, 0, 28, 0, INK, 0.8, 'opacity="0.5"'))
    for rx in (6, 12, 18, 23):
        g.append(path(f"M{rx},-6.5 Q{rx+2},0 {rx},6.5", "none", BONE, 1.7))
        g.append(path(f"M{rx},-6.5 Q{rx+2},0 {rx},6.5", "none", INK, 0.6, 'opacity="0.45"'))
    g.append(path(smooth_closed([(27, -1), (30, -7), (38, -6), (42, 0), (38, 6), (30, 7)], 0.5), BONE, INK, 1.3))      # skull
    g.append(f'<circle cx="34" cy="-2" r="1.9" fill="{INK}"/>')
    g.append(path("M38,2 L41,1", "none", INK, 0.9))
    g.append('</g>')
    # the body: a tapered barrel with slats
    g.append(path(poly([(9, 46), (49, 46), (46, B - 6), (12, B - 6)]), IRON, INK, LB))
    for k in range(1, 6):
        u = k / 6
        xt = 9 + 40 * u; xb = 12 + 34 * u
        g.append(line(xt, 62, xb, B - 9, IRON2, 1.6, 'opacity="0.9"'))
        g.append(line(xt + 1.8, 62, xb + 1.6, B - 9, IRONH, 1.0, 'opacity="0.35"'))
    g.append(path(poly([(9.6, 51), (48.4, 51), (47.6, 63), (10.4, 63)]), GOLD2, INK, LM))
    g.append(line(11, 53.8, 47, 53.8, GOLD, 1.1, 'opacity="0.8"'))
    g.append(path(heart_d(cx, 57.2, 9), PINK, INK, 0.9))
    g.append(line(14.5, 68, 16.4, B - 12, IRONH, 1.8, 'opacity="0.5"'))
    # the rim
    g.append(rrect(5, 41, 48, 8, 3, IRON, INK, LB))
    g.append(line(8, 43.8, 50, 43.8, IRONH, 1.2, 'opacity="0.6"'))
    svg("bin", W, H, g, defs=defs)
    return dict(name="bin", W=W, H=H, base=B, kind="prop", anchors={})

# =============================================================== the far city
SKY_BACK  = "#1E1236"
SKY_FRONT = "#251544"
WIN_DIM   = "#4A3470"
WIN_DIM2  = "#3D2B62"      # the back layer's windows, a shade further off
WIN_WARM  = "#E8C27A"

def _rdp(pts, eps):
    """Ramer-Douglas-Peucker: drop the points a polyline does not need."""
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x0, y0), (x1, y1) = pts[a], pts[b]
        dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy) or 1e-9
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - x0) - dx * (pts[i][1] - y0)) / L
            if d > best: best, bi = d, i
        if best > eps:
            keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

class Layer:
    """One depth of a strip, drawn as ONE silhouette: every grounded shape (a block, a gable, a spire, a dome...)
    adds a top edge y(x) over its span, and the layer's outline is the lowest y at every x (their union, with no
    hidden edges to pay for). Free-standing pieces (a water tank on legs, a crane's jib) are separate shapes.
    Everything wraps at the strip's width, so the strip tiles seamlessly."""
    def __init__(self, W, H, fill):
        self.W, self.H, self.fill = W, H, fill; self.BOT = H + 8
        self.tops = []; self.free = []; self.wins = []; self.warm = []
    # grounded tops
    def rect(self, x0, x1, top): self.tops.append((x0, x1, lambda x, t=top: t))
    def lin(self, x0, x1, y0, y1): self.tops.append((x0, x1, lambda x, a=x0, b=x1, p=y0, q=y1: p + (q - p) * (x - a) / (b - a)))
    def tri(self, xc, hw, base, tip): self.lin(xc - hw, xc, base, tip); self.lin(xc, xc + hw, tip, base)
    def dome(self, xc, rx, base, ry):
        self.tops.append((xc - rx, xc + rx, lambda x, c=xc, r=rx, b=base, q=ry: b - q * math.sqrt(max(0.0, 1 - ((x - c) / r) ** 2))))
    def fn(self, x0, x1, f): self.tops.append((x0, x1, f))
    # wrapping helpers for free shapes and windows
    def _shifts(self, x0, x1):
        out = [0]
        if x1 > self.W: out.append(-self.W)
        if x0 < 0: out.append(self.W)
        return out
    def poly(self, pts, fill=None, extra=""):
        xs = [q[0] for q in pts]
        for dx in self._shifts(min(xs), max(xs)):
            self.free.append(path(poly([(x + dx, y) for x, y in pts]), fill or self.fill, "none", 0, extra))
    def stroke(self, segs, sw, fill=None):
        """segs: [((x0, y0), (x1, y1)), ...] straight strokes in the layer's colour."""
        xs = [q[0] for sg in segs for q in sg]
        for dx in self._shifts(min(xs), max(xs)):
            d = " ".join(f"M{a[0]+dx:.1f},{a[1]:.1f} L{b[0]+dx:.1f},{b[1]:.1f}" for a, b in segs)
            self.free.append(path(d, "none", fill or self.fill, sw))
    def win(self, x, y, w, h, warm=False):
        for dx in self._shifts(x, x + w):
            (self.warm if warm else self.wins).append((x + dx, y, w, h))
    def outline(self):
        W = self.W; shapes = []
        for (x0, x1, f) in self.tops:
            for dx in (-W, 0, W):
                if x1 + dx > -60 and x0 + dx < W + 60: shapes.append((x0 + dx, x1 + dx, f, dx))
        xs = set(float(x) for x in range(-40, W + 41, 2))
        for (a, b, f, dx) in shapes:
            xs.update((a - 0.02, a + 0.02, b - 0.02, b + 0.02))
        xs = sorted(x for x in xs if -40 <= x <= W + 40)
        shapes.sort(key=lambda s_: s_[0])
        pts = []
        for x in xs:
            y = self.BOT
            for (a, b, f, dx) in shapes:
                if a > x: break
                if x <= b:
                    v = f(x - dx)
                    if v < y: y = v
            pts.append((x, y))
        pts = _rdp(pts, 0.25)
        return path("M-40," + f"{self.BOT} L" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + f" L{W+40},{self.BOT} Z", self.fill, "none", 0)
    def windows_svg(self, dim, warm_op=0.6):
        def polys(lst):
            return "".join(f'<polygon points="{x:.1f},{y:.1f} {x+w:.1f},{y:.1f} {x+w:.1f},{y+h:.1f} {x:.1f},{y+h:.1f}"/>' for x, y, w, h in lst)
        out = []
        if self.wins: out.append(f'<g fill="{dim}">{polys(self.wins)}</g>')
        if self.warm: out.append(f'<g fill="{WIN_WARM}" opacity="{warm_op}">{polys(self.warm)}</g>')
        return out
    def svg(self, dim, warm_op=0.6):
        return [self.outline()] + self.free + self.windows_svg(dim, warm_op)

def facade_windows(L, rnd, x, w, top, bottom, density=1.0, warm_p=0.17, grid=(9, 11, 3, 4.2)):
    """Sparse, clustered windows on one facade: a few lit blocks (an office floor, a flat, a stairwell) and the odd
    single light. grid = (col pitch, row pitch, window w, window h)."""
    cw, rh, ww, wh = grid
    cols = max(1, int((w - 5) // cw)); rows = max(1, int((bottom - top - 8) // rh))
    x0 = x + (w - cols * cw) / 2 + (cw - ww) / 2; y0 = top + 7
    lit = {}
    n = int(round(rnd.uniform(0.3, 1.3) * density * (1 + cols * rows / 60)))
    for _ in range(n):
        if rnd.random() < 0.18 and rows > 4:                       # a stairwell: one column, many floors
            c = rnd.randrange(cols); r0 = rnd.randrange(rows); cells = [(c, r) for r in range(r0, min(rows, r0 + rnd.randint(3, 7)))]; p = 0.8
        else:                                                      # a block of rooms, or one lit floor
            cw_ = rnd.randint(2, 5); rh_ = rnd.choice([1, 1, 2, 2, 3])
            c0 = rnd.randrange(max(1, cols - cw_ + 1)); r0 = rnd.randrange(max(1, rows - rh_ + 1))
            cells = [(c, r) for c in range(c0, min(cols, c0 + cw_)) for r in range(r0, min(rows, r0 + rh_))]; p = 0.6
        warm = rnd.random() < warm_p
        for cell in cells:
            if rnd.random() < p: lit[cell] = lit.get(cell, False) or warm
    for c in range(cols):
        for r in range(rows):
            if (c, r) not in lit and rnd.random() < 0.02 * density: lit[(c, r)] = rnd.random() < 0.25
    for (c, r), warm in lit.items():
        L.win(x0 + c * cw, y0 + r * rh, ww, wh, warm)

BACK_GRID = (7, 9, 2.2, 3.2)
FRONT_GRID = (9, 11, 3, 4.2)

def skyline():
    """The far city on the horizon, in two depths of pure silhouette. Back: downtown and its needle tower with the
    beacon (a crown of stepped arches), a gothic tower with pinnacles, a slant-topped slab, a round-topped
    'lipstick' tower, an observatory dome with its slit lit, a crane over a half-built block, a pyramid top, stepped
    blocks. Front, lower: a factory with three stacks, two water towers on stilts, a church spire, a clock tower
    with a warm dial, gabled rows with chimneys. No ink: two violets and sparse, clustered windows."""
    W, H = 3200, 340
    rnd = random.Random(11)
    back = Layer(W, H, SKY_BACK); front = Layer(W, H, SKY_FRONT)
    anchors = {}
    bw = lambda *a, **k: facade_windows(back, rnd, *a, grid=BACK_GRID, **k)
    fw = lambda *a, **k: facade_windows(front, rnd, *a, grid=FRONT_GRID, **k)

    def b_block(x, w, top, dens=0.7):
        back.rect(x, x + w, top); bw(x, w, top, H - 6, dens)
    def b_stepped(x, w, tiers, dens=0.7):
        prev = H - 6
        for ins, top in tiers:
            back.rect(x + ins, x + w - ins, top); bw(x + ins, w - 2 * ins, top, prev, dens); prev = top
    def b_antenna(x, top, h, sw=1.8):
        back.stroke([((x, top + 2), (x, top - h))], sw)
    def f_antenna(x, top, h, sw=1.8):
        front.stroke([((x, top + 2), (x, top - h))], sw)

    # ------------------------------------------------ the back layer, zone by zone
    zones = [(-30, 180, 190, 240), (180, 520, 150, 220), (520, 640, 226, 252), (830, 975, 200, 240), (975, 1105, 238, 258),
             (1105, 1175, 170, 210), (1950, 2150, 168, 226), (2150, 2305, 222, 256), (2420, 2560, 198, 236), (2980, 3230, 226, 258)]
    for (z0, z1, lo, hi) in zones:
        x = z0
        while x < z1 - 20:
            w = min(rnd.choice([34, 42, 50, 58, 66, 78, 92]), z1 - x)
            top = rnd.uniform(lo, hi); r = rnd.random()
            if r < 0.25 and w >= 40:
                b_stepped(x, w, [(0, top + 26), (w * 0.18, top)])
            elif r < 0.33 and w >= 40:
                back.rect(x, x + w, top + 16); back.tri(x + w / 2, w / 2, top + 16, top - 14); bw(x, w, top + 16, H - 6, 0.6)
            elif r < 0.42:
                back.lin(x, x + w, top + 10, top - 6); back.rect(x, x + w, top + 10); bw(x, w, top + 10, H - 6, 0.6)
            else:
                b_block(x, w, top, 0.6)
                if rnd.random() < 0.3: b_antenna(x + w * rnd.uniform(0.25, 0.75), top, rnd.uniform(8, 20))
                if rnd.random() < 0.35:
                    tx = x + w * rnd.uniform(0.1, 0.55); back.rect(tx, tx + rnd.uniform(8, 16), top - rnd.uniform(5, 9))
            x += w + rnd.choice([0, 0, 0, 0, 14, 20])
    # downtown, placed by hand around the needle
    b_block(1136, 58, 150)
    back.rect(1196, 1250, 108); back.tri(1200, 4, 110, 88); back.tri(1223, 5, 110, 80); back.tri(1246, 4, 110, 88)     # gothic, pinnacles
    bw(1196, 54, 108, H - 6, 0.9)
    b_block(1252, 44, 164)
    back.rect(1298, 1360, 104); back.lin(1298, 1360, 104, 76); bw(1298, 62, 104, H - 6, 0.9)                            # slant-topped slab
    b_block(1362, 30, 138)
    back.rect(1394, 1432, 92); bw(1394, 38, 92, H - 6, 0.8); b_antenna(1413, 92, 34, 1.6)                              # slender, tall mast
    b_block(1434, 36, 172)
    nx = 1520; nw = 96                                                                                                  # THE needle tower
    b_stepped(nx - nw / 2, nw, [(0, 160), (12, 116), (22, 84), (31, 62)], 0.9)
    for hw, top in ((17, 44), (11, 34), (6, 26)):
        back.rect(nx - hw, nx + hw, top + 10)
        back.fn(nx - hw, nx + hw, lambda x, hw=hw, top=top: top + 10 - 14 * math.sqrt(max(0.0, 1 - ((x - nx) / hw) ** 2)) ** 0.8)
    b_antenna(nx, 24, 17, 1.8)
    beacon = (nx, 6.5)
    for k, (wy, n) in enumerate(((70, 3), (78, 3), (92, 5), (100, 5))):
        for i in range(n):
            if rnd.random() < 0.7: back.win(nx - (n - 1) * 3.5 + i * 7 - 1.1, wy, 2.2, 3.2, k < 2)
    b_block(1570, 44, 146)
    b_stepped(1616, 84, [(0, 124), (14, 90), (26, 70)], 0.8); b_antenna(1658, 70, 16)                                     # art deco
    b_block(1702, 52, 158)
    b_block(1756, 104, 138, 0.8); back.rect(1780, 1796, 128); back.rect(1824, 1846, 131)                              # rooftop plant
    back.rect(1862, 1914, 116); back.dome(1888, 26, 117, 16); bw(1862, 52, 116, H - 6, 0.8)                             # round-topped
    b_block(1916, 40, 166)
    # the observatory: a dome on a drum on a long hall, its slit lit
    ox = 735
    back.rect(ox - 95, ox + 95, 208); bw(ox - 95, 190, 208, H - 6, 0.8)
    back.rect(ox - 42, ox + 42, 174); back.dome(ox, 40, 176, 40); back.rect(ox - 6, ox + 6, 128); b_antenna(ox, 128, 12, 1.6)
    back.win(ox + 9, 146, 4, 24, True)
    for wx_ in range(int(ox - 32), int(ox + 34), 12): back.win(wx_, 188, 3, 5, rnd.random() < 0.3)
    # the second cluster
    back.rect(2582, 2640, 118); back.tri(2611, 29, 118, 78); bw(2582, 58, 118, H - 6, 0.8)                             # pyramid top
    b_block(2642, 40, 150)
    b_block(2684, 70, 88, 0.8); b_antenna(2700, 88, 24, 1.6); b_antenna(2738, 88, 14, 1.6)
    b_block(2756, 34, 140)
    b_stepped(2792, 92, [(0, 150), (14, 120), (28, 100)], 0.8)
    back.rect(2886, 2934, 126); back.dome(2910, 24, 127, 14); bw(2886, 48, 126, H - 6, 0.8)
    b_block(2936, 46, 170)
    # a crane over a half-built block
    cx_ = 2362
    back.rect(cx_ - 50, cx_ + 50, 204); bw(cx_ - 50, 100, 204, H - 6, 0.4)
    back.rect(cx_ - 20, cx_ + 20, 188)
    back.stroke([((cx_, 190), (cx_, 90))], 3.4)
    back.stroke([((cx_ - 46, 94), (cx_ + 128, 94))], 2.6)
    back.stroke([((cx_, 80), (cx_ - 42, 93)), ((cx_, 80), (cx_ + 104, 93))], 1.1)
    back.stroke([((cx_, 92), (cx_, 78))], 2.2)
    back.poly([(cx_ - 46, 95), (cx_ - 46, 104), (cx_ - 28, 104), (cx_ - 28, 95)])
    back.stroke([((cx_ + 96, 95), (cx_ + 96, 134))], 1.0)
    back.poly([(cx_ + 91, 134), (cx_ + 101, 134), (cx_ + 101, 142), (cx_ + 91, 142)])
    anchors["beacon"] = dict(x=beacon[0], y=beacon[1], what="aircraft beacon on the needle tower's tip: blink red, slow (~1.6 s)")

    # ------------------------------------------------ the front layer: low roofs everywhere, landmarks where the back is low
    marks = [(30, 210), (500, 660), (975, 1105), (1290, 1374), (2172, 2300), (2380, 2576), (2630, 2706), (3020, 3110)]
    x = -30
    while x < W + 10:
        w = rnd.choice([36, 44, 52, 60, 70, 84, 100])
        if any(a - 10 < x + w and x < b + 10 for a, b in marks):
            x += 4; continue
        downtown = 1150 < x < 1950 or 2560 < x < 2980
        top = rnd.uniform(214, 262) if downtown else rnd.uniform(240, 292)
        r = rnd.random()
        if r < 0.22:
            front.rect(x, x + w, top + 20); front.rect(x + w * 0.2, x + w * 0.8, top); fw(x, w, top + 20, H - 6, 0.7)
        elif r < 0.42:
            front.rect(x, x + w, top + 14); front.tri(x + w / 2, w / 2 + 2, top + 14, top - 10); fw(x, w, top + 14, H - 6, 0.6)
            if rnd.random() < 0.6:
                cx0 = x + w * rnd.choice([0.22, 0.7]); front.rect(cx0, cx0 + 6, top - 4)
        else:
            front.rect(x, x + w, top); fw(x, w, top, H - 6, 0.7)
            if rnd.random() < 0.25: f_antenna(x + w * rnd.uniform(0.2, 0.8), top, rnd.uniform(8, 16))
            if rnd.random() < 0.3:
                tx = x + w * rnd.uniform(0.1, 0.6); front.rect(tx, tx + 10, top - 7)
        x += w + rnd.choice([0, 0, 0, 0, 16, 26])
    smoke = []
    # the factory: a saw-tooth roof and three stacks
    fx0, fx1 = 34, 206
    front.rect(fx0, fx1, 266)
    for k in range(5):
        a_ = fx0 + k * (fx1 - fx0) / 5; b_ = a_ + (fx1 - fx0) / 5
        front.lin(a_, b_ - 0.5, 248, 266)
    fw(fx0, fx1 - fx0, 266, H - 6, 1.2, warm_p=0.5)
    for sx, top, sw in ((66, 150, 13), (112, 168, 11), (170, 184, 12)):
        front.lin(sx - sw / 2 - 2.5, sx - sw / 2, 266, top); front.rect(sx - sw / 2, sx + sw / 2, top)
        front.lin(sx + sw / 2, sx + sw / 2 + 2.5, top, 266)
        front.poly([(sx - sw / 2 - 2.6, top + 6), (sx - sw / 2 - 2.6, top), (sx + sw / 2 + 2.6, top), (sx + sw / 2 + 2.6, top + 6)])
        front.poly([(sx - sw / 2 - 1.5, top + 16), (sx - sw / 2 - 1.5, top + 12), (sx + sw / 2 + 1.5, top + 12), (sx + sw / 2 + 1.5, top + 16)])
        smoke.append(dict(x=sx, y=top, what="factory stack: slow faint smoke (optional)"))
    def water_tower(x, roof):
        """A tank on four splayed legs, cross-braced, on a roof at y = roof."""
        tb = roof - 26; tt = tb - 30
        front.stroke([((x - 20, roof + 1), (x - 16, tb)), ((x - 7, roof + 1), (x - 6, tb)), ((x + 7, roof + 1), (x + 6, tb)), ((x + 20, roof + 1), (x + 16, tb))], 2.4)
        front.stroke([((x - 19, roof - 2), (x + 6.5, tb + 2)), ((x + 19, roof - 2), (x - 6.5, tb + 2)), ((x - 18, roof - 13), (x + 18, roof - 13))], 1.3)
        front.poly([(x - 21, tb + 1), (x - 21, tt), (x + 21, tt), (x + 21, tb + 1)])
        front.poly([(x - 24, tt + 1), (x, tt - 15), (x + 24, tt + 1)])
        front.stroke([((x, tt - 13), (x, tt - 21))], 1.6)
        front.stroke([((x - 21, tt + 10), (x + 21, tt + 10))], 1.0, WIN_DIM)
    front.rect(510, 650, 252); fw(510, 140, 252, H - 6, 0.8); water_tower(580, 252)
    # the church and its spire
    ch = 1030
    front.rect(ch - 44, ch + 36, 252); front.tri(ch - 4, 42, 252, 226)
    front.rect(ch + 28, ch + 62, 196); front.tri(ch + 45, 18, 198, 112); f_antenna(ch + 45, 114, 9, 1.6)
    front.win(ch + 41, 208, 8, 12, True)
    for k in range(3): front.win(ch - 30 + k * 16, 264, 4, 10, k == 1)
    # the second water tower, on a taller block
    front.rect(2182, 2290, 216); fw(2182, 108, 216, H - 6, 0.9); water_tower(2236, 216)
    # a row of gabled houses with chimneys
    for k, (hx, eave, ridge) in enumerate(((2386, 264, 240), (2434, 258, 232), (2482, 268, 246), (2530, 256, 230))):
        front.rect(hx, hx + 46, eave); front.tri(hx + 23, 25, eave, ridge)
        cxh = hx + (32 if k % 2 else 8); front.rect(cxh, cxh + 6, ridge + (eave - ridge) * abs(cxh + 3 - hx - 23) / 25 - 10)
        if rnd.random() < 0.85: front.win(hx + 18, eave + 12, 4, 5, rnd.random() < 0.55)
        if rnd.random() < 0.6: front.win(hx + 30, eave + 32, 4, 5, rnd.random() < 0.3)
    # rooftop billboards (blank boards on legs), dimly lit from below
    for (bx, roof, bwid) in ((1300, 236, 64), (2640, 232, 56)):
        front.rect(bx - 10, bx + bwid + 10, roof); fw(bx - 10, bwid + 20, roof, H - 6, 0.6)
        front.stroke([((bx + 8, roof + 1), (bx + 8, roof - 14)), ((bx + bwid - 8, roof + 1), (bx + bwid - 8, roof - 14)),
                      ((bx + 8, roof - 2), (bx + bwid - 8, roof - 12)), ((bx + bwid - 8, roof - 2), (bx + 8, roof - 12))], 1.6)
        front.poly([(bx, roof - 13), (bx, roof - 40), (bx + bwid, roof - 40), (bx + bwid, roof - 13)])
        front.stroke([((bx + 3, roof - 16), (bx + bwid - 3, roof - 16))], 1.2, WIN_DIM)
    # the clock tower: a warm dial under a pyramid cap
    ct = 3066
    front.rect(3024, 3108, 250); fw(3024, 84, 250, H - 6, 0.6)
    front.rect(ct - 20, ct + 20, 182); front.tri(ct, 25, 184, 146); f_antenna(ct, 148, 10, 1.6)
    front.free.append(f'<circle cx="{ct}" cy="202" r="8" fill="{WIN_WARM}" opacity="0.5"/>')
    front.stroke([((ct, 202), (ct, 196.5)), ((ct, 202), (ct + 4, 203.5))], 1.2)
    g = back.svg(WIN_DIM2, 0.55) + front.svg(WIN_DIM, 0.6)
    g.append(dot(beacon[0], beacon[1], 2.2, "#8A2E4E"))
    svg("skyline", W, H, g, step=14.0, decimals=1)
    nwin = len(back.wins) + len(front.wins); nwarm = len(back.warm) + len(front.warm)
    print(f"  skyline windows: {nwin} dim, {nwarm} warm")
    anchors["smoke"] = smoke
    anchors["light"] = [dict(x=ct, y=202, what="clock tower dial: faint warm glow"), dict(x=ox + 11, y=158, what="observatory slit: faint warm glow")]
    return dict(name="skyline", W=W, H=H, kind="strip", tiles=True, anchors=anchors)

# =============================================================== the hills
HILL_FAR  = "#221338"
HILL_NEAR = "#1A0F2E"
HILL_RIM  = "#3A2556"
TREE_FAR  = "#1B0F2F"
TREE_NEAR = "#130A23"
HOUSE     = "#120920"
SIGN      = "#A993C4"   # lit by the floods but far off: dimmer than anything on the street
SIGN2     = "#7A6698"
SIGNINK   = "#1A0F2E"

def _cr(pts):
    """y(x) along a Catmull-Rom curve through control points sorted by x (sampled every unit)."""
    from wobble import parse, _samples
    segs = parse(smooth_open(pts, 0.5))[0][1]
    smp = []
    for sg in segs: smp += _samples(sg, 1.0)
    smp.sort()
    xs = [q[0] for q in smp]; ys = [q[1] for q in smp]
    import bisect
    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = bisect.bisect_left(xs, x)
        x0, x1 = xs[i - 1], xs[i]; t = (x - x0) / ((x1 - x0) or 1)
        return ys[i - 1] + (ys[i] - ys[i - 1]) * t
    return f, xs[0], xs[-1]

def _glyphs():
    """EMOTOWN as block-letter polygons, 110 tall, each [(outer poly), (hole poly or None)], with its width."""
    E = ([(0, 0), (64, 0), (64, 22), (24, 22), (24, 44), (56, 44), (56, 66), (24, 66), (24, 88), (64, 88), (64, 110), (0, 110)], None, 64)
    M = ([(0, 110), (0, 0), (25, 0), (45, 40), (65, 0), (90, 0), (90, 110), (67, 110), (67, 46), (51, 78), (39, 78), (23, 46), (23, 110)], None, 90)
    def O():
        K = 0.5523
        def stadium(x, y, w, h, r):
            return rrect_d(x, y, w, h, r)
        return (stadium(0, 0, 80, 110, 36), stadium(23, 24, 34, 62, 15), 80)
    T = ([(0, 0), (76, 0), (76, 24), (49, 24), (49, 110), (27, 110), (27, 24), (0, 24)], None, 76)
    Wg = ([(0, 0), (22, 0), (32, 64), (43, 18), (61, 18), (72, 64), (82, 0), (104, 0), (85, 110), (63, 110), (52, 60), (41, 110), (19, 110)], None, 104)
    N = ([(0, 110), (0, 0), (22, 0), (56, 64), (56, 0), (78, 0), (78, 110), (56, 110), (22, 46), (22, 110)], None, 78)
    return [E, M, O(), T, O(), Wg, N]

def hills():
    """The mid distance: two tones of rolling hill (the far ones bigger, the near ones lower and rimmed with a
    little light), tree clumps along the ridges, two small villages and a few lone houses with lit windows, a
    radio mast with guy wires and a winding road up its hill, and the town's landmark on the biggest hill: EMOTOWN
    in tall white-lavender block letters on stilts, stepping up the slope, with lamps at their feet."""
    W, H = 4200, 440; BOT = H + 10
    rnd = random.Random(5)
    g = []
    anchors = {"signs": [], "light": [], "windows": []}

    def shifts(x0, x1):
        out = [0]
        if x1 > W: out.append(-W)
        if x0 < 0: out.append(W)
        return out
    def rims(hl, stroke, sw, op, hide=None):
        """Each hill's top edge, drawn only where no hill drawn after it stands in front."""
        copies = []
        for order, (f, a, b) in enumerate(hl):
            for dx in (-W, 0, W):
                if b + dx > -40 and a + dx < W + 40: copies.append((order, f, a + dx, b + dx, dx))
        out = []
        for (oi, f, a, b, dx) in copies:
            run = []
            x = max(a, -40.0)
            while x <= min(b, W + 40):
                y = f(x - dx)
                vis = y < H - 2 and not (hide and hide(x, y)) and not any(oj > oi and a2 <= x <= b2 and f2(x - dx2) < y - 0.4 for (oj, f2, a2, b2, dx2) in copies)
                if vis: run.append((x, y))
                if (not vis or x + 2 > min(b, W + 40)) and len(run) > 2:
                    pts = _rdp(run, 0.3)
                    out.append(path("M" + " L".join(f"{px:.1f},{py:.1f}" for px, py in pts), "none", stroke, sw, f'opacity="{op}"'))
                if not vis: run = []
                x += 2.0
        return out
    def layer_of(hl, fill):
        L = Layer(W, H, fill); L.BOT = BOT
        for (f, a, b) in hl: L.fn(a, b, lambda x, f=f: f(x))
        return L

    # ---------------- the far hills (bigger, behind) ----------------
    far = [
        [(-280, BOT), (-120, 330), (60, 236), (250, 194), (420, 190), (600, 248), (780, 350), (900, BOT)],
        [(640, BOT), (780, 330), (930, 262), (1060, 248), (1200, 300), (1360, BOT)],
        # the sign hill: a long shoulder, the crest, a slower fall
        [(1180, BOT), (1340, 330), (1500, 214), (1640, 150), (1800, 104), (1960, 44), (2090, 24), (2240, 44), (2420, 110), (2620, 196), (2800, 300), (2980, BOT)],
        [(2700, BOT), (2860, 300), (3000, 238), (3120, 250), (3260, 330), (3360, BOT)],
        # the mast hill
        [(3160, BOT), (3280, 330), (3400, 196), (3500, 150), (3600, 158), (3720, 236), (3860, 356), (3960, BOT)],
        [(3760, BOT), (3900, 312), (4060, 244), (4200, 236), (4320, 290), (4480, BOT)],
    ]
    # ---------------- the near hills (lower, in front, rimmed) ----------------
    near = [
        [(-120, BOT), (0, 380), (140, 334), (300, 318), (460, 346), (600, 398), (700, BOT)],
        [(520, BOT), (640, 360), (800, 306), (960, 296), (1110, 330), (1250, 400), (1330, BOT)],
        # the sign's shoulder: it climbs gently from left to right under the letters
        [(1330, BOT), (1440, 360), (1560, 290), (1660, 272), (1780, 266), (1900, 258), (2020, 252), (2150, 246), (2270, 238), (2360, 234), (2470, 246), (2600, 300), (2700, 380), (2780, BOT)],
        [(2680, BOT), (2780, 380), (2900, 326), (3050, 312), (3200, 340), (3330, 400), (3400, BOT)],
        [(3260, BOT), (3380, 384), (3520, 350), (3680, 346), (3820, 380), (3920, BOT)],
        [(3800, BOT), (3920, 372), (4060, 318), (4200, 300), (4340, 380), (4440, BOT)],
    ]
    fnear = [_cr(pts) for pts in near]
    def near_y(x):
        x = x % W; y = BOT
        for (f, a, b) in fnear:
            for dx in (0, -W, W):
                if a <= x + dx <= b: y = min(y, f(x + dx))
        return y
    ffar = [_cr(pts) for pts in far]
    g.append(layer_of(ffar, HILL_FAR).outline())
    g.extend(rims(ffar, "#2E1B4B", 1.6, 0.9, hide=lambda x, y: near_y(x) < y + 1))
    def far_y(x):
        x = x % W; y = BOT
        for (f, a, b) in ffar:
            for dx in (0, -W, W):
                if a <= x + dx <= b: y = min(y, f(x + dx))
        return y

    # ---------------- trees and lone houses on the far hills ----------------
    def clump(x0, x1, ground, fill, rmin, rmax, conifer_p=0.3, sink=6):
        """A clump of trees as one silhouette: round crowns and pointed firs along the ground between x0 and x1."""
        crowns = []; x = x0
        while x < x1:
            if rnd.random() < conifer_p:
                h = rnd.uniform(rmax * 2.2, rmax * 3.4); hw = h * 0.3
                crowns.append(("fir", x, ground(x), hw, h)); x += hw * rnd.uniform(0.9, 1.4)
            else:
                r = rnd.uniform(rmin, rmax); crowns.append(("round", x, ground(x) - r * rnd.uniform(0.7, 1.1), r, 0)); x += r * rnd.uniform(0.9, 1.4)
        xs = [x0 - rmax + k * 1.5 for k in range(int((x1 - x0 + 2 * rmax) / 1.5) + 1)]
        top = []
        for x in xs:
            y = ground(x) + 2
            for kind, cx, cy, a, h in crowns:
                if kind == "round":
                    if abs(x - cx) < a: y = min(y, cy - math.sqrt(a * a - (x - cx) ** 2))
                else:
                    if abs(x - cx) < a: y = min(y, cy - h * (1 - abs(x - cx) / a))
            top.append((x, y))
        top = _rdp(top, 0.5)
        n_ = max(2, int((xs[-1] - xs[0]) / 12))
        bottom = [(xs[-1] - (xs[-1] - xs[0]) * k / n_, ground(xs[-1] - (xs[-1] - xs[0]) * k / n_) + sink) for k in range(n_ + 1)]
        for dx in shifts(xs[0], xs[-1]):
            g.append(path(poly([(x + dx, y) for x, y in top + bottom]), fill, "none", 0))
    def house(x, ground, w, h, roof, fill=HOUSE, lit=1, warm_p=0.8, chimney=True):
        base = max(ground(x), ground(x + w)) + 3
        eave = base - h
        pts = [(x, base), (x, eave), (x - 2, eave), (x + w / 2, eave - roof), (x + w + 2, eave), (x + w, eave), (x + w, base)]
        for dx in shifts(x - 3, x + w + 3):
            g.append(path(poly([(px + dx, py) for px, py in pts]), fill, "none", 0))
            if chimney:
                cx_ = x + w * 0.72 + dx
                g.append(path(poly([(cx_, eave - roof * 0.35), (cx_, eave - roof * 0.75 - 4), (cx_ + 4, eave - roof * 0.75 - 4), (cx_ + 4, eave - roof * 0.2)]), fill, "none", 0))
        wins = []
        for k in range(lit):
            wx = x + w * (0.22 + 0.4 * k) ; wy = eave + h * 0.3
            warm = rnd.random() < warm_p
            wins.append((wx, wy, warm))
            for dx in shifts(wx, wx + 3):
                g.append(f'<polygon points="{wx+dx:.1f},{wy:.1f} {wx+dx+3.2:.1f},{wy:.1f} {wx+dx+3.2:.1f},{wy+3.6:.1f} {wx+dx:.1f},{wy+3.6:.1f}" fill="{WIN_WARM if warm else WIN_DIM}" opacity="{0.85 if warm else 1}"/>')
        return wins

    for (x0, x1) in ((300, 470), (950, 1120), (2950, 3080), (3990, 4160), (1380, 1460)):
        clump(x0, x1, far_y, TREE_FAR, 5, 9, 0.35)
    for (x0, x1) in ((2440, 2520), (1540, 1600)):
        clump(x0, x1, far_y, TREE_FAR, 4, 7, 0.5)
    for (hx, w_, h_) in ((520, 14, 9), (560, 12, 8), (3060, 13, 9), (4090, 12, 8)):
        for (wx, wy, warm) in house(hx, far_y, w_, h_, 6, TREE_FAR, 1, 0.8):
            if warm: anchors["windows"].append(dict(x=round(wx % W, 1), y=round(wy, 1), w=3.2, h=3.6))

    # ---------------- the radio mast and the road up its hill ----------------
    mx = 3540; mb = far_y(mx) + 2; mt = mb - 128
    mast = []
    for sx in (-1, 1):
        mast.append(line(mx + sx * 7, mb, mx + sx * 1.2, mt + 8, TREE_NEAR, 1.8))
    zig = [(mx + (7 - 5.8 * (1 - (mb - y) / (mb - mt - 8)) * 0) * 0, y) for y in range(int(mb), int(mt + 8), -12)]
    d = ""
    for k, y in enumerate(range(int(mb), int(mt + 14), -12)):
        u = (mb - y) / (mb - mt - 8); half = 7 - 5.8 * u
        u2 = (mb - (y - 12)) / (mb - mt - 8); half2 = 7 - 5.8 * u2
        sgn = 1 if k % 2 else -1
        d += f"M{mx + sgn * half:.1f},{y} L{mx - sgn * half2:.1f},{y - 12} "
    mast.append(path(d, "none", TREE_NEAR, 1.0))
    for (y, a) in ((mt + 40, 12), (mt + 80, 9)):
        mast.append(line(mx - a, y, mx + a, y, TREE_NEAR, 1.4))
    mast.append(line(mx, mt + 8, mx, mt - 6, TREE_NEAR, 1.4))
    for (ax, frac) in ((mx - 70, 0.35), (mx + 64, 0.3), (mx - 40, 0.62), (mx + 38, 0.62)):
        yy = mt + (mb - mt) * frac
        mast.append(line(mx, yy, ax, far_y(ax) + 2, "#2C1A48", 0.7, 'opacity="0.8"'))
    g.extend(mast)
    g.append(dot(mx, mt - 7, 2.4, "#8A2238"))
    g.append(dot(mx, mt + 60, 1.8, "#8A2238"))
    anchors["light"].append(dict(x=mx, y=mt - 7, what="radio mast tip: red warning light, blink (~1.2 s)"))
    anchors["light"].append(dict(x=mx, y=mt + 60, what="radio mast mid light: red, blink out of step with the tip (optional)"))
    # the road: switchbacks from the valley up to the mast, a few lamps along it
    road = [(3300, far_y(3300) + 34), (3470, far_y(3470) + 70), (3380, far_y(3380) + 38), (3510, far_y(3510) + 30), (3450, far_y(3450) + 14), (mx - 6, mb)]
    road = [(3290, 404), (3480, 330), (3420, 298), (3560, 262), (3500, 214), (3548, 176)]
    g.append(path(smooth_open(road, 0.35), "none", "#2E1C4C", 2.4))
    for (lx, ly) in ((3380, 367), (3455, 311), (3520, 276), (3520, 205)):
        g.append(dot(lx, ly, 1.5, WIN_WARM, 'opacity="0.75"'))
        anchors["light"].append(dict(x=lx, y=ly, what="road lamp up the mast hill: tiny warm twinkle (optional)"))

    # draw order: the sign's shoulder last, so the hills either side sit behind it
    order = [0, 1, 3, 4, 5, 2]
    ordered = [fnear[i] for i in order]
    g.append(f'<polygon points="-40,236 {W+40},236 {W+40},{H} -40,{H}" fill="url(#hillmist)"/>')
    g.append(layer_of(ordered, HILL_NEAR).outline())
    g.extend(rims(ordered, HILL_RIM, 2.0, 0.95))
    # tree clumps on the near ridges, and the villages
    for (x0, x1) in ((60, 230), (905, 1050), (1460, 1560), (2560, 2660), (2890, 3080), (3560, 3720), (4140, 4232)):
        clump(x0, x1, near_y, TREE_NEAR, 7, 13, 0.3, 8)
    for (hx, w_, h_, roof) in ((330, 22, 13, 9), (360, 18, 11, 8), (730, 20, 12, 8), (820, 24, 14, 10), (852, 18, 11, 8), (900, 20, 12, 9),
                              (4040, 20, 12, 8), (4072, 24, 14, 10), (4110, 18, 11, 8), (3150, 20, 12, 8)):
        for (wx, wy, warm) in house(hx, near_y, w_, h_, roof, HOUSE, 2 if w_ >= 22 else 1, 0.75):
            if warm: anchors["windows"].append(dict(x=round(wx % W, 1), y=round(wy, 1), w=3.2, h=3.6))

    # ---------------- EMOTOWN ----------------
    glyphs = _glyphs(); gap = 20
    total = sum(gw for _, _, gw in glyphs) + gap * (len(glyphs) - 1)
    x = 2010 - total / 2
    tilts = [-1.6, 1.0, -0.4, 1.4, -1.2, 0.6, -1.0]
    lifts = [0, 4, -2, 6, 1, 3, -1]
    sign_parts = []; stilts = []; fixtures = []
    for i, (outer, hole, gw) in enumerate(glyphs):
        gx0, gx1 = x, x + gw
        ground_min = min(near_y(gx0), near_y(gx1), near_y((gx0 + gx1) / 2))
        bottom = ground_min - 14 - lifts[i]; top = bottom - 110
        cxl = (gx0 + gx1) / 2
        # stilts and braces from the letter down into the slope
        legs = [gx0 + 6, gx0 + gw * 0.37, gx0 + gw * 0.63, gx1 - 6]
        for lx in legs:
            stilts.append(line(lx, bottom - 6, lx, near_y(lx) + 3, "#5B4880", 1.5))
        for a_, b_ in zip(legs, legs[1:]):
            stilts.append(line(a_, bottom + 1, b_, (near_y(b_) + bottom) / 2 + 2, "#4A3A6C", 1.0))
        # the letter: an extruded side in the shade colour, then the face
        def P(pts, ox=0, oy=0):
            return poly([(gx0 + px + ox, top + py + oy) for px, py in pts])
        def D(dstr, ox=0, oy=0):
            import re as _re
            nums = [float(v) for v in _re.findall(r"-?\d+\.?\d*", dstr)]
            it = iter(nums); out = []
            for tok in _re.findall(r"[MLCZ]|-?\d+\.?\d*,-?\d+\.?\d*", dstr):
                if tok in "MLCZ": out.append(tok)
                else:
                    a1, b1 = tok.split(","); out.append(f"{gx0 + float(a1) + ox:.1f},{top + float(b1) + oy:.1f}")
            return " ".join(out)
        sign_parts.append(f'<g transform="rotate({tilts[i]} {cxl:.1f} {bottom:.1f})">')
        # the lattice behind the panel (it shows through the letter's gaps, as on the real thing)
        lat = []
        for lx in legs:
            lat.append(((lx, bottom - 2), (lx, top + 10)))
        for ry in (top + 22, top + 56, top + 90):
            lat.append(((gx0 + 3, ry), (gx1 - 3, ry)))
        for a_, b_ in zip(legs, legs[1:]):
            lat += [((a_, top + 22), (b_, top + 56)), ((b_, top + 56), (a_, top + 90))]
        sign_parts.append(straight_lines(lat, "#4E3D72", 1.1))
        if isinstance(outer, str):
            dside = D(outer, 5, 3) + " " + D(hole, 5, 3); dface = D(outer) + " " + D(hole)
        else:
            dside = P(outer, 5, 3); dface = P(outer)
        sign_parts.append(path(dside, SIGN2, SIGNINK, 1.2, 'fill-rule="evenodd"'))
        sign_parts.append(path(dface, SIGN, SIGNINK, 1.3, 'fill-rule="evenodd"'))
        # two faint panel seams across the face
        sign_parts.append('</g>')
        # lamps at the letter's feet, aimed up at it
        for fx in (gx0 + gw * 0.25, gx0 + gw * 0.75):
            fy = near_y(fx)
            fixtures.append(path(poly([(fx - 4, fy + 1), (fx - 3, fy - 4), (fx + 3, fy - 4), (fx + 4, fy + 1)]), "#0E0718", SIGNINK, 0.9))
            fixtures.append(dot(fx, fy - 4.6, 1.8, GOLD))
            anchors["light"].append(dict(x=round(fx, 1), y=round(fy - 4.6, 1), what="sign floodlight: warm uplight onto the letter above"))
        anchors["signs"].append(dict(letter="EMOTOWN"[i], x=round(gx0, 1), y=round(top, 1), w=gw, h=110))
        x += gw + gap
    g.extend(stilts); g.extend(sign_parts); g.extend(fixtures)
    sx0 = anchors["signs"][0]["x"]; sx1 = anchors["signs"][-1]["x"] + anchors["signs"][-1]["w"]
    anchors["sign_bbox"] = dict(x=round(sx0, 1), y=round(min(a_["y"] for a_ in anchors["signs"]) - 4, 1), w=round(sx1 - sx0, 1),
                                h=round(max(a_["y"] for a_ in anchors["signs"]) + 110 + 30 - min(a_["y"] for a_ in anchors["signs"]), 1))
    defs = ('<linearGradient id="hillmist" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#4B3070" stop-opacity="0"/>'
            '<stop offset="0.55" stop-color="#4B3070" stop-opacity="0.22"/>'
            '<stop offset="1" stop-color="#4B3070" stop-opacity="0.3"/></linearGradient>'
            # the bottom two units are left empty (the street's .hills-foot covers them): the strip is a background
            # repeated sideways, and WebKit's GPU blends a tile's bottom row into its top row, which drew a hairline
            # across the whole sky at the hills' top edge (the operator on an iPhone, 2026-09-27: "a line that goes
            # across the whole screen ... at the bottom of the sun"). With nothing solid on the bottom row, nothing bleeds.
            f'<clipPath id="hillscut"><rect x="-200" y="-200" width="{W + 400}" height="{H + 200 - 2}"/></clipPath>')
    svg("hills", W, H, ['<g clip-path="url(#hillscut)">'] + g + ['</g>'], step=16.0, decimals=1, defs=defs)
    return dict(name="hills", W=W, H=H, kind="strip", tiles=True, anchors=anchors)

PIECES = dict(lamp=lamp, hydrant=hydrant, mailbox=mailbox, planter=planter, bin=bin_, skyline=skyline, hills=hills)

if __name__ == "__main__":
    import json
    which = sys.argv[1:] or list(PIECES)
    info = [PIECES[w]() for w in which]
    if os.environ.get("ANCHORS"): print(json.dumps(info, indent=1))
