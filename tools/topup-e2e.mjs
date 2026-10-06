#!/usr/bin/env node
/**
 * "Add MON from another chain" (CROSSCHAIN.md), end to end, with no real money: a headless Chrome with an injected
 * test wallet that can be on Monad or Base, two anvil forks (Monad 143 on 8546, Base 8453 on 8547), the real Worker
 * under `wrangler dev` (real Relay quotes, with the Relay key in worker/.dev.vars; its chain reads pointed at the forks
 * by TOPUP_RPCS), and a Relay stand-in on 8790 that passes quotes and prices through to the real Relay and plays the
 * solver: when the deposit lands on the Base fork (the real depository contract, the exact calldata the page signed)
 * or the coin reaches a deposit address there, it pays the MON on the Monad fork and reports success.
 *
 *   OUT=<dir for screenshots> node tools/topup-e2e.mjs
 *
 * What it checks: a free mint from a wallet with no MON opens the sheet (gas only); a top-up with Base ETH (one
 * signature on Base, back to Monad, MON arrives, the mint then goes through); a paid action short of MON on the pet page
 * (naming, 10 MON) opens it prefilled, and the page does not drag the wallet back to Monad mid top-up; Base USDC
 * (approve exactly, then deposit); a deposit address paid from another wallet; a quote Relay bends is refused and
 * nothing is signed; no page errors.
 * Uses a fresh `generatePrivateKey()` wallet, never anvil's default accounts (some have EIP-7702 code on Monad mainnet).
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, formatEther, http, keccak256, parseAbi, parseEther, parseUnits, toHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || join(ROOT, '.topup-e2e');
mkdirSync(OUT, { recursive: true });
const P = { monad: 8546, base: 8547, relay: 8790, worker: 8799, site: 5189 };
const RPC = { 143: `http://127.0.0.1:${P.monad}`, 8453: `http://127.0.0.1:${P.base}` };
const SITE = `http://127.0.0.1:${P.site}`;
const REAL = 'https://api.relay.link';
const DEPOSITORY = '0x4cd00e387622c35bddb9b4c962c136462338bc31';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);
let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) { passes++; log('  ok  ', what); } else { fails++; log('  FAIL', what); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 60_000, every = 400) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error(`timed out: ${what}`); await sleep(every); }
}

// ---------------------------------------------------------------- processes
const kids = [];
function run(cmd, args, opts = {}, name = cmd) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.tail = () => out.slice(-3000);
  kids.push(p); p.name = name;
  return p;
}
const cleanup = () => { for (const k of kids) { try { process.kill(k.pid, 'SIGTERM'); } catch { /* gone */ } } };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(1); });
const rpcUp = (url) => until(() => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }).then((r) => r.ok), url, 120_000, 500);

const ANVIL = `${process.env.HOME}/.foundry/bin/anvil`;
log('forks: Monad and Base');
run(ANVIL, ['--fork-url', 'https://rpc.monad.xyz', '--chain-id', '143', '--port', String(P.monad), '--silent', '--code-size-limit', '131072'], {}, 'anvil-monad');
run(ANVIL, ['--fork-url', process.env.BASE_FORK_URL || 'https://base-rpc.publicnode.com', '--chain-id', '8453', '--port', String(P.base), '--silent'], {}, 'anvil-base');
await rpcUp(RPC[143]); await rpcUp(RPC[8453]);

const monadChain = defineChain({ id: 143, name: 'Monad', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC[143]] } } });
const baseChain = defineChain({ id: 8453, name: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC[8453]] } } });
const CHAINS = { 143: monadChain, 8453: baseChain };
const pub = { 143: createPublicClient({ chain: monadChain, transport: http(RPC[143]) }), 8453: createPublicClient({ chain: baseChain, transport: http(RPC[8453]) }) };
const anvil = (chain, method, params) => pub[chain].request({ method, params });
const setBal = (chain, who, wei) => anvil(chain, 'anvil_setBalance', [who, toHex(wei)]);

