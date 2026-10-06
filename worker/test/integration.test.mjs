// The social layer end to end at the API: a real Worker (`wrangler dev --local`: workerd, a local D1, both Durable
// Objects) against an ANVIL FORK of Monad mainnet, driven by throwaway wallets made with `cast wallet new` (never
// anvil's default accounts: some of those have EIP-7702 code on Monad mainnet). Real SIWE signatures, a real ERC-1271
// wallet, a real 7702-delegated EOA, real mints and names on the fork for the gate, real websockets.
//
//   cd worker && node --test --test-concurrency=1 test/integration.test.mjs
//
// It starts and stops its own anvil (port 8547) and Worker (port 8798), in a temp directory. Needs the network (the
// fork reads mainnet state; the /u/ preview fetches the live site's index.html).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const rot13 = (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); });

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const FOUNDRY = join(homedir(), '.foundry/bin');
const RPC_PORT = 8547, W_PORT = 8798, KLIPY_PORT = 8799;
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const API = `http://127.0.0.1:${W_PORT}`;
const ORIGIN = 'http://localhost:5230';
const INVERSE = '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6';
const CATS = '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5';
const GAME = parseAbi([
  'function mint() returns (uint256)',
  'function setName(uint256 id, string newName) payable',
  'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 id)',
  'function ownerOf(uint256) view returns (address)',
]);
const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });

const dir = mkdtempSync(join(tmpdir(), 'emotown-it-'));
const procs = [];
const newKey = () => JSON.parse(execFileSync(join(FOUNDRY, 'cast'), ['wallet', 'new', '--json']).toString())[0].private_key;
const W = {}; // name -> account
for (const n of ['alice', 'bob', 'carol', 'dave', 'admin', 'erin', 'fay']) W[n] = privateKeyToAccount(newKey());
const rpc = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { try { if (await fn()) return; } catch { /* not yet */ } await sleep(500); }
  throw new Error(`timed out waiting for ${what}`);
}

// A stand-in for KLIPY (klipy.com's Tenor-style v2 API): canned results, one of them off KLIPY's CDN (it must be
// dropped), a call counter, and a switch that makes it answer 429 like a spent free key.
const klipy = { calls: 0, paths: [], busy: false };
const klipyServer = createServer((req, res) => {
  klipy.calls++; klipy.paths.push(req.url);
  if (klipy.busy) { res.writeHead(429); res.end('{}'); return; }
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams.get('q') ?? 'featured';
  const item = (id) => ({ id, content_description: `${q} ${id}`, media_formats: { tinygif: { url: `https://static.klipy.com/ii/${id}/tiny.gif`, dims: [220, 124] }, tinygifpreview: { url: `https://static.klipy.com/ii/${id}/tiny.jpg`, dims: [220, 124] } } });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ results: [item(`${q.replace(/\W/g, '')}1`), item(`${q.replace(/\W/g, '')}2`), { id: 'evil', media_formats: { tinygif: { url: 'https://evil.example/x.gif', dims: [1, 1] } } }], next: 'Mg==' }));
});

before(async () => {
  await new Promise((r) => klipyServer.listen(KLIPY_PORT, '127.0.0.1', r));
  procs.push(spawn(join(FOUNDRY, 'anvil'), ['--fork-url', 'https://rpc.monad.xyz', '--chain-id', '143', '--port', String(RPC_PORT), '--silent', '--code-size-limit', '131072'], { stdio: 'ignore' }));
  await waitFor(() => rpc('eth_blockNumber'), 'anvil');
  for (const a of Object.values(W)) await rpc('anvil_setBalance', [a.address, '0x3635C9ADC5DEA00000']);   // 1000 fork MON each
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-social', '--local', '--persist-to', dir], { cwd: WORKER, stdio: 'ignore' });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-media', '--local', '--persist-to', dir], { cwd: WORKER, stdio: 'ignore' });
  // not --local: that switches off remote bindings, and the picture screen (Workers AI) only runs remotely. D1 and the
  // Durable Objects are still local (and persisted in `dir`).
  const w = spawn('npx', ['wrangler', 'dev', '--persist-to', dir, '--port', String(W_PORT), '--ip', '127.0.0.1',
    '--var', `SITE_ORIGIN:${ORIGIN}`, '--var', 'SIWE_DOMAIN:localhost:5230', '--var', `RPC_URL:${RPC}`, '--var', `ADMINS:${W.admin.address.toLowerCase()}`,
    // uploaded pictures are served on their own host; `wrangler dev` rewrites every request to the site's host, so here
    // that host is the path /__media/ (MEDIA_DEV, never set deployed). The screen is the real vision model (Workers
    // AI, remote) unless PIC_SCREEN says otherwise.
    '--var', 'MEDIA_DEV:1', '--var', 'SITE_DIRECT:1', '--var', 'KLIPY_KEY:test-key', '--var', `KLIPY_BASE:http://127.0.0.1:${KLIPY_PORT}/v2`, ...(process.env.PIC_SCREEN ? ['--var', `PIC_SCREEN:${process.env.PIC_SCREEN}`] : [])], { cwd: WORKER, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; w.stdout.on('data', (d) => { log += d; }); w.stderr.on('data', (d) => { log += d; });
  // WORKER_LOG=<file> keeps the Worker's own log (its console.error lines say why a request failed)
  if (process.env.WORKER_LOG) { const f = createWriteStream(process.env.WORKER_LOG); w.stdout.pipe(f); w.stderr.pipe(f); }
  procs.push(w);
  await waitFor(async () => (await fetch(`${API}/api/social/me`)).ok, 'the Worker').catch((e) => { console.error(log.slice(-3000)); throw e; });
});
after(() => { klipyServer.close(); for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } try { rmSync(dir, { recursive: true, force: true }); } catch { /* fine */ } });

