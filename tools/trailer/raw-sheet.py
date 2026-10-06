# A contact sheet of raw take frames with a 10% grid, for reading where a pet stands:
#   python3 tools/trailer/raw-sheet.py <out.png> <raw dir> <take>@<seconds> ...
import sys
from PIL import Image, ImageDraw
out, raw, *spec = sys.argv[1:]
tiles = []
for s in spec:
    take, sec = s.split('@')
    f = round(float(sec) * 60)
    im = Image.open(f'{raw}/{take}/f-{f:05d}.png').convert('RGB')
    im.thumbnail((420, 420))
    d = ImageDraw.Draw(im)
    for k in range(1, 10):
        x = im.width * k / 10; y = im.height * k / 10
        d.line([(x, 0), (x, im.height)], fill=(0, 255, 255) if k % 5 else (255, 255, 0), width=1)
        d.line([(0, y), (im.width, y)], fill=(0, 255, 255) if k % 5 else (255, 255, 0), width=1)
    d.rectangle([0, 0, 160, 16], fill=(0, 0, 0)); d.text((3, 2), s, fill=(255, 255, 255))
    tiles.append(im)
cols = 4
w, h = tiles[0].width, tiles[0].height
sheet = Image.new('RGB', (cols * (w + 4), ((len(tiles) + cols - 1) // cols) * (h + 4)), (20, 20, 20))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * (w + 4), (i // cols) * (h + 4)))
sheet.save(out)
print('wrote', out)
