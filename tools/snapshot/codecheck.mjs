// Which addresses in a list are contracts? node tools/snapshot/codecheck.mjs <csv> [rpc]
// EIP-7702 delegated accounts (code 0xef0100…) are people's wallets and are NOT counted as contracts.
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
const RPC = process.argv[3] ?? 'https://rpc.monad.xyz';
const addrs = [...new Set(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.split(',')[0].trim().toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a)))];
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
log(`${addrs.length} addresses`);
const contracts = [], delegated = [];
for (let i = 0; i < addrs.length; i += 20) {
  const slice = addrs.slice(i, i + 20);
  let j;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(slice.map((a, k) => ({ jsonrpc: '2.0', id: k, method: 'eth_getCode', params: [a, 'latest'] }))) });
    j = await r.json().catch(() => null);
    if (Array.isArray(j)) break;
    if (attempt >= 8) throw new Error('eth_getCode kept failing: ' + JSON.stringify(j).slice(0, 160));
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  for (const x of j) if (x.result && x.result !== '0x') (x.result.toLowerCase().startsWith('0xef0100') ? delegated : contracts).push(slice[x.id]);
  if (i % 10000 === 0 && i) log(`  ${i}/${addrs.length}`);
  await new Promise((r) => setTimeout(r, 600));
}
const out = file.replace(/\.csv$/, '') + '.contracts.json';
writeFileSync(out, JSON.stringify({ checked: addrs.length, contracts, delegatedWallets: delegated.length }, null, 2));
console.log(JSON.stringify({ checked: addrs.length, contracts: contracts.length, delegatedWallets: delegated.length, wrote: out }));
