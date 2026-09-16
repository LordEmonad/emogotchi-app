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

    # ---------------- draw order ----------------
    # ground shadow (shrinks when the cat is in the air)
    g.append('<g id="shadow">')
    g.append(ellipse(100, 212, 66, 7, PUPIL, "none", 0, 'opacity="0.55"'))
    g.append('</g>')
    # everything that moves as a body (the shadow stays on the floor)
    g.append('<g id="figure">')
    # tail
    g.append('<g id="tail">')
    g += tapered([(150, 200), (176, 198), (188, 178), (180, 156), (166, 148)], 16, 10, 0.6)
    g.append('</g>')

    # head stack (ears, back hair) - tilts with the head
    g.append(f'<g id="headstack"><g {HEAD_T}>')
    for eid, tri in (("earL", earL), ("earR", earR)):
        g.append(f'<g id="{eid}">')
        g.append(path(smooth_closed(tri, 0.4), FUR))
        g.append(path(smooth_closed(inner(tri, 0.48), 0.4), LAV, INK, 1.4))
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
    g.append(path(smooth_closed(hipL, 0.6), FUR))
    g.append(path(smooth_closed(hipR, 0.6), FUR))
    for fid, fx, toes in (("footL", 50, (46, 52)), ("footR", 150, (148, 154))):
        g.append(f'<g id="{fid}" class="foot">')
        g.append(ellipse(fx, 205, 11, 6.5, FUR))
        for lx in toes:
            g.append(path(f"M{lx},211 L{lx},206", "none", INK, LD))
        g.append('</g>')
    g.append(path(torso, FUR))
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
    g.append(ellipse(100, 173.5, 15, 15, PURPLE, INK, LW))
    g.append(ellipse(100, 173.5, 12.2, 12.2, "none", STRAND, 1.2))
    g.append(path("M90.5,166.5 Q93,161.5 98.5,160.5", "none", "#FFFFFF", 1.6, 'opacity="0.85"'))
    g += letters(100, 173.5, 6.8, INK, 1.5)
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
    g.append('</g></g>')  # head


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
