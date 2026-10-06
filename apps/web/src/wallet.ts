/**
 * Wallet connection. Injected wallets (MetaMask, Rabby, Phantom, OKX, and any wallet's in-app
 * browser) work through window.ethereum. WalletConnect covers everyone else: a phone wallet scanning
 * a QR code from a desktop, or a phone wallet opened from mobile Safari, neither of which can inject
 * anything. It only appears when VITE_WC_PROJECT_ID is set, because it cannot work without one.
 * A "demo" connection lets anyone try the pet with a pretend address.
 * A passkey account (passkey/, built on mera by Category Labs) is a wallet drawn by this site: an EIP-1193 provider
 * of our own that slots into `active`, so everything downstream treats it like any other wallet.
 */
import { cfg as passkeyCfg } from './passkey/config';
import { claimRef } from './refer';
import { lock as lockPasskey, passkeyProvider, remembered as rememberedPasskey, forget as forgetPasskeyRecord } from './passkey/provider';
import { TOPUP_BUILT, topupEnabled } from './topup/flag';
import { ORIGINS } from './topup/shared';

export type WalletKind = 'injected' | 'walletconnect' | 'passkey' | 'demo';
export type WalletState = {
  status: 'idle' | 'connecting' | 'connected';
  address: string | null;
  chainId: number | null;
  demo: boolean;
  error: string | null;
  /** how this wallet is connected; absent on the idle state */
  kind?: WalletKind;
};
export const MONAD = { mainnet: 143, testnet: 10143 } as const;
export const EMPTY_WALLET: WalletState = { status: 'idle', address: null, chainId: null, demo: false, error: null };

/**
 * Every successful connection passes through here, which is the only reliable place to post a pending referral.
 *
 * It was in App.tsx at first and that was wrong: App returns `<Mint />` for `/mint` before reaching the hooks,
 * and `/mint?ref=…` is precisely the URL every referral link uses — so the one route that mattered was the one
 * route that never ran them. Each page also owns its own wallet state, so there is no shared component to hang
 * this on. `connected()` wraps all six paths (injected, passkey, WalletConnect, and each of their restores);
 * the demo wallet is deliberately not wrapped, since a pretend address must never claim a referral.
 */
const connected = (w: WalletState): WalletState => { if (w.address) claimRef(w.address); return w; };
const KEY = 'emogotchi.wallet';

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (ev: string, fn: (...a: unknown[]) => void) => void; removeListener?: (ev: string, fn: (...a: unknown[]) => void) => void; isMetaMask?: boolean; isRabby?: boolean; isPhantom?: boolean };
const injected = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;
/**
 * The provider everything signs through. Normally the injected one; once a WalletConnect session is
 * open it is that instead, so the rest of the app and the chain client need to know nothing about it.
 */
let active: Eip1193 | null = null;
const eth = () => active ?? injected();
/** What is connected now, and what was connected before the last disconnect (so only an injected wallet is ever revoked). */
let kind: WalletKind | null = null;
let lastKind: WalletKind | null = null;
const readMode = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
/** A real wallet this browser connected and will reconnect on the home page (not the demo): the header's "My pets". */
export const rememberedWallet = (): boolean => { const m = readMode(); return m === 'injected' || m === 'walletconnect' || m === 'passkey'; };
// A passkey session claims the provider slot the moment this module loads. Pages read getProvider() as soon as they
// mount; without this they would find window.ethereum there and build a signer out of the wrong wallet.
if (typeof window !== 'undefined' && readMode() === 'passkey' && rememberedPasskey()) { active = passkeyProvider as Eip1193; kind = 'passkey'; }

export const WC_PROJECT_ID: string = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? '';
export const hasWalletConnect = () => WC_PROJECT_ID.length > 0;
export const hasInjected = () => typeof window !== 'undefined' && !!injected();
/** Something that can sign is available without the connect sheet: an injected wallet, or a connected passkey account. */
export const hasWallet = () => hasInjected() || kind === 'passkey';
export const walletKind = () => kind;
/** The EIP-1193 provider in use, for signing. */
export const getProvider = () => eth() ?? null;
/** Switch the wallet to `chainId`, adding the network if the wallet has never seen it (Monad unless `native` says
 *  otherwise: "Add MON from another chain" switches to Base, Ethereum... and back). */
