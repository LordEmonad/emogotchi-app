// One room at a time, on an ANVIL FORK of mainnet through the real pages (operator, 2026-09-25: the Backrooms went on over
// the Spooky theme and both stayed on). A fresh wallet mints a Sahur on /tung, claims the Spooky theme (2) and the
// Backrooms (7) in the shop, gives him the Spooky room, then the Backrooms: the Spooky must come off. Then on his page:
// press Spooky -> only Spooky on; press "Spooky theme on" -> plain room. Fork MON only.
//   fork: anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8546 --code-size-limit 131072
//   site: VITE_RPC_URL=http://127.0.0.1:8546 npx vite --port 5201 --strictPort
//   BASE=http://localhost:5201 OUT=<dir> KEY=<cast wallet new key> node tools/fork-rooms.mjs
import puppeteer from 'puppeteer-core';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const OUT = process.env.OUT ?? '.'; const BASE = process.env.BASE ?? 'http://localhost:5201'; const RPC = process.env.RPC ?? 'http://127.0.0.1:8546';
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(process.env.KEY ?? generatePrivateKey());   // a throwaway: never anvil's defaults (7702 code on mainnet)
const wc = createWalletClient({ account, chain, transport: http(RPC) }); const pc = createPublicClient({ chain, transport: http(RPC) });
const rpcCall = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
await rpcCall('anvil_setBalance', [account.address, '0x3635C9ADC5DEA00000']);
log('wallet', account.address);
const fails = []; const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) fails.push(what); };
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 1000 });
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); }); page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let nonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' }); const sent = [];
await page.exposeFunction('__signAndSend', async (tx) => { const hash = await wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined, nonce: nonce++ }); sent.push(tx.data.slice(0, 10)); log('  tx', hash.slice(0, 12), 'sel', tx.data.slice(0, 10)); return hash; });
await page.evaluateOnNewDocument((addr, rpcUrl) => {
  const rpc = async (method, params) => { const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code }); return j.result; };
  window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
    if (method === 'eth_chainId') return '0x8f';
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
    if (method === 'eth_sendTransaction') { const tx = params[0]; return window.__signAndSend({ to: tx.to, value: tx.value, data: tx.data, gas: tx.gas }); }
    return rpc(method, params ?? []); } };
}, account.address, RPC);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (fn, ms = 120000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };
const text = async (sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);

// 1. mint a Sahur
await page.goto(`${BASE}/tung`, { waitUntil: 'networkidle0' });
await page.$$eval('.mint-btn', (bs) => bs.find((b) => b.textContent.includes('Connect and mint'))?.click());
await page.waitForSelector('.wallet-opt', { timeout: 10000 }); await page.click('.wallet-opt');
await waitFor(() => document.querySelector('.mint-btn')?.textContent.includes('Mint Sahur'), 60000);
await page.click('.mint-btn');
await waitFor(() => document.querySelector('.mint-btn')?.textContent.includes("He's yours") || document.querySelector('.mint-error'), 180000);
const href = await page.$eval('.mint-btn', (e) => e.getAttribute('href'));
log('minted:', href); check(/^\/tung\/pet\/\d+$/.test(href ?? ''), 'minted a Sahur');

