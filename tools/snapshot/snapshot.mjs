// Airdrop snapshot: who holds what on Monad mainnet at one block, merged into one address per line.
//
//   HYPERSYNC_TOKEN=… node tools/snapshot/snapshot.mjs tools/snapshot/config.json
//
// Reads every Transfer event of each source contract from genesis to the snapshot block through Envio
// HyperSync (free API token at https://app.envio.dev/api-tokens; the public RPC only allows 100-block
// log queries, which would take hours per collection). Rebuilds balances, applies each source's minimum,
// unions the lists, drops contracts and excluded addresses, and writes:
//   snapshot/<name>.csv        address,cats,sources     (one line per wallet: the airdrop input)
//   snapshot/<name>.report.json  counts per source, overlaps, exclusions, the block and the timestamp
// A wallet gets `perWallet` cats no matter how many lists it is on. Set "perSource": true to give one
// per qualifying source instead (still capped by "maxPerWallet").
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

const cfgPath = process.argv[2] ?? 'tools/snapshot/config.json';
const cfg = process.argv[1]?.endsWith('snapshot.mjs') ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const TOKEN = process.env.HYPERSYNC_TOKEN ?? (existsSync(process.env.HOME + '/.emogotchi-hypersync-token') ? readFileSync(process.env.HOME + '/.emogotchi-hypersync-token', 'utf8').trim() : undefined);
const HS = cfg.hypersync ?? 'https://monad.hypersync.xyz';
const RPC = cfg.rpc ?? 'https://rpc.monad.xyz';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO = '0x0000000000000000000000000000000000000000';
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
const addr = (topic) => '0x' + topic.slice(26).toLowerCase();

const rpc = async (method, params) => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
};

