// The pet page with many pets in one wallet, on an ANVIL FORK of mainnet, through the site's own buttons: switching pets
// never carries an animation over (a feed sent for one pet used to play on whichever pet was on screen when it landed),
// a pet's room opens as the pet is (asleep, dead, its poop down: no nodding off, dying or pooping again on arrival), a
// clean does not bring the poop back, a sleep does not flicker awake, a revive does not die again, the buttons never go
// dead while the pet wanders, the rename field closes on a switch, the meters do not "bump" on a switch, the Items menu
// lists everything the wallet holds by kind, the tab row pages with a mouse, and the header's "My pets" button is there.
// Spends fork MON only. WHO is the wallet to play as: the fork impersonates it (anvil --auto-impersonate), so no key is
// involved; a public address that holds pets (default: the operator's everyday wallet). EXTRA cats from other owners are
// moved into it on the fork (they are the long tab row).
//   fork: anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8571 --host 127.0.0.1 --auto-impersonate --code-size-limit 131072
//   site: cd apps/web && VITE_RPC_URL=http://127.0.0.1:8571 npx vite --config ../../tools/thiccums-dev.mjs --port 5271 --strictPort
//   BASE=http://127.0.0.1:5271 RPC=http://127.0.0.1:8571 OUT=<dir> node tools/fork-mypets.mjs
// SOUND=1 runs it all with the sound engine on (it is off under a test driver otherwise: sound/cue.ts audible()).
import puppeteer from 'puppeteer-core';
import { createPublicClient, http, defineChain, encodeFunctionData, parseAbi } from 'viem';

const OUT = process.env.OUT ?? '.';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5271';
const RPC = process.env.RPC ?? 'http://127.0.0.1:8571';
const WHO = (process.env.WHO ?? '0xE974C0ed0Eace26D85943309e6Ed05bF3f536904').toLowerCase();
const EXTRA = Number(process.env.EXTRA ?? 25);
const Q = process.env.SOUND ? '?sound=1' : '';
const GAME = { cat: '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5', frok: '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', sahur: '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7' };
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pc = createPublicClient({ chain, transport: http(RPC) });
const abi = parseAbi(['function ownerOf(uint256) view returns (address)', 'function transferFrom(address,address,uint256)', 'function feed(uint256)', 'function sleep(uint256)', 'function revive(uint256) payable',
  'function wake(uint256)', 'function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)']);
const idsOf = async (col) => {
  const n = Number(await pc.readContract({ address: GAME[col], abi, functionName: 'balanceOf', args: [WHO] }));
  return Promise.all([...Array(n).keys()].map(async (i) => Number(await pc.readContract({ address: GAME[col], abi, functionName: 'tokenOfOwnerByIndex', args: [WHO, BigInt(i)] }))));
};
const call = (col, fn, id) => send(WHO, GAME[col], encodeFunctionData({ abi, functionName: fn, args: [BigInt(id)] }));
const rpcCall = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const send = async (from, to, data) => { const hash = await rpcCall('eth_sendTransaction', [{ from, to, data, gas: '0x7a120' }]); const r = await pc.waitForTransactionReceipt({ hash }); return r.status === 'success'; };
const warp = async (s) => { await rpcCall('evm_increaseTime', [s]); await rpcCall('evm_mine', []); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) fails.push(what); };

