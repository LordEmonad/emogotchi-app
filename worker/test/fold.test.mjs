// The index (worker/fold.js, worker/indexer.js): a state fed the chain's logs a piece at a time must end exactly where
// one fed everything at once does, through storage, refusals, a moving tip and a pet added later.
//   cd worker && node --test test/fold.test.mjs
// HyperSync and D1 are stand-ins (test/fixtures/chain-standin.mjs): a made-up history with the real airdrop in it,
// served in pages the way HyperSync serves them, and D1's API on in-process SQLite running the real statements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Owners, applyPet, applyShop, catsBody, dumpPet, dumpShop, finishPet, finishShop, loadPet, loadShop, newPet, newShop, petLists, settlePet, statsBody, T } from '../fold.js';
import { PETS, advance, catsFromIndex, indexStatus, starvationFromIndex, statsFromIndex } from '../indexer.js';
import { ADDR, d1, fetchFor, hyperSync, makeHistory } from './fixtures/chain-standin.mjs';

const MIGRATION = readFileSync(new URL('../migrations/0009_fold.sql', import.meta.url), 'utf8');
const KEY_OF = new Map(Object.entries(ADDR).map(([k, a]) => [a, k]));
const LAG = 40;
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (x instanceof Map ? { map: [...x] } : x instanceof Set ? { set: [...x].sort() } : x)));

/** Everything folded in one go: the reference every other way of folding is held against. */
function foldAll(logs, wall) {
  const states = new Map(PETS.map((p) => [p.key, newPet(p.key)])); const owners = new Map(PETS.map((p) => [p.key, new Owners(true)])); const shop = newShop();
  for (const l of logs) { const key = KEY_OF.get(l.address); const log = { ...l, ts: l._ts }; if (key === 'shop') applyShop(shop, log); else applyPet(states.get(key), key, log, owners.get(key), wall); }
  for (const [key, s] of states) { settlePet(s); s.holders = owners.get(key).count(); s.holdersStale = false; }
  return { states, owners, shop };
}
function answers({ states, shop }, now, generatedAt = 'x') {
  const pets = {}; for (const p of PETS) pets[p.out] = finishPet(states.get(p.key), p, now);
  return {
    stats: plain(statsBody({ generatedAt, now, pets, shop: finishShop(shop, ADDR.shop), starters: null, referrals: null })),
    cats: Object.fromEntries(PETS.map((p) => [p.key, plain(catsBody(petLists(states.get(p.key), p.key, now), generatedAt))])),
  };
}

test('a fold in pieces, through storage each time, ends where one fold of everything does', () => {
  const h = makeHistory({ seed: 7 });
  const want = answers(foldAll(h.logs, h.now), h.now);
  for (const pieces of [3, 40, 700]) {
    let states = new Map(PETS.map((p) => [p.key, newPet(p.key)])); let owners = new Map(PETS.map((p) => [p.key, new Owners(true)])); let shop = newShop();
    const step = Math.ceil(h.logs.length / pieces);
    for (let i = 0; i < h.logs.length; i += step) {
      const part = h.logs.slice(i, i + step);
      const wall = part[part.length - 1]._ts + 60;   // each piece is folded when it happens, as the cron does
      for (const l of part) { const key = KEY_OF.get(l.address); const log = { ...l, ts: l._ts }; if (key === 'shop') applyShop(shop, log); else applyPet(states.get(key), key, log, owners.get(key), wall); }
      // to storage and back
      states = new Map([...states].map(([k, s]) => [k, loadPet(k, JSON.parse(JSON.stringify(dumpPet(s, wall))))]));
      shop = loadShop(JSON.parse(JSON.stringify(dumpShop(shop))));
      owners = new Map([...owners].map(([k, o]) => { const n = new Owners(true); for (const idx of o.chunks.keys()) n.give(idx, o.text(idx)); return [k, n]; }));
    }
    for (const [key, s] of states) s.holders = owners.get(key).count();
    assert.deepEqual(answers({ states, shop }, h.now), want, `${pieces} pieces`);
  }
  // and the reference itself says something: the airdrop is there, pets are dead and alive, names were given
  assert.equal(want.stats.cats.airdropped, 82423);
  assert.ok(want.stats.cats.deadNow > 82000 && want.stats.cats.neverDied > 0 && want.stats.froks.mints > 10 && want.stats.cats.namesGiven > 10);
  assert.ok(want.stats.cats.holders > 82000 && want.stats.cats.recent.length === 25 && want.stats.froks.town.length > 0 && want.stats.shop.items.length > 5);
  assert.ok(want.stats.thiccums.mints > 3 && want.stats.sahurs.abuseTotal > 3, 'every pet has a history');
  assert.ok(want.cats.cat.diedRuns.length > 0 && want.cats.frok.named.length > 0);
});

