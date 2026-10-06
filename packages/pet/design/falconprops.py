"""The falcon (the Habibi pack's Pet item) -> packages/pet/props/falcon.svg

A saker-type falcon of Gulf falconry, cartoon and friendly: a dark brown-grey hood and back, a cream breast barred in
brown, the dark "moustache" stripe under a big round eye with a yellow eye-ring, a yellow cere over a blue-grey hooked
beak, yellow feet with dark talons, a long barred tail. Side view, facing right. It lands on a pet, is stroked, rouses
and flies off; it never pecks and is never harmed.

  falcon.svg   one box (140 x 150); perched, its toes grip a perch whose top is at (70, 120) (FALCON_GRIP in director.ts).
               Two poses, each a group, and inside them the parts the director switches by VISIBILITY, never opacity (an
               SVG group with an opacity animation gets its own GPU layer in Chrome and blinks):
                 .fc-fly    flying, the body level: wings .fc-fw-glide / .fc-fw-up / .fc-fw-down (a beat is up, glide, down)
                 .fc-sit    upright (perched, and the flare before it lands): tail .fc-tail-closed / .fc-tail-fan, legs
                            .fc-legs-grip / .fc-legs-reach / .fc-legs-push, body .fc-body-sleek / .fc-body-fluff (the rouse), wing
                            .fc-sw-fold / .fc-sw-half / .fc-sw-up (and the far wing's .fc-sfw-half / .fc-sfw-up behind),
                            head .fc-head-0 / .fc-head-down (a bob, a preen) / .fc-head-joy (eyes shut, content) / .fc-head-back
                            (looking back over its shoulder)
               Class names all start fc- and no element has an id: a perched falcon is copied into the pet's own drawing
               (rig.falconMount), where the rig looks its groups up by class and id. Its colours are its own, so none of
               pet.css's recolour-by-attribute rules (ghost, zombie, gold) can reach it there; its ink is a warm black, not
               the house #000000, for the same reason.

Same flat fills and wobbly ink as the other props. Kept apart so nothing else is regenerated. Run: python3 design/falconprops.py
"""
import os, re, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_closed, smooth_open, poly, path, ellipse
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

INK = "#0B0806"       # a warm black (see above)
LW, LD = 3.0, 1.9
BACK = "#6E5A4C"      # the back and the wings: a brown-grey
BACK2 = "#4A3B31"     # the hood, the flight feathers, the far wing
BACKHI = "#8F7A68"    # the pale edges of the wing coverts
CREAM = "#F6ECD8"     # breast, throat, cheek
CREAM2 = "#E5D3B4"    # the breast's shaded side, the thighs
BAR = "#8A6A4E"       # the bars on the breast and the tail
MALAR = "#3A2E27"     # the moustache stripe
YEL = "#F2C230"       # cere, eye-ring, feet
YEL2 = "#C98F17"      # the scales on the feet, the cere's shade
BEAK = "#8FA0B3"      # blue-grey beak
BEAK2 = "#4C5566"     # its dark tip
EYE = "#16110E"
SHINE = "#FFFFFE"     # (not #FFFFFF: pet.css recolours that inside a frok's eyes)
TALON = "#1C1714"

def rnd(body):
    return re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}".rstrip("0").rstrip(".") or "0"), body)

def ink(el, amp=0.55, step=3.5):
    return bake(el, amp=amp, freq=0.09, step=step)

def P(d, fill, stroke=INK, w=LW, extra=""):
    return path(d, fill, stroke, w, extra)

def grp(cls, parts, hidden=False, transform=""):
    t = f' transform="{transform}"' if transform else ""
    v = ' style="visibility:hidden"' if hidden else ""
    return [f'<g class="{cls}"{t}{v}>'] + parts + ['</g>']

