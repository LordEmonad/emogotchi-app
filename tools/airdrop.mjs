/**
 * Push the airdrop through EmogotchiDrop, in batches, resumably.
 *
 *   node tools/airdrop.mjs --list snapshot/tier1.csv --drop 0x… [--rpc …] [--batch 250] [--send]
 *
 * Without --send it is a dry run: it prints the batches, the gas each would take and the total cost,
 * and writes nothing. With --send it signs with a Foundry keystore — never a key on the command line,
 * in the environment, or in a chat. Point it at yours with --keystore <name>:
 *
 *   cast wallet import emogotchi --interactive     # once: paste the key at the prompt, set a password
 *   node tools/airdrop.mjs --list … --drop 0x… --keystore emogotchi --send
 *
 * With no --keystore it falls back to the agent keystore used on testnet (~/.monskills/keystore).
 *
 * Progress is written to <list>.progress.json after every confirmed batch: the batch index, the
 * transaction hash and the addresses it covered. Re-running skips anything already confirmed, so an
 * interrupted airdrop is safe to restart. It never mints to the same row twice.
 *
 * The CSV is `address,cats` (a header is allowed). A row asking for more than one cat is repeated in
 * the batch, which is what `airdrop(address[])` expects: one cat per entry.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad, monadTestnet } from 'viem/chains';
import { fileURLToPath } from 'node:url';

const abiOf = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url)), 'utf8')).abi;
const emogotchiDropAbi = abiOf('EmogotchiDrop');
const emogotchiAbi = abiOf('Emogotchi');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const LIST = opt('--list');
const DROP = opt('--drop');
const RPC = opt('--rpc', 'https://rpc.monad.xyz');
const BATCH = Number(opt('--batch', 250)); // 250 cats ≈ 26.8M gas; Monad's transaction limit is 30M
const SEND = has('--send');
const KEYSTORE = opt('--keystore');
if (!LIST || !DROP) { console.error('usage: --list <csv> --drop <0x…> [--rpc …] [--batch 250] [--keystore <name>] [--send]'); process.exit(1); }

const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
const progressPath = LIST.replace(/\.csv$/, '') + '.progress.json';

// ---- the list: one entry per cat, in file order, deduped by address (a wallet appears once)
const seen = new Set();
const rows = readFileSync(LIST, 'utf8').split(/\r?\n/).flatMap((line) => {
  const [a, n] = line.split(',');
  const addr = (a ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return [];
  const key = addr.toLowerCase();
  if (seen.has(key)) return [];
  seen.add(key);
  return Array.from({ length: Math.max(1, Number(n) || 1) }, () => getAddress(addr));
});
const batches = [];
for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
log(`${seen.size} wallets, ${rows.length} cats, ${batches.length} batches of up to ${BATCH}`);

const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : { done: {}, list: LIST, drop: DROP };
if (progress.drop.toLowerCase() !== DROP.toLowerCase()) { console.error(`progress file is for drop ${progress.drop}, not ${DROP}`); process.exit(1); }
const doneCount = Object.keys(progress.done).length;
if (doneCount) log(`resuming: ${doneCount} of ${batches.length} batches already confirmed`);

const pub = createPublicClient({ chain: RPC.includes('testnet') ? monadTestnet : monad, transport: http(RPC) });
const game = await pub.readContract({ address: DROP, abi: emogotchiDropAbi, functionName: 'GAME' });
const [operator, isSealed, supply, max] = await Promise.all([
  pub.readContract({ address: DROP, abi: emogotchiDropAbi, functionName: 'OPERATOR' }),
  pub.readContract({ address: DROP, abi: emogotchiDropAbi, functionName: 'isSealed' }),
  pub.readContract({ address: game, abi: emogotchiAbi, functionName: 'totalSupply' }),
  pub.readContract({ address: game, abi: emogotchiAbi, functionName: 'MAX_SUPPLY' }),
]);
log(`drop ${DROP} → game ${game}`);
log(`operator ${operator} · sealed ${isSealed} · supply ${supply}/${max}`);
if (isSealed) { console.error('the drop is sealed: no more cats can be minted'); process.exit(1); }
if (Number(supply) + rows.length - doneCount * BATCH > Number(max)) log(`WARNING: this list would exceed MAX_SUPPLY`);

let account = null;
if (SEND) {
  // Foundry's default keystore dir (~/.foundry/keystores) when a name is given, else the agent's testnet one
  const pk = KEYSTORE
    ? execSync(`~/.foundry/bin/cast wallet decrypt-keystore ${KEYSTORE} | awk '{print $NF}'`, { stdio: ['inherit', 'pipe', 'inherit'] }).toString().trim()
    : execSync(`~/.foundry/bin/cast wallet decrypt-keystore --keystore-dir ~/.monskills/keystore ${execSync('ls ~/.monskills/keystore | head -1').toString().trim()} --unsafe-password "" | awk '{print $NF}'`).toString().trim();
  account = privateKeyToAccount(pk);
  if (account.address.toLowerCase() !== operator.toLowerCase()) { console.error(`keystore is ${account.address}, but the drop's operator is ${operator}`); process.exit(1); }
  log(`signing as ${account.address}`);
}
const wallet = account ? createWalletClient({ account, chain: pub.chain, transport: http(RPC) }) : null;

let totalGas = 0n;
let acted = 0;
for (let i = 0; i < batches.length; i++) {
  if (progress.done[i]) continue;
  const to = batches[i];
  let gas;
  try {
    gas = await pub.estimateContractGas({ address: DROP, abi: emogotchiDropAbi, functionName: 'airdrop', args: [to], account: operator });
  } catch (e) {
    console.error(`batch ${i}: estimate failed — ${String(e.shortMessage ?? e.message).slice(0, 160)}`);
    process.exit(1);
  }
  gas += gas / 10n;
  if (gas > 30_000_000n) { console.error(`batch ${i}: ${gas} gas is over Monad's 30M transaction limit — use a smaller --batch`); process.exit(1); }
  totalGas += gas;
  acted += 1;
  if (!SEND) { log(`batch ${i}: ${to.length} cats, gas ${gas}`); continue; }
  const hash = await wallet.writeContract({ address: DROP, abi: emogotchiDropAbi, functionName: 'airdrop', args: [to], gas });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180000 });
  if (r.status !== 'success') { console.error(`batch ${i} reverted: ${hash}`); process.exit(1); }
  progress.done[i] = { hash, cats: to.length, at: new Date().toISOString() };
  writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  log(`batch ${i}/${batches.length - 1}: ${to.length} cats · ${hash}`);
}
const price = await pub.getGasPrice();
if (acted === 0) log(`nothing to do: all ${batches.length} batches are already confirmed in ${progressPath}`);
else log(`${SEND ? 'sent' : 'would send'} ${acted} batch(es) · gas ${totalGas} · about ${(Number(totalGas * price) / 1e18).toFixed(1)} MON at ${Number(price) / 1e9} gwei`);
if (!SEND && acted) log('dry run: nothing was sent. Add --send to mint.');