test('by hand: the clock, the names, the holders and the counts of a tiny history', () => {
  const day = 86400, t0 = 1790000000;
  const w = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
  const a = (n) => '0x' + '0'.repeat(24) + n.toString(16).padStart(40, '0');
  const care = (id, action, by, ts, paid = 0) => ({ topic0: T.care, topic1: w(id), topic2: w(action), topic3: a(by), data: '0x' + BigInt(paid * 1e18).toString(16).padStart(64, '0') + ts.toString(16).padStart(64, '0'), ts });
  const mint = (id, to, ts) => ({ topic0: T.transfer, topic1: a(0), topic2: a(to), topic3: w(id), data: '0x', ts });
  const s = newPet('frok'); const o = new Owners(true); const now = t0 + 12 * day;
  const logs = [
    mint(1, 0xa, t0), mint(2, 0xb, t0), mint(3, 0xa, t0 + day), mint(4, 0xc, t0 + 4 * day),
    care(1, 0, 0xa, t0 + 11 * day),              // fed yesterday: alive, never died
    care(2, 2, 0xb, t0 + 2 * day),               // washed on day 2 and never fed: its clock started then, dead on day 4
    care(3, 7, 0xa, t0 + 11.5 * day),            // revived half a day ago: alive, but it has died
    { topic0: T.transfer, topic1: a(0xb), topic2: a(0xa), topic3: w(2), data: '0x', ts: t0 + 5 * day },   // #2 goes to 0xa
    care(1, 6, 0xa, t0 + 11 * day + 5, 10),      // named
    { topic0: T.named, topic1: w(1), data: '0x' + (32).toString(16).padStart(64, '0') + (4).toString(16).padStart(64, '0') + '4b696d69'.padEnd(64, '0'), ts: t0 + 11 * day + 5 },
    { topic0: T.petted, topic1: w(1), topic2: a(0xd), data: w(3), ts: t0 + 11.9 * day },
  ].sort((x, y) => x.ts - y.ts);
  for (const l of logs) applyPet(s, 'frok', l, o, now);
  s.holders = o.count();
  const out = finishPet(s, { key: 'frok', address: 'x' }, now);
  assert.equal(out.mints, 4); assert.equal(out.transfers, 1); assert.equal(out.holders, 2);   // 0xa holds 1, 2, 3; 0xc holds 4
  assert.equal(out.deadNow, 1); assert.equal(out.neverDied, 2);                               // #2 dead; #1 and #4 (still in its welcome week... until day 13) never died
  assert.equal(out.revives, 1); assert.equal(out.monIn, 10); assert.equal(out.namesGiven, 1); assert.equal(out.pets, 3);
  assert.equal(out.active24h, 2); assert.deepEqual(out.town.map((r) => r[0]), [1, 3]);        // 0xa and 0xd acted today; #1 and #3 were touched
  assert.equal(out.town[0][2], 'pet');
  const lists = petLists(s, 'frok', now);
  assert.deepEqual(lists.dead, [2]); assert.deepEqual(lists.pristine, [4, 1]); assert.deepEqual(lists.revived, [3]);
  assert.deepEqual(lists.named, [{ id: 1, name: 'Kimi' }]);
  assert.equal(lists.starvation.total, 4); assert.equal(lists.starvation.neverFed, 2);        // #2 (washed only) and #4
  // two days on, #4's welcome week has run out and nobody came: dead; #1 starved too; #3 as well
  assert.deepEqual(petLists(s, 'frok', now + 2.5 * day).dead, [4, 3, 2, 1]);
});