/** Every Transfer log of `contract` up to and including `block`, as {from, to, id|amount}. */
async function transfers(contract, block, kind) {
  // cached per contract and block, so a re-run (a new source, a changed minimum) costs no HyperSync credits
  const cacheDir = resolve(dirname(cfgPath), '../../snapshot/cache'); mkdirSync(cacheDir, { recursive: true });
  const cacheFile = `${cacheDir}/${contract}-${block}.json`;
  if (existsSync(cacheFile)) { const c = JSON.parse(readFileSync(cacheFile, 'utf8'), (k, v) => (k === 'id' || k === 'amount') && typeof v === 'string' ? BigInt(v) : v); log(`  ${contract} ${c.length} transfers (cached)`); return c; }
  if (!TOKEN) throw new Error('HYPERSYNC_TOKEN is not set (create one at https://app.envio.dev/api-tokens)');
  const out = []; let from = 0; let pages = 0;
  while (from <= block) {
    const body = { from_block: from, to_block: block + 1, logs: [{ address: [contract], topics: [[TRANSFER]] }], field_selection: { log: ['block_number', 'log_index', 'topic1', 'topic2', 'topic3', 'data'] } };
    let r;
    for (let attempt = 0; ; attempt++) { // the free tier answers 429 when queries come too fast: wait and retry the same page
      r = await fetch(HS + '/query', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
      if (r.status !== 429) break;
      if (attempt >= 10) throw new Error('HyperSync keeps answering 429');
      await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
    }
    if (!r.ok) throw new Error(`HyperSync ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const batch of j.data ?? []) for (const l of batch.logs ?? []) {
      if (!l.topic1 || !l.topic2) continue; // not a standard Transfer(address,address,…)
      if (kind === 'erc721') { if (l.topic3 == null) continue; out.push({ from: addr(l.topic1), to: addr(l.topic2), id: BigInt(l.topic3) }); }
      else { if (l.topic3 != null) continue; out.push({ from: addr(l.topic1), to: addr(l.topic2), amount: BigInt(l.data === '0x' ? 0 : l.data) }); }
    }
    pages += 1; if (j.next_block == null || j.next_block <= from) break; from = j.next_block;
    if (j.archive_height != null && from > j.archive_height) break;
  }
  log(`  ${contract} ${out.length} transfers in ${pages} pages`);
  writeFileSync(cacheFile, JSON.stringify(out, (k, v) => typeof v === 'bigint' ? v.toString() : v));
  return out;
}

/** Holders at the snapshot: ERC-721 counts tokens per owner, ERC-20 sums balances. Returns Map<address, bigint>. */
function holders(events, kind) {
  const bal = new Map();
  if (kind === 'erc721') {
    const owner = new Map();
    for (const e of events) owner.set(e.id, e.to);
    for (const o of owner.values()) bal.set(o, (bal.get(o) ?? 0n) + 1n);
  } else {
    for (const e of events) { if (e.from !== ZERO) bal.set(e.from, (bal.get(e.from) ?? 0n) - e.amount); bal.set(e.to, (bal.get(e.to) ?? 0n) + e.amount); }
  }
  bal.delete(ZERO);
  return bal;
}

/** Which addresses have code (LP pools, routers, token contracts, vaults): batched eth_getCode, paced for the public RPC. */
async function contractsAmong(addresses, blockHex) {
  const found = new Set(); const BATCH = 20; // the public RPC counts each item of a batch: 20 every 600 ms stays under its 50/s
  for (let i = 0; i < addresses.length; i += BATCH) {
    const slice = addresses.slice(i, i + BATCH);
    let j;
    for (let attempt = 0; ; attempt++) { // the public RPC answers -32007 when it is over its 50/s: wait and retry the same batch
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(slice.map((a, k) => ({ jsonrpc: '2.0', id: k, method: 'eth_getCode', params: [a, blockHex] }))) });
      j = await r.json();
      if (Array.isArray(j)) break;
      if (attempt >= 8) throw new Error('batch eth_getCode failed: ' + JSON.stringify(j).slice(0, 200));
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    // EIP-7702 delegated accounts (code = 0xef0100 + delegate address, e.g. MetaMask smart accounts) are people's wallets, not contracts
    for (const x of j) if (x.result && x.result !== '0x' && !x.result.toLowerCase().startsWith('0xef0100')) found.add(slice[x.id]);
    if (i % (BATCH * 25) === 0 && i) log(`  code check ${i}/${addresses.length}`);
    await new Promise((r) => setTimeout(r, 600));
  }
  return found;
}

const main = async () => {
  const block = cfg.block === 'latest' || cfg.block == null ? Number(await rpc('eth_blockNumber', [])) : Number(cfg.block);
  const blockHex = '0x' + block.toString(16);
  const ts = Number((await rpc('eth_getBlockByNumber', [blockHex, false])).timestamp);
  log(`snapshot at block ${block} (${new Date(ts * 1000).toISOString()})`);
  const exclude = new Set([ZERO, '0x000000000000000000000000000000000000dead', ...(cfg.exclude ?? []), ...cfg.sources.map((s) => s.address)].map((a) => a.toLowerCase()));
  const wallets = new Map(); // address -> Set(source labels)
  const report = { block, timestamp: ts, sources: [], excluded: {}, wallets: 0, cats: 0 };
  for (const s of cfg.sources) {
    log(`${s.label} (${s.type} ${s.address})`);
    const kind = s.type === 'erc721' ? 'erc721' : 'erc20';
    const ev = await transfers(s.address.toLowerCase(), block, kind);
    const bal = holders(ev, kind);
    const min = kind === 'erc721' ? BigInt(s.min ?? 1) : BigInt(Math.round(Number(s.min ?? 0) * 10 ** (s.decimals ?? 18)));
    let n = 0;
    // a "holder" has a positive balance now; addresses that sold or sent everything stay in the map at zero
    let held = 0;
    for (const [a, b] of bal) { if (b <= 0n) continue; held += 1; if (b >= min && !exclude.has(a)) { n += 1; (wallets.get(a) ?? wallets.set(a, new Set()).get(a)).add(s.label); } }
    const src = { label: s.label, address: s.address, type: kind, transfers: ev.length, holders: held, qualifying: n, min: s.min ?? (kind === 'erc721' ? 1 : 0) };
    if (kind === 'erc20') { // how many holders sit above each round threshold, to pick a minimum with numbers in hand
      const unit = 10n ** BigInt(s.decimals ?? 18); src.holdersAtLeast = {};
      for (const t of [0.01, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000]) src.holdersAtLeast[t] = [...bal.values()].filter((b) => b > 0n && b >= BigInt(Math.round(t * 1e6)) * unit / 1000000n).length;
    }
    report.sources.push(src);
    log(`  ${held} holders (${bal.size} addresses ever touched), ${n} qualify`);
  }
  let all = [...wallets.keys()];
  if (cfg.excludeContracts !== false) {
    log(`checking ${all.length} addresses for code`);
    const code = await contractsAmong(all, blockHex);
    report.excluded.contracts = code.size;
    report.excludedContracts = [...code].map((a) => ({ address: a, sources: [...wallets.get(a)] }));
    for (const a of code) wallets.delete(a);
    all = [...wallets.keys()];
  }
  const per = Number(cfg.perWallet ?? 1); const cap = Number(cfg.maxPerWallet ?? 5);
  const rows = all.sort().map((a) => { const srcs = [...wallets.get(a)]; const cats = Math.min(cap, cfg.perSource ? srcs.length * per : per); return { a, cats, srcs }; });
  // overlaps: how many wallets sit on 1, 2, 3… lists
  report.overlap = {}; for (const r of rows) report.overlap[r.srcs.length] = (report.overlap[r.srcs.length] ?? 0) + 1;
  report.wallets = rows.length; report.cats = rows.reduce((t, r) => t + r.cats, 0);
  const name = cfg.name ?? basename(cfgPath, '.json');
  const outDir = resolve(dirname(cfgPath), '../../snapshot'); mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/${name}.csv`, 'address,cats,sources\n' + rows.map((r) => `${r.a},${r.cats},${r.srcs.join('|')}`).join('\n') + '\n');
  writeFileSync(`${outDir}/${name}.report.json`, JSON.stringify(report, null, 2));
  log(`${rows.length} wallets, ${report.cats} cats → snapshot/${name}.csv`);
  console.log(JSON.stringify({ block, wallets: rows.length, cats: report.cats, overlap: report.overlap, sources: report.sources.map((s) => `${s.label}: ${s.qualifying}/${s.holders}`) }, null, 2));
};
export { holders };
if (process.argv[1] && process.argv[1].endsWith('snapshot.mjs')) main().catch((e) => { log('failed:', e.message); process.exit(1); });
