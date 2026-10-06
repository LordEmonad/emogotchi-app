// Wallet portraits: one 1024×1024 PNG per NFT state from /nft?card=<state>. node tools/portrait.mjs [costume] (dev server on 5199, or BASE=<its url>)
// With a costume name the set goes to public/nft/<costume>/ and the cat is dressed.
//   node tools/portrait.mjs                         the cat        -> public/nft/
//   node tools/portrait.mjs witch                   the cat, dressed -> public/nft/witch/
//   node tools/portrait.mjs inversebrah [costume]   inversebrah    -> public/nft/inversebrah/[costume/]   (costumes: witch, emohair)
//   node tools/portrait.mjs sahur [costume]         Sahur          -> public/nft/sahur/[costume/]         (costumes: witch, pumpkin, mummy, zombie, emohair)
//   BASE=http://127.0.0.1:5231 node tools/portrait.mjs thiccums [set]   Thiccums (LAB ONLY: through his lab's card view)
//                                                   -> thiccumsgotchi/nft/[set/], outside the site until he launches
//                                                   (a set is a costume, or judaica = kippah + star, habibi = bisht + keffiyeh)
//   BASE=<dev server> node tools/portrait.mjs r3tards [set]   the r3tard, through his lab's card view (/r3tards?card=, dev only)
//                                                   -> public/nft/r3tards/[set/]   (the same sets as Thiccums)
//   BASE=<a dev build> node tools/portrait.mjs emonad [set]   Emonadgotchi, through his card view (/emonadgotchi?card=, dev only)
//                                                   -> emonadgotchi/public/nft/emonad/[set/], staged outside the site until his launch
//                                                   (the same sets as the r3tard but emohair: his own hair is the look, not an item)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const STATES = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];
const args = process.argv.slice(2);
const WHO = ['inversebrah', 'sahur', 'thiccums', 'r3tards', 'emonad'].includes(args[0]) ? args[0] : 'cat';
const COSTUME = (WHO === 'cat' ? args[0] : args[1]) ?? '';
const CHARACTER = WHO === 'cat' ? '' : WHO === 'sahur' ? '&character=sahur' : '&character=frog';
const out = WHO === 'thiccums' ? `thiccumsgotchi/nft${COSTUME ? '/' + COSTUME : ''}` : WHO === 'emonad' ? `emonadgotchi/public/nft/emonad${COSTUME ? '/' + COSTUME : ''}` : `apps/web/public/nft${WHO === 'cat' ? '' : '/' + WHO}${COSTUME ? '/' + COSTUME : ''}`; fs.mkdirSync(out, { recursive: true });
const WORN = { judaica: 'kippah,starofdavid', habibi: 'bisht,keffiyeh' }[COSTUME] ?? COSTUME;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
for (const s of STATES) for (const crown of [false, true]) {
  const base = process.env.BASE || 'http://localhost:5199';
  await page.goto(WHO === 'emonad' ? `${base}/emonadgotchi?card=${s}${crown ? '&crown=1' : ''}${WORN ? '&costume=' + WORN : ''}` : WHO === 'thiccums' || WHO === 'r3tards' ? `${base}/${WHO}?card=${s}${crown ? '&crown=1' : ''}${WORN ? '&costume=' + WORN : ''}` : `${base}/nft?card=${s}${crown ? '&crown=1' : ''}${COSTUME ? '&costume=' + COSTUME : ''}${CHARACTER}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__card_ready, { timeout: 10000 });
  const name = `${s}${crown ? '-crown' : ''}-1024.png`;
  await page.screenshot({ path: `${out}/${name}`, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  console.log('wrote', name);
}
await browser.close();