// ---------------------------------------------------------------- the Relay stand-in (the solver, on the forks)
const filler = privateKeyToAccount(generatePrivateKey());
await setBal(143, filler.address, parseEther('1000000'));
const fillerWallet = createWalletClient({ account: filler, chain: monadChain, transport: http(RPC[143]) });
const orders = new Map();   // requestId -> { player, out, orderId, fromBlock, depositAddress, token, amountIn, fill, inTx }
let bend = null;            // a function that bends the next quote (the tamper test)
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)']);
async function seen(o) {
  if (o.depositAddress) {
    const bal = o.token === '0x0000000000000000000000000000000000000000'
      ? await pub[8453].getBalance({ address: o.depositAddress })
      : await pub[8453].readContract({ address: o.token, abi: erc20, functionName: 'balanceOf', args: [o.depositAddress] });
    return bal >= o.amountIn ? '0x' + '00'.repeat(32) : null;
  }
  const logs = await pub[8453].getLogs({ address: DEPOSITORY, fromBlock: o.fromBlock });
  const id = o.orderId.slice(2).toLowerCase();
  const hit = logs.find((l) => l.data.toLowerCase().includes(id) || l.topics.some((t) => t.toLowerCase().includes(id)));
  return hit ? hit.transactionHash : null;
}
const relay = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (url.pathname === '/intents/status/v3') {
      const o = orders.get(url.searchParams.get('requestId'));
      if (!o) return send(200, { status: 'waiting' });
      if (o.fill) return send(200, { status: 'success', inTxHashes: [o.inTx], txHashes: [o.fill], originChainId: 8453, destinationChainId: 143 });
      const inTx = await seen(o);
      if (!inTx) return send(200, { status: 'waiting' });
      o.inTx = inTx;
      o.fill = await fillerWallet.sendTransaction({ to: o.player, value: o.out });
      await pub[143].waitForTransactionReceipt({ hash: o.fill });
      return send(200, { status: 'pending', inTxHashes: [inTx], txHashes: [] });
    }
    const r = await fetch(REAL + url.pathname + url.search, { method: req.method, headers: { 'content-type': 'application/json', 'x-api-key': req.headers['x-api-key'] ?? '' }, body: req.method === 'POST' ? body : undefined });
    const text = await r.text();
    if (url.pathname === '/quote/v2' && r.ok) {
      const q = JSON.parse(text);
      const ask = JSON.parse(body);
      const o = q.protocol.v2.orderData;
      const depositAddress = q.steps.map((s) => s.depositAddress).find(Boolean);
      orders.set(q.requestId, {
        player: ask.recipient, out: BigInt(o.output.payments[0].minimumAmount), orderId: q.protocol.v2.orderId,
        fromBlock: await pub[8453].getBlockNumber(), depositAddress, token: ask.originCurrency, amountIn: BigInt(o.inputs[0].payment.amount),
      });
      if (bend) { const b = bend; bend = null; b(q); return send(200, q); }
      return send(200, q);
    }
    res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(text);
  } catch (e) { send(500, { message: String(e) }); }
});
await new Promise((r) => relay.listen(P.relay, '127.0.0.1', r));

// ---------------------------------------------------------------- the Worker and the site
log('Worker (wrangler dev) and site (vite)');
const worker = run('npx', ['wrangler', 'dev', '--port', String(P.worker), '--ip', '127.0.0.1',
  '--var', `RELAY_BASE:http://127.0.0.1:${P.relay}`, '--var', `TOPUP_RPCS:${JSON.stringify({ 143: RPC[143], 8453: RPC[8453] })}`], { cwd: join(ROOT, 'worker') }, 'worker');
const site = run('npx', ['vite', '--port', String(P.site), '--strictPort', '--host', '127.0.0.1'], {
  cwd: join(ROOT, 'apps/web'),
  env: { ...process.env, VITE_RPC_URL: RPC[143], VITE_TOPUP: 'on', VITE_TOPUP_API: `http://127.0.0.1:${P.worker}`, VITE_PASSKEY: 'on' },
}, 'site');
try {
  await until(() => fetch(`http://127.0.0.1:${P.worker}/api/topup/status?id=x`).then((r) => r.status === 400), 'worker', 120_000, 800);
  await until(() => fetch(SITE).then((r) => r.ok), 'site', 120_000, 800);
} catch (e) { log(worker.tail()); log(site.tail()); throw e; }

