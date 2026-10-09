/**
 * The passkey account as an EIP-1193 provider, so the rest of the site (wallet.ts, the chain client, viem) treats it
 * exactly like MetaMask: it slots into wallet.ts's `active`, answers the same requests, and throws the same errors.
 *
 * This file is small and always loaded; it holds no key and imports nothing that does. The key lives in account.ts,
 * which is fetched the first time somebody signs. What this file decides:
 *  - who is asked. Every transaction goes through describeTx. Only allowlisted zero-value calls on an unlocked
 *    account with the gas to pay for them are signed without a sheet; everything else waits for the person.
 *  - what is signed. Gas, fees and nonce are fixed HERE before the sheet opens, so the fee shown is the fee signed.
 *  - what is refused. eth_sign (a blank cheque), raw transaction signing and typed data (the shape of off-chain
 *    approvals and marketplace listings, which nothing on this site needs) are not offered at all.
 * Reads are passed through to the public RPC.
 */
import { createPublicClient, hexToBytes, http, isAddress, isHex, type Hex } from 'viem';
import { ask, UserRejected, type Address, type Quote } from './bus';
import { cfg } from './config';
import { describeTx } from './describe';
import { starterIfEmpty } from './starter';
import { checkSiwe } from './siwe';
import type { Remembered } from './account';

export type { Remembered };

const STORE = 'emogotchi.passkey';
const ASK_ALWAYS = 'emogotchi.passkey.ask';

/**
 * The two limits that make "signed without asking" safe to say out loud.
 *
 * On Monad the gas LIMIT is charged, used or not, so a call that is free in itself is not free to sign: the site's own
 * chain client floors some limits at millions of gas (a big batch of care is tens of millions), which at launch-day
 * prices is MON, not dust. The allowlist reasons about what a call DOES; these reason about what it COSTS, and without
 * them the allowlist's promise — that a silent call cannot take the account's money — is not true.
 *
 * PER CALL: anything dearer than this gets the sheet, with the fee on it. Every ordinary gas-only action is far under
 * (a pet is 60k gas, dressing three pets 222k, a frok mint 250k: about 0.006, 0.022 and 0.025 MON at 100 gwei).
 * PER UNLOCK: a running total, so a loop of individually-cheap calls cannot drain the account while the sheet stays
 * away. It resets when the account locks. Past it, everything asks until the next unlock.
 */
export const SILENT_FEE_CAP = 50_000_000_000_000_000n; // 0.05 MON
export const SILENT_SESSION_CAP = 500_000_000_000_000_000n; // 0.5 MON

// ---------------------------------------------------------------- what this browser remembers (public data only)
export function remembered(): Remembered | null {
  try {
    const r = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Remembered | null;
    if (!r || r.v !== 1 || typeof r.address !== 'string' || !isAddress(r.address) || typeof r.credentialId !== 'string' || !r.credentialId) return null;
    return r;
  } catch { return null; }
}
/** Called the moment an account exists, so a tab closed before the sheet's last button still remembers it. */
export function remember(r: Remembered): void {
  try { localStorage.setItem(STORE, JSON.stringify(r)); } catch { /* private mode: the account works until the tab closes */ }
  memory = r;
}
/** private mode cannot write localStorage; keep the record for the life of the tab so the account still works */
let memory: Remembered | null = null;
const current = (): Remembered | null => remembered() ?? memory;

export const askAlways = (): boolean => { try { return localStorage.getItem(ASK_ALWAYS) === '1'; } catch { return false; } };
export function setAskAlways(on: boolean): void { try { if (on) localStorage.setItem(ASK_ALWAYS, '1'); else localStorage.removeItem(ASK_ALWAYS); } catch { /* private mode */ } }

