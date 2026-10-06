#!/usr/bin/env node
// Emonad out of the browser: sprite sheets for games, transparent PNG sequences for videos. Everything is the real rig
// (apps/web/src/emonad/rig.ts) in headless Chrome, stepped frame by frame on its own clock with a fixed seed, so a run
// gives the same pictures every time. Needs a page that has the lab (a dev server, or a development-mode build on
// tools/serve-dist.mjs): BASE (default http://127.0.0.1:5341).
//
//   node tools/emonad/export.mjs sprites <outdir> [--fps=30] [--height=360] [--facings=front,sideL] [--clips=idle,walk,wave]
//        [--max=4096] [--dpr=1] [--seed=1]
//     Every clip in every facing, each frame a cell of the same size with his feet at the same point (the anchor), packed
//     into pages no bigger than --max px a side. Cells are sized from a measuring pass over every clip, so no frame is
//     ever cut (every frame's border is also checked to be empty). Writes <outdir>/emonad-<facing>-<n>.png with a
//     TexturePacker "JSON Hash" file beside each page, and emonad-anims.json: every clip's frames, fps, whether it loops,
//     and its root motion (the walk is drawn on the spot; root[i] is how far he moves from frame i to i+1, in px).
//     Clips: idle (an exact loop), walk (an exact loop of two steps) with walkStart and walkStop (side facings only),
//     march and dance (exact loops; march not side on), the one-shot moves (each starts and ends at rest, so any clip can
//     follow any other), wave_big, hands_open|fist|point|horns, turn_to_<facing> for every other facing, and spin / spin_back (once
//     all the way round to his left / right, back to where it started).
//
//   node tools/emonad/export.mjs script <script.json> <outdir> [--dpr=1]
//     A scene for a video: a size, a frame rate, a length, one or more of him and what each does when. Writes
//     <outdir>/frame_00000.png ... (see-through unless the script gives a background), and meta.json. A script:
//       { "size": [1920, 1080], "fps": 30, "duration": 8, "background": "transparent",
//         "rigs": [ { "id": "emo", "x": 960, "y": 1010, "scale": 1.3, "facing": "front", "seed": 1, "mood": "neutral" } ],
//         "events": [ { "t": 0.4, "rig": "emo", "do": "play", "args": ["wave"] },
//                     { "t": 3.5, "rig": "emo", "do": "walkTo", "args": [600, { "face": "quarterR" }] },
//                     { "t": 6.0, "rig": "emo", "do": "setMood", "args": ["happy"] } ] }
//     "do" is one of the rig's own methods: turnTo spin setFacing walkTo play stopAll stopMove setMood say blink reset, or
//     "set" with an object of x y scale alive gaze idlePeriod (assigned as they are). An event at t runs before the
//     frame at t is drawn. Rigs are drawn in the order listed (the last in front).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const puppeteer = require(path.join(ROOT, 'node_modules/.pnpm/puppeteer-core@23.11.1/node_modules/puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js'));
const { PNG } = require(path.join(ROOT, 'node_modules/.pnpm/pngjs@5.0.0/node_modules/pngjs'));

const BASE = process.env.BASE || 'http://127.0.0.1:5341';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [mode, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const pos = rest.filter((a) => !a.startsWith('--'));
const FACINGS = ['front', 'quarterR', 'sideR', 'back', 'sideL', 'quarterL'];
const ONE_SHOTS = ['wave', 'point', 'hairflip', 'sigh', 'shrug', 'nod', 'shake', 'headbang', 'jump', 'poke', 'lookaround', 'talk'];

async function openPage(width, height, dpr) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // (a dev server reloads every page on any save in src, which would start the stage over mid-run: stop loudly)
  let loaded = false;
  page.on('framenavigated', (f) => { if (loaded && f === page.mainFrame()) { console.error('\nthe page reloaded mid-run (a save under apps/web/src on a dev server?): run against a frozen build (tools/serve-dist.mjs)'); process.exit(2); } });
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  await page.goto(BASE + '/emonad?eyes=0&bg=clear', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__emonad, { timeout: 60000 });
  loaded = true;
  await page.evaluate((w, h) => {
    const lab = window.__emonad; lab.stop();
    const NS = 'http://www.w3.org/2000/svg';
    const st = document.createElement('style');
    st.textContent = 'html,body{background:transparent!important;margin:0!important;overflow:hidden!important}body>*:not(#exp-stage){display:none!important}';
    document.head.append(st);
    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'exp-stage';
    svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.cssText = 'position:fixed;left:0;top:0;display:block;overflow:visible';
    document.body.append(svg);
    const Rig = lab.constructor;
    window.__exp = {
      Rig, svg, rigs: {}, bg: null,
      // a rig of his own (autoplay off, seeded), in a group that can hold him on the spot (the walk's root motion)
      make(id, o) {
        const r = new Rig({ autoplay: false, seed: o.seed ?? 1, facing: o.facing ?? 'front' });
        const g = document.createElementNS(NS, 'g'); g.append(r.el); svg.append(g);
        r.x = o.x; r.y = o.y; r.scale = o.scale;
        if (o.alive !== undefined) r.alive = o.alive;
        if (o.idlePeriod) r.idlePeriod = o.idlePeriod;
        if (o.mood) r.setMood(o.mood);
        r.prepare(); r.reset();
        this.rigs[id] = { r, g, x0: o.x };
        return r;
      },
      drop(id) { const q = this.rigs[id]; if (q) { q.r.destroy(); q.g.remove(); delete this.rigs[id]; } },
      step(dt) { for (const q of Object.values(this.rigs)) q.r.step(dt); },
      pin(id, on) { const q = this.rigs[id]; q.g.setAttribute('transform', on ? `translate(${q.x0 - q.r.x} 0)` : ''); },
      background(c) { svg.style.background = c && c !== 'transparent' ? c : 'transparent'; },
    };
  }, width, height);
  return { browser, page };
}

