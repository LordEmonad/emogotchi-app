/**
 * GIF search for the town square and DMs, through KLIPY (klipy.com, built by Tenor's old team; Tenor's API closed on
 * 2026-06-30 and GIPHY charges for more than 100 calls an hour). KLIPY's free test key also allows 100 calls an hour,
 * so the Worker spends them for the whole site at once:
 *
 *  - the key stays here (the secret KLIPY_KEY; without it the site shows no GIF button at all: `gifsOn`),
 *  - every answer is kept: in this Cloudflare location's cache, and site-wide in D1 (`gif_cache`), a search term for a
 *    day and the featured page for twenty minutes, so a term costs one KLIPY call a day however many people search it,
 *  - at most HOUR_BUDGET calls go out in a clock hour; past that, and for ten minutes after KLIPY says 429, a search
 *    answers from whatever is kept (an older copy if there is one) and says so, never an error,
 *  - only signed-in people search (the picker is for posting), at most GIF_LIMIT a minute each.
 *
 * What comes back is only what a message needs (rules.js cleanGif: every URL on static.klipy.com) and a short title for
 * alt text. The content filter is "off" (GIPHY/Tenor's R: the operator's choice, 2026-09-28; KLIPY has no porn).
 */
import { cleanGif, clip } from './rules.js';
import { fail, json, limited, now } from './http.js';

const BASE = 'https://api.klipy.com/v2';
const PER_PAGE = 24;
const HOUR_BUDGET = 90;              // of KLIPY's 100 an hour on the free key, with room to spare
const TTL_SEARCH = 24 * 3600_000;
const TTL_FEATURED = 20 * 60_000;
const REST_MS = 10 * 60_000;         // after KLIPY answers 429

export const gifsOn = (env) => !!String(env.KLIPY_KEY ?? '').trim();

/** A search term as the cache keys it: case, spacing and invisible characters do not make a new search. */
export const normQuery = (q) => String(q ?? '').normalize('NFKC').toLowerCase().replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
// KLIPY's page token is base64 ("Mg=="): letters, digits and + / = only
const normPos = (p) => { const s = String(p ?? ''); return /^[A-Za-z0-9._:+/=-]{0,64}$/.test(s) ? s : ''; };

/** One KLIPY result as the picker needs it, or null. */
export function shapeGif(r) {
  const mf = r?.media_formats ?? {};
  const pick = (...names) => names.map((n) => mf[n]).find((f) => f && typeof f.url === 'string');
  const anim = pick('tinygif', 'nanogif', 'mediumgif', 'gif');       // ~220 px wide: the size a chat shows
  const still = pick('tinygifpreview', 'nanogifpreview', 'gifpreview');
  const g = cleanGif({ id: r?.id, url: anim?.url, still: still?.url, w: anim?.dims?.[0], h: anim?.dims?.[1] });
  return g ? { ...g, title: clip(String(r?.content_description || r?.title || '').replace(/[\u0000-\u001f]/g, ''), 80) } : null;
}

/** GET /api/social/gifs?q=&pos= : { items, next, busy? } (q empty: KLIPY's featured GIFs). */
export async function searchGifs(env, ctx, who, url) {
  if (!gifsOn(env)) return json({ off: true, items: [], next: null });
  if (await limited(env.GIF_LIMIT, who.address)) fail(429, 'Easy on the GIF search. Try again in a moment.');
  const q = normQuery(url.searchParams.get('q'));
  const pos = normPos(url.searchParams.get('pos'));
  const key = `${q ? `s:${q}` : 'f'}|${pos}`;
  const ttl = q ? TTL_SEARCH : TTL_FEATURED;
  const headers = { 'cache-control': 'private, max-age=600' };

  // 1. this location's copy
  const cacheKey = new Request(`https://emogotchi.emonad.lol/api/social/_gifs/${encodeURIComponent(key)}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const hit = await cache?.match(cacheKey);
  if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers } });
  const keep = (body) => { if (cache) ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${Math.round(ttl / 1000)}` } }))); };

  // 2. the site-wide copy
  const row = await env.DB.prepare('SELECT body, at FROM gif_cache WHERE key = ?').bind(key).first();
  if (row && now() - row.at < ttl) { keep(row.body); return json(JSON.parse(row.body), 200, headers); }
  const stale = () => (row ? json({ ...JSON.parse(row.body), busy: true }, 200, headers) : json({ items: [], next: null, busy: true }, 200, headers));

  // 3. KLIPY, within the hour's budget and not while resting
  const t = now();
  const rest = await env.DB.prepare("SELECT value FROM settings WHERE key = 'klipy_rest'").first();
  if (rest && Number(rest.value) > t) return stale();
  const hour = String(Math.floor(t / 3600_000));
  const spent = await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('klipy_hour', ?1, ?2)
      ON CONFLICT(key) DO UPDATE SET value = CASE WHEN substr(value, 1, instr(value, ':') - 1) = ?3
        THEN ?3 || ':' || (CAST(substr(value, instr(value, ':') + 1) AS INTEGER) + 1) ELSE ?1 END, updated_at = ?2
      RETURNING value`).bind(`${hour}:1`, t, hour).first();
  if (Number(String(spent?.value ?? '').split(':')[1]) > HOUR_BUDGET) return stale();

  const u = new URL(`${env.KLIPY_BASE || BASE}/${q ? 'search' : 'featured'}`);
  for (const [k, v] of Object.entries({ key: String(env.KLIPY_KEY).trim(), limit: PER_PAGE, contentfilter: 'off', media_filter: 'tinygif,nanogif,mediumgif,gif,tinygifpreview,nanogifpreview,gifpreview', locale: 'en_US', country: 'US', ...(q ? { q } : {}), ...(pos ? { pos } : {}) })) u.searchParams.set(k, String(v));
  let r;
  try { r = await fetch(u, { signal: AbortSignal.timeout(8000) }); } catch (e) { console.error('[gifs] fetch', String(e).slice(0, 120)); return stale(); }
  if (r.status === 429) {
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('klipy_rest', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2").bind(String(t + REST_MS), t).run();
    return stale();
  }
  if (!r.ok) { console.error('[gifs] klipy', r.status); return stale(); }
  let j;
  try { j = await r.json(); } catch { return stale(); }
  const items = (Array.isArray(j?.results) ? j.results : []).map(shapeGif).filter(Boolean);
  const next = normPos(j?.next) || null;
  const body = JSON.stringify({ items, next: items.length ? next : null });
  ctx.waitUntil(env.DB.prepare('INSERT INTO gif_cache (key, body, at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET body = ?2, at = ?3').bind(key, body, t).run().catch(() => {}));
  keep(body);
  return json(JSON.parse(body), 200, headers);
}
