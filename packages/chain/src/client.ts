import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  http,
  type EIP1193Provider,
  type PublicClient,
} from 'viem';
import { emogotchiAbi, emogotchiDropAbi, emogotchiItemsAbi } from './abi';
import type { Address, ChainConfig } from './config';

/** One cat, as the contract reports it (`state(id)`), with bigints and packed ints turned into numbers. */
export type CatView = {
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
 * Monad's public RPC allows 15 requests a second and answers the 16th with an error, which the page
 * would otherwise show as "could not read the contract". Every read goes through here: at most five
 * in flight, and at least 80 ms between starts, so a busy page (the gallery asking for a hundred cats
 * and every portrait at once) stays inside the limit instead of tripping it.
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
const GAS_FLOOR: Record<string, bigint> = {
  feed: 120_000n, play: 120_000n, wash: 120_000n, sleep: 120_000n, clean: 120_000n, care: 120_000n,
  wake: 60_000n, pet: 60_000n, setName: 100_000n, revive: 120_000n, crankBurn: 220_000n, sweep: 140_000n, poke: 80_000n,
  // the shop (live measurements: claim with the cat id 75k, equipMany three cats 222k)
  claim: 160_000n, equip: 120_000n, equipMany: 120_000n, unequip: 80_000n,
};

export class ChainError extends Error {
  constructor(message: string, readonly code: 'rejected' | 'reverted' | 'network' | 'wallet' = 'network') {
    super(message);
  }
}

type Signer = { provider: EIP1193Provider; address: Address };

const artAbi = [
  { type: 'function', name: 'image', stateMutability: 'view', inputs: [{ name: 'mood', type: 'uint8' }, { name: 'crowned', type: 'bool' }], outputs: [{ name: '', type: 'string' }] },
] as const;

/**
 * The live contract. Reads through the public RPC; writes through the connected wallet's provider.
 * No indexer, no backend: everything the site shows comes from `state()`, `catsOf()`, `crownList()`
 * and the totals, polled.
 */
export class ChainClient {
  readonly pub: PublicClient;
  private signer: Signer | null = null;
  private readonly limit = new Limiter();

  constructor(readonly cfg: ChainConfig) {
    this.pub = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl, { batch: true }) });
  }

  setSigner(s: Signer | null): void { this.signer = s; }
  get address(): Address | null { return this.signer?.address ?? null; }

  // ---------------------------------------------------------------- reads
  async cat(id: number): Promise<CatView> {
    const v = await this.limit.run(() => this.pub.readContract({ address: this.cfg.contract, abi: emogotchiAbi, functionName: 'state', args: [BigInt(id)] }));
    return toView(v);
  }

  /**
   * Many cats in as few requests as possible. One multicall carrying more than ~100 `state` calls is
   * refused by the public RPC, so this goes in chunks of 50; the per-cat fallback is paced well under
   * the node's 15 requests a second.
   */
  async catsByIds(ids: number[]): Promise<CatView[]> {
    if (ids.length === 0) return [];
    const CHUNK = 50;
    const out: CatView[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      try {
        const res = await this.limit.run(() => this.pub.multicall({
          multicallAddress: MULTICALL3,
          allowFailure: false,
          contracts: slice.map((id) => ({ address: this.cfg.contract, abi: emogotchiAbi, functionName: 'state' as const, args: [BigInt(id)] as const })),
        }));
        out.push(...(res as RawView[]).map(toView));
      } catch {
        for (const id of slice) {
          out.push(await this.cat(id));
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      if (i + CHUNK < ids.length) await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }

  async catsOf(owner: Address): Promise<CatView[]> {
    const vs = await this.limit.run(() => this.pub.readContract({ address: this.cfg.contract, abi: emogotchiAbi, functionName: 'catsOf', args: [owner] }));
    return vs.map(toView);
  }

  async totals(): Promise<Totals> {
    const c = { address: this.cfg.contract, abi: emogotchiAbi } as const;
    const [emoBurned, monBurned, pendingBurnMon, totalSupply] = await Promise.all([
      this.pub.readContract({ ...c, functionName: 'totalEmoBurned' }),
      this.pub.readContract({ ...c, functionName: 'totalMonBurned' }),
      this.pub.readContract({ ...c, functionName: 'pendingBurnMon' }),
      this.pub.readContract({ ...c, functionName: 'totalSupply' }),
    ]);
    return { emoBurned, monBurned, pendingBurnMon, totalSupply: Number(totalSupply) };
  }

  async crownList(): Promise<CrownEntry[]> {
    const [ids, scores, streaks, alive] = await this.pub.readContract({ address: this.cfg.contract, abi: emogotchiAbi, functionName: 'crownList' });
    return ids.map((id, i) => ({ id: Number(id), score: Number(scores[i]!) / 100, streak: Number(streaks[i]!), alive: alive[i]! }));
  }

  async imageOf(id: number): Promise<string> {
    return this.pub.readContract({ address: this.cfg.contract, abi: emogotchiAbi, functionName: 'imageOf', args: [BigInt(id)] });
  }

  private artAddr: Address | null = null;
  private artCache = new Map<string, Promise<string>>();

  /** The portrait for a mood and crown state, from the art contract, cached: there are only 18 of them. */
  artImage(mood: Mood, crowned: boolean): Promise<string> {
    const key = `${mood}:${crowned ? 1 : 0}`;
    let p = this.artCache.get(key);
    if (!p) {
      p = (async () => {
        this.artAddr ??= await this.limit.run(() => this.pub.readContract({ address: this.cfg.contract, abi: emogotchiAbi, functionName: 'ART' }));
        return this.limit.run(() => this.pub.readContract({ address: this.artAddr!, abi: artAbi, functionName: 'image', args: [MOODS.indexOf(mood), crowned] }));
      })();
      p.catch(() => this.artCache.delete(key));
      this.artCache.set(key, p);
    }
    return p;
  }

  async tokenURI(id: number): Promise<string> {
    return this.pub.readContract({ address: this.cfg.contract, abi: emogotchiAbi, functionName: 'tokenURI', args: [BigInt(id)] });
  }

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
  /** What each cat is wearing right now (items its current owner still holds). One call per hundred cats. */
  async equippedMany(catIds: number[]): Promise<Record<number, number[]>> {
    const out: Record<number, number[]> = {};
    if (!this.cfg.items || catIds.length === 0) return out;
    const shop = this.cfg.items;
    for (let i = 0; i < catIds.length; i += 100) {
      const slice = catIds.slice(i, i + 100);
      const res = await this.limit.run(() => this.pub.readContract({ address: shop, abi: emogotchiItemsAbi, functionName: 'equippedMany', args: [this.cfg.contract, slice.map(BigInt)] }));
      slice.forEach((id, k) => { out[id] = (res[k] ?? []).map(Number); });
    }
    return out;
  }
  claimItem(id: number, qty: number, hint: `0x${string}`, value: bigint) { return this.writeTo(this.shop, emogotchiItemsAbi, 'claim', [BigInt(id), qty, hint], value); }
  equipMany(catIds: number[], itemId: number) { return this.writeTo(this.shop, emogotchiItemsAbi, 'equipMany', [this.cfg.contract, catIds.map(BigInt), BigInt(itemId)]); }
  unequip(catId: number, itemId: number) { return this.writeTo(this.shop, emogotchiItemsAbi, 'unequip', [this.cfg.contract, BigInt(catId), BigInt(itemId)]); }

  // ---------------------------------------------------------------- writes
  care(id: number, action: CareAction) { return this.write(action, [BigInt(id)], PRICE); }
  careMany(ids: number[], actions: CareAction[]) {
    return this.write('care', [ids.map(BigInt), actions.map((a) => ACTION_CODE[a])], PRICE * BigInt(ids.length));
  }
  wake(id: number) { return this.write('wake', [BigInt(id)]); }
  pet(id: number, count: number) { return this.write('pet', [BigInt(id), BigInt(Math.max(1, Math.min(20, count)))]); }
  setName(id: number, name: string) { return this.write('setName', [BigInt(id), name], NAME_PRICE); }
  revive(id: number) { return this.write('revive', [BigInt(id)], REVIVE_PRICE); }
  poke(id: number) { return this.write('poke', [BigInt(id)]); }
  crankBurn(maxMon: bigint = 2n ** 255n, minEmoOut = 0n) { return this.write('crankBurn', [maxMon, minEmoOut]); }
  sweep() { return this.write('sweep', []); }

  /** Estimate, send with a 10% margin above the estimate, wait for the receipt. Returns the tx hash. */
  private write(fn: string, args: unknown[], value = 0n): Promise<`0x${string}`> { return this.writeTo(this.cfg.contract, emogotchiAbi, fn, args, value); }
  private async writeTo(address: Address, abi: unknown, fn: string, args: unknown[], value = 0n): Promise<`0x${string}`> {
    const s = this.signer;
    if (!s) throw new ChainError('Connect a wallet first.', 'wallet');
    const req = { address, abi, functionName: fn, args, value, account: s.address } as never;
    let gas: bigint;
    try {
      gas = await this.pub.estimateContractGas(req);
    } catch (e) {
      throw this.humanise(e);
    }
    gas += gas / 10n;
    const floor = GAS_FLOOR[fn] ?? 100_000n;
    if (gas < floor) gas = floor;
    const wc = createWalletClient({ chain: this.cfg.chain, transport: custom(s.provider), account: s.address });
    let hash: `0x${string}`;
    try {
      hash = await wc.writeContract({ ...(req as object), gas } as never);
    } catch (e) {
      throw this.humanise(e);
    }
    const receipt = await this.pub.waitForTransactionReceipt({ hash, pollingInterval: 800, timeout: 120_000 });
    if (receipt.status !== 'success') throw new ChainError('The transaction reverted on chain.', 'reverted');
    return hash;
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
      if (/insufficient funds/i.test(msg)) return new ChainError('Not enough MON in this wallet for that.', 'reverted');
    }
    return new ChainError(msg.split('\n')[0]!.slice(0, 160), 'network');
  }
}

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
  CapReached: 'This cat already claimed one.',
  NotEligible: 'Not eligible: it needs a living, named cat of yours.',
  NotHolder: 'You do not hold that item.',
  NotEquippable: 'That item cannot be worn.',
  CollectionNotAllowed: 'Those pets cannot wear items.',
  TooManyEquipped: 'A cat can wear at most 16 items.',
  NotEquipped: 'It is not wearing that.',
  Soulbound: 'That item cannot be transferred.',
};

