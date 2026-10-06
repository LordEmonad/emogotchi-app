// Every money number of Emogotchi in one table, read live (operator, 2026-10-03: "stats in one chart. all the mon and usd
// values all the emo and usd values. covering everything"). Nothing is sent anywhere; reads only.
//   node tools/money.mjs [--json]
// Sources: each contract's own counters (MON burned, MON queued, treasury/team owed, EMO burned) and balance; the stats
// index (/api/stats) for MON paid in per pet and per shop item (the contracts do not keep that sum); Fight Club fight by
// fight; MON in USD from CoinGecko; EMO priced by the same nad.fun Lens quote the burns use (1 MON in, fees included).
import { createPublicClient, http, parseAbi, formatEther } from 'viem';

const RPC = 'https://rpc.monad.xyz';
const pc = createPublicClient({ transport: http(RPC, { batch: false }) });
const GAMES = [
  ['Cats (Emogotchi)', '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5', 'cats'],
  ['inversebrah', '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', 'froks'],
  ['Tung Tung Tung Sahur', '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7', 'sahurs'],
  ['Thiccums', '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec', 'thiccums'],
  ['r3tard', '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e', 'r3tards'],
  ['Emonad', '0xcD4BF1Ea169703f810dA87680a1B8FdA64adcdF7', 'emonad'],
];
const SHOP = '0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91', FIGHT = '0x996b7Af41570a6eAd15d2749B718edD4C138cE06';
const DRIP = '0x00036BAaf671aF375f7f22664b4086b9D4bb9EF8', EMO = '0x81A224F8A62f52BdE942dBF23A56df77A10b7777';
const LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea', DEAD = '0x000000000000000000000000000000000000dEaD';
const counters = parseAbi(['function totalMonBurned() view returns (uint256)', 'function pendingBurnMon() view returns (uint256)',
  'function treasuryOwed() view returns (uint128)', 'function teamOwed() view returns (uint128)', 'function totalEmoBurned() view returns (uint256)']);
