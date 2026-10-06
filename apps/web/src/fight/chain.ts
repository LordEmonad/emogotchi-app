/**
 * Fight Club on chain (contracts/src/fightclub/FightClub.sol): reads for the page (open challenges, a wallet's fights,
 * one fight, the looks, a pet's record, the entropy fee, what a wallet is owed) and the writes (challenge, cancel,
 * accept, abort, withdraw), through the site's own wallet the way every other write goes (ChainClient.writeTo's rules:
 * a paid call the wallet cannot cover is refused in plain words before anything is signed, the Monad 10 MON reserve of a
 * MetaMask smart account included; gas estimated on the real node plus a tenth).
 *
 * `VITE_FIGHTCLUB_ADDRESS` switches it on; the sandbox's local world (tools/fightclub/local.mjs) sets it with the fork.
 */
import { createWalletClient, custom, formatEther, parseAbi, type Address } from 'viem';
import { ChainError, type Collection } from '@emo-pets/chain';
import type { FightChar } from './fightDirector';
import { chainCfg, chainClient } from '../game/chain';

export const FIGHT_ADDRESS = (import.meta.env.VITE_FIGHTCLUB_ADDRESS as Address | undefined) || null;
// The contract's floor is 1 MON and is immutable. The site's floor is 2 since 2026-10-02 (operator): the one who takes a
// fight also pays Pyth's fee for the random number, about 1.4 MON, so a 1 MON fight cost more to enter than it could
// win. Every challenge is made through this form, so the site's floor is the one that holds; a 1 MON challenge made
// straight at the contract still shows in the list, with the fee pointed out (OpenCard).
export const MIN_STAKE = 2; export const MAX_STAKE = 1000; export const FEE_PCT = 5;
/** the contract's own floor, in MON: what a challenge made past the site can be */
export const CONTRACT_MIN_STAKE = 1;

const VIEW = 'uint256 id, uint8 status, address challenger, address challengerCollection, uint256 challengerPet, address opponent, uint256 stake, uint256 createdAt, uint256 expiresAt, address acceptor, address acceptorCollection, uint256 acceptorPet, uint256 acceptedAt, uint256 abortableAt, address provider, uint64 sequence, bytes32 random, uint256 foughtAt, address winner, uint256 payout';
export const fightClubAbi = parseAbi([
  // the contract's errors, so a revert decodes to its name (the words below key on them)
  'error ZeroAddress()',
  'error DuplicateCollection()',
  'error Reentrancy()',
  'error CollectionNotAllowed(address collection)',
  'error StakeOutOfRange(uint256 stake)',
  'error BadOpponent()',
  'error NotOwner()',
  'error PetBusy(uint256 fightId)',
  'error NotOpen(uint256 id)',
  'error CannotCancel(uint256 id)',
  'error Expired(uint256 id)',
  'error OwnChallenge()',
  'error NotOpponent(address opponent)',
  'error ChallengerPetGone(uint256 id)',
  'error PetDead(address collection, uint256 tokenId)',
  'error ChallengerPetDead(uint256 id)',
  'error WrongValue(uint256 required, uint256 sent)',
  'error SequenceReused(uint64 sequence)',
  'error UnknownRequest(address provider, uint64 sequence)',
  'error NotPending(uint256 id)',
  'error TooEarly(uint256 at)',
  'error NothingOwed()',
  'error NothingToDo()',
  'error TransferFailed()',
  'error LengthMismatch()',
  'function challenge(address collection, uint256 tokenId, address opponent) payable returns (uint256)',
  'function cancel(uint256 id)',
  'function accept(uint256 id, address collection, uint256 tokenId) payable',
  'function abort(uint256 id)',
  'function withdraw()',
  'function quote() view returns (uint256)',
  'function owed(address) view returns (uint256)',
  'function openCount() view returns (uint256)',
  'function fightCount() view returns (uint256)',
  `function fight(uint256 id) view returns ((${VIEW}))`,
  `function openChallenges(uint256 from, uint256 count) view returns ((${VIEW})[])`,
  'function fightCountOf(address who) view returns (uint256)',
  `function fightsOf(address who, uint256 from, uint256 count) view returns ((${VIEW})[])`,
  'function recordOf(address collection, uint256 tokenId) view returns ((uint32 wins, uint32 losses, uint40 lastAt, bool lastWon, uint64 lastFight))',
  'function looksOf(address[] collections, uint256[] tokenIds) view returns ((uint256 beltUntil, uint256 blackEyeUntil)[])',
  'function activeFightOf(address, uint256) view returns (uint256)',
]);

