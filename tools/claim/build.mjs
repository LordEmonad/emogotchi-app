// Build the claim allowlist tree and the static proof shards the claim page reads.
//   node tools/claim/build.mjs --list snapshot/claim-allowlist.csv [--list …] --exclude snapshot/tier1.csv [--exclude …] --out apps/web/public/claim
// Every --list CSV (address in the first column, header allowed) is unioned; every --exclude CSV or plain
// address file is removed (the pushed tier, so nobody gets a second cat). Writes:
//   <out>/root.json                 { root, count, generatedAt, lists, excluded }
//   <out>/p/<first two hex>.json    { "<address>": [proof…], … }   (256 shards; the page fetches one)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { buildTree } from './tree.mjs';
import { keccak256, toBytes } from 'viem';

/** The lookup key for a wallet: the published files hold these, never the addresses themselves, so the
 *  allowlist cannot be scraped and turned into "here are the communities" before the operator says so. */
export const keyOf = (a) => keccak256(toBytes(a.toLowerCase()));
const args = process.argv.slice(2);
const opt = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const lists = opt('--list'); const excludes = opt('--exclude'); const out = opt('--out')[0] ?? 'apps/web/public/claim';
if (!lists.length) { console.error('usage: --list <csv> [--exclude <csv>] [--out <dir>]'); process.exit(1); }
const readAddrs = (f) => readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.split(',')[0].trim().toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a));
const ex = new Set(excludes.flatMap(readAddrs));
const all = new Set(lists.flatMap(readAddrs));
const eligible = [...all].filter((a) => !ex.has(a));
const t = buildTree(eligible);
rmSync(out, { recursive: true, force: true }); mkdirSync(out + '/p', { recursive: true });
const shards = {};
for (const a of eligible) { const k = keyOf(a); (shards[k.slice(2, 4)] ??= {})[k] = t.proofOf(a); }
for (const [k, v] of Object.entries(shards)) writeFileSync(`${out}/p/${k}.json`, JSON.stringify(v));
writeFileSync(`${out}/root.json`, JSON.stringify({ root: t.root, count: eligible.length, generatedAt: new Date().toISOString(), lists, excluded: all.size - eligible.length }, null, 2));
console.log(JSON.stringify({ root: t.root, eligible: eligible.length, inLists: all.size, removedAsTier1: all.size - eligible.length, shards: Object.keys(shards).length }));
