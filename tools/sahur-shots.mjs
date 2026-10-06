// The Sahur lab, headless: opens /sahur, screenshots the page (the booth and the nine mood tiles), then runs every
// animation he has and samples frames while each plays, one contact sheet per action plus the frames. This is how
// the character is checked before the operator looks at him.
//   node tools/sahur-shots.mjs [--costume=witch|pumpkin|mummy|zombie] [--hair=1] [--scene=backrooms|halloween|plain] [--crown=0|1] [--night=1]
//        [--acts=Feed,Wash] [--every=400] [--out=<dir>] [--base=http://localhost:5177]
// Needs a dev build: the page exposes window.__lab.sahur (his director) only under import.meta.env.DEV.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const CROWN = arg('crown', '0') === '1'; const NIGHT = arg('night', '0') === '1'; const COSTUME = arg('costume', ''); const HAIR = arg('hair', '0') === '1'; const SCENE = arg('scene', '');
const OUT = arg('out', `sahur-shots/${COSTUME || 'bare'}${HAIR ? '+hair' : ''}-${CROWN ? 'crown' : 'plain'}`); const EVERY = Number(arg('every', '400'));
const BASE = arg('base', 'http://localhost:5177');
const ALL = ['Tung tung tung', 'Feed', 'Wash', 'Play', 'Pet', 'Poop', 'Sleep', 'Walk left', 'Walk right', 'Rumble', 'Yawn', 'Die'];
const ACTS = arg('acts', ALL.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const CALL = {
  'Tung tung tung': 'tung()',
  Feed: 'feed()', Wash: 'wash()', Play: 'play()', Pet: 'pet(1)', Poop: 'poop()', Clean: 'clean()', Sleep: 'sleep()', Wake: 'wake()',
  'Walk left': 'walk(160)', 'Walk right': 'walk(440)', Rumble: 'rumble()', Yawn: 'yawn()', Die: 'die()', Revive: 'revive()',
};
fs.mkdirSync(OUT, { recursive: true });
const ABS = OUT.startsWith('/') ? OUT : process.cwd() + '/' + OUT;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(`${BASE}/sahur?crown=${CROWN ? 1 : 0}${NIGHT ? '&night=1' : ''}${COSTUME ? '&costume=' + COSTUME : ''}${HAIR ? '&hair=1' : ''}${SCENE ? '&scene=' + SCENE : ''}`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__lab && window.__lab.sahur, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2600));   // the mood tiles ease in and freeze (NftArt stills after 1.6 s)
await page.evaluate(() => { window.__lab.sahur.wanderEnabled = false; });
await page.screenshot({ path: `${OUT}/page.png`, fullPage: true });
const clip = await page.evaluate(() => { const r = document.querySelector('.hlab-booth .stage').getBoundingClientRect(); return { x: Math.max(0, r.left - 2), y: r.top + window.scrollY - 2, width: Math.min(1240, r.width + 4), height: r.height + 4 }; });
await page.screenshot({ path: `${OUT}/rest.png`, clip });
const moods = await page.evaluate(() => { const r = document.querySelector('.hlab-moodset').getBoundingClientRect(); return { x: Math.max(0, r.left), y: r.top + window.scrollY, width: Math.min(1240, r.width), height: r.height }; });
await page.screenshot({ path: `${OUT}/moods.png`, clip: moods });

// a contact sheet of one action's frames, three across, so a whole action is one picture
const sheet = async (name, n) => {
  const p2 = await browser.newPage();
  const w = Math.round(clip.width * 0.5);
  const imgs = Array.from({ length: n }, (_, i) => `<figure><img src="file://${ABS}/${name}-${String(i).padStart(2, '0')}.png"><figcaption>${name} ${i}</figcaption></figure>`).join('');
  const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,${w}px);gap:6px;padding:6px">
    <style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:12px sans-serif;padding:2px 4px}</style>${imgs}</body></html>`;
  const hp = `${OUT}/${name}-sheet.html`; fs.writeFileSync(hp, html);
  await p2.setViewport({ width: w * 3 + 24, height: 800 });
  await p2.goto('file://' + (hp.startsWith('/') ? hp : process.cwd() + '/' + hp), { waitUntil: 'networkidle0' });
  await p2.screenshot({ path: `${OUT}/${name}-sheet.png`, fullPage: true });
  await p2.close();
  fs.unlinkSync(hp);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const act of ACTS) {
  const call = CALL[act]; if (!call) { console.log('unknown act', act); continue; }
  await page.evaluate((call) => {
    window.__done = false; window.__lab.sahur.wanderEnabled = false;
    Promise.resolve(new Function('d', 'return d.' + call)(window.__lab.sahur)).then(() => { window.__done = true; }, () => { window.__done = true; });
  }, call);
  const name = act.replace(/\s+/g, '-').toLowerCase();
  let i = 0; const t0 = Date.now();
  while (true) {
    await page.screenshot({ path: `${OUT}/${name}-${String(i).padStart(2, '0')}.png`, clip });
    i++;
    const done = await page.evaluate(() => window.__done);
    if (done || Date.now() - t0 > 16000) break;
    await wait(EVERY);
  }
  if (act === 'Poop') await page.evaluate(() => window.__lab.sahur.clean());
  if (act === 'Sleep') await page.evaluate(() => window.__lab.sahur.wake());
  if (act === 'Die') await page.evaluate(() => window.__lab.sahur.revive());
  await wait(700);
  await sheet(name, i);
  for (let k = 0; k < i; k++) fs.unlinkSync(`${OUT}/${name}-${String(k).padStart(2, '0')}.png`);
  console.log(act, i, 'frames');
}
await browser.close();
if (errors.length) { console.log('console/page errors:'); for (const e of errors) console.log('  ' + e); }
else console.log('no console errors');
