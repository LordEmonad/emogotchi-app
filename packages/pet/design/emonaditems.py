"""The shop's wearables drawn on Emonad as a pet (LAB ONLY): emonadgotchi.py's build() places them.

He is a tall figure with a huge mop of purple hair that hangs over the tops of his shoulders, a black tee, black skinny
trousers, purple sneakers, and purple wristbands of his own. So:
  - what goes on a head sits on top of the HAIR (the witch hat's brim, the kippah, the beanie's cuff, the crown), or over
    all of it (the pumpkin, worn whole over the head with the ends of his hair hanging out under it; the keffiyeh's cloth
    over the whole mop, his fringe showing in its face opening);
  - what goes on a body goes over his tee and trousers (the mummy's bandages, the bisht's cloak, the witch's cape behind
    him), and on his arms (his skin: bandages, stitches, the emo fit's striped sleeves);
  - the emo hair and the wristbands are his own look already: nothing is drawn for them (items.ts would leave him out of
    them, like the cat).
Pieces use the other pets' own colours wherever pet.css already turns them gold (crowned) or pale (a ghost) by attribute;
where a piece is a twin (data-twin, so it shows with its part) or is shown by a class the rig puts on the svg, his own
css (apps/web/src/emonadgotchi/emonadgotchi.css) does it.

Most of it is drawn in view units (x 100 + 0.3 X, y 212 + 0.3 Y from his drawing's units); what has to follow his traced
silhouettes (the bandages, the sleeves, the slip-ons) is drawn in his drawing's units inside U(), clipped to them.

make(K) returns the pieces by where they go.
"""
import math, re
import cat as C
import habibi as HB
import emo as EM

ILW = 0.8          # the items' line: about his own (0.69 at his size), a hair bolder so small things read
CLOTH = "#281828"  # the witch's dark cloth (pet.css turns it gold by this fill)

