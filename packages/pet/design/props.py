"""Emo Pets props -> packages/pet/props/*.svg

Everything the cat interacts with, drawn in the same flat-fill wobbly-ink style
and Emonad palette as the cat. Each prop is its own small SVG with named groups
for the rig (food layers in the bowl, stink lines on the poop, ...).
"""
import os, re, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import (INK, FUR, HAIR, STRAND, PURPLE, LAV, LAV2, PINK, GOLD, GOLD2, RUBY, GREEN, TEAL, PUPIL,
                 LW, LD, smooth_closed, smooth_open, poly, path, ellipse, tube, tapered)
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))
os.makedirs(OUT, exist_ok=True)

def svg(name, w, h, body, amp=1.0, step=4.0, decimals=None):
    body = bake("\n".join(body), amp=amp, freq=0.09, step=step)
    if decimals is not None:  # big silhouettes: fewer digits, a fraction of the bytes, no visible change
        def rnd(m):
            v = f"{float(m.group(0)):.{decimals}f}"
            return v.rstrip("0").rstrip(".") if decimals > 0 else v   # never strip the zeros of a whole number (100 -> 1)
        body = re.sub(r"-?\d+\.\d+", rnd, body)
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name)

def kibble(cx, cy, r, rot=0):
    return f'<g transform="rotate({rot} {cx} {cy})">' + ellipse(cx, cy, r*1.25, r, GOLD, INK, 1.4) + '</g>' + \
           f'<circle cx="{cx-r*0.3:.1f}" cy="{cy-r*0.3:.1f}" r="{r*0.28:.1f}" fill="#FFFFFF" stroke="none"/>'

# ---- bowl: purple dish, a heaped mound of gold kibble in three layers ----
def bowl():
    g = []
    g.append(ellipse(60, 32, 50, 12, HAIR, INK, LW))                  # inside seen from above
    g.append('<g id="food3">')
    for (x, y, r, a) in ((42, 22, 4.6, 10), (58, 14, 5, -15), (76, 20, 4.6, 25), (50, 15, 4.2, 40), (68, 13, 4, -30), (60, 22, 4, 0), (34, 27, 4, -20), (86, 27, 4, 20)):
        g.append(kibble(x, y, r, a))
    g.append('</g>')
    g.append('<g id="food2">')
    for (x, y, r, a) in ((46, 29, 4.4, 15), (62, 27, 4.6, -10), (78, 30, 4.2, 30), (56, 33, 3.8, 5)):
        g.append(kibble(x, y, r, a))
    g.append('</g>')
    g.append('<g id="food1">')
    for (x, y, r, a) in ((52, 35, 3.8, -20), (70, 35, 3.6, 20)):
        g.append(kibble(x, y, r, a))
    g.append('</g>')
    g.append(path(smooth_closed([(10, 32), (14, 54), (30, 68), (60, 71), (90, 68), (106, 54), (110, 32), (100, 40), (60, 44), (20, 40)], 0.5), PURPLE, INK, LW))
    g.append(path("M10,32 Q60,48 110,32", "none", INK, LW))
    g.append(path(smooth_open([(14, 36), (30, 44), (60, 47), (90, 44), (106, 36)]), "none", LAV, 3.2))  # rim highlight
    g.append(path("M24,52 Q26,60 34,64", "none", STRAND, 1.6))
    g.append(path("M63,54 C63,51 55,51 55,55 C55,59 63,58 63,62 C63,65 55,65 55,63 M59,49 L59,67", "none", LAV, 2.2))
    svg("bowl", 120, 74, g)

# ---- poop: a soft three-tier swirl with a curled tip, big round eyes and a little smile ----
def poop():
    g = []
    g.append('<g id="stink" fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" opacity="0.9">' % GREEN)
    g.append('<path class="s s1" d="M20,30 Q23,25 20,20 Q17,15 20,10"/>')
    g.append('<path class="s s2" d="M40,22 Q43,17 40,12 Q37,7 40,2"/>')
    g.append('<path class="s s3" d="M60,30 Q63,25 60,20 Q57,15 60,10"/>')
    g.append('</g>')
    g.append('<g id="pile">')
    # bottom tier: wide soft blob
    g.append(path(smooth_closed([(8, 62), (10, 52), (20, 46), (40, 44), (60, 46), (70, 52), (72, 62), (62, 68), (40, 70), (18, 68)], 0.55), STRAND, INK, LW))
    # middle tier
    g.append(path(smooth_closed([(18, 48), (20, 40), (30, 34), (42, 33), (54, 36), (60, 42), (60, 48)], 0.55), STRAND, INK, LW))
    # top tier with the curl leaning right
    g.append(path(smooth_closed([(27, 37), (26, 30), (31, 24), (39, 21), (46, 20), (51, 23), (50, 27), (46, 28), (49, 32), (51, 37)], 0.55), STRAND, INK, LW))
    # soft shading along the bottom of each tier
    g.append(path("M14,62 Q40,68 66,62", "none", HAIR, 3.2, 'opacity="0.35" stroke-linecap="round"'))
    g.append(path("M24,47 Q40,50 56,46", "none", HAIR, 2.6, 'opacity="0.3" stroke-linecap="round"'))
    # highlights
    g.append(ellipse(22, 52, 4, 2.2, "#FFFFFF", "none", 0, 'opacity="0.45" transform="rotate(-25 22 52)"'))
    g.append(ellipse(34, 28, 2.6, 1.6, "#FFFFFF", "none", 0, 'opacity="0.45" transform="rotate(-30 34 28)"'))
    # face on the bottom tier: two big round eyes with highlights, a small smile
    for ex in (30, 50):
        g.append(ellipse(ex, 56, 4.6, 4.8, "#FFFFFF", INK, 1.5))
        g.append(f'<circle cx="{ex+0.6}" cy="{56.6}" r="2.6" fill="{PUPIL}"/>')
        g.append(f'<circle cx="{ex-1.2}" cy="{54.6}" r="1.1" fill="#FFFFFF"/>')
    g.append(path("M35,62.5 Q40,66 45,62.5", "none", INK, 1.6))
    g.append('</g>')
    svg("poop", 80, 72, g)

# ---- tub in two halves so the cat sits between them ----
def tub():
    back = []
    back.append(path(smooth_closed([(20, 40), (40, 26), (150, 20), (260, 26), (280, 40), (270, 52), (150, 58), (30, 52)], 0.5), LAV, INK, LW))
    back.append(ellipse(150, 44, 118, 14, LAV2, INK, LW))    # water
    back.append(path("M60,44 Q80,38 100,44", "none", "#FFFFFF", 2.2, 'opacity="0.8"'))
    back.append(path("M190,42 Q210,36 230,42", "none", "#FFFFFF", 2.2, 'opacity="0.8"'))
    svg("tub-back", 300, 140, back)
    front = []
    front.append(path(smooth_closed([(20, 40), (24, 96), (44, 120), (150, 126), (256, 120), (276, 96), (280, 40), (260, 56), (150, 62), (40, 56)], 0.5), PURPLE, INK, LW))
    front.append(path(smooth_open([(22, 42), (40, 56), (150, 62), (260, 56), (278, 42)]), "none", LAV, 4))    # rim
    # foam along the rim
    for (x, r) in ((60, 7), (74, 5), (120, 6), (134, 8), (180, 5), (196, 7), (232, 6), (246, 5)):
        front.append(ellipse(x, 58 + (150 - x)**2 / 4000, r, r, "#FFFFFF", INK, 1.4))
    # feet
    for x in (60, 240):
        front.append(path(smooth_closed([(x-14, 118), (x-10, 132), (x+10, 132), (x+14, 118)], 0.4), GOLD, INK, 1.6))
    front.append(path("M50,80 Q60,100 80,112", "none", STRAND, 1.6))
    svg("tub-front", 300, 140, front)

