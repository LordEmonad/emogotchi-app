import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  fallback,
  createWalletClient,
  custom,
  encodeAbiParameters,
  formatEther,
  http,
  type EIP1193Provider,
  type PublicClient,
  type Transport,
} from 'viem';
import { emogotchiAbi, emogotchiDropAbi, emogotchiItemsAbi, inversegotchiAbi, sahuragotchiAbi, thiccumsgotchiAbi, r3tardgotchiAbi, emonadgotchiAbi } from './abi';
import type { Address, ChainConfig } from './config';

/** Which pet contract a token lives in: the cat (Emogotchi), inversebrah (Inversegotchi), Sahur (Sahuragotchi) or, once
 *  launched, Thiccums (Thiccumsgotchi). Every mention of the fourth is behind the build's `__THICCUMS__` switch (his
 *  address, '' until launch): with it empty the minifier drops each one, so a build carries nothing of him. */
export type Collection = 'cat' | 'frok' | 'sahur' | 'thiccums' | 'r3tards' | 'emonad';   // (r3tards: r3tardgotchi, the fifth pet, behind `__R3TARDS__` the same way; he has no stunt. emonad: Emonadgotchi, the sixth, behind `__EMONAD__`; no stunt either)
export const COLLECTIONS: Collection[] = ['cat', 'frok', 'sahur', ...(__THICCUMS__ ? ['thiccums' as const] : []), ...(__R3TARDS__ ? ['r3tards' as const] : []), ...(__EMONAD__ ? ['emonad' as const] : [])];
/** The free-care pets (everything but naming is gas only). */
export const FREE: ReadonlySet<Collection> = new Set<Collection>(['frok', 'sahur', ...(__THICCUMS__ ? ['thiccums' as const] : []), ...(__R3TARDS__ ? ['r3tards' as const] : []), ...(__EMONAD__ ? ['emonad' as const] : [])]);
/** inversebrah's four abuses, in the contract's order, Sahur's one stunt and Thiccums' one. */
export type AbuseKind = 'screenshot' | 'slap' | 'squeeze' | 'burn' | 'tung' | 'bounce';
export const ABUSE_CODE = { screenshot: 'screenshot', slap: 'slap', squeeze: 'squeeze', burn: 'ignite', tung: 'tung', ...(__THICCUMS__ ? { bounce: 'bounce' } : {}) } as Record<AbuseKind, 'screenshot' | 'slap' | 'squeeze' | 'ignite' | 'tung' | 'bounce'>;
/** Which pet a stunt belongs to. */
export const STUNT_OF = { screenshot: 'frok', slap: 'frok', squeeze: 'frok', burn: 'frok', tung: 'sahur', ...(__THICCUMS__ ? { bounce: 'thiccums' } : {}) } as Record<AbuseKind, Collection>;

/** One pet, as its contract reports it (`state(id)`), with bigints and packed ints turned into numbers. */
export type CatView = {
  col: Collection;
  id: number;
  owner: Address;
  name: string;
  started: boolean;
  alive: boolean;
  asleep: boolean;
  poop: boolean;
  crowned: boolean;
  crownEligible: boolean;
  food: number;
  clean: number;
  fun: number;
  energy: number;
  mood: Mood;
  streak: number;
  /** 0..100 with two decimals */
  score: number;
  day: number;
  mintedAt: number;
  startsAt: number;
  bornAt: number;
  deadAt: number;
  poopAt: number;
  wakesAt: number;
  diesAt: number;
  feeds: number;
  washes: number;
  plays: number;
  naps: number;
  cleanups: number;
  pets: number;
  names: number;
  deaths: number;
  revives: number;
  /** wei */
  monPaid: bigint;
  /** inversebrah's abuses (0 on a cat) */
  screenshots: number;
  slaps: number;
  squeezes: number;
  burns: number;
  /** Sahur's stunt (0 on the others) */
  tungs: number;
  /** Thiccums' stunt (only set when the build knows him) */
  bounces?: number;
};

export const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'] as const;
export type Mood = (typeof MOODS)[number];

export type DropView = {
  root: `0x${string}`; start: number; end: number; cap: number; claimed: number; left: number; sealed: boolean; airdropped: number;
  hasClaimed: boolean;
};

export type Totals = { emoBurned: bigint; monBurned: bigint; pendingBurnMon: bigint; totalSupply: number };

/** One item type in the shop, as `catalogue()` reports it. */
export type ItemKind = 'cosmetic' | 'scene' | 'passive' | 'consumable';
export const ITEM_KINDS: ItemKind[] = ['cosmetic', 'cosmetic', 'scene', 'passive', 'consumable']; // index = the contract's enum (0 = none)
export type ItemView = {
  id: number;
  name: string;
  description: string;
  /** wei per copy; 0 = free */
  price: bigint;
  /** 0 = unlimited */
  maxSupply: number;
  /** claims per key (the wallet, or the cat for the witch's gate); 0 = unlimited */
  perKey: number;
  minted: number;
  opens: number;
  closes: number;
  kind: ItemKind;
  slot: number;
  soulbound: boolean;
  sealed: boolean;
  gate: Address;
  /** copies still to be made; null = unlimited */
  remaining: number | null;
};
/** `canClaim`'s answer. `reason`: 0 fine, 1 no item, 2 sealed, 3 not open, 4 closed, 5 sold out, 6 not eligible, 7 cap reached. */
export type ClaimCheck = { ok: boolean; reason: number; key: `0x${string}`; due: bigint };
export const CLAIM_REASON: Record<number, string> = {
  0: '', 1: 'No such item.', 2: 'Sealed: no more will ever be made.', 3: 'Not open yet.', 4: 'Closed.', 5: 'Sold out.',
  6: 'Not eligible.', 7: 'Already claimed.',
};
export type CrownEntry = { id: number; score: number; streak: number; alive: boolean };
export type CareAction = 'feed' | 'play' | 'wash' | 'sleep' | 'clean';
export const ACTION_CODE: Record<CareAction, number> = { feed: 0, play: 1, wash: 2, sleep: 3, clean: 4 };

