/**
 * The fold: every log of a pet contract (and of the item shop) added up into the numbers the site shows. Everything
 * behind /api/stats, /api/cats and /api/starvation comes out of the state kept here.
 *
 * It is written as a reducer on purpose. `applyPet(state, log)` takes ONE log; `finishPet` and `petLists` turn a state
 * into what the pages read, for a given `now`. So the history never has to be read twice: the indexer (indexer.js)
 * keeps each state, feeds it only the logs since the last block it read, and saves it again. A state read back from
 * storage and fed the rest of the logs ends exactly where one fed everything at once does (test/fold.test.mjs), which
 * is what lets a refresh be one small request instead of the whole history.
 *
 * Nothing in here touches the network or storage, and nothing in a state depends on when it was folded: the clock only
 * enters in `finish*` and in what `dump*` may forget (things older than any window a page shows).
 *
 * Nothing here is authoritative for a pet's *state* (the contract is); this is history and aggregates.
 */
import { AIRDROP_LAST, AIRDROP_RUNS } from './airdrop-mints.js';

export const T = {
  care: '0xb32e67b898f6bb5ba6674e4ee94c0710c672d372fcdc15197bd6182b935ccd49',      // Care(uint256 indexed id, uint8 indexed action, address indexed by, uint256 paid, uint256 timestamp)
  petted: '0x801d0162ba2c37d5ce51d7ced382b93e86db873e6333bf39e1fdcd8f6a78ff45',
  named: '0x9726e950b835e1f7f4fe747cca4223de678452a4f67c102d50408e22e94e9485',     // Named(uint256,string)
  died: '0xfda7d6be9e47c82ebcc3553edd222287058538459229e3a58a56dd65448fbecd',
  revived: '0xf09fb03f078d2e3c9a9491aaed2891e36b3283b42e4c3e8f1fd585d830ff96e1',
  burn: '0x410c5c259085cde81fedf70c1aa308ec839373c26e9b7ada6560a2aca0254eb6',
  abuse: '0xfa424f7122d7c0b187aa9de7b423582ee08d5938aa2ac18dca05180a057db320',
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',  // Transfer(address,address,uint256)
  claimed: '0xd9cb1e2714d65a111c0f20f060176ad657496bd47a3de04ec7c3d4ca232112ac',
};
export const PET_TOPICS = [T.care, T.petted, T.named, T.died, T.revived, T.burn, T.abuse, T.transfer];
export const SHOP_TOPICS = [T.claimed, T.burn];

const ZERO = '0x0000000000000000000000000000000000000000';
const DAY = 86400;
const ACTIONS = ['feed', 'play', 'wash', 'sleep', 'clean', 'wake', 'name', 'revive'];
const ABUSES = ['screenshot', 'slap', 'squeeze', 'burn'];
const STUNTS = { cat: [], frok: ABUSES, sahur: ['tung'], thiccums: ['bounce'], r3tards: [], emonad: [] };   // each pet's Abuse kinds, in its contract's order
// the death clock, the contract's own rule: Died only fires when a dead pet is next touched, so "dead" is derived
const WELCOME = 7 * DAY, DEATH_AFTER = 48 * 3600, REVIVE_BACKDATE = 0.4 * DAY;   // a revive sets the feed clock to "60 left": 40% of a day ago
// what a state may forget: nothing a page shows looks further back than these
const KEEP_TOUCH = 2 * DAY;    // Emotown's residents are the last 24 hours
const KEEP_HOURS = 3 * DAY;    // the hourly chart is the last 48 hours
const KEEP_ACTIVE = 8 * DAY;   // active wallets: 24 hours and 7 days
const RECENT = 25;

const addr = (topic) => '0x' + topic.slice(26);
const num = (hex) => Number(BigInt(hex));
const word = (data, i) => '0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64);
const mon = (hex) => Number(BigInt(hex) / 1000000000000000n) / 1000; // wei -> MON with 3 decimals
const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));
const dayOf = (ts) => Math.floor(ts / DAY) * DAY;
const hourOf = (ts) => Math.floor(ts / 3600) * 3600;

