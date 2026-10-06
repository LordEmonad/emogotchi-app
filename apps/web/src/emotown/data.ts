/**
 * Emotown's data. Who lives here: every pet its owner touched in the last 24 hours, from the Worker's stats fold
 * (`town` on each pet in /api/stats, derived from logs it already reads). What each one looks like right now: its
 * `state()` view and what it wears, read from the contracts. What is happening: the three games' and the shop's
 * logs, polled off the chain every couple of seconds.
 */
import type { CatView, Collection } from '@emo-pets/chain';
import { chainClient, chainCfg } from '../game/chain';
import { hasPet } from '../pets';
import { inTown } from './sim';

export type Row = { col: Collection; id: number; ts: number; what: string };
export type TownIndex = {
  rows: Row[];
  /** the fold's clock, and when it ran */
  now: number; generatedAt: string;
  /** the index carried no `town` (an older Worker): the residents were pieced together from what it does carry */
  partial: boolean;
  /** numbers for the landmarks */
  emoBurned: number; deadCats: number; neverDied: number; crowned: { col: Collection; id: number; name: string; v: number }[];
};

const COLS: { col: Collection; key: string }[] = [{ col: 'cat', key: 'cats' }, { col: 'frok', key: 'froks' }, { col: 'sahur', key: 'sahurs' }, ...(__THICCUMS__ ? [{ col: 'thiccums' as const, key: 'thiccums' }] : []), ...(__R3TARDS__ ? [{ col: 'r3tards' as const, key: 'r3tards' }] : []), ...(__EMONAD__ ? [{ col: 'emonad' as const, key: 'emonad' }] : [])];
const DAY = 86400;

type StatsPet = { town?: [number, number, string][]; recent?: { ts: number; kind: string; id?: number; a?: number }[]; burn?: { emoBurned: number }; deadNow?: number; neverDied?: number; top?: { caredPets?: { id: number; name: string; v: number }[] } };

/** The residents, from /api/stats. */
export async function loadIndex(): Promise<TownIndex> {
  const r = await fetch('/api/stats', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`stats ${r.status}`);
  const j = await r.json() as Record<string, unknown> & { now: number; generatedAt: string };
  const rows: Row[] = []; let partial = false; let emoBurned = 0; let deadCats = 0; let neverDied = 0;
  for (const { col, key } of COLS) {
    const p = j[key] as StatsPet | undefined;
    if (!p || !hasPet(col)) continue;
    emoBurned += p.burn?.emoBurned ?? 0;
    if (col === 'cat') { deadCats = p.deadNow ?? 0; neverDied = p.neverDied ?? 0; }
    if (p.town) { for (const [id, ts, what] of p.town) rows.push({ col, id, ts, what }); continue; }
    // an index from before Emotown: the latest events it carries, inside the day
    partial = true;
    const seen = new Set<number>();
    for (const e of p.recent ?? []) {
      if (e.id === undefined || e.ts < j.now - DAY || seen.has(e.id) || e.kind === 'transfer') continue;
      seen.add(e.id); rows.push({ col, id: e.id, ts: e.ts, what: e.kind === 'care' ? (['feed', 'play', 'wash', 'sleep', 'clean'][e.a ?? 0] ?? 'feed') : e.kind });
    }
  }
  // the shop burns too (80% of every paid item): the furnace's number is every contract's, like the stats page's
  emoBurned += (j.shop as { burn?: { emoBurned?: number } } | undefined)?.burn?.emoBurned ?? 0;
  rows.sort((a, b) => b.ts - a.ts);
  return { rows, now: j.now, generatedAt: j.generatedAt, partial, emoBurned, deadCats, neverDied, crowned: [] };
}

/**
 * EMO burned by everything, read from the contracts themselves: every game's `totalEmoBurned` and the shop's, the same
 * sum the burn bar shows on every other page. The index's total (above) is only what the furnace shows until this
 * answers: it is a few minutes behind by nature.
 */
export async function loadBurned(): Promise<number | null> {
  if (!chainClient) return null;
  const wei = (x: bigint) => Number(x) / 1e18;
  const [shop, ...games] = await Promise.all([chainClient.shopTotals().catch(() => null), ...chainClient.collections.map((c) => chainClient!.totals(c))]);
  return games.reduce((n, t) => n + wei(t.emoBurned), 0) + (shop ? wei(shop.emoBurned) : 0);
}

