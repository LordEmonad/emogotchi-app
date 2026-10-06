"""The pets for the street: cat.svg and frog.svg with thinner path data -> packages/pet/{cat,frog}-lite.svg.

On the street a pet stands ~130 px tall, and the browser has to render each one afresh as it scrolls into view. The
wobble bake samples every outline every 4 svg units, which is detail for the full-size room; here each subpath's
points are thinned (Douglas-Peucker at EPS svg units, about half a device pixel at street size) and joined again with
the bake's own Catmull-Rom curves. Only the `d` of paths changes: every group, id, class, clip and transform is kept,
so the rig drives it exactly as it drives the original.
"""
import os, re, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wobble import parse, _catmull

HERE = os.path.dirname(os.path.abspath(__file__))
PET = os.path.normpath(os.path.join(HERE, ".."))
EPS = float(os.environ.get("LITE_EPS", "0.45"))

def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
    best, bi = -1.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L if L > 1e-9 else math.dist(p, a)
        if d > best: best, bi = d, i
    if best <= eps: return [a, b]
    return dp(pts[:bi + 1], eps)[:-1] + dp(pts[bi:], eps)

def simplify(d):
    subs = parse(d)
    out = []
    for closed, segs in subs:
        if not segs: continue
        # on-curve points in order; a segment that is a straight L between two points stays a corner
        pts = [segs[0][1]] + [s[-1] for s in segs]
        if len(segs) < 6:   # small shapes (eyes, glints, stitches): leave exactly as baked
            out.append(None); continue
        keep = dp(pts, EPS)
        if len(keep) < 4: keep = pts[::max(1, len(pts) // 4)] + [pts[-1]]
        out.append((closed, keep))
    if all(o is None for o in out): return d
    # rebuild: untouched subpaths verbatim, thinned ones as a catmull spline through the kept points
    pieces = re.split(r"(?=M)", d.strip()); pieces = [p for p in pieces if p.strip()]
    res = []
    for piece, o in zip(pieces, out + [None] * (len(pieces) - len(out))):
        if o is None: res.append(piece.strip()); continue
        closed, keep = o
        s = f"M{keep[0][0]:.2f},{keep[0][1]:.2f} " + " ".join(_catmull(keep))
        res.append(s + (" Z" if closed else ""))
    return " ".join(res)

# groups copied across verbatim, per drawing: thinning a small shape's few long curves can bow them out (Thiccums' crown
# grew a bulge at its right end), and at a few hundred bytes they cost nothing
KEEP = {"thiccums": ["crown"], "emonadgotchi": ["crown"]}

def group_span(s, gid):
    """(start, end) of the whole <g id="gid"> element, nested groups and all, or None."""
    i = s.find(f'<g id="{gid}"')
    if i < 0: return None
    depth, j = 0, i
    for m in re.finditer(r"<g\b|</g>", s[i:]):
        depth += 1 if m.group(0) == "<g" else -1
        if depth == 0: return (i, i + m.end())
    return None

def lite(name):
    src = open(os.path.join(PET, name + ".svg")).read()
    before = src.count(" C") + src.count("C")
    def repl(m):
        tag = m.group(0); dm = re.search(r'\sd="([^"]*)"', tag)
        if not dm: return tag
        try: nd = simplify(dm.group(1))
        except Exception: return tag
        nd = re.sub(r"-?\d+\.\d+", lambda x: f"{float(x.group(0)):.1f}".rstrip("0").rstrip("."), nd)
        return tag.replace(dm.group(0), f' d="{nd}"')
    out = re.sub(r"<path\b[^>]*>", repl, src)
    for gid in KEEP.get(name, []):
        a, b = group_span(src, gid), group_span(out, gid)
        if a and b: out = out[:b[0]] + src[a[0]:a[1]] + out[b[1]:]
    open(os.path.join(PET, name + "-lite.svg"), "w").write(out)
    print(name, f"{len(src)//1024} KB -> {len(out)//1024} KB, curves {before} -> {out.count('C')}")

if __name__ == "__main__":
    for n in sys.argv[1:] or ["cat", "frog", "thiccums", "r3tards", "emonadgotchi"]: lite(n)   # not sahur: he is already light, and his precise cap and bat do not survive the thinning