/** The ABI-encoded string in a log's `data`: offset, length, then the utf-8 bytes. */
export function decodeString(data) {
  if (!data || data.length < 130) return '';
  const len = parseInt(data.slice(66, 130), 16);
  if (!Number.isFinite(len) || len <= 0 || len > 128) return '';
  const hex = data.slice(130, 130 + len * 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

/** A descending id list as [hi, lo] runs: eighty thousand dead cats are a few hundred runs. */
export function runsOf(ids) {
  const runs = [];
  for (const id of ids) { const r = runs[runs.length - 1]; if (r && r[1] === id + 1) r[1] = id; else runs.push([id, id]); }
  return runs;
}

// ------------------------------------------------------------------ who owns which pet
/**
 * id -> owner, for `holders` (how many different wallets hold a pet). The cats alone are 82,000 owners, far more than
 * a state should carry on every refresh, so they live apart, in chunks of 10,000 ids (a 40-character address each,
 * no 0x; all zeros = nobody yet), and only a chunk a Transfer touched is read or written.
 */
export const OWNER_CHUNK = 10000;
const NOBODY = '0'.repeat(40);
export class Owners {
  /** `open`: make an empty chunk when one is asked for (a fold from nothing); otherwise a chunk must be given first */
  constructor(open = false) { this.chunks = new Map(); this.dirty = new Set(); this.open = open; }
  static chunkOf(id) { return Math.floor(id / OWNER_CHUNK); }
  has(idx) { return this.chunks.has(idx); }
  /** hand over a stored chunk (or nothing, for one never written) */
  give(idx, text) {
    const a = new Array(OWNER_CHUNK).fill('');
    if (text) for (let i = 0, n = Math.min(OWNER_CHUNK, Math.floor(text.length / 40)); i < n; i++) { const h = text.slice(i * 40, i * 40 + 40); if (h !== NOBODY) a[i] = h; }
    this.chunks.set(idx, a);
  }
  set(id, owner) {
    const idx = Owners.chunkOf(id);
    if (!this.chunks.has(idx)) { if (!this.open) throw new Error(`owners chunk ${idx} was not loaded`); this.give(idx, ''); }
    this.chunks.get(idx)[id % OWNER_CHUNK] = owner.slice(2).toLowerCase();
    this.dirty.add(idx);
  }
  /** a chunk as stored: up to its last owner */
  text(idx) {
    const a = this.chunks.get(idx) ?? [];
    let last = a.length - 1; while (last >= 0 && !a[last]) last--;
    let out = ''; for (let i = 0; i <= last; i++) out += a[i] || NOBODY;
    return out;
  }
  /** how many different owners, over every chunk given */
  count() {
    const s = new Set();
    for (const a of this.chunks.values()) for (const h of a) if (h) s.add(h);
    return s.size;
  }
}

// ------------------------------------------------------------------ one pet contract
export function newPet(key) {
  const kinds = STUNTS[key] ?? ABUSES;
  return {
    firstTs: 0, lastTs: 0,
    days: new Map(),       // day -> counters (and that day's wallets, until the day is over)
    hours: new Map(),      // hour -> actions
    actions: Object.fromEntries(ACTIONS.map((a) => [a, 0])),
    abuses: Object.fromEntries(kinds.map((a) => [a, 0])),
    byPet: new Map(), byWallet: new Map(), spentByWallet: new Map(), spentByPet: new Map(), abuseByPet: new Map(), petsByPet: new Map(), revivesByPet: new Map(),
    abuseKindByPet: kinds.map(() => new Map()),
    names: new Map(),      // id -> name (the last Named wins: a pet can be renamed)
    namers: new Map(),     // wallet -> its latest naming (unix s): the referral bar (referral.js)
    clock: new Map(),      // id -> { minted, first, fed, revived } for the death clock
    touched: new Map(),    // id -> [ts, what]: the latest thing its owner did (Emotown's residents)
    active: new Map(),     // wallet -> when it last acted
    pets: 0, petCalls: 0, monIn: 0, deaths: 0, revives: 0, mints: 0, airdropped: 0, transfers: 0, cranks: 0, monBurned: 0, emoBurned: 0, lastCrank: 0,
    biggest: null,         // the single largest crank
    recent: [],            // the latest events
    holders: 0, holdersStale: false,   // counted from the owners' chunks; stale after a Transfer until recounted
    maxId: 0,
  };
}

const dayRow = (s, ts) => { const d = dayOf(ts); let o = s.days.get(d); if (!o) { o = { day: d, actions: 0, feeds: 0, pets: 0, names: 0, deaths: 0, revives: 0, mints: 0, abuses: 0, monIn: 0, monBurned: 0, emoBurned: 0, wallets: new Set() }; s.days.set(d, o); } return o; };
const sawWallet = (o, w) => { if (typeof o.wallets !== 'number') o.wallets.add(w); };   // a finished day keeps only its count
const ck = (s, id) => { let c = s.clock.get(id); if (!c) { c = { minted: 0, first: Infinity, fed: 0, revived: 0 }; s.clock.set(id, c); } return c; };

/**
 * One log into a pet's state. `l` = { topic0..3, data, ts } (ts: its block's time); logs must come in chain order.
 * `wall` is the clock now, only so that things already older than every window are not noted at all.
 */
export function applyPet(s, key, l, owners, wall) {
  const ts = l.ts;
  const kinds = STUNTS[key] ?? ABUSES;
  if (!s.firstTs || ts < s.firstTs) s.firstTs = ts;
  if (ts > s.lastTs) s.lastTs = ts;
  const d = dayRow(s, ts);
  const touch = (id, what) => { if (ts < wall - KEEP_TOUCH) return; const t = s.touched.get(id); if (!t || ts >= t[0]) s.touched.set(id, [ts, what]); };
  // the acting wallet: topic3 on Care and Abuse, topic2 on Petted (it has two indexed params)
  const acted = (w) => { if (ts >= wall - KEEP_ACTIVE && ts > (s.active.get(w) ?? 0)) s.active.set(w, ts); };
  const hour = () => { if (ts >= wall - KEEP_HOURS) bump(s.hours, hourOf(ts)); };
  switch (l.topic0) {
    case T.care: {
      const id = num(l.topic1), a = num(l.topic2), by = addr(l.topic3), paid = mon(word(l.data, 0));
      s.actions[ACTIONS[a] ?? 'feed'] += 1;
      // any care at all makes a clock entry: a cat that was only named is not "untouched" (the starvation wave's rule)
      const c = ck(s, id);
      if (a <= 4) { if (ts < c.first) c.first = ts; if (a === 0 && ts > c.fed) c.fed = ts; }
      if (a === 7) { if (ts < c.first) c.first = ts; if (ts > c.revived) c.revived = ts; }
      if (a <= 4) { d.actions += 1; if (a === 0) d.feeds += 1; bump(s.byPet, id); bump(s.byWallet, by); hour(); }
      if (a === 6) { d.names += 1; if (ts > (s.namers.get(by) ?? 0)) s.namers.set(by, ts); }   // naming is the referral bar; `by` paid the 10 MON
      if (a === 7) { s.revives += 1; d.revives += 1; bump(s.revivesByPet, id); }
      s.monIn += paid; d.monIn += paid; bump(s.spentByWallet, by, paid); bump(s.spentByPet, id, paid);
      sawWallet(d, by);
      if (a !== 5) s.recent.push({ ts, kind: a === 6 ? 'name' : a === 7 ? 'revive' : 'care', a, id, by });
      touch(id, ACTIONS[a] ?? 'feed'); acted(by);
      break;
    }
    case T.petted: { const id = num(l.topic1), by = addr(l.topic2), n = num(word(l.data, 0)); s.pets += n; s.petCalls += 1; d.pets += n; bump(s.petsByPet, id, n); sawWallet(d, by); s.recent.push({ ts, kind: 'pet', id, by, n }); touch(id, 'pet'); acted(by); break; }
    case T.named: { s.names.set(num(l.topic1), decodeString(l.data)); break; }
    case T.died: { s.deaths += 1; d.deaths += 1; break; }
    case T.revived: break; // counted through Care action 7
    case T.burn: {
      const m = mon(word(l.data, 0)), e = mon(word(l.data, 1));
      s.cranks += 1; s.monBurned += m; s.emoBurned += e; d.monBurned += m; d.emoBurned += e;
      if (ts > s.lastCrank) s.lastCrank = ts;
      if (!s.biggest || e > s.biggest.emo) s.biggest = { ts, mon: Math.round(m * 1000) / 1000, emo: Math.round(e) };
      s.recent.push({ ts, kind: 'burn', mon: Math.round(m * 100) / 100, emo: Math.round(e) });
      break;
    }
    case T.abuse: {
      const id = num(l.topic1), k = num(l.topic2), by = addr(l.topic3), kind = kinds[k] ?? kinds[0];
      s.abuses[kind] = (s.abuses[kind] ?? 0) + 1; d.abuses += 1; bump(s.abuseByPet, id);
      const perKind = s.abuseKindByPet[k] ?? s.abuseKindByPet[0]; if (perKind) bump(perKind, id);
      sawWallet(d, by); s.recent.push({ ts, kind: 'abuse', a: k, id, by }); touch(id, kind); hour(); acted(by);
      break;
    }
    case T.transfer: {
      const from = addr(l.topic1), to = addr(l.topic2), id = num(l.topic3);
      owners.set(id, to); s.holdersStale = true; if (id > s.maxId) s.maxId = id;
      if (from === ZERO) {
        s.mints += 1;
        // the cats' airdrop (ids 1..82,423, all on launch day) is counted apart: in the per-day series it dwarfed every
        // real mint after it (operator, 2026-09-26). Its mint times are baked (airdrop-mints.js), so its 82,000 cats
        // need no clock entry of their own until someone cares for one.
        if (key === 'cat' && id <= AIRDROP_LAST) s.airdropped += 1; else { d.mints += 1; ck(s, id).minted = ts; }
        if (key !== 'cat') s.recent.push({ ts, kind: 'mint', id, by: to });
        touch(id, 'mint');
      } else { s.transfers += 1; s.recent.push({ ts, kind: 'transfer', id, by: to }); }
      break;
    }
  }
}

/** After a batch of logs: keep only the latest events (newest first; within one second, chain order). */
export function settlePet(s) {
  if (s.recent.length > RECENT) s.recent = s.recent.sort((a, b) => b.ts - a.ts).slice(0, RECENT);
}

/** Every pet ever minted with its mint time and its clock entry (none: never cared for, an airdropped cat). */
function eachPet(s, key, visit) {
  if (key === 'cat') for (const [lo, hi, at] of AIRDROP_RUNS) for (let id = lo; id <= hi; id++) visit(id, at, s.clock.get(id));
  for (const [id, c] of s.clock) { if (key === 'cat' && id <= AIRDROP_LAST) continue; if (c.minted) visit(id, c.minted, c); }
}
/** When a pet was last fed, as the contract reckons it: its latest feed or revive, else when its clock started. */
function lastFedOf(mintedAt, c) {
  const implied = mintedAt + WELCOME;
  if (!c) return implied;
  let lastFed = Math.min(c.first, implied); // the clock started at the first care, or ran by itself
  if (c.fed > lastFed) lastFed = c.fed;
  if (c.revived - REVIVE_BACKDATE > lastFed) lastFed = c.revived - REVIVE_BACKDATE;
  return lastFed;
}

/** A pet's state as /api/stats shows it at `now`. `_active24`, `_active7` and `namers` are working sets for the caller. */
export function finishPet(s, c, now) {
  const kinds = STUNTS[c.key] ?? ABUSES;
  const activeSince = (dt) => { const out = new Set(); for (const [w, ts] of s.active) if (ts >= now - dt) out.add(w); return out; };
  const active24 = activeSince(DAY), active7 = activeSince(7 * DAY);
  // dead right now, by the clock (`deaths` only counts recorded Died events)
  let deadNow = 0, neverDied = 0;
  eachPet(s, c.key, (id, mintedAt, k) => {
    if (now >= lastFedOf(mintedAt, k) + DEATH_AFTER) deadNow += 1;
    else if (!k || !k.revived) neverDied += 1;   // alive and never brought back: it has never died
  });
  const named = (id) => s.names.get(id) ?? '';
  const series = [...s.days.values()].sort((a, b) => a.day - b.day).map((o) => ({ ...o, wallets: typeof o.wallets === 'number' ? o.wallets : o.wallets.size }));
  const hourly = []; for (let h = hourOf(now - 2 * DAY); h <= now; h += 3600) hourly.push({ hour: h, actions: s.hours.get(h) ?? 0 });
  const withName = (rows) => rows.map(({ k, v }) => ({ id: k, name: named(k), v }));
  const recent = [...s.recent].sort((a, b) => b.ts - a.ts).slice(0, RECENT);
  const { actions } = s;
  return {
    key: c.key, address: c.address, firstTs: s.firstTs, lastTs: s.lastTs, namers: s.namers, airdropped: s.airdropped,
    mints: s.mints, holders: s.holders, transfers: s.transfers, deaths: s.deaths, deadNow, neverDied, revives: s.revives, namesGiven: actions.name, actions, careTotal: actions.feed + actions.play + actions.wash + actions.sleep + actions.clean,
    pets: s.pets, petCalls: s.petCalls, monIn: Math.round(s.monIn * 1000) / 1000, uniqueCarers: s.byWallet.size,
    _active24: active24, _active7: active7, active24h: active24.size, active7d: active7.size,
    burn: { cranks: s.cranks, monBurned: Math.round(s.monBurned * 1000) / 1000, emoBurned: Math.round(s.emoBurned), lastCrank: s.lastCrank, biggest: s.biggest },
    recent: recent.map((e) => (e.id !== undefined ? { ...e, name: named(e.id) } : e)),
    abuses: s.abuses, abuseTotal: Object.values(s.abuses).reduce((a, b) => a + b, 0),
    top: {
      caredPets: withName(top(s.byPet)), carers: top(s.byWallet).map(({ k, v }) => ({ wallet: k, v })), spenders: top(s.spentByWallet).map(({ k, v }) => ({ wallet: k, v: Math.round(v * 1000) / 1000 })),
      spentPets: withName(top(s.spentByPet)).map((r) => ({ ...r, v: Math.round(r.v * 1000) / 1000 })), pettedPets: withName(top(s.petsByPet)),
      abusedPets: withName(top(s.abuseByPet)), abuseKind: Object.fromEntries(kinds.map((a, i) => [a, withName(top(s.abuseKindByPet[i], 5))])),
      revivedPets: withName(top(s.revivesByPet)),   // the pets brought back most often (operator, 2026-09-25)
    },
    series, hourly,
    // [id, ts, what] for every pet touched in the last 24 hours, newest first (Emotown's residents)
    town: [...s.touched.entries()].filter(([, [ts]]) => ts >= now - DAY).sort((a, b) => b[1][0] - a[1][0] || a[0] - b[0]).map(([id, [ts, what]]) => [id, ts, what]),
  };
}

/**
 * The gallery's lists at `now`: who is named, who is dead, who has never died, who was brought back, and the numbers
 * behind the starvation strip. Death is a computed fact on chain (`Died` is only emitted when a dead pet is next
 * touched), so the dead are worked out from the clock the way `state()` does: dead when now >= lastFed + 48 h.
 */
export function petLists(s, key, now) {
  const dead = [], pristine = [], revived = [];
  let total = 0, neverFed = 0, starving = 0, neverDied = 0, nextDeath = 0, firstStart = 0;
  // the wave: the airdrop's untouched cats, counted down to the first of their deaths (their batches were minted over
  // 5m20s, so the deaths are spread the same way); for the others, the largest cohort sharing a death time
  const waves = new Map(); // diesAt -> how many never-fed pets share it
  const airdropWave = { count: 0, deathAt: 0 };
  eachPet(s, key, (id, mintedAt, c) => {
    total += 1;
    const lastFed = lastFedOf(mintedAt, c);
    const diesAt = lastFed + DEATH_AFTER;
    const isDead = now >= diesAt;
    if (c && c.revived) revived.push(id);
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
        if (key === 'cat' && id <= AIRDROP_LAST && !c) { airdropWave.count += 1; if (!airdropWave.deathAt || diesAt < airdropWave.deathAt) airdropWave.deathAt = diesAt; }
        else waves.set(diesAt, (waves.get(diesAt) ?? 0) + 1);
      }
    }
  });
  dead.sort((a, b) => b - a); pristine.sort((a, b) => b - a); revived.sort((a, b) => b - a);
  let wave = { deathAt: 0, count: 0 };
  for (const [at, n] of waves) if (n > wave.count) wave = { deathAt: at, count: n };
  if (airdropWave.count > wave.count) wave = airdropWave;
  const starvation = {
    total, dead: dead.length, neverFed, starving, neverDied, nextDeath,
    wave: { count: wave.count, clockStart: wave.deathAt ? wave.deathAt - DEATH_AFTER : 0, deathAt: wave.deathAt },   // the big one: the airdrop's untouched cats
    clockStart: firstStart,                 // when the earliest never-fed pet's meters begin to drain
    deathAt: firstStart ? firstStart + DEATH_AFTER : 0,   // and when it starves
  };
  const named = [...s.names.keys()].sort((a, b) => b - a).map((id) => ({ id, name: s.names.get(id) }));
  return { named, dead, pristine, revived, starvation };
}

