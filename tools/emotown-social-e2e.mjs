// Emotown's social layer, end to end, through the site's own pages and buttons (2026-09-26).
//
// Starts its own world: an ANVIL FORK of Monad mainnet (8549), the Worker under `wrangler dev --local` with a fresh D1
// and both Durable Objects (8796), and the site's dev server pointed at both (5231). Three throwaway wallets from
// `cast wallet new` (never anvil's default accounts): alice, bob, and an admin (the Worker's ADMINS for this run only).
// Each is its own browser context with an injected wallet that signs with its key. Then, with real clicks:
//
//   sign in · gated out with no pet · mint a frok on /mint and name him on his page · check again · post · the bubble
//   over his pet in town · a second person · follow the owner from the chat · notifications · profile edit · DMs both
//   ways · a mention · an inert link and its warning · report · block · the admin deletes and mutes · roles, given from
//   the square and shown live · XSS and injection
//   in every text field · a phone-width pass.
//
//   OUT=<dir for screenshots> node tools/emotown-social-e2e.mjs
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, createWriteStream, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT ?? join(ROOT, 'tools/shots/e2e'); mkdirSync(OUT, { recursive: true });
const FOUNDRY = join(homedir(), '.foundry/bin');
const RPC_PORT = 8549, W_PORT = 8796, SITE_PORT = 5231, KLIPY_PORT = 8793;
const RPC = `http://127.0.0.1:${RPC_PORT}`, SITE = `http://localhost:${SITE_PORT}`, API = `http://127.0.0.1:${W_PORT}`;
// uploaded pictures: on `localhost` so they are same-site with the page, as emotown-media.emonad.lol is with the site
// (the pictures carry Cross-Origin-Resource-Policy: same-site; 127.0.0.1 would be another site and they would not load)
const MEDIA = `http://localhost:${W_PORT}/__media`;
const INVERSE = '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6';
const SAHUR = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';
const ITEMS = '0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91';
const OWNS = parseAbi(['function ownerOf(uint256) view returns (address)', 'function balanceOf(address, uint256) view returns (uint256)']);
const GAME = parseAbi(['function mint() returns (uint256)', 'function setName(uint256 id, string newName) payable', 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)']);
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);
const fails = [];
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) fails.push(what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rpc = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
async function until(fn, what, ms = 60_000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await sleep(400); } throw new Error(`timed out: ${what}`); }

// ------------------------------------------------------------------ the world
const newKey = () => JSON.parse(execFileSync(join(FOUNDRY, 'cast'), ['wallet', 'new', '--json']).toString())[0].private_key;
const keys = { alice: newKey(), bob: newKey(), boss: newKey() };
const acct = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, privateKeyToAccount(v)]));
const procs = [];
const dir = mkdtempSync(join(tmpdir(), 'emotown-e2e-'));
const stop = () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } try { rmSync(dir, { recursive: true, force: true }); } catch { /* fine */ } };
process.on('exit', stop);

log('wallets', Object.fromEntries(Object.entries(acct).map(([k, a]) => [k, a.address])));
procs.push(spawn(join(FOUNDRY, 'anvil'), ['--fork-url', 'https://rpc.monad.xyz', '--chain-id', '143', '--port', String(RPC_PORT), '--silent', '--code-size-limit', '131072'], { stdio: 'ignore' }));
await until(() => rpc('eth_blockNumber'), 'anvil');
for (const a of Object.values(acct)) await rpc('anvil_setBalance', [a.address, '0x3635C9ADC5DEA00000']);
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-social', '--local', '--persist-to', dir], { cwd: join(ROOT, 'worker'), stdio: 'ignore' });
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-media', '--local', '--persist-to', dir], { cwd: join(ROOT, 'worker'), stdio: 'ignore' });
// A stand-in for KLIPY's search (Tenor-style v2): canned GIFs on static.klipy.com, whose pictures every page below
// is served locally (request interception), so the GIFs really draw in the screenshots
const klipyCalls = [];
const klipyStub = createServer((req, res) => {
  klipyCalls.push(req.url);
  const q = new URL(req.url, 'http://x').searchParams.get('q') ?? 'featured';
  const slug = q.replace(/\W/g, '').slice(0, 20) || 'x';
  const item = (i, w, h) => ({ id: `${slug}${i}`, content_description: `${q} ${i}`, media_formats: { tinygif: { url: `https://static.klipy.com/ii/${slug}${i}/tiny.gif`, dims: [w, h] }, tinygifpreview: { url: `https://static.klipy.com/ii/${slug}${i}/tiny.jpg`, dims: [w, h] } } });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ results: [item(1, 220, 124), item(2, 220, 220), item(3, 220, 160), item(4, 180, 220), item(5, 220, 140), item(6, 220, 200)], next: '6' }));
});
await new Promise((r) => klipyStub.listen(KLIPY_PORT, '127.0.0.1', r));
procs.push({ kill: () => klipyStub.close() });
const AV = readdirSync(join(ROOT, 'apps/web/public/social/av')).filter((f) => f.endsWith('.webp')).slice(0, 12).map((f) => readFileSync(join(ROOT, 'apps/web/public/social/av', f)));
const wlog = createWriteStream(join(OUT, 'worker.log'));
const w = spawn('npx', ['wrangler', 'dev', '--local', '--persist-to', dir, '--port', String(W_PORT), '--ip', '127.0.0.1', '--var', `SITE_ORIGIN:${SITE}`, '--var', `SIWE_DOMAIN:localhost:${SITE_PORT}`, '--var', `RPC_URL:${RPC}`, '--var', `ADMINS:${acct.boss.address.toLowerCase()}`,
  // uploaded pictures: served under /__media/ in dev (MEDIA_DEV; wrangler dev rewrites every host to the site's), and a
  // screen that passes everything (the real vision model is remote-only; worker/test/integration.test.mjs runs it)
  '--var', 'MEDIA_DEV:1', '--var', 'SITE_DIRECT:1', '--var', 'PIC_SCREEN:pass', '--var', 'KLIPY_KEY:e2e-key', '--var', `KLIPY_BASE:http://127.0.0.1:${KLIPY_PORT}/v2`], { cwd: join(ROOT, 'worker') });
w.stdout.pipe(wlog); w.stderr.pipe(wlog); procs.push(w);
const vite = spawn('npx', ['vite', '--port', String(SITE_PORT), '--strictPort'], { cwd: join(ROOT, 'apps/web'), env: { ...process.env, VITE_RPC_URL: RPC, VITE_SOCIAL_API: API, VITE_PASSKEY: 'on', VITE_MEDIA_ORIGIN: MEDIA }, stdio: 'ignore' });
procs.push(vite);
await until(async () => (await fetch(`${API}/api/social/me`)).ok, 'the Worker', 120_000);
await until(async () => (await fetch(`${SITE}/emotown`)).ok, 'the site', 120_000);
log('world up');

