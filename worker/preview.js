/**
 * Link previews for one pet: /pet/<id> (a cat), /inversebrah/pet/<id> and /tung/pet/<id>. GitHub Pages cannot answer these routes
 * (it 404s and the SPA takes over in the browser), which is exactly what stops X, Discord and Telegram from building
 * a preview for the links people share most. So the Worker answers them: it serves the site's own index.html with a
 * 200, and swaps the Open Graph tags for that pet's: its name, its mood and numbers from `tokenURI` (one eth_call),
 * and the pre-drawn card for its mood and crown (brand/pet/<cat|frok|sahur>/<mood>[-crown].png, baked by tools/og-pets.mjs;
 * crawlers will not render an SVG og:image, and the on-chain picture is SVG). Humans get the same HTML, and the SPA
 * routes it as before. An unknown id, or an RPC hiccup, gets the untouched shell, still a 200.
 */
const RPC = 'https://rpc.monad.xyz';
const ORIGIN = 'https://emogotchi.emonad.lol';
const CATS = '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5';
const INVERSE = '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6';
const SAHUR = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';   // Tung Tung Tung Sahuragotchi, deployed 2026-09-25
const THICCUMS = '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec';   // Thiccumsgotchi (tools/thiccums-launch.mjs)
const R3TARDS = '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e';   // r3tardgotchi (tools/r3tards-launch.mjs)
const EMONAD = '0xcD4BF1Ea169703f810dA87680a1B8FdA64adcdF7';   // Emonadgotchi (tools/emonad-launch.mjs)
/** the three pets: their page prefix, contract, and how the tags name them */
export const PET = {
  cat: { prefix: '', contract: CATS, kind: 'Emogotchi', collection: 'Emogotchi', card: 'cat', blurb: 'A cat that lives in your wallet, on Monad. Every care is 1 MON, and 80% of every interaction burns EMO.' },
  frok: { prefix: '/inversebrah', contract: INVERSE, kind: 'inversebrah', collection: 'Inversegotchi', card: 'frok', blurb: 'A frok that lives in your wallet, on Monad. Everything you do to him is free and counted forever.' },
  thiccums: { prefix: '/thiccums', contract: THICCUMS, kind: 'Thiccums', collection: 'Thiccumsgotchi', card: 'thiccums', blurb: 'Thiccums the Seal, living in your wallet on Monad. Everything you do to him is free; every butt bounce is counted forever.' },
  r3tards: { prefix: '/r3tardgotchi', contract: R3TARDS, kind: 'r3tard', collection: 'r3tardgotchi', card: 'r3tards', blurb: 'A r3tard that lives in your wallet, on Monad. Everything you do to him is free and counted forever.' },
  emonad: { prefix: '/emonadgotchi', contract: EMONAD, kind: 'Emonad', collection: 'Emonadgotchi', card: 'emonad', blurb: 'Emonad, the face of $EMO, living in your wallet on Monad. Everything you do to him is free and counted forever.' },
  sahur: { prefix: '/tung', contract: SAHUR, kind: 'Tung Tung Tung Sahur', collection: 'Sahuragotchi', card: 'sahur', blurb: 'Tung Tung Tung Sahur, living in your wallet on Monad. Everything you do to him is free; every tung tung tung is counted forever.' },
};
const SEL_TOKEN_URI = '0xc87b56dd';
export const CARD_MOODS = new Set(['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead']);

let shell = { html: null, at: 0 }; // the site's index.html, kept a couple of minutes per isolate

export function previewRoute(pathname) {
  const m = pathname.match(/^\/(inversebrah\/|tung\/|thiccums\/|r3tardgotchi\/|emonadgotchi\/)?pet\/(\d{1,7})\/?$/);
  return m ? { pet: m[1] === 'inversebrah/' ? 'frok' : m[1] === 'tung/' ? 'sahur' : m[1] === 'thiccums/' ? 'thiccums' : m[1] === 'r3tardgotchi/' ? 'r3tards' : m[1] === 'emonadgotchi/' ? 'emonad' : 'cat', id: Number(m[2]) } : null;
}

// the highest id each collection has, so a made-up id costs no RPC call (every distinct id was one eth_call before:
// review 2026-09-27). Cats never pass 100,000; the free pets are read (totalSupply) and remembered ten minutes.
const SEL_TOTAL_SUPPLY = '0x18160ddd';
const supply = new Map();   // contract -> { n, at }
async function highestId(pet) {
  if (pet === 'cat') return 100_000;
  const c = PET[pet].contract; const had = supply.get(c);
  if (had && Date.now() - had.at < 600_000) return had.n + 50;   // a little slack for pets minted since
  try {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: c, data: SEL_TOTAL_SUPPLY }, 'latest'] }) });
    const n = Number(BigInt((await r.json()).result));
    if (Number.isSafeInteger(n) && n > 0) { supply.set(c, { n, at: Date.now() }); return n + 50; }
  } catch { /* unknown: let the id through */ }
  return Infinity;
}

