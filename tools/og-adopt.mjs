// The link-preview card for /adopt ("Get a pet"): apps/web/public/brand/adopt-og.png, 1200x630 at 2x. The copy on the
// left; on the right the five pets in their own rooms from the real stage (/pfplab, the profile pictures' lab: the
// frok crowned at night, Sahur mid-tung in the Backrooms, Thiccums crowned mid butt-bounce, the r3tard crowned, the cat
// crowned at home), the free ones first, three over two. No window covers another's caption. (Thiccums since his launch, 2026-09-29: the dev server
// needs his switch on, VITE_THICCUMS_ADDRESS in .env.local.)
//   node tools/og-adopt.mjs [--site http://localhost:5199]      (a dev server of apps/web)
//   node tools/og-adopt.mjs --six --site <a dev-mode build>    the card with Emonad (the sixth pet) first, three over three, staged
//        as emonadgotchi/public/brand/adopt-og-6.png until his launch (tools/emonad-launch.mjs points og-meta at it)
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const site = arg('--site', 'http://localhost:5199');
const SIX = process.argv.includes('--six');
const font = root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const heart = readFileSync(root + 'tools/og/card.html', 'utf8').match(/<div class="brand">(<svg[\s\S]*?<\/svg>)/)[1];
const tmp = mkdtempSync(join(tmpdir(), 'og-adopt-'));

const PETS5 = [
  // zoom: how far the window closes in on the pet (the room is 600x460 and a pet stands small in it), and on what point
  { key: 'frok', color: '#5da03a', tag: 'Free', name: 'inversebrah', q: 'character=frog&card=happy&crown&night=1', ms: 0, zoom: 1.55, at: '50% 72%' },
  { key: 'sahur', color: '#d2822e', tag: 'Free', name: 'Tung Tung Tung Sahur', q: 'character=sahur&card=happy&scene=backrooms&action=tung', ms: 2550, zoom: 1.12, at: '55% 70%' },
  { key: 'thiccums', color: '#6fb7e8', tag: 'Free', name: 'Thiccums', q: 'character=thiccums&card=happy&crown&action=bounce', ms: 2900, zoom: 1.6, at: '50% 72%' },
  { key: 'r3tards', color: '#e6cf5a', tag: 'Free', name: 'r3tardgotchi', q: 'character=r3tards&card=content&crown', ms: 0, zoom: 1.34, at: '50% 74%' },
  { key: 'cat', color: '#E84D7F', tag: 'Claim', name: 'The cat', q: 'character=cat&card=happy&crown', ms: 0, zoom: 1.6, at: '50% 76%' },
];
// with Emonad: him FIRST (the operator, 2026-10-05), crowned in his emo bedroom at night, then the others
const EMONAD = { key: 'emonad', color: '#c4a0f2', tag: 'Free', name: 'Emonadgotchi', q: 'character=emonad&card=happy&crown&scene=emoroom&night=1', ms: 0, zoom: 1.4, at: '50% 60%' };
const PETS = SIX ? [EMONAD, ...PETS5] : PETS5;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const p of PETS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 3 });
  await page.goto(`${site}/pfplab?${p.q}`, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForFunction(() => window.__card_ready === true, { timeout: 60000 });
  if (p.ms) await page.evaluate((ms) => window.__shoot(ms), p.ms);
  else await new Promise((r) => setTimeout(r, 400));
  const stage = await page.$('.stage');
  await stage.screenshot({ path: join(tmp, `${p.key}.png`) });
  await page.close();
}

