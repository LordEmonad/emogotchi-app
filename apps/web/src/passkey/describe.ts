/**
 * What a transaction does, in words, for the passkey account's confirm sheet. With a passkey account there is no
 * wallet popup between a tap and a signature, so this file is the wallet's "are you sure": it decodes the call against
 * the contracts this site knows, says plainly what moves, and decides the one thing that matters most: whether a call
 * is harmless enough to sign without asking. That list is an ALLOWLIST, never a denylist. Anything that carries MON,
 * moves a pet or an item, grants an approval, or targets a contract or a function this file does not know, always asks.
 */
import { decodeFunctionData, formatEther, type Abi, type Address, type Hex } from 'viem';
import { autocareAbi, autocareVaultAbi, emogotchiAbi, emogotchiDropAbi, emogotchiItemsAbi, inversegotchiAbi, r3tardgotchiAbi, emonadgotchiAbi, sahuragotchiAbi, thiccumsgotchiAbi } from '@emo-pets/chain';
import { cfg as chainCfg } from './config';
import { ITEM_LABEL } from '../items';

export type TxRequest = { to?: Address | null; data?: Hex; value?: bigint };
/** routine: a known, harmless call. spend: MON leaves. transfer: a pet or an item leaves. approval: someone else gets
 *  the right to move assets. unknown: this site cannot say what it does. */
