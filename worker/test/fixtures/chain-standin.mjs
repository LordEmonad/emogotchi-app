// A made-up history of every pet contract the index knows (indexer.js PETS: a pet added there is in this history too) and the shop, a stand-in for HyperSync that serves it the way the real
// one does (pages, next_block, archive_height, refusals on demand), and a stand-in for D1 on in-process SQLite. For
// test/fold.test.mjs: the index folded a page at a time must end exactly where one fold of everything does.
import { DatabaseSync } from 'node:sqlite';
import { AIRDROP_LAST, AIRDROP_RUNS } from '../../airdrop-mints.js';
import { T } from '../../fold.js';
import { PETS } from '../../indexer.js';

const KEYS = PETS.map((p) => p.key);
export const ADDR = { ...Object.fromEntries(PETS.map((p) => [p.key, p.address])), shop: '0x09b0cd33e1a4905265a12bd10989f5c29d3b1b91' };
const FROM = { ...Object.fromEntries(PETS.map((p) => [p.key, p.from])), shop: 105137070 };
// how many stunt kinds each pet's contract has (a pet not listed has none)
const KINDS = { frok: 4, sahur: 1, thiccums: 1 };
const ZERO = '0x' + '0'.repeat(40);
const T0 = AIRDROP_RUNS[0][2];     // the airdrop's first batch
const B0 = 105137100;              // its block
const RATE = 2.6;                  // blocks a second: several blocks share one timestamp, as on Monad
export const blockAt = (ts) => B0 + Math.floor((ts - T0) * RATE);
const startOf = (key) => T0 + Math.ceil((FROM[key] - B0) / RATE) + 2;   // a contract's first possible log
// the history must run past the newest pet's first block, with a couple of days of its own
const MIN_DAYS = Math.ceil((Math.max(...KEYS.map(startOf)) - T0) / 86400) + 2;

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const w32 = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const a32 = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const data = (...words) => '0x' + words.map((n) => BigInt(n).toString(16).padStart(64, '0')).join('');
const MON = 10n ** 18n;
function str(s) {
  const bytes = new TextEncoder().encode(s);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return '0x' + (32).toString(16).padStart(64, '0') + bytes.length.toString(16).padStart(64, '0') + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
}

/**
 * The history: the real airdrop (82,423 cats at their baked times), then `days` days of everything the contracts can
 * emit, on every pet from its own first block (`days` is raised to pass the newest pet's first block by two days). Returns { logs (chain order, each with block, ts, log_index), now, tip }.
 */
export function makeHistory({ seed = 1, days: asked = 19, events = 11000, airdrop = true } = {}) {
  const days = Math.max(asked, MIN_DAYS);
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const wallets = Array.from({ length: 260 }, (_, i) => '0x' + (i + 1).toString(16).padStart(4, '0') + 'a'.repeat(36));
  const raw = [];   // { ts, seq, address, topics, data }
  let seq = 0;
  const emit = (key, ts, topics, d = '0x') => raw.push({ ts, seq: seq++, address: ADDR[key], topic0: topics[0], topic1: topics[1] ?? null, topic2: topics[2] ?? null, topic3: topics[3] ?? null, data: d });
  // the airdrop: one block per batch
  if (airdrop) for (const [lo, hi, at] of AIRDROP_RUNS) for (let id = lo; id <= hi; id++) emit('cat', at, [T.transfer, a32(ZERO), a32('0x' + id.toString(16).padStart(40, '0')), w32(id)]);
  const end = T0 + days * 86400;
  const minted = Object.fromEntries(KEYS.map((k) => [k, k === 'cat' && airdrop ? [5, 9, 77, 250, 251, 4000, 49474, 82000, 82423, 12, 13, 14, 999, 30000] : []]));
  const owner = Object.fromEntries(KEYS.map((k) => [k, new Map()]));
  const nextId = Object.fromEntries(KEYS.map((k) => [k, k === 'cat' ? AIRDROP_LAST + 1 : 1]));
  const kindsOf = Object.fromEntries(KEYS.map((k) => [k, KINDS[k] ?? 0]));
  const names = ['Kimi', 'DEUCES', 'Froky', 'x', 'Harold Clayton Lloyd', 'ねこ', '$EMO', '', 'a'.repeat(60)];
  const times = Array.from({ length: events }, () => T0 + 400 + Math.floor(r() * (end - T0 - 400))).sort((a, b) => a - b);
  for (const ts of times) {
    const live = KEYS.filter((k) => ts >= startOf(k));
    const key = pick(live);
    const x = r();
    const mint = () => { const id = nextId[key]++; const to = pick(wallets); minted[key].push(id); owner[key].set(id, to); emit(key, ts, [T.transfer, a32(ZERO), a32(to), w32(id)]); };
    if (!minted[key].length || x < 0.06) { mint(); continue; }
    const id = pick(minted[key]);
    const by = owner[key].get(id) ?? pick(wallets);
    if (x < 0.62) {   // a care: feed, play, wash, sleep, clean, wake, name, revive
      const a = pick([0, 0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 7]);
      const paid = key === 'cat' ? (a === 6 ? 10n : a === 7 ? 1000n : a === 5 ? 0n : 1n) * MON : (a === 6 ? 10n * MON : 0n);
      if (a === 7) emit(key, ts, [T.died, w32(id)]);   // a revive of a dead pet records its death first
      emit(key, ts, [T.care, w32(id), w32(a), a32(by)], data(paid, ts));
      if (a === 6) emit(key, ts, [T.named, w32(id)], str(pick(names)));
      if (a === 7) emit(key, ts, [T.revived, w32(id)]);
    } else if (x < 0.74) emit(key, ts, [T.petted, w32(id), a32(by)], data(1 + Math.floor(r() * 9)));
    else if (x < 0.80) emit(key, ts, [T.burn], data(BigInt(Math.floor(r() * 90000)) * 10n ** 15n, BigInt(Math.floor(r() * 3000000)) * 10n ** 15n));
    else if (x < 0.90 && kindsOf[key]) emit(key, ts, [T.abuse, w32(id), w32(Math.floor(r() * kindsOf[key])), a32(by)]);
    else if (x < 0.93) { const to = pick(wallets); owner[key].set(id, to); emit(key, ts, [T.transfer, a32(by), a32(to), w32(id)]); }
    else if (x < 0.98) emit('shop', ts, [T.claimed, w32(1 + Math.floor(r() * 17)), a32(pick(wallets))], data(1 + Math.floor(r() * 3), BigInt(Math.floor(r() * 2)) * 36n * MON));
    else emit('shop', ts, [T.burn], data(BigInt(Math.floor(r() * 300000)) * 10n ** 15n, BigInt(Math.floor(r() * 9000000)) * 10n ** 15n));
  }
  raw.sort((a, b) => a.ts - b.ts || a.seq - b.seq);
  // into blocks: a log's block is its time's first block plus a little, so one second spans several blocks
  let lastBlock = 0; const idx = new Map();
  const logs = raw.map((l) => {
    const block = Math.max(lastBlock, blockAt(l.ts) + (l.seq % 2));
    lastBlock = block;
    const i = idx.get(block) ?? 0; idx.set(block, i + 1);
    return { address: l.address, topic0: l.topic0, topic1: l.topic1, topic2: l.topic2, topic3: l.topic3, data: l.data, block_number: block, log_index: i, _ts: l.ts };
  });
  return { logs, now: end + 120, tip: blockAt(end + 120) };
}

