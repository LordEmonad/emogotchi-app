# python3 tools/emonad/smooth.py <dir> <prefix> [tmin tmax] : how smooth a filmed turn is. The frames (one PNG per 60 fps frame,
# named <prefix><ms>.png, e.g. from the scratchpad region.cjs) are blurred and differenced: the frame-to-frame change, its
# biggest spike against the mean (max/mean: a swap that pops shows here) and the change's own change (jerk).
import sys, glob, os
import numpy as np
from PIL import Image, ImageFilter
d, pre = sys.argv[1], sys.argv[2]
tmin = float(sys.argv[3]) if len(sys.argv) > 3 else -1; tmax = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
fs = []
for f in glob.glob(os.path.join(d, pre + '*.png')):
    t = float(os.path.basename(f)[len(pre):-4])
    if tmin <= t <= tmax: fs.append((t, f))
fs.sort()
ims = [np.asarray(Image.open(f).convert('L').filter(ImageFilter.GaussianBlur(2)), float) for _, f in fs]
D = np.array([np.mean(np.abs(ims[i + 1] - ims[i])) for i in range(len(ims) - 1)])
J = np.abs(np.diff(D))
print(f'{pre:22s} frames {len(ims)}  change: sum {D.sum():.1f} max {D.max():.2f} median {np.median(D):.2f}  max/mean {D.max() / D.mean():.2f}  jerk max {J.max():.2f} sum {J.sum():.1f}')
print('   ', ' '.join(f'{x:.1f}' for x in D))
