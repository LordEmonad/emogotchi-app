/**
 * A tiny index for the gallery filters that the chain itself can't answer cheaply.
 *
 * Monad's public RPC caps eth_getLogs at 100 blocks, so a browser can't scan the collection for the
 * cats that have been named or have died. This walks the event log once through HyperSync and writes
 * the ids to a static file the site ships. The cats' *state* is still read live from the contract;
 * only the list of which ids to look at comes from here.
 *
 *   node tools/index-named.mjs            # writes apps/web/public/index/cats.json
 *
 * Run by tools/pages-deploy.sh on every publish, so it refreshes whenever the site does.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const GAME = (process.env.GAME ?? '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5').toLowerCase();
const FROM = Number(process.env.FROM_BLOCK ?? 105137070); // the deploy
const OUT = 'apps/web/public/index/cats.json';
const tokenFile = process.env.HOME + '/.emogotchi-hypersync-token';
const TOKEN = process.env.HYPERSYNC_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : null);

// keccak256 of the event signatures
const NAMED = '0x9726e950b835e1f7f4fe747cca4223de678452a4f67c102d50408e22e94e9485'; // Named(uint256,string)
const DIED = '0x1f9b2b2dd88c44d10e7c1a9d48e4d6c3b6a6a1e5b0ba03e31e1e63e7b0e2a7c4'; // placeholder, resolved below

const topic = async (sig) => {
  const { keccak256, toBytes } = await import('viem');
  return keccak256(toBytes(sig));
};

/** the ABI-encoded string in a log's `data`: offset, length, then the utf-8 bytes */
const decodeString = (data) => {
  if (!data || data.length < 130) return '';
  const len = parseInt(data.slice(66, 130), 16);
  if (!Number.isFinite(len) || len <= 0 || len > 128) return '';
  const hex = data.slice(130, 130 + len * 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
};

const query = async (topics, withName = false) => {
  if (!TOKEN) throw new Error('no HyperSync token; set HYPERSYNC_TOKEN or ~/.emogotchi-hypersync-token');
  const seen = new Map();
  let from = FROM, to = null;
  for (;;) {
    const r = await fetch('https://monad.hypersync.xyz/query', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ from_block: from, logs: [{ address: [GAME], topics: [topics] }], field_selection: { log: withName ? ['topic1', 'data'] : ['topic1'] } }),
    });
    if (!r.ok) throw new Error(`HyperSync ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    for (const b of j.data ?? []) for (const l of b.logs ?? []) seen.set(Number(BigInt(l.topic1)), withName ? decodeString(l.data) : '');
    to = j.next_block ?? j.archive_height ?? from;
    if (j.next_block == null || j.next_block <= from) break;
    from = j.next_block;
  }
  const ids = [...seen.keys()].sort((a, b) => b - a);
  return { ids: withName ? ids.map((id) => ({ id, name: seen.get(id) })) : ids, to };
};

const named = await query([await topic('Named(uint256,string)')], true);
// Dead cats: on chain a death is only *recorded* (Died) when the cat is next touched, so the true list is
// derived from the feed clock. The Worker (worker/index.js) does that derivation; this file is its
// fallback, so it takes the Worker's answer and only falls back to the recorded deaths if the Worker is down.
let died; let extra = {};   // the Worker's never-died and revived lists, carried into the fallback so the gallery's chips never read 0 for a list it simply lacks
try {
  const r = await fetch('https://emogotchi.emonad.lol/api/cats');
  const j = r.ok ? await r.json() : null;
  if (j) extra = { neverDied: Array.isArray(j.neverDied) ? j.neverDied : j.neverDiedRuns ? { runs: j.neverDiedRuns } : undefined, revived: Array.isArray(j.revived) ? j.revived : j.revivedRuns ? { runs: j.revivedRuns } : undefined };
  if (j && Array.isArray(j.died)) died = { ids: j.died };
  else if (j && Array.isArray(j.diedRuns)) { const ids = []; for (const [hi, lo] of j.diedRuns) for (let id = hi; id >= lo; id--) ids.push(id); died = { ids }; }   // long lists come as [hi, lo] runs
} catch { /* below */ }
if (!died) { console.log('worker unreachable: dead list from recorded deaths only'); died = await query([await topic('Died(uint256,uint256)')]); }
mkdirSync('apps/web/public/index', { recursive: true });
// the shipped file keeps the runs too, so the fallback stays small once most cats are dead
const runs = []; for (const id of died.ids) { const r = runs[runs.length - 1]; if (r && r[1] === id + 1) r[1] = id; else runs.push([id, id]); }
const keep = (k, v) => (v === undefined ? {} : Array.isArray(v) ? { [k]: v } : { [k + 'Runs']: v.runs });
const out = { generatedAt: new Date().toISOString(), block: named.to, named: named.ids, ...(died.ids.length <= 2000 ? { died: died.ids } : { diedRuns: runs }), ...keep('neverDied', extra.neverDied), ...keep('revived', extra.revived) };
writeFileSync(OUT, JSON.stringify(out));
console.log(`${named.ids.length} named, ${died.ids.length} died, scanned to block ${named.to} → ${OUT}`);
