// Where each pet is, through each emo-trailer take's action: the box of what is VISIBLE of its drawing (#figure, with
// what it holds) as fractions of the stage, every 50 ms, timed like the take (ms from the action's start, with the
// take's cues beside). Not #figure's own box: that counts the parts drawn at opacity 0 (the z's, the halo, a hidden
// prop copy), which put the frok's right edge 0.08 of the room too far out and the r3tard's top 0.11 too high.
// `props` is the box of the director's props on the stage at the same moments (the guitar on the floor, the phone);
// `beanie` the beanie's (with its hair) and `lips` the lip rings' showing (the shots about those two frame on them);
// `body` the pet without what it holds and `held` the guitar or phone in its hands (Thiccums' guitar falls into him from
// above the room inside his own drawing, so his shots frame his body).
// The cut (emo-timeline.mjs) frames its shots from these instead of from guesses off thumbnails.
//   node tools/trailer/emo-boxes.mjs [take ...]      (BASE = the emo capture build, default http://127.0.0.1:5393)
// Writes trailer/emo/boxes.json: { take: { boxes: [[ms, x0, y0, x1, y1], ...], props: [[ms, x0, y0, x1, y1] | [ms], ...],
// cues: [[ms, name], ...] } }.
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { EMO as EMO2 } from './emo-takes.mjs';
import { EMO3 } from './emo3-takes.mjs';
// (the third trailer's transformations too; its cut-outs and slow motion are measured otherwise: emo3-band.py, and the
// slow motion is framed on the same moments of the second's take)
const EMO = { ...EMO2, ...EMO3 };

const BASE = process.env.BASE ?? 'http://127.0.0.1:5393';
const OUT = 'trailer/emo/boxes.json';
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(EMO2);
const all = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
// one page at a time, in front, unthrottled: a page in a background tab runs its timers late and the scene crawls
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
for (const name of names) {
  const t = EMO[name];
  const p = await b.newPage();
  await p.bringToFront();
  await p.setViewport({ width: t.w, height: t.h });
  await p.goto(BASE + t.path, { waitUntil: 'networkidle2', timeout: 120000 });
  await p.waitForFunction(t.ready, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  await p.evaluate(`(async () => { ${t.prep} })()`);
  await p.waitForFunction(t.idle, { timeout: 60000 });
  const res = await p.evaluate(async (action, ms) => {
    const stage = document.querySelector('.stage');
    const fig = () => document.querySelector('.stage .cathost #figure') ?? document.querySelector('.stage .cathost svg');
    const SKIP = new Set(['defs', 'clipPath', 'mask', 'title', 'linearGradient', 'radialGradient', 'pattern', 'symbol']);
    const shown = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.03; };
    // the union of the rects of every visible leaf (a group is entered only if it is visible itself)
    const visible = (root, skip = null, box = null) => {
      const walk = (el) => {
        for (const c of el.children) {
          if (SKIP.has(c.tagName) || (skip && c.matches(skip)) || !shown(c)) continue;
          if ((c.tagName === 'g' || c.tagName === 'svg' || c.tagName === 'DIV') && c.children.length) { walk(c); continue; }
          const r = c.getBoundingClientRect(); if (!r.width && !r.height) continue;
          box = box ? [Math.min(box[0], r.left), Math.min(box[1], r.top), Math.max(box[2], r.right), Math.max(box[3], r.bottom)] : [r.left, r.top, r.right, r.bottom];
        }
      };
      if (shown(root)) walk(root);
      return box;
    };
    const rel = (s, b) => [(b[0] - s.left) / s.width, (b[1] - s.top) / s.height, (b[2] - s.left) / s.width, (b[3] - s.top) / s.height].map((v) => Math.round(v * 1000) / 1000);
    const PARTS = { beanie: '#beanie, #beanieback', lips: '.lipring', held: '.emo-heldguitar, .emo-heldphone' };
    const HELD = '.emo-heldguitar, .emo-heldphone';
    const parts = Object.fromEntries(Object.keys(PARTS).map((k) => [k, []]));
    const out = [], props = [], body = []; const t0 = performance.now(); const n0 = (window.__sfx ?? []).length;
    window.__tw = window.__tw ?? { wait: (m) => new Promise((r) => setTimeout(r, m)) };
    const run = (async () => { await new Function(`return (async () => { ${action} })()`)(); })();
    while (performance.now() - t0 < ms) {
      const s = stage.getBoundingClientRect(); const now = Math.round(performance.now() - t0);
      const f = fig(); const b = visible(f) ?? (() => { const r = f.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })();
      out.push([now, ...rel(s, b)]);
      const bb = visible(f, HELD); body.push(bb ? [now, ...rel(s, bb)] : [now]);
      let pb = null; for (const pr of stage.querySelectorAll('.prop')) { const v = visible(pr); if (v) pb = pb ? [Math.min(pb[0], v[0]), Math.min(pb[1], v[1]), Math.max(pb[2], v[2]), Math.max(pb[3], v[3])] : v; }
      props.push(pb ? [now, ...rel(s, pb)] : [now]);
      for (const [k, sel] of Object.entries(PARTS)) {
        let u = null;
        for (const el of f.querySelectorAll(sel)) {
          let on = true; for (let e = el; e && e !== f; e = e.parentElement) if (!shown(e)) { on = false; break; }
          const v = on && visible(el); if (v) u = u ? [Math.min(u[0], v[0]), Math.min(u[1], v[1]), Math.max(u[2], v[2]), Math.max(u[3], v[3])] : v;
        }
        parts[k].push(u ? [now, ...rel(s, u)] : [now]);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await run.catch(() => {});
    const cues = (window.__sfx ?? []).slice(n0).filter((e) => e.name).map((e) => [Math.round(e.t - t0), e.name]);
    return { boxes: out, body, props, ...parts, cues };
  }, t.action, t.ms);
  all[name] = res;
  console.log(name.padEnd(18), res.boxes.length, 'boxes', res.cues.length, 'cues');
  await p.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify(all));
console.log('wrote', OUT);
