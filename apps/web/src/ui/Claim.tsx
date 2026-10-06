/**
 * /claim — the claim window. Wallets on the allowlist (a Merkle tree; proofs are static files under
 * /claim/p/) mint one cat each while the window is open. The page never says who is on the list:
 * connect and find out. The cat on stage runs the whole animation tour on a loop.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Address, DropView } from '@emo-pets/chain';
import { getAddress, isAddress, keccak256, toBytes } from 'viem';
import { Header } from './Header';
import { ConnectModal } from './ConnectModal';
import { Icon } from './Icon';
import { marketplace } from '../links';
import { SiteFooter } from './SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director, DirectorState } from '../scene/director';
import { chainCfg, chainClient } from '../game/chain';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState } from '../wallet';

const EMPTY_D: DirectorState = { x: 330, dir: 1, busy: null, poop: false, sleeping: false, inTub: false, dead: false, queued: 0 };
type Proof = `0x${string}`[];
export type ClaimStatus = Status;
type Status = 'off' | 'loading' | 'connect' | 'checking' | 'not-listed' | 'soon' | 'open' | 'claimed' | 'gone' | 'closed' | 'sealed' | 'sending' | 'done' | 'error';

const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const SHOW_COUNTDOWN_UNDER = 60 * 86400; // only count down a window that actually ends soon
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The proof for one address, from its static shard; null when the address is not on the list. */
async function lookupProof(address: string): Promise<Proof | null> {
  // The published files are keyed by keccak256(address) rather than the address. That keeps the allowlist out of
  // casual view; it is NOT secret, because the address space is enumerable and anyone can hash a candidate list and
  // recover the set. It does not need to be secret: claim() binds the leaf to msg.sender, so a proof is useless to
  // anyone but its owner. If a future allowlist really must stay private, shard on HMAC(serverSecret, address)
  // served from the Worker.
  const key = keccak256(toBytes(address.toLowerCase()));
  const r = await fetch(`/claim/p/${key.slice(2, 5)}.json`, { cache: 'no-store' });
  return r.ok ? ((await r.json()) as Record<string, Proof>)[key] ?? null : null;
}

type Check = { address: string; listed: boolean; claimed: boolean; cats: number };

/** Paste any address and see whether it is on the list, without connecting. */
function WalletChecker({ left }: { left: number }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const check = async () => {
    const raw = input.trim();
    if (!chainClient) return;
    if (!isAddress(raw)) { setResult(null); setError(raw ? 'That is not a wallet address.' : 'Paste a wallet address.'); return; }
    const address = getAddress(raw);
    const id = ++run.current;
    setBusy(true); setError(null); setResult(null);
    try {
      const [proof, view, cats] = await Promise.all([lookupProof(address), chainClient.drop(address), chainClient.catsOf(address)]);
      if (id !== run.current) return;
      setResult({ address, listed: proof !== null, claimed: view.hasClaimed, cats: cats.length });
    } catch (e) {
      if (id === run.current) setError((e as Error).message || 'Could not check that wallet.');
    } finally {
      if (id === run.current) setBusy(false);
    }
  };

  const verdict = (r: Check) => {
    const a = short(r.address);
    const holds = r.cats === 1 ? 'one cat' : `${r.cats} cats`;
    if (r.claimed) return { tone: 'yes', text: r.cats === 0 ? `${a} has claimed its cat and passed it on.` : r.cats === 1 ? `${a} has already claimed its cat.` : `${a} has already claimed its cat, and holds ${holds}.` };
    // not eligible, or eligible with nothing left: the airdrop may still have found it
    const but = r.cats === 0 ? '' : `, but it already has ${holds}`;
    if (r.listed && left <= 0) return { tone: 'no', text: `${a} is on the list, but every cat is gone.` };
    if (r.listed) return { tone: 'yes', text: `${a} is on the list. One cat is waiting${r.cats === 0 ? '' : `, and it already has ${holds}`}.` };
    return { tone: r.cats === 0 ? 'no' : 'yes', text: `${a} is not on the list${but}.` };
  };

  return (
    <form className="claim-check" onSubmit={(e) => { e.preventDefault(); void check(); }}>
      <label htmlFor="claim-check-addr">Check any wallet</label>
      <div className="claim-check-row">
        <input id="claim-check-addr" value={input} onChange={(e) => { setInput(e.target.value); setError(null); }} placeholder="0x…" spellCheck={false} autoComplete="off" inputMode="text" aria-label="Wallet address to check" />
        <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? 'Checking…' : 'Check'}</button>
      </div>
      {result && !busy && <p className="claim-check-result" data-tone={verdict(result).tone} aria-live="polite">{verdict(result).text}</p>}
      {error && <p className="claim-err" aria-live="polite">{error}</p>}
    </form>
  );
}
export const fmtLeft = (s: number) => {
  if (s <= 0) return '0m';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * The cat's claim for one wallet (this page and the Adopt page's cat card): the window, refreshed every 15 s; this
 * wallet's proof, from its static shard; what to show; and the claim itself.
 */
