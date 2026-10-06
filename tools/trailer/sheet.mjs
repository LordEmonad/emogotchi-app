// A contact sheet of a filmed take:  node tools/trailer/sheet.mjs <framesdir> <out.png> [every=12] [cols=5] [thumbw=380] [from=0] [to=end]
import puppeteer from 'puppeteer-core';
import { readdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHROME } from './lib.mjs';
const [dir, out, every = 12, cols = 5, tw = 380, from = 0, to = 1e9] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => /^f-\d+\.(png|jpg)$/.test(f)).sort().filter((_, i) => i >= +from && i <= +to && (i - +from) % +every === 0);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: +cols * (+tw + 6) + 6, height: 600 });
const html = resolve(dir, '_sheet.html');
writeFileSync(html, `<body style="margin:6px;background:#222;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;font:11px monospace;color:#ccc">${files.map((f) => `<div><img src="file://${resolve(dir, f)}" style="width:${tw}px;display:block"><span>${f.slice(2, 7)}</span></div>`).join('')}</body>`);
await page.goto('file://' + html);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
rmSync(html);
