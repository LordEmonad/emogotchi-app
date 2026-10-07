// A private copy of the whole stack, for the trailer's scenes that need people: an ANVIL FORK of Monad (8549), the API
// Worker under `wrangler dev --local` with a fresh D1 and its Durable Objects (8796), and the site's build served on
// http://localhost:5392 with /api/social (and its websockets) passed to that Worker, /api/drip answered on the fork, and
// every other /api read passed to the live site. Three throwaway people with fresh keys (never anvil's defaults), each
// with free pets minted and named on the fork. Nothing here can reach mainnet or production's database.
//
//   cd apps/web && VITE_RPC_URL=http://127.0.0.1:8549 VITE_MEDIA_ORIGIN=http://localhost:8796/__media NODE_ENV=development \
//     npx vite build --mode development --outDir ../../trailer/dist-fork --emptyOutDir
//   node tools/trailer/world.mjs            (stays up; writes trailer/world.json when ready; Ctrl-C or kill to stop)
//   BASE=http://localhost:5392 node tools/trailer/shots.mjs <a world take>
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = resolve(process.env.DIST ?? join(ROOT, 'trailer/dist-fork'));
const STATE = join(ROOT, 'trailer/world');
const FOUNDRY = join(homedir(), '.foundry/bin');
const RPC_PORT = 8549, W_PORT = 8796, SITE_PORT = 5392;
const RPC = `http://127.0.0.1:${RPC_PORT}`, SITE = `http://localhost:${SITE_PORT}`, API = `http://127.0.0.1:${W_PORT}`;
const LIVE = 'https://emogotchi.emonad.lol';
const GAME = {
  frok: '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', sahur: '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7',
  thiccums: '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec', r3tards: '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e',
  emonad: '0xcD4BF1Ea169703f810dA87680a1B8FdA64adcdF7',
};
const ABI = parseAbi(['function mint() returns (uint256)', 'function setName(uint256 id, string newName) payable', 'function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)']);
const ITEMS = '0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91';
const DRIPPER = '0x00036BAaf671aF375f7f22664b4086b9D4bb9EF8';   // the starter wallet's address, impersonated on the fork

// who lives in this world: [handle, [pet collection, pet name]...]
const CAST = {
  main: { name: 'emo_kid', bio: 'three pets and no free time', pets: [['frok', 'Pickle'], ['sahur', 'Plank'], ['thiccums', 'Blub']] },
  tung: { name: 'tungtung', bio: 'tung tung tung', pets: [['sahur', 'Bonk']] },
  frog: { name: 'frokfan', bio: 'slap enjoyer', pets: [['frok', 'Ribbit']] },
};

const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const rpc = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
async function until(fn, what, ms = 120_000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await sleep(400); } throw new Error(`timed out: ${what}`); }

const procs = [];
const stop = () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stop);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });

// ---- the chain ----
procs.push(spawn(join(FOUNDRY, 'anvil'), ['--fork-url', 'https://rpc.monad.xyz', '--chain-id', '143', '--port', String(RPC_PORT), '--silent', '--code-size-limit', '131072', '--auto-impersonate'], { stdio: 'ignore' }));
await until(() => rpc('eth_blockNumber'), 'anvil');
await rpc('anvil_setBalance', [DRIPPER, '0x3635C9ADC5DEA00000']);
log('fork up');

// ---- the Worker ----
for (const db of ['emotown-social', 'emotown-media']) execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', db, '--local', '--persist-to', STATE], { cwd: join(ROOT, 'worker'), stdio: 'ignore' });
const w = spawn('npx', ['wrangler', 'dev', '--local', '--persist-to', STATE, '--port', String(W_PORT), '--ip', '127.0.0.1',
  '--var', `SITE_ORIGIN:${SITE}`, '--var', `SIWE_DOMAIN:localhost:${SITE_PORT}`, '--var', `RPC_URL:${RPC}`, '--var', 'ADMINS:0x0000000000000000000000000000000000000001',
  '--var', 'MEDIA_DEV:1', '--var', 'SITE_DIRECT:1', '--var', 'PIC_SCREEN:pass'], { cwd: join(ROOT, 'worker') });
const wlog = createWriteStream(join(STATE, 'worker.log')); w.stdout.pipe(wlog); w.stderr.pipe(wlog); procs.push(w);

