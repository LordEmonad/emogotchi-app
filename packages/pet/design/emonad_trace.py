"""
Emonad, traced off the operator's own turnaround sheet (emonad/turnaround.jpg at the repo root: front, side facing left,
back, three-quarter facing right). Every part of every view is traced from the sheet's own pixels, colour by colour, so
the rest pose IS the sheet; the parts are cut where the rig bends and continued under whatever covers each joint (an arm
under its sleeve, a leg under the shirt, the neck under the chin), so they can move without a gap.

Run by hand (it needs numpy, opencv and potracer, which pet:build's python does not have):
    python3 -m venv <scratch>/venv && <scratch>/venv/bin/pip install numpy opencv-python-headless potracer pillow
    <scratch>/venv/bin/python packages/pet/design/emonad_trace.py [--debug <dir>]
Writes packages/pet/design/emonad_traced.json (the paths, per view and part, in sheet pixels); emonad.py turns that and
the hand-drawn pieces (eyes, lids, mouths) into packages/pet/emonad.svg.

How a pixel is read (on the sheet upscaled K times, so the edges land between pixels):
  white   light (the skin, the eyes, the collar, the shoes' white)
  ink     black and grey (the outlines AND the shirt and trousers, which are black too)
  purple  anything with colour: the hair (dark, mid, light strands), the wristbands, the shoes' canvas
A part is a set of polygons (sheet pixels) and the classes it takes inside them. Parts may overlap where both are black
(the shirt under a sleeve, a trouser leg under the shirt): black on black never shows, and each part is whole on its own.
"""
import json, sys, os
import numpy as np
import cv2
import potrace
from skimage.morphology import skeletonize
from scipy.ndimage import gaussian_filter1d, mean as ndi_mean
from skimage.filters import sato, apply_hysteresis_threshold
from PIL import Image
from shapely.geometry import Polygon, LineString, box as sbox
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.path.join(ROOT, 'emonad', 'turnaround.jpg')
OUT = os.path.join(HERE, 'emonad_traced.json')
K = 4   # upscale for tracing
# the shirt under the hair's ends: near-black pixels (lightness under this) joined to the shirt's solid black, up to this
# many sheet px from it, are the shirt's (see draw_part, 'hair')
HAIR_SHIRT_L = 0.075
# a dark piece of the hair whose mean lightness on the sheet is under this is a deep shadow (near-black), else a dark
# strand (dark purple): the sheet's small dark pieces average 0.17, its big shadows 0.13-0.15
HAIR_DEEP_L, HAIR_SHADE_L = 0.12, 0.145
# the laces (lace_shapes): how far a lace's broken bits are smoothed together (sheet px), and how much of what is round a
# lace must be dark on the sheet
LACE_JOIN, LACE_RING = 0.6, 0.55
# the pieces of one lace (a JPEG breaks a lace's light middle into bits): joined when an end is within LACE_GAP sheet px
# of another's, the two within LACE_ANG degrees of one way; a piece with no other lace within LACE_ALONE px is a speck of
# grey where two lines meet, not a lace; each lace is drawn as wide as its middle measures, less the JPEG's blur
# (LACE_THIN), within LACE_W sheet px: about 1 in the front views, where the laces are in shadow, 2 in the three-quarter
LACE_GAP, LACE_ANG, LACE_ALONE, LACE_W, LACE_THIN = 2.4, 32, 5.0, (0.9, 2.0), 0.8
HAIR_SHIRT_GROW = 3.0

# ---------------------------------------------------------------- the colours (the sheet's own, sampled)
COL = {
    'ink': '#000000',
    'hair': '#422553',        # the hair's body: the sheet's mean where the rig draws plain hair (66, 37, 83), every view alike
    'hairdeep': '#23142C',    # its deepest shadows (the fringe's spikes over the face): the sheet's mean under them, 36, 20, 44
    'hairshade': '#2E1839',   # its shadows (the ends low on his back, the hair beside his face): the sheet's mean, 46, 24, 57
    'hairdark': '#3A1E4A',    # its dark strands (the sheet's thin dark lines between the light ones: mode 58, 30, 74;
                              # drawn in the deep shadow's near-black they were black specks all over the hair)
    'hairlight': '#6E5180',   # the strands
    'lace': '#6F6176',        # the laces' light middles (the sheet's, every view alike: 111, 97, 118)
    'skin': '#FFFFFF',
    'shoe': '#7A5389',        # the shoes' canvas and the wristbands
    'shoewhite': '#F3EEF4',   # the toe caps, soles, tongues, the wristbands' stripe
}

# ---------------------------------------------------------------- the views
# an arm takes its skin, its wristband and only the ink within `hug` sheet px of them (on the sheet an arm lies on the
# black shirt with no line between; cut out of it, it keeps that much black as its outline), and is measured at the
# elbow (sheet y) so the rig can bend it there
ARM = {'hug': 2.4, 'elbow': 334}
# the side view's far shoe, where it peeks out above the near one (its toe, laces and tongue): cut out of the near shoe
# and the shin over it, since the rig draws the far foot whole, as a copy of the near one
SIDE_FAR_SHOE = [[(405, 596), (472, 596), (475, 601), (477.6, 606), (479.2, 610.2), (482, 610.5), (473.5, 611.5), (468.5, 616.5), (469.5, 626.5),
                  (456, 628.5), (449, 630), (440, 632.2), (432, 634.3), (428.9, 635.1), (425, 637.7), (423.3, 640),
                  (422.6, 644), (422.5, 653), (405, 653)]]
# box: the crop on the sheet. origin: the point between the feet on the ground (the view's 0,0). parts: in z order,
# bottom first. A part: name, the polygons it takes, the kind of drawing (how its classes are coloured), and extensions
# (rows or columns of its own pixels continued under whatever covers that edge: ('up', y, to_y, x0, x1) copies row y up
# to to_y between x0 and x1).
VIEWS = {
    'front': {
        'box': (94, 20, 302, 672),
        'origin': (197, 664),
        'parts': [
            {'name': 'thighL', 'kind': 'black', 'poly': [[(144, 428), (186, 428), (185, 530), (145, 530)]], 'ext': [('up', 434, 404, 146, 184)]},
            {'name': 'shinL', 'kind': 'black', 'poly': [[(145, 510), (185, 510), (184, 621), (146, 621)]]},
            {'name': 'thighR', 'kind': 'black', 'poly': [[(209, 428), (251, 428), (250, 530), (211, 530)]], 'ext': [('up', 434, 404, 211, 249)]},
            {'name': 'shinR', 'kind': 'black', 'poly': [[(211, 510), (250, 510), (249, 621), (213, 621)]]},
            {'name': 'shoeL', 'kind': 'shoe', 'poly': [[(98, 604), (186, 600), (186, 668), (98, 668)]]},
            {'name': 'shoeR', 'kind': 'shoe', 'poly': [[(212, 600), (300, 604), (300, 668), (212, 668)]]},
            # the shirt with its top along the shoulders (under the hair it is not seen, but a tilted head shows it)
            # the shirt without its sleeves (the sleeves are their own parts and go up with the arms), its sides just inside
            # the arms' own outline: on the sheet the arms lie on it with no line between
            {'name': 'torso', 'kind': 'black', 'poly': [[(140, 238), (152, 234), (176, 224), (216, 224), (242, 234), (256, 238), (253, 262),
                                                          (247.8, 300), (251.5, 438), (140.4, 438), (145.3, 300), (142, 262)]]},
            {'name': 'neck', 'kind': 'skin', 'poly': [[(166, 196), (232, 196), (232, 248), (166, 248)]],
             'only': 'neckzone', 'ext': [('up', 210, 186, 178, 221)]},
            {'name': 'armL', 'kind': 'skin', 'poly': [[(100, 304), (150, 304), (150, 480), (100, 480)]], **ARM,
             'ext': [('up', 312, 270, 118, 148)]},
            {'name': 'armR', 'kind': 'skin', 'poly': [[(246, 304), (296, 304), (296, 480), (246, 480)]], **ARM,
             'ext': [('up', 312, 270, 248, 280)]},
            {'name': 'sleeveL', 'kind': 'black', 'poly': [[(118, 236), (140, 236), (152, 250), (150, 312), (104, 308), (108, 266)]]},
            {'name': 'sleeveR', 'kind': 'black', 'poly': [[(282, 236), (256, 236), (246, 250), (248, 312), (292, 308), (288, 266)]]},
            # all of the hair, over the shirt's shoulders and behind the face (the fringe is drawn again over the face)
            {'name': 'hairback', 'kind': 'hair', 'poly': [[(96, 22), (300, 22), (300, 266), (96, 266)]], 'only': 'hair'},
            {'name': 'face', 'kind': 'skin', 'poly': [[(150, 96), (250, 96), (250, 222), (150, 222)]], 'only': 'face',
             'not': [[(171, 126), (194, 126), (194, 143), (171, 143)], [(205, 126), (229, 126), (229, 144), (205, 144)], [(182, 180), (215, 180), (215, 191), (182, 191)]]},
            {'name': 'eyeL', 'kind': 'eye', 'poly': [[(171, 126), (194, 126), (194, 143), (171, 143)]], 'only': 'face'},
            {'name': 'eyeR', 'kind': 'eye', 'poly': [[(205, 126), (229, 126), (229, 144), (205, 144)]], 'only': 'face'},
            {'name': 'mouth', 'kind': 'line', 'poly': [[(182, 180), (215, 180), (215, 191), (182, 191)]], 'only': 'face'},
            {'name': 'hairfront', 'kind': 'hair', 'poly': [[(150, 96), (240, 96), (240, 128), (206, 126), (196, 134), (190, 160), (183, 214), (150, 214)]],
             'only': 'hair'},
        ],
    },
    # facing left: the near arm in front, the legs one shape (both are black), one shoe
    'side': {
        'box': (374, 22, 582, 672),
        'origin': (490, 663),
        'parts': [
            {'name': 'torso', 'kind': 'black', 'poly': [[(462, 238), (472, 230), (500, 226), (522, 234), (530, 246), (538, 268), (534, 428), (447, 428),
                                                         (448, 270), (452, 248)]]},
            {'name': 'thighL', 'kind': 'black', 'poly': [[(452, 422), (522, 422), (519, 526), (457, 526)]], 'ext': [('up', 432, 404, 455, 520)]},
            # (down into the near shoe's opening, its front edge stopping where the near leg's does, so the far shoe's
            # tongue beside it stays the far shoe's)
            {'name': 'shinL', 'kind': 'black', 'poly': [[(456, 506), (519, 506), (517, 626), (486, 626), (480, 617), (476, 598), (459, 560)]]},
            {'name': 'shoeL', 'kind': 'shoe', 'poly': [[(412, 598), (572, 598), (572, 668), (412, 668)]],
             # the far shoe peeking out above the near one is cut away: the rig draws the far foot as a copy of this one
             'cut': SIDE_FAR_SHOE},
            {'name': 'neck', 'kind': 'skin', 'poly': [[(452, 198), (494, 198), (494, 254), (452, 254)]], 'only': 'neckzone',
             'ext': [('up', 212, 190, 456, 476)]},
            {'name': 'armL', 'kind': 'skin', 'poly': [[(472, 304), (522, 304), (522, 478), (472, 478)]], **ARM, 'ext': [('up', 312, 272, 484, 518)]},
            {'name': 'sleeveL', 'kind': 'black', 'poly': [[(480, 248), (526, 248), (526, 315), (482, 315)]]},
            {'name': 'face', 'kind': 'skin', 'poly': [[(388, 100), (478, 100), (478, 224), (388, 224)]], 'only': 'face',
             'not': [[(419, 128), (437, 128), (437, 146), (419, 146)], [(423, 182), (434, 182), (434, 192), (423, 192)]]},
            {'name': 'eyeL', 'kind': 'eye', 'poly': [[(419, 128), (437, 128), (437, 146), (419, 146)]], 'only': 'face'},
            {'name': 'mouth', 'kind': 'line', 'poly': [[(423, 182), (434, 182), (434, 192), (423, 192)]], 'only': 'face'},
            {'name': 'hairfront', 'kind': 'hair', 'poly': [[(376, 24), (580, 24), (580, 292), (376, 292)]], 'only': 'hair'},
        ],
    },
    'back': {
        'box': (680, 22, 880, 672),
        'origin': (785, 663),
        'parts': [
            {'name': 'thighL', 'kind': 'black', 'poly': [[(728, 430), (772, 430), (770, 536), (731, 536)]], 'ext': [('up', 440, 410, 731, 770)]},
            {'name': 'shinL', 'kind': 'black', 'poly': [[(731, 516), (770, 516), (768, 632), (734, 632)]]},
            {'name': 'thighR', 'kind': 'black', 'poly': [[(796, 430), (840, 430), (838, 536), (798, 536)]], 'ext': [('up', 440, 410, 798, 838)]},
            {'name': 'shinR', 'kind': 'black', 'poly': [[(798, 516), (838, 516), (836, 632), (800, 632)]]},
            {'name': 'shoeL', 'kind': 'shoe', 'poly': [[(712, 616), (776, 616), (776, 668), (712, 668)]]},
            {'name': 'shoeR', 'kind': 'shoe', 'poly': [[(794, 616), (858, 616), (858, 668), (794, 668)]]},
            {'name': 'torso', 'kind': 'black', 'poly': [[(726, 240), (740, 234), (764, 226), (806, 226), (828, 234), (840, 240), (838, 262),
                                                          (834.8, 300), (840, 442), (725.8, 442), (731.5, 300), (728, 262)]]},
            {'name': 'armL', 'kind': 'skin', 'poly': [[(700, 306), (738, 306), (738, 480), (700, 480)]], **ARM, 'ext': [('up', 314, 274, 706, 734)]},
            {'name': 'armR', 'kind': 'skin', 'poly': [[(832, 306), (870, 306), (870, 480), (832, 480)]], **ARM, 'ext': [('up', 314, 274, 836, 864)]},
            {'name': 'sleeveL', 'kind': 'black', 'poly': [[(700, 236), (728, 236), (744, 250), (740, 316), (694, 312), (698, 266)]]},
            {'name': 'sleeveR', 'kind': 'black', 'poly': [[(868, 236), (840, 236), (824, 250), (828, 316), (874, 312), (870, 266)]]},
            {'name': 'hairfront', 'kind': 'hair', 'poly': [[(682, 22), (878, 22), (878, 302), (682, 302)]], 'only': 'hair'},
        ],
    },
    # facing right: the far arm (his left, on our right) partly behind the shirt, the far leg and shoe further back
    'quarter': {
        'box': (984, 22, 1188, 672),
        # (the point between his feet, as in the other views: at 1100 the drawing stood 23 units left of where the front, side
        # and back stand, and every turn through three-quarters slid him sideways and back)
        'origin': (1077, 663),
        'page': [(1080, 520), (1081, 600)],
        'parts': [
            {'name': 'armR', 'kind': 'skin', 'poly': [[(1116, 302), (1150, 302), (1150, 472), (1116, 472)]], **ARM, 'ext': [('up', 312, 272, 1120, 1142)],
             'band_edge': True},
            {'name': 'sleeveR', 'kind': 'black', 'poly': [[(1106, 240), (1128, 240), (1140, 256), (1148, 282), (1148, 312), (1114, 312)]]},
            {'name': 'thighR', 'kind': 'black', 'poly': [[(1084, 432), (1128, 432), (1125, 532), (1086, 532)]], 'ext': [('up', 440, 410, 1088, 1124)]},
            {'name': 'shinR', 'kind': 'black', 'poly': [[(1086, 512), (1125, 512), (1122, 614), (1088, 614)]]},
            # (its heel runs on under the near toe, up to the near toe's outline, which the near shoe draws over it)
            {'name': 'shoeR', 'kind': 'shoe', 'poly': [[(1084, 594), (1180, 594), (1180, 656), (1114, 656), (1113, 645), (1109.5, 641.5), (1104.5, 636.5),
                                                       (1097.5, 632.2), (1089.5, 629.6), (1084, 628)]]},
            # (its far side a unit over the far arm's outline, which it is drawn over: half a unit short, a hairline of
            # background showed between the shirt and that arm all down its inner edge)
            {'name': 'torso', 'kind': 'black', 'poly': [[(1026, 240), (1040, 234), (1060, 228), (1100, 230), (1112, 238), (1118, 250), (1121.4, 306),
                                                          (1122.5, 440), (1028.4, 440), (1031.3, 300), (1030, 262)]]},
            {'name': 'thighL', 'kind': 'black', 'poly': [[(1026, 432), (1078, 432), (1074, 532), (1028, 532)]], 'ext': [('up', 440, 410, 1030, 1074)]},
            {'name': 'shinL', 'kind': 'black', 'poly': [[(1028, 512), (1075, 512), (1070, 626), (1030, 626)]]},
            # (the far shoe's heel, behind the near toe, is cut out of the near shoe: it would march with the wrong foot)
            {'name': 'shoeL', 'kind': 'shoe', 'poly': [[(1024, 606), (1116, 606), (1116, 668), (1024, 668)]],
             'cut': [[(1087, 598), (1122, 598), (1122, 641.5), (1109.5, 641.5), (1104.5, 636.5), (1097.5, 632.2), (1089.5, 629.6), (1087, 629)]]},
            {'name': 'neck', 'kind': 'skin', 'poly': [[(1050, 198), (1112, 198), (1112, 252), (1050, 252)]], 'only': 'neckzone',
             'ext': [('up', 212, 188, 1062, 1100)]},
            {'name': 'armL', 'kind': 'skin', 'poly': [[(994, 302), (1042, 302), (1042, 476), (994, 476)]], **ARM, 'ext': [('up', 312, 272, 1004, 1036)]},
            {'name': 'sleeveL', 'kind': 'black', 'poly': [[(1004, 236), (1030, 236), (1042, 250), (1038, 314), (994, 310), (996, 268)]]},
            {'name': 'hairback', 'kind': 'hair', 'poly': [[(986, 22), (1186, 22), (1186, 262), (986, 262)]], 'only': 'hair'},
            {'name': 'face', 'kind': 'skin', 'poly': [[(1052, 100), (1146, 100), (1146, 222), (1052, 222)]], 'only': 'face',
             'not': [[(1069, 126), (1093, 126), (1093, 144), (1069, 144)], [(1101, 124), (1125, 124), (1125, 142), (1101, 142)], [(1083, 176), (1114, 176), (1114, 190), (1083, 190)]]},
            {'name': 'eyeL', 'kind': 'eye', 'poly': [[(1069, 126), (1093, 126), (1093, 144), (1069, 144)]], 'only': 'face'},
            {'name': 'eyeR', 'kind': 'eye', 'poly': [[(1101, 124), (1125, 124), (1125, 142), (1101, 142)]], 'only': 'face'},
            {'name': 'mouth', 'kind': 'line', 'poly': [[(1083, 176), (1114, 176), (1114, 190), (1083, 190)]], 'only': 'face'},
            {'name': 'hairfront', 'kind': 'hair', 'poly': [[(1040, 96), (1142, 96), (1142, 118), (1100, 116), (1088, 128), (1082, 150), (1080, 206), (1040, 206)]],
             'only': 'hair'},
        ],
    },
}