# ---- ball of yarn: a wound ball, three bands of strands crossing, shaded, with a loose end ----
def yarn():
    g = []
    CX, CY, R = 36, 36, 25
    # loose thread, inked: goes off to the left with a curl
    thread = smooth_open([(14, 50), (4, 58), (6, 66), (14, 64), (10, 70)], 0.6)
    g.append('<g id="yarntail">')
    g.append(path(thread, "none", INK, 4.6))
    g.append(path(thread, "none", PINK, 2.4))
    g.append('</g>')
    thread2 = smooth_open([(58, 50), (68, 58), (66, 66), (58, 64), (62, 70)], 0.6)
    g.append('<g id="yarntail2">')
    g.append(path(thread2, "none", INK, 4.6))
    g.append(path(thread2, "none", PINK, 2.4))
    g.append('</g>')
    g.append('<g id="ball">')
    g.append(f'<clipPath id="yarnclip"><circle cx="{CX}" cy="{CY}" r="{R-0.6}"/></clipPath>')
    g.append(ellipse(CX, CY, R, R, PINK, INK, LW))
    g.append('<g clip-path="url(#yarnclip)">')
    # shadow crescent, bottom right
    g.append(ellipse(CX+7, CY+8, R, R*0.95, RUBY, "none", 0, 'opacity="0.22"'))
    # band 1: diagonal strands from upper-left to lower-right
    for k in range(-3, 4):
        off = k*6.2
        g.append(path(smooth_open([(CX-30+off*0.4, CY-24+off), (CX-6+off*0.6, CY-4+off*0.9), (CX+30+off*0.4, CY+18+off*0.8)], 0.6), "none", RUBY, 1.7, 'opacity="0.55"'))
    # band 2: crossing strands, steeper, from top to bottom-left
    for k in range(-3, 4):
        off = k*6.6
        g.append(path(smooth_open([(CX+18+off, CY-32), (CX+2+off*0.9, CY-2), (CX-14+off*0.8, CY+30)], 0.6), "none", RUBY, 1.7, 'opacity="0.45"'))
    # band 3: a few near-horizontal wraps peeking through on the lower half
    for k in range(0, 3):
        off = k*7
        g.append(path(smooth_open([(CX-28, CY+4+off), (CX, CY+10+off*1.1), (CX+28, CY+4+off)], 0.6), "none", RUBY, 1.5, 'opacity="0.4"'))
    g.append('</g>')
    # the strand on top that becomes the loose end
    g.append(path(smooth_open([(CX-8, CY-20), (CX-20, CY-2), (CX-24, CY+12), (14, 50)], 0.6), "none", INK, 4.2))
    g.append(path(smooth_open([(CX-8, CY-20), (CX-20, CY-2), (CX-24, CY+12), (14, 50)], 0.6), "none", PINK, 2.2))
    # highlight
    g.append(path(f"M{CX-14},{CY-13} Q{CX-8},{CY-21} {CX+2},{CY-22}", "none", "#FFFFFF", 2.6, 'opacity="0.9"'))
    g.append(f'<circle cx="{CX+8}" cy="{CY-16}" r="1.6" fill="#FFFFFF" opacity="0.9"/>')
    g.append('</g>')
    svg("yarn", 72, 74, g)

def crumb():
    svg("crumb", 14, 12, [ellipse(7, 6, 5.2, 4, GOLD, INK, 1.3), f'<circle cx="5.5" cy="4.6" r="1" fill="#FFFFFF"/>'], amp=0.5)

def foam():
    g = []
    for (x, y, r) in ((14, 22, 10), (30, 16, 13), (48, 20, 11), (62, 26, 8), (24, 30, 8), (40, 30, 9), (56, 32, 7)):
        g.append(ellipse(x, y, r, r, "#FFFFFF", INK, 1.6))
    for (x, y, r) in ((14, 22, 8), (30, 16, 11), (48, 20, 9), (62, 26, 6), (24, 30, 6), (40, 30, 7), (56, 32, 5)):
        g.append(ellipse(x, y, r, r, "#FFFFFF", "none", 0))
    for (x, y) in ((10, 18), (26, 10), (44, 14), (60, 23)):
        g.append(f'<circle cx="{x}" cy="{y}" r="1.6" fill="{LAV}" opacity="0.8"/>')
    svg("foam", 76, 44, g, amp=0.8)

def heart():
    g = [path("M20,36 C6,26 2,16 8,9 C13,4 19,7 20,12 C21,7 27,4 32,9 C38,16 34,26 20,36 Z", PINK, INK, LW),
         path("M11,13 Q12,9 16,9", "none", "#FFFFFF", 2, 'opacity="0.85"')]
    svg("heart", 40, 40, g)

def bubble():
    g = [ellipse(20, 20, 16, 16, "#FFFFFF", LAV2, 2.2, 'fill-opacity="0.22"'),
         path("M10,16 Q12,9 19,7", "none", "#FFFFFF", 2.4, 'opacity="0.9"'),
         f'<circle cx="26" cy="27" r="1.8" fill="#FFFFFF" opacity="0.8"/>']
    svg("bubble", 40, 40, g, amp=0.6)

def sparkle():
    r = 18; cx = cy = 20
    d = f"M{cx},{cy-r} L{cx+r*0.22},{cy-r*0.22} L{cx+r},{cy} L{cx+r*0.22},{cy+r*0.22} L{cx},{cy+r} L{cx-r*0.22},{cy+r*0.22} L{cx-r},{cy} L{cx-r*0.22},{cy-r*0.22} Z"
    svg("sparkle", 40, 40, [path(d, GOLD, "none", 0), f'<circle cx="{cx}" cy="{cy}" r="3" fill="#FFFFFF"/>'], amp=0.4)

def droplet():
    svg("droplet", 20, 30, [path("M10,3 C10,3 3,15 3,20 C3,24.5 6.2,27 10,27 C13.8,27 17,24.5 17,20 C17,15 10,3 10,3 Z", LAV2, INK, LD),
                             path("M7,19 Q7,22 9,23.5", "none", "#FFFFFF", 1.4, 'opacity="0.9"')], amp=0.5)

def puff():
    g = []
    for (x, y, r) in ((24, 36, 14), (44, 28, 17), (64, 36, 13), (36, 44, 12), (54, 46, 11)):
        g.append(ellipse(x, y, r, r, "#FFFFFF", INK, LW))
    for (x, y, r) in ((24, 36, 11), (44, 28, 14), (64, 36, 10), (36, 44, 9), (54, 46, 8)):
        g.append(ellipse(x, y, r, r, "#FFFFFF", "none", 0))
    svg("puff", 88, 62, g)

def scoop():
    g = []
    g.append(path("M80,8 L54,42", "none", INK, 7.5))
    g.append(path("M80,8 L54,42", "none", PURPLE, 4.2))
    g.append(path("M80,8 L54,42", "none", LAV, 1.2, 'opacity="0.7"'))
    # shovel head: a rounded blade with a lip
    g.append(path(smooth_closed([(50, 38), (24, 44), (10, 60), (12, 80), (26, 90), (54, 90), (64, 72), (62, 50)], 0.45), LAV, INK, LW))
    g.append(path(smooth_open([(14, 78), (26, 86), (54, 86)]), "none", STRAND, 2.2))
    # slots
    for y in (56, 65, 74):
        g.append(path(f"M20,{y} L52,{y}", "none", INK, 2.2))
        g.append(path(f"M20,{y} L52,{y}", "none", STRAND, 1.0))
    g.append(ellipse(81, 7, 5.2, 5.2, PINK, INK, 1.6))
    g.append(f'<circle cx="79.5" cy="5.5" r="1.3" fill="#FFFFFF"/>')
    svg("scoop", 100, 100, g)

