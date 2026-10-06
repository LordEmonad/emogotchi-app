"""Emonadgotchi: Emonad (the $EMO mascot) as an Emogotchi pet -> packages/pet/emonadgotchi.svg   (LAB ONLY for now: no
contract, no collection; see apps/web/src/emonadgotchi/)

He is not drawn again here. His likeness is the trace of the operator's turnaround sheet (emonad/turnaround.jpg), built
into packages/pet/emonad.svg by emonad_trace.py and emonad.py for his own six-facing rig. This file takes that drawing's
FRONT view, piece by piece, and lays it out with the pet rig's group ids (the cat's), so rig.ts and the director drive
him like any other pet. He is drawn head-on and never turns (like the cat, Sahur and the r3tard).

    python3 emonadgotchi.py          (after emonad.py: it reads packages/pet/emonad.svg)

The groups, in the order they are drawn:
  #shadow, #figure
  #footL / #footR    each a whole leg (trouser and shoe), turning about the hip; inside it #shinL / #shinR, the shin and the
                     shoe, turning about the knee (a black disc on the knee under it: black on black, a bent knee is whole)
  #neckback          a twin of #head (data-twin: it gets every animation #head gets) drawn BEFORE the shirt: his neck, so
                     the shirt's neckline covers the neck's foot whatever the head and the body do
  #body              the shirt, with its shoulders
  #arms              #legL / #legR, the arms (the pet rig's names: the cat's front legs), each the sleeve and the upper arm
                     turning about the shoulder, and inside it #foreL / #foreR, the forearm and the hand, turning about the
                     elbow (a black disc behind the elbow and a skin disc over the seam: a bent arm stays one arm)
  #head              the hair behind the face, the face, the eyes, the mouths, the fringe over it all
  #armsover          an empty twin of #arms drawn in front of everything (#legLover / #legRover, #foreLover / #foreRover):
                     what he carries in front of his face and hair rides there (the phone, the falcon)
  #crown, #halo, #sweat, #stink, #zzz

His proportions are his: a tall figure whose face is a tenth of his height. So his line is thinner than the other pets'
and his face smaller; he stands tall in the room (world.ts PET_SCALE, set by his register module).
"""
import json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "emonad.svg"))
OUT = os.path.normpath(os.path.join(HERE, "..", "emonadgotchi.svg"))

# ---- the map from his drawing's units (front view: x across, the floor at y 0, y up negative) to the pet's view ----
K = 0.30                    # view units per unit of his drawing: 637 tall -> 191 (feet at 212, the top of his hair at 21)
CX, FLOOR = 100.0, 212.0
def V(x, y): return (CX + x * K, FLOOR + y * K)
MAT = f"matrix({K} 0 0 {K} {CX} {FLOOR})"

# ---- palette ----
INK = "#000000"
SKIN = "#FEFEFE"            # his skin (the sheet's white, one step off so a costume's css can find it and only it)
EYEWHITE = "#FFFFFF"
MAW = "#3A1426"; TONGUE = "#E8839A"
TEAR = "#A9D8F0"; MUD = "#5A3A28"
GOLD = "#E8D89B"; GOLD2 = "#D4A646"; RUBY = "#8B1A2D"; TEAL = "#2D7D8A"; GREEN = "#6BB84A"; LAV = "#EAC6EA"
PUPIL = "#281828"

def f2(v): return f"{v:.2f}"

# ---------------- reading his drawing ----------------
SVG = open(SRC).read()
_a = SVG.find('data-view="front"'); _b = SVG.find('data-view="side"')
FRONT = SVG[SVG.rfind("<g", 0, _a):SVG.rfind("<g", 0, _b)]
PIV = json.loads(re.search(r"data-pivots='([^']+)'", FRONT).group(1))

def balanced(s, start):
    """The element that opens at `start` (a <g ...> or <defs>), whole, with everything nested in it."""
    m = re.match(r"<(\w+)", s[start:]); tag = m.group(1)
    depth = 0; i = start
    pat = re.compile(r"<(/?)(%s)\b[^>]*?(/?)>" % tag)
    for t in pat.finditer(s, start):
        if t.group(1): depth -= 1
        elif not t.group(3): depth += 1
        if depth == 0: return s[start:t.end()]
    raise ValueError("unbalanced " + tag)