/** /api/cats, as the gallery reads it. The dead go as runs once there are many; a short list stays plain. */
export function catsBody(lists, generatedAt) {
  const { named, dead: died, pristine, revived, starvation } = lists;
  return { generatedAt, live: true, named, ...(died.length <= 2000 ? { died } : { diedRuns: runsOf(died) }), ...(pristine.length <= 2000 ? { neverDied: pristine } : { neverDiedRuns: runsOf(pristine) }), ...(revived.length <= 2000 ? { revived } : { revivedRuns: runsOf(revived) }), starvation };
}

// a state as stored. Maps go as entry lists, never as objects: the top lists break ties by who came first, and an
// object would hand its numeric keys back sorted
const entries = (m) => [...m.entries()];
export function dumpPet(s, wall) {
  settlePet(s);
  const today = dayOf(s.lastTs);
  return {
    ...s,
    // a day that is over can never get another log (they come in chain order): its wallets become their count
    days: [...s.days.values()].map((o) => ({ ...o, wallets: typeof o.wallets === 'number' ? o.wallets : o.day < today ? o.wallets.size : [...o.wallets] })),
    hours: entries(s.hours).filter(([h]) => h >= wall - KEEP_HOURS - 3600),
    byPet: entries(s.byPet), byWallet: entries(s.byWallet), spentByWallet: entries(s.spentByWallet), spentByPet: entries(s.spentByPet), abuseByPet: entries(s.abuseByPet), petsByPet: entries(s.petsByPet), revivesByPet: entries(s.revivesByPet),
    abuseKindByPet: s.abuseKindByPet.map(entries),
    names: entries(s.names), namers: entries(s.namers),
    clock: entries(s.clock).map(([id, c]) => [id, c.minted, Number.isFinite(c.first) ? c.first : 0, c.fed, c.revived]),   // JSON has no Infinity
    touched: entries(s.touched).filter(([, [ts]]) => ts >= wall - KEEP_TOUCH).map(([id, [ts, what]]) => [id, ts, what]),
    active: entries(s.active).filter(([, ts]) => ts >= wall - KEEP_ACTIVE),
  };
}
export function loadPet(key, j) {
  const s = newPet(key);
  if (!j) return s;
  return {
    ...s, ...j,
    days: new Map(j.days.map((o) => [o.day, { ...o, wallets: typeof o.wallets === 'number' ? o.wallets : new Set(o.wallets) }])),
    hours: new Map(j.hours),
    byPet: new Map(j.byPet), byWallet: new Map(j.byWallet), spentByWallet: new Map(j.spentByWallet), spentByPet: new Map(j.spentByPet), abuseByPet: new Map(j.abuseByPet), petsByPet: new Map(j.petsByPet), revivesByPet: new Map(j.revivesByPet),
    abuseKindByPet: s.abuseKindByPet.map((_, i) => new Map(j.abuseKindByPet?.[i] ?? [])),
    names: new Map(j.names), namers: new Map(j.namers),
    clock: new Map(j.clock.map(([id, minted, first, fed, revived]) => [id, { minted, first: first || Infinity, fed, revived }])),
    touched: new Map(j.touched.map(([id, ts, what]) => [id, [ts, what]])),
    active: new Map(j.active),
  };
}