export async function ensureChain(chainId: number, name: string, rpcUrl: string, explorer: string | null,
  native: { name: string; symbol: string; decimals: number } = { name: 'Monad', symbol: 'MON', decimals: 18 }): Promise<void> {
  const p = eth(); if (!p) return;
  const hex = `0x${chainId.toString(16)}`;
  // An injected wallet answers eth_chainId with a hex STRING; WalletConnect's universal-provider answers it locally
  // with `parseInt(defaultChain)`, a NUMBER. Calling .toLowerCase() on that threw a TypeError on every WalletConnect
  // call, and both call sites swallow errors, so this function has never once worked over WalletConnect.
  const raw = await p.request({ method: 'eth_chainId' });
  const current = typeof raw === 'number' ? raw : parseInt(String(raw), 16);
  if (current === chainId) return;
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw e;
    await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: name, nativeCurrency: native, rpcUrls: [rpcUrl], blockExplorerUrls: explorer ? [explorer] : undefined }] });
  }
}
/**
 * Wallet events. Pages subscribe once, at mount, before anything is connected, so the subscription cannot belong to
 * one provider: the injected wallet and the passkey account are both wired here, once, and an event only reaches the
 * page when it comes from the wallet that is actually connected. (Bound to window.ethereum alone, MetaMask switching
 * accounts in the background would overwrite a connected passkey address.)
 */
const chainSubs = new Set<(chainId: number) => void>();
const accountSubs = new Set<(accounts: string[]) => void>();
let wired = false;
function wire() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  const from = (source: 'injected' | 'passkey') => kind === source || (kind === null && source === 'injected');
  injected()?.on?.('chainChanged', (...a) => { if (from('injected')) for (const f of chainSubs) f(parseInt(a[0] as string, 16)); });
  injected()?.on?.('accountsChanged', (...a) => { if (from('injected')) for (const f of accountSubs) f((a[0] as string[]) ?? []); });
  passkeyProvider.on('accountsChanged', (...a) => { if (from('passkey')) for (const f of accountSubs) f((a[0] as string[]) ?? []); });
}
export function onChainChanged(fn: (chainId: number) => void) {
  wire(); chainSubs.add(fn);
  return () => { chainSubs.delete(fn); };
}
export const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const chainName = (id: number | null) => id === MONAD.mainnet ? 'Monad' : id === MONAD.testnet ? 'Monad testnet' : id === null ? '' : `chain ${id}`;

export async function connectInjected(): Promise<WalletState> {
  const p = injected();
  if (!p) throw new Error('No wallet found in this browser.');
  let accounts: string[];
  try {
    accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new Error('Connection cancelled in the wallet.');
    // MetaMask -32002: its own connect popup is still open (often behind the window) and it refuses a second one
    if (code === -32002) throw new Error('Your wallet already has a connection request open. Open the extension, approve or cancel it there, then try again.');
    throw e;
  }
  const chainHex = (await p.request({ method: 'eth_chainId' })) as string;
  const address = accounts[0];
  if (!address) throw new Error('No account returned.');
  try { localStorage.setItem(KEY, 'injected'); } catch { /* private mode */ }
  if (kind === 'passkey') void lockPasskey();
  if (kind === 'walletconnect') void endWalletConnect(); // otherwise the relay session outlives the reference
  active = null; kind = 'injected';
  return connected({ status: 'connected', address, chainId: parseInt(chainHex, 16), demo: false, error: null, kind: 'injected' });
}
/**
 * A passkey account. With one remembered on this device this connects at once (the passkey is only asked for when
 * something is signed); otherwise the account's own sheet opens to make one or open one. Rejects with code 4001 when
 * the person closes that sheet, which callers treat as "never mind", not as an error.
 */
export async function connectPasskey(): Promise<WalletState> {
  if (!passkeyCfg) throw new Error('This build is not pointed at a network.');
  const accounts = (await passkeyProvider.request({ method: 'eth_requestAccounts' })) as string[];
  const address = accounts[0];
  if (!address) throw new Error('No account returned.');
  if (kind === 'walletconnect') void endWalletConnect();
  active = passkeyProvider as Eip1193; kind = 'passkey';
  try { localStorage.setItem(KEY, 'passkey'); } catch { /* private mode */ }
  return connected({ status: 'connected', address, chainId: passkeyCfg.chain.id, demo: false, error: null, kind: 'passkey' });
}
/** The passkey account remembered on this device, if any (public data: its address). */
export const rememberedPasskeyAddress = (): string | null => rememberedPasskey()?.address ?? null;
/** Drop the remembered passkey account from this device (the passkey itself stays where it is saved). */
export async function forgetPasskey(): Promise<void> { await forgetPasskeyRecord(); }
/**
 * WalletConnect's wallet deep link, taken over by the site (2026-09-25).
 *
 * The sign client's `request()` opens the wallet IN PARALLEL with publishing the request to the relay
 * (sign-client 2.25: `Promise.all([sendRequest(...), handleDeeplinkRedirect(...), response])`). On a phone the deep link
 * switches apps at once and iOS suspends Safari, so a publish still in flight only completes when the person comes
 * back: the wallet opens with nothing to sign, and the SECOND open has it (the operator, on a real iPhone). The
 * library keys its redirect on the `WALLETCONNECT_DEEPLINK_CHOICE` entry the connect modal writes, so the site keeps
 * its own copy of that choice, removes the library's, and opens the wallet itself on `session_request_sent`, which
 * the client emits only after the relay has acknowledged the request. Same link format as the library builds
 * (`<href>/wc?requestId=<id>&sessionTopic=<topic>`), so the wallet lands on the right request.
 */
