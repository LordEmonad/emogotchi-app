// The sound lab, headless: every sound effect (and every pet's voices) and every tune rendered offline by the same
// code that plays them, each drawn as a spectrogram on a contact sheet, with its length, peak and loudness. Nobody
// can listen through this, but it shows what cannot be heard here: clipping, a sound that is silent or far too long,
// one much louder than its neighbours, a tune whose parts bury each other.
//
//   cd apps/web && npx vite --config ../../tools/thiccums-dev.mjs --port 5271 --strictPort
//   OUT=<dir> node tools/sound-check.mjs [sfx|songs] [--only=voice.,ui.] [--bars=8] [--from=0] [--wav]
//
// Writes <OUT>/sfx-N.png or songs-N.png, <kind>.json (the numbers) and, with --wav, a .wav of each.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5271';
const OUT = process.env.OUT ?? 'sound-check';
const kind = process.argv[2] === 'songs' ? 'songs' : 'sfx';
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[sound]')) errors.push(m.text()); });
await page.setViewport({ width: kind === 'songs' ? 1210 : 1200, height: 900, deviceScaleFactor: 1 });
const q = new URLSearchParams({ sheet: kind });
for (const k of ['only', 'bars', 'from', 'raw', 'parts']) if (arg(k)) q.set(k, arg(k));
await page.goto(`${BASE}/soundlab?${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sl-sheet[data-done="1"]', { timeout: 600_000 });
const rows = await page.evaluate(() => window.__sheet);
writeFileSync(join(OUT, `${kind}.json`), JSON.stringify(rows, null, 1));

// the sheet, a screen at a time
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const per = kind === 'songs' ? 4 * 236 : 5 * 141;
let n = 0;
for (let y = 0; y < total; y += per) {
  await page.screenshot({ path: join(OUT, `${kind}-${n++}.png`), clip: { x: 0, y, width: kind === 'songs' ? 1210 : 1200, height: Math.min(per, total - y) }, captureBeyondViewport: true });
}
if (process.argv.includes('--wav')) {
  for (let i = 0; i < rows.length; i++) {
    const b64 = await page.evaluate((i) => window.__wav(i), i);
    writeFileSync(join(OUT, `${rows[i].name.replace(/[^\w.-]+/g, '_')}.wav`), Buffer.from(b64, 'base64'));
  }
}
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('sound', 34), pad('len', 7), pad('peak', 7), pad('loud', 7), 'Hz');
for (const r of rows) console.log(pad(r.name, 34), pad(r.len, 7), pad(r.peak, 7), pad(r.loud, 7), r.hz, r.peak > -1 ? '  <-- CLIPS' : r.peak < -45 ? '  <-- nearly silent' : '');
console.log(`${rows.length} rendered, ${n} sheets in ${OUT}`);
if (errors.length) { console.log('ERRORS:'); for (const e of errors) console.log(' ', e); process.exitCode = 1; }
