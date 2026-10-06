// node tools/emonad/motion.cjs <out.json> : every bone's pivot at 120 Hz through every move in every facing (and the
// walk, and turns); then python3 tools/emonad/motion.py <out.json> lists velocity jumps. BASE as in scan.cjs. Expected
// (by design): the jump's take-off (t 0.4) and landing (1.02), the headbang's hits on the head and the hair (every 0.57 s),
// the hair flip's toss, the poke's jab (0.125), the walk's first lift.
const puppeteer = require('/Volumes/BJ/code/emonad projects/emo pets/node_modules/.pnpm/puppeteer-core@23.11.1/node_modules/puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:5334';
const DUR = { wave: 1.6, bigwave: 3.1, point: 2.6, hairflip: 1.35, sigh: 3.3, shrug: 1.5, nod: 1.2, shake: 1.35, headbang: 5.1, jump: 1.6, dance: 8.2, poke: 1.5, lookaround: 2.85, talk: 2.5, hands: 1.8, march: 2 };
const F6 = ['front', 'quarterR', 'sideR', 'back', 'sideL', 'quarterL'];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage();
  await p.goto(BASE + '/emonad?bg=green&eyes=0', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__emonad, { timeout: 30000 });
  const res = await p.evaluate(async (DUR, F6) => {
    const r = window.__emonad; r.stop(); r.alive = false;
    const out = {};
    const rec = async (key, setup, T) => {
      r.reset();
      await setup();
      const fr = [];
      for (let t = 0; t <= T; t += 1 / 120) { r.step(1 / 120); const bs = r.bonesNow(); fr.push(Object.assign(Object.fromEntries(bs.map((q) => [q.bone, [+q.x.toFixed(3), +q.y.toFixed(3)]])), { __f: r.facing })); }
      out[key] = fr;
    };
    for (const m of Object.keys(DUR)) for (const f of F6) {
      await rec(`${m}:${f}`, async () => { r.setFacing(f); r.x = 600; for (let j = 0; j < 30; j++) r.step(0.02); if (m === 'talk') r.say(2.5); else if (m === 'bigwave') r.play('wave', { big: true }); else r.play(m); }, DUR[m] + 0.4);
    }
    for (const f of ['sideR', 'sideL']) await rec(`walk:${f}`, async () => { r.setFacing(f); r.x = 600; for (let j = 0; j < 30; j++) r.step(0.02); r.play('walk', { to: f === 'sideL' ? 330 : 870 }); }, 2.8);
    return out;
  }, DUR, F6);
  fs.writeFileSync(process.argv[2], JSON.stringify(res));
  console.log('cases', Object.keys(res).length);
  await b.close();
})();