export type FightStatus = 'none' | 'open' | 'cancelled' | 'pending' | 'fought' | 'aborted';
const STATUS: FightStatus[] = ['none', 'open', 'cancelled', 'pending', 'fought', 'aborted'];
export type PetRef = { col: Collection; id: number };
export type Fight = {
  id: number; status: FightStatus;
  challenger: Address; challengerPet: PetRef; opponent: Address | null;
  stake: bigint; createdAt: number; expiresAt: number;
  acceptor: Address | null; acceptorPet: PetRef | null; acceptedAt: number; abortableAt: number;
  sequence: bigint; random: `0x${string}` | null; foughtAt: number; winner: Address | null; payout: bigint;
};
export type Looks = { belt: boolean; blackEye: boolean };
export type Record_ = { wins: number; losses: number; lastAt: number; lastWon: boolean };

const ZERO = '0x0000000000000000000000000000000000000000';
const ZERO32 = `0x${'0'.repeat(64)}`;
export const mon = (v: bigint) => { const s = formatEther(v); return s.includes('.') ? s.replace(/(\.\d{0,2})\d*$/, '$1').replace(/\.?0+$/, '') : s; };

/** the site's collections by address, both ways */
function collections() {
  const m = new Map<string, Collection>();
  if (chainCfg?.contract) m.set(chainCfg.contract.toLowerCase(), 'cat');
  if (chainCfg?.inverse) m.set(chainCfg.inverse.toLowerCase(), 'frok');
  if (chainCfg?.sahur) m.set(chainCfg.sahur.toLowerCase(), 'sahur');
  return m;
}
/** The collections that fight (the contract accepts these three and is immutable); Thiccums cannot, yet. */
export const FIGHTERS: readonly Collection[] = ['cat', 'frok', 'sahur'];
export const canFight = (col: Collection) => FIGHTERS.includes(col);
/** A fighting collection's character, for the ring. */
export const fightCharOf = (col: Collection): FightChar => (col === 'frok' ? 'frog' : col === 'sahur' ? 'sahur' : 'cat');

export const addrOf = (col: Collection): Address => {
  const a = col === 'cat' ? chainCfg?.contract : col === 'frok' ? chainCfg?.inverse : chainCfg?.sahur;
  if (!a) throw new ChainError(`This build has no ${col} contract.`, 'wallet');
  return a as Address;
};

type Raw = { id: bigint; status: number; challenger: Address; challengerCollection: Address; challengerPet: bigint; opponent: Address; stake: bigint; createdAt: bigint; expiresAt: bigint; acceptor: Address; acceptorCollection: Address; acceptorPet: bigint; acceptedAt: bigint; abortableAt: bigint; provider: Address; sequence: bigint; random: `0x${string}`; foughtAt: bigint; winner: Address; payout: bigint };
function shape(r: Raw): Fight {
  const cols = collections();
  const pet = (a: Address, id: bigint): PetRef | null => (a === ZERO ? null : { col: cols.get(a.toLowerCase()) ?? 'cat', id: Number(id) });
  return {
    id: Number(r.id), status: STATUS[r.status] ?? 'none',
    challenger: r.challenger, challengerPet: pet(r.challengerCollection, r.challengerPet)!, opponent: r.opponent === ZERO ? null : r.opponent,
    stake: r.stake, createdAt: Number(r.createdAt), expiresAt: Number(r.expiresAt),
    acceptor: r.acceptor === ZERO ? null : r.acceptor, acceptorPet: pet(r.acceptorCollection, r.acceptorPet), acceptedAt: Number(r.acceptedAt), abortableAt: Number(r.abortableAt),
    sequence: r.sequence, random: r.random === ZERO32 ? null : r.random, foughtAt: Number(r.foughtAt), winner: r.winner === ZERO ? null : r.winner, payout: r.payout,
  };
}

