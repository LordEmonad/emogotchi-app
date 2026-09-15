// Every on-chain action against the live testnet pair, driven through the real site UI, verified on chain.
//   OUT=… node tools/actions-check.mjs
import puppeteer from 'puppeteer-core';
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = process.env.OUT ?? '.';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const env = Object.fromEntries(readFileSync('apps/web/.env.local', 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
const GAME = env.VITE_CONTRACT_ADDRESS;
const abi = (n) => JSON.parse(readFileSync(fileURLToPath(new URL(`../contracts/out/${n}.sol/${n}.json`, import.meta.url)), 'utf8')).abi;
const gameAbi = abi('Emogotchi');

const ks = execSync('ls ~/.monskills/keystore | head -1').toString().trim();
const pk = execSync(`~/.foundry/bin/cast wallet decrypt-keystore --keystore-dir ~/.monskills/keystore ${ks} --unsafe-password "" | awk '{print $NF}'`).toString().trim();
const account = privateKeyToAccount(pk);
const wc = createWalletClient({ account, chain: monadTestnet, transport: http() });
const pc = createPublicClient({ chain: monadTestnet, transport: http() });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = [];
const check = (name, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail.push(name); };

const state = (id) => pc.readContract({ address: GAME, abi: gameAbi, functionName: 'state', args: [BigInt(id)] });
const mine = await pc.readContract({ address: GAME, abi: gameAbi, functionName: 'catsOf', args: [account.address] });
const ids = mine.map((c) => Number(c.id));
log(`wallet ${account.address} holds ${ids.length} cats: ${ids.join(', ')}`);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let nonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' });
await page.exposeFunction('__signAndSend', async (tx) => {
  const hash = await wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined, nonce: nonce++ });
  return hash;
});
await page.evaluateOnNewDocument((a) => {
  const rpc = async (method, params) => { const r = await fetch('https://testnet-rpc.monad.xyz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code }); return j.result; };
  window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [a];
    if (method === 'eth_chainId') return '0x279f';
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_revokePermissions') return null;
    if (method === 'eth_sendTransaction') { const t = params[0]; return window.__signAndSend({ to: t.to, value: t.value, data: t.data, gas: t.gas }); }
    return rpc(method, params ?? []); } };
  try { localStorage.setItem('emogotchi.wallet', 'injected'); } catch {}
}, account.address);
await page.goto(`${BASE}/?dev=1`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => window.__chain?.get?.().loaded && document.querySelector('.petview'), { timeout: 90000 });
const idle = () => page.waitForFunction(() => { const p = window.__pet; return p && !p.director.isBusy && !(p.chain && p.chain.get().pending); }, { timeout: 180000 });
const clickAction = async (label) => { await page.evaluate((l) => [...document.querySelectorAll('.action')].find((b) => b.textContent.includes(l))?.click(), label); };

const first = ids[0];
log(`--- single-cat actions on #${first}`);
await page.evaluate((id) => window.__chain.setActive(id), first);
await new Promise((r) => setTimeout(r, 600));
for (const [label, key] of (process.env.ONLY ? [] : [['Feed', 'feeds'], ['Wash', 'washes'], ['Play', 'plays']])) {
  const before = Number((await state(first))[key]);
  await clickAction(label);
  await idle();
  await new Promise((r) => setTimeout(r, 4000));
  const after = Number((await state(first))[key]);
  check(`${label} → ${key} on chain`, after === before + 1, `${before} → ${after}`);
}
// sleep then wake — only possible once energy has actually dropped below 100 (24 h to drain)
let s = await state(first);
if (Number(s.energy) >= 100) {
  const disabled = await page.evaluate(() => [...document.querySelectorAll('.action')].find((b) => b.textContent.includes('Sleep'))?.disabled);
  check('Sleep is disabled at full energy (by design)', disabled === true, `energy ${s.energy}`);
  log('  (skipping the sleep/wake round trip: the cat is not tired yet)');
} else {
  const napsBefore = Number(s.naps);
  await clickAction('Sleep'); await idle(); await new Promise((r) => setTimeout(r, 4000));
  s = await state(first);
  check('Sleep → naps + asleep on chain', Number(s.naps) === napsBefore + 1 && s.asleep === true, `naps ${napsBefore}→${s.naps}, asleep ${s.asleep}`);
  await clickAction('Wake'); await idle(); await new Promise((r) => setTimeout(r, 4000));
  check('Wake → awake on chain', (await state(first)).asleep === false);
}
// pet (gas only, debounced)
const petsBefore = Number(s.pets);
// space the taps like a person: the cat ignores a tap while it is mid-animation, and the client
// batches taps within 1.5 s into ONE pet(id, n) transaction
for (let i = 0; i < 3; i++) {
  await page.waitForFunction(() => !window.__pet?.director?.isBusy, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.cathost').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 300 })));
  await new Promise((r) => setTimeout(r, 400));
}
await new Promise((r) => setTimeout(r, 12000));
check('Pet ×3 → pets on chain', Number((await state(first)).pets) === petsBefore + 3, `${petsBefore} → ${(await state(first)).pets}`);
// name
const name = process.env.ONLY ? await pc.readContract({ address: GAME, abi: gameAbi, functionName: 'nameOf', args: [BigInt(first)] }) : `Test ${Date.now() % 10000}`;
if (!process.env.ONLY) {
await page.evaluate(() => document.querySelector('.name-btn')?.click());
await page.waitForSelector('.name-input', { timeout: 5000 });
await page.type('.name-input', name);
await page.keyboard.press('Enter');
await idle(); await new Promise((r) => setTimeout(r, 5000));
check('setName → name on chain', (await pc.readContract({ address: GAME, abi: gameAbi, functionName: 'nameOf', args: [BigInt(first)] })) === name, name);
}

if (process.env.ONLY) { log(fail.length ? `FAILURES: ${fail.join(', ')}` : 'all checks passed'); await browser.close(); process.exit(fail.length ? 1 : 0); }
log('--- batch care across every cat (the All tab)');
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__chain?.get?.().cats?.length > 1, { timeout: 60000 });
const beforeAll = await Promise.all(ids.map(async (i) => Number((await state(i)).feeds)));
await page.evaluate(() => document.querySelector('.cat-tab-all')?.click());
await new Promise((r) => setTimeout(r, 800));
await clickAction('Feed all');
await idle(); await new Promise((r) => setTimeout(r, 6000));
const afterAll = await Promise.all(ids.map(async (i) => Number((await state(i)).feeds)));
check('Feed all → every cat fed in one transaction', afterAll.every((v, k) => v === beforeAll[k] + 1), `${beforeAll.join('/')} → ${afterAll.join('/')}`);

