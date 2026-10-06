/**
 * Pictures people upload: a profile picture (512x512) and a banner (1500x500), as an option beside their pet's head
 * and Emotown's own banners (operator, 2026-09-27); and each person's link card (1200x630), the picture shown when
 * their /u/ link is shared, which the site draws from their banner, picture, name and pets and uploads the same way
 * (a JPEG, because not every link-preview crawler takes WebP). Built for an origin that holds passkey keys, so:
 *
 * - Only a signed-in wallet that holds a NAMED pet may upload (the same 10 MON floor as talking; admins too), at most
 *   PER_DAY a day, and never while muted.
 * - The uploader's file is never kept or served. Cloudflare's image service (the IMAGES binding) decodes it and makes a
 *   new WebP at the exact size; only that output is stored, after its container is checked chunk by chunk (no EXIF,
 *   XMP, ICC, animation or anything else rides along). So no crafted file can reach another person's browser, which
 *   matters here: an image is decoded in the page that holds the key.
 * - Before anyone else sees it, it is screened (the AI binding, a vision model asked SAFE or UNSAFE). In 'screen' mode
 *   a clean picture is live at once and anything flagged, or anything the check could not judge, waits for an admin;
 *   in 'review' mode every picture waits; 'off' refuses uploads AND stops serving every uploaded picture (the site falls
 *   back to pets and Emotown's banners). The mode is an admin switch in D1 (`settings`), read at most every 30 s.
 * - Pictures are served from a SIBLING host (MEDIA_HOST, emotown-media.emonad.lol), never from the site's own: a
 *   response there is an image with nosniff and a sandboxing CSP, it carries no cookie, and that host cannot use the
 *   site's passkey rpId (emogotchi.emonad.lol is not a suffix of it; a SUBdomain of the site's host would be, so
 *   never serve them from media.emogotchi.emonad.lol). Held pictures are only ever sent to their owner and the admins,
 *   from the API as a download the site shows through a blob: URL.
 * - Bytes live in their own D1 database (MEDIA, emotown-media) so pictures can never fill the one that holds the town;
 *   refused, removed and replaced pictures are deleted, not kept.
 */
import { fail, json, now, randomHex } from './http.js';
import { gateFor, GATE_MESSAGE } from './gate.js';
import { CARD_JOIN, CARD_SQL, card } from './profiles.js';
import { notify } from './notify.js';

export const KINDS = {
  avatar: { w: 512, h: 512, col: 'pic', type: 'image/webp', path: 'p', ext: 'webp' },
  banner: { w: 1500, h: 500, col: 'banner_pic', type: 'image/webp', path: 'p', ext: 'webp' },
  card: { w: 1200, h: 630, col: 'card_pic', type: 'image/jpeg', path: 'c', ext: 'jpg' },
};
export const MODES = ['screen', 'review', 'off'];
const PER_DAY = 12;          // pictures and banners a day
const CARDS_PER_DAY = 8;     // link cards a day (the site redraws one when the profile changes)
const MAX_IN = 6 * 1024 * 1024;     // what the site sends is its own crop, well under this
const MAX_OUT = 600 * 1024;         // the re-encoded picture (a busy banner is ~150 KB)
const QUALITY = 86;
const MIN_SIDE = 32, MAX_SIDE = 12_000;
const ID = /^[0-9a-f]{32}$/;
const CACHE_SECONDS = 300;          // a picture taken down is gone everywhere within five minutes
const SCREEN_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const SCREEN_PROMPT = `You screen profile pictures for a friendly game community. Reply with exactly one word.
UNSAFE if the image shows any of: nudity or sexual content; sexualised minors; gore, graphic injury or death; weapons pointed at the viewer or violence against people or animals; hate symbols (swastika, SS runes, KKK, and the like); slurs or hateful words written in it; drugs being used; text asking for a recovery phrase, seed phrase, private key or password, or promising free crypto.
SAFE otherwise (people, pets, cartoons, art, memes, landscapes, logos).`;

// ------------------------------------------------------------------ the mode switch