# the eyes, measured on the sheet (scratchpad eyes_center.py, then fitted to it by eyes_opt.py; checked over the sheet at 16-28x): the corners, the apex of
# each lid line ON THE LINE'S CENTRE (the stroke is drawn centred on it), the pupil and its radius, and each view's
# line weights (W: upper lid, lower lid). The first measure followed the white's own edge, and the eyes came out high,
# large and too thinly lined.
EYES = {
    'front': {'eyeL': dict(L=(173.27, 131.8), R=(190.03, 136.0), T=(182.1, 129.3), B=(180.55, 139.53), P=(182.17, 134.88), pr=1.76), 'eyeR': dict(L=(208.61, 137.06), R=(224.79, 139.07), T=(215.88, 130.08), B=(215.72, 140.23), P=(217.12, 135.85), pr=1.62)},
    'side': {'eyeL': dict(L=(425.0, 136.83), R=(434.15, 141.87), T=(428.04, 134.08), B=(427.16, 142.87), P=(427.6, 138.3), pr=1.35)},
    'quarter': {'eyeL': dict(L=(1071.93, 129.87), R=(1089.97, 134.14), T=(1080.66, 126.47), B=(1079.74, 137.75), P=(1081.42, 132.98), pr=1.73), 'eyeR': dict(L=(1106.55, 134.13), R=(1124.1, 135.14), T=(1114.83, 126.27), B=(1114.07, 137.28), P=(1114.88, 132.64), pr=1.5)},
}
EYE_W = {'front': (2.1, 2.0), 'side': (1.9, 1.9), 'quarter': (2.5, 2.1)}

# The shoulders, read off the sheet at 10x (front, back, three-quarter; the side view's sleeve sits on the body): N on
# the shoulder line by the collar (under the hair), tN the shoulder line's way there; T where the sleeve's outer edge
# begins, tT that edge's way down the arm; I the sleeve's inner edge at the armpit (tI its way down: the polygon's own
# edge, black on black on the sheet) and A the shirt's side there (tA). The shirt is cut
# along N-A (A on the shirt's own side, tA that side's way down) and the sleeve along T-I, and the rig draws what lies between (emonad.py's shoulder part) every frame, from
# a curve N->T that leaves N along tN and arrives along tT: at rest the sheet's own shoulder, with the arm raised a
# shoulder that runs into it. The arm turns about P, part of the way from T to I (emonad.py).
SHOULDERS = {
    'front': {'L': dict(N=(148, 235), tN=(-0.97, 0.243), T=(124, 250), tT=(-0.243, 0.970), I=(151.5, 266), tI=(-0.032, 0.9995),
                        A=(142.9, 272), tA=(0.0865, 0.996)),
              'R': dict(N=(246, 236), tN=(0.97, 0.243), T=(266, 250), tT=(0.287, 0.958), I=(246.5, 266), tI=(0.032, 0.9995),
                        A=(251.6, 272), tA=(-0.136, 0.991))},
    'back': {'L': dict(N=(740, 235), tN=(-0.97, 0.243), T=(713, 250), tT=(-0.243, 0.970), I=(742.9, 268), tI=(-0.0605, 0.998),
                       A=(729.1, 274), tA=(0.092, 0.996)),
             'R': dict(N=(828, 235), tN=(0.97, 0.243), T=(850, 252), tT=(0.287, 0.958), I=(825.1, 268), tI=(0.0605, 0.998),
                       A=(837.0, 274), tA=(-0.084, 0.996))},
    'quarter': {'L': dict(N=(1040, 235), tN=(-0.97, 0.243), T=(1011, 250), tT=(-0.243, 0.970), I=(1041, 266), tI=(-0.0624, 0.998),
                          A=(1030.3, 272), tA=(0.034, 0.999))},
}


def _shoulder_cuts():
    """The shirt and sleeve cuts the shoulders need, added to those parts."""
    for v, sides in SHOULDERS.items():
        parts = {p['name']: p for p in VIEWS[v]['parts']}
        for side, g in sides.items():
            N, T, I, A = g['N'], g['T'], g['I'], g['A']
            lat = -1 if side == 'L' else 1
            torso = [N, (N[0], N[1] - 40), (A[0] + lat * 60, N[1] - 40), (A[0] + lat * 60, A[1]), A]
            sleeve = [T, (T[0], T[1] - 40), (I[0] - lat * 60, T[1] - 40), (I[0] - lat * 60, I[1]), I]
            parts['torso'].setdefault('cut', []).append(torso)
            parts['sleeve' + side].setdefault('cut', []).append(sleeve)


_shoulder_cuts()


def almond_mask(shape, e, box, grow):
    """An eye's white (its two lid curves), grown by `grow` sheet px, as a mask on the upscaled crop."""
    def q(a, apex, b, t):
        c = (2 * apex[0] - (a[0] + b[0]) / 2, 2 * apex[1] - (a[1] + b[1]) / 2)
        return ((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1])
    ts = np.linspace(0, 1, 24)
    pts = [q(e['L'], e['T'], e['R'], t) for t in ts] + [q(e['R'], e['B'], e['L'], t) for t in ts]
    m = poly_mask(shape, [pts], box).astype(np.uint8)
    return cv2.dilate(m, disk(grow)).astype(bool)


def load():
    im = Image.open(SRC).convert('RGB')
    return im


def classes(rgb):
    """Per pixel: 0 white, 1 ink, 2 purple dark, 3 purple mid, 4 purple light. rgb: float 0..1, upscaled."""
    a = cv2.bilateralFilter((rgb * 255).astype(np.uint8), 5, 40, 3).astype(float) / 255
    L = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    chroma = a.max(2) - a.min(2)
    purp = a[..., 2] - a[..., 1]
    c = np.zeros(L.shape, np.uint8)
    white = L > 0.5
    ink = (~white) & ((chroma < 0.075) | (L < 0.085))
    pur = (~white) & (~ink)
    c[ink] = 1
    # near-black with a purple cast is the hair's deepest shadow (the ends over the shoulders), not ink
    c[ink & (purp > 0.022) & (L > 0.025)] = 2
    c[pur & (L < 0.17)] = 2
    c[pur & (L >= 0.17) & (L < 0.315)] = 3
    c[pur & (L >= 0.315)] = 4
    c[white] = 0
    return c, L


def poly_mask(shape, polys, box):
    m = np.zeros(shape, np.uint8)
    x0, y0 = box[0], box[1]
    for p in polys:
        pts = np.array([[(x - x0) * K, (y - y0) * K] for x, y in p], np.int32)
        cv2.fillPoly(m, [pts], 1)
    return m.astype(bool)


def figure_mask(cls, seeds=(), box=None):
    """Everything that is not the page: the white connected to the crop's edge is the page, and so is any white a view
    names as page (`page`: points in background shut in on every side, e.g. between legs whose shoes overlap)."""
    notpage = cls != 0
    page = np.zeros(cls.shape, np.uint8)
    white = (cls == 0).astype(np.uint8)
    ff = white.copy()
    h, w = ff.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)
    pts = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for sx, sy in seeds:
        pts.append(((sx - box[0]) * K, (sy - box[1]) * K))
    for (x, y) in pts:
        if ff[y, x] == 1:
            cv2.floodFill(ff, mask, (x, y), 2)
    page = ff == 2
    return ~page


def potrace_d(m, box, turd=10):
    """Trace a boolean mask (upscaled) into an SVG path in sheet pixels relative to nothing (absolute sheet coords)."""
    if not m.any():
        return ''
    bm = potrace.Bitmap(~m)
    pl = bm.trace(turdsize=turd, alphamax=1.0, opticurve=True, opttolerance=0.25)
    x0, y0 = box[0] - OFF[0], box[1] - OFF[1]
    f = lambda p: f'{p.x / K + x0:.2f} {p.y / K + y0:.2f}'
    d = []
    for c in pl:
        d.append('M' + f(c.start_point))
        for s in c.segments:
            if s.is_corner:
                d.append('L' + f(s.c) + 'L' + f(s.end_point))
            else:
                d.append('C' + f(s.c1) + ' ' + f(s.c2) + ' ' + f(s.end_point))
        d.append('Z')
    return ''.join(d)


def clean(m, r=1):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, k)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    return m.astype(bool)


def extend(cls_part, sel, ext, box):
    """Continue a part's own pixels under a cover: copy row y (sheet px) up to to_y between x0..x1."""
    x0b, y0b = box[0], box[1]
    for e in ext:
        kind = e[0]
        if kind == 'up':
            _, y, to_y, ex0, ex1 = e
            ry = (y - y0b) * K
            ty = (to_y - y0b) * K
            xa, xb = (ex0 - x0b) * K, (ex1 - x0b) * K
            row_c = cls_part[ry, xa:xb].copy()
            row_s = sel[ry, xa:xb].copy()
            for yy in range(ty, ry):
                cls_part[yy, xa:xb] = np.where(row_s, row_c, cls_part[yy, xa:xb])
                sel[yy, xa:xb] = sel[yy, xa:xb] | row_s
    return cls_part, sel


