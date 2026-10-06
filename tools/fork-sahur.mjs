// Tung Tung Tung Sahur end to end, on an ANVIL FORK of mainnet, through the site's own buttons, as a dev wallet
// (anvil's account #1; its key is the public anvil default, not a secret): mint on /tung, then on his page feed,
// tung tung tung, name him, tap the poop (the on-chain clean), claim the Backrooms and the emo hair in the shop and
// put them on, and check the gallery, the leaderboard and the stats live tiles know him. Spends fork MON only.
//   fork: anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8546 --auto-impersonate --code-size-limit 131072
//   site: VITE_RPC_URL=http://127.0.0.1:8546 VITE_SAHUR_ADDRESS=<deployed on the fork> npx vite --port 5201 --strictPort
//   BASE=http://localhost:5201 OUT=<dir> node tools/fork-sahur.mjs
import puppeteer from 'puppeteer-core';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const OUT = process.env.OUT ?? '.';
const BASE = process.env.BASE ?? 'http://localhost:5201';
const RPC = process.env.RPC ?? 'http://127.0.0.1:8546';
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(process.env.KEY ?? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
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

// ---- 1. /tung: connect, mint
await page.goto(`${BASE}/tung`, { waitUntil: 'networkidle0' });
await shot('s01-tung');
check((await text('h1'))?.includes('Tung Tung Tung Sahur'), '/tung is his page');
check(await page.$('.pet.sahur, [data-character="sahur"], .stage'), 'his stage is on the page');
await clickText('.mint-btn', 'Connect and mint');
await page.waitForSelector('.wallet-opt', { timeout: 10000 });
await page.click('.wallet-opt');
await waitFor(() => document.querySelector('.mint-btn')?.textContent.includes('Mint Sahur') || document.querySelector('.mint-btn')?.textContent.includes('already'), 60000);
log('mint button:', await text('.mint-btn'));
check((await text('.mint-btn')).includes('Mint Sahur · free'), 'the button offers his mint, free');
await page.click('.mint-btn');
await waitFor(() => document.querySelector('.mint-btn')?.textContent.includes("He's yours") || document.querySelector('.mint-error'), 180000);
log('after mint:', await text('.mint-btn'), '|', await text('.mint-error'));
await shot('s02-minted');
const href = await page.$eval('.mint-btn', (e) => e.getAttribute('href')).catch(() => null);
check(href && /^\/tung\/pet\/\d+$/.test(href), `his page link is /tung/pet/<id>: ${href}`);

// ---- 2. his page: free buttons, feed, tung tung tung, name
await page.goto(`${BASE}${href}?dev=1`, { waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000);
await sleep(1500);
const active = () => page.evaluate(() => { const c = window.__chain?.active(); return c && { col: c.col, id: c.id, name: c.name, feeds: c.feeds, tungs: c.tungs, alive: c.alive, food: c.food, poop: c.poop, cleanups: c.cleanups }; });
const a0 = await active();
log('active:', JSON.stringify(a0), '| costs:', await page.$$eval('.action .cost', (es) => es.map((e) => e.textContent).join(',')));
check(a0?.col === 'sahur', 'the active pet is a Sahur');
check(await page.evaluate(() => document.querySelector('#cat')?.getAttribute('data-character')), 'the rig on his page is his: ' + (await page.evaluate(() => document.querySelector('#cat')?.getAttribute('data-character'))));
check(await page.$$eval('.action .cost', (es) => es.every((e) => e.textContent === 'free')), 'every action says free');
check(await page.$$eval('.action .action-label', (es) => es.some((e) => e.textContent === 'Tung tung tung')), 'the Tung tung tung button is there');
check(!(await page.$$eval('.action .action-label', (es) => es.some((e) => e.textContent === 'Slap'))), 'no frok stunts on him');
await shot('s03-page');
const clickAction = async (label) => {
  const [btn] = await page.$$(`xpath/.//button[contains(@class,"action")][.//span[contains(@class,"action-label") and text()="${label}"]]`);
  if (!btn) throw new Error(`no action ${label}`);
  await btn.click();
};
const waitIdle = async () => { await waitFor(() => { const p = window.__pet; return p && !p.director.isBusy && !(window.__chain && window.__chain.get().pending); }, 180000); };
log('feed…'); await clickAction('Feed'); await sleep(2000); await waitIdle();
await waitFor((b) => (window.__chain?.active()?.feeds ?? 0) !== b, 40000, a0.feeds).catch(() => {});
let a = await active(); log('after feed:', JSON.stringify(a)); check(a.feeds === a0.feeds + 1, 'feeds went up by one on chain');
log('tung…'); await clickAction('Tung tung tung'); await sleep(2000); await waitIdle();
await waitFor((b) => (window.__chain?.active()?.tungs ?? 0) !== b, 40000, a0.tungs).catch(() => {});
a = await active(); log('after tung:', JSON.stringify(a)); check(a.tungs === a0.tungs + 1, 'tungs went up by one on chain');
check(await page.$$eval('.record-stat small', (es) => es.some((e) => e.textContent === 'tung tung tungs')), 'the record row shows his tungs');
await shot('s04-after');
// name him: the name button opens an inline field
const named = await page.evaluate(() => { const b = document.querySelector('.name-btn'); if (!b || b.disabled) return false; b.click(); return true; });
if (named) {
  await page.waitForSelector('.name-input', { timeout: 5000 });
  await page.type('.name-input', 'Sahur Prime');
  await page.click('.name-ok'); await sleep(2000); await waitIdle();
  await waitFor(() => (window.__chain?.active()?.name ?? '') !== '', 60000).catch(() => {});
  a = await active(); log('after name:', JSON.stringify(a)); check(a.name === 'Sahur Prime', 'named for 10 MON on chain');
} else log('  (no name button found; skipping the name)');
await shot('s05-named');

// ---- 3. the poop: warp the fork 5 hours, tap the poop itself, expect the on-chain clean
await rpcCall('evm_increaseTime', [5 * 3600]); await rpcCall('evm_mine', []);
await page.reload({ waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000);
await waitFor(() => !!document.querySelector('.prop-poop-live'), 60000).catch(() => {});
a = await active(); log('after 5h:', JSON.stringify(a));
check(a.poop === true, 'the contract says there is a poop');
check(await page.$('.prop-poop-live'), 'the poop is in the room');
await shot('s06-poop');
const before = sent.length; const cleanups0 = a.cleanups;
await waitIdle();   // the poop's own drop animation makes the director busy, and a busy director drops taps like it disables buttons
const box = await page.$('.prop-poop-live');
if (box) { const b = await box.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
await sleep(2500); await waitIdle();
await waitFor((c) => (window.__chain?.active()?.cleanups ?? 0) !== c, 40000, cleanups0).catch(() => {});
a = await active(); log('after tapping the poop:', JSON.stringify(a));
check(sent.length === before + 1, `a tap on the poop sent exactly one transaction (${sent.length - before})`);
check(a.cleanups === cleanups0 + 1 && a.poop === false, 'the on-chain clean landed and the poop is gone');
await shot('s07-cleaned');

// ---- 4. the shop: the Backrooms (item 7) and the emo hair (item 3), claim and put on
await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.item-card', { timeout: 60000 });
await clickText('.item-card .btn', 'Connect to claim').catch(() => {});
await page.waitForSelector('.wallet-opt', { timeout: 10000 }).then(() => page.click('.wallet-opt')).catch(() => {});
const card = (title) => page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); return c ? c.innerText.replace(/\n+/g, ' | ').slice(0, 400) : null; }, title);
for (const title of ['Backrooms theme', 'Emo hair']) {
  await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && (c.textContent.includes('Claim ·') || c.textContent.includes('You have'))), 90000, title).catch(() => {});
  log(title, ':', await card(title));
  const clicked = await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); const b = c && [...c.querySelectorAll('button')].find((x) => x.textContent.startsWith('Claim ·')); if (!b || b.disabled) return false; b.click(); return true; }, title);
  if (clicked) {
    await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && c.textContent.includes('You have')), 180000, title).catch(() => {});
    log(title, 'after claim:', await card(title));
  }
  check((await card(title))?.includes('You have'), `${title}: claimed and held`);
  // put it on him
  const picked = await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); const box = c?.querySelector('.item-cat input[type=checkbox]'); if (!box) return false; box.click(); return true; }, title);
  if (picked) {
    await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); [...c.querySelectorAll('button')].find((x) => /^(Dress|Give)/.test(x.textContent))?.click(); }, title);
    await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && /wearing|\bon\b/.test(c.querySelector('.item-cat-wearing')?.textContent ?? '')), 180000, title).catch(() => {});
    log(title, 'after wear:', await card(title));
  }
  check(await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); return !!c?.querySelector('.item-cat-wearing'); }, title), `${title}: on him`);
}
await shot('s08-shop');

