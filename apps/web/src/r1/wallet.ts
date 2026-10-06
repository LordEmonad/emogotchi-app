/**
 * The r1 wallet: a plain Monad account the page makes for itself, for the Rabbit r1.
 *
 * Why it exists. The r1's creations run in Android 13's system WebView (Chrome 101) on a device with no Google
 * services, no biometrics and no screen lock. Measured on the operator's own r1 (2026-09-24): `PublicKeyCredential`
 * does not exist there, so the passkey account (passkey/, built on mera) cannot be created or opened on it. This is
 * the same kind of account otherwise: a BIP-39 phrase, the first BIP-44 address, so the 12 words import into any
 * wallet. Like the passkey account, the site only ever SHOWS a phrase; there is no import flow anywhere.
 *
 * Where the key lives. In this origin's localStorage inside the creations WebView, because that is what actually
 * survives a relaunch: the r1's own `creationStorage` bridge (plain and secure) accepted every write and read back
 * empty on three relaunches in a row. The bridge still gets a copy, and is read when localStorage has nothing, in
 * case a later rabbitOS fixes it. The device has no lock of any kind, so whoever holds the r1 holds the pet's pocket
 * money; the page says so, and the design is to keep a few MON in it, not a stash.
 *
 * What it signs. A transaction to one of this build's own contracts (the pets' games and the item shop), carrying at
 * most 10 MON (a name), and only within a few seconds of a real press on the device: the wheel, the side button or
 * the screen (`armGesture`). No message signing, no typed data, no unknown contract, ever. Reads are forwarded to
 * the public RPC so the chain client can use this like any wallet.
 */
import { createPublicClient, http, isAddress, isHex, type Address, type Hex } from 'viem';
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';
import { chainCfg } from '../game/chain';
import { starterIfEmpty } from '../passkey/starter';

const STORE = 'emogotchi.r1.wallet';
/**
 * transferFrom, both ERC-721 safeTransferFroms, ERC-1155's safeTransferFrom and safeBatchTransferFrom, approve,
 * setApprovalForAll, and the shop's use and consume (they burn items, and use hands them to any contract named)
 */
const GIVE_AWAY = new Set(['0x23b872dd', '0x42842e0e', '0xb88d4fde', '0xf242432a', '0x2eb2c2d6', '0x095ea7b3', '0xa22cb465', '0x262e4edc', '0x7edab8a6']);
/** the most a single transaction from this wallet may carry: a name is 10 MON, and nothing on the r1 asks for more */
export const VALUE_CAP = 10n * 10n ** 18n;
/** how long a press on the device keeps the wallet willing to sign */
const ARM_MS = 20_000;

export type Stored = { v: 1; mnemonic: string; address: Address; createdAt: number };

class RpcError extends Error { constructor(readonly code: number, message: string) { super(message); this.name = 'ProviderRpcError'; } }

// ---------------------------------------------------------------- the r1's storage bridge (best effort, never trusted alone)
type Bridge = { secure?: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }; plain?: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> } };
const bridge = () => (window as unknown as { creationStorage?: Bridge }).creationStorage ?? null;
/** The bridge is injected a moment after the page loads; wait a little for it. */
async function bridgeSoon(ms = 2500): Promise<Bridge | null> {
  const until = Date.now() + ms;
  while (Date.now() < until) { const b = bridge(); if (b) return b; await new Promise((r) => setTimeout(r, 150)); }
  return bridge();
}
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

// ---------------------------------------------------------------- the record
let stored: Stored | null = null;
const valid = (x: unknown): x is Stored => !!x && typeof x === 'object' && (x as Stored).v === 1 && typeof (x as Stored).mnemonic === 'string' && isAddress((x as Stored).address ?? '');

function readLocal(): Stored | null {
  try { const raw = localStorage.getItem(STORE); if (!raw) return null; const x = JSON.parse(raw) as unknown; return valid(x) ? x : null; } catch { return null; }
}
function writeLocal(s: Stored): boolean {
  try { localStorage.setItem(STORE, JSON.stringify(s)); return true; } catch { return false; }
}
async function writeBridge(s: Stored): Promise<void> {
  try { const b = await bridgeSoon(800); await b?.secure?.setItem(STORE, b64(JSON.stringify(s))); } catch { /* the bridge is a courtesy */ }
}
async function readBridge(): Promise<Stored | null> {
  try {
    const b = await bridgeSoon(); const raw = await b?.secure?.getItem(STORE); if (!raw) return null;
    const x = JSON.parse(unb64(raw)) as unknown; return valid(x) ? x : null;
  } catch { return null; }
}