def trace_view(name, V, im, debug=None):
    box = V['box']
    OFF[0], OFF[1] = V['origin']
    x0, y0, x1, y1 = box
    crop = im.crop(box).resize(((x1 - x0) * K, (y1 - y0) * K), Image.LANCZOS)
    rgb = np.asarray(crop).astype(float) / 255
    cls, L = classes(rgb)
    STRAND_SRC['L'] = L.astype(np.float32)
    # (and the colour's strength, as classes() sees it: the laces' middles are a grey lilac, the canvas round them purple)
    _a = cv2.bilateralFilter((rgb * 255).astype(np.uint8), 5, 40, 3).astype(float) / 255
    STRAND_SRC['C'] = (_a.max(2) - _a.min(2)).astype(np.float32)
    STRAND_SRC['rgb'] = _a.astype(np.float32)
    # line-shaped light ridges (a Hessian 'sato' filter), normalised over the hair: the strands
    hairmask = np.isin(cls, (1, 2, 3, 4))
    rr = sato(L, sigmas=[3, 4, 5], black_ridges=False) * hairmask
    STRAND_SRC['ridge'] = rr / max(1e-6, float(np.percentile(rr[hairmask], 99.5)))
    fig = figure_mask(cls, V.get('page', ()), box)
    hairish = np.isin(cls, (2, 3, 4))
    # ink near hair is the hair's outline (within 1.6 sheet px of a hair pixel)
    near_hair = cv2.dilate(hairish.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(3.2 * K) | 1, int(3.2 * K) | 1))).astype(bool)
    out = []
    picked = []
    for P in V['parts']:
        region = poly_mask(cls.shape, P['poly'], box)
        sel = region & fig
        if 'not' in P:
            # (only the lines are taken out: the skin stays whole under the eyes and the mouth drawn over it). An eye's
            # own outline is taken out, never a box round it: the three-quarter view's box took the top of the nose
            # with it. The mouth keeps its box.
            nm = np.zeros(cls.shape, bool)
            for e in EYES.get(name, {}).values():
                nm |= almond_mask(cls.shape, e, box, 1.6)
            for poly in P['not']:
                pm = poly_mask(cls.shape, [poly], box)
                if not any(pm[int((e['P'][1] - box[1]) * K), int((e['P'][0] - box[0]) * K)] for e in EYES.get(name, {}).values()):
                    nm |= pm
            P = dict(P, _not=nm)
        only = P.get('only')
        if only == 'hair':
            sel &= (hairish | ((cls == 1) & near_hair))
        elif only == 'face':
            sel &= ~hairish
            sel &= ~((cls == 1) & near_hair & ~near_skin_lines(cls, box))
        elif only == 'neckzone':
            sel &= ~hairish
        if 'hug' in P:
            # the arm: its skin and band, the lines inside them (fingers, the band's stripes), and its outline. Where the
            # sheet drew it against the page that outline is the sheet's own line; where it lies on his clothes (the
            # shirt, the trousers: black on black, no line of its own) it is a clean line of even width, so a hand or an
            # arm moved off his clothes is outlined like everywhere else, not edged with a ragged strip of trouser
            own = sel & np.isin(cls, (0, 3, 4))
            selh = sel & cv2.dilate(own.astype(np.uint8), disk(P['hug'])).astype(bool)
            closed = cv2.morphologyEx(own.astype(np.uint8), cv2.MORPH_CLOSE, disk(1.6)).astype(bool)
            sil = own | (selh & np.isin(cls, (1, 2)) & closed)
            holes = (~sil).astype(np.uint8)
            n_, lab_, st_, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
            sil |= np.isin(lab_, [i for i in range(1, n_) if st_[i, cv2.CC_STAT_AREA] < 30 * K * K])
            nearpage = cv2.dilate((~fig).astype(np.uint8), disk(3.2)).astype(bool)
            ring = cv2.dilate(sil.astype(np.uint8), disk(2.25)).astype(bool) & ~sil
            newink = ring & ~nearpage & region
            oldink = selh & np.isin(cls, (1, 2)) & nearpage & ~sil
            sel = (sil | newink | oldink) & region
            P = dict(P, _ink=newink)
        if 'cut' in P:
            # and any light area the cut runs through goes with it when most of it was inside the cut (the far shoe's
            # toe, up to the near toe's outline), so no sliver of it is left along the cut
            cutm = poly_mask(cls.shape, P['cut'], box)
            light = (sel & (cls == 0)).astype(np.uint8)
            n, lab = cv2.connectedComponents(light, connectivity=4)
            inside = np.bincount(lab[cutm & (light == 1)], minlength=n)
            total = np.bincount(lab[light == 1], minlength=n)
            gone = [i for i in range(1, n) if inside[i] > 0 and inside[i] * 2 > total[i]]
            sel &= ~cutm & ~np.isin(lab, gone)
        cp = cls.copy()
        if '_ink' in P:
            cp[P['_ink']] = 1
        if P['kind'] == 'hair':
            for e in EYES.get(name, {}).values():
                sel &= ~almond_mask(cls.shape, e, box, 0.8)
        if '_not' in P:
            cp[P['_not'] & (cp != 0)] = 0
        if only in ('face', 'neckzone'):
            # the hair's own bits left on the skin where it lies over it (the fringe's spike tips, broken ends of strands'
            # outlines): small specks of ink touching the hair. Hidden at rest; but the hair moves, so they become skin
            # (only those lying along the hair for most of their length: a face line that only touches it at one end,
            # the three-quarter view's nose under the fringe, is the face's own)
            ink = (sel & np.isin(cp, (1, 2))).astype(np.uint8)
            n, lab, st, _ = cv2.connectedComponentsWithStats(ink)
            near = np.bincount(lab[(ink == 1) & near_hair], minlength=n)
            kill = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] < 45 * K * K and near[i] > 0.6 * st[i, cv2.CC_STAT_AREA]]
            cp[np.isin(lab, kill)] = 0
        if only in ('face', 'neckzone'):
            # and the page's own white caught between the hair's strands where they lie over the skin (small light
            # specks touching the hair): on the sheet's white they vanish, on any other background they are white dots
            light = (sel & (cp == 0)).astype(np.uint8)
            n, lab, st, _ = cv2.connectedComponentsWithStats(light, connectivity=4)
            touch = np.unique(lab[(light == 1) & near_hair])
            gone = [i for i in touch if i > 0 and st[i, cv2.CC_STAT_AREA] < 60 * K * K]
            sel &= ~np.isin(lab, gone)
        if 'ext' in P:
            cp, sel = extend(cp, sel, P['ext'], box)
        picked.append((P, cp, sel))
    # a black part (the shirt, a sleeve, a leg) is whole under what is drawn over it: inside its polygon it also takes
    # every pixel a later part covers (the arms over the shirt, the hands over the thighs, the hair over the shoulders),
    # so when that part moves away there is shirt or leg under it, never a hole
    for i, (P, cp, sel) in enumerate(picked):
        if P['kind'] == 'black':
            over = np.zeros(cls.shape, bool)
            for Q, _, qsel in picked[i + 1:]:
                over |= qsel
            P = dict(P, _over=sel & over)
        layers = draw_part(P, cp, sel, box)
        rec = {'name': P['name'], 'kind': P['kind'], 'layers': layers}
        if P['kind'] == 'eye':
            rec['eye'] = measure_eye(cp, sel, box)
        if 'elbow' in P:
            # (measured on the arm as drawn, not as the sheet's pixels: the joints' discs must match its outline)
            ms, mc = sel, cp
            if 'hug' in P and CLEAN_ARM:
                ms = CLEAN_ARM['Sm']
                # (the outline is where the clean ring is; inside, the sheet's own pixels, so the band's bottom line is
                # measured as drawn: the forearm's cut must land on its lower edge, or the outline's corner shows below it)
                mc = cp.copy(); mc[ms & ~CLEAN_ARM['inside']] = 1
            rec['elbow'] = measure_elbow(mc, ms, box, P['elbow'])
            rec['wrist'] = measure_wrist(mc, ms, box)
            if 'hug' in P and CLEAN_ARM:
                rec['hands'] = hand_set(name, P['name'][-1], rec['wrist'])
        out.append(rec)
        print(f'  {name}.{P["name"]}: {len(layers)} layers, {sum(len(l["d"]) for l in layers)} chars')
    sh = {side: fit_shoulder(side, g, cls, L, box) for side, g in SHOULDERS.get(name, {}).items()}
    return {'box': box, 'origin': V['origin'], 'parts': out, 'eyes': EYES.get(name, {}), 'eye_w': EYE_W.get(name), 'shoulders': sh}


def fit_shoulder(side, g, cls, L, box):
    """The shoulder's curve fitted to the sheet: the shirt's outer edge sampled row by row (to a fraction of a pixel, where
    it is the shirt's own edge and not the hair's) from where the hair ends down to T, and below T for the sleeve's way
    (tT); then the curve's way out of N and its two handles chosen to lie on those samples (least squares). Sheet px."""
    x0, y0 = box[0], box[1]
    lat = -1 if side == 'L' else 1
    hairish = np.isin(cls, (2, 3, 4))
    def edge(y):
        r = int(round((y - y0) * K))
        row = L[r]
        xs = range(int((g['T'][0] + lat * 14 - x0) * K), int((g['N'][0] - x0) * K), -lat)
        prev = None
        for xi in xs:
            if 0 <= xi < len(row) and row[xi] < 0.5:
                if hairish[r, xi + (-lat) * int(2 * K): xi + (-lat) * int(2 * K) + 1].any() or hairish[r, xi]:
                    return None
                if prev is None:
                    return None
                f = (row[prev] - 0.5) / max(1e-6, row[prev] - row[xi])
                return x0 + (prev + (xi - prev) * f) / K
            prev = xi
        return None
    ys = np.arange(g['T'][1] - 14, g['T'][1] + 0.01, 0.25)
    pts = [(edge(y), y) for y in ys]
    pts = [(x, y) for x, y in pts if x is not None]
    # and from above, along the shoulder's top: where the page shows over the shirt (between the hair's spikes)
    def top(x):
        # down the column: past the hair (a spike over the shoulder), through the page, to the shirt's own edge
        c = int(round((x - x0) * K))
        white = None      # the last row of page (clearly white) above
        for yi in range(int((g['T'][1] - 26 - y0) * K), int((g['T'][1] + 2 - y0) * K)):
            if L[yi, c] > 0.8 and not hairish[yi, c]:
                white = yi
            elif L[yi, c] < 0.5:
                if hairish[max(0, yi - int(1.0 * K)):yi + int(1.5 * K), c].any():
                    white = None
                    continue
                if white is not None and yi - white <= 2 * K:
                    p_ = yi - 1      # (the edge: between the last pixel at or over half and this one)
                    f = (L[p_, c] - 0.5) / max(1e-6, L[p_, c] - L[yi, c])
                    return y0 + (p_ + f) / K
                white = None
        return None
    lo_x, hi_x = sorted((g['N'][0] - lat * 2, g['T'][0] - lat * 1))
    for x in np.arange(lo_x, hi_x, 0.25):
        y = top(x)
        if y is not None and y < g['T'][1] - 0.5:
            pts.append((float(x), float(y)))
    below = [(edge(y), y) for y in np.arange(g['T'][1], g['T'][1] + 16, 0.5)]
    below = np.array([(x, y) for x, y in below if x is not None])
    k = np.polyfit(below[:, 1], below[:, 0], 1)       # x = k0 y + k1 along the sleeve's edge
    T = (float(np.polyval(k, g['T'][1])), float(g['T'][1]))
    tT = np.array([k[0], 1.0]); tT /= np.hypot(*tT)
    N = np.array(g['N'], float); Tp = np.array(T)
    dist = np.hypot(*(Tp - N))
    P_ = np.array(pts)
    def curve(ang, a, b):
        tN = np.array([np.cos(ang), np.sin(ang)])
        c1 = N + tN * a * dist; c2 = Tp - tT * b * dist
        t = np.linspace(0, 1, 160)[:, None]
        return (1 - t) ** 3 * N + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * Tp
    def cost(ang, a, b):
        C = curve(ang, a, b)
        d = np.sqrt(((P_[:, None, :] - C[None, :, :]) ** 2).sum(2)).min(1)
        # (robust: a point further than a pixel counts as a pixel, so a stray sample on a hair's outline cannot pull it)
        return float(np.minimum(d, 1.0) ** 2).mean() if False else float((np.minimum(d, 1.0) ** 2).mean())
    base = np.arctan2(g['tN'][1], g['tN'][0])
    best = None
    # (handles kept short enough that the curve can never loop back on itself)
    for ang in base + np.radians(np.arange(-40, 41, 5)):
        for a in np.arange(0.1, 0.71, 0.05):
            for b in np.arange(0.1, 0.61, 0.05):
                c = cost(ang, a, b)
                if best is None or c < best[0]: best = (c, ang, a, b)
    c, ang, a, b = best
    for step in (np.radians(2), np.radians(0.5)):
        for _ in range(3):
            for da in (-step, 0, step):
                for db_ in (-0.02, 0, 0.02):
                    for dbb in (-0.02, 0, 0.02):
                        na, nb = min(0.72, max(0.05, a + db_)), min(0.62, max(0.05, b + dbb))
                        cc = cost(ang + da, na, nb)
                        if cc < c: c, ang, a, b = cc, ang + da, na, nb
    C = curve(ang, a, b)
    dd = np.sqrt(((P_[:, None, :] - C[None, :, :]) ** 2).sum(2)).min(1)
    print(f'    shoulder {side}: {len(pts)} samples, {np.mean(dd < 0.6) * 100:.0f}% within 0.6px, median {np.median(dd):.2f}px')
    return {'N': list(g['N']), 'tN': [float(np.cos(ang)), float(np.sin(ang))], 'T': [T[0], T[1]], 'tT': [float(tT[0]), float(tT[1])],
            'I': list(g['I']), 'tI': list(g['tI']), 'A': list(g['A']), 'tA': list(g['tA']), 'a': float(a), 'b': float(b)}


def measure_wrist(cls, sel, box):
    """Where the hand bends: the wristband's lower edge (the lowest row of the band's purple), the arm's way there, the
    hand's half width just below it (with its outline), all relative to the view's origin."""
    x0, y0 = box[0], box[1]
    band = sel & np.isin(cls, (3, 4))
    ys, xs = np.nonzero(band)
    yb = ys.max()                                  # the band's last row (upscaled px)
    rows = lambda r: np.nonzero(sel[r])[0]
    def mid(r):
        c = rows(r)
        return ((c.min() + c.max() + 1) / 2) / K + x0 if len(c) else None
    def half(r):
        c = rows(r)
        return (c.max() + 1 - c.min()) / 2 / K if len(c) else 0
    a, b = mid(yb - 10 * K), mid(yb + 8 * K)
    ux, uy = b - a, 18.0
    n = (ux * ux + uy * uy) ** 0.5
    # the band's own bottom line: ink rows right under its purple, in the middle of the arm
    cx = int(round((mid(yb) - x0) * K))
    r = yb + 1; lw = 0
    while r < cls.shape[0] and np.isin(cls[r, cx - 2:cx + 3], (1, 2)).all():
        lw += 1; r += 1
    # the band's half width at its lower edge (what covers the joint) and the hand's white half width just below it
    wr = cls[yb + int(3 * K)]
    wc = [x for x in range(cx - int(14 * K), cx + int(14 * K)) if 0 <= x < len(wr) and wr[x] == 0 and sel[yb + int(3 * K), x]]
    rin = ((max(wc) - min(wc) + 1) / 2 / K) if wc else half(yb) - 2.3
    # the joint's cut: 2 below the band's lower line, where the hand's sides run straight; its half widths there (with
    # the outline, and the white alone), which size the joint's two discs
    lwk = max(1.8, lw / K)
    yc = yb + 1 + int(round((lwk + 2.0) * K))
    wr2 = cls[yc]
    wc2 = [x for x in range(cx - int(16 * K), cx + int(16 * K)) if 0 <= x < len(wr2) and wr2[x] == 0 and sel[yc, x]]
    crin = ((max(wc2) - min(wc2) + 1) / 2 / K) if wc2 else rin
    rec = {'x': mid(yb) - OFF[0], 'y': (yb + 1) / K + y0 - OFF[1], 'u': [ux / n, uy / n], 'hw': half(yb + int(3 * K)),
           'r': half(yb), 'rin': rin, 'lw': lwk, 'cd': lwk + 2.0, 'cr': half(yc), 'crin': crin, 'cx': mid(yc) - OFF[0]}
    if 'wcut' in CLEAN_ARM:
        rec['wcut'] = CLEAN_ARM['wcut']
    # The wrist turns about the band's middle, on a stump: the hand's own sides run on straight up under the band from
    # just below it (where the hand is narrowest) and round over the pivot, so at rest the outline is the drawing's own
    # and a bent wrist shows the wrist coming out from under the band. Measured on the clean drawing's skin (the ring's
    # inner edge): its half width and middle a little under the band's lower line (the median of a few rows, so the
    # band line's curve at the sides does not narrow it), and the band's purple top and bottom rows for the pivot.
    if 'inside' in CLEAN_ARM:
        ins = CLEAN_ARM['inside']
        bt = ys.min()
        low = yb + 1 + lw                              # the band's bottom line's lower edge, in the middle (px)
        ws_, ms_ = [], []
        for dr in np.arange(0.6, 1.45, 0.2):
            r_ = int(round(low + dr * K))
            c = [x for x in range(cx - int(16 * K), cx + int(16 * K)) if 0 <= x < ins.shape[1] and ins[r_, x]]
            if c:
                ws_.append((max(c) + 1 - min(c)) / 2 / K); ms_.append(((min(c) + max(c) + 1) / 2) / K + x0 - OFF[0])
        if ws_:
            rs = float(np.median(ws_)); sx = float(np.median(ms_))
            yl = (low + 0.6 * K) / K + y0 - OFF[1]                          # the stump's straight sides start here
            ym = ((bt + yb + 1) / 2) / K + y0 - OFF[1]                       # the band's middle (its purple)
            uu = np.array([ux / n, uy / n])
            C = np.array([sx, yl])
            Pv = C - uu * ((yl - ym) / uu[1])
            rec['stump'] = {'c': [round(float(C[0]), 3), round(float(C[1]), 3)], 'p': [round(float(Pv[0]), 3), round(float(Pv[1]), 3)],
                            'rs': round(rs, 3), 'wo': round(float(CLEAN_ARM['Wo']), 3), 'wi': round(float(CLEAN_ARM['Wi']), 3)}
    return rec


