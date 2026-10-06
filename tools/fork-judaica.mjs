// The Jewish pack, end to end, on an ANVIL FORK of mainnet through the real pages, the way it will go live: the five
// items created by the operator's own script (contracts/script/CreateJudaica.s.sol, run as the curator on the fork),
// then a fresh wallet mints a frok and a Sahur, finds the pack LIVE on /shop/jewish, buys all five in the shop (36 MON
// each), gives them to both pets, and on each pet's page sees them: the kippah and the star drawn, the Western Wall room,
// the dreidel on Play and the Kapparot button; then takes the kippah off. Fork MON only; nothing touches mainnet.
//   fork: ~/.foundry/bin/anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8547 --code-size-limit 131072
//   pack: (cd contracts && ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 forge script script/CreateJudaica.s.sol --rpc-url http://127.0.0.1:8547 \
//          --broadcast --slow --unlocked --sender <curator> --disable-code-size-limit)   (after anvil_impersonateAccount <curator>)
//   site: (cd apps/web && VITE_RPC_URL=http://127.0.0.1:8547 npx vite --port 5202 --strictPort)
//   BASE=http://localhost:5202 RPC=http://127.0.0.1:8547 OUT=<dir> node tools/fork-judaica.mjs
import puppeteer from 'puppeteer-core';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const OUT = process.env.OUT ?? '.'; const BASE = process.env.BASE ?? 'http://localhost:5202'; const RPC = process.env.RPC ?? 'http://127.0.0.1:8547';
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(process.env.KEY ?? generatePrivateKey());   // a throwaway: never anvil's defaults (7702 code on mainnet)
const wc = createWalletClient({ account, chain, transport: http(RPC) }); const pc = createPublicClient({ chain, transport: http(RPC) });
const rpcCall = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
await rpcCall('anvil_setBalance', [account.address, '0x3635C9ADC5DEA00000']);   // 1,000 fork MON
log('wallet', account.address);
const fails = []; const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) fails.push(what); };
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 1000 });
const errors = []; page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|\/api\//.test(m.text())) errors.push(m.text().slice(0, 200)); }); page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let nonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' }); const sent = [];
await page.exposeFunction('__signAndSend', async (tx) => { const hash = await wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined, nonce: nonce++ }); sent.push(tx.data.slice(0, 10)); log('  tx', hash.slice(0, 12), 'sel', tx.data.slice(0, 10), tx.value ? `value ${BigInt(tx.value) / 10n ** 18n} MON` : ''); return hash; });
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

// 0. the pack page sees the pack on chain by itself
await page.goto(`${BASE}/shop/jewish`, { waitUntil: 'networkidle0' });
await waitFor(() => document.body.innerText.includes('Get it in the shop'), 60000).catch(() => {});
check(await page.evaluate(() => document.body.innerText.includes('Get it in the shop') && !document.body.innerText.includes('Coming soon')), '/shop/jewish reads the pack as live (no "Coming soon")');
await shot('j0-pack-page');

// 1. mint a frok and a Sahur (free, one each per wallet)
const mint = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
  await page.$$eval('.mint-btn', (bs) => bs.find((b) => b.textContent.includes('Connect and mint'))?.click());
  await page.waitForSelector('.wallet-opt', { timeout: 10000 }).then(() => page.click('.wallet-opt')).catch(() => {});
  await waitFor(() => /^Mint .* · free$/.test(document.querySelector('.mint-btn')?.textContent ?? ''), 60000);
  await page.click('.mint-btn');
  await waitFor(() => document.querySelector('.mint-btn')?.textContent.includes("He's yours") || document.querySelector('.mint-error'), 180000);
  const href = await page.$eval('.mint-btn', (e) => e.getAttribute('href'));
  log('minted', href); return href;
};
const frokHref = await mint('/mint'); check(/^\/inversebrah\/pet\/\d+$/.test(frokHref ?? ''), 'minted a frok');
const sahurHref = await mint('/tung'); check(/^\/tung\/pet\/\d+$/.test(sahurHref ?? ''), 'minted a Sahur');

