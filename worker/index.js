/**
 * emogotchi.emonad.lol/api/cats
 *
 * The gallery needs to know which cats have been named and which are dead, across all 82k of them.
 * Monad's public RPC caps log queries at 100 blocks, so a browser cannot work that out. Envio's
 * HyperSync can answer it in one request, but its token must not ship in the site's JavaScript.
 *
 * So: this Worker holds the token, asks HyperSync, and hands back just the ids. It caches for 30
 * seconds at the edge, so a thousand readers cost two upstream requests a minute rather than a
 * thousand, and a cat named right now shows up within half a minute.
 */
const GAME = '0xc0a0808cbaf507b80df92b22fed8d3810eab45d5';
const FROM_BLOCK = 105137070; // the deploy
// inversebrah (Inversegotchi): the same events, his own contract, no airdrop (every mint is a Transfer from 0x0)
const INVERSE = '0xb841cc9a4058345cc0b5913f9e966f0c06ab49c6';
const INVERSE_FROM_BLOCK = 105974821;
import { stats } from './stats.js';
import { AIRDROP_LAST, AIRDROP_RUNS } from './airdrop-mints.js';
import { preview, previewRoute } from './preview.js';
import { poke } from './keeper.js';
let statsInflight = null; // one fold at a time per isolate
const HYPERSYNC = 'https://monad.hypersync.xyz/query';
const TOPIC_NAMED = '0x9726e950b835e1f7f4fe747cca4223de678452a4f67c102d50408e22e94e9485'; // Named(uint256,string)
const TOPIC_CARE = '0xb32e67b898f6bb5ba6674e4ee94c0710c672d372fcdc15197bd6182b935ccd49'; // Care(uint256 indexed id, uint8 indexed action, address indexed by, uint256 paid, uint256 timestamp)
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer(address,address,uint256)
const ZERO32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const CACHE_SECONDS = 30;
const MINTS_CACHE_SECONDS = 6 * 3600;
// The airdrop: cats 1..AIRDROP_LAST were minted in 330 batches over 5m20s on launch day, and each batch carries
// its own mint time (cat #1 at 21:16:56 UTC, #82423 at 21:22:16), so their welcome weeks end five minutes apart.
// The exact times are baked in airdrop-mints.js; every cat after was claimed one at a time and is read from its
// Transfer log.
const WELCOME = 7 * 86400;
const DEATH_AFTER = 48 * 3600;
const REVIVE_BACKDATE = 0.4 * 24 * 3600; // a revive sets the feed clock to "60 left": 40% of a day ago
const DAY = 86400;

