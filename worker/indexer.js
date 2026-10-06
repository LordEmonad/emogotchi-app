/**
 * The indexer: keeps the fold (fold.js) up to date a little at a time, and answers /api/stats, /api/cats and
 * /api/starvation out of it.
 *
 * WHY. Until 2026-10-01 every refresh re-read the whole history of every pet from HyperSync (the public RPC caps
 * eth_getLogs at 100 blocks, so only HyperSync can), separately for each endpoint, at each Cloudflare location, and a
 * single refused request threw the whole refresh away. On one shared token that grew into thousands of requests an
 * hour, HyperSync answered 429 for most of a day, the stats froze and the frok and Sahur lists turned into errors.
 *
 * NOW. One index for the whole world, in D1 (table `fold`, migration 0009). The cron advances it every minute: ONE
 * HyperSync request for the logs of every contract since the last block read, applied to each contract's saved state,
 * saved again together with the new cursor. Progress is kept page by page, so a refusal costs nothing but a wait, and
 * the first build (or a new pet) simply takes a few runs. Requests never touch HyperSync: an endpoint reads the saved
 * states and works its answer out for the moment it is asked (who is dead is a matter of the clock).
 *
 * WHAT IS STORED (keys are prefixed with the fold's version; bump VERSION and everything is rebuilt from the chain):
 *   meta                   { cursors: {target: next block to read}, ready: {target: caught up once}, okAt, ... }
 *   state:<target>         a pet's or the shop's folded state (fold.js dumpPet / dumpShop)
 *   owners:<pet>:<n>       who owns ids n*10,000 .. : read and written only when a Transfer touches the chunk
 *   extras                 the starter count and the referral scores (refreshed every 15 minutes)
 *   lease                  one run at a time
 *
 * It stays LAG blocks behind the chain's tip, because what is folded is never unfolded: a block must be final first.
 */
import { AIRDROP_LAST } from './airdrop-mints.js';
import { Owners, OWNER_CHUNK, PET_TOPICS, SHOP_TOPICS, T, applyPet, applyShop, catsBody, dumpPet, dumpShop, finishPet, finishShop, loadPet, loadShop, namersOf, petLists, settlePet, statsBody } from './fold.js';
import { referralScores } from './referral.js';

const HYPERSYNC = 'https://monad.hypersync.xyz/query';
export const VERSION = 1;
// each pet contract: `key` is the pet everywhere in the Worker (?pet=), `out` its name in /api/stats
export const PETS = [
  { key: 'cat', out: 'cats', address: '0xc0a0808cbaf507b80df92b22fed8d3810eab45d5', from: 105137070 },
  // inversebrah (Inversegotchi): the same events, his own contract, no airdrop (every mint is a Transfer from 0x0)
  { key: 'frok', out: 'froks', address: '0xb841cc9a4058345cc0b5913f9e966f0c06ab49c6', from: 105974821 },
  // Tung Tung Tung Sahur (Sahuragotchi), deployed 2026-09-25
  { key: 'sahur', out: 'sahurs', address: '0xc7969c5df0353e4e65b54e3587bd0cab5d1af4c7', from: 107844915 },
  // Thiccums (Thiccumsgotchi), 2026-09-29
  { key: 'thiccums', out: 'thiccums', address: '0xbb2e3dd43350744f9764329c2c7a2ce87d9889ec', from: 108973505 },
  // the r3tard (r3tardgotchi): the same contract with no stunt (tools/r3tards-launch.mjs)
  { key: 'r3tards', out: 'r3tards', address: '0x41841b6f2f1750ab32c86c25ab2816f4996bf41e', from: 109771791 },
  // Emonad (Emonadgotchi): the r3tard's contract with his name (tools/emonad-launch.mjs)
  { key: 'emonad', out: 'emonad', address: '0xcd4bf1ea169703f810da87680a1b8fda64adcdf7', from: 110702566 },
];
const SHOP = { key: 'shop', address: '0x09b0cd33e1a4905265a12bd10989f5c29d3b1b91', from: 105137070 };
const TARGETS = [...PETS, SHOP];
export const petOf = (key) => PETS.find((p) => p.key === key) ?? null;

