/**
 * The passkey account itself: the WebAuthn ceremonies (through mera, by Category Labs), the one derivation that turns
 * a passkey's PRF output into an address, and the signing session that holds the key while the account is unlocked.
 * This module is the only place key material exists, and it is loaded only when somebody actually uses a passkey.
 *
 * What is permanent. An account's address is a pure function of four things: the passkey, the relying-party id
 * (support.ts `rpId`), the PRF salt, and the derivation below. Change any one and every existing account is orphaned.
 *  - The salt is mera's own published constant, sha256("mera.prf.salt.v1"), passed EXPLICITLY so that no library
 *    update can move it (mera documents it as stable, and any other mera app on the same rpId derives the same bytes).
 *  - The derivation is mera's documented recipe and ordinary BIP-39/BIP-44: the 32 PRF bytes are the entropy of a
 *    24-word phrase, and the account is m/44'/60'/0'/0/0 of it with no passphrase. So the recovery phrase this site
 *    shows imports into MetaMask, Rabby or any other wallet and lands on the same address. That is the exit.
 *
 * What is never done. No key, seed, phrase or PRF output is written to storage, sent anywhere, or logged. mera's
 * signing session keeps its own copy of the key in a closure and zeroes it on end(); it does not zero the caller's
 * buffers, so every buffer made here is zeroed here. A JavaScript string cannot be zeroed: the 24 words are made as a
 * string at every unlock (BIP-39 derives the seed from the phrase's text) and dropped at once, left to the garbage
 * collector; they are only ever KEPT, and shown, by the sheet that reveals them.
 */
import { createPasskeyWithPrfOutput, createSecp256k1SigningSession, getEvmAddress, getPasskeyPrfOutput, isMeraError, type Secp256k1SigningSession } from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { hexToBytes, type Hex, type LocalAccount } from 'viem';
import { UserRejected, type Address } from './bus';
import { cfg } from './config';
import { rpId } from './support';

/** sha256("mera.prf.salt.v1"): mera's DEFAULT_PRF_SALT, pinned here by value. Never change it. */
export const PRF_SALT: Hex = '0x896d46ac4ac191885c46137439db7bb52fb05cff3ecd34af7cdae0a1e0c00db9';
/** BIP-44, Ethereum, first account, first address: what every wallet derives from a phrase by default. Never change it. */
export const DERIVATION_PATH = "m/44'/60'/0'/0/0";
const RP_NAME = 'Emonad';
const IDLE_LOCK_MS = 15 * 60 * 1000;

/** What this browser remembers about an account: public information only. */
export type Remembered = { v: 1; address: Address; credentialId: string; transports?: readonly string[]; createdAt: number };

/** The passkey was made, but wherever it was saved cannot do PRF, so it cannot hold an account. It stays behind. */
export class PrfUnavailable extends Error {
  constructor() {
    super('This passkey cannot hold an account: the place it was saved does not support it. Delete the passkey named “Emogotchi account” from your password manager, then try again and save it to iCloud Keychain, Google Password Manager or 1Password, or use your phone.');
    this.name = 'PrfUnavailable';
  }
}

// ---------------------------------------------------------------- the session (memory only)
type Live = { session: Secp256k1SigningSession; account: LocalAccount; address: Address };
let live: Live | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;
/** wall-clock of the last use: a timer alone is not enough, since a suspended laptop or a backgrounded tab freezes
 *  timers, and the account would then still be open an hour later */
let lastUse = 0;

/** provider.ts mirrors the lock state for the UI without importing this module eagerly */
const watchers = new Set<(unlocked: boolean) => void>();
export function onLockChange(fn: (unlocked: boolean) => void): () => void { watchers.add(fn); fn(live !== null); return () => { watchers.delete(fn); }; }
const tell = () => { for (const w of watchers) { try { w(live !== null); } catch { /* a listener's problem */ } } };

