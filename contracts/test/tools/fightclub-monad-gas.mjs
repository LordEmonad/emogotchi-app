// Fight Club's gas on the REAL Monad node, not forge's EVM schedule (Monad prices cold state far higher: a cold
// account 10,100, a cold slot 8,100). Read-only: every number is an eth_estimateGas against rpc.monad.xyz with a state
// override that puts Fight Club's code and storage at an unused address. Nothing is signed or sent.
//
//   cd contracts
//   ~/.foundry/bin/forge test --match-test test_fork_dumpStateForMonadGas --fork-url https://rpc.monad.xyz -vv > /tmp/fc-dump.txt
//   node test/tools/fightclub-monad-gas.mjs /tmp/fc-dump.txt
//
// The dump (FightClubFork.t.sol) holds Fight Club's runtime code (bound to the live Entropy, team and pets) and every
// slot it wrote after (S1) one open challenge, (S2) two, (S3) the second accepted. The pets and owners are real.
import { readFileSync } from 'node:fs';

const RPC = process.env.RPC ?? 'https://rpc.monad.xyz';
const ENTROPY = '0xD458261E832415CFd3BAE5E416FdF3230ce6F134';
const CATS = '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5';
const SAHURS = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';
const FROKS = '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6';
const CLUB = '0x00000000000000000000000000000000f16c1ab0'; // unused on Monad (checked below)
const LOCK_SLOT = '0x' + '0b'.padStart(64, '0');
const E = 10n ** 18n;

const text = readFileSync(process.argv[2], 'utf8');
const code = text.match(/CODE (0x[0-9a-f]+)/)[1];
const pets = {};
for (const m of text.matchAll(/PETS (\w+) (\d+) (0x[0-9a-fA-F]{40})/g)) pets[m[1]] = { id: BigInt(m[2]), owner: m[3] };
const [, seq, fightId] = text.match(/SEQ (\d+) (\d+)/);
const state = { S0: {}, S1: {}, S2: {}, S3: {} };
for (const m of text.matchAll(/(S[0-3]) (0x[0-9a-f]{64}) (0x[0-9a-f]{64})/g)) state[m[1]][m[2]] = m[3];
for (const k of Object.keys(state)) state[k][LOCK_SLOT] ??= '0x' + '1'.padStart(64, '0');

const hex = (n) => '0x' + n.toString(16);
const word = (v) => BigInt(v).toString(16).padStart(64, '0');
const addr = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function estimate(label, { from, data, value = 0n, st, clubBalance, extra = {} }) {
  const override = {
    [CLUB]: { code, balance: hex(clubBalance), stateDiff: st },
    [from]: { balance: hex(10_000n * E) },
    ...extra,
  };
  const tx = { from, to: CLUB, data, value: hex(value) };
  const g = BigInt(await rpc('eth_estimateGas', [tx, 'latest', override]));
  const bytes = Buffer.from(data.slice(2), 'hex');
  const intrinsic = 21000n + [...bytes].reduce((s, b) => s + (b === 0 ? 4n : 16n), 0n);
  console.log(`${label.padEnd(58)} ${g.toString().padStart(8)}   (execution ${g - intrinsic})`);
  return g;
}

// selectors, from `cast sig` (node's crypto has no keccak)
const SEL = {
  challenge: '0x8913d512', // challenge(address,uint256,address)
  accept: '0x00b6b707', // accept(uint256,address,uint256)
  cancel: '0x40e58ee5', // cancel(uint256)
  abort: '0xe50701f4', // abort(uint256)
  callback: '0x52a5f1f8', // _entropyCallback(uint64,address,bytes32)
  sweep: '0x35faa416', // sweep()
};

const main = async () => {
  if ((await rpc('eth_getCode', [CLUB, 'latest'])) !== '0x') throw new Error('CLUB address is in use');
  const provider = await rpc('eth_call', [{ to: ENTROPY, data: '0x82ee990c' }, 'latest']);
  const fee = BigInt(await rpc('eth_call', [{ to: ENTROPY, data: '0x7ab2ac36' + provider.slice(2) + word(1_000_000) }, 'latest']));
  console.log(`Monad node ${RPC}, block ${BigInt(await rpc('eth_blockNumber', []))}; Entropy fee ${Number(fee) / 1e18} MON`);
  console.log(`${'call'.padEnd(58)} ${'estimate'.padStart(8)}`);
  const { cat, sahur, frok } = pets;
  const stake = 5n * E;

  await estimate('challenge, the first ever (every slot fresh)', {
    from: frok.owner, value: stake, st: state.S0, clubBalance: 0n,
    data: SEL.challenge + addr(FROKS) + word(frok.id) + addr('0x0'),
  });
  await estimate('challenge (after another one exists)', {
    from: cat.owner, value: stake, st: state.S1, clubBalance: stake,
    data: SEL.challenge + addr(CATS) + word(cat.id) + addr('0x0'),
  });
  await estimate('cancel by the challenger (refund pushed)', {
    from: cat.owner, st: state.S2, clubBalance: 2n * stake,
    data: SEL.cancel + word(fightId),
  });
  await estimate('accept (the live Entropy requestV2 inside)', {
    from: sahur.owner, value: stake + fee, st: state.S2, clubBalance: 2n * stake,
    data: SEL.accept + word(fightId) + addr(SAHURS) + word(sahur.id),
  });
  await estimate('accept with 1 MON over (refund pushed)', {
    from: sahur.owner, value: stake + fee + E, st: state.S2, clubBalance: 2n * stake,
    data: SEL.accept + word(fightId) + addr(SAHURS) + word(sahur.id),
  });
  const cb = (random) => SEL.callback + word(seq) + addr(provider.slice(-40)) + word(random);
  await estimate('callback, the challenger (an EOA) wins', { from: ENTROPY, st: state.S3, clubBalance: 3n * stake, data: cb(2n) });
  await estimate('callback, the acceptor (an EOA) wins', { from: ENTROPY, st: state.S3, clubBalance: 3n * stake, data: cb(3n) });
  // worst case: the winner is a contract that burns every gas it is given (the 50,000 cap), so it is credited instead
  await estimate('callback, WORST: winner burns its 50k and is credited', {
    from: ENTROPY, st: state.S3, clubBalance: 3n * stake, data: cb(2n),
    extra: { [cat.owner]: { code: '0x5b600056', balance: hex(10_000n * E) } },
  });
  // abort: the same pending fight, accepted two hours ago
  const s3 = { ...state.S3 };
  const slots = Object.keys(s3);
  const provSlot = slots.find((k) => s3[k].endsWith(provider.slice(-40).toLowerCase()) && s3[k] !== state.S0[k] && BigInt(s3[k]) >> 160n !== 0n);
  const v = BigInt(s3[provSlot]);
  const acceptedAt = (v >> 160n) & ((1n << 40n) - 1n);
  s3[provSlot] = '0x' + word((v & ((1n << 160n) - 1n)) | ((acceptedAt - 7200n) << 160n));
  await estimate('abort after the timeout (two refunds pushed)', { from: cat.owner, st: s3, clubBalance: 3n * stake, data: SEL.abort + word(fightId) });
  // sweep: 0.5 MON of team cut owed, pushed to the real team wallet (an EIP-7702 account)
  const swept = { ...state.S3, ['0x' + word(10)]: '0x' + word((E / 2n) << 128n) };
  await estimate('sweep to TEAM', { from: frok.owner, st: swept, clubBalance: 3n * stake + E / 2n, data: SEL.sweep });
};
main().catch((e) => { console.error(e); process.exit(1); });
