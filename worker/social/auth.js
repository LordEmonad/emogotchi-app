/**
 * Sign-In with Ethereum (EIP-4361), and the session it opens.
 *
 * The Worker WRITES the message and the browser only signs it: GET /auth/nonce hands back the whole EIP-4361 text for
 * one address (domain emogotchi.emonad.lol, chain 143, a fresh nonce, ten minutes to live) and keeps a copy; POST
 * /auth/verify takes the signature, consumes the nonce (once, atomically), checks the text is exactly the one issued,
 * and verifies the signature for that address with viem. Nothing about the message is parsed out of what the browser
 * sends, so there is no parser for anyone to confuse.
 *
 * Signatures: an ordinary wallet and an EIP-7702 delegated EOA are checked by recovering the signer (ecrecover); a
 * smart-contract wallet by ERC-1271 `isValidSignature`, and a not-yet-deployed one by ERC-6492, through viem's
 * universal validator.
 *
 * The session is a random 256-bit token in an HttpOnly, Secure, SameSite=Strict cookie. D1 holds only its SHA-256.
 */
import { createSiweMessage } from 'viem/siwe';
import { getAddress, isAddress, recoverMessageAddress } from 'viem';
import { publicClient } from './chain.js';
import { SESSION_DAYS, checkOrigin, clearCookie, fail, ipKey, json, limited, now, randomHex, readCookie, readJson, setCookie, sha256Hex, siteOrigin, siweNonce } from './http.js';
import { SIWE_STATEMENT } from './rules.js';

export const STATEMENT = SIWE_STATEMENT;
const NONCE_TTL = 10 * 60_000;
const MAX_SESSIONS = 10;
/** Sessions are refreshed (seen_at) at most this often, so a busy reader does not write to D1 on every request. */
const TOUCH_EVERY = 60 * 60_000;
export const PERMANENT = 32503680000000;   // the year 3000: a ban with no end

export const siweDomain = (env) => env.SIWE_DOMAIN || 'emogotchi.emonad.lol';
export const admins = (env) => String(env.ADMINS ?? '').toLowerCase().split(/[\s,]+/).filter((a) => /^0x[0-9a-f]{40}$/.test(a));
export const isAdmin = (env, address) => !!address && admins(env).includes(address.toLowerCase());

/** GET /api/social/auth/nonce?address=0x… : the message to sign. */
export async function issueNonce(request, env, url) {
  const raw = url.searchParams.get('address') ?? '';
  if (!isAddress(raw, { strict: false })) fail(400, 'That is not an address.');
  if (await limited(env.AUTH_LIMIT, ipKey(request))) fail(429, 'Too many sign-ins from here. Wait a minute and try again.');
  const address = getAddress(raw);
  const t = now();
  const nonce = siweNonce();
  const message = createSiweMessage({
    domain: siweDomain(env),
    address,
    statement: STATEMENT,
    uri: siteOrigin(env),
    version: '1',
    chainId: Number(env.CHAIN_ID || 143),
    nonce,
    issuedAt: new Date(t),
    expirationTime: new Date(t + NONCE_TTL),
  });
  await env.DB.prepare('INSERT INTO nonces (nonce, address, message, created_at) VALUES (?, ?, ?, ?)').bind(nonce, address.toLowerCase(), message, t).run();
  // old unused nonces go now and then (the cron also sweeps them)
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM nonces WHERE created_at < ?').bind(t - 2 * NONCE_TTL).run();
  return json({ message, nonce });
}

