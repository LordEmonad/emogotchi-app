"""The kapparot hen (the Jewish pack) -> packages/pet/props/hen.svg, feather.svg, kapparotcard.svg

A plump white cartoon hen, side view facing right, alive and flustered: a red comb and wattle, an open orange beak, one
wide eye with a worried brow, a fanned tail. She is never harmed and is never shown after she flaps away.

  hen.svg       one box (100 x 100, her feet on y=92); the parts the director switches by VISIBILITY, never
                opacity (an SVG group with an opacity animation gets its own GPU layer in Chrome and blinks):
                  .wing.w0 folded on her side, .w1 half up, .w2 flung up (three frames of a flap);
                  .legs.stand straight down to the ground, .legs.dangle kicked out with the toes spread (held).
  feather.svg   one loose white feather, for the ones she sheds.
  kapparotcard.svg  the item's picture for the shop card (build-art.mjs): the hen mid-flap with feathers round her.

Same flat fills and wobbly ink as props.py. Kept apart so nothing else is regenerated. Run: python3 design/kapparotprops.py
"""
import os, re, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, LW, LD, smooth_closed, smooth_open, poly, path, ellipse
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

WHITE = "#FFFFFF"
SHADE = "#E2DFEC"     # the shadowed white: under the belly, the far feathers, the inside of the wing
SHADE2 = "#C9C4D8"    # deeper shade: the crease under the wing, the far tail feathers
COMB = "#E23B3F"
COMB2 = "#B42A30"     # the comb's and wattles' shaded side
COMBHI = "#FF8A80"    # a highlight on the comb
BEAK = "#F7B32B"
BEAK2 = "#D98A17"
LEG = "#F5A93B"
LEG2 = "#C9791C"      # the scales on the legs
EYE = "#1A1418"

def rnd(body):
    return re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}".rstrip("0").rstrip(".") or "0"), body)

def ink(el, amp=0.6, step=3.5):
    return bake(el, amp=amp, freq=0.09, step=step)

def svg(name, w, h, body):
    body = rnd("\n".join(body))
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"({len(src) / 1024:.1f} KB)")

def tube_path(a, b, w, fill, ink_w=1.6):
    """A leg segment: a round-capped band from a to b, inked."""
    d = f"M{a[0]:.2f},{a[1]:.2f} L{b[0]:.2f},{b[1]:.2f}"
    return [path(d, "none", INK, w + 2 * ink_w), path(d, "none", fill, w)]

def leg(x, y, kick, curl=0.0, L=13.5):
    """One leg from under the body at (x, y): a shin with two scale bands, three toes forward and one back. `kick` turns
    it (degrees, positive swings the foot forward/right), `curl` bends the toes down (a dangling foot)."""
    a = math.radians(kick)
    fx, fy = x + L * math.sin(a), y + L * math.cos(a)
    out = tube_path((x, y), (fx, fy), 3.0, LEG)
    for t in (0.45, 0.72):                                   # scale bands across the shin
        cx, cy = x + (fx - x) * t, y + (fy - y) * t
        nx, ny = math.cos(a) * 1.9, -math.sin(a) * 1.9
        out.append(path(f"M{cx - nx:.2f},{cy - ny:.2f} L{cx + nx:.2f},{cy + ny:.2f}", "none", LEG2, 0.9))
    # standing (curl 0) the toes lie along the ground: three fanned forward, one back; a dangling foot curls them down
    toes = ((78, 7.5), (92, 8.5), (106, 7.0), (-96, 4.5)) if curl == 0 else ((62 + curl, 7.5), (28 + curl * 1.2, 8.5), (-2 + curl * 1.4, 7.0), (-150 - curl * 0.5, 4.5))
    for ang, ln in toes:
        b = a + math.radians(ang)
        tx, ty = fx + ln * math.sin(b), fy + ln * math.cos(b)
        out += tube_path((fx, fy), (tx, ty), 2.1, LEG, 1.3)
    return out

