// Which sounds an action makes, and when: runs a pet's actions in a lab headless (with ?sound=1, since sound is off
// under a test driver), presses once to let the browser start audio, and prints every cue with its time from the
// action's start, plus whether the audio engine is running and which tune is on.
//
//   cd apps/web && npx vite --config ../../tools/thiccums-dev.mjs --port 5271 --strictPort
//   [DIR=window.__lab.frog] node tools/sound-cues.mjs [/habibi] ["feed()" "wash()" ...]
// A call may be several statements on the director `d`: "(d.setToy('dreidel'), d.play())".
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5271';
const path = process.argv[2] ?? '/?view=pet';
const calls = process.argv.slice(3).length ? process.argv.slice(3) : ['feed()'];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[sound]')) errors.push(m.text()); });
await page.setViewport({ width: 1100, height: 900 });
await page.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}sound=1`, { waitUntil: 'domcontentloaded' });
// DIR=<expression for the director> picks one in a lab with several (window.__lab.frog)
const director = process.env.DIR ?? `(window.__pet?.director ?? Object.values(window.__lab ?? {})[0])`;
await page.waitForFunction(`!!${director} && !!window.__cues`, { timeout: 30000 });
await page.mouse.click(8, 8);   // the press that lets audio start
await new Promise((r) => setTimeout(r, 600));
for (const call of calls) {
  const expr = call.startsWith('(') ? call : `d.${call}`;
  const t0 = await page.evaluate(`(() => { window.__cues.length = 0; const d = ${director}; d.wanderEnabled = false; window.__done = false; const t = performance.now(); Promise.resolve(${expr}).then(() => { window.__done = true; }); return Math.round(t); })()`);
  await page.waitForFunction('window.__done', { timeout: 60000, polling: 100 });
  await new Promise((r) => setTimeout(r, 300));
  const cues = await page.evaluate('window.__cues.slice()');
  console.log(`\n== ${call}  (${cues.length} cues)`);
  for (const c of cues) console.log(`  ${String(c.t - t0 + Math.round(c.delay * 1000)).padStart(6)} ms  ${c.name}${c.v !== 1 ? `  v ${c.v.toFixed(2)}` : ''}`);
}
console.log('\nengine:', JSON.stringify(await page.evaluate('window.__soundState()')));
const pill = await page.evaluate(() => !!document.querySelector('.snd'));
console.log(`\nspeaker control on the page: ${pill}`);
await browser.close();
if (errors.length) { console.log('ERRORS:'); for (const e of [...new Set(errors)]) console.log(' ', e); process.exitCode = 1; }
