// Snapshots of one of his actions at given moments, at 2x, against the dev server on 5177 (a companion to sahur-shots.mjs):
//   node tools/sahur-moments.cjs "feed()" "bend:2350,eat:4900" <outdir>
// snapshots of one action at given ms, at 2x: node moments.cjs <action call> <name:ms,...> <outdir>
const puppeteer = require('puppeteer-core');
const [call, list, out] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
  const p = await b.newPage(); await p.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5177/sahur?moods=0', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__lab && window.__lab.sahur, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
  await p.evaluate((call) => { const d = window.__lab.sahur; d.wanderEnabled = false; window.__t0 = Date.now(); new Function('d', 'return d.' + call)(d); }, call);
  const clip = await p.evaluate(() => { const r = document.querySelector('.hlab-booth .stage').getBoundingClientRect(); return { x: r.left - 2, y: r.top + window.scrollY - 2, width: r.width + 4, height: r.height + 4 }; });
  for (const item of list.split(',')) {
    const [name, t] = item.split(':');
    const now = await p.evaluate(() => Date.now() - window.__t0);
    if (Number(t) > now) await new Promise((r) => setTimeout(r, Number(t) - now));
    await p.screenshot({ path: `${out}/${name}.png`, clip });
  }
  await b.close(); console.log('ok');
})();
