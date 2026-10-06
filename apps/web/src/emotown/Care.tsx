/**
 * Caring for your own pet from its card in Emotown: every action its own page has (the care, petting, the frok's
 * four stunts and Sahur's tung, waking, reviving, naming), sent by the site's chain store with the same costs and the
 * same wallet flow, and the pet does it on the street the moment the transaction lands (`onDone`; the town then
 * skips the same event when the chain feed brings it back).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AbuseKind, CatView } from '@emo-pets/chain';
import { chainCfg, chainStore } from '../game/chain';
import type { PaidAction } from '../game/state';
import { PETS } from '../pets';
import { ConnectModal } from '../ui/ConnectModal';
import { Icon } from '../ui/Icon';
import type { PropName } from '../scene/props';
import { connectInjected, connectWalletConnect, ensureChain, openWalletAgain, walletKind, type WalletState } from '../wallet';
import { restoreCareWallet, setCareWallet, useCareWallet } from './careWallet';
import { SendSheet } from '../ui/SendSheet';
import { fallbackName } from '../pets';
import type { LiveEvent } from './data';
import type { Resident } from './sim';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
type Did = { kind: 'care'; what: 'feed' | 'wash' | 'play' | 'sleep' | 'clean' | 'wake' | 'revive' } | { kind: 'stunt'; what: AbuseKind } | { kind: 'pet' } | { kind: 'named'; name: string };
const STUNTS: Record<string, [AbuseKind, PropName, string][]> = {
  frok: [['screenshot', 'camera' as PropName, 'Screenshot'], ['slap', 'pow' as PropName, 'Slap'], ['squeeze', 'clawjaw' as PropName, 'Squeeze'], ['burn', 'fire' as PropName, 'Burn']],
  sahur: [['tung', 'tung' as PropName, 'Tung tung tung']],
  ...(__THICCUMS__ ? { thiccums: [['bounce', 'sparkle', 'Butt bounce']] as [AbuseKind, PropName, string][] } : {}),
};

export function CarePanel({ r, onDone, onSent }: { r: Resident; onDone: (e: LiveEvent) => void; onSent?: (to: string) => void }) {
  const v = r.view as CatView | null;
  const wallet = useCareWallet();
  const snap = useSyncExternalStore(chainStore?.subscribe.bind(chainStore) ?? (() => () => {}), () => chainStore?.get() ?? null);
  const [connecting, setConnecting] = useState(false);
  const [connErr, setConnErr] = useState<string | null>(null);
  const [connBusy, setConnBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [sure, setSure] = useState(false);   // the cat's 1,000 MON revive asks twice
  // the pet being sent, held from the moment the sheet opens: once it has gone the store no longer lists it, and the
  // sheet must stay up to say so; the town is told when the sheet closes (it takes the pet's card out of "yours")
  const [sending, setSending] = useState<CatView | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useEffect(() => { void restoreCareWallet(); }, []);
  useEffect(() => { setErr(null); setNaming(false); setSure(false); }, [r.key]);
  if (!v || !chainStore) return null;

  const free = PETS[r.col].free;
  const cost = free ? 'free' : '1 MON';
  const his = PETS[r.col].his === 'its' ? 'its' : 'his';
  const owner = v.owner.toLowerCase();
  const signer = wallet?.address?.toLowerCase() ?? null;
  const ready = !!snap?.loaded && snap.owner?.toLowerCase() === owner && snap.cats.some((c) => c.col === r.col && c.id === r.id);
  const busy = !!snap?.pending;

  const run = async (label: string, send: () => Promise<void>, did: Did) => {
    if (!ready || busy) return;
    setErr(null);
    chainStore!.setActive(r.id, r.col);
    try {
      await send();
      onDone({ ...did, col: r.col, id: r.id, by: owner } as LiveEvent);
    } catch (e) { setErr((e as Error).message || `${label} did not go through.`); }
  };
  const care = (what: 'feed' | 'wash' | 'play' | 'sleep' | 'clean' | 'wake' | 'revive') => run(what, () => chainStore!.act(what as PaidAction | 'wake'), { kind: 'care', what });
  const stunt = (kind: AbuseKind) => run(kind, () => chainStore!.abuse(kind), { kind: 'stunt', what: kind });
  const pet = () => { if (!ready || busy) return; chainStore!.setActive(r.id, r.col); chainStore!.pet(); onDone({ kind: 'pet', col: r.col, id: r.id, by: owner }); };
  const name = () => { const n = draft.trim(); if (!n) return; void run('naming', () => chainStore!.setName(n), { kind: 'named', name: n }).then(() => { setNaming(false); setDraft(''); }); };

  const doInjected = async () => {
    setConnBusy(true); setConnErr(null);
    try {
      const w = await connectInjected();
      if (chainCfg && w.chainId !== chainCfg.chain.id) await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      setCareWallet(w); setConnecting(false);
    } catch (e) { setConnErr((e as Error).message); } finally { setConnBusy(false); }
  };
  const doWc = async () => {
    if (!chainCfg) return;
    setConnBusy(true); setConnErr(null);
    try { setCareWallet(await connectWalletConnect(chainCfg.chain.id, chainCfg.rpcUrl)); setConnecting(false); } catch (e) { setConnErr((e as Error).message); } finally { setConnBusy(false); }
  };

  let body: React.ReactNode;
  if (!signer) {
    body = <button type="button" className="tc-btn primary tc-care-connect" onClick={() => setConnecting(true)}>Connect your wallet to care for {v.name || `#${r.id}`}</button>;
  } else if (signer !== owner) {
    body = <p className="tc-care-note">This pet is in {short(owner)}; the wallet connected here is {short(signer)}. <button type="button" className="tc-textbtn" onClick={() => setConnecting(true)}>Use another wallet</button></p>;
  } else if (!ready) {
    body = <p className="tc-care-note">{snap?.error ? 'Reading your pets… (Monad is slow to answer, trying again)' : 'Reading your pets…'}</p>;
  } else if (!v.alive) {
    body = sure || free
      ? <button type="button" className="tc-btn primary" disabled={busy} onClick={() => { setSure(false); void care('revive'); }}>{free ? `Revive ${his === 'its' ? 'it' : 'him'} · free` : 'Yes, revive for 1,000 MON'}</button>
      : <button type="button" className="tc-btn primary" disabled={busy} onClick={() => setSure(true)}>Revive · 1,000 MON (half to the burn)</button>;
  } else {
    const asleep = v.asleep;
    body = (
      <>
        <div className="tc-care-grid">
          <CareBtn icon="bowl" label="Feed" cost={cost} disabled={busy || asleep} onClick={() => void care('feed')} />
          <CareBtn icon="sponge" label="Wash" cost={cost} disabled={busy || asleep} onClick={() => void care('wash')} />
          <CareBtn icon="yarn" label="Play" cost={cost} disabled={busy || asleep} onClick={() => void care('play')} />
          {asleep
            ? <CareBtn icon="sun" label="Wake" cost="free" disabled={busy} onClick={() => void care('wake')} />
            : <CareBtn icon="moon" label="Sleep" cost={cost} disabled={busy || v.energy >= 100} onClick={() => void care('sleep')} />}
          <CareBtn icon="scoop" label="Clean up" cost={cost} disabled={busy || !v.poop} onClick={() => void care('clean')} />
          <CareBtn icon="heart" label="Pet" cost="gas only" disabled={busy || asleep} onClick={pet} />
        </div>
        {(STUNTS[r.col] ?? []).length > 0 && (
          <div className="tc-care-grid stunts">
            {STUNTS[r.col]!.map(([k, icon, label]) => <CareBtn key={k} icon={icon} label={label} cost="free" disabled={busy || asleep} onClick={() => void stunt(k)} />)}
          </div>
        )}
        {asleep && <p className="tc-care-note">{v.name || `#${r.id}`} is asleep. Wake {his === 'its' ? 'it' : 'him'} first, or let {his === 'its' ? 'it' : 'him'} sleep it off.</p>}
        {naming ? (
          <div className="tc-care-name">
            <input value={draft} maxLength={32} placeholder={v.name ? 'A new name' : `Name ${his === 'its' ? 'it' : 'him'}`} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') name(); if (e.key === 'Escape') setNaming(false); }} autoFocus />
            <button type="button" className="tc-btn primary" disabled={busy || !draft.trim()} onClick={name}>10 MON</button>
          </div>
        ) : <button type="button" className="tc-textbtn tc-care-rename" disabled={busy} onClick={() => setNaming(true)}>{v.name ? 'Rename' : `Name ${his === 'its' ? 'it' : 'him'}`} · 10 MON, 80% burns EMO</button>}
      </>
    );
  }
  // your own pet, dead or alive, can be sent to someone (ui/SendSheet.tsx)
  const own = snap?.cats.find((c) => c.col === r.col && c.id === r.id) ?? null;

  return (
    <section className="tc-care" aria-label={`Take care of ${v.name || `#${r.id}`}`}>
      <h3>Take care</h3>
      {body}
      {snap?.pending && <p className="tc-care-status" role="status"><i className="live" />{snap.pendingLabel}</p>}
      {snap?.stuck && <p className="tc-care-status"><button type="button" className="tc-textbtn" onClick={() => openWalletAgain()}>Open my wallet</button> · <button type="button" className="tc-textbtn" onClick={() => chainStore!.abandon()}>Give up</button></p>}
      {/* only what THIS panel sent can fail here: a background re-read that stumbles (the public RPC pushing back, which
          the town's own reads make likelier) is retried by the store on its own and is not the action failing */}
      {err && <p className="tc-care-err" role="alert">{err}</p>}
      {ready && own && signer && !sentTo && <button type="button" className="tc-textbtn tc-care-send" disabled={busy} onClick={() => setSending(own)}>Send {v.name || `#${r.id}`} to someone</button>}
      {sending && signer && (
        <SendSheet what={{ kind: 'pet', col: r.col, id: r.id, name: v.name || fallbackName(r.col, r.id), view: sending, worn: r.worn }} me={signer} myPets={snap?.cats ?? []}
          onClose={() => { setSending(null); if (sentTo) onSent?.(sentTo); }}
          onSent={(to) => { setSentTo(to.address); void chainStore?.refresh(); }} />
      )}
      {connecting && <ConnectModal open onClose={() => setConnecting(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWc()} onDemo={() => setConnecting(false)} error={connErr} busy={connBusy} onConnected={(w: WalletState) => { setCareWallet(w); setConnecting(false); }} noDemo title="Connect your wallet" sub={`The wallet that holds ${v.name || `this pet`}. ${walletKind() === 'passkey' ? '' : 'Every care is a transaction you confirm.'}`} />}
    </section>
  );
}

function CareBtn({ icon, label, cost, disabled, onClick }: { icon: PropName; label: string; cost: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="tc-care-btn" disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={26} className={icon === 'clawjaw' || icon === 'tung' ? 'is-wide' : ''} /><span>{label}</span><em>{cost}</em>
    </button>
  );
}
