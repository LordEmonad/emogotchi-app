// An item card's picture as a 1024x1024 PNG, for posting and for the site's pack pages: the on-chain SVG in
// contracts/items/<name>.svg rendered by Chrome as an <img>, exactly as a wallet or the shop shows it (an SVG in an img
// is parsed as XML: a broken one would show nothing, and this waits for it to load).
//   node tools/items/render-png.mjs keffiyeh bisht majlis darbuka falcon   -> apps/web/public/brand/item-<name>.png
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const names = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
for (const n of names) {
  const svg = readFileSync(`${root}contracts/items/${n}.svg`, 'utf8');
  await page.setContent(`<html><body style="margin:0;background:#000"><img id="i" width="1024" height="1024" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  await page.waitForFunction(() => { const i = document.getElementById('i'); return i.complete && i.naturalWidth > 0; }, { timeout: 10000 });
  await page.screenshot({ path: `${root}apps/web/public/brand/item-${n}.png`, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  console.log('  item-' + n + '.png');
}
await browser.close();
