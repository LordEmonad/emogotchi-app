/**
 * A throwaway wallet for the sandbox's LOCAL world only (tools/fightclub/local.mjs sets VITE_FIGHT_FAUCET, and nothing
 * else ever does): a key made in the page and kept in this browser, signing straight to the local fork. For testing
 * Fight Club on the operator's machine without a passkey or a browser wallet pointed at the fork. It has no path to any
 * real chain: its transport is the fork's URL, and a production build does not contain this module (the page imports
 * it only when the faucet is set, which only the local world sets).
 */
import { createWalletClient, defineChain, http, type Address } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const KEY = 'fightclub.localTestKey';
export function localTestWallet(rpcUrl: string) {
  let pk: `0x${string}` | null = null;
  try { pk = localStorage.getItem(KEY) as `0x${string}` | null; } catch { /* private window */ }
  if (!pk || !/^0x[0-9a-f]{64}$/i.test(pk)) { pk = generatePrivateKey(); try { localStorage.setItem(KEY, pk); } catch { /* fine */ } }
  const account = privateKeyToAccount(pk);
  const chain = defineChain({ id: 143, name: 'Monad (local fork)', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
  const wc = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const rpc = async (method: string, params: unknown[] = []) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json() as { result?: unknown; error?: { message: string } };
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const provider = {
    async request({ method, params }: { method: string; params?: unknown[] }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account.address];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'eth_sendTransaction') {
        const tx = (params?.[0] ?? {}) as { to: Address; value?: string; data?: `0x${string}`; gas?: string };
        return wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined });
      }
      return rpc(method, params ?? []);
    },
  };
  return { address: account.address, provider, forget: () => { try { localStorage.removeItem(KEY); } catch { /* fine */ } } };
}
