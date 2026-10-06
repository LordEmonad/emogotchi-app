import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { chainName, rememberedWallet, shortAddr, type WalletState } from '../wallet';
import { openNotifSheet, pushSupported } from '../push/client';
import { SoundMenuRow } from '../sound/Control';
import { chainCfg } from '../game/chain';
import { navLinks } from '../links';
import { ask } from '../passkey/bus';
import { openTopup, topupOffered } from '../topup/TopUpRoot';
import { TOPUP_BUILT } from '../topup/flag';

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
  // the same links as a sheet on a phone: below 960px the row of links is hidden, and until this
  // existed there was no way at all to reach the FAQ or the claim page from a phone
  useEffect(() => {
    if (!nav) return;
    const close = (e: PointerEvent) => { if (!navBox.current?.contains(e.target as Node)) setNav(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setNav(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [nav]);
  // the row's "More" menu: the pages that are not the way in, the town, the ring, the shop or the gallery
  const [more, setMore] = useState(false);
  const moreBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const close = (e: PointerEvent) => { if (!moreBox.current?.contains(e.target as Node)) setMore(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [more]);
  const here = typeof location !== 'undefined' ? location.pathname.replace(/\/+$/, '') || '/' : '/';
  const links = navLinks();
  const isHere = (href: string) => here === href || (href === '/shop' && here.startsWith('/shop/'));
  const rowLinks = links.filter((l) => !l.more);
  const moreLinks = links.filter((l) => l.more);
  const onMore = moreLinks.some((l) => isHere(l.href));
  const connected = wallet.status === 'connected' && wallet.address;
  // "My pets": the home page, which shows the wallet's pets. For a real wallet, connected here or remembered by this
  // browser (most pages do not reconnect one, and the home page does); before, the only way back was the logo.
  const mine = connected ? !wallet.demo : rememberedWallet();
  const onMine = here === '/';
  return (
    <header className="hdr">
      <a className="brand" href="/" aria-label="Emogotchi home">
        <span className="wordmark-heart" aria-hidden><Icon name="heart" size={22} /></span>
        <span className="wordmark">Emogotchi</span>
      </a>
      <nav className="hdr-nav hide-nav" aria-label="Site">
        {rowLinks.map((l) => (
          <a key={l.href} href={l.href} className={l.href === '/claim' ? 'nav-claim' : ''} aria-current={isHere(l.href) ? 'page' : undefined}>{l.label}{l.beta && <span className="nav-beta">Beta</span>}</a>
        ))}
        {moreLinks.length > 0 && (
          <div className="nav-more" ref={moreBox}>
            <button type="button" className={`nav-more-btn${more ? ' is-open' : ''}`} onClick={() => setMore((o) => !o)} aria-haspopup="menu" aria-expanded={more} aria-current={onMore ? 'page' : undefined}>
              More
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {more && (
              <div className="nav-pop" role="menu">
                {moreLinks.map((l) => (
                  <a key={l.href} href={l.href} role="menuitem" aria-current={isHere(l.href) ? 'page' : undefined}>{l.label}{l.beta && <span className="nav-beta">Beta</span>}</a>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
      <div className="hdr-right">
        <div className="nav-menu show-nav" ref={navBox}>
          <button className={`nav-toggle ${nav ? 'is-open' : ''}`} onClick={() => setNav((o) => !o)} aria-haspopup="menu" aria-expanded={nav} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          {nav && (
            <div className="nav-pop" role="menu">
              {mine ? <a href="/" role="menuitem" className="nav-mine" aria-current={onMine ? 'page' : undefined}>My pets</a> : <a href="/" role="menuitem" aria-current={onMine ? 'page' : undefined}>Home</a>}
              {mine && pushSupported() && <button role="menuitem" onClick={() => { setNav(false); openNotifSheet(); }}>Notifications</button>}
              <SoundMenuRow />
              {links.map((l) => (
                <a key={l.href} href={l.href} role="menuitem" aria-current={isHere(l.href) ? 'page' : undefined}>{l.label}{l.beta && <span className="nav-beta">Beta</span>}</a>
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
        {mine && <a className="mypets-btn hide-sm" href="/" aria-current={onMine ? 'page' : undefined}><Icon name="heart" size={14} /> My pets</a>}
        {connected ? (
          <div className="wallet-menu" ref={menu}>
            <button className={`wallet-chip ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
              <span className="wallet-dot" data-demo={wallet.demo ? 'on' : 'off'} />
              <span className="tnum">{shortAddr(wallet.address!)}</span>
              <span className="wallet-net hide-sm">{wallet.demo ? 'demo' : wallet.kind === 'passkey' ? 'passkey' : chainName(wallet.chainId)}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {open && (
              <div className="wallet-pop" role="menu">
                <div className="wallet-pop-addr tnum">{wallet.address}</div>
                <div className="wallet-pop-net">{wallet.demo ? 'Demo wallet · nothing is on chain yet' : `${wallet.kind === 'passkey' ? 'Passkey account · ' : ''}${chainName(wallet.chainId) || 'Unknown network'}`}</div>
                {!wallet.demo && <a role="menuitem" href="/">My pets</a>}
                {wallet.kind === 'passkey' && <button role="menuitem" onClick={() => { setOpen(false); void ask({ kind: 'account' }).catch(() => {}); }}>Account: fund, send, recovery phrase</button>}
                {TOPUP_BUILT && !wallet.demo && topupOffered() && <button role="menuitem" onClick={() => { setOpen(false); openTopup(); }}>Add MON from another chain</button>}
                <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(wallet.address!); setOpen(false); }}>Copy address</button>
                {/* The referral link lives here rather than in the passkey Account sheet: a visitor connected
                    with MetaMask has no such sheet, and this menu is the one place every kind of account has. */}
                {!wallet.demo && <a role="menuitem" href={`/u/${wallet.address}`}>My profile</a>}
                {!wallet.demo && <a role="menuitem" href="/refer">Bring a friend — referrals</a>}
                {!wallet.demo && pushSupported() && <button role="menuitem" onClick={() => { setOpen(false); openNotifSheet(); }}>Notifications</button>}
                <SoundMenuRow />
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
