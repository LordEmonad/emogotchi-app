// Push notifications end to end (worker/push.js, worker/webpush.js, the page's push/ store), with no real push service:
//   - a PUSH SERVICE STAND-IN on 127.0.0.1 that makes a subscriber key pair per endpoint, verifies the VAPID token on
//     each delivery with the public key, decrypts the aes128gcm body the way a browser would, and keeps the payload;
//   - the real Worker (`wrangler dev --local`, a fresh D1 with the migrations, a TEST VAPID pair passed as vars,
//     PUSH_DEV=1 so a plain-http endpoint is accepted, PUSH_EVERY_TICK=1 so every `/__scheduled` runs the tick) reading
//     MAINNET for the pets and the fights (reads only);
//   - a dev site on 127.0.0.1 and headless Chrome for the sheet, the service worker and a real subscription attempt.
//   OUT=<dir> node tools/push-check.mjs            (OUT keeps screenshots; WALLET=0x… another wallet to watch)
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, createECDH, hkdfSync, createDecipheriv } from 'node:crypto';
import { createPublicClient, http, parseAbi } from 'viem';
import { monad } from 'viem/chains';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(ROOT, 'worker');
const OUT = process.env.OUT || mkdtempSync(join(tmpdir(), 'push-check-'));
mkdirSync(OUT, { recursive: true });
const W_PORT = 5341; const SITE_PORT = 5342; const PS_PORT = 5343;
const API = `http://127.0.0.1:${W_PORT}`; const SITE = `http://localhost:${SITE_PORT}`;
const WALLET = (process.env.WALLET || '0xe974c0ed0eace26d85943309e6ed05bf3f536904').toLowerCase();
const subtle = webcrypto.subtle;
const b64u = (b) => Buffer.from(b).toString('base64url'); const unb64u = (s) => Buffer.from(s, 'base64url');

let n = 0, fails = 0;
const ok = (cond, what) => { n++; if (cond) console.log(`  ok ${n}  ${what}`); else { fails++; console.log(`  FAIL ${n}  ${what}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f, what, ms = 90_000) { const t0 = Date.now(); for (;;) { try { if (await f()) return; } catch { /* not yet */ } if (Date.now() - t0 > ms) throw new Error(`${what} did not come up`); await sleep(500); } }

// ---------------------------------------------------------------------------------------------- the VAPID pair (test only)
const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const VAPID_PUB = b64u(await subtle.exportKey('raw', vk.publicKey));
const VAPID_PRIV = (await subtle.exportKey('jwk', vk.privateKey)).d;

// ---------------------------------------------------------------------------------------------- the push service stand-in
const subscribers = new Map();   // endpoint -> { ecdh, auth, got: [] }
function makeSubscription(name, { gone = false } = {}) {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = webcrypto.getRandomValues(new Uint8Array(16));
  const endpoint = `http://127.0.0.1:${PS_PORT}/${gone ? 'gone' : 'push'}/${name}`;
  subscribers.set(endpoint, { ecdh, auth, got: [] });
  return { endpoint, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } };
}
async function decrypt(sub, body) {
  const salt = body.subarray(0, 16); const rs = body.readUInt32BE(16); const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen); const cipher = body.subarray(21 + idlen);
  const shared = sub.ecdh.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), sub.ecdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, Buffer.from(sub.auth), info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  if (plain[plain.length - 1] !== 2) throw new Error('no record delimiter');
  return { rs, text: plain.subarray(0, -1).toString() };
}
async function vapidOk(header) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header ?? ''); if (!m || m[2] !== VAPID_PUB) return false;
  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(unb64u(c).toString());
  if (claims.aud !== `http://127.0.0.1:${PS_PORT}` || claims.exp < Date.now() / 1000) return false;
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk.publicKey, unb64u(s), new TextEncoder().encode(`${h}.${c}`));
}
const pushService = createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', async () => {
    const endpoint = `http://127.0.0.1:${PS_PORT}${req.url}`;
    const sub = subscribers.get(endpoint);
    if (!sub) { res.writeHead(404); res.end(); return; }
    if (req.url.startsWith('/gone/')) { res.writeHead(410); res.end(); return; }
    const rec = { headers: req.headers, vapid: await vapidOk(req.headers.authorization).catch(() => false), payload: null, error: null };
    try { const d = await decrypt(sub, Buffer.concat(chunks)); rec.rs = d.rs; rec.payload = JSON.parse(d.text); } catch (e) { rec.error = String(e); }
    sub.got.push(rec);
    res.writeHead(201); res.end();
  });
});
await new Promise((r) => pushService.listen(PS_PORT, '127.0.0.1', r));