def sponge():
    g = [path(smooth_closed([(6, 12), (54, 8), (58, 30), (8, 34)], 0.3), GOLD, INK, LW)]
    for (x, y, r) in ((16, 18, 2.4), (30, 24, 2), (42, 16, 2.6), (24, 28, 1.6), (48, 26, 1.8)):
        g.append(ellipse(x, y, r, r, GOLD2, "none", 0))
    # foam on top
    for (x, r) in ((14, 5), (26, 6), (40, 5), (50, 4)):
        g.append(ellipse(x, 8 - (x-30)**2/300, r, r, "#FFFFFF", INK, 1.4))
    svg("sponge", 64, 40, g)

def thought():
    g = [ellipse(16, 90, 5, 5, "#FFFFFF", INK, LD), ellipse(30, 76, 8, 8, "#FFFFFF", INK, LD)]
    g.append(path(smooth_closed([(36, 60), (30, 40), (44, 18), (76, 8), (108, 16), (120, 40), (110, 60), (76, 68)], 0.55), "#FFFFFF", INK, LW))
    svg("thought", 130, 100, g)

def tangle():
    """Yarn wrapped around the cat: same 200x230 box as cat.svg, laid over it."""
    g = []
    strands = [
        [(96, 196), (70, 176), (52, 150), (66, 132), (100, 128), (134, 134), (150, 156), (140, 178)],   # around the chest
        [(140, 178), (120, 190), (88, 192), (58, 186), (48, 170), (60, 160)],                            # around the belly
        [(60, 160), (76, 168), (110, 172), (146, 164), (156, 148)],                                      # a second wrap
        [(150, 156), (160, 120), (152, 78), (140, 58), (150, 40)],                                       # up over the ear
    ]
    for pts in strands:
        d = smooth_open(pts, 0.6)
        g.append(path(d, "none", INK, 4.6))
    for pts in strands:
        d = smooth_open(pts, 0.6)
        g.append(path(d, "none", PINK, 2.4))
    # little loose loop at the top
    g.append(path(smooth_open([(150, 40), (158, 30), (166, 36), (160, 44)], 0.6), "none", INK, 4.2))
    g.append(path(smooth_open([(150, 40), (158, 30), (166, 36), (160, 44)], 0.6), "none", PINK, 2.2))
    svg("tangle", 200, 230, g, amp=0.8)

