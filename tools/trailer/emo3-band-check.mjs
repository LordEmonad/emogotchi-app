// The band shot of the third emo trailer, checked frame by frame: each pet's measured outline (band3.json, while it plays
// and to just after its last chord; the throws then fly off the top on purpose) placed and filmed as compose.js drawBand
// does (the same cover() rule, the same camera), against the frame's edges. Prints the closest any pet comes to an edge.
//   node tools/trailer/emo3-band-check.mjs
import { readFileSync } from 'node:fs';
const { build } = await import('./emo3-timeline.mjs');
const T = build(), c = T.clips.find((k) => k.id === 'band'), B = JSON.parse(readFileSync('trailer/emo/band3.json', 'utf8'));
const W = 1920, H = 1080, BEAT = T.beat, TOP = 12;
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2), lerp = (a, b, p) => a + (b - a) * p, clamp = (v) => Math.max(0, Math.min(1, v));
const PW = B['emo3-band-cat'].w, PH = B['emo3-band-cat'].h;
let worst = { m: 1e9 };
for (let i = 0; i < c.len; i += 1) {
  const p = ease(clamp((i * 1000 / 60) / c.lenMs));
  const z = lerp(c.cam[0], c.cam[1], p) * (1 + 0.008 * Math.max(0, 1 - (1 - (1 - clamp(((c.start + i) % BEAT) / BEAT * 2.6)) ** 3)));
  const fx = lerp(c.focus[0], c.focus[2], p), fy = lerp(c.focus[1], c.focus[3], p);
  const ins = Math.round(PW * 0.012), iw = PW - 2 * ins, ih = PH - 2 * ins, ar = W / H;
  let sw = iw, sh = sw / ar; if (sh > ih) { sh = ih; sw = sh * ar; } sw /= z; sh /= z;
  const sx = ins + Math.max(0, Math.min(iw - sw, iw * fx - sw / 2)), sy = ins + Math.max(0, Math.min(ih - sh, ih * fy - sh / 2));
  for (const m of c.members) {
    const b = B[m.take], fr = Math.round(m.from * b.fps) + i, endF = (b.endMs / 1000) * b.fps + 0.25 * b.fps;
    if (fr > endF) continue;
    let near = null; for (const x of b.boxes) if (!near || Math.abs(x[0] - fr) < Math.abs(near[0] - fr)) near = x;
    const pb = [m.x + (near[1] - m.ax) * m.s, m.y + (Math.max(near[2], TOP) - m.ay) * m.s, m.x + (near[3] - m.ax) * m.s, m.y + (near[4] - m.ay) * m.s];
    const X = (v) => (v - sx) / sw * W, Y = (v) => (v - sy) / sh * H;
    const mg = Math.min(X(pb[0]), W - X(pb[2]), Y(pb[1]), H - Y(pb[3]));
    if (mg < worst.m) worst = { m: mg, frame: i, take: m.take };
  }
}
console.log(`band: ${c.len} frames; the closest a pet comes to an edge: ${worst.m.toFixed(0)} px (${worst.take}, frame ${worst.frame})${worst.m < 12 ? '  <- TOO CLOSE' : ''}`);