def part(name):
    """A part of the front view, its inside only (the group's own attributes dropped)."""
    i = FRONT.find(f'data-part="{name}"')
    if i < 0: raise KeyError(name)
    g = balanced(FRONT, FRONT.rfind("<g", 0, i))
    return g[g.find(">") + 1:g.rfind("</g>")]

def by_id(id_):
    i = FRONT.find(f'id="{id_}"')
    if i < 0: raise KeyError(id_)
    return balanced(FRONT, FRONT.rfind("<", 0, i))

def own(markup):
    """His drawing's ids made this file's (emonad-front-… -> eg-…), and his skin made SKIN."""
    return markup.replace("emonad-front-", "eg-").replace('fill="#FFFFFF"', f'fill="{SKIN}"')

def attr(name, key):
    i = FRONT.find(f'data-part="{name}"')
    tag = FRONT[FRONT.rfind("<g", 0, i):FRONT.find(">", i) + 1]
    m = re.search(key + r"='([^']+)'", tag)
    return json.loads(m.group(1)) if m else None

def U(inner):
    """Content in his drawing's units, placed in the view."""
    return f'<g transform="{MAT}">{inner}</g>'

def path(d, fill="none", stroke="none", w=0.0, extra=""):
    s = f'stroke="{stroke}" stroke-width="{w:.3f}" stroke-linejoin="round" stroke-linecap="round"' if stroke != "none" else 'stroke="none"'
    return f'<path d="{d}" fill="{fill}" {s} {extra}/>'
def ellipse(cx, cy, rx, ry, fill, stroke="none", w=0.0, extra=""):
    s = f'stroke="{stroke}" stroke-width="{w}"' if stroke != "none" else 'stroke="none"'
    return f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx:.3f}" ry="{ry:.3f}" fill="{fill}" {s} {extra}/>'
def circle(cx, cy, r, fill, extra=""):
    return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.3f}" fill="{fill}" stroke="none" {extra}/>'

# ---------------- the arms ----------------
def arm(side):
    """The arm on the picture's `side` ('L' left: the rig's #legL), in his units: the upper arm (the drawing clipped above
    the elbow's cut, which is square to the arm), the elbow's discs, the forearm and hand (#fore…, clipped below the cut:
    the clip is inside the forearm's group, so it turns with it), the sleeve over the top."""
    el = attr(f"fore{side}", "data-elbow")
    ex, ey, r_out, r_in = el["x"], el["y"], el["r"], el["rin"]
    art = f"#eg-arm{side}-art"
    up = re.search(r'<path class="cut" d="([^"]+)"', by_id(f"emonad-front-arm{side}-up")).group(1)
    pts = [tuple(map(float, p.split())) for p in re.findall(r"(-?[\d.]+ -?[\d.]+)", up)][:2]   # the cut's two far ends
    lo = f"M{f2(pts[0][0])} {f2(pts[0][1])}L{f2(pts[1][0])} {f2(pts[1][1])}L{f2(pts[1][0])} 200L{f2(pts[0][0])} 200Z"
    upper = (f'<clipPath id="eg-arm{side}-up"><path d="{up}"/></clipPath>'
             f'<g clip-path="url(#eg-arm{side}-up)"><use href="{art}"/></g>')
    fore = (f'<clipPath id="eg-arm{side}-lo"><path d="{lo}"/></clipPath>'
            f'<g clip-path="url(#eg-arm{side}-lo)"><use href="{art}"/></g>')
    return dict(upper=upper, fore=fore, black=circle(ex, ey, r_out, INK), seam=circle(ex, ey, r_in, SKIN, 'class="seam"'),
                sleeve=own(part(f"sleeve{side}")))

# the shoulders at rest: his own rig draws them every frame (shoulderPath); these are its rest-pose outlines
SHOULDER = {
    "L": "M-49 -429C-62.41 -430.75 -70.49 -415.27 -70.86 -414L-71.71 -411.12L-45.6 -395L-45.5 -398L-55.06 -398.96Q-54.97 -401.96 -54.71 -398.97L-54.1 -392L-50.1 -392L-45 -425Z",
    "R": "M49 -428C55.64 -431.82 66.59 -417.36 67.51 -414L68.29 -411.1L49.6 -395L49.5 -398L56.06 -398.91Q55.96 -401.91 55.55 -398.94L54.6 -392L50.6 -392L45 -424Z",
}

