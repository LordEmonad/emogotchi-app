/**
 * Push notifications for the home-screen app (2026-10-01; operator: "a web app I can put on the home screen that has push
 * notis ... reminders for pets, DMs, follows", everything as an option). A subscription is one browser (its push
 * endpoint and keys, from the page's service worker) watching one wallet's pets, with the kinds it wants.
 *
 *   GET  /api/social/push/vapid          the public key the page subscribes with
 *   POST /api/social/push/subscribe      { subscription, address?, prefs?, tz?, ua? }  -> { address, verified, pets, prefs }
 *   POST /api/social/push/unsubscribe    { endpoint }
 *   GET  /api/social/push/prefs?endpoint= -> { address, verified, pets, prefs } (404 when unknown)
 *   POST /api/social/push/prefs          { endpoint, prefs }
 *   POST /api/social/push/test           { endpoint }  a "Notifications are on" push, so a person can see one arrive
 *
 * What is pushed, and when:
 *   pets   (pushTick, every ten minutes from the cron): every watched pet's `state()` read off the chain through
 *          Multicall3; a bowl that ran empty, a pet six hours from starving, a death, a poop, a crown won or lost.
 *          One push per occurrence (`push_sent` keys name the feed, the poop, the death), never a repeat.
 *   fights (pushTick): a challenge accepted (to the challenger), a fight decided or aborted (to both).
 *   social (pushSocial, from notify.js): a DM, a follower, a mention, a reply, a reaction, a picture's verdict; only to
 *          subscriptions whose address a signed-in session vouched for (`verified`), since those are private.
 * A pet's events are public chain state, so watching any wallet's pets needs no sign-in. Quiet hours hold back everything
 * but a starving pet. The keys and the sending are in webpush.js.
 */
import { parseAbi } from 'viem';
import { COLS, GAMES, petIdsOf, publicClient } from './social/chain.js';
import { fail, json, now } from './social/http.js';
import { sessionOf } from './social/auth.js';
import { sendPush } from './webpush.js';

/** Every kind, with its default. The page shows the same list (apps/web/src/push/kinds.ts mirrors it). */
export const KINDS = {
  bowl: true, dying: true, died: true, poop: true, crown: true,
  dm: true, follow: true, mention: true, reply: true, react: true, pic: true,
  fightAccepted: true, fightResult: true,
};
const PET_KINDS = ['bowl', 'dying', 'died', 'poop', 'crown'];
const URGENT = new Set(['dying', 'died']);          // get through quiet hours
const PET_LIMIT = 60;                                // pets watched per wallet
const SUBS_PER_ADDRESS = 12;
const PETS_REFRESH = 60 * 60_000;                    // a wallet's pet list is looked up again after an hour
const DYING_WITHIN = 6 * 3600;                       // seconds
const BATCH = 60;                                    // state() reads per Multicall3 call

// the View struct as the cat's contract returns it; the other three games add their stunt counts after `monPaid`,
// which a decode of these fields leaves alone (checked against all four on mainnet in the integration test)
const STATE_ABI = parseAbi([
  'struct View { uint256 id; address owner; string name; bool started; bool alive; bool asleep; bool poop; bool crowned; bool crownEligible; uint8 food; uint8 clean; uint8 fun; uint8 energy; uint8 mood; uint16 streak; uint16 score; uint256 day; uint40 mintedAt; uint40 startsAt; uint40 bornAt; uint40 deadAt; uint40 poopAt; uint40 wakesAt; uint40 diesAt; uint24 feeds; uint24 washes; uint24 plays; uint24 naps; uint24 cleanups; uint24 pets; uint16 names; uint16 deaths; uint16 revives; uint128 monPaid; }',
  'function state(uint256 id) view returns (View v)',
  'function nameOf(uint256) view returns (string)',
]);
const FIGHT_ABI = parseAbi([
  'struct FightView { uint256 id; uint8 status; address challenger; address challengerCollection; uint256 challengerPet; address opponent; uint256 stake; uint256 createdAt; uint256 expiresAt; address acceptor; address acceptorCollection; uint256 acceptorPet; uint256 acceptedAt; uint256 abortableAt; address provider; uint64 sequence; bytes32 random; uint256 foughtAt; address winner; uint256 payout; }',
  'function fightCount() view returns (uint256)',
  'function fight(uint256 id) view returns (FightView)',
]);
const PENDING = 3; const FOUGHT = 4; const ABORTED = 5;

