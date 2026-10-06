/**
 * The rules for what people may write, in one file that both sides read: the Worker enforces them and the site shows
 * them (the same limits in a counter, the same checks before a save, the same way of splitting a message into text,
 * links and mentions). The site imports this file directly (apps/web/src/social/rules.ts re-exports it), so the two
 * can never disagree about what a valid name is.
 *
 * Everything anyone writes is PLAIN TEXT, always. This origin derives passkey keys, so user text is never parsed as
 * HTML or markdown anywhere: the site renders it as React text nodes and nothing else. What this file adds on top is
 * the part a renderer cannot do: taking out the characters that exist to deceive a reader (right-to-left overrides,
 * zero-width joiners inside a name, a thousand stacked accents).
 */

/**
 * The one sentence in Emotown's Sign-In with Ethereum message. The Worker writes it into every message; the passkey
 * wallet (apps/web/src/passkey/siwe.ts) refuses to sign any message that does not carry exactly this.
 */
export const SIWE_STATEMENT = 'Sign in to Emotown with this wallet. This is not a transaction: it is free and it cannot move anything.';

export const LIMITS = {
  nameMin: 3,
  nameMax: 20,
  bio: 280,
  bioLines: 6,
  chat: 280,
  dm: 1000,
  note: 500,
};

/** The places a profile can link to. Anything else is not a field. */
export const PLATFORMS = ['x', 'telegram', 'discord', 'farcaster', 'github', 'website'];

/** Profile banners: Emotown's own places, and the park in each season (pictures under /social/banners/). */
export const BANNERS = ['hall', 'diner', 'baths', 'park', 'shop', 'inn', 'furnace', 'haunted', 'backrooms', 'graveyard', 'spring', 'summer', 'autumn', 'winter'];

/** Names nobody may take: the site's own words, roles people might trust, and the operator's names. */
const RESERVED = new Set([
  'admin', 'administrator', 'admins', 'mod', 'mods', 'moderator', 'moderators', 'staff', 'team', 'support', 'help',
  'official', 'system', 'root', 'owner', 'operator', 'mayor', 'sheriff', 'security', 'verified', 'bot', 'null',
  'undefined', 'anonymous', 'anon', 'everyone', 'here', 'me', 'you', 'api', 'u', 'www', 'settings', 'inbox',
  'emotown', 'emogotchi', 'emonad', 'emonadcoin', 'emo', 'inversegotchi', 'sahuragotchi', 'inversebrah', 'sahur', 'thiccums', 'thiccumsgotchi', 'r3tardgotchi', 'emonadgotchi',
  'tung', 'monad', 'lordemo', 'lordemonad', 'lord_emo', 'lord_emonad', 'lordemonadcoin', 'categorylabs', 'mera',
]);

/** the words that make a name look official wherever they stand in it */
const STAFF_WORDS = new Set(['admin', 'administrator', 'admins', 'mod', 'mods', 'moderator', 'moderators', 'staff', 'support', 'official', 'security', 'verified', 'operator', 'emotown', 'emogotchi', 'emonad', 'lordemo', 'lordemonad']);

// ------------------------------------------------------------------ cleaning

// Characters that change how text around them is read without being visible themselves: bidi embeddings, overrides and
// isolates (U+202A-U+202E, U+2066-U+2069, U+061C and the marks U+200E/U+200F), zero-width space and non-joiner, word
// joiner and the invisible operators, the soft hyphen, the BOM, the Mongolian vowel separator and the Hangul fillers.
// The zero-width JOINER (U+200D) stays in running text because emoji sequences need it; names are ASCII anyway.
const INVISIBLE = /[\u00AD\u061C\u115F\u1160\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0]/g;
// C0 controls except tab and newline, DEL, and the C1 block
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// more than two combining marks on one letter is only ever "zalgo" text, written to smear over what is under it
const STACKED = /(\p{M}{2})\p{M}+/gu;

