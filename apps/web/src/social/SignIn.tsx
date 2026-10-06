/**
 * Signing in to Emotown: connect a wallet if none is connected (the site's own connect sheet: browser wallet,
 * WalletConnect, passkey), then sign the Worker's Sign-In with Ethereum message with it. The sheet says what a
 * signature is before the wallet asks: free, not a transaction, cannot move anything.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { chainCfg } from '../game/chain';
import { ConnectModal } from '../ui/ConnectModal';
import { connectInjected, connectWalletConnect, ensureChain, getProvider, pickInjectedAccount, restore, walletKind, type WalletState } from '../wallet';
import { social } from './store';
import { short } from './ui';

let openCount = 0;
let reason = '';
const subs = new Set<() => void>();
/** Open the sign-in sheet from anywhere (a Follow button, the composer). `why` is shown as its first line. */
export function askSignIn(why = '') { reason = why; openCount++; for (const f of subs) f(); }
const useAsk = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => openCount);

/** Mounted once per page. */
export function SignInHost() {
  const asked = useAsk();
  const [step, setStep] = useState<'closed' | 'connect' | 'sign'>('closed');
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // the request this host has already answered: a StrictMode double effect, or a remount, must not open the sheet
  const handled = useRef(asked);

  useEffect(() => {
    if (asked === handled.current) return;
    handled.current = asked;
    setErr(null);
    // a wallet this browser already connected is used straight away; otherwise the connect sheet
    void restore().then((w) => {
      if (w && !w.demo && w.address) { setWallet(w); setStep('sign'); } else setStep('connect');
    }).catch(() => setStep('connect'));
  }, [asked]);

  const close = () => { setStep('closed'); setBusy(false); setErr(null); };
  const connected = (w: WalletState) => { setWallet(w); setErr(null); setStep('sign'); };
  const doInjected = async () => {
    setBusy(true); setErr(null);
    try {
      const w = await connectInjected();
      if (chainCfg && w.chainId !== chainCfg.chain.id) { try { await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer); } catch { /* signing in does not need the chain */ } }
      connected(w);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const doWc = async () => {
    if (!chainCfg) return;
    setBusy(true); setErr(null);
    try { connected(await connectWalletConnect(chainCfg.chain.id, chainCfg.rpcUrl)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  // "Use another wallet": a browser wallet opens its own account picker (asking it to connect again just handed back the
  // same account, so the button did nothing); anything else goes back to the connect sheet
  const another = async () => {
    if (walletKind() !== 'injected') { setStep('connect'); return; }
    setBusy(true); setErr(null);
    try { const w = await pickInjectedAccount(); setWallet(w); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const sign = async () => {
    const p = getProvider(); if (!p || !wallet?.address) { setStep('connect'); return; }
    setBusy(true); setErr(null);
    try { await social.signIn(p as never, wallet.address); close(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  if (step === 'connect') {
    return <ConnectModal open onClose={close} onInjected={() => void doInjected()} onWalletConnect={() => void doWc()} onDemo={close} error={err} busy={busy} onConnected={connected} noDemo title="Sign in to Emotown" sub={reason || 'Connect the wallet that holds your pets.'} />;
  }
  if (step !== 'sign' || !wallet?.address) return null;
  const kind = walletKind();
  return (
    <div className="modal-back so-signin" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Sign in to Emotown">
        <div className="modal-head"><h2>Sign in to Emotown</h2><button className="modal-x" onClick={close} aria-label="Close">✕</button></div>
        {reason && <p className="modal-sub">{reason}</p>}
        <ul className="so-points">
          <li>Your wallet asks you to <b>sign a message</b> that proves this address is yours.</li>
          <li>It is <b>not a transaction</b>: it is free, and it cannot move anything.</li>
          <li>You stay signed in on this browser for 30 days, or until you sign out.</li>
        </ul>
        <div className="so-signin-as"><span>Signing in as</span><b className="tnum">{short(wallet.address)}</b>{kind === 'passkey' && <em>passkey account</em>}</div>
        {err && <p className="modal-err" role="alert">{err}</p>}
        <div className="pk-actions">
          <button className="btn btn-ghost" onClick={() => void another()} disabled={busy}>Use another wallet</button>
          <button className="btn btn-pink" onClick={() => void sign()} disabled={busy}>{busy ? 'Waiting for your wallet…' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  );
}
