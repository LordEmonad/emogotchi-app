/**
 * Whose pets are yours, without asking: the address this browser last connected, read the quiet way. A passkey
 * account remembers its address; an injected wallet that already trusts the site answers `eth_accounts` with no
 * prompt (it returns nothing when it does not). No connect sheet, no signature, nothing sent anywhere.
 */
import { getProvider, rememberedPasskeyAddress } from '../wallet';

export async function myAddress(): Promise<string | null> {
  let mode: string | null = null;
  try { mode = localStorage.getItem('emogotchi.wallet'); } catch { return null; }
  if (mode === 'passkey') return rememberedPasskeyAddress()?.toLowerCase() ?? null;
  if (mode !== 'injected') return null;
  const p = getProvider() as { request?: (a: { method: string }) => Promise<unknown> } | null;
  if (!p?.request) return null;
  try {
    const accts = await p.request({ method: 'eth_accounts' }) as string[];
    return accts?.[0]?.toLowerCase() ?? null;
  } catch { return null; }
}
