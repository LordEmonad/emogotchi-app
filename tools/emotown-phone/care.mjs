// The care panel with a (read-only) wallet, and a tap on a pet walking the street, on phones.
import { webkit, chromium, devices, context, town, audit, sleep } from './lib.mjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let fails = 0; const ok = (c, w) => { console.log(c ? '  ok  ' : '  FAIL', w); if (!c) fails++; };
for (const phone of ['iPhone 13 Mini', 'iPhone 15', 'Pixel 7']) {
  const engine = /Pixel/.test(phone) ? chromium : webkit;
  const b = await engine.launch(engine === chromium ? { executablePath: CHROME } : {});
  const ctx = await context(b, devices[phone], { wallet: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  console.log(phone);
  await town(page);
  await page.tap('.town-mine-btn'); await sleep(700);
  await (await page.$('.town-mine-list button')).tap(); await sleep(3000);
  const grid = await page.$$eval('.tc-care-btn', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 14), h: Math.round(r.height), w: Math.round(r.width) }; }));
  ok(grid.length >= 5, `care buttons: ${grid.map((g) => `${g.t} ${g.w}x${g.h}`).join(', ')}`);
  ok(grid.every((g) => g.h >= 36), 'every care button a finger tall');
  const issues = await audit(page, '.town-card');
  ok(!issues.length, `pet card audit${issues.length ? ': ' + issues.join(' | ') : ''}`);
  await page.$eval('.town-card', (c) => { c.scrollTop = 0; });
  await page.screenshot({ path: `${process.env.OUT || '.'}/${phone.replace(/\W+/g, '')}-care.png`, scale: 'css' });
  await page.$eval('.town-card', (c) => { c.scrollTop = c.scrollHeight; }); await sleep(400);
  await page.screenshot({ path: `${process.env.OUT || '.'}/${phone.replace(/\W+/g, '')}-care-end.png`, scale: 'css' });
  await page.tap('.town-card .tc-close'); await sleep(800);
  // a pet on the street, tapped
  const pet = await page.evaluate(() => { const r = [...document.querySelectorAll('.catbody')].map((e) => e.getBoundingClientRect()).find((r) => r.left > 30 && r.right < innerWidth - 30 && r.top > 200 && r.bottom < innerHeight - 90 && r.width > 16); return r ? { x: (r.left + r.right) / 2, y: r.top + r.height * 0.6 } : null; });
  if (pet) { await page.touchscreen.tap(pet.x, pet.y); await sleep(1800); ok(!!(await page.$('.town-card')), 'a tap on a pet on the street opens its card'); } else ok(false, 'no pet on screen to tap');
  if (errs.length) { console.log('  PAGE ERRORS', errs.join(' | ')); fails++; }
  await b.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