# ---------------- the head (drawn about its own centre (0, 0), placed by a transform) ----------------
HEAD = [(-15, 11), (-17.5, 1), (-14, -10), (-4, -16.5), (8, -15.5), (15.5, -9.5), (18.5, -2), (17.5, 6), (12, 13), (3, 17), (-7, 16)]
def head(kind="0"):
    """The head, facing right, centred at (0, 0): a round head under a dark hood that takes in the eye and drops below it
    as the moustache, a cream cheek behind it and a cream throat in front, a big eye in a thin yellow ring, the yellow
    cere and the blue-grey hooked beak. kind: '0', or 'joy' (the eye shut in a happy arc)."""
    g = []
    g.append(P(smooth_closed(HEAD, 0.55), CREAM, "none", 0))
    # the hood: the crown, the nape, round the eye and down into the moustache; the cheek patch behind it stays cream
    hood = [(15.8, -8.6), (8, -15.5), (-4, -16.5), (-14, -10), (-17.5, 1), (-15, 11), (-11, 8.6), (-8.4, 3.4), (-4.2, 1.2), (-1.4, 4.6),
            (0.2, 11), (2.6, 16.6), (6.4, 12.6), (7.6, 6.4), (11.8, 4.2), (16.6, 1.2), (17.4, -3.6)]
    g.append(P(smooth_closed(hood, 0.45), BACK2, "none", 0))
    g.append(ink(P(smooth_closed(HEAD, 0.55), "none")))
    # a soft light on the crown
    g.append(P("M-9,-10.5 Q-3,-14.2 4,-13.6", "none", BACKHI, 2.0, 'opacity="0.8"'))
    # cere and beak: the upper mandible hooks down past the lower, the gape turned up a little (a smile)
    g.append(ink(P(smooth_closed([(15.0, -8.0), (19.4, -6.6), (20.6, -1.4), (17.4, 0.2), (15.6, -3.0)], 0.4), YEL, INK, LD), 0.3, 3.0))
    upper = [(19.2, -6.8), (24.4, -4.8), (27.6, -0.2), (27.4, 5.6), (25.2, 7.8), (24.2, 3.6), (21.4, 1.2), (19.8, -0.6)]
    g.append(ink(P(smooth_closed(upper, 0.45), BEAK, INK, LD), 0.3, 3.0))
    g.append(P(smooth_closed([(27.5, 2.4), (27.4, 5.6), (25.2, 7.8), (24.8, 5.0)], 0.4), BEAK2, "none", 0))
    g.append(ink(P(smooth_closed([(19.6, 2.2), (23.2, 3.4), (23.8, 6.2), (20.6, 6.0)], 0.4), BEAK, INK, 1.5), 0.3, 3.0))
    g.append(P("M17.2,1.4 Q18.6,3.4 20.6,3.0", "none", INK, 1.3))   # the gape
    g.append(f'<circle cx="22.2" cy="-3.6" r="0.8" fill="{INK}"/>')   # the nostril
    # the eye, open (.fc-eye-open) or shut in a happy arc (.fc-eye-joy)
    g += grp("fc-eye-open", [ellipse(9.4, -3.4, 6.9, 7.1, YEL, INK, 1.3), ellipse(9.6, -3.3, 5.5, 5.8, EYE, "none", 0),
                             f'<circle cx="7.4" cy="-5.8" r="2.2" fill="{SHINE}"/>', f'<circle cx="11.9" cy="-0.6" r="0.95" fill="{SHINE}"/>'])
    g += grp("fc-eye-joy", [P("M3.6,-2.6 Q9.4,-9.4 15.0,-3.0", "none", YEL, 3.6), P("M3.6,-2.6 Q9.4,-9.4 15.0,-3.0", "none", INK, 1.9)], hidden=True)
    return g

def head_t(cx, cy, rot=0.0, flip=False):
    return f"translate({cx} {cy}) rotate({rot})" + (" scale(-1 1)" if flip else "")
# Where the one head goes in each pose (the director sets .fc-head's transform attribute to one of these: an attribute,
# not an animation, so nothing is promoted to a layer). Printed into falcon.svg's data-heads for the director to read.
HEAD_AT = {"sit": head_t(78, 34), "down": head_t(85, 42, 30), "joy": head_t(78, 34, -4), "back": head_t(72, 34, 4, True), "preen": head_t(86, 46, 44), "fly": head_t(106, 68, 10)}