const WC_CHOICE_KEY = 'WALLETCONNECT_DEEPLINK_CHOICE';   // the modal's; read once, then removed
const WC_OURS_KEY = 'emogotchi.wcDeepLink';               // the site's copy, survives reloads
let wcChoice: { href: string; name?: string } | null = null;
let wcLastLink: string | null = null;      // the last request link opened, for "Open my wallet"
let wcInflight = 0;                        // requests waiting on the wallet
let wcHiddenAt = 0;
let wcWired: object | null = null;         // the provider the hooks are on, so a reconnect does not double them
function takeWcChoice() {
  try {
    const theirs = localStorage.getItem(WC_CHOICE_KEY);
    if (theirs) { localStorage.setItem(WC_OURS_KEY, theirs); localStorage.removeItem(WC_CHOICE_KEY); }
    const raw = localStorage.getItem(WC_OURS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { href?: unknown; name?: unknown }) : null;
    wcChoice = parsed && typeof parsed.href === 'string' ? { href: parsed.href, name: typeof parsed.name === 'string' ? parsed.name : undefined } : null;
  } catch { wcChoice = null; }
}
/** The link that opens the wallet on one request, built the way @walletconnect/utils builds it. */
export function wcLinkFor(href: string, id: number | string, topic: string): string {
  const q = `requestId=${id}&sessionTopic=${topic}`;
  const base = href.endsWith('/') ? href.slice(0, -1) : href;
  if (base.startsWith('https://t.me')) return `${base}${base.includes('?') ? '&startapp=' : '?startapp='}${encodeURIComponent(q)}`;
  return `${base}/wc?${q}`;
}
function openLink(link: string) {
  // a universal link (https) goes to a new tab like the library does; a custom scheme replaces this one, which is
  // what makes iOS hand the person back to Safari afterwards
  window.open(link, link.startsWith('http') ? '_blank' : '_self', 'noreferrer noopener');
}
/** Re-open the wallet on the request that is waiting (the pet view's "Open my wallet"); the bare app if nothing is. */
export function openWalletAgain() {
  const link = wcLastLink ?? (wcChoice ? wcChoice.href : 'metamask://');
  openLink(link);
}
type WcSigner = { signer: { client: { on: (ev: 'session_request_sent', fn: (a: { id: number; topic: string }) => void) => unknown; core: { relayer: { restartTransport: () => Promise<void> } } } } };
function wireWc(p: Eip1193 & WcSigner) {
  takeWcChoice();
  if (wcWired === p) return;
  wcWired = p;
  // count what is out at the wallet, so a return to the tab can nudge a socket iOS killed while we were away
  const orig = p.request.bind(p);
  p.request = (args) => { wcInflight++; return orig(args).finally(() => { wcInflight = Math.max(0, wcInflight - 1); }); };
  p.signer.client.on('session_request_sent', ({ id, topic }) => {
    if (!wcChoice) return;                                       // desktop: a QR session, nothing to open
    if (typeof document !== 'undefined' && !document.hasFocus()) return;   // already over in the wallet
    wcLastLink = wcLinkFor(wcChoice.href, id, topic);
    openLink(wcLastLink);
  });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { wcHiddenAt = Date.now(); return; }
    // back from the wallet with a request still out: iOS drops background sockets, and the relay holds the answer
    // until we are listening again, so reopen the transport rather than wait for the client to notice
    if (kind === 'walletconnect' && wcInflight > 0 && Date.now() - wcHiddenAt > 1500) void p.signer.client.core.relayer.restartTransport().catch(() => {});
  });
}

/**
 * WalletConnect. The library is a few hundred kilobytes and most visitors never need it, so it is
 * only fetched when somebody actually chooses it.
 */
