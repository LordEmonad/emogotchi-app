/**
 * Wallet connection. Injected wallets (MetaMask, Rabby, Phantom, OKX, and any wallet's in-app
 * browser) work through window.ethereum. WalletConnect covers everyone else: a phone wallet scanning
 * a QR code from a desktop, or a phone wallet opened from mobile Safari, neither of which can inject
 * anything. It only appears when VITE_WC_PROJECT_ID is set, because it cannot work without one.
 * A "demo" connection lets anyone try the pet with a pretend address.
 */
export type WalletState = {
  status: 'idle' | 'connecting' | 'connected';
  address: string | null;
  chainId: number | null;
  demo: boolean;
  error: string | null;
};
export const MONAD = { mainnet: 143, testnet: 10143 } as const;
export const EMPTY_WALLET: WalletState = { status: 'idle', address: null, chainId: null, demo: false, error: null };
const KEY = 'emogotchi.wallet';

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (ev: string, fn: (...a: unknown[]) => void) => void; removeListener?: (ev: string, fn: (...a: unknown[]) => void) => void; isMetaMask?: boolean; isRabby?: boolean; isPhantom?: boolean };
const injected = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;
/**
 * The provider everything signs through. Normally the injected one; once a WalletConnect session is
 * open it is that instead, so the rest of the app and the chain client need to know nothing about it.
 */
let active: Eip1193 | null = null;
const eth = () => active ?? injected();

export const WC_PROJECT_ID: string = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? '';
export const hasWalletConnect = () => WC_PROJECT_ID.length > 0;
export const hasInjected = () => typeof window !== 'undefined' && !!injected();
/** The EIP-1193 provider in use, for signing. */
export const getProvider = () => eth() ?? null;
/** Switch the wallet to `chainId`, adding the network if the wallet has never seen it. */
export async function ensureChain(chainId: number, name: string, rpcUrl: string, explorer: string | null): Promise<void> {
  const p = eth(); if (!p) return;
  const hex = `0x${chainId.toString(16)}`;
  const current = (await p.request({ method: 'eth_chainId' })) as string;
  if (current?.toLowerCase() === hex) return;
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw e;
    await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: name, nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 }, rpcUrls: [rpcUrl], blockExplorerUrls: explorer ? [explorer] : undefined }] });
  }
}
export function onChainChanged(fn: (chainId: number) => void) {
  const p = eth(); if (!p?.on) return () => {};
  const h = (...a: unknown[]) => fn(parseInt(a[0] as string, 16));
  p.on('chainChanged', h);
  return () => p.removeListener?.('chainChanged', h);
}
export const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const chainName = (id: number | null) => id === MONAD.mainnet ? 'Monad' : id === MONAD.testnet ? 'Monad testnet' : id === null ? '' : `chain ${id}`;

export async function connectInjected(): Promise<WalletState> {
  const p = eth();
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
  return { status: 'connected', address, chainId: parseInt(chainHex, 16), demo: false, error: null };
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
    chains: [chainId],
    optionalChains: [chainId],
    rpcMap: { [chainId]: rpcUrl },
    showQrModal: true,
    metadata: {
      name: 'Emogotchi',
      description: 'A cat that lives in your wallet.',
      url: 'https://emogotchi.emonad.lol',
      icons: ['https://emogotchi.emonad.lol/brand/logo.png'],
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
  active = p as unknown as Eip1193;
  try { localStorage.setItem(KEY, 'walletconnect'); } catch { /* private mode */ }
  return { status: 'connected', address, chainId: p.chainId ?? chainId, demo: false, error: null };
}

/** Re-open a WalletConnect session after a reload, without showing the QR code again. */
export async function restoreWalletConnect(chainId: number, rpcUrl: string): Promise<WalletState | null> {
  if (!hasWalletConnect()) return null;
  try {
    const p = await wcProvider(chainId, rpcUrl);
    const address = p.accounts?.[0];
    if (!address) return null;
    active = p as unknown as Eip1193;
    return { status: 'connected', address, chainId: p.chainId ?? chainId, demo: false, error: null };
  } catch { return null; }
}

export async function endWalletConnect() {
  const p = active as unknown as { disconnect?: () => Promise<void> } | null;
  active = null;
  try { await p?.disconnect?.(); } catch { /* the session may already be gone */ }
}

export function connectDemo(): WalletState {
  try { localStorage.setItem(KEY, 'demo'); } catch { /* private mode */ }
  return { status: 'connected', address: '0xE1110C47A7F0E1E0C47A7F0E1E0C47A7F0E1E0C4', chainId: MONAD.testnet, demo: true, error: null };
}
export function disconnect() {
  if (active) void endWalletConnect();
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
/** Ask the wallet to drop this site's permission too (MetaMask and friends support wallet_revokePermissions), so a reload does not silently reconnect. */
export async function revokeInjected(): Promise<void> {
  const p = eth(); if (!p) return;
  try { await p.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch { /* older wallets: the site just forgets */ }
}
/** Silent reconnect on load, if the user connected before. */
export async function restore(): Promise<WalletState | null> {
  let mode: string | null = null;
  try { mode = localStorage.getItem(KEY); } catch { return null; }
  if (mode === 'demo') return connectDemo();
  if (mode === 'injected' && eth()) {
    try {
      const accounts = (await eth()!.request({ method: 'eth_accounts' })) as string[];
      if (accounts[0]) { const chainHex = (await eth()!.request({ method: 'eth_chainId' })) as string; return { status: 'connected', address: accounts[0], chainId: parseInt(chainHex, 16), demo: false, error: null }; }
    } catch { /* ignore */ }
  }
  return null;
}
export function onAccountsChanged(fn: (accounts: string[]) => void) {
  const p = eth(); if (!p?.on) return () => {};
  const h = (...a: unknown[]) => fn((a[0] as string[]) ?? []);
  p.on('accountsChanged', h);
  return () => p.removeListener?.('accountsChanged', h);
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