def spots(pts, r=1.7):
    """The breast's marks: small dark teardrops, point up."""
    out = []
    for (x, y) in pts:
        out.append(P(f"M{x:.1f},{y - r * 1.7:.1f} Q{x + r * 1.1:.1f},{y - r * 0.2:.1f} {x:.1f},{y + r:.1f} Q{x - r * 1.1:.1f},{y - r * 0.2:.1f} {x:.1f},{y - r * 1.7:.1f} Z", BAR, "none", 0))
    return out

def wing_shape(lead, tips, trail, col, col2, notch=0.32, scallop=2.2, lw=LW):
    """A wing: `lead` the leading edge from the body out to the wrist, `tips` the primaries' tips from the leading side
    round to the trailing side (each gap notched back toward the wrist), `trail` the trailing edge from the last tip back
    to the body, scalloped (the secondaries). The hand (from the wrist out) is the darker colour."""
    wr = lead[-1]
    edge = list(lead)
    hand = [wr]
    for i, t in enumerate(tips):
        if i > 0:
            a = tips[i - 1]; m = ((a[0] + t[0]) / 2, (a[1] + t[1]) / 2)
            nt = (m[0] + (wr[0] - m[0]) * notch, m[1] + (wr[1] - m[1]) * notch)
            edge.append(nt); hand.append(nt)
        edge.append(t); hand.append(t)
    # the scallops of the trailing edge
    for i in range(1, len(trail)):
        a, b = trail[i - 1], trail[i]
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
        # outward = to the right of the direction of travel along the trailing edge (away from the wing's middle)
        cx = sum(p[0] for p in lead + tips) / len(lead + tips); cy = sum(p[1] for p in lead + tips) / len(lead + tips)
        nx, ny = -dy / L, dx / L
        if (m[0] - cx) * nx + (m[1] - cy) * ny < 0: nx, ny = -nx, -ny
        if i == 1: edge.append(a)
        edge.append((m[0] + nx * scallop, m[1] + ny * scallop)); edge.append(b)
    hand_base = trail[min(1, len(trail) - 1)]
    hand.append(hand_base)
    g = [P(smooth_closed(edge, 0.3), col, "none", 0)]
    g.append(P(smooth_closed(hand, 0.3), col2, "none", 0))
    for i in range(1, len(tips) - 1):   # the gaps between the primaries, run a little way in
        t = tips[i]; g.append(P(f"M{t[0] + (wr[0] - t[0]) * 0.18:.1f},{t[1] + (wr[1] - t[1]) * 0.18:.1f} L{t[0] + (wr[0] - t[0]) * 0.55:.1f},{t[1] + (wr[1] - t[1]) * 0.55:.1f}", "none", INK, 1.0, 'opacity="0.45"'))
    g.append(ink(P(smooth_closed(edge, 0.3), "none", INK, lw), 0.55, 5.0))
    return g

# ---------------- the upright pose ----------------
BODY = [(68, 44), (84, 45), (93, 58), (97.5, 75), (96, 92), (89, 105), (78, 112), (66, 110), (58, 101), (54.5, 86), (55.5, 70), (59, 56)]
FLUFF = [(66, 40), (85, 41), (96, 52), (102, 68), (103, 86), (98, 101), (89, 111), (77, 117), (64, 115), (54, 106), (49, 91), (49.5, 73), (53, 57), (58, 46)]
BREAST_SPOTS = [(84, 64), (91, 67), (79, 72), (87, 75), (93, 79), (82, 83), (89, 87), (79, 93), (86, 96), (82, 103)]

def ruffle(pts, depth=2.4):
    """An outline with a small feather tuft between each pair of points (a bird fluffed up)."""
    out = []
    n = len(pts); cx = sum(p[0] for p in pts) / n; cy = sum(p[1] for p in pts) / n
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        out.append(a)
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        dx, dy = mx - cx, my - cy; L = math.hypot(dx, dy) or 1
        out.append((mx + dx / L * depth, my + dy / L * depth))
    return out