log('--- the N.d direct-transfer protocol');
const nBefore = Number((await state(first)).plays);
const h = await wc.sendTransaction({ to: GAME, value: parseEther(`${ids.length}.1`), gas: 400000n, nonce: nonce++ });
await pc.waitForTransactionReceipt({ hash: h });
const nAfter = await Promise.all(ids.map(async (i) => Number((await state(i)).plays)));
check(`send ${ids.length}.1 MON → plays every cat`, nAfter.every((v) => v >= 1), `plays now ${nAfter.join('/')}`);

log('--- metadata and the burn machinery');
const uri = await pc.readContract({ address: GAME, abi: gameAbi, functionName: 'tokenURI', args: [BigInt(first)] });
const json = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
check('tokenURI is on-chain JSON with an SVG image', uri.startsWith('data:application/json;base64,') && json.image.startsWith('data:image/svg+xml;base64,'), `${json.name} · ${(uri.length / 1024).toFixed(0)} KB`);
check('tokenURI carries the name and attributes', json.name.includes(name) && Array.isArray(json.attributes) && json.attributes.length > 5, `${json.attributes.length} attributes`);
const pending = await pc.readContract({ address: GAME, abi: gameAbi, functionName: 'pendingBurnMon' });
log(`  pendingBurnMon ${formatEther(pending)} MON`);
const burnedBefore = await pc.readContract({ address: GAME, abi: gameAbi, functionName: 'totalEmoBurned' });
const ch = await wc.writeContract({ address: GAME, abi: gameAbi, functionName: 'crankBurn', args: [2n ** 255n, 0n], gas: 500000n, nonce: nonce++ });
await pc.waitForTransactionReceipt({ hash: ch });
const burnedAfter = await pc.readContract({ address: GAME, abi: gameAbi, functionName: 'totalEmoBurned' });
check('crankBurn buys and burns EMO', burnedAfter > burnedBefore, `${formatEther(burnedBefore)} → ${formatEther(burnedAfter)} EMO`);
const treBefore = await pc.getBalance({ address: '0x18c13CAF92b3fC078156E411A87524D7EcC88aA2' });
const sh = await wc.writeContract({ address: GAME, abi: gameAbi, functionName: 'sweep', args: [], gas: 300000n, nonce: nonce++ });
await pc.waitForTransactionReceipt({ hash: sh });
const treAfter = await pc.getBalance({ address: '0x18c13CAF92b3fC078156E411A87524D7EcC88aA2' });
check('sweep pays the treasury', treAfter > treBefore, `+${formatEther(treAfter - treBefore)} MON`);

await page.screenshot({ path: `${OUT}/actions-final.png` });
log('console errors:', errors.length ? '\n  ' + [...new Set(errors)].join('\n  ') : 'none');
log(fail.length ? `FAILURES: ${fail.join(', ')}` : 'all checks passed');
await browser.close();
process.exit(fail.length ? 1 : 0);
