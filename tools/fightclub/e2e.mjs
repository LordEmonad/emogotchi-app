// Fight Club, end to end, through the page with real clicks (SANDBOX): starts the local world (local.mjs: the fork,
// Fight Club + MockEntropy, the keeper, the faucet, the bot, the site), then a throwaway wallet injected into a real
// Chrome connects, gets test MON and pets from the faucet, takes the bot's challenge and watches the fight to its
// verdict, puts up its own challenge that the bot takes, and checks every result against the contract.
//
//   OUT=<dir for screenshots> node tools/fightclub/e2e.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, formatEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.OUT ?? '/tmp/fightclub-e2e'; mkdirSync(OUT, { recursive: true });
const RPC = 'http://127.0.0.1:8560', SITE = 'http://localhost:5261';
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);
const fails = [];
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) fails.push(what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 60_000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await sleep(400); } throw new Error(`timed out: ${what}`); }

// the world
const world = spawn('node', [join(ROOT, 'tools/fightclub/local.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
let worldLog = ''; let FIGHT = null;
world.stdout.on('data', (d) => { worldLog += d; const m = /FightClub\s+(0x[0-9a-fA-F]{40})/.exec(worldLog); if (m) FIGHT = m[1]; });
world.stderr.on('data', (d) => { worldLog += d; });
process.on('exit', () => { try { world.kill('SIGINT'); } catch { /* gone */ } });
await until(() => worldLog.includes('Fight Club, locally'), 'the local world', 300_000).catch((e) => { console.log(worldLog.slice(-3000)); throw e; });
log('world up; FightClub', FIGHT);

const chain = defineChain({ id: 143, name: 'fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const FC = parseAbi(['function fightCountOf(address) view returns (uint256)', 'function teamOwed() view returns (uint128)', 'function fightsOf(address who, uint256 from, uint256 count) view returns ((uint256 id, uint8 status, address challenger, address challengerCollection, uint256 challengerPet, address opponent, uint256 stake, uint256 createdAt, uint256 expiresAt, address acceptor, address acceptorCollection, uint256 acceptorPet, uint256 acceptedAt, uint256 abortableAt, address provider, uint64 sequence, bytes32 random, uint256 foughtAt, address winner, uint256 payout)[])']);

// a player: a fresh key, injected as a browser wallet
const acct = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) });
log('player', acct.address);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.stack ?? e).slice(0, 600)));
page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|Failed to load resource|favicon|api\/social|api\/stats|api\/cats/.test(m.text())) errors.push(m.text().slice(0, 600)); });
await page.exposeFunction('__send', async (tx) => wallet.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined }));
await page.evaluateOnNewDocument((addr, rpcUrl) => {
  const rpc = async (method, params) => { const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code }); return j.result; };
  window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
    if (method === 'eth_chainId') return '0x8f';
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_revokePermissions') return null;
    if (method === 'eth_sendTransaction') return window.__send(params[0]);
    return rpc(method, params ?? []);
  } };
}, acct.address, RPC);
const clickText = async (sel, text, ms = 30_000) => { const h = await until(async () => { for (const el of await page.$$(sel)) { const t = await el.evaluate((e) => e.textContent ?? ''); if (t.includes(text) && await el.isVisible() && !(await el.evaluate((e) => e.disabled))) return el; } return null; }, `${sel} "${text}"`, ms); await h.click(); };
const text = (sel) => page.$eval(sel, (e) => e.textContent ?? '').catch(() => '');

