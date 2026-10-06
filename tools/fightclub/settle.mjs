#!/usr/bin/env node
// Fight Club: settle by hand any fight Pyth's keeper dropped (the same code the Worker's cron runs: worker/fightkeeper.js).
//
//   FIGHTCLUB_ADDRESS=0x… FIGHT_KEEPER_KEY=0x… node tools/fightclub/settle.mjs            # settle what is due
//   FIGHTCLUB_ADDRESS=0x… node tools/fightclub/settle.mjs --dry                            # only list what is due
//   FIGHTCLUB_ADDRESS=0x… FIGHT_KEEPER_KEY=0x… node tools/fightclub/settle.mjs --watch    # once a minute, for ever
//
// The key is a wallet holding gas money only (a reveal moves no value; ~0.05 MON each). RPC_URL, SETTLE_MIN_AGE
// (seconds after the accept, default 180), FORTUNA_BASE and ENTROPY_ADDRESS may be overridden for a local fork.
import { createPublicClient, http } from 'viem';
import { settle, due, CLUB_ABI } from '../../worker/fightkeeper.js';

const env = process.env;
if (!env.FIGHTCLUB_ADDRESS) { console.error('FIGHTCLUB_ADDRESS is required'); process.exit(2); }
if (process.argv.includes('--dry')) {
  const rpc = env.RPC_URL || 'https://rpc.monad.xyz';
  const pub = createPublicClient({ chain: { id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpc] } }, contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } } }, transport: http(rpc) });
  const now = (await pub.getBlock({ blockTag: 'latest' })).timestamp;
  const list = await due(pub, env.FIGHTCLUB_ADDRESS, now, env.SETTLE_MIN_AGE !== undefined ? Number(env.SETTLE_MIN_AGE) : undefined);
  console.log(`${list.length} pending fight(s) due:`, list.map((f) => `#${f.id} seq ${f.sequence} accepted ${Number(now) - Number(f.acceptedAt)} s ago`).join(', ') || 'none');
  void CLUB_ABI;
  process.exit(0);
}
if (!env.FIGHT_KEEPER_KEY) { console.error('FIGHT_KEEPER_KEY is required (or --dry)'); process.exit(2); }
const say = (m) => console.log(new Date().toISOString().slice(11, 19), m);
const once = async () => { const s = await settle(env, say); if (s.pending || s.failed?.length) console.log(JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 1)); return s; };
// --watch: keep going, once a minute (the Worker's cron, by hand, for a test on the operator's own machine)
if (process.argv.includes('--watch')) {
  say('watching; Ctrl-C stops');
  for (;;) { try { await once(); } catch (e) { say(`error: ${String(e).slice(0, 200)}`); } await new Promise((r) => setTimeout(r, 60_000)); }
}
const s = await once();
process.exit(s.failed?.length ? 1 : 0);