type Signer = { provider: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }; address: Address };
const RESERVE = 10n * 10n ** 18n;
/** The most an accept will ever pay Pyth for the random number (normally 1.4 MON). */
const MAX_FEE = 5n * 10n ** 18n;

export class FightClient {
  private signer: Signer | null = null;
  onHash: ((h: `0x${string}`) => void) | null = null;
  constructor(readonly address: Address) {}
  private get pub() { if (!chainClient) throw new ChainError('No chain in this build.', 'wallet'); return chainClient.pub; }
  setSigner(s: Signer | null) { this.signer = s; }
  get me() { return this.signer?.address ?? null; }

  private read<T>(functionName: string, args: unknown[] = []): Promise<T> {
    return this.pub.readContract({ address: this.address, abi: fightClubAbi, functionName, args } as never) as Promise<T>;
  }
  async quote() { return this.read<bigint>('quote'); }
  async owed(a: Address) { return this.read<bigint>('owed', [a]); }
  async fight(id: number) { return shape(await this.read<Raw>('fight', [BigInt(id)])); }
  /** how many challenges there have ever been: their ids are 1..count */
  async count() { return Number(await this.read<bigint>('fightCount')); }
  /** several fights by id (reads made together travel as one Multicall3 call) */
  many(ids: number[]) { return Promise.all(ids.map((id) => this.fight(id))); }
  async open(): Promise<Fight[]> {
    const n = Number(await this.read<bigint>('openCount'));
    const out: Fight[] = [];
    for (let i = 0; i < n; i += 50) out.push(...(await this.read<Raw[]>('openChallenges', [BigInt(i), BigInt(Math.min(50, n - i))])).map(shape));
    return out;
  }
  async fightsOf(a: Address, last = 30): Promise<Fight[]> {
    const n = Number(await this.read<bigint>('fightCountOf', [a]));
    const from = Math.max(0, n - last);
    if (n === 0) return [];
    return (await this.read<Raw[]>('fightsOf', [a, BigInt(from), BigInt(n - from)])).map(shape).reverse();
  }
  async looks(pets: PetRef[]): Promise<Looks[]> {
    if (!pets.length) return [];
    const now = Math.floor(Date.now() / 1000);
    const r = await this.read<{ beltUntil: bigint; blackEyeUntil: bigint }[]>('looksOf', [pets.map((p) => addrOf(p.col)), pets.map((p) => BigInt(p.id))]);
    return r.map((x) => ({ belt: Number(x.beltUntil) > now, blackEye: Number(x.blackEyeUntil) > now }));
  }
  async record(p: PetRef): Promise<Record_> {
    const r = await this.read<{ wins: number; losses: number; lastAt: number; lastWon: boolean }>('recordOf', [addrOf(p.col), BigInt(p.id)]);
    return { wins: Number(r.wins), losses: Number(r.losses), lastAt: Number(r.lastAt), lastWon: r.lastWon };
  }
  async busy(p: PetRef) { return Number(await this.read<bigint>('activeFightOf', [addrOf(p.col), BigInt(p.id)])); }

  // ---------------------------------------------------------------- writes
  challenge(p: PetRef, stake: bigint, opponent: Address | null) { return this.write('challenge', [addrOf(p.col), BigInt(p.id), opponent ?? ZERO], stake); }
  cancel(id: number) { return this.write('cancel', [BigInt(id)]); }
  async accept(f: Fight, p: PetRef) {
    const fee = await this.quote();
    // the fee is Pyth's and has no ceiling in the contract (it scales with the provider's default gas limit; audit,
    // 2026-09-30): what is sent is the ceiling, so never send a fee past what a fight is worth
    if (fee > MAX_FEE) throw new ChainError(`Pyth's fee for the random number is ${mon(fee)} MON right now, far above the usual 1.4. Not sending that: try again later.`, 'wallet');
    return this.write('accept', [BigInt(f.id), addrOf(p.col), BigInt(p.id)], f.stake + fee);
  }
  abort(id: number) { return this.write('abort', [BigInt(id)]); }
  withdraw() { return this.write('withdraw', []); }