/** The wallet this device holds, if any. Looks in localStorage, then (briefly) in the r1's bridge. */
export async function load(): Promise<Stored | null> {
  if (stored) return stored;
  stored = readLocal();
  if (!stored) { stored = await readBridge(); if (stored) writeLocal(stored); }
  return stored;
}
export const current = (): Stored | null => stored;

/** Make a new account on this device. Refuses if one exists: creating over it would orphan its MON and pets. */
export async function create(): Promise<Stored> {
  if (await load()) throw new Error('This r1 already has a wallet.');
  const mnemonic = generateMnemonic(english);
  const address = mnemonicToAccount(mnemonic).address;
  const s: Stored = { v: 1, mnemonic, address, createdAt: Date.now() };
  if (!writeLocal(s)) throw new Error('This browser cannot store anything, so a wallet made here would be lost the moment the page closed.');
  void writeBridge(s);
  stored = s;
  emit('accountsChanged', [address]);
  return s;
}

/** The recovery phrase, for the screen that shows it. The only way the key ever leaves this device. */
export function phrase(): string[] { return stored ? stored.mnemonic.split(' ') : []; }

// ---------------------------------------------------------------- gestures
let armedAt = 0;
/** A real press happened on the device: the wheel, the side button or the screen. The wallet signs only shortly after one. */
export function armGesture(): void { armedAt = Date.now(); }
const armed = () => Date.now() - armedAt < ARM_MS;

// ---------------------------------------------------------------- the chain
const net = () => { if (!chainCfg) throw new RpcError(4900, 'This build is not pointed at a network.'); return chainCfg; };
let pubClient: ReturnType<typeof createPublicClient> | null = null;
const pub = () => (pubClient ??= createPublicClient({ chain: net().chain, transport: http(net().rpcUrl) }));
export const balanceOf = (a: Address): Promise<bigint> => pub().getBalance({ address: a });
const chainHex = () => `0x${net().chain.id.toString(16)}`;

function knownContract(to: Address): boolean {
  const c = net(); const a = to.toLowerCase();
  const known = [c.contract, c.inverse, c.items, (c as { sahur?: string | null }).sahur].filter((x): x is string => typeof x === 'string' && x.length > 0);
  return known.some((k) => k.toLowerCase() === a);
}

const big = (v: unknown): bigint | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v)) return BigInt(v);
  throw new RpcError(-32602, 'The transaction has a number this wallet cannot read.');
};

// one transaction at a time, and a nonce this page remembers briefly (two quick sends would read the same count)
let line: Promise<unknown> = Promise.resolve();
let lastNonce: { n: number; at: number } | null = null;
async function nextNonce(from: Address): Promise<number> {
  const onChain = await pub().getTransactionCount({ address: from, blockTag: 'pending' });
  const mine = lastNonce && Date.now() - lastNonce.at < 20_000 ? lastNonce.n + 1 : 0;
  return Math.max(onChain, mine);
}

const mon = (wei: bigint) => `${(Number(wei / 10n ** 12n) / 1e6).toFixed(3)} MON`;

