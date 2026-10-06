// Types for chains.js, which the site imports directly (apps/web/src/topup/shared.ts).
export type Hex = `0x${string}`;
export type OriginToken = { symbol: string; address: Hex; decimals: number };
export type Origin = {
  id: number; relay: string; name: string; explorer: string;
  native: { name: string; symbol: string; decimals: number };
  walletRpc: string; rpc: string[]; tokens: OriginToken[];
};
export declare const MONAD_ID: 143;
export declare const NATIVE: Hex;
export declare const DEPOSITORY: Hex;
export declare const DEPOSIT_FACTORY: Hex;
export declare const DEPOSIT_IMPLEMENTATION: Hex;
export declare const DEPOSIT_FACTORY_CODEHASH: Hex;
export declare const DEPOSIT_IMPLEMENTATION_CODEHASH: Hex;
export declare const MIN_MON: number;
export declare const MAX_MON: number;
export declare const ORIGINS: Origin[];
export declare const originById: (id: unknown) => Origin | null;
export declare const tokenOf: (chain: Origin | null, address: unknown) => OriginToken | null;
export declare const isStable: (symbol: string) => boolean;