def body(kind):
    g = []
    if kind == "sleek":
        g.append(ink(P(smooth_closed(BODY, 0.55), CREAM), 0.55, 5.0))
        g.append(P(smooth_closed([(90, 60), (96, 74), (95, 91), (89, 103), (80, 109), (88, 94), (91, 78)], 0.5), CREAM2, "none", 0))   # the breast's far side, in shade
        g += spots(BREAST_SPOTS)
    else:
        # fluffed up: every feather stands out, the breast and the back both round out past the wing
        g.append(P(smooth_closed(ruffle(FLUFF, 2.8), 0.35), CREAM, "none", 0))
        g.append(P(smooth_closed([(47, 70), (52, 56), (58, 46), (64, 44), (60, 60), (57, 78), (56, 96), (60, 108), (52, 104), (48, 90)], 0.5), BACK, "none", 0))   # the back, puffed out behind the wing
        g.append(P(smooth_closed([(95, 58), (101, 72), (101, 90), (95, 104), (85, 113), (93, 96), (96, 78)], 0.5), CREAM2, "none", 0))
        g += spots([(x + (x - 76) * 0.18, y + (y - 80) * 0.1) for (x, y) in BREAST_SPOTS], 1.9)
        g.append(ink(P(smooth_closed(ruffle(FLUFF, 2.8), 0.35), "none"), 0.5, 4.0))
    return g

def legs(kind):
    g = []
    if kind == "grip":
        for (x0, x1) in ((66.5, 66.0), (75.5, 76.0)):
            d = f"M{x0},108 L{x1},119.2"
            g += [P(d, "none", INK, 5.8), P(d, "none", YEL, 3.4)]
            for t in (0.45, 0.72):
                y = 108 + 11.2 * t; x = x0 + (x1 - x0) * t
                g.append(P(f"M{x - 1.4:.1f},{y:.1f} L{x + 1.4:.1f},{y:.1f}", "none", YEL2, 0.9))
        # the toes over the perch: two forward curled down over its top edge (y 120), one back
        for fx in (66.0, 76.0):
            for (tx, ty) in ((5.4, 1.2), (8.2, 2.8), (-5.0, 1.6)):
                d = f"M{fx},119.2 Q{fx + tx * 0.6:.1f},118.7 {fx + tx:.1f},{120 + ty:.1f}"
                g += [P(d, "none", INK, 4.4), P(d, "none", YEL, 2.1)]
                sx = 1 if tx > 0 else -1
                g.append(P(f"M{fx + tx:.1f},{120 + ty:.1f} q{sx * 0.9:.1f},1.3 {-sx * 0.5:.1f},2.5", "none", TALON, 1.5))
        g.append(ink(P(smooth_closed([(61, 98), (71, 100), (80, 103), (82, 109), (76, 113.5), (66, 113), (60, 107)], 0.5), CREAM2)))
        g += spots([(66, 106), (74, 107)], 1.3)
    elif kind == "push":
        # pushing off: the legs straightened down and a little back, the toes pointed (the first instant of a take-off)
        for (x0, y0, x1, y1) in ((66.5, 108, 61.5, 121.5), (75.5, 108, 70.5, 122.5)):
            d = f"M{x0},{y0} L{x1},{y1}"
            g += [P(d, "none", INK, 5.8), P(d, "none", YEL, 3.4)]
            for (ang, ln) in ((96, 7.6), (74, 7.2), (122, 5.8), (-70, 4.2)):
                a = math.radians(ang)
                tx, ty = x1 + ln * math.cos(a), y1 + ln * math.sin(a)
                dd = f"M{x1},{y1} L{tx:.1f},{ty:.1f}"
                g += [P(dd, "none", INK, 4.0), P(dd, "none", YEL, 1.9)]
                g.append(P(f"M{tx:.1f},{ty:.1f} l{1.6 * math.cos(a + 1.3):.1f},{1.6 * math.sin(a + 1.3):.1f}", "none", TALON, 1.5))
        g.append(ink(P(smooth_closed([(61, 99), (71, 100), (80, 103), (82, 109), (76, 113.5), (66, 113), (60, 107)], 0.5), CREAM2)))
    else:
        # reaching: the legs thrown forward and down, the toes spread wide to take the perch
        for (x0, y0, x1, y1) in ((68, 107, 82, 121), (76, 106, 90, 118)):
            d = f"M{x0},{y0} L{x1},{y1}"
            g += [P(d, "none", INK, 5.8), P(d, "none", YEL, 3.4)]
            for (ang, ln) in ((8, 7.6), (38, 7.2), (-62, 6.2), (196, 5.2)):
                a = math.radians(ang)
                tx, ty = x1 + ln * math.cos(a), y1 + ln * math.sin(a)
                dd = f"M{x1},{y1} L{tx:.1f},{ty:.1f}"
                g += [P(dd, "none", INK, 4.0), P(dd, "none", YEL, 1.9)]
                g.append(P(f"M{tx:.1f},{ty:.1f} l{1.7 * math.cos(a + 1.3):.1f},{1.7 * math.sin(a + 1.3):.1f}", "none", TALON, 1.5))
        g.append(ink(P(smooth_closed([(62, 99), (72, 100), (81, 103), (84, 109), (78, 114), (68, 113), (61, 107)], 0.5), CREAM2)))
    return g

