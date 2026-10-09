/**
 * emogotchi.emonad.lol/api/*, the pet and profile pages' link previews, the social layer, and the cron.
 *
 * /api/stats, /api/cats and /api/starvation are what the site cannot read straight off the contracts: history and
 * totals, which pets are named, which are dead (across all 82k cats). Monad's public RPC caps log queries at 100
 * blocks, so a browser cannot work that out; Envio's HyperSync can, but its token must not ship in the site's
 * JavaScript. So this Worker holds the token and keeps ONE index (worker/indexer.js): the cron reads the new blocks
 * every minute and folds them into saved state, and these routes answer out of that state. A request never reaches
 * HyperSync. Each location keeps an answer for half a minute (stats: a minute), and its last good one for a day in
 * case the database cannot be read.
 */
import { advance, catsFromIndex, indexStatus, petOf, starvationFromIndex, statsFromIndex } from './indexer.js';
import { fromSite, preview, previewRoute } from './preview.js';
import { settle } from './fightkeeper.js';
import { pushTick } from './push.js';
import { drip } from './drip.js';
import { refer } from './referral.js';
import { topup } from './topup/index.js';
import { social, sweep } from './social/index.js';
import { silenceCrier } from './social/crier.js';
import { profilePreview, profileRoute } from './social/preview.js';
import { media } from './social/pics.js';
// the social layer's Durable Objects (the town square, and each person's live inbox) must be exported from the entry
export { ChatRoom, Inbox } from './social/index.js';
const petParam = (url) => { const v = url.searchParams.get('pet'); return v === 'frok' || v === 'sahur' || v === 'thiccums' || v === 'r3tards' || v === 'emonad' ? v : 'cat'; };
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' };
const STATS_KV_KEY = 'stats:lastgood';     // the stats as last folded the old way (until 2026-10-01): only read while the index is first built
const CACHE_SECONDS = 30;
const STATS_SECONDS = 60;

/**
 * One of the index's answers. This location's copy while it is fresh; else worked out from the index (`make`, which
 * answers null while the index is still being built); else the last good answer this location has (or `older`, an
 * answer from before the index), marked stale; else an error the site knows how to live with.
 */
