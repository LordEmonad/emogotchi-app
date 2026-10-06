// The index (worker/indexer.js) end to end, in the real Worker runtime:
//   - `wrangler dev --local` with a fresh D1 (every migration applied) and the cron fired by hand (`/__scheduled`);
//   - HyperSync is a stand-in on 127.0.0.1 serving a made-up history with the real airdrop in it
//     (worker/test/fixtures/chain-standin.mjs), in pages, refusing now and then.
// It builds the index over several cron runs, then checks /api/stats, /api/cats and /api/starvation for every pet
// against one fold of the same history, the routes' manners (cache, 405, OPTIONS, an unknown pet), a refusal and the
// chain moving on. Nothing here touches the real HyperSync, the real chain or production.
//   node tools/index-check.mjs          (about a minute; needs nothing running)
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Owners, applyPet, applyShop, catsBody, finishPet, finishShop, newPet, newShop, petLists, settlePet, statsBody } from '../worker/fold.js';
import { ADDR, hyperSync, makeHistory } from '../worker/test/fixtures/chain-standin.mjs';
import { PETS as INDEXED } from '../worker/indexer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const WORKER = join(ROOT, 'worker');
const W_PORT = Number(process.env.W_PORT ?? 8797), HS_PORT = Number(process.env.HS_PORT ?? 8798);
const API = `http://127.0.0.1:${W_PORT}`;
const LAG = 40;
// the pets are the Worker's own list (a pet added to indexer.js is checked here too: this list was once written out,
// and broke on the fifth pet)
const PETS = INDEXED.map((p) => ({ key: p.key, out: p.out, address: ADDR[p.key] }));
const KEY_OF = new Map(Object.entries(ADDR).map(([k, a]) => [a, k]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v));
let passed = 0; const failures = [];
const ok = (cond, what) => { if (cond) { passed += 1; console.log('  ✓', what); } else { failures.push(what); console.log('  ✗', what); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- the made-up chain, and HyperSync in front of it
const h = makeHistory({ seed: 21 });
/** News for the crier, inserted at `block` with the real clock's time: the logs the crier looks for, as the contracts emit them. */
function crierLogs(logs, readable) {
  // after the last log, in chain order, and no earlier than the clock (the index closes a day once a later one has begun,
  // so news dated before the history's last log would land in a finished day); `readable` is the last block the index reads
  const last = logs[logs.length - 1];
  const ts = Math.max(last._ts + 1, Math.floor(Date.now() / 1000) - 5);
  let block = last.block_number + 1;
  if (block > readable) throw new Error(`no room for the crier's logs: last block ${last.block_number}, readable ${readable}`);
  const w = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
  const a = (addr) => '0x' + addr.slice(2).toLowerCase().padStart(64, '0');
  const str = (t) => { const hex = Buffer.from(t, 'utf8').toString('hex'); return w(32).slice(2) + w(hex.length / 2).slice(2) + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0'); };
  const owner = '0xd590b936dd75946d79e4a9177ca2c4234104a2bc', other = '0x17c500fca07b5ab62b7b83858f14c19279397564';
  const CARE = '0xb32e67b898f6bb5ba6674e4ee94c0710c672d372fcdc15197bd6182b935ccd49', NAMED = '0x9726e950b835e1f7f4fe747cca4223de678452a4f67c102d50408e22e94e9485';
  const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', CLAIMED = '0xd9cb1e2714d65a111c0f20f060176ad657496bd47a3de04ec7c3d4ca232112ac';
  const FOUGHT = '0xc8563c05cdc40d9e1c3465a2ea4ee199fc4fd3684c5383cf4c7e95cf266ef427', FIGHT_CLUB = '0x996b7af41570a6ead15d2749b718edd4c138ce06';
  const MON = 10n ** 18n;
  const news = [
    // Sahur #108 beats cat #60965 for 5 MON a side: payout 9.5
    { address: FIGHT_CLUB, topic0: FOUGHT, topic1: w(12), topic2: a(owner), topic3: a(other), data: '0x' + [a(ADDR.sahur), w(108), a(ADDR.cat), w(60965), w(5n * MON), w(95n * MON / 10n), w(5n * MON / 10n), w(77), w(0)].map((x) => x.slice(2)).join('') },
    // frok #130 named Hateen (Care action 6 by its owner, then Named)
    { address: ADDR.frok, topic0: CARE, topic1: w(130), topic2: w(6), topic3: a(owner), data: '0x' + w(10n * MON).slice(2) + w(ts).slice(2) },
    { address: ADDR.frok, topic0: NAMED, topic1: w(130), topic2: null, topic3: null, data: '0x' + str('Hateen') },
    // cat #7 revived (Care action 7, 1,000 MON)
    { address: ADDR.cat, topic0: CARE, topic1: w(7), topic2: w(7), topic3: a(owner), data: '0x' + w(1000n * MON).slice(2) + w(ts).slice(2) },
    // a Kippah bought for 36 MON; a free Spooky theme claimed (not news)
    { address: ADDR.shop, topic0: CLAIMED, topic1: w(8), topic2: a(other), topic3: null, data: '0x' + w(1).slice(2) + w(36n * MON).slice(2) },
    { address: ADDR.shop, topic0: CLAIMED, topic1: w(2), topic2: a(other), topic3: null, data: '0x' + w(1).slice(2) + w(0).slice(2) },
    // two mints
    { address: ADDR.r3tards, topic0: TRANSFER, topic1: a('0x' + '0'.repeat(40)), topic2: a(owner), topic3: w(900001), data: '0x' },
    { address: ADDR.sahur, topic0: TRANSFER, topic1: a('0x' + '0'.repeat(40)), topic2: a(other), topic3: w(900002), data: '0x' },
  ];
  let i = 0;
  logs.push(...news.map((l) => ({ ...l, block_number: block, log_index: i++, _ts: ts })));
}
const hs = hyperSync(h, { pageLogs: 6000 });
const full = hs.height; hs.height = full - 30000;   // the tip starts a few hours back
const server = createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer test-token') { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"token"}'); return; }
    const { status, json } = hs.query(JSON.parse(body));
    res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json));
  });
});
await new Promise((r) => server.listen(HS_PORT, '127.0.0.1', r));

