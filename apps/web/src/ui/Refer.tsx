/**
 * /refer — your referral link and what it has earned.
 *
 * Works for every kind of account, which is why it is a page and not a row in the passkey Account sheet: a
 * visitor connected with MetaMask has no such sheet, and referrals must not be a passkey-only feature.
 *
 * The points come out of `/api/stats`, which the Worker already folds and caches at the edge every five
 * minutes — so opening this page costs no database reads at all, however many people open it. The counting
 * itself is derived from the chain's own Named events and is never stored; see worker/referral.js.
 */
import { useEffect, useState } from 'react';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, onAccountsChanged, restore, revokeInjected, type WalletState } from '../wallet';
import { chainCfg } from '../game/chain';
import { Header } from './Header';
import { ConnectModal } from './ConnectModal';
import { SiteFooter } from './SiteFooter';
import { referLink, referPoints } from '../refer';

export function Refer() {
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const [pts, setPts] = useState<{ points: number; total: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const connected = wallet.status === 'connected' && !!wallet.address;
  const link = connected && wallet.address ? referLink(wallet.address) : '';

  useEffect(() => { void restore().then((w) => { if (w) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => {
    if (!connected || !wallet.address) { setPts(null); return; }
    let dead = false;
    const load = () => { void referPoints(wallet.address!).then((p) => { if (!dead) setPts(p); }); };
    load();
    const t = setInterval(load, 60_000);   // the blob behind this only refolds every 5 min; a minute is plenty
    return () => { dead = true; clearInterval(t); };
  }, [connected, wallet.address]);

  const copy = () => {
    if (!link) return;
    void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };

  return (
    <div className="page">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={() => { disconnect(); setWallet(EMPTY_WALLET); void revokeInjected(); }} compact />
      <main className="refer">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Referrals</p>
            <h1>Bring a friend</h1>
            <p className="lede">Share your link. When someone new uses it and gives their pet a name, you get a point.</p>
          </div>
        </section>

        {/* Outside .hero-copy on purpose: that column halves at desktop width, which wrapped the link over three
            lines. Both cards being full width also makes the page read as two steps rather than one aside. */}
        <div className="refer-card">
          {!connected ? (
            <>
              <h2>Get your link</h2>
              <p>Connect to see it. Any wallet works, and so does a passkey account.</p>
              <button className="btn btn-pink btn-lg" onClick={() => setModal(true)}>Connect</button>
            </>
          ) : (
            <>
              <div className="refer-link">
                <code className="tnum">{link}</code>
                <button className="btn btn-pink" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
              </div>
              <div className="refer-score">
                <div className="refer-n" data-loading={pts ? undefined : ''}>{pts ? pts.points : 0}</div>
                <div className="refer-k">{pts && pts.points === 1 ? 'point' : 'points'}</div>
              </div>
              <p className="refer-fine">
                {pts && pts.total > 0
                  ? `${pts.total.toLocaleString()} points earned across everyone so far.`
                  : 'Nobody has earned one yet. Be first.'}
              </p>
            </>
          )}
        </div>

        <div className="refer-card">
          <h2>How it works</h2>
          <ol className="refer-how">
            <li><b>They open your link.</b> It lands on the frok mint, because minting a free pet is the easiest way in. No wallet needed — they can make an account with Face ID and we cover the gas.</li>
            <li><b>They have to be new.</b> Someone who already owns a cat or a frok cannot be referred.</li>
            <li><b>They name a pet.</b> Naming costs 10 MON and is the moment someone stops browsing and commits. That is when your point lands — usually within a few minutes.</li>
          </ol>
          <p className="refer-fine">
            Points are counted from the chain itself, so nobody can hand them out or take them away — not even us.
            What they are eventually good for is not decided and nothing is promised.
          </p>
        </div>
      </main>
      <SiteFooter />
      <ConnectModal
        open={modal}
        onClose={() => setModal(false)}
        onInjected={() => { void connectInjected().then((w) => { setWallet(w); setModal(false); }).catch((e) => setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message }))); }}
        onWalletConnect={() => { if (chainCfg) void connectWalletConnect(chainCfg.chain.id, chainCfg.rpcUrl).then((w) => { setWallet(w); setModal(false); }).catch((e) => setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message }))); }}
        onDemo={() => { location.href = '/'; }}
        error={wallet.error}
        busy={wallet.status === 'connecting'}
        onConnected={(w) => { setWallet(w); setModal(false); }}
      />
    </div>
  );
}