// ------------------------------------------------------------------ people
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const dialogs = [];
const people = [];
async function person(name, { width = 1440, height = 900, phone = false } = {}) {
  const account = acct[name];
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${page.url()} ${String(e?.stack ?? e).slice(0, 1200)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|Failed to load resource|favicon/.test(m.text())) errors.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${page.url()} ${m.text().slice(0, 1500)}`); });
  page.on('dialog', async (d) => { dialogs.push({ who: name, type: d.type(), text: d.message() }); if (name === 'boss' && d.type() === 'confirm') await d.accept(); else await d.dismiss(); });
  // KLIPY's CDN, served locally: a pet head per GIF id (the stub's URLs do not exist on the real static.klipy.com)
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('https://static.klipy.com/')) { void r.continue().catch(() => {}); return; }
    let h = 0; for (const c of u) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    void r.respond({ status: 200, contentType: 'image/webp', body: AV[h % AV.length] }).catch(() => {});
  });
  await page.exposeFunction('__sign', (hex) => account.signMessage({ message: { raw: hex } }));
  await page.exposeFunction('__send', async (tx) => {
    const hash = await wallet.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined });
    return hash;
  });
  await page.evaluateOnNewDocument(() => {
    // every console.error with its arguments (React puts the component stack in them), for the report on failure
    window.__errs = [];
    const oe = console.error;
    console.error = function (...a) { try { window.__errs.push(`${new Date().toISOString().slice(11, 23)} ${a.map((x) => (typeof x === 'string' ? x : x?.stack ?? String(x))).join(' || ').slice(0, 4000)}`); } catch { /* never */ } return oe.apply(this, a); };
  });
  await page.evaluateOnNewDocument((addr, rpcUrl) => {
    const rpc = async (method, params) => { const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code }); return j.result; };
    window.ethereum = { isMetaMask: true, on() {}, removeListener() {},
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
        if (method === 'eth_chainId') return '0x8f';
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_revokePermissions') return null;
        if (method === 'personal_sign') return window.__sign(params[0]);
        if (method === 'eth_sendTransaction') return window.__send(params[0]);
        return rpc(method, params ?? []);
      } };
  }, account.address, RPC);
  const p = { name, page, ctx, errors, address: account.address.toLowerCase(), account };
  people.push(p);
  p.shot = (n) => page.screenshot({ path: join(OUT, `${n}.png`) });
  p.text = (sel) => page.$eval(sel, (e) => e.textContent ?? '').catch(() => '');
  p.has = (sel) => page.$(sel).then(Boolean);
  p.wait = (sel, ms = 30_000) => page.waitForSelector(sel, { timeout: ms, visible: true });
  p.clickText = async (sel, text, ms = 20_000) => {
    const h = await until(async () => { for (const el of await page.$$(sel)) { const t = await el.evaluate((e) => e.textContent ?? ''); const vis = await el.isVisible(); if (t.includes(text) && vis) return el; } return null; }, `${sel} "${text}"`, ms);
    await h.click();
  };
  p.type = async (sel, text) => { await p.wait(sel); await page.click(sel); await page.type(sel, text, { delay: 2 }); };
  p.api = (path) => page.evaluate(async (path) => { const r = await fetch('/api/social' + path, { credentials: 'same-origin' }); return r.json(); }, path);
  return p;
}
async function signIn(p) {
  await p.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await p.wait('.so-hud-signin', 60_000);
  await p.page.click('.so-hud-signin');
  await p.clickText('.wallet-opt', 'Browser wallet');
  await p.wait('.so-signin .btn-pink');
  await p.clickText('.so-signin .btn-pink', 'Sign in');
  await p.wait('.so-hud-me', 30_000);
}
async function post(p, text) {
  await p.wait('.so-compose textarea');
  await p.page.click('.so-compose textarea');
  await p.page.type('.so-compose textarea', text, { delay: 1 });
  await p.page.keyboard.press('Enter');
  // sent: the box empties (the Worker may have cleaned the text, so it is not matched verbatim); refused: an error shows
  await until(() => p.page.evaluate(() => document.querySelector('.so-compose textarea')?.value === '' || !!document.querySelector('.so-compose .so-err')), `"${text.slice(0, 30)}" posted`, 20_000);
  return p.text('.so-compose .so-err');
}
const mintAndNameOnChain = async (account, name) => {
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: INVERSE, abi: GAME, functionName: 'mint', gas: 400_000n }) });
  const id = Number(await pub.readContract({ address: INVERSE, abi: GAME, functionName: 'tokenOfOwnerByIndex', args: [account.address, 0n] }));
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: INVERSE, abi: GAME, functionName: 'setName', args: [BigInt(id), name], value: parseEther('10'), gas: 400_000n }) });
  return id;
};

try {
  // ================================================================== alice signs in and is gated out
  const alice = await person('alice');
  await signIn(alice);
  check((await alice.api('/me')).signedIn === true, 'alice is signed in (SIWE through her wallet, HttpOnly cookie)');
  const cookieVisible = await alice.page.evaluate(() => document.cookie.includes('emotown'));
  check(!cookieVisible, 'the session cookie is invisible to page script');
  await alice.wait('.so-chat');
  await alice.wait('.so-gate');
  check((await alice.text('.so-gate')).includes('hold a pet with a name'), 'with no pet, the composer explains the gate');
  check(await until(async () => (await alice.text('.so-gate')).includes('Adopt a free inversebrah'), 'the gate reading her pets', 60_000).catch(() => false), 'and, finding no pets, offers a free inversebrah');
  await alice.shot('01-alice-gated');

  // ================================================================== she mints a frok and names him, through the site
  await alice.page.goto(`${SITE}/mint`, { waitUntil: 'domcontentloaded' });
  // the wallet she signed in with is remembered by the site: the page may offer the mint straight away
  await until(() => alice.page.$('.mint-btn'), 'the mint button', 90_000);
  const ready = await until(() => alice.page.evaluate(() => /Mint inversebrah/.test(document.querySelector('.mint-btn')?.textContent ?? '')), 'the wallet restored', 8_000).catch(() => false);
  if (!ready) { await alice.clickText('.mint-btn', 'Connect and mint'); await alice.clickText('.wallet-opt', 'Browser wallet'); }
  await alice.clickText('.mint-btn', 'Mint inversebrah', 90_000);
  await until(() => alice.page.evaluate(() => /yours/.test(document.querySelector('.mint-btn')?.textContent ?? '')), 'the mint', 120_000);
  const petPath = await alice.page.$eval('.mint-btn', (e) => e.getAttribute('href'));
  const aliceFrok = Number(/\/(\d+)$/.exec(petPath)?.[1]);
  check(aliceFrok > 0, `minted inversebrah #${aliceFrok} on the fork through /mint`);
  await alice.page.goto(`${SITE}${petPath}?name=1`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.name-input', 90_000);
  await alice.page.type('.name-input', 'Froggy', { delay: 5 });
  await alice.page.click('.name-ok');
  await until(() => alice.page.evaluate(() => document.querySelector('.name-btn')?.textContent?.includes('Froggy')), 'the name on chain', 120_000);
  check(true, 'named him Froggy on his page (?name=1 opened the field; 10 MON on the fork)');

  // ================================================================== back in town: check again, talk, a bubble over Froggy
  await alice.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  // the page re-reads the gate as it loads (a "no" is kept only twenty seconds); if it still says no, "check again"
  const which = await until(() => alice.page.evaluate(() => (document.querySelector('.so-compose textarea') ? 'composer' : document.querySelector('.so-gate .so-textbtn') ? 'gate' : null)), 'the composer or the gate', 60_000);
  if (which === 'gate') { await alice.page.click('.so-gate .so-textbtn'); await alice.wait('.so-compose textarea', 30_000); }
  check(true, `with Froggy named, the composer opens (${which === 'gate' ? 'after "I named one: check again"' : 'on the gate re-read as the page loaded'})`);
  const hello = 'Hello Emotown! Froggy says hi';
  check(!(await post(alice, hello)), 'alice posts in the square');
  const key = `frok:${aliceFrok}`;
  const bubble = await until(() => alice.page.evaluate((key, t) => { const b = document.querySelector(`.so-bubble[data-key="${key}"]`); return b && b.textContent.includes(t) ? b.textContent : null; }, key, hello), 'the bubble', 15_000).catch(() => null);
  check(!!bubble, `a speech bubble with her words appears over ${key}`);
  const resident = await alice.page.evaluate((key) => { const r = window.__town?.sim.residents.get(key); return r ? { inside: r.inside, visitor: !!r.visitor } : null; }, key);
  check(!!resident && resident.inside === null, `Froggy is out on the street (${JSON.stringify(resident)})`);
  await alice.clickText('.so-msg-find', '⌖').catch(() => {});
  await sleep(1500);
  await alice.shot('02-alice-bubble');
  const bubbleBox = await alice.page.$eval(`.so-bubble[data-key="${key}"] .so-bubble-in`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; }).catch(() => null);
  check(!!bubbleBox && bubbleBox.x >= 0 && bubbleBox.x + bubbleBox.w <= bubbleBox.vw && bubbleBox.y >= 0, `the bubble is on screen after "find their pet" (${JSON.stringify(bubbleBox)})`);

  // ================================================================== bob arrives (his frok minted and named directly), talks
  const bob = await person('bob');
  const bobFrok = await mintAndNameOnChain(acct.bob, 'Bobbins');
  await signIn(bob);
  await bob.wait('.so-compose textarea', 60_000);
  check(true, 'bob, holding a named pet, gets the composer straight away');
  check(!(await post(bob, 'hi everyone, bob here')), 'bob posts');
  await until(() => alice.page.evaluate(() => [...document.querySelectorAll('.so-msg-text')].some((e) => e.textContent === 'hi everyone, bob here')), 'alice sees bob live', 15_000);
  check(true, 'alice sees bob\'s message live, over the socket');
  const bobBubble = await until(() => alice.page.evaluate((k) => !!document.querySelector(`.so-bubble[data-key="${k}"]`), `frok:${bobFrok}`), 'bob bubble', 10_000).catch(() => false);
  check(bobBubble, 'and a bubble over bob\'s pet (a visitor, walked in because he is here)');

  // ================================================================== alice claims a name and edits her profile (with XSS attempts)
  const XSS_BIO = 'hi <img src=x onerror="window.__xss=1"> "><svg onload=window.__xss=1> <script>window.__xss=1</script>';
  await alice.page.goto(`${SITE}/u/${alice.address}?edit=1`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-editor', 60_000);
  await alice.page.type('.so-prefix input', '<b>alice</b>');
  check((await alice.text('.so-editor .so-field .so-err')).includes('letters, numbers'), 'an HTML name is refused before saving');
  // cleared the way React hears it (a triple-click select now and then left part of the old name behind)
  await alice.page.$eval('.so-prefix input', (el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await alice.page.type('.so-prefix input', 'alice_e2e');
  await alice.page.type('.so-editor textarea', XSS_BIO);
  const socials = await alice.page.$$('.so-social-row input');
  await socials[0].type('https://x.com/alice_e2e');
  await socials[5].type('javascript:window.__xss=1');
  check((await alice.page.evaluate(() => [...document.querySelectorAll('.so-social-row')].at(-1)?.textContent ?? '')).includes('https://'), 'a javascript: website is refused before saving');
  await socials[5].click({ clickCount: 3 }); await alice.page.keyboard.press('Backspace');
  await socials[5].type('example.com/alice?utm=1');
  await alice.page.click('.so-pick-banners button[title="Emo Diner"]');
  await alice.page.click(`.so-pick-pets button[title="Froggy"]`).catch(async () => { const bs = await alice.page.$$('.so-pick-pets button'); await bs[1]?.click(); });
  // the Save button by its label (a bare selector click now and then landed while the sheet settled, and no save left
  // the page), and once more if the sheet is still open a few seconds later
  await alice.clickText('.so-editor .btn-pink', 'Save');
  if (!(await until(() => alice.page.evaluate(() => !document.querySelector('.so-editor')), 'the editor closing', 6_000).catch(() => false))) await alice.clickText('.so-editor .btn-pink', 'Save').catch(() => {});
  await until(() => alice.page.evaluate(() => !document.querySelector('.so-editor') && document.querySelector('.so-hero-id h1')?.textContent === 'alice_e2e'), 'the saved profile', 30_000).catch(async (e) => {
    // what the editor says, for the report (a save that never left the page)
    log('editor state:', JSON.stringify(await alice.page.evaluate(() => ({ inputs: [...document.querySelectorAll('.so-editor input, .so-editor textarea')].map((i) => i.value).slice(0, 4), errs: [...document.querySelectorAll('.so-editor .so-err, .so-editor [role=alert]')].map((x) => x.textContent), save: document.querySelector('.so-editor .btn-pink')?.outerHTML.slice(0, 200) }))));
    throw e;
  });
  check(true, 'profile saved: name alice_e2e');
  check(alice.page.url().endsWith('/u/alice_e2e'), `the address bar moved to the vanity URL (${alice.page.url()})`);
  const bio = await alice.text('.so-bio');
  check(bio.includes('<img src=x onerror="window.__xss=1">') && bio.includes('<script>'), 'the bio shows the HTML as text');
  const socialLabels = await alice.page.$$eval('.so-social', (els) => els.map((e) => e.textContent));
  check(socialLabels.some((t) => t.includes('@alice_e2e')) && socialLabels.some((t) => t.includes('example.com/alice')), `socials normalized (${socialLabels.join(' | ')})`);
  check(await alice.has('.so-unverified'), 'socials are marked unverified');
  await alice.shot('03-alice-profile');

  // ================================================================== bob follows the owner, from the chat
  await bob.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await bob.wait('.so-msg-name', 60_000);
  await bob.clickText('.so-msg-name', 'alice_e2e');
  await bob.wait('.so-owner');
  await bob.clickText('.so-owner .so-btn', 'Follow');
  await until(() => bob.page.evaluate(() => [...document.querySelectorAll('.so-owner .so-btn')].some((b) => b.textContent === 'Following')), 'following', 10_000);
  check(true, 'bob follows alice from her card in town (the owner, not the pet)');
  await bob.shot('04-bob-owner-card');
  // the pet card: Watch, and Follow owner
  await bob.page.evaluate((key) => window.__town.pick(key), key);
  await bob.wait('.town-card');
  const petButtons = await bob.page.$$eval('.town-card .tc-btn', (els) => els.map((e) => e.textContent));
  check(petButtons.includes('Watch') && petButtons.some((t) => t.startsWith('Follow owner')), `the pet card says Watch and Follow owner (${petButtons.join(' | ')})`);
  await bob.clickText('.town-card .tc-btn', 'Follow owner');
  await bob.wait('.so-owner');
  // the card opens at once and fills in its name when the profile arrives: wait for the name, not just the card
  check(await until(() => bob.page.evaluate(() => document.querySelector('.so-owner h2')?.textContent === 'alice_e2e'), 'the owner card\'s name', 15_000).catch(() => false), 'Follow owner opens the owner\'s card');
  await bob.page.click('.so-owner .tc-close');

  // ================================================================== alice's bell
  await alice.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-hud-btn[title="Notifications"] .so-dot', 30_000);
  await alice.page.click('.so-hud-btn[title="Notifications"]');
  await alice.wait('.so-notes li');
  check((await alice.text('.so-notes')).includes('followed you'), 'alice is told bob followed her');
  await alice.shot('05-alice-notes');
  await alice.page.click('.so-notes .tc-close');

  // ================================================================== DMs, both ways, live
  await alice.page.goto(`${SITE}/u/${bob.address}`, { waitUntil: 'domcontentloaded' });
  await alice.clickText('.so-hero-acts .so-btn', 'Message', 60_000);
  await alice.wait('.so-drawer .so-compose textarea');
  await alice.page.type('.so-drawer .so-compose textarea', 'hi bob <b>bold</b> <img src=x onerror=window.__xss=1>');
  await alice.page.keyboard.press('Enter');
  await until(() => alice.page.evaluate(() => [...document.querySelectorAll('.so-dm-bubble')].some((e) => e.textContent.includes('hi bob'))), 'alice\'s dm', 15_000);
  check(true, 'alice messages bob (he follows her, so she may)');
  await bob.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await bob.wait('.so-hud-btn[title="Messages"] .so-dot', 30_000);
  check((await bob.text('.so-hud-btn[title="Messages"] .so-dot')) === '1', 'bob\'s envelope says 1 unread');
  await bob.page.click('.so-hud-btn[title="Messages"]');
  await bob.wait('.so-thread');
  await bob.page.click('.so-thread');
  await bob.wait('.so-dm-bubble');
  check((await bob.text('.so-dm-bubble')).includes('<b>bold</b> <img src=x onerror=window.__xss=1>'), 'bob reads it, HTML as text');
  await bob.page.type('.so-drawer .so-compose textarea', 'hey alice, got it');
  await bob.page.keyboard.press('Enter');
  await until(() => alice.page.evaluate(() => [...document.querySelectorAll('.so-dm-bubble')].some((e) => e.textContent.includes('got it'))), 'bob\'s reply live in alice\'s open thread', 15_000);
  check(true, 'bob replies and alice\'s open conversation gets it live');
  await alice.shot('06-alice-dm');
  await bob.page.click('.so-drawer .tc-close');

  // ================================================================== emoji, GIFs, likes, replies (2026-09-28)
  // bob is in town at the hall; alice goes there too, with the square open (it is, at 1440 wide)
  await alice.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-compose textarea', 60_000);
  await alice.wait('.so-compose .so-tool[aria-label="GIF"]', 30_000);
  check(true, 'the composer has an emoji button and, with a KLIPY key, a GIF button');
  // emoji: two from the picker, typed into the box, sent: an emoji-only message is shown big
  await alice.page.click('.so-compose .so-tool[aria-label="Emoji"]');
  await alice.wait('.so-emoji-grid button');
  const picked = await alice.page.$$eval('.so-emoji-grid button', (b) => b.slice(0, 2).map((e) => e.textContent));
  for (let i = 0; i < 2; i++) await (await alice.page.$$('.so-emoji-grid button'))[i].click();
  const boxVal = await alice.page.$eval('.so-compose textarea', (e) => e.value);
  check(boxVal === picked.join(''), `the picker types emoji into the box (${JSON.stringify(boxVal)})`);
  await alice.shot('06b-emoji-picker');
  await alice.page.keyboard.press('Escape');
  await alice.page.click('.so-compose textarea');
  await alice.page.keyboard.press('Enter');
  await until(() => alice.page.evaluate((t) => [...document.querySelectorAll('.so-msg-text.big')].some((e) => e.textContent === t), boxVal), 'the emoji message, big', 15_000);
  check(true, 'an emoji-only message is shown big');
  // GIFs: the picker (KLIPY's attribution), a search, pick one, words with it
  await sleep(1300);
  const calls0 = klipyCalls.length;
  await alice.page.click('.so-compose .so-tool[aria-label="GIF"]');
  await alice.wait('.so-gif-pick img');
  check((await alice.text('.so-klipy')) === 'Powered by KLIPY' && (await alice.page.$eval('.so-gifs .so-pick-search', (e) => e.placeholder)) === 'Search KLIPY', 'the GIF picker says Search KLIPY and Powered by KLIPY');
  await alice.page.type('.so-gifs .so-pick-search', 'party time');
  await until(() => alice.page.evaluate(() => document.querySelector('.so-gif-pick')?.title === 'party time 1'), 'search results', 15_000);
  check(klipyCalls.length - calls0 === 2, `one call for the featured page, one for the search, none per keystroke (${klipyCalls.length - calls0})`);
  await alice.shot('06c-gif-picker');
  await alice.page.click('.so-gif-pick');
  await alice.wait('.so-gifchip .so-gif img');
  await alice.page.type('.so-compose textarea', 'look at this');
  await alice.page.keyboard.press('Enter');
  const gifMsg = await until(() => alice.page.evaluate(() => { const el = [...document.querySelectorAll('.so-msg')].find((m) => m.querySelector('.so-gif img') && m.textContent.includes('look at this')); return el ? Number(el.dataset.id) : 0; }), 'the GIF message', 15_000);
  const gifImg = await alice.page.$eval(`.so-msg[data-id="${gifMsg}"] .so-gif img`, (i) => ({ src: i.src, w: i.naturalWidth, ref: i.referrerPolicy }));
  check(gifImg.src.startsWith('https://static.klipy.com/ii/partytime1/') && gifImg.w > 0 && gifImg.ref === 'no-referrer', `the GIF is drawn from KLIPY's CDN with no referrer (${JSON.stringify(gifImg)})`);
  // bob sees it live, and its still frame in the bubble over alice's pet
  await until(() => bob.page.evaluate((id) => !!document.querySelector(`.so-msg[data-id="${id}"] .so-gif img`), gifMsg), 'the GIF at bob', 15_000);
  const gifBubble = await until(() => bob.page.evaluate(() => document.querySelector('.so-bubble-gif')?.getAttribute('src')), 'the bubble\'s still', 15_000).catch(() => null);
  check(!!gifBubble && gifBubble.endsWith('/tiny.jpg'), `bob sees it live, and its still frame over alice's pet (${gifBubble})`);
  // bob reacts (the react button on hover, the quick row), alice sees the pill live; then he changes it to any emoji
  const JOY = String.fromCodePoint(0x1F602), HEART = String.fromCodePoint(0x2764, 0xFE0F);
  const pillsAt = (p, sel) => p.page.evaluate((sel) => [...document.querySelectorAll(`${sel} .so-rx-pill`)].map((b) => b.querySelector('.so-rx-e').textContent + b.querySelector('.so-rx-n').textContent + (b.classList.contains('mine') ? '*' : '')).join(' '), sel);
  await bob.page.hover(`.so-msg[data-id="${gifMsg}"]`);
  await bob.page.click(`.so-msg[data-id="${gifMsg}"] .so-acts .so-act.react`);
  await bob.wait(`.so-msg[data-id="${gifMsg}"] .so-reactbar`);
  check((await bob.page.$$eval(`.so-msg[data-id="${gifMsg}"] .so-reactbar-row button`, (b) => b.length)) === 8, 'the react button opens the quick row: seven emoji and "+"');
  await bob.shot('06d-bob-reactbar');
  await bob.page.click(`.so-msg[data-id="${gifMsg}"] .so-reactbar-row button[aria-label="React ${JOY}"]`);
  await until(async () => (await pillsAt(alice, `.so-msg[data-id="${gifMsg}"]`)) === `${JOY}1`, 'the reaction at alice', 15_000);
  check((await pillsAt(bob, `.so-msg[data-id="${gifMsg}"]`)) === `${JOY}1*`, `bob reacts ${JOY}: his pill is lit, alice sees it live`);
  await bob.page.hover(`.so-msg[data-id="${gifMsg}"]`);
  await bob.page.click(`.so-msg[data-id="${gifMsg}"] .so-acts .so-act.react`);
  await bob.page.click(`.so-msg[data-id="${gifMsg}"] .so-reactbar-row button.more`);
  await bob.wait(`.so-msg[data-id="${gifMsg}"] .so-reactbar.full .so-emoji-grid button`);
  const anyEmoji = await bob.page.$eval(`.so-msg[data-id="${gifMsg}"] .so-reactbar.full .so-emoji-grid button:nth-child(12)`, (b) => b.textContent);
  await bob.page.click(`.so-msg[data-id="${gifMsg}"] .so-reactbar.full .so-emoji-grid button:nth-child(12)`);
  await until(async () => (await pillsAt(alice, `.so-msg[data-id="${gifMsg}"]`)) === `${anyEmoji}1`, 'the changed reaction at alice', 15_000);
  check(true, `"+" opens every emoji; bob picks ${anyEmoji} and it replaces his ${JOY}, live`);
  // alice adds hers: two pills, hers lit on her side; a tap on bob's pill makes it hers too
  await alice.page.click(`.so-msg[data-id="${gifMsg}"] .so-rx-pill`);
  await until(async () => (await pillsAt(bob, `.so-msg[data-id="${gifMsg}"]`)) === `${anyEmoji}2*`, 'two of the same', 15_000);
  check((await pillsAt(alice, `.so-msg[data-id="${gifMsg}"]`)) === `${anyEmoji}2*`, 'a tap on a pill reacts with that emoji: 2, lit for each of them');
  await alice.page.click(`.so-msg[data-id="${gifMsg}"] .so-rx-pill`);
  await until(async () => (await pillsAt(bob, `.so-msg[data-id="${gifMsg}"]`)) === `${anyEmoji}1*`, 'hers taken back', 15_000);
  check(true, 'a tap on your own pill takes it back');
  await bob.shot('06d-bob-reacted');
  // bob replies to it: the reply bar, then a quote over his message; alice is told
  await sleep(1300);
  await bob.page.hover(`.so-msg[data-id="${gifMsg}"]`);
  await bob.page.click(`.so-msg[data-id="${gifMsg}"] .so-acts .so-act[aria-label="Reply"]`);
  await bob.wait('.so-replybar');
  check((await bob.text('.so-replybar')).includes('@alice_e2e'), 'Reply opens "Replying to @alice_e2e" over the box');
  await bob.page.type('.so-compose textarea', 'haha same');
  await bob.page.keyboard.press('Enter');
  const replyId = await until(() => bob.page.evaluate(() => { const el = [...document.querySelectorAll('.so-msg')].find((m) => m.querySelector('.so-rq') && m.textContent.includes('haha same')); return el ? Number(el.dataset.id) : 0; }), 'the reply', 15_000);
  const quote = await bob.text(`.so-msg[data-id="${replyId}"] .so-rq`);
  check(quote.includes('@alice_e2e') && quote.includes('look at this · GIF'), `the reply carries its quote (${quote})`);
  check(!(await bob.has('.so-replybar')), 'the reply bar goes once it is sent');
  await bob.page.click(`.so-msg[data-id="${replyId}"] .so-rq`);
  check(await until(() => bob.page.evaluate((id) => document.querySelector(`.so-msg[data-id="${id}"]`)?.classList.contains('so-flash'), gifMsg), 'the flash', 5000).catch(() => false), 'a tap on the quote goes to the original');
  await alice.page.click('.so-hud-btn[title="Notifications"]');
  await alice.wait('.so-notes li');
  const bell = await alice.text('.so-notes');
  check(bell.includes('replied to you in the square') && bell.includes('reacted') && bell.includes('to your message in the square'), 'alice is told of the reply and the reaction');
  await alice.page.click('.so-notes .tc-close');
  await bob.shot('06e-bob-reply');
  // alice deletes the original: bob's quote says so, live
  await alice.page.hover(`.so-msg[data-id="${gifMsg}"]`);
  await alice.page.click(`.so-msg[data-id="${gifMsg}"] .so-msg-more`);
  await alice.clickText('.so-menu button', 'Delete');
  await until(() => bob.page.evaluate((id) => document.querySelector(`.so-msg[data-id="${id}"] .so-rq.gone`)?.textContent === 'Replying to a deleted message', replyId), 'the quote gone', 15_000);
  check(true, 'the original deleted: the reply quotes nothing from it, live');
  // DMs: a GIF, a heart, a reply
  await alice.page.goto(`${SITE}/u/${bob.address}`, { waitUntil: 'domcontentloaded' });
  await alice.clickText('.so-hero-acts .so-btn', 'Message', 60_000);
  await alice.wait('.so-drawer .so-compose .so-tool[aria-label="GIF"]');
  await alice.page.click('.so-drawer .so-compose .so-tool[aria-label="GIF"]');
  await alice.wait('.so-drawer .so-gif-pick img');
  await (await alice.page.$$('.so-drawer .so-gif-pick'))[1].click();
  await alice.page.click('.so-drawer .so-compose .so-send');
  const dmGif = await until(() => alice.page.evaluate(() => { const els = [...document.querySelectorAll('.so-drawer .so-dm.mine')].filter((m) => m.querySelector('.so-gif img')); return els.length ? Number(els.at(-1).dataset.id) : 0; }), 'the GIF DM', 15_000);
  check(dmGif > 0, 'alice sends bob a GIF by DM');
  await bob.page.click('.so-hud-btn[title="Messages"]');
  await bob.wait('.so-thread');
  check((await bob.text('.so-thread-last')).includes('GIF'), 'the thread list says GIF for it');
  await bob.page.click('.so-thread');
  await bob.wait(`.so-dm[data-id="${dmGif}"] .so-gif img`);
  await bob.page.hover(`.so-dm[data-id="${dmGif}"]`);
  await bob.page.click(`.so-dm[data-id="${dmGif}"] .so-act.react`);
  await bob.page.click(`.so-dm[data-id="${dmGif}"] .so-reactbar-row button[aria-label="React ${HEART}"]`);
  await until(async () => (await pillsAt(alice, `.so-dm[data-id="${dmGif}"]`)) === `${HEART}1`, 'the DM reaction at alice', 15_000);
  check(true, `bob reacts ${HEART} to it; alice sees it live`);
  await bob.page.hover(`.so-dm[data-id="${dmGif}"]`);
  await bob.page.click(`.so-dm[data-id="${dmGif}"] .so-act[aria-label="Reply"]`);
  await bob.wait('.so-drawer .so-replybar');
  await bob.page.type('.so-drawer .so-compose textarea', 'this one is great');
  await bob.page.keyboard.press('Enter');
  await until(() => alice.page.evaluate(() => [...document.querySelectorAll('.so-drawer .so-dm')].some((m) => m.querySelector('.so-rq') && m.textContent.includes('this one is great'))), 'the DM reply at alice', 15_000);
  check(true, 'bob answers that DM; alice gets it with its quote, live');
  await alice.shot('06f-alice-dm-gif');
  await bob.page.click('.so-drawer .tc-close');
  await alice.page.click('.so-drawer .tc-close');

  // ================================================================== a mention with a link: inert, and a warning before it opens
  const MENTION = '@alice_e2e claim at https://evil.example/claim now';
  await sleep(1300);
  check(!(await post(bob, MENTION)), 'bob mentions alice with a link');
  await alice.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-msg-text .so-link', 60_000);
  const linkTag = await alice.page.$eval('.so-msg-text .so-link', (e) => e.tagName);
  check(linkTag === 'BUTTON', 'the link is a button, not an <a>');
  check(!(await alice.page.$('.so-chat a[href^="https://evil"]')), 'there is no live link to it anywhere');
  await alice.page.click('.so-msg-text .so-link');
  await alice.wait('.so-leave');
  check((await alice.text('.so-leave-url')) === 'https://evil.example/claim', 'the warning shows the whole address');
  check((await alice.text('.so-leave')).includes('Emotown does not check links'), 'and says links are not checked');
  await alice.shot('07-link-warning');
  await alice.page.click('.so-leave .modal-x');
  await alice.wait('.so-hud-btn[title="Notifications"] .so-dot', 20_000);
  await alice.page.click('.so-hud-btn[title="Notifications"]');
  await until(async () => (await alice.text('.so-notes')).includes('mentioned you'), 'the mention notification', 10_000);
  check(true, 'alice is told she was mentioned');
  await alice.page.click('.so-notes .tc-close');

  // ================================================================== report, then block
  await alice.page.evaluate(() => { const m = [...document.querySelectorAll('.so-msg')].filter((e) => e.textContent.includes('claim at')).at(-1); m?.querySelector('.so-msg-more')?.click(); });
  await alice.clickText('.so-menu button', 'Report');
  await alice.wait('.so-report');
  await alice.page.click('.so-report input[value="scam"]');
  await alice.page.type('.so-report textarea', 'phishing <script>window.__xss=1</script>');
  await alice.page.click('.so-report .btn-pink');
  await until(async () => (await alice.text('.so-report h2')) === 'Thank you', 'the report', 10_000);
  check(true, 'alice reports bob\'s message as a scam');
  await alice.page.click('.so-report .btn-pink');
  await alice.page.evaluate(() => { const m = [...document.querySelectorAll('.so-msg')].filter((e) => e.textContent.includes('bob here')).at(-1); m?.querySelector('.so-msg-more')?.click(); });
  await alice.clickText('.so-menu button', 'Block');
  await until(() => alice.page.evaluate(() => ![...document.querySelectorAll('.so-msg-text')].some((e) => e.textContent.includes('bob here'))), 'bob hidden', 10_000);
  check(true, 'alice blocks bob: his messages leave her square');
  // bob cannot message her any more
  const dmTry = await bob.page.evaluate(async (to) => { const r = await fetch('/api/social/dm/send', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, text: 'let me in' }) }); return r.status; }, alice.address);
  check(dmTry === 403, `and he can no longer DM her (${dmTry})`);

  // ================================================================== the admin: delete and mute from the reports
  const boss = await person('boss');
  await signIn(boss);
  await boss.page.click('.so-hud-me');
  await boss.clickText('.so-mepop button', 'Admin tools');
  await boss.wait('.so-admin .so-report-row', 20_000);
  check((await boss.text('.so-admin .so-report-row')).includes('claim at https://evil.example/claim'), 'the admin sees the report with a copy of the message');
  await boss.shot('08-admin-reports');
  await boss.clickText('.so-admin .so-btn', 'Delete message');
  await until(() => bob.page.evaluate(() => ![...document.querySelectorAll('.so-msg-text')].some((e) => e.textContent.includes('claim at'))), 'the deletion reaching bob', 15_000);
  check(true, 'the admin deletes it: gone from the square for everyone, live');
  await boss.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await boss.wait('.so-msg', 60_000);
  await boss.page.evaluate(() => { const m = [...document.querySelectorAll('.so-msg')].filter((e) => e.textContent.includes('bob here')).at(-1); m?.querySelector('.so-msg-more')?.click(); });
  await boss.clickText('.so-menu button', 'Mute 1 hour');
  await sleep(500);
  await bob.page.reload({ waitUntil: 'domcontentloaded' });
  await until(async () => (await bob.text('.so-compose')).includes('muted'), 'bob sees he is muted', 30_000);
  check(true, 'the admin mutes bob for an hour: his composer says so');
  const muted = await bob.page.evaluate(async () => (await fetch('/api/social/chat', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: 'square', text: 'still here?' }) })).status);
  check(muted === 403, `and the Worker refuses his posts (${muted})`);
  await bob.shot('09-bob-muted');

  // ================================================================== roles: the admin makes one, gives it from the square; it shows live
  await alice.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-msg', 60_000);
  await boss.page.click('.so-hud-me');
  await boss.clickText('.so-mepop button', 'Admin tools');
  await boss.clickText('.so-admin .so-tabs button', 'Roles');
  await boss.clickText('.so-admin .so-role-new', 'New role');
  await boss.wait('.so-role-pick .so-pick-search', 20_000);
  await boss.page.type('.so-role-pick .so-pick-search', 'frog', { delay: 2 });
  await boss.wait('.so-role-pick .so-emoji-grid button');
  const frogEmoji = await boss.page.$eval('.so-role-pick .so-emoji-grid button', (b) => b.textContent);
  await boss.page.click('.so-role-pick .so-emoji-grid button');
  await boss.type('.so-admin .so-role-form-row input', 'OG');
  await boss.page.click('.so-admin .so-role-swatch[aria-label="Gold"]');
  check((await boss.text('.so-admin .so-role-preview')).includes('OG'), `the new role's tag shows as it is made (${frogEmoji} OG, gold)`);
  await boss.shot('09b-admin-new-role');
  await boss.page.click('.so-admin .so-role-form button[type=submit]');
  await until(() => boss.page.evaluate(() => [...document.querySelectorAll('.so-admin .so-role-row .so-role')].some((e) => e.textContent.includes('OG'))), 'the role in the list', 15_000);
  check(true, 'Admin tools → Roles: the role is made and listed');
  await boss.page.click('.so-admin .tc-close');
  // bob (no admin) gets no Roles… in a message's menu
  const bobMore = () => bob.page.evaluate(() => { [...document.querySelectorAll('.so-msg')].filter((e) => !e.classList.contains('mine')).at(-1)?.querySelector('.so-msg-more')?.click(); });
  await bobMore();
  await bob.wait('.so-menu');
  check(!(await bob.text('.so-menu')).includes('Roles'), 'a person who is not an admin has no Roles… in a message menu');
  await bobMore();   // the same ⋯ closes it
  // the admin gives it to alice from her message in the square
  await boss.page.evaluate(() => { const m = [...document.querySelectorAll('.so-msg')].filter((e) => e.querySelector('.so-msg-name')?.textContent === 'alice_e2e').at(-1); m?.querySelector('.so-msg-more')?.click(); });
  await boss.clickText('.so-menu button', 'Roles…');
  await boss.wait('.so-role-sheet');
  check((await boss.text('.so-role-sheet h2')).includes('alice_e2e'), 'Roles… opens alice\'s roles');
  await boss.page.evaluate(() => { const l = [...document.querySelectorAll('.so-role-ticks label')].find((x) => x.textContent.includes('OG')); l?.querySelector('input')?.click(); });
  await until(() => boss.page.evaluate(() => [...document.querySelectorAll('.so-role-ticks label.on')].some((x) => x.textContent.includes('OG'))), 'the tick', 15_000);
  check(true, 'ticking OG gives it to her');
  // a second role, made in the sheet and given at once
  await boss.clickText('.so-role-sheet .so-role-new', 'New role');
  await boss.page.type('.so-role-sheet .so-pick-search', 'crown', { delay: 2 });
  await boss.wait('.so-role-sheet .so-emoji-grid button');
  const crownEmoji = await boss.page.$eval('.so-role-sheet .so-emoji-grid button', (b) => b.textContent);
  await boss.page.click('.so-role-sheet .so-emoji-grid button');
  await boss.type('.so-role-sheet .so-role-form-row input', 'Town regular');
  await boss.page.click('.so-role-sheet .so-role-swatch[aria-label="Violet"]');
  await boss.page.click('.so-role-sheet .so-role-form button[type=submit]');
  await until(() => boss.page.evaluate(() => [...document.querySelectorAll('.so-role-ticks label.on')].length === 2), 'both ticked', 15_000);
  check(true, '"New role" in the sheet makes the role and gives it to her in one go');
  await boss.shot('09c-admin-role-sheet');
  await boss.clickText('.so-role-sheet .btn-pink', 'Done');
  // everyone sees the emoji by her name, live (nobody reloads)
  const marks = (p) => until(() => p.page.evaluate(() => { const m = [...document.querySelectorAll('.so-msg')].find((e) => e.querySelector('.so-msg-name')?.textContent === 'alice_e2e'); return m?.querySelector('.so-rolemarks')?.textContent ?? null; }), 'the marks', 20_000).catch(() => null);
  for (const p of [alice, bob, boss]) {
    const got = await marks(p);
    check(got === `${frogEmoji}${crownEmoji}`, `${p.name} sees ${frogEmoji}${crownEmoji} by alice's name in the square, live (${got})`);
  }
  await alice.shot('09d-alice-role-marks');
  // her card in town and her profile carry the tags
  await bob.page.evaluate(() => { const m = [...document.querySelectorAll('.so-msg')].find((e) => e.querySelector('.so-msg-name')?.textContent === 'alice_e2e'); m?.querySelector('.so-msg-name')?.click(); });
  await bob.wait('.so-owner .tc-chips .so-role', 20_000);
  const cardTags = await bob.page.$$eval('.so-owner .tc-chips .so-role', (els) => els.map((e) => e.textContent));
  check(cardTags.join('|') === `${frogEmoji}OG|${crownEmoji}Town regular`, `her card in town shows both tags in order (${cardTags.join(' | ')})`);
  check((await bob.text('.so-owner-title h2 .so-rolemarks')) === `${frogEmoji}${crownEmoji}`, 'and the emoji by her name on it');
  await bob.shot('09e-bob-alice-card-roles');
  await bob.page.click('.so-owner .tc-close');
  await alice.page.goto(`${SITE}/u/alice_e2e`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-badges .so-role', 60_000);
  const profTags = await alice.page.$$eval('.so-badges .so-role', (els) => els.map((e) => e.textContent));
  check(profTags.join('|') === `${frogEmoji}OG|${crownEmoji}Town regular`, `her profile shows the tags (${profTags.join(' | ')})`);
  check((await alice.text('.so-hero-id h1 .so-rolemarks')) === `${frogEmoji}${crownEmoji}`, 'and the emoji by her name');
  check(!(await alice.has('.so-hero-acts .so-btn.icon')), 'her own profile has no ⋯ for her (she is not an admin)');
  await alice.shot('09f-alice-profile-roles');

  // ================================================================== uploaded pictures: crop, stage, save, show; review; approve
  // the pictures are drawn by the browser itself: a sunset, a wide street, a second face; plus a file that is not one
  const PICS = join(dir, 'pics'); mkdirSync(PICS, { recursive: true });
  const drawn = await alice.page.evaluate(() => {
    const draw = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c.toDataURL('image/png').split(',')[1]; };
    return {
      sunset: draw(800, 600, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b1a55'); gr.addColorStop(1, '#f07a5a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(w / 2, h * 0.62, 110, 0, 7); g.fill(); }),
      street: draw(1800, 700, (g, w, h) => { g.fillStyle = '#1c2340'; g.fillRect(0, 0, w, h); for (let i = 0; i < 14; i++) { g.fillStyle = `hsl(${i * 25},60%,55%)`; g.fillRect(i * 130, h - 160 - (i % 4) * 60, 110, 160 + (i % 4) * 60); } }),
      second: draw(600, 600, (g, w, h) => { g.fillStyle = '#123f33'; g.fillRect(0, 0, w, h); g.fillStyle = '#9be7c4'; g.beginPath(); g.arc(w / 2, h / 2, 200, 0, 7); g.fill(); }),
    };
  });
  for (const [n, b64] of Object.entries(drawn)) writeFileSync(join(PICS, `${n}.png`), Buffer.from(b64, 'base64'));
  writeFileSync(join(PICS, 'notapicture.png'), '<html><body><script>window.__xss=1</script></body></html>');
  const choose = async (p, file) => { const input = await p.page.waitForSelector('.so-crop input[type=file]', { timeout: 15_000 }); await input.uploadFile(join(PICS, file)); };
  const cropAndUse = async (p, file) => {
    await choose(p, file);
    await p.wait('.so-crop-frame.ready', 20_000);
    const fr = await (await p.page.$('.so-crop-frame')).boundingBox();
    await p.page.mouse.move(fr.x + fr.width / 2, fr.y + fr.height / 2); await p.page.mouse.down();
    await p.page.mouse.move(fr.x + fr.width / 2 + 30, fr.y + fr.height / 2 + 12, { steps: 6 }); await p.page.mouse.up();
    await p.page.$eval('.so-crop-zoom input', (el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '1.5'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    await p.clickText('.so-crop .btn-pink', 'Use this');
    await until(() => p.page.evaluate(() => !document.querySelector('.so-crop')), 'the cropper to close', 15_000);
  };

  await alice.page.goto(`${SITE}/u/alice_e2e?edit=1`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-editor', 60_000);
  await alice.clickText('.so-pick-pets button', 'Upload');
  await alice.wait('.so-crop');
  await choose(alice, 'notapicture.png');
  await until(async () => (await alice.text('.so-crop .modal-err')).includes('cannot open'), 'the refusal', 15_000);
  check(true, 'a file that is not a picture is refused in the cropper, kindly');
  await cropAndUse(alice, 'sunset.png');
  check(await alice.page.evaluate(() => [...document.querySelectorAll('.so-pick-pets button.on')].some((b) => b.textContent.includes('New'))), 'the cropped picture is staged in the editor (nothing sent yet)');
  await alice.clickText('.so-pick-banners button', 'Upload your own');
  await alice.wait('.so-crop-frame.banner');
  await alice.shot('15-alice-cropper-banner');
  await cropAndUse(alice, 'street.png');
  await alice.page.click('.so-editor .btn-pink');
  await until(() => alice.page.evaluate(() => !document.querySelector('.so-editor') && !!document.querySelector('.so-hero-img')), 'the saved pictures', 60_000);
  const hero = await until(() => alice.page.$eval('.so-hero-img', (i) => (i.complete && i.naturalWidth ? { src: i.src, w: i.naturalWidth, ok: i.complete } : null)).catch(() => null), 'her picture loaded', 20_000);
  check(hero.src.startsWith(`${MEDIA}/p/`) && hero.w === 512, `her picture is up, 512 across, from the media host (${hero.src.slice(0, 60)}…)`);
  const bg = await alice.page.$eval('.so-banner', (e) => e.style.backgroundImage);
  check(bg.includes('/__media/p/'), 'her banner is up too, over Emotown\'s');
  await alice.shot('16-alice-pictures');
  await boss.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await boss.wait('.so-msg', 60_000);
  const inChat = await until(() => boss.page.evaluate((a) => [...document.querySelectorAll('.so-msg')].some((m) => m.querySelector('.so-msg-name')?.textContent === 'alice_e2e' && m.querySelector('.so-msg-av img')?.src.includes('/__media/p/')), alice.address), 'alice\'s picture in the square', 30_000).catch(() => false);
  check(!!inChat, 'in the square, her messages carry her picture');

  // the admin switches to "I approve each one": her next picture waits, and she is told when it is approved
  await boss.page.click('.so-hud-me');
  await boss.clickText('.so-mepop button', 'Admin tools');
  await boss.clickText('.so-admin .so-tabs button', 'Pictures');
  await boss.clickText('.so-admin-modes label', 'I approve each one');
  await until(() => boss.page.evaluate(() => document.querySelector('.so-admin-modes label.on')?.textContent.includes('I approve each one')), 'review mode', 15_000);
  check(true, 'the admin switches pictures to "I approve each one"');
  await alice.page.goto(`${SITE}/u/alice_e2e?edit=1`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-editor', 60_000);
  await alice.clickText('.so-pick-pets button', 'Upload');
  await cropAndUse(alice, 'second.png');
  await alice.page.click('.so-editor .btn-pink');
  await until(async () => (await alice.text('.so-hero .so-note')).includes('waiting for a quick check'), 'the waiting note', 60_000);
  check((await alice.page.$eval('.so-hero-img', (i) => i.src)) === hero.src, 'her new picture waits for a check; everyone still sees the old one');
  await boss.clickText('.so-admin .so-subtabs button', 'Waiting');
  await boss.wait('.so-pic-row .so-pic-thumb img', 20_000);
  const thumb = await boss.page.$eval('.so-pic-row .so-pic-thumb img', (i) => i.src);
  check(thumb.startsWith('blob:'), 'the admin sees it (fetched with the admin\'s session, shown from a blob:, never public)');
  await boss.shot('17-admin-pictures');
  await boss.clickText('.so-pic-row .so-btn', 'Approve');
  await alice.page.reload({ waitUntil: 'domcontentloaded' });
  await alice.wait('.so-hero-img', 60_000);
  const after = await alice.page.$eval('.so-hero-img', (i) => i.src);
  check(after !== hero.src && after.includes('/__media/p/'), 'approved: her new picture is up');
  const notes = await alice.api('/notifications');
  check(notes.items?.some((n) => n.kind === 'pic' && n.ref === 'avatar:live'), 'and she is told it passed');
  await boss.clickText('.so-admin-modes label', 'Checked automatically');
  await boss.page.click('.so-admin .tc-close').catch(() => {});

  // ================================================================== her link card: drawn by itself, shared with her link
  await alice.page.goto(`${SITE}/u/alice_e2e`, { waitUntil: 'domcontentloaded' });
  // (her newest card may be waiting for the admin: it was drawn while pictures were on "I approve each one"; her
  // earlier card, which went up at once, is the one her link shows meanwhile)
  const cardNow = await until(async () => { const pr = await alice.api('/profile/alice_e2e'); return pr.held?.card && pr.card ? pr : null; }, 'her link card', 60_000).catch(() => null);
  check(!!cardNow, `her profile page drew her link card by itself and one is up (newest: ${cardNow?.held?.card?.status})`);
  if (cardNow) {
    const img = await fetch(`${MEDIA}/c/${cardNow.card}.jpg`);
    check(img.status === 200 && img.headers.get('content-type') === 'image/jpeg', `the card is a JPEG on the media host (${img.status})`);
    const html = await (await fetch(`${API}/u/alice_e2e`)).text();
    check(html.includes(`/c/${cardNow.card}.jpg`), 'her /u/ link shows it (og:image)');
  }
  await alice.page.reload({ waitUntil: 'domcontentloaded' });
  await alice.clickText('.so-hero-acts .so-btn', 'Share', 60_000);
  await alice.wait('.so-share', 10_000);
  const inSheet = await until(() => alice.page.evaluate(() => { const i = document.querySelector('.so-share-card img'); return i && i.complete && i.naturalWidth === 1200 ? i.src : null; }), 'the card in the Share sheet', 20_000).catch(() => null);
  check(!!inSheet, `the Share sheet shows her card, 1200 wide (${String(inSheet).slice(0, 60)})`);
  check((await alice.text('.so-share-link')).endsWith('/u/alice_e2e'), 'and her link');
  await sleep(600);   // the sheet fades and pops in
  await alice.shot('19-alice-share-card');
  await alice.page.click('.so-share .modal-x');

  // ================================================================== her pets in town, and caring for them without leaving
  await alice.page.goto(`${SITE}/emotown?at=gate`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.town-mine-btn', 60_000);
  await alice.page.click('.town-mine-btn');
  await alice.wait('.town-mine', 10_000);
  const listed = await until(async () => (await alice.text('.town-mine-list')).includes('Froggy'), 'Froggy in her list', 30_000).catch(() => false);
  check(!!listed, 'signed in, her pets are in town: the Your pets list shows Froggy');
  await alice.clickText('.town-mine-list button', 'Froggy');
  await alice.wait('.town-card .tc-care', 30_000);
  check(!(await alice.has('.town-mine')), 'Go: the list closes and Froggy\'s card opens with Take care');
  const froggyKey = `frok:${aliceFrok}`;
  const onScreen = await until(() => alice.page.evaluate((k) => { const T = window.__town; const r = T.sim.residents.get(k); const x = T.sim.pos(r).x; return x >= T.cam.x && x <= T.cam.x + T.cam.viewW; }, froggyKey), 'the camera on Froggy', 5_000).catch(() => false);
  check(onScreen, 'and the camera is on him');
  await until(() => alice.page.evaluate(() => [...document.querySelectorAll('.tc-care-btn')].some((b) => b.textContent.includes('Feed') && !b.disabled)), 'the care buttons ready', 60_000);
  const fedBefore = await alice.page.evaluate((k) => window.__town.sim.residents.get(k).view.feeds, froggyKey);
  await alice.clickText('.tc-care-btn', 'Feed');
  await until(async () => (await alice.text('.town-ticker')).includes('Froggy had dinner'), 'the feed on the street', 60_000);
  check(true, 'Feed: a transaction from the card, and Froggy has dinner on the street');
  await until(() => alice.page.evaluate((k, n) => window.__town.sim.residents.get(k).view.feeds === n + 1, froggyKey, fedBefore), 'the record', 30_000);
  check(true, `the chain counts it (feeds ${fedBefore} → ${fedBefore + 1})`);
  await until(() => alice.page.evaluate(() => [...document.querySelectorAll('.tc-care-btn')].some((b) => b.textContent.includes('Slap') && !b.disabled)), 'the stunt buttons ready', 60_000);
  await alice.clickText('.tc-care-btn', 'Slap');
  await until(async () => (await alice.text('.town-ticker')).includes('Froggy got slapped'), 'the slap on the street', 60_000);
  check(true, 'Slap: a stunt from the card plays on the street');
  await sleep(9000);   // the chain feed brings both events back meanwhile
  const ticks = await alice.page.$$eval('.town-ticker .tk-text', (els) => els.map((e) => e.textContent));
  check(ticks.filter((t) => t === 'Froggy had dinner').length === 1 && ticks.filter((t) => t === 'Froggy got slapped').length === 1, `each plays once, not again when the chain feed catches up (${ticks.join(' | ')})`);
  check(await alice.has('.tc-care-send'), 'her pet\'s card offers "Send Froggy to someone"');
  await alice.shot('20-alice-care-in-town');
  await alice.page.click('.town-card .tc-close');

  // ================================================================== sending a pet and an item (the owner's own transfer)
  // alice gets a Sahur (minted straight on the fork) and sends it to bob by pasting his address; bob claims the
  // Backrooms theme in the shop and sends it to alice by her Emotown name. Every refusal first.
  const aliceWallet = createWalletClient({ account: acct.alice, chain, transport: http(RPC) });
  await pub.waitForTransactionReceipt({ hash: await aliceWallet.writeContract({ address: SAHUR, abi: GAME, functionName: 'mint', gas: 400_000n }) });
  const sahurId = Number(await pub.readContract({ address: SAHUR, abi: GAME, functionName: 'tokenOfOwnerByIndex', args: [acct.alice.address, 0n] }));
  await alice.page.goto(`${SITE}/tung/pet/${sahurId}`, { waitUntil: 'domcontentloaded' });
  await alice.clickText('.share-row button', 'Send this Sahur', 90_000);
  await alice.wait('.send .send-input', 10_000);
  const typeTo = async (p, text) => { await p.page.click('.send-input', { clickCount: 3 }); await p.page.keyboard.press('Backspace'); if (text) await p.page.type('.send-input', text, { delay: 1 }); };
  const refusal = async (p, text, re, what) => {
    await typeTo(p, text);
    const got = await until(async () => { const t = await p.text('.send-err'); return re.test(t) ? t : null; }, what, 30_000).catch(() => null);
    const cont = await p.page.$eval('.send .pk-actions .btn-pink', (b) => b.disabled).catch(() => null);
    check(!!got && cont === true, `${what}: refused, Continue stays off (${got})`);
  };
  await refusal(alice, acct.alice.address, /this wallet/, 'her own address');
  await refusal(alice, SAHUR, /own contracts/, 'the game\'s own contract');
  // bob's checksummed address with one lowercase letter made capital: every character right but the checksum
  const cs = acct.bob.address; const at = [...cs].findIndex((c, k) => k > 1 && /[a-f]/.test(c));
  await refusal(alice, cs.slice(0, at) + cs[at].toUpperCase() + cs.slice(at + 1), /checksum/, 'an address with one capital wrong');
  await refusal(alice, '0xcA11bde05977b3631167028862bE2a173976CA11', /cannot hold pets/, 'a contract that cannot hold pets (Multicall3: the chain says no before anything is signed)');
  await refusal(alice, 'nobody_lives_here', /Nobody in Emotown/, 'a name nobody has');
  await typeTo(alice, acct.bob.address.toLowerCase());
  await until(() => alice.page.$eval('.send .pk-actions .btn-pink', (b) => !b.disabled && b.textContent.includes('Continue')), 'bob\'s address checked', 60_000);
  check((await alice.text('.send-to .send-addr')).replace(/\s/g, '').toLowerCase() === acct.bob.address.toLowerCase(), 'bob\'s address resolves, shown whole');
  await alice.page.click('.send .pk-actions .btn-pink');
  await alice.wait('.send-notes', 10_000);
  const notesText = await alice.text('.send-notes');
  check(/cannot be undone/.test(notesText) && /free Sahur mint stays used/.test(notesText) && /Nobody from Emotown will ever ask/.test(notesText), 'the review says it cannot be undone, what goes with him, and the scam line');
  check(await alice.page.$eval('.send .pk-actions .btn-pink', (b) => b.disabled), 'a pasted address with no Emotown name needs the tick before Send');
  await alice.shot('21-send-review');
  await alice.page.click('.send-tick input');
  await alice.clickText('.send .pk-actions .btn-pink', 'Send');
  await until(() => alice.has('.send-done'), 'the send', 120_000);
  const sahurOwner = await pub.readContract({ address: SAHUR, abi: OWNS, functionName: 'ownerOf', args: [BigInt(sahurId)] });
  check(sahurOwner.toLowerCase() === acct.bob.address.toLowerCase(), `Sahur #${sahurId} is bob's on chain now`);
  await alice.shot('22-send-done');
  await alice.page.click('.send .pk-actions .btn-pink');
  const offered = await until(async () => !(await alice.page.evaluate(() => [...document.querySelectorAll('.share-row button')].some((b) => b.textContent.includes('Send this')))), 'the Send button gone', 30_000).catch(() => false);
  check(!!offered, 'the pet page no longer offers to send a pet that is not hers');

  await bob.page.goto(`${SITE}/shop`, { waitUntil: 'domcontentloaded' });
  // the shop restores the wallet this browser trusts; if it does not, connect it the way a person would
  if (!(await until(() => bob.page.evaluate(() => [...document.querySelectorAll('.item-card .btn-pink')].some((b) => /Claim|Checking/.test(b.textContent))), 'the wallet restored in the shop', 15_000).catch(() => false))) {
    await bob.clickText('.item-card .btn-pink', 'Connect to claim'); await bob.clickText('.wallet-opt', 'Browser wallet');
  }
  const backrooms = async () => { for (const c of await bob.page.$$('.item-card')) if ((await c.evaluate((e) => e.querySelector('h2')?.textContent ?? '')) === 'Backrooms theme') return c; return null; };
  await until(async () => { const c = await backrooms(); return c && (await c.evaluate((e) => [...e.querySelectorAll('.btn-pink')].some((b) => /Claim ·/.test(b.textContent) && !b.disabled))); }, 'the Backrooms claim ready', 120_000);
  await (await backrooms()).evaluate((e) => [...e.querySelectorAll('.btn-pink')].find((b) => /Claim ·/.test(b.textContent)).click());
  await until(async () => (await backrooms())?.evaluate((e) => !!e.querySelector('.item-send')), 'the Send button on his copy', 120_000);
  await (await backrooms()).evaluate((e) => e.querySelector('.item-send').click());
  await bob.wait('.send .send-input', 10_000);
  await typeTo(bob, 'alice_e2e');
  await until(() => bob.page.$eval('.send .pk-actions .btn-pink', (b) => !b.disabled && b.textContent.includes('Continue')), 'alice looked up by name', 60_000);
  check((await bob.text('.send-to')).includes('alice_e2e') && (await bob.text('.send-to .send-addr')).replace(/\s/g, '').toLowerCase() === acct.alice.address.toLowerCase(), 'her Emotown name resolves to her address, with her face and name');
  await bob.page.click('.send .pk-actions .btn-pink');
  await bob.wait('.send-notes', 10_000);
  // alice claimed that name minutes ago: a name can change hands, so a new one asks for the tick, and says why
  check(await bob.has('.send-tick') && /took that name/.test(await bob.text('.send-notes')), 'a name claimed minutes ago asks for a tick, and says when it was taken');
  await bob.page.click('.send-tick input');
  await bob.clickText('.send .pk-actions .btn-pink', 'Send');
  await until(() => bob.has('.send-done'), 'the item send', 120_000);
  const [aliceHas, bobHas] = await Promise.all([acct.alice.address, acct.bob.address].map((a) => pub.readContract({ address: ITEMS, abi: OWNS, functionName: 'balanceOf', args: [a, 7n] })));
  check(aliceHas === 1n && bobHas === 0n, `the Backrooms theme moved to alice on chain (alice ${aliceHas}, bob ${bobHas})`);
  await bob.shot('23-send-item-done');
  await bob.page.click('.send .pk-actions .btn-pink');
  // and from his pet's card in town: the Sahur goes back to alice without leaving Emotown
  await bob.page.goto(`${SITE}/emotown?at=gate`, { waitUntil: 'domcontentloaded' });
  await bob.wait('.town-mine-btn', 60_000);
  await bob.page.click('.town-mine-btn');
  await until(async () => (await bob.text('.town-mine-list')).includes(`#${sahurId}`), 'the Sahur in his list', 60_000);
  await bob.clickText('.town-mine-list button', `#${sahurId}`);
  await until(() => bob.has('.town-card .tc-care-send'), 'Send on his card', 60_000);
  await bob.page.click('.town-card .tc-care-send');
  await bob.wait('.send .send-input', 10_000);
  await typeTo(bob, 'alice_e2e');
  await until(() => bob.page.$eval('.send .pk-actions .btn-pink', (b) => !b.disabled && b.textContent.includes('Continue')), 'alice looked up from town', 60_000);
  await bob.page.click('.send .pk-actions .btn-pink');
  await bob.wait('.send-notes', 10_000);
  if (await bob.has('.send-tick')) await bob.page.click('.send-tick input');
  await bob.clickText('.send .pk-actions .btn-pink', 'Send');
  await until(() => bob.has('.send-done'), 'the send from town', 120_000);
  await sleep(1500);
  check(await bob.has('.send-done'), 'sent from the town card, and the sheet stays up to say so');
  const backToAlice = await pub.readContract({ address: SAHUR, abi: OWNS, functionName: 'ownerOf', args: [BigInt(sahurId)] });
  check(backToAlice.toLowerCase() === acct.alice.address.toLowerCase(), `Sahur #${sahurId} is alice's again on chain`);
  await bob.page.click('.send .pk-actions .btn-pink');
  check(!!(await until(() => bob.page.evaluate(() => !document.querySelector('.town-card .tc-care')), 'the card no longer his', 10_000).catch(() => false)), 'closing it, his card stops offering care for a pet that is not his');
  // an item from the pet page: alice passes the Backrooms theme on to bob through "Send an item"
  await alice.page.goto(`${SITE}/inversebrah/pet/${aliceFrok}`, { waitUntil: 'domcontentloaded' });
  await alice.clickText('.share-row button', 'Send an item', 90_000);
  await alice.clickText('.send-pick button', 'Backrooms theme', 30_000);
  await alice.wait('.send .send-input', 10_000);
  await typeTo(alice, acct.bob.address);
  await until(() => alice.page.$eval('.send .pk-actions .btn-pink', (b) => !b.disabled && b.textContent.includes('Continue')), 'bob checked for the item', 60_000);
  await alice.page.click('.send .pk-actions .btn-pink');
  await alice.wait('.send-tick input', 10_000);
  await alice.page.click('.send-tick input');
  await alice.clickText('.send .pk-actions .btn-pink', 'Send');
  await until(() => alice.has('.send-done'), 'the item send from the pet page', 120_000);
  const [aliceHas2, bobHas2] = await Promise.all([acct.alice.address, acct.bob.address].map((a) => pub.readContract({ address: ITEMS, abi: OWNS, functionName: 'balanceOf', args: [a, 7n] })));
  check(aliceHas2 === 0n && bobHas2 === 1n, `"Send an item" on the pet page: the Backrooms theme went to bob (alice ${aliceHas2}, bob ${bobHas2})`);
  await alice.page.click('.send .pk-actions .btn-pink');
  // the profile is the whole inventory: bob's shows his pets and his items, each with Send because it is his
  await bob.page.goto(`${SITE}/u/${bob.address}`, { waitUntil: 'domcontentloaded' });
  await bob.clickText('.so-tabs.big button', 'Items', 60_000);
  const itemCard = await until(async () => (await bob.text('.so-items')).includes('Backrooms theme'), 'his items on his profile', 60_000).catch(() => false);
  check(!!itemCard, 'his profile\'s Items tab lists the Backrooms theme he holds');
  await until(() => bob.has('.so-items .so-send-btn'), 'Send on his own item', 30_000);
  await bob.clickText('.so-tabs.big button', 'Pets');
  check(await until(() => bob.has('.so-pets .so-send-btn'), 'Send on his own pets', 30_000).catch(() => false), 'and Send on each of his pets');
  await bob.clickText('.so-tabs.big button', 'Items');
  await bob.page.click('.so-items .so-send-btn');
  await bob.wait('.send .send-input', 10_000);
  await typeTo(bob, 'alice_e2e');
  await until(() => bob.page.$eval('.send .pk-actions .btn-pink', (b) => !b.disabled && b.textContent.includes('Continue')), 'alice from his profile', 60_000);
  await bob.page.click('.send .pk-actions .btn-pink');
  await bob.wait('.send-notes', 10_000);
  if (await bob.has('.send-tick')) await bob.page.click('.send-tick input');
  await bob.clickText('.send .pk-actions .btn-pink', 'Send');
  await until(() => bob.has('.send-done'), 'the send from his profile', 120_000);
  const [aliceHas3, bobHas3] = await Promise.all([acct.alice.address, acct.bob.address].map((a) => pub.readContract({ address: ITEMS, abi: OWNS, functionName: 'balanceOf', args: [a, 7n] })));
  check(aliceHas3 === 1n && bobHas3 === 0n, `sent from his profile: the Backrooms theme is alice's again (alice ${aliceHas3}, bob ${bobHas3})`);
  await bob.page.click('.send .pk-actions .btn-pink');
  check(await until(async () => (await bob.text('.so-items, .lb-note')).includes('No items'), 'his items reloaded', 30_000).catch(() => false), 'his Items tab reloads: none left');
  // someone else's profile: the inventory shows, but nothing to send
  await alice.page.goto(`${SITE}/u/${bob.address}`, { waitUntil: 'domcontentloaded' });
  await alice.clickText('.so-tabs.big button', 'Pets', 60_000);
  await until(async () => (await alice.text('.so-pets')).includes('Bobbins'), 'bob\'s pets for alice', 60_000);
  check(!(await alice.has('.so-send-btn')), 'on someone else\'s profile there is no Send');

  // ================================================================== XSS and injection in every text field
  const PAYLOADS = [
    '<img src=x onerror="window.__xss=1">',
    '<script>window.__xss=1</script>',
    '"><svg onload=window.__xss=1>',
    'javascript:window.__xss=1',
    '[click me](javascript:window.__xss=1)',
    "'; DROP TABLE messages; --",
    '{{constructor.constructor("window.__xss=1")()}}',
    `${String.fromCodePoint(0x202e)}gnp.exe${String.fromCodePoint(0x200b)} and data:text/html,<script>window.__xss=1</script>`,
  ];
  await alice.page.goto(`${SITE}/emotown?at=hall`, { waitUntil: 'domcontentloaded' });
  await alice.wait('.so-compose textarea', 60_000);
  for (const [i, p] of PAYLOADS.entries()) {
    await sleep(4300);   // under the square's pace (five in twenty seconds)
    const err = await post(alice, `${i}: ${p}`);
    check(!err, `chat payload ${i} posts as text${err ? ` (${err})` : ''}`);
  }
  const shown = await alice.page.$$eval('.so-msg-text', (els) => els.map((e) => e.textContent));
  check(shown.some((t) => t.includes('<img src=x onerror="window.__xss=1">')) && shown.some((t) => t.includes('<script>window.__xss=1</script>')), 'the payloads show as text in the square');
  check(!shown.some((t) => t.includes(String.fromCodePoint(0x202e))), 'the right-to-left override was removed');
  // the words' own span (a speaker's role emoji ride in the name, <b>, as spans of their own)
  const bubbleKids = await alice.page.$$eval('.so-bubble-in > span', (els) => els.map((e) => e.children.length));
  check(bubbleKids.length > 0 && bubbleKids.every((n) => n === 0), `the bubbles hold text only, no elements (${bubbleKids.join(',')})`);
  for (const p of [alice, bob, boss]) {
    for (const path of ['/emotown?at=hall', `/u/alice_e2e`]) {
      await p.page.goto(`${SITE}${path}`, { waitUntil: 'domcontentloaded' });
      await sleep(3500);
      const r = await p.page.evaluate(() => ({ xss: window.__xss ?? null, img: document.querySelectorAll('img[src="x"]').length, svg: document.querySelectorAll('svg[onload]').length, scripts: [...document.scripts].filter((s) => !s.src && s.textContent.includes('__xss')).length }));
      check(r.xss === null && r.img === 0 && r.svg === 0 && r.scripts === 0, `${p.name} on ${path}: nothing injected ran or was built (${JSON.stringify(r)})`);
    }
  }
  check(dialogs.filter((d) => d.who !== 'boss').length === 0, `no alert or dialog opened for alice or bob (${JSON.stringify(dialogs)})`);
  const reports = await boss.api('/admin/reports?all=1');   // the admin's delete already resolved it
  check(reports.items?.some((r) => r.note?.includes('<script>')), 'the report note is stored as text for the admin');

  // ================================================================== phone width
  const phone = await person('alice', { width: 390, height: 844, phone: true });
  await signIn(phone);
  await phone.page.click('.so-hud-btn[title="Town square"]');
  await phone.wait('.so-chat');
  await sleep(1500);
  await phone.shot('10-phone-chat');
  const fits = (sel) => phone.page.$$eval(sel, (els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }));
  check(await fits('.so-chat'), 'phone: the square fits the screen');
  check(await fits('.town-top-right'), 'phone: the top buttons fit');
  // the title and the buttons never cover each other (signed in, the row is six buttons: it goes under the title)
  const titleClash = () => phone.page.evaluate(() => { const t = document.querySelector('.town-brand').getBoundingClientRect(); return [...document.querySelectorAll('.town-top-right > *')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top).length; });
  check((await titleClash()) === 0, 'phone: the buttons do not cover the Emotown title (390 wide)');
  await phone.page.setViewport({ width: 360, height: 780, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await sleep(700);
  check((await titleClash()) === 0 && await fits('.town-top-right'), 'phone: nor at 360 wide');
  await phone.shot('10a-phone-top-360');
  await phone.page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await sleep(500);
  await phone.page.click('.so-hud-me');
  await phone.wait('.so-mepop');
  check(await fits('.so-mepop'), 'phone: your menu fits');
  await phone.shot('11-phone-menu');
  await phone.page.click('.so-hud-me');
  await phone.page.click('.so-hud-btn[title="Messages"]');
  await phone.wait('.so-drawer');
  await sleep(600);   // it slides in
  check(await fits('.so-drawer'), 'phone: messages fill the screen');
  await phone.shot('12-phone-inbox');
  await phone.page.click('.so-drawer .tc-close');
  await phone.page.goto(`${SITE}/u/alice_e2e`, { waitUntil: 'domcontentloaded' });
  await phone.wait('.so-hero-id h1', 60_000);
  await sleep(2500);
  const over = await phone.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(over <= 1, `phone: the profile page has no sideways scroll (${over}px over)`);
  // the profile page's notifications on a phone: across the screen, not squeezed into the button's box
  await phone.clickText('.so-bar button', 'Notifications');
  await phone.wait('.so-bar-pop .so-pop', 10_000);
  await sleep(400);
  const notesBox = await phone.page.$eval('.so-bar-pop .so-pop', (e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; });
  check(notesBox.w >= 340 && notesBox.l >= 0 && notesBox.r <= 391, `phone: notifications on the profile page open across the screen (${JSON.stringify(notesBox)})`);
  await phone.shot('13a-phone-profile-notes');
  await phone.page.click('.so-bar-pop .so-pop .tc-close');
  check(!(await phone.has('.so-bar-pop .so-pop')), 'phone: and its × closes it');
  // messages opened from the profile page: the conversation's header keeps its buttons apart (the X once sat on the ⋯)
  await phone.clickText('.so-bar button, .so-bar a', 'Messages');
  await phone.wait('.so-drawer .so-thread, .so-drawer li button', 20_000).catch(() => {});
  await phone.page.evaluate(() => { const t = document.querySelector('.so-drawer .so-thread, .so-drawer li button'); t?.click(); });
  await phone.wait('.so-drawer-who', 20_000);
  await sleep(500);
  const heads = await phone.page.evaluate(() => [...document.querySelectorAll('.so-drawer-head > *')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
  const clash = heads.some((a, i) => heads.some((b, j) => j > i && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1));
  check(heads.length >= 4 && !clash && heads.every((h) => h.r <= 391), `phone: a conversation's header buttons do not overlap (${heads.length} pieces)`);
  await phone.shot('13b-phone-conversation');
  await phone.page.click('.so-drawer-head .tc-close');
  await phone.page.screenshot({ path: join(OUT, '13-phone-profile.png'), fullPage: true });
  await phone.page.goto(`${SITE}/u/alice_e2e?edit=1`, { waitUntil: 'domcontentloaded' });
  await phone.wait('.so-editor', 60_000);
  await sleep(800);
  check(await fits('.so-editor'), 'phone: the profile editor fits');
  await phone.shot('14-phone-editor');
  await phone.clickText('.so-pick-banners button', 'Upload your own');
  const pin = await phone.page.waitForSelector('.so-crop input[type=file]'); await pin.uploadFile(join(PICS, 'street.png'));
  await phone.wait('.so-crop-frame.ready', 20_000);
  await sleep(700);   // the sheet fades and pops in
  check(await fits('.so-crop') && await fits('.so-crop-frame'), 'phone: the cropper fits');
  await phone.shot('18-phone-cropper');

  for (const p of [alice, bob, boss, phone]) if (p.errors.length) {
    log(`  ${p.name} page errors:\n`, p.errors.slice(0, 5).join('\n\n'));
    const full = await p.page.evaluate(() => window.__errs ?? []).catch(() => []);
    log(`  ${p.name} console.error in full:\n`, full.slice(0, 5).join('\n\n'));
  }
  check([alice, bob, boss, phone].every((p) => p.errors.length === 0), 'no page errors anywhere');
} catch (e) {
  fails.push(String(e?.message ?? e));
  log('STOPPED:', e?.message ?? e);
  // what every page looked like when it stopped
  for (const [i, pg] of (await browser.pages()).entries()) { try { await pg.screenshot({ path: join(OUT, `stopped-${i}.png`) }); log('  page', i, pg.url()); } catch { /* closed */ } }
  for (const p of people) if (p.errors.length) log(`  ${p.name} page errors:`, p.errors.slice(0, 8));
}
await browser.close();
log(fails.length ? `${fails.length} FAILED:\n  - ${fails.join('\n  - ')}` : 'ALL PASSED');
stop();
process.exit(fails.length ? 1 : 0);
