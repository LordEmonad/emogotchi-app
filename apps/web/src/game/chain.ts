/**
 * Live mode. When VITE_CONTRACT_ADDRESS is set the site reads cats from the contract and every
 * action is a real transaction through the connected wallet. Without it, the local simulation runs.
 */
import { ChainClient, ChainError, configFromEnv, type CareAction, type CatView, type Totals } from '@emo-pets/chain';
import { DAY, type Game, type PaidAction, label } from './state';

export const chainCfg = configFromEnv(import.meta.env as unknown as Record<string, string | undefined>);
export const chainClient = chainCfg ? new ChainClient(chainCfg) : null;
export const CHAIN_MODE = chainClient !== null;

export type Pending = 'wallet' | 'chain' | null;
export type ChainSnapshot = {
  owner: `0x${string}` | null;
  cats: CatView[];
  activeId: number | null;
  /** a cat we are only looking at (/pet/<id>), not necessarily ours */
  spectator: CatView | null;
  totals: Totals | null;
  loaded: boolean;
  pending: Pending;
  pendingLabel: string;
  error: string | null;
  log: string[];
};

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
const POLL_MS = 5000;
const PET_DEBOUNCE_MS = 1500;
const MAX_PETS = 20;

const CARE: Record<Exclude<PaidAction, 'name' | 'revive'>, CareAction> = { feed: 'feed', wash: 'wash', play: 'play', sleep: 'sleep', clean: 'clean' };

export class ChainStore {
  private snap: ChainSnapshot = { owner: null, cats: [], activeId: null, spectator: null, totals: null, loaded: false, pending: null, pendingLabel: '', error: null, log: [] };
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchId: number | null = null;
  private petCount = 0;
  private petTimer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;

  constructor(private readonly client: ChainClient) {}

  get(): ChainSnapshot { return this.snap; }
  subscribe(fn: () => void): () => void { this.subs.add(fn); this.schedule(0); return () => { this.subs.delete(fn); }; }

  /** The wallet that signs and whose cats we show. */
  setSigner(provider: Eip1193 | null, address: `0x${string}` | null): void {
    this.client.setSigner(provider && address ? { provider: provider as never, address } : null);
    if (this.snap.owner !== address) {
      this.set({ owner: address, cats: [], activeId: null, loaded: false, error: null });
      this.schedule(0);
    }
  }

  /** Look at one cat by id (the /pet/<id> page). */
  watch(id: number | null): void {
    this.watchId = id;
    if (id === null) this.set({ spectator: null });
    this.schedule(0);
  }

  setActive(id: number): void { this.set({ activeId: id }); }

  /** The active cat: one of ours if we own it, else the spectator view. */
  active(): CatView | null {
    const s = this.snap;
    if (s.activeId !== null) {
      const mine = s.cats.find((c) => c.id === s.activeId);
      if (mine) return mine;
    }
    if (s.spectator) return s.spectator;
    return s.cats[0] ?? null;
  }

  ownsActive(): boolean {
    const a = this.active();
    return !!a && !!this.snap.owner && a.owner.toLowerCase() === this.snap.owner.toLowerCase();
  }

