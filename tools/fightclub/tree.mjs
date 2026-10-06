// The id'd groups of each pet drawing as a tree (depth-indented), with each eye's visible parts measured.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
for (const ch of (process.argv[2] ?? 'cat,frog,sahur').split(',')) {
  const svg = readFileSync(`${ROOT}packages/pet/${ch}.svg`, 'utf8');
  await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const r = await p.evaluate(() => {
    const root = document.querySelector('svg'); const inv = root.getScreenCTM().inverse();
    const box = (e) => { const bb = e.getBoundingClientRect(); if (!bb.width) return '-'; const a = new DOMPoint(bb.left, bb.top).matrixTransform(inv); const z = new DOMPoint(bb.right, bb.bottom).matrixTransform(inv); return [a.x, a.y, z.x, z.y].map((v) => Math.round(v)).join(','); };
    const lines = [];
    const walk = (e, d) => { for (const c of e.children) { if (c.id && c.tagName === 'g') { if (d < 4) lines.push('  '.repeat(d) + c.id + (getComputedStyle(c).display === 'none' ? ' (hidden)' : '') + ' ' + box(c)); walk(c, d + 1); } else if (c.tagName === 'g') walk(c, d); } };
    walk(root, 0);
    const eyes = {};
    for (const id of ['eyeL', 'eyeR']) { const e = document.getElementById(id); eyes[id] = [...e.querySelectorAll('[class]')].filter((x) => getComputedStyle(x).display !== 'none').slice(0, 8).map((x) => x.getAttribute('class') + ':' + box(x)); }
    return { lines, eyes };
  });
  console.log('=====', ch); console.log(r.lines.join('\n')); console.log(JSON.stringify(r.eyes, null, 0));
}
await b.close();