def hen_body():
    """Everything but the wing and the legs, in paint order: the tail behind, the body, the neck ruff, the head."""
    g = []
    # the tail: four sickle feathers fanned up and back, the far two in shade, each with its quill
    tail = [((34, 50), (18, 22), (8, 20), 11, SHADE2), ((33, 54), (14, 32), (4, 34), 12, SHADE), ((33, 58), (15, 44), (5, 50), 11, WHITE), ((35, 62), (20, 56), (12, 64), 9, WHITE)]
    for base, mid, tip, w, col in tail:
        # a feather: a curved leaf from the base out to its tip, broadest near the middle
        bx, by = base; mx, my = mid; tx, ty = tip
        dx, dy = tx - bx, ty - by; Ln = math.hypot(dx, dy); nx, ny = -dy / Ln, dx / Ln
        pts = [(bx + nx * w * 0.35, by + ny * w * 0.35), (mx + nx * w * 0.55, my + ny * w * 0.55), (tx, ty), (mx - nx * w * 0.45, my - ny * w * 0.45), (bx - nx * w * 0.35, by - ny * w * 0.35)]
        g.append(ink(path(smooth_closed(pts, 0.55), col, INK, LW)))
        g.append(path(smooth_open([(bx + (mx - bx) * 0.2, by + (my - by) * 0.2), (mx, my), (tx + (bx - tx) * 0.15, ty + (by - ty) * 0.15)], 0.5), "none", SHADE2 if col == WHITE else "#B4AEC6", 1.1))
    # the body: a plump egg, the breast full and forward, the back sloping up to the tail
    body = [(40, 46), (54, 41), (66, 43), (76, 50), (80, 60), (77, 70), (68, 78), (54, 81), (42, 79), (32, 71), (28, 61), (31, 51)]
    g.append(ink(path(smooth_closed(body, 0.58), WHITE, INK, LW)))
    # shading: the belly underneath, a soft crescent; a highlight on the breast
    g.append(path(smooth_closed([(36, 71), (46, 77), (58, 79), (70, 75), (74, 70), (62, 74), (48, 74), (38, 69)], 0.5), SHADE, "none", 0))
    g.append(path(smooth_open([(72, 52), (76, 58), (77, 64)], 0.5), "none", WHITE, 2.6, 'opacity="0.9"'))
    # the neck and head: one shape, its fill running down into the body with no line across the join
    neck = [(60, 46), (58, 36), (60, 26), (64, 18), (71, 13), (79, 13), (85, 18), (87, 26), (84, 33), (80, 38), (77, 44), (76, 50), (68, 52)]
    g.append(path(smooth_closed(neck, 0.55), WHITE, "none", 0))
    g.append(ink(path(smooth_open([(58.6, 44), (58, 36), (60, 26), (64, 18), (71, 13), (79, 13), (85, 18), (87, 26), (84, 33), (80, 38), (77, 44), (76.5, 49)], 0.55), "none", INK, LW)))
    # the hackles: a ruff of small rounded feathers where the neck meets the body
    for (hx, hy) in ((61, 44), (65, 46.5), (69.5, 47.5), (73.5, 46.5)):
        g.append(path(f"M{hx - 3.2:.1f},{hy - 1.2:.1f} Q{hx:.1f},{hy + 3.4:.1f} {hx + 3.2:.1f},{hy - 1.2:.1f}", "none", SHADE2, 1.3))
    # the comb: five rounded points along the crown, shaded at the back, a highlight on the front lobes
    comb = [(65, 16), (64, 11), (66.5, 7), (69, 10), (70.5, 4.5), (73.5, 8.5), (75.5, 3.5), (78.5, 8), (81, 5), (83, 10), (83, 15), (78, 15.5), (71, 16)]
    g.append(ink(path(smooth_closed(comb, 0.45), COMB, INK, LD), 0.4, 3.0))
    g.append(path(smooth_open([(66, 14), (67, 10.5)], 0.5), "none", COMB2, 1.4))
    g.append(path(smooth_open([(76, 7), (77.5, 10)], 0.5), "none", COMBHI, 1.2))
    # the beak: open a little (she is flustered), the upper half hooked, a nostril
    g.append(ink(path(smooth_closed([(85, 21), (91, 22), (96, 25.5), (90, 26.2), (85.5, 26.5)], 0.35), BEAK, INK, LD), 0.3, 3.0))
    g.append(ink(path(smooth_closed([(85.5, 28.2), (91.5, 28.4), (93, 30), (86, 31)], 0.35), BEAK2, INK, LD), 0.3, 3.0))
    g.append(f'<circle cx="88.4" cy="23.2" r="0.55" fill="{INK}"/>')
    # the wattles under the beak, two drops, and the earlobe
    g.append(ink(path(smooth_closed([(83.5, 31), (86.5, 31.5), (87.5, 36.5), (85.5, 40), (82.8, 36.5)], 0.6), COMB, INK, LD), 0.3, 3.0))
    g.append(ink(path(smooth_closed([(81, 32), (83, 32.4), (83.3, 35.6), (81.4, 37.2), (80, 34.8)], 0.6), COMB2, INK, 1.2), 0.3, 3.0))
    g.append(ellipse(74.2, 27.8, 1.9, 2.4, "#F4E4E4", INK, 0.9))
    # the eye: round and wide, a catchlight, a worried brow tipped up in the middle
    g.append(ellipse(79.2, 21.2, 3.9, 4.2, WHITE, INK, 1.3))
    g.append(ellipse(80.1, 21.8, 2.4, 2.7, EYE, "none", 0))
    g.append(f'<circle cx="81" cy="20.7" r="0.95" fill="{WHITE}"/>')
    g.append(path("M74.8,15.7 Q78.2,14.2 82.6,15.8", "none", INK, 1.4))
    return g

