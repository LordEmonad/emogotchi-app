// Render each pet drawing on a grid (1 unit = 3 px, lines every 10 units) to place new pieces by eye and by number.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = process.argv[2] ?? '/tmp';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.setViewport({ width: 700, height: 760, deviceScaleFactor: 1 });
for (const ch of (process.argv[3] ?? 'cat,frog,sahur,seal').split(',')) {
  let svg = readFileSync(`${ROOT}packages/pet/${ch}.svg`, 'utf8').replace('width="200" height="230"', 'width="600" height="690"');
  const grid = Array.from({ length: 21 }, (_, i) => `<line x1="${i * 10}" y1="-30" x2="${i * 10}" y2="230" stroke="${i % 5 ? '#0002' : '#f008'}" stroke-width="0.3"/>`).join('') + Array.from({ length: 27 }, (_, i) => `<line x1="0" y1="${i * 10 - 30}" x2="200" y2="${i * 10 - 30}" stroke="${(i * 10 - 30) % 50 ? '#0002' : '#f008'}" stroke-width="0.3"/>`).join('');
  svg = svg.replace(/<\/svg>\s*$/, `<g>${grid}</g></svg>`);
  await p.setContent(`<html><body style="margin:20px;background:#d9cfe6">${svg}</body></html>`);
  await p.screenshot({ path: `${OUT}/${ch}-grid.png` });
}
await b.close();