function expected(now) {
  const cursor = hs.height - LAG;
  const states = new Map(PETS.map((p) => [p.key, newPet(p.key)])); const owners = new Map(PETS.map((p) => [p.key, new Owners(true)])); const shop = newShop();
  for (const l of h.logs) { if (l.block_number >= cursor) break; const key = KEY_OF.get(l.address); if (!key) continue; /* the ring's logs are the crier's, not the fold's */ const log = { ...l, ts: l._ts }; if (key === 'shop') applyShop(shop, log); else applyPet(states.get(key), key, log, owners.get(key), now); }
  for (const [key, s] of states) { settlePet(s); s.holders = owners.get(key).count(); }
  const pets = {}; for (const p of PETS) pets[p.out] = finishPet(states.get(p.key), p, now);
  return {
    stats: plain(statsBody({ generatedAt: 'x', now, pets, shop: finishShop(shop, ADDR.shop), starters: null, referrals: null })),
    cats: (key, at) => plain(catsBody(petLists(states.get(key), key, at), 'x')),
  };
}

// ---- the Worker
const dir = mkdtempSync(join(tmpdir(), 'index-wrangler-'));
const procs = [];
const done = (code) => { for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } server.close(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* fine */ } process.exit(code); };
try {
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-social', '--local', '--persist-to', dir], { cwd: WORKER, stdio: 'ignore' });
  const w = spawn('npx', ['wrangler', 'dev', '--local', '--persist-to', dir, '--port', String(W_PORT), '--ip', '127.0.0.1', '--test-scheduled',
    '--var', 'HYPERSYNC_TOKEN:test-token', '--var', 'INDEX_NOCACHE:1', '--var', `HYPERSYNC_URL:http://127.0.0.1:${HS_PORT}/query`, '--var', 'SITE_DIRECT:1'], { cwd: WORKER, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(w);
  let logText = ''; w.stdout.on('data', (c) => { logText += c; }); w.stderr.on('data', (c) => { logText += c; });
  const get = async (path, init) => fetch(API + path, init);
  for (let i = 0; i < 90; i++) { try { if ((await get('/api/index')).status) break; } catch { await sleep(500); } if (i === 89) throw new Error('the Worker did not start:\n' + logText.slice(-2000)); }
  const status = async () => (await get('/api/index')).json();
  /** fire the cron and wait for that run to finish (it rides on waitUntil): the index notes when it last heard or failed */
  const tick = async () => {
    const before = await status();
    const r = await get('/__scheduled?cron=*+*+*+*+*'); await r.text();
    for (let i = 0; i < 100; i++) { await sleep(150); const s = await status(); if (s.okAt !== before.okAt || s.errorAt !== before.errorAt) return s; }
    return status();
  };
  const sql = (q) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'emotown-social', '--local', '--persist-to', dir, '--command', q], { cwd: WORKER, stdio: 'ignore' });
  const fresh = async (path) => { const r = await get(path); return { r, j: await r.json() }; };
  const CRIER = '0x000000000000000000000000000000000000c21e';
  const square = async () => (await (await get('/api/social/chat/history?room=square')).json()).items;

  console.log('the retired town crier');
  // two lines the crier posted before it was retired (2026-10-03), and one from a person, already in the room's list
  const t = Date.now();
  sql(`INSERT INTO messages (room, sender, body, created_at, sys, sys_key) VALUES ('square', '${CRIER}', 'Sahur #108 beat cat #7 in the ring', ${t - 60_000}, '{"k":"fight"}', 'fight:1'), ('square', '${CRIER}', 'A new pet was minted in the last hour', ${t - 50_000}, '{"k":"mints"}', 'mints:1')`);
  sql(`INSERT INTO messages (room, sender, body, created_at) VALUES ('square', '0x17c500fca07b5ab62b7b83858f14c19279397564', 'gm town', ${t - 40_000})`);
  ok((await square()).filter((m) => m.a === CRIER).length === 2, 'the square holds the two old crier lines before the first cron run');

  console.log('before the first run');
  const s0 = await get('/api/stats'); const j0 = await s0.json();
  ok(s0.status === 502 && /being built/.test(j0.error), '/api/stats says the index is being built (nothing older to show here)');
  ok((await get('/api/cats?pet=frok')).status === 502, '/api/cats too');

  console.log('building, a few pages a run');
  let n = 0; hs.refuse = () => (++n % 5 === 0 ? 429 : 0);
  let runs = 0; let st = null;
  for (; runs < 60; runs++) {
    st = await tick();
    if (st.restUntil) sql(`UPDATE fold SET value = json_set(value, '$.restUntil', 0) WHERE key = 'v1:meta'`);   // (a minute has not passed here: lift the wait)
    if (st.built) break;
  }
  ok(runs > 3 && runs < 60, `built in ${runs + 1} runs, through ${Math.floor(n / 5)} refusals`);
  ok(Math.min(...Object.values(st.cursors)) === hs.height - LAG, 'read up to 40 blocks behind the tip');
  const cleared = await square();
  ok(!cleared.some((m) => m.a === CRIER) && cleared.some((m) => m.text === 'gm town'), 'the cron took the crier\'s old lines out of the square, and left the person\'s');

  const compare = async (why) => {
    const { j: stats } = await fresh('/api/stats');
    const want = expected(stats.now);
    const { generatedAt, stale: _s, staleReason: _r, starters, referrals, ...rest } = stats;
    const { generatedAt: _g, starters: _st, referrals: _rf, ...wantRest } = want.stats;
    ok(same(rest, wantRest), `${why}: /api/stats equals one fold of the history (${stats.cats.mints} cats, ${stats.cats.deadNow} dead, ${stats.froks.mints} froks, ${stats.shop.items.length} items)`);
    if (!same(rest, wantRest)) for (const k of Object.keys(wantRest)) if (!same(rest[k], wantRest[k])) { console.log('    differs:', k); if (wantRest[k] && typeof wantRest[k] === 'object') for (const kk of Object.keys(wantRest[k])) if (!same(rest[k]?.[kk], wantRest[k][kk])) { const a = rest[k]?.[kk], b = wantRest[k][kk]; if (Array.isArray(a) && Array.isArray(b)) { for (let i = 0; i < Math.max(a.length, b.length); i++) if (!same(a[i], b[i])) console.log('      ', kk, `[${i}]`, JSON.stringify(a[i])?.slice(0, 300), '≠', JSON.stringify(b[i])?.slice(0, 300)); } else console.log('      ', kk, JSON.stringify(a)?.slice(0, 200), '≠', JSON.stringify(b)?.slice(0, 200)); } }
    ok(generatedAt && Date.now() - Date.parse(generatedAt) < 120_000, `${why}: generatedAt is when the index last heard from the chain`);
    void starters; void referrals;
    for (const p of PETS) {
      const t = Math.floor(Date.now() / 1000);
      const { j: cats } = await fresh('/api/cats' + (p.key === 'cat' ? '' : '?pet=' + p.key));
      const { generatedAt: _a, ...body } = cats;
      // the lists are for the second they were worked out in
      const hit = [t - 1, t, t + 1, t + 2].some((at) => { const { generatedAt: _b, ...w } = want.cats(p.key, at); return same(body, w); });
      ok(hit, `${why}: /api/cats ${p.key} (${cats.named.length} named, ${(cats.died ?? cats.diedRuns).length} dead${cats.diedRuns ? ' runs' : ''})`);
      const { j: starve } = await fresh('/api/starvation' + (p.key === 'cat' ? '' : '?pet=' + p.key));
      const { generatedAt: _c, ...sv } = starve;
      ok([t - 1, t, t + 1, t + 2, t + 3].some((at) => same(sv, want.cats(p.key, at).starvation)), `${why}: /api/starvation ${p.key}`);
    }
  };
  hs.refuse = () => 0;
  await compare('built');

  console.log('the routes');
  const a = await get('/api/stats'); await a.text(); const b = await get('/api/stats'); await b.text();
  ok(a.headers.get('cache-control') === 'public, max-age=60' && b.status === 200, 'stats: to be kept a minute at each location');
  ok((await get('/api/cats', { method: 'POST' })).status === 405, 'POST is refused');
  const opt = await get('/api/cats', { method: 'OPTIONS' }); ok(opt.headers.get('access-control-allow-methods') === 'GET', 'OPTIONS answers CORS');
  const callsBefore = hs.calls;
  for (let i = 0; i < 12; i++) await (await get('/api/cats?pet=sahur&x=' + i)).text();
  ok(hs.calls === callsBefore, 'a request never reaches HyperSync');
  const idx = await status();
  let ex = null; for (let i = 0; i < 30 && !ex?.referrals; i++) { ex = (await fresh('/api/stats')).j; if (!ex.referrals) await sleep(300); }   // (written just after the run that reached the tip)
  ok(ex.referrals?.points === 0 && (ex.starters === null || ex.starters.accounts >= 0), `the extras: referral scores from KV (none here), the starter count from the RPC (${ex.starters?.accounts ?? 'unreachable'})`);
  ok(idx.built === true && idx.rows.some((r) => r.key === 'v1:state:cat') && idx.ownerChunks >= 9, `/api/index: built, ${idx.rows.length} rows, ${idx.ownerChunks} owner chunks, cat state ${idx.rows.find((r) => r.key === 'v1:state:cat').bytes} bytes`);

  console.log('the chain moves on');
  // what happens at the tip (a fight decided in the ring, a frok named, a cat revived, a paid item bought, two mints) is
  // folded like everything else, and the square hears none of it (the town crier is retired: worker/social/crier.js)
  crierLogs(h.logs, full - LAG);
  for (const to of [hs.height + 7, hs.height + 9000, full]) {
    hs.height = to; const before = hs.calls;
    await tick();
    ok(hs.calls - before === 1, `tip ${to}: one request to HyperSync`);
    await compare('tip ' + to);
  }

  console.log('the square is only for people');
  // the chain's news (a fight, a name, a revive, a paid buy, mints) was folded above; none of it is posted to the square
  hs.height = full + 5; await tick();
  const room = await square();
  ok(!room.some((m) => m.sys || m.a === CRIER), `nothing from the chain in the square (${room.length} message${room.length === 1 ? '' : 's'})`);
  ok(room.some((m) => m.text === 'gm town'), 'the person\'s message is still there');

  console.log('a refusal');
  hs.refuse = () => 429;
  const after = await tick();
  ok(/429/.test(after.error ?? '') && after.restUntil && after.built === true, '/api/index shows the refusal and the wait; the answers stay');
  ok((await get('/api/stats')).status === 200, 'and /api/stats still answers');
} catch (e) { console.error(e); failures.push(String(e)); }
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => '  ✗ ' + f).join('\n'));
done(failures.length ? 1 : 0);
