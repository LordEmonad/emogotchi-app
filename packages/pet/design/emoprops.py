"""The emo pack's props (DEV only until they are items; the lab is /emopack) -> packages/pet/props/emo*.svg

  emoguitar.svg       the guitar, the toy item: play() brings it out instead of the ball and the pet strums it
                      (director.playGuitar). A black offset electric seen from the front, lying along +x: the body on
                      the left, the neck running right to the headstock. Box 162 x 76 (a short, chunky neck: a cartoon guitar); the strings' middle over the body
                      (where a strum crosses them) at STRUM (30, 40). It is drawn INTO the pet's own svg while it is
                      played (held: it moves with the body), at a size and angle per pet (director GUITAR).
  emoguitarnote.svg   a note floating up from a strum: `.n1` one pink eighth note, `.n2` two beamed lavender ones.
  emophone.svg        the selfie's flip phone, open, seen from the back (its camera and flash look at the pet): the
                      Pet item's prop (director.selfie). Box 40 x 76, held at the bottom half's middle, HOLD (20, 60).
                      `.ph-shut` is the same phone folded shut (shown at the end).
  emoflash.svg        the camera flash: a white burst with a pink rim, put up at the phone's lens for a frame or two.

Same flat fills and wobbly ink as the others. Run: python3 design/emoprops.py
"""
import os, re, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, path, ellipse, poly, smooth_open, smooth_closed
from wobble import bake
import emo as EM

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

BODY = "#1B171F"      # the guitar's black
BODY_HI = "#3A3240"   # its lit edge
GUARD = "#B894D8"     # the pickguard: lavender
GUARD_HI = "#D9C2EE"
NECKW = "#C98A4E"     # the maple neck's back edge, in the light
BOARD = "#3B2418"     # the rosewood fretboard
FRET = "#D8DCE6"      # frets and strings, silver
CHROME = "#E6E8EE"
CHROME_DK = "#8C92A2"
PINK = "#E84D7F"
LAV = "#EAC6EA"
WHITE = "#FFFFFF"
PHONE = "#E84D7F"     # the flip phone's shell: hot pink
PHONE_DK = "#B23562"
PHONE_HI = "#F59AB8"


def rnd(body):
    return re.sub(r"-?\d+\.\d+", lambda m: (f"{float(m.group(0)):.1f}".rstrip("0").rstrip(".") or "0"), body)


def ink(el, amp=0.35, step=4.0):
    return bake(el, amp=amp, freq=0.09, step=step)


def svg(name, w, h, body):
    body = rnd("\n".join(body))
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name, f"({len(src) / 1024:.1f} KB)")


