// node tools/emonad/turn-pace.cjs <outdir>   then   <venv>/bin/python tools/emonad/turn-pace.py <outdir>
// How much of Emonad changes on the page for each degree he turns, all the way round: a still at every degree (no turn
// running: the drawing nearest the angle, bent and carried as a turn draws it, on a green screen, the hair's strands and
// shading hidden since they are only texture), from which turn-pace.py works out the turn's pace (rig.ts PACE): a turn
// goes through the angles where little changes faster and through those where much changes slower, so what is seen
// changes at an even rate all the way round, the head and the body each at its own. Run it again after the drawing or
// the in-betweens change. HD=1 keeps the hair's strands (they slide across the back of his head as he turns past).
// BASE: the lab (default 127.0.0.1:5334), best a frozen development build (see scan.cjs). It must not be paced already
// for the numbers to be the drawing's own: the stills are by angle, which PACE does not touch.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:5334';
const [out] = process.argv.slice(2);
const STEP = +(process.env.STEP || 1);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await p.setViewport({ width: 1240, height: 900, deviceScaleFactor: +(process.env.DPR || 1) });
  await p.goto(BASE + '/emonad?bg=green&eyes=0', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__emonad, { timeout: 30000 });
  await p.evaluate(() => {
    const r = window.__emonad; r.stop(); r.alive = false; r.prepare(); r.reset();
  });
  // (the hair's strands and shading hidden, unless HD=1: from the back they slide as he turns, which is change too)
  if (process.env.HD !== '1') await p.evaluate(() => { const st = document.createElement('style'); st.textContent = '.emonad .hd { opacity: 0 !important; }'; document.head.append(st); });
  const svg = await p.$('.emolab-stage svg'); const box = await svg.boundingBox(); const k = box.width / 1200;
  const W = 340, H = 640, TOP = 30;
  for (let a = 0; a < 360; a += STEP) {
    await p.evaluate((a) => { const r = window.__emonad; r.turn = null; r.ang = a; r.headPrev = null; r.hair = { k: 0, kv: 0, s: 0, sv: 0 }; r.step(0.001); r.step(0.001); }, a);
    const x = await p.evaluate(() => window.__emonad.x);
    await p.screenshot({ path: `${out}/${String(Math.round(a * 10)).padStart(4, '0')}.png`, clip: { x: box.x + (x - W / 2) * k, y: box.y + TOP * k, width: W * k, height: H * k }, captureBeyondViewport: false });
  }
  console.log('stills', Math.round(360 / STEP), 'errors', errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})();
