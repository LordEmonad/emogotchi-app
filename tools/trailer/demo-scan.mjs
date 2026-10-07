// The demo's block explorer stills: the session's own transactions (RAW/live.json, from demo-live.mjs) opened on MonadScan
// in a VISIBLE Chrome window (MonadScan sits behind Cloudflare's bot check, which turns a headless browser away and lets
// a visible one through on its own: nothing here tries to get round it), one still each at 1920x1080, saved as a
// one-frame take (RAW/scan-<name>/f-00000.png + meta.json) with the boxes of what the video outlines, as fractions of the
// picture (meta.marks).
//   RAW=trailer/demo/raw node tools/trailer/demo-scan.mjs                  (every transaction the session wrote down)
//   ... node tools/trailer/demo-scan.mjs mint:0xabc… feed:0xdef…         (or these)
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { CHROME, sleep } from './lib.mjs';

const RAW = process.env.RAW ?? 'trailer/demo/raw';
const EXPLORER = process.env.EXPLORER ?? 'https://monadscan.com';

// which transactions: named on the command line, or the session's own in order (starter, mint, then each care, ...)
let todo = process.argv.slice(2).map((a) => a.split(':')).map(([name, hash]) => ({ name, hash }));
if (!todo.length) {
  const live = JSON.parse(readFileSync(`${RAW}/live.json`, 'utf8'));
  const names = live.names ?? {};
  for (const e of live.all ?? []) {
    if (e.kind === 'drip' && e.hash) todo.push({ name: 'starter', hash: e.hash });
    if (e.kind === 'sent') todo.push({ name: names[e.hash] ?? `tx${todo.length}`, hash: e.hash });
  }
}
console.log(todo.map((t) => `${t.name} ${t.hash}`).join('\n'));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ['--window-size=1300,860', '--force-color-profile=srgb', '--hide-scrollbars'] });
try {
  const page = (await browser.pages())[0] ?? await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  for (const t of todo) {
    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt += 1) {
      await page.goto(`${EXPLORER}/tx/${t.hash}`, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
      await sleep(2500);
      // the explorer may not have indexed a fresh transaction yet
      ok = await page.evaluate((h) => document.body.innerText.includes(h) && /Success/.test(document.body.innerText), t.hash).catch(() => false);
      if (!ok) { console.log(`  ${t.name}: not on the explorer yet (attempt ${attempt})`); await sleep(15000); }
    }
    if (!ok) { console.log(`  ${t.name}: SKIPPED`); continue; }
    // the cookie notice, closed the way anyone closes it
    const got = await page.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find((e) => /^Got it/.test(e.textContent.trim())); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (got) { await page.mouse.click(got.x, got.y); await sleep(800); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(600);
    // what the video points at: the status, the action, where it went, and what it moved
    const marks = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom < innerHeight && r.top >= 0; };
      const smallest = (test) => [...document.querySelectorAll('body *')].filter((e) => vis(e) && test(e.textContent.replace(/\s+/g, ' ').trim())).sort((a, b) => a.textContent.length - b.textContent.length)[0] ?? null;
      const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.left / innerWidth, r.top / innerHeight, r.right / innerWidth, r.bottom / innerHeight]; };
      return {
        status: box(smallest((s) => s === 'Success')),
        action: box(smallest((s) => /Function on|Transfer \d|Call /.test(s) && s.length < 160)),
        value: box(smallest((s) => /^[\d.,]+ MON( \(\$[\d.,]+\))?$/.test(s))),
        hash: box(smallest((s) => /^0x[0-9a-f]{64}$/i.test(s))),
      };
    });
    const dir = `${RAW}/scan-${t.name}`;
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/f-00000.png`, captureBeyondViewport: false });
    writeFileSync(`${dir}/meta.json`, JSON.stringify({ frames: 1, fps: 60, cues: [], txs: [], marks: [], hash: t.hash, url: `${EXPLORER}/tx/${t.hash}`, boxes: marks }));
    console.log(`  ${t.name}: ${dir}  ${JSON.stringify(marks)}`);
  }
} finally { await browser.close().catch(() => {}); }
