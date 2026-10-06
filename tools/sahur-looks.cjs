// Every outfit on him at rest, at 2x, against the dev server on 5177: one booth shot per query string, tiled.
//   node tools/sahur-looks.cjs <outdir> "costume=witch" "costume=witch&crown=1" ...   (also --moods to shoot the mood grid of each)
const puppeteer = require('puppeteer-core');
const [out, ...queries] = process.argv.slice(2).filter((a) => a !== '--moods');
const MOODS = process.argv.includes('--moods');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
  const p = await b.newPage(); await p.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  for (const q of queries) {
    await p.goto(`http://localhost:5177/sahur?${q}${MOODS ? '' : '&moods=0'}`, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => window.__lab && window.__lab.sahur, { timeout: 20000 });
    await new Promise((r) => setTimeout(r, MOODS ? 2600 : 900));
    await p.evaluate(() => { window.__lab.sahur.wanderEnabled = false; });
    const name = q.replace(/[^a-z0-9]+/gi, '_');
    const clip = await p.evaluate(() => { const r = document.querySelector('.hlab-booth .stage').getBoundingClientRect(); return { x: r.left - 2, y: r.top + window.scrollY - 2, width: r.width + 4, height: r.height + 4 }; });
    await p.screenshot({ path: `${out}/look-${name}.png`, clip });
    if (MOODS) {
      const m = await p.evaluate(() => { const r = document.querySelector('.hlab-moodset').getBoundingClientRect(); return { x: Math.max(0, r.left), y: r.top + window.scrollY, width: Math.min(1240, r.width), height: r.height }; });
      await p.screenshot({ path: `${out}/moods-${name}.png`, clip: m });
    }
  }
  await b.close(); console.log('errors', errs);
})();