def wing(frame):
    """The near wing, from the shoulder (about (60, 50)): folded on her side with its primaries lying back, half up, flung
    up. Each wing: the covert (a rounded top) and the flight feathers, their tips drawn as separate rounded points."""
    g = []
    if frame == 0:
        outline = [(63, 50), (64, 58), (59, 66), (50, 71), (39, 72), (32, 70), (37, 67.5), (30, 65), (36, 62), (31, 58.5), (39, 56), (46, 51), (55, 48)]
        coverts = [(62, 55), (55, 58.5), (46, 60), (41, 60)]
        quills = [[(52, 63), (37, 68.5)], [(50, 60), (34, 64)], [(48, 57.5), (35, 59.5)]]
    elif frame == 1:
        outline = [(58, 53), (64, 48), (65, 39), (61, 30), (58, 33), (55, 24), (51, 30), (46, 23), (44, 32), (39, 29), (40, 39), (45, 47), (52, 52)]
        coverts = [(62, 44), (58, 41), (52, 40), (46, 42)]
        quills = [[(58, 43), (58, 31)], [(54, 43), (52, 28)], [(49, 44), (46, 30)]]
    else:
        outline = [(58, 52), (64, 44), (66, 31), (64, 17), (60, 21), (58, 9), (54, 17), (50, 6), (47, 16), (42, 8), (41, 22), (43, 37), (49, 48)]
        coverts = [(63, 38), (58, 34), (52, 34), (46, 38)]
        quills = [[(60, 33), (61, 18)], [(55, 32), (55, 13)], [(50, 33), (48, 14)], [(46, 35), (43, 20)]]
    g.append(ink(path(smooth_closed(outline, 0.32), WHITE, INK, LW), 0.55, 3.2))
    g.append(path(smooth_open(coverts, 0.5), "none", SHADE2, 1.5))
    for q in quills: g.append(path(smooth_open(q, 0.5), "none", SHADE, 1.6))
    return g

def hen():
    W, H = 100, 100
    g = []
    g.append('<g class="legs stand">'); g += leg(47, 79, -4, L=11) + leg(58, 79, 6, L=11); g.append('</g>')   # toes on the ground at y ~91
    g.append('<g class="legs dangle" style="visibility:hidden">'); g += leg(47, 79, -24, curl=24, L=12) + leg(58, 79, 20, curl=24, L=12); g.append('</g>')
    g += hen_body()
    for f in range(3):
        g.append(f'<g class="wing w{f}"{"" if f == 0 else " style=\"visibility:hidden\""}>'); g += wing(f); g.append('</g>')
    svg("hen", W, H, g)

def feather():
    pts = [(4, 22), (8, 12), (14, 5), (19, 3), (18, 9), (14, 16), (8, 21)]
    g = [ink(path(smooth_closed(pts, 0.55), WHITE, INK, 1.6), 0.4, 3.0), path("M3,23 Q10,13 18,4", "none", SHADE, 1.2)]
    svg("feather", 22, 26, g)

def kapparotcard():
    """The item's picture: the hen mid-flap, wings up, legs kicking, a few feathers in the air round her."""
    W, H = 140, 120
    g = []
    def place_feather(x, y, a, s=1.0):
        pts = [(4, 22), (8, 12), (14, 5), (19, 3), (18, 9), (14, 16), (8, 21)]
        body = [ink(path(smooth_closed(pts, 0.55), WHITE, INK, 1.6), 0.4, 3.0), path("M3,23 Q10,13 18,4", "none", SHADE, 1.2)]
        return [f'<g transform="translate({x} {y}) rotate({a} 11 13) scale({s})">'] + body + ['</g>']
    g += place_feather(8, 30, -30, 0.9) + place_feather(112, 20, 25, 0.8) + place_feather(116, 52, 60, 0.7) + place_feather(14, 82, 15, 0.75)
    g.append('<g transform="translate(20 18)">')
    g += leg(47, 79, -24, curl=24, L=12) + leg(58, 79, 20, curl=24, L=12)
    g += hen_body()
    g += wing(2)
    g.append('</g>')
    svg("kapparotcard", W, H, g)

if __name__ == "__main__":
    hen(); feather(); kapparotcard()
