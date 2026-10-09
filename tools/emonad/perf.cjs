// node tools/emonad/perf.cjs : frame intervals in the lab while he turns back and forth on a CPU slowed CPU times (default 4): with the turn's in-betweens on (full), with their path writes stubbed (nod), and off. BASE as in scan.cjs.
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1240, height: 900, deviceScaleFactor: 2 });
  await p.goto('' + (process.env.BASE || 'http://127.0.0.1:5334') + '/emonad?eyes=0', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__emonad);
  const c = await p.target().createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.CPU || 4) });
  // warm all the pairs first
  await p.evaluate(() => window.__emonad.prepare());
  for (const mode of ['full', 'nod', 'off']) {
    const fr = await p.evaluate(async (mode) => {
      const r = window.__emonad; if (!r._m) r._m = r.morph; r.morph = mode === 'off' ? null : r._m;
      const orig = Element.prototype.setAttribute;
      if (mode === 'nod') Element.prototype.setAttribute = function (k, v) { if (k === 'd' && this.closest && !this.classList.contains('cut') && !this.classList.contains('knee')) return; return orig.call(this, k, v); };
      r.start();
      const iv = []; let last = performance.now(); let go = true; let js = 0, nf = 0;
      const tick = (t) => { iv.push(t - last); last = t; if (go) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      for (const f of ['back', 'front', 'sideR', 'quarterL', 'back', 'front']) { await r.turnTo(f); await r.wait(0.25); }
      go = false; r.stop(); Element.prototype.setAttribute = orig;
      iv.sort((a, b) => a - b);
      return { n: iv.length, p50: +iv[iv.length >> 1].toFixed(1), p90: +iv[Math.floor(iv.length * 0.9)].toFixed(1), p95: +iv[Math.floor(iv.length * 0.95)].toFixed(1), over20: iv.filter((x) => x > 20).length };
    }, mode);
    console.log(mode, JSON.stringify(fr));
  }
  await b.close();
})();