/**
 * Clean a piece of running text. `multiline` keeps up to `maxLines` lines (a bio); otherwise every line break becomes
 * a space (a chat message is one line).
 */
export function cleanText(raw, { multiline = false, maxLines = LIMITS.bioLines } = {}) {
  let s = String(raw ?? '').normalize('NFC');
  s = s.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n').replace(/\t/g, ' ');
  s = s.replace(CONTROL, '').replace(INVISIBLE, '').replace(STACKED, '$1');
  if (multiline) {
    const lines = s.split('\n').map((l) => l.replace(/ {3,}/g, '  ').trimEnd());
    // no more than one blank line in a row, and no more than maxLines lines in all (the rest joins the last line)
    const kept = [];
    for (const l of lines) { if (l === '' && kept[kept.length - 1] === '') continue; kept.push(l); }
    while (kept.length && kept[0] === '') kept.shift();
    while (kept.length && kept[kept.length - 1] === '') kept.pop();
    s = kept.length > maxLines ? [...kept.slice(0, maxLines - 1), kept.slice(maxLines - 1).join(' ')].join('\n') : kept.join('\n');
  } else {
    s = s.replace(/\n+/g, ' ').replace(/ {3,}/g, '  ');
  }
  return s.trim();
}

/** Length as a person counts it: in characters, not UTF-16 units (an emoji is one, not two). */
export const charCount = (s) => [...String(s ?? '')].length;
export const clip = (s, n) => [...String(s ?? '')].slice(0, n).join('');

// ------------------------------------------------------------------ names

/**
 * A display name: 3-20 letters, digits and underscores (ASCII only, so no two names can look the same while being
 * different characters), not a reserved word, and not something that reads as an address. It is also the vanity URL.
 */
export function checkName(raw) {
  const name = String(raw ?? '').trim().replace(/^@/, '');
  if (name.length < LIMITS.nameMin) return { ok: false, error: `A name needs at least ${LIMITS.nameMin} characters.` };
  if (name.length > LIMITS.nameMax) return { ok: false, error: `A name can be at most ${LIMITS.nameMax} characters.` };
  if (!/^[A-Za-z0-9_]+$/.test(name)) return { ok: false, error: 'Use letters, numbers and underscores only.' };
  if (/^0x/i.test(name)) return { ok: false, error: 'A name cannot start with 0x (it would look like an address).' };
  if (/^_+$/.test(name)) return { ok: false, error: 'A name needs a letter or a number in it.' };
  if (RESERVED.has(name.toLowerCase())) return { ok: false, error: 'That name is reserved.' };
  // look-alikes: the name without its underscores and digits ("lordemo_", "emotown2"), or any part of it between
  // underscores and digits that is one of the words staff would use ("emotown_mod", "official_admin")
  const bare = name.toLowerCase().replace(/[_0-9]+/g, '');
  if (RESERVED.has(bare) || name.toLowerCase().split(/[_0-9]+/).some((part) => STAFF_WORDS.has(part))) return { ok: false, error: 'That name is reserved.' };
  return { ok: true, name, key: name.toLowerCase() };
}

// ------------------------------------------------------------------ socials

/** The handle out of whatever was pasted: "@foo", "foo", or a link to the profile on that platform. */
function handleFrom(raw, hosts) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const m = /^(?:https?:\/\/)?(?:www\.|mobile\.)?([a-z0-9.-]+)\/(?:#!\/)?@?([^/?#\s]+)/i.exec(s);
  if (m) { if (!hosts.includes(m[1].toLowerCase())) return null; s = m[2]; }
  return s.replace(/^@/, '');
}

/**
 * Validate and normalize one social link. Returns { ok, handle } (the empty string clears the field) or
 * { ok: false, error }.
 */