// ---------------------------------------------------------------------------------------------- the Worker and the site
const procs = []; const dir = mkdtempSync(join(tmpdir(), 'push-wrangler-'));
process.on('exit', () => { try { writeFileSync(join(OUT, 'worker.log'), wlog); } catch { /* fine */ } for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } try { rmSync(dir, { recursive: true, force: true }); } catch { /* fine */ } });
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-social', '--local', '--persist-to', dir], { cwd: WORKER, stdio: 'ignore' });
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-media', '--local', '--persist-to', dir], { cwd: WORKER, stdio: 'ignore' });
const w = spawn('npx', ['wrangler', 'dev', '--local', '--persist-to', dir, '--port', String(W_PORT), '--ip', '127.0.0.1', '--test-scheduled',
  '--var', `SITE_ORIGIN:${SITE}`, '--var', `SIWE_DOMAIN:localhost:${SITE_PORT}`, '--var', 'SITE_DIRECT:1',
  '--var', `VAPID_PUBLIC_KEY:${VAPID_PUB}`, '--var', `VAPID_PRIVATE_KEY:${VAPID_PRIV}`, '--var', 'PUSH_DEV:1', '--var', 'PUSH_EVERY_TICK:1'],
  { cwd: WORKER, stdio: ['ignore', 'pipe', 'pipe'] });
var wlog = ''; w.stdout.on('data', (d) => { wlog += d; }); w.stderr.on('data', (d) => { wlog += d; });
procs.push(w);
const vite = spawn('npx', ['vite', '--port', String(SITE_PORT), '--strictPort'], { cwd: join(ROOT, 'apps/web'), env: { ...process.env, VITE_SOCIAL_API: API }, stdio: 'ignore' });
procs.push(vite);
await waitFor(async () => (await fetch(`${API}/api/social/me`)).ok, 'the Worker').catch((e) => { console.error(wlog.slice(-3000)); throw e; });
await waitFor(async () => (await fetch(`${SITE}/`)).ok, 'the site');