async function sendTransaction(raw: unknown): Promise<Hex> {
  const s = stored;
  if (!s) throw new RpcError(4100, 'This r1 has no wallet yet.');
  if (!armed()) throw new RpcError(4100, 'Press a button on the r1 first.');
  const t = (raw ?? {}) as Record<string, unknown>;
  if (typeof t.from === 'string' && t.from.toLowerCase() !== s.address.toLowerCase()) throw new RpcError(4100, 'That transaction is from a different account.');
  if (typeof t.to !== 'string' || !isAddress(t.to)) throw new RpcError(-32602, 'The transaction has no contract address.');
  if (!knownContract(t.to)) throw new RpcError(4100, 'This wallet only talks to the Emogotchi contracts.');
  const data = t.data ?? t.input;
  if (data !== undefined && data !== null && !isHex(data)) throw new RpcError(-32602, 'The transaction has bad data.');
  // the r1 has no lock: whoever holds it could give the pets away, so this wallet never sends a pet or an item and never
  // lets anyone else move them (sending lives on the site, 2026-09-27)
  if (typeof data === 'string' && GIVE_AWAY.has(data.slice(0, 10).toLowerCase())) throw new RpcError(4100, 'Sending pets and items is done on the site, not on the r1.');
  const value = big(t.value) ?? 0n;
  if (value > VALUE_CAP) throw new RpcError(4100, `This wallet never sends more than ${mon(VALUE_CAP)} at once.`);
  const gasGiven = big(t.gas ?? t.gasLimit);

  // a brand-new wallet holds nothing: ask the site's Worker for a starter, once, before the fee is quoted
  await starterIfEmpty(s.address, balanceOf);

  const c = pub();
  const [fees, gas, balance] = await Promise.all([
    c.estimateFeesPerGas(),
    gasGiven !== undefined ? Promise.resolve(gasGiven) : c.estimateGas({ account: s.address, to: t.to, data: data as Hex | undefined, value } as never).then((g) => g + g / 5n),
    balanceOf(s.address),
  ]);
  const maxFeePerGas = fees.maxFeePerGas ?? 0n;
  if (maxFeePerGas === 0n) throw new RpcError(-32000, 'Monad did not quote a fee. Try again.');
  const fee = gas * maxFeePerGas;
  if (balance < fee + value) throw new RpcError(-32000, `Not enough MON: this needs ${mon(fee + value)} and the wallet holds ${mon(balance)}. Send a little MON to it (menu → wallet).`);

  const account = mnemonicToAccount(s.mnemonic);
  const job = line.then(async () => {
    const nonce = await nextNonce(s.address);
    try {
      // signed here from exactly these fields, chain id fixed, then sent as they are (a wallet client's prepare step
      // would ask the RPC to fill the transaction in and sign what it answered: security review, 2026-09-27)
      const signed = await account.signTransaction({ chainId: net().chain.id, type: 'eip1559', to: t.to as Address, data: data as Hex | undefined, value, gas, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n, nonce });
      const hash = await pub().sendRawTransaction({ serializedTransaction: signed });
      lastNonce = { n: nonce, at: Date.now() };
      return hash;
    } catch (e) { lastNonce = null; throw e; }
  });
  line = job.catch(() => {});
  return job;
}

// ---------------------------------------------------------------- the EIP-1193 provider
type Handler = (...a: unknown[]) => void;
const handlers = new Map<string, Set<Handler>>();
function emit(ev: string, ...a: unknown[]) { for (const h of handlers.get(ev) ?? []) { try { h(...a); } catch { /* a listener's problem */ } } }
const REFUSED = new Set(['eth_sign', 'personal_sign', 'eth_signtransaction', 'eth_signtypeddata', 'eth_signtypeddata_v1', 'eth_signtypeddata_v3', 'eth_signtypeddata_v4', 'wallet_sendcalls', 'wallet_grantpermissions', 'eth_decrypt', 'eth_getencryptionpublickey']);

async function request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
  const p = params ?? [];
  switch (method) {
    case 'eth_chainId': return chainHex();
    case 'net_version': return String(net().chain.id);
    case 'eth_accounts':
    case 'eth_requestAccounts': return stored ? [stored.address] : [];
    case 'wallet_switchEthereumChain': {
      const want = (p[0] as { chainId?: string } | undefined)?.chainId;
      if (want && parseInt(want, 16) !== net().chain.id) throw new RpcError(4902, 'This wallet lives on Monad only.');
      return null;
    }
    case 'eth_sendTransaction': return sendTransaction(p[0]);
    default:
      if (REFUSED.has(method.toLowerCase()) || method.toLowerCase().startsWith('wallet_')) throw new RpcError(4200, `The r1 wallet does not do ${method}.`);
      return (pub() as unknown as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }).request({ method, params: p });
  }
}

export const r1Provider = {
  request,
  on(ev: string, fn: Handler) { let s = handlers.get(ev); if (!s) handlers.set(ev, (s = new Set())); s.add(fn); },
  removeListener(ev: string, fn: Handler) { handlers.get(ev)?.delete(fn); },
};
