// A load test of the town square: hundreds of websocket readers, dozens of people talking at once, against a real
// Worker (`wrangler dev --local`: workerd, a local D1, the ChatRoom Durable Object with the hibernation API).
//
//   cd worker && READERS=600 SPEAKERS=60 SECONDS=60 node test/load.mjs
//
// The speakers' sessions and gates are seeded straight into the local D1 (the load is on the room, not on SIWE or the
// chain), each simulated client gets its own cf-connecting-ip (the per-IP limits are per person in production).
// Reports: how long the sockets took to open, how many of the messages every reader got (it should be all), and how
// long a message took from the POST to each reader (p50 / p95 / p99), plus the room's own refusals.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const PORT = Number(process.env.PORT ?? 8795);
const API = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'http://load.test';
const READERS = Number(process.env.READERS ?? 600);
const SPEAKERS = Number(process.env.SPEAKERS ?? 60);
const SECONDS = Number(process.env.SECONDS ?? 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);
const pct = (xs, p) => { if (!xs.length) return NaN; const s = Float64Array.from(xs).sort(); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

// ------------------------------------------------------------------ a Worker with seeded speakers
const dir = mkdtempSync(join(tmpdir(), 'emotown-load-'));
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'emotown-social', '--local', '--persist-to', dir], { cwd: WORKER, stdio: 'ignore' });
const speakers = Array.from({ length: SPEAKERS }, (_, i) => {
  const token = randomBytes(32).toString('hex');
  const address = '0x' + randomBytes(20).toString('hex');
  return { i, token, address, hash: createHash('sha256').update(token).digest('hex'), ip: `10.9.${Math.floor(i / 250)}.${(i % 250) + 1}` };
});
const now = Date.now();
const far = now + 86_400_000;   // the gate's "yes" is fresh for the whole run
writeFileSync(join(dir, 'seed.sql'), speakers.map((s) => `INSERT INTO users (address, joined_at, seen_at) VALUES ('${s.address}', ${now}, ${now});
INSERT INTO sessions (token_hash, address, created_at, expires_at, seen_at) VALUES ('${s.hash}', '${s.address}', ${now}, ${far}, ${now});
INSERT INTO gate (address, ok, pet_col, pet_id, pet_name, checked_at) VALUES ('${s.address}', 1, 'frok', ${s.i + 1}, 'Load${s.i}', ${far});
INSERT INTO profiles (address, name, name_key, bio, banner, updated_at) VALUES ('${s.address}', 'load_${s.i}', 'load_${s.i}', '', 'hall', ${now});`).join('\n'));
execFileSync('npx', ['wrangler', 'd1', 'execute', 'emotown-social', '--local', '--persist-to', dir, '--file', join(dir, 'seed.sql')], { cwd: WORKER, stdio: 'ignore' });
const w = spawn('npx', ['wrangler', 'dev', '--local', '--persist-to', dir, '--port', String(PORT), '--ip', '127.0.0.1', '--var', `SITE_ORIGIN:${ORIGIN}`, '--var', 'SIWE_DOMAIN:load.test'], { cwd: WORKER, stdio: ['ignore', 'pipe', 'pipe'] });
// the Worker's own errors, kept for the report (WORKER_LOG=<file> keeps all of it)
const workerErrors = [];
const keep = process.env.WORKER_LOG ? (await import('node:fs')).createWriteStream(process.env.WORKER_LOG) : null;
for (const s of [w.stdout, w.stderr]) s.on('data', (d) => { keep?.write(d); for (const line of String(d).split('\n')) if (/error|\[social\]|\[chatroom\]| 500 /i.test(line)) workerErrors.push(line.slice(0, 400)); });
const stop = () => { try { w.kill('SIGTERM'); } catch { /* gone */ } try { rmSync(dir, { recursive: true, force: true }); } catch { /* fine */ } };
process.on('exit', stop);
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${API}/api/social/me`)).ok) break; } catch { /* not yet */ } await sleep(500); }
log(`Worker up; ${READERS} readers, ${SPEAKERS} speakers, ${SECONDS}s of talking`);

// ------------------------------------------------------------------ sockets
const sent = new Map();      // message id -> ms the POST started
const got = new Map();       // message id -> [ms each reader got it]
let opened = 0, failed = 0, presenceMsgs = 0;
const opens = [];
function socket(i, cookie = null) {
  return new Promise((resolve) => {
    const start = Date.now();
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/social/chat/ws?room=square`, { headers: { origin: ORIGIN, 'cf-connecting-ip': `10.${1 + Math.floor(i / 60000)}.${Math.floor(i / 250) % 250}.${(i % 250) + 1}`, ...(cookie ? { cookie: `__Host-emotown=${cookie}` } : {}) } });
    ws.addEventListener('open', () => { opened++; opens.push(Date.now() - start); resolve(ws); });
    ws.addEventListener('error', () => { failed++; resolve(null); });
    ws.addEventListener('message', (e) => {
      let d; try { d = JSON.parse(String(e.data)); } catch { return; }
      if (d.t === 'msg') { const arr = got.get(d.m.id) ?? []; arr.push(Date.now()); got.set(d.m.id, arr); }
      else if (d.t === 'presence') presenceMsgs++;
    });
  });
}
const readers = [];
const tOpen = Date.now();
for (let i = 0; i < READERS; i += 50) readers.push(...(await Promise.all(Array.from({ length: Math.min(50, READERS - i) }, (_, k) => socket(i + k)))));
log(`readers: ${opened} open, ${failed} failed, in ${((Date.now() - tOpen) / 1000).toFixed(1)}s; open time p50 ${pct(opens, 50)}ms p95 ${pct(opens, 95)}ms`);
const speakerSockets = await Promise.all(speakers.map((s) => socket(100000 + s.i, s.token)));
log(`speakers' sockets: ${speakerSockets.filter(Boolean).length} open`);
await sleep(2500);
const who = await (await fetch(`${API}/api/social/chat/who`)).json();
log(`the room counts ${who.online} sockets and ${who.people} people`);

