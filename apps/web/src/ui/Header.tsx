import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { chainName, shortAddr, type WalletState } from '../wallet';
import { chainCfg } from '../game/chain';

type Props = {
  wallet: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
  spentMon?: number;
  burnedEmo?: number;
  compact?: boolean;
};

export function Header({ wallet, onConnect, onDisconnect, spentMon, burnedEmo, compact }: Props) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const connected = wallet.status === 'connected' && wallet.address;
  return (
    <header className="hdr">
      <a className="brand" href="/" aria-label="Emogotchi home">
        <span className="wordmark-heart" aria-hidden><Icon name="heart" size={22} /></span>
        <span className="wordmark">Emogotchi</span>
      </a>
      <nav className="hdr-nav hide-sm">{chainCfg?.drop && <a className="nav-claim" href="/claim">Claim</a>}<a href="/leaderboard">Leaderboard</a><a href="/nft">NFT</a><a href="/#faq">FAQ</a></nav>
      <div className="hdr-right">
        {connected && spentMon !== undefined && (
          <span className="chip tnum hide-sm"><Icon name="coin" size={16} /> {spentMon} MON</span>
        )}
        {connected && burnedEmo !== undefined && (
          <span className="chip chip-pink tnum hide-sm"><Icon name="flame" size={16} /> {burnedEmo.toLocaleString()}</span>
        )}
        {connected ? (
          <div className="wallet-menu" ref={menu}>
            <button className={`wallet-chip ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
              <span className="wallet-dot" data-demo={wallet.demo ? 'on' : 'off'} />
              <span className="tnum">{shortAddr(wallet.address!)}</span>
              <span className="wallet-net hide-sm">{wallet.demo ? 'demo' : chainName(wallet.chainId)}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {open && (
              <div className="wallet-pop" role="menu">
                <div className="wallet-pop-addr tnum">{wallet.address}</div>
                <div className="wallet-pop-net">{wallet.demo ? 'Demo wallet · nothing is on chain yet' : chainName(wallet.chainId) || 'Unknown network'}</div>
                <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(wallet.address!); setOpen(false); }}>Copy address</button>
                <button role="menuitem" onClick={() => { setOpen(false); onDisconnect(); }}>Disconnect</button>
              </div>
            )}
          </div>
        ) : (
          <button className={`btn btn-pink ${compact ? 'btn-sm' : ''}`} onClick={onConnect} disabled={wallet.status === 'connecting'}>
            {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
      </div>
    </header>
  );
}
