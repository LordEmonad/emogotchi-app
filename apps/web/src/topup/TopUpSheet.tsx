/**
 * "Add MON from another chain" (CROSSCHAIN.md): the sheet. A lazy chunk, opened by TopUpRoot on a shortfall or from the
 * wallet menu. Everything stays on Monad: this only puts MON in the player's own Monad wallet, bought with ETH, BNB,
 * USDC or USDT they hold on another chain, through Relay. Then they press what they pressed before, as always.
 *
 * Two ways in:
 * - wallet: the connected wallet switches to the other chain and signs Relay's deposit there (and, for a token, an
 *   approval of exactly that amount first), then switches back to Monad. MetaMask, Rabby, WalletConnect...
 * - address: an address to send the coin to, from anywhere (another wallet, an exchange). For passkey accounts, whose
 *   key signs on Monad only, and for anyone whose wallet cannot do the other chain here.
 *
 * What gets signed is only what THIS page's check of Relay's answer returns (shared.ts: the Worker's own checker, run
 * again here on Relay's raw quote): a payment into Relay's depository for an order that pays this wallet on Monad and
 * refunds this wallet, or an address that can only sweep into that order. The Worker checked it first; this page does
 * not take its word for it.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { createPublicClient, createWalletClient, custom, defineChain, formatUnits, parseEther, type Chain, type EIP1193Provider } from 'viem';
import { encode } from 'uqr';
import { chainCfg, chainClient } from '../game/chain';
import { ensureChain, getProvider, walletKind, wcApprovedChains } from '../wallet';
import { setTopupAway } from './flag';
import { getBalances, getQuote, getStatus, type Balances, type Quote, type Status } from './api';
import { MAX_MON, MIN_MON, NATIVE, ORIGINS, TopupRefused, checkQuote, isStable, type Checked, type Origin, type OriginToken } from './shared';
import type { TopupAsk } from './TopUpRoot';
import './topup.css';

type Mode = 'wallet' | 'address';
type Opt = { chain: Origin; token: OriginToken; balance: bigint | null; usd: number | null; contract: boolean; unread: boolean };
type Shown = { q: Quote; c: Checked; at: number; key: string; amount: number };
type Phase = 'form' | 'switch' | 'approve' | 'deposit' | 'back' | 'address' | 'bridge' | 'done' | 'refund' | 'failed';

/** Cheapest routes first: the L2s, then the rest, Ethereum last (its own gas is the dear part). */
const PREF = [8453, 42161, 10, 4663, 56, 137, 1];
const PRESETS = [50, 250, 1000];
const keyOf = (o: { chain: Origin; token: OriginToken }) => `${o.chain.id}:${o.token.address}`;
const monFmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const usdFmt = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString('en-US')}`;
/** A token amount for people: rounded UP (an address is paid at least what the order asks; a little over comes back). */
function tokenAmount(raw: bigint, t: OriginToken): string {
  const places = isStable(t.symbol) ? Math.min(t.decimals, 4) : 6;
  const unit = 10n ** BigInt(t.decimals - places);
  const up = ((raw + unit - 1n) / unit) * unit;
  return formatUnits(up, t.decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
const viemChain = (o: Origin): Chain => defineChain({
  id: o.id, name: o.name, nativeCurrency: o.native,
  rpcUrls: { default: { http: [o.walletRpc] } },
  blockExplorers: { default: { name: o.name, url: o.explorer } },
});
const monad = () => chainCfg ? ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer) : Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Qr({ text }: { text: string }) {
  const { d, size } = useMemo(() => {
    const q = encode(text, { border: 2, ecc: 'M' });
    let path = '';
    q.data.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x} ${y}h1v1h-1z`; }));
    return { d: path, size: q.size };
  }, [text]);
  return <svg className="tu-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code of ${text}`} shapeRendering="crispEdges"><rect width={size} height={size} fill="#F8F8FF" /><path d={d} fill="#1A1620" /></svg>;
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="tu-copy" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}>{done ? 'Copied' : label}</button>;
}

