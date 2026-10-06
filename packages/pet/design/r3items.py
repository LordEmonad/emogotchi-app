"""The shop's wearables drawn on the r3tards character (LAB ONLY): a floating face on a stick figure.

He has no head, no skin and no torso: only the face's lines, the lips, and five sticks. So everything is fitted to what
there is, and worn the way it would be on a head and a body that are not drawn:
  - what goes on a head sits DOWN on the face, along the line just over his eyes (SEAT: it slopes, his left brow is the
    higher), and takes the place of his two brows (r3tards.css hides them under a hat, the hair, the hood, the brain:
    the operator, "his 2 lil hairs you can have the hats cover"). Floating over the brows, as the crown does, a hat read
    as hovering and a kippah as a saucer.
  - what goes on a body is a CAPE BEHIND him, its lining toward us: it hangs wide from his neck to his knees and the whole
    stick figure stands in front of it, black on the lining. A dress or a cloak ON a stick, with or without sleeves, was
    tried three ways and read as doll's clothes on a wire (the operator: "the clothes with the arms look weird", "the
    clothes still look weird on him"): his arms leave his neck at one point, so no garment can have shoulders.
  - a pumpkin is worn whole over the face, on the stick like a scarecrow's; bandages wind round the sticks, across the
    lips and round the brow; the Star of David hangs at his throat, over the joint of his neck and arms. The pieces use the other pets' own colours, so pet.css's rules for the golden (crowned) and ghost
versions recolour them by attribute.

Every piece's SILHOUETTE also goes, as a pale stroke, into a twin group in the drawing's edge layer (r3tards.py build():
all pale edges under all ink, so the outline runs round the whole dressed figure and never across a part).

make(K) returns the pieces by where they go; r3tards.py's build() places them.
"""
import math
import cat as C
import habibi as HB

ILW = 3.0          # the items' line: his own line's weight (3.13), so what he wears is drawn by the same hand
CLOTH = "#281828"  # the witch's dark cloth (the other pets' own: pet.css turns it gold by this fill)