// 2. the shop: claim both rooms, give him the Spooky room, then the Backrooms
await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.item-card', { timeout: 60000 });
await page.$$eval('.item-card .btn', (bs) => bs.find((b) => b.textContent.includes('Connect to claim'))?.click()).catch(() => {});
await page.waitForSelector('.wallet-opt', { timeout: 10000 }).then(() => page.click('.wallet-opt')).catch(() => {});
const card = (t) => page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); return c ? c.innerText.replace(/\n+/g, ' | ') : null; }, t);
const claim = async (t) => {
  await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && c.querySelector('button')?.textContent.startsWith('Claim ·') && !c.querySelector('button').disabled), 90000, t);
  await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith('Claim ·'))?.click(); }, t);
  await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && c.textContent.includes('You have')), 180000, t);
  log('claimed', t);
};
const give = async (t) => {
  // tick the pet in the card, press "Give ... this room"
  await waitFor((t) => { const c = [...document.querySelectorAll('.item-card')].find((x) => x.querySelector('h2')?.textContent === t); return c && c.querySelector('.item-cat input[type=checkbox]'); }, 60000, t);
  await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); c.querySelector('.item-cat input[type=checkbox]').click(); }, t);
  await page.$$eval('.item-card', (cs, t) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); [...c.querySelectorAll('button')].find((b) => /^Give/.test(b.textContent))?.click(); }, t);
  await waitFor((t) => { const c = [...document.querySelectorAll('.item-card')].find((x) => x.querySelector('h2')?.textContent === t); return c && c.querySelector('.item-cat-wearing'); }, 180000, t);
  log('gave', t);
};
const shopWorn = () => page.$$eval('.item-card', (cs) => Object.fromEntries(cs.map((c) => [c.querySelector('h2')?.textContent, !!c.querySelector('.item-cat-wearing')])));
await claim('Spooky theme'); await claim('Backrooms theme');
await give('Spooky theme');
let w = await shopWorn(); log('after Spooky:', JSON.stringify(w)); check(w['Spooky theme'] && !w['Backrooms theme'], 'Spooky on, Backrooms off');
const before = sent.length;
await give('Backrooms theme'); await sleep(1500);
w = await shopWorn(); log('after Backrooms:', JSON.stringify(w), '| txs:', sent.slice(before).join(','));
check(w['Backrooms theme'] && !w['Spooky theme'], 'Backrooms on, Spooky taken off by the shop');
check(sent.slice(before).length === 2, `the swap was two transactions, unequip then equip (${sent.slice(before).length})`);
await shot('r1-shop');

// 3. his page: the buttons, and the swap the other way
await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000); await sleep(2000);
const worn = () => page.evaluate(() => { const s = window.__chain.get(); const c = window.__chain.active(); return s.worn[`${c.col}:${c.id}`] ?? []; });
// the pet page's items are one "Items" menu since 2026-09-28: its rows, read with the menu open
const btns = async () => { await page.click('.items-btn'); await sleep(250); const t = await page.$$eval('.items-row', (bs) => bs.map((b) => b.querySelector('.items-row-text')?.textContent.trim() ?? '')); await page.keyboard.press('Escape'); await sleep(150); return t; };
const scene = () => page.evaluate(() => document.querySelector('.stage')?.getAttribute('data-scene'));
log('page: worn', JSON.stringify(await worn()), '| buttons', JSON.stringify(await btns()), '| scene', await scene());
check((await btns()).includes('Use spooky theme') && (await btns()).includes('Backrooms theme on'), 'one button per room held, Backrooms shown on');
check(JSON.stringify(await worn()) === '[7]' && (await scene()) === 'backrooms', 'only the Backrooms on his list; the room is the Backrooms');
await shot('r2-page');
// (the menu's rows are enabled unless an action or a transaction is in flight; the pet's wandering no longer disables them)
const press = async (label) => {
  await page.click('.items-btn'); await sleep(250);
  await waitFor((l) => { const b = [...document.querySelectorAll('.items-row')].find((x) => x.querySelector('.items-row-text')?.textContent.trim() === l); return !!b && !b.disabled; }, 30000, label);
  const rows = await page.$$('.items-row');
  for (const r of rows) if ((await r.evaluate((b) => b.querySelector('.items-row-text')?.textContent.trim())) === label) { await r.click(); break; }
  await sleep(1500); await waitFor(() => !window.__chain.get().pending && !window.__pet?.director?.isActing, 180000); await sleep(2500);
};
await press('Use spooky theme');
log('after pressing Spooky: worn', JSON.stringify(await worn()), '| buttons', JSON.stringify(await btns()), '| scene', await scene());
check(JSON.stringify(await worn()) === '[2]' && (await scene()) === 'halloween', 'pressing Spooky took the Backrooms off and put the Spooky theme on');
await press('Spooky theme on');
log('after pressing Spooky again: worn', JSON.stringify(await worn()), '| scene', await scene());
check(JSON.stringify(await worn()) === '[]' && ((await scene()) === null || (await scene()) === 'plain'), 'pressing the room that is on gives the plain room');
await shot('r3-plain');
log('errors:', errors.length ? errors : 'none');
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' / ')}` : 'ALL CHECKS PASSED');
await browser.close(); process.exit(fails.length ? 1 : 0);
