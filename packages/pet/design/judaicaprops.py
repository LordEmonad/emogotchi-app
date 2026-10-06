"""The Jewish pack's item pictures -> packages/pet/props/*.svg (run by hand: python3 design/judaicaprops.py)

The shop cards need each wearable on its own, big: the kippah with the payot that come with it, and the Star of David
on its chain. Drawn with the very functions the pets wear them with (cat.py's `kippah_cap`, `ringlet`,
`interlaced_star`), so the card and the pet can never disagree. tools/items/build-art.mjs puts them on the item stage.
Kept apart from props.py so the room's props are not regenerated every time these change.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cat import INK, HAIR, STRAND, KIPPAH, KIPPAH2, ISRAEL, SILVER, SILVER2, smooth_open, path, kippah_cap, ringlet, interlaced_star
from wobble import bake

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "props"))

def svg(name, w, h, body, defs="", amp=1.0, step=4.0, decimals=1, plain=()):
    """`plain` goes under `body` without the wobble: the payot's fine coils, which the wobble would triple in bytes (an
    item picture is stored on chain, under 120 KB) for a difference nobody could see on a curl that size."""
    body = "\n".join(plain) + "\n" + bake("\n".join(body), amp=amp, freq=0.09, step=step)
    defs = bake(defs, amp=amp, freq=0.09, step=step)          # the clip's outline wobbles exactly as the cap's does
    import re
    rnd = lambda m: (f"{float(m.group(0)):.{decimals}f}".rstrip("0").rstrip("."))
    body = re.sub(r"-?\d+\.\d+", rnd, body); defs = re.sub(r"-?\d+\.\d+", rnd, defs)
    src = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           + (f'<defs>{defs}</defs>\n' if defs else '') + f'<g id="{name}">\n{body}\n</g>\n</svg>')
    open(os.path.join(OUT, name + ".svg"), "w").write(src)
    print(f"wrote {name} ({len(src) / 1024:.1f} KB)")

def kippahcard():
    """The kippah seen a little from above, so its star and both stripes show, tipped a touch; the payot hanging from
    under its rim on each side the way they hang on a pet, a corkscrew each, the far one a little shorter."""
    # the payot first: they hang from under the rim
    payot = ringlet(33, 72, 64, 5.2, 6.4, 5.2, 9.6, 7.4, phase=0.4, lw=1.9, density=12)
    payot += ringlet(117, 74, 60, 4.9, 6.4, 5.2, 9.6, 7.4, phase=0.4 + math.pi, lw=1.9, density=12)
    defs, cap = kippah_cap(75, 74, 104, 42, 13.0, rot=-5, lw=2.6, clip_id="kippahcardclip")
    svg("kippahcard", 150, 150, cap, defs, plain=payot)

def starcard():
    """The Star of David on its chain, laid out as a necklace: the chain in a deep U from the top corners, the star
    hanging from its bail, woven over and under, the flag's blue inlaid in the silver."""
    g = []
    chain = smooth_open([(14, 8), (22, 30), (36, 46), (54, 55), (68, 58.5), (75, 59.2), (82, 58.5), (96, 55), (114, 46), (128, 30), (136, 8)], 0.5)
    g.append(path(chain, "none", INK, 5.2))
    g.append(path(chain, "none", SILVER, 3.0))
    g.append(path(chain, "none", SILVER2, 1.6, 'stroke-dasharray="2.6 1.8"'))
    g += interlaced_star(75, 103, 40, 9.2, 2.4, INK, SILVER, SILVER2, ISRAEL)
    svg("starcard", 150, 150, g)

if __name__ == "__main__":
    kippahcard()
    starcard()