export const PRICE = 1_000_000_000_000_000_000n;
export const NAME_PRICE = 10n * PRICE;
export const REVIVE_PRICE = 1000n * PRICE;

/**
 * Gas limits. Monad charges the limit, not the usage, so each write is estimated for its real path
 * and sent with a 10% margin; these are the floors, from testnet measurements (first feed 174k, play
 * 143k, pet 48k, name 92k, crank 195k), in case an estimate comes back low.
 */
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * A pace for requests: at most `max` in flight and at least `gapMs` between starts. It sits on each RPC endpoint's HTTP
 * requests (rpcTransport below), not on each read: reads that start together are merged into one Multicall3 call by
 * the client first, and only what actually goes over the wire is paced.
 */
class Limiter {
  private active = 0;
  private last = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max = 5, private readonly gapMs = 80) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => { this.queue.push(resolve); this.pump(); });
    const wait = this.gapMs - (Date.now() - this.last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    try { return await fn(); } finally { this.active -= 1; this.pump(); }
  }
  private pump(): void {
    while (this.active < this.max && this.queue.length) { this.active += 1; this.queue.shift()!(); }
  }
}
/** above this many pets, read them a page at a time so one eth_call cannot exceed the node's gas cap */
const CATS_UNPAGED = 200;
const CATS_PAGE = 100;

const GAS_FLOOR: Record<string, bigint> = {
  feed: 120_000n, play: 120_000n, wash: 120_000n, sleep: 120_000n, clean: 120_000n, care: 120_000n,
  wake: 60_000n, pet: 60_000n, setName: 100_000n, revive: 120_000n, crankBurn: 220_000n, sweep: 140_000n, poke: 80_000n,
  // inversebrah (his first care and his abuses touch a fresh pet's slots; mint writes the owner list)
  mint: 250_000n, screenshot: 100_000n, slap: 100_000n, squeeze: 100_000n, ignite: 100_000n, tung: 100_000n,
  // the shop (live measurements: claim with the cat id 75k, equipMany three cats 222k)
  claim: 160_000n, equip: 120_000n, equipMany: 120_000n, unequip: 80_000n,
  transferFrom: 150_000n, safeTransferFrom: 180_000n,
};

export class ChainError extends Error {
  constructor(message: string, readonly code: 'rejected' | 'reverted' | 'network' | 'wallet' = 'network') {
    super(message);
  }
}

/** A call the wallet cannot pay for, in numbers: `need` covers the value, Monad's 10 MON reserve on a smart account, and
 *  a little gas; `gasOnly` when the call itself is free (a frok's care, a mint) and only its gas was short. */
export type Shortfall = { address: Address; value: bigint; have: bigint; need: bigint; smart: boolean; gasOnly: boolean };

/** The same refusal as always (same words, same code, so every page shows what it showed before), carrying the numbers
 *  for "Add MON from another chain" (CROSSCHAIN.md). */
export class ShortfallError extends ChainError {
  constructor(message: string, readonly shortfall: Shortfall) { super(message, 'wallet'); }
}

/** Set on the client by the site only while "Add MON from another chain" is switched on (VITE_TOPUP). `notify` hears every
 *  shortfall; `checkGas` says whether a free call should also be checked for its gas first (not for a wallet the site
 *  funds itself, like a new passkey account's starter drip, which runs later, as the transaction is sent). */
export type TopupHook = { notify: (s: Shortfall) => void; checkGas: () => boolean };

/** Gas room added to a top-up: a few paid actions' worth (a care is ~0.01 MON at 102 gwei). */
const GAS_ROOM = 5n * 10n ** 16n;

type Signer = { provider: EIP1193Provider; address: Address };

const artAbi = [
  { type: 'function', name: 'image', stateMutability: 'view', inputs: [{ name: 'mood', type: 'uint8' }, { name: 'crowned', type: 'bool' }], outputs: [{ name: '', type: 'string' }] },
] as const;

/**
 * Monad's own free public endpoints, all answering this origin (checked 2026-09-27). rpc.monad.xyz (QuickNode) allows 50
 * requests a second and counts every call inside a JSON-RPC batch; rpc1 answers a batch with 429, rpc3 refuses large
 * batches, rpc4 and rpc-mainnet.monadinfra.com failed a quarter to a half of a small burst. So: no JSON-RPC batching at
 * all (reads are merged by Multicall3 instead), each endpoint paced on its own, and the next one taken when one pushes
 * back. A revert is not "pushing back": it is thrown at once, never retried elsewhere.
 */
export const MONAD_PUBLIC_RPCS = ['https://rpc.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc3.monad.xyz'] as const;

/** The transport for an RPC URL: the public endpoints with fallback and pacing when it is Monad's, else just that URL, paced. */
export function rpcTransport(url: string): Transport {
  const paced = (u: string): Transport => {
    const lim = new Limiter(4, 110);   // about nine a second per endpoint per page, four at once
    const base = http(u, { batch: false, retryCount: 0, timeout: 15_000 });
    return ((opts: Parameters<Transport>[0]) => {
      const t = base(opts);
      return { ...t, request: ((args: unknown) => lim.run(() => (t.request as (a: unknown) => Promise<unknown>)(args))) as typeof t.request };
    }) as Transport;
  };
  const isPublic = (MONAD_PUBLIC_RPCS as readonly string[]).includes(url.replace(/\/$/, ''));
  if (!isPublic) return paced(url);
  const order = [url.replace(/\/$/, ''), ...MONAD_PUBLIC_RPCS.filter((u) => u !== url.replace(/\/$/, ''))];
  return fallback(order.map(paced), { rank: false, retryCount: 2, retryDelay: 350 });
}

/**
 * The live contract. Reads through the public RPC; writes through the connected wallet's provider.
 * No indexer, no backend: everything the site shows comes from `state()`, `catsOf()`, `crownList()`
 * and the totals, polled.
 */
export class ChainClient {
  readonly pub: PublicClient;
  private signer: Signer | null = null;
  /** See TopupHook: null unless the site switched the feature on. */
  topup: TopupHook | null = null;
  // Reads are no longer spaced one by one (that kept them from being merged): the wire is paced in rpcTransport. This
  // only caps how many reads a page can have waiting at once.
  private readonly limit = new Limiter(48, 0);

