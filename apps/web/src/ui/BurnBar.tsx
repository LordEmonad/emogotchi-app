/**
 * How much EMO the game has destroyed, and how much MON is waiting to be turned into more.
 *
 * The contract does not swap inside a care transaction: that would make every feed pay for the swap
 * path and let a bad moment at the DEX fail someone's feed. It queues the MON instead, and *anyone*
 * can convert the queue. This bar is that "anyone": it shows the numbers and hands the button to
 * whoever is looking. The numbers are the whole game: every pet's contract (the free pets' queues come from names)
 * and, since 2026-09-28, the item shop's (the 80% of every paid item); the button burns each queue that has
 * something in it, one transaction per contract.
 */
import { cue } from '../sound/cue';
import { PETS } from '../pets';
import type { Collection } from '@emo-pets/chain';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { chainClient, chainCfg } from '../game/chain';
import { getProvider, hasWallet, ensureChain } from '../wallet';
import type { Address } from '@emo-pets/chain';

const fmt = (n: number, dp = 0) => n.toLocaleString(undefined, { maximumFractionDigits: dp });

export function BurnBar() {
  const [emo, setEmo] = useState<number | null>(null);
  const [queued, setQueued] = useState(0);
  const [queuedFree, setQueuedFree] = useState<Record<string, number>>({});   // the free pets' queues (their names), by collection
  const [queuedShop, setQueuedShop] = useState(0);                             // the item shop's (80% of its sales)
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const read = useCallback(async () => {
    const client = chainClient; if (!client) return;
    try {
      const others = client.collections.filter((c) => c !== 'cat');
      const [t, shop, ...rest] = await Promise.all([client.totals(), client.shopTotals().catch(() => null), ...others.map((c) => client.totals(c).catch(() => null))]);
      const wei = (x: bigint) => Number(x) / 1e18;
      const shopQ = shop ? wei(shop.pendingBurnMon) : 0;
      setEmo(wei(t.emoBurned) + (shop ? wei(shop.emoBurned) : 0) + rest.reduce((n, f) => n + (f ? wei(f.emoBurned) : 0), 0));
      setQueued(wei(t.pendingBurnMon) + shopQ + rest.reduce((n, f) => n + (f ? wei(f.pendingBurnMon) : 0), 0));
      setQueuedFree(Object.fromEntries(others.map((c, i) => [c, rest[i] ? wei(rest[i]!.pendingBurnMon) : 0])));
      setQueuedShop(shopQ);
    } catch { /* the page keeps its last numbers */ }
  }, []);
  useEffect(() => { void read(); const id = setInterval(() => void read(), 20000); return () => clearInterval(id); }, [read]);

  const burn = async () => {
    if (!chainClient || !chainCfg) return;
    setBusy(true); setNote(null);
    const was = chainClient.signerInfo; let borrowed = false;
    try {
      const p = getProvider();
      if (!p) throw new Error('No wallet in this browser.');
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts[0]) throw new Error('No account.');
      await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      // this bar sits on pages that have their own wallet and their own signer, and those pages only reinstall
      // theirs when the connected address changes — which cranking does not do. So it is borrowed and handed back.
      borrowed = true;
      chainClient.setSigner({ provider: p as never, address: accounts[0] as Address });
      const free = Object.values(queuedFree).reduce((a, b) => a + b, 0);
      if (queued - free - queuedShop > 0.0001) await chainClient.crankBurn();
      for (const [c, q] of Object.entries(queuedFree)) if (q > 0.0001) await chainClient.crankBurn(undefined, undefined, c as Collection);
      if (queuedShop > 0.0001) await chainClient.crankShop();
      cue('burn'); cue('tx.ok', { delay: 0.5, v: 0.7 });
      setNote('Burned. Thank you.');
      await read();
    } catch (e) {
      const m = (e as Error).message ?? '';
      setNote(/reject|denied|cancel/i.test(m) ? 'Cancelled.' : m.slice(0, 120));
    } finally { if (borrowed) chainClient.setSigner(was); setBusy(false); }
  };

  if (!chainClient || emo === null) return null;
  return (
    <div className="burnbar">
      <span className="burnbar-main"><Icon name="flame" size={18} /> <b className="tnum">{fmt(emo)}</b> EMO burned</span>
      {queued > 0 ? (
        <>
          <span className="burnbar-q tnum" title={Object.values(queuedFree).some((q) => q > 0) || queuedShop > 0 ? [`${fmt(queued - queuedShop - Object.values(queuedFree).reduce((a, b) => a + b, 0), 2)} from the cats`, ...Object.entries(queuedFree).filter(([, q]) => q > 0).map(([c, q]) => `${fmt(q, 2)} from ${PETS[c as Collection].one} names`), ...(queuedShop > 0 ? [`${fmt(queuedShop, 2)} from the item shop`] : [])].join(' · ') : undefined}>{fmt(queued, 2)} MON queued</span>
          {hasWallet() && <button className="btn btn-sm btn-ghost" onClick={() => void burn()} disabled={busy}>{busy ? 'Burning…' : 'Burn it'}</button>}
        </>
      ) : (
        <span className="burnbar-q">nothing queued</span>
      )}
      {note && <span className="burnbar-note">{note}</span>}
    </div>
  );
}
