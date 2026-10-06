// The things that opened out of sight: every item of a message's menu, the reaction row and the full picker, each
// fully inside its list and the top thing at its own middle; door tags at a readable size and pressable.
import { webkit, chromium, devices, context, town, sleep } from './lib.mjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PHONES = (process.env.PHONES || 'iPhone 13 Mini,iPhone 15,iPhone 15 Pro Max,Pixel 7').split(',');
let fails = 0;
const ok = (c, what) => { console.log(c ? '  ok  ' : '  FAIL', what); if (!c) fails++; };
const whole = (page, sel, listSel) => page.evaluate(([sel, listSel]) => {
  const els = [...document.querySelectorAll(sel)]; if (!els.length) return { n: 0 };
  const list = els[0].closest(listSel); const l = list.getBoundingClientRect();
  let hidden = [];
  for (const e of els) {
    const r = e.getBoundingClientRect();
    const inside = r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (!inside || !(top === e || e.contains(top))) hidden.push((e.getAttribute('aria-label') || e.textContent).trim().slice(0, 16));
  }
  return { n: els.length, hidden };
}, [sel, listSel]);
for (const phone of PHONES) {
  const engine = /Pixel/.test(phone) ? chromium : webkit;
  const b = await engine.launch(engine === chromium ? { executablePath: CHROME } : {});
  const ctx = await context(b, devices[phone]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  console.log(phone);
  await town(page);
  await page.tap('.so-hud-btn[aria-label="Town square"]');
  await page.waitForSelector('.so-chat .so-msg-body'); await sleep(1500);
  // the newest message (yours) and the newest one by someone else: menu items all reachable
  for (const whose of ['own', 'other']) {
    await page.evaluate((whose) => { const ms = [...document.querySelectorAll('.so-chat .so-msg-more')].filter((b) => (b.parentElement?.classList.contains('mine')) === (whose === 'own')); document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t')); ms.at(-1)?.setAttribute('data-t', '1'); }, whose);
    await page.tap('[data-t="1"]'); await sleep(700);
    const m = await whole(page, '.so-chat .so-menu button', '.so-chat-list');
    ok(m.n > 0 && !m.hidden.length, `menu on the newest ${whose} message: ${m.n} items${m.hidden?.length ? ', out of reach: ' + m.hidden.join(', ') : ''}`);
    await page.locator('.so-chat-head h2').tap(); await sleep(500);
  }
  // reactions on the newest message
  await page.evaluate(() => { const l = document.querySelector('.so-chat-list'); l.scrollTop = l.scrollHeight; }); await sleep(400);
  const reacts = await page.$$('.so-chat .so-act.react'); await reacts.at(-1).tap(); await sleep(600);
  let r = await whole(page, '.so-reactbar-row button', '.so-chat-list');
  ok(r.n === 8 && !r.hidden.length, `reaction row: ${r.n} buttons${r.hidden?.length ? ', out of sight: ' + r.hidden.join(' ') : ''}`);
  await page.tap('.so-reactbar .more'); await sleep(1200);
  r = await whole(page, '.so-reactbar .so-pick-search, .so-reactbar .so-emoji-tabs button', '.so-chat-list');
  ok(r.n > 0 && !r.hidden.length, `full picker: search and tabs in sight${r.hidden?.length ? ' (not: ' + r.hidden.join(' ') + ')' : ''}`);
  await page.screenshot({ path: `${process.env.OUT || '.'}/${phone.replace(/\W+/g, '')}-reactfull.png`, scale: 'css' });
  await page.keyboard.press('Escape'); await sleep(400);
  // DMs: reactions on the newest message
  await page.locator('.so-chat-head .tc-close').tap(); await sleep(400);
  await page.tap('.so-hud-btn[aria-label^="Messages"]'); await sleep(900);
  await page.tap('.so-thread'); await sleep(1500);
  const dr = await page.$$('.so-drawer .so-act.react'); await dr.at(-1).tap(); await sleep(700);
  r = await whole(page, '.so-drawer .so-reactbar-row button', '.so-drawer-body');
  ok(r.n === 8 && !r.hidden.length, `DM reaction row: ${r.n} buttons${r.hidden?.length ? ', out of sight: ' + r.hidden.join(' ') : ''}`);
  await page.screenshot({ path: `${process.env.OUT || '.'}/${phone.replace(/\W+/g, '')}-dmreact.png`, scale: 'css' });
  await ctx.close();
  // door tags
  const ctx2 = await context(b, devices[phone]); const p2 = await ctx2.newPage();
  await town(p2, '?at=hall'); await sleep(1500);
  const tag = await p2.evaluate(() => { const t = [...document.querySelectorAll('.door-tag > button')].find((x) => { const r = x.getBoundingClientRect(); return r.left > 0 && r.right < innerWidth; }); if (!t) return null; t.setAttribute('data-t', '1'); const r = t.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), text: t.textContent }; });
  ok(tag && tag.h >= 22, `door tag "${tag?.text}" ${tag?.h}px tall`);
  await p2.tap('[data-t="1"]', { timeout: 5000 }).catch(() => {}); await sleep(800);
  const list = await p2.evaluate(() => { const b = document.querySelector('.door-list button'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), font: Math.round(parseFloat(getComputedStyle(b).fontSize) * (r.height / b.offsetHeight) * 10) / 10 }; });
  ok(list && list.h >= 34, `door list opens, rows ${list?.h}px, text ~${list?.font}px on screen`);
  const btn = await p2.evaluate(() => { const b = document.querySelector('[data-t="1"]'); const r = b.getBoundingClientRect(); const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return { top: Math.round(r.top), reachable: top === b || b.contains(top) }; });
  ok(btn.reachable, `the open list's button stays reachable (top at ${btn.top}px)`);
  await p2.screenshot({ path: `${process.env.OUT || '.'}/${phone.replace(/\W+/g, '')}-door.png`, scale: 'css' });
  await p2.mouse.click(200, 30); await sleep(500);
  ok(!(await p2.$('.door-list')), 'a tap elsewhere closes the list');
  if (errs.length) { console.log('  PAGE ERRORS', errs.join(' | ')); fails++; }
  await ctx2.close(); await b.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
