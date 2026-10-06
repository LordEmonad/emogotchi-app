// A VAPID key pair for the Worker's push notifications (worker/webpush.js). The public key is a var in
// worker/wrangler.toml (the page reads it from /api/social/push/vapid); the private key goes ONLY into the Worker secret.
//   node tools/vapid-keys.mjs            prints the public key and the private key (paste the private one at
//                                        `npx wrangler secret put VAPID_PRIVATE_KEY` in worker/: the NAME is the argument)
//   node tools/vapid-keys.mjs --set      writes the public key into worker/wrangler.toml and pipes the private key
//                                        straight into `wrangler secret put VAPID_PRIVATE_KEY` without printing it
//                                        (needs the wrangler login; then `npx wrangler deploy` in worker/)
// Changing the pair later invalidates every subscription (the browsers subscribed to the old public key): every
// device would have to turn notifications off and on again. Make it once.
import { webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const key = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', key.privateKey);
const pub = b64u(await webcrypto.subtle.exportKey('raw', key.publicKey));

if (!process.argv.includes('--set')) {
  console.log(`VAPID_PUBLIC_KEY = "${pub}"   (worker/wrangler.toml [vars])`);
  console.log(`VAPID_PRIVATE_KEY (the secret; paste at the wrangler prompt, never anywhere else):\n${jwk.d}`);
  process.exit(0);
}

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker');
const toml = join(WORKER, 'wrangler.toml');
const text = readFileSync(toml, 'utf8');
if (!/^VAPID_PUBLIC_KEY = ".*"$/m.test(text)) { console.error('wrangler.toml has no VAPID_PUBLIC_KEY line'); process.exit(1); }
if (!/^VAPID_PUBLIC_KEY = ""$/m.test(text) && !process.argv.includes('--force')) { console.error('wrangler.toml already holds a public key; --force replaces it (every subscription stops working)'); process.exit(1); }
const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'VAPID_PRIVATE_KEY'], { cwd: WORKER, input: jwk.d + '\n', encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stdout, r.stderr); console.error('the secret was not set; wrangler.toml left alone'); process.exit(1); }
writeFileSync(toml, text.replace(/^VAPID_PUBLIC_KEY = ".*"$/m, `VAPID_PUBLIC_KEY = "${pub}"`));
console.log(`VAPID_PRIVATE_KEY set as a Worker secret (never printed); VAPID_PUBLIC_KEY = "${pub}" written to worker/wrangler.toml.\nNow: cd worker && npx wrangler deploy`);