# ---------------- the guitar ----------------
G_W, G_H = 162, 76
STRUM = (30.0, 40.0)
def guitar():
    out = []
    # the body: an offset double-cutaway, its upper horn (above the neck) longer than the lower one
    body = [(6.0, 40.0), (7.5, 26.0), (14.0, 14.0), (25.0, 7.0), (37.0, 6.5), (46.0, 11.0), (53.0, 14.5), (60.0, 10.5), (68.0, 4.5), (75.0, 4.0),
            (77.5, 8.0), (74.5, 16.0), (68.5, 25.0), (66.0, 33.0), (66.0, 47.0), (69.0, 55.0), (72.5, 63.0), (70.0, 68.5), (63.0, 69.0), (56.0, 64.5),
            (48.0, 66.0), (38.0, 72.5), (25.0, 73.0), (13.5, 67.5), (7.5, 55.0)]
    body_d = smooth_closed(body, 0.42)
    out.append(f'<clipPath id="emoguitarbodyclip"><path d="{body_d}"/></clipPath>')
    out.append(path(body_d, BODY, "none", 0))
    out.append('<g clip-path="url(#emoguitarbodyclip)">')
    out.append(path(smooth_open([(12.0, 24.0), (20.0, 12.0), (34.0, 8.0)]), "none", BODY_HI, 4.0, 'opacity="0.8"'))     # the light on its upper edge
    out.append(path(smooth_open([(60.0, 13.0), (70.0, 7.0)]), "none", BODY_HI, 3.0, 'opacity="0.7"'))
    # the pickguard: lavender, round the strings' run under the pickups, with its screws
    guard = [(20.0, 30.0), (30.0, 22.0), (44.0, 20.5), (55.0, 22.5), (62.0, 29.0), (66.0, 33.5), (66.0, 47.0), (64.0, 53.0), (56.0, 58.0), (42.0, 60.0),
             (28.0, 58.5), (18.0, 52.0), (15.0, 41.0)]
    out.append(path(smooth_closed(guard, 0.45), GUARD, INK, 1.2))
    out.append(path(smooth_open([(24.0, 27.0), (36.0, 22.6), (50.0, 22.8)]), "none", GUARD_HI, 1.6, 'opacity="0.9"'))
    for sx, sy in ((22.0, 32.0), (40.0, 23.0), (60.0, 30.0), (60.0, 52.0), (36.0, 57.5), (19.5, 47.0)):
        out.append(f'<circle cx="{sx}" cy="{sy}" r="0.9" fill="{CHROME}"/>')
    # two pickups across the strings, the bridge, three knobs and a switch, a pink broken-heart sticker on the lower bout
    for px in (37.0, 52.0):
        out.append(path(poly([(px - 3.6, 31.0), (px + 3.6, 31.0), (px + 3.6, 49.0), (px - 3.6, 49.0)]), BODY, INK, 1.1))
        for k in range(6):
            out.append(f'<circle cx="{px}" cy="{33.4 + k * 2.65:.1f}" r="0.75" fill="{CHROME}"/>')
    out.append(path(poly([(20.5, 33.0), (25.5, 33.0), (25.5, 47.0), (20.5, 47.0)]), CHROME, INK, 1.0))
    out.append(path("M23,34 L23,46", "none", CHROME_DK, 0.8))
    for kx, ky in ((24.0, 62.0), (32.0, 64.5), (40.0, 65.0)):
        out.append(ellipse(kx, ky, 2.6, 2.6, CHROME, INK, 0.9)); out.append(f'<circle cx="{kx - 0.7:.1f}" cy="{ky - 0.8:.1f}" r="0.8" fill="{WHITE}"/>')
    out.append(path("M60,17 L64,13", "none", CHROME, 1.8))
    out += EM.broken_heart(13.5, 51.0, 9.0, rot=-14, lw=0.8)
    out.append('</g>')
    out.append(path(body_d, "none", INK, 2.2))
    # the neck: a rosewood board on a maple neck, silver frets closing up toward the body, pearl dots, a bone nut
    NUT = 132.0; JOIN = 64.0
    neck = [(JOIN, 35.2), (NUT, 36.2), (NUT, 43.8), (JOIN, 44.8)]
    out.append(path(poly(neck), NECKW, "none", 0))
    out.append(path(poly([(JOIN, 35.9), (NUT, 36.8), (NUT, 43.2), (JOIN, 44.1)]), BOARD, "none", 0))
    frets = []
    for n in range(1, 21):
        x = NUT - (2 * (NUT - 40.0)) * (1 - 2 ** (-n / 12))   # (a short scale: frets close up fast, a chunky cartoon neck)
        if x <= JOIN + 1.5: break
        frets.append(x)
        out.append(path(f"M{x:.1f},{36.2 + (NUT - x) * 0.0096:.1f} L{x:.1f},{43.8 - (NUT - x) * 0.0096:.1f}", "none", FRET, 0.9))
    for n in (3, 5, 7, 9):
        if n <= len(frets):
            a = frets[n - 2] if n >= 2 else NUT; b = frets[n - 1]
            out.append(f'<circle cx="{(a + b) / 2:.1f}" cy="40" r="1.05" fill="{LAV}"/>')
    if len(frets) >= 12:
        a, b = frets[10], frets[11]
        out.append(f'<circle cx="{(a + b) / 2:.1f}" cy="38.2" r="0.95" fill="{LAV}"/><circle cx="{(a + b) / 2:.1f}" cy="41.8" r="0.95" fill="{LAV}"/>')
    out.append(path(poly(neck), "none", INK, 1.4))
    out.append(path(poly([(NUT, 35.8), (NUT + 2.0, 35.8), (NUT + 2.0, 44.2), (NUT, 44.2)]), "#F1E9D6", INK, 0.8))
    # the headstock: black, a hockey-stick shape, six tuners along its top
    head = [(NUT + 2.0, 35.8), (NUT + 8.0, 33.0), (NUT + 18.0, 28.5), (NUT + 26.5, 26.0), (NUT + 29.0, 29.5), (NUT + 26.5, 35.0), (NUT + 19.0, 42.0), (NUT + 10.0, 46.0), (NUT + 2.0, 44.2)]
    out.append(path(smooth_closed(head, 0.25), BODY, INK, 1.5))
    out.append(path(smooth_open([(NUT + 5.0, 36.0), (NUT + 16.0, 31.5), (NUT + 26.0, 28.5)]), "none", BODY_HI, 1.4, 'opacity="0.8"'))
    for k in range(6):
        tx = NUT + 7.0 + k * 3.6; ty = 33.8 - k * 1.25
        out.append(ellipse(tx, ty - 3.4, 1.55, 1.25, CHROME, INK, 0.7))
        out.append(f'<circle cx="{tx:.1f}" cy="{ty - 0.6:.1f}" r="0.8" fill="{CHROME_DK}"/>')
    # the strings, from the bridge to the nut and on to their tuners
    for k in range(6):
        y0 = 34.6 + k * 2.15; y1 = 37.1 + k * 1.15
        tx = NUT + 7.0 + k * 3.6; ty = 33.8 - k * 1.25
        out.append(path(f"M23,{y0:.2f} L{NUT:.1f},{y1:.2f} L{tx:.1f},{ty - 0.6:.1f}", "none", FRET, 0.5 + 0.08 * k, 'opacity="0.95"'))
    out.append(ellipse(5.8, 40.0, 1.6, 1.6, CHROME, INK, 0.8))   # the strap button
    return out