/**
 * HyperSync's /query, for a history. `height` is the chain's tip as HyperSync knows it (set it to move the chain on);
 * `refuse()` may return a status to answer with instead; `pageLogs` caps a page (whole blocks, like the real one).
 */
export function hyperSync(history, { pageLogs = 5000 } = {}) {
  const hs = {
    height: history.tip, calls: 0, refuse: () => 0, pageLogs, shuffle: false,
    query(body) {
      hs.calls += 1;
      const status = hs.refuse(body);
      if (status) return { status, json: { error: 'refused' } };
      const from = body.from_block, to = Math.min(body.to_block ?? Infinity, hs.height + 1);
      const want = (l) => body.logs.some((sel) => (!sel.address || sel.address.includes(l.address)) && (sel.topics ?? []).every((alts, i) => !alts?.length || alts.includes(l[`topic${i}`])));
      const cap = Math.min(hs.pageLogs, body.max_num_logs ?? Infinity);
      const out = []; let next = to;
      // logs are in block order: binary search the first at or after `from`
      let lo = 0, hi = history.logs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (history.logs[m].block_number < from) lo = m + 1; else hi = m; }
      for (let i = lo; i < history.logs.length; i++) {
        const l = history.logs[i];
        if (l.block_number >= to) break;
        if (out.length >= cap && l.block_number !== out[out.length - 1].block_number) { next = l.block_number; break; }
        if (want(l)) out.push(l);
      }
      const fields = body.field_selection?.log ?? [];
      const blocks = new Map(out.map((l) => [l.block_number, l._ts]));
      const shaped = out.map((l) => Object.fromEntries(fields.map((f) => [f, l[f]])));
      const batch = (ls, bs) => ({ logs: ls, ...(body.field_selection?.block ? { blocks: bs.map(([n, ts]) => ({ number: n, timestamp: '0x' + ts.toString(16) })) } : {}) });
      const bl = [...blocks.entries()];
      // `shuffle`: two batches, the later logs first and every block in the second: a page is one answer, and nothing
      // may lean on the order it arrives in
      const half = Math.floor(shaped.length / 2);
      const pageData = hs.shuffle && shaped.length > 3 ? [batch(shaped.slice(half).reverse(), []), batch(shaped.slice(0, half), bl)] : [batch(shaped, bl)];
      return { status: 200, json: { data: pageData, next_block: Math.max(next, Math.min(from, hs.height + 1)), archive_height: hs.height } };
    },
  };
  return hs;
}

/** `fetch` for the tests: HyperSync's /query to the stand-in, the RPC's one call answered, anything else refused. */
export function fetchFor(hs) {
  return async (url, init) => {
    const u = String(url);
    if (u.includes('hypersync')) { const { status, json } = hs.query(JSON.parse(init.body)); return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } }); }
    if (u.includes('rpc')) return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1a' }), { headers: { 'content-type': 'application/json' } });
    return new Response('no', { status: 500 });
  };
}

/** D1's API over in-process SQLite, with the fold table of migration 0009. */
export function d1(migration) {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  const d = {
    writes: 0, failNext: 0,
    prepare(sql) {
      const make = (args) => ({
        bind: (...a) => make(a),
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async run() { if (d.failNext > 0 && /^\s*(INSERT|UPDATE)/i.test(sql) && !sql.includes("'lease'")) { d.failNext -= 1; throw new Error('D1_ERROR: made up'); } d.writes += 1; const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
        _run() { return db.prepare(sql).run(...args); },
      });
      return make([]);
    },
    async batch(stmts) {
      if (d.failNext > 0) { d.failNext -= 1; throw new Error('D1_ERROR: made up'); }
      db.exec('BEGIN');
      try { for (const s of stmts) { s._run(); d.writes += 1; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      return stmts.map(() => ({ meta: {} }));
    },
    raw: db,
  };
  return d;
}