  constructor(readonly cfg: ChainConfig) {
    // Reads that start within 16 ms of each other go as ONE eth_call through Multicall3 (viem's monad chain carries its
    // address): a page refresh that was twenty requests is one or two, and one is what the RPC counts.
    this.pub = createPublicClient({ chain: cfg.chain, transport: rpcTransport(cfg.rpcUrl), batch: { multicall: { wait: 16 } } });
  }

  setSigner(s: Signer | null): void { this.signer = s; }
  /** The connected wallet, for clients that send their own transactions (the Autocare client). */
  get signerInfo(): Signer | null { return this.signer; }
  /** Called the instant the wallet returns a transaction hash. Until it fires, the wallet has not signed. */
  onHash: ((hash: `0x${string}`) => void) | null = null;
  get address(): Address | null { return this.signer?.address ?? null; }

  /** Which collections this build knows: the cat always, inversebrah and Sahur when their addresses are configured. */
  get collections(): Collection[] { return ['cat', ...(this.cfg.inverse ? ['frok' as const] : []), ...(this.cfg.sahur ? ['sahur' as const] : []), ...(__THICCUMS__ && this.cfg.thiccums ? ['thiccums' as const] : []), ...(__R3TARDS__ && this.cfg.r3tards ? ['r3tards' as const] : []), ...(__EMONAD__ && this.cfg.emonad ? ['emonad' as const] : [])]; }
  /** The contract for a collection. All three answer the same `state`, `catsOf`, `crownList`, `imageOf`, `ART` shape. */
  addr(col: Collection): Address {
    if (col === 'cat') return this.cfg.contract;
    if (__THICCUMS__ && col === 'thiccums') { if (!this.cfg.thiccums) throw new ChainError('This build does not know that pet.', 'wallet'); return this.cfg.thiccums; }
    if (__R3TARDS__ && col === 'r3tards') { if (!this.cfg.r3tards) throw new ChainError('This build does not know that pet.', 'wallet'); return this.cfg.r3tards; }
    if (__EMONAD__ && col === 'emonad') { if (!this.cfg.emonad) throw new ChainError('This build does not know that pet.', 'wallet'); return this.cfg.emonad; }
    if (col === 'thiccums' || col === 'r3tards') throw new ChainError('This build does not know that pet.', 'wallet');
    const a = col === 'frok' ? this.cfg.inverse : this.cfg.sahur; if (!a) throw new ChainError(col === 'frok' ? 'This build has no inversebrah.' : 'This build has no Sahur.', 'wallet'); return a;
  }
  private abi(col: Collection) { return (col === 'cat' ? emogotchiAbi : col === 'frok' ? inversegotchiAbi : __THICCUMS__ && col === 'thiccums' ? thiccumsgotchiAbi : __R3TARDS__ && col === 'r3tards' ? r3tardgotchiAbi : __EMONAD__ && col === 'emonad' ? emonadgotchiAbi : sahuragotchiAbi) as typeof emogotchiAbi; }

  // ---------------------------------------------------------------- reads
  async cat(id: number, col: Collection = 'cat'): Promise<CatView> {
    const v = await this.limit.run(() => this.pub.readContract({ address: this.addr(col), abi: this.abi(col), functionName: 'state', args: [BigInt(id)] }));
    return toView(v as RawView, col);
  }

