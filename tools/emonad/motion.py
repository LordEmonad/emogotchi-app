# python3 tools/emonad/motion.py <motion.json> : velocity jumps (jerks) per bone, per case (see motion.cjs)
import sys, json
import numpy as np
D = json.load(open(sys.argv[1])); dt = 1 / 120
rows = []
for key, fr in D.items():
    bones = [b for b in fr[0] if not b.startswith('__')]
    fac = [f['__f'] for f in fr]
    for b in bones:
        P = np.array([f.get(b, [np.nan, np.nan]) for f in fr], float)
        if np.isnan(P).any(): continue
        v = np.diff(P, axis=0) / dt            # host units / s
        a = np.diff(v, axis=0) / dt
        am = np.linalg.norm(a, axis=1)
        vm = np.linalg.norm(v, axis=1)
        # a jerk: one frame's acceleration far above its neighbourhood's
        for i in range(3, len(am) - 3):
            if fac[i] != fac[i + 1] or fac[i + 1] != fac[i + 2]: continue
            nb = np.median(np.r_[am[max(0, i - 12):i - 1], am[i + 2:i + 13]])
            dv = np.linalg.norm(v[i + 1] - v[i])     # the change of velocity in this frame (units/s)
            if dv > 60 and am[i] > 6 * max(nb, 200):
                rows.append((round(dv), key, b, round(i * dt, 3)))
rows.sort(reverse=True)
seen = set(); n = 0
for dv, key, b, t in rows:
    k = (key, round(t, 1))
    if k in seen: continue
    seen.add(k); n += 1
    if n <= 80: print(f"{key:22s} t={t:5.3f}  {b:8s} dv={dv}")
print('jerks', len(rows), 'distinct moments', len(seen))
