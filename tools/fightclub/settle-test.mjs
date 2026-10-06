#!/usr/bin/env node
// The settle watcher (worker/fightkeeper.js) end to end, with no real money: an anvil fork of Monad mainnet, Fight Club
// deployed on it against the REAL Pyth Entropy bytecode, a provider of our own registered on Entropy (a hash chain, as
// test/FightClubFork.t.sol does) and made the default, a local stand-in for Fortuna's API that serves that chain, two
// fresh wallets that mint a frok each and fight. Then the watcher settles the pending fight through Entropy's own
// `revealWithCallback`, exactly as it would on mainnet after Pyth's keeper dropped a request.
//
//   node tools/fightclub/settle-test.mjs
//
// Checks: a fresh fight is left alone while too young; once old enough it is settled (Fought, the winner paid, the
// callback run by Pyth's code); a second run finds nothing to do (the request is gone from Entropy); a fight whose
// revelation Fortuna will not serve is skipped with nothing sent; the keeper's own MON goes only on gas.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther, formatEther, keccak256, encodeFunctionData, concat } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { settle, ENTROPY, PENDING } from '../../worker/fightkeeper.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RPC_PORT = 8562, FORTUNA_PORT = 8563;
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const TEAM = '0xB7EEE0445afc7651025b06974F3BdeEdf8840439';
const CAT = '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5', FROK = '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', SAHUR = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) { passes++; log('  ok  ', what); } else { fails++; log('  FAIL', what); } };
const procs = [];
const stop = () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stop);

const chain = defineChain({ id: 143, name: 'Monad (local fork)', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } } });
const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 300 });
const rpc = (method, params) => pub.request({ method, params });
const fund = (a, mon) => rpc('anvil_setBalance', [a, '0x' + parseEther(String(mon)).toString(16)]);
const walletOf = (key) => createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC) });

const ENTROPY_ABI = parseAbi([
  'function register(uint128 feeInWei, bytes32 commitment, bytes commitmentMetadata, uint64 chainLength, bytes uri)',
  'function setDefaultGasLimit(uint32 gasLimit)',
  'function setDefaultProvider(address newDefaultProvider)',
  'function getAdmin() view returns (address)',
  'function getDefaultProvider() view returns (address)',
]);
const CLUB = JSON.parse(readFileSync(join(ROOT, 'contracts/out/FightClub.sol/FightClub.json'), 'utf8'));
const CLUB_ABI = CLUB.abi;
const GAME = parseAbi(['function mint() returns (uint256)', 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)']);

// ---------------------------------------------------------------- the fork
log('anvil fork of Monad mainnet …');
procs.push(spawn(join(homedir(), '.foundry/bin/anvil'), ['--fork-url', 'https://rpc.monad.xyz', '--chain-id', '143', '--port', String(RPC_PORT), '--silent', '--code-size-limit', '131072'], { stdio: 'ignore' }));
for (let i = 0; i < 120; i++) { try { await pub.getChainId(); break; } catch { await sleep(1000); } }

// ---------------------------------------------------------------- our provider on the real Entropy: a hash chain
const provKey = generatePrivateKey(); const prov = privateKeyToAccount(provKey);
const LEN = 20;
const chainVals = new Array(LEN + 1);
chainVals[LEN] = keccak256(new TextEncoder().encode('settle test provider secret'));
for (let i = LEN; i > 0; i--) chainVals[i - 1] = keccak256(chainVals[i]);   // chain[i-1] = keccak(chain[i]); chain[0] is the commitment
await fund(prov.address, 10);
const provWallet = walletOf(provKey);
await pub.waitForTransactionReceipt({ hash: await provWallet.writeContract({ address: ENTROPY, abi: ENTROPY_ABI, functionName: 'register', args: [parseEther('0.4'), chainVals[0], '0x', BigInt(LEN + 1), '0x'] }) });
await pub.waitForTransactionReceipt({ hash: await provWallet.writeContract({ address: ENTROPY, abi: ENTROPY_ABI, functionName: 'setDefaultGasLimit', args: [1_000_000] }) });
const admin = await pub.readContract({ address: ENTROPY, abi: ENTROPY_ABI, functionName: 'getAdmin' });
await fund(admin, 10);
await rpc('anvil_impersonateAccount', [admin]);
await rpc('eth_sendTransaction', [{ from: admin, to: ENTROPY, data: encodeFunctionData({ abi: ENTROPY_ABI, functionName: 'setDefaultProvider', args: [prov.address] }), gas: '0x30000' }]);
await rpc('anvil_stopImpersonatingAccount', [admin]);
ok((await pub.readContract({ address: ENTROPY, abi: ENTROPY_ABI, functionName: 'getDefaultProvider' })).toLowerCase() === prov.address.toLowerCase(), 'our provider is Entropy\'s default on the fork');

// Fortuna's stand-in: serves our chain's value for a sequence, or 403 like the real one; `deny` makes it refuse
let deny = false; const served = [];
const fortuna = createServer((req, res) => {
  const m = req.url.match(/\/v1\/chains\/monad\/revelations\/(\d+)/);
  if (!m || deny) { res.writeHead(403, { 'content-type': 'text/plain' }); res.end('The request with the given sequence number has not been made yet, or the random value has already been revealed on chain.'); return; }
  const seq = Number(m[1]); served.push(seq);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ value: { encoding: 'hex', data: chainVals[seq].slice(2) } }));
});
await new Promise((r) => fortuna.listen(FORTUNA_PORT, '127.0.0.1', r));