// ---------------------------------------------------------------- the key module, fetched on first use
type AccountModule = typeof import('./account');
let mod: Promise<AccountModule> | null = null;
let unlocked = false;
/** gas spent without a sheet since this unlock; see SILENT_SESSION_CAP */
let silentSpent = 0n;
const lockSubs = new Set<() => void>();
function account(): Promise<AccountModule> {
  mod ??= import('./account').then((A) => {
    A.onLockChange((u) => { unlocked = u; if (!u) silentSpent = 0n; for (const f of lockSubs) f(); });
    return A;
  }, (e) => { mod = null; throw e; });
  return mod;
}
export const isUnlocked = () => unlocked;
/** Fetch the key module ahead of a click, so a passkey prompt can start inside the click itself. */
export const loadAccount = account;
export function subscribeLock(fn: () => void): () => void { lockSubs.add(fn); return () => { lockSubs.delete(fn); }; }
export async function lock(): Promise<void> { if (mod) (await mod).lock(); }

// ---------------------------------------------------------------- events
type Handler = (...a: unknown[]) => void;
const handlers = new Map<string, Set<Handler>>();
function emit(ev: string, ...a: unknown[]) { for (const h of handlers.get(ev) ?? []) { try { h(...a); } catch { /* a listener's problem */ } } }

/** Forget the account on this device: lock it and drop the record. The passkey itself stays wherever it is saved. */
export async function forget(): Promise<void> {
  await lock();
  memory = null;
  try { localStorage.removeItem(STORE); } catch { /* private mode */ }
  emit('accountsChanged', []);
}

// ---------------------------------------------------------------- the chain
class RpcError extends Error { constructor(readonly code: number, message: string) { super(message); this.name = 'ProviderRpcError'; } }
const net = () => { if (!cfg) throw new RpcError(4900, 'This build is not pointed at a network.'); return cfg; };
const chainHex = () => `0x${net().chain.id.toString(16)}`;
let pubClient: ReturnType<typeof createPublicClient> | null = null;
const pub = () => (pubClient ??= createPublicClient({ chain: net().chain, transport: http(net().rpcUrl) }));

export const balanceOf = (a: Address): Promise<bigint> => pub().getBalance({ address: a });
/** $EMO held, 18 decimals (the account sheet shows it beside the MON: the emo pack is free from 7,000) */
const EMO_TOKEN = '0x81A224F8A62f52BdE942dBF23A56df77A10b7777' as const;
export const emoBalanceOf = (a: Address): Promise<bigint> => pub().readContract({
  address: EMO_TOKEN, functionName: 'balanceOf', args: [a],
  abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
});

/** Gas and fees for a transaction, fixed once. A given gas limit is kept: the chain client sets it with Monad's floors. */
export async function quote(from: Address, tx: { to?: Address | null; data?: Hex; value: bigint; gas?: bigint }): Promise<Quote> {
  const c = pub();
  const [fees, gas] = await Promise.all([
    c.estimateFeesPerGas(),
    tx.gas !== undefined ? Promise.resolve(tx.gas)
      // an estimate is the least that works; a plain payment to a wallet is exactly 21,000, anything else gets headroom
      : c.estimateGas({ account: from, to: tx.to ?? undefined, data: tx.data, value: tx.value } as never).then((g) => (g <= 21_000n ? g : g + g / 5n)),
  ]);
  const maxFeePerGas = fees.maxFeePerGas ?? 0n;
  if (maxFeePerGas === 0n) throw new Error('The network did not quote a fee. Try again.');
  return { gas, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n, fee: gas * maxFeePerGas };
}

// One transaction at a time, and a nonce this tab remembers: two quick sends would otherwise read the same count.
let line: Promise<unknown> = Promise.resolve();
let lastNonce: { of: string; n: number; at: number } | null = null;
async function nextNonce(from: Address): Promise<number> {
  const onChain = await pub().getTransactionCount({ address: from, blockTag: 'pending' });
  // trust our own count only briefly: a transaction that never lands must not leave a gap for ever
  const mine = lastNonce && lastNonce.of === from.toLowerCase() && Date.now() - lastNonce.at < 20_000 ? lastNonce.n + 1 : 0;
  return Math.max(onChain, mine);
}

const big = (v: unknown): bigint | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v)) return BigInt(v);
  throw new RpcError(-32602, 'The transaction has a number this account cannot read.');
};