export default function TopUpSheet({ ask, onClose }: { ask: TopupAsk; onClose: () => void }) {
  const player = (chainClient?.address ?? '').toLowerCase();
  const kind = walletKind();
  const sf = ask.shortfall;
  // a passkey account signs on Monad only: it is paid through an address. So is a WalletConnect wallet whose session
  // was not made with the other chains in it (wallet mode checks per chain, below).
  const [mode, setMode] = useState<Mode>(kind === 'passkey' ? 'address' : 'wallet');
  const walletOk = kind === 'injected' || kind === 'walletconnect';

  // the amount: what the shortfall needs, rounded up to 50, never under the minimum
  const initial = useMemo(() => {
    if (!sf) return MIN_MON;
    const short = Number(formatUnits(sf.need > sf.have ? sf.need - sf.have : 0n, 18));
    return Math.min(MAX_MON, Math.max(MIN_MON, Math.ceil(short / 50) * 50));
  }, [sf]);
  const [amountText, setAmountText] = useState(String(initial));
  const amount = Number(amountText);
  const amountOk = Number.isFinite(amount) && amount >= MIN_MON && amount <= MAX_MON;

  const [bal, setBal] = useState<Balances | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  useEffect(() => {
    if (!player) return;
    let live = true;
    getBalances(player).then((b) => { if (live) setBal(b); }).catch((e) => { if (live) setBalErr((e as Error).message); });
    return () => { live = false; };
  }, [player]);

  const approved = useMemo(() => (kind === 'walletconnect' ? wcApprovedChains() : null), [kind]);
  const opts: Opt[] = useMemo(() => {
    const out: Opt[] = [];
    for (const chain of ORIGINS) {
      const cb = bal?.chains.find((c) => c.chainId === chain.id);
      for (const token of chain.tokens) {
        const tb = cb?.tokens.find((t) => t.address === token.address);
        out.push({ chain, token, balance: tb ? BigInt(tb.balance) : null, usd: tb ? tb.usd : null, contract: !!cb?.contract, unread: !!bal && (!cb || !!cb.error) });
      }
    }
    return out;
  }, [bal]);
  const estUsd = bal?.monUsd && amountOk ? amount * bal.monUsd * 1.03 + 0.1 : null;
  const usable = (o: Opt) => !o.contract && (mode === 'address' || !approved || approved.includes(o.chain.id));
  const enough = (o: Opt) => o.usd !== null && estUsd !== null && o.usd >= estUsd;
  const ranked = useMemo(() => [...opts].filter(usable).sort((a, b) => {
    if (mode === 'wallet') { const e = Number(enough(b)) - Number(enough(a)); if (e) return e; }
    return PREF.indexOf(a.chain.id) - PREF.indexOf(b.chain.id);
  }), [opts, mode, estUsd, approved]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);
  // from this wallet, only what it holds is worth a row (the rest behind "Show every coin"); from anywhere, a chain and
  // then its coins
  const [every, setEvery] = useState(false);
  // what it holds, and chains the Worker could not read just now (never shown as "none": the coin may well be there)
  const funded = ranked.filter((o) => (o.balance !== null && o.balance > 0n) || o.unread);
  // (from this wallet, nothing until its balances are known: a list of every coin that shrinks to two a second later
  // is a list that moves under the finger)
  const shownOpts = mode !== 'wallet' ? ranked : bal ? (funded.length && !every ? funded : ranked) : balErr ? ranked : [];
  useEffect(() => { if (!picked && shownOpts[0]) setPick(keyOf(shownOpts[0])); }, [shownOpts.map(keyOf).join(), picked]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = ranked.find((o) => keyOf(o) === pick) ?? null;
  const chainsShown = ORIGINS.filter((c) => ranked.some((o) => o.chain.id === c.id)).sort((a, b) => PREF.indexOf(a.id) - PREF.indexOf(b.id));
  const contractSomewhere = opts.some((o) => o.contract);

  // ---- the quote (debounced), checked here as well as by the Worker
  const [shown, setShown] = useState<Shown | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [note, setNote] = useState<string | null>(null);
  const qSeq = useRef(0);
  async function quoteNow(maxIn?: bigint): Promise<Shown> {
    if (!sel) throw new Error('Pick what to pay with.');
    const q = await getQuote({ player, chainId: sel.chain.id, currency: sel.token.address, amountMon: amount, mode });
    const c = checkQuote(q.quote, { player, originChainId: sel.chain.id, currency: sel.token.address, amountWei: parseEther(String(amount)), mode, maxIn });
    return { q, c, at: Date.now(), key: keyOf(sel), amount };
  }
  useEffect(() => {
    if (phase !== 'form') return;
    setShown(null); setQErr(null);
    if (!amountOk || !sel || !player) return;
    const seq = ++qSeq.current;
    setQuoting(true);
    const t = setTimeout(() => {
      quoteNow().then((s) => { if (seq === qSeq.current) setShown(s); })
        .catch((e) => { if (seq === qSeq.current) setQErr(e instanceof TopupRefused ? 'That price did not check out, so nothing is offered. Try again.' : (e as Error).message); })
        .finally(() => { if (seq === qSeq.current) setQuoting(false); });
    }, 450);
    return () => { clearTimeout(t); };
  }, [amountText, pick, mode, player, phase]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the price on screen: only one made for the mode, coin and amount shown now (for one frame after a switch the state
  // still holds the last one, and a press in that frame must not act on it)
  const cur = shown && sel && shown.c.mode === mode && shown.key === keyOf(sel) && shown.amount === amount ? shown : null;

  const busy = phase === 'switch' || phase === 'approve' || phase === 'deposit' || phase === 'back';
  // closing while the wallet is away (or mid-signature) is not offered; anything else may close
  const close = () => { if (!busy) onClose(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  useEffect(() => () => { setTopupAway(false); }, []);

  // ---- after the payment: follow it until the MON is on Monad (the Worker confirms the Monad receipt itself)
  const [status, setStatus] = useState<Status | null>(null);
  const following = useRef<string | null>(null);
  async function follow(requestId: string) {
    following.current = requestId;
    const started = Date.now();
    for (;;) {
      if (following.current !== requestId) return;
      try {
        const s = await getStatus(requestId);
        setStatus(s);
        if (s.state === 'success') { await sleep(1500); setPhase('done'); return; }   // Monad reads balances 3 blocks back
        if (s.state === 'refund') { setPhase('refund'); return; }
        if (s.state === 'failure') { setPhase('failed'); setNote('Relay could not complete it. If it took your coins, they are sent back to the same wallet.'); return; }
      } catch { /* keep asking */ }
      await sleep(Date.now() - started > 120_000 ? 6000 : 2500);
    }
  }
  useEffect(() => () => { following.current = null; }, []);

  // ---- wallet mode: switch, sign, switch back
  async function pay(e: MouseEvent<HTMLButtonElement>) {
    if (!e.isTrusted || !cur || !sel || busy) return;   // a script on the page cannot press this
    setNote(null);
    let fresh: Shown;
    try {
      // a fresh price, held to at most 1% over the one on screen
      const was = cur.c.amountIn;
      fresh = await quoteNow(was + was / 100n);
      if (fresh.c.mode !== 'wallet') throw new Error('wrong mode');
    } catch (err) {
      if (err instanceof TopupRefused && err.code === 'costs-more-than-shown') { setNote('The price moved. Here is the new one: press again to pay it.'); setShown(null); setPhase('form'); return; }
      setNote(err instanceof TopupRefused ? 'That price did not check out, so nothing was sent.' : (err as Error).message); return;
    }
    const provider = getProvider() as EIP1193Provider | null;
    if (!provider) { setNote('Your wallet is not connected any more. Connect it and try again.'); return; }
    const chain = viemChain(sel.chain);
    setShown(fresh);
    setTopupAway(true);
    let sentDeposit = false;
    let stage: Phase = 'switch';
    try {
      setPhase('switch');
      await ensureChain(sel.chain.id, sel.chain.name, sel.chain.walletRpc, sel.chain.explorer, sel.chain.native);
      const wc = createWalletClient({ chain, transport: custom(provider), account: player as `0x${string}` });
      const pub = createPublicClient({ chain, transport: custom(provider) });
      for (const step of fresh.c.steps) {
        stage = step.kind;
        setPhase(step.kind);
        const hash = await wc.sendTransaction({ chain, account: player as `0x${string}`, to: step.to, data: step.data, value: BigInt(step.value) });
        if (step.kind === 'deposit') sentDeposit = true;
        const rc = await pub.waitForTransactionReceipt({ hash, pollingInterval: 1500, timeout: 600_000 });
        if (rc.status !== 'success') throw new Error(step.kind === 'approve' ? 'The approval failed on chain. Nothing was paid.' : 'The payment failed on chain. Only its network fee was spent.');
      }
      setPhase('back');
      await monad().catch(() => {});
      setTopupAway(false);
      setPhase('bridge');
      void follow(fresh.c.requestId);
    } catch (err) {
      const msg = String((err as Error)?.message ?? '');
      const cancelled = /user (rejected|denied)|rejected the request|cancel/i.test(msg) || (err as { code?: number })?.code === 4001;
      await monad().catch(() => {});
      setTopupAway(false);
      if (sentDeposit) { setPhase('bridge'); void follow(fresh.c.requestId); return; }   // paid: the rest is Relay's
      setPhase('form');
      setNote(cancelled ? 'Cancelled in your wallet. Nothing was paid.' : stage === 'switch'
        ? `Your wallet did not switch to ${sel.chain.name}. Try again, or send from somewhere else (below).`
        : msg.split('\n')[0]!.slice(0, 180) || 'Something went wrong. Nothing was paid.');
    }
  }

  // ---- address mode: show where to send, then follow it
  async function showAddress(e: MouseEvent<HTMLButtonElement>) {
    if (!e.isTrusted || !cur || cur.c.mode !== 'address') return;
    setNote(null);
    setPhase('address');
    void follow(cur.c.requestId);
  }

  // the chosen option's own shortfall (wallet mode): too little of the coin, or nothing for that chain's network fee
  const selBal = sel && cur && mode === 'wallet' && sel.balance !== null ? sel.balance : null;
  const tooLittle = selBal !== null && cur ? selBal < cur.c.amountIn : false;
  const gasCoin = sel ? sel.chain.native.symbol : '';
  const noGas = useMemo(() => {
    if (!sel || mode !== 'wallet' || sel.token.address === NATIVE) return false;
    const nat = opts.find((o) => o.chain.id === sel.chain.id && o.token.address === NATIVE);
    return nat ? nat.balance === 0n : false;   // Polygon has no native entry: its note below says so
  }, [sel, mode, opts]);

  const title = phase === 'done' ? 'MON added' : 'Add MON from another chain';
  const lead = sf
    ? sf.gasOnly
      ? 'This is free to do, but Monad needs a little MON for the network fee, and this wallet has none there.'
      : `This needs about ${monFmt(Number(formatUnits(sf.need, 18)))} MON and this wallet holds ${monFmt(Number(formatUnits(sf.have, 18)))} MON on Monad.`
    : 'Pay with what you hold on another chain. It arrives as MON in this wallet on Monad, usually in seconds.';

  return createPortal(
    <div className="modal-back tu-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal tu" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {!busy && <button className="modal-x" onClick={close} aria-label="Close">✕</button>}
        </div>

        {phase === 'form' && (
          <>
            <p className="modal-sub">{lead}</p>
            {!player && <p className="tu-note" data-tone="warn">Connect a wallet first.</p>}

            <label className="send-label" htmlFor="tu-amount">How much MON</label>
            <div className="tu-amount">
              <input id="tu-amount" className="send-input tnum" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={!amountOk} />
              <span className="tu-unit">MON</span>
            </div>
            <div className="tu-presets">
              {PRESETS.map((p) => <button key={p} type="button" className={`tu-chip ${amount === p ? 'is-on' : ''}`} onClick={() => setAmountText(String(p))}>{p.toLocaleString('en-US')}</button>)}
            </div>
            {!amountOk && <p className="tu-note" data-tone="warn">From {MIN_MON} to {MAX_MON.toLocaleString('en-US')} MON at a time.</p>}

            <div className="tu-modes" role="tablist">
              {walletOk && <button role="tab" aria-selected={mode === 'wallet'} className={`tu-mode ${mode === 'wallet' ? 'is-on' : ''}`} onClick={() => { setMode('wallet'); setPicked(false); }}>From this wallet</button>}
              <button role="tab" aria-selected={mode === 'address'} className={`tu-mode ${mode === 'address' ? 'is-on' : ''}`} onClick={() => { setMode('address'); setPicked(false); }}>{walletOk ? 'Send from anywhere' : 'Send from another wallet or an exchange'}</button>
            </div>

            <label className="send-label">Pay with</label>
            {mode === 'wallet' && !bal && !balErr && <p className="tu-note">Looking at this wallet on other chains…</p>}
            {balErr && <p className="tu-note" data-tone="warn">{balErr}</p>}
            {mode === 'wallet' ? (
              <>
                <div className="tu-opts">
                  {shownOpts.map((o) => {
                    const on = keyOf(o) === pick;
                    const has = o.balance !== null ? Number(formatUnits(o.balance, o.token.decimals)) : null;
                    return (
                      <button key={keyOf(o)} type="button" className={`tu-opt ${on ? 'is-on' : ''} ${o.usd !== null && !enough(o) ? 'is-low' : ''}`} onClick={() => { setPick(keyOf(o)); setPicked(true); }} aria-pressed={on}>
                        <b>{o.token.symbol}</b><span>{o.chain.name}</span>
                        {o.unread && <small>could not check</small>}
                        {has !== null && <small className="tnum">{has > 0 ? `${has.toLocaleString('en-US', { maximumFractionDigits: isStable(o.token.symbol) ? 2 : 5 })}${o.usd ? ` · ${usdFmt(o.usd)}` : ''}` : 'none'}</small>}
                      </button>
                    );
                  })}
                </div>
                {bal && !funded.length && !ranked.some((o) => o.unread) && (
                  <p className="tu-note">This wallet holds none of these on the other chains. <button type="button" className="tu-inline" onClick={() => { setMode('address'); setPicked(false); }}>Send from anywhere instead</button></p>
                )}
                {bal && funded.length > 0 && <button type="button" className="tu-inline tu-every" onClick={() => setEvery((v) => !v)}>{every ? 'Only what this wallet holds' : 'Show every coin'}</button>}
              </>
            ) : (
              <>
                <div className="tu-chains" role="radiogroup" aria-label="Chain">
                  {chainsShown.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={sel?.chain.id === c.id} className={`tu-chip ${sel?.chain.id === c.id ? 'is-on' : ''}`}
                      onClick={() => { const first = ranked.find((o) => o.chain.id === c.id); if (first) { setPick(keyOf(first)); setPicked(true); } }}>{c.name}</button>
                  ))}
                </div>
                {sel && (
                  <div className="tu-chains tu-coins" role="radiogroup" aria-label="Coin">
                    {ranked.filter((o) => o.chain.id === sel.chain.id).map((o) => (
                      <button key={keyOf(o)} type="button" role="radio" aria-checked={keyOf(o) === pick} className={`tu-chip ${keyOf(o) === pick ? 'is-on' : ''}`} onClick={() => { setPick(keyOf(o)); setPicked(true); }}>{o.token.symbol}</button>
                    ))}
                  </div>
                )}
              </>
            )}
            {contractSomewhere && mode === 'wallet' && <p className="tu-note">Chains where this address is a smart-contract wallet are left out: MON sent to it on Monad might reach nobody.</p>}
            {approved && mode === 'wallet' && ranked.length === 0 && <p className="tu-note" data-tone="warn">Your wallet app only allowed Monad when it connected. Use "Send from anywhere", or reconnect.</p>}

            <div className="tu-quote" aria-live="polite">
              {quoting && !cur && <p className="tu-note">Getting a price…</p>}
              {qErr && <p className="tu-note" data-tone="warn">{qErr}</p>}
              {cur && sel && (
                <>
                  <div className="tu-line"><span>You pay</span><b className="tnum">{tokenAmount(cur.c.amountIn, cur.c.token)} {cur.c.token.symbol}{cur.q.amountInUsd ? <small> ≈ {usdFmt(cur.q.amountInUsd)}</small> : null}</b></div>
                  <div className="tu-line"><span>On</span><b>{sel.chain.name}</b></div>
                  <div className="tu-line"><span>You get</span><b className="tnum">{monFmt(amount)} MON <small>on Monad{cur.q.timeEstimate ? `, in about ${cur.q.timeEstimate < 60 ? `${Math.max(1, Math.round(cur.q.timeEstimate))} s` : `${Math.round(cur.q.timeEstimate / 60)} min`}` : ''}</small></b></div>
                  {tooLittle && <p className="tu-note" data-tone="warn">This wallet holds less {sel.token.symbol} than that on {sel.chain.name}.</p>}
                  {noGas && <p className="tu-note">You also need a little {gasCoin} on {sel.chain.name} for its network fee.</p>}
                  {mode === 'wallet' && sel.chain.id === 137 && <p className="tu-note">You also need a little POL on Polygon for its network fee.</p>}
                  {mode === 'wallet' && sel.token.address !== NATIVE && <p className="tu-note">Two confirmations in your wallet: allowing exactly this much {sel.token.symbol}, then paying it.</p>}
                </>
              )}
            </div>
            {note && <p className="tu-note" data-tone="warn">{note}</p>}

            {mode === 'wallet'
              ? <button className="btn btn-pink tu-go" disabled={!cur || quoting || !amountOk || tooLittle} onClick={(e) => void pay(e)}>Add {amountOk ? monFmt(amount) : ''} MON</button>
              : <button className="btn btn-pink tu-go" disabled={!cur || quoting || !amountOk} onClick={(e) => void showAddress(e)}>Show where to send it</button>}

            <details className="tu-more">
              <summary>No crypto anywhere yet?</summary>
              <p>Buy MON on <a href="https://www.coinbase.com" target="_blank" rel="noreferrer">Coinbase</a> (or any exchange that lists it) and send it to your Monad address. Pick <b>Monad</b> as the network when you send.</p>
              {player && <div className="tu-addr-row"><code className="tu-code">{player}</code><Copy text={player} label="Copy" /></div>}
            </details>
            <p className="modal-fine">Routed by <a href="https://relay.link" target="_blank" rel="noreferrer">Relay</a>. Emogotchi adds no fee.</p>
          </>
        )}

        {(phase === 'switch' || phase === 'approve' || phase === 'deposit' || phase === 'back') && sel && cur && (
          <div className="tu-steps">
            <Step on={phase === 'switch'} done={phase !== 'switch'}>Switch your wallet to {sel.chain.name}</Step>
            {cur.c.mode === 'wallet' && cur.c.steps.some((s) => s.kind === 'approve') && <Step on={phase === 'approve'} done={phase === 'deposit' || phase === 'back'}>Allow {tokenAmount(cur.c.amountIn, cur.c.token)} {cur.c.token.symbol}</Step>}
            <Step on={phase === 'deposit'} done={phase === 'back'}>Pay {tokenAmount(cur.c.amountIn, cur.c.token)} {cur.c.token.symbol}</Step>
            <Step on={phase === 'back'} done={false}>Back to Monad</Step>
            <p className="tu-note">Confirm in your wallet.</p>
          </div>
        )}

        {phase === 'address' && cur && cur.c.mode === 'address' && sel && (
          <div className="tu-address">
            <p className="modal-sub">Send <b className="tnum">{tokenAmount(cur.c.amountIn, cur.c.token)} {cur.c.token.symbol}</b> on <b>{sel.chain.name}</b> to this address. {monFmt(amount)} MON arrives in your wallet on Monad soon after.</p>
            <Qr text={cur.c.depositAddress} />
            <div className="tu-addr-row"><code className="tu-code">{cur.c.depositAddress}</code><Copy text={cur.c.depositAddress} label="Copy address" /></div>
            <div className="tu-addr-row"><span className="tnum">{tokenAmount(cur.c.amountIn, cur.c.token)} {cur.c.token.symbol}</span><Copy text={tokenAmount(cur.c.amountIn, cur.c.token)} label="Copy amount" /></div>
            <ul className="tu-points">
              <li>Only <b>{cur.c.token.symbol}</b>, and only on <b>{sel.chain.name}</b>. Any other coin or network does not arrive.</li>
              <li>This address is for this one payment. Send it once.</li>
              <li>Sending from an exchange? Make sure at least this much arrives: some take their fee out of it. Anything over, or a payment that cannot go through, is sent back to your own address on {sel.chain.name} (the same address as this wallet).</li>
            </ul>
            <StatusLine s={status} coin={cur.c.token.symbol} chain={sel.chain.name} />
            <button type="button" className="tu-link" onClick={() => { following.current = null; setPhase('form'); setStatus(null); }}>Change the amount or coin</button>
          </div>
        )}

        {phase === 'bridge' && (
          <div className="tu-steps">
            <p className="modal-sub">Paid. Your MON is on its way to Monad.</p>
            <StatusLine s={status} coin={cur?.c.token.symbol ?? ''} chain={sel?.chain.name ?? ''} />
            <p className="tu-note">You can close this: it arrives by itself.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="tu-done">
            <p className="modal-sub"><b className="tnum">{monFmt(amount)} MON</b> is in your wallet on Monad.{sf ? ' Now press it again.' : ''}</p>
            <button className="btn btn-pink tu-go" onClick={onClose}>{sf ? 'Back to it' : 'Done'}</button>
          </div>
        )}

        {phase === 'refund' && (
          <div className="tu-done">
            <p className="modal-sub">It could not go through, so it was sent back to your own address on {sel?.chain.name ?? 'that chain'}.</p>
            <button className="btn tu-go" onClick={() => { setPhase('form'); setStatus(null); }}>Try again</button>
          </div>
        )}

        {phase === 'failed' && (
          <div className="tu-done">
            <p className="modal-sub">{note ?? 'It did not go through.'}</p>
            <button className="btn tu-go" onClick={() => { setPhase('form'); setStatus(null); setNote(null); }}>Try again</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Step({ on, done, children }: { on: boolean; done: boolean; children: React.ReactNode }) {
  return <div className={`tu-step ${on ? 'is-on' : ''} ${done ? 'is-done' : ''}`}><span className="tu-dot" aria-hidden="true">{done ? '✓' : ''}</span>{children}</div>;
}

function StatusLine({ s, coin, chain }: { s: Status | null; coin: string; chain: string }) {
  const text = !s || s.state === 'waiting' || s.state === 'unknown' ? `Waiting for your ${coin} on ${chain}…`
    : s.state === 'success' ? 'Arrived.'
    : 'Got it. Sending your MON to Monad…';
  return <p className="tu-status" aria-live="polite"><span className="tu-spin" aria-hidden="true" />{text}</p>;
}
