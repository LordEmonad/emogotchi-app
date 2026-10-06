// Where each pet's striking limb reaches, in room units, when it is turned to a given angle: for placing the fight's
// attacks so they land (the fighter on the left, facing right). node tools/fightclub/limbs.mjs [base]
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] ?? 'http://localhost:5261';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
for (const [ch, limbs] of [['cat', ['legL', 'legR']], ['frog', ['legL', 'legR']], ['sahur', ['legL', 'legR']]]) {
  await p.goto(`${BASE}/fightlab?l=${ch}&r=${ch}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__fight?.fighters, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  const out = await p.evaluate((limbs) => {
    const f = window.__fight.fighters[0];
    for (const a of f.drawing.getAnimations({ subtree: true })) a.cancel();
    const world = document.querySelector('.fc-arena .world'); const wr = world.getBoundingClientRect(); const k = wr.width / 600;
    const toW = (r) => ({ x0: (r.left - wr.left) / k, x1: (r.right - wr.left) / k, y0: (r.top - wr.top) / k, y1: (r.bottom - wr.top) / k });
    const host = f.host.getBoundingClientRect(); const cx = ((host.left + host.right) / 2 - wr.left) / k;
    const svg = f.drawing.querySelector('svg');
    const body = toW(svg.querySelector('#body').getBoundingClientRect()); const head = toW(svg.querySelector('#head').getBoundingClientRect());
    const res = { cx: Math.round(cx), body: [body.x0 - cx, body.x1 - cx, body.y0, body.y1].map(Math.round), head: [head.x0 - cx, head.x1 - cx, head.y0, head.y1].map(Math.round), limbs: {} };
    for (const id of limbs) {
      const e = svg.querySelector('#' + id); const rows = [];
      for (const deg of [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]) {
        e.style.transform = `rotate(${deg}deg)`;
        const r = toW(e.getBoundingClientRect());
        rows.push(`${deg}:[${Math.round(r.x0 - cx)}..${Math.round(r.x1 - cx)}, y ${Math.round(r.y0)}..${Math.round(r.y1)}]`);
      }
      e.style.transform = '';
      res.limbs[id] = rows.join(' ');
    }
    return res;
  }, limbs);
  console.log(`== ${ch} (centre x ${out.cx}; floor 400)  body x ${out.body[0]}..${out.body[1]} y ${out.body[2]}..${out.body[3]}  head x ${out.head[0]}..${out.head[1]} y ${out.head[2]}..${out.head[3]}`);
  for (const [id, rows] of Object.entries(out.limbs)) console.log(`  ${id}: ${rows}`);
}
await b.close();