/** Everyone's current state and what they wear, one collection at a time (multicalls of 50, a hundred items a call). */
export async function loadViews(rows: { col: Collection; id: number }[]): Promise<Map<string, { view: CatView; worn: number[] }>> {
  const out = new Map<string, { view: CatView; worn: number[] }>();
  if (!chainClient) return out;
  await Promise.all(COLS.map(async ({ col }) => {
    const ids = [...new Set(rows.filter((r) => r.col === col).map((r) => r.id))];
    if (!ids.length) return;
    const [views, worn] = await Promise.all([chainClient!.catsByIds(ids, col), chainClient!.equippedMany(ids, col).catch(() => ({} as Record<number, number[]>))]);
    for (const v of views) out.set(`${col}:${v.id}`, { view: v, worn: worn[v.id] ?? [] });
  }));
  return out;
}

/** The crowned pets of every collection (the town hall's board). */
export async function loadCrowns(): Promise<{ col: Collection; id: number; score: number }[]> {
  if (!chainClient) return [];
  const out: { col: Collection; id: number; score: number }[] = [];
  await Promise.all(chainClient.collections.filter(inTown).map(async (col) => {
    try { for (const c of await chainClient!.crownList(col)) if (c.alive) out.push({ col, id: c.id, score: c.score }); } catch { /* the board just shows fewer */ }
  }));
  return out.sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ live
export type LiveEvent =
  | { kind: 'care'; col: Collection; id: number; what: 'feed' | 'play' | 'wash' | 'sleep' | 'clean' | 'wake' | 'name' | 'revive'; by: string }
  | { kind: 'pet'; col: Collection; id: number; by: string }
  | { kind: 'stunt'; col: Collection; id: number; what: 'screenshot' | 'slap' | 'squeeze' | 'burn' | 'tung' | 'bounce'; by: string }
  | { kind: 'named'; col: Collection; id: number; name: string }
  | { kind: 'mint'; col: Collection; id: number; by: string }
  | { kind: 'burn'; col: Collection | 'shop'; mon: number; emo: number }
  | { kind: 'claim'; item: number; by: string }
  | { kind: 'dress'; col: Collection; id: number; item: number; on: boolean }
  | { kind: 'crown'; col: Collection; id: number; won: boolean };

const T = {
  care: '0xb32e67b898f6bb5ba6674e4ee94c0710c672d372fcdc15197bd6182b935ccd49',
  petted: '0x801d0162ba2c37d5ce51d7ced382b93e86db873e6333bf39e1fdcd8f6a78ff45',
  named: '0x9726e950b835e1f7f4fe747cca4223de678452a4f67c102d50408e22e94e9485',
  burn: '0x410c5c259085cde81fedf70c1aa308ec839373c26e9b7ada6560a2aca0254eb6',
  abuse: '0xfa424f7122d7c0b187aa9de7b423582ee08d5938aa2ac18dca05180a057db320',
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  claimed: '0xd9cb1e2714d65a111c0f20f060176ad657496bd47a3de04ec7c3d4ca232112ac',
  equipped: '0x0da31e965e528813538c3d688c5dd9ac609964cdb58465f649ccdd26fb24f96e',
  unequipped: '0xfd4805145f510001d6963b897469589fea304dfd4e2e54c2fe73c55e3a0f4742',
  crownWon: '0xae5925c00eea010e9e240d9485c2f26dd073e809bb218e2081be1accc9efb2ea',
  crownLost: '0x3a5c5770a4f561697292b712b94e7dd15108888fefd72bda8465f6a9158272ce',
} as const;
const ACTIONS = ['feed', 'play', 'wash', 'sleep', 'clean', 'wake', 'name', 'revive'] as const;
type TownStunt = 'screenshot' | 'slap' | 'squeeze' | 'burn' | 'tung' | 'bounce';
const STUNTS: Partial<Record<Collection, readonly TownStunt[]>> = { cat: [], frok: ['screenshot', 'slap', 'squeeze', 'burn'], sahur: ['tung'], ...(__THICCUMS__ ? { thiccums: ['bounce' as const] } : {}) };   // (the town's pets only: sim.ts inTown)
const ZERO_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000';
const num = (hex: string) => Number(BigInt(hex));
const addr = (topic: string) => '0x' + topic.slice(26);
const word = (data: string, i: number) => '0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64);
const units = (hex: string) => Number(BigInt(hex) / 1_000_000_000_000_000n) / 1000;
function decodeString(data: string): string {
  try {
    const off = num(word(data, 0)) / 32; const len = num(word(data, off));
    const hex = data.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2);
    return new TextDecoder().decode(new Uint8Array(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []));
  } catch { return ''; }
}

