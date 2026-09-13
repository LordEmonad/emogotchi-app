"""Render cat.svg and a props contact sheet with headless Chrome into renders/."""
import os, subprocess, glob
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, ".."); out = os.path.join(root, "renders")
os.makedirs(out, exist_ok=True)

def shot(name, w, h, html):
    hp = os.path.join(out, name + ".html"); open(hp, "w").write(html)
    png = os.path.join(out, name + ".png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}", f"--screenshot={png}", "file://" + hp], capture_output=True)
    return png

cat = open(os.path.join(root, "cat.svg")).read().replace('width="200" height="230"', 'width="600" height="690"')
shot("cat-600", 600, 690, f'<html><body style="margin:0;background:#200052">{cat}</body></html>')
tiles = []
for f in sorted(glob.glob(os.path.join(root, "props", "*.svg"))):
    s = open(f).read()
    tiles.append(f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px;color:#eee;font:12px sans-serif"><div style="height:200px;display:flex;align-items:center">{s}</div>{os.path.basename(f)}</div>')
shot("props", 1400, 700, f'<html><body style="margin:0;background:#200052;display:grid;grid-template-columns:repeat(5,1fr);gap:20px;padding:20px">{"".join(tiles)}</body></html>')
print("ok")