let modeMemo = { v: null, at: 0 };
export async function picsMode(env) {
  if (modeMemo.v && now() - modeMemo.at < 30_000) return modeMemo.v;
  let v = 'screen';
  try { const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'pics'").first(); if (MODES.includes(r?.value)) v = r.value; } catch { /* the table not there yet: the default */ }
  modeMemo = { v, at: now() };
  return v;
}
export const resetModeCache = () => { modeMemo = { v: null, at: 0 }; };

// ------------------------------------------------------------------ bytes

/** What kind of file this is, from its first bytes (never from the name or the header the browser sent). */
export function sniff(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

/**
 * A WebP's chunks, or null if the container is malformed. Then `cleanWebp` keeps only what draws a still picture
 * (VP8X, ALPH, VP8 / VP8L), refuses an animation, clears VP8X's metadata flags, and rebuilds the RIFF.
 */
export function webpChunks(b) {
  if (sniff(b) !== 'image/webp') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(4, true) + 8 !== b.length) return null;
  const out = [];
  for (let o = 12; o < b.length;) {
    if (o + 8 > b.length) return null;
    const id = ascii(b, o, 4), n = dv.getUint32(o + 4, true);
    if (o + 8 + n > b.length) return null;
    out.push({ id, data: b.subarray(o + 8, o + 8 + n) });
    o += 8 + n + (n & 1);
  }
  return out;
}
export function cleanWebp(b) {
  const chunks = webpChunks(b);
  if (!chunks) return { error: 'not a WebP' };
  if (chunks.some((c) => c.id === 'ANIM' || c.id === 'ANMF')) return { error: 'animated' };
  const images = chunks.filter((c) => c.id === 'VP8 ' || c.id === 'VP8L');
  if (images.length !== 1) return { error: 'not one picture' };
  const keep = chunks.filter((c) => c.id === 'VP8X' || c.id === 'ALPH' || c.id === 'VP8 ' || c.id === 'VP8L');
  const parts = keep.map((c) => {
    let data = c.data;
    if (c.id === 'VP8X') { data = data.slice(); data[0] &= 0x10; }   // keep only the alpha flag: no ICC, EXIF, XMP or animation
    const head = new Uint8Array(8); head.set([...c.id].map((ch) => ch.charCodeAt(0)), 0); new DataView(head.buffer).setUint32(4, data.length, true);
    return [head, data, data.length & 1 ? new Uint8Array(1) : new Uint8Array(0)];
  }).flat();
  const body = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(12 + body);
  out.set([0x52, 0x49, 0x46, 0x46], 0); new DataView(out.buffer).setUint32(4, 4 + body, true); out.set([0x57, 0x45, 0x42, 0x50], 8);
  let o = 12; for (const p of parts) { out.set(p, o); o += p.length; }
  return { bytes: out };
}

export function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
export function fromB64(s) { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

/**
 * A JPEG with only what draws it: every APPn segment but JFIF's APP0 (EXIF, XMP, ICC, maker notes) and every comment go,
 * the rest is kept byte for byte up to the scan, and the scan runs to the end. Null if it is not a well-formed JPEG.
 */
export function cleanJpeg(b) {
  if (sniff(b) !== 'image/jpeg' || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
  const out = [b.subarray(0, 2)];
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    const m = b[o + 1];
    if (m === 0xff) { o++; continue; }                 // fill byte
    const len = (b[o + 2] << 8) | b[o + 3];
    if (len < 2 || o + 2 + len > b.length) return null;
    if (m === 0xda) { out.push(b.subarray(o)); break; } // start of scan: the picture itself, to the end
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe;
    if (!drop) out.push(b.subarray(o, o + 2 + len));
    o += 2 + len;
  }
  if (out.length < 2) return null;
  const n = out.reduce((a, p) => a + p.length, 0);
  const r = new Uint8Array(n); let k = 0; for (const p of out) { r.set(p, k); k += p.length; }
  return r;
}

/** Cloudflare's image service makes the picture we keep: decoded on their side, cropped to size, a fresh file. */
async function remake(env, input, kind) {
  const { w, h, type } = KINDS[kind];
  let info;
  try { info = await env.IMAGES.info(new Blob([input]).stream()); } catch { fail(415, 'That picture could not be read. Try a JPG or PNG.'); }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(info?.format)) fail(415, 'Send a JPG, PNG or WebP picture.');
  if (!(info.width >= MIN_SIDE && info.height >= MIN_SIDE && info.width <= MAX_SIDE && info.height <= MAX_SIDE)) fail(415, 'That picture is too small or too large.');
  let out;
  try {
    const res = await env.IMAGES.input(new Blob([input]).stream()).transform({ width: w, height: h, fit: 'cover' }).output({ format: type, quality: type === 'image/jpeg' ? 88 : QUALITY });
    out = new Uint8Array(await res.response().arrayBuffer());
  } catch (e) {
    console.error('[pics] remake', String(e?.message ?? e).slice(0, 200));
    fail(415, 'That picture could not be read. Try a JPG or PNG.');
  }
  const c = type === 'image/jpeg' ? (cleanJpeg(out) ? { bytes: cleanJpeg(out) } : { error: 'not a JPEG' }) : cleanWebp(out);
  if (c.error === 'animated') fail(415, 'Moving pictures are not supported. Pick a still one.');
  if (c.error) { console.error('[pics] output', c.error); fail(500, 'Something went wrong with that picture. Try another.'); }
  const check = await env.IMAGES.info(new Blob([c.bytes]).stream()).catch(() => null);
  if (check?.format !== type || check.width !== w || check.height !== h) { console.error('[pics] output size', JSON.stringify(check)); fail(500, 'Something went wrong with that picture. Try another.'); }
  if (c.bytes.length > MAX_OUT) fail(413, 'That picture is too detailed to keep. Try another.');
  return c.bytes;
}

/** 'safe', 'unsafe' or 'error'. PIC_SCREEN = 'pass' | 'flag' stands in for the model in tests. */
export async function screen(env, webp) {
  if (env.PIC_SCREEN === 'pass') return 'safe';
  if (env.PIC_SCREEN === 'flag') return 'unsafe';
  if (!env.AI) return 'error';
  try {
    const run = env.AI.run(SCREEN_MODEL, {
      messages: [
        { role: 'system', content: SCREEN_PROMPT },
        { role: 'user', content: [{ type: 'text', text: 'Is this profile picture SAFE or UNSAFE?' }, { type: 'image_url', image_url: { url: `data:${sniff(webp) ?? 'image/webp'};base64,${toB64(webp)}` } }] },
      ],
      max_tokens: 8, temperature: 0,
    });
    const r = await Promise.race([run, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 12_000))]);
    // the answer must be exactly one of the two words: "NOT SAFE", "UN-SAFE", a refusal that mentions SAFE, or text in
    // the picture telling the model what to say all come out as neither, and neither means held for an admin
    const said = String(r?.response ?? '').toUpperCase().replace(/[^A-Z]/g, '');
    return said === 'UNSAFE' ? 'unsafe' : said === 'SAFE' ? 'safe' : 'error';
  } catch (e) { console.error('[pics] screen', String(e?.message ?? e).slice(0, 160)); return 'error'; }
}

