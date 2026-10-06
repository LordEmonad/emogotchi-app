// Measure parts of each pet drawing in the drawing's own units (viewBox 200 x 230): the eyes, the face, the body, the
// head. For placing Fight Club's black eye and belt. node tools/fightclub/measure.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
for (const ch of ['cat', 'frog', 'sahur']) {
  const svg = readFileSync(`${ROOT}packages/pet/${ch}.svg`, 'utf8');
  await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const r = await p.evaluate(() => {
    const root = document.querySelector('svg');
    const inv = root.getScreenCTM().inverse();
    const box = (id) => {
      const e = document.getElementById(id); if (!e) return null;
      const bb = e.getBoundingClientRect(); if (!bb.width) return 'hidden';
      const a = new DOMPoint(bb.left, bb.top).matrixTransform(inv); const z = new DOMPoint(bb.right, bb.bottom).matrixTransform(inv);
      return [a.x, a.y, z.x, z.y].map((v) => Math.round(v * 10) / 10);
    };
    const out = {};
    for (const id of ['figure', 'head', 'face', 'eyeL', 'eyeR', 'body', 'collar', 'moon', 'legL', 'legR', 'footL', 'footR', 'tail']) out[id] = box(id);
    return out;
  });
  console.log(ch, JSON.stringify(r));
}
await b.close();
