import sys, glob
from PIL import Image
name = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 4
files = sorted(glob.glob(f"tools/shots/{name}/[0-9]*.png"))
ims = [Image.open(f) for f in files]
w, h = ims[0].size; scale = 0.5; tw, th = int(w*scale), int(h*scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols*tw, rows*th), "#000")
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th)), ((i % cols)*tw, (i // cols)*th))
sheet.save(f"tools/shots/{name}-strip.png"); print("wrote", f"tools/shots/{name}-strip.png", sheet.size)