export function normalizeSocial(platform, raw) {
  const empty = String(raw ?? '').trim() === '';
  if (empty) return { ok: true, handle: '' };
  switch (platform) {
    case 'x': {
      const h = handleFrom(raw, ['x.com', 'twitter.com']);
      return h && /^[A-Za-z0-9_]{1,15}$/.test(h) ? { ok: true, handle: h } : { ok: false, error: 'An X handle is up to 15 letters, numbers or underscores.' };
    }
    case 'telegram': {
      const h = handleFrom(raw, ['t.me', 'telegram.me', 'telegram.dog']);
      return h && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(h) ? { ok: true, handle: h } : { ok: false, error: 'A Telegram username is 5 to 32 letters, numbers or underscores.' };
    }
    case 'discord': {
      // a username (shown, with a copy button: Discord has no public link for one) or a numeric user id (linked)
      const h = String(raw).trim().replace(/^@/, '').toLowerCase();
      if (/^\d{17,20}$/.test(h)) return { ok: true, handle: h };
      return /^(?!.*\.\.)[a-z0-9_.]{2,32}$/.test(h) ? { ok: true, handle: h } : { ok: false, error: 'A Discord username is 2 to 32 lowercase letters, numbers, dots or underscores.' };
    }
    case 'farcaster': {
      const h = handleFrom(raw, ['warpcast.com', 'farcaster.xyz']);
      const l = h ? h.toLowerCase() : h;
      return l && /^[a-z0-9][a-z0-9-]{0,19}(\.eth)?$/.test(l) ? { ok: true, handle: l } : { ok: false, error: 'That does not look like a Farcaster username.' };
    }
    case 'github': {
      const h = handleFrom(raw, ['github.com']);
      return h && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(h) ? { ok: true, handle: h } : { ok: false, error: 'That does not look like a GitHub username.' };
    }
    case 'website': {
      const href = normalizeUrl(raw);
      return href ? { ok: true, handle: href } : { ok: false, error: 'Use a full https:// address of a public website.' };
    }
  }
  return { ok: false, error: 'Unknown platform.' };
}

/**
 * A web address a profile may show: https only, a real hostname with a dot, no user:password@, no IP address, no
 * port, nothing past the path (the query and fragment are dropped: they are where tracking and tricks hide). An
 * internationalised hostname comes back in punycode, which is what makes a look-alike domain look like one.
 */
export function normalizeUrl(raw) {
  let s = String(raw ?? '').trim();
  if (!s || s.length > 200) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || host === 'localhost' || host.endsWith('.local')) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  const path = u.pathname === '/' ? '' : u.pathname;
  const out = `https://${host}${path}`;
  return out.length <= 120 ? out : null;
}