// ---------------------------------------------------------------- sprites
// Each clip as a plan the page runs: how to set him up, how long, the step, and which frames to keep.
function clipPlan(name, facing, fps) {
  const side = facing === 'sideL' || facing === 'sideR';
  if (name === 'idle') { const P = 3.8, N = Math.round(P * fps); return { name, loop: true, setup: { alive: true, idlePeriod: P }, warm: 2 * N, dt: P / N, keep: N }; }
  if (name === 'march') { if (side) return null; const P = 1.0, N = Math.round(P * fps); return { name, loop: true, act: "r.play('march')", warm: 2 * N, dt: P / N, keep: N }; }
  // (the dance's 16 beats at 120 bpm; it mirrors every second time round, and starts and ends each in a pose that is its
  // own mirror, so one time round closes exactly)
  if (name === 'dance') { const P = 16 * 0.5, N = Math.round(P * fps); return { name, loop: true, act: "r.play('dance')", warm: 2 * N, dt: P / N, keep: N }; }
  if (name === 'walk') return side ? { name: 'walk', walk: true } : null;
  if (name.startsWith('hands_')) return { name, act: `r.play('hands', { grip: '${name.slice(6)}' })`, oneShot: true, dt: 1 / fps };
  if (name.startsWith('turn_to_')) { const g = name.slice(8); if (g === facing) return null; return { name, act: `r.turnTo('${g}')`, oneShot: true, dt: 1 / fps, turn: true }; }
  if (name === 'spin' || name === 'spin_back') return { name, act: `r.spin({ dir: ${name === 'spin' ? 1 : -1} })`, oneShot: true, dt: 1 / fps, turn: true };
  if (name === 'talk') return { name, act: 'r.say(2)', oneShot: true, dt: 1 / fps };
  if (name === 'wave_big') return { name, act: "r.play('wave', { big: true })", oneShot: true, dt: 1 / fps };
  if (ONE_SHOTS.includes(name)) return { name, act: `r.play('${name}')`, oneShot: true, dt: 1 / fps };
  throw new Error(`unknown clip ${name}`);
}

/** Run one clip in the page and call shot(i, info) for every frame kept. Returns the clip's frames' root motion (view
 *  units) and whether it loops. */
async function runClip(page, facing, plan, place, fps, shot) {
  if (plan.walk) return runWalk(page, facing, place, fps, shot);
  await page.evaluate((f, p, pl) => { window.__exp.drop('a'); window.__exp.make('a', { ...pl, facing: f, alive: false, ...(p.setup ?? {}) }); }, facing, plan, place);
  const frames = [];
  if (plan.loop) {
    await page.evaluate((p) => { const r = window.__exp.rigs.a.r; if (p.act) new Function('r', p.act)(r); for (let i = 0; i < p.warm; i++) r.step(p.dt); }, plan);
    for (let i = 0; i < plan.keep; i++) {
      if (i) await page.evaluate((dt) => window.__exp.step(dt), plan.dt);
      await shot(frames.length); frames.push([0, 0]);
    }
    return { frames, loop: true, fps: plan.keep / (plan.dt * plan.keep) };
  }
  // a one-shot: from rest, through the move, until it has ended and the arms and hair have settled at rest again
  await page.evaluate((p) => { const r = window.__exp.rigs.a.r; new Function('r', p.act)(r); }, plan);
  await shot(frames.length); frames.push([0, 0]);
  let quiet = 0;
  for (let i = 0; i < fps * 30; i++) {
    const busy = await page.evaluate((dt) => { window.__exp.step(dt); const r = window.__exp.rigs.a.r; return r.isPlaying() || r.turning; }, plan.dt);
    await shot(frames.length); frames.push([0, 0]);
    quiet = busy ? 0 : quiet + 1;
    if (quiet >= Math.ceil(0.35 * fps)) break;
  }
  return { frames, loop: false, fps };
}

