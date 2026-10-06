// Emonad (Emonadgotchi, the sixth pet) end to end, on an ANVIL FORK of mainnet, through the site's own buttons with his
// switch ON (tools/fork-r3tards.mjs, his way): mint on /emonadgotchi (his own mint page), then on his page feed him, play,
// name him, tap the poop (the on-chain clean), claim the Backrooms (free), the keffiyeh (a named pet's, free) and the
// beanie (the emo pack's paid edition, 30 MON) in the shop and put them on (and see them drawn), and check Get a pet (his
// card first), the gallery, the leaderboard, Emotown and the home page know him, with no page error anywhere. No stunt.
// Spends fork MON only. KEY must be a fresh `cast wallet new` key, never one of anvil's defaults (anvil #1 has EIP-7702
// code on Monad mainnet, so every item claim to it reverts).
//   fork: anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8547 --code-size-limit 131072
//         then his contract on it: forge script script/DeployEmonad.s.sol (fork RPC, a funded throwaway key,
//         --disable-code-size-limit) and allowCollection from the curator (anvil_impersonateAccount + cast send --unlocked)
//   site: cd apps/web && VITE_RPC_URL=http://127.0.0.1:8547 VITE_EMONAD_ADDRESS=<his fork address> \
//         npx vite --config ../../tools/thiccums-dev.mjs --port 5271 --strictPort   (it serves his staged pictures too)
//   BASE=http://127.0.0.1:5271 RPC=http://127.0.0.1:8547 KEY=<fresh key> OUT=<dir> node tools/fork-emonad.mjs
import puppeteer from 'puppeteer-core';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const OUT = process.env.OUT ?? '.';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5271';
const RPC = process.env.RPC ?? 'http://127.0.0.1:8547';
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.KEY ?? '')) { console.error('KEY=<a fresh cast wallet new key> is required (never an anvil default)'); process.exit(1); }
const account = privateKeyToAccount(process.env.KEY);
const wc = createWalletClient({ account, chain, transport: http(RPC) });
const pc = createPublicClient({ chain, transport: http(RPC) });
const rpcCall = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
await rpcCall('anvil_setBalance', [account.address, '0x3635C9ADC5DEA00000']);   // 1000 MON of fork money
log('wallet', account.address, 'balance', Number(await pc.getBalance({ address: account.address })) / 1e18, 'MON');
const fails = [];
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) fails.push(what); };

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

let nonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' });
const sent = [];
await page.exposeFunction('__signAndSend', async (tx) => {
  const hash = await wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined, nonce: nonce++ });
  sent.push({ hash, to: tx.to, data: tx.data.slice(0, 10), value: tx.value ? BigInt(tx.value).toString() : '0' });
  log('  tx', hash.slice(0, 12), 'to', tx.to.slice(0, 10), 'sel', tx.data.slice(0, 10), 'value', tx.value ? (Number(BigInt(tx.value)) / 1e18) + ' MON' : '0');
  return hash;
});
await page.evaluateOnNewDocument((addr, rpcUrl) => {
  const listeners = {};
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code }); return j.result;
  };
  window.ethereum = {
    isMetaMask: true,
    on(ev, fn) { (listeners[ev] ??= []).push(fn); },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn); },
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      if (method === 'eth_sendTransaction') { const tx = params[0]; return window.__signAndSend({ to: tx.to, value: tx.value, data: tx.data, gas: tx.gas }); }
      return rpc(method, params ?? []);
    },
  };
}, account.address, RPC);

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); log('shot', name); };
const text = async (sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
const clickText = async (sel, needle) => {
  const ok = await page.$$eval(sel, (els, n) => { const e = els.find((x) => x.textContent.includes(n)); if (!e) return false; e.click(); return true; }, needle);
  if (!ok) throw new Error(`no ${sel} with "${needle}"`);
};
const waitFor = (fn, ms = 120000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. /emonadgotchi: connect, mint
await page.goto(`${BASE}/emonadgotchi`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.egm-mint', { timeout: 60000 });
await shot('e01-mint-page');
check((await text('.egm-offer'))?.includes("he's the face of $EMO"), '/emonadgotchi is his mint page');
check(!(await page.$('.egm-preview')), 'no preview strip once his contract is known');
check(await page.evaluate(() => document.querySelector('#cat')?.getAttribute('data-character') === 'emonad'), 'his own rig is on the stage');
check(!(await page.evaluate(() => document.body.innerText.toLowerCase().includes('coming soon'))), 'nothing on the page says coming soon');
check((await text('.egm-end .egm-kicker'))?.includes('Minting is open'), 'the end card says minting is open');
await clickText('.egm-mint', 'Connect and mint');
await page.waitForSelector('.wallet-opt', { timeout: 10000 });
await page.click('.wallet-opt');
await waitFor(() => document.querySelector('.egm-mint')?.textContent.includes('Mint Emonad') || document.querySelector('.egm-mint')?.textContent.includes('already'), 60000);
log('mint button:', await text('.egm-mint'));
check((await text('.egm-mint')).includes('Mint Emonad · free'), 'the button offers his mint, free');
check(await page.$$eval('.egm-mint', (bs) => bs.length === 2 && bs.every((b) => b.textContent === bs[0].textContent)), 'both buttons say the same');
await page.click('.egm-mint');
await waitFor(() => document.querySelector('.egm-mint')?.textContent.includes("He's yours") || document.querySelector('.egm-err'), 180000);
log('after mint:', await text('.egm-mint'), '|', await text('.egm-err'));
await shot('e02-minted');
const href = await page.$eval('.egm-mint', (e) => e.getAttribute('href')).catch(() => null);
check(href && /^\/emonadgotchi\/pet\/\d+$/.test(href), `his page link is /emonadgotchi/pet/<id>: ${href}`);
check((await text('.egm-offer'))?.includes('minted so far'), 'the page counts how many exist');
// a second visit: one per wallet
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.egm-mint', { timeout: 60000 });
await waitFor(() => /already|Connect/.test(document.querySelector('.egm-mint')?.textContent ?? ''), 60000).catch(() => {});
if ((await text('.egm-mint'))?.includes('Connect')) { await clickText('.egm-mint', 'Connect and mint'); await page.waitForSelector('.wallet-opt', { timeout: 10000 }); await page.click('.wallet-opt'); }
await waitFor(() => document.querySelector('.egm-mint')?.textContent.includes('already'), 60000).catch(() => {});
check((await text('.egm-mint'))?.includes('You have yours already'), 'a wallet that has one is told so (one per wallet)');

// ---- 2. his page: free buttons, feed, play, name
await page.goto(`${BASE}${href}?dev=1`, { waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000);
await sleep(1500);
const active = () => page.evaluate(() => { const c = window.__chain?.active(); return c && { col: c.col, id: c.id, name: c.name, feeds: c.feeds, plays: c.plays, alive: c.alive, food: c.food, poop: c.poop, cleanups: c.cleanups }; });
const a0 = await active();
log('active:', JSON.stringify(a0), '| costs:', await page.$$eval('.action .cost', (es) => es.map((e) => e.textContent).join(',')));
check(a0?.col === 'emonad', 'the active pet is an Emonad');
check(await page.evaluate(() => document.querySelector('#cat')?.getAttribute('data-character') === 'emonad'), 'the rig on his page is his');
check(await page.$$eval('.action .cost', (es) => es.length > 0 && es.every((e) => e.textContent === 'free')), 'every action says free');
const labels = await page.$$eval('.action .action-label', (es) => es.map((e) => e.textContent));
log('actions:', labels.join(', '));
check(!labels.some((l) => ['Slap', 'Screenshot', 'Squeeze', 'Set on fire', 'Tung tung tung', 'Butt bounce'].includes(l)), 'no stunt buttons on him');
check((await text('.petview'))?.includes('Emonad'), 'his page calls him an Emonad');
await shot('e03-page');
const clickAction = async (label) => {
  const [btn] = await page.$$(`xpath/.//button[contains(@class,"action")][.//span[contains(@class,"action-label") and text()="${label}"]]`);
  if (!btn) throw new Error(`no action ${label}`);
  await btn.click();
};
const waitIdle = async () => { await waitFor(() => { const p = window.__pet; return p && !p.director.isBusy && !(window.__chain && window.__chain.get().pending); }, 180000); };
log('feed…'); await clickAction('Feed'); await sleep(2500); await shot('e04-eating'); await waitIdle();
await waitFor((b) => (window.__chain?.active()?.feeds ?? 0) !== b, 40000, a0.feeds).catch(() => {});
let a = await active(); log('after feed:', JSON.stringify(a)); check(a.feeds === a0.feeds + 1, 'feeds went up by one on chain');
log('play…'); await clickAction('Play'); await sleep(2500); await waitIdle();
await waitFor((b) => (window.__chain?.active()?.plays ?? 0) !== b, 40000, a0.plays).catch(() => {});
a = await active(); check(a.plays === a0.plays + 1, 'plays went up by one on chain');
const named = await page.evaluate(() => { const b = document.querySelector('.name-btn'); if (!b || b.disabled) return false; b.click(); return true; });
if (named) {
  await page.waitForSelector('.name-input', { timeout: 5000 });
  await page.type('.name-input', 'Not A Phase');
  await page.click('.name-ok'); await sleep(2000); await waitIdle();
  await waitFor(() => (window.__chain?.active()?.name ?? '') !== '', 60000).catch(() => {});
  a = await active(); log('after name:', JSON.stringify(a)); check(a.name === 'Not A Phase', 'named for 10 MON on chain');
} else check(false, 'the name button is there');
await shot('e05-named');

// ---- 3. the poop: warp the fork 5 hours, tap the poop itself, expect the on-chain clean
await rpcCall('evm_increaseTime', [5 * 3600]); await rpcCall('evm_mine', []);
await page.reload({ waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000);
await waitFor(() => !!document.querySelector('.prop-poop-live'), 60000).catch(() => {});
a = await active(); log('after 5h:', JSON.stringify(a));
check(a.poop === true, 'the contract says there is a poop');
check(await page.$('.prop-poop-live'), 'the poop is in the room');
await shot('e06-poop');
const before = sent.length; const cleanups0 = a.cleanups;
await waitIdle();
const box = await page.$('.prop-poop-live');
if (box) { const b = await box.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
await sleep(2500); await waitIdle();
await waitFor((c) => (window.__chain?.active()?.cleanups ?? 0) !== c, 40000, cleanups0).catch(() => {});
a = await active(); log('after tapping the poop:', JSON.stringify(a));
check(sent.length === before + 1, `a tap on the poop sent exactly one transaction (${sent.length - before})`);
check(a.cleanups === cleanups0 + 1 && a.poop === false, 'the on-chain clean landed and the poop is gone');

// ---- 4. the shop (classic cards): the Backrooms (7, free), the keffiyeh (13, a named pet's) and the beanie (18, 30 MON)
await page.goto(`${BASE}/shop?classic=1`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.item-card', { timeout: 60000 });
await clickText('.item-card .btn', 'Connect to claim').catch(() => {});
await page.waitForSelector('.wallet-opt', { timeout: 10000 }).then(() => page.click('.wallet-opt')).catch(() => {});
// the shop reads the wallet's pets across every game; on a fork that read can stall on the fork's own lazy fetches from the
// public RPC (it did once with another fork busy): if it has not answered in 45 s, load the page again (twice at most)
for (let tries = 0; tries < 2; tries++) {
  const ok = await waitFor(() => ![...document.querySelectorAll('.item-note')].some((n) => n.textContent.includes('Looking in your wallet')) && !!document.querySelector('.item-card'), 45000).then(() => true, () => false);
  if (ok) break;
  log('the shop is still looking in the wallet: loading it again');
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('.item-card', { timeout: 60000 });
}
const card = (title) => page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); return c ? c.innerText.replace(/\n+/g, ' | ') : null; }, title);
for (const title of ['Backrooms theme', 'Keffiyeh', 'Beanie']) {
  await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && ([...c.querySelectorAll('button')].some((b) => b.textContent.startsWith('Claim ·') && !b.disabled) || c.textContent.includes('You have'))), 90000, title).catch(() => {});
  log(title, ':', (await card(title))?.slice(-220));
  const clicked = await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); const b = c && [...c.querySelectorAll('button')].find((x) => x.textContent.startsWith('Claim ·')); if (!b || b.disabled) return false; b.click(); return true; }, title);
  if (clicked) {
    await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && c.textContent.includes('You have')), 180000, title).catch(() => {});
    log(title, 'after claim:', (await card(title))?.slice(-220));
  }
  check((await card(title))?.includes('You have'), `${title}: claimed and held`);
  const picked = await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); const box = c?.querySelector('.item-cat input[type=checkbox]'); if (!box) return false; if (!box.checked) box.click(); return true; }, title);
  if (picked) {
    await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); [...c.querySelectorAll('button')].find((x) => /^(Dress|Give|Put)/.test(x.textContent))?.click(); }, title);
    await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && !!c.querySelector('.item-cat-wearing')), 180000, title).catch(() => {});
    log(title, 'after wear:', (await card(title))?.slice(-220));
  }
  check(await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); return !!c?.querySelector('.item-cat-wearing'); }, title), `${title}: on him`);
}
// the emo hair is his own look already: the shop never offers to put it on him
check(await page.$$eval('.item-card', (cs) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === 'Emo hair'); return !c || !c.querySelector('.item-cat input[type=checkbox]') || ![...c.querySelectorAll('.item-cat')].some((l) => /Emonad/.test(l.textContent)); }), 'the emo hair is not offered for him (his own look)');
await shot('e07-shop');