def measure_elbow(cls, sel, box, ey):
    """Where an arm bends: the centre of its row at the elbow, its half width with the outline (r) and without (r_in),
    and the direction it hangs (from the row 16 px above to the row 16 px below), all relative to the view's origin."""
    x0, y0 = box[0], box[1]
    def row(y, m):
        xs = np.nonzero(m[int((y - y0) * K)])[0]
        return (xs.min() / K + x0, (xs.max() + 1) / K + x0) if len(xs) else None
    lo, hi = row(ey, sel), row(ey, sel & (cls == 0))
    a, b = row(ey - 16, sel), row(ey + 16, sel)
    ux, uy = (b[0] + b[1]) / 2 - (a[0] + a[1]) / 2, 32.0
    n = (ux * ux + uy * uy) ** 0.5
    return {'x': (lo[0] + lo[1]) / 2 - OFF[0], 'y': ey - OFF[1], 'r': (lo[1] - lo[0]) / 2, 'r_in': (hi[1] - hi[0]) / 2,
            'u': [ux / n, uy / n]}


def measure_eye(cls, sel, box):
    """The eye's white as an ellipse (centre, radii, angle, in sheet px), its outline's weight, and the pupil (the dark
    blob inside the white)."""
    x0, y0 = box[0], box[1]
    white = (sel & (cls == 0)).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(white)
    if n < 2:
        return None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    blob = (lab == i).astype(np.uint8)
    # the white with the pupil put back into it (the pupil is a hole in the white)
    filled = blob.copy()
    cnts, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(filled, cnts, -1, 1, -1)
    c = max(cnts, key=cv2.contourArea)
    (cx, cy), (w, h), ang = cv2.fitEllipse(c)
    pupil = filled.astype(bool) & ~blob.astype(bool)
    if pupil.sum() < 4:
        # a pupil touching the outline is not a hole: take the darkest pixels within the white's ellipse
        mask = np.zeros_like(blob); cv2.ellipse(mask, ((cx, cy), (w * 0.85, h * 0.85), ang), 1, -1)
        pupil = mask.astype(bool) & np.isin(cls, (1, 2))
    py, px = np.nonzero(pupil)
    pr = float(np.sqrt(pupil.sum() / np.pi)) / K if len(px) else 1.2
    pc = (float(px.mean()) / K + x0, float(py.mean()) / K + y0) if len(px) else (cx / K + x0, cy / K + y0)
    # the outline's weight: ink round the white
    ring = cv2.dilate(filled, disk(1.6)).astype(bool) & ~filled.astype(bool) & np.isin(cls, (1, 2))
    lw = float(ring.sum()) / max(1.0, cv2.arcLength(c, True)) / K
    return {'cx': cx / K + x0, 'cy': cy / K + y0, 'rx': w / 2 / K, 'ry': h / 2 / K, 'angle': ang,
            'pupil': {'x': pc[0], 'y': pc[1], 'r': pr}, 'line': round(max(0.9, min(2.2, lw)), 2)}


def near_skin_lines(cls, box):
    """The face's own lines (eyes, nose, mouth, jaw): ink with white on both sides somewhere close, inside the face."""
    white = (cls == 0).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2.6 * K) | 1, int(2.6 * K) | 1))
    return cv2.dilate(white, k).astype(bool)


def draw_part(P, cls, sel, box):
    kind = P['kind']
    L = []
    if kind == 'black':
        # (an opening takes off the thin bits of other parts' outlines it caught, a thumb's against a thigh; and what is
        # left loose, a finger's, goes too)
        m = clean((sel & (cls != 0)) | P.get('_over', False), 2)
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, disk(1.7))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m)
        keep = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 60 * K * K]
        m = np.isin(lab, keep)
        over = P.get('_over')
        if P['name'][:-1] in ('thigh', 'shin') and isinstance(over, np.ndarray) and over.any():
            # (a leg is a tube: where a hand lay over its edge on the sheet, filling under the hand gave the leg the hand's
            # shape, a bump on its side that showed as soon as the hand moved. Where something light (a hand: the shirt over
            # the thigh's top is black on black) touches an edge, that edge is carried straight through from the rows above
            # and below where nothing did; each side on its own, so a hand lying across the middle of a leg changes nothing.)
            # (A thigh's edge is also carried through wherever ANY later part covers it, the hand's outline or the shirt:
            # filled under those, the thigh took their pixels out to its own polygon's edge, so its top ran dead straight
            # and wider than the leg, and stepped in where they ended: a square shoulder on each leg just under the shirt,
            # 2-7 units wide, in front, back and three-quarter. A run at either end is carried on along a line fitted to
            # the leg's own edge next to it, so the leg's taper goes on up under the shirt.)
            thigh = P['name'].startswith('thigh')
            src = over if thigh else (over & (cls == 0))
            ow = cv2.dilate(src.astype(np.uint8), disk(1.0)).astype(bool)
            D = int(3 * K)
            rows = np.nonzero(m.any(1))[0]
            lo = np.array([np.nonzero(m[r])[0].min() for r in rows], float)
            hi = np.array([np.nonzero(m[r])[0].max() for r in rows], float)
            lh = np.array([ow[r, max(0, int(a) - D):int(a) + D].any() for r, a in zip(rows, lo)])
            rh = np.array([ow[r, max(0, int(b) - D):int(b) + D].any() for r, b in zip(rows, hi)])

            def carry(e, hit):
                out = e.copy()
                cr, ce = rows[~hit], e[~hit]
                mid = hit & (rows >= cr[0]) & (rows <= cr[-1])
                out[mid] = np.interp(rows[mid], cr, ce)
                n = min(len(cr), int(30 * K))
                for sel_, xs, ys, near in ((hit & (rows < cr[0]), cr[:n], ce[:n], ce[0]), (hit & (rows > cr[-1]), cr[-n:], ce[-n:], ce[-1])):
                    if sel_.any():
                        if thigh and n >= 4:
                            a_, b_ = np.polyfit(xs, ys, 1)
                            out[sel_] = a_ * rows[sel_] + b_
                        else:
                            out[sel_] = near
                return out
            if (~lh).sum() >= 2 and (~rh).sum() >= 2 and (lh.any() or rh.any()):
                lo2 = carry(lo, lh) if lh.any() else lo
                hi2 = carry(hi, rh) if rh.any() else hi
                for i, r in enumerate(rows):
                    if lh[i] or rh[i]:
                        m[r] = False; m[r, int(round(lo2[i])):int(round(hi2[i])) + 1] = True
        if P['name'] == 'torso':
            # (the shirt's bottom corners rounded a little, 3.5 units: the shirt hangs a touch wider than the legs, and its
            # square corners standing out past them read as a box for a seat in every sway of the hips. Only at the hem:
            # an opening rounds convex corners and leaves the hem's notch over the crotch as it is.)
            rows = np.nonzero(m.any(1))[0]
            if len(rows):
                op = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, disk(3.5)).astype(bool)
                band = int(rows.max() - 3 * 3.5 * K)
                m = m.copy(); m[band:] = op[band:]
        if P['name'][:-1] in ('thigh', 'shin'):
            # (and its edges are smooth: a running median over a few sheet pixels takes off the notches another part's
            # outline left in them, a far hand's against a far thigh, without touching the leg's own taper)
            rows = np.nonzero(m.any(1))[0]
            if len(rows) > 10:
                lo = np.array([np.nonzero(m[r])[0].min() for r in rows], float)
                hi = np.array([np.nonzero(m[r])[0].max() for r in rows], float)
                hw = int(7 * K)
                med = lambda a: np.array([np.median(a[max(0, i - hw):i + hw + 1]) for i in range(len(a))])
                lo2, hi2 = med(lo), med(hi)
                for i, r in enumerate(rows):
                    m[r] = False; m[r, int(round(lo2[i])):int(round(hi2[i])) + 1] = True
        L.append({'fill': 'ink', 'd': potrace_d(m, box, 40)})
    elif kind == 'hair':
        # The shirt under the hair's ends is the shirt, not the hair: its solid black, and the near-black pixels along it
        # that the JPEG tinted purple where a lock lies on it. Taken as the hair's darkest shading, they were drawn as a
        # dark purple shape over the top of his back, outlined, between the locks: from the side it read as a hood. They
        # stay in the hair (taken out of it, the hair's ends no longer reached the shirt and the background showed
        # between, specks at the shoulders and the nape), drawn black: the shirt's own black, over it.
        Lm = STRAND_SRC['L']
        solid = cv2.morphologyEx((cls == 1).astype(np.uint8), cv2.MORPH_OPEN, disk(2.5))
        n, lab, st, _ = cv2.connectedComponentsWithStats(solid, connectivity=4)
        shirt = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 600 * K * K])
        if shirt.any():
            near_black = np.isin(cls, (1, 2)) & (Lm < HAIR_SHIRT_L)
            k3 = np.ones((3, 3), np.uint8)
            for _ in range(int(HAIR_SHIRT_GROW * K)):
                shirt = cv2.dilate(shirt.astype(np.uint8), k3).astype(bool) & (near_black | shirt)
            shirt_in = sel & shirt
            # (a speck of the page shut in between the locks and the shirt is filled with hair, and gets no outline: drawn
            # as the page it was a little ring at the nape)
            near_sel = cv2.dilate(sel.astype(np.uint8), disk(2.0)).astype(bool)
            holes = ((cls == 0) & near_sel).astype(np.uint8)
            n, lab, st, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
            for i in range(1, n):
                if st[i, cv2.CC_STAT_AREA] < 40 * K * K:
                    comp = lab == i
                    ring = cv2.dilate(comp.astype(np.uint8), disk(1.5)).astype(bool) & ~comp
                    if (shirt & ring).any() and (sel & ~shirt & ring).any() and not (ring & ~sel & ~shirt & (cls == 0)).any():
                        cls = cls.copy(); cls[comp] = 3; sel = sel | comp
        else:
            shirt_in = np.zeros_like(sel)
        body = clean(sel & (cls != 0), 2)
        # small holes inside the hair are filled with hair (a strand's curl drawn as a loop: its middle is the page's
        # white, which on any other background is a hole you can see through)
        holes = (~(body | (sel & np.isin(cls, (1, 2))))).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
        body |= np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] < 40 * K * K])
        L.append({'fill': 'hair', 'd': potrace_d(body, box, 30)})
        # ink is the hair's outline only where the hair meets something else (the page, the face, the skin): black
        # inside the hair is its darkest shading, and drawn as shading
        other = (cls == 0)      # the page, the face, the skin: never the cut of a part's own polygon
        edge = cv2.dilate(other.astype(np.uint8), disk(2.2)).astype(bool)
        inner_dark = sel & (cls == 1) & ~edge
        dark = clean(sel & ~shirt_in & (((cls == 2) & ~edge) | inner_dark), 2)
        # three darks, as on the sheet, each piece by its own mean lightness there: the deep shadows (the fringe's spikes over
        # the face) nearly black, the shadows (the ends, low on his back) a dark purple, the thin dark strands a lighter
        # one. Two were too few: drawn in the deep shadows' near-black, the shadows low on his back were black patches.
        n, lab, _, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), connectivity=8)
        tone = np.zeros(n, np.uint8)
        if n > 1:
            means = ndi_mean(Lm, lab, np.arange(1, n))
            tone[1:] = np.where(means < HAIR_DEEP_L, 1, np.where(means < HAIR_SHADE_L, 2, 3))
        L.append({'fill': 'hairdeep', 'd': potrace_d(tone[lab] == 1, box, 80)})
        L.append({'fill': 'hairshade', 'd': potrace_d(tone[lab] == 2, box, 40)})
        L.append({'fill': 'hairdark', 'd': potrace_d(tone[lab] == 3, box, 30)})
        # (the shirt under the ends, black, over the hair's colour and under its strands)
        L.append({'fill': 'ink', 'd': potrace_d(clean(shirt_in, 1), box, 20)})
        L += strands(sel & ~shirt_in & (cls != 0) & ~edge, box)
        # (traced as shapes: the fringe's spikes are sharp points, which a centre line would round off)
        ink = clean(sel & np.isin(cls, (1, 2)) & edge, 1)
        L.append({'fill': 'ink', 'd': potrace_d(ink, box, 20)})
    elif kind == 'skin' and 'hug' in P:
        L += clean_arm(sel, cls, box, P.get('band_edge', False))
    elif kind == 'skin':
        # (solid black inside a skin part's box, the shirt under the neck, gets no skin under it: its cut edge would
        # show the white as a hairline; and the skin stops just inside its own outline, or a white rim shows outside
        # the line on any background but the sheet's white)
        solid = cv2.morphologyEx((sel & (cls == 1)).astype(np.uint8), cv2.MORPH_OPEN, disk(3)).astype(bool)
        body = inside_outline(clean(sel & ~solid, 2), sel & np.isin(cls, (1, 2)))
        L.append({'fill': 'skin', 'd': potrace_d(body, box, 30)})
        acc = clean(sel & np.isin(cls, (3, 4)), 1)
        L.append({'fill': 'shoe', 'd': potrace_d(acc, box, 20)})
        L += inkdraw(clean(sel & np.isin(cls, (1, 2)), 1), box, 12)
    elif kind == 'eye':
        body = clean(sel, 1)
        L.append({'fill': 'skin', 'd': potrace_d(body, box, 6)})
        ink = clean(sel & np.isin(cls, (1, 2)), 0)
        L.append({'fill': 'ink', 'd': potrace_d(ink, box, 4)})
    elif kind == 'line':
        L += inkdraw(clean(sel & np.isin(cls, (1, 2)), 0), box, 4)
    elif kind == 'shoe':
        L += clean_shoe(sel, cls, box)
    return [l for l in L if l['d']]


# ---------------------------------------------------------------- the clean line (shoes, hands)
# A small part traced as the sheet's pixels comes out ragged (a shoe is 50 sheet px long, a line 2 px wide, and the JPEG
# tints a dark line purple where it lies on purple, so half a line reads as colour). So the small parts are redrawn:
# the outline is ONE ring of even width round the part's silhouette (its outer edge on the silhouette's), every inner
# line is an even stroke along the sheet's own centre line (dark purple counted as line), carried on to the outline where
# it stops short of it and tapered where it ends free, and the colours are smooth fills under the lines.

def smask(m, s=0.5):
    """A mask with its edge smoothed (blurred and cut at half), s in sheet px."""
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), s * K) > 0.5


def largest(m):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    if n <= 1:
        return m.astype(bool)
    return lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))


def line_width(ink):
    """A line's width (sheet px): twice the distance to its edge along its centre line, the median."""
    if not ink.any():
        return 2.0
    dist = cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 5)
    v = dist[skeletonize(ink)] * 2 / K
    v = v[v > 0.6]
    return float(np.median(v)) if len(v) else 2.0


