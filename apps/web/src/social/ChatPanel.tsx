/**
 * The town square's panel: what everyone said (live, with the history above it), and the box to say something.
 *
 * Anyone can read. To talk you sign in and hold a named pet; the composer says which of those is missing and how to
 * get it. Messages from people you blocked are not shown. Every message has a small menu: report, block, and delete
 * (your own; an admin's on anyone's, with mute and ban beside it).
 *
 * Since 2026-09-28 a message can carry a GIF and answer another (its quote shows over it; a tap goes to the original),
 * and each has reactions, like X: any emoji, one per person, from a quick row or the full picker, shown as pills under it,
 * and a reply button. The composer has emoji and GIF pickers (compose.tsx).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, api } from './api';
import type { ChatClient } from './chat';
import { GateNotice } from './Gate';
import { LIMITS, charCount, cleanText, emojiOnly, looksLikePhish, type Gif } from './rules';
import { askSignIn } from './SignIn';
import { social } from './store';
import type { Card, ChatMsg } from './types';
import { Avatar, SafeText, ago, nameOf, short, useSocial } from './ui';
import { ComposeTools, GifChip, GifView, Quote, ReactBar, ReactIcon, ReactionPills, ReplyBar, revealInList } from './compose';
import { ChatClient as ChatRx } from './chat';
import { reportSheet } from './Report';
import { cardFor, useCards } from './cards';
import { RoleMarks } from './RoleMarks';
import { roleSheet } from './RolesAdmin';
import { Icon } from '../ui/Icon';

type Props = {
  chat: ChatClient;
  onClose: () => void;
  /** open a person's card (the town opens it in place) */
  onPerson: (address: string) => void;
  /** fly the camera to the pet a message was said by */
  onPet?: (m: ChatMsg) => void;
  /** a message to scroll to and flash (from a mention notification) */
  focus?: number | null;
};

/** the small word by the crier's name, per kind of event */
const SYS_TAG: Record<string, string> = { fight: 'the ring', name: 'a name', revive: 'back from the dead', buy: 'the shop', mints: 'new pets' };

