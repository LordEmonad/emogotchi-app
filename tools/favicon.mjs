// The site's icons, drawn from public/favicon.svg (the cat, 135 KB of paths): a 64px PNG for the browser tab and a 180px
// apple-touch-icon for a phone's home screen (on a dark square, as iOS does not do transparency there). Rerun when the
// favicon changes. The mobile pass (2026-09-29): every first visit downloaded the whole drawing to show a 16px icon.
//   node tools/favicon.mjs
import puppeteer from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../apps/web/public/favicon.svg', import.meta.url), 'utf8');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
const shoot = async (size, bg, pad, out, filter = 'none') => {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:${bg}"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;filter:${filter};box-sizing:border-box;padding:${pad}px">${svg.replace(/width="200" height="230"/, 'width="100%" height="100%"')}</div></body>`);
  const png = await page.screenshot({ omitBackground: bg === 'transparent', type: 'png' });
  await writeFile(new URL(`../apps/web/public/${out}`, import.meta.url), png);
  console.log(out, Math.round(png.length / 1024), 'KB');
};
await shoot(64, 'transparent', 0, 'favicon-64.png');
await shoot(180, '#1a0f24', 18, 'apple-touch-icon.png');
// the home-screen app (public/manifest.webmanifest): Android and the install prompt; the maskable one keeps the cat inside
// the safe circle; the badge is the white silhouette Android shows in the status bar
await shoot(192, '#1a0f24', 20, 'icon-192.png');
await shoot(512, '#1a0f24', 52, 'icon-512.png');
await shoot(512, '#1a0f24', 112, 'icon-maskable-512.png');
await shoot(96, 'transparent', 6, 'badge-96.png', 'brightness(0) invert(1)');
await browser.close();
