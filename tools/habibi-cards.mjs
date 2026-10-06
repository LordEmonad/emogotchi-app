// Big stills of the Habibi pack's items on each pet, from the card route (/nft?card=<mood>&character=&costume=&crown=),
// at 2x, cropped to the pet: the way to look closely at a drawing. One PNG per (pet, look), plus a sheet of them all.
//   node tools/habibi-cards.mjs --looks="keffiyeh;keffiyeh+crown;bisht;keffiyeh,bisht" [--pets=cat,frog,sahur,seal]
//        [--moods=content] [--out=<dir>] [--base=http://localhost:5173]
// A look is a costume list (commas), with "+crown" for crowned; "-" is bare.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const PETS = arg('pets', 'cat,frog,sahur,seal').split(',');
const LOOKS = arg('looks', 'keffiyeh;keffiyeh+crown').split(';');
const MOODS = arg('moods', 'content').split(',');
const OUT = arg('out', 'habibi-cards');
const BASE = arg('base', 'http://localhost:5173');
fs.mkdirSync(OUT, { recursive: true });
const ABS = OUT.startsWith('/') ? OUT : process.cwd() + '/' + OUT;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 700, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const files = [];
for (const pet of PETS) for (const look of LOOKS) for (const mood of MOODS) {
  const crown = look.includes('+crown');
  const costume = look.replace('+crown', '').replace(/^-$/, '');
  const url = `${BASE}/nft?card=${mood}&character=${pet === 'cat' ? 'cat' : pet}${costume ? '&costume=' + costume : ''}${crown ? '&crown=1' : ''}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__card_ready === true, { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 400));
      const box = await page.evaluate(() => {
        const svg = document.querySelector('.pet svg') || document.querySelector('.pet');
        const r = svg.getBoundingClientRect();
        return { x: Math.max(0, r.left - r.width * 0.2), y: Math.max(0, r.top - r.height * 0.28), width: r.width * 1.4, height: r.height * 1.42 };
      });
      const name = `${pet}-${(costume || 'bare').replace(/,/g, '+')}${crown ? '-crown' : ''}-${mood}.png`;
      await page.screenshot({ path: `${OUT}/${name}`, clip: box });
      files.push(name);
      break;
    } catch (e) { if (attempt === 2) console.log('failed', url, e.message.split('\n')[0]); await new Promise((r) => setTimeout(r, 1500)); }
  }
}
// the sheet: one row per pet
const p2 = await browser.newPage();
const cols = LOOKS.length * MOODS.length;
const html = `<html><body style="margin:0;background:#1a1024;display:grid;grid-template-columns:repeat(${cols},300px);gap:6px;padding:6px">
  <style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:12px sans-serif;padding:2px 4px}</style>
  ${files.map((f) => `<figure><img src="file://${ABS}/${f}"><figcaption>${f}</figcaption></figure>`).join('')}</body></html>`;
fs.writeFileSync(`${ABS}/sheet.html`, html);
await p2.setViewport({ width: cols * 306 + 12, height: 600 });
await p2.goto(`file://${ABS}/sheet.html`, { waitUntil: 'networkidle0' });
await p2.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
await browser.close();
if (errors.length) console.log('errors:', [...new Set(errors)].join('\n'));
console.log('out:', ABS, files.length, 'stills');