// ------------------------------------------------------------------ a browser, more or less
let nextIp = 1;
class Client {
  // each client its own address, like separate people (the per-IP rate limits apply in `wrangler dev`)
  constructor(account) { this.account = account; this.cookie = null; this.ip = `10.77.0.${nextIp++}`; }
  headers(extra = {}) { return { origin: ORIGIN, 'cf-connecting-ip': this.ip, ...(this.cookie ? { cookie: this.cookie } : {}), ...extra }; }
  async get(path) { const r = await fetch(API + path, { headers: this.headers() }); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; }
  async post(path, body, opts = {}) {
    const headers = { 'content-type': 'application/json', ...this.headers(), ...(opts.headers ?? {}) };
    if (opts.noOrigin) delete headers.origin;
    const r = await fetch(API + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set) { const m = /^(__Host-emotown=[^;]*)/.exec(set); if (m) this.cookie = m[1].endsWith('=') ? null : m[1]; }
    return { status: r.status, body: await r.json().catch(() => null), setCookie: set };
  }
  async signIn(address = this.account.address, sign = (m) => this.account.signMessage({ message: m })) {
    const n = await this.get(`/api/social/auth/nonce?address=${address}`);
    assert.equal(n.status, 200, JSON.stringify(n.body));
    const signature = await sign(n.body.message);
    return this.post('/api/social/auth/verify', { message: n.body.message, signature });
  }
  socket(path, opts = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${W_PORT}${path}`, { headers: { origin: opts.origin ?? ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) } });
    ws.got = []; ws.closedWith = null;
    ws.addEventListener('message', (e) => { try { ws.got.push(JSON.parse(String(e.data))); } catch { /* not json */ } });
    ws.addEventListener('close', (e) => { ws.closedWith = e.code; });
    ws.opened = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    ws.wait = (pred, what = 'a message', ms = 8000) => waitFor(() => ws.got.find(pred), what, ms).then(() => ws.got.find(pred));
    return ws;
  }
}
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC) });
async function mintFrok(account) {
  const hash = await wallet(account).writeContract({ address: INVERSE, abi: GAME, functionName: 'mint', gas: 400_000n });
  await pub.waitForTransactionReceipt({ hash });
  return Number(await pub.readContract({ address: INVERSE, abi: GAME, functionName: 'tokenOfOwnerByIndex', args: [account.address, 0n] }));
}
async function nameFrok(account, id, name) {
  const hash = await wallet(account).writeContract({ address: INVERSE, abi: GAME, functionName: 'setName', args: [BigInt(id), name], value: parseEther('10'), gas: 400_000n });
  await pub.waitForTransactionReceipt({ hash });
}

const alice = new Client(W.alice), bob = new Client(W.bob), carol = new Client(W.carol), dave = new Client(W.dave), boss = new Client(W.admin), erin = new Client(W.erin), fay = new Client(W.fay), anon = new Client(null);
const low = (a) => a.address.toLowerCase();
let aliceFrok, bobFrok, reader;

// ------------------------------------------------------------------ sign-in
test('sign-in: the Worker writes the SIWE message; a signature opens a session in an HttpOnly cookie', async () => {
  const n = await alice.get(`/api/social/auth/nonce?address=${low(W.alice)}`);
  assert.equal(n.status, 200);
  assert.match(n.body.message, /^localhost:5230 wants you to sign in with your Ethereum account:\n0x[0-9a-fA-F]{40}\n/);
  assert.ok(n.body.message.includes(getAddress(W.alice.address)), 'checksummed address');
  assert.match(n.body.message, /\nChain ID: 143\n/);
  assert.match(n.body.message, /\nExpiration Time: /);
  const signature = await W.alice.signMessage({ message: n.body.message });
  const v = await alice.post('/api/social/auth/verify', { message: n.body.message, signature });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.match(v.setCookie, /__Host-emotown=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict/);
  const me = await alice.get('/api/social/me');
  assert.equal(me.body.signedIn, true);
  assert.equal(me.body.address, low(W.alice));
  // the same signature again: the nonce is spent
  const again = await new Client(W.alice).post('/api/social/auth/verify', { message: n.body.message, signature });
  assert.equal(again.status, 401);
});

test('sign-in refuses: a tampered message, the wrong signer, no Origin, a foreign Origin, not JSON', async () => {
  const c = new Client(W.bob);
  let n = await c.get(`/api/social/auth/nonce?address=${W.bob.address}`);
  const tampered = n.body.message.replace('Chain ID: 143', 'Chain ID: 1');
  let r = await c.post('/api/social/auth/verify', { message: tampered, signature: await W.bob.signMessage({ message: tampered }) });
  assert.equal(r.status, 401);
  n = await c.get(`/api/social/auth/nonce?address=${W.bob.address}`);
  r = await c.post('/api/social/auth/verify', { message: n.body.message, signature: await W.carol.signMessage({ message: n.body.message }) });
  assert.equal(r.status, 401);
  assert.equal(c.cookie, null);
  n = await c.get(`/api/social/auth/nonce?address=${W.bob.address}`);
  const sig = await W.bob.signMessage({ message: n.body.message });
  r = await c.post('/api/social/auth/verify', { message: n.body.message, signature: sig }, { noOrigin: true });
  assert.equal(r.status, 403);
  r = await c.post('/api/social/auth/verify', { message: n.body.message, signature: sig }, { headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  const raw = await fetch(API + '/api/social/auth/verify', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: JSON.stringify({ message: n.body.message, signature: sig }) });
  assert.equal(raw.status, 415);
  // the nonce was never consumed by those (they were refused before the database), so the real sign-in still works
  r = await c.post('/api/social/auth/verify', { message: n.body.message, signature: sig });
  assert.equal(r.status, 200);
  assert.equal((await c.get('/api/social/me')).body.address, low(W.bob));
  Object.assign(bob, { cookie: c.cookie });
});

test('sign-in works for an ERC-1271 smart wallet', async () => {
  const fx = JSON.parse(readFileSync(join(HERE, 'Wallet1271.json'), 'utf8'));
  const hash = await wallet(W.carol).deployContract({ abi: fx.abi, bytecode: fx.bytecode, args: [W.carol.address] });
  const { contractAddress } = await pub.waitForTransactionReceipt({ hash });
  const r = await carol.signIn(contractAddress, (m) => W.carol.signMessage({ message: m }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await carol.get('/api/social/me')).body.address, contractAddress.toLowerCase());
  // and not for someone else's key
  const r2 = await new Client(W.dave).signIn(contractAddress, (m) => W.dave.signMessage({ message: m }));
  assert.equal(r2.status, 401);
});

test('sign-in works for an EIP-7702 delegated EOA', async () => {
  // the delegation designator: 0xef0100 ++ the delegate's address (any contract; the key still signs for the account)
  await rpc('anvil_setCode', [W.dave.address, '0xef0100' + CATS.slice(2).toLowerCase()]);
  assert.match(await rpc('eth_getCode', [W.dave.address, 'latest']), /^0xef0100/);
  const r = await dave.signIn();
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

// ------------------------------------------------------------------ the gate
test('the gate: no pet, then an unnamed pet, are both refused; a named pet opens the square', async () => {
  reader = anon.socket('/api/social/chat/ws?room=square');
  await reader.opened;
  await reader.wait((m) => m.t === 'hello', 'hello');
  let r = await alice.post('/api/social/chat', { text: 'hello town' });
  assert.equal(r.status, 403); assert.equal(r.body.gate, true);
  aliceFrok = await mintFrok(W.alice);
  r = await alice.post('/api/social/gate/refresh', {});
  assert.equal(r.body.ok, false);
  r = await alice.post('/api/social/chat', { text: 'hello town' });
  assert.equal(r.status, 403);
  await nameFrok(W.alice, aliceFrok, 'Froggo');
  r = await alice.post('/api/social/gate/refresh', {});
  assert.equal(r.body.ok, true); assert.deepEqual(r.body.pet, { col: 'frok', id: aliceFrok, name: 'Froggo' });
  r = await alice.post('/api/social/chat', { text: 'hello town' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = await reader.wait((x) => x.t === 'msg' && x.m.text === 'hello town', 'the message on the socket');
  assert.deepEqual(m.m.p, { col: 'frok', id: aliceFrok });
  assert.equal(m.m.a, low(W.alice));
  bobFrok = await mintFrok(W.bob); await nameFrok(W.bob, bobFrok, 'Bobbert');
  // the site asks for a fresh look right after naming (a "no" is remembered for twenty seconds)
  assert.equal((await bob.post('/api/social/gate/refresh', {})).body.ok, true);
  // reading needs nothing
  assert.equal((await anon.get('/api/social/chat/history')).body.items.at(-1).text, 'hello town');
});

// ------------------------------------------------------------------ profiles
test('profiles: names are unique, checked and filtered; text is stored as text; socials normalized; avatar must be yours', async () => {
  let r = await alice.post('/api/social/profile', { name: 'alice_test', bio: 'hi <img src=x onerror=alert(1)>' + String.fromCodePoint(0x202e) + 'gpj.exe', banner: 'diner', socials: { x: 'https://x.com/alice?s=1', website: 'alice.example.com/about?utm=x', telegram: '@alice_tg' }, avatar: { col: 'frok', id: aliceFrok } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.name, 'alice_test');
  assert.equal(r.body.bio, 'hi <img src=x onerror=alert(1)>gpj.exe');
  assert.deepEqual(r.body.socials, { x: 'alice', website: 'https://alice.example.com/about', telegram: 'alice_tg' });
  assert.deepEqual(r.body.avatar, { col: 'frok', id: aliceFrok });
  for (const [name, why] of [['admin', 'reserved'], ['al ice', 'letters'], ['0xabc', 'address'], ['l0l1c0n', 'allow'], ['ab', 'least']]) {
    r = await bob.post('/api/social/profile', { name });
    assert.equal(r.status, 400, name); assert.match(r.body.errors.name, new RegExp(why, 'i'), name);
  }
  r = await bob.post('/api/social/profile', { name: 'ALICE_TEST' });
  assert.equal(r.status, 400); assert.match(r.body.errors.name, /taken/);
  r = await bob.post('/api/social/profile', { avatar: { col: 'cat', id: 1 } });
  assert.equal(r.status, 400); assert.match(r.body.errors.avatar, /not yours/);
  r = await bob.post('/api/social/profile', { banner: 'javascript:alert(1)', socials: { x: 'javascript:alert(1)', website: 'http://insecure.example' } });
  assert.equal(r.status, 400); assert.ok(r.body.errors.banner && r.body.errors.social_x && r.body.errors.social_website);
  r = await bob.post('/api/social/profile', { name: 'bob_test', bio: "'); DROP TABLE users;--" });
  assert.equal(r.status, 200); assert.equal(r.body.bio, "'); DROP TABLE users;--");
  // a name can change once a day
  r = await bob.post('/api/social/profile', { name: 'bob_again' });
  assert.equal(r.status, 400); assert.match(r.body.errors.name, /once a day/);
  // the vanity URL
  r = await anon.get('/api/social/profile/ALICE_test');
  assert.equal(r.body.address, low(W.alice)); assert.equal(r.body.banner, 'diner');
  assert.equal((await anon.get('/api/social/profile/nobody_here')).status, 404);
  assert.equal((await anon.get(`/api/social/profile/${low(W.erin)}`)).body.name, null);   // never signed in: an empty profile
  // search and cards
  assert.equal((await anon.get('/api/social/search?q=ali')).body.items[0].name, 'alice_test');
  assert.deepEqual((await anon.get("/api/social/search?q=' OR 1=1--")).body.items, []);
  const cards = (await anon.get(`/api/social/cards?a=${low(W.alice)},${low(W.bob)},not-an-address`)).body.items;
  assert.equal(cards.length, 2);
});

test('the /u/ link preview escapes what people wrote', async () => {
  const r = await fetch(`${API}/u/alice_test`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<title>alice_test · Emotown/);
  assert.ok(!html.includes('<img src=x onerror'), 'raw HTML from the bio reached the page');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

// ------------------------------------------------------------------ follows and notifications
test('follow the owner: a notification, pushed live to their open tab, once a day', async () => {
  const inbox = alice.socket('/api/social/inbox/ws');
  await inbox.opened; await inbox.wait((m) => m.t === 'ready', 'ready');
  let r = await bob.post('/api/social/follow', { address: low(W.alice) });
  assert.equal(r.status, 200);
  const n = await inbox.wait((m) => m.t === 'notification' && m.n.kind === 'follow', 'the follow notification');
  assert.equal(n.n.actor, low(W.bob));
  await bob.post('/api/social/unfollow', { address: low(W.alice) });
  await bob.post('/api/social/follow', { address: low(W.alice) });
  const list = (await alice.get('/api/social/notifications')).body;
  assert.equal(list.items.filter((x) => x.kind === 'follow').length, 1);
  assert.equal(list.items[0].name, 'bob_test');
  const f = (await anon.get('/api/social/profile/alice_test/followers')).body.items;
  assert.equal(f[0].address, low(W.bob));
  const p = (await bob.get('/api/social/profile/alice_test')).body;
  assert.equal(p.followers, 1); assert.equal(p.me.following, true);
  assert.equal((await bob.post('/api/social/follow', { address: low(W.bob) })).status, 400);   // yourself
  r = await alice.post('/api/social/notifications/read', { upTo: list.items[0].id });
  assert.equal(r.body.unread, 0);
  inbox.close();
});

// ------------------------------------------------------------------ DMs
test('DMs: to someone who follows you; a reply to someone who wrote first; live, with unread counts', async () => {
  const bobInbox = bob.socket('/api/social/inbox/ws'); await bobInbox.opened;
  // bob follows alice, so alice may write to bob; bob may not start one with alice (she does not follow him)
  let r = await bob.post('/api/social/dm/send', { to: low(W.alice), text: 'hey' });
  assert.equal(r.status, 403); assert.equal(r.body.dm, 'closed');
  r = await alice.post('/api/social/dm/send', { to: low(W.bob), text: 'hi bob <b>bold</b>' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const got = await bobInbox.wait((m) => m.t === 'dm', 'the dm');
  assert.equal(got.m.text, 'hi bob <b>bold</b>');
  let t = (await bob.get('/api/social/dm/threads')).body;
  assert.equal(t.unread, 1); assert.equal(t.items[0].with.name, 'alice_test');
  // now bob can answer
  r = await bob.post('/api/social/dm/send', { to: low(W.alice), text: 'hello back' });
  assert.equal(r.status, 200);
  const th = (await alice.get(`/api/social/dm/thread/${low(W.bob)}`)).body;
  assert.deepEqual(th.items.map((m) => m.text), ['hi bob <b>bold</b>', 'hello back']);
  await bob.post('/api/social/dm/read', { with: low(W.alice), upTo: th.items[1].id });
  t = (await bob.get('/api/social/dm/threads')).body;
  assert.equal(t.unread, 0);
  assert.equal((await bob.get('/api/social/me')).body.unread.dms, 0);
  assert.equal((await alice.get('/api/social/me')).body.unread.dms, 1);
  // the gate applies to DMs too: carol (a smart wallet with no pet) cannot send one
  await alice.post('/api/social/follow', { address: (await carol.get('/api/social/me')).body.address });
  r = await carol.post('/api/social/dm/send', { to: low(W.alice), text: 'hi' });
  assert.equal(r.status, 403); assert.equal(r.body.gate, true);
  bobInbox.close();
});

// ------------------------------------------------------------------ mentions, blocks
test('mentions notify; a block stops mentions, DMs and follows both ways', async () => {
  let r = await bob.post('/api/social/chat', { text: 'hi @alice_test and @nobody' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.m.men, [{ n: 'alice_test', a: low(W.alice) }]);
  await waitFor(async () => (await alice.get('/api/social/notifications')).body.items.some((n) => n.kind === 'mention'), 'the mention');
  r = await alice.post('/api/social/block', { address: low(W.bob) });
  assert.equal(r.status, 200);
  assert.equal((await bob.get('/api/social/profile/alice_test')).body.me.following, false);   // the follow went
  await sleep(1300);
  r = await bob.post('/api/social/chat', { text: 'again @alice_test' });
  assert.equal(r.status, 200);
  await sleep(800);
  assert.equal((await alice.get('/api/social/notifications')).body.items.filter((n) => n.kind === 'mention').length, 1);
  r = await bob.post('/api/social/dm/send', { to: low(W.alice), text: 'let me in' });
  assert.equal(r.status, 403);
  r = await bob.post('/api/social/follow', { address: low(W.alice) });
  assert.equal(r.status, 403);
  assert.deepEqual((await alice.get('/api/social/me')).body.blocked, [low(W.bob)]);
  assert.equal((await alice.get(`/api/social/profile/${low(W.bob)}`)).body.me.canDM, false);
  await alice.post('/api/social/unblock', { address: low(W.bob) });
});

// ------------------------------------------------------------------ pace
test('the square keeps its pace: a gap between messages, no repeats, length and filter', async () => {
  await sleep(1300);
  let r = await alice.post('/api/social/chat', { text: 'one' });
  assert.equal(r.status, 200);
  r = await alice.post('/api/social/chat', { text: 'two' });
  assert.equal(r.status, 429);
  await sleep(1300);
  r = await alice.post('/api/social/chat', { text: 'one' });
  assert.equal(r.status, 429); assert.match(r.body.error, /just said/);
  r = await alice.post('/api/social/chat', { text: 'x'.repeat(281) });
  assert.equal(r.status, 400);
  // only CSAM terms are refused since 2026-09-27 (operator); everything else, slurs included, is allowed
  r = await alice.post('/api/social/chat', { text: rot13('pu1yq c0ea') });
  assert.equal(r.status, 400);
  r = await alice.post('/api/social/chat', { text: rot13('   ') });
  assert.equal(r.status, 400);
});

// ------------------------------------------------------------------ GIFs, replies, likes (2026-09-28)
test('GIFs: searched through the Worker, shared by everyone, only off KLIPY\'s CDN; the free key is never overspent', async () => {
  assert.equal((await anon.get('/api/social/gifs')).status, 401);
  assert.equal((await alice.get('/api/social/me')).body.gifs, true);
  const calls0 = klipy.calls;
  let r = await alice.get('/api/social/gifs');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.items.map((g) => g.id), ['featured1', 'featured2']);   // the one off the CDN was dropped
  assert.equal(r.body.items[0].url, 'https://static.klipy.com/ii/featured1/tiny.gif');
  assert.equal(r.body.next, 'Mg==');   // KLIPY's page token is base64
  assert.match(klipy.paths.at(-1), /^\/v2\/featured\?key=test-key&.*contentfilter=off/);
  r = await bob.get('/api/social/gifs?q=%20Dancing%20%20CATS%20');
  assert.deepEqual(r.body.items.map((g) => g.id), ['dancingcats1', 'dancingcats2']);
  // the same search by someone else, however it is typed, and the featured page again: no new call to KLIPY
  await alice.get('/api/social/gifs?q=dancing%20cats');
  await bob.get('/api/social/gifs');
  assert.equal(klipy.calls - calls0, 2, klipy.paths.slice(-4).join(' '));
  // KLIPY says 429 (a spent key): a new search answers "busy" from what is kept, and nothing is asked for ten minutes
  klipy.busy = true;
  r = await alice.get('/api/social/gifs?q=owls');
  assert.equal(r.status, 200); assert.equal(r.body.busy, true); assert.deepEqual(r.body.items, []);
  const during = klipy.calls;
  r = await alice.get('/api/social/gifs?q=bats');
  assert.equal(r.body.busy, true); assert.equal(klipy.calls, during);
  r = await alice.get('/api/social/gifs?q=dancing%20cats');   // kept answers still work
  assert.equal(r.body.items.length, 2);
  klipy.busy = false;
});

let gifMsg, replyMsg;
test('the square: a GIF message, a reply quoting it, one heart per person, and a deleted original quoted by nobody', async () => {
  const room = anon.socket('/api/social/chat/ws?room=square'); await room.opened;
  const gif = (await alice.get('/api/social/gifs?q=dancing%20cats')).body.items[0];
  await sleep(1300);
  let r = await alice.post('/api/social/chat', { text: '', gif: { ...gif, url: 'https://evil.example/x.gif' } });
  assert.equal(r.status, 400);
  r = await alice.post('/api/social/chat', { text: 'look', gif });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  gifMsg = r.body.m;
  assert.equal(gifMsg.g.url, gif.url); assert.equal(gifMsg.g.w, 220);
  assert.ok(await room.wait((m) => m.t === 'msg' && m.m.id === gifMsg.id && m.m.g?.id === gif.id, 'the GIF message'));
  // a GIF with no words is a message too
  await sleep(1300);
  r = await alice.post('/api/social/chat', { gif: (await alice.get('/api/social/gifs?q=dancing%20cats')).body.items[1] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // bob replies: the reply carries the quote, alice is told once
  await sleep(1300);
  r = await bob.post('/api/social/chat', { text: 'haha', replyTo: 99999999 });
  assert.equal(r.status, 404);
  r = await bob.post('/api/social/chat', { text: 'haha @alice_test', replyTo: gifMsg.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  replyMsg = r.body.m;
  assert.deepEqual(replyMsg.re, { id: gifMsg.id, a: low(W.alice), n: 'alice_test', t: 'look', g: 1 });
  await waitFor(async () => (await alice.get('/api/social/notifications')).body.items.some((n) => n.kind === 'reply' && n.ref === `chat:${replyMsg.id}`), 'the reply notification');
  await sleep(600);
  assert.equal((await alice.get('/api/social/notifications')).body.items.filter((n) => n.ref === `chat:${replyMsg.id}`).length, 1);   // not also a mention
  // reactions, like X: one emoji per person, a new one replaces it, null takes it back; counted live; the author told
  // once however often it changes; the old heart endpoint is a red heart
  const HEART = String.fromCodePoint(0x2764, 0xFE0F), JOY = String.fromCodePoint(0x1F602), FIRE = String.fromCodePoint(0x1F525);
  r = await bob.post('/api/social/chat/react', { id: gifMsg.id, emoji: JOY });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.r, [[JOY, 1]]);
  assert.ok(await room.wait((m) => m.t === 'react' && m.id === gifMsg.id && m.r?.[0]?.[0] === JOY, 'the reaction'));
  r = await bob.post('/api/social/chat/react', { id: gifMsg.id, emoji: JOY });
  assert.deepEqual(r.body.r, [[JOY, 1]]);                                // the same again does not count twice
  r = await alice.post('/api/social/chat/react', { id: gifMsg.id, emoji: FIRE });
  assert.deepEqual(r.body.r, [[JOY, 1], [FIRE, 1]]);
  r = await bob.post('/api/social/chat/react', { id: gifMsg.id, emoji: FIRE });
  assert.deepEqual(r.body.r, [[FIRE, 2]]);                               // bob's replaced, not added
  r = await bob.post('/api/social/chat/react', { id: gifMsg.id, emoji: null });
  assert.deepEqual(r.body.r, [[FIRE, 1]]);
  r = await bob.post('/api/social/chat/like', { id: gifMsg.id, on: true });   // the heart endpoint pages opened before still use
  assert.deepEqual(r.body.r, [[FIRE, 1], [HEART, 1]]);
  for (const bad of ['a', '1', JOY + JOY, '<b>']) assert.equal((await bob.post('/api/social/chat/react', { id: gifMsg.id, emoji: bad })).status, 400, bad);
  await sleep(600);
  assert.equal((await alice.get('/api/social/notifications')).body.items.filter((n) => n.actor === low(W.bob) && n.ref === `chat:${gifMsg.id}` && n.kind.startsWith('react:')).length, 1);
  assert.deepEqual((await bob.get(`/api/social/chat/mine?ids=${gifMsg.id},${replyMsg.id}`)).body.mine, { [gifMsg.id]: HEART });
  assert.deepEqual((await bob.get(`/api/social/chat/liked?ids=${gifMsg.id},${replyMsg.id}`)).body.ids, [gifMsg.id]);
  assert.equal((await anon.get(`/api/social/chat/mine?ids=${gifMsg.id}`)).status, 401);
  assert.equal((await carol.post('/api/social/chat/react', { id: gifMsg.id, emoji: JOY })).status, 403);   // no named pet, no reaction
  // the history carries all of it; a newcomer's first screen too
  let h = (await anon.get('/api/social/chat/history?room=square')).body.items;
  assert.deepEqual(h.find((m) => m.id === gifMsg.id).rx, [[FIRE, 1], [HEART, 1]]);
  assert.equal(h.find((m) => m.id === gifMsg.id).g.id, gif.id);
  assert.equal(h.find((m) => m.id === replyMsg.id).re.t, 'look');
  // alice deletes the original: the reply quotes nothing from it any more, in the history, the room and live
  r = await alice.post('/api/social/chat/delete', { id: gifMsg.id });
  assert.equal(r.status, 200);
  h = (await anon.get('/api/social/chat/history?room=square')).body.items;
  assert.deepEqual(h.find((m) => m.id === replyMsg.id).re, { id: gifMsg.id, gone: true });
  const late = anon.socket('/api/social/chat/ws?room=square'); await late.opened;
  const hello = await late.wait((m) => m.t === 'hello', 'hello');
  assert.deepEqual(hello.recent.find((m) => m.id === replyMsg.id).re, { id: gifMsg.id, gone: true });
  assert.equal((await bob.post('/api/social/chat/like', { id: gifMsg.id })).status, 404);
  room.close(); late.close();
});

test('DMs: a GIF, a reply to an earlier DM in the same conversation, and a reaction both tabs hear', async () => {
  await bob.post('/api/social/follow', { address: low(W.alice) });   // (the block test took the follows away)
  const aliceInbox = alice.socket('/api/social/inbox/ws'); await aliceInbox.opened;
  const bobInbox = bob.socket('/api/social/inbox/ws'); await bobInbox.opened;
  const gif = (await alice.get('/api/social/gifs')).body.items[0];
  let r = await alice.post('/api/social/dm/send', { to: low(W.bob), gif });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const first = r.body.m;
  assert.equal(first.g.id, gif.id); assert.equal(first.text, '');
  r = await bob.post('/api/social/dm/send', { to: low(W.alice), text: 'love it', replyTo: first.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.m.re, { id: first.id, a: low(W.alice), n: null, t: '', g: 1 });
  r = await bob.post('/api/social/dm/send', { to: low(W.alice), text: 'x', replyTo: gifMsg.id });   // a square message is not in this conversation
  assert.equal(r.status, 404);
  const JOY = String.fromCodePoint(0x1F602), HEART = String.fromCodePoint(0x2764, 0xFE0F);
  r = await bob.post('/api/social/dm/react', { id: first.id, emoji: JOY });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(await aliceInbox.wait((m) => m.t === 'dm_react' && m.id === first.id && m.by === low(W.bob) && m.emoji === JOY, 'the reaction, at alice'));
  assert.ok(await bobInbox.wait((m) => m.t === 'dm_react' && m.id === first.id, 'the reaction, in bob\'s other tabs'));
  assert.equal((await bob.post('/api/social/dm/react', { id: first.id, emoji: 'no' })).status, 400);
  assert.equal((await carol.post('/api/social/dm/react', { id: first.id, emoji: JOY })).status, 404);   // not her conversation
  r = await alice.post('/api/social/dm/like', { id: first.id, on: true });   // the old heart
  assert.equal(r.status, 200);
  const th = (await alice.get(`/api/social/dm/thread/${low(W.bob)}`)).body.items;
  assert.deepEqual(th.find((m) => m.id === first.id).rx, { [low(W.bob)]: JOY, [low(W.alice)]: HEART });
  assert.equal(th.at(-1).re.id, first.id);
  const t = (await bob.get('/api/social/dm/threads')).body.items.find((i) => i.with.address === low(W.alice));
  assert.equal(t.last.text, 'love it');
  aliceInbox.close(); bobInbox.close();
});

// ------------------------------------------------------------------ reports and admin
test('reports keep a copy; admin tools delete, mute, slow the room, ban with a purge; non-admins are refused', async () => {
  const msgs = (await anon.get('/api/social/chat/history')).body.items;
  const bobs = msgs.filter((m) => m.a === low(W.bob));
  let r = await alice.post('/api/social/report', { kind: 'chat', ref: bobs[0].id, reason: 'spam', note: 'test <script>x</script>' });
  assert.equal(r.status, 200);
  assert.equal((await alice.get('/api/social/admin/reports')).status, 403);
  assert.equal((await boss.signIn()).status, 200);
  const rep = (await boss.get('/api/social/admin/reports')).body.items[0];
  assert.equal(rep.snapshot.text, bobs[0].text); assert.equal(rep.target.address, low(W.bob));
  // delete
  r = await boss.post('/api/social/admin/delete', { id: bobs[0].id });
  assert.equal(r.status, 200);
  await reader.wait((m) => m.t === 'del' && m.ids.includes(bobs[0].id), 'the deletion');
  // mute
  r = await boss.post('/api/social/admin/mute', { address: low(W.bob), minutes: 5, reason: 'cool off' });
  assert.equal(r.status, 200);
  r = await bob.post('/api/social/chat', { text: 'am I muted' });
  assert.equal(r.status, 403); assert.ok(r.body.muted);
  r = await bob.post('/api/social/dm/send', { to: low(W.alice), text: 'x' });
  assert.equal(r.status, 403);
  await boss.post('/api/social/admin/unmute', { address: low(W.bob) });
  // slow mode
  r = await boss.post('/api/social/admin/slow', { seconds: 3 });
  assert.equal(r.body.slow, 3);
  await reader.wait((m) => m.t === 'slow' && m.s === 3, 'slow mode');
  await sleep(3100);
  r = await bob.post('/api/social/chat', { text: 'slow one' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await sleep(1300);
  r = await bob.post('/api/social/chat', { text: 'slow two' });
  assert.equal(r.status, 429); assert.match(r.body.error, /Slow mode/);
  await boss.post('/api/social/admin/slow', { seconds: 0 });
  // ban, with a purge: the session goes, the live socket is closed, everything they said leaves the square
  const bobSock = bob.socket('/api/social/chat/ws'); await bobSock.opened;
  await bobSock.wait((m) => m.t === 'hello');
  r = await boss.post('/api/social/admin/ban', { address: low(W.bob), days: 1, reason: 'test', purge: true });
  assert.equal(r.status, 200); assert.ok(r.body.purged >= 1);
  await waitFor(() => bobSock.closedWith === 4003, 'the kick');
  await reader.wait((m) => m.t === 'del_user' && m.a === low(W.bob), 'the purge');
  assert.equal((await bob.get('/api/social/me')).body.signedIn, false);
  assert.ok(!(await anon.get('/api/social/chat/history')).body.items.some((m) => m.a === low(W.bob)));
  const back = await new Client(W.bob).signIn();
  assert.equal(back.status, 403); assert.equal(back.body.banned, true);
  await boss.post('/api/social/admin/unban', { address: low(W.bob) });
  assert.equal((await new Client(W.bob).signIn()).status, 200);
  const log = (await boss.get('/api/social/admin/log')).body.items.map((x) => x.action);
  for (const a of ['delete', 'mute', 'unmute', 'slow', 'ban', 'unban']) assert.ok(log.includes(a), a);
  // the admin's own filter words
  await boss.post('/api/social/admin/filter', { word: 'rugpuller' });
  await sleep(1300);
  r = await alice.post('/api/social/chat', { text: 'what a RUGPULLER' });
  assert.equal(r.status, 400);
});

// ------------------------------------------------------------------ a banned account's pet (security review, 2026-09-27)
// the gate's refresh is three a minute per address: a test that asks more often waits its turn
async function gateOf(c) {
  for (let i = 0; i < 4; i++) { const r = await c.post('/api/social/gate/refresh', {}); if (r.status !== 429) { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; } await sleep(21_000); }
  throw new Error('the gate refresh stayed rate-limited');
}
test('a banned account\'s named pet lets nobody else in until the ban ends; a pet opens the gate for one wallet at a time', async () => {
  const give = async (from, to, id) => pub.waitForTransactionReceipt({ hash: await wallet(from).writeContract({ address: INVERSE, abi: GAME, functionName: 'transferFrom', args: [from.address, to.address, BigInt(id)], gas: 300_000n }) });
  assert.equal((await bob.signIn()).status, 200);   // the earlier ban ended this client's session
  assert.equal((await gateOf(bob)).ok, true);
  let r = await boss.post('/api/social/admin/ban', { address: low(W.bob), days: 1, reason: 'pet test' });
  assert.equal(r.status, 200);
  // the banned account hands its named pet to a fresh wallet: it does not get that wallet in
  await give(W.bob, W.erin, bobFrok);
  assert.equal((await erin.signIn()).status, 200);
  assert.equal((await gateOf(erin)).ok, false, 'a banned pet opens nothing');
  // unbanned, the pet works again, for whoever holds it
  await boss.post('/api/social/admin/unban', { address: low(W.bob) });
  assert.equal((await gateOf(erin)).ok, true);
  // and it goes back to bob: bob is in, and erin, whose yes was only minutes old, is not (without asking again)
  await give(W.erin, W.bob, bobFrok);
  assert.equal((await bob.signIn()).status, 200);   // this test's ban ended his session again
  assert.equal((await gateOf(bob)).ok, true);
  await sleep(1300);
  r = await erin.post('/api/social/chat', { text: 'still in?' });
  assert.equal(r.status, 403, 'one pet, one wallet at a time'); assert.equal(r.body.gate, true);
});

// ------------------------------------------------------------------ selling the last named pet
test('selling your last named pet takes the access away', async () => {
  // a fresh yes first: the sale must end it at once, not five minutes later
  assert.equal((await gateOf(alice)).ok, true);
  const hash = await wallet(W.alice).writeContract({ address: INVERSE, abi: GAME, functionName: 'transferFrom', args: [W.alice.address, W.erin.address, BigInt(aliceFrok)], gas: 300_000n });
  await pub.waitForTransactionReceipt({ hash });
  // the buyer is let in by that pet, and that alone takes the seller's yes away
  assert.equal((await gateOf(erin)).ok, true);
  await sleep(1300);
  const r = await alice.post('/api/social/chat', { text: 'still here?' });
  assert.equal(r.status, 403); assert.equal(r.body.gate, true);
  assert.equal((await gateOf(alice)).ok, false);
  // and the profile's chosen avatar is no longer theirs: the bubble does not go over a pet they sold
  const p = (await anon.get('/api/social/profile/alice_test')).body;
  assert.equal(p.named, false);
});

// ------------------------------------------------------------------ sockets
test('websockets: a foreign Origin is refused; the inbox needs a session; the room counts who is here', async () => {
  const evil = anon.socket('/api/social/chat/ws', { origin: 'https://evil.example' });
  await assert.rejects(evil.opened);
  const noSession = anon.socket('/api/social/inbox/ws');
  await assert.rejects(noSession.opened);
  const who = (await anon.get('/api/social/chat/who')).body;
  assert.ok(who.online >= 1);
  const s = dave.socket('/api/social/chat/ws'); await s.opened;
  const hello = await s.wait((m) => m.t === 'hello');
  assert.ok(Array.isArray(hello.recent));
  await reader.wait((m) => m.t === 'presence' && m.join.some((p) => p.a === low(W.dave)), 'dave joining');
  s.close();
  await reader.wait((m) => m.t === 'presence' && m.leave.includes(low(W.dave)), 'dave leaving');
});

// ------------------------------------------------------------------ uploaded pictures (social/pics.js)
// Test pictures are drawn here, as PNGs, so no such file lives in the repo.
import { deflateSync, crc32 } from 'node:zlib';
function png(w, h, px, extra = []) {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y); const o = y * row + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra.map(([t, d]) => chunk(t, Buffer.from(d))), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// a soft sunset with a pink sun, carrying a location in its metadata that must not survive
const sunset = (w, h) => png(w, h, (x, y) => { const d = Math.hypot(x - w * 0.5, y - h * 0.55); return d < h * 0.22 ? [240, 120, 160] : [40 + (180 * y) / h, 30 + (60 * y) / h, 90 + (40 * x) / w]; }, [['tEXt', 'Comment\0GPS-SECRET 51.5N 0.1W'], ['eXIf', 'MM\0*GPS-SECRET']]);
// a hate symbol (a swastika on a white disc on red), which the screen must hold back
const hateful = () => png(420, 420, (x, y) => {
  const cx = x - 210, cy = y - 210;
  if (Math.hypot(cx, cy) > 190) return [200, 20, 20];
  const r = Math.SQRT1_2, u = (cx + cy) * r, v = (cy - cx) * r, s = 18, L = 110;
  const bar = (Math.abs(u) < s && Math.abs(v) < L) || (Math.abs(v) < s && Math.abs(u) < L)
    || (v < -L + 2 * s && v > -L && u > 0 && u < L) || (u > L - 2 * s && u < L && v > 0 && v < L)
    || (v > L - 2 * s && v < L && u < 0 && u > -L) || (u < -L + 2 * s && u > -L && v < 0 && v > -L);
  return bar ? [0, 0, 0] : [255, 255, 255];
});
const MEDIA = `http://127.0.0.1:${W_PORT}/__media`;
async function up(client, kind, body, type = 'image/png', extra = {}) {
  const r = await fetch(`${API}/api/social/pic?kind=${kind}`, { method: 'POST', headers: { ...client.headers(), 'content-type': type, ...extra }, body });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const vp8Size = (b) => { const i = b.indexOf('VP8 '); const d = b.subarray(i + 8); return [d.readUInt16LE(6) & 0x3fff, d.readUInt16LE(8) & 0x3fff]; };

test('pictures: only a signed-in wallet holding a named pet uploads, from the site, and only JPG, PNG or WebP', async () => {
  assert.equal((await up(anon, 'avatar', sunset(300, 300))).status, 401);
  assert.equal((await fay.signIn()).status, 200);
  const gated = await up(fay, 'avatar', sunset(300, 300));
  assert.equal(gated.status, 403); assert.equal(gated.body.gate, true);
  const id = await mintFrok(W.fay); await nameFrok(W.fay, id, 'Pixel');
  await fay.post('/api/social/gate/refresh', {});
  assert.equal((await up(fay, 'avatar', sunset(300, 300), 'image/png', { origin: 'https://evil.example' })).status, 403);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script></svg>';
  assert.equal((await up(fay, 'avatar', svg, 'image/svg+xml')).status, 415);
  assert.equal((await up(fay, 'avatar', svg, 'image/png')).status, 415, 'an SVG that says it is a PNG');
  assert.equal((await up(fay, 'avatar', '<html><script>alert(1)</script></html>', 'image/jpeg')).status, 415);
  assert.equal((await up(fay, 'avatar', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'), 'image/png')).status, 415);
  assert.equal((await up(fay, 'avatar', sunset(20, 20))).status, 415, 'too small');
  assert.equal((await up(fay, 'wallpaper', sunset(300, 300))).status, 400);
});

let fayPic, fayBanner;
test('pictures: a clean picture is remade by Cloudflare, screened, and live at once on its own host, nothing riding along', async () => {
  const r = await up(fay, 'avatar', sunset(700, 480));
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status, 'live', 'the screen passed a sunset');
  fayPic = r.body.id;
  const p = (await anon.get(`/api/social/profile/${low(W.fay)}`)).body;
  assert.equal(p.pic, fayPic);
  const c = (await anon.get(`/api/social/cards?a=${low(W.fay)}`)).body;
  assert.equal(c.items[0].pic, fayPic);
  const img = await fetch(`${MEDIA}/p/${fayPic}.webp`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.match(img.headers.get('content-security-policy'), /default-src 'none'; sandbox/);
  assert.equal(img.headers.get('cross-origin-resource-policy'), 'same-site');
  assert.equal(img.headers.get('set-cookie'), null);
  const bytes = Buffer.from(await img.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF'); assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  assert.ok(!bytes.includes('GPS-SECRET'), 'the metadata did not survive');
  assert.deepEqual(vp8Size(bytes), [512, 512]);
  // the media host answers nothing else: not the API, not a guess, not a POST
  assert.equal((await fetch(`${MEDIA}/api/social/me`, { headers: { cookie: fay.cookie } })).status, 404);
  assert.equal((await fetch(`${MEDIA}/p/${'0'.repeat(32)}.webp`)).status, 404);
  assert.equal((await fetch(`${MEDIA}/p/${fayPic}.webp`, { method: 'POST' })).status, 405);
  const b = await up(fay, 'banner', sunset(900, 900));
  assert.equal(b.body.status, 'live'); fayBanner = b.body.id;
  assert.deepEqual(vp8Size(Buffer.from(await (await fetch(`${MEDIA}/p/${fayBanner}.webp`)).arrayBuffer())), [1500, 500]);
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.bannerPic, fayBanner);
});

test('pictures: what the screen flags waits for an admin; only its owner and admins can see it; the admin decides', async () => {
  const r = await up(fay, 'avatar', hateful());
  assert.equal(r.status, 200); assert.equal(r.body.status, 'held', 'the screen held a swastika back'); assert.equal(r.body.flagged, true);
  const held = r.body.id;
  const mine = (await fay.get(`/api/social/profile/${low(W.fay)}`)).body;
  assert.equal(mine.held.avatar, held); assert.equal(mine.pic, fayPic, 'the old picture stays up meanwhile');
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.held, undefined, 'nobody else is told');
  assert.equal((await fetch(`${MEDIA}/p/${held}.webp`)).status, 404);
  const own = await fetch(`${API}/api/social/pic/view/${held}`, { headers: fay.headers() });
  assert.equal(own.status, 200); assert.match(own.headers.get('content-disposition'), /^attachment/); assert.match(own.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(`${API}/api/social/pic/view/${held}`, { headers: carol.headers() })).status, 404);
  assert.equal((await fetch(`${API}/api/social/pic/view/${held}`)).status, 401);
  assert.equal((await fetch(`${API}/api/social/pic/view/${held}`, { headers: boss.headers() })).status, 200);
  const q = (await boss.get('/api/social/admin/pics?status=held')).body;
  const item = q.items.find((i) => i.id === held);
  assert.equal(item.screen, 'unsafe'); assert.equal(item.who.address, low(W.fay)); assert.ok(q.held >= 1);
  assert.equal((await boss.get('/api/social/me')).body.picsWaiting >= 1, true);
  assert.equal((await carol.post('/api/social/admin/pic-refuse', { id: held })).status, 403);
  assert.equal((await boss.post('/api/social/admin/pic-refuse', { id: held })).status, 200);
  assert.equal((await fetch(`${API}/api/social/pic/view/${held}`, { headers: fay.headers() })).status, 404);
  const notes = (await fay.get('/api/social/notifications')).body.items;
  assert.ok(notes.some((n) => n.kind === 'pic' && n.ref === 'avatar:refused'));
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.pic, fayPic);
  // review mode: every picture waits, clean or not; approving puts it up and retires the old one
  assert.equal((await boss.post('/api/social/admin/pics-mode', { mode: 'review' })).status, 200);
  const r2 = await up(fay, 'avatar', sunset(512, 512));
  assert.equal(r2.body.status, 'held'); assert.equal(r2.body.flagged, undefined);
  assert.equal((await boss.post('/api/social/admin/pic-approve', { id: r2.body.id })).status, 200);
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.pic, r2.body.id);
  assert.equal((await fetch(`${MEDIA}/p/${r2.body.id}.webp`)).status, 200);
  assert.equal((await fetch(`${MEDIA}/p/${fayPic}.webp`)).status, 404, 'the old one is gone');
  assert.ok((await fay.get('/api/social/notifications')).body.items.some((n) => n.kind === 'pic' && n.ref === 'avatar:live'));
  fayPic = r2.body.id;
  // an admin can take a live picture down too
  assert.equal((await boss.post('/api/social/admin/pic-refuse', { id: fayBanner })).status, 200);
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.bannerPic, null);
  assert.equal((await fetch(`${MEDIA}/p/${fayBanner}.webp`)).status, 404);
  const logged = (await boss.get('/api/social/admin/log')).body.items.map((l) => l.action);
  for (const a of ['pic-refuse', 'pic-approve', 'pics-mode']) assert.ok(logged.includes(a), a);
});

test('pictures: off stops uploads and serving at once; owners take theirs off; a reset takes them down; a daily cap', async () => {
  assert.equal((await boss.post('/api/social/admin/pics-mode', { mode: 'off' })).status, 200);
  assert.equal((await up(fay, 'avatar', sunset(400, 400))).status, 403);
  assert.equal((await fetch(`${MEDIA}/p/${fayPic}.webp`)).status, 404, 'nothing uploaded is served while off');
  assert.equal((await boss.post('/api/social/admin/pics-mode', { mode: 'screen' })).status, 200);
  assert.equal((await fetch(`${MEDIA}/p/${fayPic}.webp`)).status, 200, 'and back');
  assert.equal((await fay.post('/api/social/pic/remove', { kind: 'avatar' })).status, 200);
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.pic, null);
  assert.equal((await fetch(`${MEDIA}/p/${fayPic}.webp`)).status, 404);
  const b = await up(fay, 'banner', sunset(1600, 600));
  assert.equal(b.body.status, 'live');
  assert.equal((await boss.post('/api/social/admin/reset-profile', { address: low(W.fay) })).status, 200);
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.bannerPic, null);
  assert.equal((await fetch(`${MEDIA}/p/${b.body.id}.webp`)).status, 404);
  // twelve a day (fay has put up five so far; refused requests do not count)
  let last;
  for (let i = 0; i < 8; i++) last = await up(fay, 'avatar', sunset(100 + i, 100));
  assert.equal(last.status, 429);
});

