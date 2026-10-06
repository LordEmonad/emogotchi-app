// The emo pack, end to end, on an ANVIL FORK of mainnet through the real pages, the way it will go live: the 14 items and
// the 7,000 $EMO gate created by the operator's own script (contracts/script/CreateEmo.s.sol, run as the curator on the
// fork), then a fresh wallet holding exactly 7,000 $EMO and no pet finds the pack LIVE on /shop/emo, claims all seven
// holders' items free from the page ("Claim all seven free"), is told the paid edition needs a pet, mints a free frok,
// buys two paid items there for 30 MON each, gives the holders' set to the frok in the shop, and on the frok's page sees
// it all: the beanie, the fit, the wristbands and the lip piercings drawn, the emo bedroom, the guitar on Play, the
// Mirror selfie button. On chain: a holders' copy refuses to move (soulbound), a paid one moves; a wallet holding a hair
// under 7,000 $EMO is refused the free edition. Fork MON and fork EMO only; nothing touches mainnet.
//   fork: ~/.foundry/bin/anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8552 --code-size-limit 131072 --gas-limit 300000000
//   pack: cast rpc anvil_impersonateAccount 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --rpc-url http://127.0.0.1:8552
//         (cd contracts && ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 ~/.foundry/bin/forge script script/CreateEmo.s.sol --rpc-url http://127.0.0.1:8552 \
//          --broadcast --slow --unlocked --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit)
//   site: (cd apps/web && VITE_RPC_URL=http://127.0.0.1:8552 npx vite --config ../../tools/thiccums-dev.mjs --port 5398 --strictPort)
//   BASE=http://127.0.0.1:5398 RPC=http://127.0.0.1:8552 OUT=<dir> node tools/fork-emo.mjs
import puppeteer from 'puppeteer-core';
import { createWalletClient, createPublicClient, http, defineChain, parseAbi, parseEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const OUT = process.env.OUT ?? '.'; const BASE = process.env.BASE ?? 'http://127.0.0.1:5398'; const RPC = process.env.RPC ?? 'http://127.0.0.1:8552';
const SHOP = '0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91', EMO = '0x81A224F8A62f52BdE942dBF23A56df77A10b7777', DEAD = '0x000000000000000000000000000000000000dEaD';
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(process.env.KEY ?? generatePrivateKey());   // a throwaway: never anvil's defaults (7702 code on mainnet)
const other = privateKeyToAccount(generatePrivateKey());
const wc = createWalletClient({ account, chain, transport: http(RPC) }); const pc = createPublicClient({ chain, transport: http(RPC) });
const rpcCall = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fails = []; const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) fails.push(what); };
const erc20 = parseAbi(['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const shopAbi = parseAbi(['function canClaim(uint256 id, address who, uint32 qty, bytes data) view returns (bool ok, uint8 reason, bytes32 key, uint256 due)',
  'function balanceOf(address who, uint256 id) view returns (uint256)', 'function uri(uint256) view returns (string)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)', 'function itemCount() view returns (uint256)']);