export function ChatPanel({ chat, onClose, onPerson, onPet, focus = null }: Props) {
  useSyncExternalStore(chat.subscribe, chat.getVersion);
  const s = useSocial();
  const me = s.me;
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const [menu, setMenu] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [reacting, setReacting] = useState<number | null>(null);   // the message whose react bar is open
  const [note, setNote] = useState<string | null>(null);
  const shown = useMemo(() => chat.msgs.filter((m) => !s.blocked.has(m.a)), [chat.msgs, chat.version, s.blocked]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = shown.length;
  // what everyone is called NOW (a message keeps the name its author had when they said it)
  const senders = useMemo(() => [...new Set(shown.map((m) => m.a))], [shown]);
  useCards(senders);

  // stay at the bottom while you are there; otherwise count what came in below
  useLayoutEffect(() => {
    const el = list.current; if (!el) return;
    if (atBottom.current) { el.scrollTop = el.scrollHeight; setUnseen(0); } else setUnseen((u) => u + 1);
  }, [count]);
  useEffect(() => {
    if (focus == null) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${focus}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('so-flash'); setTimeout(() => el.classList.remove('so-flash'), 1800); }
  }, [focus, count]);
  // whose hearts: read for the messages shown once signed in, forgotten on signing out or in as someone else
  const myAddr = me?.address ?? null;
  const lastAddr = useRef<string | null>(null);
  useEffect(() => {
    if (lastAddr.current !== myAddr) { if (lastAddr.current) chat.forgetMine(); lastAddr.current = myAddr; }
    if (myAddr) void chat.syncMine();
  }, [myAddr, count, chat]);
  // the message being answered went away (deleted, or its author blocked)
  useEffect(() => { if (replyTo && !shown.some((m) => m.id === replyTo.id)) setReplyTo(null); }, [shown, replyTo]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 3500); return () => clearTimeout(t); }, [note]);
  const jump = (id: number) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!el) { setNote('That message is further back than what is loaded.'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('so-flash'); setTimeout(() => el.classList.remove('so-flash'), 1800);
  };
  const react = (m: ChatMsg, emoji: string | null) => {
    if (!me) { askSignIn('Sign in to react to messages in the square.'); return; }
    void chat.react(m.id, emoji).catch((e) => { setNote((e as Error).message); if (e instanceof ApiError && e.extra.gate) void social.refresh(); });
  };
  const openReact = (m: ChatMsg) => { if (!me) { askSignIn('Sign in to react to messages in the square.'); return; } setReacting(reacting === m.id ? null : m.id); };
  const reply = (m: ChatMsg) => { if (!me) { askSignIn('Sign in to reply in the square.'); return; } setReplyTo(m); };
  // a quote of a deleted message is only { id, gone }: no author to name
  const quoteName = (a: string | undefined, n: string | null | undefined) => { if (!a) return ''; const nm = cardFor(a)?.name ?? n; return nm ? `@${nm}` : short(a); };
  const onScroll = () => {
    const el = list.current; if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom.current) setUnseen(0);
    if (el.scrollTop < 40 && chat.more) { const h = el.scrollHeight; void chat.older().then(() => { requestAnimationFrame(() => { if (list.current) list.current.scrollTop += list.current.scrollHeight - h; }); }).catch(() => {}); }
  };
  const toBottom = () => { const el = list.current; if (el) { el.scrollTop = el.scrollHeight; atBottom.current = true; setUnseen(0); } };

  return (
    <section className="town-ui so-chat" aria-label="Town square">
      <header className="so-chat-head">
        <div>
          <h2>Town square</h2>
          <p><i className={`live${chat.status === 'open' ? '' : ' off'}`} />{chat.status === 'open' ? `${chat.online.toLocaleString('en-US')} here` : chat.status === 'down' ? 'resting' : 'connecting…'}{chat.slow ? <span className="so-slow">slow mode · {chat.slow}s</span> : null}</p>
        </div>
        <button className="tc-close" onClick={onClose} aria-label="Close the square">×</button>
      </header>
      <div className="so-chat-list" ref={list} onScroll={onScroll} onPointerDown={() => setMenu(null)}>
        {chat.more && count > 0 && <button className="so-older" onClick={() => void chat.older().catch(() => {})}>Earlier messages</button>}
        {count === 0 && chat.status === 'open' && <p className="so-empty">Nobody has said anything yet. Say hello to the town.</p>}
        {chat.status === 'down' && count === 0 && <p className="so-empty">The square is resting right now. The town is still here: walk around, it will be back.</p>}
        {shown.map((m, i) => {
          const prev = shown[i - 1];
          // the town crier's lines (m.sys) are events, each drawn whole: never joined to the one before, no profile behind
          // the name, the pet it is about as its face
          const joined = !m.sys && !!prev && !prev.sys && prev.a === m.a && m.at - prev.at < 3 * 60_000;
          const mine = me?.address === m.a;
          const card: Card = { address: m.a, name: cardFor(m.a)?.name ?? m.n, pet: m.p, pic: cardFor(m.a)?.pic ?? null };
          return (
            <div key={m.id} data-id={m.id} className={`so-msg${joined ? ' joined' : ''}${mine ? ' mine' : ''}${m.men.some((x) => x.a === me?.address) ? ' at-me' : ''}${m.sys ? ` so-sys so-sys-${m.sys.k}` : ''}`}>
              {!joined && (m.sys
                ? <span className="so-msg-av so-sys-av" aria-hidden>{m.p ? <Avatar pet={m.p} size={32} /> : <span className="so-sys-mark"><Icon name={m.sys.k === 'buy' ? 'pumpkin' : 'heart'} size={18} /></span>}</span>
                : <button type="button" className="so-msg-av" onClick={() => onPerson(m.a)} aria-label={`${nameOf(card)}'s profile`}><Avatar pet={m.p} pic={card?.pic} size={32} /></button>)}
              <div className="so-msg-body">
                {!joined && (
                  <div className="so-msg-top">
                    {m.sys ? <span className="so-msg-name so-sys-name">{m.n ?? 'Emotown'}<i className="so-sys-tag">{SYS_TAG[m.sys.k]}</i></span> : <button type="button" className="so-msg-name" onClick={() => onPerson(m.a)}>{nameOf(card)}</button>}
                    {!m.sys && <RoleMarks address={m.a} />}
                    {onPet && m.p && <button type="button" className="so-msg-find" onClick={() => onPet(m)} title={m.sys ? 'Find this pet in town' : 'Find their pet in town'} aria-label={m.sys ? 'Find this pet in town' : 'Find their pet in town'}>⌖</button>}
                    <time dateTime={new Date(m.at).toISOString()} title={new Date(m.at).toLocaleString()}>{ago(m.at)}</time>
                  </div>
                )}
                {m.re && <Quote q={m.re} name={m.re.gone ? '' : quoteName(m.re.a, m.re.n)} hidden={!m.re.gone && !!m.re.a && s.blocked.has(m.re.a)} onJump={() => jump(m.re!.id)} />}
                {m.text && <p className={`so-msg-text${emojiOnly(m.text) ? ' big' : ''}`}><SafeText text={m.text} mentions={m.men} from={nameOf(card)} onMention={(a) => onPerson(a)} /></p>}
                {m.g && <GifView g={m.g} />}
                <ReactionPills rx={ChatRx.rx(m)} mine={chat.mine.get(m.id) ?? null} onPick={(e) => react(m, e)} />
                {looksLikePhish(m.text) && <p className="so-phish">Careful: nobody real ever needs your recovery phrase or private key.</p>}
                <div className="so-acts">
                  <button type="button" className={`so-act react${reacting === m.id ? ' on' : ''}`} aria-label="React" aria-expanded={reacting === m.id} onClick={(e) => { e.stopPropagation(); openReact(m); }}>
                    <ReactIcon />
                  </button>
                  <button type="button" className="so-act" aria-label="Reply" onClick={() => reply(m)}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden><path d="M5 5.8A2.3 2.3 0 0 1 7.3 3.5h9.4A2.3 2.3 0 0 1 19 5.8v7.4a2.3 2.3 0 0 1-2.3 2.3H11l-4.3 3.8v-3.8h.6A2.3 2.3 0 0 1 5 13.2z" /></svg>
                  </button>
                </div>
                {reacting === m.id && <ReactBar mine={chat.mine.get(m.id) ?? null} onPick={(e) => react(m, e)} onClose={() => setReacting(null)} />}
              </div>
              {me && (!m.sys || me.admin) && <button type="button" className="so-msg-more" aria-label="More" onClick={(e) => { e.stopPropagation(); setMenu(menu === m.id ? null : m.id); }}>⋯</button>}
              {menu === m.id && me && (!m.sys || me.admin) && <MsgMenu m={m} mine={mine} admin={me.admin} chat={chat} onDone={() => setMenu(null)} />}
            </div>
          );
        })}
      </div>
      {unseen > 0 && <button className="so-new" onClick={toBottom}>{unseen === 1 ? 'New message' : `${unseen} new messages`} ↓</button>}
      {note && <p className="so-note" role="status">{note}</p>}
      <Composer chat={chat} replyTo={replyTo} replyName={replyTo ? quoteName(replyTo.a, replyTo.n) : ''} onReplied={() => setReplyTo(null)} />
    </section>
  );
}

