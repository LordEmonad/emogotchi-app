// Cross-check the replayed EMO balances against the chain: node tools/snapshot/verify.mjs <cache file>
import { readFileSync } from 'node:fs';
import { createPublicClient, http, parseAbi } from 'viem';
import { holders } from './snapshot.mjs';
const file = process.argv[2];
const block = BigInt(file.match(/-(\d+)\.json$/)[1]);
const ev = JSON.parse(readFileSync(file, 'utf8'), (k, v) => (k === 'amount' || k === 'id') && typeof v === 'string' ? BigInt(v) : v);
const bal = holders(ev, 'erc20');
const positive = [...bal.entries()].filter(([, b]) => b > 0n);
const negative = [...bal.entries()].filter(([, b]) => b < 0n);
const sum = positive.reduce((t, [, b]) => t + b, 0n);
const c = createPublicClient({ transport: http('https://rpc.monad.xyz') });
const abi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)']);
const EMO = '0x81A224F8A62f52BdE942dBF23A56df77A10b7777';
const ts = await c.readContract({ address: EMO, abi, functionName: 'totalSupply', blockNumber: block });
console.log('addresses with balance > 0:', positive.length, '| negative (would mean a missed mint):', negative.length);
console.log('sum of replayed balances:', (Number(sum) / 1e18).toFixed(2), '| totalSupply on chain:', (Number(ts) / 1e18).toFixed(2), '| dead/zero excluded from sum:', ((Number(sum) - Number(ts)) / 1e18).toFixed(2));
// sample 150 addresses across the range, check balanceOf at the block via multicall3
const sample = positive.filter((_, i) => i % Math.ceil(positive.length / 150) === 0);
const res = await c.multicall({ contracts: sample.map(([a]) => ({ address: EMO, abi, functionName: 'balanceOf', args: [a] })), blockNumber: block, multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11' });
let bad = 0; res.forEach((r, i) => { if (r.status !== 'success' || r.result !== sample[i][1]) { bad++; if (bad < 6) console.log('  mismatch', sample[i][0], 'replayed', sample[i][1].toString(), 'chain', r.result?.toString()); } });
console.log('sampled', sample.length, 'addresses, mismatches:', bad);
// thresholds again, for the record
for (const t of [0.01, 0.1, 1, 10, 100]) console.log(`  >= ${t} EMO:`, positive.filter(([, b]) => b >= BigInt(Math.round(t * 1e6)) * 10n ** 12n).length);
