// The Habibi pack lab (/habibi, dev only), headless: for each pet asked for, screenshots its stage at rest and its nine
// mood tiles, then runs the actions asked for and samples frames while each plays, one contact sheet per action. This
// is how the pack's items are checked before the operator looks at them.
//   node tools/habibi-shots.mjs [--pets=cat,frog,sahur,seal] [--q=crown=1&night=1] [--acts=Play,Pet] [--every=300]
//        [--moods=1] [--out=<dir>] [--base=http://localhost:5173] [--width=620] [--rate=1]
// --rate below 1 runs the page in slow motion while an action is filmed (every animation and timer, the recorder's trick),
// so --every is in the action's own time and a quick stroke lands in a frame.
// --q is added to the lab's own query (see HabibiLab.tsx: keffiyeh, bisht, costume, scene, toy, pet, crown, night...).
// Several sessions edit the tree while this runs: a hot reload mid-action is caught and that action is run again.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const PETS = arg('pets', 'cat,frog,sahur,seal').split(',').map((s) => s.trim()).filter(Boolean);
const Q = arg('q', '');
const ACTS = arg('acts', '').split(',').map((s) => s.trim()).filter(Boolean);
const EVERY = Number(arg('every', '300'));
const MOODS = arg('moods', '0') === '1';
const OUT = arg('out', 'habibi-shots/' + (Q.replace(/[^a-z0-9=&]/gi, '').replace(/[=&]/g, '-') || 'default'));
const BASE = arg('base', 'http://localhost:5173');
const WIDTH = Number(arg('width', '620'));
const RATE = Number(arg('rate', '1'));
const ZOOM = arg('zoom', '0') === '1';
const HIRES = arg('hires', '0') === '1';   // the whole room at 2x (for a close look at something crossing it)   // film only the pet and what is beside it, at 2x (for contact: does the paw land on the thing)
const CALL = {
  Play: 'play()', Pet: 'pet(1)', Feed: 'feed()', Wash: 'wash()', Poop: 'poop()', Clean: 'clean()', Sleep: 'sleep()', Wake: 'wake()',
  'Walk left': 'walk(160)', 'Walk right': 'walk(440)', Rumble: 'rumble()', Yawn: 'yawn()', Die: 'die()', Revive: 'revive()',
  'Hair flick': 'hairflick()', Screenshot: 'screenshot()', Slap: 'slap()', Squeeze: 'squeeze()', Burn: 'burn()', Tung: 'tung()',
};
fs.mkdirSync(OUT, { recursive: true });
const ABS = OUT.startsWith('/') ? OUT : process.cwd() + '/' + OUT;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const errors = [];