  private async write(fn: string, args: unknown[], value = 0n): Promise<`0x${string}`> {
    const s = this.signer;
    if (!s) throw new ChainError('Connect a wallet first.', 'wallet');
    const pub = this.pub;
    const req = { address: this.address, abi: fightClubAbi, functionName: fn, args, value, account: s.address } as never;
    if (value > 0n) {
      const [bal, code] = await Promise.all([pub.getBalance({ address: s.address }).catch(() => null), pub.getCode({ address: s.address }).catch(() => undefined)]);
      if (bal !== null) {
        const smart = !!code && code.toLowerCase().startsWith('0xef0100');
        const need = value + (smart ? RESERVE : 0n);
        if (bal < need) throw new ChainError(smart
          ? `This needs ${mon(value)} MON and this wallet holds ${mon(bal)} MON. It is a MetaMask smart account, so Monad also keeps 10 MON in it: it needs ${mon(need)} MON plus a little gas.`
          : `This needs ${mon(value)} MON and this wallet holds ${mon(bal)} MON. Top it up and try again.`, 'wallet');
      }
    }
    let gas: bigint;
    try { gas = await pub.estimateContractGas(req); } catch (e) { throw human(e); }
    gas += (gas * 15n) / 100n;   // Monad charges the limit; the games' state() reads inside challenge/accept vary with the pets
    const wc = createWalletClient({ chain: chainCfg!.chain, transport: custom(s.provider), account: s.address });
    let hash: `0x${string}`;
    try { hash = await wc.writeContract({ ...(req as object), gas } as never); this.onHash?.(hash); } catch (e) { throw human(e); }
    const receipt = await pub.waitForTransactionReceipt({ hash, pollingInterval: 800, timeout: 120_000 });
    if (receipt.status !== 'success') throw new ChainError('The transaction reverted on chain.', 'reverted');
    return hash;
  }
}

/** The contract's own errors, in words a player can act on. */
const WORDS: Record<string, string> = {
  StakeOutOfRange: `A stake is ${MIN_STAKE} to ${MAX_STAKE} MON.`,
  BadOpponent: 'You cannot challenge yourself.',
  NotOwner: 'That pet is not in this wallet.',
  PetBusy: 'That pet is already in a fight or has a challenge up. One at a time.',
  NotOpen: 'That challenge is gone: taken, cancelled or expired.',
  CannotCancel: 'Only the challenger can take it down before it expires.',
  Expired: 'That challenge has expired.',
  OwnChallenge: 'That is your own challenge.',
  NotOpponent: 'That challenge is for someone else.',
  ChallengerPetGone: 'The challenger no longer has that pet, so the challenge is off.',
  // (before PetDead: the words are matched by name, and PetDead is inside ChallengerPetDead)
  ChallengerPetDead: "The challenger's pet has died, so the challenge is off.",
  PetDead: 'Dead pets cannot fight. Revive it first, then come back.',
  WrongValue: 'The amount sent was not the stake plus the fee. Try again.',
  NotPending: 'That fight is not waiting any more.',
  TooEarly: 'The dice get a day to roll before a fight can be called off.',
  NothingOwed: 'Nothing is waiting for you.',
  CollectionNotAllowed: 'Only cats, inversebrahs and Sahurs fight here.',
};
function human(e: unknown): ChainError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user (rejected|denied)|rejected the request/i.test(msg)) return new ChainError('You cancelled the transaction.', 'rejected');
  for (const [k, v] of Object.entries(WORDS)) if (msg.includes(k)) return new ChainError(v, 'reverted');
  if (/insufficient funds/i.test(msg)) return new ChainError('This wallet does not hold enough MON for that.', 'wallet');
  if (/took too long|timed? ?out|fetch failed|HTTP request failed|429/i.test(msg)) return new ChainError('Monad is slow to answer right now. Nothing was sent: try again in a moment.', 'network');
  return new ChainError(msg.split('\n')[0]!.slice(0, 200), 'reverted');
}

export const fightClient = FIGHT_ADDRESS && chainClient ? new FightClient(FIGHT_ADDRESS) : null;
/** The chain's rule, for the animation: an even random number is the challenger's (the left corner's) win. */
export const winnerSide = (random: `0x${string}`): 0 | 1 => (BigInt(random) % 2n === 0n ? 0 : 1);