  /**
   * Many cats in as few requests as possible. One multicall carrying more than ~100 `state` calls is
   * refused by the public RPC, so this goes in chunks of 50; the per-cat fallback is paced well under
   * the node's 15 requests a second.
   */
  async catsByIds(ids: number[], col: Collection = 'cat'): Promise<CatView[]> {
    if (ids.length === 0) return [];
    const CHUNK = 50;
    const out: CatView[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      try {
        const res = await this.limit.run(() => this.pub.multicall({
          multicallAddress: MULTICALL3,
          allowFailure: false,
          contracts: slice.map((id) => ({ address: this.addr(col), abi: this.abi(col), functionName: 'state' as const, args: [BigInt(id)] as const })),
        }));
        out.push(...(res as RawView[]).map((v) => toView(v, col)));
      } catch {
        for (const id of slice) {
          out.push(await this.cat(id, col));
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      if (i + CHUNK < ids.length) await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }

  /**
   * Every pet a wallet holds in one collection. `catsOf` builds the whole array in one call, which is fine for the
   * one or two pets almost everyone has — but a big holder would blow the RPC's eth_call gas cap and simply see
   * their pets fail to load. Past a few hundred the contract's own paged `catsOfRange` is used instead.
   */
  async catsOf(owner: Address, col: Collection = 'cat'): Promise<CatView[]> {
    const abi = this.abi(col); const address = this.addr(col);
    const n = Number(await this.limit.run(() => this.pub.readContract({ address, abi, functionName: 'balanceOf', args: [owner] })) as bigint);
    if (n === 0) return [];
    if (n <= CATS_UNPAGED) {
      const vs = await this.limit.run(() => this.pub.readContract({ address, abi, functionName: 'catsOf', args: [owner] }));
      return (vs as RawView[]).map((v) => toView(v, col));
    }
    const pages: Promise<unknown>[] = [];
    for (let start = 0; start < n; start += CATS_PAGE) {
      pages.push(this.limit.run(() => this.pub.readContract({ address, abi, functionName: 'catsOfRange', args: [owner, BigInt(start), BigInt(Math.min(CATS_PAGE, n - start))] })));
    }
    return (await Promise.all(pages)).flatMap((vs) => (vs as RawView[]).map((v) => toView(v, col)));
  }
  /** Every pet the wallet holds, across every collection this build knows, cats first. */
  async petsOf(owner: Address): Promise<CatView[]> {
    const lists = await Promise.all(this.collections.map((col) => this.catsOf(owner, col)));
    return lists.flat();
  }

  async totals(col: Collection = 'cat'): Promise<Totals> {
    const c = { address: this.addr(col), abi: this.abi(col) } as const;
    const [emoBurned, monBurned, pendingBurnMon, totalSupply] = await Promise.all([
      this.pub.readContract({ ...c, functionName: 'totalEmoBurned' }),
      this.pub.readContract({ ...c, functionName: 'totalMonBurned' }),
      this.pub.readContract({ ...c, functionName: 'pendingBurnMon' }),
      this.pub.readContract({ ...c, functionName: 'totalSupply' }),
    ]);
    return { emoBurned, monBurned, pendingBurnMon, totalSupply: Number(totalSupply) };
  }

  async crownList(col: Collection = 'cat'): Promise<CrownEntry[]> {
    const [ids, scores, streaks, alive] = await this.pub.readContract({ address: this.addr(col), abi: this.abi(col), functionName: 'crownList' });
    return ids.map((id, i) => ({ id: Number(id), score: Number(scores[i]!) / 100, streak: Number(streaks[i]!), alive: alive[i]! }));
  }

  async imageOf(id: number, col: Collection = 'cat'): Promise<string> {
    return this.pub.readContract({ address: this.addr(col), abi: this.abi(col), functionName: 'imageOf', args: [BigInt(id)] });
  }

  private artAddr: Partial<Record<Collection, Address>> = {};
  private artCache = new Map<string, Promise<string>>();

  /** The art contract behind a collection's tokenURI. */
  async artAddress(col: Collection = 'cat'): Promise<Address> {
    this.artAddr[col] ??= await this.limit.run(() => this.pub.readContract({ address: this.addr(col), abi: this.abi(col), functionName: 'ART' }));
    return this.artAddr[col]!;
  }

  /** The portrait for a mood and crown state, from the collection's art contract, cached: there are only 18 per pet. */
  artImage(mood: Mood, crowned: boolean, col: Collection = 'cat'): Promise<string> {
    const key = `${col}:${mood}:${crowned ? 1 : 0}`;
    let p = this.artCache.get(key);
    if (!p) {
      p = (async () => {
        const art = await this.artAddress(col);
        return this.limit.run(() => this.pub.readContract({ address: art, abi: artAbi, functionName: 'image', args: [MOODS.indexOf(mood), crowned] }));
      })();
      p.catch(() => this.artCache.delete(key));
      this.artCache.set(key, p);
    }
    return p;
  }

  async tokenURI(id: number, col: Collection = 'cat'): Promise<string> {
    return this.pub.readContract({ address: this.addr(col), abi: this.abi(col), functionName: 'tokenURI', args: [BigInt(id)] });
  }

  // ---------------------------------------------------------------- inversebrah and Sahur (the free-mint pets)
  /** Has this wallet minted its inversebrah (or its Sahur)? (one per wallet, forever) */
  async hasMinted(wallet: Address, col: Collection = 'frok'): Promise<boolean> {
    return this.limit.run(() => this.pub.readContract({ address: this.addr(col), abi: inversegotchiAbi, functionName: 'hasMinted', args: [wallet] }));
  }
  /** Mint the caller's inversebrah (or Sahur). Free. Returns the tx hash; the new id is his totalSupply after the receipt. */
  mint(col: Collection = 'frok') { return this.writeTo(this.addr(col), inversegotchiAbi, 'mint', []); }
  /** Hand a pet to someone else (the passkey wallet's own Send tab): the same safe send as `sendPet`. */
  transfer(id: number, to: Address, col: Collection = 'cat') { return this.sendPet(id, to, col); }
  /** One of inversebrah's four abuses, or Sahur's tung. Gas only; each goes to its own pet's contract. */
  abuse(id: number, kind: AbuseKind) { const col = STUNT_OF[kind]; return this.writeTo(this.addr(col), this.abi(col), ABUSE_CODE[kind], [BigInt(id)]); }

  async chainTime(): Promise<number> {
    const b = await this.pub.getBlock();
    return Number(b.timestamp);
  }

  // ---------------------------------------------------------------- the drop (claim window)
  /** The claim window as it is now, plus this wallet's status if one is given. */
  async drop(wallet?: Address): Promise<DropView> {
    const d = this.cfg.drop;
    if (!d) throw new ChainError('No claim contract configured.', 'network');
    const c = (fn: string, args: unknown[] = []) => ({ address: d, abi: emogotchiDropAbi, functionName: fn, args }) as never;
    const calls = [c('root'), c('claimStart'), c('claimEnd'), c('claimCap'), c('claimed'), c('claimsLeft'), c('isSealed'), c('airdropped')];
    if (wallet) calls.push(c('hasClaimed', [wallet]));
    const r = await this.limit.run(() => this.pub.multicall({ contracts: calls, allowFailure: false, multicallAddress: MULTICALL3 })) as unknown[];
    return {
      root: r[0] as `0x${string}`, start: Number(r[1]), end: Number(r[2]), cap: Number(r[3]), claimed: Number(r[4]), left: Number(r[5]), sealed: r[6] as boolean, airdropped: Number(r[7]),
      hasClaimed: wallet ? (r[8] as boolean) : false,
    };
  }
  /** Does the contract accept this proof for this wallet? Free, no signature. */
  async eligible(wallet: Address, proof: `0x${string}`[]): Promise<boolean> {
    const d = this.cfg.drop; if (!d) return false;
    return this.pub.readContract({ address: d, abi: emogotchiDropAbi, functionName: 'eligible', args: [wallet, proof] });
  }
  /** Mint the caller's one cat. Returns the tx hash; the new id is the game's totalSupply after the receipt. */
  claim(proof: `0x${string}`[]) { return this.writeTo(this.cfg.drop!, emogotchiDropAbi, 'claim', [proof]); }

  // ---------------------------------------------------------------- the item shop
  private get shop(): Address { const a = this.cfg.items; if (!a) throw new ChainError('This build has no item shop.', 'wallet'); return a; }
  private itemImages = new Map<number, Promise<string>>();

  /** Every item in the shop, in one call. */
  async items(): Promise<ItemView[]> {
    const shop = this.shop;
    const n = Number(await this.limit.run(() => this.pub.readContract({ address: shop, abi: emogotchiItemsAbi, functionName: 'itemCount' })));
    if (n === 0) return [];
    const raw = await this.limit.run(() => this.pub.readContract({ address: shop, abi: emogotchiItemsAbi, functionName: 'catalogue', args: [1n, BigInt(n)] }));
    return raw.map((it, i) => {
      const maxSupply = Number(it.maxSupply); const minted = Number(it.minted);
      return {
        id: i + 1, name: it.name, description: it.description, price: it.price, maxSupply, perKey: Number(it.perKey), minted,
        opens: Number(it.opens), closes: Number(it.closes), kind: ITEM_KINDS[Number(it.kind)] ?? 'cosmetic', slot: Number(it.slot),
        soulbound: it.soulbound, sealed: it.isSealed, gate: it.gate,
        remaining: it.isSealed ? 0 : maxSupply === 0 ? null : maxSupply - minted,
      };
    });
  }
  /** The item's own picture (SVG text), from chain, once. */
  itemImage(id: number): Promise<string> {
    let p = this.itemImages.get(id);
    if (!p) {
      p = this.limit.run(() => this.pub.readContract({ address: this.shop, abi: emogotchiItemsAbi, functionName: 'imageOf', args: [BigInt(id)] }));
      this.itemImages.set(id, p);
      p.catch(() => this.itemImages.delete(id));
    }
    return p;
  }
  /** The gate hint for a cat: its id, as the witch's gate wants it. */
  static catHint(catId: number): `0x${string}` { return encodeAbiParameters([{ type: 'uint256' }], [BigInt(catId)]); }
  /** Would this claim go through, and if not why. Never reverts. */
  async canClaim(id: number, who: Address, qty: number, hint: `0x${string}`): Promise<ClaimCheck> {
    const [ok, reason, key, due] = await this.limit.run(() => this.pub.readContract({ address: this.shop, abi: emogotchiItemsAbi, functionName: 'canClaim', args: [BigInt(id), who, qty, hint] }));
    return { ok, reason: Number(reason), key, due };
  }
  /** Item id → copies held, for one wallet. */
  async holdings(who: Address): Promise<Record<number, number>> {
    const [ids, bals] = await this.limit.run(() => this.pub.readContract({ address: this.shop, abi: emogotchiItemsAbi, functionName: 'holdings', args: [who] }));
    const out: Record<number, number> = {};
    ids.forEach((id, i) => { out[Number(id)] = Number(bals[i]); });
    return out;
  }
  /** The gate hint for a collection: its address, as AnyPetGate (the emo hair) wants it. */
  static collectionHint(collection: Address): `0x${string}` { return encodeAbiParameters([{ type: 'address' }], [collection]); }
  /** NamedPetGate's hint: which pet claims, as (collection, id). Its key is that pet, so the cap is one per pet. */
  static petHint(collection: Address, id: number): `0x${string}` { return encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [collection, BigInt(id)]); }
  /** What each pet of one collection is wearing right now (items its current owner still holds). One call per hundred. */
  async equippedMany(catIds: number[], col: Collection = 'cat'): Promise<Record<number, number[]>> {
    const out: Record<number, number[]> = {};
    if (!this.cfg.items || catIds.length === 0) return out;
    const shop = this.cfg.items;
    for (let i = 0; i < catIds.length; i += 100) {
      const slice = catIds.slice(i, i + 100);
      const res = await this.limit.run(() => this.pub.readContract({ address: shop, abi: emogotchiItemsAbi, functionName: 'equippedMany', args: [this.addr(col), slice.map(BigInt)] }));
      slice.forEach((id, k) => { out[id] = (res[k] ?? []).map(Number); });
    }
    return out;
  }
  claimItem(id: number, qty: number, hint: `0x${string}`, value: bigint) { return this.writeTo(this.shop, emogotchiItemsAbi, 'claim', [BigInt(id), qty, hint], value); }
  equipMany(catIds: number[], itemId: number, col: Collection = 'cat') { return this.writeTo(this.shop, emogotchiItemsAbi, 'equipMany', [this.addr(col), catIds.map(BigInt), BigInt(itemId)]); }
  unequip(catId: number, itemId: number, col: Collection = 'cat') { return this.writeTo(this.shop, emogotchiItemsAbi, 'unequip', [this.addr(col), BigInt(catId), BigInt(itemId)]); }

  // ---------------------------------------------------------------- sending: the owner moves a pet or an item to someone else
  // Only ever the owner's own transfer, straight from their wallet: never an approval, never an operator.
  /**
   * What an address is: a plain wallet (no code), an EIP-7702 wallet (a person's key with smart-account code
   * delegated to it: code starting 0xef0100), or a contract (a multisig, a vault, anything else).
   */
  async accountKind(a: Address): Promise<'wallet' | 'delegated' | 'contract'> {
    const code = await this.limit.run(() => this.pub.getCode({ address: a }));
    if (!code || code === '0x') return 'wallet';
    return /^0xef0100[0-9a-f]{40}$/i.test(code) ? 'delegated' : 'contract';
  }
  /**
   * The call that sends a pet. The SAFE transfer by default: a contract that cannot hold pets (it does not answer
   * onERC721Received) makes the game refuse, instead of the pet being stuck there for ever. `plain` is only for an
   * EIP-7702 wallet whose smart-account code does not answer that call: it is still a person's own key, which can
   * always move the pet on, so the receiver check buys nothing there.
   */
  private petSend(id: number, to: Address, col: Collection, plain: boolean) {
    const from = this.signer?.address;
    if (!from) throw new ChainError('Connect a wallet first.', 'wallet');
    return { address: this.addr(col), abi: this.abi(col), fn: plain ? 'transferFrom' : 'safeTransferFrom', args: [from, to, BigInt(id)] as unknown[], from };
  }
  private itemSend(itemId: number, qty: number, to: Address) {
    const from = this.signer?.address;
    if (!from) throw new ChainError('Connect a wallet first.', 'wallet');
    if (!Number.isSafeInteger(qty) || qty < 1) throw new ChainError('Send at least one.', 'wallet');
    // ERC-1155 has only the safe transfer: a contract that cannot hold items refuses it
    return { address: this.shop, abi: emogotchiItemsAbi as unknown, fn: 'safeTransferFrom', args: [from, to, BigInt(itemId), BigInt(qty), '0x'] as unknown[], from };
  }
  /** Would this send go through right now (who owns it, how many are held, whether the receiver takes it)? null if so, else why not. */
  async checkSend(what: { pet: { id: number; col: Collection; plain?: boolean } } | { item: { id: number; qty: number } }, to: Address): Promise<string | null> {
    const c = 'pet' in what ? this.petSend(what.pet.id, to, what.pet.col, !!what.pet.plain) : this.itemSend(what.item.id, what.item.qty, to);
    try {
      await this.pub.estimateContractGas({ address: c.address, abi: c.abi, functionName: c.fn, args: c.args, account: c.from } as never);
      return null;
    } catch (e) { return this.humanise(e).message; }
  }
  /** Send one of the signer's pets to `to`. Waits for the receipt; returns the hash. */
  sendPet(id: number, to: Address, col: Collection = 'cat', plain = false) {
    const c = this.petSend(id, to, col, plain);
    return this.writeTo(c.address, c.abi, c.fn, c.args);
  }
  /** Send `qty` copies of one item to `to`. Waits for the receipt; returns the hash. */
  sendItem(itemId: number, qty: number, to: Address) {
    const c = this.itemSend(itemId, qty, to);
    return this.writeTo(c.address, c.abi, c.fn, c.args);
  }

  // ---------------------------------------------------------------- writes (the cat pays; inversebrah's care and revive are free)
  private price(col: Collection, wei: bigint) { return FREE.has(col) ? 0n : wei; }
  care(id: number, action: CareAction, col: Collection = 'cat') { return this.write(action, [BigInt(id)], this.price(col, PRICE), col); }
  careMany(ids: number[], actions: CareAction[], col: Collection = 'cat') {
    return this.write('care', [ids.map(BigInt), actions.map((a) => ACTION_CODE[a])], this.price(col, PRICE * BigInt(ids.length)), col);
  }
  wake(id: number, col: Collection = 'cat') { return this.write('wake', [BigInt(id)], 0n, col); }
  pet(id: number, count: number, col: Collection = 'cat') { return this.write('pet', [BigInt(id), BigInt(Math.max(1, Math.min(20, count)))], 0n, col); }
  setName(id: number, name: string, col: Collection = 'cat') { return this.write('setName', [BigInt(id), name], NAME_PRICE, col); }
  revive(id: number, col: Collection = 'cat') { return this.write('revive', [BigInt(id)], this.price(col, REVIVE_PRICE), col); }
  poke(id: number, col: Collection = 'cat') { return this.write('poke', [BigInt(id)], 0n, col); }
  /**
   * Turn queued MON into EMO and burn it.
   *
   * `maxMon` must be clamped to the contract's own price-impact guard. `crankBurn` takes min(pending, maxMon) and
   * hands it to the swap; if that exceeds MAX_IMPACT_BPS of the pool's WMON the contract puts the WHOLE amount back
   * on the queue and returns — the transaction SUCCEEDS having burned nothing. (EmogotchiItems clamps internally;
   * the two game contracts are immutable and do not.) So asking for everything would one day mean a button that
   * says "Burned. Thank you.", burns zero, and charges the visitor Monad's full gas limit. Ask for a slice instead.
   */
  async crankBurn(maxMon?: bigint, minEmoOut = 0n, col: Collection = 'cat') {
    const cap = maxMon ?? (await this.burnSlice(col));
    return this.write('crankBurn', [cap, minEmoOut], 0n, col);
  }
  /** The most MON the contract will actually swap in one go: MAX_IMPACT_BPS of the pool's WMON depth. */
  async burnSlice(col: Collection = 'cat'): Promise<bigint> {
    const abi = this.abi(col); const address = this.addr(col);
    const read = (functionName: string, args: unknown[] = [], to: Address = address, a: unknown = abi) =>
      this.limit.run(() => this.pub.readContract({ address: to, abi: a as never, functionName, args } as never));
    try {
      const [pending, bps, wmon, pool] = await Promise.all([
        read('pendingBurnMon'), read('MAX_IMPACT_BPS'), read('WMON'), read('POOL'),
      ]) as [bigint, bigint, Address, Address];
      const depth = await read('balanceOf', [pool], wmon, [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }]) as bigint;
      const guard = (depth * bps) / 10_000n;
      // a hair under the guard, since the pool moves between the read and the send
      const slice = (guard * 99n) / 100n;
      return pending < slice || slice === 0n ? pending : slice;
    } catch {
      return 2n ** 255n; // the reads failed: fall back to the old behaviour rather than refusing to burn
    }
  }
  sweep(col: Collection = 'cat') { return this.write('sweep', [], 0n, col); }
  /** The item shop's own burn queue: its paid items split 80/10/10 like the games, and the 80% waits here to be burned. */
  async shopTotals(): Promise<{ emoBurned: bigint; monBurned: bigint; pendingBurnMon: bigint } | null> {
    const a = this.cfg.items; if (!a) return null;
    const c = { address: a, abi: emogotchiItemsAbi } as const;
    const [emoBurned, monBurned, pendingBurnMon] = await Promise.all([
      this.pub.readContract({ ...c, functionName: 'totalEmoBurned' }),
      this.pub.readContract({ ...c, functionName: 'totalMonBurned' }),
      this.pub.readContract({ ...c, functionName: 'pendingBurnMon' }),
    ]) as [bigint, bigint, bigint];
    return { emoBurned, monBurned, pendingBurnMon };
  }
  /** Burn the shop's queue. EmogotchiItems clamps to its own price-impact guard inside, so asking for everything burns
   *  the biggest slice it allows, never nothing (the games need `burnSlice` for that; the shop does not). */
  crankShop(minEmoOut = 0n) { return this.writeTo(this.shop, emogotchiItemsAbi, 'crankBurn', [2n ** 256n - 1n, minEmoOut]); }

  /** Estimate, send with a 10% margin above the estimate, wait for the receipt. Returns the tx hash. */
  private write(fn: string, args: unknown[], value = 0n, col: Collection = 'cat'): Promise<`0x${string}`> { return this.writeTo(this.addr(col), this.abi(col), fn, args, value); }
  private async writeTo(address: Address, abi: unknown, fn: string, args: unknown[], value = 0n): Promise<`0x${string}`> {
    const s = this.signer;
    if (!s) throw new ChainError('Connect a wallet first.', 'wallet');
    const req = { address, abi, functionName: fn, args, value, account: s.address } as never;
    // a paid call the wallet cannot cover: say so plainly before anything is estimated or signed (MetaMask's own words
    // for it are "Transaction creation failed", which told a player nothing when a 1,000 MON revive or a 36 MON item
    // was more than the wallet held). A MetaMask "smart account" (EIP-7702, what its Monad gas sponsorship turns an
    // account into) must also keep Monad's 10 MON reserve: it can never spend below it.
    let smart = false;
    if (value > 0n) {
      const [bal, code] = await Promise.all([this.pub.getBalance({ address: s.address }).catch(() => null), this.pub.getCode({ address: s.address }).catch(() => undefined)]);
      if (bal !== null) {
        smart = !!code && code.toLowerCase().startsWith('0xef0100');
        const need = value + (smart ? RESERVE : 0n);
        if (bal < need) throw this.short(smart
          ? `This costs ${mon(value)} MON and this wallet holds ${mon(bal)} MON. It is a MetaMask smart account (its gas sponsorship made it one), so Monad also keeps 10 MON in it: it needs ${mon(need)} MON plus a little gas.`
          : `This costs ${mon(value)} MON and this wallet holds ${mon(bal)} MON. Top it up and try again.`,
          { address: s.address, value, have: bal, need: need + GAS_ROOM, smart, gasOnly: false });
      }
    }
    let gas: bigint;
    try {
      gas = await this.pub.estimateContractGas(req);
    } catch (e) {
      const h = this.humanise(e);
      // the node's own "insufficient funds" (the value was covered, the gas on top was not): the same shortfall
      if (this.topup && /Not enough MON/.test(h.message)) {
        const bal = await this.pub.getBalance({ address: s.address }).catch(() => 0n);
        throw this.short(h.message, { address: s.address, value, have: bal, need: value + (smart ? RESERVE : 0n) + GAS_ROOM, smart, gasOnly: value === 0n });
      }
      throw h;
    }
    gas += gas / 10n;
    const floor = GAS_FLOOR[fn] ?? 100_000n;
    if (gas < floor) gas = floor;
    // a free call from a wallet with no MON for its gas (only while the top-up is on, and only for wallets that do not
    // fund themselves): refused here in words, instead of by the wallet's own "insufficient funds"
    if (value === 0n && this.topup?.checkGas()) {
      const [bal, price] = await Promise.all([this.pub.getBalance({ address: s.address }).catch(() => null), this.pub.getGasPrice().catch(() => null)]);
      if (bal !== null && price !== null && bal < gas * price) {
        throw this.short(`This needs about ${mon(gas * price)} MON for gas and this wallet holds ${mon(bal)} MON.`,
          { address: s.address, value, have: bal, need: gas * price + GAS_ROOM, smart, gasOnly: true });
      }
    }
    const wc = createWalletClient({ chain: this.cfg.chain, transport: custom(s.provider), account: s.address });
    let hash: `0x${string}`;
    try {
      hash = await wc.writeContract({ ...(req as object), gas } as never);
      this.onHash?.(hash);   // signed: everything after this is the chain's business, not the wallet's
    } catch (e) {
      throw await this.walletError(e, s.address);
    }
    const receipt = await this.pub.waitForTransactionReceipt({ hash, pollingInterval: 800, timeout: 120_000 });
    if (receipt.status !== 'success') throw new ChainError('The transaction reverted on chain.', 'reverted');
    return hash;
  }

  /** A shortfall: the error to throw, after telling the top-up (when it is on). */
  private short(message: string, sf: Shortfall): ShortfallError {
    try { this.topup?.notify(sf); } catch { /* the sheet's trouble, never the caller's */ }
    return new ShortfallError(message, sf);
  }

  /**
   * The wallet said no. Its catch-all ("Internal JSON-RPC error", code -32603: MetaMask Mobile's, a player on 2026-09-28)
   * came through as "The contract function "clean" reverted with the following reason:" with the reason cut off, though
   * the chain had just said yes to the same call (the estimate above). So it says it was the wallet, passes on the
   * wallet's own words when it gives any, and for a MetaMask smart account (EIP-7702: what its gas sponsorship turns an
   * account into) says how to switch back. Anything else is `humanise`.
   */
  private async walletError(e: unknown, who: Address): Promise<ChainError> {
    const h = this.humanise(e);
    const internal = e instanceof BaseError ? !!e.walk((x) => (x as { code?: unknown }).code === -32603) : (e as { code?: unknown })?.code === -32603;
    // a catch-all that still carries the contract's own reason (NoPoop, NotOwner...): that reason is the answer
    const decoded = e instanceof BaseError && !!(e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null)?.data?.errorName;
    if (!internal || decoded || h.code === 'rejected') return h;
    const words = walletWords(e instanceof BaseError ? e.walk() : e);
    const code = await this.pub.getCode({ address: who }).catch(() => undefined);
    const smart = !!code && code.toLowerCase().startsWith('0xef0100');
    return new ChainError(`Your wallet would not send this${words ? `: "${words.slice(0, 120)}"` : ' and gave no reason'}. `
      + (smart ? 'This wallet is a MetaMask smart account (its gas sponsorship made it one): switch it back to a regular account in MetaMask and try again.' : 'Try again in a moment.'), 'wallet');
  }

  private humanise(e: unknown): ChainError {
    const msg = e instanceof Error ? e.message : String(e);
    if (/user (rejected|denied)|rejected the request/i.test(msg)) return new ChainError('You cancelled the transaction.', 'rejected');
    // Monad keeps 10 MON in reserve on every account; a MetaMask "smart account" (EIP-7702) cannot dip
    // below it even once, so a 1 MON feed from a wallet holding 10.5 MON is refused while a gas-only pet
    // goes through. MetaMask reports it as "missing or invalid parameters", which helps nobody.
    if (/reserve balance/i.test(msg)) return new ChainError('Monad keeps 10 MON in reserve on this account (a smart account cannot go below it). Top it up past 10 MON + the cost, or switch MetaMask back to a regular account.', 'reverted');
    if (e instanceof BaseError) {
      const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
      const name = rev?.data?.errorName;
      if (name) return new ChainError(REASONS[name] ?? `The contract refused: ${name}.`, 'reverted');
      if (/insufficient (funds|balance)/i.test(msg)) return new ChainError('Not enough MON in this wallet for that.', 'reverted');
      // the node's catch-all (code -32603) with nothing decodable: a hiccup, not a refusal (a wallet's is walletError's)
      if (!rev?.data && e.walk((x) => (x as { code?: unknown }).code === -32603)) return new ChainError('Monad had a problem with that request. Try again in a moment.', 'network');
      // a refusal with a reason in words: the reason is on viem's second line, which the first-line fallback cut off
      const why = rev?.reason?.trim().replace(/^execution reverted:?\s*/i, '');
      if (rev) return new ChainError(why && why !== 'execution reverted' ? `The chain refused this: ${why.slice(0, 140)}` : 'The chain refused this.', 'reverted');
    }
    return new ChainError(msg.split('\n')[0]!.slice(0, 160), 'network');
  }
}

/** A wallet's own words under its catch-all error: MetaMask puts them in `data.message`, `data.originalError.message` or
 *  `data.cause.message`. Null when there are none (or only the catch-all's own). */
function walletWords(root: unknown): string | null {
  const generic = /internal json-rpc error|an internal error was received/i;
  const dig = (x: unknown, depth: number): string | null => {
    if (!x || typeof x !== 'object' || depth > 4) return null;
    const m = (x as { message?: unknown }).message;
    if (depth > 0 && typeof m === 'string' && m.trim() && !generic.test(m)) return m.trim().split('\n')[0]!;
    for (const k of ['data', 'originalError', 'cause', 'error']) { const d = dig((x as Record<string, unknown>)[k], depth + 1); if (d) return d; }
    return null;
  };
  return dig(root, 0);
}

/** Monad's reserve on an EIP-7702 account: it can spend value only down to this much (see CLAUDE.md, "Monad's 10 MON reserve"). */
const RESERVE = 10n * 10n ** 18n;
const mon = (wei: bigint) => Number(formatEther(wei)).toLocaleString('en-US', { maximumFractionDigits: 2 });

const REASONS: Record<string, string> = {
  NotOwner: 'Only the cat\'s owner can do that.',
  NotAlive: 'This cat is dead. Revive it first.',
  Alive: 'This cat is alive; nothing to revive.',
  Asleep: 'The cat is already asleep.',
  Awake: 'The cat is already awake.',
  NoPoop: 'Nothing to clean up right now.',
  WrongValue: 'Wrong amount of MON attached.',
  BadName: 'Names are 1 to 32 bytes.',
  BadCount: 'Bad count.',
  BadAction: 'Unknown action.',
  NotEnoughCats: 'Not enough eligible cats for that.',
  NothingToDo: 'Nothing to do.',
  InvalidToken: 'No such cat.',
  // the shop
  NoItem: 'No such item.',
  IsSealed: 'This item is sealed: no more will ever be made.',
  NotOpenYet: 'This item is not open yet.',
  Closed: 'This item has closed.',
  SoldOut: 'Sold out.',
  CapReached: 'Already claimed: that is the most this pet or wallet can have.',
  NotEligible: 'Not eligible for this item.',
  AlreadyMinted: 'This wallet already minted its one (one each, forever).',
  NotHolder: 'You do not hold that item.',
  NotEquippable: 'That item cannot be worn.',
  CollectionNotAllowed: 'Those pets cannot wear items.',
  TooManyEquipped: 'A cat can wear at most 16 items.',
  NotEquipped: 'It is not wearing that.',
  Soulbound: 'That item cannot be transferred.',
  // sending
  UnsafeRecipient: 'That address is a contract that cannot hold pets, so the game refused it. Nothing was sent.',
  BadReceiver: 'That address cannot hold items (its code refuses them), so the shop refused it. Nothing was sent.',
  Insufficient: 'You do not hold that many.',
  NotApproved: 'Only the holder can send it.',
  Unauthorized: 'Only the owner can send this pet.',
  ZeroAddress: 'That is the zero address: anything sent there is gone for good.',
};

type RawView = {
  id: bigint; owner: `0x${string}`; name: string; started: boolean; alive: boolean; asleep: boolean; poop: boolean; crowned: boolean; crownEligible: boolean;
  food: number; clean: number; fun: number; energy: number; mood: number; streak: number; score: number; day: bigint;
  mintedAt: number; startsAt: number; bornAt: number; deadAt: number; poopAt: number; wakesAt: number; diesAt: number;
  feeds: number; washes: number; plays: number; naps: number; cleanups: number; pets: number; names: number; deaths: number; revives: number; monPaid: bigint;
  screenshots?: number; slaps?: number; squeezes?: number; ignitions?: number; tungs?: number; bounces?: number;
};

function toView(v: RawView, col: Collection = 'cat'): CatView {
  return {
    col,
    id: Number(v.id), owner: v.owner, name: v.name, started: v.started, alive: v.alive, asleep: v.asleep, poop: v.poop,
    crowned: v.crowned, crownEligible: v.crownEligible,
    food: v.food, clean: v.clean, fun: v.fun, energy: v.energy, mood: MOODS[v.mood] ?? 'content', streak: v.streak, score: v.score / 100,
    day: Number(v.day), mintedAt: v.mintedAt, startsAt: v.startsAt, bornAt: v.bornAt, deadAt: v.deadAt, poopAt: v.poopAt, wakesAt: v.wakesAt, diesAt: v.diesAt,
    feeds: v.feeds, washes: v.washes, plays: v.plays, naps: v.naps, cleanups: v.cleanups, pets: v.pets, names: v.names, deaths: v.deaths, revives: v.revives,
    monPaid: v.monPaid,
    screenshots: v.screenshots ?? 0, slaps: v.slaps ?? 0, squeezes: v.squeezes ?? 0, burns: v.ignitions ?? 0, tungs: v.tungs ?? 0,
    ...(__THICCUMS__ ? { bounces: v.bounces ?? 0 } : {}),
  };
}
