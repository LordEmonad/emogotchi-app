/**
 * The starter: the one thing between "I made an account from my face" and "I own a pet".
 *
 * A fresh passkey account holds nothing, and nothing on chain will give it anything — there is no meaningful MON
 * faucet, and both games require `msg.sender` to be the player, so no one else can act for them. So the site asks
 * its own Worker (`worker/drip.js`) for a small amount, once, the first time this account tries to do anything.
 *
 * This module holds NO key material and is deliberately separate from account.ts, which must stay free of any
 * network call at all. Everything here is public: an address in, a yes or no back.
 *
 * Failure is always quiet. If the drip is unconfigured, empty, rate-limited or simply down, this resolves false
 * and the caller carries on to the confirmation sheet, where the account's real balance is shown and the person
 * is told to fund it — exactly how the site behaved before starters existed. A starter is a courtesy, never a
 * dependency.
 */
import type { Address } from './bus';

/** How this module reads a balance. Passed in by the caller so that starter.ts and provider.ts do not import
 *  each other: a cycle between the module that sends transactions and the module that asks for money is exactly
 *  the kind of load-order fragility this code cannot afford. */
type ReadBalance = (a: Address) => Promise<bigint>;

/** How long to wait for the transfer to show up in state before giving up and letting the sheet explain. */
const LAND_MS = 9_000;
const POLL_MS = 400;
/**
 * Monad's transaction pool validates balances against state from k=3 blocks ago, so a just-funded account still
 * reads as empty and its first send is DROPPED (`-32000: Signer had insufficient balance`) rather than queued.
 * Blocks are ~300 ms, so wait out the lag once the money is actually there. Without this the very first action
 * after a starter fails, which is the worst possible moment for it to fail.
 */
const LAG_MS = 1_200;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One in-flight request per address, so two tabs or a double tap cannot ask twice. */
const asking = new Map<string, Promise<boolean>>();
/** Addresses this browser has already asked for, successfully or not: the Worker refuses a second one anyway. */
const asked = new Set<string>();

async function ask(address: Address): Promise<boolean> {
  let r: Response;
  try {
    r = await fetch('/api/drip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
      cache: 'no-store',
    });
  } catch { return false; }            // offline, blocked, no Worker in dev: not this module's problem
  if (!r.ok) return false;             // 409 used/funded, 429 rate, 503 empty or unconfigured, 502 failed
  try { return !!(await r.json())?.ok; } catch { return false; }
}

/**
 * Give this account a starter if it has nothing at all, and wait for it to be spendable.
 * Resolves true only when the money has landed AND the pool can see it. Never throws.
 */
export async function starterIfEmpty(address: Address, balanceOf: ReadBalance): Promise<boolean> {
  const key = address.toLowerCase();
  if (asked.has(key)) return false;

  let have: bigint;
  try { have = await balanceOf(address); } catch { return false; }
  if (have > 0n) return false;         // not empty: nothing to do, and the Worker would refuse anyway

  const existing = asking.get(key);
  if (existing) return existing;

  const job = (async () => {
    if (!(await ask(address))) return false;
    const until = Date.now() + LAND_MS;
    while (Date.now() < until) {
      await sleep(POLL_MS);
      try { if ((await balanceOf(address)) > 0n) { await sleep(LAG_MS); return true; } } catch { /* keep waiting */ }
    }
    return false;                      // sent but not seen: the sheet will show the real balance
  })().finally(() => { asking.delete(key); asked.add(key); });

  asking.set(key, job);
  return job;
}

/** Forget that this browser asked — used when the account is forgotten, so a later account can still get one. */
export function forgetStarters(): void { asked.clear(); asking.clear(); }
