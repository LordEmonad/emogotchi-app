// Headless check of /claim on Monad testnet: the deployer key is decrypted in Node and injected as a
// wallet shim, so the page never sees a key. Runs the real claim transaction.
//   OUT=… node tools/claim-check.mjs
import puppeteer from 'puppeteer-core';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { execSync } from 'node:child_process';

const OUT = process.env.OUT ?? '.';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const ks = execSync('ls ~/.monskills/keystore | head -1').toString().trim();
const pk = execSync(`~/.foundry/bin/cast wallet decrypt-keystore --keystore-dir ~/.monskills/keystore ${ks} --unsafe-password "" | awk '{print $NF}'`).toString().trim();
const account = privateKeyToAccount(pk);
const wc = createWalletClient({ account, chain: monadTestnet, transport: http() });
const pc = createPublicClient({ chain: monadTestnet, transport: http() });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const errors = [];
let nonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' });

const open = async (addr) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.exposeFunction('__signAndSend', async (tx) => {
    const hash = await wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined, nonce: nonce++ });
    log('  tx', hash.slice(0, 14), 'gas limit', tx.gas ? BigInt(tx.gas).toString() : '-');
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
  }, addr);
  await page.goto(`${BASE}/claim`, { waitUntil: 'networkidle2', timeout: 60000 });
  return page;
};
const card = (p) => p.$eval('.claim-card', (e) => ({ status: e.dataset.status, text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 170) }));
const settle = async (p, want, ms = 45000) => { await p.waitForFunction((w) => document.querySelector('.claim-card')?.dataset.status === w, { timeout: ms }, want).catch(() => {}); return card(p); };

// 1. no wallet at all
const anon = await browser.newPage();
await anon.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 2 });
await anon.goto(`${BASE}/claim`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
log('anon:', JSON.stringify(await card(anon)));
await anon.screenshot({ path: `${OUT}/claim-1-anon.png`, fullPage: true });
// the showreel must actually be animating
const busy1 = await anon.evaluate(() => window.__pet?.director?.getState?.().busy ?? null);
await new Promise((r) => setTimeout(r, 6000));
const busy2 = await anon.evaluate(() => window.__pet?.director?.getState?.().busy ?? null);
log('showreel busy:', busy1, '→', busy2);
await anon.screenshot({ path: `${OUT}/claim-2-showreel.png`, fullPage: true });
await anon.close();

// 2. a wallet that is NOT on the list
const off = await open('0x1111111111111111111111111111111111111111');
await off.evaluate(() => document.querySelector('.claim-card .btn')?.click());
log('not listed:', JSON.stringify(await settle(off, 'not-listed')));
await off.screenshot({ path: `${OUT}/claim-3-notlisted.png` });
await off.close();

// 3. the holding wallet: on the list, has not claimed → the hashed proof lookup must find its proof
const other = await open('0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74');
log('on the list:', JSON.stringify(await settle(other, 'open')));
await other.screenshot({ path: `${OUT}/claim-4-onlist.png` });
await other.close();

// 4. the deployer: already claimed on this drop, so it must say so and the cat must purr
const me = await open(account.address);
await me.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 2 });
log('claimed wallet:', JSON.stringify(await settle(me, 'claimed')));
await new Promise((r) => setTimeout(r, 5000));
await me.screenshot({ path: `${OUT}/claim-7-celebrate.png`, fullPage: true });
const hearts = await me.evaluate(() => document.querySelectorAll('.prop-heart').length);
log('hearts on stage:', hearts);
await me.close();

log('console errors:', errors.length ? '\n  ' + [...new Set(errors)].join('\n  ') : 'none');
await browser.close();