// ---------------------------------------------------------------- the player and their wallet
const key = generatePrivateKey();
const me = privateKeyToAccount(key);
const ME = me.address.toLowerCase();
await setBal(143, me.address, 0n);
await setBal(8453, me.address, parseEther('0.05'));
// 100 USDC on the Base fork (FiatToken keeps balances in slot 9)
await anvil(8453, 'anvil_setStorageAt', [USDC, keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [me.address, 9n])), toHex(parseUnits('100', 6), { size: 32 })]);
ok((await pub[8453].readContract({ address: USDC, abi: erc20, functionName: 'balanceOf', args: [me.address] })) === parseUnits('100', 6), 'the player holds 100 USDC and 0.05 ETH on the Base fork, nothing on Monad');
const wallets = { 143: createWalletClient({ account: me, chain: monadChain, transport: http(RPC[143]) }), 8453: createWalletClient({ account: me, chain: baseChain, transport: http(RPC[8453]) }) };
const signed = [];   // every transaction the wallet was asked to send, with its chain

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.stack ?? e).slice(0, 800)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|WebSocket|googletagmanager/.test(m.text())) errors.push(m.text().slice(0, 800)); });
let walletChain = 143;
await page.exposeFunction('__tuChain', () => walletChain);
await page.exposeFunction('__tuSwitch', (id) => { if (!CHAINS[id]) { const e = new Error('Unrecognized chain'); throw e; } walletChain = id; return id; });
await page.exposeFunction('__tuSend', async (tx) => {
  signed.push({ chain: walletChain, to: tx.to?.toLowerCase(), data: tx.data, value: tx.value ?? '0x0' });
  return wallets[walletChain].sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined });
});
await page.exposeFunction('__tuRpc', async (method, params) => {
  const r = await fetch(RPC[walletChain], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return r.json();
});
await page.evaluateOnNewDocument((addr) => {
  try { localStorage.setItem('emogotchi.wallet', 'injected'); } catch { /* */ }
  const subs = {};
  window.ethereum = {
    isMetaMask: true,
    on(ev, f) { (subs[ev] ??= []).push(f); }, removeListener(ev, f) { subs[ev] = (subs[ev] ?? []).filter((x) => x !== f); },
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
      if (method === 'eth_chainId') return '0x' + (await window.__tuChain()).toString(16);
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        const id = parseInt(params[0].chainId, 16);
        const was = await window.__tuChain();
        try { await window.__tuSwitch(id); } catch { throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 }); }
        if (id !== was) for (const f of subs.chainChanged ?? []) f('0x' + id.toString(16));
        return null;
      }
      if (method === 'wallet_revokePermissions') return null;
      if (method === 'eth_sendTransaction') return window.__tuSend(params[0]);
      const j = await window.__tuRpc(method, params ?? []);
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
      return j.result;
    },
  };
}, ME);
const balReads = [];
page.on('response', async (r) => { if (r.url().includes('/api/topup/balances')) { try { balReads.push(await r.json()); } catch { /* */ } } });
const shot = (n) => page.screenshot({ path: join(OUT, `${n}.png`) });
const text = (sel) => page.$eval(sel, (e) => e.textContent ?? '').catch(() => '');
async function clickText(sel, t, ms = 30_000) {
  const h = await until(async () => { for (const el of await page.$$(sel)) { if ((await el.evaluate((e) => e.textContent ?? '')).includes(t) && await el.isVisible() && !(await el.evaluate((e) => e.disabled))) return el; } return null; }, `${sel} "${t}"`, ms);
  await h.click();
}
const monOf = async () => Number(formatEther(await pub[143].getBalance({ address: me.address })));

