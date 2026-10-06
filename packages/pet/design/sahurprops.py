"""Props for Tung Tung Tung Sahur's own actions -> packages/pet/props/*.svg

The TUNG burst (one per knock of the bat on the floor) and the ring that runs out across the floor from a strike. Same flat fills, wobbly ink and Emonad palette as props.py.
stitches are the brand pink). Kept apart from props.py so the room's props are not regenerated every time these change.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, PINK, GOLD, GOLD2, LAV, LAV2, PUPIL, LW, LD, smooth_closed, poly, path, ellipse
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

def svg(name, w, h, body, amp=1.0, step=4.0):
    body = bake("\n".join(body), amp=amp, freq=0.09, step=step)
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n{body}\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name)

def _letters(x, cy, h, w, gap, color, wstroke):
    """T U N G as strokes, cap height h, each letter w wide."""
    t, b = cy - h / 2, cy + h / 2; out = []
    # T
    out.append(path(f"M{x},{t} L{x + w},{t} M{x + w / 2},{t} L{x + w / 2},{b}", "none", color, wstroke))
    x += w + gap
    # U
    out.append(path(f"M{x},{t} L{x},{b - h * 0.32} C{x},{b + h * 0.1} {x + w},{b + h * 0.1} {x + w},{b - h * 0.32} L{x + w},{t}", "none", color, wstroke))
    x += w + gap
    # N
    out.append(path(f"M{x},{b} L{x},{t} L{x + w},{b} L{x + w},{t}", "none", color, wstroke))
    x += w + gap
    # G
    out.append(path(f"M{x + w},{t + h * 0.2} C{x + w * 0.85},{t - h * 0.08} {x},{t - h * 0.06} {x},{cy} "
                    f"C{x},{b + h * 0.06} {x + w * 0.9},{b + h * 0.08} {x + w},{b - h * 0.28} L{x + w},{cy} L{x + w * 0.5},{cy}", "none", color, wstroke))
    return out

# ---- TUNG: a burst with the word across it. The word is the sound of the bat on the floor, the whole point of him. ----
def tung():
    W, H = 200, 130; cx, cy = 100, 65; g = []
    pts = []
    for k in range(28):
        a = math.pi * 2 * k / 28
        r = (92 if k % 2 == 0 else 58); rx, ry = r, r * 0.62
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    g.append(path(poly(pts), PINK, INK, LW))
    pts2 = [(cx + (56 if k % 2 == 0 else 34) * math.cos(math.pi * 2 * k / 28 + 0.11), cy + (56 if k % 2 == 0 else 34) * 0.62 * math.sin(math.pi * 2 * k / 28 + 0.11)) for k in range(28)]
    g.append(path(poly(pts2), GOLD, "none", 0))
    # the word, tilted up to the right, inked heavy under white
    w, gap, h = 21, 7, 32; x0 = cx - (4 * w + 3 * gap) / 2
    g.append(f'<g transform="rotate(-7 {cx} {cy})">')
    g += _letters(x0, cy + 1, h, w, gap, INK, 8.5)
    g += _letters(x0, cy + 1, h, w, gap, "#FFFFFF", 4.2)
    g.append('</g>')
    svg("tung", W, H, g, amp=0.9)

# ---- the ring a strike sends out across the floor (scaled up and faded by the director) ----
def ring():
    g = [ellipse(60, 20, 56, 14, "none", LAV, 4.0, 'opacity="0.9"'), ellipse(60, 20, 44, 10.5, "none", LAV2, 2.2, 'opacity="0.55"')]
    svg("ring", 120, 40, g, amp=0.6)

if __name__ == "__main__":
    for fn in (tung, ring):
        fn()
