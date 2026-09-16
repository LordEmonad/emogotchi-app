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

/** Every token id that appears in `topic1` of the matching logs. */
async function ids(env, topic) {
  const out = new Set();
  let from = FROM_BLOCK;
  for (let page = 0; page < 40; page++) {
    const r = await fetch(HYPERSYNC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HYPERSYNC_TOKEN}` },
      body: JSON.stringify({
        from_block: from,
        logs: [{ address: [GAME], topics: [[topic]] }],
        field_selection: { log: ['topic1'] },
      }),
    });
    if (!r.ok) throw new Error(`hypersync ${r.status}`);
    const j = await r.json();
    for (const b of j.data ?? []) for (const l of b.logs ?? []) out.add(Number(BigInt(l.topic1)));
    if (j.next_block == null || j.next_block <= from) break;
    from = j.next_block;
  }
  return [...out].sort((a, b) => b - a);
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
      const [named, died] = await Promise.all([ids(env, TOPIC_NAMED), ids(env, TOPIC_DIED)]);
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