/** The walk, on the spot: one long walk measured first (its step's time), then stepped so every step is a whole number of
 *  frames: walkStart (the first half step), walk (two whole steps: an exact loop), walkStop (the last half step and the
 *  feet coming together). */
async function runWalk(page, facing, place, fps, shot) {
  const dir = facing === 'sideR' ? 1 : -1;
  // a walk of 9 whole steps (10 steps in all: the last swings the same foot as the loop's next)
  const L = 9 * 92;
  const Th = await page.evaluate((f, pl, L, dir) => {
    window.__exp.drop('a'); const r = window.__exp.make('a', { ...pl, facing: f, alive: false });
    const downs = []; r.onEvent = (e) => { if (e.type === 'footDown') downs.push(r.now); };
    r.play('walk', { to: r.x + dir * L * r.scale });
    for (let i = 0; i < 20 * 600 && downs.length < 4; i++) r.step(1 / 600);
    return downs[3] - downs[2];
  }, facing, place, L, dir);
  const M = Math.max(4, Math.round(Th * fps)), dt = (Th / M) * (1 + 1e-9);
  await page.evaluate((f, pl, L, dir) => { window.__exp.drop('a'); const r = window.__exp.make('a', { ...pl, facing: f, alive: false }); r.play('walk', { to: r.x + dir * L * r.scale }); window.__exp.pin('a', true); }, facing, place, L, dir);
  const xs = [], parts = { walkStart: [], walk: [], walkStop: [] };
  let n = 0, quiet = 0;
  for (let i = 0; ; i++) {
    const st = i ? await page.evaluate((dt) => { window.__exp.step(dt); window.__exp.pin('a', true); const r = window.__exp.rigs.a.r; return { x: r.x, busy: r.isPlaying() }; }, dt)
      : await page.evaluate(() => { const r = window.__exp.rigs.a.r; return { x: r.x, busy: true }; });
    xs.push(st.x);
    // (frame i shows the walk after i steps of dt: step k of the walk is frames kM .. (k+1)M)
    const which = i <= M - 1 ? 'walkStart' : i >= 3 * M && i < 5 * M ? 'walk' : i >= 9 * M ? 'walkStop' : null;
    if (which) { await shot(n, which); parts[which].push({ i, n }); n++; }
    quiet = st.busy ? 0 : quiet + 1;
    if (i > 10 * M && quiet >= Math.ceil(0.35 * fps)) break;
    if (i > 40 * M) throw new Error('the walk did not end');
  }
  const root = (list) => list.map(({ i }) => [(xs[i + 1] ?? xs[i]) - xs[i], 0]);
  return { multi: { walkStart: { frames: root(parts.walkStart), loop: false, fps: 1 / dt }, walk: { frames: root(parts.walk), loop: true, fps: 1 / dt }, walkStop: { frames: root(parts.walkStop), loop: false, fps: 1 / dt } } };
}