type RawLog = { address: string; topics: string[]; data: string; blockNumber: bigint | null; logIndex: number | null };
function decode(l: RawLog, colOf: Map<string, Collection>): LiveEvent | null {
  const t = l.topics; const col = colOf.get(l.address.toLowerCase());
  if (!t[0]) return null;
  if (col) {
    const id = t[1] ? num(t[1]) : 0;
    switch (t[0]) {
      case T.care: { const a = num(t[2]!); const what = ACTIONS[a] ?? 'feed'; return { kind: 'care', col, id, what, by: addr(t[3]!) }; }
      case T.petted: return { kind: 'pet', col, id, by: addr(t[2]!) };
      case T.abuse: { const k = num(t[2]!); const what = STUNTS[col]?.[k]; return what ? { kind: 'stunt', col, id, what, by: addr(t[3]!) } : null; }
      case T.named: return { kind: 'named', col, id, name: decodeString(l.data) };
      case T.burn: return { kind: 'burn', col, mon: units(word(l.data, 0)), emo: units(word(l.data, 1)) };
      case T.transfer: return t[1] === ZERO_TOPIC ? { kind: 'mint', col, id: num(t[3]!), by: addr(t[2]!) } : null;
      case T.crownWon: return { kind: 'crown', col, id, won: true };
      case T.crownLost: return { kind: 'crown', col, id, won: false };
    }
    return null;
  }
  // the shop
  if (t[0] === T.claimed) return { kind: 'claim', item: t[1] ? num(t[1]) : 0, by: t[2] ? addr(t[2]) : '' };
  if (t[0] === T.burn) return { kind: 'burn', col: 'shop', mon: units(word(l.data, 0)), emo: units(word(l.data, 1)) };
  if ((t[0] === T.equipped || t[0] === T.unequipped) && t[1] && t[2] && t[3]) {
    const c = colOf.get(addr(t[1]).toLowerCase());
    return c ? { kind: 'dress', col: c, id: num(t[2]), item: num(t[3]), on: t[0] === T.equipped } : null;
  }
  return null;
}

/**
 * Follow the chain: every couple of seconds, the logs of the games and the shop since the last block seen. The public
 * RPC caps a range at 100 blocks; a tab that slept longer than that skips ahead rather than replaying the past.
 */
export function followChain(onEvents: (e: LiveEvent[]) => void, everyMs = 2200): () => void {
  if (!chainClient || !chainCfg) return () => {};
  const pub = chainClient.pub;
  const colOf = new Map<string, Collection>(chainClient.collections.filter(inTown).map((c) => [chainClient!.addr(c).toLowerCase(), c]));
  const address = [...colOf.keys(), ...(chainCfg.items ? [chainCfg.items.toLowerCase()] : [])] as `0x${string}`[];
  let last = 0n; let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    try {
      if (document.visibilityState === 'visible') {
        const head = await pub.getBlockNumber({ cacheTime: 0 });
        if (last === 0n || head - last > 99n) last = head - 1n;
        if (head > last) {
          const logs = await pub.getLogs({ address, fromBlock: last + 1n, toBlock: head }) as unknown as RawLog[];
          last = head;
          const evs = logs.map((l) => decode(l, colOf)).filter((e): e is LiveEvent => e !== null);
          if (evs.length) onEvents(evs);
        }
      }
    } catch { /* the next tick tries again */ }
    if (!stopped) timer = setTimeout(tick, everyMs);
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
