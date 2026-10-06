"""Props for the seal's own actions -> packages/pet/props/*.svg

The fish it is fed (tossed in and caught in the mouth). Drawn in the seal's own clean black line (seal.py), not the
room's wobble, since it spends its whole life next to the seal's face. Kept apart from props.py so the room's props
are not regenerated every time this changes. Run by hand:  python3 sealprops.py
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import smooth_closed, smooth_open

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))
INK = "#000000"
LW = 2.6

def path(d, fill="none", stroke=INK, w=LW, extra=""):
    s = f'stroke="{stroke}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"' if stroke != "none" else 'stroke="none"'
    return f'<path d="{d}" fill="{fill}" {s} {extra}/>'

def svg(name, w, h, body):
    src = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<g id="{name}">\n' + "\n".join(body) + '\n</g>\n</svg>'
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print("wrote", name)

# ---- the fish: a little silver-blue sardine, head to the left (the director mirrors it for a throw the other way) ----
def sealfish():
    W, H = 100, 56; g = []
    BODY, BACK, BELLY, FIN = "#8FD0EE", "#4C95C4", "#E4F5FC", "#3E80AE"
    body = [(8, 29), (14, 20), (26, 13), (44, 11), (60, 15), (72, 22), (78, 28), (72, 34), (60, 40), (44, 44), (26, 42), (14, 37)]
    tail = [(74, 28), (86, 14), (95, 12), (90, 28), (95, 44), (86, 42)]
    dorsal = [(34, 13), (42, 4), (54, 5), (60, 15)]
    g.append(path(smooth_closed(tail, 0.35), FIN))
    g.append(path(smooth_open(dorsal, 0.5) + " Z", FIN))
    g.append(path(smooth_closed(body, 0.5), BODY, "none", 0))
    g.append(f'<clipPath id="sealfishclip"><path d="{smooth_closed(body, 0.5)}"/></clipPath>')
    g.append('<g clip-path="url(#sealfishclip)">')
    g.append(path(smooth_closed([(0, 0), (100, 0), (100, 24), (70, 23), (44, 21), (20, 24), (0, 27)], 0.4), BACK, "none", 0))    # the dark back
    g.append(path(smooth_closed([(10, 36), (30, 33), (52, 33), (72, 31), (80, 38), (60, 48), (30, 48)], 0.4), BELLY, "none", 0))  # the pale belly
    for x in (40, 50, 60):                                                                                                    # a few scales
        g.append(path(f"M{x},{22} Q{x + 5},{27} {x},{32}", "none", "#FFFFFF", 1.3, 'opacity="0.55"'))
    g.append(path("M30,16 Q44,12 58,16", "none", "#FFFFFF", 2.0, 'opacity="0.55"'))                                         # the shine on its back
    g.append('</g>')
    g.append(path(smooth_closed(body, 0.5)))
    g.append(path(smooth_closed([(40, 34), (50, 36), (46, 42)], 0.5), FIN, INK, 1.8))                                          # the pectoral fin
    g.append(path("M24,17 Q30,28 24,39", "none", INK, 1.8))                                                                  # the gill
    g.append(f'<circle cx="16.5" cy="25" r="4" fill="#FFFFFF" stroke="{INK}" stroke-width="1.6"/>')                          # the eye
    g.append(f'<circle cx="15.8" cy="25.4" r="2.1" fill="{INK}"/>')
    g.append(path("M8.5,30 Q11,32 13.5,31", "none", INK, 1.5))                                                               # the mouth
    for (x0, y0, x1, y1) in ((88, 18, 84, 26), (88, 38, 84, 30)):                                                            # the tail's rays
        g.append(path(f"M{x0},{y0} L{x1},{y1}", "none", INK, 1.2, 'opacity="0.45"'))
    svg("sealfish", W, H, g)

if __name__ == "__main__":
    sealfish()