type RawView = {
  id: bigint; owner: `0x${string}`; name: string; started: boolean; alive: boolean; asleep: boolean; poop: boolean; crowned: boolean; crownEligible: boolean;
  food: number; clean: number; fun: number; energy: number; mood: number; streak: number; score: number; day: bigint;
  mintedAt: number; startsAt: number; bornAt: number; deadAt: number; poopAt: number; wakesAt: number; diesAt: number;
  feeds: number; washes: number; plays: number; naps: number; cleanups: number; pets: number; names: number; deaths: number; revives: number; monPaid: bigint;
};

function toView(v: RawView): CatView {
  return {
    id: Number(v.id), owner: v.owner, name: v.name, started: v.started, alive: v.alive, asleep: v.asleep, poop: v.poop,
    crowned: v.crowned, crownEligible: v.crownEligible,
    food: v.food, clean: v.clean, fun: v.fun, energy: v.energy, mood: MOODS[v.mood] ?? 'content', streak: v.streak, score: v.score / 100,
    day: Number(v.day), mintedAt: v.mintedAt, startsAt: v.startsAt, bornAt: v.bornAt, deadAt: v.deadAt, poopAt: v.poopAt, wakesAt: v.wakesAt, diesAt: v.diesAt,
    feeds: v.feeds, washes: v.washes, plays: v.plays, naps: v.naps, cleanups: v.cleanups, pets: v.pets, names: v.names, deaths: v.deaths, revives: v.revives,
    monPaid: v.monPaid,
  };
}
