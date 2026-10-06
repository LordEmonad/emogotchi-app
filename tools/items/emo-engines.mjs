// The emo pack's pictures as other engines draw them: each SVG (as read back through the shop's uri() by
// tools/items/emo-fork.mjs) rendered by Chrome and by WebKit as an <img>, the way a marketplace's page or a wallet shows
// it, and by resvg, the library server-side thumbnailers use (it draws no animation: the first frame, which is what a
// still thumbnail shows). Each is compared with the card's own PNG; a sheet per card is written for looking.
//   PW_DIR=<a folder with playwright and @resvg/resvg-js installed> IN=<emo-fork.mjs's OUT> OUT=<dir> node tools/items/emo-engines.mjs
// (Playwright's WebKit: `npm i playwright @resvg/resvg-js && npx playwright install webkit` in that folder; not in the repo.)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const root = fileURLToPath(new URL('../..', import.meta.url));
const req = createRequire(process.env.PW_DIR.replace(/\/?$/, '/') + 'x.js');
const { webkit } = req('playwright');
const { Resvg } = req('@resvg/resvg-js');
const IN = process.env.IN, OUT = process.env.OUT;
mkdirSync(OUT, { recursive: true });
const S = 1024;
const page = (svg) => `<html><body style="margin:0;background:#000"><img id="i" width="${S}" height="${S}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;

const chrome = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const cp = await chrome.newPage(); await cp.setViewport({ width: S, height: S });
const wk = await webkit.launch();
const wp = await (await wk.newContext({ viewport: { width: S, height: S } })).newPage();
const rows = [];
for (const f of readdirSync(IN).filter((n) => n.endsWith('.svg')).sort()) {
  const name = f.replace(/\.svg$/, ''), svg = readFileSync(`${IN}/${f}`);
  await cp.setContent(page(svg)); await cp.waitForFunction(() => document.getElementById('i').complete);
  if (!(await cp.evaluate(() => document.getElementById('i').naturalWidth))) throw new Error(`${name}: Chrome would not load it`);
  await cp.screenshot({ path: `${OUT}/${name}.chrome.png` });
  await wp.setContent(page(svg)); await wp.waitForFunction(() => document.getElementById('i').complete);
  if (!(await wp.evaluate(() => document.getElementById('i').naturalWidth))) throw new Error(`${name}: WebKit would not load it`);
  await wp.screenshot({ path: `${OUT}/${name}.webkit.png` });
  writeFileSync(`${OUT}/${name}.resvg.png`, new Resvg(svg, { fitTo: { mode: 'width', value: S }, background: '#000000' }).render().asPng());
  rows.push(name);
}
await chrome.close(); await wk.close();
writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows));
console.log(`  ${rows.length} pictures, three engines -> ${OUT}`);
