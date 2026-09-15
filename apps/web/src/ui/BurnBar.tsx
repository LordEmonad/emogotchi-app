/**
 * How much EMO the game has destroyed, and how much MON is waiting to be turned into more.
 *
 * The contract does not swap inside a care transaction: that would make every feed pay for the swap
 * path and let a bad moment at the DEX fail someone's feed. It queues the MON instead, and *anyone*
 * can convert the queue. This bar is that "anyone": it shows the numbers and hands the button to
 * whoever is looking.
 */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { chainClient, chainCfg } from '../game/chain';
import { getProvider, hasInjected, ensureChain } from '../wallet';
import type { Address } from '@emo-pets/chain';

const fmt = (n: number, dp = 0) => n.toLocaleString(undefined, { maximumFractionDigits: dp });

export function BurnBar() {
  const [emo, setEmo] = useState<number | null>(null);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const read = useCallback(async () => {
    if (!chainClient) return;
    try {
      const t = await chainClient.totals();
      setEmo(Number(t.emoBurned) / 1e18);
      setQueued(Number(t.pendingBurnMon) / 1e18);
    } catch { /* the page keeps its last numbers */ }
  }, []);
  useEffect(() => { void read(); const id = setInterval(() => void read(), 20000); return () => clearInterval(id); }, [read]);

  const burn = async () => {
    if (!chainClient || !chainCfg) return;
    setBusy(true); setNote(null);
    try {
      const p = getProvider();
      if (!p) throw new Error('No wallet in this browser.');
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts[0]) throw new Error('No account.');
      await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      chainClient.setSigner({ provider: p as never, address: accounts[0] as Address });
      await chainClient.crankBurn();
      setNote('Burned. Thank you.');
      await read();
    } catch (e) {
      const m = (e as Error).message ?? '';
      setNote(/reject|denied|cancel/i.test(m) ? 'Cancelled.' : m.slice(0, 120));
    } finally { setBusy(false); }
  };

  if (!chainClient || emo === null) return null;
  return (
    <div className="burnbar">
      <span className="burnbar-main"><Icon name="flame" size={18} /> <b className="tnum">{fmt(emo)}</b> EMO burned</span>
      {queued > 0 ? (
        <>
          <span className="burnbar-q tnum">{fmt(queued, 2)} MON queued</span>
          {hasInjected() && <button className="btn btn-sm btn-ghost" onClick={() => void burn()} disabled={busy}>{busy ? 'Burning…' : 'Burn it'}</button>}
        </>
      ) : (
        <span className="burnbar-q">nothing queued</span>
      )}
      {note && <span className="burnbar-note">{note}</span>}
    </div>
  );
}
