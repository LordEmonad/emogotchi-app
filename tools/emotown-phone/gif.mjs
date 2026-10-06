// The GIF picker in the square, on phones: is the search box cut off?
import { webkit, devices, context, town, audit, sleep } from './lib.mjs';
const OUT = process.env.OUT || new URL('./shots/', import.meta.url).pathname;
const PHONES = (process.env.PHONES || 'iPhone 13 Mini,iPhone SE (3rd gen),iPhone 15,iPhone 15 Pro Max').split(',');
const browser = await webkit.launch();
for (const name of PHONES) {
  const ctx = await context(browser, devices[name]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await town(page);
  await page.tap('.so-hud-btn[aria-label="Town square"]');
  await page.waitForSelector('.so-chat .so-compose-row', { timeout: 20000 });
  await sleep(1500);
  for (const tool of ['GIF', 'Emoji']) {
    await page.tap(`.so-chat .so-tool[aria-label="${tool}"]`);
    await page.waitForSelector('.so-pick .so-pick-search', { timeout: 15000 });
    await sleep(1500);
    const m = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
      return { vh: innerHeight, chat: r('.so-chat'), pick: r('.so-pick'), search: r('.so-pick-search'), compose: r('.so-chat .so-compose') };
    });
    const cut = m.search && m.chat && m.search[0] < m.chat[0];
    console.log(`${name.padEnd(20)} ${tool.padEnd(5)} ${cut ? 'CUT ' : 'ok  '} ${JSON.stringify(m)}`);
    for (const a of await audit(page, '.so-chat')) console.log('     ', a);
    await page.screenshot({ path: `${OUT}${name.replace(/\W+/g, '-')}-${tool}.png` });
    await page.tap(`.so-chat .so-tool[aria-label="${tool}"]`);
    await sleep(500);
  }
  if (errs.length) console.log('   page errors:', errs.join(' | '));
  await ctx.close();
}
await browser.close();