try {
  // ---- 1. a free mint from a wallet with no MON: the sheet, for the gas
  log('1. free mint with no MON');
  await page.goto(`${SITE}/tung`, { waitUntil: 'domcontentloaded' });
  // connected by restore() (the remembered browser wallet), or through the site's own connect sheet
  const btn = await until(async () => { const t = await text('.mint-btn'); return /Connect and mint|Mint .*free/.test(t) ? t : null; }, 'the mint button', 60_000);
  if (btn.includes('Connect')) { await clickText('.mint-btn', 'Connect and mint'); await clickText('.wallet-opt', 'Browser wallet'); }
  await clickText('.mint-btn', 'free', 60_000);
  await page.waitForSelector('.modal.tu', { visible: true, timeout: 30_000 });
  ok((await text('.modal.tu')).includes('network fee'), 'the sheet opens on a free call short of gas, and says why');
  await until(async () => (await text('.tu-quote')).includes('You pay'), 'a price', 40_000);
  const first = await text('.tu-opt.is-on');
  ok((await page.$$('.tu-opt')).length === 2, 'only what the wallet holds is listed (ETH and USDC on Base)');
  ok(first.includes('ETH') && first.includes('Base'), `Base ETH is picked (the wallet holds it): "${first}"`);
  await shot('1-sheet');
  const before = signed.length;
  await clickText('.tu-go', 'Add 50 MON');
  await until(async () => (await text('.modal.tu h2')).includes('MON added'), 'MON added', 90_000);
  const mine = signed.slice(before);
  ok(mine.length === 1 && mine[0].chain === 8453 && mine[0].to === DEPOSITORY && mine[0].data.startsWith('0x49290c1c'), 'one transaction, on Base, depositNative into Relay\'s depository');
  ok(walletChain === 143, 'the wallet is back on Monad');
  ok(Math.abs((await monOf()) - 50) < 1e-9, '50 MON arrived on Monad');
  await shot('1-done');
  await clickText('.tu-go', 'Back to it');
  await clickText('.mint-btn', 'free', 30_000);
  const minted = await until(async () => { const t = await text('.mint-btn'); return /yours/i.test(t) ? t : null; }, 'the mint', 60_000);
  ok(true, `then the mint goes through: "${minted.trim()}"`);
  const petId = Number((minted.match(/#(\d+)/) ?? [])[1]);

  // ---- 2. a paid action on the pet page, short of MON (naming is 10 MON)
  log('2. naming with 1 MON');
  await setBal(143, me.address, parseEther('1'));
  await page.goto(`${SITE}/tung/pet/${petId}?name=1`, { waitUntil: 'domcontentloaded' });
  const nameInput = await page.waitForSelector('input.name-input', { visible: true, timeout: 60_000 });
  await nameInput.type('Tungtop', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.modal.tu', { visible: true, timeout: 30_000 });
  const lead = await text('.modal.tu .modal-sub');
  ok(/needs about 10\.0?5? MON/.test(lead) || lead.includes('needs about 10'), `the sheet says what is short: "${lead}"`);
  ok((await page.$eval('#tu-amount', (e) => e.value)) === '50', 'prefilled with 50 MON (what it needs, rounded up to 50)');
  // Base USDC this time
  await until(async () => (await text('.tu-opts')).includes('$'), 'the balances', 30_000);
  await clickText('.tu-opt', 'USDC');
  const on = await until(async () => { const t = await text('.tu-opt.is-on'); return t.includes('100') ? t : null; }, 'USDC with its balance', 20_000).catch(() => text('.tu-opt.is-on'));
  ok(on.includes('USDC') && on.includes('Base') && on.includes('100'), `USDC on Base picked, its balance shown: "${on}"`);
  await shot('2-usdc');
  await until(async () => (await text('.tu-quote')).includes('Two confirmations'), 'the USDC price', 40_000);
  const b2 = signed.length;
  let dragged = false;
  const watch = setInterval(() => { if (walletChain === 143 && signed.length > b2 && signed.length - b2 < 2) dragged = true; }, 50);
  await clickText('.tu-go', 'Add 50 MON');
  await until(async () => (await text('.modal.tu h2')).includes('MON added'), 'MON added (USDC)', 90_000);
  clearInterval(watch);
  const usdcTx = signed.slice(b2);
  ok(usdcTx.length === 2 && usdcTx.every((t) => t.chain === 8453), 'two transactions on Base');
  ok(usdcTx[0]?.to === USDC && usdcTx[0].data.startsWith('0x095ea7b3') && usdcTx[0].data.slice(34, 74) === DEPOSITORY.slice(2), 'first: approve Relay\'s depository');
  ok(usdcTx[1]?.to === DEPOSITORY && usdcTx[1].data.startsWith('0xe8017952'), 'then: depositErc20 (the four-argument one) into the depository');
  const allowance = await pub[8453].readContract({ address: USDC, abi: parseAbi(['function allowance(address,address) view returns (uint256)']), functionName: 'allowance', args: [me.address, DEPOSITORY] });
  ok(allowance === 0n, 'nothing left approved afterwards (exactly the amount, all used)');
  ok(!dragged, 'the page did not drag the wallet back to Monad between the approval and the deposit');
  ok(Math.abs((await monOf()) - 51) < 1e-6, '50 more MON on Monad (51)');
  await clickText('.tu-go', 'Back to it');
  await sleep(500);
  await page.keyboard.press('Enter').catch(() => {});

  // ---- 3. a deposit address, paid from somewhere else
  log('3. a deposit address');
  await page.goto(`${SITE}/tung/pet/${petId}`, { waitUntil: 'domcontentloaded' });
  await clickText('.wallet-chip', '', 60_000);
  await clickText('.wallet-pop button', 'Add MON from another chain');
  await page.waitForSelector('.modal.tu', { visible: true });
  await clickText('.tu-mode', 'Send from anywhere');
  await until(async () => (await text('.tu-chains .tu-chip.is-on')).includes('Base'), 'Base picked');
  ok((await page.$$('.tu-chains:not(.tu-coins) .tu-chip')).length === 7, 'from anywhere: all seven chains offered');
  await until(async () => (await text('.tu-quote')).includes('You pay'), 'address price', 40_000);
  await clickText('.tu-go', 'Show where to send it');
  await page.waitForSelector('.tu-address .tu-qr', { visible: true });
  const dep = (await text('.tu-address .tu-code')).trim();
  const amt = (await page.$$eval('.tu-address .tu-addr-row .tnum', (els) => els.map((e) => e.textContent)))[0].split(' ')[0];
  ok(/^0x[0-9a-f]{40}$/.test(dep), `a deposit address is shown: ${dep}`);
  await shot('3-address');
  const other = privateKeyToAccount(generatePrivateKey());
  await setBal(8453, other.address, parseEther('1'));
  await createWalletClient({ account: other, chain: baseChain, transport: http(RPC[8453]) }).sendTransaction({ to: dep, value: parseEther(amt) });
  await until(async () => (await text('.modal.tu h2')).includes('MON added'), 'MON added (address)', 60_000);
  ok(Math.abs((await monOf()) - 101) < 1e-6, 'paid from another wallet: 50 MON more (101)');
  await clickText('.tu-go', 'Done');

  // ---- 4. Relay bends a quote: refused, nothing signed
  log('4. a bent quote');
  bend = (q) => { for (const s of q.steps) for (const it of s.items) if (it.data) it.data.to = '0x000000000000000000000000000000000000dEaD'; };
  await clickText('.wallet-chip', '');
  await clickText('.wallet-pop button', 'Add MON from another chain');
  await page.waitForSelector('.modal.tu', { visible: true });
  const b4 = signed.length;
  await until(async () => (await text('.tu-quote')).includes('did not check out'), 'refused', 40_000);
  ok(true, 'the sheet refuses it: "did not check out"');
  ok((await page.$eval('.tu-go', (e) => e.disabled)), 'and there is nothing to press');
  ok(signed.length === b4, 'nothing was sent to the wallet');
  await shot('4-refused');

  // ---- 5. a phone
  log('5. a phone (390 wide)');
  await page.keyboard.press('Escape');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(`${SITE}/tung/pet/${petId}`, { waitUntil: 'domcontentloaded' });
  await clickText('.wallet-chip', '', 60_000);
  await clickText('.wallet-pop button', 'Add MON from another chain');
  await page.waitForSelector('.modal.tu', { visible: true });
  await until(async () => (await text('.tu-quote')).includes('You pay'), 'phone price', 40_000);
  const fits = () => page.evaluate(() => { const m = document.querySelector('.modal.tu'); return !!m && m.scrollWidth <= m.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; });
  ok(await fits(), 'the sheet fits a phone: nothing sideways');
  await shot('5-phone-wallet');
  await clickText('.tu-mode', 'Send from anywhere');
  await until(async () => (await text('.tu-quote')).includes('You pay'), 'phone address price', 40_000);
  await shot('5-phone-anywhere');
  await clickText('.tu-go', 'Show where to send it');
  await page.waitForSelector('.tu-address .tu-qr', { visible: true });
  ok(await fits(), 'the deposit address fits a phone too');
  await shot('5-phone-address');

  ok(errors.length === 0, `no page errors${errors.length ? `:\n${errors.join('\n')}` : ''}`);
} catch (e) {
  fails++;
  log('ERROR', e.message);
  await shot('error').catch(() => {});
  log('page errors:', errors.join('\n'));
  log('worker:', worker.tail());
} finally {
  writeFileSync(join(OUT, 'signed.json'), JSON.stringify(signed, null, 1));
  writeFileSync(join(OUT, 'balances.json'), JSON.stringify(balReads, null, 1));
  await browser.close();
  relay.close();
  log(`${passes} passed, ${fails} failed`);
  cleanup();
  process.exit(fails ? 1 : 0);
}
