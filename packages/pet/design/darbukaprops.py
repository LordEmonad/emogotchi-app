"""The darbuka (the Habibi pack's toy item) -> packages/pet/props/darbuka*.svg

A goblet drum standing on its foot, head up, seen from a little above: a brass body (a round bowl under the head, a long
narrow neck, a flared foot) with a mother-of-pearl mosaic band round the bowl (turquoise, pearl and gold tiles, the way
the inlaid Syrian ones are), a pearl ring at the neck and a zigzag at the foot, a brass tension ring round the head with
its bolts, and a pale drum head. While it is the toy, play() brings it out instead of the ball of yarn and the pet drums
the maqsum on it (director.drumDarbuka).

  darbuka.svg        the drum. One box, 70 x 104; the foot's rim round y 97 (its front edge at 101.8, the floor goes
                     through its middle), the head's middle at HEAD (35, 14). The director
                     squashes the whole drum a touch on each strike (about its foot) and puts a ripple on the head.
  darbukaripple.svg  a ring on the drum head, which the director grows and fades at each strike.
  darbukanote.svg    the note that floats up from a strike: `.nd` two beamed notes in gold (a DUM, the deep stroke in the
                     middle of the head) and `.nt` one note in turquoise (a tek, the sharp one at the rim); the director
                     shows one of them per note (a plain style, never animated).

Same flat fills and wobbly ink as props.py. Kept apart so nothing else is regenerated. Run: python3 design/darbukaprops.py
"""
import os, re, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, LW, LD, path, ellipse, poly, smooth_open, smooth_closed
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

BRASS = "#D2A043"      # the body
BRASS_LT = "#F2D27E"   # its lit stripe
BRASS_DK = "#9A6B22"   # its shaded side, the ring's face
BRASS_XD = "#6E4A16"   # the deepest shade, the bolts
HEADC = "#F6ECD4"      # the drum head
HEAD_SH = "#E2D0A8"    # its far side, in shade
TURQ = "#2FB6A6"       # the mosaic: turquoise
TURQ_DK = "#1D7F7A"
PEARL = "#F5F1EA"      # mother-of-pearl
PEARL2 = "#D8D2EA"     # its lilac sheen
GOLDT = "#E8C35A"      # gold tiles and borders
WHITE = "#FFFFFF"
NOTE_GOLD = "#F4C84A"
NOTE_TURQ = "#48CDBD"

def rnd(body):
    """One decimal is plenty at this size."""
    return re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}".rstrip("0").rstrip(".") or "0"), body)

def ink(el, amp=0.4, step=4.0):
    """An inked shape with the house wobble (light: a small object)."""
    return bake(el, amp=amp, freq=0.09, step=step)

def svg(name, w, h, body):
    body = rnd("\n".join(body))
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"({len(src) / 1024:.1f} KB)")

# ---------------- the drum ----------------
BOX_W, BOX_H = 70, 104
CX = 35.0
HEAD = (35.0, 14.0)        # the head's middle
RIM_R = 30.5               # the tension ring's outer radius
HEAD_R = 27.6              # the head inside it
TILT = 0.27                # a circle of radius r round the drum shows as an ellipse r x r*TILT (seen from a little above)
RING_H = 5.5               # the tension ring's side
FOOT_Y = 97.0
# the body's half-width down its height, from under the ring to the foot (the right side; the left mirrors it)
PROFILE = [(14 + RING_H, 30.2), (24, 30.6), (29, 28.6), (35, 24.2), (41, 18.6), (47, 13.4), (53, 10.2), (60, 8.7), (67, 8.4),
           (74, 9.0), (81, 10.9), (87, 13.4), (92, 15.9), (FOOT_Y, 17.6)]

def _bez(p0, c1, c2, p3, t):
    u = 1 - t
    return tuple(u*u*u*p0[i] + 3*u*u*t*c1[i] + 3*u*t*t*c2[i] + t*t*t*p3[i] for i in range(2))

def profile_samples(n_per=8):
    """The profile as (y, r) samples along the same curve smooth_open draws through PROFILE."""
    pts = [(r, y) for y, r in PROFILE]
    out = []
    t_ = 0.5
    for i in range(len(pts) - 1):
        p0 = pts[max(i-1, 0)]; p1 = pts[i]; p2 = pts[i+1]; p3 = pts[min(i+2, len(pts)-1)]
        c1 = (p1[0] + (p2[0]-p0[0])*t_/3, p1[1] + (p2[1]-p0[1])*t_/3)
        c2 = (p2[0] - (p3[0]-p1[0])*t_/3, p2[1] - (p3[1]-p1[1])*t_/3)
        for k in range(n_per):
            x, y = _bez(p1, c1, c2, p2, k / n_per)
            out.append((y, x))
    out.append((PROFILE[-1][0], PROFILE[-1][1]))
    return out