async function sendTransaction(raw: unknown): Promise<Hex> {
  const r = current();
  if (!r) throw new RpcError(4100, 'No passkey account is connected.');
  const t = (raw ?? {}) as Record<string, unknown>;
  const from = r.address;
  if (typeof t.from === 'string' && t.from.toLowerCase() !== from.toLowerCase()) throw new RpcError(4100, 'That transaction is from a different account.');
  if (t.to !== undefined && t.to !== null && (typeof t.to !== 'string' || !isAddress(t.to))) throw new RpcError(-32602, 'The transaction has a bad address.');
  const data = t.data ?? t.input;
  if (data !== undefined && data !== null && !isHex(data)) throw new RpcError(-32602, 'The transaction has bad data.');
  const tx = { to: (t.to as Address | null | undefined) ?? null, data: (data as Hex | undefined) ?? undefined, value: big(t.value) ?? 0n, gas: big(t.gas ?? t.gasLimit) };

  // A brand-new passkey account holds nothing, and every button on the site would simply fail for it. Ask the
  // Worker for a starter before anything else looks at the chain: `quote` below estimates as `from`, and the
  // sheet would otherwise open showing a balance that is about to change. Quiet on every failure — if no starter
  // comes, this falls through exactly as it did before starters existed and the sheet says "not enough MON".
  await starterIfEmpty(from, balanceOf);

  const summary = describeTx(tx);
  const A = await account();
  const opened = () => A.isUnlocked() && A.unlockedAddress()?.toLowerCase() === from.toLowerCase();
  const quoted = quote(from, tx);
  const balance = balanceOf(from);
  quoted.catch(() => {}); balance.catch(() => {}); // the sheet reports these; they must not surface as unhandled

  let q: Quote | null = null;
  if (summary.silent && opened() && !askAlways()) {
    // harmless, free and already unlocked: sign without a sheet, but only within the two gas limits above, and
    // only if the account can pay. Anything else falls through to the sheet, which is never the wrong answer.
    const got = await Promise.all([quoted, balance]).catch(() => null);
    if (got && got[1] >= got[0].fee + tx.value && got[0].fee <= SILENT_FEE_CAP && silentSpent + got[0].fee <= SILENT_SESSION_CAP) {
      q = got[0];
      silentSpent += got[0].fee;
    }
  }
  if (!q) {
    await ask({ kind: 'tx', summary, from, balance, quote: quoted, unlock: () => A.unlock(r) });
    if (!opened()) throw new RpcError(4100, 'The account is locked.');
    q = await quoted;
  }
  const fixed = q;
  const job = line.then(async () => {
    const nonce = await nextNonce(from);
    try {
      // signed by the key module from exactly the quoted fields (chain id fixed), then sent from here as they are
      const signed = await A.signTransaction({ from, to: tx.to, data: tx.data, value: tx.value, gas: fixed.gas, maxFeePerGas: fixed.maxFeePerGas, maxPriorityFeePerGas: fixed.maxPriorityFeePerGas, nonce });
      const hash = await pub().sendRawTransaction({ serializedTransaction: signed });
      lastNonce = { of: from.toLowerCase(), n: nonce, at: Date.now() };
      return hash;
    } catch (e) {
      // this tab's guess is no longer trustworthy (another tab may have used the nonce, or the send may have landed
      // after the reply was lost): forget it, so the next send reads the chain's pending count instead of guessing
      lastNonce = null;
      throw e;
    }
  });
  line = job.catch(() => {});
  return job;
}

/**
 * What is safe to SHOW of a message. The bytes signed are never touched; this only stops a message from dressing
 * itself up as the sheet's own furniture: a right-to-left override can reverse what is read, and zero-width and
 * control characters are invisible. Anything of that family becomes a visible replacement character.
 */
function showable(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, '\ufffd');
}

/**
 * personal_sign, for ONE message only: Emotown's Sign-In with Ethereum message for this site, this account, this chain,
 * written in the last few minutes (siwe.ts checks every field and the exact layout). Anything else is refused before a
 * sheet opens: a passkey account is not a general-purpose signer, so it can never be talked into signing another
 * site's login, an off-chain approval, or a message pretending to be something else. What it does sign is shown in
 * full on its own sheet and signed only on a real press (Sheets.tsx `pressed`).
 */
