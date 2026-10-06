// Fight Club's local world, for the operator to play with on their own machine (SANDBOX ONLY: nothing here touches a
// public chain; the fork is anvil's, in memory, and dies with this process).
//
//   node tools/fightclub/local.mjs            (Ctrl-C stops everything)
//
// It starts:
//   - an anvil fork of Monad mainnet on 127.0.0.1:8560 (the real pets, the real shop, all of it; changes stay local)
//   - Fight Club deployed on the fork against MockEntropy (Pyth's keeper does not serve a local fork), and a local
//     keeper that answers each fight's random number ~2.5 s after it is asked, with a real random number
//   - a faucet on 127.0.0.1:8561: any address gets 10,000 fork MON and a free inversebrah and Sahur (anvil mints them
//     as that address, no key needed); the page shows a button for it
//   - a bot opponent with its own pets: it keeps a 10 MON challenge up for you to take, and takes yours after a few
//     seconds (BOT=0 turns it off, so two people can fight each other)
//   - the site on http://localhost:5261 pointed at all of that (the live drip and referrals are refused locally)
//
// Then open http://localhost:5261/fightclub, connect (the passkey option works on localhost: Touch ID), press "Get test
// MON and pets", and fight. A second browser profile makes a second player.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther, formatEther, getAddress, isAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RPC_PORT = 8560, FAUCET_PORT = 8561, SITE_PORT = 5261;
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const TEAM = '0xB7EEE0445afc7651025b06974F3BdeEdf8840439';
const CAT = '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5', FROK = '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', SAHUR = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';
const BOT = process.env.BOT !== '0';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const stop = () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stop); process.on('SIGINT', () => process.exit(0));

const chain = defineChain({ id: 143, name: 'Monad (local fork)', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 400 });
const rpc = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const art = (file, name) => { const j = JSON.parse(readFileSync(join(ROOT, 'contracts/out', file, `${name}.json`), 'utf8')); return { abi: j.abi, bytecode: j.bytecode.object }; };
const GAME = parseAbi(['function mint() returns (uint256)', 'function hasMinted(address) view returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)']);

// ---------------------------------------------------------------- the fork
log('starting the fork of Monad mainnet …');
procs.push(spawn(join(homedir(), '.foundry/bin/anvil'), ['--fork-url', 'https://rpc.monad.xyz', '--chain-id', '143', '--port', String(RPC_PORT), '--silent', '--code-size-limit', '131072', '--block-time', '1'], { stdio: 'ignore' }));
for (let i = 0; ; i++) { try { await rpc('eth_blockNumber'); break; } catch { if (i > 120) throw new Error('anvil did not start'); await sleep(500); } }

// a deployer and a keeper and a bot: fresh keys every run (never anvil's default accounts: some have 7702 code on Monad)
const who = () => privateKeyToAccount(generatePrivateKey());
const deployer = who(), keeper = who(), bot = who();
for (const a of [deployer, keeper, bot]) await rpc('anvil_setBalance', [a.address, '0x' + parseEther('100000').toString(16)]);
const wallet = (a) => createWalletClient({ account: a, chain, transport: http(RPC) });

const E = art('MockEntropy.sol', 'MockEntropy');
const F = art('FightClub.sol', 'FightClub');
const deploy = async (c, args = []) => { const hash = await wallet(deployer).deployContract({ abi: c.abi, bytecode: c.bytecode, args }); const r = await pub.waitForTransactionReceipt({ hash }); return r.contractAddress; };
const ENTROPY = await deploy(E);
const FIGHT = await deploy(F, [ENTROPY, TEAM, CAT, FROK, SAHUR]);
log('MockEntropy', ENTROPY); log('FightClub  ', FIGHT);

// ---------------------------------------------------------------- the keeper: every request answered ~2.5 s later
let fromBlock = await pub.getBlockNumber();
setInterval(async () => {
  try {
    const to = await pub.getBlockNumber(); if (to < fromBlock) return;
    const logs = await pub.getContractEvents({ address: ENTROPY, abi: E.abi, eventName: 'Requested', fromBlock, toBlock: to });
    fromBlock = to + 1n;
    for (const l of logs) {
      const seq = l.args.sequenceNumber;
      setTimeout(async () => {
        const random = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}`;
        try { const h = await wallet(keeper).writeContract({ address: ENTROPY, abi: E.abi, functionName: 'reveal', args: [seq, random], gas: 2_000_000n }); await pub.waitForTransactionReceipt({ hash: h }); log(`keeper: fight's random number #${seq} → ${random.slice(0, 10)}… (${BigInt(random) % 2n === 0n ? 'challenger' : 'acceptor'} wins)`); }
        catch (e) { log('keeper: reveal failed', String(e?.shortMessage ?? e).slice(0, 120)); }
      }, 2500);
    }
  } catch (e) { log('keeper: poll failed', String(e?.shortMessage ?? e).slice(0, 120)); }
}, 1000);