// ------------------------------------------------------------------ talking
const statuses = {};
let posts = 0;
const end = Date.now() + SECONDS * 1000;
await Promise.all(speakers.map(async (s) => {
  await sleep(Math.random() * 4000);
  let n = 0;
  while (Date.now() < end) {
    const start = Date.now();
    const r = await fetch(`${API}/api/social/chat`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: `__Host-emotown=${s.token}`, 'cf-connecting-ip': s.ip }, body: JSON.stringify({ room: 'square', text: `speaker ${s.i} says ${n++} ${Math.random().toString(36).slice(2, 8)}` }) });
    statuses[r.status] = (statuses[r.status] ?? 0) + 1; posts++;
    if (r.ok) { const j = await r.json(); sent.set(j.m.id, start); }
    await sleep(4600 + Math.random() * 1500);   // under the room's pace for one person: five in twenty seconds
  }
}));
await sleep(3000);   // let the last messages land

// ------------------------------------------------------------------ what came through
const readersOpen = readers.filter(Boolean).length + speakerSockets.filter(Boolean).length;
const lat = [];
let delivered = 0;
for (const [id, t] of sent) { const arr = got.get(id) ?? []; delivered += arr.length; for (const at of arr) lat.push(at - t); }
const expected = sent.size * readersOpen;
log(`posted ${posts}: ${JSON.stringify(statuses)}; ${sent.size} accepted (${(sent.size / SECONDS).toFixed(1)} a second)`);
log(`delivered ${delivered} of ${expected} (${((delivered / Math.max(1, expected)) * 100).toFixed(2)}%) to ${readersOpen} sockets`);
log(`POST to reader: p50 ${pct(lat, 50)}ms  p95 ${pct(lat, 95)}ms  p99 ${pct(lat, 99)}ms  max ${lat.reduce((m, x) => (x > m ? x : m), 0)}ms`);
log(`presence broadcasts seen per socket: ${(presenceMsgs / Math.max(1, readersOpen)).toFixed(1)} (batched: ${SPEAKERS} people joined)`);
if (workerErrors.length) log('Worker errors:\n  ' + workerErrors.slice(0, 20).join('\n  '));
for (const ws of [...readers, ...speakerSockets]) try { ws?.close(); } catch { /* gone */ }
const ok = failed === 0 && delivered === expected && (statuses[500] ?? 0) === 0;
log(ok ? 'PASS' : 'FAIL');
stop();
process.exit(ok ? 0 : 1);
