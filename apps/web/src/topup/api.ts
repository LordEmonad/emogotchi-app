/**
 * The Worker's three top-up routes (worker/topup/index.js). Same origin, so the CSP needs nothing new: the page never
 * talks to Relay or to another chain's RPC itself.
 */
import type { Hex, OriginToken, Step } from './shared';

export type ChainBalances = { chainId: number; name: string; contract?: boolean; error?: boolean; tokens: (OriginToken & { balance: string; usd: number })[] };
export type Balances = { player: string; monUsd: number | null; chains: ChainBalances[] };
export type Quote = {
  ok: true; mode: 'wallet' | 'address'; requestId: Hex; chainId: number; chainName: string; token: OriginToken;
  amountIn: string; amountInUsd: number | null; outMon: number; outMin: string; timeEstimate: number | null;
  steps?: Step[]; depositAddress?: Hex; quote: unknown;
};
export type Status = { state: 'waiting' | 'depositing' | 'pending' | 'submitted' | 'success' | 'refund' | 'failure' | 'unknown'; failReason: string | null; refundFailReason: string | null; monTx?: Hex | null; inTx?: Hex | null };

export class TopupApiError extends Error { constructor(message: string, readonly code: string) { super(message); } }

async function call<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/topup/${path}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  } catch { throw new TopupApiError('Could not reach Emogotchi. Check your connection and try again.', 'network'); }
  let j: Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* below */ }
  if (!r.ok) throw new TopupApiError(typeof j.message === 'string' ? j.message : 'Something went wrong. Try again in a moment.', String(j.error ?? r.status));
  return j as T;
}

export const getBalances = (player: string) => call<Balances>('balances', { player });
export const getQuote = (q: { player: string; chainId: number; currency: string; amountMon: number; mode: 'wallet' | 'address' }) => call<Quote>('quote', q);
export const getStatus = (requestId: string) => call<Status>(`status?id=${encodeURIComponent(requestId)}`);
