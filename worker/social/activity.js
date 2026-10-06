/**
 * A profile's recent activity: what happened to this person's pets on chain in the last three days (cares, pets,
 * stunts, names, deaths, revives), newest first.
 *
 * The public RPC caps a log query at 100 blocks, so this goes to HyperSync, whose token is ONE shared token for every
 * fold the Worker does (and which rate-limited everything at once on 2026-09-21 and 2026-09-24). So this is bounded
 * three ways: one small query per profile, cached ten minutes at the edge; at most ACTIVITY_LIMIT queries a minute
 * for the whole site, whoever asks; and when that budget is spent, or HyperSync says no, the page says "later" rather
 * than retrying.
 */
import { GAMES, COLS, petIdsOf } from './chain.js';
import { json, limited } from './http.js';

const HYPERSYNC = 'https://monad.hypersync.xyz';
const WINDOW_BLOCKS = 900_000;   // ~3 days at 0.3 s a block (measured 2026-09-26: 1,002,493 blocks in 302,867 s)
const T = {
  care: '0xb32e67b898f6bb5ba6674e4ee94c0710c672d372fcdc15197bd6182b935ccd49',
  petted: '0x801d0162ba2c37d5ce51d7ced382b93e86db873e6333bf39e1fdcd8f6a78ff45',
  named: '0x9726e950b835e1f7f4fe747cca4223de678452a4f67c102d50408e22e94e9485',
  died: '0xfda7d6be9e47c82ebcc3553edd222287058538459229e3a58a56dd65448fbecd',
  revived: '0xf09fb03f078d2e3c9a9491aaed2891e36b3283b42e4c3e8f1fd585d830ff96e1',
  abuse: '0xfa424f7122d7c0b187aa9de7b423582ee08d5938aa2ac18dca05180a057db320',
};
const ACTIONS = ['feed', 'play', 'wash', 'sleep', 'clean', 'wake', 'name', 'revive'];
const STUNTS = { cat: [], frok: ['screenshot', 'slap', 'squeeze', 'burn'], sahur: ['tung'], thiccums: ['bounce'], r3tards: [], emonad: [] };
const topicOf = (id) => '0x' + BigInt(id).toString(16).padStart(64, '0');
const addr = (topic) => '0x' + topic.slice(26);

// after HyperSync says no, this isolate asks it nothing for a minute (a retry per visitor kept the token throttled)
let restUntil = 0;

export async function activity(env, ctx, address, origin) {
  const cache = caches.default;
  const key = new Request(`${origin}/api/social/_activity/${address}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  if (!env.HYPERSYNC_TOKEN) return json({ items: [], unavailable: true });
  // the budget first, before the chain reads too (they spend the public RPC the gate and sign-in also need), and a
  // "busy" or "unavailable" is remembered a minute for this address, so a loop of requests is not a loop of work
  // (security review, 2026-09-27; the budget is per Cloudflare location, like every rate-limit binding)
  if (Date.now() < restUntil || await limited(env.ACTIVITY_LIMIT, 'hypersync')) return put(ctx, cache, key, { items: [], busy: true }, 60);
  const ids = await petIdsOf(env, address).catch(() => null);
  if (!ids) return put(ctx, cache, key, { items: [], unavailable: true }, 60);
  if (!COLS.some((c) => ids[c].length)) return put(ctx, cache, key, { items: [], pets: 0 });
  const auth = { authorization: `Bearer ${env.HYPERSYNC_TOKEN}` };
  try {
    const h = await fetch(`${HYPERSYNC}/height`, { headers: auth });
    if (!h.ok) throw new Error(`height ${h.status}`);
    const { height } = await h.json();
    const r = await fetch(`${HYPERSYNC}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({
        from_block: Math.max(0, height - WINDOW_BLOCKS),
        logs: COLS.filter((c) => ids[c].length).map((c) => ({ address: [GAMES[c].toLowerCase()], topics: [Object.values(T), ids[c].map(topicOf)] })),
        field_selection: { log: ['address', 'topic0', 'topic1', 'topic2', 'topic3', 'data', 'block_number'], block: ['number', 'timestamp'] },
        max_num_logs: 400,
      }),
    });
    if (!r.ok) throw new Error(`query ${r.status}`);
    const j = await r.json();
    const colOf = Object.fromEntries(COLS.map((c) => [GAMES[c].toLowerCase(), c]));
    const items = [];
    for (const b of j.data ?? []) {
      const ts = new Map((b.blocks ?? []).map((bl) => [Number(bl.number), Number(BigInt(bl.timestamp))]));
      for (const l of b.logs ?? []) {
        const col = colOf[String(l.address).toLowerCase()]; if (!col) continue;
        const id = Number(BigInt(l.topic1)); const at = (ts.get(Number(l.block_number)) ?? 0) * 1000;
        let what = null, by = null;
        switch (l.topic0) {
          case T.care: what = ACTIONS[Number(BigInt(l.topic2))] ?? 'feed'; by = addr(l.topic3); break;
          case T.petted: what = 'pet'; by = addr(l.topic2); break;
          case T.named: what = 'named'; break;
          case T.died: what = 'died'; break;
          case T.revived: what = 'revived'; break;
          case T.abuse: what = STUNTS[col][Number(BigInt(l.topic2))] ?? null; by = l.topic3 ? addr(l.topic3) : null; break;
        }
        if (what && what !== 'wake') items.push({ col, id, what, by, at });
      }
    }
    items.sort((a, b) => b.at - a.at);
    return put(ctx, cache, key, { items: items.slice(0, 40), pets: COLS.reduce((n, c) => n + ids[c].length, 0), since: Date.now() - WINDOW_BLOCKS * 300 });
  } catch (e) {
    console.error('[social] activity', String(e).slice(0, 120));
    restUntil = Date.now() + 60_000;
    return put(ctx, cache, key, { items: [], busy: true }, 60);
  }
}

function put(ctx, cache, key, body, seconds = 600) {
  const res = json(body, 200, { 'cache-control': `public, max-age=${seconds}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