const PET = {
  cat: { label: 'cat', path: (id) => `/pet/${id}`, revive: 'A revive brings it back (1,000 MON).' },
  frok: { label: 'inversebrah', path: (id) => `/inversebrah/pet/${id}`, revive: 'A revive brings it back, free.' },
  sahur: { label: 'Tung Tung Tung Sahur', path: (id) => `/tung/pet/${id}`, revive: 'A revive brings it back, free.' },
  thiccums: { label: 'Thiccums', path: (id) => `/thiccums/pet/${id}`, revive: 'A revive brings it back, free.' },
  r3tards: { label: 'r3tard', path: (id) => `/r3tardgotchi/pet/${id}`, revive: 'A revive brings it back, free.' },
  emonad: { label: 'Emonad', path: (id) => `/emonadgotchi/pet/${id}`, revive: 'A revive brings him back, free.' },
};
const colOfGame = (addr) => COLS.find((c) => GAMES[c].toLowerCase() === String(addr).toLowerCase()) ?? null;
const petName = (col, id, name) => (name && name.trim()) || `${PET[col]?.label ?? col} #${id}`;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const mon = (wei) => { const n = Number(wei) / 1e18; return n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }); };
const hours = (secs) => { const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

export const pushOn = (env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.DB);
const vapid = (env) => ({ pub: env.VAPID_PUBLIC_KEY, priv: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'https://emogotchi.emonad.lol' });

// ---------------------------------------------------------------------------------------------------- preferences
export function cleanPrefs(p) {
  const src = p && typeof p === 'object' ? p : {};
  const kinds = {};
  for (const k of Object.keys(KINDS)) kinds[k] = src.kinds && typeof src.kinds === 'object' && k in src.kinds ? !!src.kinds[k] : KINDS[k];
  const petsOff = Array.isArray(src.petsOff) ? [...new Set(src.petsOff.filter((x) => typeof x === 'string' && /^(cat|frok|sahur|thiccums|r3tards|emonad):\d{1,7}$/.test(x)))].slice(0, 200) : [];
  let quiet = null;
  if (src.quiet && typeof src.quiet === 'object') {
    const from = Number(src.quiet.from); const to = Number(src.quiet.to);
    if (Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from <= 23 && to >= 0 && to <= 23 && from !== to) quiet = { from, to };
  }
  const tz = Number.isInteger(Number(src.tz)) && Math.abs(Number(src.tz)) <= 840 ? Number(src.tz) : 0;
  return { kinds, petsOff, quiet, tz };
}
const parsePrefs = (text) => { try { return cleanPrefs(JSON.parse(text)); } catch { return cleanPrefs({}); } };
/** Quiet hours, in the subscriber's own clock (`tz` is minutes east of UTC, the browser's `-getTimezoneOffset()`). */
export function inQuiet(prefs, t = now()) {
  if (!prefs.quiet) return false;
  const hour = Math.floor((((t / 60_000) + prefs.tz) / 60) % 24 + 24) % 24;
  const { from, to } = prefs.quiet;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}
const wants = (prefs, kind, pet) => prefs.kinds[kind] !== false && !(pet && prefs.petsOff.includes(pet));

// ---------------------------------------------------------------------------------------------------- routes
export async function pushRoute(request, env, ctx, url, seg, m, body) {
  if (!pushOn(env)) return json({ error: 'Notifications are not switched on here yet.', off: true }, 503);
  if (seg[1] === 'vapid' && m === 'GET') return json({ key: env.VAPID_PUBLIC_KEY }, 200, { 'cache-control': 'public, max-age=3600' });
  if (seg[1] === 'subscribe' && m === 'POST') return subscribe(request, env, ctx, await body());
  if (seg[1] === 'unsubscribe' && m === 'POST') return unsubscribe(env, await body());
  if (seg[1] === 'prefs' && m === 'GET') return getPrefs(env, url);
  if (seg[1] === 'prefs' && m === 'POST') return setPrefs(env, await body());
  if (seg[1] === 'test' && m === 'POST') return testPush(env, await body());
  return null;
}

function checkSubscription(s, env) {
  if (!s || typeof s !== 'object') fail(400, 'No subscription.');
  const endpoint = String(s.endpoint ?? '');
  let u; try { u = new URL(endpoint); } catch { fail(400, 'Bad endpoint.'); }
  // PUSH_DEV (never set deployed) lets tools/push-check.mjs point a subscription at its own plain-http push service
  if ((u.protocol !== 'https:' && !(env?.PUSH_DEV === '1' && u.protocol === 'http:')) || endpoint.length > 1024) fail(400, 'Bad endpoint.');
  const p256dh = String(s.keys?.p256dh ?? ''); const auth = String(s.keys?.auth ?? '');
  if (!/^[A-Za-z0-9_-]{86,88}$/.test(p256dh) || !/^[A-Za-z0-9_-]{21,24}$/.test(auth)) fail(400, 'Bad subscription keys.');
  return { endpoint, p256dh, auth };
}
const checkAddress = (a) => { if (a == null || a === '') return null; const s = String(a); if (!/^0x[0-9a-fA-F]{40}$/.test(s)) fail(400, 'Bad address.'); return s.toLowerCase(); };

async function subscribe(request, env, ctx, b) {
  const sub = checkSubscription(b.subscription, env);
  const address = checkAddress(b.address);
  const prefs = cleanPrefs({ ...(b.prefs ?? {}), tz: b.tz ?? b.prefs?.tz });
  const session = address ? await sessionOf(request, env, ctx) : null;
  const verified = !!(session && session.address === address);
  const t = now();
  if (address) {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE address = ? AND endpoint <> ?').bind(address, sub.endpoint).first('n');
    if (Number(n) >= SUBS_PER_ADDRESS) fail(429, 'Too many devices on this wallet. Turn notifications off on one of them first.');
  }
  const pets = address ? await petsOf(env, address).catch(() => null) : [];
  const ua = String(b.ua ?? request.headers.get('user-agent') ?? '').slice(0, 200);
  await env.DB.prepare(`INSERT INTO push_subs (endpoint, p256dh, auth, address, verified, pets, pets_at, prefs, ua, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, address = excluded.address, verified = excluded.verified,
      pets = excluded.pets, pets_at = excluded.pets_at, prefs = excluded.prefs, ua = excluded.ua, failures = 0,
      primed = CASE WHEN push_subs.address IS excluded.address THEN push_subs.primed ELSE 0 END, updated_at = excluded.updated_at`)
    .bind(sub.endpoint, sub.p256dh, sub.auth, address, verified ? 1 : 0, JSON.stringify(pets ?? []), pets ? t : 0, JSON.stringify(prefs), ua, t, t).run();
  return json({ ok: true, address, verified, pets: pets ?? [], prefs, petsUnknown: pets === null });
}

async function unsubscribe(env, b) {
  const endpoint = String(b?.endpoint ?? '');
  if (!endpoint) fail(400, 'No endpoint.');
  const sub = await env.DB.prepare('SELECT id FROM push_subs WHERE endpoint = ?').bind(endpoint).first();
  if (sub) await env.DB.batch([env.DB.prepare('DELETE FROM push_sent WHERE sub_id = ?').bind(sub.id), env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(sub.id)]);
  return json({ ok: true });
}

async function getPrefs(env, url) {
  const endpoint = url.searchParams.get('endpoint') ?? '';
  const row = await env.DB.prepare('SELECT address, verified, pets, prefs FROM push_subs WHERE endpoint = ?').bind(endpoint).first();
  if (!row) return json({ error: 'Not subscribed.' }, 404);
  return json({ address: row.address, verified: !!row.verified, pets: JSON.parse(row.pets || '[]'), prefs: parsePrefs(row.prefs) });
}

async function setPrefs(env, b) {
  const endpoint = String(b?.endpoint ?? '');
  const prefs = cleanPrefs(b?.prefs);
  const r = await env.DB.prepare('UPDATE push_subs SET prefs = ?, updated_at = ? WHERE endpoint = ?').bind(JSON.stringify(prefs), now(), endpoint).run();
  if (!r.meta.changes) return json({ error: 'Not subscribed.' }, 404);
  return json({ ok: true, prefs });
}

async function testPush(env, b) {
  const endpoint = String(b?.endpoint ?? '');
  const row = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, address FROM push_subs WHERE endpoint = ?').bind(endpoint).first();
  if (!row) return json({ error: 'Not subscribed.' }, 404);
  const r = await deliver(env, row, { title: 'Notifications are on', body: row.address ? 'Your pets will let you know when they need you.' : 'Connect a wallet so your pets can reach you.', url: '/', kind: 'test', tag: 'test' }, { ttl: 600 });
  return json({ ok: r.ok, status: r.status });
}

// ---------------------------------------------------------------------------------------------------- the chain
/** Every pet this wallet holds, with names: [{ col, id, name }]. */
async function petsOf(env, address) {
  const ids = await petIdsOf(env, address, PET_LIMIT);
  const list = COLS.flatMap((col) => ids[col].map((id) => ({ col, id })));
  if (!list.length) return [];
  const pub = publicClient(env);
  const names = await pub.multicall({ contracts: list.map((p) => ({ address: GAMES[p.col], abi: STATE_ABI, functionName: 'nameOf', args: [BigInt(p.id)] })), allowFailure: true });
  return list.map((p, i) => ({ ...p, name: names[i].status === 'success' ? String(names[i].result) : '' }));
}

/** `state()` for many pets, in batches; a pet the chain would not answer for is left out. */
async function statesOf(env, pets) {
  const pub = publicClient(env);
  const out = new Map();
  for (let i = 0; i < pets.length; i += BATCH) {
    const slice = pets.slice(i, i + BATCH);
    const res = await pub.multicall({ contracts: slice.map((p) => ({ address: GAMES[p.col], abi: STATE_ABI, functionName: 'state', args: [BigInt(p.id)] })), allowFailure: true });
    slice.forEach((p, k) => { if (res[k].status === 'success') out.set(`${p.col}:${p.id}`, res[k].result); });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- sending
/** Send to one subscription row; keeps the row's failure count and removes a dead endpoint. */
async function deliver(env, row, payload, opts = {}) {
  const r = await sendPush({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }, payload, { ...vapid(env), ...opts });
  if (r.gone) {
    await env.DB.batch([env.DB.prepare('DELETE FROM push_sent WHERE sub_id = ?').bind(row.id), env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(row.id)]);
  } else if (!r.ok) {
    await env.DB.prepare('UPDATE push_subs SET failures = failures + 1 WHERE id = ?').bind(row.id).run();
    console.error('[push] send', r.status, r.error ?? '', String(row.endpoint).slice(0, 60));
  } else if (row.failures) {
    await env.DB.prepare('UPDATE push_subs SET failures = 0 WHERE id = ?').bind(row.id).run();
  }
  return r;
}

/** Once per (subscription, key): the row is written first, so two ticks can never both send. */
async function once(env, row, key, payload, opts) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO push_sent (sub_id, key, sent_at) VALUES (?, ?, ?)').bind(row.id, key, now()).run();
  if (!r.meta.changes) return null;
  return deliver(env, row, payload, opts);
}

/**
 * A social notification for `address` (notify.js calls this after writing the row). Only verified subscriptions, only
 * the kinds they asked for. `kind` is notify.js's: dm, follow, mention, reply, react:<emoji>, pic.
 */
export async function pushSocial(env, address, kind, actor, ref) {
  if (!pushOn(env)) return;
  try {
    const { results: subs } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, prefs, failures FROM push_subs WHERE address = ? AND verified = 1').bind(address).all();
    if (!subs.length) return;
    const base = kind.startsWith('react:') ? 'react' : kind;
    if (!(base in KINDS)) return;
    const name = actor ? (await env.DB.prepare('SELECT name FROM profiles WHERE address = ?').bind(actor).first('name')) || short(actor) : 'Emotown';
    let title, body, url = '/emotown';
    if (base === 'dm') { title = `${name} sent you a message`; body = 'Open Emotown to read it.'; }
    else if (base === 'follow') { title = `${name} follows you`; body = 'See who they are.'; url = `/u/${actor}`; }
    else if (base === 'mention') { title = `${name} mentioned you`; body = 'In the town square.'; }
    else if (base === 'reply') { title = `${name} replied to you`; body = 'In the town square.'; }
    else if (base === 'react') { title = `${name} reacted ${kind.slice(6)}`; body = 'To your message in the square.'; }
    else if (base === 'pic') { const live = String(ref ?? '').endsWith(':live'); title = live ? 'Your picture is up' : 'Your picture was not approved'; body = live ? 'It shows on your profile now.' : 'Try another one from your profile.'; url = `/u/${address}`; }
    else return;
    const key = `${kind}:${actor ?? ''}:${ref ?? ''}:${Math.floor(now() / 60_000)}`;
    for (const row of subs) {
      const prefs = parsePrefs(row.prefs);
      if (!wants(prefs, base) || inQuiet(prefs)) continue;
      await once(env, row, key, { title, body, url, kind: base, tag: base === 'dm' ? `dm:${actor}` : key }, { ttl: 6 * 3600, topic: base === 'dm' ? `dm_${actor.slice(2, 14)}` : undefined });
    }
  } catch (e) { console.error('[push] social', String(e).slice(0, 160)); }
}

// ---------------------------------------------------------------------------------------------------- the tick
/** Every ten minutes from the cron: the pets' clocks and the fights. Returns a summary for the log. */
export async function pushTick(env, log = () => {}) {
  if (!pushOn(env)) return { skipped: 'not configured' };
  const t = now();
  const summary = { subs: 0, wallets: 0, pets: 0, sent: 0, primed: 0, fights: 0, refreshed: 0, errors: [] };
  const { results: subs } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth, address, verified, pets, pets_at, prefs, failures, primed FROM push_subs WHERE address IS NOT NULL AND failures < 8 ORDER BY id LIMIT 5000').all();
  summary.subs = subs.length;
  if (!subs.length) return summary;
  // ---- the wallets' pet lists, refreshed an hour at a time (a few wallets per tick)
  const byAddress = new Map();
  for (const s of subs) { if (!byAddress.has(s.address)) byAddress.set(s.address, []); byAddress.get(s.address).push(s); }
  summary.wallets = byAddress.size;
  let refreshes = 0;
  for (const [address, rows] of byAddress) {
    const oldest = Math.min(...rows.map((r) => r.pets_at));
    if (t - oldest < PETS_REFRESH || refreshes >= 25) continue;
    refreshes++;
    try {
      const pets = await petsOf(env, address);
      const text = JSON.stringify(pets);
      await env.DB.prepare('UPDATE push_subs SET pets = ?, pets_at = ? WHERE address = ?').bind(text, t, address).run();
      for (const r of rows) { r.pets = text; r.pets_at = t; }
      summary.refreshed++;
    } catch (e) { summary.errors.push(`pets ${short(address)}: ${String(e?.shortMessage ?? e).slice(0, 80)}`); }
  }
  // ---- every watched pet, once
  const watched = new Map();   // "col:id" -> { col, id, name, rows: [sub...] }
  for (const s of subs) {
    let pets; try { pets = JSON.parse(s.pets || '[]'); } catch { pets = []; }
    for (const p of pets) {
      const key = `${p.col}:${p.id}`;
      if (!watched.has(key)) watched.set(key, { col: p.col, id: p.id, name: p.name, rows: [] });
      watched.get(key).rows.push(s);
    }
  }
  summary.pets = watched.size;
  if (watched.size) {
    let states;
    try { states = await statesOf(env, [...watched.values()]); } catch (e) { summary.errors.push(`state: ${String(e?.shortMessage ?? e).slice(0, 80)}`); states = new Map(); }
    const { results: prevRows } = await env.DB.prepare('SELECT pet, alive, crowned FROM push_pet_state').all();
    const prev = new Map(prevRows.map((r) => [r.pet, r]));
    const secs = Math.floor(t / 1000);
    const upserts = [];
    for (const [key, w] of watched) {
      const v = states.get(key);
      if (!v) continue;
      const name = petName(w.col, w.id, v.name || w.name);
      const url = PET[w.col].path(w.id);
      const events = [];   // [kind, dedupeKey, payload]
      const was = prev.get(key);
      if (!v.alive) {
        if (was && was.alive) events.push(['died', `died:${key}:${v.deadAt}`, { title: `${name} has died`, body: PET[w.col].revive, url }]);
      } else {
        const dies = Number(v.diesAt);
        if (v.started && v.food === 0 && dies > secs) {
          const left = dies - secs;
          if (left <= DYING_WITHIN) events.push(['dying', `dying:${key}:${dies}`, { title: `${name} is starving`, body: `Feed it in the next ${hours(left)} or it dies.`, url }]);
          else events.push(['bowl', `bowl:${key}:${dies}`, { title: `${name} is hungry`, body: `The bowl is empty. ${hours(left)} before it starves.`, url }]);
        }
        if (v.poop) events.push(['poop', `poop:${key}:${v.poopAt}`, { title: `${name} pooped`, body: 'Clean it up before it gets grubby.', url }]);
        if (was && !!was.crowned !== v.crowned) {
          events.push(['crown', `crown:${key}:${v.crowned ? 1 : 0}:${Math.floor(secs / 3600)}`, v.crowned
            ? { title: `${name} wears the crown`, body: 'One of the 100 best-kept pets on Monad right now.', url }
            : { title: `${name} lost its crown`, body: 'Someone cared a little harder. Win it back.', url }]);
        }
      }
      upserts.push(env.DB.prepare('INSERT INTO push_pet_state (pet, alive, crowned, checked_at) VALUES (?, ?, ?, ?) ON CONFLICT(pet) DO UPDATE SET alive = excluded.alive, crowned = excluded.crowned, checked_at = excluded.checked_at').bind(key, v.alive ? 1 : 0, v.crowned ? 1 : 0, t));
      for (const [kind, dkey, payload] of events) {
        for (const row of w.rows) {
          const prefs = parsePrefs(row.prefs);
          if (!wants(prefs, kind, key)) continue;
          if (!URGENT.has(kind) && inQuiet(prefs, t)) continue;
          // a subscription's first look: what was already true when it was made (a bowl long empty, a poop) is noted,
          // not sent, so turning notifications on does not fire one per pet at once; a starving pet still gets through
          if (!row.primed && !URGENT.has(kind)) { await env.DB.prepare('INSERT OR IGNORE INTO push_sent (sub_id, key, sent_at) VALUES (?, ?, ?)').bind(row.id, dkey, t).run(); summary.primed++; continue; }
          const r = await once(env, row, dkey, { ...payload, kind, tag: `${kind}:${key}` }, { urgency: URGENT.has(kind) ? 'high' : 'normal', topic: `${kind}_${w.col}${w.id}` });
          if (r?.ok) summary.sent++;
        }
      }
    }
    for (let i = 0; i < upserts.length; i += 50) await env.DB.batch(upserts.slice(i, i + 50));
  }
  const unprimed = subs.filter((s) => !s.primed).map((s) => s.id);
  if (unprimed.length) await env.DB.prepare(`UPDATE push_subs SET primed = 1 WHERE id IN (${unprimed.join(',')})`).run();
  // ---- fights
  try { summary.fights = await fightTick(env, subs, t); } catch (e) { summary.errors.push(`fights: ${String(e?.shortMessage ?? e).slice(0, 80)}`); }
  if (summary.sent || summary.errors.length) log(JSON.stringify(summary));
  return summary;
}

/** Fights accepted or decided since the last look: a push to the people in them. Returns how many were sent. */
async function fightTick(env, subs, t) {
  const club = env.FIGHTCLUB_ADDRESS;
  if (!club) return 0;
  const pub = publicClient(env);
  const count = Number(await pub.readContract({ address: club, abi: FIGHT_ABI, functionName: 'fightCount' }));
  const lastRow = await env.DB.prepare('SELECT MAX(id) AS m FROM push_fights').first('m');
  const first = lastRow == null;   // the first look ever: every fight so far is history, not news
  const last = first ? Math.max(0, count - 50) : Number(lastRow);
  const { results: open } = await env.DB.prepare('SELECT id FROM push_fights WHERE status = ?').bind(PENDING).all();
  const ids = [...open.map((r) => r.id), ...Array.from({ length: Math.min(50, Math.max(0, count - last)) }, (_, i) => last + 1 + i)];
  if (!ids.length) return 0;
  const fights = await pub.multicall({ contracts: ids.map((id) => ({ address: club, abi: FIGHT_ABI, functionName: 'fight', args: [BigInt(id)] })), allowFailure: true });
  if (first) {
    const seed = ids.map((id, i) => fights[i].status === 'success' ? env.DB.prepare('INSERT OR IGNORE INTO push_fights (id, status, seen_at) VALUES (?, ?, ?)').bind(id, Number(fights[i].result.status), t) : null).filter(Boolean);
    if (seed.length) await env.DB.batch(seed);
    return 0;
  }
  const subsOf = (address) => subs.filter((s) => s.address === String(address).toLowerCase());
  let sent = 0;
  const writes = [];
  for (let i = 0; i < ids.length; i++) {
    if (fights[i].status !== 'success') continue;
    const f = fights[i].result; const id = ids[i]; const status = Number(f.status);
    const seen = open.some((r) => r.id === id);
    const a = `${PET[colOfGame(f.challengerCollection)]?.label ?? 'pet'} #${f.challengerPet}`;
    const b = status >= PENDING ? `${PET[colOfGame(f.acceptorCollection)]?.label ?? 'pet'} #${f.acceptorPet}` : '';
    const stake = mon(f.stake);
    if (status === PENDING && !seen) {
      for (const row of subsOf(f.challenger)) {
        const prefs = parsePrefs(row.prefs);
        if (!wants(prefs, 'fightAccepted') || inQuiet(prefs, t)) continue;
        const r = await once(env, row, `fight:${id}:accepted`, { title: 'Your fight was accepted', body: `${a} v ${b} for ${stake} MON a side. Pyth is rolling.`, url: '/fightclub', kind: 'fightAccepted', tag: `fight:${id}` }, { topic: `fight_${id}` });
        if (r?.ok) sent++;
      }
    }
    if (status === FOUGHT || status === ABORTED) {
      for (const who of [f.challenger, f.acceptor]) {
        const won = status === FOUGHT && String(f.winner).toLowerCase() === String(who).toLowerCase();
        const payload = status === ABORTED
          ? { title: 'Your fight was called off', body: 'Pyth did not answer in time. Both stakes are refunded.', url: '/fightclub' }
          : won ? { title: `You won ${mon(f.payout)} MON`, body: `${a} v ${b}. Your pet wears the belt today.`, url: '/fightclub' }
            : { title: 'You lost the fight', body: `${a} v ${b}, ${stake} MON a side. A black eye for a day.`, url: '/fightclub' };
        for (const row of subsOf(who)) {
          const prefs = parsePrefs(row.prefs);
          if (!wants(prefs, 'fightResult') || inQuiet(prefs, t)) continue;
          const r = await once(env, row, `fight:${id}:result:${String(who).toLowerCase()}`, { ...payload, kind: 'fightResult', tag: `fight:${id}` }, { topic: `fight_${id}` });
          if (r?.ok) sent++;
        }
      }
    }
    if (status !== PENDING || !seen) writes.push(env.DB.prepare('INSERT INTO push_fights (id, status, seen_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, seen_at = excluded.seen_at').bind(id, status, t));
  }
  if (writes.length) await env.DB.batch(writes);
  return sent;
}