/** The ABI-encoded string in a log's `data`: offset, length, then the utf-8 bytes. */
function decodeString(data) {
  if (!data || data.length < 130) return '';
  const len = parseInt(data.slice(66, 130), 16);
  if (!Number.isFinite(len) || len <= 0 || len > 128) return '';
  const hex = data.slice(130, 130 + len * 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

/**
 * Walk the matching logs. Returns ids newest first, and for Named also the current name of each cat:
 * a cat can be renamed, so the last event for an id wins.
 */
async function scan(env, topic, withName, game = GAME, fromBlock = FROM_BLOCK) {
  const seen = new Map(); // id -> name (or '')
  let from = fromBlock;
  for (let page = 0; page < 40; page++) {
    const r = await fetch(HYPERSYNC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HYPERSYNC_TOKEN}` },
      body: JSON.stringify({
        from_block: from,
        logs: [{ address: [game], topics: [[topic]] }],
        field_selection: { log: withName ? ['topic1', 'data'] : ['topic1'] },
      }),
    });
    if (!r.ok) throw new Error(`hypersync ${r.status}`);
    const j = await r.json();
    for (const b of j.data ?? []) for (const l of b.logs ?? []) seen.set(Number(BigInt(l.topic1)), withName ? decodeString(l.data) : '');
    if (j.next_block == null || j.next_block <= from) break;
    from = j.next_block;
  }
  const ids = [...seen.keys()].sort((a, b) => b - a);
  return withName ? ids.map((id) => ({ id, name: seen.get(id) })) : ids;
}

/**
 * Which cats are dead, the way the contract works it out rather than the way it records it. On chain death
 * is a computed fact: `Died` is only emitted when a dead cat is next touched or poked, so a cat that starved
 * and was never touched again never emits it, while `state()` (and the gallery's cards) call it dead. The
 * gallery's dead count must therefore be derived from the clock: a cat is dead when now >= lastFed + 48 h,
 * where lastFed is the latest of its feeds, its revives (backdated 9.6 h), and the moment its clock
 * started (its first care, or 7 days after mint, whichever came first). Never cared for: mint + 7 d + 48 h.
 */
async function deadCats(env, pet = 'cat') { return (await clocks(env, pet)).dead; }

/**
 * Every pet's death clock, and what it adds up to: the dead list for the gallery and the numbers behind the
 * Great Starvation strip. A pet that has never been fed and never revived has never died if its clock says it is
 * alive (death is permanent without a revive), so `neverDied` is the alive-by-clock count minus the revived.
 */
async function clocks(env, pet = 'cat') {
  const [mints, care] = await Promise.all([mintTimes(env, pet), careTimes(env, pet)]);
  const now = Math.floor(Date.now() / 1000);
  const dead = [], pristine = [];
  let neverFed = 0, starving = 0, neverDied = 0, nextDeath = 0, firstStart = 0;
  // the wave: the airdrop's untouched cats, counted down to the first of their deaths (their batches were minted
  // over 5m20s, so the deaths are spread the same way); for the froks, the largest cohort sharing a death time
  const waves = new Map(); // diesAt -> how many never-fed pets share it
  let airdropWave = { count: 0, deathAt: 0 };
  for (const [id, mintedAt] of mints) {
    const c = care.get(id);
    const implied = mintedAt + WELCOME;
    let lastFed;
    if (!c) lastFed = implied;
    else {
      lastFed = Math.min(c.first, implied); // the clock started at the first care, or ran by itself
      if (c.fed > lastFed) lastFed = c.fed;
      if (c.revived - REVIVE_BACKDATE > lastFed) lastFed = c.revived - REVIVE_BACKDATE;
    }
    const diesAt = lastFed + DEATH_AFTER;
    const isDead = now >= diesAt;
    const everFed = !!(c && (c.fed || c.revived));
    if (isDead) dead.push(id);
    else {
      if (!c || !c.revived) { neverDied += 1; pristine.push(id); }
      if (!nextDeath || diesAt < nextDeath) nextDeath = diesAt;
    }
    if (!everFed) {
      neverFed += 1;
      if (!isDead && now >= lastFed) starving += 1;              // the clock has started and nobody has come
      if (!isDead && (!firstStart || lastFed < firstStart)) firstStart = lastFed;   // the earliest clock among them
      if (!isDead) {
        // untouched only: a cat washed but never fed runs its own clock from that wash and is not part of the wave
        if (pet === 'cat' && id <= AIRDROP_LAST && !c) { airdropWave.count += 1; if (!airdropWave.deathAt || diesAt < airdropWave.deathAt) airdropWave.deathAt = diesAt; }
        else waves.set(diesAt, (waves.get(diesAt) ?? 0) + 1);
      }
    }
  }
  dead.sort((a, b) => b - a); pristine.sort((a, b) => b - a);
  let wave = { deathAt: 0, count: 0 };
  for (const [at, n] of waves) if (n > wave.count) wave = { deathAt: at, count: n };
  if (airdropWave.count > wave.count) wave = airdropWave;
  const starvation = {
    total: mints.size, dead: dead.length, neverFed, starving, neverDied, nextDeath,
    wave: { count: wave.count, clockStart: wave.deathAt ? wave.deathAt - DEATH_AFTER : 0, deathAt: wave.deathAt },   // the big one: the airdrop's untouched cats
    clockStart: firstStart,                 // when the earliest never-fed pet's meters begin to drain
    deathAt: firstStart ? firstStart + DEATH_AFTER : 0,   // and when it starves
  };
  return { dead, pristine, starvation };
}

/** A descending id list as [hi, lo] runs: eighty thousand dead cats are a few hundred runs. */
function runsOf(ids) {
  const runs = [];
  for (const id of ids) { const r = runs[runs.length - 1]; if (r && r[1] === id + 1) r[1] = id; else runs.push([id, id]); }
  return runs;
}

/** id -> { first: first care of any kind, fed: latest feed, revived: latest revive } from the Care logs. */
async function careTimes(env, pet = 'cat') {
  const game = pet === 'frok' ? INVERSE : GAME;
  const out = new Map();
  let from = pet === 'frok' ? INVERSE_FROM_BLOCK : FROM_BLOCK;
  for (let page = 0; page < 200; page++) {
    const r = await fetch(HYPERSYNC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HYPERSYNC_TOKEN}` },
      body: JSON.stringify({ from_block: from, logs: [{ address: [game], topics: [[TOPIC_CARE]] }], field_selection: { log: ['topic1', 'topic2', 'data'] } }),
    });
    if (!r.ok) throw new Error(`hypersync ${r.status}`);
    const j = await r.json();
    for (const b of j.data ?? []) for (const l of b.logs ?? []) {
      const id = Number(BigInt(l.topic1)); const action = Number(BigInt(l.topic2));
      const at = parseInt(l.data.slice(66, 130), 16); // (paid, timestamp)
      if (!Number.isFinite(at)) continue;
      let c = out.get(id);
      if (!c) { c = { first: Infinity, fed: 0, revived: 0 }; out.set(id, c); }
      if (action <= 4) { if (at < c.first) c.first = at; if (action === 0 && at > c.fed) c.fed = at; }
      else if (action === 7) { if (at > c.revived) c.revived = at; if (at < c.first) c.first = at; }
    }
    if (j.next_block == null || j.next_block <= from) break;
    from = j.next_block;
  }
  return out;
}

