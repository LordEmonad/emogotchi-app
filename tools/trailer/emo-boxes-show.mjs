// What emo-boxes.mjs measured, at the moments the cut uses (cue-relative): node tools/trailer/emo-boxes-show.mjs
import { readFileSync } from 'node:fs';
const all = JSON.parse(readFileSync('trailer/emo/boxes.json', 'utf8'));
const at = (bx, ms) => bx.reduce((a, b) => (Math.abs(b[0] - ms) < Math.abs(a[0] - ms) ? b : a));
const f = (b) => `x ${((b[1] + b[3]) / 2).toFixed(2)} y ${((b[2] + b[4]) / 2).toFixed(2)} w ${(b[3] - b[1]).toFixed(2)} h ${(b[4] - b[2]).toFixed(2)}  [${b.slice(1).map((v) => v.toFixed(2)).join(', ')}]`;
for (const [k, v] of Object.entries(all)) {
  const g = v.cues.filter((c) => /^guitar/.test(c[1]));
  const first = (n) => v.cues.find((c) => c[1] === n)?.[0];
  console.log(k, 'cues', v.cues.slice(0, 8).map((c) => c[1] + '@' + c[0]).join(' '));
  for (const [label, ms] of [['start', 0], ['land+0.3', (first('thud') ?? first('boing') ?? 0) + 300], ['grab', first('pop')], ['grab+0.7', (first('pop') ?? -1e9) + 700], ['riff mid', (g[2]?.[0] ?? -1e9) + 2800], ['final+0.3', (g[2]?.[0] ?? -1e9) + 6020], ['throw', (g[2]?.[0] ?? -1e9) + 6900], ['shutter', first('shutter')]]) {
    if (ms === undefined || ms < 0) continue;
    console.log(`   ${label.padEnd(10)} ${String(ms).padStart(6)}  ${f(at(v.boxes, ms))}`);
  }
}