def tail(kind):
    g = []
    if kind == "closed":
        pts = [(59, 104), (71, 107), (68, 124), (65, 138), (61, 143), (54.5, 143.5), (51.5, 139), (53, 122)]
        g.append(ink(P(smooth_closed(pts, 0.45), BACK)))
        for t in (0.32, 0.54, 0.76):
            y = 107 + (140 - 107) * t
            g.append(P(f"M{53.5 - 2.4 * t:.1f},{y + 1.2:.1f} Q{60 - 2 * t:.1f},{y + 2.6:.1f} {68.5 - 4 * t:.1f},{y - 0.4:.1f}", "none", BACK2, 2.4))
        g.append(P("M53.2,139.4 Q58.4,141.8 63.4,139.0", "none", CREAM, 2.2))
    else:
        tips = [(40, 134), (46, 141), (54, 145), (62, 144), (70, 139)]
        pts = [(58, 102), (72, 106), (72, 122), tips[4], (66, 140.5), tips[3], (58, 144.5), tips[2], (50, 143.5), tips[1], (43, 138.5), tips[0], (46, 122), (52, 108)]
        g.append(ink(P(smooth_closed(pts, 0.35), BACK)))
        for t in (0.34, 0.56, 0.78):
            y = 108 + 32 * t
            g.append(P(f"M{50 - 9 * t:.1f},{y + 1.6:.1f} Q{57:.1f},{y + 4:.1f} {70 + 1.5 * t:.1f},{y - 0.8:.1f}", "none", BACK2, 2.4))
        for (x, y) in tips[1:4]:
            g.append(P(f"M{x - 2.6:.1f},{y - 2.4:.1f} Q{x:.1f},{y - 0.6:.1f} {x + 2.6:.1f},{y - 2.6:.1f}", "none", CREAM, 1.8))
    return g

def coverts(rows):
    """Rows of pale feather edges across a wing's arm: each row a list of scallop centres."""
    out = []
    for row in rows:
        for (x, y) in row:
            out.append(P(f"M{x - 2.6:.1f},{y - 0.6:.1f} Q{x:.1f},{y + 2.6:.1f} {x + 2.6:.1f},{y - 0.6:.1f}", "none", BACKHI, 1.5))
    return out

