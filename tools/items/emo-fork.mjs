// The emo pack's 14 items created on an anvil fork of Monad by the curator, and every picture read back the way a
// marketplace or a wallet reads it: the shop's uri(id) (base64 JSON whose "image" is a base64 SVG data URI), decoded and
// compared byte for byte with contracts/items/emo/*.svg. It reports each create's gas, and writes each picture as read
// back to <OUT>/<n>.svg for rendering in other engines (tools/items/emo-engines.mjs).
//   ~/.foundry/bin/anvil --fork-url https://rpc.monad.xyz --chain-id 143 --port 8551 --code-size-limit 131072 --gas-limit 300000000 &
//   cast rpc anvil_impersonateAccount 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --rpc-url http://127.0.0.1:8551
//   (deploy HoldsGate(EMO, 7000e18) the same way: forge create ... --unlocked --from the curator)
//   RPC=http://127.0.0.1:8551 GATE=<the HoldsGate> OUT=<dir> node tools/items/emo-fork.mjs
// Names and descriptions here are placeholders: the pack's are the operator's to write.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, toHex } from 'viem';
const root = fileURLToPath(new URL('../..', import.meta.url));
const RPC = process.env.RPC ?? 'http://127.0.0.1:8551';
const GATE = process.env.GATE;                                  // the HoldsGate the holders' edition asks
const OUT = process.env.OUT ?? root + 'emopack/fork';
mkdirSync(OUT, { recursive: true });
if (!GATE) throw new Error('GATE= the HoldsGate deployed on the fork');
const SHOP = '0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91';
const ANY_PET = '0x2CC30bc5d0470c8a9Df554204f2fb54174467AE5';   // the live "holds any pet" gate
const CURATOR = '0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74';
const chain = { id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const wal = createWalletClient({ chain, transport: http(RPC), account: CURATOR });
const abi = parseAbi([
  'struct CreateParams { string name; string description; bytes svg; uint128 price; uint32 maxSupply; uint32 perKey; uint64 opens; uint64 closes; uint8 kind; uint8 slot; bool soulbound; address gate; }',
  'function create(CreateParams c) returns (uint256)',
  'function itemCount() view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
]);
// kind: 1 Cosmetic, 2 Scene, 3 Passive; slot: a hint for the site (1 outfit, 2 head, 3 room, 4 accessory, 5 held)
const ITEMS = [['beanie', 'Beanie', 1, 2], ['fit', 'Emo clothes', 1, 1], ['wristbands', 'Wristbands', 1, 4], ['piercings', 'Lip piercings', 1, 4],
  ['bedroom', 'Emo bedroom', 2, 3], ['guitar', 'Guitar', 3, 5], ['selfie', 'Mirror selfie', 3, 5]];
const editions = ITEMS.flatMap(([key, name, kind, slot]) => [
  { file: key, name, kind, slot, price: parseEther('30'), perKey: 0, soulbound: false, gate: ANY_PET },
  { file: key + '-holder', name: name + ' (holders)', kind, slot, price: 0n, perKey: 1, soulbound: true, gate: GATE },
]);
const before = await pub.readContract({ address: SHOP, abi, functionName: 'itemCount' });
let ok = true, totalGas = 0n, totalBytes = 0;
for (const e of editions) {
  const svg = readFileSync(`${root}contracts/items/emo/${e.file}.svg`);
  const params = { name: e.name, description: 'Placeholder description.', svg: toHex(svg), price: e.price, maxSupply: 0, perKey: e.perKey, opens: 0n, closes: 0n, kind: e.kind, slot: e.slot, soulbound: e.soulbound, gate: e.gate };
  const hash = await wal.writeContract({ address: SHOP, abi, functionName: 'create', args: [params], gas: 29_000_000n });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') { console.log(`  ${e.file}: REVERTED`); ok = false; continue; }
  const id = (await pub.readContract({ address: SHOP, abi, functionName: 'itemCount' }));
  // what a marketplace reads: uri(id) -> base64 JSON -> image -> base64 SVG
  const u = await pub.readContract({ address: SHOP, abi, functionName: 'uri', args: [id] });
  const json = JSON.parse(Buffer.from(u.replace(/^data:application\/json;base64,/, ''), 'base64').toString('utf8'));
  const img = Buffer.from(json.image.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64');
  const same = Buffer.compare(img, svg) === 0;
  ok &&= same;
  totalGas += rc.gasUsed; totalBytes += svg.length;
  writeFileSync(`${OUT}/${e.file}.svg`, img);
  console.log(`  #${id} ${e.file.padEnd(18)} ${(svg.length / 1024).toFixed(1).padStart(5)} KB  gas ${rc.gasUsed.toLocaleString().padStart(11)}  picture read back ${same ? 'identical' : 'DIFFERENT'}  soulbound ${json.attributes?.find?.((a) => a.trait_type === 'soulbound')?.value ?? '?'}`);
}
console.log(`  ${editions.length} items (ids ${Number(before) + 1}-${Number(before) + editions.length}), ${(totalBytes / 1024).toFixed(1)} KB, ${totalGas.toLocaleString()} gas on the fork (Ethereum's gas schedule; at 102 gwei: ${(Number(totalGas) * 102e-9).toFixed(2)} MON)`);
if (!ok) process.exit(1);