// the wallets: 1,000 fork MON each; $EMO from the burn address (impersonated: the fork's only), exactly 7,000 to ours and
// a hair under it to the other
await rpcCall('anvil_setBalance', [account.address, '0x3635C9ADC5DEA00000']);
await rpcCall('anvil_setBalance', [other.address, '0x3635C9ADC5DEA00000']);
await rpcCall('anvil_setBalance', [DEAD, '0x56BC75E2D63100000']);
await rpcCall('anvil_impersonateAccount', [DEAD]);
for (const [to, amt] of [[account.address, parseEther('7000')], [other.address, parseEther('7000') - 1n]]) {
  const h = await rpcCall('eth_sendTransaction', [{ from: DEAD, to: EMO, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [to, amt] }) }]);
  await pc.waitForTransactionReceipt({ hash: h });
}
log('wallet', account.address, 'EMO', (await pc.readContract({ address: EMO, abi: erc20, functionName: 'balanceOf', args: [account.address] })) / 10n ** 18n);
const count = Number(await pc.readContract({ address: SHOP, abi: shopAbi, functionName: 'itemCount' }));
check(count === 31, `the shop holds 31 items after the script (${count})`);
// what a marketplace reads: uri(id), a base64 JSON whose image is the card, byte for byte
const { readFileSync } = await import('node:fs');
const FILES = ['beanie', 'fit', 'wristbands', 'piercings', 'bedroom', 'guitar', 'selfie'];
const NAMES = ['Beanie', 'Emo fit', 'Wristbands', 'Lip piercings', 'Emo bedroom theme', 'Guitar', 'Flip phone'];
for (let i = 0; i < 14; i++) {
  const id = 18 + i, k = i % 7, holders = i >= 7, want = NAMES[k] + (holders ? ' (Holders)' : '');
  const u = await pc.readContract({ address: SHOP, abi: shopAbi, functionName: 'uri', args: [BigInt(id)] }).catch(() => '');
  const meta = u.startsWith('data:application/json;base64,') ? JSON.parse(Buffer.from(u.slice(29), 'base64').toString('utf8')) : {};
  const img = typeof meta.image === 'string' && meta.image.startsWith('data:image/svg+xml;base64,') ? Buffer.from(meta.image.slice(26), 'base64') : Buffer.alloc(0);
  const card = readFileSync(new URL(`../contracts/items/emo/${FILES[k]}${holders ? '-holder' : ''}.svg`, import.meta.url));
  check(meta.name === want && img.equals(card), `#${id} "${want}": its metadata's name and picture are the card (${meta.name}, ${img.length} bytes)`);
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 1000 });
const errors = []; page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|\/api\//.test(m.text())) errors.push(m.text().slice(0, 200)); }); page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let nonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' }); const sent = [];
await page.exposeFunction('__signAndSend', async (tx) => { const hash = await wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined, nonce: nonce++ }); sent.push({ sel: tx.data.slice(0, 10), value: tx.value ? BigInt(tx.value) : 0n }); log('  tx', hash.slice(0, 12), 'sel', tx.data.slice(0, 10), tx.value && BigInt(tx.value) ? `value ${BigInt(tx.value) / 10n ** 18n} MON` : ''); return hash; });
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
const bal = (id, who = account.address) => pc.readContract({ address: SHOP, abi: shopAbi, functionName: 'balanceOf', args: [who, BigInt(id)] });
const text = () => page.evaluate(() => document.body.innerText);
const connect = async () => {
  await page.waitForSelector('.wallet-opt', { timeout: 10000 }).then(() => page.click('.wallet-opt')).catch(() => {});
};

// 0. the pack page reads the pack as live by itself
await page.goto(`${BASE}/shop/emo`, { waitUntil: 'networkidle0' });
await waitFor(() => document.querySelector('.pack-eyebrow b')?.textContent === 'Live', 60000).catch(() => {});
check(await page.evaluate(() => document.querySelector('.pack-eyebrow b')?.textContent === 'Live' && !document.body.innerText.includes('Coming soon')), '/shop/emo reads the pack as live (no "Coming soon")');
await shot('e0-pack-live');

// 1. connect; no pet yet: the holders' set is claimable, the paid edition needs a pet
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.trim() === 'Connect to claim')?.click());
await connect();
await waitFor(() => [...document.querySelectorAll('button')].some((b) => /^Claim all seven free$/.test(b.textContent.trim()) && !b.disabled), 90000).catch(() => {});
check(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Claim all seven free' && !b.disabled)), 'holding 7,000 $EMO: "Claim all seven free" is offered');
check(await page.evaluate(() => [...document.querySelectorAll('.pack-card button')].filter((b) => b.textContent.trim() === 'Needs a pet').length === 7), 'with no pet, every paid button says "Needs a pet"');
await shot('e1-holder-ready');
// 2. claim all seven, one transaction each
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.trim() === 'Claim all seven free')?.click());
await waitFor(() => [...document.querySelectorAll('.pack-card button')].filter((b) => b.textContent.trim() === 'Claimed').length === 7, 300000).catch(() => {});
const held = await Promise.all([25, 26, 27, 28, 29, 30, 31].map((id) => bal(id)));
check(held.every((n) => n === 1n), `all seven holders' items in the wallet (${held.join(',')})`);
check(sent.filter((t) => t.value === 0n).length >= 7, `seven free claims sent (${sent.length} transactions)`);
await sleep(4500);   // past the page's second re-read (3 s after a claim): the buttons must not flicker back to "Checking…"
check(await page.evaluate(() => [...document.querySelectorAll('.pack-card button')].filter((b) => b.textContent.trim() === 'Claimed').length === 7), 'every holders\' button says "Claimed" (and stays so)');
check(await page.evaluate(() => document.body.innerText.includes('You have the set')), 'the holders\' edition says "You have the set"');
await shot('e2-claimed');
// a second claim is refused by the contract itself
const again = await pc.readContract({ address: SHOP, abi: shopAbi, functionName: 'canClaim', args: [25n, account.address, 1, '0x'] });
check(!again[0] && again[1] === 7, `a second claim of the same item is refused (reason ${again[1]}: already claimed)`);
// a hair under 7,000 $EMO: refused
const under = await pc.readContract({ address: SHOP, abi: shopAbi, functionName: 'canClaim', args: [25n, other.address, 1, '0x'] });
check(!under[0] && under[1] === 6, `a wallet holding 6,999.999… $EMO is refused the free edition (reason ${under[1]}: not eligible)`);