def sit_wing(kind, far=False):
    """The near wing in the upright pose. fold: along the back, its long primaries crossing over the tail; half: opened
    out back; up: raised high over the back (the flare before landing, a take-off)."""
    col, col2 = (BACK2, "#382C24") if far else (BACK, BACK2)
    g = []
    if kind == "fold":
        outline = [(60, 50), (70, 51), (78, 60), (81, 74), (80, 89), (75, 101), (67, 114), (60, 126), (55.5, 132), (52.5, 127), (53, 110), (53, 92), (54, 72), (56, 58)]
        g.append(P(smooth_closed(outline, 0.45), col, "none", 0))
        g.append(P(smooth_closed([(55, 96), (76, 97), (70, 110), (62, 122), (56, 130), (54, 114)], 0.45), col2, "none", 0))
        for (a, b) in (((59, 100), (55.5, 126)), ((64, 100), (58.5, 122)), ((69, 101), (62, 117))):
            g.append(P(f"M{a[0]},{a[1]} L{b[0]},{b[1]}", "none", INK, 1.1, 'opacity="0.5"'))
        if not far: g += coverts([[(60, 66), (66, 67), (72, 68)], [(58, 76), (64, 78), (70, 79), (76, 80)], [(58, 87), (64, 89), (70, 90), (75.5, 91)]])
        g.append(ink(P(smooth_closed(outline, 0.45), "none"), 0.55, 5.0))
    elif kind == "half":
        g += wing_shape([(72, 58), (60, 48), (44, 44)], [(30, 40), (21, 45), (17, 53), (20, 60), (28, 64)], [(28, 64), (40, 70), (52, 74), (62, 74)], col, col2)
        if not far: g += coverts([[(48, 52), (55, 55), (62, 58)], [(46, 60), (53, 63), (60, 65)]])
    else:  # up
        g += wing_shape([(70, 60), (68, 42), (70, 24)], [(66, 10), (60, 4), (52, 3), (45, 7), (40, 14)], [(40, 14), (42, 28), (48, 42), (56, 54), (62, 62)], col, col2)
        if not far: g += coverts([[(62, 30), (58, 38), (60, 46)], [(55, 32), (52, 40), (54, 48)]])
    return g

def sit():
    g = ['<g class="fc-sit">']
    # the far wing, behind everything (only seen when the wings are open)
    g += grp("fc-sfw-half", ['<g transform="translate(20 -9) rotate(-10 72 58)">'] + sit_wing("half", far=True) + ['</g>'], hidden=True)
    g += grp("fc-sfw-up", ['<g transform="translate(26 4) rotate(16 70 60)">'] + sit_wing("up", far=True) + ['</g>'], hidden=True)
    g += grp("fc-tail-closed", tail("closed"))
    g += grp("fc-tail-fan", tail("fan"), hidden=True)
    g += grp("fc-legs-grip", legs("grip"))
    g += grp("fc-legs-reach", legs("reach"), hidden=True)
    g += grp("fc-legs-push", legs("push"), hidden=True)
    g += grp("fc-body-sleek", body("sleek"))
    g += grp("fc-body-fluff", body("fluff"), hidden=True)
    g += grp("fc-sw-fold", sit_wing("fold"))
    g += grp("fc-sw-half", sit_wing("half"), hidden=True)
    g += grp("fc-sw-up", sit_wing("up"), hidden=True)
    g.append('</g>')
    return g

