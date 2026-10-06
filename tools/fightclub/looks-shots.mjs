// Close-ups of Fight Club's looks on each pet: the black eye and the belt, crowned or not, at 2x.
//   node tools/fightclub/looks-shots.mjs <out dir>
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = process.argv[2] ?? '/tmp/looks'; mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE ?? 'http://localhost:5260';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
for (const [l, r] of [['cat', 'frog'], ['sahur', 'cat'], ['frog', 'sahur']]) {
  await p.goto(`${BASE}/fightlab?l=${l}&r=${r}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__fight?.fighters, { timeout: 30000 });
  await new Promise((res) => setTimeout(res, 800));
  for (const crown of [false, true]) {
    await p.evaluate((crown) => { const [a, c] = window.__fight.fighters; for (const f of [a, c]) f.rig.setCrown(crown); a.looks.setBlackEye(true); c.looks.setBelt(true); a.rig.face('open', 'frown', 0); }, crown);
    await new Promise((res) => setTimeout(res, 700));
    await (await p.$('.fc-arena')).screenshot({ path: join(OUT, `${l}-eye_${r}-belt${crown ? '-crowned' : ''}.png`) });
  }
}
await b.close(); console.log('done');
