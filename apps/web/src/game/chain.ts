/**
 * Live mode. When VITE_CONTRACT_ADDRESS is set the site reads cats from the contract and every
 * action is a real transaction through the connected wallet. Without it, the local simulation runs.
 */
import { ChainClient, ChainError, FREE, STUNT_OF, configFromEnv, type AbuseKind, type CareAction, type CatView, type Collection, type Totals } from '@emo-pets/chain';

import { DAY, type Game, type PaidAction, label } from './state';
import { walletKind } from '../wallet';
import { cue } from '../sound/cue';

export const chainCfg = configFromEnv(import.meta.env as unknown as Record<string, string | undefined>);
export const chainClient = chainCfg ? new ChainClient(chainCfg) : null;
export const CHAIN_MODE = chainClient !== null;

export type Pending = 'wallet' | 'chain' | null;
/** A pet's identity across collections: ids collide (cat #7 and inversebrah #7 both exist), so a key carries the collection. */
export const petKey = (col: Collection, id: number) => `${col}:${id}`;
export type ChainSnapshot = {
  owner: `0x${string}` | null;
  /** every pet the wallet holds, cats first, then inversebrahs */
  cats: CatView[];
  activeId: number | null;
  activeCol: Collection;
  /** a pet we are only looking at (/pet/<id>, /inversebrah/pet/<id>), not necessarily ours */
  spectator: CatView | null;
  totals: Totals | null;
  /** inversebrah's own totals (his burn queue from names), when this build has him */
  inverseTotals: Totals | null;
  /** Sahur's, the same */
  sahurTotals: Totals | null;
  /** Thiccums', the same (only in a build with his switch on) */
  thiccumsTotals?: Totals | null;
  /** has the connected wallet minted its inversebrah / its Sahur (one each, forever) */
  hasMinted: Partial<Record<Collection, boolean | null>>;
  /** petKey → item ids it is wearing (its owner still holds them), for our pets and the spectator */
  worn: Record<string, number[]>;
  /** item id → copies the connected wallet holds */
  held: Record<number, number>;
  loaded: boolean;
  pending: Pending;
  pendingLabel: string;
  /** the pet a transaction in flight is for (petKey), when it is for one: the page names it while another pet is on screen */
  pendingFor?: string | null;
  /** the wallet was asked to sign and has not answered for a long time: offer a way out */
  stuck: boolean;
  error: string | null;
  log: string[];
};

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
const POLL_MS = 5000;
const PET_DEBOUNCE_MS = 1500;
const MAX_PETS = 20;

const CARE: Record<Exclude<PaidAction, 'name' | 'revive'>, CareAction> = { feed: 'feed', wash: 'wash', play: 'play', sleep: 'sleep', clean: 'clean' };
export type BatchAction = keyof typeof CARE;
/** How many of the wallet's cats each batch action would touch right now. */
/** The "All" tab's numbers: pets touched per action, how many of those cost 1 MON (cats; the other pets are free), and the
 *  wallet's living pets per collection. */
export type AllCounts = Record<BatchAction, number> & { total: number; asleep: number; mon: Record<BatchAction, number>; byCol: Partial<Record<Collection, number>> };
export type Target = { id: number; col: Collection };
const MAX_BATCH = 200; // the contract's cap per care() call

export class ChainStore {
  private token = 0;   // a tx generation, so an abandoned request's late reply cannot touch the UI
  private snap: ChainSnapshot = { owner: null, cats: [], activeId: null, activeCol: 'cat', spectator: null, totals: null, inverseTotals: null, sahurTotals: null, hasMinted: {}, worn: {}, held: {}, loaded: false, pending: null, pendingLabel: '', stuck: false, error: null, log: [] };
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private due = 0;
  private watchId: number | null = null;
  private watchCol: Collection = 'cat';
  private petCount = 0;
  /** the pet the counted taps are for: the one on screen at the first tap, not whichever is on screen when they are sent */
  private petFor: { id: number; col: Collection } | null = null;
  private petTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private after: Promise<void> | null = null;

  constructor(private readonly client: ChainClient) {}

  get(): ChainSnapshot { return this.snap; }
  subscribe(fn: () => void): () => void { this.subs.add(fn); this.schedule(0); return () => { this.subs.delete(fn); }; }

