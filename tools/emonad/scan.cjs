// node tools/emonad/scan.cjs <outdir> <all|moves|turns|case,...> [i/n]
// Emonad on a green screen, frame by frame (the rig's own clock stepped, so every frame is exact): every move in all six
// facings (30 fps), all 30 turns (60 fps), the walk both ways, the rest poses. Then `python3 tools/emonad/scan.py <outdir>`.
// Cases: rest, move:<name>:<facing>, turn:<from>:<to>, walk:<facing>. [i/n] runs every n-th case from i (run 4 at once).
// Point BASE at a build of the lab (default 127.0.0.1:5334): a FROZEN development build served by tools/serve-dist.mjs,
// because a dev server reloads every page on any save in src (cd apps/web && NODE_ENV=development npx vite build --mode
// development --outDir <dir>; DIST=<dir> PORT=5334 node tools/serve-dist.mjs; restart it after a rebuild, stop it by PID).
// cases: rest, move:<name>:<facing>, turn:<from>:<to>, walk:<facing>
const puppeteer = require('/Volumes/BJ/code/emonad projects/emo pets/node_modules/.pnpm/puppeteer-core@23.11.1/node_modules/puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:5334';
const [out, list, part] = process.argv.slice(2);
const DUR = { wave: 1.6, bigwave: 3.1, point: 2.6, hairflip: 1.35, sigh: 3.3, shrug: 1.5, nod: 1.2, shake: 1.35, headbang: 5.1, jump: 1.6, dance: 8.2, poke: 1.5, lookaround: 2.85, talk: 2.5, hands: 1.8, horns: 1.8, march: 2 };
const F6 = ['front', 'quarterR', 'sideR', 'back', 'sideL', 'quarterL'];
let cases = [];
if (list === 'all' || list === 'moves' || list === 'turns') {
  if (list !== 'turns') { cases.push('rest'); for (const m of Object.keys(DUR)) for (const f of F6) cases.push(`move:${m}:${f}`); cases.push('walk:sideR', 'walk:sideL'); }
  if (list !== 'moves') for (const a of F6) for (const b of F6) if (a !== b) cases.push(`turn:${a}:${b}`);
} else cases = list.split(',');
if (part) { const [i, n] = part.split('/').map(Number); cases = cases.filter((_, j) => j % n === i); }
const FPS = +(process.env.FPS || 30);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.setViewport({ width: 1240, height: 900, deviceScaleFactor: +(process.env.DPR || 2) });
  await p.goto(BASE + '/emonad?bg=green&eyes=0', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__emonad, { timeout: 30000 });
  await p.evaluate(() => { const r = window.__emonad; r.stop(); r.alive = false; });
  const svg = await p.$('.emolab-stage svg'); const box = await svg.boundingBox(); const k = box.width / 1200;
  const W = 330, H = 600, TOP = 50;
  const shoot = async (file) => {
    const x = await p.evaluate(() => window.__emonad.x);
    await p.screenshot({ path: file, clip: { x: box.x + (x - W / 2) * k, y: box.y + TOP * k, width: W * k, height: H * k }, captureBeyondViewport: false });
  };
  const steps = async (T, dir, fps) => {
    let now = 0, i = 0;
    for (let t = 0; t <= T + 1e-6; t += 1 / fps) {
      while (now < t - 1e-6) { const d = Math.min(1 / 60, t - now); await p.evaluate((d) => window.__emonad.step(d), d); now += d; }
      await shoot(`${dir}/${String(i++).padStart(4, '0')}.png`);
    }
  };
  for (const c of cases) {
    const dir = `${out}/${c.replace(/:/g, '_')}`; fs.mkdirSync(dir, { recursive: true });
    const [kind, a, f] = c.split(':');
    if (kind === 'rest') {
      let i = 0;
      for (const fc of F6) { await p.evaluate((fc) => { const r = window.__emonad; r.reset(); r.setFacing(fc); r.x = 600; for (let j = 0; j < 20; j++) r.step(0.02); }, fc); await shoot(`${dir}/${String(i++).padStart(4, '0')}-${fc}.png`); }
      continue;
    }
    await p.evaluate(async (kind, a, f) => {
      const r = window.__emonad; r.reset();
      const fc = kind === 'move' ? f : kind === 'walk' ? a : a;
      r.setFacing(fc); r.x = 600; for (let j = 0; j < 30; j++) r.step(0.02);
      if (kind === 'move') { if (a === 'talk') r.say(2.5); else if (a === 'bigwave') r.play('wave', { big: true }); else if (a === 'horns') r.play('hands', { grip: 'horns' }); else r.play(a); }
      else if (kind === 'walk') r.play('walk', { to: a.endsWith('L') ? 330 : 870 });
      else { r.turnTo(f); await new Promise((res) => setTimeout(res, 0)); }
    }, kind, a, f);
    const T = kind === 'move' ? DUR[a] + 0.3 : kind === 'walk' ? 2.6 : 1.0;
    await steps(T, dir, kind === 'turn' ? 60 : FPS);
  }
  fs.writeFileSync(`${out}/errors-${(part || 'all').replace('/', 'of')}.txt`, errs.join('\n'));
  console.log('cases', cases.length, 'errors', errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})();