/** id -> mint time. The airdrop from its baked batch times; the claims from their Transfer logs, cached for hours
 *  (a cat cannot be dead within nine days of its mint without a care we would see). */
async function mintTimes(env, pet = 'cat') {
  const game = pet === 'frok' ? INVERSE : GAME;
  const cache = caches.default;
  const key = new Request(`https://emogotchi.emonad.lol/api/_mints${pet === 'frok' ? '-frok' : ''}`);
  let claimed;
  const hit = await cache.match(key);
  if (hit) claimed = await hit.json();
  else {
    claimed = [];
    let from = pet === 'frok' ? INVERSE_FROM_BLOCK : FROM_BLOCK;
    for (let page = 0; page < 200; page++) {
      const r = await fetch(HYPERSYNC, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HYPERSYNC_TOKEN}` },
        body: JSON.stringify({
          from_block: from,
          logs: [{ address: [game], topics: [[TOPIC_TRANSFER], [ZERO32]] }],
          field_selection: { log: ['topic3', 'block_number'], block: ['number', 'timestamp'] },
        }),
      });
      if (!r.ok) throw new Error(`hypersync ${r.status}`);
      const j = await r.json();
      for (const b of j.data ?? []) {
        const ts = new Map((b.blocks ?? []).map((bl) => [Number(bl.number), Number(BigInt(bl.timestamp))]));
        for (const l of b.logs ?? []) {
          const id = Number(BigInt(l.topic3));
          if (pet === 'cat' && id <= AIRDROP_LAST) continue;
          const at = ts.get(Number(l.block_number));
          if (at) claimed.push([id, at]);
        }
      }
      if (j.next_block == null || j.next_block <= from) break;
      from = j.next_block;
    }
    await cache.put(key, new Response(JSON.stringify(claimed), { headers: { 'cache-control': `public, max-age=${MINTS_CACHE_SECONDS}` } }));
  }
  const mints = new Map();
  if (pet === 'cat') for (const [lo, hi, at] of AIRDROP_RUNS) for (let id = lo; id <= hi; id++) mints.set(id, at);
  for (const [id, at] of claimed) mints.set(id, at);
  return mints;
}

export default {
  /** The Autocare cron (wrangler.toml `[triggers]`): a free read of what is due, a transaction only when there is work. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(poke(env, (m) => console.log('[autocare]', m)).then((s) => console.log('[autocare]', JSON.stringify(s))).catch((e) => console.error('[autocare]', String(e))));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const petPage = previewRoute(url.pathname);
    if (petPage) return preview(request, env, ctx, petPage);
    if (/^\/(inversebrah\/)?pet\//.test(url.pathname)) return fetch(request);   // anything else under the routed prefixes goes to Pages as before   // /pet/<id> and /inversebrah/pet/<id>: the page, with that pet's link preview
    if (url.pathname.startsWith('/api/stats')) {
      // the whole history of both pets and the shop, folded: a cold fold is ~5 s of HyperSync, so the edge keeps
      // it for five minutes, serves a stale copy (up to an hour old) at once while a background fold replaces it,
      // and concurrent misses in one isolate share a single fold instead of each running their own
      const cache = caches.default;
      const key = new Request(url.origin + '/api/stats');
      const hit = await cache.match(key);
      const fold = () => statsInflight ??= stats(env).then((j) => {
        const res = new Response(JSON.stringify(j), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-generated': j.generatedAt, 'access-control-allow-origin': '*' } });
        return cache.put(key, res.clone()).then(() => res);
      }).finally(() => { statsInflight = null; });
      if (hit) {
        const age = (Date.now() - Date.parse(hit.headers.get('x-generated') ?? 0)) / 1000;
        if (age > 300) ctx.waitUntil(fold().catch(() => {}));
        return hit;
      }
      try { return await fold(); } catch (e) {
        return new Response(JSON.stringify({ error: String(e).slice(0, 160) }), { status: 502, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
      }
    }
    if (url.pathname.startsWith('/api/starvation')) {
      // the numbers behind the Great Starvation strip: tiny, 30 s at the edge
      const pet = url.searchParams.get('pet') === 'frok' ? 'frok' : 'cat';
      const cache = caches.default;
      const key = new Request(url.origin + '/api/starvation' + (pet === 'frok' ? '?pet=frok' : ''));
      const hit = await cache.match(key);
      if (hit) return hit;
      try {
        const { starvation } = await clocks(env, pet);
        const res = new Response(JSON.stringify({ generatedAt: new Date().toISOString(), ...starvation }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${CACHE_SECONDS}`, 'access-control-allow-origin': '*' } });
        ctx.waitUntil(cache.put(key, res.clone()));
        return res;
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e).slice(0, 120) }), { status: 502, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
      }
    }
    if (!url.pathname.startsWith('/api/cats')) return new Response('not found', { status: 404 });
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
    }

    // ?pet=frok answers for inversebrah's contract; anything else is the cats
    const pet = url.searchParams.get('pet') === 'frok' ? 'frok' : 'cat';
    const cache = caches.default;
    const key = new Request(url.origin + '/api/cats' + (pet === 'frok' ? '?pet=frok' : ''), request);
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const [named, { dead: died, pristine, starvation }] = await Promise.all([
        pet === 'frok' ? scan(env, TOPIC_NAMED, true, INVERSE, INVERSE_FROM_BLOCK) : scan(env, TOPIC_NAMED, true),
        clocks(env, pet),
      ]);
      // the dead go as runs once there are many (after the Great Starvation, most cats); a short list stays plain
      const body = JSON.stringify({ generatedAt: new Date().toISOString(), live: true, named, ...(died.length <= 2000 ? { died } : { diedRuns: runsOf(died) }), ...(pristine.length <= 2000 ? { neverDied: pristine } : { neverDiedRuns: runsOf(pristine) }), starvation });
      const res = new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': `public, max-age=${CACHE_SECONDS}`,
          'access-control-allow-origin': '*',
        },
      });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      // the site falls back to the file it ships with, so a bad minute here is not a broken page
      return new Response(JSON.stringify({ error: String(e).slice(0, 120) }), {
        status: 502,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
  },
};