  async refresh(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const [cats, totals, spectator] = await Promise.all([
        this.snap.owner ? this.client.catsOf(this.snap.owner) : Promise.resolve([] as CatView[]),
        this.client.totals(),
        this.watchId !== null ? this.client.cat(this.watchId).catch(() => null) : Promise.resolve(null),
      ]);
      const activeId = this.snap.activeId ?? this.watchId ?? cats[0]?.id ?? null;
      this.set({ cats, totals, spectator, activeId, loaded: true, error: null });
    } catch (e) {
      this.set({ error: (e as Error).message, loaded: true });
    } finally {
      this.busy = false;
      this.schedule(POLL_MS);
    }
  }

  // ---------------------------------------------------------------- actions (each one a transaction)
  async act(a: PaidAction | 'wake'): Promise<void> {
    const cat = this.active();
    if (!cat) throw new ChainError('No cat selected.', 'wallet');
    if (a === 'wake') return this.tx('Waking up', () => this.client.wake(cat.id), 'Wake · gas only');
    if (a === 'revive') return this.tx('Reviving', () => this.client.revive(cat.id), `${label('revive')} · 1000 MON → 500 MON to the burn queue`);
    if (a === 'name') throw new ChainError('Use setName.', 'wallet');
    return this.tx(label(a), () => this.client.care(cat.id, CARE[a]), `${label(a)} · 1 MON → 0.8 MON to the burn queue`);
  }

  async setName(name: string): Promise<void> {
    const cat = this.active();
    if (!cat) throw new ChainError('No cat selected.', 'wallet');
    return this.tx('Naming', () => this.client.setName(cat.id, name), `Name · 10 MON → 8 MON to the burn queue`);
  }

  /** Taps are counted and sent as one pet(id, n) a moment after the last tap. */
  pet(): void {
    const cat = this.active();
    if (!cat || !this.ownsActive() || !cat.alive) return;
    this.petCount += 1;
    if (this.petTimer) clearTimeout(this.petTimer);
    if (this.petCount >= MAX_PETS) { void this.flushPets(); return; }
    this.petTimer = setTimeout(() => void this.flushPets(), PET_DEBOUNCE_MS);
  }

  private async flushPets(): Promise<void> {
    const n = this.petCount; this.petCount = 0;
    if (this.petTimer) { clearTimeout(this.petTimer); this.petTimer = null; }
    const cat = this.active();
    if (!cat || n === 0) return;
    try {
      await this.tx('Petting', () => this.client.pet(cat.id, n), `Pet ×${n} · gas only`);
    } catch { /* logged by tx */ }
  }

  async crank(): Promise<void> { return this.tx('Burning', () => this.client.crankBurn(), 'Burn · queued MON → EMO → 0x…dEaD'); }

  private async tx(what: string, send: () => Promise<`0x${string}`>, line: string): Promise<void> {
    if (this.snap.pending) throw new ChainError('Another transaction is in progress.', 'wallet');
    this.set({ pending: 'wallet', pendingLabel: `${what} · confirm in your wallet`, error: null });
    try {
      const p = send();
      // once the wallet has signed, the client waits for the receipt; show that phase after a beat
      const t = setTimeout(() => { if (this.snap.pending) this.set({ pending: 'chain', pendingLabel: `${what} · waiting for Monad` }); }, 1500);
      await p;
      clearTimeout(t);
      this.set({ pending: null, pendingLabel: '', log: [line, ...this.snap.log].slice(0, 6) });
      await this.refresh();
    } catch (e) {
      const msg = e instanceof ChainError ? e.message : (e as Error).message;
      this.set({ pending: null, pendingLabel: '', error: msg });
      throw e;
    }
  }

  // ---------------------------------------------------------------- internals
  private set(p: Partial<ChainSnapshot>): void {
    this.snap = { ...this.snap, ...p };
    for (const s of this.subs) s();
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.subs.size === 0) return;
    this.timer = setTimeout(() => void this.refresh(), ms);
  }
}

export const chainStore = chainClient ? new ChainStore(chainClient) : null;

/** The contract's view of a cat in the shape the page already renders. */
export function toGame(v: CatView, totals: Totals | null, log: string[]): Game {
  const nowSec = Math.floor(Date.now() / 1000);
  const secondsIntoDay = nowSec % DAY;
  const day = Math.max(1, v.day || 1);
  return {
    stats: { food: v.food, clean: v.clean, fun: v.fun, energy: v.energy },
    record: { feeds: v.feeds, washes: v.washes, plays: v.plays, naps: v.naps, cleanups: v.cleanups, pets: v.pets, names: v.names, deaths: v.deaths, revives: v.revives },
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