export const isUnlocked = () => { if (live && stale()) lock(); return live !== null; };
export const unlockedAddress = (): Address | null => (isUnlocked() ? live!.address : null);
export function lock(): void {
  if (idle) { clearTimeout(idle); idle = null; }
  const l = live; live = null;
  try { l?.session.end(); } catch { /* already ended */ }
  if (l) tell();
}
function touch(): void {
  lastUse = Date.now();
  if (idle) clearTimeout(idle);
  idle = setTimeout(lock, IDLE_LOCK_MS);
}
/** True once the account has been idle too long, however little the timer ran. */
const stale = () => Date.now() - lastUse > IDLE_LOCK_MS;

/** PRF output in, signing session out. Zeroes the PRF output and everything derived from it on the way. */
function openSession(prfOutput: Uint8Array): Live {
  let seed: Uint8Array | null = null;
  // every level of the path is its own key that could re-derive the account, so each one is kept and wiped
  const rungs: HDKey[] = [];
  try {
    if (prfOutput.length !== 32) throw new Error('The passkey returned an unexpected result.');
    seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
    let node = HDKey.fromMasterSeed(seed);
    rungs.push(node);
    for (const step of DERIVATION_PATH.split('/').slice(1)) { node = node.derive(`m/${step}`); rungs.push(node); }
    if (!node.privateKey) throw new Error('The passkey returned an unusable result.');
    const session = createSecp256k1SigningSession({ privateKey: node.privateKey }); // the session keeps its own copy
    return { session, account: toViemAccount(session) as LocalAccount, address: getEvmAddress(session.publicKey) };
  } finally {
    prfOutput.fill(0); seed?.fill(0);
    for (const r of rungs) { try { r.wipePrivateData(); } catch { /* nothing left to wipe */ } }
  }
}

/** Turn whatever a ceremony threw into something a person can act on. */
function explain(e: unknown, doing: 'create' | 'open'): Error {
  if (e instanceof UserRejected || e instanceof PrfUnavailable) return e;
  if (isMeraError(e)) {
    if (e.code === 'PRF_UNAVAILABLE') return new PrfUnavailable();
    if (e.code === 'CRYPTO_UNAVAILABLE') return new Error('This browser is missing the cryptography a passkey account needs.');
    const cause = (e as { cause?: { name?: string } }).cause;
    // create() makes the passkey first and, on authenticators that only answer PRF on a second look, opens it after.
    // When that second step is what failed, the passkey exists: say so, or the person makes a second one.
    if (doing === 'create' && /assertion/i.test(e.message)) return new Error('Your passkey was saved, but it was not opened. Choose "I already have one" to finish.');
    // NotAllowedError is the browser's one answer to "cancelled", "timed out" and "no passkey for this site"
    if (cause?.name === 'NotAllowedError' || cause?.name === 'AbortError') {
      return new UserRejected(doing === 'create' ? 'Cancelled. No account was made.' : 'No passkey was used. If you have never made an account here, create one.');
    }
    if (cause?.name === 'SecurityError') return new Error(`This page is not allowed to use passkeys for ${rpId()}.`);
    if (cause?.name === 'InvalidStateError') return new Error('This device already has that passkey. Choose “I already have one” instead.');
    return new Error(doing === 'create' ? 'The passkey could not be created. Try again, or use your phone.' : 'The passkey could not be used. Try again.');
  }
  return e instanceof Error ? e : new Error(String(e));
}

const salt = () => hexToBytes(PRF_SALT);

/** Make a new passkey and the account it holds. One prompt, or two on authenticators that only answer PRF on a second look. */
export async function create(): Promise<Remembered> {
  lock();
  const day = new Date().toISOString().slice(0, 10);
  try {
    const made = await createPasskeyWithPrfOutput({
      rp: { id: rpId(), name: RP_NAME },
      // the name the person sees in their password manager; the date tells two accounts apart
      user: { name: `Emogotchi account ${day}`, displayName: 'Emogotchi account' },
      prfSalt: salt(),
    });
    live = openSession(made.prfOutput);
    touch(); tell();
    return { v: 1, address: live.address, credentialId: made.credentialId, transports: made.transports, createdAt: Date.now() };
  } catch (e) { throw explain(e, 'create'); }
}

