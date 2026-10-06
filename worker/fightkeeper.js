// Fight Club's settle watcher (the 2026-09-30 audit's one real finding). Pyth's keeper, Fortuna, retries a reveal for
// five minutes and then gives up on that request for good (process_event.rs: "retry the reveal on failure for 5
// minutes"; a restart re-scans only ~1,000 blocks, seven minutes on Monad). Meanwhile Fortuna's API serves the
// provider's revelation to anyone the moment the request is old enough, so after a single keeper miss the loser could
// learn the result and `abort` the fight a day later while the winner waits. Anyone may settle through Entropy's own
// `revealWithCallback(provider, sequence, userContribution, providerRevelation)`, and that is all this does: for every
// fight that is still Pending MIN_AGE after its accept, fetch the two contributions (the user one from Entropy's
// `Requested` log, the provider one from Fortuna) and call the reveal. Pyth's own code then runs the fight's callback
// with its full gas limit, exactly as the keeper would have. Runs from the Worker's cron (index.js `scheduled`) and
// from tools/fightclub/settle.mjs (by hand); same code, same rules.
//
// The keeper key can only ever spend its own gas (~0.05 MON a settle): the reveal moves no value and the payout goes
// wherever the fight's contract says. Losing this key loses a little gas money and nothing else.
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const CLUB_ABI = parseAbi([
  'struct FightView { uint256 id; uint8 status; address challenger; address challengerCollection; uint256 challengerPet; address opponent; uint256 stake; uint256 createdAt; uint256 expiresAt; address acceptor; address acceptorCollection; uint256 acceptorPet; uint256 acceptedAt; uint256 abortableAt; address provider; uint64 sequence; bytes32 random; uint256 foughtAt; address winner; uint256 payout; }',
  'function fightCount() view returns (uint256)',
  'function fight(uint256 id) view returns (FightView)',
]);
export const ENTROPY_ABI = parseAbi([
  'struct Request { address provider; uint64 sequenceNumber; uint32 numHashes; bytes32 commitment; uint64 blockNumber; address requester; bool useBlockhash; uint8 callbackStatus; uint16 gasLimit10k; }',
  'function getRequestV2(address provider, uint64 sequenceNumber) view returns (Request)',
  'function revealWithCallback(address provider, uint64 sequenceNumber, bytes32 userContribution, bytes32 providerContribution)',
  'event Requested(address indexed provider, address indexed caller, uint64 indexed sequenceNumber, bytes32 userContribution, uint32 gasLimit, bytes extraArgs)',
]);

const REQUESTED = ENTROPY_ABI.find((x) => x.type === 'event' && x.name === 'Requested');

export const PENDING = 3;   // FightClub.Status.Pending
export const ENTROPY = '0xD458261E832415CFd3BAE5E416FdF3230ce6F134';   // Pyth Entropy v2 on Monad
export const FORTUNA = 'https://fortuna.dourolabs.app/v1/chains/monad';
const MIN_AGE = 180;        // seconds after the accept before we step in (the keeper answers in 2-8 blocks)
const SCAN = 400;           // the newest fights looked at each run (one multicall; a viral hour is a few hundred fights)
const MAX_TX = 20;          // reveals per run (each waits for its receipt, ~1 s; the cron runs every 5 minutes)
const GAS_MARGIN = 125n;    // percent of the estimate (Monad charges the limit)
const LOG_WINDOW = 45;      // blocks either side of the accept's block searched for the Requested log (the public RPC allows 100)
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

const monad = (rpc) => ({ id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpc] } }, contracts: { multicall3: { address: MULTICALL3 } } });

/** Fortuna's answer, or null when it has none (a 403: not requested yet, or already revealed on chain). */
export function parseRevelation(body) {
  const v = body?.value;
  if (!v || typeof v.data !== 'string') return null;
  const hex = v.encoding === 'hex' || v.encoding === undefined ? v.data.replace(/^0x/, '') : v.encoding === 'base64' ? Buffer.from(v.data, 'base64').toString('hex') : null;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  return `0x${hex.toLowerCase()}`;
}

/** The block whose timestamp is at or just before `ts` (a binary search; Monad blocks are ~0.4 s apart). */
export async function blockAt(pub, ts) {
  const latest = await pub.getBlock({ blockTag: 'latest' });
  if (latest.timestamp <= ts) return latest.number;
  let lo = latest.number - BigInt(Math.ceil(Number(latest.timestamp - ts) / 0.3)) - 2000n;
  if (lo < 0n) lo = 0n;
  let hi = latest.number;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    const b = await pub.getBlock({ blockNumber: mid });
    if (b.timestamp <= ts) lo = mid; else hi = mid;
  }
  return lo;
}

