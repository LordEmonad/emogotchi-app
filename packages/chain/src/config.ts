import { defineChain, type Chain } from 'viem';
import { monad, monadTestnet } from 'viem/chains';

export type Address = `0x${string}`;

/** A local Foundry/anvil chain for end-to-end runs. */
export const anvil: Chain = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

export const CHAINS: Record<number, Chain> = { 143: monad, 10143: monadTestnet, 31337: anvil };

export type ChainConfig = {
  chain: Chain;
  rpcUrl: string;
  contract: Address;
  /** EmogotchiDrop, the minter: the claim page reads its window and calls claim(). Optional. */
  drop: Address | null;
  /** EmogotchiItems, the item shop: the Items page, costumes on the cats. Optional. */
  items: Address | null;
  /** Inversegotchi, the second pet (inversebrah): free mint, free care, the four abuses. Optional. */
  inverse: Address | null;
  /** Autocare, the machine that keeps pets alive: one vault per user. Optional; without it /autocare is the demo. */
  autocare: Address | null;
  explorer: string | null;
};

/**
 * Build the config from Vite env vars: VITE_CHAIN_ID (143 | 10143 | 31337), VITE_CONTRACT_ADDRESS,
 * VITE_RPC_URL (optional override), VITE_DROP_ADDRESS (the claim contract, optional), VITE_ITEMS_ADDRESS (the
 * item shop, optional), VITE_INVERSE_ADDRESS (Inversegotchi, optional). No contract address
 * means the site runs its local simulation.
 */
export function configFromEnv(env: Record<string, string | undefined>): ChainConfig | null {
  const contract = env.VITE_CONTRACT_ADDRESS as Address | undefined;
  if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) return null;
  const chainId = Number(env.VITE_CHAIN_ID ?? 143);
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain id ${chainId}`);
  return {
    chain,
    rpcUrl: env.VITE_RPC_URL ?? chain.rpcUrls.default.http[0]!,
    contract,
    drop: /^0x[0-9a-fA-F]{40}$/.test(env.VITE_DROP_ADDRESS ?? '') ? (env.VITE_DROP_ADDRESS as Address) : null,
    items: /^0x[0-9a-fA-F]{40}$/.test(env.VITE_ITEMS_ADDRESS ?? '') ? (env.VITE_ITEMS_ADDRESS as Address) : null,
    inverse: /^0x[0-9a-fA-F]{40}$/.test(env.VITE_INVERSE_ADDRESS ?? '') ? (env.VITE_INVERSE_ADDRESS as Address) : null,
    autocare: /^0x[0-9a-fA-F]{40}$/.test(env.VITE_AUTOCARE_ADDRESS ?? '') ? (env.VITE_AUTOCARE_ADDRESS as Address) : null,
    explorer: chain.blockExplorers?.default.url ?? null,
  };
}
