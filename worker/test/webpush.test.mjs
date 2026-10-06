// worker/webpush.js and worker/push.js, the parts that need no Worker: the aes128gcm encryption against a receiver
// written from RFC 8291 with Node's crypto (the subscriber's side), the VAPID token verified with the public key, and
// the preference cleaning and quiet hours.   node --test test/webpush.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createECDH, hkdfSync, createDecipheriv } from 'node:crypto';
import { encryptPayload, vapidAuthorization, b64u, unb64u } from '../webpush.js';
import { cleanPrefs, inQuiet, KINDS } from '../push.js';

const subtle = webcrypto.subtle;

test('aes128gcm: what the Worker encrypts, a subscriber decrypts (RFC 8291 receiver in Node)', async () => {
  // the subscriber: a P-256 key pair (p256dh is its public point) and a 16-byte auth secret
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const uaPublic = ua.getPublicKey();               // 65 bytes, uncompressed
  const auth = webcrypto.getRandomValues(new Uint8Array(16));
  const payload = new TextEncoder().encode(JSON.stringify({ title: 'Cat #12 is hungry', body: 'The bowl is empty. 23h 10m before it starves.', url: '/pet/12' }));
  const body = await encryptPayload(b64u(uaPublic), b64u(auth), payload);
  // the header block: salt(16) rs(4) idlen(1) as_public(65)
  const salt = body.slice(0, 16); const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0); const idlen = body[20];
  assert.equal(rs, 4096); assert.equal(idlen, 65);
  const asPublic = body.slice(21, 86); const cipher = body.slice(86);
  // the receiver's derivation
  const shared = ua.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, Buffer.from(asPublic)]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, Buffer.from(auth), info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, Buffer.from(salt), Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, Buffer.from(salt), Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(Buffer.from(cipher.slice(cipher.length - 16)));
  const plain = Buffer.concat([d.update(Buffer.from(cipher.slice(0, cipher.length - 16))), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'the record ends in the last-record delimiter');
  assert.equal(plain.slice(0, -1).toString(), Buffer.from(payload).toString());
  assert.ok(body.length <= 4096, 'one record');
});

test('aes128gcm: a different ephemeral key and salt every time, and bad keys are refused', async () => {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const auth = b64u(webcrypto.getRandomValues(new Uint8Array(16)));
  const a = await encryptPayload(b64u(ua.getPublicKey()), auth, new Uint8Array([1, 2, 3]));
  const b = await encryptPayload(b64u(ua.getPublicKey()), auth, new Uint8Array([1, 2, 3]));
  assert.notEqual(Buffer.from(a).toString('hex'), Buffer.from(b).toString('hex'));
  await assert.rejects(encryptPayload(b64u(new Uint8Array(64)), auth, new Uint8Array(1)), /bad p256dh/);
  await assert.rejects(encryptPayload(b64u(ua.getPublicKey()), b64u(new Uint8Array(15)), new Uint8Array(1)), /bad auth/);
});

test('VAPID: the token verifies with the public key and names the push service, the subject and a 12-hour expiry', async () => {
  const key = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', key.privateKey);
  const pub = b64u(await subtle.exportKey('raw', key.publicKey));
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', pub, jwk.d, 'https://emogotchi.emonad.lol');
  const m = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m, 'the header shape'); assert.equal(m[2], pub);
  const [h, c, sig] = m[1].split('.');
  assert.deepEqual(JSON.parse(Buffer.from(unb64u(h)).toString()), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(unb64u(c)).toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.equal(claims.sub, 'https://emogotchi.emonad.lol');
  assert.ok(claims.exp > Date.now() / 1000 + 11 * 3600 && claims.exp <= Date.now() / 1000 + 12 * 3600 + 5);
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key.publicKey, unb64u(sig), new TextEncoder().encode(`${h}.${c}`));
  assert.equal(ok, true);
  await assert.rejects(vapidAuthorization('https://x', b64u(new Uint8Array(33)), jwk.d, 's'), /uncompressed/);
});

test('preferences: every kind defaults on, unknown kinds dropped, pets and quiet hours checked', () => {
  const p = cleanPrefs({ kinds: { bowl: false, nope: true }, petsOff: ['cat:12', 'bad', 'frok:3', 'cat:12'], quiet: { from: 23, to: 8 }, tz: -300 });
  assert.equal(p.kinds.bowl, false); assert.equal(p.kinds.dm, true); assert.equal('nope' in p.kinds, false);
  assert.deepEqual(Object.keys(p.kinds).sort(), Object.keys(KINDS).sort());
  assert.deepEqual(p.petsOff, ['cat:12', 'frok:3']); assert.deepEqual(p.quiet, { from: 23, to: 8 }); assert.equal(p.tz, -300);
  assert.deepEqual(cleanPrefs(null).petsOff, []); assert.equal(cleanPrefs({ quiet: { from: 5, to: 5 } }).quiet, null); assert.equal(cleanPrefs({ tz: 9999 }).tz, 0);
});

test('quiet hours: in the subscriber\'s own clock, wrapping past midnight', () => {
  const at = (h) => Date.UTC(2026, 9, 1, h, 30);   // UTC
  const ny = cleanPrefs({ quiet: { from: 23, to: 8 }, tz: -240 });   // New York, UTC-4
  assert.equal(inQuiet(ny, at(3)), true);    // 23:30 in New York
  assert.equal(inQuiet(ny, at(12)), false);  // 08:30
  assert.equal(inQuiet(ny, at(11)), true);   // 07:30
  const day = cleanPrefs({ quiet: { from: 9, to: 17 }, tz: 0 });
  assert.equal(inQuiet(day, at(12)), true); assert.equal(inQuiet(day, at(20)), false);
  assert.equal(inQuiet(cleanPrefs({}), at(3)), false);
});