SAMPLES = profile_samples()

def r_at(y):
    """The body's half-width at height y (linear between samples)."""
    s = SAMPLES
    if y <= s[0][0]: return s[0][1]
    for (y0, r0), (y1, r1) in zip(s, s[1:]):
        if y0 <= y <= y1: return r0 + (r1 - r0) * (y - y0) / ((y1 - y0) or 1)
    return s[-1][1]

def on_body(y, u):
    """A point on the front of the body at height y and u = sin(angle round the drum) in -1..1 (u 0 faces us)."""
    r = r_at(y)
    return (CX + r * u, y + TILT * r * math.sqrt(max(0.0, 1 - u * u)))

def front_arc(y, u0=-1.0, u1=1.0, n=24):
    return [on_body(y, u0 + (u1 - u0) * k / n) for k in range(n + 1)]

def band_poly(y0, y1, u0, u1, n=24):
    """The stretch of the body's surface between heights y0 and y1 and between u0 and u1, as a polygon."""
    top = front_arc(y0, u0, u1, n); bot = front_arc(y1, u0, u1, n)
    return top + bot[::-1]

def side_poly(ua, ub, y0, y1, n=40):
    """A vertical stripe of the surface from ua to ub (sin of the angle), from y0 down to y1: a lit or shaded band."""
    ys = [y0 + (y1 - y0) * k / n for k in range(n + 1)]
    left = [on_body(y, ua) for y in ys]; right = [on_body(y, ub) for y in ys]
    return left + right[::-1]

def body_outline():
    """The silhouette under the ring: down the right side, the foot's front, up the left, along the ring's underside."""
    right = [(CX + r, y) for y, r in SAMPLES]
    left = [(CX - r, y) for y, r in SAMPLES][::-1]
    foot = front_arc(FOOT_Y, 1.0, -1.0, 20)[1:-1]
    top = front_arc(14 + RING_H, -1.0, 1.0, 20)[1:-1]
    return right + foot + left + top

def tile(y, u, h, w_u, fill, shape="diamond"):
    """A mosaic tile on the body centred at height y, u; h tall, w_u wide in u (so it narrows toward the sides)."""
    if abs(u) + w_u / 2 >= 0.985: return None
    c = on_body(y, u)
    l = on_body(y, u - w_u / 2); r = on_body(y, u + w_u / 2)
    t = on_body(y - h / 2, u); b = on_body(y + h / 2, u)
    if shape == "diamond":
        pts = [t, r, b, l]
    else:   # a triangle pointing down (the foot's zigzag)
        tl = on_body(y - h / 2, u - w_u / 2); tr = on_body(y - h / 2, u + w_u / 2)
        pts = [tl, tr, b]
    return path(poly(pts), fill, INK, 0.7)