// ------------------------------------------------------------------ uploading

/** bytes of pictures emotown-media may hold before new uploads are refused (stored as base64: about 400 MB of D1) */
const MEDIA_BUDGET = 300 * 1024 * 1024;

/** POST /api/social/pic?kind=avatar|banner|card, the body the picture itself (image/jpeg, image/png or image/webp). */
export async function upload(request, env, who, url) {
  const kind = url.searchParams.get('kind');
  if (!Object.hasOwn(KINDS, kind)) fail(400, 'A picture for what?');
  if (!env.MEDIA || !env.IMAGES) fail(503, 'Pictures are resting right now.');
  const mode = await picsMode(env);
  if (mode === 'off') fail(403, 'Picture uploads are paused right now.');
  if (who.muteUntil > now()) fail(403, 'You are muted for now.');
  if (!who.admin) {
    const g = await gateFor(env, who.address);
    if (!g.ok) fail(403, GATE_MESSAGE.replace('To talk in Emotown', 'To upload a picture'), { gate: true });
  }
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) fail(415, 'Send a JPG, PNG or WebP picture.');
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (!(declared > 0)) fail(411, 'Send the picture with its size.');
  if (declared > MAX_IN) fail(413, 'That picture is too big.');
  const input = new Uint8Array(await request.arrayBuffer());
  if (input.length > MAX_IN) fail(413, 'That picture is too big.');
  if (!input.length || sniff(input) !== type) fail(415, 'Send a JPG, PNG or WebP picture.');
  // the whole store has a ceiling (the free D1 holds 500 MB; base64 is a third bigger than the bytes)
  const used = await env.MEDIA.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM pics').first();
  if (Number(used?.n ?? 0) > MEDIA_BUDGET) { console.error('[pics] storage budget reached', used?.n); fail(503, 'Picture uploads are full right now. Try again later.'); }
  // counted BEFORE the work, in one statement: a burst of uploads cannot all slip under the daily cap, and an attempt
  // that fails later still counts (security review, 2026-09-27)
  if (!who.admin) {
    const grp = kind === 'card' ? 'card' : 'pic';
    const cap = kind === 'card' ? CARDS_PER_DAY : PER_DAY;
    const t0 = now();
    const r = await env.DB.prepare('INSERT INTO pic_tries (address, grp, at) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM pic_tries WHERE address = ? AND grp = ? AND at > ?) < ?')
      .bind(who.address, grp, t0, who.address, grp, t0 - 86_400_000, cap).run();
    if (!r.meta?.changes) fail(429, kind === 'card' ? 'Your link card was redrawn a lot today. It will update tomorrow.' : `That is ${PER_DAY} pictures today. Try again tomorrow.`);
  }

  const made = await remake(env, input, kind);
  const verdict = await screen(env, made);
  const status = mode === 'screen' && verdict === 'safe' ? 'live' : 'held';
  const id = randomHex(16);
  const t = now();
  await env.MEDIA.prepare('INSERT INTO pics (id, address, kind, data, size, live, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, who.address, kind, toB64(made), made.length, status === 'live' ? 1 : 0, t).run();
  await env.DB.prepare('INSERT INTO uploads (id, address, kind, status, screen, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, who.address, kind, status, verdict, made.length, t).run();
  // a newer picture of the same kind takes over: a live one replaces the live one, a held one the one still waiting
  await supersede(env, who.address, kind, id, status);
  if (status === 'live') await useIt(env, who.address, kind, id);
  return json({ id, kind, status, flagged: verdict === 'unsafe' || undefined });
}

/** Mark older uploads of this kind 'replaced' (the live one if `status` is live, else the held one) and drop their bytes. */
async function supersede(env, address, kind, keep, status) {
  const { results } = await env.DB.prepare('SELECT id FROM uploads WHERE address = ? AND kind = ? AND status = ? AND id != ?').bind(address, kind, status, keep).all();
  if (status === 'live') {
    // an approved picture also ends any older one still waiting
    const held = await env.DB.prepare("SELECT id FROM uploads WHERE address = ? AND kind = ? AND status = 'held' AND id != ? AND created_at < (SELECT created_at FROM uploads WHERE id = ?)").bind(address, kind, keep, keep).all();
    results.push(...held.results);
  }
  if (!results.length) return;
  const ids = results.map((r) => r.id);
  await env.DB.prepare(`UPDATE uploads SET status = 'replaced', decided_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(now(), ...ids).run();
  await env.MEDIA.prepare(`DELETE FROM pics WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  for (const id of ids) await purgeCache(env, id);
}

/**
 * Put a live picture on their profile. A picture or banner counts as a change to the profile (`updated_at`: the site
 * redraws the link card when the profile is newer than it); the card itself does not, or it would chase itself.
 */
async function useIt(env, address, kind, id) {
  const col = KINDS[kind].col;
  const touch = kind === 'card' ? '' : ', updated_at = excluded.updated_at';
  await env.DB.prepare(`INSERT INTO profiles (address, bio, banner, updated_at, ${col}) VALUES (?, '', 'hall', ?, ?) ON CONFLICT(address) DO UPDATE SET ${col} = excluded.${col}${touch}`).bind(address, now(), id).run();
}

/** Take a picture down (its owner, or an admin): the bytes go, and the profile falls back to the pet / the banner. */
async function takeDown(env, row, status, by) {
  const t = now();
  await env.MEDIA.prepare('DELETE FROM pics WHERE id = ?').bind(row.id).run();
  await env.DB.batch([
    env.DB.prepare('UPDATE uploads SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?').bind(status, t, by, row.id),
    env.DB.prepare(`UPDATE profiles SET ${KINDS[row.kind].col} = NULL, updated_at = ? WHERE address = ? AND ${KINDS[row.kind].col} = ?`).bind(t, row.address, row.id),
  ]);
  await purgeCache(env, row.id);
}

/** POST /api/social/pic/remove { kind } : back to the pet's head, or to Emotown's banner. Ends a waiting one too. */
export async function removeOwn(env, who, b) {
  if (!Object.hasOwn(KINDS, String(b.kind))) fail(400, 'Which picture?');
  const { results } = await env.DB.prepare("SELECT id, address, kind FROM uploads WHERE address = ? AND kind = ? AND status IN ('live', 'held')").bind(who.address, b.kind).all();
  for (const r of results) await takeDown(env, r, 'removed', who.address);
  return json({ ok: true, removed: results.length });
}

/** GET /api/social/pic/view/<id> : a picture that is not public yet, for its owner or an admin only. */
export async function viewPrivate(env, who, id) {
  if (!ID.test(id ?? '')) fail(404, 'Not found.');
  const u = await env.DB.prepare('SELECT address, status, kind FROM uploads WHERE id = ?').bind(id).first();
  if (!u || !['held', 'live'].includes(u.status) || (u.address !== who.address && !who.admin)) fail(404, 'Not found.');
  const row = await env.MEDIA.prepare('SELECT data FROM pics WHERE id = ?').bind(id).first();
  if (!row) fail(404, 'Not found.');
  const k = KINDS[u.kind] ?? KINDS.avatar;
  return new Response(fromB64(row.data), { headers: { ...PIC_HEADERS, 'content-type': k.type, 'cache-control': 'private, no-store', 'content-disposition': `attachment; filename="picture.${k.ext}"` } });
}

/** For the owner's own profile: the pictures of theirs still waiting, and their link card (live or waiting) and when it was made. */
export async function heldOf(env, address) {
  const { results } = await env.DB.prepare("SELECT id, kind, status, created_at AS at FROM uploads WHERE address = ? AND status IN ('held', 'live') ORDER BY created_at DESC").bind(address).all();
  const held = (k) => results.find((r) => r.kind === k && r.status === 'held')?.id ?? null;
  const card = results.find((r) => r.kind === 'card');
  return { avatar: held('avatar'), banner: held('banner'), card: card ? { id: card.id, status: card.status, at: card.at } : null };
}

// ------------------------------------------------------------------ admin

/** Admin actions on pictures, from moderation.js: 'pics', 'pic-approve', 'pic-refuse', 'pics-mode'. */
export async function adminPics(env, who, action, b, url, log) {
  switch (action) {
    case 'pics': {
      // GET ?status=held|live|refused : newest first, 60 at a time
      const status = ['held', 'live', 'refused'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'held';
      const { results } = await env.DB.prepare(`SELECT u.id, u.kind, u.status, u.screen, u.created_at AS at, u.address, ${CARD_SQL()} FROM uploads u ${CARD_JOIN('u.address')}
        WHERE u.status = ? ORDER BY u.created_at DESC LIMIT 60`).bind(status).all();
      const counts = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM uploads WHERE status = 'held') AS held").first();
      return json({ mode: await picsMode(env), held: counts.held, items: results.map((r) => ({ id: r.id, kind: r.kind, status: r.status, screen: r.screen, at: r.at, who: card(r) })) });
    }
    case 'pic-approve': {
      const row = await env.DB.prepare("SELECT id, address, kind, status FROM uploads WHERE id = ?").bind(String(b.id ?? '')).first();
      if (!row || row.status !== 'held') fail(404, 'That picture is not waiting any more.');
      const t = now();
      await env.MEDIA.prepare('UPDATE pics SET live = 1 WHERE id = ?').bind(row.id).run();
      await env.DB.prepare("UPDATE uploads SET status = 'live', decided_at = ?, decided_by = ? WHERE id = ?").bind(t, who.address, row.id).run();
      await supersede(env, row.address, row.kind, row.id, 'live');
      await useIt(env, row.address, row.kind, row.id);
      await notify(env, row.address, 'pic', who.address, `${row.kind}:live`);
      await log(env, who, 'pic-approve', row.address, { id: row.id, kind: row.kind });
      return json({ ok: true });
    }
    case 'pic-refuse': {
      const row = await env.DB.prepare('SELECT id, address, kind, status FROM uploads WHERE id = ?').bind(String(b.id ?? '')).first();
      if (!row || !['held', 'live'].includes(row.status)) fail(404, 'That picture is already gone.');
      await takeDown(env, row, 'refused', who.address);
      await notify(env, row.address, 'pic', who.address, `${row.kind}:refused`);
      await log(env, who, 'pic-refuse', row.address, { id: row.id, kind: row.kind, was: row.status });
      return json({ ok: true });
    }
    case 'pics-mode': {
      const mode = String(b.mode ?? '');
      if (!MODES.includes(mode)) fail(400, 'Pick a mode.');
      await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('pics', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(mode, now()).run();
      resetModeCache();
      await log(env, who, 'pics-mode', null, { mode });
      return json({ ok: true, mode });
    }
  }
  return null;
}

/** Everything of theirs comes down (a profile reset, or a ban with a purge). */
export async function takeDownAll(env, address, by) {
  const { results } = await env.DB.prepare("SELECT id, address, kind FROM uploads WHERE address = ? AND status IN ('live', 'held')").bind(address).all();
  for (const r of results) await takeDown(env, r, 'refused', by);
  return results.length;
}

export async function pendingPics(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE status = 'held'").first().catch(() => null);
  return r?.n ?? 0;
}

// ------------------------------------------------------------------ serving (the media host)

const PIC_HEADERS = {
  'content-type': 'image/webp',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'same-site',
  'referrer-policy': 'no-referrer',
};
export const mediaUrl = (env, id, kind = 'avatar') => `https://${env.MEDIA_HOST}/${KINDS[kind].path}/${id}.${KINDS[kind].ext}`;
async function purgeCache(env, id) { try { if (env.MEDIA_HOST) for (const k of ['avatar', 'card']) await caches.default.delete(mediaUrl(env, id, k)); } catch { /* not cached here */ } }

/**
 * Every request to MEDIA_HOST lands here and only here: GET /p/<id>.webp of a live picture or banner, /c/<id>.jpg of a
 * live link card, else 404. A card may be shown anywhere (a link preview is its whole point): CORP cross-origin.
 */
export async function media(request, env, ctx, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const m = /^\/(p|c)\/([0-9a-f]{32})\.(webp|jpg)$/.exec(url.pathname);
  const nope = (s = 60) => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff', 'cache-control': `public, max-age=${s}` } });
  if (!m || !env.MEDIA || (m[1] === 'p') !== (m[3] === 'webp')) return nope(3600);
  if (await picsMode(env) === 'off') return nope();
  const kind = m[1] === 'c' ? 'card' : 'avatar';
  const key = new Request(mediaUrl(env, m[2], kind));
  let cache = null;
  try { cache = caches.default; const hit = await cache.match(key); if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit; } catch { cache = null; }
  const row = await env.MEDIA.prepare('SELECT data, kind FROM pics WHERE id = ? AND live = 1').bind(m[2]).first();
  if (!row || (row.kind === 'card') !== (kind === 'card')) return nope();
  const res = new Response(fromB64(row.data), { headers: { ...PIC_HEADERS, ...(kind === 'card' ? { 'content-type': 'image/jpeg', 'cross-origin-resource-policy': 'cross-origin' } : {}), 'cache-control': `public, max-age=${CACHE_SECONDS}` } });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return request.method === 'HEAD' ? new Response(null, res) : res;
}
