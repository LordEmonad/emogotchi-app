// The Halloween lab, headless: opens /halloween in the given outfit, screenshots the page (both booths and the
// eighteen mood tiles), then runs every animation on both characters at once and samples frames while they play,
// one contact sheet per action plus the frames. This is how an outfit is checked before the operator looks at it.
//   node tools/halloween-shots.mjs --costume=pumpkin[,zombie] --crown=0|1 [--hair=1] [--scene=1] [--night=1]
//        [--acts=Feed,Wash] [--every=450] [--out=<dir>] [--base=http://localhost:5177]     (dev server on 5177)
// Needs a dev build: the page exposes window.__lab (the two directors) only under import.meta.env.DEV.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const COSTUME = arg('costume', 'pumpkin'); const CROWN = arg('crown', '0') === '1'; const HAIR = arg('hair', '0') === '1'; const SCENE = arg('scene', '0') === '1'; const NIGHT = arg('night', '0') === '1';
const OUT = arg('out', `halloween-shots/${COSTUME.replace(/,/g, '+')}-${CROWN ? 'crown' : 'plain'}`); const EVERY = Number(arg('every', '450'));
const BASE = arg('base', 'http://localhost:5177');
const ALL = ['Feed', 'Wash', 'Play', 'Pet', 'Poop', 'Sleep', 'Walk left', 'Rumble', 'Yawn', 'Hair flick', 'Screenshot', 'Slap', 'Squeeze', 'Burn', 'Die'];
const ACTS = arg('acts', ALL.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
// director call per label; the frog's own four only run on him, the hair flick only on the cat (his does nothing visible)
const CALL = {
  Feed: 'feed()', Wash: 'wash()', Play: 'play()', Pet: 'pet(1)', Poop: 'poop()', Clean: 'clean()', Sleep: 'sleep()', Wake: 'wake()',
  'Walk left': 'walk(160)', 'Walk right': 'walk(440)', Rumble: 'rumble()', Yawn: 'yawn()', Die: 'die()', Revive: 'revive()', 'Hair flick': 'hairflick()',
  Screenshot: 'screenshot()', Slap: 'slap()', Squeeze: 'squeeze()', Burn: 'burn()',
};
const ONLY = { 'Hair flick': ['cat'], Screenshot: ['frog'], Slap: ['frog'], Squeeze: ['frog'], Burn: ['frog'] };
fs.mkdirSync(OUT, { recursive: true });
const ABS = OUT.startsWith('/') ? OUT : process.cwd() + '/' + OUT;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
const url = `${BASE}/halloween?costume=${COSTUME}&crown=${CROWN ? 1 : 0}&hair=${HAIR ? 1 : 0}${SCENE ? '&scene=halloween' : ''}${NIGHT ? '&night=1' : ''}`;
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__lab && window.__lab.cat && window.__lab.frog, { timeout: 20000 });
// let the mood tiles ease in and freeze (NftArt stills after 1.6 s), and the booths settle
await new Promise((r) => setTimeout(r, 2600));
// wandering would move the pets between frames on its own clock; the actions are what is being looked at
await page.evaluate(() => { for (const d of [window.__lab.cat, window.__lab.frog]) d.wanderEnabled = false; });
await page.screenshot({ path: `${OUT}/page.png`, fullPage: true });
// the booths' box in page coordinates (the page is at scroll 0; puppeteer captures beyond the viewport)
const clip = await page.evaluate(() => { const rs = [...document.querySelectorAll('.hlab-booth .stage')].map((e) => e.getBoundingClientRect()); const x0 = Math.min(...rs.map((r) => r.left)) - 2, x1 = Math.max(...rs.map((r) => r.right)) + 2, y0 = Math.min(...rs.map((r) => r.top)) - 2, y1 = Math.max(...rs.map((r) => r.bottom)) + 2; return { x: Math.max(0, x0), y: y0 + window.scrollY, width: Math.min(1240, x1 - x0), height: y1 - y0 }; });
await page.screenshot({ path: `${OUT}/rest.png`, clip });
// each character's nine moods at full resolution
for (const ch of ['cat', 'frog']) {
  const c = await page.evaluate((ch) => { const r = document.querySelector(`.hlab-moodset[data-character="${ch}"]`).getBoundingClientRect(); return { x: Math.max(0, r.left), y: r.top + window.scrollY, width: Math.min(1240, r.width), height: r.height }; }, ch);
  await page.screenshot({ path: `${OUT}/moods-${ch}.png`, clip: c });
}
// a contact sheet of one action's frames, three across, so a whole action is one picture
const sheet = async (name, n) => {
  const p2 = await browser.newPage();
  const imgs = Array.from({ length: n }, (_, i) => `<figure><img src="file://${ABS}/${name}-${String(i).padStart(2, '0')}.png"><figcaption>${name} ${i}</figcaption></figure>`).join('');
  const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(2,${Math.round(clip.width * 0.72)}px);gap:6px;padding:6px">
    <style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:12px sans-serif;padding:2px 4px}</style>${imgs}</body></html>`;
  const hp = `${OUT}/${name}-sheet.html`; fs.writeFileSync(hp, html);
  await p2.setViewport({ width: Math.round(clip.width * 0.72) * 2 + 18, height: 800 });
  await p2.goto('file://' + (hp.startsWith('/') ? hp : process.cwd() + '/' + hp), { waitUntil: 'networkidle0' });
  await p2.screenshot({ path: `${OUT}/${name}-sheet.png`, fullPage: true });
  await p2.close();
  fs.unlinkSync(hp);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const act of ACTS) {
  const call = CALL[act]; if (!call) { console.log('unknown act', act); continue; }
  const who = ONLY[act] ?? ['cat', 'frog'];
  await page.evaluate((who, call) => {
    window.__done = {};
    for (const w of who) { window.__done[w] = false; window.__lab[w].wanderEnabled = false; Promise.resolve(new Function('d', 'return d.' + call)(window.__lab[w])).then(() => { window.__done[w] = true; }, () => { window.__done[w] = true; }); }
  }, who, call);
  const name = act.replace(/\s+/g, '-').toLowerCase();
  let i = 0; const t0 = Date.now();
  while (true) {
    await page.screenshot({ path: `${OUT}/${name}-${String(i).padStart(2, '0')}.png`, clip });
    i++;
    const done = await page.evaluate((who) => who.every((w) => window.__done[w]), who);
    if (done || Date.now() - t0 > 16000) break;
    await wait(EVERY);
  }
  // tidy: a poop gets cleaned, sleep wakes, death revives; then a beat so the next action starts from rest
  if (act === 'Poop') await page.evaluate((who) => Promise.all(who.map((w) => window.__lab[w].clean())), who);
  if (act === 'Sleep') { await wait(900); await page.evaluate((who) => Promise.all(who.map((w) => window.__lab[w].wake())), who); }
  if (act === 'Die') { await wait(900); await page.evaluate((who) => Promise.all(who.map((w) => window.__lab[w].revive())), who); }
  await page.evaluate((who) => Promise.all(who.map((w) => window.__lab[w].walk(300))), who);
  await wait(500);
  await sheet(name, i);
  console.log(act, i, 'frames');
}
await page.screenshot({ path: `${OUT}/end.png`, clip });
await browser.close();
if (errors.length) { console.log('CONSOLE ERRORS:'); for (const e of errors) console.log('  ' + e); } else console.log('no console errors');
process.exit(0);
