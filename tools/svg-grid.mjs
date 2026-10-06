// A drawing at 5x with a 10-unit grid over it, to read coordinates off: node tools/svg-grid.mjs <svg> <out.png> [ids to show] [x0,y0,x1,y1]
// node grid.mjs <svgfile> <out.png> [show=id1,id2,-id3] [x0,y0,x1,y1] : the raw drawing at 5x with a 10-unit grid, optional groups shown (-id: hidden)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [,, file, out, showArg = '', boxArg = '0,-40,200,230'] = process.argv;
const [x0, y0, x1, y1] = boxArg.split(',').map(Number);
let svg = fs.readFileSync(file, 'utf8');
const K = 5;
const show = showArg ? showArg.split(',') : [];
const lines = [];
for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) lines.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${x % 50 ? '#0af' : '#f0a'}" stroke-width="${x % 50 ? 0.15 : 0.3}"/><text x="${x + 0.5}" y="${y0 + 3}" font-size="2.6" fill="#f0a">${x}</text>`);
for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) lines.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${y % 50 ? '#0af' : '#f0a'}" stroke-width="${y % 50 ? 0.15 : 0.3}"/><text x="${x0 + 0.5}" y="${y - 0.5}" font-size="2.6" fill="#f0a">${y}</text>`);
svg = svg.replace(/<svg([^>]*)viewBox="[^"]*"([^>]*)width="200" height="230"/, `<svg$1viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}"$2width="${(x1 - x0) * K}" height="${(y1 - y0) * K}"`);
svg = svg.replace('</svg>', `<g opacity="0.8">${lines.join('')}</g></svg>`);
const html = `<html><body style="margin:0;background:#eee">${svg}<script>for (const id of ${JSON.stringify(show)}) { const hide = id.startsWith('-'); const e = document.getElementById(hide ? id.slice(1) : id); if (e) { e.removeAttribute('display'); e.style.display = hide ? 'none' : 'inline'; } }</script></body></html>`;
const tmp = out + '.html'; fs.writeFileSync(tmp, html);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.setViewport({ width: (x1 - x0) * K, height: (y1 - y0) * K });
await p.goto('file://' + tmp); await p.screenshot({ path: out }); await b.close(); fs.unlinkSync(tmp);