/** Open an account with a passkey the person already has: the browser shows its own picker. */
export async function signIn(): Promise<Remembered> {
  lock();
  try {
    const got = await getPasskeyPrfOutput({ rpId: rpId(), prfSalt: salt() });
    live = openSession(got.prfOutput);
    touch(); tell();
    return { v: 1, address: live.address, credentialId: got.credentialId, createdAt: Date.now() };
  } catch (e) { throw explain(e, 'open'); }
}

/** Unlock the remembered account, pinned to its own passkey, and refuse if the passkey opens anything else. */
export async function unlock(r: Remembered): Promise<void> {
  if (live && live.address.toLowerCase() === r.address.toLowerCase()) { touch(); return; }
  lock();
  try {
    const got = await getPasskeyPrfOutput({ rpId: rpId(), prfSalt: salt(), credential: { credentialId: r.credentialId, transports: r.transports } });
    const opened = openSession(got.prfOutput);
    if (opened.address.toLowerCase() !== r.address.toLowerCase()) {
      opened.session.end();
      throw new Error(`That passkey opens a different account (${opened.address.slice(0, 6)}…${opened.address.slice(-4)}), not this one.`);
    }
    live = opened;
    touch(); tell();
  } catch (e) { throw explain(e, 'open'); }
}

/**
 * The 24-word recovery phrase. Always a fresh ceremony, even when unlocked: showing the phrase is the most sensitive
 * thing this account can do, so it asks for the person again every time. The caller must drop the string when done.
 */
export async function revealPhrase(r: Remembered): Promise<string> {
  try {
    const got = await getPasskeyPrfOutput({ rpId: rpId(), prfSalt: salt(), credential: { credentialId: r.credentialId, transports: r.transports } });
    let phrase = '';
    try {
      phrase = entropyToMnemonic(got.prfOutput, wordlist);
      // prove it is this account's phrase before showing it
      const check = openSession(Uint8Array.from(got.prfOutput));
      const same = check.address.toLowerCase() === r.address.toLowerCase();
      check.session.end();
      if (!same) throw new Error('That passkey belongs to a different account.');
      return phrase;
    } finally { got.prfOutput.fill(0); }
  } catch (e) { throw explain(e, 'open'); }
}

// ---------------------------------------------------------------- signing (only while unlocked)
function need(from: Address): Live {
  if (live && stale()) lock(); // the timer may never have run; the clock always has
  if (!live) throw new Error('The account is locked.');
  if (live.address.toLowerCase() !== from.toLowerCase()) throw new Error('A different account is unlocked.');
  touch();
  return live;
}

/** Everything a transaction is signed with is decided by the caller (provider.ts), so what was shown is what is signed. */
export type SendTx = { from: Address; to?: Address | null; data?: Hex; value: bigint; gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; nonce: number };

/**
 * Sign exactly these fields, on this build's chain, and hand back the signed bytes; provider.ts sends them. Nothing is
 * filled in and nothing leaves from here. (It used to go through a wallet client's sendTransaction, whose prepare step,
 * with no numeric chain id, asks the RPC to fill the transaction in (`eth_fillTransaction`) and signs what comes back:
 * an RPC could have chosen the chain id, the gas and the fees, past the sheet and the silent caps. Security review,
 * 2026-09-27.)
 */
export async function signTransaction(tx: SendTx): Promise<Hex> {
  const l = need(tx.from);
  if (!cfg) throw new Error('This build is not pointed at a network.');
  return l.account.signTransaction({ chainId: cfg.chain.id, type: 'eip1559', to: tx.to ?? undefined, data: tx.data, value: tx.value, gas: tx.gas, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas, nonce: tx.nonce });
}
/** EIP-191 personal_sign over raw bytes. */
export async function signMessage(from: Address, raw: Hex): Promise<Hex> { return need(from).account.signMessage({ message: { raw } }); }
