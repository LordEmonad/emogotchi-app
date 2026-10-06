/**
 * The bridge between the passkey provider (plain code, no React) and the sheets that ask the person (React).
 *
 * The provider never signs on its own say-so: it posts a request here and waits. The host component renders the sheet
 * and answers. Two things make this more than a callback. First, the answer to "may I sign" is given inside a click
 * handler, and that same click is what runs the passkey ceremony when the account is locked, because browsers only
 * allow a WebAuthn prompt from a fresh user gesture. So a request carries `unlock`, which the host calls from the
 * button's handler. Second, with no host mounted nothing can be approved, so a request fails closed.
 */
import type { TxSummary } from './describe';

export type Address = `0x${string}`;

/** What a transaction will be signed with, worked out before the person is asked, so the sheet shows what is signed. */
export type Quote = { gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; /** gas × maxFeePerGas: Monad charges the gas LIMIT, not the gas used */ fee: bigint };

/** "May I sign this transaction?" The sheet opens at once; the numbers arrive as they are read. */
export type TxAsk = {
  kind: 'tx';
  summary: TxSummary;
  from: Address;
  balance: Promise<bigint>;
  quote: Promise<Quote>;
  /** run the passkey ceremony; called from the confirm button's click handler. Returns at once when already open. */
  unlock: () => Promise<void>;
};
/** "May I sign this message?" Only ever Emotown's sign-in message (provider.ts refuses any other before asking).
 *  `text` is already safe to render; `bytes` is the true size of what would be signed. */
export type SignAsk = { kind: 'sign'; from: Address; text: string; bytes: number; clipped: boolean; unlock: () => Promise<void> };
/** The connect sheet's passkey option: make an account or open an existing one. Resolves to the account's address. */
export type OnboardAsk = { kind: 'onboard' };
/** Open the account screen. */
export type AccountAsk = { kind: 'account' };

export type Ask = TxAsk | SignAsk | OnboardAsk | AccountAsk;
export type Pending<A extends Ask = Ask> = { id: number; ask: A; resolve: (v: unknown) => void; reject: (e: unknown) => void };

/** EIP-1193's "user rejected the request": viem and the site's own error handling both recognise it. */
export class UserRejected extends Error {
  readonly code = 4001;
  constructor(message = 'User rejected the request.') { super(message); this.name = 'UserRejectedRequestError'; }
}

type Listener = (queue: readonly Pending[]) => void;
let queue: Pending[] = [];
let listener: Listener | null = null;
let seq = 0;
const emit = () => listener?.(queue);

/** The host registers itself; there is one. Returns the unsubscribe. */
export function attachHost(fn: Listener): () => void {
  listener = fn; fn(queue);
  return () => { if (listener === fn) listener = null; };
}
export const hostAttached = () => listener !== null;

/** Post a request and wait for the person's answer. Rejects with UserRejected when they say no. */
export function ask<T = void>(a: Ask): Promise<T> {
  if (!listener) return Promise.reject(new Error('The passkey account cannot ask for confirmation on this page, so nothing was signed.'));
  // never inside another site's frame, where the sheet's buttons could be click-jacked (main.tsx refuses to start there too)
  let framed = true;
  try { framed = window.top !== window.self; } catch { /* cannot even compare: framed */ }
  if (framed) return Promise.reject(new Error('The passkey account does not sign inside another site\'s frame.'));
  return new Promise<T>((resolve, reject) => {
    queue = [...queue, { id: ++seq, ask: a, resolve: resolve as (v: unknown) => void, reject }];
    emit();
  });
}
/** The host's answers. */
export function settle(id: number, value?: unknown) { const p = queue.find((x) => x.id === id); queue = queue.filter((x) => x.id !== id); emit(); p?.resolve(value); }
export function refuse(id: number, error: unknown = new UserRejected()) { const p = queue.find((x) => x.id === id); queue = queue.filter((x) => x.id !== id); emit(); p?.reject(error); }
/** The sheets themselves failed. Nothing can be approved, so nothing is left waiting on an answer that cannot come. */
export function refuseAll(error: unknown) { const q = queue; queue = []; emit(); for (const p of q) p.reject(error); }