// ---- 5. his page again: the Backrooms, the keffiyeh and the beanie drawn on him
await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000);
await sleep(2500);
const drawn = await page.evaluate(() => {
  const shown = (s) => { const e = document.querySelector('#cat ' + s); return e ? getComputedStyle(e).display !== 'none' : null; };
  return { scene: document.querySelector('.stage')?.getAttribute('data-scene'), keffiyeh: shown('#keffiyeh'), beanie: shown('#beanie') };
});
log('drawn:', JSON.stringify(drawn));
check(drawn.scene === 'backrooms', 'the Backrooms is his room');
check(drawn.keffiyeh === true || drawn.beanie === true, 'his head piece is drawn on him (one at a time: the last put on)');
await shot('e08-dressed');

// ---- 6. Get a pet (his card first), the gallery, the leaderboard, the home page, Emotown
await page.goto(`${BASE}/adopt`, { waitUntil: 'networkidle0' });
await sleep(2500);
check(await page.$('.adopt-card[data-pet="emonad"]'), 'Get a pet has his card');
check(await page.evaluate(() => document.querySelector('.adopt-grid .adopt-card')?.getAttribute('data-pet') === 'emonad'), 'his card is the first');
check((await text('.adopt-head h1'))?.includes('Five of them are free'), 'Get a pet counts five free pets');
check(await page.evaluate(() => document.querySelector('.adopt-card[data-pet="emonad"] #cat')?.getAttribute('data-character') === 'emonad'), 'his card shows him live');
await page.screenshot({ path: `${OUT}/e09-adopt.png`, fullPage: true });
await page.goto(`${BASE}/pets?pet=emonad`, { waitUntil: 'networkidle0' });
await waitFor(() => document.querySelectorAll('a[href^="/emonadgotchi/pet/"]').length > 0 || document.querySelector('.lb-note'), 60000).catch(() => {});
await sleep(1500);
const galLinks = await page.$$eval('a[href^="/emonadgotchi/pet/"]', (as) => as.length);
check(galLinks > 0, `the gallery lists Emonads with /emonadgotchi/pet links (${galLinks})`);
check(await page.$$eval('.pet-switch button', (bs) => bs.some((b) => b.textContent.includes('Emonad') && b.getAttribute('aria-selected') === 'true')), 'the gallery switch has his tab, selected');
// (a dressed pet's card is its portrait, /nft/emonad/<set>/…; an undressed one's is his on-chain picture)
check(await page.$$eval('.gallery-img img, img.gallery-img', (is) => is.length > 0 && is.every((i) => i.complete && i.naturalWidth > 0)).catch(() => false), 'his gallery picture loads');
log('gallery picture:', await page.$eval('.gallery-img img, img.gallery-img', (i) => i.getAttribute('src').slice(0, 60)).catch(() => null));
await shot('e10-gallery');
await page.goto(`${BASE}/leaderboard`, { waitUntil: 'networkidle0' });
await sleep(800);
check(await page.$$eval('.lb-tabs button, .pet-switch button', (bs) => bs.some((b) => b.textContent.includes('Emonad'))), 'the leaderboard has his tab');
await clickText('.lb-tabs button, .pet-switch button', 'Emonad'); await sleep(3500);
check((await text('h1'))?.includes('Emonad'), `the leaderboard's heading names him: ${await text('h1')}`);
await shot('e11-leaderboard');
await page.goto(`${BASE}/?view=landing`, { waitUntil: 'networkidle0' });
await sleep(800);
check(await page.$$eval('.hero-switch button', (bs) => bs.some((b) => b.textContent === 'Emonadgotchi')), 'the landing hero switches to him');
check(await page.$('.pet-card[data-pet="emonad"]'), 'the landing has his card');
await page.screenshot({ path: `${OUT}/e12-landing.png`, fullPage: true });
await page.goto(`${BASE}/emotown`, { waitUntil: 'domcontentloaded' });   // (the town never goes quiet: its socket and its feed)
await sleep(9000);
await shot('e13-emotown');

// ---- 7. a phone
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
for (const [p, name] of [['/emonadgotchi', 'e14-phone-mint'], [href, 'e15-phone-pet'], ['/adopt', 'e16-phone-adopt'], ['/?view=landing', 'e17-phone-landing'], ['/pets?pet=emonad', 'e18-phone-gallery'], ['/leaderboard', 'e19-phone-board'], ['/shop', 'e20-phone-shop'], ['/stats', 'e21-phone-stats']]) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle0' }); await sleep(1500);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!wide, `${p} at 390: no sideways scroll`);
  await shot(name);
}
log('errors:', errors.length ? errors : 'none');
check(errors.length === 0, 'no page errors');
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' · ')}` : 'ALL PASSED');
await browser.close();
process.exit(fails.length ? 1 : 0);
