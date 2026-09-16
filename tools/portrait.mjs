// Wallet portraits: one 1024×1024 PNG per NFT state from /nft?card=<state>. node tools/portrait.mjs [costume] (dev server on 5199)
// With a costume name the set goes to public/nft/<costume>/ and the cat is dressed.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const STATES = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];
const COSTUME = process.argv[2] ?? '';
const out = `apps/web/public/nft${COSTUME ? '/' + COSTUME : ''}`; fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
for (const s of STATES) for (const crown of [false, true]) {
  await page.goto(`http://localhost:5199/nft?card=${s}${crown ? '&crown=1' : ''}${COSTUME ? '&costume=' + COSTUME : ''}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__card_ready, { timeout: 10000 });
  const name = `${s}${crown ? '-crown' : ''}-1024.png`;
  await page.screenshot({ path: `${out}/${name}`, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  console.log('wrote', name);
}
await browser.close();
