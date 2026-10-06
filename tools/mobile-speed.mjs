// How fast a page is on a phone: a cold load (empty cache) under Chrome's throttling, a slow 4G line (1.6 Mbps down, 150 ms
// round trips) and a CPU four times slower than this Mac's, and the milliseconds until the first paint, the largest paint,
// and the pet on screen (its drawing in the room). Runs each page RUNS times and prints the medians, for every BASE given,
// so two builds can be compared side by side (tools/serve-dist.mjs serves a build).
//   BASES=http://127.0.0.1:5281,http://127.0.0.1:5282 [RUNS=3] [PAGES=/,/faq] node tools/mobile-speed.mjs
import puppeteer from 'puppeteer-core';

const BASES = (process.env.BASES ?? 'http://127.0.0.1:5281').split(',');
const RUNS = Number(process.env.RUNS ?? 3);
const WHO = process.env.WHO ?? '0xE974C0ed0Eace26D85943309e6Ed05bF3f536904';
const PAGES = (process.env.PAGES ?? '/,/?w,/inversebrah/pet/3,/pets,/stats,/faq,/shop').split(',');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const once = async (base, path) => {
  const wallet = path.endsWith('?w');
  const url = base + path.replace(/\?w$/, '');
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (wallet) await page.evaluateOnNewDocument((addr) => {
    window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
      if (method === 'eth_chainId') return '0x8f';
      if (/^eth_send|sign|wallet_/.test(method)) throw Object.assign(new Error('read-only'), { code: 4001 });
      const r = await fetch('https://rpc.monad.xyz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      return (await r.json()).result;
    } };
    try { localStorage.setItem('emogotchi.wallet', 'injected'); } catch { /* */ }
  }, WHO);
  await page.evaluateOnNewDocument(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    // the pet on screen: a rigged drawing inside a room
    const t0 = performance.now();
    const poll = () => { if (document.querySelector('.stage .pet svg, .stage .pet .petroot, .gallery-card img, .stats-kpis')) { window.__pet = performance.now() - t0; return; } requestAnimationFrame(poll); };
    requestAnimationFrame(poll);
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__pet !== undefined, { timeout: 60000 }).catch(() => {});
  const m = await page.evaluate(() => ({ fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0, lcp: window.__lcp, pet: window.__pet ?? -1 }));
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize ?? 0));
  m.load = Date.now() - t0; m.kb = Math.round(bytes / 1024);
  await ctx.close();
  return m;
};

for (const path of PAGES) {
  const row = [];
  for (const base of BASES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) { try { runs.push(await once(base, path)); } catch (e) { console.error(`  ${base}${path} run ${i + 1}: ${String(e).slice(0, 100)}`); } }
    if (!runs.length) { row.push('failed'); continue; }
    row.push(`paint ${String(Math.round(median(runs.map((r) => r.fcp)))).padStart(5)}  largest ${String(Math.round(median(runs.map((r) => r.lcp)))).padStart(5)}  ready ${String(Math.round(median(runs.map((r) => r.pet)))).padStart(5)}  ${String(median(runs.map((r) => r.kb))).padStart(5)} KB`);
  }
  console.log(`${path.padEnd(22)} ${row.join('   |   ')}`);
}
await browser.close();
