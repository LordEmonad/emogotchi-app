"""Emotown's pavement -> packages/pet/town/pavement.svg (a tile the site repeats along the street) and kerb.svg.

The pavement is seen side-on from a little above: courses of paving stones that get deeper toward the front (the far
edge, against the facades, is foreshortened), staggered joints, a few cracked or odd stones, and a kerb at the front
edge dropping to the road. Ink joints are faint: the pets walk on this and it must stay quiet.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town import *

def pavement():
    W = 480; H = 246                          # the tile spans the street from the facades (0) to the kerb's top (H)
    g = []
    rnd = random.Random(7)
    ys = [0]; d = 18                           # courses: deeper toward the viewer
    while ys[-1] < H - 2:
        ys.append(min(H, ys[-1] + d)); d *= 1.19
    ys[-1] = H
    tones = ["#2B1C44", "#2E1F49", "#291A41", "#30214C", "#2C1D45"]
    for i in range(len(ys) - 1):
        y0, y1 = ys[i], ys[i + 1]; h = y1 - y0
        # joints round the tile's width, so the course wraps: the stone across the seam is one stone
        n = max(2, round(W / (h * 3.1)))
        base = [W * k / n for k in range(n)]; off = rnd.uniform(0, W / n)
        js = sorted(((b + off + rnd.uniform(-0.16, 0.16) * W / n) % W) for b in base)
        for k in range(n):
            a = js[k]; b = js[(k + 1) % n] + (W if k == n - 1 else 0)
            tone = tones[rnd.randrange(len(tones))]
            for (s0, s1) in ((a, min(b, W)), (0, b - W)) if b > W else ((a, b),):
                if s1 - s0 < 0.5: continue
                g.append(rect(s0, y0, s1 - s0, h, tone, "none", 0))
                g.append(line(s0 + (3 if s0 > 0 else 0), y0 + 1.6, s1 - (3 if s1 < W else 0), y0 + 1.6, "#4A3868", 1.2, 'opacity="0.55"'))
                g.append(line(s0 + (3 if s0 > 0 else 0), y1 - 1.2, s1 - (3 if s1 < W else 0), y1 - 1.2, NIGHT, 1.4, 'opacity="0.5"'))
            g.append(line(a, y0 + 1, a, y1 - 1, INK, 1.2, 'opacity="0.55"'))
            if rnd.random() < 0.12 and h > 30 and 12 < a + 20 < W - 12:     # a crack
                cx = a + rnd.uniform(14, 30)
                g.append(path(f"M{cx:.1f},{y0 + 4:.1f} L{cx + rnd.uniform(-8, 8):.1f},{y0 + h*0.45:.1f} L{cx + rnd.uniform(-10, 10):.1f},{y1 - 4:.1f}", "none", NIGHT, 1.1, 'opacity="0.6"'))
        g.append(rect(0, y1 - 0.6, W, 1.2, INK, "none", 0, 'opacity="0.55"'))
    g.append(f'<rect x="0" y="0" width="{W}" height="26" fill="url(#pvshade)"/>')
    defs = '<linearGradient id="pvshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>'
    # no wobble: a tile must meet itself exactly at the seam (the joints are hand-placed irregular instead)
    svg("pavement", W, H, g, amp=0.0, step=400.0, decimals=1, defs=defs)

def kerb():
    """The kerb stones and the strip of road in front, a tile like the pavement."""
    W = 480; H = 60
    g = []
    rnd = random.Random(3)
    g.append(rect(0, 0, W, 14, "#4A3866", "none", 0))        # kerb top, catching the lamplight
    g.append(rect(0, 14, W, 12, "#33254D", "none", 0))       # its face
    x = 0
    while x < W:
        x1 = min(W, x + rnd.uniform(70, 110))
        if x1 < W: g.append(line(x1, 1, x1, 25, INK, 1.2, 'opacity="0.6"'))
        x = x1
    g.append(line(0, 0.8, W, 0.8, INK, 1.8))
    g.append(line(0, 14, W, 14, INK, 1.4, 'opacity="0.7"'))
    g.append(line(2, 4, W - 2, 4, "#6E5A92", 1.4, 'opacity="0.6"'))
    g.append(rect(0, 26, W, 34, "#150C24", "none", 0))       # the road
    g.append(line(0, 26, W, 26, INK, 1.6))
    for x in range(20, W, 120):                              # a dashed line far down the road
        g.append(rect(x, 46, 56, 4, "#3A2A56", "none", 0))
    svg("kerb", W, H, g, amp=0.0, step=400.0, decimals=1)

if __name__ == "__main__":
    pavement(); kerb()
