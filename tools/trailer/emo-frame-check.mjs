// Every frame of the emo pack trailer, checked: is each pet whole in its frame, and clear of the words written over it?
// It maps the pet's measured box (trailer/emo/boxes.json, emo-boxes.mjs) at each moment of each shot through the same
// zoom, centre and cover() rule the film is drawn with (emo-frame.mjs), and reports the closest the pet comes to an edge
// of its frame (or tile) and any overlap with a caption, a name tag or a scrawl.
//   node tools/trailer/emo-frame-check.mjs [--all]      (--all prints every shot, not only the ones in trouble)
// (TIMELINE=tools/trailer/emo3-timeline.mjs checks the third cut: its shots of the second's takes and its transformations;
// the band, the slow motion and the photo dump are checked by eye, see that file)
const TL = await import(process.env.TIMELINE ? new URL(`../../${process.env.TIMELINE}`, import.meta.url).href : './emo-timeline.mjs');
const { build, boxOver } = TL;
const WORDS = TL.WORDS ?? { caption: [0, 0.58, 0.42, 1] };
import { toFrame } from './emo-frame.mjs';

const ALL = process.argv.includes('--all');
const T = build();
const FPS = 60, BEAT = T.beat;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x) => Math.max(0, Math.min(1, x));
const STEP = 0.05;   // seconds of take a box sample covers
const EDGE = 0.012;  // a pet this close to an edge (of the frame's size) counts as touching it

/** the pet's box at second `t` of a take, as the shot frames it */
function boxAt(take, aim, t) {
  const { on = 'boxes', also, props, extra, grow, box } = aim ?? {};
  let u = box ?? boxOver(take, t, STEP / 0.35, on) ?? boxOver(take, t, STEP / 0.35);
  if (!u) return null;
  const add = (b) => { if (b) u = [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]; };
  if (also) add(boxOver(take, t, STEP / 0.35, also));
  if (props) { const pb = boxOver(take, t, STEP / 0.35, 'props'); if (pb) add(pb.map((v, i) => (i % 2 ? Math.max(0, Math.min(1, v)) : v))); }
  if (extra) add(extra);
  if (grow) u = [u[0] - grow[0], u[1] - grow[1], u[2] + grow[2], u[3] + grow[3]];
  return u;
}
// (a print's words are set beside it, never over it: only a full-bleed shot can have words over its pet)
const wordsOf = (c) => (c.layout === 'fill' && (c.title || c.hand) ? 'caption' : null);
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const f3 = (v) => v.toFixed(3);

let bad = 0;
for (const c of T.clips) {
  // (the Emonadgotchi cut's fit checks and the selfie's viewfinder are prints too)
  if (['fill', 'print', 'fit', 'viewfinder'].includes(c.layout) && c.take && c.zoom) {
    const AR = c.print ? c.print.w / c.print.h : 16 / 9;
    const words = wordsOf(c);
    let worst = { m: 9, at: 0, side: '' }, hit = 0, z0 = Infinity, z1 = 0;
    for (let i = 0; i < c.len; i += 2) {
      const ms = (i * 1000) / FPS, p = easeInOut(clamp(ms / c.lenMs));
      const zb = lerp(c.zoom[0], c.zoom[1] ?? c.zoom[0], p);
      const fc = c.focus;
      const fx = fc.length === 4 ? lerp(fc[0], fc[2], p) : fc[0], fy = fc.length === 4 ? lerp(fc[1], fc[3], p) : fc[1];
      const b = boxAt(c.take, c.aim, (c.from ?? 0) + ms / 1000);
      if (!b) continue;
      for (const z of c.pulse && !c.print ? [zb, zb * 1.02] : [zb]) {
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
        const f = toFrame(b, z, fx, fy, AR);
        for (const [side, m] of [['left', f[0]], ['top', f[1]], ['right', 1 - f[2]], ['bottom', 1 - f[3]]]) if (m < worst.m) worst = { m, at: ms, side };
        if (words) hit = Math.max(hit, overlap(f, WORDS[words]) / ((f[2] - f[0]) * (f[3] - f[1])));
      }
    }
    const ok = worst.m >= EDGE && hit === 0;
    if (!ok) bad += 1;
    if (!ok || ALL) console.log(`${ok ? '  ' : '!!'} ${c.id.padEnd(12)} closest ${f3(worst.m)} (${worst.side} at ${(worst.at / 1000).toFixed(2)}s)  words ${hit ? (hit * 100).toFixed(1) + '% under ' + words : 'clear'}  zoom ${z0.toFixed(2)}-${z1.toFixed(2)} ${c.print ? 'print' : 'full bleed'}${z0 < 1 ? ' (BELOW 1: blurred sides)' : ''}`);
  }
  if (c.layout === 'grid') {
    for (const [k, t] of c.tiles.entries()) {
      let worst = { m: 9, at: 0, side: '' };
      for (let i = 0; i < c.len; i += 2) {
        const ms = (i * 1000) / FPS;
        const b = boxAt(t.take, t.aim, (t.from ?? 0) + ms / 1000);
        if (!b) continue;
        for (const z of [t.zoom]) {
          const f = toFrame(b, z, t.focus[0], t.focus[1], t.print.w / t.print.h);
          for (const [side, m] of [['left', f[0]], ['top', f[1]], ['right', 1 - f[2]], ['bottom', 1 - f[3]]]) if (m < worst.m) worst = { m, at: ms, side };
        }
      }
      const ok = worst.m >= EDGE;
      if (!ok) bad += 1;
      if (!ok || ALL) console.log(`${ok ? '  ' : '!!'} ${(c.id + '/' + k).padEnd(12)} closest ${f3(worst.m)} (${worst.side} at ${(worst.at / 1000).toFixed(2)}s)  zoom ${t.zoom.toFixed(2)}`);
    }
  }
}
console.log(bad ? `${bad} shot(s) cut a pet or put it under words` : 'every pet whole and clear of the words, every frame');
process.exit(bad ? 1 : 0);
