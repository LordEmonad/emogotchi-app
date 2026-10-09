// node tools/emonad/knee-edges.cjs > edges.json : each leg's edges at the knee, measured on packages/pet/emonad.svg (no
// server). Paste the result into emonad.py KNEE_EDGES (only after the legs or their pivots change: the rig's knee is
// drawn from these numbers every frame, so a stale set shows as a step at the front of a bent knee).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const svg = fs.readFileSync(require('node:path').join(__dirname, '..', '..', 'packages', 'pet', 'emonad.svg'), 'utf8');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage();
  await p.setContent(`<html><body>${svg}</body></html>`);
  const out = await p.evaluate(() => {
    const res = {};
    for (const g of document.querySelectorAll('.view')) {
      const v = g.dataset.view, piv = JSON.parse(g.dataset.pivots);
      res[v] = {};
      for (const s of ['L', 'R']) {
        const H = piv['thigh' + s], K = piv['shin' + s], A = piv['foot' + s];
        if (!H || !K || !A) continue;
        const one = (part, a, bb, sgn) => {
          // sgn -1: the thigh (samples above the knee), +1: the shin (below)
          const el = g.querySelector(`[data-part="${part}${s}"]`);
          const paths = [...el.querySelectorAll('path')].filter((q) => !q.closest('clipPath') && !q.classList.contains('knee'));
          const L = Math.hypot(bb[0] - a[0], bb[1] - a[1]); const u = [(bb[0] - a[0]) / L, (bb[1] - a[1]) / L]; const w = [-u[1], u[0]];
          const inside = (x, y) => paths.some((q) => q.isPointInFill(new DOMPoint(x, y)));
          const edge = {};
          for (const side of [1, -1]) {
            const pts = [];
            for (let d = 3; d <= 27; d += 2) {
              const cx = K[0] + u[0] * d * sgn, cy = K[1] + u[1] * d * sgn;
              let last = null;
              for (let t = 0; t <= 45; t += 0.02) { if (inside(cx + w[0] * t * side, cy + w[1] * t * side)) last = t; }
              if (last !== null) pts.push([d * sgn, last]);
            }
            // least squares t = a + b d
            const n = pts.length, sd = pts.reduce((q, z) => q + z[0], 0), st = pts.reduce((q, z) => q + z[1], 0);
            const sdd = pts.reduce((q, z) => q + z[0] * z[0], 0), sdt = pts.reduce((q, z) => q + z[0] * z[1], 0);
            const bq = (n * sdt - sd * st) / (n * sdd - sd * sd), aq = (st - bq * sd) / n;
            const res2 = Math.max(...pts.map((z) => Math.abs(z[1] - (aq + bq * z[0]))));
            const P0 = [K[0] + w[0] * aq * side, K[1] + w[1] * aq * side];
            // direction away from the knee: along u*sgn, with t changing by bq per unit d (d itself signed)
            let dx = u[0] * sgn + w[0] * side * bq * sgn, dy = u[1] * sgn + w[1] * side * bq * sgn;
            const m = Math.hypot(dx, dy); dx /= m; dy /= m;
            edge[side > 0 ? 'p' : 'n'] = [+P0[0].toFixed(3), +P0[1].toFixed(3), +dx.toFixed(5), +dy.toFixed(5), +res2.toFixed(3), n];
          }
          return { u: [+u[0].toFixed(5), +u[1].toFixed(5)], edge };
        };
        const th = one('thigh', H, K, -1), sh = one('shin', K, A, 1);
        res[v][s] = { K, thigh: th, shin: sh };
      }
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