// ---- the wallet: fork money, more cats, and pets in every state ----
await rpcCall('anvil_setBalance', [WHO, '0x3635C9ADC5DEA00000']);
let moved = 0;
for (let id = 1200; moved < EXTRA && id < 1400; id++) {
  try {
    const owner = (await pc.readContract({ address: GAME.cat, abi, functionName: 'ownerOf', args: [BigInt(id)] })).toLowerCase();
    if (owner === WHO) continue;
    await rpcCall('anvil_setBalance', [owner, '0xDE0B6B3A7640000']);
    if (await send(owner, GAME.cat, encodeFunctionData({ abi, functionName: 'transferFrom', args: [owner, WHO, BigInt(id)] }))) moved++;
  } catch { /* a contract owner that cannot be impersonated: next */ }
}
log('moved', moved, 'cats into', WHO);
const froks = await idsOf('frok');
const sahurs = await idsOf('sahur');
log('froks', froks, 'sahurs', sahurs);
if (froks.length < 3 || sahurs.length < 2) { console.error('WHO needs 3 froks and 2 Sahurs'); process.exit(1); }
const [F1, F2, F3] = froks; const [S1, S2] = sahurs;
// all of them alive (a revive is free for these two; a live one refuses it), a night's sleep so every one wakes at full
// energy, breakfast, then 4h10m on: each has a poop and has lost some energy; F2 goes to bed
const pets = [...froks.map((i) => ['frok', i]), ...sahurs.map((i) => ['sahur', i])];
for (const [col, id] of pets) { if (await call(col, 'revive', id)) log('  revived', col, id, 'on the fork'); await call(col, 'feed', id); await call(col, 'sleep', id); }
await warp(8 * 3600 + 600);
for (const [col, id] of pets) { await call(col, 'wake', id); await call(col, 'feed', id); }
await warp(4 * 3600 + 600);
check(await call('frok', 'sleep', F2), `frok #${F2} put to bed on the fork`);

// ---- the browser, with WHO as its injected wallet ----
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|\/api\//.test(m.text())) errors.push(m.text().slice(0, 240)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
let walletDelay = 0;
const sent = [];
await page.exposeFunction('__sendTx', async (tx) => {
  if (walletDelay) await sleep(walletDelay);   // the wallet's confirm, and Monad: time to switch pets meanwhile
  const hash = await rpcCall('eth_sendTransaction', [{ from: WHO, to: tx.to, data: tx.data, value: tx.value ?? '0x0', gas: tx.gas }]);
  sent.push({ hash, to: tx.to.toLowerCase(), sel: tx.data.slice(0, 10), data: tx.data });
  log('  tx', hash.slice(0, 12), 'to', tx.to.slice(0, 10), 'sel', tx.data.slice(0, 10));
  return hash;
});
await page.evaluateOnNewDocument((addr, rpcUrl) => {
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data }); return j.result;
  };
  window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
    if (method === 'eth_chainId') return '0x8f';
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_revokePermissions') return null;
    if (method === 'eth_sendTransaction') { const tx = params[0]; return window.__sendTx({ to: tx.to, value: tx.value, data: tx.data, gas: tx.gas }); }
    return rpc(method, params);
  } };
  // what every room does, per pet: [t, pet, busy, sleeping, poop, dead]
  window.__rec = [];
  setInterval(() => {
    const p = window.__pet; if (!p?.director || !p.chain) return;
    const s = p.director.getState(); const c = p.chain.get();
    const key = `${c.activeCol}:${c.activeId}`;
    const row = [key, s.busy, s.sleeping, s.poop, s.dead].join('|');
    const last = window.__rec[window.__rec.length - 1];
    if (!last || last[1] !== row) window.__rec.push([performance.now(), row]);
  }, 30);
}, WHO, RPC);
// the site remembers the connection (localStorage), and /r1 etc. never load here
await page.goto(`${BASE}/${Q}`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.setItem('emogotchi.wallet', 'injected'); } catch { /* */ } });
const modeKey = await page.evaluate(() => Object.keys(localStorage));
log('localStorage keys', modeKey.join(','));