  /** The wallet that signs and whose cats we show. */
  setSigner(provider: Eip1193 | null, address: `0x${string}` | null): void {
    this.client.setSigner(provider && address ? { provider: provider as never, address } : null);
    if (this.snap.owner !== address) {
      this.set({ owner: address, cats: [], activeId: null, held: {}, hasMinted: {}, loaded: false, error: null });
      this.schedule(0);
    }
  }

  /** Look at one pet by id (the /pet/<id> and /inversebrah/pet/<id> pages). */
  watch(id: number | null, col: Collection = 'cat'): void {
    this.watchId = id; this.watchCol = col;
    if (id === null) this.set({ spectator: null });
    else this.set({ activeCol: col });
    this.schedule(0);
  }

  setActive(id: number, col: Collection = 'cat'): void { this.set({ activeId: id, activeCol: col }); }

  /** The active pet: one of ours if we own it, else the spectator view. */
  active(): CatView | null {
    const s = this.snap;
    if (s.activeId !== null) {
      const mine = s.cats.find((c) => c.id === s.activeId && c.col === s.activeCol);
      if (mine) return mine;
    }
    if (s.spectator) return s.spectator;
    return s.cats[0] ?? null;
  }

  ownsActive(): boolean {
    const a = this.active();
    return !!a && !!this.snap.owner && a.owner.toLowerCase() === this.snap.owner.toLowerCase();
  }

  /**
   * Read the chain again. Resolves once a read that STARTED after the call has landed: a read already running was
   * started before whatever the caller is waiting for (the transaction it just sent, or someone connecting, whose pets
   * that read knows nothing of), so a call during one gets the read after it. Before, it returned at once, and the page
   * put the room back in step with numbers older than the action it had just played: the poop came straight back after
   * a clean, a pet woke up again after going to bed. It never rejects: a failed read is in `error`.
   */
  refresh(): Promise<void> {
    if (this.inflight) return (this.after ??= this.inflight.then(() => { this.after = null; return this.refresh(); }));
    const run = this.read();
    this.inflight = run;
    return run.finally(() => { this.inflight = null; if (!this.after) this.schedule(POLL_MS); });
  }

