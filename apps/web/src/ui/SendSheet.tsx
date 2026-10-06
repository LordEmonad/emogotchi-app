/**
 * Send a pet or an item to someone (2026-09-27). One sheet for every place that offers it (the pet page, the item shop,
 * your pet's card in Emotown), so the rules cannot drift apart:
 *
 * 1. Who: an Emotown name or a wallet address (send.ts). Names show the person's face; black holes, this wallet and the
 *    game's own contracts are refused; a checksum that does not match is refused.
 * 2. The chain is asked first: the exact transfer is simulated from this wallet (it still owns the pet, holds the item,
 *    and the receiver accepts it). Nothing is signed until that passes.
 * 3. Review: what goes, to whom (the whole address, grouped), what goes with it and what does not, and that it cannot
 *    be undone. A pasted address with no Emotown name, or a contract, needs a tick first.
 * 4. The wallet signs the owner's own transfer (never an approval). The passkey wallet describes it again and only a
 *    real press signs.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatView, Collection } from '@emo-pets/chain';
import { chainCfg, chainClient } from '../game/chain';
import { PETS, fallbackName } from '../pets';
import { grouped, parseRecipient, resolveRecipient, type Recipient } from '../send';
import { Avatar, avatarSrc } from '../social/ui';
import { openWalletAgain, walletKind } from '../wallet';
import { svgSrc } from './svgImg';

export type Sendable =
  | { kind: 'pet'; col: Collection; id: number; name: string; view: CatView | null; worn?: readonly number[] }
  | { kind: 'item'; id: number; name: string; svg: string | null; held: number; wornBy: string[] };

type Props = {
  what: Sendable;
  /** the sending wallet */
  me: string;
  /** every pet the sending wallet holds (for the notes: its only named pet, the free mint) */
  myPets: CatView[];
  onClose: () => void;
  onSent: (to: Recipient, hash: string) => void;
};

type Look = { state: 'idle' } | { state: 'looking' } | { state: 'bad'; why: string } | { state: 'ok'; r: Recipient; check: 'checking' | 'ok' | string; plain: boolean };
type Phase = 'who' | 'review' | 'wallet' | 'chain' | 'done';