function MsgMenu({ m, mine, admin, chat, onDone }: { m: ChatMsg; mine: boolean; admin: boolean; chat: ChatClient; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); onDone(); } catch (e) { setErr((e as Error).message); } };
  const who = nameOf({ n: m.n, a: m.a });
  // Under a message near the foot of the list the menu ran past the list's edge and its last items could not be
  // reached (Roles… on the newest message, 2026-09-29): it opens upward when there is more room above, and the list
  // scrolls to show it whole.
  const box = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    const el = box.current, list = el?.closest<HTMLElement>('.so-chat-list');
    if (!el || !list) return;
    const r = el.getBoundingClientRect(), l = list.getBoundingClientRect(), msg = el.parentElement!.getBoundingClientRect();
    if (!up && r.bottom > l.bottom - 6 && msg.top - l.top > l.bottom - r.top) { setUp(true); return; }
    revealInList(el);
  }, [up]);
  // a press anywhere else closes it, as it does the reaction row (a press on the square's header or box left it open
  // over the next message's own button); its own ⋯ button toggles it by itself
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t) || t.closest?.('.so-msg-more') === box.current?.parentElement?.querySelector(':scope > .so-msg-more')) return;
      onDone();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [onDone]);
  if (m.sys) return (
    <div ref={box} className={`so-menu${up ? ' up' : ''}`} role="menu" onPointerDown={(e) => e.stopPropagation()}>
      {admin && <button role="menuitem" onClick={() => void run(() => chat.remove(m.id, true))}>Delete</button>}
      {err && <p className="so-menu-err">{err}</p>}
    </div>
  );
  return (
    <div ref={box} className={`so-menu${up ? ' up' : ''}`} role="menu" onPointerDown={(e) => e.stopPropagation()}>
      {(mine || admin) && <button role="menuitem" onClick={() => void run(() => chat.remove(m.id, admin && !mine))}>Delete</button>}
      {!mine && <button role="menuitem" onClick={() => { onDone(); reportSheet({ kind: 'chat', ref: String(m.id), address: m.a, who, text: m.text }); }}>Report</button>}
      {!mine && <button role="menuitem" onClick={() => void run(() => social.block(m.a, true))}>Block {who}</button>}
      {admin && <button role="menuitem" onClick={() => { onDone(); roleSheet({ address: m.a, who: nameOf({ name: cardFor(m.a)?.name ?? m.n, address: m.a }) }); }}>Roles…</button>}
      {admin && !mine && <>
        <button role="menuitem" onClick={() => void run(() => api.post('/admin/mute', { address: m.a, minutes: 60, reason: 'chat' }))}>Mute 1 hour</button>
        <button role="menuitem" onClick={() => void run(() => api.post('/admin/mute', { address: m.a, minutes: 1440, reason: 'chat' }))}>Mute 1 day</button>
        <button role="menuitem" className="danger" onClick={() => { if (confirm(`Ban ${who} from Emotown and remove everything they said in the square?`)) void run(() => api.post('/admin/ban', { address: m.a, purge: true, reason: 'chat' })); }}>Ban and remove</button>
      </>}
      {err && <p className="so-menu-err">{err}</p>}
    </div>
  );
}