// ---- the indexer, against the stand-ins
function world(h, opts = {}) {
  const hs = hyperSync(h, opts);
  const db = d1(MIGRATION);
  const env = { DB: db, HYPERSYNC_TOKEN: 'test', HYPERSYNC_URL: 'http://hypersync.test/query', RPC_URL: 'http://rpc.test', DRIP_ADDRESS: '0x00036BAaf671aF375f7f22664b4086b9D4bb9EF8' };
  return { hs, db, env };
}
/** run the cron once a minute until the index says it is built and at the tip (or give up) */
async function cron(env, clock, runs = 200) {
  const said = [];
  for (let i = 0; i < runs; i++) {
    clock.ms += 60_000;
    const r = await advance(env);
    said.push(r);
    if (r.tip) return said;
  }
  throw new Error('the index never reached the tip: ' + JSON.stringify(said.slice(-3)));
}
const below = (h, block) => h.logs.filter((l) => l.block_number < block);

test('the indexer: built over many runs through refusals, then kept up as the chain moves, always equal to one fold', async (t) => {
  const h = makeHistory({ seed: 11 });
  const { hs, db, env } = world(h, { pageLogs: 2500 });
  const clock = { ms: h.now * 1000 };
  const realNow = Date.now, realFetch = globalThis.fetch;
  Date.now = () => clock.ms; globalThis.fetch = fetchFor(hs);
  t.after(() => { Date.now = realNow; globalThis.fetch = realFetch; });
  hs.shuffle = true;
  const check = async (why) => {
    const now = Math.floor(clock.ms / 1000);
    const cursor = hs.height - LAG;
    const want = answers(foldAll(below(h, cursor), now), now);
    const stats = await statsFromIndex(env);
    assert.ok(stats, why + ': the index answers');
    const { stale: _s, staleReason: _r, ...body } = plain(stats);
    assert.deepEqual({ ...body, starters: null }, { ...want.stats, generatedAt: body.generatedAt }, why + ': /api/stats');
    for (const p of PETS) {
      const cats = plain(await catsFromIndex(env, p.key));
      assert.deepEqual(cats, { ...want.cats[p.key], generatedAt: cats.generatedAt }, `${why}: /api/cats ${p.key}`);
      const starve = plain(await starvationFromIndex(env, p.key));
      assert.deepEqual(starve, { generatedAt: starve.generatedAt, ...want.cats[p.key].starvation }, `${why}: /api/starvation ${p.key}`);
    }
    const status = await indexStatus(env);
    assert.equal(status.built, true); assert.equal(Math.min(...Object.values(status.cursors)), cursor, why + ': read up to LAG blocks behind the tip, no further');
  };

  // the chain's tip is a day back for now; HyperSync refuses every third request
  const full = hs.height;
  hs.height = full - 250000;
  let n = 0; hs.refuse = () => (++n % 3 === 0 ? 429 : 0);
  assert.equal(await statsFromIndex(env), null, 'nothing to show before the first run');
  const first = await advance(env);
  assert.ok(first.pages >= 1 && !first.tip, 'the first run reads a few pages and stops');
  assert.equal(await statsFromIndex(env), null, 'and nothing is shown while it is being built');
  assert.equal(await catsFromIndex(env, 'frok'), null);
  const runs = await cron(env, clock);
  assert.ok(runs.some((r) => r.error?.includes('429')), 'refusals happened on the way');
  assert.ok(runs.length > 8, `it took many runs (${runs.length})`);
  await check('built');
  assert.equal((await statsFromIndex(env)).starters.accounts, 26, 'the starter count came from the RPC');

  // the chain moves on: a few blocks, a lot of blocks, nothing at all
  hs.refuse = () => 0;
  for (const stepTo of [hs.height + 3, hs.height + 500, hs.height + 500, hs.height + 90000, full]) {
    hs.height = Math.min(full, stepTo);
    const before = hs.calls;
    clock.ms += 60_000;
    const r = await advance(env);
    if (!r.tip) await cron(env, clock);
    else assert.equal(hs.calls - before, 1, 'kept up: one request for everything');
    await check('tip at ' + hs.height);
  }

  // a write that fails half way through a run loses nothing and doubles nothing
  const h2 = makeHistory({ seed: 12, days: 20, events: 9600 });   // another world, with an index of its own
  const more = world(h2, { pageLogs: 2500 });
  const env2 = more.env; globalThis.fetch = fetchFor(more.hs);
  clock.ms = h2.now * 1000;
  more.hs.height = h2.tip - 20000;
  await cron(env2, clock);
  more.hs.height = h2.tip;
  more.db.failNext = 1;
  clock.ms += 60_000;
  const broke = await advance(env2);
  assert.ok(broke.error?.includes('D1_ERROR'), 'the run reports the failure');
  assert.ok((await indexStatus(env2)).error?.includes('D1_ERROR'));
  await cron(env2, clock);
  {
    const now = Math.floor(clock.ms / 1000);
    const want = answers(foldAll(below(h2, h2.tip - LAG), now), now);
    const { stale: _s, staleReason: _r, ...body } = plain(await statsFromIndex(env2));
    assert.deepEqual({ ...body, starters: null }, { ...want.stats, generatedAt: body.generatedAt }, 'after a failed write');
  }

  // a pet added later: its cursor starts at its own first block, it is caught up by itself, then joins the others
  const meta = JSON.parse(more.db.raw.prepare(`SELECT value FROM fold WHERE key = 'v1:meta'`).get().value);
  delete meta.cursors.thiccums; delete meta.ready.thiccums;
  more.db.raw.prepare(`UPDATE fold SET value = ? WHERE key = 'v1:meta'`).run(JSON.stringify(meta));
  more.db.raw.exec(`DELETE FROM fold WHERE key = 'v1:state:thiccums' OR key LIKE 'v1:owners:thiccums:%'`);
  assert.equal(await statsFromIndex(env2), null, 'stats wait for the new pet');
  assert.ok(await catsFromIndex(env2, 'frok'), 'the others keep answering');
  const seen = []; const q = more.hs.query; more.hs.query = (b) => { seen.push(b); return q(b); };
  await cron(env2, clock);
  assert.ok(seen[0].to_block && seen[0].logs.length === 1 && seen[0].logs[0].address.length === 1 && seen[0].logs[0].address[0] === ADDR.thiccums, 'only the new pet is read while it catches up');
  {
    const now = Math.floor(clock.ms / 1000);
    const want = answers(foldAll(below(h2, h2.tip - LAG), now), now);
    const { stale: _s, staleReason: _r, ...body } = plain(await statsFromIndex(env2));
    assert.deepEqual({ ...body, starters: null }, { ...want.stats, generatedAt: body.generatedAt }, 'after a pet was added');
  }

  // one run at a time
  clock.ms += 60_000;
  const both = await Promise.all([advance(env2), advance(env2)]);
  assert.equal(both.filter((r) => r.skipped).length, 1, 'the second of two runs at once stands down');

  // an index that stops hearing from the chain says so, and keeps answering
  more.hs.refuse = () => 429;
  for (let i = 0; i < 14; i++) { clock.ms += 60_000; await advance(env2); }
  const stale = await statsFromIndex(env2);
  assert.equal(stale.stale, true); assert.match(stale.staleReason, /429/);
  const st = await indexStatus(env2);
  assert.ok(st.fails >= 3 && st.restUntil, 'and it waits longer between tries');
  void db;
});