async function sprites(out) {
  const fps = +(flags.fps ?? 30), H = +(flags.height ?? 360), dpr = +(flags.dpr ?? 1), maxPx = +(flags.max ?? 4096), seed = +(flags.seed ?? 1);
  const facings = flags.facings ? flags.facings.split(',') : FACINGS;
  const allClips = ['idle', 'walk', 'march', 'dance', ...ONE_SHOTS, 'wave_big', 'hands_open', 'hands_fist', 'hands_point', 'hands_horns', ...FACINGS.map((f) => `turn_to_${f}`), 'spin', 'spin_back'];
  const clips = flags.clips ? flags.clips.split(',').flatMap((c) => (c === 'turns' ? [...FACINGS.map((f) => `turn_to_${f}`), 'spin', 'spin_back'] : [c])) : allClips;
  fs.mkdirSync(out, { recursive: true });
  const { browser, page } = await openPage(2400, 1600, dpr);
  try {
    // 1. measure: every clip in every facing at 15 fps, his drawn box in his own units (feet at 0, 0; scale 1)
    console.log('measuring...');
    const big = { x: 1200, y: 1300, scale: 1, seed };
    let box = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = async () => {
      const b = await page.evaluate(() => { const q = window.__exp.rigs.a; const bb = q.r.el.getBoundingClientRect(); const sv = window.__exp.svg.getBoundingClientRect(); return [bb.left - sv.left, bb.top - sv.top, bb.right - sv.left, bb.bottom - sv.top]; });
      box = [Math.min(box[0], b[0] - big.x), Math.min(box[1], b[1] - big.y), Math.max(box[2], b[2] - big.x), Math.max(box[3], b[3] - big.y)];
    };
    for (const f of facings) for (const c of clips) { const p = clipPlan(c, f, 15); if (p) await runClip(page, f, p, big, 15, grow); }
    // 2. the cell: that box, a margin all round, at the asked height
    const pad = 0.04 * (box[3] - box[1]);
    const bw = box[2] - box[0] + 2 * pad, bh = box[3] - box[1] + 2 * pad;
    const scale = H / bh, W = Math.ceil(bw * scale), cellH = Math.ceil(H);
    const anchor = [Math.round((pad - box[0]) * scale), Math.round((pad - box[1]) * scale)];
    console.log(`cell ${W}x${cellH} px, anchor ${anchor}, scale ${scale.toFixed(4)} (his box ${box.map((v) => v.toFixed(0))})`);
    const place = { x: anchor[0], y: anchor[1], scale, seed };
    const cw = Math.round(W * dpr), ch = Math.round(cellH * dpr);
    const perRow = Math.max(1, Math.floor(maxPx / cw)), perCol = Math.max(1, Math.floor(maxPx / ch)), perPage = perRow * perCol;
    const anims = { character: 'emonad', fps, cell: [cw, ch], anchor: [Math.round(anchor[0] * dpr), Math.round(anchor[1] * dpr)], scale: scale * dpr, units: 'px', pages: [], clips: {} };
    for (const f of facings) {
      anims.clips[f] = {};
      const pages = [];
      let cur = null, idx = 0, pageNo = 0;
      const newPage = () => { cur = { png: new PNG({ width: perRow * cw, height: perCol * ch }), frames: {}, used: 0, name: `emonad-${f}-${pageNo++}` }; cur.png.data.fill(0); pages.push(cur); idx = 0; };
      const shotInto = (clipName) => async (i, which) => {
        const nm = which ?? clipName;
        const snap = () => page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: W, height: cellH }, captureBeyondViewport: false });
        // (once more if the browser stalls: a busy machine has made one screenshot hang)
        const buf = await snap().catch(() => snap());
        const img = PNG.sync.read(Buffer.from(buf));
        // nothing may touch the cell's border: a frame cut off by its cell is a mistake
        const A = (x, y) => img.data[(y * img.width + x) * 4 + 3];
        for (let x = 0; x < img.width; x++) if (A(x, 0) || A(x, img.height - 1)) throw new Error(`${f} ${nm} frame ${i}: touches the cell's top or bottom`);
        for (let y = 0; y < img.height; y++) if (A(0, y) || A(img.width - 1, y)) throw new Error(`${f} ${nm} frame ${i}: touches the cell's side`);
        if (!cur || idx >= perPage) newPage();
        const cx = (idx % perRow) * cw, cy = Math.floor(idx / perRow) * ch;
        PNG.bitblt(img, cur.png, 0, 0, Math.min(cw, img.width), Math.min(ch, img.height), cx, cy);
        const key = `${f}/${nm}/${String(i).padStart(3, '0')}`;
        cur.frames[key] = { frame: { x: cx, y: cy, w: cw, h: ch }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: cw, h: ch }, sourceSize: { w: cw, h: ch }, pivot: { x: anims.anchor[0] / cw, y: anims.anchor[1] / ch } };
        (cur.list ??= []).push(key);
        idx++; cur.used = idx;
        return [cur.name, key];
      };
      for (const c of clips) {
        const plan = clipPlan(c, f, fps); if (!plan) continue;
        const keys = {};
        const sh = shotInto(c);
        const res = await runClip(page, f, plan, place, fps, async (i, which) => { const k = await sh(i, which); (keys[which ?? c] ??= []).push(k); });
        const store = (nm, r) => { anims.clips[f][nm] = { loop: r.loop, fps: +r.fps.toFixed(4), frames: keys[nm].map(([p, k]) => ({ page: p, key: k })), root: r.frames.map(([dx, dy]) => [+(dx * dpr).toFixed(3), +(dy * dpr).toFixed(3)]) }; };
        if (res.multi) for (const [nm, r] of Object.entries(res.multi)) store(nm, r); else store(c, res);
        process.stdout.write(`${f} ${c} (${(keys[c] ?? keys.walk ?? []).length})  `);
      }
      // trim each page to the rows it uses, write it and its JSON Hash
      for (const pg of pages) {
        const rows = Math.ceil(pg.used / perRow), cols = Math.min(perRow, pg.used);
        const trimmed = new PNG({ width: cols * cw, height: rows * ch });
        PNG.bitblt(pg.png, trimmed, 0, 0, cols * cw, rows * ch, 0, 0);
        fs.writeFileSync(path.join(out, `${pg.name}.png`), PNG.sync.write(trimmed));
        fs.writeFileSync(path.join(out, `${pg.name}.json`), JSON.stringify({ frames: pg.frames, meta: { app: 'emonad export.mjs', image: `${pg.name}.png`, format: 'RGBA8888', size: { w: cols * cw, h: rows * ch }, scale: '1' } }, null, 1));
        anims.pages.push(`${pg.name}.png`);
      }
      console.log(`\n${f}: ${pages.length} page(s)`);
    }
    fs.writeFileSync(path.join(out, 'emonad-anims.json'), JSON.stringify(anims, null, 1));
    console.log(`wrote ${anims.pages.length} pages to ${out}`);
  } finally { await browser.close(); }
}