export type Risk = 'routine' | 'spend' | 'transfer' | 'approval' | 'unknown';
export type TxSummary = {
  title: string;
  detail: string[];
  risk: Risk;
  /** the contract's name as this site knows it, or the bare address */
  contract: string;
  value: bigint;
  /** true only for allowlisted, zero-value calls: may be signed without a sheet while the account is unlocked */
  silent: boolean;
  /** this site never asks for it (an unknown call, or a stranger's approval): the sheet makes the person tick a box first */
  danger?: boolean;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const mon = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString(undefined, { maximumFractionDigits: 4 })} MON`;
const CARE = ['feed', 'play', 'wash', 'put to bed', 'clean up after'] as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Kind = 'cat' | 'frok' | 'sahur' | 'thiccums' | 'r3tards' | 'emonad' | 'items' | 'drop' | 'autocare';
type Known = { kind: Kind; name: string; abi: Abi; pet: string };

function known(to: Address): Known | null {
  const c = chainCfg; if (!c) return null;
  const a = to.toLowerCase();
  if (a === c.contract.toLowerCase()) return { kind: 'cat', name: 'Emogotchi', abi: emogotchiAbi as Abi, pet: 'Emogotchi' };
  if (c.inverse && a === c.inverse.toLowerCase()) return { kind: 'frok', name: 'Inversegotchi', abi: inversegotchiAbi as Abi, pet: 'inversebrah' };
  if (c.sahur && a === c.sahur.toLowerCase()) return { kind: 'sahur', name: 'Tung Tung Tung Sahuragotchi', abi: sahuragotchiAbi as Abi, pet: 'Sahur' };
  if (__THICCUMS__ && c.thiccums && a === c.thiccums.toLowerCase()) return { kind: 'thiccums', name: 'Thiccumsgotchi', abi: thiccumsgotchiAbi as Abi, pet: 'Thiccums' };
  if (__R3TARDS__ && c.r3tards && a === c.r3tards.toLowerCase()) return { kind: 'r3tards', name: 'r3tardgotchi', abi: r3tardgotchiAbi as Abi, pet: 'r3tard' };
  if (__EMONAD__ && c.emonad && a === c.emonad.toLowerCase()) return { kind: 'emonad', name: 'Emonadgotchi', abi: emonadgotchiAbi as Abi, pet: 'Emonad' };
  if (c.items && a === c.items.toLowerCase()) return { kind: 'items', name: 'Item shop', abi: emogotchiItemsAbi as Abi, pet: 'item' };
  if (c.drop && a === c.drop.toLowerCase()) return { kind: 'drop', name: 'Emogotchi claim', abi: emogotchiDropAbi as Abi, pet: 'Emogotchi' };
  if (c.autocare && a === c.autocare.toLowerCase()) return { kind: 'autocare', name: 'Autocare', abi: autocareAbi as Abi, pet: 'pet' };
  return null;
}

/** Zero-value calls that cannot lose the account anything: signed without a sheet while unlocked. Nothing else is. */
const SILENT = {
  cat: new Set(['pet', 'wake', 'poke', 'crankBurn', 'sweep', 'skim']),
  // every care and stunt on a frok is free, and his revive costs nothing
  frok: new Set(['mint', 'feed', 'play', 'wash', 'sleep', 'clean', 'care', 'wake', 'pet', 'screenshot', 'slap', 'squeeze', 'ignite', 'revive', 'poke', 'crankBurn', 'sweep', 'skim']),
  // the same contract with one stunt: everything but naming is free on him too
  sahur: new Set(['mint', 'feed', 'play', 'wash', 'sleep', 'clean', 'care', 'wake', 'pet', 'tung', 'revive', 'poke', 'crankBurn', 'sweep', 'skim']),
  // Sahur's contract with his own stunt in place of tung (only in a build with his switch on). Gas, measured on a mainnet
  // fork 2026-09-29: bounce 37k, mint 142k (the real node charges ~1.3x: Sahur's mint is 142k on the fork, 186k live),
  // so about 0.005 and 0.02 MON at 102 gwei, far under SILENT_FEE_CAP
  ...(__THICCUMS__ ? { thiccums: new Set(['mint', 'feed', 'play', 'wash', 'sleep', 'clean', 'care', 'wake', 'pet', 'bounce', 'revive', 'poke', 'crankBurn', 'sweep', 'skim']) } : {}),
  // the same contract again with NO stunt (only in a build with his switch on): its mint and cares cost what Thiccums' do
  ...(__R3TARDS__ ? { r3tards: new Set(['mint', 'feed', 'play', 'wash', 'sleep', 'clean', 'care', 'wake', 'pet', 'revive', 'poke', 'crankBurn', 'sweep', 'skim']) } : {}),
  // the r3tard's contract with Emonad's name (only in a build with his switch on): the same calls, the same gas
  ...(__EMONAD__ ? { emonad: new Set(['mint', 'feed', 'play', 'wash', 'sleep', 'clean', 'care', 'wake', 'pet', 'revive', 'poke', 'crankBurn', 'sweep', 'skim']) } : {}),
  items: new Set(['claim', 'equip', 'equipMany', 'unequip', 'prune', 'crankBurn', 'crankFallback', 'sweep', 'skim', 'noteSwapPath']),
  drop: new Set(['claim']),
  // withdraw only ever returns the caller's own pets and MON to the caller
  autocare: new Set(['runPets', 'run', 'runAll', 'sweepTeam', 'withdraw']),
} as Record<Kind, ReadonlySet<string>>;

const MON_ = 10n ** 18n;
const TENTH = 10n ** 17n;
/**
 * What the cat's `receive()` will make of a bare payment. The amount IS the instruction (N.d MON: do d to N of
 * your cats, and exactly 1000.0 revives the longest-dead), so a wallet that only said "send 2 MON" would be hiding
 * the actual effect. Anything it cannot read, it reverts.
 */
function protocol(value: bigint): string[] {
  const refuse = 'The game reads the amount as an instruction and would refuse this one: it costs gas and changes nothing.';
  if (value === 1000n * MON_) return ['The game reads this exact amount as a revive: your longest-dead cat comes back with every meter at 60. Half of it buys EMO and burns it.'];
  if (value % TENTH !== 0n) return [refuse];
  const n = value / MON_;
  const d = Number((value % MON_) / TENTH);
  if (n === 0n || n > 200n || d > 4) return [refuse];
  return [`The game reads the amount as an instruction: it will ${CARE[d]} ${n} of your cats, the ${d === 0 ? 'hungriest' : d === 1 ? 'most bored' : d === 2 ? 'dirtiest' : d === 3 ? 'most tired' : 'messiest'} first.`, 'Each care costs 1 MON, and 80% of that buys EMO and burns it.'];
}
/** Where a bare payment to a contract this site knows actually ends up. */
function lands(c: Known, value: bigint): string[] {
  if (c.kind === 'cat') return ['This is the game itself, not a wallet.', ...protocol(value)];
  // the shop takes a bare payment and skim() sweeps it into the burn queue; it never comes back
  if (c.kind === 'items') return ['This is the item shop, not a wallet. MON sent straight to it joins the queue that buys EMO and burns it, and cannot come back.'];
  return ['This is a contract, not a wallet, and it has no way to accept a bare payment: it would refuse this, costing gas and changing nothing.'];
}

export function describeTx(tx: TxRequest): TxSummary {
  const value = tx.value ?? 0n;
  const data = tx.data && tx.data !== '0x' ? tx.data : null;
  if (!tx.to) return { title: 'Deploy a contract', detail: ['This site never asks for this. Cancel unless you know exactly why you are seeing it.'], risk: 'unknown', contract: 'new contract', value, silent: false, danger: true };
  const to = tx.to;

  // a plain send: MON to an address, no call
  if (!data) {
    const c = known(to);
    if (c) return { title: `Send ${mon(value)} to the ${c.name} contract`, detail: [`${to}`, ...lands(c, value)], risk: 'spend', contract: c.name, value, silent: false };
    return { title: `Send ${mon(value)}`, detail: [`to ${to}`, 'A transfer cannot be undone. Check the address.'], risk: 'spend', contract: short(to), value, silent: false };
  }

  const k = known(to);
  if (!k) {
    // An Autocare vault has no fixed address, and a selector is not proof of one: any contract can expose
    // `withdrawMon`. Describing an unverified address as "your vault, it can only pay you" would be this wallet
    // vouching for a stranger, so it does not. When Autocare ships, the way to describe a vault kindly is to check
    // the address against the machine's own `vaultOf(owner)` first; until then an unknown contract reads as one.
    return { title: 'Unknown contract', detail: [`${to}`, `call ${data.slice(0, 10)}`, 'This site does not know this contract or what this call does. Cancel unless you are sure.', ...(value > 0n ? [`It carries ${mon(value)}.`] : [])], risk: 'unknown', contract: short(to), value, silent: false, danger: true };
  }

  let fn = ''; let args: readonly unknown[] = [];
  try { const d = decodeFunctionData({ abi: k.abi, data }); fn = d.functionName; args = d.args ?? []; }
  catch {
    return { title: `Unknown call on ${k.name}`, detail: [`call ${data.slice(0, 10)}`, 'This site does not know what this call does. Cancel unless you are sure.'], risk: 'unknown', contract: k.name, value, silent: false, danger: true };
  }
  const id = (i: number) => `#${String(args[i])}`;
  const out = (title: string, detail: string[], risk: Risk, danger = false): TxSummary => ({
    title, detail, risk, contract: k.name, value, danger,
    silent: risk === 'routine' && value === 0n && SILENT[k.kind].has(fn),
  });
  const paid = value > 0n ? 'spend' as const : 'routine' as const;

  // ---- what every collection shares: moving a pet, and letting someone else move them
  if (fn === 'transferFrom' || fn === 'safeTransferFrom') {
    if (k.kind === 'items') return out(`Send ${String(args[3])} × ${ITEM_LABEL[Number(args[2])] ?? `item #${String(args[2])}`}`, [`to ${String(args[1])}`, 'It leaves this account for good. Only they could send it back.'], 'transfer');
    return out(`Send ${k.pet} ${id(2)}`, [`to ${String(args[1])}`, 'The pet, its name and its whole record leave this account for good. Only they could send it back.'], 'transfer');
  }
  if (fn === 'safeBatchTransferFrom') {
    const ids = (args[2] as readonly bigint[] | undefined) ?? []; const qs = (args[3] as readonly bigint[] | undefined) ?? [];
    const what = ids.map((id, i) => `${String(qs[i] ?? '?')} × ${ITEM_LABEL[Number(id)] ?? `item #${String(id)}`}`);
    return out(`Send ${what.length === 1 ? what[0] : `${what.length} kinds of item`}`, [`to ${String(args[1])}`, ...(what.length > 1 ? [what.join(', ')] : []), 'They leave this account for good. Only they could send them back.'], 'transfer');
  }
  if (fn === 'approve') return out(`Let ${short(String(args[0]))} move ${k.pet} ${id(1)}`, [`${String(args[0])}`, 'That address could take this pet at any time until you revoke it. This site never asks for this.'], 'approval', true);
  if (fn === 'setApprovalForAll') {
    const op = String(args[0]); const on = Boolean(args[1]);
    // Autocare holds pets and nothing else: an item approval to it is not the call the site makes, so it is not excused
    const machine = (k.kind === 'cat' || k.kind === 'frok') && !!chainCfg?.autocare && op.toLowerCase() === chainCfg.autocare.toLowerCase();
    if (!on) return out(`Revoke ${machine ? 'Autocare' : short(op)}'s permission`, [`${op}`, `It can no longer move your ${k.kind === 'items' ? 'items' : `${k.pet}s`}.`], 'routine');
    return out(
      machine ? `Let Autocare move your ${k.pet}s` : `Let ${short(op)} move ALL your ${k.kind === 'items' ? 'items' : `${k.pet}s`}`,
      machine ? [`${op}`, 'Needed once, so the machine can take the pets you deposit. It can only ever hand them back to you.']
        : [`${op}`, 'That address could take every one of them at any time until you revoke it. This site never asks for this.'],
      'approval', !machine,
    );
  }

  if (k.kind === 'cat' || k.kind === 'frok' || k.kind === 'sahur' || (__THICCUMS__ && k.kind === 'thiccums') || (__R3TARDS__ && k.kind === 'r3tards') || (__EMONAD__ && k.kind === 'emonad')) {
    if (fn === 'feed' || fn === 'play' || fn === 'wash' || fn === 'sleep' || fn === 'clean') {
      const verb = { feed: 'Feed', play: 'Play with', wash: 'Wash', sleep: 'Put to bed', clean: 'Clean up after' }[fn];
      return out(`${verb} ${k.pet} ${id(0)}`, k.kind === 'cat' ? ['80% of it buys EMO and burns it.'] : ['His care is free.'], paid);
    }
    if (fn === 'care') {
      const ids = (args[0] as readonly bigint[]) ?? []; const acts = (args[1] as readonly number[]) ?? [];
      const counts = [0, 0, 0, 0, 0]; for (const a of acts) if (a >= 0 && a < 5) counts[a]! += 1;
      const parts = counts.map((n, i) => (n ? `${n} × ${CARE[i]}` : '')).filter(Boolean);
      // `care` charges one MON per ENTRY and the same pet may appear more than once, so the headline counts actions
      const pets = new Set(ids.map(String)).size;
      const title = acts.length === pets ? `Care for ${plural(pets, k.pet)}` : `${plural(acts.length, 'care')} on ${plural(pets, k.pet)}`;
      return out(title, [parts.join(', '), ...(k.kind === 'cat' ? ['80% of it buys EMO and burns it.'] : ['His care is free.'])], paid);
    }
    if (fn === 'pet') return out(`Pet ${k.pet} ${id(0)}`, [`${String(args[1])} time${String(args[1]) === '1' ? '' : 's'} · gas only`], 'routine');
    if (fn === 'wake') return out(`Wake ${k.pet} ${id(0)}`, ['Gas only.'], 'routine');
    if (fn === 'setName') return out(`Name ${k.pet} ${id(0)} “${String(args[1])}”`, ['80% of it buys EMO and burns it.'], paid);
    if (fn === 'revive') return out(`Revive ${k.pet} ${id(0)}`, k.kind === 'cat' ? ['Every meter comes back to 60. Half of it buys EMO and burns it.'] : ['His revive is free.'], paid);
    if (fn === 'mint' && k.kind === 'frok') return out('Mint an inversebrah', ['Free, one per wallet.'], 'routine');
    if (fn === 'mint' && k.kind === 'sahur') return out('Mint a Sahur', ['Free, one per wallet.'], 'routine');
    if (__THICCUMS__ && fn === 'mint' && k.kind === 'thiccums') return out('Mint a Thiccums', ['Free, one per wallet.'], 'routine');
    if (__R3TARDS__ && fn === 'mint' && k.kind === 'r3tards') return out('Mint a r3tard', ['Free, one per wallet.'], 'routine');
    if (__EMONAD__ && fn === 'mint' && k.kind === 'emonad') return out('Mint an Emonad', ['Free, one per wallet.'], 'routine');
    if (__THICCUMS__ && fn === 'bounce') return out(`Butt bounce, Thiccums ${id(0)}`, ['Counted on chain. Gas only.'], 'routine');
    if (fn === 'screenshot' || fn === 'slap' || fn === 'squeeze' || fn === 'ignite') return out(`${fn[0]!.toUpperCase()}${fn.slice(1)} inversebrah ${id(0)}`, ['Counted on chain. Gas only.'], 'routine');
    if (fn === 'tung') return out(`Tung tung tung, Sahur ${id(0)}`, ['Counted on chain. Gas only.'], 'routine');
    if (fn === 'poke') return out(`Refresh ${k.pet} ${id(0)} on chain`, ['Gas only.'], 'routine');
    if (fn === 'crankBurn') return out('Run the burn', ['Turns the queued MON into EMO and burns it. None of it is yours. Gas only.'], 'routine');
    if (fn === 'sweep' || fn === 'skim') return out('Housekeeping', ['Moves no money of yours. Gas only.'], 'routine');
  }
  if (k.kind === 'items') {
    if (fn === 'claim') return out(`Claim ${String(args[1])} × item #${String(args[0])}`, [value > 0n ? '80% of it buys EMO and burns it.' : 'Free.'], paid);
    if (fn === 'equip') return out(`Put item #${String(args[2])} on pet ${id(1)}`, ['Gas only.'], 'routine');
    if (fn === 'equipMany') return out(`Put item #${String(args[2])} on ${plural(((args[1] as readonly bigint[]) ?? []).length, 'pet')}`, ['Gas only.'], 'routine');
    if (fn === 'unequip') return out(`Take item #${String(args[2])} off pet ${id(1)}`, ['Gas only.'], 'routine');
    if (fn === 'prune' || fn === 'crankBurn' || fn === 'crankFallback' || fn === 'sweep' || fn === 'skim' || fn === 'noteSwapPath') return out('Housekeeping', ['Moves nothing of yours. Gas only.'], 'routine');
  }
  if (k.kind === 'drop' && fn === 'claim') return out('Claim your Emogotchi', ['Free. One per wallet.'], 'routine');
  if (k.kind === 'autocare') {
    const n = (i: number) => ((args[i] as readonly unknown[]) ?? []).length;
    if (fn === 'deposit') return out(`Send ${plural(n(0), 'pet')} to Autocare`, [`${Number(args[1]) === 1 ? 'Full care' : 'Fed'} · the MON goes into your own vault, less 1 MON per pet`, 'Only this account can take them back.'], value > 0n ? 'spend' : 'transfer');
    if (fn === 'topUp') return out('Top up an Autocare vault', [`for ${String(args[0])}`, 'It can only be spent on that owner\'s pets, and only they can withdraw it.'], paid);
    if (fn === 'setMode') return out(`Switch ${plural(n(0), 'pet')} to ${Number(args[1]) === 1 ? 'Full care' : 'Fed'}`, ['Changes what the machine spends on them each day.'], 'spend');
    if (fn === 'withdraw') return out(`Take ${plural(n(0), 'pet')} back from Autocare`, [args[1] ? 'With all of your MON.' : 'The MON stays in your vault.'], 'routine');
    if (fn === 'runPets' || fn === 'run' || fn === 'runAll') return out('Run an Autocare round', ['Does what is due and pays you the bounty. Gas only.'], 'routine');
    if (fn === 'sweepTeam') return out('Housekeeping', ['Moves nothing of yours. Gas only.'], 'routine');
  }
  // a function of a known contract that this file has no words for: never silent
  return { title: `${fn} on ${k.name}`, detail: ['This site has no description for this call. Cancel unless you are sure.', ...(value > 0n ? [`It carries ${mon(value)}.`] : [])], risk: 'unknown', contract: k.name, value, silent: false, danger: true };
}