def make(K):
    U, part, by_id, own, SKIN, INK = K["U"], K["part"], K["by_id"], K["own"], K["SKIN"], K["INK"]
    P = {k: [] for k in ("defs", "behind", "thighL", "thighR", "shinL", "shinR", "neck", "body_under", "body", "upperL", "upperR",
                         "sleeveL", "sleeveR", "foreL", "foreR", "elbowL", "elbowR", "over_arms", "head_back", "head_under", "face_skin",
                         "face", "head_mid", "head_end", "post_a", "post_b", "carried")}
    path, ellipse, poly, sc, so = C.path, C.ellipse, C.poly, C.smooth_closed, C.smooth_open
    def grp(i, inner, cls="", extra=""):
        return f'<g id="{i}"{f" class=\"{cls}\"" if cls else ""} display="none"{(" " + extra) if extra else ""}>' + "".join(inner) + '</g>'
    def twin(i, of, inner, cls=""):
        return f'<g id="{i}" data-twin="{of}"{f" class=\"{cls}\"" if cls else ""} display="none">' + "".join(inner) + '</g>'
    def shown(cls, inner):
        """A piece shown by his css when the rig says it is worn (a class on the svg): for what has to sit inside a group
        the rig moves (the head) and so cannot carry an id the rig also moves."""
        return f'<g class="{cls}">' + "".join(inner) + '</g>'
    def first_d(markup, fill=None):
        for m in re.finditer(r'<path[^>]*?/>', markup):
            t = m.group(0)
            if fill and f'fill="{fill}"' not in t: continue
            return re.search(r' d="([^"]+)"', t).group(1)
        raise KeyError(fill)
    def all_d(markup, fill):
        return [re.search(r' d="([^"]+)"', m.group(0)).group(1) for m in re.finditer(r'<path[^>]*?/>', markup) if f'fill="{fill}"' in m.group(0)]

    # ---- his silhouettes, in his drawing's units (the clips the bandages and sleeves are cut to) ----
    FACE_D = first_d(own(part("face")), SKIN)
    NECK_D = first_d(own(part("neck")), SKIN)
    TORSO_D = first_d(part("torso"))
    ARM_D = {s: first_d(own(by_id(f"emonad-front-arm{s}-art")), SKIN) for s in "LR"}
    THIGH_D = {s: first_d(part(f"thigh{s}"), "#000000") for s in "LR"}
    SHIN_D = {s: re.findall(r'clip-path="url\(#emonad-front-shin%s-kc\)"><path fill="#000000" fill-rule="evenodd" d="([^"]+)"' % s, part(f"shin{s}"))[0] for s in "LR"}
    SHOE = {s: part(f"shoe{s}") for s in "LR"}
    P["defs"].append(f'<clipPath id="egface"><path d="{FACE_D}"/></clipPath><clipPath id="egneck"><path d="{NECK_D}"/></clipPath>'
                     f'<clipPath id="egtorso"><path d="{TORSO_D}"/></clipPath>'
                     + "".join(f'<clipPath id="egarm{s}"><path d="{ARM_D[s]}"/></clipPath><clipPath id="egthigh{s}"><path d="{THIGH_D[s]}"/></clipPath>'
                               f'<clipPath id="egshin{s}"><path d="{SHIN_D[s]}"/></clipPath>' for s in "LR"))
    # where his arms bend and end (his units): the elbow, the wristband's top, the sleeve's bottom
    ELBOW = {"L": (-63.38, -330.0), "R": (61.5, -330.0)}
    WRIST_TOP = -262.0; SLEEVE_BOT = -352.0
    # the elbow's cut, square to the arm (the forearm's own clip, emonadgotchi.py arm())
    def below_elbow(s):
        ex, ey = ELBOW[s]; return f"M{ex - 60} {ey - 0.04 * 60 * (1 if s == 'L' else -1)}L{ex + 60} {ey + 0.04 * 60 * (1 if s == 'L' else -1)}L{ex + 60} 60L{ex - 60} 60Z"
    def above_elbow(s):
        ex, ey = ELBOW[s]; return f"M{ex - 60} {ey - 0.04 * 60 * (1 if s == 'L' else -1)}L{ex + 60} {ey + 0.04 * 60 * (1 if s == 'L' else -1)}L{ex + 60} -600L{ex - 60} -600Z"
    P["defs"].append("".join(f'<clipPath id="egarmup{s}"><path d="{above_elbow(s)}"/></clipPath><clipPath id="egarmlo{s}"><path d="{below_elbow(s)}"/></clipPath>' for s in "LR"))

    # strips wound round a part, in his units: constant-width bands across it at a slant, each with a crease, clipped to it
    def bands(clip, ys, x0, x1, w, slant, fill=C.LINEN, line=C.LINEN2, lw=2.2, extra_clip=None):
        out = [f'<g clip-path="url(#{clip})">'] + ([f'<g clip-path="url(#{extra_clip})">'] if extra_clip else [])
        for i, y in enumerate(ys):
            s = slant * (1 if i % 2 == 0 else -0.7)
            a = (x0, y - s); b = (x1, y + s)
            nx, ny = 0, 1
            d = poly([(a[0], a[1] - w / 2), (b[0], b[1] - w / 2), (b[0], b[1] + w / 2), (a[0], a[1] + w / 2)])
            out.append(path(d, fill, INK, lw))
            out.append(path(f"M{a[0]:.1f},{a[1] + w * 0.12:.1f} L{b[0]:.1f},{b[1] + w * 0.12:.1f}", "none", line, lw * 1.1))
        out += ['</g>'] * (2 if extra_clip else 1)
        return "".join(out)

    # ================================================================== the witch: hat, cape, collar and clasp
    # The hat sits on the crown of his hair: its brim across the mop where the mop is as wide as the brim's middle, the
    # cone over the hair's top (whatever of the mop stands over the brim is under the cone or cut off by his css), the tip
    # bent back over to our right.
    BX, BY = 100.4, 32.0
    brim = sc([(69.5, 33.5), (75, 29.4), (86, 27.4), (100.4, 26.8), (115, 27.4), (126, 29.4), (131.5, 33.5), (127, 37.6), (115, 39.6), (100.4, 40.2), (86, 39.6), (74, 37.6)], 0.5)
    cone = sc([(84.0, 33.0), (86.5, 22.0), (90.5, 10.0), (96.0, -1.0), (103.0, -9.0), (111.0, -13.5), (118.5, -13.0), (123.5, -9.5), (125.5, -5.5),
               (122.5, -6.0), (118.0, -8.5), (112.5, -6.5), (110.5, 0.0), (112.0, 12.0), (115.5, 24.0), (117.5, 33.0), (100.4, 35.5)], 0.5)
    hat = [path(brim, C.HAIR, INK, ILW * 1.1), path("M73,34.6 Q100.4,30.8 128,34.6", "none", C.STRAND, 0.7, 'opacity="0.65"'),
           ellipse(100.4, 34.2, 16.5, 2.0, CLOTH, "none", 0, 'opacity="0.35"'), path(cone, CLOTH, INK, ILW * 1.1),
           path("M112,-10.5 Q116.5,-12.5 121,-11.2", "none", INK, 0.6, 'opacity="0.35"'), path("M89,26 Q92,13 98,3", "none", C.LAV, 0.8, 'opacity="0.22"'),
           path(sc([(84.2, 33.0), (85.2, 27.8), (100.4, 30.0), (116.6, 27.8), (117.6, 33.0), (100.4, 35.5)], 0.45), INK, INK, 0.7)]
    hat += [f'<circle cx="{x}" cy="{y}" r="0.9" fill="{C.LAV}"/>' for x, y in ((89, 31.6), (93, 32.6), (108, 32.6), (112, 31.6))]
    hat += [path("M97.6,29.6 L103.2,29.4 L103.4,34.6 L97.8,34.8 Z", "none", INK, 2.0), path("M97.6,29.6 L103.2,29.4 L103.4,34.6 L97.8,34.8 Z", "none", C.GOLD, 1.1),
            ellipse(100.5, 32.1, 1.25, 1.1, C.RUBY, INK, 0.5), '<circle cx="100.1" cy="31.7" r="0.35" fill="#FFFFFF"/>']
    # (the whole hat sits this much lower: on his head, its brim at his forehead, the mop flaring out under it; perched on
    # top of the hair it read as balanced there)
    HD = 8.0
    P["post_b"].append(grp("witchhat", [f'<g transform="translate(0 {HD})">'] + hat + ['</g>']))
    # (under the hat his hair shows only below the brim's top edge: emonadgotchi.css cuts the rest along it)
    top_edge = [(69.5, 33.5), (75, 29.4), (86, 27.4), (100.4, 26.8), (115, 27.4), (126, 29.4), (131.5, 33.5)]
    te = HB.smooth_pts([(x, y + HD + 1.2) for x, y in top_edge], 6)
    P["defs"].append(f'<clipPath id="egunderhat"><path d="{poly([(0, te[0][1])] + te + [(200, te[-1][1]), (200, 240), (0, 240)])}"/></clipPath>')
    # The cape: behind him from his shoulders to his calves, dark cloth with a broad edge and the purple lining toward us
    # (a witch's hem of points); its collar's two flaps and the clasp at his throat, between the locks of his hair.
    def cape(hem):
        L = [(94.5, 85.5), (86.5, 88.5), (79.5, 96), (75, 116), (71.5, 140), (68.5, 164), (66.5, 180)]
        R = [(133.5, 180), (131.5, 164), (128.5, 140), (125, 116), (120.5, 96), (113.5, 88.5), (105.5, 85.5)]
        return L + hem + R
    def inset(pts, by, cx=100.0, cy=130.0):
        out = []
        for x, y in pts:
            dx, dy = x - cx, y - cy; m = math.hypot(dx, dy) or 1.0
            out.append((x - dx / m * by, y - dy / m * by * 0.55))
        return out
    WHEM = [(70, 186), (76, 180.5), (82.5, 187), (89, 181), (95.5, 187.5), (100, 182), (104.5, 187.5), (111, 181), (117.5, 187), (124, 180.5), (130, 186)]
    cape_pts = cape(WHEM); robe_d = sc(cape_pts, 0.3); lining_d = sc(inset(cape_pts, 2.6), 0.3)
    P["defs"].append(f'<clipPath id="egrobeclip"><path d="{lining_d}"/></clipPath>')
    def star4(x, y, r, fill=C.LAV):
        return path(poly([(x, y - r), (x + r * 0.28, y - r * 0.28), (x + r, y), (x + r * 0.28, y + r * 0.28), (x, y + r), (x - r * 0.28, y + r * 0.28), (x - r, y), (x - r * 0.28, y - r * 0.28)]), fill, "none", 0)
    robe = [path(robe_d, CLOTH, "none", 0), path(lining_d, C.STRAND, "none", 0), '<g clip-path="url(#egrobeclip)">']
    robe += [path(so(f, 0.5), "none", C.HAIR, 1.0, 'opacity="0.55"') for f in ([(88, 100), (80, 140), (74, 178)], [(112, 100), (120, 140), (126, 178)], [(95, 104), (92, 146), (90, 182)], [(105, 104), (108, 146), (110, 182)])]
    robe += [star4(x, y, r) for x, y, r in ((79, 130, 1.4), (121, 152, 1.3), (84, 166, 1.0), (118, 120, 1.0), (124, 172, 0.9), (76.5, 156, 0.9))]
    robe += ['</g>', path(lining_d, "none", INK, 0.7, 'opacity="0.55"'), path(robe_d, "none", INK, ILW)]
    P["behind"].append(grp("robeback", robe, "robe"))
    yoke = [path(sc([(99.4, 85.2), (93.2, 85.6), (95.0, 91.6), (99.6, 89.0)], 0.25), C.PURPLE, INK, 0.7),
            path(sc([(101.0, 85.2), (107.2, 85.6), (105.4, 91.6), (100.8, 89.0)], 0.25), C.PURPLE, INK, 0.7),
            ellipse(100.2, 88.8, 1.9, 1.7, C.GOLD, INK, 0.6), ellipse(100.2, 88.8, 0.85, 0.75, C.RUBY, INK, 0.3), '<circle cx="99.9" cy="88.5" r="0.28" fill="#FFFFFF"/>']
    P["over_arms"].append(grp("yoke", yoke, "robe"))

    # ================================================================== the pumpkin: worn whole over his head, its carvings real holes
    # Over his face and the top of his hair (the ends of his hair hang out under it to his shoulders); its carved eyes are
    # round his eyes and its grin round his mouth, so they look out of it and every face he pulls reads.
    PCX, PCY = 100.4, 53.0
    LOBES = ((PCX - 21.5, PCY + 1.0, 11.5, 27.0, C.PUMPKIN3), (PCX + 21.5, PCY + 1.0, 11.5, 27.0, C.PUMPKIN3), (PCX - 11.5, PCY + 0.6, 15.0, 29.5, C.PUMPKIN),
             (PCX + 11.5, PCY + 0.6, 15.0, 29.5, C.PUMPKIN), (PCX, PCY, 15.5, 30.5, C.PUMPKIN))
    peyeL = sc([(91.2, 54.8), (93.4, 49.6), (96.4, 48.6), (99.0, 51.2), (99.4, 55.2), (96.6, 57.4), (93.0, 57.2)], 0.45)
    peyeR = sc([(102.0, 55.4), (103.0, 51.0), (106.2, 49.6), (109.6, 51.4), (110.4, 55.6), (107.4, 57.8), (104.0, 57.4)], 0.45)
    pgrin = poly([(92.0, 64.4), (94.6, 66.0), (96.2, 64.0), (98.4, 66.6), (100.4, 64.8), (102.4, 66.8), (104.6, 64.4), (106.4, 66.2), (109.0, 64.0),
                  (108.2, 69.0), (105.6, 71.6), (102.6, 70.6), (100.4, 72.4), (98.2, 70.8), (95.2, 72.0), (93.0, 69.2)])
    holes = [peyeL, peyeR, pgrin]
    lobes_e = "".join(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"/>' for cx, cy, rx, ry, _ in LOBES)
    P["defs"].append('<mask id="egpkmask" maskUnits="userSpaceOnUse" x="40" y="0" width="120" height="100"><rect x="40" y="0" width="120" height="100" fill="#FFFFFF"/>'
                     + "".join(f'<path d="{d}" fill="#000000"/>' for d in holes) + '</mask>'
                     # under the pumpkin, all of his head that shows is inside it, or below it (the ends of his hair)
                     + f'<clipPath id="egpkclip">{lobes_e}<rect x="0" y="79.5" width="200" height="60"/></clipPath>'
                     + '<clipPath id="egpkholes">' + "".join(f'<path d="{d}"/>' for d in holes) + '</clipPath>')
    pk = ['<g mask="url(#egpkmask)">'] + [ellipse(cx, cy, rx, ry, f, INK, ILW * 1.1) for cx, cy, rx, ry, f in LOBES]
    pk += [path(f"M{PCX},{PCY - 29} Q{PCX - 2},{PCY} {PCX},{PCY + 29}", "none", C.PUMPKIN2, 1.0, 'opacity="0.45"'),
           ellipse(PCX - 14, PCY - 15, 4.2, 1.8, "#FFFFFF", "none", 0, f'opacity="0.22" transform="rotate(-38 {PCX - 14} {PCY - 15})"'), '</g>',
           '<g clip-path="url(#egpkholes)">'] + [path(d, "none", "#1E0D05", 3.0, 'opacity="0.35"') for d in holes] + [path(d, "none", C.PUMPKIN2, 1.5) for d in holes] + ['</g>']
    pk += [path(d, "none", INK, 0.8) for d in holes]
    stem = sc([(98.6, 24.0), (98.0, 19.6), (99.4, 15.4), (102.6, 15.0), (103.4, 19.8), (102.6, 24.0)], 0.4)
    pk += [path(stem, C.MOSS, INK, 0.9), path("M103,19.5 Q108,15 110.5,19.5 Q111.4,23.4 108.4,23", "none", C.MOSS, 0.8),
           path("M102.4,20.8 Q107.4,16.4 111.8,19 Q108,23 103,23 Z", C.GREEN, INK, 0.6)]
    P["post_b"].insert(0, grp("pumpkin", pk))

    # ================================================================== the mummy: bandages wound round his face, his neck, his arms, his tee and his legs
    # (in his drawing's units, each set clipped to what it wraps; the eyes and the mouth look out over the face's)
    BW = 13.0
    face_bands = bands("egface", [-540, -526, -512, -498, -484, -470, -456], -40, 45, BW, 4.0)
    # (dark in the gaps between the bands: his eyes look out of the dark)
    dark = f'<path d="{FACE_D}" fill="#2E241C"/>'
    P["face_skin"].append(grp("mummyhead", [U(dark + face_bands)], "mummy"))
    P["neck"].append(twin("mummyneck", "mummyhead", [U(f'<path d="{NECK_D}" fill="#2E241C"/>' + bands("egneck", [-470, -457, -444, -431, -418], -35, 40, 12.5, 3.0))], "mummy"))
    P["body"].append(grp("mummybody", [U(bands("egtorso", [-430, -405, -380, -355, -330, -305, -280, -255, -232], -70, 70, 22.0, 6.0))], "mummy"))
    for s in "LR":
        x0, x1 = (-90, -40) if s == "L" else (40, 90)
        P[f"upper{s}"].append(grp(f"wrap{s}", [U(bands(f"egarm{s}", [-346, -334], x0, x1, 10.0, 2.5, extra_clip=f"egarmup{s}"))], "mummy"))
        P[f"fore{s}"].append(twin(f"wrap{s}fore", f"wrap{s}", [U(bands(f"egarm{s}", [-322, -309, -296, -283, -270, -232, -219, -206], x0, x1, 10.0, 2.5, extra_clip=f"egarmlo{s}"))], "mummy"))
        tx0, tx1 = (-60, 0) if s == "L" else (0, 60)
        P[f"thigh{s}"].append(grp(f"mummyfoot{s}", [U(bands(f"egthigh{s}", [-250, -228, -206, -184, -162], tx0, tx1, 16.0, 4.0))], "mummy"))
        P[f"shin{s}"].append(twin(f"mummyshin{s}", f"mummyfoot{s}", [U(bands(f"egshin{s}", [-140, -118, -96, -74, -56], tx0, tx1, 16.0, 4.0))], "mummy"))

    # ================================================================== the zombie: his css turns his skin a dead green and his eyes yellow
    # Stitched scars across his cheek and his forehead's edge, dark bags under his eyes; his tee torn, green skin through
    # the rips; stitches up one arm and a bitten patch on the other.
    ZSKIN, ZDARK = "#9DB07E", "#5E6E48"
    zh = [U('<g clip-path="url(#egface)">' + ellipse(-15, -521, 10, 3.6, ZDARK, "none", 0, 'opacity="0.55"') + ellipse(19, -517, 10, 3.6, ZDARK, "none", 0, 'opacity="0.55"')
            + ellipse(26, -470, 7, 4.5, ZDARK, "none", 0, 'opacity="0.4"') + ellipse(-8, -458, 5, 3, ZDARK, "none", 0, 'opacity="0.35"') + '</g>')]
    zh += C.stitches((101.8, 59.6), (108.8, 63.2), 3, 1.6, 0.55) + C.stitches((104.0, 47.6), (108.6, 50.4), 2, 1.4, 0.5)
    P["face_skin"].append(grp("zombiehead", zh, "zombie"))
    rips = []
    import random
    rnd = random.Random(7)
    for (cx, cy, w, h, rot) in ((-22, -330, 24, 34, 12), (24, -278, 20, 24, -18), (6, -392, 13, 15, 6)):
        pts = []
        for k in range(22):
            a = 2 * math.pi * k / 22; r = 1.0 + rnd.uniform(-0.22, 0.12) + (0.2 if k % 3 == 0 else 0)
            pts.append((cx + w / 2 * r * math.cos(a), cy + h / 2 * r * math.sin(a)))
        d = poly(pts)
        rips.append(f'<g transform="rotate({rot} {cx} {cy})">' + path(d, ZSKIN, INK, 1.4) + ellipse(cx + w * 0.08, cy + h * 0.12, w * 0.22, h * 0.14, ZDARK, "none", 0, 'opacity="0.45"')
                    + path(f"M{cx - w * 0.3:.1f},{cy - h * 0.1:.1f} Q{cx:.1f},{cy - h * 0.25:.1f} {cx + w * 0.25:.1f},{cy - h * 0.05:.1f}", "none", "#4A2A2A", 1.1, 'opacity="0.6"') + '</g>')
    P["body"].append(grp("zombiebody", [U('<g clip-path="url(#egtorso)">' + "".join(rips) + '</g>')], "zombie"))
    for s in "LR":
        ex, _ = ELBOW[s]
        up = U('<g clip-path="url(#egarm%s)"><g clip-path="url(#egarmup%s)">' % (s, s) + '</g></g>')
        if s == "L":
            st = "".join(C.stitches((ex - 1, -320), (ex + 2, -280), 4, 7.0, 1.6))
            bite = ellipse(ex - 2, -238, 6.5, 4.5, ZDARK, INK, 1.2, 'opacity="0.85"')
            P["foreL"].append(twin("zombieLfore", "zombieL", [U(f'<g clip-path="url(#egarmL)"><g clip-path="url(#egarmloL)">{st}</g></g>')], "zombie"))
            P["upperL"].append(grp("zombieL", [up], "zombie"))
            P["foreL"].append(twin("zombieLbite", "zombieL", [U(f'<g clip-path="url(#egarmL)">{bite}</g>')], "zombie"))
        else:
            st = "".join(C.stitches((ex + 1, -348), (ex - 1, -334), 2, 7.0, 1.6))
            P["upperR"].append(grp("zombieR", [U(f'<g clip-path="url(#egarmR)"><g clip-path="url(#egarmupR)">{st}</g></g>')], "zombie"))

    # ================================================================== the bisht (Habibi pack): the cloak over his shoulders, open down the front, gold at its edges
    # A long cloak of fine warm-black wool, worn open: its back falls from behind his shoulders, out past his arms, to his
    # calves; its two fronts hang from his shoulders down each side of his chest, the gold zari down their open edges; its
    # sleeves are wide, over his arms from the shoulder to the wrist, a gold cuff at each, his hands out of them. The sleeve
    # is in two pieces like his arm: the upper one in the arm (#bishtsleeveL/R, its bottom rounded round the elbow) and the
    # lower one on the forearm (a twin, in front of everything with the forearm), its top a disc round the elbow drawn with
    # no line, so a bent arm is one sleeve with an elbow.
    HEM = 188.0
    def mirror(pts): return [(200 - x, y) for x, y in pts]
    BB = [(84.0, 85.6), (78.4, 87.8), (74.6, 93.0), (72.6, 103.0), (71.6, 124.0), (70.8, 150.0), (70.1, 172.0), (69.6, HEM)]
    back_pts = HB.smooth_pts(BB, 6) + HB.smooth_pts([(69.6, HEM), (84.0, HEM + 1.4), (100.0, HEM + 2.0), (116.0, HEM + 1.4), (130.4, HEM)], 6)[1:-1] + HB.smooth_pts(mirror(BB)[::-1], 6)
    bisht_back = [path(poly(back_pts), HB.BISHT, INK, ILW)]
    bisht_back += HB.sheen([[(77.0, 112.0), (74.6, 140.0), (73.4, 180.0)], [(123.0, 112.0), (125.4, 140.0), (126.6, 180.0)]], 0.9, 0.55)
    bisht_back += HB.sheen([[(94.0, 150.0), (93.6, 168.0), (94.2, 186.0)], [(106.0, 150.0), (106.4, 168.0), (105.8, 186.0)]], 0.7, 0.4)
    P["behind"].append(grp("bishtback", bisht_back, "bisht"))
    # the fronts: from the shoulder beside his neck, along the shoulder, down under the arm to the hem; the open edge in gold
    def front(o):
        X = lambda pts: [(x if o < 0 else 200 - x, y) for x, y in pts]
        outer = X([(95.0, 85.0), (89.0, 85.6), (82.6, 87.0), (77.4, 89.6), (74.4, 95.0), (73.0, 104.0), (72.2, 124.0), (71.4, 150.0), (70.8, 172.0), (70.5, HEM - 0.4)])
        inner = X([(86.2, HEM + 0.6), (86.5, 172.0), (87.3, 150.0), (88.5, 130.0), (90.0, 112.0), (92.0, 98.0), (93.8, 89.0), (95.0, 85.0)])
        ring = HB.smooth_pts(outer, 6) + HB.smooth_pts(inner, 6)[:-1]
        return poly(ring), HB.smooth_pts(inner[::-1], 6), outer, inner
    bf = []
    for o in (-1, 1):
        d, edge, outer, inner = front(o)
        bf.append(path(d, HB.BISHT, INK, ILW))
        sx = lambda x: x if o < 0 else 200 - x
        bf += HB.sheen([[(sx(80.0), 112.0), (sx(78.4), 140.0), (sx(77.2), 182.0)], [(sx(84.4), 120.0), (sx(83.6), 150.0), (sx(82.8), 184.0)]], 0.8, 0.5)
        bf += HB.zari(edge, 2.0, INK, 0.4, 1.8, seed=3 if o < 0 else 7)
    P["body"].append(grp("bisht", bf, "bisht"))
    # the sleeves (in view units; ex the elbow, o outward: -1 his right arm, our left)
    ELBOW_V = {"L": (80.99, 113.0), "R": (118.45, 113.0)}
    SR = 8.6                      # the sleeve's half width at the elbow
    def arcpts(cx, cy, r, a0, a1, n=14):
        return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
    for s in "LR":
        ex, ey = ELBOW_V[s]; o = -1 if s == "L" else 1
        X = lambda u, y: (ex + o * u, y)
        side_out = HB.smooth_pts([X(-5.4, 88.6), X(0.0, 86.6), X(5.2, 88.8), X(7.8, 96.0), X(8.6, 106.0), X(SR, ey + 0.5)], 5)
        bottom = arcpts(ex, ey + 0.5, SR, 0, 180) if o > 0 else arcpts(ex, ey + 0.5, SR, 180, 0)
        side_in = HB.smooth_pts([X(-SR, ey + 0.5), X(-8.2, 104.0), X(-7.0, 94.0), X(-5.4, 88.6)], 5)
        up_ring = side_out + bottom[1:-1] + side_in[:-1]
        upper = [path(poly(up_ring), HB.BISHT, INK, ILW)]
        upper += HB.sheen([[X(4.0, 92.0), X(5.6, 104.0), X(5.2, 116.0)]], 0.7, 0.5)
        P[f"sleeve{s}"].append(grp(f"bishtsleeve{s}", upper, "bisht"))
        # the lower sleeve, on the forearm: a disc round the elbow (no line), widening to the cuff just above his wristband
        top = arcpts(ex, ey + 0.5, SR, 180, 360) if o > 0 else arcpts(ex, ey + 0.5, SR, 360, 180)
        cuff_o, cuff_i = X(10.4, 130.0), X(-9.4, 130.0)
        outer_side = HB.smooth_pts([X(SR, ey + 0.5), X(9.4, 120.0), X(10.0, 125.6), cuff_o], 5)
        cuff = HB.smooth_pts([cuff_o, X(0.5, 131.6), cuff_i], 6)
        inner_side = HB.smooth_pts([cuff_i, X(-9.0, 124.0), X(-8.8, 118.0), X(-SR, ey + 0.5)], 5)
        ring = top + outer_side[1:] + cuff[1:] + inner_side[1:-1]
        lo = [path(poly(ring), HB.BISHT, "none", 0)]
        lo += [path(C.smooth_open(outer_side, 0.5) if False else "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in outer_side), "none", INK, ILW),
               path("M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in inner_side), "none", INK, ILW)]
        lo += HB.sheen([[X(5.0, 117.0), X(6.4, 124.0), X(6.8, 128.4)], [X(-4.6, 119.0), X(-5.2, 127.0)]], 0.7, 0.45)
        lo += HB.zari(cuff, 1.9, INK, 0.4, 1.6, seed=11 if s == "L" else 13)
        P[f"fore{s}"].append(twin(f"bishtsleeve{s}fore", f"bishtsleeve{s}", lo, "bisht"))

    # ================================================================== the Jewish pack: the kippah on the crown of his hair, the payot, the Star of David
    KX, KY, KW, KH, KB = 100.8, 26.4, 24.0, 7.0, 1.9
    kd, kp = C.kippah_cap(KX, KY, KW, KH, KB, rot=-3, lw=0.75, clip_id="egkippahclip")
    P["defs"].append(kd)
    P["post_a"].append('<g id="kippah" display="none"><g class="kippahpose">' + "".join(kp) + '</g></g>')
    # the payot: two curls hanging in front of his hair at his temples, beside his face, down past his cheeks
    HAIRC, HAIRS = "#422553", "#6E5180"
    def ringlet(x0, y0, length, turns, r0, r1, w0, w1, phase, lw=0.55, tip=0.14):
        T = 2 * math.pi * turns; n = max(8, int(28 * turns)); pts = []
        for i in range(n + 1):
            u = i / n; t = T * u
            r = r0 + (r1 - r0) * u; w = w0 + (w1 - w0) * u
            if u < 0.1: w *= 0.4 + 0.6 * (u / 0.1)
            if u > 1 - tip: w *= max(0.12, (1 - u) / tip)
            pts.append((x0 + r * math.sin(t + phase), y0 + u * length, w, math.cos(t + phase) > 0))
        runs, cur = [], [pts[0]]
        for q in pts[1:]:
            cur.append(q)
            if q[3] != cur[0][3] or q is pts[-1]: runs.append(cur); cur = [q]
        back, front = [], []
        for run in runs:
            kk = len(run); fr = sum(1 for q in run if q[3]) > kk / 2
            Lp, Rp = [], []
            for i, (x, y, w, _) in enumerate(run):
                xa, ya = run[max(i - 1, 0)][:2]; xb, yb = run[min(i + 1, kk - 1)][:2]
                dx, dy = xb - xa, yb - ya; m = math.hypot(dx, dy) or 1; nx, ny = -dy / m, dx / m
                Lp.append((x + nx * w / 2, y + ny * w / 2)); Rp.append((x - nx * w / 2, y - ny * w / 2))
            body = so(Lp, 0.5) + " L" + so(Rp[::-1], 0.5)[1:] + " Z"
            o = [path(body, HAIRC, "none", 0)]
            if not fr: o.append(path(body, INK, "none", 0, 'opacity="0.3"'))
            else:
                hl = [(a[0] * 0.62 + b[0] * 0.38, a[1] * 0.62 + b[1] * 0.38) for a, b in zip(Lp, Rp)][max(1, kk // 6):kk - max(1, kk // 6)]
                if len(hl) > 2: o.append(path(so(hl, 0.5), "none", HAIRS, lw * 0.9))
            o += [path(so(Lp, 0.5), "none", INK, lw), path(so(Rp, 0.5), "none", INK, lw)]
            (front if fr else back).append("".join(o))
        return back + front
    pay = ringlet(91.0, 52.0, 22.0, 4.2, 1.15, 0.95, 2.1, 1.7, 0.5) + ringlet(111.6, 52.6, 21.0, 4.0, 1.15, 0.95, 2.1, 1.7, 0.5 + math.pi)
    P["head_end"].append(grp("payot", pay))
    # the Star of David on a fine silver chain round his neck, the charm on his chest under his collar
    SX, SY, SR = 100.2, 96.6, 3.4
    chain = so([(94.6, 85.0), (95.4, 88.6), (97.6, 91.6), (SX, SY - SR - 0.3)], 0.5) + " " + so([(SX, SY - SR - 0.3), (102.8, 91.6), (105.0, 88.6), (105.8, 85.0)], 0.5).split(" ", 1)[1]
    ds = [path(chain, "none", INK, 0.85), path(chain, "none", C.SILVER, 0.45)]
    ds += C.interlaced_star(SX, SY, SR, 1.0, 0.35, INK, C.SILVER, C.SILVER2, C.ISRAEL)
    P["over_arms"].append(grp("davidstar", ds))

    # ================================================================== the keffiyeh (Habibi pack): the shemagh over his head, his face in its opening, the agal on top
    # Worn as the other pets wear it: the cloth snug over his head (his mop flattened under it: emonadgotchi.css cuts his
    # hair to the cloth's outline, so all that shows of it is what frames his face in the opening, and his fringe), the
    # agal's doubled black cord round the crown of his head, the cloth falling past his cheeks onto his shoulders, a red
    # fringe of tassels at each end.
    OUTER = [(75.4, 98.6), (77.0, 91.0), (78.8, 81.0), (79.8, 69.0), (80.0, 57.0), (80.4, 47.0), (81.8, 38.5), (85.4, 31.0), (91.6, 26.0), (100.6, 24.0),
             (109.6, 26.0), (115.8, 31.0), (119.4, 38.5), (120.8, 47.0), (121.2, 57.0), (121.4, 69.0), (122.4, 81.0), (124.2, 91.0), (125.8, 98.6)]
    INNER = [(110.4, 98.2), (110.8, 89.0), (112.2, 80.0), (113.4, 70.0), (113.6, 60.0), (113.0, 51.4), (110.6, 46.2), (105.6, 43.6), (100.4, 43.0),
             (95.2, 43.8), (91.4, 46.8), (89.0, 52.0), (88.6, 61.0), (89.0, 71.0), (90.0, 81.0), (91.4, 89.0), (91.6, 98.2)]
    outer_s = HB.smooth_pts(OUTER, 6); inner_s = HB.smooth_pts(INNER, 6)
    cloth_d = poly(outer_s + inner_s)
    P["defs"].append(HB.shemagh_pattern("egkfpat", 3.4, 0.6, 1.1) + f'<clipPath id="egkfclip"><path d="{cloth_d}"/></clipPath>'
                     + f'<clipPath id="egkfopen"><path d="{poly(inner_s)}"/></clipPath>'
                     + f'<clipPath id="egkfout"><path d="{poly(outer_s)}"/></clipPath>')
    kf = [path(cloth_d, HB.KF_WHITE, "none", 0), path(cloth_d, "url(#egkfpat)", "none", 0), '<g clip-path="url(#egkfclip)">',
          # the side away from the light, the shade under the agal, the cloth's fall: folds from the agal to the shoulders
          path(sc([(76, 60), (80, 40), (88, 44), (87.6, 99), (74, 99)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.18"'),
          path(sc([(125, 60), (121, 40), (114, 46), (113.8, 99), (127, 99)], 0.5), HB.KF_SHADE, "none", 0, 'opacity="0.1"'),
          ellipse(100.6, 40.6, 19.0, 2.6, HB.KF_SHADE, "none", 0, 'opacity="0.22"'),
          path(HB.band_d(HB.offset_open(inner_s, -0.9), 0.85), HB.KF_RED, "none", 0)]
    for crease in ([(81.4, 52), (80.6, 70), (78.6, 94)], [(85.4, 50), (85.0, 72), (84.4, 96)], [(119.4, 52), (120.2, 70), (122.2, 94)], [(115.6, 50), (116.4, 72), (117.2, 96)],
                   [(91.0, 28), (88.0, 32.6)], [(110.2, 28), (113.2, 32.6)], [(100.6, 25.6), (100.6, 31.0)]):
        kf.append(path(so(crease, 0.5), "none", HB.KF_SHADE, 0.45, 'opacity="0.4"'))
    kf += ['</g>', path(cloth_d, "none", INK, ILW)]
    kf += HB.tassels([(78.2, 98.5), (82.6, 98.4), (87.0, 98.3)], 3, 2.6, INK, 0.35, 19) + HB.tassels([(114.0, 98.3), (118.4, 98.4), (122.8, 98.5)], 3, 2.6, INK, 0.35, 23)
    P["head_under"].append(shown("egkf", kf))
    # the agal: the doubled black cord round the crown of his head, over the cloth (its back half is behind his head)
    ab, af = HB.agal(100.6, 35.4, 17.8, 4.4, 2.5, INK, 0.5, rot=0, back_from=0, back_to=0)
    P["post_a"].append(grp("keffiyeh", af))

    # ================================================================== the emo pack
    # The beanie: a black knit slouch beanie on top of his hair, its ribbed cuff round the crown of the mop with a pink
    # broken-heart patch, the knit rising over it and slouching back to our right; his own hair all round under it.
    CUFF_LO = [(71.4, 47.0), (80.0, 44.6), (90.0, 43.4), (100.4, 43.0), (111.0, 43.4), (121.0, 44.6), (129.4, 47.0)]
    CUFF_UP = [(72.4, 38.8), (80.6, 36.8), (90.4, 35.6), (100.4, 35.2), (110.6, 35.6), (120.6, 36.8), (128.6, 38.8)]
    knit = HB.smooth_pts([(72.6, 38.8), (72.2, 30.0), (74.8, 21.0), (80.8, 13.4), (89.4, 8.4), (99.4, 6.0), (109.4, 6.4), (118.4, 9.6), (125.4, 14.2), (131.0, 19.6),
                          (134.6, 25.0), (134.2, 28.8), (130.2, 30.0), (128.8, 33.4), (128.4, 38.8)], 6)
    cuff_d = poly(HB.smooth_pts(CUFF_LO, 5) + HB.smooth_pts(CUFF_UP, 5)[::-1])
    bn_d = poly(knit + HB.smooth_pts(CUFF_UP, 5)[::-1])
    P["defs"].append(f'<clipPath id="egbnclip"><path d="{bn_d}"/></clipPath><clipPath id="egbncuff"><path d="{cuff_d}"/></clipPath>')
    up_s = HB.smooth_pts(CUFF_UP, 5); lo_s = HB.smooth_pts(CUFF_LO, 5)
    bn = [path(bn_d, EM.KNIT, "none", 0), '<g clip-path="url(#egbnclip)">',
          path(sc([(90, 9.4), (100, 7.8), (111, 8.8), (119, 11.8), (110, 11.0), (100, 10.4), (92, 12.0)], 0.5), EM.KNIT2, "none", 0, 'opacity="0.55"')]
    bn += EM.knit_ribs(up_s, knit[1:-1], 17, 0.45, reach=0.92, bow=0.05)
    bn += ['</g>', path(bn_d, "none", INK, ILW), path(cuff_d, EM.KNIT, "none", 0), '<g clip-path="url(#egbncuff)">',
           path(so([(x * 0.18 + ux * 0.82, y * 0.18 + uy * 0.82) for (x, y), (ux, uy) in zip(lo_s, up_s)]), "none", EM.KNITD, 1.2, 'opacity="0.9"')]
    bn += EM.cuff_ribs(lo_s, up_s, 1.6, 0.45)
    bn += ['</g>', path(so(up_s), "none", INK, 0.55), path(cuff_d, "none", INK, ILW)]
    bn += EM.broken_heart(82.4, 41.2, 5.0, rot=-8, lw=0.45)
    P["post_a"].append(grp("beanie", bn))

    # The emo fit on him: a pink broken heart on his tee (a band tee now), a studded belt showing under its hem, striped
    # sleeves of a long-sleeve under the tee down to his own wristbands, and black-and-white checkered slip-ons.
    fit = EM.broken_heart(100.4, 106.0, 9.0, lw=0.55)
    P["body"].append(grp("emofit", fit, "emofit"))
    belt = [path("M83.4,141.4 L116.8,141.4 L116.8,145.6 L83.4,145.6 Z", "#16121A", INK, 0.5)]
    belt += [f'<circle cx="{x:.1f}" cy="143.5" r="0.62" fill="{EM.STUD}" stroke="{INK}" stroke-width="0.2"/>' for x in [85.4 + 2.6 * i for i in range(12)]]
    belt += [path("M98.2,141.9 L102.4,141.9 L102.4,145.1 L98.2,145.1 Z", "none", EM.STUD, 0.55)]
    P["body_under"].append(grp("emofitback", belt, "emofit"))
    # the stripes, in his units: bands across the arm, clipped to its skin, from the sleeve down to the wristband
    def stripes(s, y0, y1, gold=False):
        out = []
        y = y0
        while y < y1:
            # (crowned, gold PINSTRIPES: gold bands as wide as the purple read as a bumblebee, as on the other pets)
            out.append(f'<rect x="-100" y="{y + 2.2:.1f}" width="200" height="1.8" fill="{EM.GOLDLINE}"/>' if gold else f'<rect x="-100" y="{y:.1f}" width="200" height="6.2" fill="{EM.STRIPE}"/>')
            y += 12.4
        return "".join(out)
    for s in "LR":
        base = f'<rect x="-100" y="-360" width="200" height="110" fill="#16121A"/>'
        up = U(f'<g clip-path="url(#egarm{s})"><g clip-path="url(#egarmup{s})">{base}<g class="emostripe">{stripes(s, -350, -326)}</g><g class="emogold" display="none">{stripes(s, -350, -326, True)}</g></g></g>')
        lo = U(f'<g clip-path="url(#egarm{s})"><g clip-path="url(#egarmlo{s})"><rect x="-100" y="-334" width="200" height="{WRIST_TOP + 334:.1f}" fill="#16121A"/>'
               f'<g class="emostripe">{stripes(s, -326, WRIST_TOP)}</g><g class="emogold" display="none">{stripes(s, -326, WRIST_TOP, True)}</g></g></g>')
        P[f"upper{s}"].append(grp(f"emofit{s}", [up], "emofit"))
        P[f"fore{s}"].append(twin(f"emofit{s}fore", f"emofit{s}", [lo], "emofit"))
        # over the elbow's seam (his css hides the skin disc there under a sleeve): the sleeve's own cloth
        el = K["attr"](f"fore{s}", "data-elbow")
        # (striped like the upper sleeve it carries on from, so a bent elbow reads as the sleeve bending, not a patch)
        ex_, ey_, r_ = el["x"], el["y"], el["rin"]
        P["defs"].append(f'<clipPath id="egfitelbow{s}"><circle cx="{ex_:.2f}" cy="{ey_:.2f}" r="{r_:.3f}"/></clipPath>')
        disc = (f'<g clip-path="url(#egfitelbow{s})"><rect x="-100" y="-380" width="200" height="100" fill="#16121A"/>'
                f'<g class="emostripe">{stripes(s, -350, -300)}</g><g class="emogold" display="none">{stripes(s, -350, -300, True)}</g></g>')
        P[f"elbow{s}"].append(twin(f"emofit{s}elbow", f"emofit{s}", [U(disc)], "emofit"))
    # the slip-ons: his shoes' upper (the purple of the sneaker) in a checkerboard, the white sole and toe kept, no laces
    P["defs"].append(EM.checker_pattern("egcheck", 7.0, 0))
    for s in "LR":
        uppers = all_d(SHOE[s], "#7A5389")
        whites = all_d(SHOE[s], "#F3EEF4")
        sh = "".join(path(d, "url(#egcheck)", "none", 0) for d in uppers) + "".join(path(d, "none", INK, 1.6) for d in uppers)
        P[f"shin{s}"].append(grp(f"emofitfoot{s}", [U(sh)], "emofit"))

    # The lip piercings: two silver hoops through his lower lip, one pair for every mouth (a twin of it), in his units.
    # (where each mouth's lower edge is at the two hoops' columns: the mouths are drawn in emonadgotchi.py mouths())
    MC = K["MC"]; cx, cy = MC
    ring_pts = {
        "idle": [(cx - 7.6, cy + 1.0), (cx + 8.0, cy + 0.6)],
        "smug": [(cx - 7.6, cy + 1.2), (cx + 8.0, cy - 0.4)],
        "smile": [(cx - 7.6, cy + 1.8), (cx + 8.0, cy + 1.2)],
        "frown": [(cx - 7.6, cy + 1.8), (cx + 8.0, cy + 1.4)],
        "open": [(cx - 3.6, cy + 4.0), (cx + 4.2, cy + 3.8)],
        "yum": [(cx - 7.6, cy + 1.8), (cx + 8.6, cy + 1.0)],
    }
    rings = "".join(EM.lip_rings(mid, pts, 3.4, 1.5, tuck=0.8) for mid, pts in ring_pts.items())
    P["face"].append('<g id="piercings" display="none"></g>' + U(rings))
    return P