  private async read(): Promise<void> {
    const forOwner = this.snap.owner;
    try {
      const hasInverse = !!this.client.cfg.inverse; const hasSahur = !!this.client.cfg.sahur;
      // the fourth pet's reads, started alongside the rest (only in a build with his switch on; every use tests the
      // switch itself, because the minifier drops a branch only on the constant, not on a variable made from it)
      const thicc = __THICCUMS__ && this.client.cfg.thiccums
        ? Promise.all([this.client.totals('thiccums').catch(() => null), forOwner ? this.client.hasMinted(forOwner, 'thiccums').catch(() => null) : Promise.resolve(null)])
        : null;
      const [cats, totals, inverseTotals, sahurTotals, spectator, mintedFrok, mintedSahur] = await Promise.all([
        forOwner ? this.client.petsOf(forOwner) : Promise.resolve([] as CatView[]),
        this.client.totals(),
        hasInverse ? this.client.totals('frok').catch(() => null) : Promise.resolve(null),
        hasSahur ? this.client.totals('sahur').catch(() => null) : Promise.resolve(null),
        this.watchId !== null ? this.client.cat(this.watchId, this.watchCol).catch(() => null) : Promise.resolve(null),
        forOwner && hasInverse ? this.client.hasMinted(forOwner, 'frok').catch(() => null) : Promise.resolve(null),
        forOwner && hasSahur ? this.client.hasMinted(forOwner, 'sahur').catch(() => null) : Promise.resolve(null),
      ]);
      const [thiccTotals, mintedThicc] = __THICCUMS__ && thicc ? await thicc : [null, null];
      // the fifth pet: has this wallet minted its r3tard (only in a build with his switch on)
      const mintedR3 = __R3TARDS__ && this.client.cfg.r3tards && forOwner ? await this.client.hasMinted(forOwner, 'r3tards').catch(() => null) : null;
      // the sixth: his Emonad (only with his switch on)
      const mintedEg = __EMONAD__ && this.client.cfg.emonad && forOwner ? await this.client.hasMinted(forOwner, 'emonad').catch(() => null) : null;
      const hasMinted: Partial<Record<Collection, boolean | null>> = { ...(hasInverse ? { frok: mintedFrok } : {}), ...(hasSahur ? { sahur: mintedSahur } : {}), ...(__THICCUMS__ && thicc ? { thiccums: mintedThicc } : {}), ...(__R3TARDS__ && this.client.cfg.r3tards ? { r3tards: mintedR3 } : {}), ...(__EMONAD__ && this.client.cfg.emonad ? { emonad: mintedEg } : {}) };
      if (this.snap.owner !== forOwner) return; // the wallet changed underneath us; the next run covers it
      const first = cats[0];
      const activeId = this.snap.activeId ?? this.watchId ?? first?.id ?? null;
      const activeCol = this.snap.activeId !== null ? this.snap.activeCol : this.watchId !== null ? this.watchCol : (first?.col ?? 'cat');
      // the shop: what these pets wear and what the wallet holds; a failure here must not hide the pets
      let worn = this.snap.worn; let held = this.snap.held;
      if (this.client.cfg.items) {
        const all = [...cats, ...(spectator && !cats.some((c) => c.id === spectator.id && c.col === spectator.col) ? [spectator] : [])];
        const byCol = (col: Collection) => all.filter((c) => c.col === col).map((c) => c.id);
        const cols = this.client.collections;
        const [wornBy, h] = await Promise.all([
          Promise.all(cols.map((col) => this.client.equippedMany(byCol(col), col).catch(() => null))),
          forOwner ? this.client.holdings(forOwner).catch(() => null) : Promise.resolve({} as Record<number, number>),
        ]);
        if (wornBy.every((w) => w !== null)) { worn = {}; cols.forEach((col, i) => { for (const [id, w] of Object.entries(wornBy[i]!)) worn[petKey(col, Number(id))] = w; }); }
        if (h) held = h;
        if (this.snap.owner !== forOwner) return;
      }
      this.set({ cats, totals, inverseTotals, sahurTotals, ...(__THICCUMS__ && thicc ? { thiccumsTotals: thiccTotals } : {}), spectator, activeId, activeCol, hasMinted, worn, held, loaded: true, error: null });
    } catch (e) {
      // a failed read is not an empty wallet: `loaded` stays false until a read succeeds, so the page
      // keeps its "looking in your wallet" screen (with the reason) instead of "no Emogotchi here"
      this.set({ error: e instanceof ChainError ? e.message : 'Monad is not answering right now · retrying' });
    }
  }

  // ---------------------------------------------------------------- actions (each one a transaction)
  async act(a: PaidAction | 'wake'): Promise<void> {
    const cat = this.active();
    if (!cat) throw new ChainError('No pet selected.', 'wallet');
    const free = FREE.has(cat.col);
    if (a === 'wake') return this.tx('Waking up', () => this.client.wake(cat.id, cat.col), 'Wake · gas only', cat);
    if (a === 'revive') return this.tx('Reviving', () => this.client.revive(cat.id, cat.col), free ? `${label('revive')} · free` : `${label('revive')} · 1000 MON → 500 MON to the burn queue`, cat);
    if (a === 'name') throw new ChainError('Use setName.', 'wallet');
    return this.tx(label(a), () => this.client.care(cat.id, CARE[a], cat.col), free ? `${label(a)} · free` : `${label(a)} · 1 MON → 0.8 MON to the burn queue`, cat);
  }

  /** One of inversebrah's four abuses, Sahur's tung or Thiccums' bounce, on the active pet. Gas only. */
  async abuse(kind: AbuseKind): Promise<void> {
    const cat = this.active();
    if (!cat || cat.col !== STUNT_OF[kind]) throw new ChainError(kind === 'tung' ? 'Only Sahur does that.' : __THICCUMS__ && kind === 'bounce' ? 'Only Thiccums does that.' : 'Only inversebrah can take that.', 'wallet');
    const what = ({ screenshot: 'Screenshotting', slap: 'Slapping', squeeze: 'Squeezing', burn: 'Setting him on fire', tung: 'Tung tung tung', ...(__THICCUMS__ ? { bounce: 'Bouncing that butt' } : {}) } as Record<AbuseKind, string>)[kind];
    return this.tx(what, () => this.client.abuse(cat.id, kind), `${kind[0]!.toUpperCase()}${kind.slice(1)} · free · counted forever`, cat);
  }