def sun():
    g = [ellipse(32, 32, 14, 14, GOLD, INK, LW)]
    for k in range(8):
        a = k * math.pi / 4
        x0, y0 = 32 + 19 * math.cos(a), 32 + 19 * math.sin(a); x1, y1 = 32 + 27 * math.cos(a), 32 + 27 * math.sin(a)
        g.append(path(f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}", "none", INK, 4.2))
        g.append(path(f"M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}", "none", GOLD, 2.2))
    g.append(path("M24,26 Q28,20 34,20", "none", "#FFFFFF", 2.2, 'opacity="0.85"'))
    svg("sun", 64, 64, g)

def coin():
    g = [ellipse(20, 20, 17, 17, PURPLE, INK, LW), ellipse(20, 20, 13.5, 13.5, "none", LAV2, 1.4),
         path("M13,27 L13,13 L20,21 L27,13 L27,27", "none", LAV, 2.6), path("M9,13 Q11,9 15,8", "none", "#FFFFFF", 1.8, 'opacity="0.8"')]
    svg("coin", 40, 40, g, amp=0.6)

def flame():
    g = [path("M20,4 C24,12 30,14 30,24 C30,31 25.5,36 20,36 C14.5,36 10,31 10,24 C10,19 13,16 14,12 C15,16 17,17 18,17 C17,12 18,8 20,4 Z", PINK, INK, LW),
         path("M20,20 C22,24 24,25 24,28.5 C24,31 22.2,33 20,33 C17.8,33 16,31 16,28.5 C16,26 18,24 20,20 Z", GOLD, "none", 0)]
    svg("flame", 40, 40, g, amp=0.7)

def grave():
    g = []
    g.append(ellipse(40, 78, 30, 6, PUPIL, "none", 0, 'opacity="0.5"'))
    g.append(path(smooth_closed([(14, 80), (14, 34), (20, 18), (40, 10), (60, 18), (66, 34), (66, 80)], 0.45), STRAND, INK, LW))
    g.append(path("M20,74 L60,74", "none", HAIR, 2.4, 'opacity="0.5"'))
    g.append(path("M22,30 Q30,20 40,18", "none", "#FFFFFF", 2.2, 'opacity="0.35"'))
    g.append(path("M40,52 C32,46 30,40 34,36 C37,33 40,35 40,38 C40,35 43,33 46,36 C50,40 48,46 40,52 Z", PINK, INK, 1.6))
    g.append(path("M28,62 L52,62", "none", HAIR, 2.2))
    g.append(path("M32,68 L48,68", "none", HAIR, 2.2))
    svg("grave", 80, 86, g)

def moon():
    g = [path("M30,4 C16,6 6,18 6,32 C6,48 18,60 34,60 C44,60 52,55 57,48 C54,49 51,50 47,50 C31,50 19,38 19,22 C19,15 21,9 25,4 Z", GOLD, INK, LW)]
    svg("moon", 64, 64, g)

def _glint(cx, cy, r):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#FFFFFF" stroke="none"/>'

def _heart(cx, cy, w, fill=PINK, lw=1.8):
    """The Emonad heart, the same shape the site's wordmark uses, sized by width."""
    k = w / 28.0
    d = (f"M{cx},{cy+11*k} C{cx-12*k},{cy+2*k} {cx-14*k},{cy-6*k} {cx-8*k},{cy-10*k} "
         f"C{cx-4*k},{cy-13*k} {cx},{cy-10*k} {cx},{cy-7*k} C{cx},{cy-10*k} {cx+4*k},{cy-13*k} {cx+8*k},{cy-10*k} "
         f"C{cx+14*k},{cy-6*k} {cx+12*k},{cy+2*k} {cx},{cy+11*k} Z")
    return path(d, fill, INK, lw)

def witchhat():
    """The first Emogotchi Items costume, and the yardstick for every costume after it: it has to
    look like it was made for this cat. So the band is the cat's collar (black, lavender studs), the
    buckle carries a ruby like the crown, and the tip curls over the way the fringe does. Generated
    here rather than hand-drawn so it carries the same baked ink wobble as everything else."""
    g = []
    g.append(ellipse(60, 122, 44, 6, PUPIL, "none", 0, 'opacity="0.30"'))          # contact shadow
    # the cone: tall, leaning right, with the tip curling over on itself
    cone = [(34, 106), (36, 82), (42, 58), (52, 36), (65, 18), (77, 7), (88, 4), (96, 9), (96, 16),
            (89, 16), (80, 21), (72, 40), (67, 66), (69, 106)]
    g.append(path(smooth_closed(cone, 0.5), PUPIL, INK, LW))
    g.append(path("M58,38 Q64,30 72,25", "none", INK, 1.6, 'opacity="0.35"'))       # crease under the curl, kept inside the cone
    g.append(path("M44,62 Q51,44 62,30", "none", LAV, 2.2, 'opacity="0.22"'))       # soft edge light
    # the band is the collar: black, with the same lavender studs
    g.append(path(smooth_closed([(30, 103), (32, 85), (73, 81), (77, 99)], 0.45), INK, INK, 2.0))
    for sx, sy in ((38, 95), (45, 93), (63, 90), (70, 89)):
        g.append(f'<circle cx="{sx}" cy="{sy}" r="2.4" fill="{LAV}" stroke="none"/>')
    # the buckle is the crown: gold ring, ink under so the wobble cannot close it, and a ruby
    g.append(path("M47,85 L61,83.4 L61.8,96 L47.8,97.6 Z", "none", INK, 5.6))
    g.append(path("M47,85 L61,83.4 L61.8,96 L47.8,97.6 Z", "none", GOLD, 3.2))
    g.append(ellipse(54.4, 90.4, 3.4, 3.0, RUBY, INK, 1.4))
    g.append(_glint(53.4, 89.4, 0.9))
    # brim last so it sits in front, with a slightly ragged edge
    g.append(path(smooth_closed([(6, 108), (18, 100), (34, 96), (54, 94), (74, 95), (92, 99), (110, 106),
                                 (102, 114), (86, 120), (62, 123), (38, 121), (18, 116)], 0.5), HAIR, INK, LW))
    g.append(path("M22,107 Q54,101 96,108", "none", STRAND, 2.0, 'opacity="0.7"'))
    g.append(ellipse(54, 108, 22, 4, PUPIL, "none", 0, 'opacity="0.28"'))           # cone shading the brim
    g.append(ellipse(30, 110, 6, 2.2, "#FFFFFF", "none", 0, 'opacity="0.18"'))
    svg("witchhat", 120, 130, g)

def _locker_body(g, open_door=False):
    g.append(ellipse(50, 197, 40, 5, PUPIL, "none", 0, 'opacity="0.35"'))
    g.append(path(smooth_closed([(10, 8), (90, 8), (90, 192), (10, 192)], 0.08), HAIR, INK, LW))
    for fx in (22, 68):                                                             # feet
        g.append(path(f"M{fx},192 L{fx+10},192 L{fx+10},198 L{fx},198 Z", INK, INK, 1))
    if open_door:
        # inside: dark, a shelf, a hook. The costume that hangs here is placed by the composer.
        g.append(path(smooth_closed([(16, 14), (84, 14), (84, 186), (16, 186)], 0.05), PUPIL, INK, 1.6))
        g.append(path("M18,112 L82,112", "none", STRAND, 3.2))
        g.append(path("M18,113 L82,113", "none", INK, 1.2, 'opacity="0.5"'))
        g.append(path("M50,18 L50,30 Q50,36 56,36", "none", INK, 2.6))                 # hook
        # the door, swung toward us: a narrower panel on the hinge side
        g.append(path(smooth_closed([(-22, 6), (16, 14), (16, 186), (-22, 194)], 0.05), STRAND, INK, LW))
        g.append(path("M-14,32 L6,36", "none", INK, 2.4, 'opacity="0.8"'))
        g.append(path("M-14,40 L6,44", "none", INK, 2.4, 'opacity="0.8"'))
        g.append(path("M-14,48 L6,52", "none", INK, 2.4, 'opacity="0.8"'))
        g.append(path("M-4,100 L-4,118", "none", GOLD2, 4.5))
        g.append(path("M-4,100 L-4,118", "none", INK, 1.2, 'opacity="0.5"'))
    else:
        g.append(path(smooth_closed([(16, 14), (84, 14), (84, 186), (16, 186)], 0.05), STRAND, INK, 2.0))
        for vy in (30, 38, 46):                                                     # vents
            g.append(path(f"M30,{vy} L70,{vy}", "none", INK, 2.6, 'opacity="0.8"'))
        g.append(path("M20,20 L20,180", "none", LAV, 2.0, 'opacity="0.18"'))         # edge light
        g.append(path("M74,98 L74,118", "none", GOLD2, 5))                             # handle
        g.append(path("M74,98 L74,118", "none", INK, 1.4, 'opacity="0.55"'))
        # heart padlock hanging off the latch
        g.append(path("M66,122 Q66,114 72,114 Q78,114 78,122", "none", INK, 2.6))
        g.append(_heart(72, 131, 20, PINK, 2.0))
        g.append(_glint(68, 126, 1.3))
        # stickers, because it is a locker
        g.append(path("M36,150 L39.5,158.5 L48.5,159 L41.5,164.5 L44,173.5 L36,168.5 L28,173.5 L30.5,164.5 L23.5,159 L32.5,158.5 Z", GOLD, INK, 1.6))
        g.append(ellipse(58, 170, 9, 9, PURPLE, INK, 1.8))
        g.append(ellipse(58, 170, 7, 7, "none", STRAND, 1.0))
        g.append(path("M52.5,166 Q54,162.5 57.5,162", "none", "#FFFFFF", 1.4, 'opacity="0.85"'))
        g.append(_heart(58, 171, 8, PINK, 1.2))

def locker():
    g = []; _locker_body(g); svg("locker", 100, 202, g)

def lockeropen():
    g = ['<g transform="translate(26 0)">']; _locker_body(g, open_door=True); g.append('</g>'); svg("lockeropen", 126, 202, g, amp=0.8)

def pricetag():
    g = []
    g.append(path("M14,15 Q10,4 20,2 Q28,4 26,14", "none", INK, 1.8))                  # string
    g.append(path(smooth_closed([(4, 18), (18, 4), (40, 4), (40, 56), (4, 56)], 0.1), LAV, INK, LW))
    g.append(ellipse(15, 16, 3.0, 3.0, FUR, INK, 1.6))
    g.append(_heart(24, 38, 18, PINK, 1.8))
    svg("pricetag", 44, 60, g, amp=0.7)

def bag():
    g = []
    g.append(ellipse(40, 88, 32, 4, PUPIL, "none", 0, 'opacity="0.3"'))
    for hx in (24, 44):                                                              # handles
        g.append(path(f"M{hx},32 C{hx},8 {hx+12},8 {hx+12},32", "none", INK, 5.2))
        g.append(path(f"M{hx},32 C{hx},8 {hx+12},8 {hx+12},32", "none", PURPLE, 2.6))
    g.append(path(smooth_closed([(8, 30), (72, 30), (76, 86), (4, 86)], 0.08), PURPLE, INK, LW))
    g.append(path("M12,34 L68,34", "none", STRAND, 2.2, 'opacity="0.7"'))
    g.append(_heart(40, 60, 26, PINK, 2.0))
    g.append(path("M14,42 L14,78", "none", LAV, 2.0, 'opacity="0.22"'))
    svg("bag", 80, 92, g)

def shelf():
    g = []
    g.append(path(smooth_closed([(0, 8), (200, 8), (200, 20), (0, 20)], 0.04), STRAND, INK, LW))
    g.append(path("M4,11 L196,11", "none", LAV, 1.8, 'opacity="0.25"'))
    for bx in (26, 174):                                                             # brackets
        g.append(path(f"M{bx-8},20 L{bx+8},20 L{bx},32 Z", HAIR, INK, 1.8))
    svg("shelf", 200, 34, g, amp=0.5)


# ---------------------------------------------------------------- the shop's stock
# Everything an item shop for this cat could plausibly sell, drawn so each one is a candidate item
# later and so the shop scenes look stocked now. Same palette, same ink, same wobble.

def partyhat():
    g = []
    g.append(ellipse(40, 95, 26, 4, PUPIL, "none", 0, 'opacity="0.3"'))
    g.append(path("M12,90 L40,10 L68,90 Z", PINK, INK, LW))
    g.append('<clipPath id="phclip"><path d="M12,90 L40,10 L68,90 Z"/></clipPath>')
    for y0 in (34, 58, 82):                                                      # lavender chevrons
        g.append(path(f"M0,{y0} L40,{y0-16} L80,{y0} L80,{y0+9} L40,{y0-7} L0,{y0+9} Z", LAV, "none", 0, 'clip-path="url(#phclip)"'))
    g.append(path("M12,90 L40,10 L68,90 Z", "none", INK, LW))
    g.append(path("M20,84 L60,84", "none", INK, 1.6, 'opacity="0.35"'))
    g.append(ellipse(40, 10, 7.5, 7.5, LAV, INK, 2.0))                          # pompom
    g.append(_glint(37.5, 7.5, 1.6))
    g.append(path("M22,70 Q30,50 36,30", "none", "#FFFFFF", 2.0, 'opacity="0.3"'))
    svg("partyhat", 80, 100, g)

def bow():
    g = []
    for cx, rot in ((25, -12), (65, 12)):                                       # loops
        g.append(f'<g transform="rotate({rot} {cx} 24)">' + ellipse(cx, 24, 22, 14, PINK, INK, LW) + '</g>')
        g.append(f'<g transform="rotate({rot} {cx} 24)">' + ellipse(cx, 24, 13, 7, RUBY, "none", 0, 'opacity="0.35"') + '</g>')
    g.append(path("M45,36 L34,58 L44,54 L45,44 L46,54 L56,58 Z", PINK, INK, 2.0))    # tails
    g.append(ellipse(45, 24, 8, 9, PINK, INK, LW))                              # knot
    g.append(path("M41,19 Q45,16 49,19", "none", "#FFFFFF", 1.6, 'opacity="0.7"'))
    svg("bow", 90, 62, g)

def shades():
    g = []
    g.append(path("M4,14 L96,14", "none", INK, 3.4))                            # the top bar / arms
    for cx in (28, 72):
        g.append(path(smooth_closed([(cx-20, 14), (cx+20, 14), (cx+18, 30), (cx, 36), (cx-18, 30)], 0.45), PUPIL, INK, LW))
        g.append(path(f"M{cx-12},18 L{cx-2},18", "none", LAV, 2.4, 'opacity="0.6"'))
        g.append(path(f"M{cx-14},23 L{cx-8},23", "none", LAV, 1.6, 'opacity="0.4"'))
    g.append(path("M46,18 Q50,22 54,18", "none", INK, 2.6))                     # bridge
    svg("shades", 100, 40, g)

def bell():
    g = []
    g.append(ellipse(25, 53, 16, 3, PUPIL, "none", 0, 'opacity="0.3"'))
    g.append(path("M25,6 Q19,6 19,11 Q25,11 31,11 Q31,6 25,6 Z", "none", INK, 2.4))   # loop
    g.append(path(smooth_closed([(12, 42), (13, 26), (18, 14), (25, 11), (32, 14), (37, 26), (38, 42), (25, 44)], 0.5), GOLD, INK, LW))
    g.append(path(smooth_closed([(9, 42), (41, 42), (40, 48), (10, 48)], 0.2), GOLD2, INK, 2.0))
    g.append(ellipse(25, 50, 4, 3.5, INK, INK, 1))                              # clapper
    g.append(path("M17,20 Q19,14 23,13", "none", "#FFFFFF", 2.0, 'opacity="0.8"'))
    svg("bell", 50, 58, g)

def fish():
    g = []
    g.append(ellipse(45, 46, 34, 4, PUPIL, "none", 0, 'opacity="0.3"'))
    g.append(path(smooth_closed([(64, 24), (78, 10), (86, 24), (78, 38)], 0.4), TEAL, INK, LW))   # tail
    g.append(path(smooth_closed([(8, 24), (18, 10), (40, 6), (60, 12), (68, 24), (60, 36), (40, 42), (18, 38)], 0.5), TEAL, INK, LW))
    g.append(path("M22,30 Q40,36 58,30", "none", LAV2, 3.0, 'opacity="0.55"'))  # belly
    g.append(path("M30,14 Q40,10 50,14", "none", "#FFFFFF", 2.0, 'opacity="0.45"'))
    g.append(ellipse(20, 22, 4.2, 4.2, "#FFFFFF", INK, 1.5))                    # eye
    g.append(ellipse(20.8, 22.6, 2.0, 2.0, INK, "none", 0))
    g.append(path("M9,27 Q13,29 16,27", "none", INK, 1.6))                      # mouth
    svg("fish", 90, 50, g)

def potion():
    g = []
    g.append(ellipse(30, 76, 20, 3.5, PUPIL, "none", 0, 'opacity="0.3"'))
    g.append(path("M23,4 L37,4 L37,14 L23,14 Z", STRAND, INK, 2.0))             # cork
    g.append(path("M24,14 L36,14 L36,30 Q52,36 52,52 Q52,72 30,72 Q8,72 8,52 Q8,36 24,30 Z", LAV, INK, LW))   # glass
    g.append('<clipPath id="poclip"><path d="M24,14 L36,14 L36,30 Q52,36 52,52 Q52,72 30,72 Q8,72 8,52 Q8,36 24,30 Z"/></clipPath>')
    g.append(path("M4,46 Q18,40 30,46 Q42,52 56,46 L56,76 L4,76 Z", PINK, "none", 0, 'clip-path="url(#poclip)"'))
    for bx, by, br in ((22, 60, 2.4), (36, 54, 1.8), (30, 65, 1.4)):
        g.append(ellipse(bx, by, br, br, "#FFFFFF", "none", 0, 'opacity="0.7"'))
    g.append(path("M24,14 L36,14 L36,30 Q52,36 52,52 Q52,72 30,72 Q8,72 8,52 Q8,36 24,30 Z", "none", INK, LW))
    g.append(path("M14,44 Q13,54 18,64", "none", "#FFFFFF", 2.2, 'opacity="0.55"'))
    svg("potion", 60, 80, g)

def wand():
    g = []
    g.append(path("M12,104 L40,40", "none", INK, 5.4))                          # stick, ink under
    g.append(path("M12,104 L40,40", "none", STRAND, 2.8))
    g.append(path("M40,40 Q42,34 40,28", "none", INK, 1.8))                     # string
    g.append(path(smooth_closed([(40, 30), (30, 22), (26, 10), (34, 2), (46, 2), (54, 12), (50, 24)], 0.5), PINK, INK, 2.0))   # feather
    g.append(path("M40,30 L38,6", "none", RUBY, 1.6, 'opacity="0.7"'))              # spine
    for t in (0.25, 0.45, 0.65):
        y = 30 - 24 * t
        g.append(path(f"M38,{y:.1f} L{30 + 4*t:.1f},{y - 6:.1f}", "none", RUBY, 1.1, 'opacity="0.45"'))
        g.append(path(f"M38,{y:.1f} L{47 - 3*t:.1f},{y - 6:.1f}", "none", RUBY, 1.1, 'opacity="0.45"'))
    g.append(path("M33,10 Q35,8 38,6", "none", "#FFFFFF", 1.4, 'opacity="0.5"'))
    svg("wand", 60, 110, g)

def cushion():
    g = []
    g.append(ellipse(60, 54, 52, 5, PUPIL, "none", 0, 'opacity="0.3"'))
    g.append(path(smooth_closed([(6, 36), (14, 16), (60, 8), (106, 16), (114, 36), (100, 52), (60, 56), (20, 52)], 0.5), PURPLE, INK, LW))
    g.append(ellipse(60, 32, 36, 12, LAV, INK, 1.8))                            # the dip
    g.append(ellipse(60, 32, 28, 7, PURPLE, "none", 0, 'opacity="0.35"'))
    for sx in (24, 60, 96):                                                     # stitches
        g.append(path(f"M{sx-3},48 L{sx+3},48", "none", INK, 1.4, 'opacity="0.35"'))
    svg("cushion", 120, 62, g)

def crate():
    g = []
    g.append(ellipse(55, 78, 46, 4, PUPIL, "none", 0, 'opacity="0.35"'))
    g.append(path(smooth_closed([(8, 24), (102, 24), (100, 76), (10, 76)], 0.06), PUPIL, INK, LW))
    for y0, y1 in ((27, 40), (44, 57), (61, 73)):                                # planks, gaps between
        g.append(path(smooth_closed([(11, y0), (99, y0), (99, y1), (11, y1)], 0.1), STRAND, INK, 1.6))
        g.append(path(f"M14,{y0+3} L96,{y0+3}", "none", LAV, 1.4, 'opacity="0.22"'))
    g.append(path(smooth_closed([(8, 24), (102, 24), (96, 12), (14, 12)], 0.06), PUPIL, INK, 2.0))   # the open top
    g.append(path(smooth_closed([(6, 22), (104, 22), (104, 28), (6, 28)], 0.3), HAIR, INK, 1.8))     # top rail
    g.append(path("M14,28 L14,72", "none", LAV, 1.8, 'opacity="0.2"'))
    svg("crate", 110, 82, g)

def beanie():
    g = []
    g.append(ellipse(40, 76, 30, 4, PUPIL, "none", 0, 'opacity="0.3"'))
    g.append(path(smooth_closed([(10, 62), (10, 40), (18, 22), (40, 14), (62, 22), (70, 40), (70, 62)], 0.5), PURPLE, INK, LW))
    for kx in (26, 40, 54):                                                     # knit ribs
        g.append(path(f"M{kx},20 Q{kx-2},40 {kx},58", "none", INK, 1.4, 'opacity="0.25"'))
    g.append(path(smooth_closed([(6, 60), (74, 60), (74, 76), (6, 76)], 0.3), LAV, INK, LW))   # folded band
    g.append(path("M10,68 L70,68", "none", INK, 1.2, 'opacity="0.3"'))
    g.append(ellipse(40, 12, 9, 9, PINK, INK, 2.0))                             # pompom
    g.append(_glint(37, 9, 1.8))
    svg("beanie", 80, 80, g)

def hook():
    g = []
    g.append(path(smooth_closed([(10, 4), (20, 4), (20, 11), (10, 11)], 0.3), STRAND, INK, 1.8))   # wall plate
    g.append(path("M15,11 L15,24 Q15,34 23,34 Q30,34 30,27", "none", INK, 5.2))
    g.append(path("M15,11 L15,24 Q15,34 23,34 Q30,34 30,27", "none", GOLD2, 2.8))
    svg("hook", 34, 40, g, amp=0.6)

def milk():
    g = []
    g.append(ellipse(30, 86, 22, 3.5, PUPIL, "none", 0, 'opacity="0.3"'))
    g.append(path("M10,30 L50,30 L50,84 L10,84 Z", FUR, INK, LW))
    g.append(path("M10,30 L30,6 L50,30 Z", FUR, INK, LW))                       # gable top
    g.append(path("M30,6 L30,30", "none", INK, 1.6, 'opacity="0.4"'))
    g.append(path("M14,44 L46,44 L46,70 L14,70 Z", LAV, INK, 1.6))              # label
    g.append(_heart(30, 58, 16, PINK, 1.6))
    g.append(path("M13,34 L13,80", "none", LAV, 2.0, 'opacity="0.35"'))
    svg("milk", 60, 90, g)


def robehung():
    """The witch robe as a garment, for the item's own picture, drawn as if worn by nobody: hood up
    and hollow with its lining turned back at the rim, tall and flowing, sleeves raised a little as
    if arms were inside so they have shape, the body sweeping down with a slight sway to a flared,
    scalloped hem. Drape lines that follow the flow, the front open in a V on the lining with gold
    piping, a ruby clasp at the throat like the hat's buckle, a crescent and stars. No cat in it, so
    it can be sold for any character later."""
    g = []
    # sleeves behind the body's shoulders but in front of nothing else: raised and out, bell cuffs
    for sx, dx in ((54, -1), (146, 1)):
        g += tapered([(sx, 122), (sx + dx * 22, 150), (sx + dx * 30, 194)], 24, 36, 0.5, PUPIL)
        cx_, cy_ = sx + dx * 31, 197
        g.append(f'<g transform="rotate({dx * 22} {cx_} {cy_})">' + ellipse(cx_, cy_, 17, 7, PURPLE, INK, 1.8) + '</g>')
        g.append(f'<g transform="rotate({dx * 22} {cx_} {cy_})">' + ellipse(cx_, cy_, 10, 3.6, INK, "none", 0, 'opacity="0.55"') + '</g>')
    # the body: shoulders under the hood, sweeping down with a little sway, flaring to the hem
    body = [(48, 118), (36, 160), (26, 206), (18, 250), (14, 280), (26, 290), (48, 285), (70, 291), (94, 286),
            (118, 292), (142, 286), (164, 291), (184, 284), (188, 254), (180, 208), (170, 162), (154, 118),
            (128, 112), (100, 116), (72, 112)]
    g.append(path(smooth_closed(body, 0.45), PUPIL, INK, LW))
    g.append(path(smooth_open([(40, 150), (28, 210), (22, 272)], 0.5), "none", LAV, 2.6, 'opacity="0.14"'))   # sheen
    for pts in ([(44, 150), (34, 214), (30, 278)], [(60, 140), (52, 214), (50, 282)], [(158, 150), (168, 214), (172, 278)], [(142, 140), (150, 214), (152, 282)]):
        g.append(path(smooth_open(pts, 0.5), "none", STRAND, 1.8, 'opacity="0.38"'))
    # the V of lining down the front, edges, gold piping, a fold, the lining at the hem
    g.append(path(smooth_closed([(93, 122), (107, 122), (128, 286), (72, 286)], 0.25), PURPLE, "none", 0))
    g.append(path(smooth_open([(94, 124), (84, 204), (74, 284)]), "none", INK, 2.2, 'opacity="0.8"'))
    g.append(path(smooth_open([(106, 124), (116, 204), (126, 284)]), "none", INK, 2.2, 'opacity="0.8"'))
    g.append(path(smooth_open([(96.5, 126), (87, 204), (77, 282)]), "none", GOLD, 1.5, 'opacity="0.9"'))
    g.append(path(smooth_open([(103.5, 126), (113, 204), (123, 282)]), "none", GOLD, 1.5, 'opacity="0.9"'))
    g.append(path(smooth_open([(100, 138), (99, 206), (100, 278)]), "none", STRAND, 2.2, 'opacity="0.45"'))
    g.append(path(smooth_open([(24, 276), (48, 281), (70, 275), (94, 281), (118, 275), (142, 281), (164, 275), (182, 278)]), "none", PURPLE, 3.0, 'opacity="0.6"'))
    # the hood, up and hollow: outer shape, the dark inside, the lining turned back along the rim
    hood = [(60, 122), (56, 84), (64, 50), (82, 28), (100, 22), (118, 28), (136, 50), (144, 84), (140, 122)]
    g.append(path(smooth_closed(hood, 0.5), PUPIL, INK, LW))
    opening = [(78, 120), (74, 88), (80, 60), (92, 46), (100, 43), (108, 46), (120, 60), (126, 88), (122, 120)]
    g.append(path(smooth_closed(opening, 0.5), "#120A18", INK, 1.6))
    g.append(path(smooth_open(opening[:-1] + [opening[-1]], 0.5), "none", PURPLE, 5.5))
    g.append(path(smooth_open([(84, 116), (80, 88), (86, 64), (100, 52), (114, 64), (120, 88), (116, 116)], 0.5), "none", STRAND, 1.6, 'opacity="0.6"'))
    # the clasp at the throat
    g.append(ellipse(100, 128, 7.5, 7.5, "none", INK, 5.0))
    g.append(ellipse(100, 128, 7.5, 7.5, "none", GOLD, 2.6))
    g.append(ellipse(100, 128, 3.2, 3.0, RUBY, INK, 1.2))
    g.append(_glint(99, 127, 0.9))
    # a crescent and stars on the panels
    g.append(ellipse(46, 196, 7.5, 7.5, LAV, "none", 0, 'opacity="0.9"'))
    g.append(ellipse(49, 194, 6.2, 6.2, PUPIL, "none", 0))
    def star(cx, cy, r):
        return path(f"M{cx},{cy-r} L{cx+r*0.28},{cy-r*0.28} L{cx+r},{cy} L{cx+r*0.28},{cy+r*0.28} L{cx},{cy+r} "
                    f"L{cx-r*0.28},{cy+r*0.28} L{cx-r},{cy} L{cx-r*0.28},{cy-r*0.28} Z", LAV, "none", 0, 'opacity="0.85"')
    g.append(star(36, 246, 3.2)); g.append(star(58, 160, 2.4)); g.append(star(156, 176, 3.2)); g.append(star(170, 250, 2.6)); g.append(star(146, 236, 2))
    svg("robehung", 200, 300, g)

# ================================================================ the haunted room (a Scene item)
# A room theme swaps the wall, the floor and the light and adds fixed scenery around the cat. These
# are the pieces: everything on the floor sits at the edges, behind the cat, so the bowl, the tub and
# the yarn keep their places in front. Two new accents join the palette for this one theme: pumpkin
# orange and its flame; everything else is the house purple and lavender.
PUMPKIN  = "#F08A24"
PUMPKIN2 = "#C9651A"
FLAME    = "#FFD36B"
MOSS     = "#3E6B2E"

def tapered_big(pts, w0, w1, t=0.5, fill=FUR, sample=7.0, stroke=INK):
    """`tapered` for room-sized silhouettes: the same shape, sampled every `sample` units instead of
    every 2, so a tree is a few kilobytes and not two hundred."""
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

def _cobweb_lines(cx, cy, r, n=7, spirals=4, sweep=(0, 90)):
    """A corner web: spokes from the corner and arcs between them."""
    out = []
    a0, a1 = math.radians(sweep[0]), math.radians(sweep[1])
    angs = [a0 + (a1 - a0) * i / (n - 1) for i in range(n)]
    for a in angs:
        out.append(path(f"M{cx},{cy} L{cx + r*math.cos(a):.1f},{cy + r*math.sin(a):.1f}", "none", LAV, 1.1, 'opacity="0.55"'))
    for k in range(1, spirals + 1):
        rr = r * k / (spirals + 0.6)
        pts = []
        for i, a in enumerate(angs):
            sag = rr * (0.94 if i not in (0, n - 1) else 1.0)
            pts.append((cx + sag*math.cos(a), cy + sag*math.sin(a)))
        d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
        for i in range(1, len(pts)):
            mx = (pts[i-1][0] + pts[i][0]) / 2; my = (pts[i-1][1] + pts[i][1]) / 2
            # sag the strand toward the corner
            mx += (cx - mx) * 0.10; my += (cy - my) * 0.10
            d += f" Q{mx:.1f},{my:.1f} {pts[i][0]:.1f},{pts[i][1]:.1f}"
        out.append(path(d, "none", LAV, 1.0, 'opacity="0.5"'))
    return out

def cobweb():
    g = _cobweb_lines(2, 2, 96)
    g.append(f'<circle cx="60" cy="41" r="1.6" fill="{FUR}" opacity="0.7"/>')
    g.append(f'<circle cx="34" cy="68" r="1.3" fill="{FUR}" opacity="0.6"/>')
    svg("cobweb", 100, 100, g, amp=0.4, decimals=1)

def pumpkin():
    """A carved jack-o'-lantern, lit from inside. #glow is the light; the site makes it flicker."""
    g = []
    g.append(ellipse(56, 96, 44, 6, PUPIL, "none", 0, 'opacity="0.35"'))
    body = [(12, 60), (14, 44), (24, 30), (40, 24), (56, 22), (72, 24), (88, 30), (98, 44), (100, 60), (96, 78), (84, 90), (56, 94), (28, 90), (16, 78)]
    g.append(path(smooth_closed(body, 0.55), PUMPKIN, INK, LW))
    # ribs: darker segments as soft strokes, the middle one lit
    for x0, x1, x2 in ((30, 26, 30), (44, 42, 44), (68, 70, 68), (82, 86, 82)):
        g.append(path(f"M{x0},27 Q{x1},58 {x2},91", "none", PUMPKIN2, 3.0, 'opacity="0.55"'))
    g.append(path("M56,24 Q52,58 56,93", "none", FLAME, 2.2, 'opacity="0.18"'))
    # the face: two triangle eyes, a small nose, a jagged grin; the glow group is the fill
    g.append('<g id="glow">')
    g.append(path("M30,52 L44,42 L46,58 Z", FLAME, INK, 1.8))
    g.append(path("M82,52 L68,42 L66,58 Z", FLAME, INK, 1.8))
    g.append(path("M53,62 L59,62 L56,68 Z", FLAME, INK, 1.6))
    g.append(path("M26,70 L36,74 L40,68 L46,76 L52,70 L58,78 L64,70 L70,76 L74,68 L80,74 L86,70 L80,84 L56,88 L32,84 Z", FLAME, INK, 1.8))
    g.append('</g>')
    # stem and leaf
    g.append(path(smooth_closed([(50, 24), (49, 12), (54, 4), (62, 6), (61, 14), (60, 24)], 0.45), MOSS, INK, LW))
    g.append(path("M60,14 Q76,6 84,14 Q74,18 62,18 Z", GREEN, INK, 1.6))
    g.append(path("M62,17 Q72,12 80,13", "none", INK, 1.0, 'opacity="0.5"'))
    g.append(ellipse(30, 40, 6, 2.6, "#FFFFFF", "none", 0, 'opacity="0.18" transform="rotate(-30 30 40)"'))
    svg("pumpkin", 112, 100, g)

def tombstone():
    """A tall stone, a smaller one leaning behind it, grass at the foot and a crack. The heart is the
    same one the grave prop carries."""
    g = []
    g.append(ellipse(50, 112, 42, 6, PUPIL, "none", 0, 'opacity="0.4"'))
    # the small stone behind, leaning
    g.append('<g transform="rotate(-9 82 100)">')
    g.append(path(smooth_closed([(66, 108), (66, 66), (72, 54), (86, 50), (98, 58), (100, 68), (100, 108)], 0.45), HAIR, INK, LW))
    g.append(path("M76,72 L90,72 M78,80 L88,80", "none", STRAND, 2.0))
    g.append('</g>')
    # the main stone
    g.append(path(smooth_closed([(12, 110), (12, 40), (18, 22), (40, 12), (62, 22), (68, 40), (68, 110)], 0.45), STRAND, INK, LW))
    g.append(path("M20,36 Q30,24 40,20", "none", "#FFFFFF", 2.2, 'opacity="0.3"'))
    g.append(path("M22,102 L58,102", "none", HAIR, 2.6, 'opacity="0.55"'))
    g.append(path("M64,46 L58,58 L63,66 L56,80", "none", INK, 1.5, 'opacity="0.7"'))      # crack
    g.append(path("M40,60 C32,54 30,48 34,44 C37,41 40,43 40,46 C40,43 43,41 46,44 C50,48 48,54 40,60 Z", PINK, INK, 1.6))
    g.append(path("M28,72 L52,72", "none", HAIR, 2.2))
    g.append(path("M32,80 L48,80", "none", HAIR, 2.2))
    # grass tufts
    for x, h, lean in ((8, 12, -3), (14, 16, -1), (66, 14, 3), (74, 10, 4), (92, 12, 2)):
        g.append(path(f"M{x},110 Q{x+lean},{110-h*0.6} {x+lean*1.6},{110-h}", "none", MOSS, 2.2))
        g.append(path(f"M{x+3},110 Q{x+3+lean*0.4},{110-h*0.5} {x+2+lean},{110-h*0.75}", "none", GREEN, 1.8))
    svg("tombstone", 104, 116, g)

def deadtree(coarse=False):
    """A bare, gnarled tree in silhouette, leaning into the room. Drawn flat, all one dark, with no ink
    between the pieces (the joins showed as seams); the site gives it its edge with a shadow. One fat
    trunk, a low hooked bough toward the cat, a high bough curling back over the room, a crooked
    spire; a hollow knot; the spider on a short thread from the low bough (#spider swings)."""
    g = []
    P = PUPIL
    T = lambda pts, w0, w1: tapered_big(pts, w0, w1, 0.5, P, 6.0, P)
    g.append(ellipse(112, 330, 74, 8, P, "none", 0, 'opacity="0.4"'))
    # roots and the base
    g.extend(T([(104, 320), (66, 318), (30, 330)], 30, 6))
    g.extend(T([(122, 320), (160, 318), (194, 328)], 30, 6))
    # the trunk: one smooth S, fat at the foot, slimming as it rises
    g.extend(T([(112, 336), (108, 300), (98, 262), (98, 226), (108, 194), (118, 162), (118, 132), (124, 104), (120, 76)], 66, 18))
    # the low bough toward the cat: thick elbow, hooking down, a claw of twigs at the end
    g.extend(T([(104, 240), (74, 232), (48, 214), (30, 188), (28, 156)], 30, 7))
    g.extend(T([(30, 188), (14, 186), (4, 172)], 9, 3))
    g.extend(T([(28, 156), (16, 142), (14, 126)], 6, 2.5))
    g.extend(T([(28, 156), (38, 140), (38, 122)], 6, 2.5))
    g.extend(T([(48, 214), (42, 232), (28, 240)], 8, 3))
    # the high bough: up and back over the room, ending in a hook
    g.extend(T([(116, 172), (146, 160), (170, 138), (184, 110), (178, 80)], 28, 7))
    g.extend(T([(184, 110), (200, 114), (208, 102)], 8, 3))
    g.extend(T([(178, 80), (166, 66), (170, 50)], 6, 2.5))
    g.extend(T([(178, 80), (192, 66), (206, 62)], 6, 2.5))
    g.extend(T([(170, 138), (186, 148), (204, 146)], 7, 3))
    # the spire and its fork
    g.extend(T([(120, 76), (108, 52), (106, 26), (114, 4)], 18, 5))
    g.extend(T([(106, 26), (92, 20), (84, 6)], 6, 2.5))
    g.extend(T([(112, 60), (132, 50), (150, 54)], 8, 3))
    g.extend(T([(150, 54), (160, 42), (158, 28)], 4.5, 2))
    g.extend(T([(98, 262), (80, 266), (70, 280)], 9, 3))
    # the hollow knot: dark hole with a soft lighter rim inside the silhouette
    g.append(path(smooth_closed([(98, 254), (104, 240), (116, 238), (124, 252), (118, 270), (104, 272)], 0.5), "#3a2440", "none", 0))
    g.append(path(smooth_closed([(104, 254), (108, 244), (116, 244), (119, 254), (115, 264), (107, 264)], 0.5), INK, "none", 0))
    # the spider
    g.append('<g id="spider">')
    # hangs from the tip of the low bough, out past the claw, well clear of the trunk
    X = 40
    g.append(path(f"M{X},214 L{X},252", "none", LAV, 1.0, 'opacity="0.7"'))
    for (dx0, y0, dx1, y1) in ((0, 260, -14, 252), (0, 262, -16, 264), (0, 264, -12, 276), (0, 260, 14, 252), (0, 262, 16, 264), (0, 264, 12, 276)):
        g.append(path(f"M{X+dx0},{y0} Q{X+(dx0+dx1)/2},{y1-6} {X+dx1},{y1}", "none", INK, 1.8))
    g.append(ellipse(X, 264, 7, 8, P, INK, 1.6))
    g.append(ellipse(X, 255, 4.2, 4, P, INK, 1.4))
    g.append(f'<circle cx="{X-1.6}" cy="254.6" r="1.1" fill="{LAV}"/><circle cx="{X+1.6}" cy="254.6" r="1.1" fill="{LAV}"/>')
    g.append('</g>')
    if coarse: svg("deadtree-item", 212, 336, g, amp=0.8, step=8.0, decimals=0)   # the on-chain item picture: whole numbers, same shape
    else: svg("deadtree", 212, 336, g, amp=0.8, step=8.0, decimals=1)

def fence():
    """A wonky graveyard fence in silhouette, for the back of the room. Wide and low."""
    g = []
    for i, (x, h, lean) in enumerate(((10, 44, -2), (46, 52, 1), (84, 46, -1), (120, 56, 2), (158, 48, 0), (194, 54, -2), (232, 46, 1), (268, 52, 0), (304, 45, -1), (340, 55, 2))):
        top = 60 - h
        g.append(path(f"M{x-4},60 L{x-3+lean},{top+6} L{x+lean},{top} L{x+3+lean},{top+6} L{x+4},60 Z", PUPIL, INK, 1.4))
    g.append(path("M0,30 Q175,26 350,32", "none", PUPIL, 5.0))
    g.append(path("M0,30 Q175,26 350,32", "none", INK, 1.2, 'opacity="0.6"'))
    g.append(path("M0,48 Q175,52 350,46", "none", PUPIL, 5.0))
    g.append(path("M0,48 Q175,52 350,46", "none", INK, 1.2, 'opacity="0.6"'))
    svg("fence", 350, 62, g, amp=0.8, step=8.0, decimals=1)

def bat():
    """A bat in flight. #wl and #wr flap in the site (transform-box: fill-box, pivot at the body)."""
    g = []
    wing_l = "M40,26 C30,10 14,6 2,12 C8,16 10,20 8,26 C14,24 20,26 22,32 C26,28 34,30 40,34 Z"
    wing_r = "M50,26 C60,10 76,6 88,12 C82,16 80,20 82,26 C76,24 70,26 68,32 C64,28 56,30 50,34 Z"
    g.append(f'<g id="wl">{path(wing_l, PUPIL, INK, 1.6)}</g>')
    g.append(f'<g id="wr">{path(wing_r, PUPIL, INK, 1.6)}</g>')
    g.append(path(smooth_closed([(38, 22), (40, 14), (45, 10), (50, 14), (52, 22), (52, 34), (45, 40), (38, 34)], 0.5), PUPIL, INK, 1.6))
    g.append(path("M39,15 L36,6 L42,12 Z", PUPIL, INK, 1.3))
    g.append(path("M51,15 L54,6 L48,12 Z", PUPIL, INK, 1.3))
    g.append(f'<circle cx="42.5" cy="19" r="1.5" fill="{LAV}"/><circle cx="47.5" cy="19" r="1.5" fill="{LAV}"/>')
    g.append(path("M43,26 L44,29 M47,26 L46,29", "none", FUR, 1.2))
    svg("bat", 90, 46, g, amp=0.6)

def harvestmoon():
    """A big low moon in pumpkin gold with three craters; the site gives it the glow."""
    g = []
    g.append(ellipse(70, 70, 60, 60, "#F2B14A", INK, LW))
    g.append(ellipse(70, 70, 60, 60, "none", "#FFE3A0", 3.0, 'opacity="0.35"'))
    for cx, cy, r in ((46, 50, 9), (84, 42, 6), (78, 88, 11), (50, 96, 5)):
        g.append(ellipse(cx, cy, r, r * 0.85, "#D98A24", "none", 0, 'opacity="0.8"'))
        g.append(ellipse(cx - r*0.25, cy - r*0.25, r*0.6, r*0.5, "#E9A23A", "none", 0, 'opacity="0.9"'))
        g.append(path(f"M{cx-r:.0f},{cy+r*0.6:.0f} Q{cx},{cy+r*1.1:.0f} {cx+r:.0f},{cy+r*0.5:.0f}", "none", "#C4761A", 1.4, 'opacity="0.5"'))
    g.append(path("M28,46 Q40,26 62,18", "none", "#FFFFFF", 2.6, 'opacity="0.35"'))
    svg("harvestmoon", 140, 140, g, amp=0.5, decimals=1)


for fn in (bowl, poop, tub, yarn, crumb, foam, heart, bubble, sparkle, droplet, puff, scoop, sponge, thought, moon, tangle, sun, coin, flame, grave, witchhat, locker, lockeropen, pricetag, bag, shelf,
           partyhat, bow, shades, bell, fish, potion, wand, cushion, crate, beanie, hook, milk, robehung,
           cobweb, pumpkin, tombstone, deadtree, bat, harvestmoon, fence):
    fn()
deadtree(coarse=True)