async function wcProvider(chainId: number, rpcUrl: string) {
  if (!hasWalletConnect()) throw new Error('WalletConnect is not configured on this site.');
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  return EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    // Monad goes in the OPTIONAL namespace only. With it also in `chains` it is a REQUIRED namespace, which pushes
    // MetaMask Mobile down a chain-scoping path that throws when the wallet does not hold chain 143 — and MetaMask
    // swallows that throw without answering, so the dapp waits for ever. eth_sendTransaction stays available either
    // way; reown's own docs say not to put the same chain in both.
    // with "Add MON from another chain" on, the session also asks for the chains it pays from (optional, like Monad);
    // their reads go through WalletConnect's own RPC (no rpcMap entry: the CSP allows only WalletConnect's hosts)
    optionalChains: [chainId, ...(TOPUP_BUILT && topupEnabled() ? ORIGINS.map((c) => c.id) : [])] as [number, ...number[]],
    rpcMap: { [chainId]: rpcUrl },
    showQrModal: true,
    metadata: {
      name: 'Emogotchi',
      description: 'A cat that lives in your wallet.',
      url: 'https://emogotchi.emonad.lol',
      icons: ['https://emogotchi.emonad.lol/brand/logo.png'],
      // the only way a wallet knows how to hand the person back to Safari; without it they are left in the wallet
      redirect: { native: '', universal: 'https://emogotchi.emonad.lol' },
    },
  });
}

export async function connectWalletConnect(chainId: number, rpcUrl: string): Promise<WalletState> {
  const p = await wcProvider(chainId, rpcUrl);
  try {
    await p.connect();
  } catch (e) {
    const msg = String((e as Error)?.message ?? '');
    if (/reject|close|cancel/i.test(msg)) throw new Error('Connection cancelled in your wallet.');
    throw new Error('WalletConnect could not reach your wallet. Try again, or open this page in your wallet\'s own browser.');
  }
  const address = p.accounts?.[0];
  if (!address) throw new Error('No account returned.');
  wireWc(p as unknown as Eip1193 & WcSigner);
  active = p as unknown as Eip1193; kind = 'walletconnect';
  try { localStorage.setItem(KEY, 'walletconnect'); } catch { /* private mode */ }
  return connected({ status: 'connected', address, chainId: p.chainId ?? chainId, demo: false, error: null, kind: 'walletconnect' });
}

/** Re-open a WalletConnect session after a reload, without showing the QR code again. */
export async function restoreWalletConnect(chainId: number, rpcUrl: string): Promise<WalletState | null> {
  if (!hasWalletConnect()) return null;
  try {
    const p = await wcProvider(chainId, rpcUrl);
    const address = p.accounts?.[0];
    if (!address) return null;
    wireWc(p as unknown as Eip1193 & WcSigner);
    active = p as unknown as Eip1193; kind = 'walletconnect';
    return connected({ status: 'connected', address, chainId: p.chainId ?? chainId, demo: false, error: null, kind: 'walletconnect' });
  } catch { return null; }
}

/**
 * The chains a live WalletConnect session actually approved. `ensureChain` cannot help here — the provider answers
 * eth_chainId and wallet_switchEthereumChain locally without ever asking the wallet — so this is the only way to
 * see whether the wallet really has Monad before sending it a transaction it may silently drop.
 */
export function wcApprovedChains(): number[] | null {
  if (kind !== 'walletconnect' || !active) return null;
  const ns = (active as unknown as { session?: { namespaces?: Record<string, { chains?: string[] }> } }).session?.namespaces?.eip155;
  if (!ns?.chains) return null;
  return ns.chains.map((c) => Number(c.split(':')[1])).filter((n) => Number.isFinite(n));
}

export async function endWalletConnect() {
  const p = active as unknown as { disconnect?: () => Promise<void> } | null;
  active = null;
  try { await p?.disconnect?.(); } catch { /* the session may already be gone */ }
}