const LAG = 40;                 // blocks behind the tip (about 16 s on Monad, many times its finality)
const PAGE_LOGS = 6000;         // ask for pages of about this many logs: a page is applied and saved whole
const MAX_PAGES = 3;            // per run: the first build takes a few runs; after it a run is one small page
const BUDGET_MS = 20_000;       // and no new page is started past this
const LEASE_MS = 90_000;        // a run that died holds the others up no longer than this
const EXTRAS_MS = 15 * 60_000;  // the starter count and referral scores
export const STALE_MS = 10 * 60_000;   // an index not advanced for this long says so

const K = (name) => `v${VERSION}:${name}`;
const num = (hex) => Number(BigInt(hex));
const PUT = 'INSERT INTO fold (key, value, at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at';

async function rows(db, keys, per = 20) {
  const out = new Map();
  for (let i = 0; i < keys.length; i += per) {
    const part = keys.slice(i, i + per);
    const r = await db.prepare(`SELECT key, value FROM fold WHERE key IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const row of r.results ?? []) out.set(row.key, row.value);
  }
  return out;
}
const parse = (text) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

function newMeta() { return { cursors: {}, ready: {}, recount: {}, okAt: 0, height: 0, fails: 0, restUntil: 0, error: '', errorAt: 0, extrasAt: 0 }; }
function metaOf(text) {
  const m = { ...newMeta(), ...(parse(text) ?? {}) };
  for (const t of TARGETS) if (!(m.cursors[t.key] >= t.from)) { m.cursors[t.key] = t.from; m.ready[t.key] = false; }   // a new contract starts at its first block
  return m;
}

/**
 * One page from HyperSync: the logs of `group`'s contracts from block `from` (up to `to`, exclusive, when given), each
 * with its block's time, in chain order. Anything short of a whole, well-formed page throws: a page is applied for
 * good, so a doubtful one is never applied.
 */
async function page(env, group, from, to) {
  const pets = group.filter((t) => t.key !== 'shop').map((t) => t.address);
  const logs = [];
  if (pets.length) logs.push({ address: pets, topics: [PET_TOPICS] });
  if (group.some((t) => t.key === 'shop')) logs.push({ address: [SHOP.address], topics: [SHOP_TOPICS] });
  const r = await fetch(env.HYPERSYNC_URL || HYPERSYNC, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HYPERSYNC_TOKEN}` },
    body: JSON.stringify({
      from_block: from, ...(to ? { to_block: to } : {}), logs, max_num_logs: PAGE_LOGS,
      field_selection: { log: ['address', 'topic0', 'topic1', 'topic2', 'topic3', 'data', 'block_number', 'log_index'], block: ['number', 'timestamp'] },
    }),
  });
  if (!r.ok) throw new Error(`hypersync ${r.status}`);
  const j = await r.json();
  const next = Number(j.next_block);
  if (!Number.isFinite(next)) throw new Error('hypersync: no next_block');
  const ts = new Map(); const out = [];
  for (const b of j.data ?? []) {
    for (const bl of b.blocks ?? []) ts.set(Number(bl.number), num(bl.timestamp));
    for (const l of b.logs ?? []) out.push(l);
  }
  for (const l of out) {
    l.block = Number(l.block_number); l.ts = ts.get(l.block); l.address = String(l.address ?? '').toLowerCase();
    if (!Number.isFinite(l.block) || !l.ts || !l.topic0 || !l.address) throw new Error('hypersync: a log without its block, time or address');
  }
  out.sort((a, b) => a.block - b.block || (a.log_index ?? 0) - (b.log_index ?? 0));
  return { logs: out, next, height: j.archive_height == null ? null : Number(j.archive_height) };
}

