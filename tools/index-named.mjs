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

const query = async (topics) => {
  if (!TOKEN) throw new Error('no HyperSync token; set HYPERSYNC_TOKEN or ~/.emogotchi-hypersync-token');
  const ids = new Set();
  let from = FROM, to = null;
  for (;;) {
    const r = await fetch('https://monad.hypersync.xyz/query', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ from_block: from, logs: [{ address: [GAME], topics: [topics] }], field_selection: { log: ['topic1', 'block_number'] } }),
    });
    if (!r.ok) throw new Error(`HyperSync ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    for (const b of j.data ?? []) for (const l of b.logs ?? []) ids.add(Number(BigInt(l.topic1)));
    to = j.next_block ?? j.archive_height ?? from;
    if (j.next_block == null || j.next_block <= from) break;
    from = j.next_block;
  }
  return { ids: [...ids].sort((a, b) => b - a), to };
};

const named = await query([await topic('Named(uint256,string)')]);
const died = await query([await topic('Died(uint256,uint256)')]);
mkdirSync('apps/web/public/index', { recursive: true });
const out = { generatedAt: new Date().toISOString(), block: named.to, named: named.ids, died: died.ids };
writeFileSync(OUT, JSON.stringify(out));
console.log(`${named.ids.length} named, ${died.ids.length} died, scanned to block ${named.to} → ${OUT}`);
