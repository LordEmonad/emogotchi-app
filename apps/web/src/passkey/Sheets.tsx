/**
 * What the person sees of a passkey account: making or opening one, confirming a transaction, signing a message, and
 * the account screen (receive, send MON, send a pet, the recovery phrase, lock, forget). Loaded only when one is needed.
 *
 * Rule of this file: every passkey prompt starts inside the click that asked for it. Browsers only allow a WebAuthn
 * ceremony from a fresh user gesture, so the key module is imported statically here (it is already in memory by the time
 * a button exists) and the handlers call it before any other await.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { encode } from 'uqr';
import { formatEther, getAddress, isAddress, parseEther, type Hex } from 'viem';
import type { CatView } from '@emo-pets/chain';
import * as Account from './account';
import { refuse, settle, UserRejected, type Address, type Pending, type Quote, type SignAsk, type TxAsk } from './bus';
import { refuseAddress } from '../send';
import { cfg } from './config';
import { askAlways, balanceOf, emoBalanceOf, forget, isUnlocked, loadAccount, lock, passkeyProvider, quote, remember, remembered, setAskAlways, SILENT_FEE_CAP, SILENT_SESSION_CAP, subscribeLock, type Remembered } from './provider';
import { passkeySupport } from './support';
import { chainClient, chainStore } from '../game/chain';
import { PETS } from '../pets';

const MERA = 'https://mera.category.xyz';
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** MON with up to `dp` decimals, never rounded up (a balance must not look bigger than it is). */
function mon(wei: bigint, dp = 4): string {
  const [i, f = ''] = formatEther(wei).split('.');
  const cut = f.slice(0, dp).replace(/0+$/, '');
  if (wei > 0n && i === '0' && cut === '') return `<0.${'0'.repeat(dp - 1)}1`;
  return `${Number(i).toLocaleString('en-US')}${cut ? `.${cut}` : ''}`;
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 400);

function useSettled<T>(p: Promise<T>): { value: T | null; error: string | null } {
  const [s, set] = useState<{ value: T | null; error: string | null }>({ value: null, error: null });
  useEffect(() => {
    let on = true;
    p.then((value) => { if (on) set({ value, error: null }); }, (e) => { if (on) set({ value: null, error: message(e) }); });
    return () => { on = false; };
  }, [p]);
  return s;
}

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="pk-copy" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}>{done ? 'Copied' : label}</button>;
}

/**
 * Every exit stays live, always. An earlier version disabled Escape, the backdrop and the X while a passkey prompt
 * was in flight; if that prompt never came back (a call arriving mid-Face ID, an authenticator that hangs) the sheet
 * became a full-screen blocker over the whole site that only a reload could clear. Cancelling late is harmless —
 * settling an already-refused request is a no-op — so the sheets can afford to always let go.
 */