test('link cards: a JPEG on its own path, shown anywhere, the /u/ preview uses it, a cap of its own', async () => {
  // fay spent her twelve pictures today in the test above: a card has its own allowance
  const r = await up(fay, 'card', sunset(1200, 630));
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status, 'live');
  const card = r.body.id;
  const res = await fetch(`${MEDIA}/c/${card}.jpg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin', 'a link card may be shown on any site');
  assert.match(res.headers.get('content-security-policy'), /sandbox/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
  assert.ok(!bytes.includes('GPS-SECRET') && !bytes.includes('Exif'), 'no metadata');
  // the paths do not cross: a card is not a picture, a picture is not a card
  assert.equal((await fetch(`${MEDIA}/p/${card}.webp`)).status, 404);
  assert.equal((await fetch(`${MEDIA}/c/${card}.webp`)).status, 404);
  const pic = await up(boss, 'avatar', sunset(400, 400));
  assert.equal((await fetch(`${MEDIA}/c/${pic.body.id}.jpg`)).status, 404);
  // their profile knows it; its owner is told when it was made
  assert.equal((await anon.get(`/api/social/profile/${low(W.fay)}`)).body.card, card);
  const mine = (await fay.get(`/api/social/profile/${low(W.fay)}`)).body;
  assert.equal(mine.held.card.id, card); assert.equal(mine.held.card.status, 'live'); assert.ok(mine.updatedAt > 0);
  assert.ok(mine.held.card.at > mine.updatedAt, 'a card does not make its own profile look changed (or it would chase itself)');
  // the link preview
  const html = await (await fetch(`${API}/u/${low(W.fay)}`)).text();
  assert.match(html, new RegExp(`og:image" content="https://[^"]+/c/${card}\\.jpg"`));
  // a newer card replaces it
  const r2 = await up(fay, 'card', sunset(1300, 700));
  assert.equal(r2.body.status, 'live');
  assert.equal((await fetch(`${MEDIA}/c/${card}.jpg`)).status, 404);
});