/** Advance the index. Called by the cron every minute; safe to call from anywhere (one run at a time, by lease). */
export async function advance(env, log = () => {}, opts = {}) {
  const db = env.DB;
  if (!db || !env.HYPERSYNC_TOKEN) return { skipped: 'not configured' };
  const t0 = Date.now();
  const me = crypto.randomUUID();
  const got = await db.prepare(`INSERT INTO fold (key, value, at) VALUES ('lease', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at WHERE fold.at < ?`).bind(me, t0, t0 - LEASE_MS).run();
  if (!got.meta?.changes) return { skipped: 'another run is at it' };
  try { return await run(env, db, t0, log, opts); }
  finally { await db.prepare(`UPDATE fold SET at = 0 WHERE key = 'lease' AND value = ?`).bind(me).run().catch(() => {}); }
}

async function run(env, db, t0, log, opts) {
  const meta = metaOf((await rows(db, [K('meta')])).get(K('meta')));
  if (meta.restUntil > t0 && !opts.force) return { skipped: 'resting after a refusal', until: meta.restUntil };
  const wall = Math.floor(t0 / 1000);
  const states = new Map();   // target -> its state, once read
  const owners = new Map();   // pet -> Owners, with the chunks read so far
  const byAddress = new Map(TARGETS.map((t) => [t.address, t]));
  const state = async (keys) => {
    const want = keys.filter((k) => !states.has(k));
    if (!want.length) return;
    const got = await rows(db, want.map((k) => K('state:' + k)));
    for (const k of want) { const j = parse(got.get(K('state:' + k))); states.set(k, k === 'shop' ? loadShop(j) : loadPet(k, j)); }
  };
  const chunks = async (key, idxs) => {
    let o = owners.get(key); if (!o) { o = new Owners(); owners.set(key, o); }
    const want = [...new Set(idxs)].filter((i) => !o.has(i));
    if (!want.length) return o;
    const got = await rows(db, want.map((i) => K(`owners:${key}:${i}`)), 3);   // a chunk is up to 400 KB
    for (const i of want) o.give(i, got.get(K(`owners:${key}:${i}`)) ?? '');
    return o;
  };
  const save = async (changed) => {
    const now = Date.now();
    // the owners first, three chunks a write (they are large, and writing one twice is harmless); then the states and
    // the cursor together, so a state is never saved without the cursor it belongs to
    const big = [];
    for (const [key, o] of owners) for (const i of o.dirty) big.push(db.prepare(PUT).bind(K(`owners:${key}:${i}`), o.text(i), now));
    for (let i = 0; i < big.length; i += 3) await db.batch(big.slice(i, i + 3));
    for (const o of owners.values()) o.dirty.clear();
    const batch = [...changed].map((k) => {
      const text = JSON.stringify(k === 'shop' ? dumpShop(states.get(k)) : dumpPet(states.get(k), wall));
      if (text.length > 1_800_000) throw new Error(`the ${k} state is ${text.length} bytes: past what one row holds`);
      return db.prepare(PUT).bind(K('state:' + k), text, now);
    });
    batch.push(db.prepare(PUT).bind(K('meta'), JSON.stringify(meta), now));
    await db.batch(batch);
  };

  let pages = 0, applied = 0, failed = null, tip = false;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  while (pages < maxPages && Date.now() - t0 < (opts.budgetMs ?? BUDGET_MS)) {
    // a contract that is behind the others (the first build; a pet added later) is caught up to them first, by itself;
    // then one request covers everything
    const top = Math.max(...TARGETS.map((t) => meta.cursors[t.key]));
    const behind = TARGETS.filter((t) => meta.cursors[t.key] < top);
    const group = behind.length ? behind : TARGETS;
    const from = Math.min(...group.map((t) => meta.cursors[t.key]));
    const to = behind.length ? top : 0;
    let pg;
    try {
      pg = await page(env, group, from, to);
      pages += 1;
      // what is safe to fold for good: below the page's end, and (at the tip) LAG blocks behind the chain
      const safe = to || ((pg.height ?? pg.next) - LAG);
      const end = Math.max(from, Math.min(pg.next, safe));
      const mine = new Map();   // target -> its logs in this page, from its own cursor on
      for (const l of pg.logs) {
        const t = byAddress.get(l.address);
        if (!t || l.block >= end || l.block < meta.cursors[t.key]) continue;
        let a = mine.get(t.key); if (!a) { a = []; mine.set(t.key, a); } a.push(l);
      }
      await state([...mine.keys()]);
      for (const [key, list] of mine) {
        applied += list.length;
        if (key === 'shop') { const s = states.get(key); for (const l of list) applyShop(s, l); continue; }
        const moved = list.filter((l) => l.topic0 === T.transfer).map((l) => Owners.chunkOf(num(l.topic3)));
        const o = await chunks(key, moved);
        const s = states.get(key);
        for (const l of list) applyPet(s, key, l, o, wall);
        settlePet(s);
        if (moved.length) meta.recount[key] = true;
      }
      for (const t of group) if (meta.cursors[t.key] < end) meta.cursors[t.key] = end;
      tip = !to && (pg.next >= safe || pg.next <= from);
      const changed = new Set(mine.keys());
      if (tip) {
        // At the tip everything is caught up. Holders are recounted here, in the same save as the page that changed
        // them, so an answer never shows a count from before a Transfer (or none at all, the first time).
        const stale = PETS.filter((p) => meta.recount[p.key]).map((p) => p.key);
        await state(stale);
        for (const key of stale) {
          const s = states.get(key);
          const o = await chunks(key, Array.from({ length: Owners.chunkOf(s.maxId) + 1 }, (_, i) => i));
          s.holders = o.count(); s.holdersStale = false; delete meta.recount[key]; changed.add(key);
        }
        for (const t of TARGETS) meta.ready[t.key] = true;
      }
      Object.assign(meta, { okAt: Date.now(), height: pg.height ?? meta.height, fails: 0, restUntil: 0, error: '' });
      await save(changed);
    } catch (e) { failed = e; break; }   // a refusal, a bad page, a log that would not fold: nothing of the page is kept
    if (tip || pg.next <= from) break;
  }

  if (failed) {
    // Wait, longer each time, and carry on from the cursor. Only the note of the failure is written: the states in
    // memory may be half a page ahead and are dropped with this run
    const kept = metaOf((await rows(db, [K('meta')])).get(K('meta')));
    kept.fails = (kept.fails ?? 0) + 1;
    Object.assign(kept, { restUntil: Date.now() + Math.min(600_000, 45_000 * 2 ** (kept.fails - 1)), error: String(failed).slice(0, 160), errorAt: Date.now() });
    await db.prepare(PUT).bind(K('meta'), JSON.stringify(kept), Date.now()).run();
    log(`stopped after ${pages} page(s): ${kept.error}`);
    return { pages, applied, error: kept.error, cursors: kept.cursors };
  }

  // the starter count and the referral scores: one RPC call and a few KV reads, every 15 minutes
  let extras = null;
  if (TARGETS.every((t) => meta.ready[t.key]) && Date.now() - (meta.extrasAt ?? 0) > EXTRAS_MS) {
    await state(PETS.map((p) => p.key));
    const [starters, referrals] = await Promise.all([starterStats(env), referralScores(env, namersOf(PETS.map((p) => states.get(p.key))))]);
    extras = { starters, referrals, at: Date.now() };
    meta.extrasAt = extras.at;
  }
  if (extras) {
    await db.prepare(PUT).bind(K('extras'), JSON.stringify(extras), Date.now()).run();
    await save([]);
  }
  if (applied || !tip) log(`${pages} page(s), ${applied} log(s), at ${Math.max(...Object.values(meta.cursors))}${tip ? '' : ' (still catching up)'}`);
  return { pages, applied, tip, cursors: meta.cursors };
}

