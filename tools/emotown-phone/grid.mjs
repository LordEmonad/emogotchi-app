import { webkit, chromium, devices, context, town, sleep } from './lib.mjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
for (const [engine, dev, label] of [[webkit, devices['iPhone 15'], 'iphone'], [webkit, devices['iPhone 13 Mini'], 'mini'], [chromium, devices['Pixel 7'], 'pixel'], [chromium, { viewport: { width: 1440, height: 900 } }, 'desktop']]) {
  const b = await engine.launch(engine === chromium ? { executablePath: CHROME } : {});
  const ctx = await context(b, dev);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await town(page);
  if (!(await page.$('.so-chat'))) await page.click('.so-hud-btn[aria-label="Town square"]');
  await page.waitForSelector('.so-chat .so-compose-row');
  await sleep(800);
  await page.click('.so-chat .so-tool[aria-label="GIF"]');
  await page.waitForSelector('.so-gif-pick img');
  await sleep(1500);
  const m = () => page.evaluate(() => {
    const g = document.querySelector('.so-gif-grid'); const gr = g.getBoundingClientRect();
    const picks = [...g.querySelectorAll('.so-gif-pick')].map((p) => p.getBoundingClientRect());
    const side = picks.filter((r) => r.left < gr.left - 1 || r.right > gr.right + 1).length;
    const s = document.querySelector('.so-pick-search').getBoundingClientRect(), c = document.querySelector('.so-chat').getBoundingClientRect();
    return { items: picks.length, offToTheSide: side, scrollsDown: g.scrollHeight > g.clientHeight, sideScroll: g.scrollWidth - g.clientWidth, pickH: Math.round(document.querySelector('.so-pick').getBoundingClientRect().height), searchVisible: s.top >= c.top && s.bottom <= c.bottom };
  });
  const a = await m();
  await page.$eval('.so-gif-grid', (g) => { g.scrollTop = g.scrollHeight; });
  await sleep(400);
  await page.screenshot({ path: `${process.env.OUT || '.'}/grid-${label}-bottom.png` });
  await page.click('.so-gif-grid .so-older');
  await sleep(1500);
  const b2 = await m();
  console.log(label.padEnd(8), JSON.stringify(a), '| after More:', b2.items, 'items, off to the side', b2.offToTheSide, errs.length ? 'ERRORS ' + errs.join(' | ') : '');
  await page.$eval('.so-gif-grid', (g) => { g.scrollTop = 0; });
  await sleep(300);
  await page.screenshot({ path: `${process.env.OUT || '.'}/grid-${label}.png` });
  await b.close();
}