async function personalSign(params: unknown[]): Promise<Hex> {
  const r = current();
  if (!r) throw new RpcError(4100, 'No passkey account is connected.');
  // [message, address]; some callers swap them
  const [a, b] = params as [unknown, unknown];
  const msg = typeof a === 'string' && isAddress(a) && typeof b === 'string' && !isAddress(b) ? b : a;
  const who = msg === a ? b : a;
  if (typeof msg !== 'string') throw new RpcError(-32602, 'Nothing to sign.');
  if (typeof who === 'string' && who.toLowerCase() !== r.address.toLowerCase()) throw new RpcError(4100, 'That request is for a different account.');
  const rawHex: Hex = isHex(msg) ? msg : (`0x${[...new TextEncoder().encode(msg)].map((x) => x.toString(16).padStart(2, '0')).join('')}` as Hex);
  let text: string;
  // strict UTF-8, and a byte-order mark kept as a character (the default decoder drops one silently, and then the bytes
  // signed would be three more than the text checked and shown)
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(hexToBytes(rawHex)); } catch { throw new RpcError(4200, SIWE_ONLY); }
  const check = checkSiwe(text, r.address, net().chain.id);
  if (!check.ok) throw new RpcError(4200, SIWE_ONLY);
  const A = await account();
  const opened = () => A.isUnlocked() && A.unlockedAddress()?.toLowerCase() === r.address.toLowerCase();
  await ask({ kind: 'sign', from: r.address, text: showable(text), bytes: (rawHex.length - 2) / 2, clipped: false, unlock: () => A.unlock(r) });
  if (!opened()) throw new RpcError(4100, 'The account is locked.');
  // the clock may have run on while the sheet was open
  if (!checkSiwe(text, r.address, net().chain.id).ok) throw new RpcError(4200, 'That sign-in expired while the sheet was open. Try again.');
  return A.signMessage(r.address, rawHex);
}
const SIWE_ONLY = 'A passkey account only signs the Emotown sign-in message for this site.';

/** lower case: the check lowercases the method, so a differently-cased spelling cannot slip past */
const REFUSED = new Set(['eth_sign', 'eth_signtransaction', 'eth_signtypeddata', 'eth_signtypeddata_v1', 'eth_signtypeddata_v3', 'eth_signtypeddata_v4', 'wallet_sendcalls', 'wallet_grantpermissions', 'eth_decrypt', 'eth_getencryptionpublickey']);

async function request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
  const p = (params ?? []) as unknown[];
  switch (method) {
    case 'eth_chainId': return chainHex();
    case 'net_version': return String(net().chain.id);
    case 'eth_accounts': { const r = current(); return r ? [r.address] : []; }
    case 'eth_requestAccounts': {
      const had = current();
      if (had) return [had.address];
      const made = await ask<Remembered>({ kind: 'onboard' });
      remember(made);
      emit('accountsChanged', [made.address]);
      return [made.address];
    }
    case 'wallet_switchEthereumChain':
    case 'wallet_addEthereumChain': {
      const want = String((p[0] as { chainId?: string } | undefined)?.chainId ?? '').toLowerCase();
      if (want === chainHex()) return null;
      throw new RpcError(4902, `A passkey account only works on ${net().chain.name}.`);
    }
    case 'wallet_revokePermissions': return null;
    case 'wallet_getPermissions': return current() ? [{ parentCapability: 'eth_accounts' }] : [];
    case 'wallet_requestPermissions': await request({ method: 'eth_requestAccounts' }); return [{ parentCapability: 'eth_accounts' }];
    case 'eth_sendTransaction': return sendTransaction(p[0]);
    case 'personal_sign': return personalSign(p);
    default:
      // case-insensitively, so a differently-cased spelling of a refused method cannot look like an unknown read
      if (REFUSED.has(method.toLowerCase()) || method.toLowerCase().startsWith('wallet_')) throw new RpcError(4200, `A passkey account does not do ${method}.`);
      // everything else is a read: hand it to the public RPC
      return (pub() as unknown as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }).request({ method, params: p });
  }
}

export const passkeyProvider = {
  request,
  on(ev: string, fn: Handler) { let s = handlers.get(ev); if (!s) handlers.set(ev, (s = new Set())); s.add(fn); },
  removeListener(ev: string, fn: Handler) { handlers.get(ev)?.delete(fn); },
  isPasskey: true as const,
};

export { UserRejected };