function Composer({ chat, replyTo, replyName, onReplied }: { chat: ChatClient; replyTo: ChatMsg | null; replyName: string; onReplied: () => void }) {
  const s = useSocial();
  const [text, setText] = useState('');
  const [gif, setGif] = useState<Gif | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [hits, setHits] = useState<Card[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (until <= Date.now()) return; const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, [until]);
  // @name suggestions from the last word being typed. The effect keys on the name being typed, not on the text, and
  // never sets state synchronously: an effect that set state on every keystroke (even to the same empty list) counted
  // as a nested update each time, and fifty fast keystrokes tripped React's loop guard, which THROWS, in production
  // too (2026-09-26/27, the e2e's long payloads). Suggestions only show while a name is being typed (`suggest`).
  const q = /(^|\s)@([A-Za-z0-9_]{1,20})$/.exec(text)?.[2] ?? null;
  useEffect(() => {
    if (!q) return;
    let off = false;
    const t = setTimeout(() => { void api.get<{ items: Card[] }>(`/search?q=${encodeURIComponent(q)}`).then((r) => { if (!off) setHits(r.items.filter((c) => c.name)); }).catch(() => {}); }, 180);
    return () => { off = true; clearTimeout(t); };
  }, [q]);
  const suggest = q ? hits : [];
  // choosing Reply puts you in the box (a mouse only: on a phone that would throw the keyboard up at once)
  useEffect(() => { if (replyTo && matchMedia('(pointer: fine)').matches) box.current?.focus(); }, [replyTo]);

  if (s.status === 'loading') return <div className="so-compose"><p className="so-hint">…</p></div>;
  if (s.status === 'down') return <div className="so-compose"><p className="so-hint">{chat.status === 'open' ? 'Talking is resting right now; reading still works.' : 'The square is resting right now. The town is still here.'}</p></div>;
  if (!s.me) return (
    <div className="so-compose so-compose-out">
      <p className="so-hint">Anyone can read the square. To talk, sign in with the wallet that holds a named pet.</p>
      <button className="btn btn-pink" onClick={() => askSignIn('Sign in to talk in the town square.')}>Sign in to talk</button>
    </div>
  );
  if (s.me.muteUntil > Date.now()) return <div className="so-compose"><p className="so-hint">You are muted until {new Date(s.me.muteUntil).toLocaleString()}. You can still read.</p></div>;
  if (!s.me.gate.ok && !s.me.admin) return <div className="so-compose"><GateNotice address={s.me.address} compact /></div>;

  const left = LIMITS.chat - charCount(text);
  const wait = Math.max(0, until - now);
  const send = async () => {
    const t = cleanText(text);
    if ((!t && !gif) || busy || left < 0 || wait > 0) return;
    setBusy(true); setErr(null);
    try { await chat.post(t, { gif, replyTo: replyTo?.id ?? null }); setText(''); setGif(null); setHits([]); onReplied(); if (chat.slow) setUntil(Date.now() + chat.slow * 1000); }
    catch (e) {
      setErr((e as Error).message);
      const w = e instanceof ApiError ? Number(e.extra.wait ?? 0) : 0;
      if (w > 0) { setUntil(Date.now() + w); setNow(Date.now()); }
      if (e instanceof ApiError && e.extra.gate) void social.refresh();
    } finally { setBusy(false); box.current?.focus(); }
  };
  const pick = (c: Card) => { setText((t) => t.replace(/@([A-Za-z0-9_]{1,20})$/, `@${c.name} `)); setHits([]); box.current?.focus(); };
  return (
    <div className="so-compose">
      {suggest.length > 0 && <ul className="so-hits">{suggest.map((c) => <li key={c.address}><button type="button" onClick={() => pick(c)}><Avatar pet={c.pet} pic={c.pic} size={22} />@{c.name}<RoleMarks address={c.address} /></button></li>)}</ul>}
      {replyTo && <ReplyBar name={replyName} text={replyTo.text} gif={!!replyTo.g} onCancel={onReplied} />}
      {gif && <GifChip g={gif} onRemove={() => setGif(null)} />}
      <div className="so-compose-row">
        <ComposeTools box={box} value={text} onText={(v) => { setText(v.replace(/\n/g, ' ')); setErr(null); }} gifs={!!s.me.gifs} onGif={(g) => { setGif(g); setErr(null); }} />
        <textarea ref={box} value={text} rows={1} maxLength={LIMITS.chat * 4} placeholder={wait > 0 ? `Slow mode: ${Math.ceil(wait / 1000)}s` : 'Say something to the town'} aria-label="Message the town square"
          onChange={(e) => { setText(e.target.value.replace(/\n/g, ' ')); setErr(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (suggest.length) pick(suggest[0]!); else void send(); } if (e.key === 'Escape') { if (suggest.length) setHits([]); else if (replyTo) onReplied(); } }} />
        <button className="so-send" onClick={() => void send()} disabled={busy || (!text.trim() && !gif) || left < 0 || wait > 0} aria-label="Send">➤</button>
      </div>
      <div className="so-compose-foot">
        {err ? <span className="so-err" role="alert">{err}</span> : <span className="so-hint">Plain text. Links are shown, never opened for anyone.</span>}
        {left < 60 && <span className={`so-count${left < 0 ? ' over' : ''}`}>{left}</span>}
      </div>
    </div>
  );
}
