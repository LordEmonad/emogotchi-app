import { useEffect } from 'react';
import { Icon } from './Icon';
import { hasInjected, isMobile, walletLinks } from '../wallet';

type Props = { open: boolean; onClose: () => void; onInjected: () => void; onDemo: () => void; error: string | null; busy: boolean };

const SITE = 'https://emogotchi.emonad.lol';

export function ConnectModal({ open, onClose, onInjected, onDemo, error, busy }: Props) {
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
              <p className="wallet-hint">Open this page inside your wallet app's browser:</p>
              <a className="wallet-opt" href={links.metamask}><span className="wallet-opt-ico">🦊</span><span className="wallet-opt-text"><b>MetaMask</b><small>Opens emogotchi.emonad.lol in MetaMask</small></span><span className="wallet-opt-go">→</span></a>
              <a className="wallet-opt" href={links.phantom}><span className="wallet-opt-ico">👻</span><span className="wallet-opt-text"><b>Phantom</b><small>Opens in Phantom's browser</small></span><span className="wallet-opt-go">→</span></a>
              <a className="wallet-opt" href={links.okx}><span className="wallet-opt-ico">⭕️</span><span className="wallet-opt-text"><b>OKX Wallet</b><small>Opens in OKX's browser</small></span><span className="wallet-opt-go">→</span></a>
            </>
          ) : (
            <p className="wallet-hint">No browser wallet found. Install MetaMask, Rabby or Phantom, or open this page on your phone inside your wallet app.</p>
          )}
          <button className="wallet-opt is-soon" disabled>
            <span className="wallet-opt-ico">🔗</span>
            <span className="wallet-opt-text"><b>WalletConnect</b><small>Scan from any mobile wallet · coming with launch</small></span>
            <span className="wallet-opt-go">soon</span>
          </button>
        </div>
        {error && <p className="modal-err">{error}</p>}
        <button className="modal-demo" onClick={onDemo}>Just looking? <b>Try the demo cat</b> without a wallet</button>
        <p className="modal-fine">Connecting only reads your address. Every action is a separate transaction you approve.</p>
      </div>
    </div>
  );
}
