/**
 * Web Push from a Worker with nothing but WebCrypto: VAPID (RFC 8292) and the aes128gcm content encoding (RFC 8188 and
 * RFC 8291). No package: this Worker holds keys (the drip, the fight keeper), and every dependency it loads is a risk it
 * does not need. The subscriber's side is reproduced in test/webpush.test.mjs with Node's crypto, which is how this is
 * known to be right, and a real push to a real Chrome subscription is in the browser check.
 *
 * Keys: `VAPID_PUBLIC_KEY` (a var: the uncompressed P-256 point, 65 bytes, base64url; the page needs it to subscribe)
 * and `VAPID_PRIVATE_KEY` (a secret: the 32-byte scalar, base64url). `node tools/vapid-keys.mjs` makes a pair.
 */
const enc = new TextEncoder();

export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => { const t = String(s).replace(/-/g, '+').replace(/_/g, '/'); const pad = t.length % 4 ? '='.repeat(4 - (t.length % 4)) : ''; return Uint8Array.from(atob(t + pad), (c) => c.charCodeAt(0)); };
const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.byteLength, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(new Uint8Array(p), o); o += p.byteLength; } return out; };

/** The VAPID `Authorization` header for one push service origin: a 12-hour ES256 JWT over the audience and the subject. */
export async function vapidAuthorization(endpoint, pubB64, privB64, subject) {
  const pub = unb64u(pubB64);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be an uncompressed P-256 point');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: privB64 };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));   // raw r||s, which is what JWS wants
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${pubB64}`;
}

/**
 * Encrypt `payload` (bytes) for one subscription (RFC 8291 with RFC 8188 aes128gcm): an ephemeral ECDH key, HKDF with the
 * subscription's auth secret, one record. Returns the request body with its header block in front.
 */
export async function encryptPayload(p256dhB64, authB64, payload) {
  const uaPublic = unb64u(p256dhB64); const authSecret = unb64u(authB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh');
  if (authSecret.length !== 16) throw new Error('bad auth');
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256);
  // IKM = HKDF(salt = auth, ikm = shared, info = "WebPush: info" 0x00 ua_public as_public, 32)
  const hk1 = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const ikm = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: cat(enc.encode('WebPush: info\0'), uaPublic, asPublic) }, hk1, 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hk2 = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cek = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\0') }, hk2, 128);
  const nonce = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\0') }, hk2, 96);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = cat(payload, new Uint8Array([2]));   // the last (only) record ends in the 0x02 delimiter
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aes, plain);
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/**
 * Send one push. `sub` is { endpoint, p256dh, auth }; `payload` an object (JSON). Returns { ok, status, gone } where
 * `gone` means the subscription is dead (404/410) and should be deleted. Never throws on the push service's answer.
 */
export async function sendPush(sub, payload, { pub, priv, subject, ttl = 24 * 3600, urgency = 'normal', topic } = {}) {
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(payload)));
  const headers = {
    'content-type': 'application/octet-stream',
    'content-encoding': 'aes128gcm',
    'content-length': String(body.length),
    ttl: String(ttl),
    urgency,
    authorization: await vapidAuthorization(sub.endpoint, pub, priv, subject),
  };
  if (topic) headers.topic = topic.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '_');
  let res;
  try { res = await fetch(sub.endpoint, { method: 'POST', headers, body }); } catch (e) { return { ok: false, status: 0, gone: false, error: String(e).slice(0, 120) }; }
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}