// ---------------------------------------------------------------- Fight Club on the fork, against the real Entropy
const deployerKey = generatePrivateKey(); const deployer = privateKeyToAccount(deployerKey);
await fund(deployer.address, 100);
const deployHash = await walletOf(deployerKey).deployContract({ abi: CLUB_ABI, bytecode: CLUB.bytecode.object, args: [ENTROPY, TEAM, CAT, FROK, SAHUR] });
const club = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress;
log('Fight Club at', club);
const quote = await pub.readContract({ address: club, abi: CLUB_ABI, functionName: 'quote' });
ok(quote === parseEther('1.4'), `quote() is the provider's 0.4 + Pyth's 1 MON: ${formatEther(quote)}`);

// two players with a frok each
const players = [];
for (const name of ['alice', 'bob']) {
  const key = generatePrivateKey(); const w = walletOf(key); const a = privateKeyToAccount(key).address;
  await fund(a, 200);
  await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: FROK, abi: GAME, functionName: 'mint' }) });
  const pet = await pub.readContract({ address: FROK, abi: GAME, functionName: 'tokenOfOwnerByIndex', args: [a, 0n] });
  players.push({ name, key, w, a, pet });
}
const [alice, bob] = players;
const STAKE = parseEther('7');
async function fight() {
  const id = (await pub.readContract({ address: club, abi: CLUB_ABI, functionName: 'fightCount' })) + 1n;
  await pub.waitForTransactionReceipt({ hash: await alice.w.writeContract({ address: club, abi: CLUB_ABI, functionName: 'challenge', args: [FROK, alice.pet, '0x0000000000000000000000000000000000000000'], value: STAKE }) });
  await pub.waitForTransactionReceipt({ hash: await bob.w.writeContract({ address: club, abi: CLUB_ABI, functionName: 'accept', args: [id, FROK, bob.pet], value: STAKE + quote }) });
  return id;
}
const view = (id) => pub.readContract({ address: club, abi: CLUB_ABI, functionName: 'fight', args: [id] });

// the keeper's wallet: gas money only
const keeperKey = generatePrivateKey(); const keeper = privateKeyToAccount(keeperKey);
await fund(keeper.address, 5);
const env = { FIGHTCLUB_ADDRESS: club, FIGHT_KEEPER_KEY: keeperKey, RPC_URL: RPC, FORTUNA_BASE: `http://127.0.0.1:${FORTUNA_PORT}/v1/chains/monad` };

try {
  // 1. a fresh fight, too young: left alone
  const id1 = await fight();
  ok((await view(id1)).status === PENDING, `fight #${id1} is pending on the real Entropy (sequence ${(await view(id1)).sequence})`);
  let s = await settle({ ...env, SETTLE_MIN_AGE: '180' }, log);
  ok(s.pending === 0 && s.settled.length === 0, 'too young: nothing due, nothing sent');

  // 2. old enough: settled through Entropy's own reveal
  await rpc('evm_increaseTime', [600]); await rpc('evm_mine', []);
  const before = { a: await pub.getBalance({ address: alice.a }), b: await pub.getBalance({ address: bob.a }), k: await pub.getBalance({ address: keeper.address }) };
  s = await settle({ ...env, SETTLE_MIN_AGE: '180' }, log);
  const v1 = await view(id1);
  ok(s.pending === 1 && s.settled.length === 1 && s.failed.length === 0, `one pending fight, settled: ${JSON.stringify(s.settled[0], (_, x) => (typeof x === 'bigint' ? String(x) : x))}`);
  ok(Number(v1.status) === 4, `fight #${id1} is Fought (status ${v1.status}), winner ${v1.winner}`);
  const paid = v1.winner.toLowerCase() === alice.a.toLowerCase() ? (await pub.getBalance({ address: alice.a })) - before.a : (await pub.getBalance({ address: bob.a })) - before.b;
  ok(paid === v1.payout && v1.payout === STAKE * 2n - STAKE / 10n, `the winner was paid ${formatEther(paid)} MON (2 x 7 minus 5%)`);
  ok(served.length === 1 && served[0] === Number(v1.sequence), 'Fortuna was asked for exactly that sequence');
  const gas = before.k - (await pub.getBalance({ address: keeper.address }));
  ok(gas > 0n && gas < parseEther('0.5'), `the keeper spent only gas: ${formatEther(gas)} MON`);

  // 3. again: nothing to do (the request is gone from Entropy)
  s = await settle({ ...env, SETTLE_MIN_AGE: '180' }, log);
  ok(s.pending === 0, 'a second run finds nothing pending');

  // 4. Fortuna refuses: skipped, nothing sent, the fight stays pending
  const id2 = await fight();
  await rpc('evm_increaseTime', [600]); await rpc('evm_mine', []);
  deny = true;
  const nonceBefore = await pub.getTransactionCount({ address: keeper.address });
  s = await settle({ ...env, SETTLE_MIN_AGE: '180' }, log);
  ok(s.pending === 1 && s.skipped.length === 1 && /403/.test(s.skipped[0].why) && s.settled.length === 0, `Fortuna 403: skipped (${s.skipped[0]?.why?.slice(0, 40)}…)`);
  ok((await pub.getTransactionCount({ address: keeper.address })) === nonceBefore, 'nothing was sent');
  ok((await view(id2)).status === PENDING, `fight #${id2} still pending`);
  deny = false;
  s = await settle({ ...env, SETTLE_MIN_AGE: '0' }, log);
  ok(s.settled.length === 1 && Number((await view(id2)).status) === 4, `then settled once Fortuna answers (fight #${id2} Fought)`);
} catch (e) {
  fails++; log('ERROR', e?.shortMessage ?? e?.message ?? e);
} finally {
  fortuna.close();
  log(`${passes} passed, ${fails} failed`);
  stop();
  process.exit(fails ? 1 : 0);
}