  /** Mint the wallet's one inversebrah (or its one Sahur, or its one Thiccums). Free. Returns his id. */
  async mint(col: Collection = 'frok'): Promise<number> {
    const who = col === 'sahur' ? 'Sahur' : __THICCUMS__ && col === 'thiccums' ? 'Thiccums' : __R3TARDS__ && col === 'r3tards' ? 'a r3tard' : __EMONAD__ && col === 'emonad' ? 'an Emonad' : 'inversebrah';
    if (!this.client.collections.includes(col)) throw new ChainError(`This build has no ${who}.`, 'wallet');
    await this.tx(`Minting ${who}`, () => this.client.mint(col), `${who} minted · free · one per wallet`);
    const t = await this.client.totals(col);
    const mine = this.snap.owner ? await this.client.catsOf(this.snap.owner, col) : [];
    const id = mine.length ? Math.max(...mine.map((c) => c.id)) : t.totalSupply;
    this.set({ activeId: id, activeCol: col, hasMinted: { ...this.snap.hasMinted, [col]: true } });
    return id;
  }

  /**
   * The pets a batch action touches, EVERY living pet the wallet holds across every collection (operator, 2026-10-01: the
   * All tab "only feeds cats. It should feed all pets I'm holding"): all of them for feed, wash and play (the contracts
   * wake a sleeping pet for those), awake pets with energy to refill for sleep, pets with a poop for clean.
   */
  allTargets(a: BatchAction): Target[] {
    const mine = this.snap.cats.filter((c) => c.alive);
    const pick = a === 'sleep' ? mine.filter((c) => !c.asleep && c.energy < 100) : a === 'clean' ? mine.filter((c) => c.poop) : mine;
    return pick.map((c) => ({ id: c.id, col: c.col }));
  }

  /** The "All" tab's numbers over every pet the wallet holds; `mon` is what each action costs (1 MON per cat, the rest free). */
  allCounts(): AllCounts {
    const mine = this.snap.cats.filter((c) => c.alive);
    const n = (a: BatchAction) => this.allTargets(a).length;
    const mon = (a: BatchAction) => this.allTargets(a).filter((t) => !FREE.has(t.col)).length;
    const byCol: Partial<Record<Collection, number>> = {};
    for (const c of mine) byCol[c.col] = (byCol[c.col] ?? 0) + 1;
    return {
      total: mine.length, asleep: mine.filter((c) => c.asleep).length,
      feed: n('feed'), wash: n('wash'), play: n('play'), sleep: n('sleep'), clean: n('clean'),
      mon: { feed: mon('feed'), wash: mon('wash'), play: mon('play'), sleep: mon('sleep'), clean: mon('clean') },
      byCol,
    };
  }

  /**
   * One care() transaction per collection the action applies to (each pet is its own contract: the cats' costs 1 MON a
   * pet, the others are free), the paid one first so a refused payment stops before anything free was spent on gas;
   * more than 200 pets in one collection means more than one. `many` names a collection in the log when several are in.
   */
  async actAll(a: BatchAction, many: (col: Collection) => string = (col) => col): Promise<void> {
    const targets = this.allTargets(a);
    if (targets.length === 0) throw new ChainError('Nothing to do.', 'wallet');
    const cols = [...new Set(targets.map((t) => t.col))].sort((x, y) => Number(FREE.has(x)) - Number(FREE.has(y)));
    // the pending line names the whole batch and which transaction of it is on (operator, 2026-10-05: with mixed pets it read
    // "Feed ×2 cats" while every pet was being fed, one transaction per kind); the log line stays per transaction
    const steps = cols.reduce((s, col) => s + Math.ceil(targets.filter((t) => t.col === col).length / MAX_BATCH), 0);
    let step = 0;
    for (const col of cols) {
      const ids = targets.filter((t) => t.col === col).map((t) => t.id);
      for (let i = 0; i < ids.length; i += MAX_BATCH) {
        const chunk = ids.slice(i, i + MAX_BATCH);
        step += 1;
        const what = `${label(a)} ×${chunk.length}${cols.length > 1 ? ` ${many(col)}` : ''}`;
        const doing = steps > 1 ? `${label(a)} all ${targets.length} pets · ${step} of ${steps}: ${chunk.length} ${many(col)}` : what;
        await this.tx(doing, () => this.client.careMany(chunk, chunk.map(() => CARE[a]), col), FREE.has(col) ? `${what} · free` : `${what} · ${chunk.length} MON → ${(chunk.length * 0.8).toFixed(1).replace(/\.0$/, '')} MON to the burn queue`);
      }
    }
  }