function Shell({ title, top, onClose, children }: { title: string; top: boolean; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (top) box.current?.focus(); }, [top]);
  useEffect(() => {
    if (!top) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [top, onClose]);
  return (
    <div className="modal-back pk-back" style={top ? undefined : { display: 'none' }} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pk-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={box}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Only a real press signs a sheet. While the account is unlocked a passkey prompt is not shown again, so without this a
 * script could open a sheet and call .click() on the button: signed, with nothing on screen long enough to read. A
 * synthetic event carries no user activation and is refused here. (When locked, the browser enforces the same thing
 * itself: a ceremony without a real gesture is rejected by the platform.)
 * What this does NOT stop: a script running on this origin can load the key module itself and ask it to sign while
 * the account is unlocked, sheet or no sheet. That is the realm risk of an in-page wallet (see CLAUDE.md, "What the
 * custody audit settled"); the defences against it are the CSP and running as little third-party code here as possible.
 */
const pressed = (e: MouseEvent<HTMLElement>) => e.isTrusted;

const Credit = () => <p className="modal-fine">Passkey accounts are built on <a href={MERA} target="_blank" rel="noreferrer">mera</a>, the open passkey library by Category Labs.</p>;

function Qr({ text }: { text: string }) {
  const { d, size } = useMemo(() => {
    const q = encode(text, { border: 2, ecc: 'M' });
    let path = '';
    q.data.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x} ${y}h1v1h-1z`; }));
    return { d: path, size: q.size };
  }, [text]);
  return <svg className="pk-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code of ${text}`} shapeRendering="crispEdges"><rect width={size} height={size} fill="#F8F8FF" /><path d={d} fill="#1A1620" /></svg>;
}

/**
 * "How do I get MON?" — plain instructions, folded away until asked for. Nothing is integrated here on purpose:
 * no onramp widget, no SDK, no third-party script. This origin holds account keys, so the one thing this must
 * never become is a place that loads someone else's JavaScript.
 *
 * The lead is how LITTLE is needed. Somebody who has never bought crypto assumes this is a hundred-dollar
 * decision; it is about a dollar, and saying so early is what stops them closing the tab. The network warning
 * earns its place because sending on the wrong one is the single most common way a beginner loses money, and it
 * is unrecoverable.
 */
function GetMon() {
  const [open, setOpen] = useState(false);
  return (
    <div className="pk-getmon">
      <button type="button" className="pk-disclose" onClick={() => setOpen(!open)} aria-expanded={open}>
        How do I get MON? <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {/* The claim is scoped to the frok and deliberately says "thousands" rather than a number. A frok's care
              is free — gas only, ~0.012 MON, about a third of a cent — so a dollar really is ~3,200 actions at
              today's price. A hard figure would be wrong the moment MON moved; "thousands" survives a 3x. The
              cat is called out separately because its care is 1 MON each, i.e. ~40 actions to the dollar. */}
          <p className="pk-note">You need very little. A frok is free to play — you only pay gas, a fraction of a cent, so <b>a dollar of MON is thousands of actions</b>. (A cat's care costs 1 MON each on top of that.)</p>
          <ul className="pk-points">
            <li><b>Coinbase</b> — the easy one if you're new. Get the app, or use <a href="https://www.coinbase.com" target="_blank" rel="noreferrer">coinbase.com</a>. Buy MON with a card or bank, then send it to the address above.</li>
            <li><b>Any exchange you already use</b> — Binance, Kraken, OKX and friends. Buy MON, then withdraw it to the address above.</li>
            <li><b>Already hold crypto elsewhere?</b> <a href="https://www.gas.zip" target="_blank" rel="noreferrer">gas.zip</a> turns a couple of dollars from almost any chain into MON in one step.</li>
          </ul>
          <p className="pk-note" data-tone="warn">Whichever you use, pick <b>Monad</b> as the network when you send. MON sent on a different network does not arrive and cannot be recovered.</p>
        </>
      )}
    </div>
  );
}

// ================================================================= make or open an account
function Onboard({ p, top }: { p: Pending; top: boolean }) {
  const [step, setStep] = useState<'choose' | 'warn' | 'made'>('choose');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<null | 'create' | 'open'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<Remembered | null>(null);
  const support = useMemo(passkeySupport, []);
  useEffect(() => { void loadAccount().catch(() => {}); }, []); // registers the lock mirror; the module itself is already here

  const run = (e: MouseEvent<HTMLButtonElement>, what: 'create' | 'open') => {
    if (!pressed(e) || busy) return;
    setBusy(what); setErr(null);
    // no await before this line: the ceremony must start inside the click
    const job = what === 'create' ? Account.create() : Account.signIn();
    job.then((r) => { remember(r); if (what === 'create') { setMade(r); setStep('made'); } else settle(p.id, r); },
      (e) => { setErr(e instanceof UserRejected ? e.message : message(e)); })
      .finally(() => setBusy(null));
  };
  const close = () => { if (made) settle(p.id, made); else refuse(p.id); };

  return (
    <Shell title={step === 'made' ? 'Your account is ready' : 'Passkey account'} top={top} onClose={close}>
      {step === 'choose' && (
        <>
          <p className="modal-sub">An account that lives behind your Face ID, fingerprint or password manager. Nothing to install and no seed phrase to write down before you start. It works on this site, on Monad.</p>
          {support.why && <p className="pk-note" data-tone="warn">{support.why}</p>}
          <div className="wallet-list">
            <button className="wallet-opt" onClick={() => { setErr(null); setStep('warn'); }} disabled={busy !== null}>
              <span className="wallet-opt-ico" aria-hidden>✨</span>
              <span className="wallet-opt-text"><b>Create an account</b><small>Makes a new passkey and a new, empty account</small></span>
              <span className="wallet-opt-go">→</span>
            </button>
            <button className="wallet-opt" onClick={(e) => run(e, 'open')} disabled={busy !== null}>
              <span className="wallet-opt-ico" aria-hidden>🔑</span>
              <span className="wallet-opt-text"><b>I already have one</b><small>{busy === 'open' ? 'Waiting for your passkey…' : 'Open it with the passkey you made before'}</small></span>
              <span className="wallet-opt-go">{busy === 'open' ? '…' : '→'}</span>
            </button>
          </div>
        </>
      )}
      {step === 'warn' && (
        <>
          <p className="modal-sub">Two things, then you're in.</p>
          <ul className="pk-points">
            <li><b>Your passkey opens it.</b> Saved wherever your passkeys live — iCloud Keychain, Google Password Manager, 1Password.</li>
            <li><b>Back it up after.</b> Account → Recovery phrase gives you 24 words. They open the same account in any wallet, and they're your way in if the passkey ever goes.</li>
          </ul>
          <label className="pk-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>Got it — no passkey and no 24 words means no account.</span></label>
          <div className="pk-actions">
            <button className="btn btn-ghost" onClick={() => { setErr(null); setStep('choose'); }} disabled={busy !== null}>Back</button>
            <button className="btn btn-pink" onClick={(e) => run(e, 'create')} disabled={!agree || busy !== null}>{busy === 'create' ? 'Waiting for your passkey…' : 'Create with passkey'}</button>
          </div>
        </>
      )}
      {step === 'made' && made && (
        <>
          {/* The starter (passkey/starter.ts) fires on the first action, so do NOT tell them to fund it before
              they can play — that was true before the drip and is the first thing a new player would read.
              Worded so it still reads correctly if the starter is switched off or has run dry: they press a
              button either way, and the address is right here when they need to top up. */}
          <p className="modal-sub">Your first few actions are on us — just press a button and go. To add more later, send MON on Monad to this address:</p>
          <div className="pk-receive">
            <Qr text={made.address} />
            <div className="pk-addr tnum">{made.address}</div>
            <Copy text={made.address} label="Copy address" />
          </div>
          <GetMon />
          <p className="pk-note">Next, open <b>Account</b> from the menu at the top right and write down your recovery phrase.</p>
          <div className="pk-actions"><button className="btn btn-pink" onClick={close}>Done</button></div>
        </>
      )}
      {err && <p className="modal-err" role="alert">{err}</p>}
      <Credit />
    </Shell>
  );
}

/**
 * Whether the button will actually ask for a passkey, read live. Taking this from a snapshot made when the request
 * was posted went stale in both directions: a sheet confirmed on top could have unlocked the account, leaving this one
 * still promising a prompt that would not come — and a button that says "with passkey" and then silently signs is
 * exactly the habit a confirmation screen must not teach.
 */
function useLocked(): boolean {
  const [open, setOpen] = useState(isUnlocked);
  useEffect(() => subscribeLock(() => setOpen(isUnlocked())), []);
  return !open;
}

// ================================================================= confirm a transaction
function Row({ k, children }: { k: string; children: ReactNode }) { return <div className="pk-row"><span>{k}</span><span className="tnum">{children}</span></div>; }

function Tx({ p, top }: { p: Pending<TxAsk>; top: boolean }) {
  const a = p.ask; const s = a.summary;
  const bal = useSettled(a.balance); const q = useSettled<Quote>(a.quote);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const locked = useLocked();
  const need = q.value ? q.value.fee + s.value : null;
  const short_ = bal.value !== null && need !== null && bal.value < need;
  const ready = bal.value !== null && q.value !== null && !short_ && (!s.danger || ack);
  const confirm = (e: MouseEvent<HTMLButtonElement>) => {
    if (!pressed(e) || busy || !ready) return;
    setBusy(true); setErr(null);
    // the ceremony starts inside this click; unlock() returns at once when the account is already open
    a.unlock().then(() => settle(p.id), (er) => { setErr(message(er)); setBusy(false); });
  };
  // a ceremony that lands after the person gave up must not leave the account open behind a sheet nobody is watching
  const cancel = () => { if (busy) void lock(); refuse(p.id); };
  return (
    <Shell title={s.danger ? 'Check this carefully' : 'Confirm'} top={top} onClose={cancel}>
      <div className="pk-tx" data-risk={s.danger ? 'danger' : s.risk}>
        <div className="pk-tx-title">{s.title}</div>
        {s.detail.filter(Boolean).map((d, i) => <div className="pk-tx-line" key={i}>{d}</div>)}
      </div>
      <div className="pk-rows">
        <Row k="From">{short(a.from)}</Row>
        <Row k="To">{s.contract}</Row>
        {s.value > 0n && <Row k="Amount">{mon(s.value, 6)} MON</Row>}
        <Row k="Network fee, at most">{q.value ? `${mon(q.value.fee, 5)} MON` : q.error ? 'unknown' : '…'}</Row>
        <Row k="Balance after, at least">{bal.value !== null && need !== null ? (short_ ? 'not enough' : `${mon(bal.value - need)} MON`) : bal.error ? 'unknown' : '…'}</Row>
      </div>
      {q.error && <p className="pk-note" data-tone="bad">This cannot be sent right now: {q.error}</p>}
      {bal.error && !q.error && <p className="pk-note" data-tone="bad">The balance could not be read. Check your connection and try again.</p>}
      {short_ && bal.value !== null && need !== null && (
        <div className="pk-note" data-tone="bad">
          Not enough MON. This needs {mon(need, 5)} and the account holds {mon(bal.value, 5)}. Send MON on Monad to:
          <div className="pk-addr tnum">{a.from}</div><Copy text={a.from} label="Copy address" />
        </div>
      )}
      {short_ && bal.value !== null && need !== null && <GetMon />}
      {s.danger && <label className="pk-check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I know exactly what this does and I want to sign it.</span></label>}
      {err && <p className="modal-err" role="alert">{err}</p>}
      <div className="pk-actions">
        <button className="btn btn-ghost" onClick={cancel}>Cancel</button>
        <button className="btn btn-pink" onClick={confirm} disabled={!ready || busy}>{busy ? (locked ? 'Waiting for your passkey…' : 'Signing…') : locked ? 'Confirm with passkey' : 'Confirm'}</button>
      </div>
      <p className="modal-fine">Monad charges the full gas limit, so the fee shown is what is paid.</p>
    </Shell>
  );
}

// ================================================================= sign a message
function Sign({ p, top }: { p: Pending<SignAsk>; top: boolean }) {
  const a = p.ask;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const locked = useLocked();
  const confirm = (e: MouseEvent<HTMLButtonElement>) => {
    if (!pressed(e) || busy) return;
    setBusy(true); setErr(null);
    a.unlock().then(() => settle(p.id), (er) => { setErr(message(er)); setBusy(false); });
  };
  const cancel = () => { if (busy) void lock(); refuse(p.id); };
  return (
    <Shell title="Sign in to Emotown" top={top} onClose={cancel}>
      <p className="modal-sub">This proves the account is yours, so you can talk in Emotown. It is not a transaction: it is free and it cannot move anything. This is the whole message:</p>
      <pre className="pk-msg" translate="no">{a.text}</pre>
      <div className="pk-rows"><Row k="Account">{short(a.from)}</Row><Row k="Length">{a.bytes.toLocaleString('en-US')} bytes</Row></div>
      {err && <p className="modal-err" role="alert">{err}</p>}
      <div className="pk-actions">
        <button className="btn btn-ghost" onClick={cancel}>Cancel</button>
        <button className="btn btn-pink" onClick={confirm} disabled={busy}>{busy ? 'Waiting…' : locked ? 'Sign in with passkey' : 'Sign in'}</button>
      </div>
    </Shell>
  );
}

// ================================================================= the account screen
type Tab = 'receive' | 'send' | 'pets' | 'backup' | 'settings';

/** Is this address a contract? A wallet that delegates (EIP-7702, code 0xef0100…) is still a wallet. */
async function isContract(a: Address): Promise<boolean | null> {
  try {
    const code = (await passkeyProvider.request({ method: 'eth_getCode', params: [a, 'latest'] })) as string;
    return !!code && code !== '0x' && !code.toLowerCase().startsWith('0xef0100');
  } catch { return null; } // could not tell: the caller must treat that as "maybe", never as "no"
}

/**
 * Where it is going. The "is this a contract?" answer arrives over the network, so it is a state of its own rather
 * than a boolean: until it lands, Send stays disabled, and a lookup that FAILS counts as a contract, not as a wallet.
 * (It was the other way round at first: the button was live during the round trip and an RPC hiccup read as "safe",
 * so a fast paste-and-tap could send a pet to a contract with no warning at all — and a pet sent there is gone.)
 */
type Kind = 'empty' | 'bad' | 'self' | 'refused' | 'checking' | 'wallet' | 'contract' | 'unknown';
/** `pets`: the recipient of a pet, which also refuses the black holes and the game's own contracts (MON may still go to
 *  the game: an amount sent to it is an instruction, the N.d care protocol, and the sheet says what it will do) */
function useRecipient(self: Address, pets = false) {
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<Kind>('empty');
  const [ack, setAck] = useState(false);
  const clean = to.trim();
  useEffect(() => {
    setAck(false);
    if (clean === '') { setKind('empty'); return; }
    if (!isAddress(clean)) { setKind('bad'); return; }
    if (clean.toLowerCase() === self.toLowerCase()) { setKind('self'); return; }
    // the black holes and the game's own contracts: never a place to send anything (send.ts, the site's Send sheet too)
    if (pets && refuseAddress(getAddress(clean), self)) { setKind('refused'); return; }
    setKind('checking');
    let on = true;
    void isContract(clean as Address).then((c) => { if (on) setKind(c === null ? 'unknown' : c ? 'contract' : 'wallet'); });
    return () => { on = false; };
  }, [clean, self, pets]);
  const problem = kind === 'bad' ? 'That is not an address. Check every character.' : kind === 'self' ? 'That is this account.' : kind === 'refused' ? refuseAddress(getAddress(clean), self) : null;
  return { to: clean, setTo, raw: to, kind, ack, setAck, problem, ok: kind === 'wallet' || ((kind === 'contract' || kind === 'unknown') && ack) };
}

function Recipient({ r, what }: { r: ReturnType<typeof useRecipient>; what: string }) {
  return (
    <>
      <label className="pk-field"><span>To</span><input value={r.raw} onChange={(e) => r.setTo(e.target.value)} placeholder="0x…" spellCheck={false} autoCapitalize="off" autoCorrect="off" inputMode="text" /></label>
      {r.problem && <p className="pk-note" data-tone="bad">{r.problem}</p>}
      {r.kind === 'checking' && <p className="pk-note">Checking that address…</p>}
      {r.kind === 'contract' && <label className="pk-check" data-tone="warn"><input type="checkbox" checked={r.ack} onChange={(e) => r.setAck(e.target.checked)} /><span>That address is a contract, not a wallet. {what} sent to a contract that cannot hand it back is lost for good. I checked it.</span></label>}
      {r.kind === 'unknown' && <label className="pk-check" data-tone="warn"><input type="checkbox" checked={r.ack} onChange={(e) => r.setAck(e.target.checked)} /><span>That address could not be checked just now, so this might be a contract rather than a wallet. I know it is right.</span></label>}
    </>
  );
}

function SendMon({ r, balance, onSent }: { r: Remembered; balance: bigint | null; onSent: () => void }) {
  const rec = useRecipient(r.address);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string; hash?: Hex } | null>(null);
  let value: bigint | null = null;
  try { value = amount.trim() === '' ? null : parseEther(amount.trim() as `${number}`); } catch { value = null; }
  const tooMuch = value !== null && balance !== null && value > balance;
  const ok = rec.ok && value !== null && value > 0n && !tooMuch && !busy;
  const max = async () => {
    if (balance === null) return;
    try {
      const { fee } = await quote(r.address, { to: (rec.kind === 'wallet' ? rec.to : r.address) as Address, value: 1n });
      setAmount(balance > fee ? formatEther(balance - fee) : '0');
    } catch { setAmount(formatEther(balance)); }
  };
  const send = () => {
    if (!ok || value === null) return;
    setBusy(true); setNote(null);
    passkeyProvider.request({ method: 'eth_sendTransaction', params: [{ from: r.address, to: getAddress(rec.to), value: `0x${value.toString(16)}` }] })
      .then((h) => { setNote({ tone: 'ok', text: 'Sent.', hash: h as Hex }); setAmount(''); onSent(); },
        (e) => { if (!(e instanceof UserRejected) && (e as { code?: number }).code !== 4001) setNote({ tone: 'bad', text: /insufficient|reserve/i.test(message(e)) ? 'Not enough MON for that and its fee. Monad may also hold back a reserve while another transaction is on its way; wait a moment and try again.' : message(e) }); })
      .finally(() => setBusy(false));
  };
  return (
    <div className="pk-pane">
      <Recipient r={rec} what="MON" />
      <label className="pk-field"><span>Amount</span>
        <span className="pk-amount"><input value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} placeholder="0.0" inputMode="decimal" /><em>MON</em><button type="button" className="pk-copy" onClick={() => void max()} disabled={balance === null}>Max</button></span>
      </label>
      {amount.trim() !== '' && value === null && <p className="pk-note" data-tone="bad">That is not an amount.</p>}
      {tooMuch && <p className="pk-note" data-tone="bad">The account holds {balance !== null ? mon(balance, 5) : '…'} MON.</p>}
      {note && <p className="pk-note" data-tone={note.tone}>{note.text} {note.hash && cfg?.explorer && <a href={`${cfg.explorer}/tx/${note.hash}`} target="_blank" rel="noreferrer">See it on chain ↗</a>}</p>}
      <div className="pk-actions"><button className="btn btn-pink" onClick={send} disabled={!ok}>{busy ? 'Waiting…' : 'Review'}</button></div>
    </div>
  );
}

const petLabel = (c: CatView) => `${c.col === 'cat' ? 'Emogotchi' : PETS[c.col].one} #${c.id}${c.name ? ` · ${c.name}` : ''}`;

function SendPet({ r }: { r: Remembered }) {
  const rec = useRecipient(r.address, true);
  const [pets, setPets] = useState<CatView[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const load = () => { if (!chainClient) { setPets([]); return; } void chainClient.petsOf(r.address).then(setPets, () => setPets([])); };
  useEffect(load, [r.address]);
  const chosen = pets?.find((c) => `${c.col}:${c.id}` === pick) ?? null;
  const ok = rec.ok && chosen !== null && !busy;
  const send = () => {
    if (!ok || !chosen || !chainClient) return;
    setBusy(true); setNote(null);
    const me = chainClient.signerInfo;
    if (!me || me.address.toLowerCase() !== r.address.toLowerCase()) chainClient.setSigner({ provider: passkeyProvider as never, address: r.address });
    chainClient.transfer(chosen.id, getAddress(rec.to), chosen.col)
      .then(() => { setNote({ tone: 'ok', text: `${petLabel(chosen)} is on its way to ${short(rec.to)}.` }); setPick(''); load(); void chainStore?.refresh(); },
        (e) => { if (!/cancelled|rejected/i.test(message(e))) setNote({ tone: 'bad', text: message(e) }); })
      .finally(() => setBusy(false));
  };
  return (
    <div className="pk-pane">
      {pets === null ? <p className="pk-note">Looking for your pets…</p> : pets.length === 0 ? <p className="pk-note">This account holds no pets.</p> : (
        <>
          <label className="pk-field"><span>Pet</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a pet</option>
              {pets.map((c) => <option key={`${c.col}:${c.id}`} value={`${c.col}:${c.id}`}>{petLabel(c)}</option>)}
            </select>
          </label>
          <Recipient r={rec} what="A pet" />
          <p className="pk-note">The pet leaves with its name, its streak and its whole record.</p>
          {note && <p className="pk-note" data-tone={note.tone}>{note.text}</p>}
          <div className="pk-actions"><button className="btn btn-pink" onClick={send} disabled={!ok}>{busy ? 'Waiting…' : 'Review'}</button></div>
        </>
      )}
      {pets !== null && pets.length === 0 && note && <p className="pk-note" data-tone={note.tone}>{note.text}</p>}
    </div>
  );
}

function Backup({ r, visible }: { r: Remembered; visible: boolean }) {
  const [words, setWords] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hide = () => setWords(null);
  // The phrase leaves the screen by itself, on every signal there is: a two-minute timer, the tab being hidden, the
  // window losing focus (which `visibilitychange` does NOT cover — a tab merely covered by a screen-sharing or
  // screenshot window stays "visible"), the page being put away, and another sheet opening on top of this one.
  useEffect(() => {
    if (!words) return;
    const t = setTimeout(hide, 120_000);
    const vis = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', hide);
    window.addEventListener('pagehide', hide);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', hide); window.removeEventListener('pagehide', hide); };
  }, [words]);
  useEffect(() => { if (!visible) hide(); }, [visible]);
  const show = () => {
    if (busy) return;
    setBusy(true); setErr(null);
    Account.revealPhrase(r).then((ph) => setWords(ph.split(' ')), (e) => setErr(message(e))).finally(() => setBusy(false));
  };
  return (
    <div className="pk-pane">
      {!words ? (
        <>
          <ul className="pk-points">
            <li><b>These 24 words are the account.</b> Anyone who sees them can take everything in it, and nobody can take it back.</li>
            <li><b>Write them on paper.</b> Not a screenshot, not a note on your phone, not a message to yourself.</li>
            <li><b>Nobody from Emonad will ever ask for them.</b> Anyone who does is robbing you.</li>
          </ul>
          <p className="pk-note">They import into MetaMask, Rabby or any other wallet as a 24-word phrase and open this same address. That is how you leave, or get back in if the passkey is ever lost.</p>
          {err && <p className="modal-err" role="alert">{err}</p>}
          <div className="pk-actions"><button className="btn btn-pink" onClick={show} disabled={busy}>{busy ? 'Waiting for your passkey…' : 'Show with passkey'}</button></div>
        </>
      ) : (
        <>
          {/* translate="no": browser page-translation reads rendered text and POSTs it to a remote service, and these
            are ordinary English words, so a phone set to auto-translate would quietly send the phrase to Google */}
        <ol className="pk-words tnum" translate="no" lang="en">{words.map((w, i) => <li key={i}><span>{i + 1}</span>{w}</li>)}</ol>
          <p className="pk-note" data-tone="warn">Make sure nobody is looking and nothing is recording your screen. This hides itself in two minutes.</p>
          <div className="pk-actions"><Copy text={words.join(' ')} label="Copy (clipboards are not private)" /><button className="btn btn-pink" onClick={hide}>Hide</button></div>
        </>
      )}
    </div>
  );
}

function Settings({ unlocked, onForgot }: { unlocked: boolean; onForgot: () => void }) {
  const [always, setAlways] = useState(askAlways);
  const [sure, setSure] = useState(false);
  return (
    <div className="pk-pane">
      <label className="pk-check"><input type="checkbox" checked={always} onChange={(e) => { setAskAlways(e.target.checked); setAlways(e.target.checked); }} /><span><b>Ask before every transaction.</b> Off, free and harmless actions (petting, dressing a pet, a frok's care) go through without a sheet while the account is unlocked. Anything that moves MON, a pet or an item always asks — and so does anything whose network fee would come to more than {mon(SILENT_FEE_CAP)} MON, or more than {mon(SILENT_SESSION_CAP)} MON in total since you unlocked.</span></label>
      <div className="pk-setting">
        <div><b>{unlocked ? 'Unlocked' : 'Locked'}</b><small>{unlocked ? 'Locks by itself after 15 minutes without a transaction, and whenever the page is closed or reloaded.' : 'The next transaction asks for your passkey.'}</small></div>
        <button className="btn btn-ghost btn-sm" onClick={() => void lock()} disabled={!unlocked}>Lock now</button>
      </div>
      <div className="pk-setting">
        <div><b>Forget on this device</b><small>Removes the account from this browser only. The passkey stays where it is saved; open the account again any time with “I already have one”.</small></div>
        {!sure ? <button className="btn btn-ghost btn-sm" onClick={() => setSure(true)}>Forget</button>
          : <button className="btn btn-pink btn-sm" onClick={() => { void forget().then(onForgot); }}>Yes, forget it</button>}
      </div>
    </div>
  );
}

function AccountSheet({ p, top }: { p: Pending; top: boolean }) {
  const r = useMemo(remembered, []);
  const [tab, setTab] = useState<Tab>('receive');
  const [balance, setBalance] = useState<bigint | null>(null);
  const [emo, setEmo] = useState<bigint | null>(null);
  const [unlocked, setUnlocked] = useState(isUnlocked);
  useEffect(() => subscribeLock(() => setUnlocked(isUnlocked())), []);
  useEffect(() => { void loadAccount().then(() => setUnlocked(isUnlocked()), () => {}); }, []);
  const read = () => { if (r) { void balanceOf(r.address).then(setBalance, () => {}); void emoBalanceOf(r.address).then(setEmo, () => {}); } };
  useEffect(() => { read(); const t = setInterval(read, 6000); return () => clearInterval(t); }, [r?.address]);
  const close = () => settle(p.id);
  if (!r) return <Shell title="Passkey account" top={top} onClose={close}><p className="modal-sub">No passkey account is remembered on this device.</p></Shell>;
  const tabs: [Tab, string][] = [['receive', 'Receive'], ['send', 'Send MON'], ['pets', 'Send a pet'], ['backup', 'Recovery phrase'], ['settings', 'Settings']];
  return (
    <Shell title="Passkey account" top={top} onClose={close}>
      <div className="pk-balance"><span className="tnum">{balance === null ? '…' : mon(balance)}</span><em>MON</em><span className="pk-emo"><span className="tnum">{emo === null ? '…' : mon(emo, 2)}</span><em>$EMO</em></span><span className="pk-lock" data-on={unlocked ? 'yes' : 'no'}>{unlocked ? 'unlocked' : 'locked'}</span></div>
      <div className="pk-tabs" role="tablist">{tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip-btn ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}</div>
      {tab === 'receive' && (
        <div className="pk-pane">
          <div className="pk-receive">
            <Qr text={r.address} />
            <div className="pk-addr tnum" translate="no">{r.address}</div>
            <Copy text={r.address} label="Copy address" />
          </div>
          <p className="pk-note">Send MON, pets or items to this address on <b>Monad</b>. It is an ordinary address: any wallet or exchange that withdraws to Monad can fund it. {cfg?.explorer && <a href={`${cfg.explorer}/address/${r.address}`} target="_blank" rel="noreferrer">See it on chain ↗</a>}</p>
          <GetMon />
        </div>
      )}
      {tab === 'send' && <SendMon r={r} balance={balance} onSent={read} />}
      {tab === 'pets' && <SendPet r={r} />}
      {tab === 'backup' && <Backup r={r} visible={top} />}
      {tab === 'settings' && <Settings unlocked={unlocked} onForgot={close} />}
      <Credit />
    </Shell>
  );
}

// ================================================================= the stack
export default function Sheets({ queue }: { queue: readonly Pending[] }) {
  // A fixed backdrop stops the pointer but not the Tab key: without this the page behind a confirm sheet stays
  // focusable, and a keyboard user could press Feed underneath it and stack a request they cannot see.
  useEffect(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
    pages.forEach((el) => el.setAttribute('inert', ''));
    return () => pages.forEach((el) => el.removeAttribute('inert'));
  }, []);
  const last = queue.length - 1;
  return (
    <>
      {queue.map((p, i) => {
        const top = i === last;
        switch (p.ask.kind) {
          case 'onboard': return <Onboard key={p.id} p={p} top={top} />;
          case 'tx': return <Tx key={p.id} p={p as Pending<TxAsk>} top={top} />;
          case 'sign': return <Sign key={p.id} p={p as Pending<SignAsk>} top={top} />;
          case 'account': return <AccountSheet key={p.id} p={p} top={top} />;
        }
      })}
    </>
  );
}