// ---- the site ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const read = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    if (p.startsWith('/api/social')) {
      // the Worker, as the site's own origin would reach it (wrangler dev wants its own Host)
      const headers = { ...req.headers, host: `127.0.0.1:${W_PORT}` };
      delete headers.connection; delete headers['accept-encoding'];
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await read(req);
      const up = await fetch(API + p + url.search, { method: req.method, headers, body, redirect: 'manual' });
      const out = {};
      for (const [k, v] of up.headers) if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v;
      const cookies = up.headers.getSetCookie?.() ?? [];
      if (cookies.length) out['set-cookie'] = cookies;
      res.writeHead(up.status, out);
      res.end(Buffer.from(await up.arrayBuffer()));
      return;
    }
    if (p === '/api/drip' && req.method === 'POST') {
      // the starter, on the fork: what worker/drip.js does on mainnet (0.5 MON since 2026-10-02, once, to an account that holds nothing)
      const { address } = JSON.parse((await read(req)).toString() || '{}');
      const amount = parseEther('0.5');
      const [nonce, bal] = await Promise.all([pub.getTransactionCount({ address }), pub.getBalance({ address })]);
      const json = (b, s = 200) => { res.writeHead(s, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(b)); };
      if (nonce > 0) return json({ ok: false, reason: 'used' }, 409);
      if (bal >= amount) return json({ ok: false, reason: 'funded' }, 409);
      const hash = await rpc('eth_sendTransaction', [{ from: DRIPPER, to: address, value: '0x' + amount.toString(16), gas: '0x5208' }]);
      log('starter sent to', address);
      return json({ ok: true, hash, amount: amount.toString() });
    }
    if (p.startsWith('/api/')) {
      if (req.method !== 'GET') { res.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false}'); return; }
      const up = await fetch(LIVE + p + url.search, { headers: { accept: req.headers.accept ?? '*/*' } });
      res.writeHead(up.status, { 'content-type': up.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
      res.end(Buffer.from(await up.arrayBuffer()));
      return;
    }
    let path = normalize(join(DIST, decodeURIComponent(p)));
    if (!path.startsWith(DIST)) { res.writeHead(403).end(); return; }
    let s = await stat(path).catch(() => null);
    if (s?.isDirectory()) { path = join(path, 'index.html'); s = await stat(path).catch(() => null); }
    if (!s) path = join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(path));
  } catch (e) { res.writeHead(500).end(String(e)); }
});
// websockets (the square, the inbox): piped to the Worker byte for byte, with the Host it expects
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/api/social')) { socket.destroy(); return; }
  const up = connect(W_PORT, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${/^host$/i.test(req.rawHeaders[i]) ? `127.0.0.1:${W_PORT}` : req.rawHeaders[i + 1]}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    socket.pipe(up); up.pipe(socket);
  });
  up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy());
});
await new Promise((r) => server.listen(SITE_PORT, '127.0.0.1', r));
procs.push({ kill: () => server.close() });
await until(async () => (await fetch(`${API}/api/social/me`)).ok, 'the Worker');
log('worker and site up');

// ---- the people and their pets ----
const people = {};
for (const [who, c] of Object.entries(CAST)) {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  await rpc('anvil_setBalance', [account.address, '0x3635C9ADC5DEA00000']);
  const pets = [];
  for (const [col, name] of c.pets) {
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: GAME[col], abi: ABI, functionName: 'mint', gas: 400000n }) });
    const n = await pub.readContract({ address: GAME[col], abi: ABI, functionName: 'balanceOf', args: [account.address] });
    const id = Number(await pub.readContract({ address: GAME[col], abi: ABI, functionName: 'tokenOfOwnerByIndex', args: [account.address, n - 1n] }));
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: GAME[col], abi: ABI, functionName: 'setName', args: [BigInt(id), name], value: parseEther('10'), gas: 400000n }) });
    pets.push({ col, id, name });
  }
  // the main character also holds an item to send: the Backrooms theme (free, no gate)
  if (who === 'main') await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: ITEMS, abi: parseAbi(['function claim(uint256 id, uint32 qty, bytes gateData) payable']), functionName: 'claim', args: [7n, 1, '0x'], gas: 600000n }) });
  // sign in, as the site does, and take the session
  const say = async (path, body, cookie) => {
    const r = await fetch(`${SITE}/api/social${path}`, { method: body ? 'POST' : 'GET', headers: { origin: SITE, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    if (!r.ok) throw new Error(`${path}: ${r.status} ${text.slice(0, 200)}`);
    return { json: text ? JSON.parse(text) : null, cookie: (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ') };
  };
  const { json: { message } } = await say(`/auth/nonce?address=${account.address}`);
  const { cookie } = await say('/auth/verify', { message, signature: await account.signMessage({ message }) });
  await say('/profile', { name: c.name, bio: c.bio, avatar: { col: pets[0].col, id: pets[0].id } }, cookie);
  people[who] = { key, address: account.address, name: c.name, pets, cookie };
  log(who, account.address, pets.map((p) => `${p.col} #${p.id} ${p.name}`).join(', '));
}
// everybody follows everybody, so anyone may message anyone
for (const a of Object.values(people)) for (const b of Object.values(people)) if (a !== b) {
  await fetch(`${SITE}/api/social/follow`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', cookie: a.cookie }, body: JSON.stringify({ address: b.address }) });
}
// a few lines already said in the square, so it is not an empty room
const post = (who, text) => fetch(`${SITE}/api/social/chat`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', cookie: people[who].cookie }, body: JSON.stringify({ room: 'square', text }) }).then((r) => r.ok || r.text().then((t) => log('chat refused', t.slice(0, 120))));
for (const [who, text] of [['frog', 'Ribbit took a bath and hated it'], ['tung', 'Bonk has not stopped tunging since breakfast'], ['main', 'Blub bounced so hard the room shook'], ['frog', 'anyone at the tavern tonight?']]) { await post(who, text); await sleep(1500); }
writeFileSync(join(ROOT, 'trailer/world.json'), JSON.stringify({ site: SITE, rpc: RPC, api: API, people, stranger: privateKeyToAccount(generatePrivateKey()).address }, null, 1));
log('world ready:', SITE);
setInterval(() => {}, 1 << 30);