/**
 * Passkey accounts that actually started playing. Every account that takes a first action is sent 0.05 MON from one
 * dedicated wallet (worker/drip.js), exactly once, and only drip.js ever spends from it: so the drip wallet's nonce IS
 * the number of starters handed out. One eth_getTransactionCount, deliberately (a HyperSync scan of its transactions
 * once took the shared token down, 2026-09-21). If MON is ever sent out of that wallet by hand, this over-counts by one
 * per send. It cannot see an account that was created and never used, nor any from before the drip (2026-09-21).
 */
async function starterStats(env) {
  const wallet = env.DRIP_ADDRESS ?? '';
  if (!wallet) return null;
  try {
    const r = await fetch(env.RPC_URL || 'https://rpc.monad.xyz', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [wallet, 'latest'] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.result) return null;
    return { accounts: Number(BigInt(j.result)), wallet: wallet.toLowerCase(), basis: 'drip wallet nonce' };
  } catch { return null; }
}

// ------------------------------------------------------------------ what the endpoints answer
/** `generatedAt` is when the index last heard from the chain; an index that has not for a while says it is stale. */
const stamp = (meta) => ({ generatedAt: new Date(meta.okAt).toISOString(), ...(Date.now() - meta.okAt > STALE_MS ? { stale: true, staleReason: meta.error || 'the index has not advanced' } : {}) });

