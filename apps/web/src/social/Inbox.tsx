/**
 * Direct messages: your conversations, newest first, with what is unread; and a conversation, live (a message
 * arrives over the inbox socket the moment it is sent). You can message someone who follows you, and always answer
 * someone who wrote first. Private between the two of you, but not end-to-end encrypted, and the drawer says so.
 * Since 2026-09-28 a DM can carry a GIF and answer an earlier one, and either of you can react to any of them with one
 * emoji, like X (the quick row or any emoji), shown as pills under the message.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from './api';
import { GateNotice } from './Gate';
import { LIMITS, charCount, cleanText, emojiOnly, looksLikePhish, type Gif } from './rules';
import { askSignIn } from './SignIn';
import { social } from './store';
import { reportSheet } from './Report';
import type { Card, Dm, Profile, Thread } from './types';
import { Avatar, SafeText, ago, nameOf, profileHref, short, useSocial } from './ui';
import { RoleMarks } from './RoleMarks';
import { ComposeTools, GifChip, GifView, Quote, ReactBar, ReactIcon, ReactionPills, ReplyBar } from './compose';
import type { Reactions } from './rules';

// ---------------------------------------------------------------- open it from anywhere
let state: { open: boolean; with: string | null; n: number } = { open: false, with: null, n: 0 };
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };
export function openInbox(withAddress: string | null = null) { state = { open: true, with: withAddress?.toLowerCase() ?? null, n: state.n + 1 }; emit(); }
export function closeInbox() { state = { ...state, open: false }; emit(); }
export const useInbox = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);

export function InboxHost() {
  const st = useInbox();
  const s = useSocial();
  const [view, setView] = useState<string | null>(null);
  useEffect(() => { if (st.open) setView(st.with); }, [st.n, st.open, st.with]);
  useEffect(() => { if (st.open && s.status === 'out') { closeInbox(); askSignIn('Sign in to read and send messages.'); } }, [st.open, s.status]);
  useEffect(() => { if (!st.open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeInbox(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [st.open]);
  if (!st.open || !s.me) return null;
  return (
    <div className="so-drawer-back" onPointerDown={(e) => { if (e.target === e.currentTarget) closeInbox(); }}>
      <aside className="so-drawer" role="dialog" aria-modal="true" aria-label="Messages">
        {view ? <Conversation key={view} other={view} onBack={() => setView(null)} /> : <Threads onOpen={setView} />}
      </aside>
    </div>
  );
}

function Threads({ onOpen }: { onOpen: (a: string) => void }) {
  const s = useSocial();
  const [items, setItems] = useState<Thread[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.get<{ items: Thread[] }>('/dm/threads').then((r) => { setItems(r.items); setErr(null); }).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { void load(); return social.on((e) => { if (e.t === 'dm' || e.t === 'dm_read' || e.t === 'blocked') void load(); }); }, [load]);
  return (
    <>
      <header className="so-drawer-head"><h2>Messages</h2><button className="tc-close" onClick={closeInbox} aria-label="Close">×</button></header>
      <div className="so-drawer-body">
        {err && <p className="so-empty">{err}</p>}
        {items === null && !err && <p className="so-empty">Opening your messages…</p>}
        {items?.length === 0 && <p className="so-empty">No messages yet. You can message anyone who follows you: find people in the town square, or on their profile.</p>}
        <ul className="so-threads">
          {items?.map((t) => (
            <li key={t.id}>
              <button type="button" className={`so-thread${t.unread && !t.blocked ? ' unread' : ''}`} onClick={() => onOpen(t.with.address)}>
                <Avatar pet={t.with.pet} pic={t.with.pic} size={42} />
                <span className="so-thread-main">
                  <span className="so-thread-top"><b>{nameOf(t.with)}<RoleMarks address={t.with.address} /></b><time>{ago(t.lastAt)}</time></span>
                  <span className="so-thread-last">{t.blocked ? 'Blocked' : `${t.last.from === s.me?.address ? 'You: ' : ''}${t.last.text || (t.last.gif ? 'GIF' : '')}`}</span>
                </span>
                {t.unread > 0 && !t.blocked && <span className="so-badge">{t.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="so-drawer-foot">Messages are private between the two of you, but not end-to-end encrypted: they are kept on Emotown's server. If someone reports a message, a moderator reads that message.</p>
    </>
  );
}

function Conversation({ other, onBack }: { other: string; onBack: () => void }) {
  const s = useSocial();
  const me = s.me!;
  const [p, setP] = useState<Profile | null>(null);
  const [items, setItems] = useState<Dm[]>([]);
  const [more, setMore] = useState(false);
  const [can, setCan] = useState<{ ok: boolean; why: string | null } | null>(null);
  const [text, setText] = useState('');
  const [gif, setGif] = useState<Gif | null>(null);
  const [replyTo, setReplyTo] = useState<Dm | null>(null);
  const [reacting, setReacting] = useState<number | null>(null);   // the message whose react bar is open
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const card: Card = { address: other, name: p?.name ?? null, pet: p?.avatar ?? null };
  const who = p ? nameOf(p) : short(other);

  const markRead = useCallback((upTo: number) => { void api.post('/dm/read', { with: other, upTo }).catch(() => {}); }, [other]);
  const load = useCallback(async (before?: number) => {
    const r = await api.get<{ items: Dm[]; more: boolean; canSend: boolean; why: string | null }>(`/dm/thread/${other}${before ? `?before=${before}` : ''}`);
    setItems((prev) => before ? [...r.items, ...prev] : r.items);
    setMore(r.more); setCan({ ok: r.canSend, why: r.why });
    if (!before && r.items.length) markRead(r.items[r.items.length - 1]!.id);
  }, [other, markRead]);
  useEffect(() => { void api.get<Profile>(`/profile/${other}`).then(setP).catch(() => {}); void load().catch((e) => setErr((e as Error).message)); }, [other, load]);
  useEffect(() => social.on((e) => {
    if (e.t !== 'dm') return;
    const m = e.m;
    if (!((m.from === other && m.to === me.address) || (m.from === me.address && m.to === other))) return;
    setItems((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
    if (m.from === other) { markRead(m.id); if (can && !can.ok) void load(); }
  }), [other, me.address, markRead, can, load]);
  // a reaction, from either of you, in any of your tabs
  const setRx = (id: number, by: string, emoji: string | null) => setItems((prev) => prev.map((m) => {
    if (m.id !== id) return m;
    const rx = { ...(m.rx ?? {}) };
    if (emoji) rx[by] = emoji; else delete rx[by];
    return { ...m, rx };
  }));
  useEffect(() => social.on((e) => { if (e.t === 'dm_react') setRx(e.id, e.by, e.emoji); }), []);
  useLayoutEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [items.length]);
  const react = (m: Dm, emoji: string | null) => {
    const was = m.rx?.[me.address] ?? null;
    setRx(m.id, me.address, emoji);
    void api.post('/dm/react', { id: m.id, emoji }).catch((e) => { setRx(m.id, me.address, was); setErr((e as Error).message); });
  };
  /** the two people's reactions as pills: [emoji, n], most first */
  const pills = (m: Dm): Reactions => { const c = new Map<string, number>(); for (const e of Object.values(m.rx ?? {})) c.set(e, (c.get(e) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1]); };
  const jump = (id: number) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('so-flash'); setTimeout(() => el.classList.remove('so-flash'), 1800); }
  };
  useEffect(() => { if (replyTo && matchMedia('(pointer: fine)').matches) box.current?.focus(); }, [replyTo]);

  const left = LIMITS.dm - charCount(text);
  const send = async () => {
    const t = cleanText(text);
    if ((!t && !gif) || busy || left < 0) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ m: Dm }>('/dm/send', { to: other, text: t, ...(gif ? { gif } : {}), ...(replyTo ? { replyTo: replyTo.id } : {}) });
      setItems((prev) => prev.some((x) => x.id === r.m.id) ? prev : [...prev, r.m]);
      setText(''); setGif(null); setReplyTo(null);
    } catch (e) {
      setErr((e as Error).message);
      if (e instanceof ApiError && (e.extra.dm || e.extra.gate)) { void load(); void social.refresh(); }
    } finally { setBusy(false); box.current?.focus(); }
  };
  const blocked = s.blocked.has(other);
  return (
    <>
      <header className="so-drawer-head">
        <button className="so-back static" onClick={onBack} aria-label="All messages">‹</button>
        <a className="so-drawer-who" href={profileHref(card)}><Avatar pet={card.pet} pic={card.pic} size={32} /><b>{who}<RoleMarks address={other} /></b></a>
        <button className="so-btn icon" aria-label="More" onClick={() => setMenu(!menu)}>⋯</button>
        <button className="tc-close" onClick={closeInbox} aria-label="Close">×</button>
      </header>
      {menu && (
        <div className="so-menu inline">
          <button onClick={() => { setMenu(false); void social.block(other, !blocked).catch((e) => setErr((e as Error).message)); }}>{blocked ? `Unblock ${who}` : `Block ${who}`}</button>
          <button onClick={() => { setMenu(false); reportSheet({ kind: 'profile', address: other, who }); }}>Report {who}</button>
        </div>
      )}
      <div className="so-drawer-body so-dms" ref={list}>
        {more && <button className="so-older" onClick={() => void load(items[0]?.id).catch(() => {})}>Earlier messages</button>}
        {items.length === 0 && can && <p className="so-empty">{can.ok ? `Say hello to ${who}.` : can.why}</p>}
        {items.map((m, i) => {
          const mine = m.from === me.address;
          const gap = i === 0 || m.at - items[i - 1]!.at > 15 * 60_000;
          const myRx = m.rx?.[me.address] ?? null;
          return (
            <div key={m.id} data-id={m.id} className={`so-dm${mine ? ' mine' : ''}`}>
              {gap && <time className="so-dm-time">{new Date(m.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>}
              {m.re && <Quote q={m.re} name={m.re.a === me.address ? 'you' : who} onJump={() => jump(m.re!.id)} />}
              {m.text && <p className={`so-dm-bubble${emojiOnly(m.text) ? ' big' : ''}`}><SafeText text={m.text} from={mine ? null : who} /></p>}
              {m.g && <GifView g={m.g} max={220} />}
              <ReactionPills rx={pills(m)} mine={myRx} onPick={(e) => react(m, e)} />
              {!mine && looksLikePhish(m.text) && <p className="so-phish">Careful: nobody real ever needs your recovery phrase or private key.</p>}
              <div className="so-dm-acts">
                <button type="button" className={`so-act react${reacting === m.id ? ' on' : ''}`} aria-label="React" aria-expanded={reacting === m.id} onClick={(e) => { e.stopPropagation(); setReacting(reacting === m.id ? null : m.id); }}>
                  <ReactIcon />
                </button>
                <button type="button" className="so-act" aria-label="Reply" onClick={() => setReplyTo(m)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M5 5.8A2.3 2.3 0 0 1 7.3 3.5h9.4A2.3 2.3 0 0 1 19 5.8v7.4a2.3 2.3 0 0 1-2.3 2.3H11l-4.3 3.8v-3.8h.6A2.3 2.3 0 0 1 5 13.2z" /></svg>
                </button>
                {!mine && <button type="button" className="so-dm-report" onClick={() => reportSheet({ kind: 'dm', ref: String(m.id), address: other, who, text: m.text })}>Report</button>}
              </div>
              {reacting === m.id && <ReactBar mine={myRx} onPick={(e) => react(m, e)} onClose={() => setReacting(null)} />}
            </div>
          );
        })}
      </div>
      {blocked ? <p className="so-drawer-foot">You blocked {who}. Unblock them to write again.</p>
        : !me.gate.ok && !me.admin ? <div className="so-compose"><GateNotice address={me.address} compact /></div>
        : can && !can.ok ? <p className="so-drawer-foot">{can.why}</p>
        : (
          <div className="so-compose">
            {replyTo && <ReplyBar name={replyTo.from === me.address ? 'yourself' : who} text={replyTo.text} gif={!!replyTo.g} onCancel={() => setReplyTo(null)} />}
            {gif && <GifChip g={gif} onRemove={() => setGif(null)} />}
            <div className="so-compose-row">
              <ComposeTools box={box} value={text} onText={(v) => { setText(v); setErr(null); }} gifs={!!me.gifs} onGif={(g) => { setGif(g); setErr(null); }} />
              <textarea ref={box} value={text} rows={2} maxLength={LIMITS.dm * 2} placeholder={`Message ${who}`} aria-label={`Message ${who}`}
                onChange={(e) => { setText(e.target.value); setErr(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
              <button className="so-send" onClick={() => void send()} disabled={busy || (!text.trim() && !gif) || left < 0} aria-label="Send">➤</button>
            </div>
            <div className="so-compose-foot">{err ? <span className="so-err" role="alert">{err}</span> : <span className="so-hint">Not end-to-end encrypted.</span>}{left < 100 && <span className={`so-count${left < 0 ? ' over' : ''}`}>{left}</span>}</div>
          </div>
        )}
    </>
  );
}