export function useClaim(wallet: WalletState, connected: boolean, wrongChain: boolean) {
  const drop = chainCfg?.drop ?? null;
  const [view, setView] = useState<DropView | null>(null);
  const [proof, setProof] = useState<Proof | null | undefined>(undefined); // undefined = not looked up yet
  const [status, setStatus] = useState<Status>(drop ? 'loading' : 'off');
  const [error, setError] = useState<string | null>(null);
  const [catId, setCatId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // ---- the window, refreshed every 15 s
  useEffect(() => {
    if (!drop || !chainClient) return;
    let alive = true;
    const client = chainClient;
    const tick = async () => { try { const v = await client.drop(connected ? (wallet.address as Address) : undefined); if (alive) setView(v); } catch (e) { if (alive) setError((e as Error).message); } };
    void tick();
    const id = setInterval(() => void tick(), 15000);
    return () => { alive = false; clearInterval(id); };
  }, [drop, connected, wallet.address]);
  useEffect(() => { const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(id); }, []);

  // ---- this wallet's proof: one static shard, keyed by the first byte of the address
  useEffect(() => {
    if (!connected || !wallet.address) { setProof(undefined); return; }
    let alive = true;
    setProof(undefined);
    void lookupProof(wallet.address)
      .then((p) => { if (alive) setProof(p); })
      .catch(() => { if (alive) setProof(null); });
    return () => { alive = false; };
  }, [connected, wallet.address]);

  // ---- what to show
  useEffect(() => {
    if (!drop) return setStatus('off');
    if (status === 'sending' || status === 'done') return;
    if (!view) return setStatus('loading');
    if (view.sealed) return setStatus('sealed');
    if (view.root === ZERO_ROOT) return setStatus('off'); // no window announced yet
    if (now < view.start) return setStatus('soon');
    if (now >= view.end) return setStatus('closed');
    if (!connected) return setStatus('connect');
    if (view.hasClaimed) return setStatus('claimed');
    if (proof === undefined) return setStatus('checking');
    if (proof === null) return setStatus('not-listed');
    if (view.left <= 0) return setStatus('gone');
    setStatus('open');
  }, [drop, view, now, connected, proof, status]);

  const claim = async () => {
    if (!chainClient || !proof || !wallet.address) return;
    setStatus('sending'); setError(null);
    try {
      if (wrongChain && chainCfg) await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      await chainClient.claim(proof);
      const t = await chainClient.totals();
      setCatId(t.totalSupply);
      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('open');
    }
  };

  return { drop, view, status, error, catId, now, claim };
}
export type ClaimState = ReturnType<typeof useClaim>;

export function Claim() {
  const drop = chainCfg?.drop ?? null;
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const connecting = useRef(false);

  // ---- the showreel: the director plays the whole tour, forever; once a cat is claimed it just purrs
  const [director, setDirector] = useState<Director | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const dState = useSyncExternalStore(useCallback((fn) => director?.subscribe(fn) ?? (() => {}), [director]), () => director?.getState() ?? EMPTY_D, () => EMPTY_D);
  useEffect(() => {
    if (!director) return;
    let alive = true;
    director.wanderEnabled = false;
    let side: 1 | -1 = 1;
    const loop = async () => {
      while (alive) {
        try { await (celebrating ? director.pet((side = side === 1 ? -1 : 1)) : director.tour()); } catch { /* unmounted mid-action */ }
        if (!alive) return;
        await new Promise((r) => setTimeout(r, celebrating ? 700 : 1800));
      }
    };
    const t = setTimeout(() => void loop(), celebrating ? 0 : 900);
    return () => { alive = false; clearTimeout(t); };
  }, [director, celebrating]);

  // ---- wallet
  useEffect(() => { void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => onChainChanged((chainId) => setWallet((w) => ({ ...w, chainId }))), []);
  const connected = wallet.status === 'connected' && !!wallet.address;
  const wrongChain = connected && chainCfg !== null && wallet.chainId !== null && wallet.chainId !== chainCfg.chain.id;
  const doWalletConnect = async () => {
    if (connecting.current || !chainCfg) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try {
      setWallet(await connectWalletConnect(chainCfg.chain.id, chainCfg.rpcUrl));
      setModal(false);
    } catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  const doInjected = async () => {
    if (connecting.current) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try {
      const w = await connectInjected();
      if (chainCfg && w.chainId !== chainCfg.chain.id) { try { await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer); w.chainId = chainCfg.chain.id; } catch { /* asked again below */ } }
      setWallet(w); setModal(false);
    } catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  const doDisconnect = () => { disconnect(); setWallet(EMPTY_WALLET); void revokeInjected(); };
  useEffect(() => { chainClient?.setSigner(connected && wallet.address ? { provider: getProvider() as never, address: wallet.address as Address } : null); }, [connected, wallet.address]);

  const { view, status, error, catId, now, claim } = useClaim(wallet, connected, wrongChain);
  // a claimed cat just purrs
  useEffect(() => { if (status === 'claimed' || status === 'done') setCelebrating(true); }, [status]);

  const stage = <Stage quiet onDirector={setDirector} night={dState.sleeping} thought={null} onPet={() => {}} />;
  const left = view ? Math.max(0, view.end - now) : 0;
  const until = view ? Math.max(0, view.start - now) : 0;
  // the checker is useful while there is a list to be on: from the window's start until it is sealed or closed
  const checkable = !!view && !view.sealed && view.root !== ZERO_ROOT && now >= view.start && now < view.end;

  return (
    <div className="page view-claim">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} compact />
      <main className="claim">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><Icon name="heart" size={14} /> The claim</p>
            <h1>Is your wallet<br /><span className="grad">on the list?</span></h1>
            <p className="lede">Emogotchi was airdropped to everyone who claimed the initial Monad airdrop, to Monad Card holders, and to EMO holders. The claim is open to several Monad communities.</p>
            <div className="claim-card" data-status={status}>
              {status === 'off' && <><h2>Not open yet</h2></>}
              {status === 'loading' && <><h2>Checking…</h2></>}
              {status === 'soon' && <><h2>Opens in {fmtLeft(until)}</h2></>}
              {status === 'connect' && <>
                <h2>Claim here</h2>
                <p className="tnum">{view?.left.toLocaleString()} left{left < SHOW_COUNTDOWN_UNDER ? ` · closes in ${fmtLeft(left)}` : ''}</p>
                <button className="btn btn-pink btn-lg" onClick={() => setModal(true)} disabled={wallet.status === 'connecting'}>{wallet.status === 'connecting' ? 'Connecting…' : 'Check my wallet'}</button>
              </>}
              {status === 'checking' && <><h2>Checking your wallet…</h2></>}
              {status === 'not-listed' && <>
                <h2>Not on the list</h2>
                <p className="tnum">{wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}</p>
              </>}
              {status === 'claimed' && <>
                <h2>Already claimed</h2>
                <a className="btn btn-pink btn-lg" href="/">Go look after it →</a>
              </>}
              {status === 'gone' && <><h2>All claimed</h2></>}
              {status === 'closed' && <><h2>Closed</h2><p>Every Emogotchi left over has been burned forever.</p></>}
              {status === 'sealed' && <><h2>Supply is final</h2></>}
              {(status === 'open' || status === 'sending') && <>
                <h2>You are on the list</h2>
                <p className="tnum">{view?.left.toLocaleString()} left{left < SHOW_COUNTDOWN_UNDER ? ` · closes in ${fmtLeft(left)}` : ''}</p>
                {wrongChain && <p className="claim-warn">Switch your wallet to {chainCfg?.chain.name ?? 'Monad'} first.</p>}
                <button className="btn btn-pink btn-lg" onClick={() => void claim()} disabled={status === 'sending'}>{status === 'sending' ? (wallet.kind === 'passkey' ? 'Claiming…' : 'Claiming… confirm in your wallet') : 'Claim my cat'}</button>
              </>}
              {status === 'done' && <>
                <h2>It is yours</h2>
                <p>Emogotchi #{catId} is in your wallet.</p>
                <a className="btn btn-pink btn-lg" href="/">Go look after it →</a>
              </>}
              {error && <p className="claim-err">{error}</p>}
            </div>
            {checkable && <WalletChecker left={view?.left ?? 0} />}
          </div>
          <div className="hero-stage">
            <div className="shell">{stage}</div>
          </div>
        </section>
        <section className="claim-rules" aria-label="The rules">
          <span><Icon name="heart" size={20} /> One per wallet</span>
          <span><Icon name="flame" size={20} /> Open until they run out. Every Emogotchi left over is burned forever</span>
        </section>
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(w) => { setWallet(w); setModal(false); }} />
    </div>
  );
}