def make(K):
    RIM, RIMW, INK = K["RIM"], K["RIMW"], K["INK"]
    sp = K["spline"]
    ARM_L, ARM_R, LEG_L, LEG_R, SPINE = K["ARM_L"], K["ARM_R"], K["LEG_L"], K["LEG_R"], K["SPINE"]
    BROWN_D = K["brown_d"]                     # the lips' exact shape (for what is wrapped round them)
    P = {k: [] for k in ("defs", "rims_top", "rim_body", "rim_legL", "rim_legR", "rim_footL", "rim_footR", "rim_head",
                         "rims_behind", "behind", "head_under", "footL", "footR", "body", "legL", "legR", "over_arms", "pre_head", "head_mid", "head_end", "post_a", "post_b")}
    path, ellipse, poly, sc, so = C.path, C.ellipse, C.poly, C.smooth_closed, C.smooth_open

    def rim(d, w=ILW):
        return f'<path d="{d}" fill="none" stroke="{RIM}" stroke-width="{w + RIMW:.2f}" stroke-linejoin="round" stroke-linecap="round"/>'
    def twin(of, inner):
        return f'<g id="{of}rim" data-twin="{of}" display="none">{inner}</g>'
    def grp(i, inner, cls=""):
        return f'<g id="{i}"{f" class=\"{cls}\"" if cls else ""} display="none">' + "".join(inner) + '</g>'
    def tube(pts, w0, w1, f0=0.0, f1=1.0, step=1.0):
        """The centreline of a limb from f0 to f1 of its length, and the two edges of a tube of width w0..w1 along it."""
        c = sp(pts, step); n = len(c); c = c[int(round(f0 * (n - 1))):int(round(f1 * (n - 1))) + 1]; n = len(c)
        L, Rr = [], []
        for i, (x, y) in enumerate(c):
            x0, y0 = c[max(i - 1, 0)]; x1, y1 = c[min(i + 1, n - 1)]
            tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1.0; nx, ny = -ty / m, tx / m
            w = w0 + (w1 - w0) * i / max(1, n - 1)
            L.append((x + nx * w / 2, y + ny * w / 2)); Rr.append((x - nx * w / 2, y - ny * w / 2))
        return c, L, Rr
    def star4(x, y, r, fill=C.LAV):
        return path(poly([(x, y - r), (x + r * 0.28, y - r * 0.28), (x + r, y), (x + r * 0.28, y + r * 0.28), (x, y + r), (x - r * 0.28, y + r * 0.28), (x - r, y), (x - r * 0.28, y - r * 0.28)]), fill, "none", 0)

    # ------------------------------------------------------------------ the witch: hat, cloak, clasp, cuffs
    # The hat's brim comes down over the brows to the line above his eyes, tipped the way that line slopes, and is wider
    # than the face, so there is a head under it.
    HAT_T = 'transform="translate(0 2.6) rotate(5 100 57) translate(100 57) scale(1.08) translate(-100 -57)"'
    brim = sc([(36, 40), (50, 31), (74, 27), (100, 26), (126, 27), (150, 31), (164, 40), (154, 50), (130, 55), (100, 57), (70, 55), (46, 50)], 0.5)
    cone = sc([(62, 38), (67, 16), (76, -6), (90, -22), (106, -32), (122, -32), (136, -26), (146, -16), (150, -6),
               (146, -8), (138, -18), (126, -20), (116, -12), (118, 0), (126, 22), (138, 38), (100, 44)], 0.5)
    hat = ['<g class="hatpose">', f'<g {HAT_T}>', path(brim, C.HAIR, INK, 2.8), path("M44,45 Q100,39 156,45", "none", C.STRAND, 1.8, 'opacity="0.65"'),
           ellipse(100, 44, 34, 4.5, CLOTH, "none", 0, 'opacity="0.3"'), path(cone, CLOTH, INK, 2.8),
           path("M120,-20 Q128,-24 136,-23", "none", INK, 1.5, 'opacity="0.35"'), path("M72,26 Q79,8 90,-8", "none", C.LAV, 2.0, 'opacity="0.2"'),
           path(sc([(62, 38), (66, 25), (100, 31), (134, 25), (138, 38), (100, 44)], 0.45), INK, INK, 1.8)]
    hat += [f'<circle cx="{x}" cy="{y}" r="2.2" fill="{C.LAV}"/>' for x, y in ((74, 34), (82, 36), (118, 36), (126, 34))]
    hat += [path("M94,32 L106,31.5 L106.5,43 L94.5,43.5 Z", "none", INK, 4.6), path("M94,32 L106,31.5 L106.5,43 L94.5,43.5 Z", "none", C.GOLD, 2.6),
            ellipse(100.3, 37.5, 2.8, 2.5, C.RUBY, INK, 1.2), '<circle cx="99.5" cy="36.7" r="0.8" fill="#FFFFFF"/>', '</g>', '</g>']
    P["post_b"].append(grp("witchhat", hat))
    P["rims_top"].append(twin("witchhat", f'<g class="hatpose"><g {HAT_T}>' + rim(brim, 2.6) + rim(cone, 2.6) + '</g></g>'))   # (.hatpose: r3tards.css lifts the hat onto the emo hair)

    # The witch's cape, behind him: dark cloth, a broad band of it round the edge, the purple lining inside; a witch's hem
    # of points; folds and a few stars on the lining; at his throat (over everything) the collar's two flaps and the clasp.
    def cape(hem):
        L = [(93, 111), (85.5, 118), (78.5, 132), (72.5, 150), (68, 168), (65, 184)]
        Rr = [(135, 184), (132, 168), (127.5, 150), (121.5, 132), (114.5, 118), (107, 111)]
        return L + hem + Rr
    def inset(pts, by, cx=100.0, cy=150.0):
        """The same outline drawn in toward the middle by `by` (for a lining inside a border)."""
        out = []
        for x, y in pts:
            dx, dy = x - cx, y - cy; m = math.hypot(dx, dy) or 1.0
            out.append((x - dx / m * by, y - dy / m * by * 0.6))
        return out
    WHEM = [(71.5, 190.5), (78, 183.5), (85, 191), (92.5, 184), (100, 191.5), (107.5, 184), (115, 191), (122, 183.5), (128.5, 190.5)]
    cape_pts = cape(WHEM); robe_d = sc(cape_pts, 0.3); lining_d = sc(inset(cape_pts, 4.6), 0.3)
    P["defs"].append(f'<clipPath id="r3robeclip"><path d="{lining_d}"/></clipPath>')
    robe = [path(robe_d, CLOTH, "none", 0), path(lining_d, C.STRAND, "none", 0), '<g clip-path="url(#r3robeclip)">']
    robe += [path(so(f, 0.5), "none", C.HAIR, 2.0, 'opacity="0.55"') for f in ([(90, 122), (82, 150), (76, 184)], [(110, 122), (118, 150), (124, 184)], [(96, 126), (92, 156), (90, 186)], [(104, 126), (108, 156), (110, 186)])]
    robe += [path(so(f, 0.5), "none", C.PURPLE, 1.6, 'opacity="0.7"') for f in ([(86, 124), (77.5, 152), (71.5, 182)], [(114, 124), (122.5, 152), (128.5, 182)])]
    robe += [star4(x, y, r) for x, y, r in ((82, 146, 2.4), (117.5, 160, 2.1), (88, 172, 1.6), (112, 138, 1.6), (123, 176, 1.4), (76.5, 164, 1.3))]
    robe += ['</g>', path(lining_d, "none", INK, 1.5, 'opacity="0.55"'), path(robe_d, "none", INK, ILW)]
    P["behind"].append(grp("robe", robe, "robe"))
    P["rims_behind"].append(twin("robe", rim(robe_d)))
    yoke = [path(sc([(99.2, 112), (87, 113), (90.5, 124.5), (99.4, 119.5)], 0.25), C.PURPLE, INK, 2.0),
            path(sc([(100.8, 112), (113, 113), (109.5, 124.5), (100.6, 119.5)], 0.25), C.PURPLE, INK, 2.0),
            ellipse(100, 119.4, 4.0, 3.6, C.GOLD, INK, 1.7), ellipse(100, 119.4, 1.8, 1.6, C.RUBY, INK, 0.8), '<circle cx="99.4" cy="118.7" r="0.55" fill="#FFFFFF"/>']
    P["over_arms"].append(grp("yoke", yoke, "robe"))

    # ------------------------------------------------------------------ the bisht (Habibi pack): the cloak behind him, black wool, its lining toward us, gold down both edges and round the neck
    BHEM = [(74, 187.5), (87, 189), (100, 188), (113, 189), (126, 187.5)]
    bisht_pts = cape(BHEM); bisht_d = sc(bisht_pts, 0.3); blining_d = sc(inset(bisht_pts, 5.6), 0.3)
    P["defs"].append(f'<clipPath id="r3bishtclip"><path d="{blining_d}"/></clipPath>')
    BLINING = "#5A4732"      # the lining: a warm brown, so his black sticks read against it (r3tards.css gilds it when crowned)
    bisht = [path(bisht_d, HB.BISHT, "none", 0), path(blining_d, BLINING, "none", 0), '<g clip-path="url(#r3bishtclip)">']
    bisht += [f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in HB.smooth_pts(f, 6))}" fill="none" stroke="{HB.BISHT_HI}" stroke-width="2.0" stroke-linecap="round" opacity="0.7"/>' for f in ([(92, 124), (86, 154), (82, 184)], [(108, 124), (114, 154), (118, 184)], [(99, 128), (98, 158), (97, 186)])]
    bisht.append('</g>')
    # the gold: a band of zari down each edge, on the wool, and round the neck
    for edge in ([(91.5, 113.5), (83.5, 121.5), (76.6, 134), (70.6, 151), (66.2, 168.5), (63.4, 183)], [(108.5, 113.5), (116.5, 121.5), (123.4, 134), (129.4, 151), (133.8, 168.5), (136.6, 183)]):
        bisht += HB.zari(HB.smooth_pts(edge, 6), 3.4, INK, 0.8, 3.2)
    bisht += [path(bisht_d, "none", INK, ILW)]
    P["behind"].append(grp("bisht", bisht, "bisht"))
    P["rims_behind"].append(twin("bisht", rim(bisht_d)))
    # its gold collar at his throat, over everything (the same place as the witch's clasp)
    bcol = HB.zari(HB.smooth_pts([(88.5, 117), (94, 113.4), (100, 112.6), (106, 113.4), (111.5, 117)], 6), 3.2, INK, 0.9, 2.6)
    P["over_arms"].append(grp("bishtsleeveL", bcol, "bisht"))      # (an id the rig already shows with the bisht)

    # ------------------------------------------------------------------ a head, for what needs one (the mummy's wrappings, the zombie's skull)
    # He has none. A dome set on the line over his eyes was a cap (a bun on his face, a brain on a plate): it stood out
    # past the face at both ends and had a floor. So the head is ONE silhouette with his face: its outline leaves the
    # lips' own outline at their widest on each side (the cheek's bulge on the left, the lips' shoulder on the right),
    # tangent to it, goes over the top tipped the way his eyes are, and comes down to the other side. No floor.
    HEAD_L, HEAD_R = (45.3, 67.5), (156.2, 79.0)
    HEAD_ARC = [HEAD_L, (41.6, 58.5), (40.4, 48), (43.5, 37.5), (51.5, 28.5), (64, 21.6), (81, 17.6), (100, 16.8), (119, 19.2), (135.5, 25), (148, 34.5), (156, 46.5), (159.4, 60), (158.8, 71), HEAD_R]
    # the line just over his eyes (above both lids, round the outer corners down to the ends of the arc)
    OVER_EYES = [(48.2, 63.2), (52.2, 57.6), (58.5, 55.2), (67, 56.2), (78, 57.6), (89, 59.2), (99, 61.6), (108, 62.6), (120, 63.4), (132, 64.2), (141, 65.4), (148.5, 68.4), (153, 72.8)]
    arc_s = HB.smooth_pts(HEAD_ARC, 6); over_s = HB.smooth_pts(OVER_EYES, 6)
    head_arc_d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in arc_s)
    over_d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in [HEAD_L] + over_s + [HEAD_R])
    dome_d = poly(arc_s + [HEAD_R] + over_s[::-1])                       # the top of the head: from the arc down to the line over the eyes
    # all of the head behind the face: the arc, closed through the middle of the lips (which cover it there)
    skull_d = poly(arc_s + [(150, 86), (100, 90), (52, 84)])
    P["defs"].append(f'<clipPath id="r3dome"><path d="{dome_d}"/></clipPath><clipPath id="r3skull"><path d="{skull_d}"/></clipPath>')

    # ------------------------------------------------------------------ the mummy:    # ------------------------------------------------------------------ the mummy: bandages across the lips and wound round every stick
    P["defs"].append(f'<clipPath id="r3brown"><path d="{BROWN_D}" clip-rule="evenodd"/></clipPath>')
    # his lips wrapped whole (linen over all of the brown, bands wound across it at different slants, each with its
    # crease); the eyes look out between that and the wrapped top of his head, the mouth's line lies over the bandage
    # (their edges are a dark linen, thin, not ink: in ink, seven bands' worth of black lines buried the mouth, and no
    # smile or frown could be read on him: the operator, "sad mummy mouth looks weird")
    SOFT = "#A8956A"
    def soft_strip(pts, w):
        c = C._centreline(pts, 0.5)
        left = [(x + nx * w / 2, y + ny * w / 2) for x, y, nx, ny in c]; right = [(x - nx * w / 2, y - ny * w / 2) for x, y, nx, ny in c]
        k = max(1, len(c) // 5); cr = [(x + nx * w * 0.18, y + ny * w * 0.18) for x, y, nx, ny in c[1::k]]
        return [path(poly(left + right[::-1]), C.LINEN, SOFT, 1.15), path(so(cr), "none", C.LINEN2, 1.3, 'opacity="0.9"')]
    mh = ['<g clip-path="url(#r3brown)">', path(BROWN_D, C.LINEN, "none", 0, 'fill-rule="evenodd"')]
    for pts, w in (([(36, 82), (70, 90), (112, 88), (164, 78)], 9.0), ([(36, 99), (80, 97), (120, 103), (164, 95)], 9.0), ([(46, 114), (90, 107), (130, 112), (156, 104)], 8.4),
                   ([(52, 72), (70, 96), (80, 118)], 7.6), ([(154, 74), (136, 98), (130, 118)], 7.6)):
        mh += soft_strip(pts, w)
    mh.append('</g>')
    # His head, wrapped: bandages wound round the top of it down to the line over his eyes (each clipped to the head, as
    # the cat's are to what they wrap); his eyes look out of the dark between that and the wrapped lips (the dark is its
    # own piece UNDER the face, a twin of the wrappings); his brows and the creases over his lids are under the linen.
    mh += ['<g class="r3dome">', path(dome_d, C.LINEN, "none", 0), '<g clip-path="url(#r3dome)">']   # (.r3dome: the keffiyeh's hood takes its place, r3tards.css)
    for pts, w in (([(34, 62), (62, 50.5), (100, 52.5), (136, 58), (166, 74)], 10.0), ([(34, 50), (64, 38.5), (100, 39.5), (136, 45), (166, 60)], 10.0),
                   ([(36, 36), (66, 26), (100, 26.5), (134, 31), (164, 46)], 10.0), ([(50, 22), (80, 13.5), (104, 13.5), (130, 17), (154, 30)], 10.0),
                   ([(58, 14), (78, 36), (92, 66)], 8.6), ([(150, 26), (126, 44), (108, 70)], 8.6), ([(96, 10), (118, 30), (150, 50), (168, 62)], 8.0)):
        mh += C.strip(pts, w, lw=1.6)
    mh += ['</g>', path(over_d, "none", INK, 2.4), path(head_arc_d, "none", INK, ILW), '</g>']
    P["head_mid"].append(grp("mummyhead", mh, "mummy"))
    P["rim_head"].append(twin("mummyhead", '<g class="r3dome">' + rim(head_arc_d) + '</g>'))
    P["head_under"].append('<g id="mummyin" class="r3dome" data-twin="mummyhead" display="none">' + path(skull_d, "#1E1420", "none", 0) + '</g>')
    def wrap(limb, f0, f1, w=6.8):
        c, L, Rr = tube(limb, w, w, f0, f1)
        d = poly(L + Rr[::-1])
        out = [path(d, C.LINEN, INK, 1.7)]
        for i in range(3, len(c) - 2, 5):                      # the windings: slanted lines across the tube
            j = min(len(c) - 1, i + 3)
            out.append(path(f"M{L[i][0]:.1f},{L[i][1]:.1f} L{Rr[j][0]:.1f},{Rr[j][1]:.1f}", "none", "#B9A671", 1.4))
        return out, d
    for gid, where, rimkey, limb, f0, f1 in (("wrapL", "legL", "rim_legL", ARM_L, 0.14, 0.86), ("wrapR", "legR", "rim_legR", ARM_R, 0.14, 0.86),
                                             ("mummyfootL", "footL", "rim_footL", LEG_L, 0.12, 0.88), ("mummyfootR", "footR", "rim_footR", LEG_R, 0.12, 0.88),
                                             ("mummybody", "body", "rim_body", SPINE, 0.22, 0.90)):
        w_, d = wrap(limb, f0, f1)
        P[where].append(grp(gid, w_, "mummy")); P[rimkey].append(twin(gid, rim(d, 1.7)))

    # ------------------------------------------------------------------ the zombie: r3tards.css turns the lips a dead green
    # He gets a head: dead skin from his face up, UNDER the face's lines (so his brows and the creases over his lids are
    # drawn on it), the top of the skull cracked open and the brain standing out of it. (A brain sat on the line over his
    # eyes, with or without a rim of bone, was a hat: the operator, "the brain looks weird", "zombie needs work".)
    BONE = "#EDE7D1"; SKIN = "#95A673"; SKIN2 = "#6F8254"
    BX, BY, BRX, BRY, BROT = 100.0, 36.0, 38.0, 27.5, 5.0
    top = []
    for i in range(0, 61):
        th = math.pi * (1 - i / 60)
        bump = 1 + 0.06 * math.sin(i / 60 * math.pi * 7.0) ** 2 * (1 if 3 < i < 57 else 0)
        top.append((BX + BRX * math.cos(th) * bump, BY - BRY * math.sin(th) * bump))
    brain_d = sc(top + [(BX + 30, BY + 8), (BX, BY + 10), (BX - 30, BY + 8)], 0.4)
    BT = f'transform="rotate({BROT} {BX} {BY})"'
    FT = f'transform="translate({BX} {BY}) scale({BRX / 46:.3f} {BRY / 30:.3f}) translate(-100 -55)"'       # the folds were drawn for a 46 x 30 brain at (100, 55)
    folds = ["M100,26.5 Q97,36 101,44 Q104,50 100,56",
             "M88,29 Q80,33 84,39 Q88,44 80,47", "M72,36 Q66,42 72,46 Q78,50 70,54", "M92,40 Q88,46 94,50", "M62,45 Q58,50 63,53", "M78,29.5 Q72,31 70,35",
             "M112,29 Q120,33 116,39 Q112,44 120,47", "M128,36 Q134,42 128,46 Q122,50 130,54", "M108,40 Q112,46 106,50", "M138,45 Q142,50 137,53", "M122,29.5 Q128,31 130,35"]
    P["defs"].append(f'<clipPath id="r3brainclipL"><path d="{brain_d}"/></clipPath>')
    zs = [f'<g class="zbrain" {BT}>', path(brain_d, C.BRAIN, "none", 0), '<g clip-path="url(#r3brainclipL)">', f'<g {FT}>']
    zs += [path(f, "none", C.BRAIN2, 2.2 if i == 0 else 1.8) for i, f in enumerate(folds)]
    zs += ['</g>', ellipse(84, 19, 9, 3.0, "#FFFFFF", "none", 0, 'opacity="0.3" transform="rotate(-26 84 19)"'), '</g>', path(brain_d, "none", INK, 2.6), '</g>']
    # the skull: the head's arc, its top broken off along a jagged edge (the brain behind it)
    JAG = [(60.5, 23.2), (66.5, 31.5), (72, 25.5), (78.5, 34), (85, 27), (92, 36.5), (99, 28.5), (106.5, 37.5), (113, 30), (120.5, 39), (127, 31.5), (133.5, 38.5), (139.5, 27.5)]
    left = [p for p in arc_s if p[0] < 60.5 and p[1] > 23.2]; right = [p for p in arc_s if p[0] > 139.5 and p[1] > 27.5]
    crack = left + JAG + right
    skin_d = poly(crack + [(150, 86), (100, 90), (52, 84)])
    crack_d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in crack)
    zs += [path(skin_d, SKIN, "none", 0), '<g clip-path="url(#r3skull)">',
           # the thickness of the bone along the break, blotches, the hollows of his temples
           path("M" + " L".join(f"{x:.1f},{y + 2.6:.1f}" for x, y in JAG), "none", BONE, 2.6),
           ellipse(56, 46, 8, 5, SKIN2, "none", 0, 'opacity="0.45" transform="rotate(-30 56 46)"'), ellipse(146, 50, 7, 4.6, SKIN2, "none", 0, 'opacity="0.45" transform="rotate(34 146 50)"'),
           ellipse(112, 47, 5.5, 3, SKIN2, "none", 0, 'opacity="0.4"'), ellipse(50, 60, 4, 2.6, SKIN2, "none", 0, 'opacity="0.4"'),
           '</g>', path("M92,36.5 l1.6,4.6 l-2.4,3.4 l1.4,3.2", "none", INK, 1.2), path("M127,31.5 l1.8,4 l-1.6,3", "none", INK, 1.2)]
    zs += C.stitches((120, 45.5), (143, 52.5), 4, 4.4, 1.5)
    zs += [path(crack_d, "none", INK, ILW)]
    P["head_under"].append('<g id="zombieskull" class="zombie" data-twin="zombiehead" display="none">' + "".join(zs) + '</g>')
    # (.zbrain: under the hair or the hood the brain is covered, r3tards.css; the skull stays, it is his head)
    P["rim_head"].append(twin("zombiehead", rim(crack_d) + f'<g class="zbrain" {BT}>' + rim(brain_d, 2.6) + '</g>'))
    # on the lips: rot, the bags under his eyes, two stitched scars
    zh = ['<g clip-path="url(#r3brown)">', ellipse(128, 104, 9, 4.6, "#4E5E3A", "none", 0, 'opacity="0.55"'), ellipse(64, 88, 6, 3.4, "#4E5E3A", "none", 0, 'opacity="0.5"'),
          ellipse(140, 98, 4.2, 2.6, "#4E5E3A", "none", 0, 'opacity="0.5"'), ellipse(96, 108, 5, 2.6, "#4E5E3A", "none", 0, 'opacity="0.45"'),
          ellipse(77, 85.5, 19, 4.6, "#3B2C47", "none", 0, 'opacity="0.42"'), ellipse(126, 88.5, 19, 4.4, "#3B2C47", "none", 0, 'opacity="0.42"'), '</g>']
    zh += C.stitches((57, 99.5), (83, 105.5), 4, 4.6, 1.6) + C.stitches((124, 101), (147, 93.5), 4, 4.6, 1.6)
    P["head_mid"].append(grp("zombiehead", zh, "zombie"))
    # the left forearm is bare bone; pale thread stitches the right arm and the spine
    c, L, Rr = tube(ARM_L, 3.6, 3.2, 0.60, 0.97)
    bone_d = poly(L + Rr[::-1]); ex, ey = c[-1]; (ax, ay) = c[-3]; tx, ty = ex - ax, ey - ay; m = math.hypot(tx, ty) or 1; nx, ny = -ty / m, tx / m
    zl = [ellipse(ex + nx * 1.5, ey + ny * 1.5, 2.0, 2.0, "#EDE7D1", INK, 1.4), ellipse(ex - nx * 1.5, ey - ny * 1.5, 2.0, 2.0, "#EDE7D1", INK, 1.4), path(bone_d, "#EDE7D1", INK, 1.5)]
    P["legL"].append(grp("zombieL", zl, "zombie")); P["rim_legL"].append(twin("zombieL", rim(bone_d, 1.5) + f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{3.6 + RIMW / 2:.2f}" fill="{RIM}"/>'))
    def ticks(limb, fs, col="#B4C8AC"):
        c = sp(limb, 1.0); out = []
        for f in fs:
            i = int(f * (len(c) - 1)); x, y = c[i]; x0, y0 = c[max(i - 2, 0)]; x1, y1 = c[min(i + 2, len(c) - 1)]
            tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1; nx, ny = -ty / m, tx / m
            for s in (-0.9, 0.9):
                out.append(path(f"M{x + tx / m * s + nx * 2.6:.1f},{y + ty / m * s + ny * 2.6:.1f} L{x + tx / m * s - nx * 2.6:.1f},{y + ty / m * s - ny * 2.6:.1f}", "none", col, 1.1))
        return out
    P["legR"].append(grp("zombieR", ticks(ARM_R, (0.38, 0.62)), "zombie"))
    P["body"].append(grp("zombiebody", ticks(SPINE, (0.42, 0.66)), "zombie"))

    # ------------------------------------------------------------------ the emo hair: a plum mop on the brows, swept down over the far (his left) eye
    HAIRP = [(46, 61), (41, 48), (46, 35), (58, 25), (76, 18.5), (98, 16.5), (120, 19), (138, 26), (151, 37), (159, 52), (162, 68),
             (158.5, 83), (153, 72), (148.5, 86.5), (142, 73), (136, 85), (130, 70), (123, 79.5), (117, 64), (110, 68), (103, 57.5), (95, 57.5), (86, 51.5), (76, 54), (67, 50.5), (58, 56), (52, 54.5)]
    hair_d = sc(HAIRP, 0.36)
    P["defs"].append(f'<clipPath id="r3hairclip"><path d="{hair_d}"/></clipPath>'
                     # under the witch hat only the hair below its brim shows (r3tards.css); a kippah on the hair is on the
                     # back of his head: only what stands over the top of the mop shows
                     + '<clipPath id="r3underhat"><rect x="-60" y="47" width="320" height="260" transform="rotate(5 100 57)"/></clipPath>'
                     + f'<clipPath id="r3overhair"><path clip-rule="evenodd" d="M-60,-80 H260 V260 H-60 Z {hair_d}"/></clipPath>')
    hr = [path(hair_d, C.HAIR, INK, 2.7), '<g clip-path="url(#r3hairclip)">']
    for (x0, y0, x1, y1, bend) in ((62, 30, 58, 50, -3), (78, 22, 78, 46, -3), (96, 19, 100, 50, -4), (114, 21, 122, 68, -5), (130, 26, 138, 74, -5), (144, 34, 150, 76, -4), (153, 46, 157, 74, -2)):
        hr.append(path(so([(x0, y0), ((x0 + x1) / 2 + bend, (y0 + y1) / 2), (x1, y1)]), "none", C.STRAND, 1.5))
    hr += [path("M66,28 Q92,18 124,23", "none", C.LAV, 1.8, 'opacity="0.35"'), '</g>']
    # (the whole mop sits this much lower: its fringe stood a few units over the creases of his lids and the room showed
    # in between, the operator: "emo hair slightly lower so theres not that gap")
    HAIRD = 'transform="translate(0 4.8)"'
    # (under the hair a zombie's skull and a mummy's wrapped head show only inside the mop's outline and below it: their
    # arc stood out past the hair's upper corners; r3tards.css)
    P["defs"].append(f'<clipPath id="r3inhair"><path d="{hair_d}" {HAIRD}/><rect x="0" y="66" width="200" height="90"/></clipPath>')
    P["post_a"].append(grp("emohair", [f'<g {HAIRD}>'] + hr + ['</g>']))
    P["rims_top"].append(twin("emohair", f'<g {HAIRD}>' + rim(hair_d, 2.7) + '</g>'))

    # ------------------------------------------------------------------ the Jewish pack: the kippah, the payot, the Star of David
    # (it sits ON his brows, its rim dipping over their tops, tipped the way they slope: small and floating over them it
    # read as a saucer, the operator: "kippah fits weird")
    # (lower again, and his brows go under it like under a hat: on the brows, with the right brow's tail sticking out past
    # its rim, it still "looks weird ... needs to sit lower", the operator. Its rim now lies along the creases over his lids.)
    KX, KY, KW, KH, KB, KR = 99.0, 58.0, 64.0, 19.0, 4.4, 8
    kd, kp = C.kippah_cap(KX, KY, KW, KH, KB, rot=KR, lw=2.6, clip_id="r3kippahclip")
    P["defs"].append(kd)
    # (the inner group is what r3tards.css moves: up onto the emo hair, onto a zombie's brain)
    P["post_a"].append('<g id="kippah" display="none"><g class="kippahpose">' + "".join(kp) + '</g></g>')
    kdome = [(KX - KW / 2 * math.cos(math.pi * k / 28), KY - KH * math.sin(math.pi * k / 28)) for k in range(29)] + [(KX + KW / 2 * math.cos(math.pi * k / 12), KY + KB * math.sin(math.pi * k / 12)) for k in range(1, 12)]
    P["rims_top"].append(twin("kippah", f'<g class="kippahpose"><g transform="rotate({KR} {KX} {KY})">' + rim(sc(kdome, 0.45), 2.6) + '</g></g>'))
    # The payot hang from his temples: each starts at the outer corner of an eye and follows the EDGE of his face down
    # (out round the cheek, in again toward the chin), lying on its line, to below the corner of his mouth. Beside the
    # face, plumb, they were two springs floating in the air (the operator: "sideburns ... not good enough").
    def ringlet_on(axis, y0, y1, turns, r0, r1, w0, w1, phase, lw=1.5, root=0.10, tip=0.14):
        T = 2 * math.pi * turns; n = max(8, int(30 * turns)); pts = []
        for i in range(n + 1):
            u = i / n; t = T * u; y = y0 + (y1 - y0) * u
            r = r0 + (r1 - r0) * u; w = w0 + (w1 - w0) * u
            if u < root: w *= 0.4 + 0.6 * (u / root)
            if u > 1 - tip: w *= max(0.12, (1 - u) / tip)
            pts.append((axis(y) + r * math.sin(t + phase), y, w, math.cos(t + phase) > 0))
        runs, cur = [], [pts[0]]
        for q in pts[1:]:
            cur.append(q)
            if q[3] != cur[0][3] or q is pts[-1]:
                runs.append(cur); cur = [q]
        back, front = [], []
        for run in runs:
            k = len(run); fr = sum(1 for q in run if q[3]) > k / 2
            Lp, Rp = [], []
            for i, (x, y, w, _) in enumerate(run):
                xa, ya = run[max(i - 1, 0)][:2]; xb, yb = run[min(i + 1, k - 1)][:2]
                dx, dy = xb - xa, yb - ya; m = math.hypot(dx, dy) or 1
                nx, ny = -dy / m, dx / m
                Lp.append((x + nx * w / 2, y + ny * w / 2)); Rp.append((x - nx * w / 2, y - ny * w / 2))
            body = so(Lp, 0.5) + " L" + so(Rp[::-1], 0.5)[1:] + " Z"
            o = [path(body, C.HAIR, "none", 0)]
            if not fr: o.append(path(body, INK, "none", 0, 'opacity="0.26"'))
            else:
                hl = [(a[0] * 0.62 + b[0] * 0.38, a[1] * 0.62 + b[1] * 0.38) for a, b in zip(Lp, Rp)][max(1, k // 6):k - max(1, k // 6)]
                if len(hl) > 2: o.append(path(so(hl, 0.5), "none", C.STRAND, lw * 0.9))
            o += [path(so(Lp, 0.5), "none", INK, lw), path(so(Rp, 0.5), "none", INK, lw)]
            (front if fr else back).append("".join(o))
        centre = [(axis(y0 + (y1 - y0) * (0.04 + 0.82 * i / 60)), y0 + (y1 - y0) * (0.04 + 0.82 * i / 60)) for i in range(61)]
        return back + front, centre
    def along(edge):
        """x of a face edge at height y, through the given (y, x) points."""
        def f(y):
            if y <= edge[0][0]: return edge[0][1]
            for (ya, xa), (yb, xb) in zip(edge, edge[1:]):
                if y <= yb:
                    u = (y - ya) / (yb - ya); u = u * u * (3 - 2 * u)
                    return xa + (xb - xa) * u
            return edge[-1][1]
        return f
    EDGE_L = along([(60, 53.5), (66, 47.5), (72, 44.6), (78, 45.4), (84, 42.6), (90, 42.2), (96, 43.8), (102, 47.5), (108, 51.5), (114, 54.0)])
    EDGE_R = along([(70, 148.5), (76, 153.0), (82, 156.6), (88, 156.2), (94, 154.6), (100, 151.0), (106, 146.5), (112, 142.5), (118, 140.0)])
    payL, cL = ringlet_on(EDGE_L, 60.0, 113.0, 5.0, 3.3, 2.7, 6.4, 4.8, 0.5)
    payR, cR = ringlet_on(EDGE_R, 70.0, 117.0, 4.4, 3.3, 2.7, 6.4, 4.8, 0.5 + math.pi)
    P["head_end"].append(grp("payot", payL + payR))
    # (no pale edge round them: the operator, "theres like a white outline around the sideburns get rid of that")
    # the Star of David on a short silver chain: at his throat, over the place where his neck and arms meet (the
    # operator: on a long chain it hung down his stick like a tag), and over a cloak
    SX, SY, SR = 100.0, 126.0, 9.2
    chain = so([(92.0, 110.8), (94.0, 114.5), (97.5, 116.6), (SX, SY - SR - 0.6)], 0.5) + " " + so([(SX, SY - SR - 0.6), (102.5, 116.6), (106.0, 114.5), (108.0, 110.8)], 0.5).split(" ", 1)[1]
    ds = [path(chain, "none", INK, 2.3), path(chain, "none", C.SILVER, 1.25), path(chain, "none", C.SILVER2, 0.7, 'stroke-dasharray="1.3 0.8"')]
    ds += C.interlaced_star(SX, SY, SR, 2.5, 0.9, INK, C.SILVER, C.SILVER2, C.ISRAEL)
    P["over_arms"].append(grp("davidstar", ds))
    P["rims_top"].append(twin("davidstar", rim(chain, 2.3) + rim(sc(C.star_outline(SX, SY, SR + 0.4), 0.0), 0.9)))

    # ------------------------------------------------------------------ the keffiyeh (Habibi pack): the shemagh round the face, the agal across it, its ends on the shoulders
    # A hood of cloth: over the top down to the brows (its edge runs along just above them and close down both sides of
    # the face, so nothing shows between the cloth and the face: a thin band standing off it read as headphones), the agal
    # across the forehead, and the cloth falling wide behind the face onto the shoulders.
    # One cloth: its two sides run on down past the face and fall onto the shoulders, widening a little, to a knotted
    # fringe (as separate pieces behind the face they read as ear muffs).
    OUTER = [(40, 141.5), (29.5, 136), (25.5, 122), (27, 104), (28.5, 86), (32, 64), (42, 45.5), (58, 32), (79, 24.5), (100, 22.5), (121, 24), (141, 30), (157, 41.5), (167.5, 59), (171.5, 82), (173, 104), (174.5, 122), (170.5, 136), (160, 141.5)]
    INNER = [(149.5, 139), (153, 128), (158.5, 117), (162, 104), (162.5, 90), (160.5, 78), (157, 69.5), (151, 63.5), (142, 60.5), (130, 59.5), (118, 58.5), (107.5, 57), (99.5, 54), (90, 52), (77.5, 51), (66.5, 52),
             (57.5, 56), (49.5, 63), (44, 72), (41.4, 84), (41, 104), (44.5, 117), (49.5, 128), (52.5, 139)]
    outer_s = HB.smooth_pts(OUTER, 6); inner_s = HB.smooth_pts(INNER, 6)
    front_d = poly(outer_s + inner_s)
    # (r3kfopen: the face's opening in the hood; under it the emo hair shows only there, r3tards.css)
    KFD = 'transform="translate(0 3.4)"'       # the whole cloth sits this much lower (the operator: "needs to sit a bit lower just slightly")
    P["defs"].append(HB.shemagh_pattern("r3kfpat", 5.6, 0.9, 1.7) + f'<clipPath id="r3kfclip"><path d="{front_d}"/></clipPath>'
                     + f'<clipPath id="r3kfopen"><path d="{poly(inner_s)}" {KFD}/></clipPath>')
    ab, af = HB.agal(100.0, 42.5, 60.0, 8.0, 6.8, INK, 1.5, rot=4, back_from=0, back_to=0)
    kf = [path(front_d, HB.KF_WHITE, "none", 0), path(front_d, "url(#r3kfpat)", "none", 0), '<g clip-path="url(#r3kfclip)">',
          path(sc([(27, 64), (46, 44), (56, 62), (46, 142), (25, 142)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.13"'),
          path(sc([(173, 64), (154, 44), (146, 58), (156, 142), (175, 142)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.09"'),
          path(HB.band_d(HB.offset_open(inner_s, -2.6), 2.4), HB.KF_RED, "none", 0)]
    for crease in ([(33, 100), (32, 118), (36, 136)], [(40, 104), (41, 120), (45, 138)], [(167, 100), (168, 118), (164, 136)], [(160, 104), (159, 120), (155, 138)]):
        kf.append(path(so(crease, 0.5), "none", HB.KF_RED2, 0.9, 'opacity="0.4"'))
    kf += af
    kf += ['</g>', path(poly(outer_s + inner_s), "none", INK, ILW)]
    kf += HB.tassels([(41, 141), (46.5, 140.5), (52, 139)], 3, 6.0, INK, 0.9, 19) + HB.tassels([(148, 139), (153.5, 140.5), (159, 141)], 3, 6.0, INK, 0.9, 23)
    P["post_a"].append(grp("keffiyeh", [f'<g {KFD}>'] + kf + ['</g>']))
    P["rims_top"].append(twin("keffiyeh", f'<g {KFD}>' + rim(front_d) + '</g>'))

    # ------------------------------------------------------------------ the pumpkin: worn whole over the face, on the stick like a scarecrow's; its carvings are real holes
    LOBES = ((57.0, 81.0, 25.0, 43.0, C.PUMPKIN3), (143.0, 81.0, 25.0, 43.0, C.PUMPKIN3), (78.0, 80.5, 30.0, 48.0, C.PUMPKIN), (122.0, 80.5, 30.0, 48.0, C.PUMPKIN), (100.0, 80.0, 32.0, 50.0, C.PUMPKIN))
    eyeL = sc([(53, 71), (60, 60), (78, 56.5), (93, 60), (96.5, 71), (93, 80.5), (74, 84), (58, 80.5)], 0.45)
    eyeR = sc([(103.5, 72), (107, 64), (122, 61.5), (139, 64), (148.5, 74.5), (142, 84.5), (122, 87), (107, 83)], 0.45)
    grin = poly([(55, 89), (65, 93.5), (71, 87.5), (80, 95), (90, 90.5), (100, 96.5), (110, 92), (120, 97.5), (130, 90.5), (138, 95), (146, 87),
                 (143, 99), (131, 105.5), (117, 103), (104, 108.5), (92, 104), (80, 107.5), (66, 101)])
    holes = [eyeL, eyeR, grin]
    lobes_e = "".join(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"/>' for cx, cy, rx, ry, _ in LOBES)
    P["defs"].append('<mask id="r3pkmask" maskUnits="userSpaceOnUse" x="20" y="10" width="160" height="130"><rect x="20" y="10" width="160" height="130" fill="#FFFFFF"/>'
                     + "".join(f'<path d="{d}" fill="#000000"/>' for d in holes) + '</mask>'
                     + f'<clipPath id="r3pkclip">{lobes_e}</clipPath>'
                     + '<clipPath id="r3pkholes">' + "".join(f'<path d="{d}"/>' for d in holes) + '</clipPath>')
    pk = ['<g mask="url(#r3pkmask)">'] + [ellipse(cx, cy, rx, ry, f, INK, 2.7) for cx, cy, rx, ry, f in LOBES]
    pk += [path("M100,31 Q95,80 100,129", "none", C.PUMPKIN2, 2.6, 'opacity="0.45"'), ellipse(66, 50, 9, 3.8, "#FFFFFF", "none", 0, 'opacity="0.22" transform="rotate(-38 66 50)"'), '</g>',
           '<g clip-path="url(#r3pkholes)">'] + [path(d, "none", "#1E0D05", 8, 'opacity="0.3"') for d in holes] + [path(d, "none", C.PUMPKIN2, 4) for d in holes] + ['</g>']
    pk += [path(d, "none", INK, 2.3) for d in holes]
    stem = sc([(95, 32), (93, 23), (96, 14), (104, 12), (107, 22), (106, 32)], 0.4)
    pk += [path(stem, C.MOSS, INK, 2.5), path("M106,22 Q118,12 124,22 Q126,31 119,30", "none", C.MOSS, 2.0), path("M104,25 Q116,14 127,20 Q118,29 106,29 Z", C.GREEN, INK, 1.6)]
    P["post_b"].insert(0, grp("pumpkin", pk))
    # the inside of the pumpkin, behind the face: dark, so the holes show his eyes and lips in the hollow (he has no skin,
    # and the room showed through between his lids); a twin of the pumpkin, so it moves, fades and shows with it
    P["pre_head"].append('<g id="pumpkinin" data-twin="pumpkin" display="none">' + "".join(path(d, "#2A1206", "none", 0) for d in holes) + '</g>')
    P["rims_top"].append(twin("pumpkin", "".join(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{RIM}" stroke-width="{2.7 + RIMW:.2f}"/>' for cx, cy, rx, ry, _ in LOBES) + rim(stem, 2.5)))
    # ------------------------------------------------------------------ the emo pack (DEV only until it is an item; /emopack)
    import emo as EM
    # The beanie: a black knit slouch beanie over the top of the head he has not got, seated on the line over his eyes like
    # his other hats (his brows go under it: r3tards.css): its ribbed cuff along that line with a broken-heart patch, the knit
    # rising well over where his head would be and slouching over to our left, a fold where it bends; under it his emo hair
    # in BLACK, pointed locks over his right eye (they stop above his lips) and a few at the other side.
    UP = []
    for i, (x, y) in enumerate(over_s):
        x0, y0 = over_s[max(i - 1, 0)]; x1, y1 = over_s[min(i + 1, len(over_s) - 1)]
        tx, ty = x1 - x0, y1 - y0; m = math.hypot(tx, ty) or 1.0
        UP.append((x + ty / m * 11.0, y - tx / m * 11.0))
    knit = HB.smooth_pts([(HEAD_L[0] - 2.0, HEAD_L[1] - 11.0), (39.0, 44.0), (37.5, 32.0), (42.0, 20.0), (52.0, 10.0), (66.0, 3.5), (83.0, 0.5), (100.0, 0.5),
                          (116.0, 3.0), (130.0, 8.5), (142.0, 17.0), (150.5, 28.5), (155.0, 42.0), (157.0, 56.0), (HEAD_R[0] + 1.0, HEAD_R[1] - 11.0)], 6)
    bn_d = poly([HEAD_L] + knit + [HEAD_R] + over_s[::-1])
    cuff_d = poly([HEAD_L] + over_s + [HEAD_R] + [(HEAD_R[0] + 2.0, HEAD_R[1] - 11.0)] + UP[::-1] + [(HEAD_L[0] - 2.0, HEAD_L[1] - 11.0)])
    bhair_d = sc([(98.0, 57.0), (126.0, 58.5), (150.0, 62.0), (159.0, 66.0), (160.5, 74.0), (157.0, 85.0), (151.5, 80.0), (145.5, 86.0), (139.5, 80.0), (133.0, 86.0),
                  (127.0, 80.0), (121.0, 85.0), (115.5, 79.0), (109.0, 82.0), (104.5, 74.0), (100.5, 63.0)], 0.32)
    bhairl_d = sc([(44.0, 60.0), (42.0, 72.0), (47.5, 65.0), (51.0, 70.5), (54.0, 62.0), (52.0, 58.0)], 0.32)
    P["defs"].append(f'<clipPath id="r3bnclip"><path d="{bn_d}"/></clipPath><clipPath id="r3bncuffclip"><path d="{cuff_d}"/></clipPath>'
                     f'<clipPath id="r3bnhair"><path d="{bhair_d}"/></clipPath>')
    bh = [path(bhairl_d, EM.HAIRB, INK, 2.7), path(bhair_d, EM.HAIRB, INK, 2.7), '<g clip-path="url(#r3bnhair)">']
    for (x0, y0, x1, y1, bend) in ((112, 60, 113, 76, -1.5), (124, 60, 125, 80, -1.5), (136, 62, 137, 81, -1.5), (148, 64, 149, 81, -1.0)):
        bh.append(path(so([(x0, y0), ((x0 + x1) / 2 + bend, (y0 + y1) / 2), (x1, y1)]), "none", EM.HAIRB2, 1.5))
    bh.append('</g>')
    bn = bh + [path(bn_d, EM.KNIT, "none", 0), '<g clip-path="url(#r3bnclip)">',
               path(sc([(78, 5), (94, 1.5), (114, 2.5), (128, 6), (114, 5.5), (96, 5), (82, 7.5)], 0.5), EM.KNIT2, "none", 0, 'opacity="0.5"')]
    bn += EM.knit_ribs(UP, knit, 19, 1.1, reach=0.9, bow=0.05)
    # (no crease line along the slouch: the operator wants only the knit's ribs on it)
    bn += ['</g>', path(cuff_d, EM.KNIT, "none", 0), '<g clip-path="url(#r3bncuffclip)">',
           path(so([(x * 0.14 + ux * 0.86, y * 0.14 + uy * 0.86) for (x, y), (ux, uy) in zip(over_s, UP)]), "none", EM.KNITD, 3.0, 'opacity="0.9"')]
    bn += EM.cuff_ribs(over_s, UP, 3.4)
    bn += ['</g>', path("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in UP), "none", INK, 1.4), path(bn_d, "none", INK, ILW)]
    bn += EM.broken_heart(70.0, 50.5, 12.0, rot=-8, lw=1.1)
    P["post_a"].append(grp("beanie", bn))
    P["rims_top"].append(twin("beanie", rim(bn_d) + rim(bhair_d, 2.7) + rim(bhairl_d, 2.7)))

    # The emo clothes on him are only his shoes (the operator: "just give him shoes with the checkered pattern not the hoodie
    # thing"): a black-and-white checkered slip-on at the end of each leg, its sole on the floor, toe pointing out to his
    # side, a white rubber sole, its pale edge in the leg's twin so his outline runs round it.
    P["defs"].append(EM.checker_pattern("r3emocheck", 2.6, 0))
    FLOOR_Y = LEG_L[-1][1] + 1.5
    for gid, where, rimkey, (ax_, _ay), out_ in (("emofitfootL", "footL", "rim_footL", LEG_L[-1], -1), ("emofitfootR", "footR", "rim_footR", LEG_R[-1], 1)):
        F = lambda x, y: (ax_ + out_ * x, FLOOR_Y + y)
        shoe = [F(-6.5, -1.0), F(-7.0, -5.0), F(-4.5, -8.2), F(0.5, -8.6), F(5.0, -7.0), F(10.0, -5.2), F(13.5, -3.6), F(14.5, -1.0), F(13.0, 0.6), F(-5.5, 0.6)]
        sd = sc(shoe, 0.35)
        sole = poly([F(-7.5, -2.2), F(15.0, -2.2), F(15.0, 1.0), F(-7.5, 1.0)])
        cid = "r3shoeclip" + gid[-1]
        P["defs"].append(f'<clipPath id="{cid}"><path d="{sd}"/></clipPath>')
        P[where].append(grp(gid, [path(sd, "url(#r3emocheck)", "none", 0), f'<g clip-path="url(#{cid})">', path(sole, EM.CHECKW, "none", 0),
                                  path(so([F(-7.0, -2.2), F(15.0, -2.2)]), "none", INK, 1.0), '</g>',
                                  path(so([F(-3.6, -6.6), F(1.0, -7.2), F(5.0, -5.8)]), "none", INK, 1.8), path(sd, "none", INK, 2.2)], "emofit"))
        P[rimkey].append(twin(gid, rim(sd, 2.2)))

    # The wristbands: a purple sweatband with a white stripe round each stick arm near the hand.
    for gid, where, rimkey, limb in (("wristL", "legL", "rim_legL", ARM_L), ("wristR", "legR", "rim_legR", ARM_R)):
        c, L, Rr = tube(limb, 7.4, 7.4, 0.74, 0.88)
        d = poly(L + Rr[::-1])
        mi = len(c) // 2; (mx, my) = c[mi]; ax_, ay_ = c[max(mi - 2, 0)]; bx_, by_ = c[min(mi + 2, len(c) - 1)]
        tx, ty = bx_ - ax_, by_ - ay_; m = math.hypot(tx, ty) or 1; nx, ny = -ty / m, tx / m
        stripe = f"M{mx + nx * 2.6:.1f},{my + ny * 2.6:.1f} L{mx - nx * 2.6:.1f},{my - ny * 2.6:.1f}"
        P[where].append(grp(gid, [path(d, EM.BAND, INK, 1.6), path(stripe, "none", EM.BAND2, 2.2)]))
        P[rimkey].append(twin(gid, rim(d, 1.6)))
    return P
