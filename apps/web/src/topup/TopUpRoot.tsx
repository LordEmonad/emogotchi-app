/**
 * "Add MON from another chain" (CROSSCHAIN.md), mounted once beside the app like PasskeyRoot. With the feature off
 * (flag.ts) it renders nothing and hooks nothing. With it on, the one shared chain client tells it of every shortfall
 * (ChainClient.topup: a paid call the wallet cannot cover), and the sheet (a lazy chunk) opens over whatever page asked.
 * The page's own error note still says what it always said; the sheet is the way out of it.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import type { Shortfall } from '@emo-pets/chain';
import { chainClient } from '../game/chain';
import { walletKind } from '../wallet';
import { TOPUP_BUILT, topupEnabled } from './flag';

const Sheet = TOPUP_BUILT ? lazy(() => import('./TopUpSheet')) : () => null;

/** What the sheet is for: a shortfall (the numbers), or the player opening it by hand from the wallet menu. */
export type TopupAsk = { shortfall: Shortfall | null; at: number };

let show: ((a: TopupAsk) => void) | null = null;
let queued: TopupAsk | null = null;
const ask = (a: TopupAsk) => { if (show) show(a); else queued = a; };

const ON = TOPUP_BUILT && topupEnabled();
if (ON && chainClient) {
  chainClient.topup = {
    notify: (s) => ask({ shortfall: s, at: Date.now() }),
    // a free call's gas is checked only for wallets that pay their own way; a passkey account's first gas comes from
    // the starter drip (passkey/starter.ts), which runs later, as its transaction is sent
    checkGas: () => walletKind() === 'injected' || walletKind() === 'walletconnect',
  };
}

/** The wallet menu's "Add MON": the sheet with nothing owed. */
export function openTopup() { if (ON) ask({ shortfall: null, at: Date.now() }); }
export const topupOffered = () => ON;

export function TopUpRoot() {
  const [cur, setCur] = useState<TopupAsk | null>(null);
  useEffect(() => {
    if (!ON) return;
    show = (a) => setCur((c) => c ?? a);   // one top-up at a time: a second shortfall while one is open is the same story
    if (queued) { setCur(queued); queued = null; }
    return () => { show = null; };
  }, []);
  if (!ON || !cur) return null;
  return <Suspense fallback={null}><Sheet ask={cur} onClose={() => setCur(null)} /></Suspense>;
}