def _smooth_closed(pts, sigma):
    return np.stack([gaussian_filter1d(pts[:, 0], sigma, mode='wrap'), gaussian_filter1d(pts[:, 1], sigma, mode='wrap')], 1)


def _smooth_open(a, sigma):
    a = np.array(a, float)
    if len(a) < 5:
        return a
    pad = min(len(a) - 2, int(3 * sigma) + 1)
    b = np.vstack([2 * a[0] - a[1:pad + 1][::-1], a, 2 * a[-1] - a[-pad - 1:-1][::-1]])
    return np.stack([gaussian_filter1d(b[:, 0], sigma), gaussian_filter1d(b[:, 1], sigma)], 1)[pad:-pad]


def _resample(a, step, closed=False):
    a = np.array(a, float)
    if closed:
        a = np.vstack([a, a[:1]])
    seg = np.hypot(*np.diff(a, axis=0).T); t = np.concatenate([[0], np.cumsum(seg)])
    if t[-1] < step:
        return a
    n = max(3, int(round(t[-1] / step)))
    ts = np.linspace(0, t[-1], n + 1)
    if closed:
        ts = ts[:-1]
    return np.stack([np.interp(ts, t, a[:, 0]), np.interp(ts, t, a[:, 1])], 1)


def _sheet(pts, box):
    x0, y0 = box[0] - OFF[0], box[1] - OFF[1]
    return np.array([(x / K + x0, y / K + y0) for x, y in pts])


def _ring(c, w):
    """A closed centre line (sheet px) as a ring of even width (outer edge, inner edge back: evenodd)."""
    tan = np.roll(c, -1, 0) - np.roll(c, 1, 0); tan /= np.maximum(1e-6, np.hypot(*tan.T))[:, None]
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    A = c + nrm * w / 2; B = c - nrm * w / 2
    f = lambda p: f'{p[0]:.2f} {p[1]:.2f}'
    return 'M' + 'L'.join(f(p) for p in A) + 'Z' + 'M' + 'L'.join(f(p) for p in B[::-1]) + 'Z'


def _stroke(c, hw):
    """An open centre line (sheet px) with a half width per point, as a shape with round ends (wound one way)."""
    c = np.array(c, float); hw = np.array(hw, float)
    tan = np.gradient(c, axis=0); tan /= np.maximum(1e-6, np.hypot(*tan.T))[:, None]
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    Lp = c + nrm * hw[:, None]; Rp = c - nrm * hw[:, None]
    def cap(center, d, r, steps=7):
        b = np.arctan2(d[1], d[0])
        return [center + r * np.array([np.cos(b + a_), np.sin(b + a_)]) for a_ in np.linspace(np.pi / 2, -np.pi / 2, steps)]
    ring = np.array(list(Lp) + cap(c[-1], tan[-1], hw[-1])[1:-1] + list(Rp[::-1]) + cap(c[0], -tan[0], hw[0])[1:-1])
    area = 0.5 * np.sum(ring[:, 0] * np.roll(ring[:, 1], -1) - np.roll(ring[:, 0], -1) * ring[:, 1])
    if area < 0:
        ring = ring[::-1]
    return 'M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in ring) + 'Z'


