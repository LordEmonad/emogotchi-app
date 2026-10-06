// Types for validate.js, which the site imports directly (apps/web/src/topup/shared.ts).
import type { Hex, OriginToken } from './chains.js';
export declare class TopupRefused extends Error { readonly code: string; }
export type Want = { player: string; originChainId: number; currency: string; amountWei: bigint; mode: 'wallet' | 'address'; maxIn?: bigint };
export type Step = { kind: 'approve' | 'deposit'; chainId: number; to: Hex; data: Hex; value: string };
export type Checked =
  | { mode: 'wallet'; requestId: Hex; orderId: Hex; chainId: number; token: OriginToken; amountIn: bigint; steps: Step[]; outMin: bigint }
  | { mode: 'address'; requestId: Hex; orderId: Hex; chainId: number; token: OriginToken; amountIn: bigint; depositAddress: Hex; outMin: bigint };
export declare function orderIdOf(order: unknown): Hex;
export declare function depositAddressOf(orderId: Hex, depositor: string): Hex;
export declare function checkQuote(quote: unknown, want: Want, now?: number): Checked;
export declare const isMonad: (id: unknown) => boolean;