try {
  await page.goto(`${SITE}/fightclub`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.fcp-hero', { timeout: 60_000 });
  check(true, 'the Fight Club page loads on the local world');
  await page.screenshot({ path: join(OUT, '01-page.png') });
  await clickText('.fcp-connect .btn', 'Connect');
  await clickText('.wallet-opt', 'Browser wallet');
  await page.waitForSelector('.fcp-faucet', { timeout: 30_000 });
  check(true, 'connected with a browser wallet; the local faucet is offered');
  await clickText('.fcp-faucet .btn', 'Get test MON and pets');
  await until(async () => (await text('.fcp-faucet small')).includes('10,000 MON'), 'the faucet', 60_000);
  const bal = await pub.getBalance({ address: acct.address });
  check(bal >= 9_000n * 10n ** 18n, `the faucet funded the player (${formatEther(bal)} MON) and gave pets (${await text('.fcp-faucet small')})`);
  await until(async () => (await page.$$('.fcp-form .fcp-pick-pet')).length >= 2, 'the player\'s pets in the form', 60_000);
  check(true, 'the player\'s new pets show in the challenge form');

  // the town, in a second tab, watching the arena: every fight decided on chain plays on its ring
  const town = await browser.newPage();
  await town.setViewport({ width: 1440, height: 900 });
  town.on('pageerror', (e) => errors.push(`town: ${String(e).slice(0, 400)}`));
  // (bench=12: a small synthetic town, so the fork is not asked for two hundred pets while the fight is on)
  await town.goto(`${SITE}/emotown?at=arena&bench=12`, { waitUntil: 'domcontentloaded' });
  await town.waitForSelector('.tb-arena', { timeout: 90_000 });
  await sleep(6000);
  await page.bringToFront();

  // 1) take the bot's challenge and watch the fight
  await until(async () => (await page.$$('.fcp-card')).length > 0, 'the bot\'s challenge', 60_000);
  check(true, 'the bot\'s open challenge is listed');
  await page.screenshot({ path: join(OUT, '02-open.png') });
  await clickText('.fcp-card .btn', 'Fight them');
  await page.waitForSelector('.fcp-card .fcp-pick-pet', { timeout: 10_000 });
  await (await page.$('.fcp-card .fcp-pick-pet')).click();
  await page.waitForSelector('.fcp-watch', { timeout: 60_000 });
  check(true, 'taking the fight opens the ring');
  await sleep(2500); await page.screenshot({ path: join(OUT, '03-countdown.png') });
  await until(async () => (await text('.fcp-verdict h3')).includes('wins'), 'the verdict', 90_000);
  const verdict1 = await text('.fcp-verdict h3');
  await page.screenshot({ path: join(OUT, '04-verdict.png') });
  const mine = await pub.readContract({ address: FIGHT, abi: FC, functionName: 'fightsOf', args: [acct.address, 0n, 1n] });
  const f1 = mine[0];
  const iWon = f1.winner.toLowerCase() === acct.address.toLowerCase();
  check(f1.status === 4, `the fight is decided on chain (status ${f1.status}, winner ${iWon ? 'the player' : 'the bot'}, random ${f1.random.slice(0, 10)}…)`);
  check((BigInt(f1.random) % 2n === 0n) === (f1.winner.toLowerCase() === f1.challenger.toLowerCase()), 'the winner is the random number\'s: even, the challenger (the bot here)');
  check(verdict1.includes(`${formatEther(f1.payout).replace(/\.?0+$/, '')} MON`) || verdict1.includes(Number(formatEther(f1.payout)).toString()), `the page names the payout (${verdict1})`);
  check(f1.payout === (f1.stake * 2n * 95n) / 100n, `the payout is the pot less 5% (${formatEther(f1.payout)} of ${formatEther(f1.stake * 2n)})`);
  await clickText('.fcp-verdict .btn', 'Done');
  await town.bringToFront();
  const bill = await until(async () => { const t = await town.$eval('.fc-town-bill', (e) => e.textContent).catch(() => ''); return t.includes('vs') ? t : null; }, 'the fight on the town\'s ring', 60_000).catch(() => null);
  check(!!bill && bill.includes('10 MON'), `the fight comes to Emotown's ring, billed (${bill})`);
  await sleep(3000); await town.screenshot({ path: join(OUT, '04b-town.png') });
  await page.bringToFront();

  // 2) put up a challenge; the bot takes it; the ring opens by itself when it is decided
  await clickText('.fcp-form .fcp-pick-pet', '');
  await clickText('.fcp-stakes .chip-btn', '50');
  await clickText('.fcp-go', 'Put up 50 MON');
  await until(async () => (await text('.fcp-mine')).includes('50 MON'), 'the challenge in Your fights', 60_000);
  check(true, 'the player\'s 50 MON challenge is up and in Your fights');
  await page.waitForSelector('.fcp-watch', { timeout: 90_000 });
  check(true, 'the bot takes it and, once Pyth\'s number lands, the ring opens by itself');
  await until(async () => (await text('.fcp-verdict h3')).includes('wins'), 'the second verdict', 90_000);
  await page.screenshot({ path: join(OUT, '05-verdict2.png') });
  const n = Number(await pub.readContract({ address: FIGHT, abi: FC, functionName: 'fightCountOf', args: [acct.address] }));
  const all = await pub.readContract({ address: FIGHT, abi: FC, functionName: 'fightsOf', args: [acct.address, 0n, BigInt(n)] });
  const f2 = all[all.length - 1];
  check(f2.challenger.toLowerCase() === acct.address.toLowerCase() && f2.status === 4 && f2.stake === 50n * 10n ** 18n, 'the second fight: the player challenged, 50 MON a side, decided');
  const team = await pub.readContract({ address: FIGHT, abi: FC, functionName: 'teamOwed' });
  check(team === (f1.stake * 2n + f2.stake * 2n) * 5n / 100n, `the team's 5% of both pots is owed (${formatEther(team)} MON)`);
  await clickText('.fcp-verdict .btn', 'Done');
  await page.screenshot({ path: join(OUT, '06-mine.png'), fullPage: true });
  check(errors.length === 0, `no page errors${errors.length ? `:\n${errors.slice(0, 5).join('\n')}` : ''}`);
} catch (e) {
  fails.push(String(e?.message ?? e));
  log('ERROR', e?.message ?? e);
  await page.screenshot({ path: join(OUT, 'error.png'), fullPage: true }).catch(() => {});
  console.log(worldLog.slice(-2500));
}
await browser.close();
log(fails.length ? `${fails.length} FAILED:\n - ${fails.join('\n - ')}` : 'ALL PASSED');
world.kill('SIGINT');
process.exit(fails.length ? 1 : 0);