/** POST /api/social/auth/verify { message, signature } : sign in. */
export async function verifySignIn(request, env) {
  checkOrigin(request, env);
  if (await limited(env.AUTH_LIMIT, ipKey(request))) fail(429, 'Too many sign-ins from here. Wait a minute and try again.');
  const b = await readJson(request, 32_768);
  const message = typeof b.message === 'string' ? b.message : '';
  const signature = typeof b.signature === 'string' ? b.signature : '';
  if (!message || message.length > 2000) fail(400, 'Nothing to sign in with.');
  // 65 bytes for a plain signature; smart wallets and ERC-6492 wrappers are longer, but not unboundedly
  if (!/^0x[0-9a-fA-F]{130,16000}$/.test(signature)) fail(400, 'That is not a signature.');
  const nonce = /\nNonce: ([A-Za-z0-9]{8,64})\n/.exec(message)?.[1];
  if (!nonce) fail(400, 'That is not an Emotown sign-in.');
  // used once: whoever gets here first consumes it, and a replay finds nothing
  const row = await env.DB.prepare('DELETE FROM nonces WHERE nonce = ? RETURNING address, message, created_at').bind(nonce).first();
  if (!row) fail(401, 'That sign-in has expired or was already used. Try again.');
  if (row.message !== message) fail(401, 'That is not the message Emotown asked you to sign.');
  if (now() - row.created_at > NONCE_TTL) fail(401, 'That sign-in has expired. Try again.');
  const address = row.address;
  let valid = false;
  try {
    // an admin signs with the key itself, never through contract code: the operator's wallet is EIP-7702 delegated today,
    // and whatever it is delegated to later must not be able to say yes for it (security review, 2026-09-27)
    valid = isAdmin(env, address)
      ? (await recoverMessageAddress({ message, signature })).toLowerCase() === address.toLowerCase()
      : await publicClient(env).verifyMessage({ address: getAddress(address), message, signature, mode: 'eoa' });
  } catch (e) {
    console.error('[social] verify', String(e?.shortMessage ?? e).slice(0, 200));
    fail(503, 'Could not check the signature with Monad just now. Try again in a moment.');
  }
  if (!valid) fail(401, 'The signature does not match this address.');
  const ban = await activeBan(env, address);
  if (ban) fail(403, ban.until >= PERMANENT ? 'This address is banned from Emotown.' : `This address is banned from Emotown until ${new Date(ban.until).toUTCString()}.`, { banned: true });

  const t = now();
  await env.DB.prepare('INSERT INTO users (address, joined_at, seen_at) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET seen_at = excluded.seen_at').bind(address, t, t).run();
  const token = randomHex(32);
  const hash = await sha256Hex(token);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, address, created_at, expires_at, seen_at) VALUES (?, ?, ?, ?, ?)').bind(hash, address, t, t + SESSION_DAYS * 86_400_000, t),
    // at most ten browsers signed in at once per address: the oldest go
    env.DB.prepare('DELETE FROM sessions WHERE address = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE address = ? ORDER BY created_at DESC LIMIT ?)').bind(address, address, MAX_SESSIONS),
  ]);
  return json({ ok: true, address }, 200, { 'set-cookie': setCookie(token) });
}

/** POST /api/social/auth/logout : this browser only. */
export async function signOut(request, env) {
  checkOrigin(request, env);
  const token = readCookie(request);
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const hash = await sha256Hex(token);
    const row = await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ? RETURNING address').bind(hash).first();
    // this browser's open inbox sockets stop hearing their messages at once
    if (row?.address && env.INBOX) { try { await env.INBOX.get(env.INBOX.idFromName(row.address)).fetch(`https://inbox/end?s=${hash}`); } catch { /* the ten-minute check catches it */ } }
  }
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}

/**
 * Who is asking: { address, admin, muteUntil, hash } or null. A banned address has no session. One D1 read per
 * request (the ban and the mute ride along in the same query).
 */
export async function sessionOf(request, env, ctx) {
  const token = readCookie(request);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const t = now();
  const s = await env.DB.prepare(`SELECT s.address, s.expires_at, s.seen_at,
      (SELECT MAX(until) FROM bans b WHERE b.address = s.address) AS ban_until,
      (SELECT MAX(until) FROM mutes m WHERE m.address = s.address) AS mute_until
    FROM sessions s WHERE s.token_hash = ?`).bind(hash).first();
  if (!s) return null;
  if (s.expires_at < t) { ctx?.waitUntil(env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run()); return null; }
  if (s.ban_until && s.ban_until > t) return null;
  if (t - s.seen_at > TOUCH_EVERY) {
    ctx?.waitUntil(env.DB.batch([
      env.DB.prepare('UPDATE sessions SET seen_at = ?, expires_at = ? WHERE token_hash = ?').bind(t, t + SESSION_DAYS * 86_400_000, hash),
      env.DB.prepare('UPDATE users SET seen_at = ? WHERE address = ?').bind(t, s.address),
    ]).catch(() => {}));
  }
  return { address: s.address, admin: isAdmin(env, s.address), muteUntil: s.mute_until && s.mute_until > t ? s.mute_until : 0, hash };
}

export async function requireSession(request, env, ctx) {
  const who = await sessionOf(request, env, ctx);
  if (!who) fail(401, 'Sign in first.', { signIn: true });
  return who;
}

export async function activeBan(env, address) {
  return env.DB.prepare('SELECT until, reason FROM bans WHERE address = ? AND until > ? ORDER BY until DESC LIMIT 1').bind(address, now()).first();
}