def darbuka():
    g = []
    # ---- the body ----
    g.append(path(poly(body_outline()), BRASS, "none", 0))
    # its shade down the right side and a lit stripe down the left, following the round of it
    g.append(path(poly(side_poly(0.55, 0.985, 14 + RING_H, FOOT_Y)), BRASS_DK, "none", 0, 'opacity="0.85"'))
    g.append(path(poly(side_poly(0.8, 0.985, 14 + RING_H, FOOT_Y)), BRASS_XD, "none", 0, 'opacity="0.55"'))
    g.append(path(poly(side_poly(-0.62, -0.36, 14 + RING_H + 1, FOOT_Y - 1)), BRASS_LT, "none", 0, 'opacity="0.9"'))
    g.append(path(poly(side_poly(-0.52, -0.44, 14 + RING_H + 2, FOOT_Y - 2)), WHITE, "none", 0, 'opacity="0.5"'))
    # ---- the mosaic band round the bowl: gold borders, turquoise and pearl diamonds, a gold dot between each ----
    y0, y1 = 25.0, 34.5
    g.append(path(poly(band_poly(y0 - 1.3, y0, -1, 1)), GOLDT, INK, 0.7))
    g.append(path(poly(band_poly(y1, y1 + 1.3, -1, 1)), GOLDT, INK, 0.7))
    ym = (y0 + y1) / 2
    n = 9
    for i in range(n):
        ang = -72 + 144 * i / (n - 1)
        u = math.sin(math.radians(ang))
        w_u = 0.24 * math.cos(math.radians(ang)) + 0.03
        e = tile(ym, u, (y1 - y0) - 1.6, w_u, TURQ if i % 2 == 0 else PEARL)
        if e: g.append(e)
        if e and i % 2 == 1:
            c = on_body(ym, u)
            g.append(path(poly([on_body(ym - 1.6, u), on_body(ym, u + 0.06), on_body(ym + 1.6, u), on_body(ym, u - 0.06)]), PEARL2, "none", 0, 'opacity="0.8"'))
        if i < n - 1:
            ang2 = ang + 72 / (n - 1)
            u2 = math.sin(math.radians(ang2))
            if abs(u2) < 0.93:
                c = on_body(ym, u2)
                g.append(f'<circle cx="{c[0]:.2f}" cy="{c[1]:.2f}" r="{0.95 * math.cos(math.radians(ang2)) + 0.35:.2f}" fill="{GOLDT}" stroke="{INK}" stroke-width="0.5"/>')
    # ---- the neck: a band of pearl dots between two gold lines ----
    yn = 60.0
    g.append(path(smooth_open(front_arc(yn - 2.2, -1, 1, 16), 0.5), "none", GOLDT, 1.1))
    g.append(path(smooth_open(front_arc(yn + 2.2, -1, 1, 16), 0.5), "none", GOLDT, 1.1))
    for ang in range(-75, 76, 25):
        u = math.sin(math.radians(ang)); c = on_body(yn, u)
        g.append(f'<circle cx="{c[0]:.2f}" cy="{c[1]:.2f}" r="{1.25 * math.cos(math.radians(ang)) + 0.3:.2f}" fill="{PEARL}" stroke="{INK}" stroke-width="0.5"/>')
    # ---- the foot: a zigzag of turquoise triangles under a gold line ----
    yf = 88.5
    g.append(path(smooth_open(front_arc(yf - 3.4, -1, 1, 16), 0.5), "none", GOLDT, 1.1))
    for i in range(9):
        ang = -80 + 160 * i / 8
        u = math.sin(math.radians(ang)); w_u = 0.2 * math.cos(math.radians(ang)) + 0.03
        e = tile(yf, u, 5.6, w_u, TURQ if i % 2 == 0 else TURQ_DK, "tri")
        if e: g.append(e)
    # the body's ink, over the fills (only the sides and the foot: the top is under the ring)
    right = [(CX + r, y) for y, r in PROFILE]; left = [(CX - r, y) for y, r in PROFILE]   # (the control points: the same curve, a tenth of the bytes)
    g.append(ink(path(smooth_open(right, 0.5), "none", INK, 1.8)))
    g.append(ink(path(smooth_open(left, 0.5), "none", INK, 1.8)))
    g.append(ink(path(smooth_open(front_arc(FOOT_Y, -1, 1, 10), 0.5), "none", INK, 1.8)))
    # ---- the tension ring: its side (a band round the top of the bowl) with the bolts, and its top rim ----
    hx, hy = HEAD
    ring_top = [(hx + RIM_R * math.sin(a), hy + TILT * RIM_R * math.cos(a)) for a in [math.radians(-90 + 180 * k / 24) for k in range(25)]]
    ring_bot = [(x, y + RING_H) for x, y in ring_top]
    g.append(ink(path(poly(ring_top + ring_bot[::-1]), BRASS_DK, INK, 1.4)))
    g.append(path(poly([(x, y + 0.9) for x, y in ring_top[3:22]] + [(x, y - 1.6) for x, y in ring_bot[3:22]][::-1]), BRASS, "none", 0, 'opacity="0.7"'))
    for a in (-62, -31, 0, 31, 62):
        t = math.radians(a)
        bx, by = hx + RIM_R * math.sin(t), hy + TILT * RIM_R * math.cos(t) + RING_H / 2
        rr = 1.25 * math.cos(t) + 0.35
        g.append(f'<ellipse cx="{bx:.2f}" cy="{by:.2f}" rx="{rr:.2f}" ry="{rr * 1.1:.2f}" fill="{BRASS_XD}" stroke="{INK}" stroke-width="0.5"/>')
        g.append(f'<circle cx="{bx - rr * 0.3:.2f}" cy="{by - rr * 0.35:.2f}" r="{rr * 0.35:.2f}" fill="{BRASS_LT}"/>')
    # the rim's top: a brass ellipse, the head inside it
    g.append(ink(ellipse(hx, hy, RIM_R, RIM_R * TILT, BRASS_LT, INK, 1.6), 0.35, 3.5))
    g.append(ink(ellipse(hx, hy + 0.4, HEAD_R, HEAD_R * TILT, HEADC, INK, 1.0), 0.3, 3.5))
    # the head's far side in shade (a crescent at the back right) and a glint on the near left
    far = [(hx + HEAD_R * 0.98 * math.cos(a), hy + 0.4 + HEAD_R * TILT * 0.98 * math.sin(a)) for a in [math.radians(-170 + 150 * k / 20) for k in range(21)]]
    inner = [(hx + 6 + HEAD_R * 0.8 * math.cos(a), hy + 1.6 + HEAD_R * TILT * 0.7 * math.sin(a)) for a in [math.radians(-20 - 150 * k / 20) for k in range(21)]]
    g.append(path(poly(far + inner), HEAD_SH, "none", 0, 'opacity="0.85"'))
    g.append(path(f"M{hx - 17:.1f},{hy + 3.6:.1f} Q{hx - 10:.1f},{hy + 6.4:.1f} {hx - 1:.1f},{hy + 6.6:.1f}", "none", WHITE, 1.3, 'opacity="0.85"'))
    svg("darbuka", BOX_W, BOX_H, g)