# ---------------- the flying pose ----------------
def pointed_wing(R, T, c0, col, col2, lead_bulge=2.5, near=True, curl=0.0):
    """A falcon's wing: long and pointed. From the root R (on the body) out to the tip T, `c0` wide at the root, tapering
    to the point. The leading edge bows out a little at the wrist (40% out); the trailing edge is the secondaries, gently
    scalloped, then the long primaries sweeping to the tip. The hand (outer half) is the darker colour. `curl` bends the
    whole wing (degrees at the tip: the tip swept back more than the root)."""
    ax, ay = T[0] - R[0], T[1] - R[1]; L = math.hypot(ax, ay); ux, uy = ax / L, ay / L
    nx, ny = uy, -ux   # the leading side: to the left of root->tip (a wing pointing back and up has its leading edge on top)
    def at(u, off):
        # position along the (slightly curled) axis, `off` to the leading side
        b = math.radians(curl) * u * u
        cx_, cy_ = ux * math.cos(b) - uy * math.sin(b), uy * math.cos(b) + ux * math.sin(b)
        mx, my = cx_, cy_
        return (R[0] + ux * L * u + (mx - ux) * L * u * 0.5 + (-my) * off * 0 + nx * off, R[1] + uy * L * u + (my - uy) * L * u * 0.5 + ny * off)
    def width(u): return c0 * (1 - u) ** 0.85
    lead, trail = [], []
    for i in range(13):
        u = i / 12
        lead.append(at(u, width(u) * 0.38 + lead_bulge * math.sin(math.pi * min(1, u / 0.8)) * (1 - u)))
    for i in range(13):
        u = 1 - i / 12
        w = width(u) * 0.62
        if 0.12 < u < 0.55 and i % 2 == 0: w += 1.6          # the secondaries' scallops
        trail.append(at(u, -w))
    edge = lead + trail[1:]
    g = [P(smooth_closed(edge, 0.35), col, "none", 0)]
    hand = [at(0.5, width(0.5) * 0.38 + lead_bulge * 0.5)] + lead[7:] + trail[1:6] + [at(0.5, -width(0.5) * 0.62)]
    g.append(P(smooth_closed(hand, 0.35), col2, "none", 0))
    # feather lines across the hand, and the coverts' pale edges near the leading edge
    for u in (0.62, 0.74, 0.86):
        a_, b_ = at(u - 0.1, -width(u - 0.1) * 0.55), at(u + 0.02, width(u) * 0.1)
        g.append(P(f"M{a_[0]:.1f},{a_[1]:.1f} L{b_[0]:.1f},{b_[1]:.1f}", "none", INK, 1.0, 'opacity="0.45"'))
    if near:
        for u in (0.14, 0.26, 0.38):
            q = at(u, width(u) * 0.05)
            g.append(P(f"M{q[0] - 2.4:.1f},{q[1] - 0.6:.1f} Q{q[0]:.1f},{q[1] + 2.4:.1f} {q[0] + 2.4:.1f},{q[1] - 0.6:.1f}", "none", BACKHI, 1.4))
    g.append(ink(P(smooth_closed(edge, 0.35), "none", INK, LW), 0.5, 5.0))
    return g

# the flying body: long and slim, level; the wings' roots sit on its back at the shoulder (~(84, 60))
FLY_BODY = [(104, 56.5), (92, 54), (78, 55), (64, 58), (52, 62), (47, 66), (53, 71.5), (67, 77), (83, 81), (97, 79.5), (105, 73), (108, 65)]

def fly_wing(kind, far=False):
    col, col2 = (BACK2, "#382C24") if far else (BACK, BACK2)
    if kind == "glide":    # held out and swept back, a little up: the long pointed silhouette of a falcon gliding
        return pointed_wing((84, 61), (16, 38), 24, col, col2, near=not far, curl=-6)
    if kind == "up":       # the top of the upstroke: raised high over the back, still swept back
        return pointed_wing((83, 60), (52, 2), 24, col, col2, near=not far, curl=-8)
    # the bottom of the downstroke: under the body, swept back
    return pointed_wing((82, 66), (40, 116), 23, col, col2, near=not far, curl=8)