# ---------------- the eyes ----------------
def bez(p0, c, p1, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]) for t in (i / n for i in range(n + 1))]
def poly(pts, close=True):
    return "M" + " L".join(f"{f2(x)} {f2(y)}" for x, y in pts) + (" Z" if close else "")

def eye(side):
    """One eye, for the pet rig: `.open` (the white, the pupil, the lower lid, the upper lid that blinks: `.lid`), and the
    other eyes drawn in the same place (closed, happy, squeezed, dead). His eyes are small, so:
      - the blink cannot be a lid sliding 19 units (the rig's travel, made for the cat's eyes): the eye's opening closes
        instead, the r3tard's way. The white and the pupil are clipped twice, by the opening and by the same opening as a
        clip that MOVES (its path carries the class `lid`, so the rig's blink slides it down); the upper lid's line is the
        other `.lid` and goes down with it, clipped to above the lower lid, so it is gone once the eye has shut;
      - the pupil group carries an empty box the size of the eye: the rig moves pupils by a share of their own box, and a
        dot's own box is too small to go anywhere."""
    g = attr(f"eye{side}", "data-geom")
    L, R, cu, cl, cc, P, pr = g["L"], g["R"], g["cu"], g["cl"], g["cc"], g["P"], g["pr"]
    tag = side
    top = bez(L, cu, R); low = bez(R, cl, L)
    almond = poly(top + low[1:])
    xs = [p[0] for p in top + low]; ys = [p[1] for p in top + low]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w = x1 - x0
    lidW, lowW, shutW = 2.1, 2.0, 2.6
    # the region above the lower lid (where the moving lid line may show)
    above = poly(low[::-1] + [(R[0] + 3, R[1] - 30), (L[0] - 3, L[1] - 30)])
    defs = (f'<clipPath id="egeye{tag}open"><path d="{almond}"/></clipPath>'
            f'<clipPath id="egeye{tag}shut"><path class="lid" d="{almond}"/></clipPath>'
            f'<clipPath id="egeye{tag}above"><path d="{above}"/></clipPath>')
    o = [f'<g id="eye{side}" class="eye">']
    o.append(path(almond, SKIN, SKIN, 1.2, 'class="eye-skin"'))
    o.append('<g class="open">')
    o.append(f'<g clip-path="url(#egeye{tag}open)"><g clip-path="url(#egeye{tag}shut)">')
    o.append(path(almond, EYEWHITE))
    o.append('<g class="pupil">')
    o.append(f'<rect x="{f2(x0)}" y="{f2(y0)}" width="{f2(w)}" height="{f2(y1 - y0)}" fill="none" stroke="none"/>')
    o.append(circle(P[0], P[1], pr * 1.08, INK))
    o.append(circle(P[0] - pr * 0.35, P[1] - pr * 0.4, pr * 0.32, EYEWHITE))
    o.append('</g></g></g>')
    o.append(path(poly(low, False), "none", INK, lowW))
    o.append(f'<g clip-path="url(#egeye{tag}above)">' + path(poly(top, False), "none", INK, lidW, 'class="lid"') + '</g>')
    o.append('</g>')
    # asleep: the lids met, the line sagging a little
    o.append('<g class="closed" display="none">' + path(poly(bez(L, cc, R), False), "none", INK, shutW) + '</g>')
    # happy: an arch between the corners
    mid = ((L[0] + R[0]) / 2, (L[1] + R[1]) / 2 - (y1 - y0) * 1.05)
    o.append('<g class="happy" display="none">' + path(poly(bez(L, mid, R), False), "none", INK, shutW) + '</g>')
    # squeezed shut: > on the left eye, < on the right, pointing at the nose
    cx_, cy_ = (L[0] + R[0]) / 2, (L[1] + R[1]) / 2 + 1.0
    s = 1 if side == "L" else -1; hw = w / 2
    sq = [(cx_ - s * hw * 0.55, cy_ - 4.6), (cx_ + s * hw * 0.45, cy_), (cx_ - s * hw * 0.55, cy_ + 4.6)]
    o.append('<g class="squeeze" display="none">' + path(poly(sq, False), "none", INK, shutW) + '</g>')
    q = 4.4
    o.append('<g class="x" display="none">' + path(f"M{f2(cx_ - q)} {f2(cy_ - q)}L{f2(cx_ + q)} {f2(cy_ + q)}M{f2(cx_ + q)} {f2(cy_ - q)}L{f2(cx_ - q)} {f2(cy_ + q)}", "none", INK, shutW) + '</g>')
    o.append('</g>')
    return "".join(o), defs

