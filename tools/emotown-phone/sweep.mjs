// Every Emotown surface on phones, signed in as the operator (admin), plus signed out and gated.
// PHONES="iPhone 15,..." ONLY=square,dms  node sweep.mjs    (DIST=<build> to test a local build)
import { webkit, chromium, devices, context, town, audit, sleep } from './lib.mjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = (process.env.OUT || new URL('./shots/', import.meta.url).pathname).replace(/\/?$/, '/');
const PHONES = (process.env.PHONES || 'iPhone 13 Mini,iPhone 15,iPhone 15 Pro Max,Pixel 7').split(',');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const tapIf = async (p, sel) => { const el = await p.$(sel); if (!el) throw new Error(`missing ${sel}`); await el.tap(); await sleep(700); };
const tapLast = async (p, sel) => { const els = await p.$$(sel); if (!els.length) throw new Error(`missing ${sel}`); await els.at(-1).scrollIntoViewIfNeeded(); await els.at(-1).tap(); await sleep(700); };
const tapText = async (p, root, text) => { const el = p.locator(root).getByText(text, { exact: false }).first(); await el.tap(); await sleep(800); };
const square = async (p) => { if (!(await p.$('.so-chat'))) await tapIf(p, '.so-hud-btn[aria-label="Town square"]'); await p.waitForSelector('.so-chat .so-msg-body', { timeout: 20000 }); await sleep(1200); };
const esc = async (p) => { await p.keyboard.press('Escape'); await sleep(400); };

