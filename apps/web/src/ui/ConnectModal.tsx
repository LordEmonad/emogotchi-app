import type { Character } from '../pet/Pet';
import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { connectPasskey, forgetPasskey, hasInjected, hasWalletConnect, isMobile, rememberedPasskeyAddress, shortAddr, walletLinks, type WalletState } from '../wallet';
import { passkeyEnabled, passkeySupport } from '../passkey/support';

type Props = { open: boolean; onClose: () => void; onInjected: () => void; onWalletConnect: () => void; onDemo: (character: Character) => void; error: string | null; busy: boolean;
  /** a wallet this sheet connected by itself (the passkey account): the page stores it and closes the sheet */
  onConnected?: (w: WalletState) => void;
  /** no demo line (signing in to Emotown needs a real wallet); `title` and `sub` replace the sheet's own heading */
  noDemo?: boolean; title?: string; sub?: string };

const SITE = 'https://emogotchi.emonad.lol';

export function ConnectModal({ open, onClose, onInjected, onWalletConnect, onDemo, error, busy, onConnected, noDemo, title, sub }: Props) {
  const [pkBusy, setPkBusy] = useState(false);
  const [pkError, setPkError] = useState<string | null>(null);
  // read at first render, not in an effect: an effect leaves one frame where the sheet says "Passkey account" with
  // no address, and then the address pops in
  const [pkKnown, setPkKnown] = useState(rememberedPasskeyAddress);
  const [openLinks, setOpenLinks] = useState(false);
  useEffect(() => { if (open) { setPkError(null); setPkKnown(rememberedPasskeyAddress()); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  const injected = hasInjected();
  // the passkey account: offered when the flag is on and a page can take the result; greyed with the reason when this
  // browser cannot do it; hidden inside a wallet app, whose owner already has a wallet
  const support = passkeySupport();
  const passkey = !!onConnected && passkeyEnabled() && !(support.tier === 'no' && injected);
  const doPasskey = () => {
    if (pkBusy || busy) return;
    setPkBusy(true); setPkError(null);
    connectPasskey().then((w) => onConnected?.(w), (e) => { if ((e as { code?: number }).code !== 4001) setPkError((e as Error).message || 'The passkey account could not be opened.'); }).finally(() => setPkBusy(false));
  };
  const passkeyOption = !passkey ? null : (
    <React.Fragment key="passkey">
      <button className={`wallet-opt ${support.tier === 'no' ? 'is-soon' : ''}`} onClick={doPasskey} disabled={busy || pkBusy || support.tier === 'no'}>
        <span className="wallet-opt-ico" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8.5" cy="8.5" r="4" /><path d="M11.5 11.5 20 20M16.5 16.5l2.2-2.2M13.8 13.8l1.8-1.8" />
          </svg>
        </span>
        <span className="wallet-opt-text">
          <b>{pkKnown ? `Passkey account ${shortAddr(pkKnown)}` : 'Passkey account'} <em className="wallet-opt-tag">beta</em></b>
          <small>{support.tier === 'no' ? support.why : pkKnown ? 'Continue with Face ID, fingerprint or your passkey' : 'No wallet? Make an account with Face ID, fingerprint or your password manager'}</small>
        </span>
        <span className="wallet-opt-go">{pkBusy ? '…' : '→'}</span>
      </button>
      {pkKnown && <button className="wallet-other" onClick={() => { void forgetPasskey().then(() => setPkKnown(null)); }} disabled={pkBusy}>Use a different passkey account</button>}
    </React.Fragment>
  );
  const mobile = isMobile();
  const links = walletLinks(SITE);
  const injectedOption = !injected ? null : (
    <button key="injected" className="wallet-opt" onClick={onInjected} disabled={busy}>
      <span className="wallet-opt-ico"><Icon name="coin" size={26} /></span>
      <span className="wallet-opt-text"><b>Browser wallet</b><small>MetaMask, Rabby, Phantom, OKX or this wallet's browser</small></span>
      <span className="wallet-opt-go">{busy ? '…' : '→'}</span>
    </button>
  );
  const wcOption = !hasWalletConnect() ? null : (
    <button key="wc" className="wallet-opt" onClick={onWalletConnect} disabled={busy}>
      <span className="wallet-opt-ico" aria-hidden>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h3v3h-3zM19 19h2M19 14h2v2" />
        </svg>
      </span>
      <span className="wallet-opt-text"><b>WalletConnect</b><small>{mobile ? 'Pick your wallet app from the list' : 'Scan a QR code with the wallet on your phone'}</small></span>
      <span className="wallet-opt-go">{busy ? '…' : '→'}</span>
    </button>
  );
  const noneHint = injected || mobile || hasWalletConnect() || passkey ? null : (
    <p key="hint" className="wallet-hint">No wallet found in this browser. Install MetaMask, Rabby or Phantom, or open this page on your phone inside your wallet app's own browser.</p>
  );
  /**
   * The order is the visitor's own most likely route, first. A passkey account this browser already remembers wins
   * outright — they are coming back to it. Otherwise: the wallet they have installed, then WalletConnect (on a
   * phone that is the real way to reach a wallet app), then the passkey, whose subtitle opens "No wallet?" so
   * anybody who does have one skips it without reading twice. Every option is always offered whatever the order.
   */
  const order = (pkKnown
    ? [passkeyOption, injectedOption, wcOption]
    : [injectedOption, wcOption, passkeyOption]
  ).concat(noneHint).filter(Boolean);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title">
        <div className="modal-head">
          <h2 id="connect-title">{title ?? 'Connect a wallet'}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="modal-sub">{sub ?? 'Your Emogotchi lives in your wallet. Connect to see it.'}</p>
        <div className="wallet-list">{order}</div>
        {/* On a phone the five deep links used to sit in the list, which made the sheet taller than the screen.
            WalletConnect's own picker covers the same wallets, so they are tucked behind one line for the people
            who would rather use their wallet's built-in browser. */}
        {mobile && !injected && (
          <div className="wallet-more">
            {/* Honest, because it is MetaMask Mobile's own open bug: a WalletConnect transaction can open the wallet
                with nothing to sign. Connecting works; signing often does not. The wallet's own browser has no relay,
                no app switch and no deep link, and is the path everything was actually tested on. */}
            <p className="wallet-hint">If your wallet opens without showing a prompt, use its own browser instead — it is the most reliable way on a phone.</p>
            <button className="wallet-other" onClick={() => setOpenLinks((o) => !o)} aria-expanded={openLinks}>
              {openLinks ? 'Hide' : 'Or open this page in your wallet\u2019s own browser'}
            </button>
            {openLinks && (
              <div className="wallet-list">
                <p className="wallet-hint">Any wallet with a built-in browser works, even if it is not listed: look for a Browser or DApps tab and type emogotchi.emonad.lol.</p>
                <a className="wallet-opt" href={links.metamask}><span className="wallet-opt-ico">🦊</span><span className="wallet-opt-text"><b>MetaMask</b></span><span className="wallet-opt-go">→</span></a>
                <a className="wallet-opt" href={links.phantom}><span className="wallet-opt-ico">👻</span><span className="wallet-opt-text"><b>Phantom</b></span><span className="wallet-opt-go">→</span></a>
                <a className="wallet-opt" href={links.safepal}><span className="wallet-opt-ico">🛡️</span><span className="wallet-opt-text"><b>SafePal</b></span><span className="wallet-opt-go">→</span></a>
                <a className="wallet-opt" href={links.trust}><span className="wallet-opt-ico">🔷</span><span className="wallet-opt-text"><b>Trust Wallet</b></span><span className="wallet-opt-go">→</span></a>
                <a className="wallet-opt" href={links.okx}><span className="wallet-opt-ico">⭕️</span><span className="wallet-opt-text"><b>OKX Wallet</b></span><span className="wallet-opt-go">→</span></a>
              </div>
            )}
          </div>
        )}
        {(pkError ?? error) && <p className="modal-err">{pkError ?? error}</p>}
        {/* Three pets exist, so the demo offers each. `onDemo` takes the character because the room reads
            `demoCharacter`, and picking here is the only moment a visitor without a wallet gets to choose. */}
        {!noDemo && <div className="modal-demo">
          <span>Just looking? Try it without a wallet:</span>
          <span className="modal-demo-pick">
            <button type="button" onClick={() => onDemo('cat')}><b>a cat</b></button>
            <button type="button" onClick={() => onDemo('frog')}><b>a frok</b></button>
            <button type="button" onClick={() => onDemo('sahur')}><b>a Sahur</b></button>
            {__THICCUMS__ ? <button type="button" onClick={() => onDemo('thiccums')}><b>a Thiccums</b></button> : null}
            {__R3TARDS__ ? <button type="button" onClick={() => onDemo('r3tards')}><b>a r3tard</b></button> : null}
            {__EMONAD__ ? <button type="button" onClick={() => onDemo('emonad')}><b>an Emonad</b></button> : null}
          </span>
        </div>}
        <p className="modal-fine">Connecting only reads your address. Every action is a separate transaction you approve.</p>
      </div>
    </div>
  );
}