/** The user contribution of a request, from Entropy's own `Requested` log for it. */
export async function userContributionOf(pub, entropy, club, provider, sequence, acceptedAt) {
  const at = await blockAt(pub, acceptedAt);
  const logs = await pub.getLogs({
    address: entropy, event: REQUESTED, args: { provider, caller: club, sequenceNumber: sequence },
    fromBlock: at > BigInt(LOG_WINDOW) ? at - BigInt(LOG_WINDOW) : 0n, toBlock: at + BigInt(LOG_WINDOW),
  });
  return logs[0]?.args?.userContribution ?? null;
}

/** The pending fights that are old enough to settle, newest first. */
export async function due(pub, club, now, minAge = MIN_AGE) {
  const n = await pub.readContract({ address: club, abi: CLUB_ABI, functionName: 'fightCount' });
  if (n === 0n) return [];
  const from = n > BigInt(SCAN) ? n - BigInt(SCAN) + 1n : 1n;
  const ids = [];
  for (let id = n; id >= from; id--) ids.push(id);
  const views = await pub.multicall({ contracts: ids.map((id) => ({ address: club, abi: CLUB_ABI, functionName: 'fight', args: [id] })), allowFailure: false });
  return views.filter((v) => v.status === PENDING && Number(now) - Number(v.acceptedAt) >= minAge);
}

/**
 * One run. `env`: { FIGHTCLUB_ADDRESS, FIGHT_KEEPER_KEY, RPC_URL?, ENTROPY_ADDRESS?, FORTUNA_BASE?, SETTLE_MIN_AGE? }.
 * Returns a summary; a fight that fails is logged and skipped, never thrown, so one cannot stall the rest.
 */
export async function settle(env, log = () => {}) {
  const club = env.FIGHTCLUB_ADDRESS;
  if (!club || !env.FIGHT_KEEPER_KEY) return { skipped: 'not configured' };
  const rpc = env.RPC_URL || 'https://rpc.monad.xyz';
  const entropy = env.ENTROPY_ADDRESS || ENTROPY;
  const fortuna = (env.FORTUNA_BASE || FORTUNA).replace(/\/$/, '');
  const minAge = env.SETTLE_MIN_AGE !== undefined ? Number(env.SETTLE_MIN_AGE) : MIN_AGE;
  const chain = monad(rpc);
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const account = privateKeyToAccount(env.FIGHT_KEEPER_KEY.trim().startsWith('0x') ? env.FIGHT_KEEPER_KEY.trim() : `0x${env.FIGHT_KEEPER_KEY.trim()}`);
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });

  const now = (await pub.getBlock({ blockTag: 'latest' })).timestamp;
  const fights = await due(pub, club, now, minAge);
  const summary = { pending: fights.length, settled: [], skipped: [], failed: [] };
  let sent = 0;
  for (const f of fights) {
    if (sent >= MAX_TX) break;
    const id = Number(f.id);
    try {
      // still Pyth's to answer? a request that is gone from Entropy's table was already revealed (the callback ran, or
      // it was refused and the fight is not pending any more), so there is nothing to settle
      const req = await pub.readContract({ address: entropy, abi: ENTROPY_ABI, functionName: 'getRequestV2', args: [f.provider, f.sequence] });
      if (req.sequenceNumber !== f.sequence || req.requester.toLowerCase() !== club.toLowerCase()) { summary.skipped.push({ id, why: 'not in Entropy (already revealed)' }); continue; }
      const u = await userContributionOf(pub, entropy, club, f.provider, f.sequence, f.acceptedAt);
      if (!u) { summary.failed.push({ id, why: 'Requested log not found' }); continue; }
      const r = await fetch(`${fortuna}/revelations/${f.sequence}?encoding=hex`, { headers: { accept: 'application/json' } });
      const p = r.ok ? parseRevelation(await r.json().catch(() => null)) : null;
      if (!p) { summary.skipped.push({ id, why: `Fortuna ${r.status}: ${r.ok ? 'no value' : (await r.text().catch(() => '')).slice(0, 120)}` }); continue; }
      const args = [f.provider, f.sequence, u, p];
      const est = await pub.estimateContractGas({ address: entropy, abi: ENTROPY_ABI, functionName: 'revealWithCallback', args, account });
      const hash = await wallet.writeContract({ address: entropy, abi: ENTROPY_ABI, functionName: 'revealWithCallback', args, gas: (est * GAS_MARGIN) / 100n });
      sent++;
      const rc = await pub.waitForTransactionReceipt({ hash, pollingInterval: 800, timeout: 60_000 });
      const after = await pub.readContract({ address: club, abi: CLUB_ABI, functionName: 'fight', args: [f.id] });
      const line = { id, hash, status: rc.status, fightStatus: Number(after.status), gasUsed: Number(rc.gasUsed) };
      if (rc.status === 'success' && after.status !== PENDING) summary.settled.push(line); else summary.failed.push(line);
      log(`fight ${id}: reveal ${hash} ${rc.status}, status now ${after.status}`);
    } catch (e) {
      summary.failed.push({ id, why: String(e?.shortMessage ?? e?.message ?? e).slice(0, 200) });
      log(`fight ${id}: ${String(e?.shortMessage ?? e).slice(0, 200)}`);
    }
  }
  return summary;
}