def guitarnote():
    out = ['<g class="n1">', path("M14,6 L14,30", "none", INK, 2.6), ellipse(9.5, 31.0, 5.6, 4.2, PINK, INK, 1.4, 'transform="rotate(-24 9.5 31)"'),
           path("M14,6 Q22,10 24,18 Q20,13 14,13 Z", PINK, INK, 1.2), '</g>']
    out += ['<g class="n2" visibility="hidden">', path("M10,10 L10,32 M28,6 L28,28", "none", INK, 2.4), path(poly([(10, 10), (28, 6), (28, 11), (10, 15)]), GUARD, INK, 1.2),
            ellipse(6.0, 33.0, 5.0, 3.8, GUARD, INK, 1.3, 'transform="rotate(-24 6 33)"'), ellipse(24.0, 29.0, 5.0, 3.8, GUARD, INK, 1.3, 'transform="rotate(-24 24 29)"'), '</g>']
    return out


# ---------------- the flip phone ----------------
P_W, P_H = 40, 76
HOLD = (20.0, 60.0)
def phone():
    out = ['<g class="ph-open">']
    # the top half, from its back: the shell, the little outer screen, the camera lens and its flash, a heart sticker
    top = [(7.0, 4.0), (33.0, 4.0), (36.5, 8.0), (36.0, 34.0), (33.5, 37.0), (6.5, 37.0), (4.0, 34.0), (3.5, 8.0)]
    out.append(path(smooth_closed(top, 0.2), PHONE, INK, 1.6))
    out.append(path(smooth_open([(8.0, 7.0), (31.0, 7.0)]), "none", PHONE_HI, 1.4, 'opacity="0.9"'))
    out.append(path(smooth_closed([(11.0, 13.0), (29.0, 13.0), (30.0, 15.0), (29.0, 25.0), (11.0, 25.0), (10.0, 15.0)], 0.2), "#231A2C", INK, 1.0))
    out.append(path("M13,15 L21,15", "none", "#6E5A88", 1.0, 'opacity="0.9"'))
    out.append(ellipse(20.0, 30.5, 3.0, 3.0, "#231A2C", INK, 0.9))
    out.append(ellipse(20.0, 30.5, 1.4, 1.4, "#5B6FA8", "none", 0))
    out.append(f'<circle cx="19.4" cy="29.9" r="0.5" fill="{WHITE}"/>')
    out.append(ellipse(27.5, 30.5, 1.4, 1.1, WHITE, INK, 0.6))       # the flash
    # the hinge, and the bottom half seen from its back (the keypad is toward the pet)
    out.append(path(poly([(5.0, 36.5), (35.0, 36.5), (35.0, 41.5), (5.0, 41.5)]), PHONE_DK, INK, 1.2))
    out.append(path("M8,39 L32,39", "none", "#E9BCD0", 0.8, 'opacity="0.8"'))
    bot = [(5.0, 41.0), (35.0, 41.0), (35.5, 68.0), (31.5, 72.5), (8.5, 72.5), (4.5, 68.0)]
    out.append(path(smooth_closed(bot, 0.2), PHONE, INK, 1.6))
    out += EM.broken_heart(20.0, 56.0, 9.0, fill=WHITE, lw=0.7)
    out.append(path(smooth_open([(8.0, 46.0), (8.0, 66.0)]), "none", PHONE_HI, 1.2, 'opacity="0.8"'))
    out.append('</g>')
    # shut: folded in half at the hinge (the top half over the bottom one)
    out.append('<g class="ph-shut" visibility="hidden">')
    shut = [(5.0, 38.0), (35.0, 38.0), (35.5, 68.0), (31.5, 72.5), (8.5, 72.5), (4.5, 68.0)]
    out.append(path(smooth_closed(shut, 0.2), PHONE, INK, 1.6))
    out.append(path(poly([(5.0, 36.0), (35.0, 36.0), (35.0, 40.5), (5.0, 40.5)]), PHONE_DK, INK, 1.2))
    out.append(path(smooth_closed([(12.0, 46.0), (28.0, 46.0), (28.5, 54.0), (11.5, 54.0)], 0.2), "#231A2C", INK, 0.9))
    out.append(path("M14,49 L22,49", "none", "#6E5A88", 0.9))
    out += EM.broken_heart(20.0, 63.0, 7.0, fill=WHITE, lw=0.6)
    out.append('</g>')
    return out


def flash():
    pts = []
    for k in range(16):
        a = math.pi * 2 * k / 16
        r = 30.0 if k % 2 == 0 else 12.0
        pts.append((32 + r * math.cos(a), 32 + r * math.sin(a)))
    return [path(smooth_closed(pts, 0.15), WHITE, PINK, 1.6), ellipse(32.0, 32.0, 9.0, 9.0, WHITE, "none", 0), ellipse(32.0, 32.0, 14.0, 14.0, "#FFF6FA", "none", 0, 'opacity="0.8"')]


if __name__ == "__main__":
    svg("emoguitar", G_W, G_H, [ink("\n".join(guitar()))])
    svg("emoguitarnote", 32, 40, guitarnote())
    svg("emophone", P_W, P_H, [ink("\n".join(phone()), 0.25)])
    svg("emoflash", 64, 64, flash())
