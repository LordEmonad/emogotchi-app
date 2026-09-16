import { useEffect } from 'react';
import { Icon } from './Icon';
import { hasInjected, hasWalletConnect, isMobile, walletLinks } from '../wallet';

type Props = { open: boolean; onClose: () => void; onInjected: () => void; onWalletConnect: () => void; onDemo: () => void; error: string | null; busy: boolean };

const SITE = 'https://emogotchi.emonad.lol';

export function ConnectModal({ open, onClose, onInjected, onWalletConnect, onDemo, error, busy }: Props) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  const injected = hasInjected();
  const mobile = isMobile();
  const links = walletLinks(SITE);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title">
        <div className="modal-head">
          <h2 id="connect-title">Connect a wallet</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="modal-sub">Your Emogotchi lives in your wallet. Connect to see it.</p>
        <div className="wallet-list">
          {injected ? (
            <button className="wallet-opt" onClick={onInjected} disabled={busy}>
              <span className="wallet-opt-ico"><Icon name="coin" size={26} /></span>
              <span className="wallet-opt-text"><b>Browser wallet</b><small>MetaMask, Rabby, Phantom, OKX or this wallet's browser</small></span>
              <span className="wallet-opt-go">{busy ? '…' : '→'}</span>
            </button>
          ) : mobile ? (
            <>
              <p className="wallet-hint">Open this page inside your wallet app's own browser. Any wallet with a built-in browser works, even if it is not listed: look for a Browser or DApps tab and type emogotchi.emonad.lol.</p>
              <a className="wallet-opt" href={links.metamask}><span className="wallet-opt-ico">🦊</span><span className="wallet-opt-text"><b>MetaMask</b><small>Opens emogotchi.emonad.lol in MetaMask</small></span><span className="wallet-opt-go">→</span></a>
              <a className="wallet-opt" href={links.phantom}><span className="wallet-opt-ico">👻</span><span className="wallet-opt-text"><b>Phantom</b><small>Opens in Phantom's browser</small></span><span className="wallet-opt-go">→</span></a>
              <a className="wallet-opt" href={links.safepal}><span className="wallet-opt-ico">🛡️</span><span className="wallet-opt-text"><b>SafePal</b><small>Opens in SafePal's browser</small></span><span className="wallet-opt-go">→</span></a>
              <a className="wallet-opt" href={links.trust}><span className="wallet-opt-ico">🔷</span><span className="wallet-opt-text"><b>Trust Wallet</b><small>Opens in Trust's browser</small></span><span className="wallet-opt-go">→</span></a>
              <a className="wallet-opt" href={links.okx}><span className="wallet-opt-ico">⭕️</span><span className="wallet-opt-text"><b>OKX Wallet</b><small>Opens in OKX's browser</small></span><span className="wallet-opt-go">→</span></a>
            </>
          ) : !hasWalletConnect() ? (
            <p className="wallet-hint">No wallet found in this browser. Install MetaMask, Rabby or Phantom, or open this page on your phone inside your wallet app's own browser.</p>
          ) : null}
          {hasWalletConnect() && (
            <button className="wallet-opt" onClick={onWalletConnect} disabled={busy}>
              <span className="wallet-opt-ico" aria-hidden>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <path d="M14 14h3v3h-3zM19 19h2M19 14h2v2" />
                </svg>
              </span>
              <span className="wallet-opt-text"><b>WalletConnect</b><small>{mobile ? 'Pick your wallet app from the list' : 'Scan a QR code with the wallet on your phone'}</small></span>
              <span className="wallet-opt-go">{busy ? '…' : '→'}</span>
            </button>
          )}
        </div>
        {error && <p className="modal-err">{error}</p>}
        <button className="modal-demo" onClick={onDemo}>Just looking? <b>Try the demo cat</b> without a wallet</button>
        <p className="modal-fine">Connecting only reads your address. Every action is a separate transaction you approve.</p>
      </div>
    </div>
  );
}