# ---------------- the mouths ----------------
MG = attr("mouth", "data-geom")             # c (the middle), hw (half its width), lw (its line), slope (its tilt)
MC = MG["c"]; MHW = MG["hw"]; MLW = MG["lw"] * 1.1; SLOPE = MG["slope"]
def mouth_shape(key):
    i = FRONT.find(f'data-mouth="{key}"')
    g = balanced(FRONT, FRONT.rfind("<g", 0, i))
    return g[g.find(">") + 1:g.rfind("</g>")]

def mouths():
    """The pet rig's mouths, from his own: idle is the traced line; smug his smirk; smile, frown his; open a small dark
    mouth with a tongue (the rig scales it for a yawn or a scream); yum the smile with the tongue out."""
    cx, cy = MC
    rot = f'transform="rotate({SLOPE} {cx} {cy})"'
    st = lambda d, w=MLW: path(d, "none", INK, w)
    o = ['<g id="mouth">']
    o.append('<g id="mouth-idle">' + own(mouth_shape("neutral")) + '</g>')
    o.append(f'<g id="mouth-smug" display="none"><g {rot}>' + st(f"M{f2(cx - 11.0)} {f2(cy + 0.4)}Q{f2(cx + 2.4)} {f2(cy + 1.2)} {f2(cx + 11.9)} {f2(cy - 2.9)}") + '</g></g>')
    o.append(f'<g id="mouth-smile" display="none"><g {rot}>' + st(f"M{f2(cx - 11.7)} {f2(cy - 1.6)}Q{f2(cx)} {f2(cy + 6.4)} {f2(cx + 11.7)} {f2(cy - 1.6)}") + '</g></g>')
    o.append(f'<g id="mouth-frown" display="none"><g {rot}>' + st(f"M{f2(cx - 11.0)} {f2(cy + 2.6)}Q{f2(cx)} {f2(cy - 3.4)} {f2(cx + 11.0)} {f2(cy + 2.6)}") + '</g></g>')
    # open: a small dark oval, the upper lip's line across its top, a tongue in the bottom
    ox, oy, rx, ry = cx, cy + 0.6, 4.6, 3.8
    oval = f"M{f2(ox - rx)} {f2(oy)}A{rx} {ry} 0 1 0 {f2(ox + rx)} {f2(oy)}A{rx} {ry} 0 1 0 {f2(ox - rx)} {f2(oy)}Z"
    o.append(f'<g id="mouth-open" display="none"><g {rot}>'
             f'<clipPath id="egmaw"><path d="{oval}"/></clipPath>'
             + path(oval, MAW) + f'<g clip-path="url(#egmaw)">' + ellipse(ox, oy + ry * 0.95, rx * 0.8, ry * 0.62, TONGUE) + '</g>'
             + path(oval, "none", INK, MLW) + '</g></g>')
    # yum: the smile, the tongue out over the lower lip
    tx, ty = cx + 2.6, cy + 2.6
    tongue = f"M{f2(tx - 3.0)} {f2(ty - 0.8)}C{f2(tx - 3.4)} {f2(ty + 3.4)} {f2(tx + 3.4)} {f2(ty + 3.4)} {f2(tx + 3.0)} {f2(ty - 0.8)}Z"
    o.append(f'<g id="mouth-yum" display="none"><g {rot}>' + path(tongue, TONGUE, INK, MLW * 0.8)
             + path(f"M{f2(tx)} {f2(ty - 0.4)}L{f2(tx)} {f2(ty + 1.4)}", "none", INK, MLW * 0.5)
             + st(f"M{f2(cx - 11.7)} {f2(cy - 1.6)}Q{f2(cx)} {f2(cy + 6.4)} {f2(cx + 11.7)} {f2(cy - 1.6)}") + '</g></g>')
    o.append('</g>')
    return "".join(o)