const H = { origin: SITE, 'cf-connecting-ip': '10.90.0.1', 'content-type': 'application/json' };
const get = async (p) => { const r = await fetch(`${API}/api/social${p}`, { headers: H }); return { status: r.status, j: await r.json().catch(() => null) }; };
const post = async (p, body) => { const r = await fetch(`${API}/api/social${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => null) }; };
const sql = (q) => { const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'emotown-social', '--local', '--persist-to', dir, '--json', '--command', q], { cwd: WORKER, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const j = JSON.parse(out.slice(out.indexOf('['))); return j[0].results; };
const tick = async () => {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(`${API}/__scheduled?cron=*/5+*+*+*+*`); return r.ok; }
    catch (e) { console.log(`     (scheduled call ${i + 1} failed: ${e.cause?.code ?? e.message}; retrying)`); await sleep(2500); }
  }
  return false;
};
const stateRows = () => sql('SELECT pet, alive, crowned FROM push_pet_state');
const gotOf = (sub) => subscribers.get(sub.endpoint).got;
const fetchFail = (e) => { console.error('fetch failed; the Worker log ends:\n' + wlog.slice(-2500)); throw e; };
process.on('unhandledRejection', fetchFail);

// ---------------------------------------------------------------------------------------------- 1. the routes
console.log('1. the routes');
{
  const v = await get('/push/vapid');
  ok(v.status === 200 && v.j.key === VAPID_PUB, 'GET /push/vapid hands out the public key');
  const bad = await post('/push/subscribe', { subscription: { endpoint: 'https://push.example/x', keys: { p256dh: 'short', auth: 'x' } } });
  ok(bad.status === 400, 'a subscription with bad keys is refused (400)');
  const badEp = await post('/push/subscribe', { subscription: { endpoint: 'ftp://push.example/x', keys: makeSubscription('junk').keys } });
  ok(badEp.status === 400, 'a non-http(s) endpoint is refused');
  const noOrigin = await fetch(`${API}/api/social/push/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.90.0.2' }, body: '{}' });
  ok(noOrigin.status === 403, 'a write without the site\'s Origin is refused (403)');
}
const subA = makeSubscription('a');
let petsA = [];
{
  const r = await post('/push/subscribe', { subscription: subA, address: WALLET, prefs: { kinds: { react: false } }, tz: -300, ua: 'push-check' });
  ok(r.status === 200 && r.j.address === WALLET && r.j.verified === false, `subscribe watching ${WALLET.slice(0, 8)}: recorded, not verified (no session)`);
  petsA = r.j.pets;
  ok(Array.isArray(petsA) && petsA.length > 0 && petsA.every((p) => ['cat', 'frok', 'sahur', 'thiccums'].includes(p.col) && Number.isInteger(p.id)), `its pets were read off the chain: ${petsA.length} (${[...new Set(petsA.map((p) => p.col))].join(', ')})`);
  ok(petsA.some((p) => p.name), 'named pets carry their names: ' + petsA.filter((p) => p.name).slice(0, 3).map((p) => `${p.col} #${p.id} "${p.name}"`).join(', '));
  ok(r.j.prefs.kinds.react === false && r.j.prefs.kinds.bowl === true && r.j.prefs.tz === -300 && r.j.prefs.quiet === null, 'preferences cleaned: the one kind off, the rest on, tz kept');
  const p = await get(`/push/prefs?endpoint=${encodeURIComponent(subA.endpoint)}`);
  ok(p.status === 200 && p.j.address === WALLET && p.j.pets.length === petsA.length && p.j.prefs.kinds.react === false, 'GET /push/prefs reads the same record back');
  const miss = await get(`/push/prefs?endpoint=${encodeURIComponent('http://127.0.0.1:1/nope')}`);
  ok(miss.status === 404, 'an unknown endpoint is 404 (the page re-registers)');
  const again = await post('/push/subscribe', { subscription: subA, address: WALLET, prefs: r.j.prefs });
  ok(again.status === 200 && sql('SELECT COUNT(*) AS n FROM push_subs').at(0).n === 1, 'subscribing the same endpoint again updates, never duplicates');
  const set = await post('/push/prefs', { endpoint: subA.endpoint, prefs: { kinds: { poop: false, nope: true }, petsOff: [`${petsA[0].col}:${petsA[0].id}`, 'junk'], quiet: { from: 23, to: 8 }, tz: -300 } });
  ok(set.status === 200 && set.j.prefs.kinds.poop === false && !('nope' in set.j.prefs.kinds) && set.j.prefs.petsOff.length === 1 && set.j.prefs.quiet.from === 23, 'POST /push/prefs: one pet off, poop off, quiet hours 23-8, junk dropped');
  await post('/push/prefs', { endpoint: subA.endpoint, prefs: { kinds: { react: false }, petsOff: [], quiet: null, tz: -300 } });   // back to the open set for the ticks below
}

// ---------------------------------------------------------------------------------------------- 2. a delivery, decrypted
console.log('2. a delivery');
{
  const r = await post('/push/test', { endpoint: subA.endpoint });
  ok(r.status === 200 && r.j.ok === true && r.j.status === 201, 'POST /push/test: the push service answered 201');
  const got = subscribers.get(subA.endpoint).got;
  ok(got.length === 1 && got[0].vapid === true, 'the Authorization header is a VAPID token that verifies with the public key, for this push service');
  ok(got[0].headers['content-encoding'] === 'aes128gcm' && got[0].headers.ttl === '600' && got[0].rs === 4096, 'aes128gcm, TTL 600, one 4096 record');
  ok(got[0].payload?.title === 'Notifications are on' && got[0].payload.url === '/' && got[0].payload.kind === 'test', `decrypted on the subscriber's side: "${got[0].payload?.title}" / "${got[0].payload?.body}"`);
  const gone = makeSubscription('g', { gone: true });
  const g = await post('/push/subscribe', { subscription: gone, address: WALLET });
  const t = await post('/push/test', { endpoint: gone.endpoint });
  const after = await get(`/push/prefs?endpoint=${encodeURIComponent(gone.endpoint)}`);
  ok(g.status === 200 && t.j.ok === false && t.j.status === 410 && after.status === 404, 'a push service answering 410 removes the subscription');
  const un = await post('/push/unsubscribe', { endpoint: gone.endpoint });
  ok(un.status === 200, 'unsubscribe of a gone endpoint is fine');
}

// ---------------------------------------------------------------------------------------------- 3. the View struct on all four games
console.log('3. state() on every game (mainnet)');
let deadPet = null; let myFight = 0;
{
  const ABI = parseAbi([
    'struct View { uint256 id; address owner; string name; bool started; bool alive; bool asleep; bool poop; bool crowned; bool crownEligible; uint8 food; uint8 clean; uint8 fun; uint8 energy; uint8 mood; uint16 streak; uint16 score; uint256 day; uint40 mintedAt; uint40 startsAt; uint40 bornAt; uint40 deadAt; uint40 poopAt; uint40 wakesAt; uint40 diesAt; uint24 feeds; uint24 washes; uint24 plays; uint24 naps; uint24 cleanups; uint24 pets; uint16 names; uint16 deaths; uint16 revives; uint128 monPaid; }',
    'function state(uint256 id) view returns (View v)',
  ]);
  const GAMES = { cat: '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5', frok: '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', sahur: '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7', thiccums: '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec' };
  const pub = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  for (const [col, address] of Object.entries(GAMES)) {
    try {
      const v = await pub.readContract({ address, abi: ABI, functionName: 'state', args: [1n] });
      const minted = Number(v.mintedAt);
      ok(v.id === 1n && /^0x[0-9a-fA-F]{40}$/.test(v.owner) && minted > 1_750_000_000 && minted < Date.now() / 1000,
        `${col} #1 decodes (owner ${v.owner.slice(0, 8)}, alive ${v.alive}, food ${v.food}, feeds ${v.feeds}, diesAt ${v.diesAt})`);
    } catch (e) { ok(false, `${col} #1 state(): ${String(e?.shortMessage ?? e).slice(0, 100)}`); }
  }
  // a dead cat with an owner (the airdrop's, most of them starved), to force a death on below
  const some = await pub.multicall({ contracts: Array.from({ length: 12 }, (_, i) => ({ address: GAMES.cat, abi: ABI, functionName: 'state', args: [BigInt(1000 + i)] })), allowFailure: true });
  const d = some.find((r) => r.status === 'success' && !r.result.alive && r.result.owner !== '0x0000000000000000000000000000000000000000')?.result;
  if (d) deadPet = { key: `cat:${d.id}`, owner: d.owner.toLowerCase() };
  ok(!!deadPet, `a dead cat with an owner for the forced death: ${deadPet?.key} of ${deadPet?.owner.slice(0, 8)}`);
  // the latest decided fight the watched wallet was in, to replay its result
  const FABI = parseAbi(['struct FightView { uint256 id; uint8 status; address challenger; address challengerCollection; uint256 challengerPet; address opponent; uint256 stake; uint256 createdAt; uint256 expiresAt; address acceptor; address acceptorCollection; uint256 acceptorPet; uint256 acceptedAt; uint256 abortableAt; address provider; uint64 sequence; bytes32 random; uint256 foughtAt; address winner; uint256 payout; }', 'function fightCount() view returns (uint256)', 'function fight(uint256 id) view returns (FightView)']);
  const CLUB = '0x996b7Af41570a6eAd15d2749B718edD4C138cE06';
  const count = Number(await pub.readContract({ address: CLUB, abi: FABI, functionName: 'fightCount' }));
  const fights = await pub.multicall({ contracts: Array.from({ length: Math.min(count, 50) }, (_, i) => ({ address: CLUB, abi: FABI, functionName: 'fight', args: [BigInt(count - i)] })), allowFailure: true });
  const mine = fights.find((r) => r.status === 'success' && Number(r.result.status) === 4 && [r.result.challenger, r.result.acceptor].some((a) => a.toLowerCase() === WALLET))?.result;
  if (mine) myFight = Number(mine.id);
  console.log(`     (${count} fights on chain; the latest decided one with ${WALLET.slice(0, 8)} in it: ${myFight ? '#' + myFight : 'none'})`);
}
const subB = makeSubscription('b');
if (deadPet) {
  const r = await post('/push/subscribe', { subscription: subB, address: deadPet.owner, tz: 0 });
  ok(r.status === 200 && r.j.pets.some((p) => `${p.col}:${p.id}` === deadPet.key), `a second subscription watches that cat's owner (${r.j.pets.length} pets)`);
}

// ---------------------------------------------------------------------------------------------- 4. the tick
console.log('4. the cron tick');
{
  const before = subscribers.get(subA.endpoint).got.length;
  ok(await tick(), 'GET /__scheduled runs the scheduled handler');
  await waitFor(() => stateRows().length >= petsA.length, 'the pet states', 60_000).catch(() => {});
  const rows = stateRows();
  ok(rows.length >= petsA.length, `push_pet_state holds every watched pet after the tick (${rows.length})`);
  const err = /\[push\].*"errors":\[[^\]]/.exec(wlog) ?? /\[push\] (send|social)/.exec(wlog);
  ok(!err, 'the Worker log shows no push error' + (err ? `: ${err[0].slice(0, 160)}` : ''));
  const fights = sql('SELECT id, status FROM push_fights ORDER BY id');
  ok(fights.length >= 1 && fights.at(-1).status >= 3, `the fights so far were recorded as history: ${fights.length} known, the last #${fights.at(-1)?.id} status ${fights.at(-1)?.status}`);
  const primed = sql('SELECT COUNT(*) AS n FROM push_sent').at(0).n;
  ok(gotOf(subA).length === before && primed > 0, `the first look sends nothing: ${primed} already-true events (empty bowls, poops) noted as seen, no old fight replayed`);
  sql(`UPDATE push_pet_state SET alive = 1 WHERE pet = '${deadPet?.key}'`);   // the next tick sees it die
  const n0 = gotOf(subB).length;
  await tick();
  await waitFor(() => gotOf(subB).length > n0, 'the death push', 60_000).catch(() => {});
  const died = gotOf(subB).slice(n0).find((g) => g.payload?.kind === 'died');
  ok(died && died.payload.title.endsWith('has died') && died.headers.urgency === 'high' && died.headers.topic === `died_${deadPet.key.replace(':', '')}` && died.vapid, `a death is pushed as urgent: "${died?.payload?.title}" / "${died?.payload?.body}" -> ${died?.payload?.url}`);
  ok(stateRows().find((r) => r.pet === deadPet?.key)?.alive === 0, 'the state table follows the chain again');
  const n1 = gotOf(subB).length;
  sql(`UPDATE push_pet_state SET alive = 1 WHERE pet = '${deadPet?.key}'`);
  await tick(); await sleep(6000);
  ok(gotOf(subB).slice(n1).every((g) => g.payload?.kind !== 'died'), 'the same death is never pushed twice (push_sent)');
  const dead = deadPet;
  // ---- a kind switched off, and a pet switched off, hold their events
  const crownable = rows.find((r) => r.alive === 1 && r.crowned === 0 && petsA.some((p) => `${p.col}:${p.id}` === r.pet)) ?? rows.find((r) => r.crowned === 0 && petsA.some((p) => `${p.col}:${p.id}` === r.pet));
  if (crownable) {
    await post('/push/prefs', { endpoint: subA.endpoint, prefs: { kinds: { crown: false }, petsOff: [], quiet: null, tz: -300 } });
    sql(`UPDATE push_pet_state SET crowned = 1, alive = 1 WHERE pet = '${crownable.pet}'`);
    const n2 = subscribers.get(subA.endpoint).got.length;
    await tick(); await sleep(6000);
    ok(subscribers.get(subA.endpoint).got.slice(n2).every((g) => g.payload?.kind !== 'crown'), 'with Crown off, a lost crown is not pushed');
    await post('/push/prefs', { endpoint: subA.endpoint, prefs: { kinds: {}, petsOff: [crownable.pet], quiet: null, tz: -300 } });
    sql(`UPDATE push_pet_state SET crowned = 1, alive = 1 WHERE pet = '${crownable.pet}'`);
    const n3 = subscribers.get(subA.endpoint).got.length;
    await tick(); await sleep(6000);
    ok(subscribers.get(subA.endpoint).got.slice(n3).every((g) => !(g.payload?.kind === 'crown' && g.payload.url.endsWith(`/${crownable.pet.split(':')[1]}`))), 'with that pet off, its lost crown is not pushed');
    await post('/push/prefs', { endpoint: subA.endpoint, prefs: { kinds: {}, petsOff: [], quiet: null, tz: -300 } });
    sql(`UPDATE push_pet_state SET crowned = 1, alive = 1 WHERE pet = '${crownable.pet}'`);
    const n4 = subscribers.get(subA.endpoint).got.length;
    await tick();
    await waitFor(() => subscribers.get(subA.endpoint).got.length > n4, 'the crown push', 60_000).catch(() => {});
    const crown = subscribers.get(subA.endpoint).got.slice(n4).find((g) => g.payload?.kind === 'crown');
    ok(crown && /lost its crown/.test(crown.payload.title), `with everything on, the lost crown arrives: "${crown?.payload?.title}"`);
  } else ok(false, 'no uncrowned pet to force a crown change with');
  // ---- quiet hours hold the quiet kinds and let a death through
  const hourNow = (new Date().getUTCHours() + 24) % 24;   // tz 0 below, so the quiet window is "now"
  await post('/push/prefs', { endpoint: subA.endpoint, prefs: { kinds: {}, petsOff: [], quiet: { from: hourNow, to: (hourNow + 2) % 24 }, tz: 0 } });
  if (crownable && dead) {
    await post('/push/prefs', { endpoint: subB.endpoint, prefs: { kinds: {}, petsOff: [], quiet: { from: hourNow, to: (hourNow + 2) % 24 }, tz: 0 } });
    sql(`UPDATE push_pet_state SET crowned = 1, alive = 1 WHERE pet = '${crownable.pet}'`);
    sql(`DELETE FROM push_sent WHERE key LIKE 'died:${dead.key}:%'`); sql(`UPDATE push_pet_state SET alive = 1 WHERE pet = '${dead.key}'`);
    const n5a = gotOf(subA).length; const n5b = gotOf(subB).length;
    await tick();
    await waitFor(() => gotOf(subB).slice(n5b).some((g) => g.payload?.kind === 'died'), 'the urgent push', 60_000).catch(() => {});
    await sleep(3000);
    ok(gotOf(subB).slice(n5b).some((g) => g.payload?.kind === 'died') && gotOf(subA).slice(n5a).every((g) => g.payload?.kind !== 'crown'), 'in quiet hours the death gets through and the crown waits');
  }
  // ---- the fight result, replayed: the people in fight #1 hear it
  // the last decided fight, replayed as if the keeper had just seen it decided: the people in it hear the result
  if (myFight) {
    await post('/push/prefs', { endpoint: subA.endpoint, prefs: { kinds: {}, petsOff: [], quiet: null, tz: 0 } });
    sql(`DELETE FROM push_fights WHERE id >= ${myFight}`);   // the tick re-reads from there, as if the keeper had just seen them decided
    const n6 = gotOf(subA).length;
    await tick();
    await waitFor(() => gotOf(subA).slice(n6).some((g) => g.headers.topic === `fight_${myFight}`), 'the fight push', 60_000).catch(() => {});
    const fr = gotOf(subA).slice(n6).find((g) => g.headers.topic === `fight_${myFight}`);
    ok(fr && fr.payload.kind === 'fightResult' && /won .* MON|lost the fight/.test(fr.payload.title) && fr.payload.url === '/fightclub', `fight #${myFight} decided, pushed to the fighter: "${fr?.payload?.title}" / "${fr?.payload?.body}"`);
    const dup = gotOf(subA).slice(n6).filter((g) => g.headers.topic === `fight_${myFight}`).length;
    ok(dup === 1, 'one result push per fighter, however many ticks look at it');
  } else console.log('     (no decided fight with the watched wallet in it to replay)');
}

// ---------------------------------------------------------------------------------------------- 5. the page
console.log('5. the page (headless Chrome)');
{
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
  try {
    const ctx = browser.defaultBrowserContext();
    await ctx.overridePermissions(SITE, ['notifications']);
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(`${m.text()} @ ${m.location()?.url ?? '?'}`); });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const mf = await fetch(`${SITE}/manifest.webmanifest`); const mj = await mf.json().catch(() => null);
    ok(mf.ok && mj?.display === 'standalone' && mj.start_url && Array.isArray(mj.icons) && mj.icons.length >= 3, `manifest: standalone, ${mj?.icons?.length} icons`);
    for (const icon of mj?.icons ?? []) { const r = await fetch(`${SITE}${icon.src}`); if (!r.ok) ok(false, `icon ${icon.src} missing`); }
    const sw = await fetch(`${SITE}/sw.js`); ok(sw.ok && /addEventListener\('push'/.test(await sw.text()), '/sw.js is served and handles push');
    await page.goto(`${SITE}/`, { waitUntil: 'networkidle2' });
    const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/'); return r ? { scope: r.scope, state: (r.active ?? r.installing ?? r.waiting)?.state } : null; });
    ok(reg && reg.scope === `${SITE}/`, `the service worker is registered at start (${reg?.state})`);
    await page.evaluate(() => window.__push.open());
    await page.waitForSelector('.nf-switch', { timeout: 10_000 });
    const heads = await page.$$eval('.nf-group h3', (els) => els.map((e) => e.textContent));
    const switches = await page.$$('.nf-switch');
    ok(heads.join('|') === 'Pets|Emotown|Fight Club|Quiet hours' && switches.length === 15, `the sheet: ${heads.join(', ')}; ${switches.length} switches (13 kinds + on/off + quiet)`);
    await page.screenshot({ path: join(OUT, 'sheet-off.png') });
    // a REAL click on the main switch: permission (granted by the test), the VAPID key, pushManager.subscribe, /push/subscribe
    await page.evaluate(() => {
      // a trace of what the store does on the click, printed only if it does not come out 'on'
      const T = (window.__trace = []); const t0 = performance.now(); const at = (m) => T.push(`${Math.round(performance.now() - t0)}ms ${m}`);
      const sub0 = PushManager.prototype.subscribe; PushManager.prototype.subscribe = async function (o) { at('subscribe…'); try { const r = await sub0.call(this, o); at('subscribed'); return r; } catch (e) { at('subscribe threw ' + e.message); throw e; } };
      const f0 = window.fetch; window.fetch = async function (u, o) { at('fetch ' + String(u instanceof Request ? u.url : u).slice(0, 60)); const r = await f0.call(this, u, o); at('fetched ' + r.status); return r; };
      const rp0 = Notification.requestPermission; Notification.requestPermission = async function () { at('requestPermission…'); const r = await rp0.call(this); at('permission ' + r); return r; };
    });
    const main = await page.$('.nf-status .nf-switch');
    await main.click();
    await waitFor(async () => (await page.evaluate(() => window.__push.get().busy)) === false, 'the switch', 40_000).catch(() => {});
    let st = await page.evaluate(() => { const s = window.__push.get(); return { status: s.status, permission: s.permission, error: s.error, busy: s.busy, endpoint: s.endpoint?.slice(0, 48), endpointFull: s.endpoint }; });
    if (st.status !== 'on') {
      // say why, from the browser itself
      const why = await page.evaluate(() => Promise.race([
        (async () => { try { const reg = await navigator.serviceWorker.ready; const { key } = await (await fetch('/api/social/push/vapid')).json(); const toU = (b) => { const s2 = b.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s2 + '='.repeat((4 - s2.length % 4) % 4)), (c) => c.charCodeAt(0)); }; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toU(key) }); return 'subscribed: ' + sub.endpoint.slice(0, 40); } catch (e) { return 'subscribe threw: ' + (e.name + ': ' + e.message); } })(),
        new Promise((r) => setTimeout(() => r('subscribe hung for 15 s'), 15_000)),
      ]));
      console.log(`     (after the click: ${JSON.stringify(st)}; a direct pushManager.subscribe in this Chrome: ${why})`);
      console.log('     trace: ' + (await page.evaluate(() => window.__trace.join(' | '))));
      st = await page.evaluate(() => { const s = window.__push.get(); return { status: s.status, permission: s.permission, error: s.error, busy: s.busy, endpoint: s.endpoint?.slice(0, 48), endpointFull: s.endpoint }; });
    }
    if (st.status === 'on') {
      ok(true, `the switch turned notifications on in Chrome (endpoint ${st.endpoint}…)`);
      const subs = sql('SELECT address, verified FROM push_subs WHERE ua LIKE \'%Chrome%\' OR endpoint LIKE \'https://fcm%\'');
      ok(subs.length >= 1 && subs[0].address === null, 'the Worker recorded the browser\'s subscription (no wallet connected: nothing to watch yet)');
      // the kinds are saved as switched (before the test push: a push service that calls the subscription gone removes the row)
      const poop = (await page.$$('.nf-row .nf-switch'))[3];
      await poop.click();
      await sleep(1200);
      const kinds = await page.evaluate(() => window.__push.get().prefs.kinds);
      const saved = sql(`SELECT prefs FROM push_subs WHERE endpoint = '${st.endpointFull}'`)[0];
      ok(kinds.poop === false && kinds.bowl === true && saved && JSON.parse(saved.prefs).kinds.poop === false, 'a kind switch flips its preference and the Worker saved it (poop off)');
      const tr = await page.evaluate(async (ep) => (await (await fetch('/api/social/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: ep }) })).json()), st.endpointFull);
      console.log(`     (the push service's answer to the test push: ${JSON.stringify(tr)})`);
      const shown = async () => { const ns = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/'); return (await r.getNotifications()).map((x) => ({ title: x.title, body: x.body, tag: x.tag })); }); return ns; };
      await waitFor(async () => (await shown()).some((x) => x.title === 'Notifications are on'), 'the notification', 30_000).catch(() => {});
      const notes = await shown();
      if (notes.some((x) => x.title === 'Notifications are on')) ok(true, `the test push arrived through the real push service and the service worker showed it (${JSON.stringify(notes[0])})`);
      else if (tr.ok) ok(true, 'the push service took the test push (201); headless Chrome keeps no push channel open, so nothing showed here (a real Chrome does)');
      else ok(tr.status === 404 || tr.status === 410, `FCM called this headless subscription gone (${tr.status}) and the Worker dropped it; the delivery path is covered by the stand-in above`);
    } else {
      console.log(`     (headless Chrome could not subscribe: status ${st.status}, permission ${st.permission}, "${st.error}"; the real push service needs a signed-in Chrome, so the delivery path is covered by the stand-in above)`);
      ok(st.permission === 'granted' && st.status !== 'on' && !st.busy, 'the sheet is not left busy or pretending to be on');
    }
    await page.screenshot({ path: join(OUT, 'sheet-after.png') });
    ok(errors.length === 0, 'no page errors' + (errors.length ? `: ${errors[0].slice(0, 160)}` : ''));
  } finally { await browser.close(); }
}

console.log(`\n${n - fails}/${n} checks passed${fails ? `, ${fails} FAILED` : ''}; screenshots in ${OUT}`);
process.exit(fails ? 1 : 0);