const connect = async () => {
  await page.goto(`${BASE}/${Q}`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  if (!(await page.$('.cat-tab'))) {
    const btn = await page.$('.hdr .btn-pink'); if (btn) await btn.click();
    await sleep(800);
    const inj = await page.$$eval('.modal button, [role="dialog"] button', (bs) => bs.map((b) => b.textContent)).catch(() => []);
    const i = inj.findIndex((t) => /browser wallet|metamask/i.test(t ?? ''));
    if (i >= 0) { const bs = await page.$$('.modal button, [role="dialog"] button'); await bs[i].click(); }
  }
  await page.waitForSelector('.cat-tab', { timeout: 30000 });
  await page.waitForFunction(() => window.__pet?.director && window.__pet.chain?.get().loaded, { timeout: 30000 });
};
await connect();
const tabSel = (col, id) => `.cat-tab${col === 'cat' ? ':not(.is-frok)' : `.is-${col}`}`;
const tab = async (col, id) => {
  const hs = await page.$$(tabSel(col, id));
  for (const h of hs) { const t = await h.evaluate((e) => e.textContent ?? ''); if (new RegExp(`#${id}(?!\\d)`).test(t)) return h; }
  return null;
};
const show = async (col, id) => {
  const h = await tab(col, id); if (!h) throw new Error(`no tab ${col} #${id}`);
  await h.evaluate((e) => e.scrollIntoView({ inline: 'center', block: 'nearest' }));
  // the row scrolls smoothly (the page brings the pet on screen into view too): press only once the tab has stopped
  // moving, or the press lands where the tab was (seen on a busy machine: the switch never came)
  await h.evaluate((e) => new Promise((done) => { let last = e.getBoundingClientRect().left, still = 0, n = 0;
    const tick = () => { const x = e.getBoundingClientRect().left; still = Math.abs(x - last) < 0.5 ? still + 1 : 0; last = x; if (still >= 4 || ++n > 120) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
  // and only once nothing lies over it: the row's paging arrows sit over its ends until the row has finished scrolling
  // there, and a press on a tab under one pages the row instead of switching (seen: the switch never came)
  let over = null;
  for (let i = 0; i < 25; i++) {
    over = await h.evaluate((e) => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return top && (e === top || e.contains(top)) ? null : (top ? `${top.tagName}.${top.className}` : 'nothing'); });
    if (!over) break;
    await sleep(120);
  }
  if (over) log(`  (tab ${col} #${id} is still under ${over}: pressing it anyway)`);
  await h.click();
  await page.waitForFunction((k) => { const c = window.__pet?.chain?.get(); return c && `${c.activeCol}:${c.activeId}` === k && window.__pet.director; }, { timeout: 8000 }, `${col}:${id}`);
  await sleep(120);
};
const recSince = async (t0) => page.evaluate((t) => window.__rec.filter((r) => r[0] >= t).map((r) => r[1]), t0);
const now = () => page.evaluate(() => performance.now());
const st = () => page.evaluate(() => { const s = window.__pet.director.getState(); const c = window.__pet.chain.get(); return { ...s, key: `${c.activeCol}:${c.activeId}`, pending: c.pending }; });
const button = async (label) => { for (const h of await page.$$('.action')) { const t = await h.evaluate((e) => e.querySelector('.action-label')?.textContent ?? ''); if (t === label) return h; } return null; };
const enabled = async (label) => { const b = await button(label); return b ? b.evaluate((e) => !e.disabled) : false; };
// the store's pet, as plain numbers (its BigInt fields do not survive the trip out of the page)
const view = async (col, id) => page.evaluate((c, i) => { const x = window.__pet.chain.get().cats.find((v) => v.col === c && v.id === i); return x ? { feeds: x.feeds, cleanups: x.cleanups, poop: x.poop, alive: x.alive, asleep: x.asleep, revives: x.revives } : null; }, col, id);
const refreshed = () => page.evaluate(() => window.__pet.chain.refresh());
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// A0. the All tab spans every kind of pet the wallet holds (operator, 2026-10-01: it "only feeds cats"): one "Feed all" is one
// care() on EVERY game the wallet has a living pet on, the cats' paid and the others free, and every one of them eats
// a cat of the wallet's brought back on the fork (1,000 fork MON), so the batch has a PAID collection in it as well
{
  await rpcCall('anvil_setBalance', [WHO, '0x10F0CF064DD59200000']);   // 5,000 fork MON: the revive is 1,000 plus gas
  const catIds = await idsOf('cat');
  let revivedCat = null;
  for (const id of catIds.slice(0, 40)) {
    const hash = await rpcCall('eth_sendTransaction', [{ from: WHO, to: GAME.cat, data: encodeFunctionData({ abi, functionName: 'revive', args: [BigInt(id)] }), value: '0x3635C9ADC5DEA00000', gas: '0x7a120' }]).catch(() => null);
    if (hash && (await pc.waitForTransactionReceipt({ hash })).status === 'success') { revivedCat = id; break; }
  }
  log('  revived cat', revivedCat, 'on the fork for the paid half of the batch');
}
await page.goto(`${BASE}/${Q}`, { waitUntil: 'networkidle2' }); await page.waitForSelector('.cat-tab', { timeout: 30000 });
await page.waitForFunction(() => window.__pet?.chain?.get().loaded && window.__pet.director, { timeout: 30000 });
await refreshed(); await sleep(500);
await show('frok', F1);
walletDelay = 0;
const feedsBefore = await page.evaluate(() => Object.fromEntries(window.__pet.chain.get().cats.filter((c) => c.alive).map((c) => [`${c.col}:${c.id}`, c.feeds])));
const kinds = [...new Set(Object.keys(feedsBefore).map((k) => k.split(':')[0]))];
const nCats = Object.keys(feedsBefore).filter((k) => k.startsWith('cat:')).length;
log('  living pets by kind:', kinds.map((k) => `${k} ${Object.keys(feedsBefore).filter((x) => x.startsWith(k + ':')).length}`).join(', '));
await page.click('.cat-tab-all'); await sleep(500);
const allLine = await page.$eval('.pending-line', (p) => p.textContent).catch(() => '');
log('  the All line:', JSON.stringify(allLine));
check(new RegExp(`all ${Object.keys(feedsBefore).length} pets \\(`).test(allLine) && kinds.every((k) => new RegExp(k === 'cat' ? 'cats?' : k === 'frok' ? 'inversebrah' : k === 'sahur' ? 'Sahur' : 'Thiccums').test(allLine)), `the All line counts every living pet and names every kind (${kinds.length})`);
check(await page.$eval('.cat-tabs', (e) => e.getAttribute('aria-label') === 'Your pets').catch(() => false), 'the tab row is labelled "Your pets" when the kinds are mixed');
{
  const n = await page.evaluate(() => { const e = document.querySelector('.nf-nudge'); if (!e) return null; const r = e.getBoundingClientRect(); const over = [...document.querySelectorAll('button')].filter((b) => b !== e && !e.contains(b)).map((b) => b.getBoundingClientRect()).filter((b) => b.width && b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom); return { pos: getComputedStyle(e).position, over: over.length }; });
  check(n && n.pos !== 'fixed' && n.over === 0, `the notifications nudge sits in the page's flow and covers no button (${JSON.stringify(n)})`);
}
const feedAll = await button('Feed all');
check(!!feedAll, 'a "Feed all" button');
const costLabel = await feedAll.evaluate((e) => e.querySelector('.cost')?.textContent ?? '');
check(costLabel === `${nCats} MON`, `Feed all costs the cats only: "${costLabel}" for ${nCats} cats (the other kinds free)`);
await shot('g-all-tab');
const sentBefore = sent.length;
await feedAll.click();
await page.waitForFunction((before) => { const cats = window.__pet.chain.get().cats.filter((c) => c.alive); return !window.__pet.chain.get().pending && cats.every((c) => c.feeds === before[`${c.col}:${c.id}`] + 1); }, { timeout: 180000 }, feedsBefore).catch(() => {});
await refreshed();
const feedsAfter = await page.evaluate(() => Object.fromEntries(window.__pet.chain.get().cats.filter((c) => c.alive).map((c) => [`${c.col}:${c.id}`, c.feeds])));
const unfed = Object.keys(feedsBefore).filter((k) => feedsAfter[k] !== feedsBefore[k] + 1);
check(unfed.length === 0, `every living pet of every kind was fed once on chain (${Object.keys(feedsBefore).length} pets)${unfed.length ? `: not ${unfed.join(', ')}` : ''}`);
const games = new Set(sent.slice(sentBefore).map((t) => t.to));
check(games.size === kinds.length, `one batch transaction per game: ${games.size} games for ${kinds.length} kinds`);
await shot('g-all-fed');
// the batch fed (and so woke) every pet: F2 goes back to bed, which section D expects
await call('frok', 'sleep', F2); await refreshed(); await sleep(300);

// A. the tab row
const nTabs = await page.$$eval('.cat-tab', (t) => t.length);
check(nTabs >= 8 + moved, `${nTabs} tabs for the wallet's pets`);
check(await page.$eval('.cat-tabs-wrap', (w) => w.dataset.right === 'on'), 'the tab row overflows and says so (right arrow)');
check(await page.$eval('.cat-tabs-arrow.is-right', (b) => getComputedStyle(b).display !== 'none'), 'the right arrow shows with a mouse');
await page.click('.cat-tabs-arrow.is-right'); await sleep(700);
check(await page.$eval('.cat-tabs', (r) => r.scrollLeft > 50), 'the arrow pages the row');
check(await page.$eval('.cat-tabs-wrap', (w) => w.dataset.left === 'on'), 'then there is a left arrow too');
await shot('a-tabs');

// B. a pet with a poop: its room opens with the poop down, no pooping
let t0 = await now();
await show('sahur', S1);
await sleep(2500);
let rec = await recSince(t0);
let s = await st();
check(s.poop && !rec.some((r) => r.startsWith(`sahur:${S1}|poop`)), `Sahur #${S1}: his poop is there on arrival, and he does not poop again`);
check(await page.$('.prop-poop-live') !== null, 'the poop is on the floor');
await shot('b-poop-arrive');

// C. a tap on the poop is the clean; the poop does not come back
const before = await view('sahur', S1);
t0 = await now();
await page.click('.prop-poop-live');
await page.waitForFunction(() => window.__pet.director.getState().busy === 'clean', { timeout: 15000 }).catch(() => {});
await page.waitForFunction(() => !window.__pet.director.getState().busy && !window.__pet.chain.get().pending, { timeout: 20000 });
await sleep(9000);   // the read after it, and a poll or two
rec = await recSince(t0);
const after = await view('sahur', S1);
check(after.cleanups === before.cleanups + 1 && !after.poop, `the clean landed on chain (cleanups ${before.cleanups} -> ${after.cleanups})`);
check(!rec.some((r) => r.split('|')[1] === 'poop'), 'the poop does not come back after the clean');
check(!(await st()).poop && (await page.$('.prop-poop-live')) === null, 'no poop in the room');

// D. a sleeping pet opens asleep
t0 = await now();
await show('frok', F2);
await sleep(1500);
rec = await recSince(t0); s = await st();
check(s.sleeping && !rec.some((r) => r.startsWith(`frok:${F2}|sleep`)), `frok #${F2} is asleep on arrival, no nodding off`);
check(await page.$eval('.stage', (e) => e.dataset.night === 'on'), 'the room is at night for him');
await shot('d-asleep');

// E. feed one pet, switch to another before it lands: the other does not eat
await show('frok', F1);
walletDelay = 3000;
t0 = await now();
const feeds0 = (await view('frok', F1)).feeds;
await (await button('Feed')).click();
await sleep(700);
await show('frok', F3);
const line = await page.$eval('.pending-line', (p) => p.textContent).catch(() => '');
log('  pending line on the other pet:', JSON.stringify(line));
check(new RegExp(`#${F1}\\b`).test(line) && /Feed/.test(line), `while #${F1}'s feed is out, #${F3}'s page says it is for #${F1}`);
await page.waitForFunction(() => !window.__pet.chain.get().pending, { timeout: 30000 });
await sleep(4000);
rec = await recSince(t0);
check(!rec.some((r) => r.startsWith(`frok:${F3}|feed`)), `fed #${F1}, switched to #${F3} before it landed: #${F3} does not eat`);
check(await enabled('Feed'), `#${F3}'s buttons are free once the transaction is done`);
await refreshed();
check((await view('frok', F1)).feeds === feeds0 + 1, `#${F1} was fed on chain`);

// F. feed a pet, switch away mid-meal: the next pet is free at once
await show('frok', F1);
walletDelay = 800;
await (await button('Feed')).click();
await page.waitForFunction(() => window.__pet.director.getState().busy === 'feed', { timeout: 20000 });
await sleep(600);
t0 = await now();
await show('frok', F3);
s = await st();
check(s.busy === null || s.busy === 'wander', `switched mid-meal: #${F3} is not eating (busy ${s.busy})`);
check(await enabled('Play'), `#${F3}'s buttons work at once`);
await page.waitForFunction(() => !window.__pet.chain.get().pending, { timeout: 20000 });
await sleep(3000);
rec = await recSince(t0);
check(!rec.some((r) => r.startsWith(`frok:${F3}|feed`)), `#${F3} never plays #${F1}'s meal`);
await shot('f-switch-mid-meal');

// G. bedtime does not flicker awake
await show('frok', F3);
walletDelay = 600;
t0 = await now();
await (await button('Sleep')).click();
await page.waitForFunction(() => window.__pet.director.getState().sleeping, { timeout: 20000 });
await sleep(9000);
rec = await recSince(t0);
check((await st()).sleeping && !rec.some((r) => r.split('|')[1] === 'wake'), `#${F3} goes to bed and stays asleep (no wake flicker)`);

// H. the pet's wandering never disables the buttons
await show('sahur', S2);
walletDelay = 0;
const wandered = await page.waitForFunction(() => window.__pet.director.getState().busy === 'wander', { timeout: 40000 }).then(() => true, () => false);
check(wandered && await enabled('Feed'), `while he wanders, Feed is not disabled${wandered ? '' : ' (he did not set off within 40 s)'}`);

// H2. taps are sent for the pet that was tapped, even after a switch within the 1.5 s the taps are gathered for
await show('frok', F1);
walletDelay = 0;
const petsBefore = sent.length;
for (let i = 0; i < 2; i++) { await page.click('.catbody'); await sleep(120); }
await show('frok', F3);
await page.waitForFunction(() => !window.__pet.chain.get().pending, { timeout: 20000 });
await sleep(2500);
const petTx = sent.slice(petsBefore).filter((t) => t.to === GAME.frok.toLowerCase());
check(petTx.length === 1 && BigInt(`0x${petTx[0].data.slice(10, 74)}`) === BigInt(F1), `two taps on #${F1}, then a switch: one pet transaction, for #${F1} (${petTx.map((t) => BigInt(`0x${t.data.slice(10, 74)}`)).join(',')})`);
// (with SOUND=1) a switch of pets starts a tune only when the tune is another one: two pets that share a tune keep it
// going, and a room that says what it is in steps (asleep, its theme) does not start a tune per step
if (Q) {
  const state = () => page.evaluate(() => window.__soundState?.());
  await show('frok', F1); await page.mouse.click(4, 300); await sleep(1800);
  const a = await state();
  await show('frok', F3); await sleep(1800); const b = await state();
  await show('frok', F1); await sleep(1800); const c = await state();
  const due = (b.playing !== a.playing ? 1 : 0) + (c.playing !== b.playing ? 1 : 0);
  check(!!a?.running && !!a.playing && c.playing === a.playing && c.starts - a.starts === due, `sound: switching pets starts a tune only when it changes (${a?.playing} -> ${b?.playing} -> ${c?.playing}: ${c?.starts - a?.starts} starts, ${due} due)`);
}


// H3. a frok's slap: its big props come in their own chunk (loaded when his room opens); the hand must be drawn
await show('frok', F1);
walletDelay = 0;
await page.waitForFunction(() => !window.__pet.director.isActing, { timeout: 20000 });
t0 = await now();
await (await button('Slap')).click();
const slapped = await page.waitForFunction(() => { const h = document.querySelector('.prop-slaphand .prop-inner'); return !!h && h.innerHTML.length > 1000; }, { timeout: 30000 }).then(() => true, () => false);
check(slapped, `#${F1}'s slap draws the slapping hand (its prop chunk loaded)`);
await page.waitForFunction(() => !window.__pet.director.isActing && !window.__pet.chain.get().pending, { timeout: 30000 });

// I. the rename field closes on a switch
await page.click('.name-btn');
check(await page.$('.name-input') !== null, 'the rename field opens');
await show('frok', F3);   // another pet than the one it opened on (the slap step leaves #F1 on screen)
check(await page.$('.name-input') === null, 'switching pets closes it (it would have named the other pet)');

// J. no meter bump on a switch
await show('frok', F2);
await show('sahur', S2);
check(await page.$('.meter.is-bump') === null, 'no "just cared for" bump when switching to a fuller pet');

// K. the Items menu: everything held, by kind
const catId = (await page.evaluate(() => window.__pet.chain.get().cats.filter((c) => c.col === 'cat' && c.alive).map((c) => c.id)))[0]
  ?? (await page.evaluate(() => window.__pet.chain.get().cats.filter((c) => c.col === 'cat').map((c) => c.id)))[0];
await show('frok', F1);
await page.click('.items-btn'); await sleep(300);
const heads = await page.$$eval('.items-head', (h) => h.map((x) => x.textContent));
const rows = await page.$$eval('.items-row', (r) => r.map((x) => x.textContent));
log('  menu (frok):', heads.join(' / '), '·', rows.length, 'rows');
check(JSON.stringify(heads) === JSON.stringify(['Outfits', 'Headwear', 'Accessories', 'Rooms', 'Toys', 'Companions']), 'the menu is grouped by kind, in order');
check(rows.length === 15, `all 15 items the wallet holds are listed (${rows.length})`);
await shot('k-items-frok');
await page.keyboard.press('Escape');

// L. a dead pet opens dead
const deadCat = await page.evaluate(() => window.__pet.chain.get().cats.find((c) => c.col === 'cat' && !c.alive)?.id ?? null);
if (deadCat !== null) {
  t0 = await now();
  await show('cat', deadCat);
  await sleep(2500);
  rec = await recSince(t0); s = await st();
  check(s.dead && !rec.some((r) => r.startsWith(`cat:${deadCat}|die`)), `dead cat #${deadCat} is a ghost on arrival, no dying again`);
  check(await page.$('.prop-grave') !== null, 'its grave is there');
  await shot('l-dead');
}
if (catId !== undefined && catId !== deadCat) {
  await show('cat', catId);
  await page.click('.items-btn'); await sleep(300);
  const hair = await page.$$eval('.items-row', (r) => r.filter((x) => /Emo hair/.test(x.textContent ?? '')).map((x) => ({ dis: x.disabled, t: x.textContent })));
  check(hair.length === 1 && hair[0].dis && /not for cats/.test(hair[0].t), 'on a cat the emo hair is listed, greyed: not for cats');
  await shot('k-items-cat');
  await page.keyboard.press('Escape');
}

// M. a revive does not die again
await warp(50 * 3600);
await connect();
await show('frok', F1);
await page.waitForFunction(() => window.__pet.director.getState().dead, { timeout: 10000 }).catch(() => {});
check((await st()).dead, `after 50 hours #${F1} is dead`);
t0 = await now();
walletDelay = 500;
await page.click('.revive-btn');
await page.waitForFunction(() => window.__pet.director.getState().busy === 'revive', { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => !window.__pet.director.getState().busy && !window.__pet.chain.get().pending, { timeout: 30000 });
await sleep(7000);
rec = await recSince(t0);
check(!(await st()).dead && !rec.some((r) => r.split('|')[1] === 'die'), `#${F1} revives and stays alive (no second death)`);

// N. "My pets" from another page, and the phone
await page.goto(`${BASE}/pets${Q}`, { waitUntil: 'networkidle2' });
await sleep(800);
const mine = await page.$eval('.mypets-btn', (a) => ({ href: a.getAttribute('href'), shown: getComputedStyle(a).display !== 'none' })).catch(() => null);
check(!!mine && mine.shown && mine.href === '/', 'the gallery has a "My pets" button (the wallet is remembered)');
await shot('n-mypets-gallery');
await page.click('.mypets-btn');
await page.waitForSelector('.cat-tab', { timeout: 30000 });
check(new URL(page.url()).pathname === '/', '"My pets" opens the wallet\'s pets');
const headerFits = async (where) => { for (const w of [1024, 1280, 1459, 1460, 1500, 1659, 1660, 1700, 1920]) {
  await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
  await sleep(300);
  const m = await page.evaluate(() => {
    const hdr = document.querySelector('.hdr'); const kids = [...(hdr?.querySelectorAll('.brand, .hdr-nav, .hdr-right > *') ?? [])].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect());
    let overlap = false; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if (a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap = true; }
    const hb = hdr.getBoundingClientRect();
    const pieces = [...(hdr?.querySelectorAll('.brand, .hdr-nav, .hdr-right > *') ?? [])].filter((e) => getComputedStyle(e).display !== 'none').map((e) => `${(e.className.toString().split(' ')[0] || e.tagName).slice(0, 12)} ${Math.round(e.getBoundingClientRect().width)}`).join(', ');
    return { side: document.documentElement.scrollWidth - innerWidth, overlap, hdrW: Math.round(hb.width), right: Math.round(Math.max(...kids.map((k) => k.right))), hdrR: Math.round(hb.right), pieces };
  });
  check(m.side <= 0 && !m.overlap && m.right <= m.hdrR + 1, `${where} header at ${w}px: fits (${m.right} of ${m.hdrR}, sideways ${m.side})`);
  if (m.right > m.hdrR + 1) log('     pieces:', m.pieces);
} };
await headerFits('home');
await page.goto(`${BASE}/pets${Q}`, { waitUntil: 'networkidle2' }); await sleep(800);
await headerFits('gallery');
await page.goto(`${BASE}/${Q}`, { waitUntil: 'networkidle2' }); await page.waitForSelector('.cat-tab', { timeout: 30000 });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 }); await sleep(300); await shot('n-header-1280');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.cat-tab', { timeout: 30000 });
await sleep(800);
check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone 390: no sideways scroll');
await page.click('.nav-toggle'); await sleep(300);
check(await page.$eval('.nav-pop a', (a) => a.textContent === 'My pets'), 'phone: "My pets" leads the menu');
await shot('n-phone-menu');
await page.click('.nav-toggle'); await sleep(200);
await show('frok', F1);
if (await page.$('.nf-nudge')) { await page.$eval('.nf-nudge', (e) => e.scrollIntoView({ block: 'center' })); await sleep(400); await shot('n-phone-nudge'); check(await page.evaluate(() => { const r = document.querySelector('.nf-nudge').getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8; }), 'phone 390: the nudge card sits inside the screen, in the flow'); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300); }
await page.click('.items-btn'); await sleep(300);
check(await page.evaluate(() => { const p = document.querySelector('.items-pop')?.getBoundingClientRect(); return !!p && p.left >= 0 && p.right <= innerWidth; }), 'phone: the Items menu fits the screen');
await shot('n-phone-items');

check(errors.length === 0, `no page errors (${errors.length})`);
for (const e of errors.slice(0, 8)) log('   ', e);
log(fails.length ? `${fails.length} FAILED` : 'all passed', `· ${sent.length} transactions`);
await browser.close();
process.exit(fails.length ? 1 : 0);
