/**
 * Wallet connection. Injected wallets (MetaMask, Rabby, Phantom, OKX, and any wallet's in-app
 * browser) work today through window.ethereum. WalletConnect comes with the operator's project id.
 * Until the contract exists, a "demo" connection lets anyone try the pet with a pretend address.
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
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;

export const hasInjected = () => typeof window !== 'undefined' && !!eth();
/** The injected EIP-1193 provider, for signing. */
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
  const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
  const chainHex = (await p.request({ method: 'eth_chainId' })) as string;
  const address = accounts[0];
  if (!address) throw new Error('No account returned.');
  try { localStorage.setItem(KEY, 'injected'); } catch { /* private mode */ }
  return { status: 'connected', address, chainId: parseInt(chainHex, 16), demo: false, error: null };
}
export function connectDemo(): WalletState {
  try { localStorage.setItem(KEY, 'demo'); } catch { /* private mode */ }
  return { status: 'connected', address: '0xE1110C47A7F0E1E0C47A7F0E1E0C47A7F0E1E0C4', chainId: MONAD.testnet, demo: true, error: null };
}
export function disconnect() { try { localStorage.removeItem(KEY); } catch { /* private mode */ } }
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
});
