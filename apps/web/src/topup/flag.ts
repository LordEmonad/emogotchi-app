/**
 * "Add MON from another chain" (CROSSCHAIN.md): the switch and the little state the rest of the site needs to know
 * about. Kept tiny and dependency-free: it is in the main bundle; the sheet itself is a lazy chunk (TopUpSheet.tsx).
 *
 * `VITE_TOPUP=on` offers it to everyone; `VITE_TOPUP=link` only to a browser sent `?topup=1` (remembered; `?topup=0`
 * forgets it), like the passkey was; anything else, including unset, and the feature does not exist: nothing is hooked,
 * nothing is mounted, the site is exactly what it was.
 */
const FLAG = 'emogotchi.topup';

/** Whether this build carries the feature at all. Vite writes the value in at build time, so with it off the minifier
 *  drops the sheet, its chunk and every hook: a production build then holds none of it. */
export const TOPUP_BUILT: boolean = import.meta.env.VITE_TOPUP === 'on' || import.meta.env.VITE_TOPUP === 'link';

export function topupEnabled(): boolean {
  if (!TOPUP_BUILT) return false;
  const env = import.meta.env.VITE_TOPUP as string | undefined;
  if (env === 'on') return true;
  if (env !== 'link' || typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(location.search).get('topup');
    if (q === '1') localStorage.setItem(FLAG, '1');
    if (q === '0') localStorage.removeItem(FLAG);
    return localStorage.getItem(FLAG) === '1';
  } catch { return false; }
}

/**
 * While a top-up has the wallet on another chain, the pet page must not switch it straight back to Monad (App.tsx does
 * that the moment it sees another chain). The sheet sets this for the whole of its time away and switches back itself.
 */
let away = false;
const subs = new Set<() => void>();
export const topupAway = () => away;
export function setTopupAway(v: boolean) { if (away === v) return; away = v; for (const f of subs) f(); }
export function onTopupAway(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