  async setName(name: string): Promise<void> {
    const cat = this.active();
    if (!cat) throw new ChainError('No pet selected.', 'wallet');
    return this.tx('Naming', () => this.client.setName(cat.id, name, cat.col), `Name · 10 MON → 8 MON to the burn queue`, cat);
  }

  /** Taps are counted and sent as one pet(id, n) a moment after the last tap, for the pet they were on: a tap on another
   *  pet (the page switched) first sends the last pet's count. */
  pet(): void {
    const cat = this.active();
    if (!cat || !this.ownsActive() || !cat.alive) return;
    if (this.petFor && (this.petFor.id !== cat.id || this.petFor.col !== cat.col) && this.petCount > 0) void this.flushPets();
    this.petFor = { id: cat.id, col: cat.col };
    this.petCount += 1;
    if (this.petTimer) clearTimeout(this.petTimer);
    if (this.petCount >= MAX_PETS) { void this.flushPets(); return; }
    this.petTimer = setTimeout(() => void this.flushPets(), PET_DEBOUNCE_MS);
  }

  private async flushPets(): Promise<void> {
    const n = this.petCount; this.petCount = 0;
    const cat = this.petFor; this.petFor = null;
    if (this.petTimer) { clearTimeout(this.petTimer); this.petTimer = null; }
    if (!cat || n === 0) return;
    try {
      await this.tx('Petting', () => this.client.pet(cat.id, n, cat.col), `Pet ×${n} · gas only`, cat);
    } catch { /* logged by tx */ }
  }

  async crank(): Promise<void> { return this.tx('Burning', () => this.client.crankBurn(), 'Burn · queued MON → EMO → 0x…dEaD'); }

  // ---------------------------------------------------------------- the item shop
  /**
   * Claim an item. The hint is what the item's gate wants: a cat id for a cat-gated item (the cat is the cap's
   * key), the address of a collection the wallet holds a pet of for a pet-gated one (the emo hair), nothing for
   * an open item.
   */
  async claimItem(itemId: number, name: string, hint: { catId: number } | { collection: Collection } | null, price: bigint): Promise<void> {
    const h = hint === null ? ('0x' as const) : 'catId' in hint ? ChainClient.catHint(hint.catId) : ChainClient.collectionHint(this.client.addr(hint.collection));
    const cost = price === 0n ? 'free · gas only' : `${Number(price / 1_000_000_000_000_000n) / 1000} MON → 80% to the burn queue`;
    return this.tx(`Claiming ${name}`, () => this.client.claimItem(itemId, 1, h, price), `${name} · ${cost}`);
  }
  /** Put one item on several of our pets (of one collection) in one transaction. */
  async wear(catIds: number[], itemId: number, name: string, col: Collection = 'cat'): Promise<void> {
    if (catIds.length === 0) throw new ChainError('Pick a pet.', 'wallet');
    return this.tx(`Dressing ${catIds.length === 1 ? 'the pet' : `${catIds.length} pets`}`, () => this.client.equipMany(catIds, itemId, col), `${name} on${catIds.length === 1 ? '' : ` ×${catIds.length}`} · gas only`, catIds.length === 1 ? { id: catIds[0]!, col } : null);
  }
  async undress(catId: number, itemId: number, name: string, col: Collection = 'cat'): Promise<void> {
    return this.tx('Undressing', () => this.client.unequip(catId, itemId, col), `${name} off · gas only`, { id: catId, col });
  }

  /**
   * Give up waiting on a wallet that is not going to answer. The request may still be sitting in the wallet, so the
   * token makes a late reply harmless: it can no longer touch the UI, and the next refresh picks up anything that
   * did land. Without this a wallet that opens and shows nothing leaves every button dead until a reload.
   */
  abandon(): void {
    if (!this.snap.pending) return;
    this.token += 1;
    this.set({ pending: null, pendingLabel: '', pendingFor: null, stuck: false, error: 'Stopped waiting. If your wallet does sign it, the pet updates by itself in a moment.' });
  }

