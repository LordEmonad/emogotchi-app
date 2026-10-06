"""The park's trees through the year -> packages/pet/town/tree-{a,b}-{spring,summer,autumn,winter}.svg

The trees are drawn once (town_works.py) in the town's night lilac; each season here swaps only their foliage (and
tree-b's blossoms) for the season's colours, dark to light, so the trunks, the birdhouse and the owl stay as drawn.
(A CSS hue turn on the whole drawing turned the trunks green: 2026-09-26.) Winter is not a colour: town_works.py draws
the trees bare, with snow on their limbs (tree-{a,b}-winter), and this leaves them alone (2026-09-27).
"""
import os
T = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "town"))
LEAVES = ["#2E2046", "#46306A", "#56407E", "#6A5296"]           # dark .. light, as drawn
BLOSSOM = ["#F28CB3", "#F9D3E3"]
SEASONS = {
    "spring": (["#5A2A56", "#8A4478", "#B8649C", "#D98DBF"], ["#FFFFFF", "#FFE6F1"]),
    "summer": (["#16301F", "#244A2E", "#33633B", "#4E8649"], ["#F4F1D8", "#FFFBE8"]),
    "autumn": (["#5A2412", "#8C3616", "#BF561C", "#E48A2C"], ["#F2B14A", "#FFD98C"]),
}
for tree in ("tree-a", "tree-b"):
    src = open(os.path.join(T, tree + ".svg")).read()
    for season, (leaves, blossoms) in SEASONS.items():
        out = src
        for a, b in list(zip(LEAVES, leaves)) + list(zip(BLOSSOM, blossoms)):
            out = out.replace(f'fill="{a}"', f'fill="{b}"').replace(f'fill="{a.lower()}"', f'fill="{b}"')
        open(os.path.join(T, f"{tree}-{season}.svg"), "w").write(out)
        print("wrote", f"{tree}-{season}")
