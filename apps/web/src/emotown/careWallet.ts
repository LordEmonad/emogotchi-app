/**
 * The wallet that signs care in Emotown (2026-09-27: "take care of them and do everything to them in the emotown page
 * without ever leaving"). The site's own: whatever this browser last connected, restored quietly (a browser wallet
 * that already trusts the site, a WalletConnect session, a passkey account), else the site's connect sheet when a care
 * button is pressed. It is handed to the site's chain store, which sends every transaction exactly as a pet's own page
 * does (costs, "confirm in your wallet", a stuck wallet's way out).
 */
import { useSyncExternalStore } from 'react';
import { chainStore } from '../game/chain';
import { getProvider, restore, type WalletState } from '../wallet';

let wallet: WalletState | null = null;
let tried = false;
const subs = new Set<() => void>();
const tell = () => { for (const f of subs) f(); };

export function useCareWallet(): WalletState | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => wallet);
}

/** Use this wallet for care from now on (the connect sheet's answer, or a restored session). */
export function setCareWallet(w: WalletState | null) {
  wallet = w && !w.demo && w.address ? w : null;
  chainStore?.setSigner(wallet ? getProvider() : null, (wallet?.address as `0x${string}` | undefined) ?? null);
  tell();
}

/** The wallet this browser already connected, if it can be had without asking. Once per page. */
export async function restoreCareWallet(): Promise<WalletState | null> {
  if (wallet || tried) return wallet;
  tried = true;
  const w = await restore().catch(() => null);
  if (w && !w.demo && w.address) setCareWallet(w);
  return wallet;
}