const win = (p, style) => `<figure class="win" style="${style};--c:${p.color}"><div class="ph"><img src="file://${join(tmp, `${p.key}.png`)}" style="transform:scale(${p.zoom});transform-origin:${p.at}"></div><figcaption><b>${p.tag}</b>${p.name}</figcaption></figure>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'SG'; src: url('file://${font}') format('woff2'); font-weight: 300 700; }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; background:#000; font-family:'SG',sans-serif; color:#F8F8FF; -webkit-font-smoothing:antialiased; }
.card { position:relative; width:1200px; height:630px; overflow:hidden; background: radial-gradient(120% 90% at 30% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%); }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) 2.6px, transparent 2.8px); background-size:44px 44px; -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.25) 55%, transparent); }
.copy { position:absolute; left:64px; top:0; height:630px; width:420px; display:flex; flex-direction:column; justify-content:center; gap:18px; padding-bottom:16px; z-index:3; }
.brand { display:flex; align-items:center; gap:14px; font-weight:700; font-size:38px; letter-spacing:-.02em; } .brand svg { width:34px; height:34px; }
.eyebrow { display:inline-flex; align-self:flex-start; padding:8px 16px; border-radius:999px; font-size:16px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#EAC6EA; background:rgba(80,40,88,.45); border:1px solid rgba(184,148,216,.3); }
h1 { margin:0; font-size:74px; line-height:.98; letter-spacing:-.035em; font-weight:700; }
h1 span { display:block; font-size:48px; line-height:1.05; margin-top:10px; background: linear-gradient(90deg,#ff7aa6,#E84D7F 45%,#B894D8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sub { margin:0; font-size:20px; line-height:1.42; color:rgba(248,248,255,.8); } .sub b { color:#F8F8FF; font-weight:600; }
.foot { position:absolute; left:64px; bottom:32px; font-size:18px; color:rgba(234,198,234,.75); z-index:3; } .foot b { color:#EAC6EA; font-weight:600; }
.win { position:absolute; margin:0; width:218px; border-radius:20px; padding:6px; background:linear-gradient(180deg, rgba(60,34,64,.95), rgba(26,22,32,.98)); border:4px solid var(--c); box-shadow: 0 0 0 7px color-mix(in srgb, var(--c) 22%, transparent), 0 34px 70px -24px rgba(0,0,0,.95); }
.win .ph { overflow:hidden; border-radius:14px; aspect-ratio: 600 / 460; }
.win img { display:block; width:100%; height:100%; object-fit:cover; }
.win figcaption { display:flex; align-items:center; gap:7px; padding:8px 4px 3px; font-size:14.5px; font-weight:700; letter-spacing:-.01em; white-space:nowrap; }
.win figcaption b { padding:3px 8px; border-radius:999px; background:var(--c); color:#12081f; font-size:11.5px; letter-spacing:.06em; text-transform:uppercase; }
</style></head><body><div class="card">
<div class="dots"></div>
${SIX ? [
  win(PETS[0], 'left:476px;top:44px;transform:rotate(-4deg);z-index:6'),
  win(PETS[1], 'left:704px;top:30px;transform:rotate(2.5deg);z-index:5'),
  win(PETS[2], 'left:932px;top:46px;transform:rotate(-2.5deg);z-index:4'),
  win(PETS[3], 'left:490px;top:332px;transform:rotate(3deg);z-index:3'),
  win(PETS[4], 'left:718px;top:318px;transform:rotate(-2deg);z-index:2'),
  win(PETS[5], 'left:946px;top:334px;transform:rotate(3deg);z-index:1'),
].join('\n') : [
  win(PETS[0], 'left:484px;top:52px;transform:rotate(-4deg);z-index:5'),
  win(PETS[1], 'left:712px;top:36px;transform:rotate(2.5deg);z-index:4'),
  win(PETS[2], 'left:940px;top:54px;transform:rotate(-2.5deg);z-index:3'),
  win(PETS[3], 'left:598px;top:330px;transform:rotate(3deg);z-index:2'),
  win(PETS[4], 'left:832px;top:336px;transform:rotate(-3deg);z-index:1'),
].join('\n')}
<div class="copy">
  <div class="brand">${heart} Emogotchi</div>
  <div class="eyebrow">Adopt</div>
  <h1>Get a pet.<span>${SIX ? 'Five' : 'Four'} of them<br>are free.</span></h1>
  <p class="sub">${SIX ? '<b>Emonad</b>, <b>inversebrah</b>, <b>Tung Tung Tung Sahur</b>, <b>Thiccums</b> and the <b>r3tard</b> are free to mint, one each per wallet. The cat is claimed from the list. All six live on chain.' : '<b>inversebrah</b>, <b>Tung Tung Tung Sahur</b>, <b>Thiccums</b> and the <b>r3tard</b> are free to mint, one each per wallet. The cat is claimed from the list. All five live on chain.'}</p>
</div>
<div class="foot"><b>$EMO</b> on Monad · emogotchi.emonad.lol/adopt</div>
</div></body></html>`;
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
const file = join(tmp, 'card.html');
writeFileSync(file, html);   // a file:// page may load file:// pictures
await page.goto('file://' + file, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
const OUT = SIX ? root + 'emonadgotchi/public/brand/adopt-og-6.png' : root + 'apps/web/public/brand/adopt-og.png';
mkdirSync(join(OUT, '..'), { recursive: true });
await page.screenshot({ path: OUT });
await browser.close();
for (const f of ['card.html', ...PETS.map((p) => `${p.key}.png`)]) { try { unlinkSync(join(tmp, f)); } catch { /* gone */ } }
console.log('wrote', OUT.replace(root, ''));
