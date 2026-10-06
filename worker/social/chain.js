/**
 * What the social layer asks the chain: does this address hold a named pet (the gate for chat and DMs), and does it
 * own the pet it wants as its avatar. Reads only, through Multicall3, so a whole wallet is two or three eth_calls.
 */
import { createPublicClient, http, parseAbi } from 'viem';

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const GAMES = {
  cat: '0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5',
  frok: '0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6',
  sahur: '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7',
  thiccums: '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec',
  r3tards: '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e',
  emonad: '0xcD4BF1Ea169703f810dA87680a1B8FdA64adcdF7',
};
export const COLS = ['cat', 'frok', 'sahur', 'thiccums', 'r3tards', 'emonad'];
const ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
  'function nameOf(uint256) view returns (string)',
  'function ownerOf(uint256) view returns (address)',
]);
/** how many of one wallet's pets are looked at per collection (the most recently acquired are last; all are read) */
const SCAN = 200;

let cached = null;
export function publicClient(env) {
  const url = env.RPC_URL || 'https://rpc.monad.xyz';
  if (cached?.url === url) return cached.client;
  const chain = { id: Number(env.CHAIN_ID || 143), name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [url] } }, contracts: { multicall3: { address: MULTICALL3 } } };
  const client = createPublicClient({ chain, transport: http(url, { timeout: 8000, retryCount: 1 }) });
  cached = { url, client };
  return client;
}

/**
 * The first NAMED pet this address holds right now, or null. Throws if the chain cannot be read (the caller decides
 * what a failed read means; it is never read as "no").
 */
export async function findNamedPet(env, address, skip = null) {
  const pub = publicClient(env);
  const bals = await pub.multicall({ contracts: COLS.map((col) => ({ address: GAMES[col], abi: ABI, functionName: 'balanceOf', args: [address] })), allowFailure: false });
  const want = COLS.map((col, i) => ({ col, n: Math.min(SCAN, Number(bals[i])) })).filter((w) => w.n > 0);
  if (!want.length) return null;
  const idCalls = want.flatMap((w) => Array.from({ length: w.n }, (_, i) => ({ col: w.col, call: { address: GAMES[w.col], abi: ABI, functionName: 'tokenOfOwnerByIndex', args: [address, BigInt(i)] } })));
  const ids = await pub.multicall({ contracts: idCalls.map((c) => c.call), allowFailure: true });
  const pets = idCalls.map((c, i) => ({ col: c.col, id: ids[i].status === 'success' ? Number(ids[i].result) : 0 })).filter((p) => p.id > 0);
  if (!pets.length) return null;
  const names = await pub.multicall({ contracts: pets.map((p) => ({ address: GAMES[p.col], abi: ABI, functionName: 'nameOf', args: [BigInt(p.id)] })), allowFailure: true });
  for (let i = 0; i < pets.length; i++) {
    const n = names[i].status === 'success' ? String(names[i].result ?? '').trim() : '';
    if (n && !skip?.(pets[i].col, pets[i].id)) return { col: pets[i].col, id: pets[i].id, name: n.slice(0, 64) };
  }
  return null;
}

/** Up to `max` pet ids per collection that this address holds: { cat: [..], frok: [..], sahur: [..] }. */
export async function petIdsOf(env, address, max = 60) {
  const pub = publicClient(env);
  const bals = await pub.multicall({ contracts: COLS.map((col) => ({ address: GAMES[col], abi: ABI, functionName: 'balanceOf', args: [address] })), allowFailure: false });
  const calls = COLS.flatMap((col, i) => Array.from({ length: Math.min(max, Number(bals[i])) }, (_, k) => ({ col, call: { address: GAMES[col], abi: ABI, functionName: 'tokenOfOwnerByIndex', args: [address, BigInt(k)] } })));
  const out = { cat: [], frok: [], sahur: [], thiccums: [], r3tards: [], emonad: [] };
  if (!calls.length) return out;
  const ids = await pub.multicall({ contracts: calls.map((c) => c.call), allowFailure: true });
  calls.forEach((c, i) => { if (ids[i].status === 'success') out[c.col].push(Number(ids[i].result)); });
  return out;
}

/** Who owns this pet now (lowercased), or null if it does not exist. */
export async function ownerOfPet(env, col, id) {
  if (!GAMES[col] || !Number.isSafeInteger(id) || id <= 0) return null;
  try {
    const o = await publicClient(env).readContract({ address: GAMES[col], abi: ABI, functionName: 'ownerOf', args: [BigInt(id)] });
    return String(o).toLowerCase();
  } catch (e) {
    // a revert means no such token; anything else (the RPC is down) must not look like "not yours"
    if (/revert|InvalidToken/i.test(String(e?.shortMessage ?? e?.message ?? e))) return null;
    throw e;
  }
}
