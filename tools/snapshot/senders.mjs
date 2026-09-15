// Unique wallets that sent a transaction to a contract, via HyperSync: node tools/snapshot/senders.mjs <label> <address> [toBlock]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
const [label, address, toArg] = process.argv.slice(2);
const TOKEN = process.env.HYPERSYNC_TOKEN ?? readFileSync(process.env.HOME + '/.emogotchi-hypersync-token', 'utf8').trim();
const HS = 'https://monad.hypersync.xyz';
const to = toArg ? Number(toArg) : Number((await (await fetch(HS + '/height')).json()).height);
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
const senders = new Set(); let from = 0; let pages = 0; let txs = 0;
while (from <= to) {
  const body = { from_block: from, to_block: to + 1, transactions: [{ to: [address.toLowerCase()] }], field_selection: { transaction: ['from', 'block_number'] } };
  let r;
  for (let attempt = 0; ; attempt++) {
    r = await fetch(HS + '/query', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
    if (r.status !== 429) break;
    if (attempt >= 10) throw new Error('HyperSync keeps answering 429');
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  if (!r.ok) throw new Error(`HyperSync ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  for (const b of j.data ?? []) for (const t of b.transactions ?? []) { txs += 1; if (t.from) senders.add(t.from.toLowerCase()); }
  pages += 1; if (pages % 20 === 0) log(`  ${label}: block ${from} · ${txs} txs · ${senders.size} senders`);
  if (j.next_block == null || j.next_block <= from) break; from = j.next_block;
  if (j.archive_height != null && from > j.archive_height) break;
}
mkdirSync('snapshot/cache', { recursive: true });
writeFileSync(`snapshot/cache/senders-${label}-${to}.json`, JSON.stringify([...senders]));
console.log(JSON.stringify({ label, address, toBlock: to, transactions: txs, uniqueSenders: senders.size, pages }));