def outline_rings(Sm, Wo, box):
    """The outline: the silhouette's edge moved in by half a line, smoothed, as even rings (sheet px centre lines)."""
    inner = cv2.erode(Sm.astype(np.uint8), disk(Wo / 2)).astype(bool)
    cs, _ = cv2.findContours(inner.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    outs = []
    for c in cs:
        if len(c) < 6 * K:
            continue
        c = c[:, 0, :].astype(float)
        c = _resample(_smooth_closed(c, 0.9 * K), 0.45 * K, closed=True)
        outs.append(_sheet(c, box))
    return outs


def inner_strokes(lines, Sm, outs, Wo, Wi, box, min_len=2.2):
    """The inner lines: line pixels away from the outline, thinned, walked, smoothed, of even width. An end that stops
    short of the outline runs on to it; a free end tapers; a piece that only doubles the outline is dropped."""
    band = Sm & ~cv2.erode(Sm.astype(np.uint8), disk(Wo)).astype(bool)
    sk = skeletonize(clean(lines & ~band, 0))
    ol = np.vstack(outs) if outs else np.zeros((0, 2))
    paths = []
    for pts in walk(sk, spur=1.4, join_deg=55):
        if len(pts) < min_len * K:
            continue
        a = _sheet(_resample(_smooth_open([(x, y) for y, x in pts], 0.9 * K), 0.4 * K), box)
        if len(ol) and np.mean([np.min(np.hypot(*(ol - q).T)) < Wo * 1.7 for q in a]) > 0.6:
            continue
        # (a skeleton curls in the last pixel or so where two lines meet: each end is set straight along the line's
        # own way a little further back)
        if len(a) > 10:
            for end in (0, -1):
                if end == 0:
                    d = a[3] - a[8]; d /= max(1e-6, np.hypot(*d))
                    for k_ in range(3):
                        a[k_] = a[3] + d * (3 - k_) * 0.4
                else:
                    d = a[-4] - a[-9]; d /= max(1e-6, np.hypot(*d))
                    for k_ in range(3):
                        a[-1 - k_] = a[-4] + d * (3 - k_) * 0.4
        paths.append(a)
    out = []
    for pi, a in enumerate(paths):
        others = np.vstack([q for qi, q in enumerate(paths) if qi != pi]) if len(paths) > 1 else np.zeros((0, 2))
        hw = np.full(len(a), Wi / 2)
        for end in (0, -1):
            p = a[end]; q = a[1 if end == 0 else -2]
            d = p - q; d /= max(1e-6, np.hypot(*d))
            dist = np.min(np.hypot(*(ol - p).T)) if len(ol) else 99
            if len(others):
                # (a line that stops just short of another, ahead of it, runs on to it)
                rel = others - p; along = rel @ d; perp = np.abs(rel @ np.array([-d[1], d[0]]))
                ok = (along > 0) & (along < Wi * 2.2) & (perp < Wi * 0.8)
                if ok.any() and along[ok].min() < dist:
                    dist = float(along[ok].min()) - Wi * 0.3
            if dist < Wo * 2.0:
                # (to just inside the outline's middle: the round end must not show past its outer edge)
                ext = np.array([p + d * s_ for s_ in np.linspace(0.2, max(0.25, dist - 0.25), 5)])
                if end == 0:
                    a = np.vstack([ext[::-1], a]); hw = np.concatenate([np.full(len(ext), Wi / 2), hw])
                else:
                    a = np.vstack([a, ext]); hw = np.concatenate([hw, np.full(len(ext), Wi / 2)])
            else:
                n_ = min(len(a) // 3, 6)
                if n_ >= 2:
                    prof = np.linspace(0.5, 1, n_)
                    if end == 0:
                        hw[:n_] *= prof
                    else:
                        hw[-n_:] *= prof[::-1]
        out.append(_stroke(a, hw))
    return ''.join(out)


def lace_shapes(Sm, Wo):
    """The laces, as the sheet draws them: each one's light middle (a grey lilac, much less purple than the canvas) is
    a small island inside its dark outline, and adjacent laces' outlines run together. The islands are taken off the
    sheet as they are, smoothed (a JPEG breaks one lace into bits: they join again), and kept if they lie inside the
    shoe and away from its white pieces and its edge (where the grey fringe of an outline looks just like one). Returns
    the light middles (upscaled px)."""
    Lm, Cm = STRAND_SRC['L'], STRAND_SRC['C']
    mid = Sm & (Lm >= 0.26) & (Lm <= 0.55) & (Cm < 0.12)
    white = (Sm & (Lm > 0.55)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(white, connectivity=4)
    bigwhite = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 4 * K * K])
    nearwhite = cv2.dilate(bigwhite.astype(np.uint8), disk(1.3)).astype(bool)
    band = Sm & ~cv2.erode(Sm.astype(np.uint8), disk(Wo + 0.9)).astype(bool)
    m = smask(mid & ~nearwhite, LACE_JOIN).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    dark = Lm < 0.22
    keep = []
    for i in range(1, n):
        if not 1.4 <= st[i, cv2.CC_STAT_AREA] / (K * K) <= 30:
            continue
        comp = lab == i
        if (comp & band).sum() > 0.5 * comp.sum():
            continue
        # (a lace lies in its own dark outline: most of what is round it is dark on the sheet. A greyish speck of JPEG in
        # the canvas, or the grey where the toe cap meets the canvas, has the canvas round it)
        ring = cv2.dilate(comp.astype(np.uint8), disk(1.2)).astype(bool) & ~comp
        if (ring & dark).sum() < LACE_RING * ring.sum():
            continue
        keep.append(i)
    return smask(np.isin(lab, keep), 0.45) & Sm


def _gap_clear(p, q):
    """The straight run between two lace ends crosses no canvas and no white (it is the lace, darkened by the JPEG)."""
    Lm, Cm = STRAND_SRC['L'], STRAND_SRC['C']
    for k_ in np.linspace(0, 1, int(np.hypot(*(q - p))) + 2):
        x, y = np.round(p + (q - p) * k_).astype(int)
        if not (0 <= y < Lm.shape[0] and 0 <= x < Lm.shape[1]) or Lm[y, x] > 0.6 or (Cm[y, x] > 0.15 and Lm[y, x] > 0.28):
            return False
    return True


def lace_bars(isl):
    """The laces as whole bars: the light middles that are pieces of one lace joined (an end near another's, the two
    lying one way, nothing but the lace between), each lace redrawn as one smooth bar of even width along a gently bowed
    centre line fitted to its pixels. A piece with no other lace near it is dropped. Returns the bars (upscaled px)."""
    n, lab, _, _ = cv2.connectedComponentsWithStats(isl.astype(np.uint8), connectivity=8)
    I = []
    for i in range(1, n):
        ys, xs = np.nonzero(lab == i)
        if len(xs) < 3:
            continue
        P = np.stack([xs, ys], 1).astype(float); c = P.mean(0)
        u = np.linalg.eigh(np.cov((P - c).T))[1][:, 1]
        t = (P - c) @ u
        I.append(dict(P=P, c=c, u=u, thick=len(P) / (t.max() - t.min() + 1), e=(c + u * t.min(), c + u * t.max())))
    par = list(range(len(I)))
    def root(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    cand, near = [], [False] * len(I)
    for a in range(len(I)):
        for b in range(a + 1, len(I)):
            A, B = I[a], I[b]
            # (how near the two come at all, pixel to pixel, for the speck test)
            dd = np.min(np.hypot(*(A['P'][:, None, :] - B['P'][None, ::3, :]).transpose(2, 0, 1)))
            if dd <= LACE_ALONE * K:
                near[a] = near[b] = True
            if abs(A['u'] @ B['u']) < np.cos(np.radians(LACE_ANG)):
                continue
            d, p, q = min(((np.hypot(*(q_ - p_)), p_, q_) for p_ in A['e'] for q_ in B['e']), key=lambda x: x[0])
            if d > LACE_GAP * K:
                continue
            u = A['u'] if len(A['P']) >= len(B['P']) else B['u']
            if d > 0.6 * K and abs((q - p) @ np.array([-u[1], u[0]])) > 0.9 * K:
                continue          # (the next lace along, beside it, not the rest of it)
            if _gap_clear(p, q):
                cand.append((d, a, b))
    for d, a, b in sorted(cand):
        par[root(a)] = root(b)
    groups = {}
    for k_ in range(len(I)):
        groups.setdefault(root(k_), []).append(k_)
    out = np.zeros(isl.shape, np.uint8)
    for g in groups.values():
        if len(groups) > 1 and not any(near[k_] for k_ in g):
            continue
        P = np.vstack([I[k_]['P'] for k_ in g]); c = P.mean(0)
        u = np.linalg.eigh(np.cov((P - c).T))[1][:, 1]; nrm = np.array([-u[1], u[0]])
        t = (P - c) @ u; s_ = (P - c) @ nrm
        th = float(np.clip(LACE_THIN * np.median([I[k_]['thick'] for k_ in g]), LACE_W[0] * K, LACE_W[1] * K))
        A_ = np.stack([np.ones_like(t), t, t * t], 1)
        coef = np.linalg.lstsq(A_, s_, rcond=None)[0]
        if abs(coef[2]) * ((t.max() - t.min()) / 2) ** 2 > 1.2 * K:     # (a little bow at most)
            coef = np.append(np.linalg.lstsq(A_[:, :2], s_, rcond=None)[0], 0)
        ts = np.linspace(t.min() + th * 0.3, t.max() - th * 0.3, 16)
        pts = c + ts[:, None] * u + (coef[0] + coef[1] * ts + coef[2] * ts * ts)[:, None] * nrm
        cv2.polylines(out, [np.round(pts * 16).astype(np.int32)], False, 255, max(1, int(round(th))), cv2.LINE_AA, shift=4)
    return out > 127


CLEAN_ARM = {}


def clean_arm(sel, cls, box, band_edge=False):
    """An arm in clean lines. Its shape is its skin's: the white and the band, with the thin lines inside them closed
    over (so a finger line does not split it), is the inside of the arm; the outline is one even ring round that
    inside, its inner edge on the skin's edge. That holds where the sheet drew a line round the arm and where it drew
    none (a hand lying on the black trousers is white against black: the ring runs along that edge). The fingers, the
    thumb and the band's edges are even strokes along the sheet's own centre lines; the band's purple is a fill with
    its white stripe left white."""
    own = sel & np.isin(cls, (0, 3, 4))
    ext = np.zeros(sel.shape, bool)
    if band_edge:
        # (a band drawn against the black shirt with no line of its own: the JPEG darkens its purple there into the
        # dark class, and read as the shirt it traced a band narrower than the hand under it, a step at the wrist. Row
        # by row, the dark run beside the band's purple is the band's.)
        p34 = sel & np.isin(cls, (3, 4))
        for r in np.nonzero(p34.any(1))[0]:
            cs = np.nonzero(p34[r])[0]
            for x0_, dx in ((cs.min() - 1, -1), (cs.max() + 1, 1)):
                x = x0_
                while 0 <= x < sel.shape[1] and sel[r, x] and cls[r, x] == 2:
                    ext[r, x] = True; x += dx
        own |= ext
    # (closing the skin bridges a line with skin on both sides, a finger's; the outline has skin on one side only and
    # stays out)
    inside = cv2.morphologyEx(own.astype(np.uint8), cv2.MORPH_CLOSE, disk(1.45)).astype(bool) & sel
    holes = (~inside).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
    inside |= np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] < 30 * K * K])
    inside = largest(smask(cv2.morphologyEx(inside.astype(np.uint8), cv2.MORPH_OPEN, disk(0.8)).astype(bool), 0.5))
    lines = sel & np.isin(cls, (1, 2))
    rim = cv2.dilate(inside.astype(np.uint8), disk(3.0)).astype(bool) & ~inside
    Wo = float(np.clip(line_width(lines & rim) * 1.06, 2.0, 2.7))
    Wi = float(np.clip(line_width(lines & inside) * 1.06, 0.78 * Wo, 0.95 * Wo))
    # the silhouette: the inside grown by a line's width (the ring's outer edge)
    Sm = smask(cv2.dilate(inside.astype(np.uint8), disk(Wo)).astype(bool), 0.3)
    CLEAN_ARM['Sm'], CLEAN_ARM['inside'], CLEAN_ARM['Wo'], CLEAN_ARM['Wi'], CLEAN_ARM['box'] = Sm, inside, Wo, Wi, box
    L = []
    base = smask(cv2.dilate(inside.astype(np.uint8), disk(Wo / 2 + 0.2)).astype(bool), 0.3)
    L.append({'fill': 'skin', 'd': potrace_d(base, box, 30)})
    pur = (sel & np.isin(cls, (3, 4))) | ext
    if pur.any():
        zone = cv2.morphologyEx(cv2.dilate(pur.astype(np.uint8), disk(1.4)), cv2.MORPH_CLOSE, disk(2.5)).astype(bool) & inside
        wh = (zone & (cls == 0)).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(wh, connectivity=4)
        stripe = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 2 * K * K])
        bandm = zone & ~(cls == 0)
        bandm = cv2.morphologyEx(bandm.astype(np.uint8), cv2.MORPH_OPEN, disk(0.6)).astype(bool) & ~stripe
        if band_edge:
            # (and its purple runs out to the band's widened edge, row by row: the ring is round the widened band)
            for r in np.nonzero(bandm.any(1))[0]:
                cs = np.nonzero(bandm[r])[0]; ii = np.nonzero(inside[r])[0]
                if len(ii):
                    bandm[r, ii.min():cs.min()] = True; bandm[r, cs.max() + 1:ii.max() + 1] = True
        bandm = smask(bandm, 0.35) & base
        L.append({'fill': 'shoe', 'd': potrace_d(bandm, box, 12)})
    # the ring: centred half a line out from the inside's edge
    grown = cv2.dilate(inside.astype(np.uint8), disk(Wo / 2)).astype(bool)
    cs, _ = cv2.findContours(grown.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    outs = []
    for c in cs:
        if len(c) < 6 * K:
            continue
        c = _resample(_smooth_closed(c[:, 0, :].astype(float), 0.8 * K), 0.45 * K, closed=True)
        outs.append(_sheet(c, box))
    L.append({'fill': 'ink', 'd': ''.join(_ring(c, Wo) for c in outs)})
    # inner lines: the ink inside (the band's dark between its stripes is the band's colour, not a line)
    band_dark = np.zeros(cls.shape, bool)
    CLEAN_ARM.pop('wcut', None)
    if pur.any():
        # (2.4 round the band's purple: the side view's band has a faint dark rim along its top that traced as a short
        # stroke from the outline, a stray tick; no other view's band has a top line)
        band_dark = cv2.dilate(pur.astype(np.uint8), disk(2.4)).astype(bool)
        # the band's bottom line, drawn here from its centre on the sheet (column by column, weighted by darkness: the
        # JPEG tints it purple, so it is read by lightness), one even stroke from outline to outline. The forearm is cut
        # along its lower edge (emonad.py), so the two agree exactly: the wrist turns under a whole line with nothing
        # of the forearm's outline below it.
        Lr = STRAND_SRC['L']
        ysb, _ = np.nonzero(pur)
        yb = ysb.max()
        cols = np.nonzero(inside[yb])[0]
        rr = np.arange(max(0, yb - int(1.5 * K)), min(Lr.shape[0], yb + int(4.5 * K)))
        cen = []
        for c in range(cols.min(), cols.max() + 1, 2):
            wgt = np.clip(0.27 - Lr[rr, c], 0, None)
            if wgt.sum() >= 0.5:
                cen.append((c, float((rr * wgt).sum() / wgt.sum())))
        if len(cen) <= 6:
            # (no line under the band on the sheet: the three-quarter view's far band, its purple straight onto the hand's
            # white. Every other band has one, and the wrist turns under it: here the hand's white ran into the purple and
            # a bent wrist opened at the band's corner. Drawn where the others are, its centre just under the purple's
            # lower edge, column by column)
            cen = []
            for c in range(cols.min(), cols.max() + 1, 2):
                rp = np.nonzero(pur[:, c])[0]
                if len(rp):
                    cen.append((c, float(rp.max() + 1 + Wi / 2 * K)))
        if len(cen) > 6:
            a_ = np.array(cen, float)
            a_[:, 1] = gaussian_filter1d(a_[:, 1], 2.0 * K / 2, mode='nearest')
            # run on to the outline's middle at each end
            d0 = a_[0] - a_[3]; d0 /= max(1e-6, np.hypot(*d0)); d1 = a_[-1] - a_[-4]; d1 /= max(1e-6, np.hypot(*d1))
            ext = Wo * K * 0.5 + 0.5 * K
            a_ = np.vstack([a_[0] + d0 * ext, a_, a_[-1] + d1 * ext])
            c_ = _sheet(_resample(a_, 0.4 * K), box)
            L.append({'fill': 'ink', 'd': _stroke(c_, np.full(len(c_), Wi / 2)), 'rule': 'nonzero'})
            tan = np.gradient(c_, axis=0); tan /= np.maximum(1e-6, np.hypot(*tan.T))[:, None]
            nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
            nrm[nrm[:, 1] < 0] *= -1                      # (pointing down the arm)
            low = c_ + nrm * (Wi / 2 - 0.05)
            CLEAN_ARM['wcut'] = [[round(float(x), 2), round(float(y), 2)] for x, y in low[::3]]
            m_ = np.zeros(cls.shape, np.uint8)
            cv2.polylines(m_, [a_.astype(np.int32).reshape(-1, 1, 2)], False, 1, int(Wi * 2.4 * K))
            band_dark |= m_.astype(bool)
    L.append({'fill': 'ink', 'd': inner_strokes(lines & inside & ~band_dark, Sm, outs, Wo, Wi, box, min_len=2.6), 'rule': 'nonzero'})
    return L


# ---------------------------------------------------------------- the hands he does not hold on the sheet
# A hand set, as cut-out rigs keep (drawn in the sheet's line, swapped in by the moves): open (a wave, a jump, a shrug),
# a fist, and pointing. Each is drawn in the hand's own frame (a: down the hand from the wrist's cut, b: across it, +b the
# side that is on top once the arm is raised palm down, where the thumb goes), sized from the arm's own hand (its half
# width at the cut, R, and its length, Lh), so it is the same hand in another shape. Shapes are unions of a palm and
# capsules (fingers, thumb), rounded; the outline is a ring outside the shape, open at the wrist (the forearm's band and
# the joint's discs are over that end); inner lines are round-ended strokes.
ARM_OUT = {'front': {'L': 1, 'R': -1}, 'back': {'L': 1, 'R': -1}, 'quarter': {'L': 1, 'R': -1}, 'side': {'L': 1, 'R': 1}}


def _cap(p0, p1, r):
    return LineString([p0, p1]).buffer(r, cap_style=1, resolution=16)


def _taper(p0, p1, r0, r1):
    """A finger: round at both ends, r0 at p0 narrowing to r1 at p1 (the hull of the two circles)."""
    from shapely.geometry import Point
    return unary_union([Point(*p0).buffer(r0, resolution=16), Point(*p1).buffer(r1, resolution=16)]).convex_hull


def _curve(pts, r, n=24):
    """A round-ended stroke along a quadratic through three points (a, b in the hand's frame)."""
    (a0, b0), (a1, b1), (a2, b2) = pts
    cpa, cpb = 2 * a1 - (a0 + a2) / 2, 2 * b1 - (b0 + b2) / 2
    t = np.linspace(0, 1, n)
    xs = (1 - t) ** 2 * a0 + 2 * (1 - t) * t * cpa + t ** 2 * a2
    ys = (1 - t) ** 2 * b0 + 2 * (1 - t) * t * cpb + t ** 2 * b2
    return LineString(list(zip(xs, ys))).buffer(r, cap_style=1, resolution=12)


def _hand_d(geom, to_xy):
    """A shapely shape (hand frame) as an SVG path in the view's units."""
    if geom.is_empty:
        return ''
    # (an intersection with the wrist's cut can leave a line or a point where an edge only touches it: areas only)
    polys = [geom] if geom.geom_type == 'Polygon' else [g for g in getattr(geom, 'geoms', []) if g.geom_type == 'Polygon']
    polys += [q for g in getattr(geom, 'geoms', []) if g.geom_type == 'MultiPolygon' for q in g.geoms]
    out = []
    for pg in polys:
        for ring in [pg.exterior] + list(pg.interiors):
            pts = [to_xy(a, b) for a, b in list(ring.coords)[:-1]]
            out.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    return ''.join(out)


SIDE_OPEN = {}   # (tuning for the side-on open hand: see hand_set; empty, its defaults)


def hand_set(view, side, w):
    Sm, Wo, Wi = CLEAN_ARM['Sm'], CLEAN_ARM['Wo'], CLEAN_ARM['Wi']
    box = CLEAN_ARM['box']
    u = np.array(w['u'], float)
    n = np.array([u[1], -u[0]])
    st = -ARM_OUT[view][side]
    Wc = np.array([w['cx'], w['y'] + u[1] * w['cd']])
    R = (w['cr'] + w['crin']) / 2 - Wo / 2          # the hand's half width at the cut, to the skin's edge
    # the hand's length: its drawing's furthest point down the arm from the cut
    ys, xs = np.nonzero(Sm)
    P_ = np.stack([xs / K + box[0] - OFF[0], ys / K + box[1] - OFF[1]], 1) - Wc
    al = P_ @ u; ac = np.abs(P_ @ n)
    Lh = float(al[(ac < 2.5 * R)].max()) - Wo
    to_xy = lambda a, b: tuple(Wc + a * u + b * st * n)
    L = Lh
    shapes = {}
    # (the top runs on up under the band at the stump's width and middle, emonad.py's wrist: the stump carries the
    # outline on round the pivot, so any shape meets it with no step)
    stp = w.get('stump')
    if stp:
        dC = np.array(stp['c'], float) - Wc
        aT, bT, rT = float(dC @ u) - 0.7, float(dC @ n) * st, float(stp['rs'])
    else:
        aT, bT, rT = -1.0, 0.0, R
    top = lambda r1: [(aT, bT + rT), (aT + 0.9, bT + rT)] if r1 > 0 else [(aT + 0.9, bT - rT), (aT, bT - rT)]
    # (his hands are a cartoon's: a thumb and three fingers, as on the sheet, where two lines part three fingers)
    fr = 0.34 * R                                   # a finger's radius (three of them side by side fill the hand)
    # open: the sheet's own hand opened out flat: a broad palm running on into three long fingers side by side, their
    # tips just apart, the two lines between them as on the sheet, the thumb out to the side and its root's crease. (Three
    # round fingers spread wide, the first drawing of it, read as a cartoon glove, a starfish beside his own hands.)
    palm = Polygon(top(1) + [(0.2 * L, R * 1.04), (0.42 * L, R * 0.98), (0.44 * L, -R * 0.98), (0.2 * L, -R * 1.02)] + top(-1))
    parts = [palm]
    a0 = 0.34 * L
    tips = []
    for b0, ang, ln in ((0.62, 11, 0.48), (0.0, 1, 0.55), (-0.62, -9, 0.46)):
        t = np.radians(ang)
        p0 = (a0, b0 * R); p1 = (a0 + ln * L * np.cos(t), b0 * R + ln * L * np.sin(t))
        parts.append(_taper(p0, p1, fr * 1.08, fr * 0.86)); tips.append(p1)
    tt = np.radians(42)
    parts.append(_cap((0.13 * L, 0.66 * R), (0.13 * L + 0.3 * L * np.cos(tt), 0.66 * R + 0.3 * L * np.sin(tt)), 0.3 * R))
    shp = unary_union(parts).buffer(0.7, resolution=16).buffer(-0.7, resolution=16)
    # (the lines between the fingers, from where they part at their tips down into the palm)
    inner = [_curve([(0.42 * L, 0.33 * R), (0.58 * L, 0.34 * R), ((tips[0][0] + tips[1][0]) / 2 - 0.42 * fr, (tips[0][1] + tips[1][1]) / 2 - 0.06 * R)], Wi / 2),
             _curve([(0.42 * L, -0.32 * R), (0.58 * L, -0.32 * R), ((tips[1][0] + tips[2][0]) / 2 - 0.42 * fr, (tips[1][1] + tips[2][1]) / 2 + 0.04 * R)], Wi / 2),
             _curve([(0.15 * L, 0.44 * R), (0.25 * L, 0.32 * R), (0.31 * L, 0.14 * R)], Wi / 2)]
    shapes['open'] = (shp, inner)
    # fist: broader than the wrist and rounded, the knuckles three bumps along its end with the creases between them, the
    # curled fingers' tips a curve across its face, and the thumb lying over them
    fe = 0.53 * L                                   # the knuckles' line
    kr = 0.38 * R
    body = Polygon(top(1) + [(0.16 * L, 1.1 * R), (0.3 * L, 1.22 * R), (fe - 0.2 * R, 1.22 * R), (fe - 0.2 * R, -1.2 * R),
                             (0.3 * L, -1.2 * R), (0.16 * L, -1.08 * R)] + top(-1))
    knuck = [_cap((fe - 0.15 * R, b * R), (fe - 0.15 * R, b * R), kr) for b in (0.82, 0.0, -0.82)]
    shp = unary_union([body] + knuck).buffer(0.9, resolution=16).buffer(-0.9, resolution=16)
    inner = [_curve([(fe + 0.2 * R, b * R), (fe - 0.05 * R, b * R), (fe - 0.32 * R, b * R + 0.05 * R)], Wi / 2) for b in (-0.41, 0.41)]
    inner.append(_curve([(0.3 * L, 0.98 * R), (0.36 * L, 0.1 * R), (0.33 * L, -0.95 * R)], Wi / 2))
    inner.append(_curve([(0.08 * L, 1.12 * R), (0.25 * L, 1.0 * R), (0.36 * L, 0.55 * R)], Wi / 2))
    shapes['fist'] = (shp, inner)
    # point: the fist with its index finger out, set in from the hand's edge with its own knuckle standing out at its
    # root, a little narrower towards the tip; the other two curled under it, a crease between, the thumb over them
    fe2 = 0.5 * L
    body = Polygon(top(1) + [(0.16 * L, 1.08 * R), (0.3 * L, 1.16 * R), (fe2 - 0.2 * R, 1.16 * R), (fe2 - 0.2 * R, -1.16 * R),
                             (0.3 * L, -1.16 * R), (0.16 * L, -1.08 * R)] + top(-1))
    curled = [_cap((fe2 - 0.12 * R, b * R), (fe2 - 0.12 * R, b * R), kr) for b in (-0.8, -0.04)]
    fb = 0.56 * R
    knuckle = _cap((fe2 - 0.25 * R, 0.78 * R), (fe2 - 0.25 * R, 0.78 * R), 0.44 * R)
    tip = 0.98 * L - fr * 0.9
    finger = unary_union([_cap((fe2 - 0.5 * R, fb), ((fe2 + tip) / 2, fb + 0.02 * R), fr * 1.02),
                          _cap(((fe2 + tip) / 2, fb + 0.02 * R), (tip, fb + 0.05 * R), fr * 0.92)])
    shp = unary_union([body, finger, knuckle] + curled).buffer(0.6, resolution=16).buffer(-0.6, resolution=16)
    inner = [_curve([(fe2 + 0.22 * R, -0.42 * R), (fe2 - 0.05 * R, -0.4 * R), (fe2 - 0.34 * R, -0.36 * R)], Wi / 2),
             _curve([(fe2 + 0.32 * R, fb - fr * 0.95), (fe2 + 0.05 * R, fb - fr * 1.0), (fe2 - 0.2 * R, fb - fr * 1.15)], Wi / 2),
             _curve([(0.08 * L, 1.08 * R), (0.25 * L, 0.95 * R), (fe2 - 0.38 * R, 0.4 * R)], Wi / 2)]
    shapes['point'] = (shp, inner)
    # horns (the rock salute): the fist with its two outer fingers out, the first on top (as the pointing finger) and the
    # last below, a little shorter and spread a touch apart; the middle one curled between them, the thumb over it
    fe4 = 0.5 * L
    body = Polygon(top(1) + [(0.16 * L, 1.08 * R), (0.3 * L, 1.16 * R), (fe4 - 0.2 * R, 1.16 * R), (fe4 - 0.2 * R, -1.16 * R),
                             (0.3 * L, -1.16 * R), (0.16 * L, -1.08 * R)] + top(-1))
    curledM = [_cap((fe4 - 0.1 * R, 0.0), (fe4 - 0.1 * R, 0.0), kr)]
    fb1, fb2 = 0.62 * R, -0.66 * R
    k1 = _cap((fe4 - 0.25 * R, 0.8 * R), (fe4 - 0.25 * R, 0.8 * R), 0.42 * R)
    k2 = _cap((fe4 - 0.25 * R, -0.82 * R), (fe4 - 0.25 * R, -0.82 * R), 0.4 * R)
    tip1, tip2 = 0.96 * L - fr * 0.9, 0.86 * L - fr * 0.9
    # (spread: the two tips well apart, as the gesture is made; close together they read as a V)
    f1 = unary_union([_cap((fe4 - 0.5 * R, fb1), ((fe4 + tip1) / 2, fb1 + 0.2 * R), fr * 1.0),
                      _cap(((fe4 + tip1) / 2, fb1 + 0.2 * R), (tip1, fb1 + 0.5 * R), fr * 0.9)])
    f2 = unary_union([_cap((fe4 - 0.5 * R, fb2), ((fe4 + tip2) / 2, fb2 - 0.2 * R), fr * 0.95),
                      _cap(((fe4 + tip2) / 2, fb2 - 0.2 * R), (tip2, fb2 - 0.5 * R), fr * 0.86)])
    shp = unary_union([body, f1, f2, k1, k2] + curledM).buffer(0.6, resolution=16).buffer(-0.6, resolution=16)
    inner = [_curve([(fe4 + 0.22 * R, 0.32 * R), (fe4 - 0.02 * R, 0.3 * R), (fe4 - 0.3 * R, 0.26 * R)], Wi / 2),
             _curve([(fe4 + 0.22 * R, -0.32 * R), (fe4 - 0.02 * R, -0.3 * R), (fe4 - 0.3 * R, -0.26 * R)], Wi / 2),
             _curve([(0.08 * L, 1.08 * R), (0.26 * L, 0.9 * R), (fe4 - 0.3 * R, 0.25 * R)], Wi / 2)]
    shapes['horns'] = (shp, inner)
    # The in-betweens, never asked for by a move: the rig shows one for a few frames whenever a hand changes shape, so a
    # hand opens and closes instead of snapping (flat: between open and the sheet's hand; curl: between it and the fist or
    # the point). Flat: the open hand's palm with its three fingers together and straight, the thumb in by the palm.
    parts = [palm]
    tips = []
    for b0, ang, ln in ((0.6, 3, 0.47), (0.0, 0, 0.53), (-0.6, -3, 0.45)):
        t = np.radians(ang)
        p0 = (a0, b0 * R); p1 = (a0 + ln * L * np.cos(t), b0 * R + ln * L * np.sin(t))
        parts.append(_taper(p0, p1, fr * 1.06, fr * 0.88)); tips.append(p1)
    tt = np.radians(20)
    parts.append(_cap((0.13 * L, 0.62 * R), (0.13 * L + 0.28 * L * np.cos(tt), 0.62 * R + 0.28 * L * np.sin(tt)), 0.3 * R))
    shp = unary_union(parts).buffer(0.7, resolution=16).buffer(-0.7, resolution=16)
    inner = [_curve([(0.42 * L, 0.3 * R), (0.6 * L, 0.3 * R), ((tips[0][0] + tips[1][0]) / 2 - 0.5 * fr, 0.3 * R)], Wi / 2),
             _curve([(0.42 * L, -0.3 * R), (0.6 * L, -0.3 * R), ((tips[1][0] + tips[2][0]) / 2 - 0.5 * fr, -0.3 * R)], Wi / 2),
             _curve([(0.15 * L, 0.44 * R), (0.25 * L, 0.32 * R), (0.31 * L, 0.14 * R)], Wi / 2)]
    shapes['flat'] = (shp, inner)
    # Curl: the hand half closed: the fingers bent over at the middle joints, longer than the fist, their tips in a line
    # across the palm, the thumb along the side
    # (midway between the sheet's hand and the fist: the fingers bent over at their middle joints, so the hand is about
    # four fifths of its length; at two thirds, the first drawing of it, it was nearly the fist and most of the closing
    # happened in the one frame from the open hand to it)
    fe3 = 0.8 * L
    body = Polygon(top(1) + [(0.16 * L, 1.06 * R), (0.34 * L, 1.1 * R), (0.56 * L, 1.06 * R), (fe3 - 0.3 * R, 0.98 * R), (fe3 - 0.3 * R, -0.96 * R),
                             (0.56 * L, -1.04 * R), (0.34 * L, -1.08 * R), (0.16 * L, -1.04 * R)] + top(-1))
    tipsC = [_cap((fe3 - 0.28 * R, b * R), (fe3 - 0.28 * R, b * R), 0.35 * R) for b in (0.66, 0.0, -0.66)]
    shp = unary_union([body] + tipsC).buffer(0.9, resolution=16).buffer(-0.9, resolution=16)
    # the creases between the fingers at their ends, the fingers' middle joints across the hand, the thumb's line
    inner = [_curve([(fe3 + 0.04 * R, b * R), (fe3 - 0.22 * R, b * R), (fe3 - 0.6 * R, b * R + 0.04 * R)], Wi / 2) for b in (-0.33, 0.33)]
    inner.append(_curve([(0.58 * L, 0.92 * R), (0.62 * L, 0.04 * R), (0.59 * L, -0.9 * R)], Wi / 2))
    inner.append(_curve([(0.08 * L, 1.08 * R), (0.25 * L, 0.98 * R), (0.4 * L, 0.6 * R)], Wi / 2))
    shapes['curl'] = (shp, inner)
    if view == 'side':
        # Side on the hand is seen edge on. Open there is the sheet's own hand (rest): spread fingers cannot be seen edge
        # on, and the front-on open hand, splayed at the camera, read as a starfish (see emonad.py: no 'open' side on).
        # The fist is drawn side on: a rounded block deeper than the wrist, the curled fingers bulging a little at the
        # front of its end; the thumb lies down its front (its inner edge a line from the wrist to its tip, low in the
        # middle), the curled index finger's end under the tip, and the knuckle's crease at the back of the end.
        upper = Polygon(top(1) + [(0.2 * L, 1.06 * R), (0.32 * L, 1.14 * R), (0.32 * L, -1.04 * R), (0.2 * L, -1.02 * R)] + top(-1))
        end = _cap((0.32 * L, 0.42 * R), (0.32 * L, -0.4 * R), 0.66 * R)          # the end, round
        curl = _cap((0.36 * L, 0.6 * R), (0.36 * L, 0.6 * R), 0.58 * R)           # the curled fingers, at its front
        shp = unary_union([upper, end, curl]).buffer(1.2, resolution=16).buffer(-1.2, resolution=16)
        tipA, tipB = 0.32 * L + 0.42 * R, 0.08 * R
        inner = [_curve([(0.07 * L, 0.64 * R), (0.24 * L, 0.6 * R), (tipA, tipB)], Wi / 2),                       # the thumb's edge
                 _curve([(tipA, tipB), (tipA + 0.28 * R, 0.3 * R), (tipA + 0.36 * R, 0.66 * R)], Wi / 2),          # its tip on the finger
                 _curve([(0.32 * L + 0.58 * R, -0.28 * R), (0.32 * L + 0.34 * R, -0.42 * R), (0.32 * L + 0.04 * R, -0.5 * R)], Wi / 2)]  # the knuckle's crease
        shapes['fist'] = (shp, inner)
        # Open, side on: the open hand turned three-quarters to us (a cartoonist's cheat: edge on, the true view, it was a
        # blade that read as a mitten or a flipper; full face it was a starfish on a figure in profile): the palm narrower
        # across, the three fingers fanned a little more so each still stands apart, the near ones over the far, the thumb
        # out at the front. Flat and curl the same way: the flat hand turned, and the side fist drawn out longer.
        SB = float(SIDE_OPEN.get('sb', 0.66))
        pal = Polygon(top(1) + [(0.2 * L, SB * R * 1.04), (0.42 * L, SB * R * 0.98), (0.44 * L, -SB * R * 0.98), (0.2 * L, -SB * R * 1.02)] + top(-1))
        def fan(spec, rfac, thumb_ang, thumb_len):
            parts_, tips_ = [pal], []
            for b0, ang, ln in spec:
                t = np.radians(ang)
                p0 = (a0, b0 * R * SB); p1 = (a0 + ln * L * np.cos(t), b0 * R * SB + ln * L * np.sin(t))
                parts_.append(_taper(p0, p1, fr * rfac, fr * rfac * 0.8)); tips_.append(p1)
            tt_ = np.radians(thumb_ang)
            th0 = (0.13 * L, 0.66 * R * SB)
            parts_.append(_taper(th0, (th0[0] + thumb_len * L * np.cos(tt_), th0[1] + thumb_len * L * np.sin(tt_)), 0.3 * R, 0.25 * R))
            return unary_union(parts_).buffer(0.7, resolution=16).buffer(-0.7, resolution=16), tips_
        shp, tips = fan(SIDE_OPEN.get('fingers', ((0.62, 19, 0.47), (0.0, 7, 0.55), (-0.62, -6, 0.46))), SIDE_OPEN.get('rf', 0.98), SIDE_OPEN.get('ta', 48), 0.29)
        mids = [((tips[i][0] + tips[i + 1][0]) / 2, (tips[i][1] + tips[i + 1][1]) / 2) for i in range(2)]
        inner = [_curve([(0.44 * L, 0.3 * R * SB), (0.6 * L, (0.3 * R * SB + mids[0][1]) / 2), (mids[0][0] - 0.45 * fr, mids[0][1])], Wi / 2),
                 _curve([(0.44 * L, -0.3 * R * SB), (0.6 * L, (-0.3 * R * SB + mids[1][1]) / 2), (mids[1][0] - 0.45 * fr, mids[1][1])], Wi / 2),
                 _curve([(0.15 * L, 0.44 * R * SB), (0.25 * L, 0.32 * R * SB), (0.31 * L, 0.14 * R * SB)], Wi / 2)]
        shapes['open'] = (shp, inner)
        shp, tips = fan(((0.6, 4, 0.47), (0.0, 1, 0.53), (-0.6, -2, 0.45)), 1.02, 22, 0.27)
        inner = [_curve([(0.44 * L, 0.3 * R * SB), (0.6 * L, 0.3 * R * SB), (tips[0][0] - 0.6 * fr, 0.31 * R * SB)], Wi / 2),
                 _curve([(0.44 * L, -0.3 * R * SB), (0.6 * L, -0.3 * R * SB), (tips[2][0] - 0.4 * fr, -0.31 * R * SB)], Wi / 2),
                 _curve([(0.15 * L, 0.44 * R * SB), (0.25 * L, 0.32 * R * SB), (0.31 * L, 0.14 * R * SB)], Wi / 2)]
        shapes['flat'] = (shp, inner)
        upper = Polygon(top(1) + [(0.2 * L, 1.06 * R), (0.52 * L, 1.1 * R), (0.52 * L, -1.04 * R), (0.2 * L, -1.02 * R)] + top(-1))
        end = _cap((0.56 * L, 0.36 * R), (0.56 * L, -0.42 * R), 0.6 * R)
        curl = _cap((0.62 * L, 0.52 * R), (0.62 * L, 0.52 * R), 0.52 * R)
        shp = unary_union([upper, end, curl]).buffer(1.2, resolution=16).buffer(-1.2, resolution=16)
        tipA, tipB = 0.56 * L + 0.4 * R, 0.1 * R
        inner = [_curve([(0.07 * L, 0.64 * R), (0.26 * L, 0.6 * R), (tipA, tipB)], Wi / 2),
                 _curve([(0.56 * L + 0.56 * R, -0.26 * R), (0.56 * L + 0.32 * R, -0.42 * R), (0.56 * L + 0.02 * R, -0.5 * R)], Wi / 2)]
        shapes['curl'] = (shp, inner)
    if view == 'back':
        # From behind he shows the backs of his hands: no line that only the palm has (the thumb's crease, the curled
        # fingers' tips across a fist's face, the thumb lying over them); the creases between the fingers stay
        shapes['open'] = (shapes['open'][0], shapes['open'][1][:2])
        shapes['flat'] = (shapes['flat'][0], shapes['flat'][1][:2])
        shapes['fist'] = (shapes['fist'][0], shapes['fist'][1][:2])
        shapes['curl'] = (shapes['curl'][0], shapes['curl'][1][:2])
        shapes['point'] = (shapes['point'][0], shapes['point'][1][1:2])
        shapes['horns'] = (shapes['horns'][0], shapes['horns'][1][:2])
    out = {}
    # (everything stops a little under the band's lower line, as the sheet's hand does: above it is the wrist's stump,
    # which carries the outline on round the pivot, and the band over it)
    cut = sbox(aT, -10 * R, 3 * L, 10 * R)
    for k, (shp, inner) in shapes.items():
        # (simplified to a twentieth of a sheet px: invisible, and a third of the bytes)
        fill = shp.buffer(Wo / 2 - 0.15, resolution=16).intersection(cut).simplify(0.05)
        ring = shp.buffer(Wo, resolution=16).difference(shp).intersection(cut).simplify(0.05)
        lines = unary_union(inner).intersection(shp.buffer(Wo * 0.4)).simplify(0.05)
        out[k] = [{'fill': 'skin', 'd': _hand_d(fill, to_xy)},
                  {'fill': 'ink', 'd': _hand_d(ring, to_xy)},
                  {'fill': 'ink', 'd': _hand_d(lines, to_xy)}]
    return out


def clean_shoe(sel, cls, box):
    """A shoe in clean lines: the white (toe cap, sole, tongue) under everything, the canvas wherever is not one of the
    white pieces, the laces as whole bars where the sheet has them (lace_shapes, lace_bars), the outline as one ring all
    round (also where the trouser goes in: that edge is the tongue's and the collar's, seen when the foot turns under
    the leg)."""
    solid = cv2.morphologyEx((sel & (cls == 1)).astype(np.uint8), cv2.MORPH_OPEN, disk(3)).astype(bool)
    # (an opening takes off the slivers of canvas left beside the trouser's edge, which the outline would ring as stubs)
    Sm = largest(smask(cv2.morphologyEx(clean(sel & ~solid, 2).astype(np.uint8), cv2.MORPH_OPEN, disk(2.2)).astype(bool), 0.6))
    lines = Sm & np.isin(cls, (1, 2))
    edge = Sm & ~cv2.erode(Sm.astype(np.uint8), disk(3.0)).astype(bool)
    Wo = float(np.clip(line_width(lines & edge), 1.9, 2.8))
    # The silhouette's edge is a line's width out from the shoe's own colours all round. Where the trouser goes in, the
    # sheet's line round the tongue and the collar is part of the trouser's black: the edge stopped at the tongue's white,
    # the outline was drawn again inside it (a tongue a line smaller than the sheet's, under a line twice as thick), and
    # a corner of black the opening had rounded off the trouser was taken for canvas (a purple tab over the tongue).
    # (only beside the trouser: elsewhere, in shadow, the laces leave dark ground far wider than a line)
    own = (Sm & ~np.isin(cls, (1, 2))).astype(np.uint8)
    by_leg = cv2.dilate(solid.astype(np.uint8), disk(2.0)).astype(bool)
    near = cv2.dilate(own, disk(Wo)).astype(bool) & sel & np.isin(cls, (1, 2)) & cv2.dilate(solid.astype(np.uint8), disk(Wo + 0.5)).astype(bool)
    corner = Sm & by_leg & ~cv2.dilate(own, disk(Wo + 0.8)).astype(bool)
    Sm = largest(smask((Sm | near) & ~corner, 0.4))
    lines = Sm & np.isin(cls, (1, 2))
    edge = Sm & ~cv2.erode(Sm.astype(np.uint8), disk(3.0)).astype(bool)
    Wi = float(np.clip(line_width(lines & ~edge), 0.8 * Wo, Wo))
    L = []
    base = smask(cv2.erode(Sm.astype(np.uint8), disk(max(0.2, Wo / 2 - 0.35))).astype(bool), 0.3)
    L.append({'fill': 'shoewhite', 'd': potrace_d(base, box, 30)})
    wh = (Sm & (cls == 0)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(wh, connectivity=4)
    bigwhite = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 6 * K * K])
    bigwhite = cv2.dilate(smask(bigwhite, 0.5).astype(np.uint8), disk(0.9)).astype(bool)
    canvas = smask(clean(Sm & ~bigwhite, 1), 0.5) & base
    L.append({'fill': 'shoe', 'd': potrace_d(canvas, box, 20)})
    outs = outline_rings(Sm, Wo, box)
    L.append({'fill': 'ink', 'd': ''.join(_ring(c, Wo) for c in outs)})
    # the laces: their light middles as the sheet has them, each in a dark outline a line wide that runs into its
    # neighbours' (closed over the hairline gaps between them, which the sheet fills with the same dark)
    lace = lace_bars(lace_shapes(Sm, Wo)) & Sm
    lace_ink = cv2.dilate(lace.astype(np.uint8), disk(0.95))
    lace_ink = cv2.morphologyEx(lace_ink, cv2.MORPH_CLOSE, disk(0.8)).astype(bool) & base
    cover = cv2.dilate(lace_ink.astype(np.uint8), disk(0.6)).astype(bool)
    L.append({'fill': 'ink', 'd': inner_strokes(lines & ~cover, Sm, outs, Wo, Wi, box), 'rule': 'nonzero'})
    L.append({'fill': 'ink', 'd': potrace_d(smask(lace_ink, 0.3), box, 8)})
    L.append({'fill': 'lace', 'd': potrace_d(lace, box, 6)})
    return L