# ---------------- the crown: the cat's, smaller, sitting on top of his hair ----------------
# Sized to his head, not his hair (a crown as wide as his mop was half as wide again as his head), and set ON the top of
# the mop the way a crown sits on a head of hair: the band's bottom where the hair is as wide as it (measured off the
# drawing: 34.4 wide at y 26.5), a soft shadow under it on the hair.
CROWN_AT = (100.8, 23.3)    # the middle of the cat's crown (its 100,40), in view units
CROWN_K = 0.54
def crown():
    cx, cy = 100, 40     # the cat's crown's own middle, in its units
    P = lambda pts: "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"
    o = ['<g id="crown"><g id="crownlift">']
    # its seat: the hair under the band in shadow (his hair's deep shade, so a ghost's turns pale with the rest)
    o.append(ellipse(CROWN_AT[0], CROWN_AT[1] + 3.6, 17.0, 1.9, "#23142C", "none", 0, 'opacity="0.55"'))
    o.append(f'<g transform="translate({CROWN_AT[0]} {CROWN_AT[1]}) scale({CROWN_K}) translate({-cx} {-cy})">')
    o.append(path(P([(70, 46), (66, 30), (74, 32), (80, 12), (88, 30), (94, 30), (100, 8), (106, 30), (112, 30), (120, 12), (126, 32), (134, 30), (130, 46)]), GOLD, INK, 2.9))
    o.append(path(P([(70, 46), (130, 46), (132, 38), (68, 38)]), GOLD2, INK, 1.8))
    for bx, by in ((80, 12), (100, 8), (120, 12)): o.append(ellipse(bx, by, 3.6, 3.6, GOLD, INK, 1.8))
    o.append(ellipse(100, 33, 5.2, 4.4, RUBY, INK, 1.8))
    o.append(ellipse(84, 36, 2.8, 2.8, TEAL, INK, 1.6))
    o.append(ellipse(116, 36, 2.8, 2.8, GREEN, INK, 1.6))
    for hx, hy, hr in ((98.4, 31.6, 1.3), (83.2, 35.2, 0.8), (115.2, 35.2, 0.8)): o.append(circle(hx, hy, hr, EYEWHITE))
    def spark(sid, sx, sy, r):
        return (f'<path id="{sid}" display="none" d="M{sx},{sy-r} L{sx+r*0.22},{sy-r*0.22} L{sx+r},{sy} L{sx+r*0.22},{sy+r*0.22} '
                f'L{sx},{sy+r} L{sx-r*0.22},{sy+r*0.22} L{sx-r},{sy} L{sx-r*0.22},{sy-r*0.22} Z" fill="#FFFFFF" stroke="none"/>')
    o.append(spark("glintL", 80, 12, 7)); o.append(spark("glintC", 100, 8, 10)); o.append(spark("glintR", 120, 12, 7))
    o.append('</g></g></g>')
    return "".join(o)