  private async tx(what: string, send: () => Promise<`0x${string}`>, line: string, pet: { id: number; col: Collection } | null = null): Promise<void> {
    if (this.snap.pending) throw new ChainError('Another transaction is in progress.', 'wallet');
    const mine = ++this.token;
    const live = () => this.token === mine;
    const kind = walletKind();
    this.set({ pending: 'wallet', pendingLabel: `${what} · ${kind === 'passkey' ? 'your passkey account is signing' : 'confirm in your wallet'}`, pendingFor: pet ? petKey(pet.col, pet.id) : null, stuck: false, error: null });
    // The phase used to flip to "waiting for Monad" on a 1.5s timer whether or not anything had been signed, which
    // on a phone meant it ALWAYS said that — hiding the one instruction that mattered. Now the client says when the
    // wallet actually signed, and if it never does, the UI offers a way out instead of hanging for ever.
    cue('tx.ask');
    this.client.onHash = () => { if (live()) { cue('tx.signed'); this.set({ pending: 'chain', pendingLabel: `${what} · waiting for Monad`, stuck: false }); } };
    const nudge = setTimeout(() => { if (live() && this.snap.pending === 'wallet') this.set({ stuck: true }); }, 30_000);
    try {
      await send();
      if (!live()) return;
      cue('tx.ok', { v: 0.7 });
      this.set({ pending: null, pendingLabel: '', pendingFor: null, stuck: false, log: [line, ...this.snap.log].slice(0, 6) });
    } catch (e) {
      const msg = e instanceof ChainError ? e.message : (e as Error).message;
      if (live()) { cue('tx.fail'); this.set({ pending: null, pendingLabel: '', pendingFor: null, stuck: false, error: msg }); }
      throw e;
    } finally {
      clearTimeout(nudge);
      this.client.onHash = null;
    }
  }

  // ---------------------------------------------------------------- internals
  private set(p: Partial<ChainSnapshot>): void {
    this.snap = { ...this.snap, ...p };
    for (const s of this.subs) s();
  }

  /** The next read, in `ms`. A read already due sooner stays (a connect's immediate read is never pushed back by the
   *  ordinary poll that a finishing read asks for). With nobody watching, reads stop. */
  private schedule(ms: number): void {
    if (this.subs.size === 0) { if (this.timer) clearTimeout(this.timer); this.timer = null; return; }
    const at = Date.now() + ms;
    if (this.timer && this.due <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.due = at;
    this.timer = setTimeout(() => { this.timer = null; void this.refresh(); }, ms);
  }
}

export const chainStore = chainClient ? new ChainStore(chainClient) : null;
if (import.meta.env.DEV && typeof window !== 'undefined') { const w = window as unknown as { __chain?: unknown; __client?: unknown }; w.__chain = chainStore; w.__client = chainClient; }

/** The contract's view of a cat in the shape the page already renders. */
export function toGame(v: CatView, totals: Totals | null, log: string[]): Game {
  const nowSec = Math.floor(Date.now() / 1000);
  const secondsIntoDay = nowSec % DAY;
  const day = Math.max(1, v.day || 1);
  return {
    stats: { food: v.food, clean: v.clean, fun: v.fun, energy: v.energy },
    record: { feeds: v.feeds, washes: v.washes, plays: v.plays, naps: v.naps, cleanups: v.cleanups, pets: v.pets, names: v.names, deaths: v.deaths, revives: v.revives, screenshots: v.screenshots, slaps: v.slaps, squeezes: v.squeezes, burns: v.burns, tungs: v.tungs, ...(__THICCUMS__ ? { bounces: v.bounces ?? 0 } : {}) },
    alive: v.alive,
    zeroFor: 0,
    diedOnDay: v.alive ? null : day,
    lastPetDay: null,
    sleeping: v.asleep,
    poop: v.poop,
    poopDue: null,
    t: (day - 1) * DAY + secondsIntoDay,
    speed: 1,
    spentMon: Number(v.monPaid / 1_000_000_000_000_000n) / 1000,
    burnedEmo: totals ? Math.round(Number(totals.emoBurned / 1_000_000_000_000_000n) / 1000) : 0,
    actions: v.feeds + v.washes + v.plays + v.naps + v.cleanups + v.names + v.revives,
    log,
  };
}