/** /api/stats, or null while the index is still being built. */
export async function statsFromIndex(env) {
  if (!env.DB) return null;
  const got = await rows(env.DB, [K('meta'), K('extras'), ...TARGETS.map((t) => K('state:' + t.key))]);
  const meta = parse(got.get(K('meta')));
  if (!meta || !TARGETS.every((t) => meta.ready?.[t.key])) return null;
  const now = Math.floor(Date.now() / 1000);
  const pets = {};
  for (const p of PETS) pets[p.out] = finishPet(loadPet(p.key, parse(got.get(K('state:' + p.key)))), p, now);
  const shop = finishShop(loadShop(parse(got.get(K('state:shop')))), SHOP.address);
  const extras = parse(got.get(K('extras')));
  const { generatedAt, ...stale } = stamp(meta);
  return { ...statsBody({ generatedAt, now, pets, shop, starters: extras?.starters ?? null, referrals: extras?.referrals ?? null }), ...stale };
}

async function listsFromIndex(env, pet) {
  if (!env.DB || !petOf(pet)) return null;
  const got = await rows(env.DB, [K('meta'), K('state:' + pet)]);
  const meta = parse(got.get(K('meta')));
  if (!meta?.ready?.[pet]) return null;
  return { meta, lists: petLists(loadPet(pet, parse(got.get(K('state:' + pet)))), pet, Math.floor(Date.now() / 1000)) };
}
/** /api/cats[?pet=], or null while that pet's index is still being built. */
export async function catsFromIndex(env, pet) {
  const r = await listsFromIndex(env, pet);
  if (!r) return null;
  const { generatedAt, ...stale } = stamp(r.meta);
  return { ...catsBody(r.lists, generatedAt), ...stale };
}
/** /api/starvation[?pet=]: the numbers behind the Great Starvation strip. */
export async function starvationFromIndex(env, pet) {
  const r = await listsFromIndex(env, pet);
  if (!r) return null;
  return { ...stamp(r.meta), ...r.lists.starvation };
}

/** /api/index: how far the index has read and when it last heard from the chain (for whoever is watching it). */
export async function indexStatus(env) {
  if (!env.DB) return { version: VERSION, error: 'no database' };
  const meta = parse((await rows(env.DB, [K('meta')])).get(K('meta')));
  if (!meta) return { version: VERSION, built: false };
  const sizes = await env.DB.prepare(`SELECT key, length(value) AS bytes, at FROM fold WHERE key LIKE ? ORDER BY key`).bind(K('') + '%').all();
  return {
    version: VERSION, built: TARGETS.every((t) => meta.ready?.[t.key]), ready: meta.ready, cursors: meta.cursors, height: meta.height,
    behind: meta.height ? Math.max(0, meta.height - Math.min(...Object.values(meta.cursors))) : null,
    okAt: meta.okAt ? new Date(meta.okAt).toISOString() : null, fails: meta.fails, restUntil: meta.restUntil > Date.now() ? new Date(meta.restUntil).toISOString() : null,
    error: meta.error || null, errorAt: meta.errorAt ? new Date(meta.errorAt).toISOString() : null,
    rows: (sizes.results ?? []).filter((r) => !r.key.includes(':owners:')).map((r) => ({ key: r.key, bytes: r.bytes })),
    ownerChunks: (sizes.results ?? []).filter((r) => r.key.includes(':owners:')).length,
    airdrop: AIRDROP_LAST, chunk: OWNER_CHUNK,
  };
}