export async function preview(request, env, ctx, { pet, id }) {
  const P = PET[pet];
  const cache = caches.default;
  const key = new Request(`${ORIGIN}${P.prefix}/pet/${id}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const html = await shellHtml(env);
  let out = html;
  try {
    const meta = P.contract && id > 0 && id <= await highestId(pet) ? await tokenMeta(P.contract, id) : null;
    if (meta) out = rewrite(html, tags(meta, pet, id));
  } catch { /* the plain shell */ }
  const res = new Response(out, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-preview': out === html ? 'shell' : 'pet',
    // the site's CSP rides along in the HTML, but frame-ancestors is ignored from a meta tag: it has to be a header.
    // Without it this page can be framed and the confirm button click-jacked, so the Worker sets it where it can.
    'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-content-type-options': 'nosniff', 'cross-origin-opener-policy': 'same-origin-allow-popups' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/**
 * A request for the site's own files. Since 2026-09-28 the site is the Worker `emogotchi-site` (Workers Static Assets),
 * reached through the SITE service binding: the page never crosses the network, where it used to come from GitHub Pages
 * over a leg Cloudflare could not authenticate. SITE_DIRECT=1 (tests under `wrangler dev`, where the binding has no
 * Worker behind it) fetches the live site over the network instead.
 */
export function fromSite(env, input) {
  return env?.SITE && env.SITE_DIRECT !== '1' ? env.SITE.fetch(input) : fetch(input, { cf: { cacheTtl: 60 } });
}

export async function shellHtml(env) {
  if (shell.html && Date.now() - shell.at < 120_000) return shell.html;
  const r = await fromSite(env, `${ORIGIN}/`);
  if (!r.ok) throw new Error(`shell ${r.status}`);
  shell = { html: await r.text(), at: Date.now() };
  return shell.html;
}

/** tokenURI(id) decoded: { name, attributes: { Mood, Crown, Alive, ... } } or null if the token does not exist. */
export async function tokenMeta(contract, id) {
  const data = SEL_TOKEN_URI + id.toString(16).padStart(64, '0');
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data }, 'latest'] }) });
  const j = await r.json();
  if (!j.result || j.result === '0x') return null;
  const hex = j.result.slice(2);
  const off = parseInt(hex.slice(0, 64), 16) * 2, len = parseInt(hex.slice(off, off + 64), 16) * 2;
  const bytes = hex.slice(off + 64, off + 64 + len);
  const raw = new Uint8Array(bytes.length / 2); for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
  const uri = new TextDecoder().decode(raw);
  const b64 = uri.replace(/^data:application\/json;base64,/, '');
  const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  const attributes = Object.fromEntries((json.attributes ?? []).map((a) => [a.trait_type, a.value]));
  // capped like /api/cats does: a name is on-chain text anyone can set, and it lands in a cached <title>
  return { name: String(json.name ?? '').slice(0, 128), attributes };
}

function tags(meta, pet, id) {
  const P = PET[pet]; const frok = pet === 'frok';
  const a = meta.attributes;
  const mood = CARD_MOODS.has(String(a.Mood)) ? String(a.Mood) : 'content';
  const crown = a.Crown === 'yes';
  const alive = a.Alive !== 'no';
  const fallback = `${P.kind} #${id}`;
  const name = meta.name && meta.name !== fallback ? meta.name : fallback;
  const cares = num(a.Feeds) + num(a.Washes) + num(a.Plays) + num(a.Naps) + num(a.Cleanups);
  const bits = [];
  if (crown) bits.push('wears the crown');
  if (alive) { if (num(a.Day) > 0) bits.push(`day ${num(a.Day)}`); if (num(a.Streak) > 0) bits.push(`${num(a.Streak)}-day streak`); if (num(a['Care score']) > 0) bits.push(`care score ${num(a['Care score'])}`); }
  bits.push(`${cares.toLocaleString('en-US')} cares`, `${num(a.Pets).toLocaleString('en-US')} pets`);
  if (frok) { const abuse = num(a.Screenshots) + num(a.Slaps) + num(a.Squeezes) + num(a.Burns); bits.push(`abused ${abuse.toLocaleString('en-US')}×`); }
  if (pet === 'sahur') bits.push(`tung tung tung ${num(a.Tungs).toLocaleString('en-US')}×`);
  if (pet === 'thiccums') bits.push(`bounced ${num(a.Bounces).toLocaleString('en-US')}×`);
  if (!alive) bits.push('dead'); else if (num(a.Deaths) === 0) bits.push('never died'); else bits.push(`died ${num(a.Deaths)}×`);
  const title = `${name} · ${mood}`;
  const desc = `${bits.join(' · ')}. ${P.blurb}`;
  const img = `${ORIGIN}/brand/pet/${P.card}/${mood}${crown ? '-crown' : ''}.png`;
  const alt = `${name}, ${mood}${crown ? ', wearing the crown' : ''}.`;
  return { title, desc, img, alt, url: `${ORIGIN}${P.prefix}/pet/${id}`, collection: P.collection };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function rewrite(html, t) {
  // a function replacer: the value goes in verbatim, so a name with a $ in it cannot become a backreference
  const set = (h, re, val) => h.replace(re, (_, a, b) => a + val + b);   // every pattern captures its two ends
  let h = html;
  h = set(h, /(<title>)[^<]*(<\/title>)/, `${esc(t.title)} · ${t.collection}`);
  h = set(h, /(<meta name="description" content=")[^"]*(")/, esc(t.desc));
  h = set(h, /(<meta property="og:title" content=")[^"]*(")/, esc(t.title));
  h = set(h, /(<meta property="og:description" content=")[^"]*(")/, esc(t.desc));
  h = set(h, /(<meta property="og:image" content=")[^"]*(")/, t.img);
  h = set(h, /(<meta property="og:image:width" content=")[^"]*(")/, '1200');
  h = set(h, /(<meta property="og:image:height" content=")[^"]*(")/, '630');
  h = set(h, /(<meta property="og:image:alt" content=")[^"]*(")/, esc(t.alt));
  h = set(h, /(<meta property="og:url" content=")[^"]*(")/, t.url);
  h = set(h, /(<meta name="twitter:title" content=")[^"]*(")/, esc(t.title));
  h = set(h, /(<meta name="twitter:description" content=")[^"]*(")/, esc(t.desc));
  h = set(h, /(<meta name="twitter:image" content=")[^"]*(")/, t.img);
  return h;
}