def fly():
    g = ['<g class="fc-fly" style="visibility:hidden">', '<g transform="translate(0 10)">']
    # the far wing, behind the body, a little higher and further back: both wings show
    g += grp("fc-fw-glide", ['<g transform="translate(6 -4) rotate(9 84 61)">'] + fly_wing("glide", far=True) + ['</g>'])
    g += grp("fc-fw-up", ['<g transform="translate(7 -2) rotate(8 83 60)">'] + fly_wing("up", far=True) + ['</g>'], hidden=True)
    g += grp("fc-fw-down", ['<g transform="translate(9 -5) rotate(-10 82 66)">'] + fly_wing("down", far=True) + ['</g>'], hidden=True)
    # the tail, long and narrow, straight back, its tip banded pale
    tpts = [(60, 61), (60, 72), (44, 73.5), (26, 75.5), (15.5, 74.5), (12.5, 69.5), (14.5, 64.5), (25, 63), (44, 62.5)]
    g.append(ink(P(smooth_closed(tpts, 0.4), BACK)))
    for (x, y0, y1) in ((24, 63.2, 75.2), (34, 63, 74.6), (44, 62.8, 73.6)):
        g.append(P(f"M{x + 1:.1f},{y0:.1f} Q{x - 1.2:.1f},{(y0 + y1) / 2:.1f} {x + 0.5:.1f},{y1:.1f}", "none", BACK2, 2.2))
    g.append(P("M16.4,64.8 Q13.4,69.5 16.4,74.3", "none", CREAM, 2.0))
    # the feet, tucked up under the tail coverts
    g.append(ink(P(smooth_closed([(60, 75), (69, 76.5), (67.5, 80), (59, 79.5)], 0.5), YEL, INK, 1.7), 0.3))
    # the body: the back brown, the breast and belly cream and spotted
    g.append(P(smooth_closed(FLY_BODY, 0.55), CREAM, "none", 0))
    g.append(P(smooth_closed([(50, 62), (64, 57.5), (80, 55.3), (94, 55.4), (102, 58), (90, 63), (72, 65.5), (56, 67)], 0.5), BACK, "none", 0))
    g += spots([(70, 72), (77, 74.5), (85, 75), (93, 73.5), (99, 70), (80, 78.5), (89, 78.5)], 1.4)
    g.append(ink(P(smooth_closed(FLY_BODY, 0.55), "none"), 0.55, 5.0))
    for k in ("glide", "up", "down"):
        g += grp(f"fc-nw-{k}", fly_wing(k), hidden=(k != "glide"))
    g.append('</g></g>')
    return g

def svg(name, w, h, body):
    body = rnd("\n".join(body))
    # every stroke here is round-joined and round-capped: say it once on the root (inherited), not on every element;
    # and a fill-only element needs no stroke attributes at all
    body = body.replace(' stroke-linejoin="round" stroke-linecap="round"', '').replace(' stroke="none" stroke-width="0"', '').replace(' />', '/>')
    import json
    heads = json.dumps(HEAD_AT).replace('"', "'")
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g class="fc-bird" data-heads="{heads}" stroke-linejoin="round" stroke-linecap="round">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"({len(src) / 1024:.1f} KB)")

def falcon():
    # the one head, over both poses (the body's top is the neck: any head position covers the join)
    hd = [f'<g class="fc-head" transform="{HEAD_AT["sit"]}">'] + head() + ['</g>']
    svg("falcon", 140, 150, fly() + sit() + hd)

def falconfeather():
    """One loose brown feather with a pale edge and a barred vane, for the one it sheds when it rouses."""
    pts = [(4, 23), (7, 13), (12, 6), (18, 2.5), (19, 8), (15.5, 15), (9, 21)]
    g = [P(smooth_closed(pts, 0.55), BACK, "none", 0), P("M12.5,7.5 Q15.5,9.5 17.2,6.4", "none", BACK2, 1.4), P("M8.4,14.6 Q11.8,16.4 14.2,13.4", "none", BACK2, 1.4),
         P("M18.2,4 Q17.6,10.5 14.4,15.8", "none", BACKHI, 1.2), ink(P(smooth_closed(pts, 0.55), "none", INK, 1.6), 0.4, 3.0), P("M3,24 Q10,14 18,4", "none", CREAM2, 1.1)]
    svg_plain("falconfeather", 22, 26, g)

def svg_plain(name, w, h, body):
    body = rnd("\n".join(body)).replace(' stroke-linejoin="round" stroke-linecap="round"', '').replace(' stroke="none" stroke-width="0"', '').replace(' />', '/>')
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g stroke-linejoin="round" stroke-linecap="round">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"({len(src) / 1024:.1f} KB)")

if __name__ == "__main__":
    falcon(); falconfeather()
