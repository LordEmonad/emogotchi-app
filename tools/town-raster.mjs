// Emotown's drawings as pictures, for Safari (2026-09-27; operator on an iPhone: "when scrolling buildings pop in and
// the background is glitchy"). WebKit re-renders a vector image from its paths every time a swipe uncovers it, and a
// phone cannot keep up with a fling: the street goes missing for frames at a time. A picture is a copy, not a render.
//
// Renders every packages/pet/town/*.svg in Chrome at 2x its town-unit size (the backdrop strips at 1.5x: they are far,
// dim and very wide) and writes packages/pet/town-2x/<name>.webp. Emotown's `art()` uses these on WebKit only.
//
//   node tools/town-raster.mjs [name...]
import puppeteer from 'puppeteer-core';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'packages/pet/town');
const OUT = join(ROOT, 'packages/pet/town-2x'); mkdirSync(OUT, { recursive: true });
const SIZE = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
const WIDE = new Set(['hills', 'skyline']);   // the backdrop: 1.5x
const only = process.argv.slice(2);
const names = readdirSync(SRC).filter((f) => f.endsWith('.svg') && !f.startsWith('._')).map((f) => f.slice(0, -4)).filter((n) => !only.length || only.includes(n));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.goto('about:blank');
let total = 0;
for (const name of names) {
  const size = SIZE[name]; if (!size) { console.log('no size for', name); continue; }
  const scale = WIDE.has(name) ? 1.5 : 2;
  const svg = readFileSync(join(SRC, `${name}.svg`), 'utf8');
  const b64 = await page.evaluate(async (svg, w, h, scale) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  }, svg, size[0], size[1], scale);
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(join(OUT, `${name}.webp`), buf);
  total += buf.length;
  console.log(name.padEnd(22), `${Math.round(size[0] * scale)}x${Math.round(size[1] * scale)}`, `${Math.round(buf.length / 1024)} KB`);
}
console.log('total', Math.round(total / 1024), 'KB');
await browser.close();
