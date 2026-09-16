/**
 * emogotchi.emonad.lol/api/cats
 *
 * The gallery needs to know which cats have been named and which have died, across all 82k of them.
 * Monad's public RPC caps log queries at 100 blocks, so a browser cannot work that out. Envio's
 * HyperSync can answer it in one request, but its token must not ship in the site's JavaScript.
 *
 * So: this Worker holds the token, asks HyperSync, and hands back just the ids. It caches for 30
 * seconds at the edge, so a thousand readers cost two upstream requests a minute rather than a
 * thousand, and a cat named right now shows up within half a minute.
 */
const GAME = '0xc0a0808cbaf507b80df92b22fed8d3810eab45d5';
const FROM_BLOCK = 105137070; // the deploy
const HYPERSYNC = 'https://monad.hypersync.xyz/query';
const TOPIC_NAMED = '0x9726e950b835e1f7f4fe747cca4223de678452a4f67c102d50408e22e94e9485'; // Named(uint256,string)
const TOPIC_DIED = '0xfda7d6be9e47c82ebcc3553edd222287058538459229e3a58a56dd65448fbecd'; // Died(uint256,uint256)
const CACHE_SECONDS = 30;

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
async function scan(env, topic, withName) {
  const seen = new Map(); // id -> name (or '')
  let from = FROM_BLOCK;
  for (let page = 0; page < 40; page++) {
    const r = await fetch(HYPERSYNC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HYPERSYNC_TOKEN}` },
      body: JSON.stringify({
        from_block: from,
        logs: [{ address: [GAME], topics: [[topic]] }],
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/cats')) return new Response('not found', { status: 404 });
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
    }

    const cache = caches.default;
    const key = new Request(url.origin + '/api/cats', request);
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const [named, died] = await Promise.all([scan(env, TOPIC_NAMED, true), scan(env, TOPIC_DIED, false)]);
      const body = JSON.stringify({ generatedAt: new Date().toISOString(), live: true, named, died });
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