// ---------------------------------------------------------------- pets for anyone: minted AS them on the fork
async function asThem(address, fn) {
  await rpc('anvil_impersonateAccount', [address]);
  try { return await fn(); } finally { await rpc('anvil_stopImpersonatingAccount', [address]); }
}
async function giveFreePets(address) {
  const out = [];
  for (const [game, name] of [[FROK, 'inversebrah'], [SAHUR, 'Sahur']]) {
    if (await pub.readContract({ address: game, abi: GAME, functionName: 'hasMinted', args: [address] })) continue;
    await asThem(address, async () => {
      const hash = await rpc('eth_sendTransaction', [{ from: address, to: game, data: '0x1249c58b', gas: '0x61a80' }]);   // mint()
      await pub.waitForTransactionReceipt({ hash });
    });
    const n = await pub.readContract({ address: game, abi: GAME, functionName: 'balanceOf', args: [address] });
    const id = await pub.readContract({ address: game, abi: GAME, functionName: 'tokenOfOwnerByIndex', args: [address, n - 1n] });
    out.push(`${name} #${id}`);
  }
  return out;
}
createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const u = new URL(req.url, 'http://x');
  const a = u.searchParams.get('address') ?? '';
  if (u.pathname !== '/fund' || !isAddress(a, { strict: false })) { res.statusCode = 400; res.end('{"error":"GET /fund?address=0x…"}'); return; }
  try {
    const address = getAddress(a);
    await rpc('anvil_setBalance', [address, '0x' + parseEther('10000').toString(16)]);
    const pets = await giveFreePets(address);
    log(`faucet: ${address} got 10,000 MON${pets.length ? ` and ${pets.join(', ')}` : ''}`);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, mon: 10000, pets }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e?.message ?? e).slice(0, 200) })); }
}).listen(FAUCET_PORT, '127.0.0.1');

// ---------------------------------------------------------------- the bot
const FC = F.abi;
async function botPets() {
  const pets = [];
  for (const [game, col] of [[FROK, FROK], [SAHUR, SAHUR]]) {
    const n = Number(await pub.readContract({ address: game, abi: GAME, functionName: 'balanceOf', args: [bot.address] }));
    for (let i = 0; i < n; i++) pets.push({ col, id: await pub.readContract({ address: game, abi: GAME, functionName: 'tokenOfOwnerByIndex', args: [bot.address, BigInt(i)] }) });
  }
  return pets;
}
if (BOT) {
  await giveFreePets(bot.address);
  log('bot:', bot.address, (await botPets()).map((p) => `${p.col === FROK ? 'inversebrah' : 'Sahur'} #${p.id}`).join(', '));
  const seenAt = new Map();
  setInterval(async () => {
    try {
      const pets = await botPets();
      const free = [];
      for (const p of pets) if (Number(await pub.readContract({ address: FIGHT, abi: FC, functionName: 'activeFightOf', args: [p.col, p.id] })) === 0) free.push(p);
      const n = Number(await pub.readContract({ address: FIGHT, abi: FC, functionName: 'openCount' }));
      const open = n ? await pub.readContract({ address: FIGHT, abi: FC, functionName: 'openChallenges', args: [0n, BigInt(n)] }) : [];
      // take a player's challenge after it has been up a few seconds
      for (const f of open) {
        if (f.challenger.toLowerCase() === bot.address.toLowerCase()) continue;
        if (f.opponent !== '0x0000000000000000000000000000000000000000' && f.opponent.toLowerCase() !== bot.address.toLowerCase()) continue;
        const first = seenAt.get(f.id) ?? Date.now(); seenAt.set(f.id, first);
        if (Date.now() - first < 5000 || !free.length) continue;
        const p = free.shift();
        const fee = await pub.readContract({ address: FIGHT, abi: FC, functionName: 'quote' });
        const h = await wallet(bot).writeContract({ address: FIGHT, abi: FC, functionName: 'accept', args: [f.id, p.col, p.id], value: f.stake + fee, gas: 700_000n });
        await pub.waitForTransactionReceipt({ hash: h });
        log(`bot: took fight #${f.id} (${formatEther(f.stake)} MON a side)`);
      }
      // keep one challenge of its own up, for someone to take
      if (!open.some((f) => f.challenger.toLowerCase() === bot.address.toLowerCase()) && free.length) {
        const p = free[0];
        const h = await wallet(bot).writeContract({ address: FIGHT, abi: FC, functionName: 'challenge', args: [p.col, p.id, '0x0000000000000000000000000000000000000000'], value: parseEther('10'), gas: 500_000n });
        await pub.waitForTransactionReceipt({ hash: h });
        log('bot: put up a 10 MON challenge');
      }
    } catch (e) { log('bot:', String(e?.shortMessage ?? e).slice(0, 160)); }
  }, 3000);
}

// ---------------------------------------------------------------- the site
const vite = spawn('npx', ['vite', '--port', String(SITE_PORT), '--strictPort'], {
  cwd: join(ROOT, 'apps/web'), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FIGHTCLUB_LOCAL: '1', VITE_RPC_URL: RPC, VITE_FIGHTCLUB_ADDRESS: FIGHT, VITE_FIGHT_FAUCET: `http://127.0.0.1:${FAUCET_PORT}`, VITE_PASSKEY: 'on' },
});
procs.push(vite);
for (let i = 0; ; i++) { try { if ((await fetch(`http://localhost:${SITE_PORT}/fightclub`)).ok) break; } catch { /* not yet */ } if (i > 240) throw new Error('the site did not start'); await sleep(500); }
log('');
log(`Fight Club, locally:  http://localhost:${SITE_PORT}/fightclub`);
log(`the lab:              http://localhost:${SITE_PORT}/fightlab    the town: http://localhost:${SITE_PORT}/emotown?at=arena`);
log('connect (passkey works here), press "Get test MON and pets", and fight. Ctrl-C stops everything.');