// 2. the shop: the pack is its own section; buy all five, give each to both pets
await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.item-card', { timeout: 60000 });
await page.$$eval('.item-card .btn', (bs) => bs.find((b) => b.textContent.includes('Connect to claim'))?.click()).catch(() => {});
await page.waitForSelector('.wallet-opt', { timeout: 10000 }).then(() => page.click('.wallet-opt')).catch(() => {});
await waitFor(() => document.querySelector('#shop-jewish'), 60000).catch(() => {});
check(await page.evaluate(() => !!document.querySelector('#shop-jewish') && document.querySelectorAll('#shop-jewish .item-card').length === 5), 'the shop shows the pack as its own section of five');
const NAMES = ['Kippah', 'Star of David', 'Western Wall theme', 'Dreidel', 'Kapparot hen'];
const inCard = (t, fn) => page.$$eval('.item-card', (cs, t, src) => { const c = cs.find((x) => x.querySelector('h2')?.textContent === t); return c ? new Function('c', src)(c) : null; }, t, fn);
for (const t of NAMES) {
  await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && [...c.querySelectorAll('button')].some((b) => b.textContent.startsWith('Claim ·') && !b.disabled)), 90000, t);
  const label = await inCard(t, "return [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith('Claim ·'))?.textContent");
  check(label === 'Claim · 36 MON', `${t}: the claim button says 36 MON (${label})`);
  await inCard(t, "[...c.querySelectorAll('button')].find((b) => b.textContent.startsWith('Claim ·'))?.click()");
  await waitFor((t) => [...document.querySelectorAll('.item-card')].some((c) => c.querySelector('h2')?.textContent === t && c.textContent.includes('You have')), 180000, t);
  log('claimed', t);
  // tick every pet in the card and give it
  await waitFor((t) => { const c = [...document.querySelectorAll('.item-card')].find((x) => x.querySelector('h2')?.textContent === t); return c && c.querySelectorAll('.item-cat input[type=checkbox]').length >= 2; }, 60000, t);
  await inCard(t, "c.querySelectorAll('.item-cat input[type=checkbox]').forEach((i) => i.click())");
  const btn = await inCard(t, "return [...c.querySelectorAll('button')].find((b) => /^(Give|Dress)/.test(b.textContent))?.textContent");
  log('  give button:', btn);
  await inCard(t, "[...c.querySelectorAll('button')].find((b) => /^(Give|Dress)/.test(b.textContent))?.click()");
  await waitFor((t) => { const c = [...document.querySelectorAll('.item-card')].find((x) => x.querySelector('h2')?.textContent === t); return c && c.querySelectorAll('.item-cat-wearing').length >= 2; }, 180000, t);
  log('  on both pets:', t);
}
const balances = await page.evaluate(() => window.__client.holdings(window.__chain.get().owner)).catch(() => null);
log('holdings', JSON.stringify(balances, (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
await shot('j1-shop');

// 3. each pet's page
for (const [href, who] of [[frokHref, 'frok'], [sahurHref, 'Sahur']]) {
  await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle0' });
  await waitFor(() => { const s = window.__chain?.get(); return s && s.loaded && document.querySelector('.petview'); }, 60000); await sleep(3000);
  const worn = await page.evaluate(() => { const s = window.__chain.get(); const c = window.__chain.active(); return (s.worn[`${c.col}:${c.id}`] ?? []).slice().sort((a, b) => a - b); });
  check(JSON.stringify(worn) === '[8,9,10,11,12]', `${who}: all five on it on chain (${JSON.stringify(worn)})`);
  const look = await page.evaluate(() => {
    const shown = (sel) => { const e = document.querySelector(`.stage .pet ${sel}`); return !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
    return { kippah: shown('#kippah'), payot: shown('#payot'), star: shown('#davidstar'), scene: document.querySelector('.stage')?.getAttribute('data-scene'),
      buttons: [...document.querySelectorAll('.outfit-btn')].map((b) => b.textContent.trim()), kapparot: [...document.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith('Kapparot')) };
  });
  log(`${who} page:`, JSON.stringify(look));
  check(look.kippah && look.payot && look.star, `${who}: the kippah, the payot and the star are drawn`);
  check(look.scene === 'kotel', `${who}: the room is the Western Wall`);
  check(['Kippah on', 'Star of David on', 'Dreidel on', 'Kapparot hen on'].every((b) => look.buttons.includes(b)) && look.buttons.includes('Western Wall theme on'), `${who}: a button for each of the five`);
  check(look.kapparot, `${who}: the Kapparot button is there`);
  await shot(`j2-${who}-page`);
  // Kapparot: the pet (on chain) and the hen in the room. The ACTION button (not the name row's "Kapparot hen on"
  // toggle), pressed once the pet is idle (every button is disabled while it wanders, as for Feed and the rest)
  const kapBtn = "[...document.querySelectorAll('.petview button')].find((b) => !b.classList.contains('outfit-btn') && /^Kapparot/.test(b.textContent.trim()))";
  await waitFor(new Function(`const b = ${kapBtn}; return !!b && !b.disabled && !window.__pet?.director?.isBusy;`), 30000);
  const before = sent.length;
  await page.evaluate(new Function(`${kapBtn}?.click();`));
  await sleep(2500);
  check(await page.evaluate(() => !!document.querySelector('.stage .prop-hen')), `${who}: pressing Kapparot brings the hen into the room`);
  await shot(`j3-${who}-kapparot`);
  await waitFor(() => !window.__pet?.director?.isBusy, 30000).catch(() => {}); await sleep(2500);
  check(sent.length > before, `${who}: and sends a pet on chain (${sent.slice(before).join(',')})`);
  await waitFor(() => !window.__chain.get().pending, 60000).catch(() => {}); await sleep(1500);
  // Play: the dreidel, after the play transaction
  await waitFor(() => { const b = [...document.querySelectorAll('.petview button')].find((x) => x.textContent.trim().startsWith('Play')); return !!b && !b.disabled && !window.__pet?.director?.isBusy; }, 30000);
  const b2 = sent.length;
  await page.$$eval('button', (bs) => bs.find((b) => b.textContent.trim().startsWith('Play'))?.click());
  await waitFor(() => !!document.querySelector('.stage .prop-dreidel'), 120000).catch(() => {});
  check(await page.evaluate(() => !!document.querySelector('.stage .prop-dreidel')), `${who}: Play brings out the dreidel (${sent.slice(b2).join(',')})`);
  await shot(`j4-${who}-dreidel`);
  await waitFor(() => !window.__pet?.director?.isBusy && !window.__chain.get().pending, 60000).catch(() => {}); await sleep(2000);
}

// 4. take the kippah off the Sahur on his page: gone from the chain's list and from the drawing, the star stays
await waitFor(() => { const b = [...document.querySelectorAll('.outfit-btn')].find((x) => x.textContent.trim() === 'Kippah on'); return !!b && !b.disabled; }, 30000);
await page.$$eval('.outfit-btn', (bs) => bs.find((b) => b.textContent.trim() === 'Kippah on')?.click());
await sleep(1500); await waitFor(() => !window.__chain.get().pending, 180000); await sleep(3000);
const after = await page.evaluate(() => {
  const s = window.__chain.get(); const c = window.__chain.active();
  const shown = (sel) => { const e = document.querySelector(`.stage .pet ${sel}`); return !!e && getComputedStyle(e).display !== 'none'; };
  return { worn: (s.worn[`${c.col}:${c.id}`] ?? []).slice().sort((a, b) => a - b), kippah: shown('#kippah'), star: shown('#davidstar') };
});
log('after the kippah came off:', JSON.stringify(after));
check(JSON.stringify(after.worn) === '[9,10,11,12]' && !after.kippah && after.star, 'the kippah comes off by itself, the star stays');
await shot('j5-kippah-off');
log('errors:', errors.length ? errors : 'none');
check(errors.length === 0, 'no page errors');
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' / ')}` : 'ALL CHECKS PASSED');
await browser.close(); process.exit(fails.length ? 1 : 0);
