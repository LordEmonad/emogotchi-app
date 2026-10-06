/**
 * Plumbing shared by every social route: JSON in and out, the session cookie, where a request came from, and errors
 * that turn into a status and a sentence a person can read.
 */

/** The session cookie. `__Host-` means the browser only accepts it Secure, from this exact host, on path `/`. */
export const COOKIE = '__Host-emotown';
export const SESSION_DAYS = 30;

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
/** Stop here with a status and a sentence. */
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });

export const now = () => Date.now();

/** The site's own origin: https://emogotchi.emonad.lol, or the dev server's in a local run. */
export const siteOrigin = (env) => env.SITE_ORIGIN || 'https://emogotchi.emonad.lol';

/**
 * A request that changes something must come from the site itself. SameSite=Strict already keeps the cookie off any
 * cross-site request and the JSON content type forces a preflight nobody answers; this is the third lock, and the one
 * that also covers websockets (a browser sends Origin on a websocket handshake, and SameSite is the only other guard).
 */
export function checkOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (origin !== siteOrigin(env)) fail(403, 'This request did not come from Emotown.');
}

/** The body of a POST: JSON, at most 16 KB. */
export async function readJson(request, max = 16_384) {
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') fail(415, 'Send JSON.');
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > max) fail(413, 'That is too long.');
  const text = await request.text();
  if (text.length > max) fail(413, 'That is too long.');
  try { const v = JSON.parse(text); if (v === null || typeof v !== 'object' || Array.isArray(v)) throw 0; return v; } catch { fail(400, 'Send JSON.'); }
}

export function readCookie(request, name = COOKIE) {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
export const setCookie = (token) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/**
 * An IPv6 address written out in full (eight groups of four), or null. "2001:db8::1:2:3:4" compresses a run of zero
 * groups, so splitting it on ':' and taking four pieces picked up part of the host half: one /64 became 65,536
 * different keys (security review, 2026-09-27). An IPv4-mapped tail (::ffff:1.2.3.4) is turned into its two groups.
 */
export function expandV6(ip) {
  let s = String(ip ?? '').trim().toLowerCase().split('%')[0];
  if (!s.includes(':')) return null;
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (v4) { const b = v4.slice(1).map(Number); if (b.some((x) => x > 255)) return null; s = s.slice(0, v4.index) + ((b[0] << 8) | b[1]).toString(16) + ':' + ((b[2] << 8) | b[3]).toString(16); }
  const halves = s.split('::'); if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : []; const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0'));
}
/** One rate-limit key per caller: an IPv6 network of `bits` (a /64 is one household, not four billion), else the IPv4. */
export function ipKeyOf(ip, bits = 64) {
  const g = expandV6(ip);
  // an IPv4 address written the IPv6 way (::ffff:a.b.c.d) is that IPv4 address
  if (g && g.slice(0, 5).every((x) => x === '0000') && g[5] === 'ffff') return [g[6].slice(0, 2), g[6].slice(2), g[7].slice(0, 2), g[7].slice(2)].map((h) => parseInt(h, 16)).join('.');
  if (g) return g.slice(0, Math.max(1, Math.min(8, Math.round(bits / 16)))).join(':') + `::/${bits}`;
  return ip || 'local';
}
export function ipKey(request, bits = 64) { return ipKeyOf(request.headers.get('cf-connecting-ip') ?? '', bits); }

/** A Workers rate-limit binding, or nothing when it is not bound (tests, local dev). */
export async function limited(binding, key) {
  if (!binding || !key) return false;
  try { const { success } = await binding.limit({ key }); return !success; } catch { return false; }
}

/** 32 random bytes as hex (a session token), and its SHA-256 (what is stored). */
export function randomHex(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** An alphanumeric nonce for Sign-In with Ethereum (EIP-4361 wants 8+ alphanumerics; this is 24, about 143 bits). */
export function siweNonce() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  while (out.length < 24) {
    // rejection sampling: 248 is the largest multiple of 62 under 256, so every character is equally likely
    for (const x of crypto.getRandomValues(new Uint8Array(32))) if (x < 248 && out.length < 24) out += abc[x % 62];
  }
  return out;
}
