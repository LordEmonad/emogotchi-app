"""Bake a hand-drawn wobble into SVG geometry.

Replaces every <path>, <circle>, <ellipse> and <rect> with a path whose
outline has been resampled and displaced by smooth 2-D value noise. The noise
is a function of position, so shapes that share an edge stay glued together,
and corners are kept because each original segment is smoothed on its own.
No runtime filter is needed afterwards.
"""
import math, re, random

# ---------------- noise ----------------
_SEED = 3
def _hash(ix, iy, k):
    n = (ix * 374761393 + iy * 668265263 + k * 1442695041 + _SEED * 97) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0 * 2 - 1

def _smooth(t):
    return t * t * (3 - 2 * t)

def _value(x, y, k):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = _smooth(x - ix), _smooth(y - iy)
    a = _hash(ix, iy, k); b = _hash(ix + 1, iy, k)
    c = _hash(ix, iy + 1, k); d = _hash(ix + 1, iy + 1, k)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def noise(x, y, amp, freq):
    dx = _value(x * freq, y * freq, 1) + 0.5 * _value(x * freq * 2.1, y * freq * 2.1, 3)
    dy = _value(x * freq, y * freq, 2) + 0.5 * _value(x * freq * 2.1, y * freq * 2.1, 4)
    return (amp * dx / 1.5, amp * dy / 1.5)

# ---------------- path parsing ----------------
_NUM = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
def _tokens(d):
    return re.findall(r"[MLCQZmlcqz]|" + _NUM, d)

def parse(d):
    """-> list of subpaths; each is (closed, [segments]); segment = ('L', p0, p1) or ('C', p0, c1, c2, p1)."""
    toks = _tokens(d); i = 0; subs = []; cur = None; start = None; pos = None
    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    cmd = None
    while i < len(toks):
        t = toks[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t; i += 1
            if cmd in "Zz":
                if cur is not None:
                    cur[0] = True
                    if pos != start:
                        cur[1].append(("L", pos, start))
                    pos = start
                continue
        if cmd == "M":
            p = (num(), num())
            cur = [False, []]; subs.append(cur); start = pos = p; cmd = "L"
        elif cmd == "L":
            p = (num(), num()); cur[1].append(("L", pos, p)); pos = p
        elif cmd == "C":
            c1 = (num(), num()); c2 = (num(), num()); p = (num(), num())
            cur[1].append(("C", pos, c1, c2, p)); pos = p
        elif cmd == "Q":
            c = (num(), num()); p = (num(), num())
            c1 = (pos[0] + 2/3 * (c[0] - pos[0]), pos[1] + 2/3 * (c[1] - pos[1]))
            c2 = (p[0] + 2/3 * (c[0] - p[0]), p[1] + 2/3 * (c[1] - p[1]))
            cur[1].append(("C", pos, c1, c2, p)); pos = p
        else:
            raise ValueError("unsupported path command " + str(cmd))
    return [(c, s) for c, s in subs]

def _bez(p0, c1, c2, p1, t):
    u = 1 - t
    return (u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p1[0],
            u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p1[1])

def _seg_len(seg):
    if seg[0] == "L":
        return math.dist(seg[1], seg[2])
    pts = [seg[1], seg[2], seg[3], seg[4]]
    return sum(math.dist(pts[i], pts[i+1]) for i in range(3))

def _samples(seg, step):
    L = _seg_len(seg); n = max(1 if seg[0] == "L" else 4, int(round(L / step)))
    out = []
    for k in range(n + 1):
        t = k / n
        if seg[0] == "L":
            out.append((seg[1][0] + (seg[2][0]-seg[1][0])*t, seg[1][1] + (seg[2][1]-seg[1][1])*t))
        else:
            out.append(_bez(seg[1], seg[2], seg[3], seg[4], t))
    return out

def _catmull(pts):
    """open Catmull-Rom through pts -> 'C...' commands (no leading M)."""
    n = len(pts); out = []
    if n == 2:
        return [f"L{pts[1][0]:.2f},{pts[1][1]:.2f}"]
    for i in range(n - 1):
        p0 = pts[max(i-1, 0)]; p1 = pts[i]; p2 = pts[i+1]; p3 = pts[min(i+2, n-1)]
        c1 = (p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6)
        c2 = (p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6)
        out.append(f"C{c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}")
    return out

def wobble_d(d, amp=1.1, freq=0.09, step=4.0):
    out = []
    for closed, segs in parse(d):
        if not segs:
            continue
        first = True
        for seg in segs:
            pts = _samples(seg, step)
            disp = []
            for (x, y) in pts:
                dx, dy = noise(x, y, amp, freq); disp.append((x + dx, y + dy))
            if first:
                out.append(f"M{disp[0][0]:.2f},{disp[0][1]:.2f}"); first = False
            out += _catmull(disp)
        if closed:
            out.append("Z")
    return " ".join(out)

# ---------------- element conversion ----------------
K = 0.5522847498
def ellipse_d(cx, cy, rx, ry):
    return (f"M{cx+rx},{cy} C{cx+rx},{cy+ry*K} {cx+rx*K},{cy+ry} {cx},{cy+ry} "
            f"C{cx-rx*K},{cy+ry} {cx-rx},{cy+ry*K} {cx-rx},{cy} "
            f"C{cx-rx},{cy-ry*K} {cx-rx*K},{cy-ry} {cx},{cy-ry} "
            f"C{cx+rx*K},{cy-ry} {cx+rx},{cy-ry*K} {cx+rx},{cy} Z")

def _attr(tag, name):
    m = re.search(r'\b' + name + r'="([^"]*)"', tag)
    return m.group(1) if m else None

def _strip(tag, names):
    for n in names:
        tag = re.sub(r'\s' + n + r'="[^"]*"', "", tag)
    return tag

def bake(svg, **kw):
    def path_repl(m):
        tag = m.group(0); d = _attr(tag, "d")
        return tag.replace(f'd="{d}"', f'd="{wobble_d(d, **kw)}"')
    svg = re.sub(r"<path\b[^>]*>", path_repl, svg)

    def circle_repl(m):
        tag = m.group(0)
        cx, cy, r = (float(_attr(tag, a)) for a in ("cx", "cy", "r"))
        rest = _strip(tag[len("<circle"):], ("cx", "cy", "r"))
        return "<path d=\"" + wobble_d(ellipse_d(cx, cy, r, r), **kw) + "\"" + rest
    svg = re.sub(r"<circle\b[^>]*>", circle_repl, svg)

    def ellipse_repl(m):
        tag = m.group(0)
        cx, cy, rx, ry = (float(_attr(tag, a)) for a in ("cx", "cy", "rx", "ry"))
        rest = _strip(tag[len("<ellipse"):], ("cx", "cy", "rx", "ry"))
        return "<path d=\"" + wobble_d(ellipse_d(cx, cy, rx, ry), **kw) + "\"" + rest
    svg = re.sub(r"<ellipse\b[^>]*>", ellipse_repl, svg)

    def rect_repl(m):
        tag = m.group(0)
        x, y, w, h = (float(_attr(tag, a)) for a in ("x", "y", "width", "height"))
        rest = _strip(tag[len("<rect"):], ("x", "y", "width", "height"))
        d = f"M{x},{y} L{x+w},{y} L{x+w},{y+h} L{x},{y+h} Z"
        return "<path d=\"" + wobble_d(d, **kw) + "\"" + rest
    svg = re.sub(r"<rect\b[^>]*>", rect_repl, svg)
    return svg