// ------------------------------------------------------------------ the item shop
export function newShop() { return { items: new Map(), days: new Map(), monBurned: 0, emoBurned: 0, cranks: 0 }; }
export function applyShop(s, l) {
  if (l.topic0 === T.claimed) {
    const id = num(l.topic1), to = addr(l.topic2), qty = num(word(l.data, 0)), paid = mon(word(l.data, 1));
    let it = s.items.get(id); if (!it) { it = { id, claims: 0, qty: 0, wallets: new Set(), monIn: 0, first: l.ts, last: l.ts }; s.items.set(id, it); }
    it.claims += 1; it.qty += qty; it.wallets.add(to); it.monIn += paid; it.last = Math.max(it.last, l.ts); it.first = Math.min(it.first, l.ts);
    const d = dayOf(l.ts); let o = s.days.get(d); if (!o) { o = { day: d, claims: 0 }; s.days.set(d, o); } o.claims += qty;
  } else if (l.topic0 === T.burn) { s.cranks += 1; s.monBurned += mon(word(l.data, 0)); s.emoBurned += mon(word(l.data, 1)); }
}
/** The item shop: claims per item, by day. */
export function finishShop(s, address) {
  return {
    address,
    items: [...s.items.values()].sort((a, b) => a.id - b.id).map((it) => ({ ...it, wallets: it.wallets.size, monIn: Math.round(it.monIn * 1000) / 1000 })),
    series: [...s.days.values()].sort((a, b) => a.day - b.day),
    burn: { cranks: s.cranks, monBurned: Math.round(s.monBurned * 1000) / 1000, emoBurned: Math.round(s.emoBurned) },
  };
}
export function dumpShop(s) { return { ...s, items: [...s.items.values()].map((it) => ({ ...it, wallets: [...it.wallets] })), days: [...s.days.values()] }; }
export function loadShop(j) {
  if (!j) return newShop();
  return { ...newShop(), ...j, items: new Map(j.items.map((it) => [it.id, { ...it, wallets: new Set(it.wallets) }])), days: new Map(j.days.map((o) => [o.day, { ...o }])) };
}

/** /api/stats from the finished pets (in the order given) and the shop. The working sets are stripped here. */
export function statsBody({ generatedAt, now, pets, shop, starters, referrals }) {
  // active wallets across every pet, each counted once: a wallet that cares for a cat and a frok is one active wallet
  const list = Object.values(pets);
  const all = { active24h: new Set(list.flatMap((p) => [...p._active24])).size, active7d: new Set(list.flatMap((p) => [...p._active7])).size };
  const out = {};
  for (const [name, p] of Object.entries(pets)) { const { namers: _n, _active24: _a, _active7: _b, ...rest } = p; out[name] = rest; }
  return { generatedAt, now, ...out, all, shop, starters, referrals };
}
/** every wallet's latest naming, across the pets (referral.js counts a point only for a naming after the referral) */
export function namersOf(states) {
  const namers = new Map();
  for (const s of states) for (const [a, t] of s.namers) if (t > (namers.get(a) ?? 0)) namers.set(a, t);
  return namers;
}