// ---- 5. his page again: the Backrooms room and the hair drawn
await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000);
await sleep(2500);
const scene = await page.evaluate(() => document.querySelector('.stage')?.getAttribute('data-scene'));
const hairShown = await page.evaluate(() => { const h = document.querySelector('#cat #emohair'); return h ? getComputedStyle(h).display !== 'none' : null; });
log('scene:', scene, '| hair drawn:', hairShown);
check(scene === 'backrooms', 'the Backrooms is his room');
check(hairShown === true, 'the emo hair is drawn on him');
await shot('s09-dressed');

// ---- 6. the gallery, the leaderboard, the stats live tiles
await page.goto(`${BASE}/pets?pet=sahur`, { waitUntil: 'networkidle0' });
await waitFor(() => document.querySelectorAll('.gal-card, .gallery a[href^="/tung/pet/"]').length > 0 || document.querySelector('.lb-note'), 60000).catch(() => {});
await sleep(1500);
const galLinks = await page.$$eval('a[href^="/tung/pet/"]', (as) => as.length);
check(galLinks > 0, `the gallery lists Sahurs with /tung/pet links (${galLinks})`);
check(await page.$$eval('.pet-switch button', (bs) => bs.some((b) => b.textContent === 'Tung Tung Tung Sahur' && b.getAttribute('aria-selected') === 'true')), 'the gallery switch has his tab, selected');
await shot('s10-gallery');
await page.goto(`${BASE}/leaderboard`, { waitUntil: 'networkidle0' });
await sleep(800);
check(await page.$$eval('.lb-tabs button', (bs) => bs.some((b) => b.textContent === 'Tung Tung Tung Sahur')), 'the leaderboard has his tab');
await page.goto(`${BASE}/?view=landing`, { waitUntil: 'networkidle0' });   // connected, / is the pet view; ?view= forces the landing
await sleep(800);
check(await page.$$eval('.hero-switch button', (bs) => bs.some((b) => b.textContent === 'Sahuragotchi')), 'the landing hero switches to him');
check(await page.$('.pet-card[data-pet="sahur"]'), 'the landing has his card');
// the three pet tabs became one, "Get a pet", on 2026-09-28 (its page has a card for each pet)
check(await page.$$eval('.hdr-nav a, .nav-pop a', (as) => as.map((a) => a.textContent).join('|')).then((t) => t.includes('Get a pet')), 'the nav has Get a pet');
await shot('s11-landing');
log('errors:', errors.length ? errors : 'none');
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' / ')}` : 'ALL CHECKS PASSED');
await browser.close();
process.exit(fails.length ? 1 : 0);
