// Desktop (mouse, hover) after the phone work: the square, its menus, reactions, pickers, door tags.
import { chromium, context, town, sleep } from './lib.mjs';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let fails = 0; const ok = (c, w) => { console.log(c ? '  ok  ' : '  FAIL', w); if (!c) fails++; };
for (const [w, h] of [[1440, 900], [1024, 768]]) {
  console.log(`${w}x${h}`);
  const ctx = await context(b, { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await town(page, '?at=hall');
  if (!(await page.$('.so-chat'))) await page.click('.so-hud-btn[aria-label="Town square"]');
  await page.waitForSelector('.so-chat .so-msg-body'); await sleep(1500);
  const msgs = await page.$$('.so-chat .so-msg');
  await msgs.at(-1).hover(); await sleep(300);
  await (await msgs.at(-1).$('.so-msg-more')).click(); await sleep(600);
  const menu = await page.evaluate(() => [...document.querySelectorAll('.so-chat .so-menu button')].map((b) => { const r = b.getBoundingClientRect(); const t = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return t === b || b.contains(t); }));
  ok(menu.length && menu.every(Boolean), `menu on the newest message: ${menu.length} items reachable`);
  await page.mouse.click(w - 30, h / 2); await sleep(400);
  ok(!(await page.$('.so-chat .so-menu')), 'a click on the town closes the menu');
  await msgs.at(-1).hover(); await sleep(300);
  await (await msgs.at(-1).$('.so-act.react')).click(); await sleep(600);
  const rb = await page.evaluate(() => { const e = document.querySelector('.so-reactbar'); const l = document.querySelector('.so-chat-list').getBoundingClientRect(); const r = e?.getBoundingClientRect(); return r ? r.bottom <= l.bottom + 1 && r.top >= l.top - 1 : false; });
  ok(rb, 'reaction row in sight');
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('.so-chat .so-tool[aria-label="GIF"]'); await page.waitForSelector('.so-gif-pick img'); await sleep(1000);
  const g = await page.evaluate(() => { const grid = document.querySelector('.so-gif-grid'); const gr = grid.getBoundingClientRect(); const s = document.querySelector('.so-pick-search').getBoundingClientRect(); const c = document.querySelector('.so-chat').getBoundingClientRect(); const picks = [...grid.querySelectorAll('.so-gif-pick')]; return { n: picks.length, side: picks.filter((p) => { const r = p.getBoundingClientRect(); return r.left < gr.left - 1 || r.right > gr.right + 1; }).length, search: s.top >= c.top, h: Math.round(document.querySelector('.so-pick').getBoundingClientRect().height) }; });
  ok(g.n === 24 && !g.side && g.search, `GIF picker: ${g.n} GIFs, ${g.side} off to the side, search in sight, ${g.h}px tall`);
  await page.screenshot({ path: `${process.env.OUT || '.'}/desk-${w}-gif.png` });
  await page.keyboard.press('Escape'); await sleep(300);
  const tag = await page.evaluate(() => { const t = [...document.querySelectorAll('.door-tag > button')].find((x) => { const r = x.getBoundingClientRect(); const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return r.left > 0 && r.right < innerWidth && (top === x || x.contains(top)); }); if (!t) return null; t.setAttribute('data-t', '1'); return { text: t.textContent, h: Math.round(t.getBoundingClientRect().height) }; });
  ok(!!tag, `a door tag on screen can be clicked: ${tag?.text} (${tag?.h}px)`);
  if (tag) { await page.click('[data-t="1"]'); await sleep(600); ok(!!(await page.$('.door-list')), 'its list opens'); }
  await page.screenshot({ path: `${process.env.OUT || '.'}/desk-${w}-door.png` });
  // a pet on the street still opens its card (the moving layer lets taps through now: pets must still take theirs)
  await page.keyboard.press('Escape');
  const pet = await page.evaluate(() => { const bodies = [...document.querySelectorAll('.catbody')].map((e) => e.getBoundingClientRect()).filter((r) => r.left > 350 && r.right < innerWidth - 20 && r.top > 120 && r.bottom < innerHeight - 80 && r.width > 20); const r = bodies[0]; return r ? { x: (r.left + r.right) / 2, y: r.top + r.height * 0.6 } : null; });
  if (pet) { await page.mouse.click(pet.x, pet.y); await sleep(1500); ok(!!(await page.$('.town-card')), 'a click on a pet opens its card'); }
  if (errs.length) { console.log('  PAGE ERRORS', errs.join(' | ')); fails++; }
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