def ripple():
    """A ring on the head (the director grows it from small and fades it): the head's own proportions."""
    w, h = 64, 20
    # a warm ring with a light one just inside it: the head is pale, so the wave shows as a dip, then its crest
    g = [f'<ellipse cx="32" cy="10" rx="28" ry="{28 * TILT:.2f}" fill="none" stroke="#A8783A" stroke-width="2.2" opacity="0.75"/>',
         f'<ellipse cx="32" cy="10.4" rx="24.5" ry="{24.5 * TILT:.2f}" fill="none" stroke="{WHITE}" stroke-width="1.6" opacity="0.9"/>']
    svg("darbukaripple", w, h, g)

def note_head(cx, cy, fill):
    """A note's head: a tilted oval."""
    return ink(f'<g transform="rotate(-24 {cx:.1f} {cy:.1f})">' + ellipse(cx, cy, 5.6, 4.1, fill, INK, 1.6) + '</g>', 0.3, 3.0)

def notes():
    """The two notes a strike sends up, in one box (40 x 44), one shown at a time."""
    g = []
    # DUM: two eighth notes joined by a beam, in gold
    g.append('<g class="nd">')
    g.append(path("M17.2,34 L17.2,9.5 L33.2,5.5 L33.2,30", "none", INK, 4.0))
    g.append(path("M17.2,34 L17.2,9.5 L33.2,5.5 L33.2,30", "none", NOTE_GOLD, 1.8))
    g.append(path("M17.2,9.8 L33.2,5.8 L33.2,11.4 L17.2,15.4 Z", NOTE_GOLD, INK, 1.4))
    g.append(note_head(12.4, 35.2, NOTE_GOLD))
    g.append(note_head(28.4, 31.2, NOTE_GOLD))
    g.append(f'<circle cx="9.9" cy="33.4" r="1.4" fill="{WHITE}" opacity="0.9"/>')
    g.append(f'<circle cx="25.9" cy="29.4" r="1.4" fill="{WHITE}" opacity="0.9"/>')
    g.append('</g>')
    # tek: one eighth note with its flag, in turquoise
    g.append('<g class="nt" style="visibility:hidden">')
    g.append(path("M24.2,34 L24.2,7", "none", INK, 4.0))
    g.append(path("M24.2,34 L24.2,7", "none", NOTE_TURQ, 1.8))
    g.append(ink(path("M24.2,7 C25.4,13 33.6,14 32.4,23 C31.8,19 28.4,16.6 24.2,16.2 Z", NOTE_TURQ, INK, 1.4), 0.3, 3.0))
    g.append(note_head(19.4, 35.2, NOTE_TURQ))
    g.append(f'<circle cx="16.9" cy="33.4" r="1.4" fill="{WHITE}" opacity="0.9"/>')
    g.append('</g>')
    svg("darbukanote", 40, 44, g)

if __name__ == "__main__":
    darbuka(); ripple(); notes()