# ---------------- the whole of him ----------------
def build(items=None):
    IT = items or {}
    J = lambda k: "".join(IT.get(k, []))
    defs = []
    # his drawing's own defs that the pieces use: the two arms' drawings, the two hair drawings
    # (these are drawn through <use>, and a style rule cannot reach into a <use>'s copy by its attributes: so each colour
    # in them is also a custom property, which does inherit into the copy, and his css recolours them by those: the
    # zombie's green skin, the ghost's pale everything)
    varify = lambda m: re.sub(r'fill="#([0-9A-Fa-f]{6})"', lambda t: f'fill="#{t.group(1)}" style="fill:var(--eg-c-{t.group(1).upper()},#{t.group(1)})"', m)
    for d in ("armL-art", "armR-art", "hairback-art", "hairfront-art"):
        defs.append(varify(own(by_id(f"emonad-front-{d}"))))
    g = []
    g.append('<g id="shadow">' + ellipse(100, FLOOR + 0.6, 30, 4.6, PUPIL, "none", 0, 'opacity="0.5"') + '</g>')
    g.append('<g id="figure">')
    g.append(J("behind"))                    # a cape: behind all of him
    # the legs: the thigh (its clip rounds its top at the hip), and the shin with the shoe in #shin…, turning at the knee
    for s in ("L", "R"):
        kn = PIV[f"shin{s}"]
        thigh = own(part(f"thigh{s}")); shin = own(part(f"shin{s}")); shoe = own(part(f"shoe{s}"))
        g.append(f'<g id="foot{s}">' + U(thigh + circle(kn[0], kn[1], 15.6, INK)) + J(f"thigh{s}")
                 + f'<g id="shin{s}">' + U(shin + shoe) + J(f"shin{s}") + '</g></g>')
    # his neck, in the head's frame, under the shirt (see the top of the file)
    g.append('<g id="neckback" data-twin="head">' + U(own(part("faceTrap")) + own(part("neckTrap")) + own(part("neckbase")) + own(part("neck"))) + J("neck") + '</g>')
    # the shoulders: drawn at rest here; his moves module redraws each one every frame from where its arm is (the
    # standalone rig's shoulderPath, from the same data: emonad.svg's shoulder parts), so a raised arm's sleeve runs into
    # the shirt along a shoulder line and a rounded armpit, never a square block
    def shoulder(side):
        dsh = attr(f"shoulder{side}", "data-shoulder")
        return f'<path id="egshoulder{side}" class="egshoulder" data-side="{side}" data-shoulder=\'{json.dumps(dsh)}\' d="{SHOULDER[side]}" fill="{INK}" stroke="none"/>'
    g.append('<g id="body">' + J("body_under") + U(own(part("torso")) + shoulder("L") + shoulder("R")) + J("body") + '</g>')
    AL, AR = arm("L"), arm("R")
    # The arms: the upper arm and the sleeve here, under the hair (which hangs over the tops of the sleeves); #foreL /
    # #foreR are empty here, and the forearms and hands are drawn in their twins in #armsover, in front of the hair and the
    # face (see below): a hand raised in front of his chest or his face is in front of them. The black disc on the elbow
    # is under everything, the skin disc over the seam in front of everything: at rest the two halves meet on the cut and
    # nothing of the discs shows; bent, the black disc is the elbow's outside.
    g.append('<g id="arms">')
    for s, A in (("L", AL), ("R", AR)):
        g.append(f'<g id="leg{s}" class="leg">' + U(A["black"] + A["upper"]) + J(f"upper{s}") + U(A["sleeve"]) + J(f"sleeve{s}")
                 + f'<g id="fore{s}"></g></g>')
    g.append('</g>')
    g.append(J("over_arms"))                  # at his chest, over the arms: a pendant, a clasp
    # ---- the head unit ----
    g.append('<g id="head">')
    g.append(J("head_back"))
    # (the hair is drawn in two uses, class eghair: under a hat his css cuts it off at the brim)
    g.append('<g class="eghair">' + U('<use href="#eg-hairback-art"/>') + '</g>')
    g.append(J("head_under"))
    g.append(U(own(part("face"))))
    g.append(J("face_skin"))                  # what lies on his face's skin, under the eyes and the mouth (bandages, scars)
    eL, dL = eye("L"); eR, dR = eye("R"); defs += [dL, dR]
    g.append('<g id="face">' + U(eL + eR + mouths()) + J("face") + '</g>')
    g.append(J("head_mid"))
    # grime: smudges of mud on his cheeks and chin (hidden; shown when hygiene is low). Sized to read at wallet size: the first
    # ones were 1.4 view units across at half opacity and read as freckles (the pictures fork, 2026-10-05); each is a smudge
    # with a lighter smear beside it, like the cat's
    g.append('<g id="dirt" display="none">' + U("".join(
        f'<g transform="rotate({r} {x} {y})">' + ellipse(x, y, rx, ry, MUD, "none", 0, 'opacity="0.72"')
        + ellipse(x + rx * 0.55, y + ry * 0.35, rx * 0.7, ry * 0.6, MUD, "none", 0, 'opacity="0.38"') + '</g>'
        for x, y, rx, ry, r in ((19, -486, 9.5, 4.4, 12), (-12, -484, 7.5, 3.6, -14), (7, -458, 7.5, 3.4, -6)))) + '</g>')
    # a tear: it wells at the outer corner of his left eye and runs down his cheek
    lx, ly = V(*attr("eyeL", "data-geom")["L"])
    tx, ty = lx + 0.6, ly + 0.6; tw, th = 1.25, 4.2
    g.append('<g id="tear" display="none">' + path(f"M{f2(tx)},{f2(ty)} C{f2(tx)},{f2(ty)} {f2(tx - tw)},{f2(ty + th * 0.5)} {f2(tx - tw)},{f2(ty + th * 0.72)} "
             f"C{f2(tx - tw)},{f2(ty + th * 0.9)} {f2(tx - tw * 0.55)},{f2(ty + th)} {f2(tx)},{f2(ty + th)} C{f2(tx + tw * 0.55)},{f2(ty + th)} {f2(tx + tw)},{f2(ty + th * 0.9)} {f2(tx + tw)},{f2(ty + th * 0.72)} "
             f"C{f2(tx + tw)},{f2(ty + th * 0.5)} {f2(tx)},{f2(ty)} {f2(tx)},{f2(ty)} Z", TEAR, INK, 0.5) + '</g>')
    # (the fringe: class egfringe as well, so a keffiyeh can show it only in its face opening)
    g.append('<g class="eghair egfringe">' + U('<use href="#eg-hairfront-art"/>') + '</g>')
    g.append(J("head_end"))
    g.append('</g>')  # head
    g.append(J("post_a"))                     # head pieces the crown gives way to
    g.append(crown())
    g.append(J("post_b"))                     # over everything (a hat)
    # the twins of the arms, in front of everything: what he carries in front of his face rides here
    # (and the forearms and hands: in front of the hair and the face, see the arms above)
    g.append('<g id="armsover" data-twin="arms">')
    for s, A in (("L", AL), ("R", AR)):
        g.append(f'<g id="leg{s}over" data-twin="leg{s}"><g id="fore{s}over" data-twin="fore{s}">' + U(A["fore"]) + J(f"fore{s}") + '</g>'
                 + U(A["seam"]) + J(f"elbow{s}") + '</g>')
    g.append(J("carried"))
    g.append('</g>')
    # halo (dead): a gold ring over his hair
    hx, hy = 99.6, 13.0
    g.append('<g id="halo" display="none">' + ellipse(hx, hy, 19, 5.2, "none", INK, 2.3) + ellipse(hx, hy, 19, 5.2, "none", GOLD, 2.8)
             + path(f"M{hx - 14},{hy - 1.6} Q{hx - 9},{hy - 4.6} {hx - 3},{hy - 4.8}", "none", EYEWHITE, 1.2, 'opacity="0.8"') + '</g>')
    # sweat (tense): out past the side of his hair
    sx, sy = 134.0, 46.0
    g.append('<g id="sweat" display="none">' + path(f"M{sx},{sy} C{sx},{sy} {sx-4},{sy+7} {sx-4},{sy+9.6} C{sx-4},{sy+12} {sx-2.2},{sy+13.6} {sx},{sy+13.6} C{sx+2.2},{sy+13.6} {sx+4},{sy+12} {sx+4},{sy+9.6} C{sx+4},{sy+7} {sx},{sy} {sx},{sy} Z", EYEWHITE, INK, 1.3) + '</g>')
    g.append(f'<g id="stink" display="none" fill="none" stroke="{GREEN}" stroke-width="2" stroke-linecap="round">'
             '<path class="s s1" d="M66,150 Q69,145 66,140 Q63,135 66,130"/><path class="s s2" d="M58,118 Q61,113 58,108 Q55,103 58,98"/>'
             '<path class="s s3" d="M138,134 Q141,129 138,124 Q135,119 138,114"/></g>')
    g.append(f'<g id="zzz" display="none" fill="none" stroke="{LAV}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
             '<path class="z z1" d="M130,40 L138,40 L130,48 L138,48"/><path class="z z2" d="M140,22 L151,22 L140,33 L151,33"/>'
             '<path class="z z3" d="M152,2 L166,2 L152,16 L166,16"/></g>')
    g.append('</g>')  # figure
    defs.append('<g id="egitemdefs">' + J("defs") + '</g>')
    body = '<defs id="egdefs">' + "".join(defs) + '</defs>\n' + "\n".join(g)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="200" height="230">
<g id="cat" data-character="emonad" data-jointed="limbs">
{body}
</g>
</svg>'''

if __name__ == "__main__":
    items = None
    try:
        import emonaditems
        items = emonaditems.make(globals())
    except ImportError:
        pass
    svg = build(items)
    open(OUT, "w").write(svg)
    import xml.etree.ElementTree as ET
    ET.fromstring(svg)     # an SVG shown in an <img> is parsed as XML: a duplicate attribute would sink the whole picture
    print("wrote", OUT, len(svg), "bytes")
