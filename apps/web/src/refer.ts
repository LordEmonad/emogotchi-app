/**
 * Referrals, browser side.
 *
 * A referral link is `/mint?ref=<address>` — the frok mint, because minting a free pet is the first thing a new
 * player does. Arriving on it stores the referrer; connecting an account posts the pair to the Worker, which
 * records it write-once and only for someone who holds no pet yet. A point is awarded later, and only when that
 * person pays 10 MON to NAME a pet. See worker/referral.js for why naming is the bar.
 *
 * This module holds nothing secret and never touches a key. It is deliberately quiet: every failure path ends in
 * a no-op, because a referral that does not register is a missed point, while a referral flow that throws is a
 * broken mint page.
 */

const REF = 'emogotchi.ref';        // the referrer this browser arrived with
const SENT = 'emogotchi.ref.sent';  // addresses we have already posted, so a reconnect is not a second POST

const ok = (a: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(a);
const read = (k: string): string => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* private mode: the link still works, it just will not survive a reload */ } };

/**
 * Called once on load. Takes `?ref=` out of the URL and remembers it.
 *
 * First link wins, here as well as in the Worker: someone who arrives through one person's link and later opens
 * another keeps the first. Storing only on the way in means the second link never even gets posted.
 */
export function captureRef(): void {
  let ref = '';
  try { ref = new URLSearchParams(location.search).get('ref') ?? ''; } catch { return; }
  if (!ok(ref)) return;
  if (read(REF)) return;                      // already have one; do not overwrite
  write(REF, ref.toLowerCase());
}

/** The referrer this browser arrived with, if any. */
export const storedRef = (): string => { const r = read(REF); return ok(r) ? r : ''; };

/**
 * Post the pair once an account is known. Safe to call on every address change — it posts at most once per
 * address per browser, and the Worker is write-once regardless.
 */
export function claimRef(address: string): void {
  const ref = storedRef();
  if (!ref || !ok(address)) return;
  const me = address.toLowerCase();
  if (me === ref) return;                     // self-referral; the Worker refuses it too
  const sent = read(SENT).split(',').filter(Boolean);
  if (sent.includes(me)) return;
  write(SENT, [...sent, me].slice(-20).join(','));
  void fetch('/api/refer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ referee: me, ref }),
    cache: 'no-store',
  }).catch(() => { /* a missed point, not an error worth showing anyone */ });
}

/** The link this wallet shares. */
export const referLink = (address: string): string => `${location.origin}/mint?ref=${address.toLowerCase()}`;

/** How many points an address has, from the cached stats blob. Zero KV reads: the fold already did the work. */
export async function referPoints(address: string): Promise<{ points: number; total: number } | null> {
  try {
    const r = await fetch('/api/stats', { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    const counts = j?.referrals?.counts ?? null;
    if (!counts) return null;
    return { points: counts[address.toLowerCase()] ?? 0, total: j.referrals.points ?? 0 };
  } catch { return null; }
}