const erc20 = parseAbi(['function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);
const lens = parseAbi(['function getAmountOut(address token, uint256 amountIn, bool isBuy) view returns (address router, uint256 amountOut)']);
const fightAbi = parseAbi(['function fightCount() view returns (uint256)', 'function teamOwed() view returns (uint128)',
  'struct FightView { uint256 id; uint8 status; address challenger; address challengerCollection; uint256 challengerPet; address opponent; uint256 stake; uint256 createdAt; uint256 expiresAt; address acceptor; address acceptorCollection; uint256 acceptorPet; uint256 acceptedAt; uint256 abortableAt; address provider; uint64 sequence; bytes32 random; uint256 foughtAt; address winner; uint256 payout; }',
  'function fight(uint256 id) view returns (FightView)']);
const r = (address, abi, functionName, args = []) => pc.readContract({ address, abi, functionName, args });
const mon = (wei) => Number(formatEther(wei));

// ---- prices
const cg = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd').then((x) => x.json()).catch(() => null);
const MON_USD = cg?.monad?.usd ?? NaN;
const [, emoPerMonWei] = await r(LENS, lens, 'getAmountOut', [EMO, 10n ** 18n, true]);
const EMO_PER_MON = mon(emoPerMonWei);
const EMO_USD = MON_USD / EMO_PER_MON;

// ---- the index: MON paid in
const stats = await fetch('https://emogotchi.emonad.lol/api/stats').then((x) => x.json());

// ---- each game and the shop, from their own counters
const rows = [];
for (const [name, addr, key] of [...GAMES, ['Item shop', SHOP, 'shop']]) {
  const [burned, queued, tOwed, teamOwed, emoBurned, bal] = await Promise.all([
    r(addr, counters, 'totalMonBurned'), r(addr, counters, 'pendingBurnMon'), r(addr, counters, 'treasuryOwed'), r(addr, counters, 'teamOwed'),
    r(addr, counters, 'totalEmoBurned'), pc.getBalance({ address: addr })]);
  const monIn = key === 'shop' ? stats.shop.items.reduce((a, it) => a + (it.monIn ?? 0), 0) : stats[key].monIn;
  rows.push({ name, monIn, burned: mon(burned), queued: mon(queued), owed: mon(tOwed) + mon(teamOwed), emoBurned: mon(emoBurned), balance: mon(bal) });
}
// ---- Fight Club, fight by fight
const n = Number(await r(FIGHT, fightAbi, 'fightCount'));
let wagered = 0, paid = 0, fee = 0, fought = 0, accepted = 0;
for (let i = 1; i <= n; i++) {
  const f = await r(FIGHT, fightAbi, 'fight', [BigInt(i)]);
  const stake = mon(f.stake);
  if (f.acceptor !== '0x0000000000000000000000000000000000000000') accepted++;
  if (f.winner !== '0x0000000000000000000000000000000000000000') { fought++; wagered += 2 * stake; paid += mon(f.payout); fee += 2 * stake - mon(f.payout); }
}
const fightTeamOwed = mon(await r(FIGHT, fightAbi, 'teamOwed'));
// ---- $EMO, and the drip
const [emoSupply, emoDead, dripBal, dripNonce] = await Promise.all([r(EMO, erc20, 'totalSupply'), r(EMO, erc20, 'balanceOf', [DEAD]), pc.getBalance({ address: DRIP }), pc.getTransactionCount({ address: DRIP })]);

const T = rows.reduce((a, x) => ({ monIn: a.monIn + x.monIn, burned: a.burned + x.burned, queued: a.queued + x.queued, owed: a.owed + x.owed, emoBurned: a.emoBurned + x.emoBurned }), { monIn: 0, burned: 0, queued: 0, owed: 0, emoBurned: 0 });
const out = { at: new Date().toISOString(), MON_USD, EMO_PER_MON, EMO_USD, rows, total: T,
  fight: { challenges: n, accepted, fought, wagered, paid, fee, teamOwed: fightTeamOwed },
  emo: { supply: mon(emoSupply), dead: mon(emoDead) }, drip: { starters: dripNonce, balance: mon(dripBal) } };
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const f0 = (x) => Math.round(x).toLocaleString('en-US'), f2 = (x) => x.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const usd = (m) => `$${f2(m * MON_USD)}`, eusd = (e) => `$${f2(e * EMO_USD)}`;
console.log(`As of ${out.at} · 1 MON = $${MON_USD} · 1 MON buys ${f0(EMO_PER_MON)} EMO (nad.fun, fees in) · 1 EMO = $${EMO_USD.toPrecision(4)}\n`);
console.log('| | MON paid in | USD | MON burned | USD | MON queued to burn | EMO burned | USD |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const x of [...rows, { ...T, name: '**Total**' }]) console.log(`| ${x.name} | ${f0(x.monIn)} | ${usd(x.monIn)} | ${f0(x.burned)} | ${usd(x.burned)} | ${f2(x.queued)} | ${f0(x.emoBurned)} | ${eusd(x.emoBurned)} |`);
console.log(`\nFight Club: ${n} challenges, ${fought} fought; ${f0(wagered)} MON wagered (${usd(wagered)}), ${f2(paid)} MON paid to winners (${usd(paid)}), ${f2(fee)} MON team fee (${usd(fee)}), ${f2(fightTeamOwed)} MON of it not swept`);
console.log(`Treasury + team (internal, never in public copy): ${f2(T.owed)} MON owed now in the contracts (${usd(T.owed)}); paid in minus burned minus queued = ${f2(T.monIn - T.burned - T.queued)} MON in all (${usd(T.monIn - T.burned - T.queued)})`);
console.log(`$EMO: supply ${f0(out.emo.supply)}; at the dead address ${f0(out.emo.dead)} (${(100 * out.emo.dead / out.emo.supply).toFixed(2)}%); burned by Emogotchi ${f0(T.emoBurned)} (${(100 * T.emoBurned / out.emo.supply).toFixed(2)}% of supply)`);
console.log(`Starter drip: ${dripNonce} accounts funded; the drip wallet holds ${f2(out.drip.balance)} MON (${usd(out.drip.balance)})`);