def inside_outline(body, ink, r=0.7):
    """A fill that stops just inside its own outline: its pixels within r sheet px of its outer edge that are ink on
    the sheet are taken off it (the line drawn over it covers them; what it does not cover is then the background,
    never a white rim). Edges through its own colour (a part cut where it runs on under another) keep their fill."""
    edge = body & ~cv2.erode(body.astype(np.uint8), disk(r)).astype(bool)
    return body & ~(edge & cv2.dilate(ink.astype(np.uint8), disk(0.3)).astype(bool))


def inkdraw(m, box, turd=12):
    """Ink as the sheet drew it: thin lines from their centre lines, each point as wide as the line is there (a
    band, round at its ends); filled shapes (the fringe's spikes, a pupil) traced as shapes. Returns layers."""
    m = m.astype(np.uint8)
    if not m.any():
        return []
    thick = cv2.morphologyEx(m, cv2.MORPH_OPEN, disk(1.6))
    thick = cv2.dilate(thick, disk(0.7)) & m
    thin = (m & ~thick.astype(bool)).astype(bool)
    out = []
    if thick.any():
        out.append({'fill': 'ink', 'd': potrace_d(thick.astype(bool), box, turd)})
    if thin.any():
        dist = cv2.distanceTransform(m, cv2.DIST_L2, 5)
        sk = skeletonize(thin)
        x0, y0 = box[0] - OFF[0], box[1] - OFF[1]
        bands = []
        for pts in walk(sk, spur=1.2, join_deg=60):
            if len(pts) < 2.0 * K:
                continue
            ws = np.array([dist[y, x] for y, x in pts], float) * 2 / K
            xy = [(x / K + x0, y / K + y0) for y, x in pts]
            bands.append(band(xy, ws))
        d = ''.join(b for b in bands if b)
        if d:
            out.append({'fill': 'ink', 'd': d, 'rule': 'nonzero'})
    return out