async function fromIndex(env, ctx, origin, name, ttl, make, older = async () => null) {
  const cache = caches.default;
  const keep = env.INDEX_NOCACHE !== '1';   // (tools/index-check.mjs asks again and again; never set deployed)
  const key = new Request(`${origin}/api/_idx/${name}`);
  const hit = keep ? await cache.match(key) : null;
  if (hit) return hit;
  const last = new Request(`${origin}/api/_idx-last/${name}`);
  let why = 'the index is being built';
  try {
    const j = await make();
    if (j) {
      const body = JSON.stringify(j);
      const res = new Response(body, { headers: { ...JSON_HEADERS, 'cache-control': `public, max-age=${ttl}` } });
      if (keep) ctx.waitUntil(cache.put(key, res.clone()));
      ctx.waitUntil(cache.put(last, new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } })));
      return res;
    }
  } catch (e) { why = String(e).slice(0, 120); }
  const prev = (await cache.match(last)) ?? (await older().catch(() => null));
  // whatever is served now is also what this location answers for the next half minute
  const res = prev
    ? new Response(JSON.stringify({ ...(await prev.json()), stale: true, staleReason: why }), { headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=30', 'x-stale': '1' } })
    : new Response(JSON.stringify({ error: why }), { status: 502, headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=30' } });
  if (keep) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  /** The cron (wrangler.toml `[triggers]`, every minute). */
  async scheduled(event, env, ctx) {
    // The index (worker/indexer.js): every minute, the logs since the last block read, folded into the saved state.
    // One run at a time; a no-op without the HyperSync token.
    ctx.waitUntil(advance(env, (m) => console.log('[index]', m)).catch((e) => console.error('[index]', String(e))));
    // the retired town crier's old lines out of the square, once (social/crier.js); afterwards a no-op
    ctx.waitUntil(silenceCrier(env).then((n) => { if (n != null) console.log('[crier] removed', n, 'lines from the square'); }).catch((e) => console.error('[crier]', String(e))));
    // Everything below runs every five minutes, as it did when the cron itself was */5 (a test's own cron string, like
    // push-check's, always runs it).
    if (event.cron === '* * * * *' && new Date(event.scheduledTime ?? Date.now()).getUTCMinutes() % 5 !== 0) return;
    ctx.waitUntil(sweep(env).catch((e) => console.error('[social] sweep', String(e))));   // expired sign-ins and sessions
    // the home-screen app's notifications: every pet's clock and the fights, every ten minutes (worker/push.js); a no-op until the VAPID keys are set
    if (env.PUSH_EVERY_TICK === '1' || new Date().getUTCMinutes() % 10 < 5) ctx.waitUntil(pushTick(env, (m) => console.log('[push]', m)).catch((e) => console.error('[push]', String(e))));
    // Fight Club: settle any fight Pyth's keeper dropped (worker/fightkeeper.js); a no-op until FIGHTCLUB_ADDRESS and FIGHT_KEEPER_KEY are set
    ctx.waitUntil(settle(env, (m) => console.log('[fightclub]', m)).then((s) => { if (!s.skipped || s.pending) console.log('[fightclub]', JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? String(v) : v))); }).catch((e) => console.error('[fightclub]', String(e))));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The pictures people upload are served from their own host (emotown-media.emonad.lol), a sibling of the site, and
    // that host answers nothing else: see worker/social/pics.js for why it must never be the site's own host.
    if (env.MEDIA_HOST && url.hostname === env.MEDIA_HOST) return media(request, env, ctx, url);
    // Local development only (MEDIA_DEV is never set on the deployed Worker): `wrangler dev` rewrites every request to
    // the first route's host, so there the media host is the path /__media/ instead.
    if (env.MEDIA_DEV === '1' && url.pathname.startsWith('/__media/')) return media(request, env, ctx, new URL(url.pathname.slice('/__media'.length) + url.search, url.origin));
    const petPage = previewRoute(url.pathname);
    if (petPage) return preview(request, env, ctx, petPage);
    // anything else under the routed prefixes is the site's own (the site Worker, through the SITE binding)
    if (/^\/(inversebrah\/|tung\/)?pet\//.test(url.pathname)) return fromSite(env, request);
    // a profile's page (/u/<address> or /u/<name>): the site's shell with that person's link preview
    const profileKey = profileRoute(url.pathname);
    if (profileKey) return profilePreview(request, env, ctx, profileKey);
    if (url.pathname.startsWith('/u/')) return fromSite(env, request);
    // Emotown's social layer (worker/social/): sign-in, profiles, follows, the town square, DMs, moderation. It has its
    // own reads and writes, sessions and rate limits, and never touches the HyperSync folds below.
    if (url.pathname.startsWith('/api/social/')) return social(request, env, ctx, url);
    // The one route on this Worker that writes: a starter for a brand-new passkey account (worker/drip.js). It is
    // POST-only and never cached, so it is matched BEFORE the read-only guard below rather than being an exception
    // inside it — the guard's whole job is that nothing uncacheable reaches the folds, and this does not touch them.
    if (url.pathname === '/api/drip') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      return drip(request, env);
    }
    // Records who brought a new player (worker/referral.js). Write-once and uncached, like the drip above.
    if (url.pathname === '/api/refer') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      return refer(request, env);
    }
    // "Add MON from another chain" (worker/topup/, CROSSCHAIN.md): Relay quotes built and checked here, balances on the
    // other chains, and the status of a top-up. Never cached; spends nothing of ours; off while RELAY_API_KEY is unset.
    if (url.pathname.startsWith('/api/topup/')) return topup(request, env, url);
    // Every route below is a read that the edge is meant to cache. Refusing the other methods outright keeps an
    // uncacheable request from reaching the expensive folds at all, rather than relying on each key being built right.
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
    }
    const cache = caches.default;
    if (url.pathname.startsWith('/api/stats')) {
      // everything that ever happened, in numbers. While the index is first built, the stats as they were last folded
      // the old way: this location's day-long copy of them, else the global copy in KV
      return fromIndex(env, ctx, url.origin, 'stats', STATS_SECONDS, () => statsFromIndex(env), async () => {
        const hit = await cache.match(new Request(url.origin + '/api/stats'));
        if (hit) return hit;
        const last = await env.REFERRALS.get(STATS_KV_KEY, 'json');
        return last?.generatedAt && last.cats ? new Response(JSON.stringify(last)) : null;   // only a real fold's result, never an error body
      });
    }
    // how far the index has read, for whoever is watching it
    if (url.pathname === '/api/index') return fromIndex(env, ctx, url.origin, 'status', 20, () => indexStatus(env));
    // ?pet=frok answers for inversebrah's contract, ?pet=sahur for Sahur's, ?pet=thiccums for his; anything else is the cats
    const pet = petParam(url);
    if (!petOf(pet)) return new Response(JSON.stringify({ error: 'no such pet' }), { status: 404, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    // the numbers behind the Great Starvation strip
    if (url.pathname.startsWith('/api/starvation')) return fromIndex(env, ctx, url.origin, 'starvation-' + pet, CACHE_SECONDS, () => starvationFromIndex(env, pet));
    if (!url.pathname.startsWith('/api/cats')) return new Response('not found', { status: 404 });
    // the gallery's lists: who is named, dead, never died, revived
    return fromIndex(env, ctx, url.origin, 'cats-' + pet, CACHE_SECONDS, () => catsFromIndex(env, pet),
      () => cache.match(new Request(url.origin + '/api/_cats-lastgood' + (pet === 'cat' ? '' : '-' + pet))));
  },
};
