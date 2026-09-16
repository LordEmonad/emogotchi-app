import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { chainName, shortAddr, type WalletState } from '../wallet';
import { chainCfg } from '../game/chain';
import { navLinks } from '../links';

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
  const [nav, setNav] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const navBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  // the same links as a sheet on a phone: below 640px the row of links is hidden, and until this
  // existed there was no way at all to reach the FAQ or the claim page from a phone
  useEffect(() => {
    if (!nav) return;
    const close = (e: PointerEvent) => { if (!navBox.current?.contains(e.target as Node)) setNav(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setNav(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [nav]);
  const here = typeof location !== 'undefined' ? location.pathname.replace(/\/+$/, '') || '/' : '/';
  const links = navLinks();
  const connected = wallet.status === 'connected' && wallet.address;
  return (
    <header className="hdr">
      <a className="brand" href="/" aria-label="Emogotchi home">
        <span className="wordmark-heart" aria-hidden><Icon name="heart" size={22} /></span>
        <span className="wordmark">Emogotchi</span>
      </a>
      <nav className="hdr-nav hide-sm" aria-label="Site">
        {links.map((l) => (
          <a key={l.href} href={l.href} className={l.href === '/claim' ? 'nav-claim' : ''} aria-current={here === l.href ? 'page' : undefined}>{l.label}</a>
        ))}
      </nav>
      <div className="hdr-right">
        <div className="nav-menu show-sm" ref={navBox}>
          <button className={`nav-toggle ${nav ? 'is-open' : ''}`} onClick={() => setNav((o) => !o)} aria-haspopup="menu" aria-expanded={nav} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          {nav && (
            <div className="nav-pop" role="menu">
              <a href="/" role="menuitem" aria-current={here === '/' ? 'page' : undefined}>Home</a>
              {links.map((l) => (
                <a key={l.href} href={l.href} role="menuitem" aria-current={here === l.href ? 'page' : undefined}>{l.label}</a>
              ))}
            </div>
          )}
        </div>
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