// 3. mint a frok (free), then buy two paid items on the pack page
await page.goto(`${BASE}/mint`, { waitUntil: 'networkidle0' });
await page.$$eval('.mint-btn', (bs) => bs.find((b) => b.textContent.includes('Connect and mint'))?.click());
await connect();
await waitFor(() => /^Mint .* · free$/.test(document.querySelector('.mint-btn')?.textContent ?? ''), 60000);
await page.click('.mint-btn');
await waitFor(() => document.querySelector('.mint-btn')?.textContent.includes("He's yours") || document.querySelector('.mint-error'), 180000);
const frokHref = await page.$eval('.mint-btn', (e) => e.getAttribute('href'));
check(/^\/inversebrah\/pet\/\d+$/.test(frokHref ?? ''), `minted a frok (${frokHref})`);
await page.goto(`${BASE}/shop/emo`, { waitUntil: 'networkidle0' });
await waitFor(() => [...document.querySelectorAll('.pack-card button')].filter((b) => b.textContent.trim() === 'Buy · 30 MON' && !b.disabled).length === 7, 90000).catch(() => {});
check(await page.evaluate(() => [...document.querySelectorAll('.pack-card button')].filter((b) => b.textContent.trim() === 'Buy · 30 MON' && !b.disabled).length === 7), 'with a pet, every paid button says "Buy · 30 MON"');
const before = await pc.getBalance({ address: account.address });
for (const name of ['Beanie', 'Guitar']) {
  await page.$$eval('.pack-card', (cs, name) => { const c = cs.find((x) => x.querySelector('h3')?.textContent === name); [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Buy · 30 MON')?.click(); }, name);
  await waitFor((name) => { const c = [...document.querySelectorAll('.pack-card')].find((x) => x.querySelector('h3')?.textContent === name); return c && /You have 1 paid/.test(c.textContent); }, 180000, name).catch(() => {});
}
check((await bal(18)) === 1n && (await bal(23)) === 1n, 'bought the paid beanie (18) and guitar (23)');
const spent = before - (await pc.getBalance({ address: account.address }));
check(spent >= parseEther('60') && spent < parseEther('61'), `paid 60 MON for two (and gas): ${Number(spent) / 1e18}`);
check(sent.filter((t) => t.value === parseEther('30')).length === 2, 'two buys of exactly 30 MON');
await shot('e3-bought');

// 4. on chain: the holders' copy is soulbound, the paid one moves
const tryMove = async (id) => pc.simulateContract({ account, address: SHOP, abi: shopAbi, functionName: 'safeTransferFrom', args: [account.address, other.address, BigInt(id), 1n, '0x'] }).then(() => true, () => false);
check(!(await tryMove(25)), 'a holders\' copy cannot be sent (soulbound)');
check(await tryMove(18), 'a paid copy can be sent');

// 5. the shop: the pack is its own section of fourteen; give the holders' set to the frok
await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle0' });
await waitFor(() => document.querySelectorAll('#shop-emo .item-card').length === 14, 90000).catch(() => {});
check(await page.evaluate(() => document.querySelectorAll('#shop-emo .item-card').length === 14), 'the shop shows the pack as its own section of fourteen');
await page.$$eval('.item-card .btn', (bs) => bs.find((b) => b.textContent.includes('Connect'))?.click()).catch(() => {});
await connect();
const inCard = (t, src) => page.$$eval('#shop-emo .item-card', (cs, t, src) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); return c ? new Function('c', src)(c) : null; }, t, src);
for (const t of ['Beanie (Holders)', 'Emo fit (Holders)', 'Wristbands (Holders)', 'Lip piercings (Holders)', 'Emo bedroom theme (Holders)', 'Guitar (Holders)', 'Flip phone (Holders)']) {
  await waitFor((t) => { const c = [...document.querySelectorAll('#shop-emo .item-card')].find((x) => x.querySelector('h2')?.textContent === t); return c && c.querySelectorAll('.item-cat input[type=checkbox]').length >= 1; }, 90000, t).catch(() => {});
  await inCard(t, "c.querySelectorAll('.item-cat input[type=checkbox]').forEach((i) => { if (!i.checked) i.click(); })");
  const btn = await inCard(t, "return [...c.querySelectorAll('button')].find((b) => /^(Give|Dress|Put)/.test(b.textContent))?.textContent");
  await inCard(t, "[...c.querySelectorAll('button')].find((b) => /^(Give|Dress|Put)/.test(b.textContent))?.click()");
  await waitFor((t) => { const c = [...document.querySelectorAll('#shop-emo .item-card')].find((x) => x.querySelector('h2')?.textContent === t); return c && c.querySelectorAll('.item-cat-wearing').length >= 1; }, 180000, t).catch(() => {});
  check(await inCard(t, "return c.querySelectorAll('.item-cat-wearing').length >= 1"), `${t}: on the frok (${btn})`);
}
await shot('e4-shop');

// 6. the frok's page: everything drawn, the room, the guitar on Play, the Mirror selfie button
await page.goto(`${BASE}${frokHref}`, { waitUntil: 'networkidle0' });
await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000); await sleep(3000);
const look = await page.evaluate(() => {
  const shown = (sel) => { const e = document.querySelector(`.stage .pet ${sel}`); return !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
  const s = window.__chain.get(); const c = window.__chain.active();
  return { worn: (s.worn[`${c.col}:${c.id}`] ?? []).slice().sort((a, b) => a - b), beanie: shown('#beanie'), fit: shown('#emofit'), wrist: shown('#wristL'), lip: shown('#piercings'),
    scene: document.querySelector('.stage')?.getAttribute('data-scene'), selfie: [...document.querySelectorAll('.petview button')].some((b) => b.textContent.trim().startsWith('Mirror selfie')) };
});
log('frok page:', JSON.stringify(look));
check(JSON.stringify(look.worn) === '[25,26,27,28,29,30,31]', `all seven on it on chain (${JSON.stringify(look.worn)})`);
check(look.beanie && look.fit && look.wrist && look.lip, 'the beanie, the fit, the wristbands and the lip piercings are drawn');
check(look.scene === 'emoroom', 'the room is the emo bedroom');
check(look.selfie, 'the Mirror selfie button is there');
await shot('e5-frok-page');
await waitFor(() => { const b = [...document.querySelectorAll('.petview button')].find((x) => x.textContent.trim().startsWith('Play')); return !!b && !b.disabled && !window.__pet?.director?.isBusy; }, 60000).catch(() => {});
await page.$$eval('.petview button', (bs) => bs.find((b) => b.textContent.trim().startsWith('Play'))?.click());
await waitFor(() => !!document.querySelector('.stage [id^="emoguitar"], .stage .prop-emoguitar, .stage svg[viewBox="0 0 162 76"]'), 120000).catch(() => {});
check(await page.evaluate(() => !!document.querySelector('.stage [id^="emoguitar"], .stage .prop-emoguitar, .stage svg[viewBox="0 0 162 76"]')), 'Play brings the guitar down');
await sleep(4000); await shot('e6-guitar');

check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
log(fails.length ? `${fails.length} FAILED: ${fails.join('; ')}` : 'ALL PASSED');
process.exit(fails.length ? 1 : 0);
