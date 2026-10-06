"""Props for the frog's own actions -> packages/pet/props/*.svg

The camera with its flash, the slapping hand, the giant grabbing hand (palm behind, fingers in front, open and
closed), the match, the fire (a front cluster and a taller back one), the water from above, the impact burst.
Same flat fills, wobbly ink and Emonad palette as props.py; a few accents of their own for fire and water.
Kept apart from props.py so the room's props are not regenerated every time these change.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, FUR, HAIR, STRAND, PURPLE, LAV, LAV2, PINK, GOLD, GOLD2, RUBY, PUPIL, LW, LD, smooth_closed, smooth_open, poly, path, ellipse, tube, tapered
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))
FIRE1, FIRE2, FIRE3 = "#FFD23F", "#F5732A", "#D6332B"     # yellow heart, orange body, red tips
WATER, WATER2 = "#4FA3D8", "#A9D8F0"
WOOD = "#D9B98A"

def svg(name, w, h, body, amp=1.0, step=4.0):
    body = bake("\n".join(body), amp=amp, freq=0.09, step=step)
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name)

def rrect(x, y, w, h, r, fill, stroke=INK, lw=LW, extra=""):
    d = (f"M{x+r},{y} L{x+w-r},{y} Q{x+w},{y} {x+w},{y+r} L{x+w},{y+h-r} Q{x+w},{y+h} {x+w-r},{y+h} "
         f"L{x+r},{y+h} Q{x},{y+h} {x},{y+h-r} L{x},{y+r} Q{x},{y} {x+r},{y} Z")
    return path(d, fill, stroke, lw, extra)

# ---- camera: a boxy press camera, big lens, a flash dish up on a bracket ----
def camera():
    g = []
    g.append(path("M76,26 L76,12", "none", INK, 4.5))                                   # bracket
    g.append(path("M76,26 L76,12", "none", LAV2, 2.0))
    g.append('<g id="dish">')
    g.append(path("M60,20 C60,6 92,6 92,20 C92,24 86,27 76,27 C66,27 60,24 60,20 Z", LAV, INK, LW))      # reflector dish
    g.append(path("M64,18 C66,10 86,10 88,18", "none", "#FFFFFF", 1.6, 'opacity="0.8"'))
    g.append('<g id="bulb">')
    g.append(ellipse(76, 19, 5.2, 5.2, GOLD, INK, 1.4))
    g.append(f'<circle cx="74.5" cy="17.5" r="1.6" fill="#FFFFFF"/>')
    g.append('</g></g>')
    g.append(rrect(8, 26, 84, 40, 6, HAIR))                                               # body
    g.append(rrect(14, 20, 34, 9, 3, PUPIL, INK, 1.6))                                     # top plate with the viewfinder
    g.append(rrect(19, 13, 11, 8, 2, LAV2, INK, 1.4))
    g.append(rrect(36, 15, 8, 6, 2, GOLD, INK, 1.4))                                      # shutter button
    g.append(path("M14,34 L86,34", "none", STRAND, 2.2, 'opacity="0.7"'))                 # trim line
    g.append(ellipse(50, 47, 17, 17, LAV, INK, LW))                                        # lens rim
    g.append(ellipse(50, 47, 12.5, 12.5, PUPIL, INK, 1.4))
    g.append(ellipse(50, 47, 7, 7, PURPLE, "none", 0))
    g.append(path("M42,42 Q45,36 51,36", "none", "#FFFFFF", 2.0, 'opacity="0.85"'))
    g.append(f'<circle cx="55" cy="51" r="1.8" fill="#FFFFFF" opacity="0.7"/>')
    g.append(ellipse(80, 50, 4, 4, GOLD2, INK, 1.4))                                      # a knob
    svg("camera", 100, 70, g, amp=0.8)

# ---- hands. Cartoon gloves with real proportions: the fingers are about as long as the palm and together they are
# as wide as it; every finger is its own rounded shape drawn over the next so the knuckles and the tips read. ----
def _finger(a, b_, w, bend=0.1, fill=FUR):
    m = ((a[0] + b_[0]) / 2 + (b_[1] - a[1]) * bend, (a[1] + b_[1]) / 2 - (b_[0] - a[0]) * bend)
    return tube([a, m, b_], w, fill)

# The slapping hand: an open glove, palm to us, fingers up, thumb out, the way a slap is drawn in any cartoon; its
# arm runs off the right of the picture from the wrist. One clean outline round the whole hand (the fingers meet in
# V-shaped webs, as a hand is inked, not four sausages laid over each other), then the creases inside it. The palm's
# centre is (100, 168), the wrist (the joint the director cocks it back on) is (168, 200). Box 1400x260 so the
# sleeve reaches the edge of the room wherever the frog stands and wherever the hand is in its swing.
SLAP_W, SLAP_H = 1400, 260
SLAP_PALM = (100, 168)
SLAP_WRIST = (168, 200)
def _hand_outline():
    # fingers: base, tip, width at base, width at tip; little to index
    fingers = (((60, 130), (46, 74), 30, 26), ((90, 122), (86, 40), 33, 28), ((120, 120), (124, 32), 34, 29), ((150, 126), (160, 48), 32, 27))
    def edges(b_, t, w0, w1):
        dx, dy = t[0] - b_[0], t[1] - b_[1]; L = math.hypot(dx, dy); nx, ny = dy / L, -dx / L      # n points to the finger's left as we look at it (towards the thumb)
        return ((b_[0] + nx * w0 / 2, b_[1] + ny * w0 / 2), (t[0] + nx * w1 / 2, t[1] + ny * w1 / 2),
                (t[0] - nx * w1 / 2, t[1] - ny * w1 / 2), (b_[0] - nx * w0 / 2, b_[1] - ny * w0 / 2), (nx, ny))
    def q(p0, p1, bulge):
        # a quadratic between two points, bowing `bulge` to the right of travel
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2; dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy) or 1
        return f"Q{mx - dy / L * bulge:.1f},{my + dx / L * bulge:.1f} {p1[0]:.1f},{p1[1]:.1f}"
    d = []
    E = [edges(*f) for f in fingers]
    # up the little finger's outer side, over each tip, down into each web
    d.append(f"M{E[0][0][0]:.1f},{E[0][0][1]:.1f}")
    for i, (L0, L1, R1, R0, n) in enumerate(E):
        if i > 0: d.append(f"L{L0[0]:.1f},{L0[1]:.1f}")
        d.append(q(L0, L1, 3))                                                        # each edge bows out a touch
        r = fingers[i][3] / 2; k = 4 / 3 * r                                        # a semicircle over the tip as one cubic (the wobble baker knows no arcs)
        tx, ty = -n[1], n[0]                                                       # along the finger, towards the tip
        d.append(f"C{L1[0] + tx * k:.1f},{L1[1] + ty * k:.1f} {R1[0] + tx * k:.1f},{R1[1] + ty * k:.1f} {R1[0]:.1f},{R1[1]:.1f}")
        d.append(q(R1, R0, 3))
        if i < 3:
            nxt = E[i + 1][0]; web = ((R0[0] + nxt[0]) / 2, max(R0[1], nxt[1]) + 5)
            d.append(f"L{web[0]:.1f},{web[1]:.1f}")
    # down the index side of the palm to the wrist, round the heel, out along the thumb and back to the little finger
    palm_r = [E[3][3], (172, 150), (170, 178), (167, 210), (154, 232), (118, 240)]
    heel = [(118, 240), (80, 238), (54, 226), (40, 206), (36, 186)]
    thumb_out = [(36, 186), (26, 160), (12, 132), (6, 116)]
    thumb_in = [(24, 106), (36, 122), (50, 146), (56, 158)]
    up_left = [(56, 158), (50, 144), E[0][0]]
    for run in (palm_r, heel, thumb_out):
        d.append(smooth_open(run, 0.5).replace("M", "L", 1))
    d.append(f"C-2,104 12,98 {thumb_in[0][0]},{thumb_in[0][1]}")                      # the thumb's tip
    for run in (thumb_in, up_left):
        d.append(smooth_open(run, 0.5).replace("M", "L", 1))
    d.append("Z")
    return " ".join(d), fingers
def slaphand():
    g = []
    g += tube([(1420, 200), (700, 202), (196, 200)], 70, PURPLE)                           # the sleeve
    g.append(path("M220,182 Q250,186 282,181", "none", STRAND, 2.0, 'opacity="0.7"'))    # folds
    g.append(path("M226,220 Q256,224 286,219", "none", STRAND, 2.0, 'opacity="0.5"'))
    g.append(path(poly([(158, 158), (202, 156), (204, 242), (156, 244)]), FUR, INK, LW))    # cuff
    g.append(path("M178,164 L179,236", "none", LAV, 3.0))
    g.append(ellipse(190, 176, 2.6, 2.6, LAV2, INK, 1.2)); g.append(ellipse(190, 224, 2.6, 2.6, LAV2, INK, 1.2))   # cuff buttons
    outline, fingers = _hand_outline()
    g.append(path(outline, FUR, INK, LW))
    # a little shade in the hollow of the palm and under the fingers, so it reads as a cupped palm, not a mitten
    g.append(path("M64,138 Q100,128 152,136 Q150,176 128,196 Q100,204 70,184 Q56,160 64,138 Z", LAV, "none", 0, 'opacity="0.35"'))
    # joint creases on the fingers, the thumb's joint, the lines of the palm
    for (b_, t, w0, w1) in fingers:
        for (u, w) in ((0.4, w0 * 0.55), (0.72, w1 * 0.5)):
            x = b_[0] + (t[0] - b_[0]) * u; y = b_[1] + (t[1] - b_[1]) * u
            g.append(path(f"M{x - w/2:.1f},{y:.1f} Q{x:.1f},{y + 3:.1f} {x + w/2:.1f},{y:.1f}", "none", INK, LD, 'opacity="0.5"'))
    g.append(path("M22,146 Q30,140 34,132", "none", INK, LD, 'opacity="0.5"'))
    g.append(path("M62,140 Q104,150 152,140", "none", INK, LD, 'opacity="0.45"'))
    g.append(path("M76,168 Q108,184 150,170", "none", INK, LD, 'opacity="0.4"'))
    g.append(path("M64,176 Q46,200 56,224", "none", INK, LD, 'opacity="0.4"'))
    svg("slaphand", SLAP_W, SLAP_H, g, amp=0.7)

# ---- speed lines behind a swing ----
def whoosh():
    g = []
    for (y, x0, x1, w) in ((14, 90, 10, 3.2), (30, 96, 4, 4.0), (46, 88, 16, 3.2)):
        g.append(path(f"M{x0},{y} Q{(x0+x1)/2},{y-6} {x1},{y}", "none", LAV, w, 'opacity="0.9"'))
    svg("whoosh", 100, 60, g, amp=0.5)

# ---- the robot claw from the side (+x): a boxy piston arm off the edge of the room ending in a round hub, and
# two jaws that pivot on the hub. The jaws open towards and away from the viewer, not up and down: one goes round
# the front of the frog, the other behind him. Each is its own file so the director can lay one in the front
# layer and one in the back, splay them a little (the near one low and large, the far one high and small) and
# bring them together across his waist. Hub at (300, 130); the jaw reaches out to x = 62. ----
STEEL, STEEL2, STEEL3 = "#C9CDD8", "#8E93A3", "#5C6072"
CW_, CH_ = 400, 260
JAW_TIP = 62
ARM_W = 1300      # the arm's own picture is wider: the pole runs from the hub to x = 1300, off the room from anywhere the frog can stand
def clawarm():
    # a telescoping pole from the wall to the hub: a thick outer barrel at the far end, then a long tube with ring
    # joints along it, a housing and a collar at the hub. Drawn hub to wall so the wall end is under everything.
    g = []
    g.append(path(poly([(ARM_W + 20, 90), (330, 90), (330, 170), (ARM_W + 20, 170)]), STEEL2, INK, LW))            # the pole
    g.append(path(f"M360,100 L{ARM_W},100", "none", "#FFFFFF", 2.4, 'opacity="0.35"'))                            # a highlight along the top
    g.append(path(f"M360,160 L{ARM_W},160", "none", STEEL3, 2.4, 'opacity="0.5"'))
    for x in range(520, ARM_W, 190):                                                                              # ring joints
        g.append(path(poly([(x, 84), (x + 26, 84), (x + 26, 176), (x, 176)]), STEEL, INK, LW))
        g.append(path(f"M{x + 13},92 L{x + 13},168", "none", STEEL3, 1.8, 'opacity="0.5"'))
    g.append(path(poly([(ARM_W + 20, 70), (ARM_W - 60, 70), (ARM_W - 60, 190), (ARM_W + 20, 190)]), STEEL, INK, LW))   # the barrel at the wall
    g.append(path(poly([(440, 82), (372, 82), (372, 178), (440, 178)]), STEEL, INK, LW))                          # the housing at the hub
    g.append(path("M384,92 L384,168 M398,92 L398,168 M412,92 L412,168", "none", STEEL3, 2.0, 'opacity="0.6"'))
    g.append(path(poly([(346, 104), (322, 104), (322, 156), (346, 156)]), STEEL, INK, LW))                        # a collar
    g.append(ellipse(300, 130, 30, 30, STEEL, INK, LW))                                                          # the hub
    g.append(ellipse(300, 130, 17, 17, STEEL2, INK, 1.6))
    g.append(ellipse(300, 130, 6, 6, STEEL3, INK, 1.4))
    for (x, y) in ((286, 108), (320, 116), (316, 150), (284, 148)):
        g.append(ellipse(x, y, 3, 3, STEEL3, "none", 0))                                                         # rivets
    svg("clawarm", ARM_W, CH_, g, amp=0.5)
def clawjaw():
    # one jaw: a long bar from the hub out to the left, thick at the hub, a touch slimmer at the tip, bowed the
    # way a claw curls round what it holds; a rubber cap on the end. Both jaws are this file; they pivot on the
    # hub (300, 130).
    outer = [(300, 104), (250, 98), (190, 96), (130, 100), (JAW_TIP + 14, 108)]
    inner = [(JAW_TIP + 14, 152), (130, 160), (190, 164), (250, 162), (300, 156)]
    g = []
    g.append(path(smooth_open(outer, 0.5) + " " + smooth_open(inner, 0.5).replace("M", "L", 1) + " Z", STEEL, INK, LW))
    g.append(path(smooth_open([(282, 114), (200, 110), (110, 116)], 0.5), "none", STEEL3, 2.2, 'opacity="0.45"'))   # an edge line
    g.append(path(smooth_open([(282, 146), (200, 150), (120, 146)], 0.5), "none", "#FFFFFF", 1.8, 'opacity="0.5"'))
    for x in (238, 176):                                                                                  # bolts along it
        g.append(ellipse(x, 130, 5, 5, STEEL2, INK, 1.4))
    g.append(path(poly([(JAW_TIP, 106), (JAW_TIP + 20, 106), (JAW_TIP + 20, 154), (JAW_TIP, 154)]), PUPIL, INK, 1.6))   # the rubber cap
    g.append(path(f"M{JAW_TIP + 9},114 L{JAW_TIP + 9},146", "none", STEEL2, 1.6, 'opacity="0.6"'))
    g.append(ellipse(300, 130, 7, 7, STEEL3, INK, 1.4))                                                  # the pivot bolt
    svg("clawjaw", CW_, CH_, g, amp=0.5)

# ---- a lit match ----
def match():
    g = []
    g.append(path("M12,26 L12,80", "none", INK, 7.5))
    g.append(path("M12,26 L12,80", "none", WOOD, 4.5))
    g.append(ellipse(12, 22, 6, 7, RUBY, INK, LW))
    g.append('<g id="mflame" style="transform-box:fill-box;transform-origin:50% 100%">')
    g.append(path("M12,2 C15,8 20,10 20,17 C20,22 16.5,26 12,26 C7.5,26 4,22 4,17 C4,13 7,11 8,7 C8.5,10 10,11 11,11 C10,7 11,4 12,2 Z", FIRE2, INK, LW))
    g.append(path("M12,13 C13.5,16 15,17 15,19.5 C15,21.5 13.7,23 12,23 C10.3,23 9,21.5 9,19.5 C9,17.5 10.5,16 12,13 Z", FIRE1, "none", 0))
    g.append('</g>')
    svg("match", 24, 84, g, amp=0.6)

# ---- fire: a tongue of flame, and clusters of them with a group per tongue for the flicker ----
def _tongue(x, base, h, w, lean=0.0):
    tip = (x + lean * h, base - h)
    pts = [(x - w/2, base), (x - w*0.62, base - h*0.42), (x - w*0.2 + lean*h*0.5, base - h*0.72), tip,
           (x + w*0.28 + lean*h*0.5, base - h*0.66), (x + w*0.6, base - h*0.36), (x + w/2, base)]
    inner = [(x - w*0.24, base), (x - w*0.3, base - h*0.25), (x - w*0.05 + lean*h*0.3, base - h*0.45), (x + lean*h*0.5, base - h*0.58),
             (x + w*0.16 + lean*h*0.3, base - h*0.4), (x + w*0.28, base - h*0.2), (x + w*0.24, base)]
    return [path(smooth_closed(pts, 0.55), FIRE2, INK, LW), path(smooth_closed(inner, 0.55), FIRE1, "none", 0),
            path(smooth_open([(x - w*0.2 + lean*h*0.5, base - h*0.72), tip, (x + w*0.28 + lean*h*0.5, base - h*0.66)], 0.5), "none", FIRE3, 3.0, 'opacity="0.8"')]
def fire():
    g = []
    for i, (x, h, w, lean) in enumerate(((28, 78, 40, -0.12), (118, 92, 44, 0.14), (56, 118, 48, 0.02), (92, 128, 50, -0.05), (74, 96, 42, 0.08))):
        g.append(f'<g id="f{i+1}" style="transform-box:fill-box;transform-origin:50% 100%">'); g += _tongue(x, 158, h, w, lean); g.append('</g>')
    svg("fire", 150, 160, g, amp=1.2)
def fireback():
    g = []
    for i, (x, h, w, lean) in enumerate(((46, 150, 58, -0.1), (150, 168, 62, 0.1), (100, 210, 70, 0.0))):
        g.append(f'<g id="f{i+1}" style="transform-box:fill-box;transform-origin:50% 100%">'); g += _tongue(x, 218, h, w, lean); g.append('</g>')
    svg("fireback", 200, 220, g, amp=1.4)

# ---- water from above: a wide gush tall enough to start above the top of the room, see-through enough to show
# whoever is under it, a splash where it lands ----
def water():
    g = []
    g.append('<g id="stream" opacity="0.6">')
    ys = list(range(-6, 440, 50))
    left = [(38 + (6 if i % 2 else 0), y) for i, y in enumerate(ys)] + [(34, 452)]
    right = [(112 - (6 if i % 2 else 0), y) for i, y in enumerate(ys)] + [(114, 452)]
    g.append(path(smooth_closed(left + right[::-1], 0.5), WATER, INK, LW))
    for (x, w) in ((50, 3.0), (72, 2.2), (96, 2.6)):
        g.append(path(smooth_open([(x + (3 if i % 2 else -2), y) for i, y in enumerate(range(4, 450, 60))], 0.5), "none", "#FFFFFF", w, 'opacity="0.6"'))
    g.append('</g>')
    g.append('<g id="splash">')
    g.append(ellipse(73, 466, 70, 14, WATER, INK, LW))
    g.append(ellipse(73, 466, 52, 8, WATER2, "none", 0, 'opacity="0.8"'))
    for (x, y, r) in ((6, 444, 5), (16, 428, 3.6), (132, 440, 5.5), (142, 454, 3.4), (30, 456, 3), (120, 422, 3.6), (58, 432, 3), (96, 428, 3.2)):
        g.append(ellipse(x, y, r, r*1.3, WATER2, INK, LD))
    g.append('</g>')
    svg("water", 146, 480, g, amp=0.9)

# ---- what is left on the floor afterwards ----
def puddle():
    g = [ellipse(60, 14, 56, 11, WATER, INK, LW), ellipse(60, 14, 40, 6, WATER2, "none", 0, 'opacity="0.8"'),
         ellipse(14, 22, 7, 3.5, WATER, INK, LD), ellipse(106, 20, 6, 3, WATER, INK, LD)]
    svg("puddle", 120, 28, g, amp=0.8)

# ---- an impact burst ----
def pow():
    cx = cy = 60; pts = []
    for k in range(24):
        a = math.pi * 2 * k / 24; r = 56 if k % 2 == 0 else 32
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    g = [path(poly(pts), PINK, INK, LW)]
    pts2 = [(cx + (30 if k % 2 == 0 else 16) * math.cos(math.pi * 2 * k / 24 + 0.13), cy + (30 if k % 2 == 0 else 16) * math.sin(math.pi * 2 * k / 24 + 0.13)) for k in range(24)]
    g.append(path(poly(pts2), GOLD, "none", 0))
    g.append(f'<circle cx="{cx}" cy="{cy}" r="7" fill="#FFFFFF"/>')
    svg("pow", 120, 120, g, amp=0.8)

if __name__ == "__main__":
    for fn in (camera, slaphand, whoosh, clawarm, clawjaw, match, fire, fireback, water, puddle, pow):
        fn()