/** Where a social handle points, and how to label it. `href` is null for a Discord username (it has no public page). */
export function socialLink(platform, handle) {
  switch (platform) {
    case 'x': return { href: `https://x.com/${handle}`, label: `@${handle}` };
    case 'telegram': return { href: `https://t.me/${handle}`, label: `@${handle}` };
    case 'discord': return /^\d+$/.test(handle) ? { href: `https://discord.com/users/${handle}`, label: 'Discord profile' } : { href: null, label: handle };
    case 'farcaster': return { href: `https://farcaster.xyz/${handle}`, label: `@${handle}` };
    case 'github': return { href: `https://github.com/${handle}`, label: handle };
    case 'website': return { href: handle, label: handle.replace(/^https:\/\//, '') };
  }
  return { href: null, label: handle };
}

// ------------------------------------------------------------------ mentions and links

const MENTION = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;

/** The @names in a message, lowercased and de-duplicated, at most five (a sixth mention pings nobody). */
export function findMentions(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(MENTION)) {
    const k = m[2].toLowerCase();
    if (!out.includes(k)) out.push(k);
    if (out.length >= 5) break;
  }
  return out;
}

// Something a person might click: a scheme, a www., or a bare domain on a common TLD (a scam link needs no https://).
const TLDS = 'com|net|org|xyz|io|app|gg|lol|fun|me|co|ai|dev|link|site|live|finance|money|pro|club|top|click|info|biz|us|uk|ru|cn|to|tv|so|sh|cc|ws|ly|vip|bet|win|claim|claims|gift|network|exchange|wallet|eth|online|store|shop|tech|space|website|page|art|nft|dao|zone|land|world|today|monster|rest|icu|cfd|sbs|buzz|cam|quest|guru|global|digital|social|chat|cash|games|game|market|trade|capital|fi|id|in|de|fr|jp|kr|br|ca|au|eu|asia|mobi|name|one|run|lat|fyi|wtf';
const LINK = new RegExp(`(?:\\b(?:https?|ftp|javascript|data|file|ipfs|ws|wss):[^\\s<>"'\`]+|\\bwww\\.[^\\s<>"'\`]+|\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLDS})\\b(?::\\d+)?(?:/[^\\s<>"'\`]*)?)`, 'gi');

/**
 * A message as pieces to render: plain text, links (shown inert: a tap asks first, never opens straight away), and
 * @mentions of people who exist (`known` maps a lowercased name to their address; an unknown @name stays text).
 * The renderer turns each piece into React text; nothing here is ever HTML.
 */
export function segments(text, known = {}) {
  const s = String(text ?? '');
  const marks = [];
  for (const m of s.matchAll(LINK)) {
    let v = m[0];
    // trailing punctuation belongs to the sentence, not the link
    while (/[.,!?;:'")\]}>]$/.test(v)) v = v.slice(0, -1);
    if (v.length < 4) continue;
    marks.push({ start: m.index, end: m.index + v.length, kind: 'link', v });
  }
  for (const m of s.matchAll(MENTION)) {
    const start = m.index + m[1].length; const end = start + 1 + m[2].length;
    const a = known[m[2].toLowerCase()];
    if (!a || marks.some((k) => start < k.end && end > k.start)) continue;
    marks.push({ start, end, kind: 'mention', v: s.slice(start, end), address: a });
  }
  marks.sort((a, b) => a.start - b.start);
  const out = []; let at = 0;
  for (const k of marks) {
    if (k.start < at) continue;
    if (k.start > at) out.push({ kind: 'text', v: s.slice(at, k.start) });
    out.push(k.kind === 'link' ? { kind: 'link', v: k.v, href: linkHref(k.v) } : { kind: 'mention', v: k.v, address: k.address });
    at = k.end;
  }
  if (at < s.length) out.push({ kind: 'text', v: s.slice(at) });
  return out;
}

/** The address a link would open, or null if it is not a web address at all (javascript:, data:, file: and friends). */
export function linkHref(v) {
  const s = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

/** A recovery phrase or a private key is never something anyone legitimate asks for. The site flags these messages. */
export const looksLikePhish = (text) => /\b(seed|recovery|secret|mnemonic)\s*(phrase|words?)\b|\bprivate\s*keys?\b|\b(12|24)\s*words\b/i.test(String(text ?? ''));

// ------------------------------------------------------------------ addresses

export const isAddr = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
export const lower = (a) => String(a).toLowerCase();

// ------------------------------------------------------------------ GIFs, replies

/**
 * A GIF in a message comes from KLIPY (klipy.com; the search runs through the Worker, worker/social/gifs.js, so the key
 * stays there and one search is shared by the whole site). A message stores only what the picture needs, and every URL
 * in it must be one of KLIPY's own media files: https, host static.klipy.com, no credentials, port, query or fragment, a
 * plain path. So a GIF can only ever be an image off KLIPY's CDN, never an address someone chose. The site checks the
 * same rule again before it draws one: a picture is decoded in the page that holds passkey keys, and these are bytes
 * KLIPY encoded, not bytes a person uploaded (their own pictures are remade by Cloudflare, worker/social/pics.js).
 */
export const GIF_HOST = 'static.klipy.com';
export function gifUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== GIF_HOST || u.port || u.username || u.password || u.search || u.hash) return null;
  if (!/^\/[A-Za-z0-9._~/-]+$/.test(u.pathname) || u.pathname.includes('..')) return null;
  return u.href;
}
/** A GIF as a message carries it, { id, url, still, w, h }, or null when anything about it is off. */
export function cleanGif(g) {
  if (!g || typeof g !== 'object') return null;
  const id = String(g.id ?? '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const url = gifUrl(g.url);
  if (!url) return null;
  const still = g.still ? gifUrl(g.still) : null;
  const dim = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(2000, n) : 200; };
  return { id, url, still, w: dim(g.w), h: dim(g.h) };
}
/** How much of a message a reply quotes (the quote is re-read from the original, so a deleted one quotes nothing). */
export const REPLY_SNIPPET = 120;
/** One reply quote: the original's id, who wrote it, the start of what they wrote, and whether it carried a GIF. */
export const replyQuote = (id, address, name, body, gif) => ({ id, a: address, n: name ?? null, t: clip(body ?? '', REPLY_SNIPPET), g: gif ? 1 : 0 });
/** A message that is only emoji (and at most a few of them) is shown bigger. */
export const emojiOnly = (s) => { const t = String(s ?? '').replace(/\s+/g, ''); return !!t && /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D)+$/u.test(t) && !/^[\d#*]+$/.test(t) && charCount(t) <= 24; };


// ------------------------------------------------------------------ reactions (2026-09-28)

/**
 * A reaction is ONE emoji (one grapheme made only of emoji code points, with at least one real pictograph, flag or
 * keycap in it), like X: the quick row below or any emoji from the picker. Plain letters and digits are not emoji here,
 * and two emoji are two reactions, not one. The site and the Worker both check with this.
 */
const EMOJI_CHARS = /^[\p{Extended_Pictographic}\p{Emoji_Component}\u20E3\uFE0F\u200D]+$/u;
const EMOJI_CORE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u;
const graphemes = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
export function cleanEmoji(raw) {
  if (typeof raw !== 'string') return null;
  const e = raw.trim();
  if (!e || e.length > 32 || !EMOJI_CHARS.test(e) || !EMOJI_CORE.test(e)) return null;
  if (graphemes && [...graphemes.segment(e)].length !== 1) return null;
  return e;
}
/** The quick row, like X's: red heart, tears of joy, open mouth, crying, fire, thumbs up, thumbs down. */
export const REACTION_PRESETS = [[0x2764, 0xFE0F], [0x1F602], [0x1F62E], [0x1F622], [0x1F525], [0x1F44D], [0x1F44E]].map((cps) => String.fromCodePoint(...cps));
/** How many different emoji one message may carry (one each per person, so this only stops a crowd running wild). */
export const MAX_REACTION_KINDS = 20;


// ------------------------------------------------------------------ roles (2026-09-28)

/**
 * Roles are tags an admin makes and hands out (operator: "they'll mean nothing tbh but it'll put a tag on people and give
 * them the role and i can pick emojis that go by their names"). A role is a name, ONE emoji (checked like a reaction)
 * that shows by its holders' names, and a colour for its tag. They carry no power: nothing reads a role to decide
 * anything. `shown` is how many emoji go by a name (the first roles in the admin's order); a profile shows every tag.
 */
export const ROLE_LIMITS = { name: 24, roles: 40, perPerson: 5, shown: 3, holders: 3000 };
/** The tag colours (the site maps each to its shades, social.css `.so-role.c-<colour>`). */
export const ROLE_COLORS = ['pink', 'gold', 'mint', 'sky', 'violet', 'coral', 'lime', 'silver'];
export function checkRoleName(raw) {
  const name = cleanText(typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Give the role a name.' };
  if (charCount(name) > ROLE_LIMITS.name) return { ok: false, error: `A role's name can be at most ${ROLE_LIMITS.name} characters.` };
  return { ok: true, name, key: name.toLowerCase() };
}