export function connectDemo(): WalletState {
  try { localStorage.setItem(KEY, 'demo'); } catch { /* private mode */ }
  if (kind === 'passkey') void lockPasskey();
  if (kind === 'walletconnect') void endWalletConnect();
  active = null; kind = 'demo';
  return { status: 'connected', address: '0xE1110C47A7F0E1E0C47A7F0E1E0C47A7F0E1E0C4', chainId: MONAD.testnet, demo: true, error: null, kind: 'demo' };
}
export function disconnect() {
  if (kind === 'passkey') void lockPasskey(); // the key leaves memory; the account stays remembered for next time
  if (kind === 'walletconnect' || (active && kind !== 'passkey')) void endWalletConnect();
  active = null;
  const was = kind;
  if (kind) lastKind = kind;   // (a second disconnect, from a page answering the notice below, must not wipe it)
  kind = null;
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  if (!was) return;
  // tell whoever follows the account (Emotown's session signs out with the wallet): the site has no account now
  if (lastKind && lastKind !== 'demo') for (const f of accountSubs) f([]);
}
/** Ask the wallet to drop this site's permission too (MetaMask and friends support wallet_revokePermissions), so a reload does not silently reconnect. */
export async function revokeInjected(): Promise<void> {
  // pages call this after every disconnect; it must only ever reach the wallet that was actually connected
  if (lastKind !== 'injected') return;
  const p = injected(); if (!p) return;
  try { await p.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch { /* older wallets: the site just forgets */ }
}
/** Silent reconnect on load, if the user connected before. */
export async function restore(): Promise<WalletState | null> {
  const mode = readMode();
  if (mode === 'demo') return connectDemo();
  if (mode === 'passkey') {
    // connected, but locked: the key is never stored, so the first signature after a reload asks for the passkey
    const r = rememberedPasskey();
    if (r && passkeyCfg) { active = passkeyProvider as Eip1193; kind = 'passkey'; return connected({ status: 'connected', address: r.address, chainId: passkeyCfg.chain.id, demo: false, error: null, kind: 'passkey' }); }
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
    return null;
  }
  if (mode === 'walletconnect' && passkeyCfg) {
    // iOS discards the Safari tab freely while the wallet app is in front. Without this the site comes back
    // "disconnected" while the wallet still holds the session, and the next Connect mints a SECOND one.
    const w = await restoreWalletConnect(passkeyCfg.chain.id, passkeyCfg.rpcUrl).catch(() => null);
    if (w) { kind = 'walletconnect'; return { ...w, kind: 'walletconnect' }; }
    return null;
  }
  if (mode === 'injected' && injected()) {
    try {
      const accounts = (await injected()!.request({ method: 'eth_accounts' })) as string[];
      if (accounts[0]) { const chainHex = (await injected()!.request({ method: 'eth_chainId' })) as string; kind = 'injected'; return connected({ status: 'connected', address: accounts[0], chainId: parseInt(chainHex, 16), demo: false, error: null, kind: 'injected' }); }
    } catch { /* ignore */ }
  }
  return null;
}
/**
 * Let the person pick which account of their browser wallet this site gets: MetaMask and friends open their account
 * picker for `wallet_requestPermissions` even when the site is already connected (a plain `eth_requestAccounts` just
 * hands back the account connected before, which made "Use another wallet" do nothing). Falls back to connecting.
 */
export async function pickInjectedAccount(): Promise<WalletState> {
  const p = injected();
  if (!p) throw new Error('No wallet found in this browser.');
  try { await p.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); }
  catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw new Error('Cancelled in the wallet.');
    if (code === -32002) throw new Error('Your wallet already has a request open. Open the extension, approve or cancel it there, then try again.');
    /* a wallet without the method: connect as usual */
  }
  return connectInjected();
}
/**
 * The address this site's wallet answers with right now, asking nothing of the person: `undefined` when there is no
 * wallet connection to go by (never connected in this browser, a demo, WalletConnect, or the wallet cannot be asked),
 * `null` when the browser wallet connected before now gives this site no account (disconnected in the extension).
 */
export async function walletAddressNow(): Promise<string | null | undefined> {
  const mode = readMode();
  if (!mode && lastKind && lastKind !== 'demo') return null;   // disconnected on this page, with the site's own button
  if (mode === 'passkey') return rememberedPasskey()?.address ?? null;
  if (mode !== 'injected') return undefined;
  const p = injected(); if (!p) return undefined;
  // a LOCKED MetaMask also answers no accounts: that is not a disconnect (it happens on every browser restart), so it
  // reads as "cannot tell" rather than signing the person out
  const unlocked = await (p as { _metamask?: { isUnlocked?: () => Promise<boolean> } })._metamask?.isUnlocked?.().catch(() => undefined);
  if (unlocked === false) return undefined;
  try { const a = (await p.request({ method: 'eth_accounts' })) as string[]; return a[0] ?? null; } catch { return undefined; }
}
export function onAccountsChanged(fn: (accounts: string[]) => void) {
  wire(); accountSubs.add(fn);
  return () => { accountSubs.delete(fn); };
}
/** Deep links that open this site inside a mobile wallet's browser. */
export const walletLinks = (url: string) => ({
  metamask: `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`,
  phantom: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  rabby: `rabby://dapp?url=${encodeURIComponent(url)}`,
  okx: `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
  safepal: `safepalwallet://open_url?url=${encodeURIComponent(url)}`,
  trust: `https://link.trustwallet.com/open_url?url=${encodeURIComponent(url)}`,
});