export function SendSheet({ what, me, myPets, onClose, onSent }: Props) {
  const [text, setText] = useState('');
  const [look, setLook] = useState<Look>({ state: 'idle' });
  const [qty, setQty] = useState(1);
  const [phase, setPhase] = useState<Phase>('who');
  const [ticked, setTicked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const turn = useRef(0);
  const busy = phase === 'wallet' || phase === 'chain';
  const pet = what.kind === 'pet' ? PETS[what.col] : null;
  const thing = what.kind === 'pet' ? what.name : qty > 1 ? `${qty} × ${what.name}` : what.name;

  // who it goes to: parse at once, look up after a pause in the typing, then ask the chain whether it would go through
  useEffect(() => {
    const mine = ++turn.current;
    const p = parseRecipient(text);
    if (p.kind === 'empty') { setLook({ state: 'idle' }); return; }
    if (p.kind === 'bad') { setLook({ state: 'bad', why: p.why }); return; }
    setLook({ state: 'looking' });
    const t = setTimeout(async () => {
      const res = await resolveRecipient(p, me);
      if (turn.current !== mine) return;
      if (!res.ok) { setLook({ state: 'bad', why: res.why }); return; }
      setLook({ state: 'ok', r: res.r, check: 'checking', plain: false });
      const verdict = await check(res.r);
      if (turn.current !== mine) return;
      setLook({ state: 'ok', r: res.r, check: verdict.why ?? 'ok', plain: verdict.plain });
    }, p.kind === 'name' ? 380 : 120);
    return () => clearTimeout(t);
    // the quantity changes what the chain is asked
  }, [text, qty, me]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Would the send go through from this wallet right now? For a pet going to an EIP-7702 wallet whose code does not
   *  answer the safe transfer's question, the plain transfer is tried: that account is still a person's own key. */
  async function check(r: Recipient): Promise<{ why: string | null; plain: boolean }> {
    const c = chainClient; if (!c) return { why: 'This build is not connected to Monad.', plain: false };
    if (c.address?.toLowerCase() !== me.toLowerCase()) return { why: 'The wallet changed. Close this and try again.', plain: false };
    if (what.kind === 'item') return { why: await c.checkSend({ item: { id: what.id, qty } }, r.address), plain: false };
    const safe = await c.checkSend({ pet: { id: what.id, col: what.col } }, r.address);
    if (!safe || r.kind !== 'delegated') return { why: safe, plain: false };
    const plain = await c.checkSend({ pet: { id: what.id, col: what.col, plain: true } }, r.address);
    return plain ? { why: safe, plain: false } : { why: null, plain: true };
  }

  const rec = look.state === 'ok' ? look.r : null;
  const ready = look.state === 'ok' && look.check === 'ok';
  // a name claimed in the last two weeks: names change hands, and one that just did may not be the person meant
  const newName = !!rec?.name && !!rec.nameSince && Date.now() - rec.nameSince < 14 * 86_400_000;
  const plain = look.state === 'ok' && look.plain;
  const needTick = !!rec && ((rec.via === 'address' && !rec.name) || rec.kind === 'contract' || plain || newName);

  const send = async () => {
    const c = chainClient;
    if (!c || !rec || !ready || busy || (needTick && !ticked)) return;
    if (c.address?.toLowerCase() !== me.toLowerCase()) { setErr('The wallet changed. Close this and try again.'); return; }
    setErr(null); setStuck(false); setPhase('wallet');
    const nudge = setTimeout(() => setStuck(true), 30_000);
    c.onHash = () => setPhase('chain');
    try {
      const h = what.kind === 'pet'
        ? await c.sendPet(what.id, rec.address, what.col, look.state === 'ok' && look.plain)
        : await c.sendItem(what.id, qty, rec.address);
      setHash(h); setPhase('done'); onSent(rec, h);
    } catch (e) {
      setErr((e as Error).message || 'That did not go through.'); setPhase('review');
    } finally { clearTimeout(nudge); c.onHash = null; }
  };

  // Escape closes it, unless a transaction is on its way
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const head = what.kind === 'pet'
    ? <img className="send-thing-img is-pet" src={avatarSrc({ col: what.col, id: what.id }, what.view, what.worn) ?? ''} alt="" width={56} height={56} />
    : what.svg ? <img className="send-thing-img" src={svgSrc(what.svg)} alt="" width={56} height={56} /> : <span className="send-thing-img" />;

  return createPortal(
    <div className="modal-back send-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy && phase !== 'done') onClose(); }}>
      <div className="modal send" role="dialog" aria-modal="true" aria-label={`Send ${thing}`}>
        <div className="modal-head">
          <h2>{phase === 'done' ? 'Sent' : `Send ${what.kind === 'pet' ? `this ${pet!.kind}` : 'an item'}`}</h2>
          {!busy && <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>}
        </div>

        <div className="send-thing">
          {head}
          <div><b>{thing}</b><small>{what.kind === 'pet' ? (what.view?.name ? `${pet!.one === 'cat' ? 'Emogotchi' : pet!.one} #${what.id}` : pet!.fullBrand) : `Item #${what.id} · you have ${what.held}`}</small></div>
        </div>

        {phase === 'who' && (<>
          <label className="send-label" htmlFor="send-to">Send it to</label>
          <input id="send-to" className="send-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="An Emotown name, or a wallet address" autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} translate="no" maxLength={200} />
          {what.kind === 'item' && what.held > 1 && (
            <div className="send-qty">
              <span>How many</span>
              <button type="button" className="send-step" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer">−</button>
              <b className="tnum">{qty}</b>
              <button type="button" className="send-step" onClick={() => setQty((q) => Math.min(what.held, q + 1))} disabled={qty >= what.held} aria-label="One more">+</button>
              <small>of {what.held}</small>
            </div>
          )}
          <div className="send-status" aria-live="polite">
            {look.state === 'looking' && <p className="send-note">Looking them up…</p>}
            {look.state === 'bad' && <p className="send-err">{look.why}</p>}
            {rec && <RecipientCard r={rec} />}
            {look.state === 'ok' && look.check === 'checking' && <p className="send-note">Asking Monad whether it can go…</p>}
            {look.state === 'ok' && look.check !== 'checking' && look.check !== 'ok' && <p className="send-err">{look.check}</p>}
          </div>
          <div className="pk-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-pink" disabled={!ready} onClick={() => { setTicked(false); setErr(null); setPhase('review'); }}>Continue</button>
          </div>
        </>)}

        {(phase === 'review' || busy) && rec && (<>
          <p className="send-label">To</p>
          <RecipientCard r={rec} />
          <ul className="send-notes">
            {notes(what, qty, myPets).map((n, i) => <li key={i}>{n}</li>)}
            {rec.kind === 'contract' && <li className="warn">This address is a contract, not a plain wallet (a multisig or a vault, say). Monad says it accepts {what.kind === 'pet' ? 'pets' : 'items'}, but only send it if you know who controls it.</li>}
            {rec.via === 'address' && !rec.name && <li className="warn">This address has no Emotown name. Check the whole address, not just the start and the end: scammers make look-alikes.</li>}
            {newName && <li className="warn">{rec.name} took that name {Math.max(1, Math.round((Date.now() - rec.nameSince!) / 86_400_000))} day{Math.round((Date.now() - rec.nameSince!) / 86_400_000) === 1 ? '' : 's'} ago. Names can change hands: check the address is the person you mean.</li>}
            {plain && <li className="warn">This wallet's smart-account code does not take pets the safe way, so this goes as a plain transfer. Only send it if you know the wallet is theirs.</li>}
            <li className="warn">This cannot be undone. Only they could send it back.</li>
            <li>Nobody from Emotown will ever ask you to send a pet or an item. If someone asked you to, stop here.</li>
          </ul>
          {needTick && (
            <label className="send-tick"><input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} disabled={busy} /> {newName && rec.via === 'name' ? 'I checked this is who I mean' : 'I checked the whole address'}</label>
          )}
          {err && <p className="send-err" role="alert">{err}</p>}
          {phase === 'wallet' && <p className="send-note"><i className="live" /> {walletKind() === 'passkey' ? 'Your passkey account will show it: check it there too.' : 'Confirm it in your wallet.'}</p>}
          {phase === 'chain' && <p className="send-note"><i className="live" /> Sending… waiting for Monad.</p>}
          {stuck && phase === 'wallet' && (
            <p className="send-note">No answer from your wallet yet. {walletKind() === 'walletconnect' && <button type="button" className="linkish" onClick={() => openWalletAgain()}>Open my wallet</button>} <button type="button" className="linkish" onClick={onClose}>Close</button> (if your wallet still sends it later, it arrives).</p>
          )}
          <div className="pk-actions">
            {!busy && <button className="btn btn-ghost" onClick={() => { setErr(null); setPhase('who'); }}>Back</button>}
            <button className="btn btn-pink" disabled={busy || (needTick && !ticked)} onClick={() => void send()}>
              {busy ? 'Sending…' : <>Send {what.kind === 'pet' ? what.name : thing} to <span className="send-to-name" translate="no">{rec.name ?? `${rec.address.slice(0, 6)}…${rec.address.slice(-4)}`}</span></>}
            </button>
          </div>
        </>)}

        {phase === 'done' && rec && (<>
          <p className="send-done">{thing} is in {rec.name ?? `${rec.address.slice(0, 6)}…${rec.address.slice(-4)}`}'s wallet now.</p>
          {hash && chainCfg?.explorer && <p className="send-note"><a href={`${chainCfg.explorer.replace(/\/$/, '')}/tx/${hash}`} target="_blank" rel="noopener noreferrer">See the transaction</a></p>}
          <div className="pk-actions"><button className="btn btn-pink" onClick={onClose}>Done</button></div>
        </>)}
      </div>
    </div>,
    document.body,
  );
}

function RecipientCard({ r }: { r: Recipient }) {
  return (
    <div className="send-to">
      <Avatar pet={r.pet} pic={r.pic} size={44} />
      <div className="send-to-who">
        <b>{r.name ?? 'No Emotown name'}</b>{r.resident ? <small> · resident #{r.resident}</small> : null}
        <code className="send-addr" translate="no">{grouped(r.address)}</code>
      </div>
    </div>
  );
}

/** What goes with it and what does not, in words, for the review. */
function notes(what: Sendable, qty: number, myPets: CatView[]): string[] {
  if (what.kind === 'item') {
    const left = what.held - qty;
    const out = [left > 0 ? `You have ${what.held}: ${qty} go${qty === 1 ? 'es' : ''}, ${left} stay${left === 1 ? 's' : ''} with you.` : what.held > 1 ? `All ${what.held} of yours go.` : 'Your only one goes.'];
    if (left === 0 && what.wornBy.length) out.push(`It comes off ${list(what.wornBy)} when it leaves.`);
    return out;
  }
  const P = PETS[what.col];
  const he = P.he; const his = P.his; const him = he === 'he' ? 'him' : 'it';
  const v = what.view;
  const out = [`Everything that is ${his} own goes with ${him}: ${his} name, record, streak and care score${v?.crowned ? `, and ${his} crown` : ''}.`, `What ${he} wears stays with you: ${he} arrives bare, and your items stay in your wallet.`];
  if (v && !v.alive) out.push(`${he === 'he' ? 'He is' : 'It is'} dead. Whoever holds ${him} next can revive ${him}${P.free ? ', free' : ' for 1,000 MON'}.`);
  if (what.col !== 'cat') out.push(`This wallet's free ${P.one} mint stays used: it cannot mint another one.`);
  const others = myPets.filter((p) => !(p.col === what.col && p.id === what.id));
  if (others.length === 0) out.push(`${he === 'he' ? 'He is' : 'It is'} your only pet.`);
  else if (v?.name && !others.some((p) => p.name)) out.push(`${he === 'he' ? 'He is' : 'It is'} your only named pet: without one you cannot post in the town square or send messages.`);
  return out;
}
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * "Send an item" from the pet page: the items this wallet holds (from the chain store), one tap to pick, then the same
 * Send sheet as the shop's. Soulbound items are left out (the contract would refuse them anyway).
 */
export function SendItemPicker({ held, me, myPets, worn, onClose, onSent }: { held: Record<number, number>; me: string; myPets: CatView[]; worn: Record<string, number[]>; onClose: () => void; onSent: () => void }) {
  const [items, setItems] = useState<{ id: number; name: string; soulbound: boolean }[] | null>(null);
  const [svgs, setSvgs] = useState<Record<number, string>>({});
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => {
    const c = chainClient; if (!c) { setItems([]); return; }
    let on = true;
    void c.items().then((list) => { if (on) setItems(list.map((i) => ({ id: i.id, name: i.name, soulbound: i.soulbound }))); }, () => { if (on) setItems([]); });
    for (const id of Object.keys(held).map(Number)) if ((held[id] ?? 0) > 0) void c.itemImage(id).then((svg) => { if (on) setSvgs((m) => ({ ...m, [id]: svg })); }).catch(() => {});
    return () => { on = false; };
  }, [held]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && pick === null) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [pick, onClose]);
  const mine = (items ?? []).filter((i) => (held[i.id] ?? 0) > 0 && !i.soulbound);
  if (pick !== null) {
    const it = mine.find((i) => i.id === pick);
    if (it) {
      const wornBy = myPets.filter((c) => (worn[`${c.col}:${c.id}`] ?? []).includes(it.id)).map((c) => c.name || fallbackName(c.col, c.id));
      return <SendSheet what={{ kind: 'item', id: it.id, name: it.name, svg: svgs[it.id] ?? null, held: held[it.id] ?? 0, wornBy }} me={me} myPets={myPets} onClose={onClose} onSent={onSent} />;
    }
  }
  return createPortal(
    <div className="modal-back send-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal send" role="dialog" aria-modal="true" aria-label="Send an item">
        <div className="modal-head"><h2>Send an item</h2><button className="modal-x" onClick={onClose} aria-label="Close">✕</button></div>
        {items === null ? <p className="send-note">Reading your items…</p> : mine.length === 0 ? <p className="send-note">This wallet holds no items that can be sent. Claim some in the <a href="/shop">item shop</a>.</p> : (
          <ul className="send-pick">
            {mine.map((i) => (
              <li key={i.id}><button type="button" onClick={() => setPick(i.id)}>
                {svgs[i.id] ? <img className="send-thing-img" src={svgSrc(svgs[i.id]!)} alt="" width={44} height={44} /> : <span className="send-thing-img" />}
                <span><b>{i.name}</b><small>you have {held[i.id]}</small></span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
