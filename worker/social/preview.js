/**
 * Link previews for a profile: /u/<address> and /u/<name>. Like a pet's page (preview.js), GitHub Pages cannot answer
 * these routes, so the Worker serves the site's own index.html with a 200 and that person's Open Graph tags: their
 * name, the first lines of their bio, and their own link card (1200x630, drawn by the site from their banner, picture,
 * name and pets: pics.js, kind 'card') or, until they have one, the card of their avatar pet in its current mood. The
 * SPA routes the page as usual. Anything that fails (no such person, D1 down, the RPC down) gets the plain shell, 200.
 */
import { PET, CARD_MOODS, rewrite, shellHtml, tokenMeta } from '../preview.js';
import { resolveKey } from './profiles.js';
import { mediaUrl, picsMode } from './pics.js';

const ORIGIN = 'https://emogotchi.emonad.lol';
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function profileRoute(pathname) {
  const m = pathname.match(/^\/u\/([A-Za-z0-9_]{3,20}|0x[0-9a-fA-F]{40})\/?$/);
  return m ? m[1] : null;
}

export async function profilePreview(request, env, ctx, key) {
  const cache = caches.default;
  const cacheKey = new Request(`${ORIGIN}/u/${key.toLowerCase()}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const html = await shellHtml(env);
  let out = html;
  try {
    const address = env.DB ? await resolveKey(env, key) : null;
    if (address) {
      const p = await env.DB.prepare('SELECT p.name, p.bio, p.card_pic AS card, COALESCE(p.avatar_col, g.pet_col) AS col, COALESCE(p.avatar_id, g.pet_id) AS id FROM (SELECT ? AS address) x LEFT JOIN profiles p ON p.address = x.address LEFT JOIN gate g ON g.address = x.address AND g.ok = 1').bind(address).first();
      const name = p?.name || short(address);
      let img = `${ORIGIN}/og.png`; let alt = `${name} on Emotown`;
      if (p?.card && env.MEDIA_HOST && await picsMode(env) !== 'off') img = mediaUrl(env, p.card, 'card');
      else if (p?.col && PET[p.col]?.contract) {
        const meta = await tokenMeta(PET[p.col].contract, p.id).catch(() => null);
        if (meta) {
          const mood = CARD_MOODS.has(String(meta.attributes.Mood)) ? String(meta.attributes.Mood) : 'content';
          const crown = meta.attributes.Crown === 'yes';
          img = `${ORIGIN}/brand/pet/${PET[p.col].card}/${mood}${crown ? '-crown' : ''}.png`;
          alt = `${name}'s pet, ${meta.name || `#${p.id}`}, ${mood}.`;
        }
      }
      const bio = String(p?.bio ?? '').replace(/\s+/g, ' ').trim();
      out = rewrite(html, {
        title: `${name} · Emotown`,
        desc: bio ? bio.slice(0, 200) : `${name} lives in Emotown, the town where the pets of Emogotchi hang out.`,
        img, alt,
        url: `${ORIGIN}/u/${p?.name || address}`,
        collection: 'Emogotchi',
      });
    }
  } catch { /* the plain shell */ }
  const res = new Response(out, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-preview': out === html ? 'shell' : 'profile',
    'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-content-type-options': 'nosniff', 'cross-origin-opener-policy': 'same-origin-allow-popups' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