async function open(pet) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH + 80, height: 1000, deviceScaleFactor: ZOOM || HIRES ? 2 : 1 });
  page.on('pageerror', (e) => errors.push(`${pet} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${pet} ${m.type()}: ${m.text()}`); });
  const load = async () => {
    await page.goto(`${BASE}/habibi?only=${pet}&moods=${MOODS ? 1 : 0}${Q ? '&' + Q : ''}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction((p) => window.__lab && window.__lab[p], { timeout: 30000 }, pet);
    await wait(MOODS ? 2600 : 900);
    await page.evaluate((p) => { window.__lab[p].wanderEnabled = false; }, pet);
    if (RATE !== 1) await page.evaluate((rate) => {
      const realTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...rest) => realTimeout(fn, (Number(ms) || 0) / rate, ...rest);
      const realAnimate = Element.prototype.animate;
      Element.prototype.animate = function animate(...args) { const a = realAnimate.apply(this, args); try { a.playbackRate = rate; } catch { /* fine */ } return a; };
      for (const a of document.getAnimations()) a.playbackRate = rate;
    }, RATE);
  };
  await load();
  return { page, load };
}
const clipOf = (page) => page.evaluate((zoom) => {
  const r = document.querySelector('.hlab-booth .stage').getBoundingClientRect();
  if (!zoom) return { x: Math.max(0, r.left - 2), y: r.top + window.scrollY - 2, width: r.width + 4, height: r.height + 4 };
  // the middle of the stage's lower half, where the pet and its toy are (the pet is walked to the middle first)
  return { x: r.left + r.width * 0.2, y: r.top + window.scrollY + r.height * 0.36, width: r.width * 0.6, height: r.height * 0.6 };
}, ZOOM);

// a contact sheet of one action's frames, three across, so a whole action is one picture
const sheet = async (name, n, w) => {
  const p2 = await browser.newPage();
  const imgs = Array.from({ length: n }, (_, i) => `<figure><img src="file://${ABS}/${name}-${String(i).padStart(2, '0')}.png"><figcaption>${name} ${i} · ${i * EVERY} ms</figcaption></figure>`).join('');
  const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,${w}px);gap:6px;padding:6px">
    <style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:12px sans-serif;padding:2px 4px}</style>${imgs}</body></html>`;
  const hp = `${ABS}/${name}-sheet.html`; fs.writeFileSync(hp, html);
  await p2.setViewport({ width: w * 3 + 24, height: 800, deviceScaleFactor: ZOOM || HIRES ? 2 : 1 });
  await p2.goto('file://' + hp, { waitUntil: 'networkidle0' });
  await p2.screenshot({ path: `${OUT}/${name}-sheet.png`, fullPage: true });
  await p2.close();
  fs.unlinkSync(hp);
};

for (const pet of PETS) {
  const { page, load } = await open(pet);
  let clip = await clipOf(page);
  await page.screenshot({ path: `${OUT}/${pet}-rest.png`, clip });
  if (MOODS) {
    const m = await page.evaluate(() => { const r = document.querySelector('.hlab-moodset').getBoundingClientRect(); return { x: Math.max(0, r.left), y: r.top + window.scrollY, width: r.width, height: r.height }; });
    await page.screenshot({ path: `${OUT}/${pet}-moods.png`, clip: m });
  }
  for (const act of ACTS) {
    const call = CALL[act]; if (!call) { console.log('unknown act', act); continue; }
    const name = `${pet}-${act.replace(/\s+/g, '-').toLowerCase()}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        if (ZOOM) await page.evaluate((p) => window.__lab[p].walk(300), pet);
        const runId = `${name}-${Date.now()}`;
        await page.evaluate((p, call, runId) => {
          window.__done = false; window.__runId = runId; window.__lab[p].wanderEnabled = false;
          Promise.resolve(new Function('d', 'return d.' + call)(window.__lab[p])).then(() => { window.__done = true; }, () => { window.__done = true; });
        }, pet, call, runId);
        let i = 0; const t0 = Date.now();
        while (true) {
          await page.screenshot({ path: `${OUT}/${name}-${String(i).padStart(2, '0')}.png`, clip });
          i++;
          // a hot reload (another session's edit) wipes the page mid-action: its frames are of a pet at rest, so run it again
          if ((await page.evaluate(() => window.__runId)) !== runId) throw new Error('the page reloaded mid-action');
          const done = await page.evaluate(() => window.__done);
          if (done || Date.now() - t0 > 20000 / RATE) break;
          await wait(EVERY / RATE);
        }
        if (act === 'Poop') await page.evaluate((p) => window.__lab[p].clean(), pet);
        if (act === 'Sleep') await page.evaluate((p) => window.__lab[p].wake(), pet);
        if (act === 'Die') await page.evaluate((p) => window.__lab[p].revive(), pet);
        await wait(700);
        await sheet(name, i, Math.round(clip.width * (ZOOM || HIRES ? 1 : 0.6)));
        for (let k = 0; k < i; k++) fs.unlinkSync(`${OUT}/${name}-${String(k).padStart(2, '0')}.png`);
        console.log(name, i, 'frames');
        break;
      } catch (e) {
        console.log(`${name}: ${e.message.split('\n')[0]} (reloading, attempt ${attempt + 1})`);
        await wait(1500); await load(); clip = await clipOf(page);
      }
    }
  }
  await page.close();
}
await browser.close();
if (errors.length) { console.log('console/page errors:'); for (const e of [...new Set(errors)]) console.log('  ' + e); }
console.log('out:', ABS);