// [group, state, [[step, action, rootSelector], ...]]
const GROUPS = [
  ['town', 'in', [['town', async () => {}, '.town-ui, .town-top-right, .town-hud, .town-map, .town-ticker']]],
  ['square', 'in', [
    ['square', square, '.so-chat'],
    ['msg-menu', async (p) => tapLast(p, '.so-chat .so-msg-more'), '.so-chat'],
    ['react-bar', async (p) => { await esc(p); await p.locator('.so-chat-list').tap({ position: { x: 5, y: 5 } }); await tapLast(p, '.so-chat .so-act.react'); }, '.so-chat'],
    ['react-full', async (p) => tapIf(p, '.so-reactbar .more'), '.so-chat'],
    ['reply', async (p) => { await esc(p); await tapLast(p, '.so-chat .so-act[aria-label="Reply"]'); await p.fill('.so-chat textarea', 'this is a long reply to see how the box grows on a small phone when somebody writes a lot about their cat and the burn and the town'); await sleep(500); }, '.so-chat'],
    ['mention', async (p) => { await p.fill('.so-chat textarea', 'hey @s'); await sleep(1500); }, '.so-chat'],
    ['emoji', async (p) => { await p.fill('.so-chat textarea', ''); await tapIf(p, '.so-chat .so-tool[aria-label="Emoji"]'); await sleep(800); }, '.so-chat'],
    ['gif', async (p) => { await tapIf(p, '.so-chat .so-tool[aria-label="GIF"]'); await p.waitForSelector('.so-gif-pick img'); await sleep(800); }, '.so-chat'],
    ['owner-card', async (p) => { await tapIf(p, '.so-chat .so-tool[aria-label="GIF"]'); await tapLast(p, '.so-chat .so-msg-name'); await sleep(1500); }, '.town-card, .so-owner, [role=dialog]'],
  ]],
  ['sheets', 'in', [
    ['roles-sheet', async (p) => { await square(p); await tapLast(p, '.so-chat .so-msg-more'); await tapText(p, '.so-menu', 'Roles'); await sleep(1200); }, '.modal, .modal-back, [role=dialog]'],
    ['report-sheet', async (p) => { await esc(p); await p.evaluate(() => { const ms = [...document.querySelectorAll('.so-chat .so-msg-more')].filter((b) => b.parentElement?.querySelector('.so-msg-name')?.textContent?.trim() !== 'lord'); ms.at(-1)?.setAttribute('data-t', '1'); }); await tapIf(p, '[data-t="1"]'); await tapText(p, '.so-menu', 'Report'); await sleep(800); }, '.modal, .modal-back, [role=dialog]'],
  ]],
  ['hud', 'in', [
    ['notes', async (p) => tapIf(p, '.so-hud-btn[aria-label^="Notifications"]'), '.so-pop'],
    ['me', async (p) => { await esc(p); await tapIf(p, '.so-hud-me'); }, '.so-mepop'],
    ['admin', async (p) => { await tapText(p, '.so-mepop', 'Admin tools'); await sleep(1000); }, '.so-drawer'],
    ...['Pictures', 'Muted', 'Roles', 'Square', 'Filter', 'Log'].map((t) => [`admin-${t.toLowerCase()}`, async (p) => { await tapText(p, '.so-tabs', t); await sleep(1200); }, '.so-drawer']),
  ]],
  ['dms', 'in', [
    ['dms', async (p) => tapIf(p, '.so-hud-btn[aria-label^="Messages"]'), '.so-drawer'],
    ['dm-thread', async (p) => { await tapIf(p, '.so-thread'); await sleep(1500); }, '.so-drawer'],
    ['dm-gif', async (p) => { await tapIf(p, '.so-drawer .so-tool[aria-label="GIF"]'); await p.waitForSelector('.so-gif-pick img'); await sleep(800); }, '.so-drawer'],
    ['dm-emoji', async (p) => { await tapIf(p, '.so-drawer .so-tool[aria-label="Emoji"]'); await sleep(800); }, '.so-drawer'],
    ['dm-react', async (p) => { await tapIf(p, '.so-drawer .so-tool[aria-label="Emoji"]'); await tapLast(p, '.so-drawer .so-act.react'); }, '.so-drawer'],
    ['dm-menu', async (p) => { await esc(p); await tapIf(p, '.so-drawer-head .so-btn.icon'); }, '.so-drawer'],
  ]],
  ['pets', 'in', [
    ['my-pets', async (p) => tapIf(p, '.town-mine-btn'), '.town-mine'],
    ['pet-card', async (p) => { await tapIf(p, '.town-mine-list li button, .town-mine-list button'); await sleep(2500); }, '.town-card'],
    ['pet-card-scrolled', async (p) => { await p.$eval('.town-card', (c) => { const s = [c, ...c.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)); if (s) s.scrollTop = s.scrollHeight; }); await sleep(600); }, '.town-card'],
    ['owner-from-pet', async (p) => { await tapIf(p, '.tc-owner-btn'); await sleep(1800); }, '.town-card, [role=dialog]'],
    ['finder', async (p) => { await esc(p); await esc(p); await tapIf(p, '.town-find-btn[aria-label="Find a pet"]'); await p.fill('.town-find input', 'lo'); await sleep(900); }, '.town-find'],
  ]],
  ['doors', 'in', [
    ['door', async (p) => { await p.goto(p.url().split('?')[0] + '?at=hall'); await p.waitForSelector('.so-hud-me'); await sleep(3000); const tags = await p.$$('.door-tag > button'); let done = false; for (const t of tags) { const b = await t.boundingBox(); if (b && b.x > 0 && b.x + b.width < 380) { await t.tap({ timeout: 5000 }); done = true; break; } } if (!done) throw new Error('no door tag on screen'); await sleep(900); await p.waitForSelector('.door-list', { timeout: 3000 }); }, '.door-tag, .door-list'],
  ]],
  ['out', 'out', [
    ['out-town', async () => {}, '.town-ui, .town-top-right, .town-hud'],
    ['out-square', async (p) => { await tapIf(p, '.so-hud-btn[aria-label="Town square"]'); await sleep(1500); }, '.so-chat'],
    ['out-signin', async (p) => { await tapIf(p, '.so-hud-signin'); await sleep(1200); }, '.modal, .modal-back, [role=dialog]'],
  ]],
  ['gated', 'gated', [
    ['gated-square', square, '.so-chat'],
  ]],
];

const summary = {};
for (const phone of PHONES) {
  const dev = devices[phone];
  const engine = /Pixel|Galaxy/.test(phone) ? chromium : webkit;
  const browser = await engine.launch(engine === chromium ? { executablePath: CHROME } : {});
  for (const [group, state, steps] of GROUPS) {
    if (ONLY && !ONLY.includes(group)) continue;
    const ctx = await context(browser, dev, { state });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
    try { await town(page, '', state); } catch (e) { console.log(phone, group, 'TOWN DID NOT LOAD', String(e).slice(0, 100)); await ctx.close(); continue; }
    for (const [step, act, root] of steps) {
      let issues;
      try { await act(page); issues = await audit(page, root); } catch (e) { issues = [`STEP FAILED: ${String(e).split('\n')[0].slice(0, 140)}`]; }
      const tag = `${phone.replace(/\W+/g, '')}-${step}`;
      await page.screenshot({ path: `${OUT}${tag}.png`, scale: 'css' }).catch(() => {});
      (summary[step] ??= {})[phone] = issues;
      console.log(`${phone.padEnd(18)} ${step.padEnd(18)} ${issues.length ? issues.length + ' issue(s)' : 'clean'}`);
      for (const i of issues) console.log('      ', i);
    }
    if (errs.length) console.log(`${phone} ${group} PAGE ERRORS:`, errs.join(' | '));
    await ctx.close();
  }
  await browser.close();
}