// ---------------------------------------------------------------- script
const METHODS = new Set(['turnTo', 'spin', 'setFacing', 'walkTo', 'play', 'stopAll', 'stopMove', 'setMood', 'say', 'blink', 'reset']);
const SETTABLE = new Set(['x', 'y', 'scale', 'alive', 'gaze', 'idlePeriod']);
async function script(file, out) {
  const sc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const [W, H] = sc.size ?? [1920, 1080], fps = sc.fps ?? 30, dur = sc.duration ?? 5, dpr = +(flags.dpr ?? 1);
  const events = (sc.events ?? []).map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  for (const e of events) {
    if (e.do === 'set') { for (const k of Object.keys(e.args?.[0] ?? {})) if (!SETTABLE.has(k)) throw new Error(`event ${e.i}: cannot set ${k}`); }
    else if (!METHODS.has(e.do)) throw new Error(`event ${e.i}: no such action "${e.do}"`);
  }
  fs.mkdirSync(out, { recursive: true });
  const { browser, page } = await openPage(W, H, dpr);
  try {
    await page.evaluate((rigs, bg) => { for (const o of rigs) window.__exp.make(o.id, { alive: true, ...o }); window.__exp.background(bg); }, sc.rigs ?? [], sc.background ?? 'transparent');
    const N = Math.round(dur * fps);
    let next = 0;
    for (let i = 0; i < N; i++) {
      const t = i / fps;
      const due = [];
      while (next < events.length && events[next].t <= t + 1e-9) due.push(events[next++]);
      const errs = await page.evaluate((due, step) => {
        const errs = [];
        for (const e of due) {
          const q = window.__exp.rigs[e.rig ?? Object.keys(window.__exp.rigs)[0]];
          if (!q) { errs.push(`no rig ${e.rig}`); continue; }
          try { if (e.do === 'set') Object.assign(q.r, e.args[0]); else { const p = q.r[e.do](...(e.args ?? [])); if (p?.catch) p.catch((x) => console.error(String(x))); } } catch (x) { errs.push(String(x)); }
        }
        window.__exp.step(step);
        return errs;
      }, due, i ? 1 / fps : 0);
      if (errs.length) throw new Error(`at ${t.toFixed(3)} s: ${errs.join('; ')}`);
      await page.screenshot({ path: path.join(out, `frame_${String(i).padStart(5, '0')}.png`), omitBackground: (sc.background ?? 'transparent') === 'transparent', clip: { x: 0, y: 0, width: W, height: H }, captureBeyondViewport: false });
      if (i % fps === 0) process.stdout.write(`${t.toFixed(0)}s `);
    }
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ size: [W * dpr, H * dpr], fps, frames: N, script: path.resolve(file) }, null, 1));
    console.log(`\nwrote ${N} frames to ${out}`);
  } finally { await browser.close(); }
}

if (mode === 'sprites' && pos[0]) await sprites(path.resolve(pos[0]));
else if (mode === 'script' && pos[0] && pos[1]) await script(path.resolve(pos[0]), path.resolve(pos[1]));
else { console.log('usage: node tools/emonad/export.mjs sprites <outdir> [flags] | script <script.json> <outdir> [--dpr=2]'); process.exit(1); }