// ------------------------------------------------------------------ roles (2026-09-28)
test('roles: admins make them and hand them out; everyone reads them in one go, live; nobody else can', async () => {
  const frog = String.fromCodePoint(0x1F438), crown = String.fromCodePoint(0x1F451);
  const rb = new Client(W.admin);   // its own address: the admin tests before this spent the shared one's POSTs
  assert.equal((await rb.signIn()).status, 200);
  // nobody but an admin
  assert.equal((await alice.post('/api/social/admin/role-save', { name: 'Hacker', emoji: frog, color: 'pink' })).status, 403);
  assert.equal((await alice.get('/api/social/admin/roles')).status, 403);
  assert.equal((await anon.post('/api/social/admin/role-give', { id: 1, who: low(W.alice) })).status, 401);
  let r = await anon.get('/api/social/roles');
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const before = r.body.roles.length;
  // what a role must be
  assert.equal((await rb.post('/api/social/admin/role-save', { name: '', emoji: frog, color: 'pink' })).status, 400);
  assert.equal((await rb.post('/api/social/admin/role-save', { name: 'OG', emoji: 'ab', color: 'pink' })).status, 400);
  assert.equal((await rb.post('/api/social/admin/role-save', { name: 'OG', emoji: frog + frog, color: 'pink' })).status, 400);
  assert.equal((await rb.post('/api/social/admin/role-save', { name: 'OG', emoji: frog, color: 'plaid' })).status, 400);
  assert.equal((await rb.get('/api/social/admin/role-save')).status, 405);
  // make two; every open tab hears about it
  r = await rb.post('/api/social/admin/role-save', { name: 'OG', emoji: frog, color: 'gold' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const og = r.body.id;
  await reader.wait((m) => m.t === 'roles' && m.v === r.body.snap.v, 'the roles ping');
  assert.equal((await rb.post('/api/social/admin/role-save', { name: 'og', emoji: crown, color: 'pink' })).status, 409, 'names are unique, any case');
  const mf = (await rb.post('/api/social/admin/role-save', { name: 'Mayor friend', emoji: crown, color: 'violet' })).body.id;
  // give by name and by address; giving twice is once
  const aliceName = (await anon.get(`/api/social/profile/${low(W.alice)}`)).body.name;
  r = await rb.post('/api/social/admin/role-give', { id: og, who: aliceName ?? low(W.alice) });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.address, low(W.alice));
  assert.equal((await rb.post('/api/social/admin/role-give', { id: mf, who: W.alice.address })).status, 200);
  r = await rb.post('/api/social/admin/role-give', { id: mf, who: low(W.alice) });
  assert.equal(r.status, 200); assert.equal(r.body.snap, null);
  assert.equal((await rb.post('/api/social/admin/role-give', { id: og, who: 'nobody_here_x' })).status, 404);
  assert.equal((await rb.post('/api/social/admin/role-give', { id: 999999, who: low(W.alice) })).status, 404);
  // everyone reads it: the roles in order, and who holds which
  r = await anon.get('/api/social/roles');
  assert.deepEqual(r.body.roles.slice(-2).map((x) => [x.name, x.emoji, x.color]), [['OG', frog, 'gold'], ['Mayor friend', crown, 'violet']]);
  assert.deepEqual(Object.fromEntries(r.body.holders)[low(W.alice)], [og, mf]);
  // the order decides which emoji go by a name first
  await rb.post('/api/social/admin/role-move', { id: mf, dir: -1 });
  r = await anon.get('/api/social/roles');
  assert.deepEqual(Object.fromEntries(r.body.holders)[low(W.alice)], [mf, og]);
  // an edit keeps the holders
  assert.equal((await rb.post('/api/social/admin/role-save', { id: og, name: 'OG frens', emoji: frog, color: 'mint' })).status, 200);
  r = await anon.get('/api/social/roles');
  assert.deepEqual(r.body.roles.find((x) => x.id === og), { id: og, name: 'OG frens', emoji: frog, color: 'mint' });
  assert.ok(Object.fromEntries(r.body.holders)[low(W.alice)].includes(og));
  // the admin's own view: every role with its holders, and one person's roles
  r = await rb.get('/api/social/admin/roles');
  assert.equal(r.body.roles.find((x) => x.id === og).members[0].address, low(W.alice));
  r = await rb.get(`/api/social/admin/roles?a=${low(W.alice)}`);
  assert.deepEqual(r.body.ids.sort(), [og, mf].sort());
  // take one away; delete the other (it comes off everyone)
  assert.equal((await rb.post('/api/social/admin/role-take', { id: og, address: low(W.alice) })).status, 200);
  assert.equal((await rb.post('/api/social/admin/role-delete', { id: mf })).status, 200);
  r = await anon.get('/api/social/roles');
  assert.equal(r.body.roles.length, before + 1);
  assert.equal(Object.fromEntries(r.body.holders)[low(W.alice)], undefined);
  // at most five each
  const extra = [];
  for (let i = 0; i < 5; i++) extra.push((await rb.post('/api/social/admin/role-save', { name: `R${i}`, emoji: frog, color: 'sky' })).body.id);
  for (const id of extra) assert.equal((await rb.post('/api/social/admin/role-give', { id, who: low(W.carol) })).status, 200);
  r = await rb.post('/api/social/admin/role-give', { id: og, who: low(W.carol) });
  assert.equal(r.status, 400); assert.match(r.body.error, /at most 5/);
  for (const id of extra) await rb.post('/api/social/admin/role-delete', { id });
  const log = (await rb.get('/api/social/admin/log')).body.items.map((x) => x.action);
  for (const a of ['role_new', 'role_edit', 'role_give', 'role_take', 'role_delete']) assert.ok(log.includes(a), a);
});

test('signing out ends the session', async () => {
  const r = await dave.post('/api/social/auth/logout', {});
  assert.match(r.setCookie, /Max-Age=0/);
  assert.equal((await dave.get('/api/social/me')).body.signedIn, false);
  reader.close();
});