def band(pts, ws):
    """A line of varying width as a closed shape: smoothed, resampled, offset both ways, a half circle at each end;
    always wound the same way, so that bands overlapping at a fork fill (nonzero) and never cut each other out."""
    a = np.array(pts, float); w = np.array(ws, float)
    def avg(v, k):
        if len(v) <= k:
            return v
        pad = np.concatenate([np.repeat(v[:1], k // 2, 0), v, np.repeat(v[-1:], k // 2, 0)])
        return np.array([pad[i:i + k].mean(0) for i in range(len(v))])
    ends = (a[0].copy(), a[-1].copy())
    a = avg(a, 7); w = avg(w, 11)
    # the ends stay where they were (averaging pulls them in, and lines meeting at a fork then miss each other), and
    # each runs on a little past its end so a join is always covered
    a[0], a[-1] = ends
    if len(a) > 2:
        for i, j in ((0, 1), (-1, -2)):
            d_ = a[i] - a[j]; n_ = np.hypot(*d_)
            if n_ > 1e-6:
                a[i] = a[i] + d_ / n_ * 0.5
    seg = np.hypot(*np.diff(a, axis=0).T)
    t = np.concatenate([[0], np.cumsum(seg)])
    if t[-1] < 0.8:
        return ''
    n = max(3, int(t[-1] / 0.8))
    ts = np.linspace(0, t[-1], n)
    c = np.stack([np.interp(ts, t, a[:, 0]), np.interp(ts, t, a[:, 1])], 1)
    hw = np.clip(np.interp(ts, t, w), 0.9, 3.4) / 2
    tan = np.gradient(c, axis=0); tan /= np.maximum(1e-6, np.hypot(*tan.T))[:, None]
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    Lp = c + nrm * hw[:, None]; Rp = c - nrm * hw[:, None]
    def cap(center, direction, r, steps=6):
        base = np.arctan2(direction[1], direction[0])
        return [center + r * np.array([np.cos(base + a_), np.sin(base + a_)]) for a_ in np.linspace(np.pi / 2, -np.pi / 2, steps)]
    ring = list(Lp) + cap(c[-1], tan[-1], hw[-1])[1:-1] + list(Rp[::-1]) + cap(c[0], -tan[0], hw[0])[1:-1]
    ring = np.array(ring)
    area = 0.5 * np.sum(ring[:, 0] * np.roll(ring[:, 1], -1) - np.roll(ring[:, 0], -1) * ring[:, 1])
    if area < 0:
        ring = ring[::-1]
    return 'M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in ring) + 'Z'


def disk(r_sheet):
    n = int(round(r_sheet * K)) * 2 + 1
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (n, n))


STRAND_SRC = {}
OFF = [0.0, 0.0]   # the view's origin: every coordinate written is relative to it (the feet at 0,0, up is negative)


def strands(inside, box):
    """The hair's light strands: thin lines lighter than the hair round them, found as ridges (a white top-hat of the
    lightness), thinned to their centre lines, walked end to end and redrawn as smooth strokes of their own width."""
    r = STRAND_SRC['ridge'] * inside
    ridge = apply_hysteresis_threshold(r, 0.16, 0.27)
    ridge = cv2.morphologyEx(ridge.astype(np.uint8), cv2.MORPH_OPEN, disk(0.25)).astype(bool)
    dist = cv2.distanceTransform(ridge.astype(np.uint8), cv2.DIST_L2, 3)
    sk = skeletonize(ridge)
    paths = walk(sk)
    x0, y0 = box[0], box[1]
    out = []
    for pts in paths:
        if len(pts) < 5.0 * K:      # shorter than 5 sheet px: noise
            continue
        w = float(np.mean([dist[y, x] for y, x in pts])) * 2 / K
        w = max(0.7, min(1.6, w * 0.85))
        out.append({'fill': 'hairlight', 'd': taper([(x / K + x0 - OFF[0], y / K + y0 - OFF[1]) for y, x in pts], w)})
    return out


def walk(sk, spur=3.0, join_deg=40):
    """Centre lines (a skeleton) into whole strands. The pixels are a graph (orthogonal neighbours, and diagonal ones only
    where no orthogonal pixel already links the two, so a staircase is not a tangle of triangles); it is cut into
    segments at its ends and forks; spurs (a segment from a fork to a loose end, shorter than `spur` sheet px) are cut
    off; then at every fork the two segments that carry on most nearly in a straight line are joined, again and again,
    so a strand crossed by another, or nicked by a spur, comes out whole."""
    ys, xs = np.nonzero(sk)
    P = set(zip(ys.tolist(), xs.tolist()))
    def nbrs(p):
        y, x = p
        out = [(y + dy, x + dx) for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)) if (y + dy, x + dx) in P]
        for dy, dx in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            q = (y + dy, x + dx)
            if q in P and (y + dy, x) not in P and (y, x + dx) not in P:
                out.append(q)
        return out
    N = {p: nbrs(p) for p in P}
    node = {p for p in P if len(N[p]) != 2}
    used = set()
    segs = []
    def follow(a, b):
        path = [a, b]; used.add((a, b)); used.add((b, a))
        prev, cur = a, b
        while cur not in node:
            nx = [q for q in N[cur] if q != prev]
            if not nx or (cur, nx[0]) in used:
                break
            q = nx[0]; used.add((cur, q)); used.add((q, cur)); path.append(q); prev, cur = cur, q
        return path
    for a in node:
        for b in N[a]:
            if (a, b) not in used:
                segs.append(follow(a, b))
    for a in P:   # loops with no node
        for b in N[a]:
            if (a, b) not in used:
                segs.append(follow(a, b))
    # spurs off
    deg = {}
    for sg in segs:
        for e in (sg[0], sg[-1]):
            deg[e] = deg.get(e, 0) + 1
    keep = []
    for sg in segs:
        a, b = sg[0], sg[-1]
        loose = (deg[a] == 1) != (deg[b] == 1)
        if loose and len(sg) < spur * K:
            continue
        keep.append(sg)
    segs = keep
    # join through forks, straightest pair first
    def direction(sg, at_end):
        pts = sg[-1:-9:-1] if at_end else sg[:8]
        a = np.array(pts[0], float); b = np.array(pts[-1], float)
        v = a - b
        n = np.hypot(*v)
        return v / n if n else v
    changed = True
    while changed:
        changed = False
        ends = {}
        for i, sg in enumerate(segs):
            ends.setdefault(sg[0], []).append((i, False))
            ends.setdefault(sg[-1], []).append((i, True))
        best = None
        for p, lst in ends.items():
            if len(lst) < 2:
                continue
            for u in range(len(lst)):
                for v in range(u + 1, len(lst)):
                    (i, ei), (j, ej) = lst[u], lst[v]
                    if i == j:
                        continue
                    di = direction(segs[i], ei); dj = direction(segs[j], ej)
                    ang = np.degrees(np.arccos(np.clip(-np.dot(di, dj), -1, 1)))
                    if ang < join_deg and (best is None or ang < best[0]):
                        best = (ang, i, ei, j, ej)
        if best:
            _, i, ei, j, ej = best
            a = segs[i] if ei else segs[i][::-1]
            b = segs[j][::-1] if ej else segs[j]
            merged = a + b[1:]
            segs = [sg for k, sg in enumerate(segs) if k not in (i, j)] + [merged]
            changed = True
    return segs


def taper(pts, w):
    """A strand as a filled band: the centre line smoothed and resampled, its width full in the middle and running to a
    point at both ends, as a brush stroke does."""
    a = np.array(pts, float)
    if len(a) > 7:
        k = 7
        pad = np.vstack([np.repeat(a[:1], k // 2, 0), a, np.repeat(a[-1:], k // 2, 0)])
        a = np.array([pad[i:i + k].mean(0) for i in range(len(a))])
    seg = np.hypot(*np.diff(a, axis=0).T)
    t = np.concatenate([[0], np.cumsum(seg)])
    total = t[-1]
    if total < 1:
        return ''
    n = max(4, int(total / 1.2))
    ts = np.linspace(0, total, n)
    xs = np.interp(ts, t, a[:, 0]); ys = np.interp(ts, t, a[:, 1])
    c = np.stack([xs, ys], 1)
    tan = np.gradient(c, axis=0); tan /= np.maximum(1e-6, np.hypot(*tan.T))[:, None]
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    u = ts / total
    prof = np.minimum(1, np.minimum(u, 1 - u) * 3.2) ** 0.7
    half = (w / 2) * np.maximum(prof, 0.08)
    L = c + nrm * half[:, None]; R = c - nrm * half[:, None]
    ring = np.vstack([L, R[::-1]])
    return 'M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in ring) + 'Z'


def smooth(pts):
    """A wobbly pixel walk into a smooth curve: averaged, thinned, then Catmull-Rom cubics."""
    a = np.array(pts, float)
    if len(a) > 5:
        k = 5
        pad = np.vstack([np.repeat(a[:1], k // 2, 0), a, np.repeat(a[-1:], k // 2, 0)])
        a = np.array([pad[i:i + k].mean(0) for i in range(len(a))])
    # keep a point every ~2 sheet px
    keep = [a[0]]
    for p in a[1:]:
        if np.hypot(*(p - keep[-1])) >= 2.0:
            keep.append(p)
    if np.hypot(*(a[-1] - keep[-1])) > 0.3:
        keep.append(a[-1])
    a = np.array(keep)
    if len(a) == 2:
        return f'M{a[0][0]:.2f} {a[0][1]:.2f}L{a[1][0]:.2f} {a[1][1]:.2f}'
    d = [f'M{a[0][0]:.2f} {a[0][1]:.2f}']
    for i in range(len(a) - 1):
        p0 = a[max(0, i - 1)]; p1 = a[i]; p2 = a[i + 1]; p3 = a[min(len(a) - 1, i + 2)]
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d.append(f'C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}')
    return ''.join(d)


def main():
    debug = None
    if '--debug' in sys.argv:
        debug = sys.argv[sys.argv.index('--debug') + 1]
    im = load()
    data = {'colors': COL, 'views': {}}
    for name, V in VIEWS.items():
        data['views'][name] = trace_view(name, V, im, debug)
    json.dump(data, open(OUT, 'w'))
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
