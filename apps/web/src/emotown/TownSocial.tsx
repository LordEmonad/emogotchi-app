/**
 * Emotown's social layer on the street (2026-09-26): the town square's speech bubbles over the speakers' pets, the
 * pets of people in the square walking into town while they are here, and the buttons and panels for chat, messages,
 * notifications, your profile and the admin tools. The talking itself lives in ../social/.
 *
 * All of it is optional to the town: if the Worker's social side is down, the square says it is resting, no bubbles
 * appear, and the town carries on exactly as before.
 */
import { cue } from '../sound/cue';
import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Collection } from '@emo-pets/chain';
import type { ChatClient } from '../social/chat';
import { ChatPanel } from '../social/ChatPanel';
import { AdminPanel } from '../social/Admin';
import { RoleMarks } from '../social/RoleMarks';
import { openInbox } from '../social/Inbox';
import { Notifications } from '../social/Notifications';
import { askSignIn } from '../social/SignIn';
import { social } from '../social/store';
import type { ChatMsg, Person } from '../social/types';
import { Avatar, nameOf, profileHref, useSocial } from '../social/ui';
import { clip, gifUrl } from '../social/rules';
import { PET_TALL, TOWN, depthScale } from './layout';
import { inTown, keyOf, type TownSim } from './sim';
import { loadViews } from './data';

/** how long a bubble stays up: long enough to read it */
const bubbleMs = (text: string) => Math.min(12_000, 4200 + 55 * [...text].length);
/** after its owner leaves the square, a visitor lingers this long before walking out (a reload is not a goodbye) */
const LINGER = 45_000;

/** `gif`: the still frame of a GIF the message carried (a moving picture over every speaking pet would cost phones
 * their smoothness); `tag`: it carried a GIF with no still, shown as a word */
type Bubble = { id: number; key: string; a: string; name: string; text: string; until: number; me: boolean; gif: string | null; tag: boolean };

/**
 * The pets of the people in the square: visitors come and go with them, and a pet that speaks is out on the street
 * with a bubble over it. Returns the bubbles for the layer.
 */
export function useTownTalk(sim: TownSim, chat: ChatClient) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const s = useSocial();
  const blocked = useRef(s.blocked); blocked.current = s.blocked;
  const me = useRef(s.me?.address ?? null); me.current = s.me?.address ?? null;
  useEffect(() => {
    const keyOfPerson = new Map<string, string>();   // address -> the pet they walk in as
    const leaving = new Map<string, ReturnType<typeof setTimeout>>();
    let first = true;
    const dress = (col: Collection, id: number) => { void loadViews([{ col, id }]).then((m) => { for (const [k, v] of m) sim.update(k, v.view, v.worn); }).catch(() => {}); };
    const come = (p: Person, arriving: boolean) => {
      if (!p.p || blocked.current.has(p.a) || !inTown(p.p.col)) return;
      const key = keyOf(p.p.col, p.p.id);
      const t = leaving.get(p.a); if (t) { clearTimeout(t); leaving.delete(p.a); }
      const had = keyOfPerson.get(p.a);
      if (had && had !== key) sim.depart(had);   // they changed their avatar
      keyOfPerson.set(p.a, key);
      const r = sim.visit(p.p.col, p.p.id, arriving);
      if (!r.view) dress(p.p.col, p.p.id);
    };
    const offPresence = chat.onPresence((join, leave) => {
      for (const p of join) come(p, !first);
      first = false;
      for (const a of leave) {
        const key = keyOfPerson.get(a); if (!key || leaving.has(a)) continue;
        leaving.set(a, setTimeout(() => { leaving.delete(a); if (!chat.people.has(a)) { keyOfPerson.delete(a); sim.depart(key); } }, LINGER));
      }
    });
    const offLive = chat.onLive((m: ChatMsg) => {
      // the town crier's lines are the square's own: nobody's pet says them, so no bubble and no chime
      if (!m.p || m.sys || blocked.current.has(m.a)) return;
      come({ a: m.a, n: m.n, p: m.p }, true);
      const still = m.g?.still ? gifUrl(m.g.still) : null;
      const until = Date.now() + bubbleMs(m.text || (m.g ? 'a gif to look at' : ''));
      const b: Bubble = { id: m.id, key: keyOf(m.p.col, m.p.id), a: m.a, name: nameOf(m), text: clip(m.text, 140), until, me: m.a === me.current, gif: still, tag: !!m.g && !still };
      setBubbles((bs) => [...bs.filter((x) => x.key !== b.key && x.until > Date.now()), b]);
      if (!b.me) cue('notify.chat', { v: 0.7 });
    });
    const sweep = setInterval(() => setBubbles((bs) => (bs.some((b) => b.until <= Date.now()) ? bs.filter((b) => b.until > Date.now()) : bs)), 500);
    return () => { offPresence(); offLive(); clearInterval(sweep); for (const t of leaving.values()) clearTimeout(t); };
  }, [sim, chat]);
  // someone just blocked: their bubble goes at once
  useEffect(() => { setBubbles((bs) => bs.filter((b) => !s.blocked.has(b.a))); }, [s.blocked]);
  return bubbles;
}

/**
 * The bubbles, in the street's own scrolling layer (they ride the native scroll with the town for free), each held
 * over its pet's head as the pet walks: one transform per bubble per frame, and no frame loop at all when nobody is
 * talking.
 */
export const BubbleLayer = memo(function BubbleLayer({ sim, bubbles, k, top }: { sim: TownSim; bubbles: Bubble[]; k: number; top: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bubbles.length) return;
    let raf = 0;
    const place = () => {
      const el = host.current; if (!el) return;
      const now = Date.now();
      const spots: { x: number; y: number }[] = [];
      for (const b of el.children as HTMLCollectionOf<HTMLElement>) {
        const r = sim.residents.get(b.dataset.key ?? '');
        if (!r || r.inside) { b.style.visibility = 'hidden'; continue; }
        const p = sim.pos(r, now);
        // over the head, and over the name tag that shows above it (26 units), crown included
        let x = p.x * k; let y = top + (p.y - (PET_TALL[r.character] + 26 + (r.view?.crowned ? 22 : 0)) * depthScale(p.y) - 6) * k;
        // two talking at once, close together: the later one sits higher
        for (const o of spots) if (Math.abs(o.x - x) < 170 && Math.abs(o.y - y) < 60) y = o.y - 64;
        spots.push({ x, y });
        x = Math.max(120, Math.min(TOWN.w * k - 120, x));
        b.style.visibility = '';
        b.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [sim, bubbles, k, top]);
  return (
    <div ref={host} className="so-bubbles" aria-hidden>
      {bubbles.map((b) => (
        <div key={b.id} data-key={b.key} className={`so-bubble${b.me ? ' me' : ''}`} style={{ ['--life' as string]: `${b.until - Date.now()}ms` }}>
          <div className="so-bubble-in"><b>{b.name}<RoleMarks address={b.a} /></b>{b.gif && <img className="so-bubble-gif" src={b.gif} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false} />}{b.text && <span>{b.text}</span>}{b.tag && <i className="so-bubble-tag">GIF</i>}</div>
        </div>
      ))}
    </div>
  );
});

type Panel = null | 'notes' | 'me';
export type Hud = { panel: Panel; setPanel: (p: Panel) => void; focus: number | null; setFocus: (id: number | null) => void; admin: boolean; setAdmin: (b: boolean) => void };
/** what is open over the town, shared by the buttons (in the top-right row) and the panels (over the page) */
export function useHud(): Hud {
  const [panel, setPanel] = useState<Panel>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [admin, setAdmin] = useState(false);
  return { panel, setPanel, focus, setFocus, admin, setAdmin };
}

/** The social buttons, in the town's top-right row: the square, messages, notifications, you (or Sign in). */
export function SocialButtons({ chat, chatOpen, setChatOpen, hud }: { chat: ChatClient; chatOpen: boolean; setChatOpen: (b: boolean) => void; hud: Hud }) {
  const s = useSocial();
  useSyncExternalStore(chat.subscribe, chat.getVersion);
  const me = s.me;
  const toggle = (p: Panel) => hud.setPanel(hud.panel === p ? null : p);
  return (
    <>
      <button type="button" className={`so-hud-btn${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen(!chatOpen)} aria-pressed={chatOpen} aria-label="Town square" title="Town square">
        <span aria-hidden>💬</span>{chat.status === 'open' && chat.online > 0 && <em className="tnum">{chat.online > 999 ? `${Math.floor(chat.online / 1000)}k` : chat.online}</em>}
      </button>
      {me && <button type="button" className="so-hud-btn" onClick={() => openInbox()} aria-label={`Messages${s.unread.dms ? `, ${s.unread.dms} unread` : ''}`} title="Messages"><span aria-hidden>✉️</span>{s.unread.dms > 0 && <i className="so-dot">{s.unread.dms > 99 ? '99+' : s.unread.dms}</i>}</button>}
      {me && <button type="button" className={`so-hud-btn${hud.panel === 'notes' ? ' on' : ''}`} onClick={() => toggle('notes')} aria-label={`Notifications${s.unread.notifications ? `, ${s.unread.notifications} new` : ''}`} title="Notifications"><span aria-hidden>🔔</span>{s.unread.notifications > 0 && <i className="so-dot">{s.unread.notifications > 99 ? '99+' : s.unread.notifications}</i>}</button>}
      {me ? (
        <button type="button" className={`so-hud-me${hud.panel === 'me' ? ' on' : ''}`} onClick={() => toggle('me')} aria-label="You">
          <Avatar pet={me.profile.avatar} pic={me.profile.pic} size={26} eager /><span className="so-hud-name">{nameOf(me.profile)}</span>
        </button>
      ) : s.status === 'out' ? (
        <button type="button" className="so-hud-signin" onClick={() => askSignIn('Sign in to talk in the square, follow people and send messages.')}>Sign in</button>
      ) : null}
    </>
  );
}

/** What the buttons open: the square's panel, the notifications, your menu, the admin tools. */
export function SocialPanels({ chat, chatOpen, setChatOpen, hud, onPerson, onFindPet }: { chat: ChatClient; chatOpen: boolean; setChatOpen: (b: boolean) => void; hud: Hud; onPerson: (a: string) => void; onFindPet: (key: string) => void }) {
  const s = useSocial();
  const me = s.me;
  const close = () => hud.setPanel(null);
  return (
    <>
      {hud.panel === 'notes' && me && <Notifications onClose={close} onPerson={(a) => { close(); onPerson(a); }} onMention={(id) => { close(); setChatOpen(true); hud.setFocus(id); }} />}
      {hud.panel === 'me' && me && (
        <div className="town-ui so-pop so-mepop" role="menu">
          <a role="menuitem" href={profileHref(me.profile)}>My profile</a>
          <a role="menuitem" href={`${profileHref(me.profile)}?edit=1`}>Edit profile</a>
          <button role="menuitem" onClick={() => { close(); openInbox(); }}>Messages</button>
          {me.admin && <button role="menuitem" onClick={() => { close(); hud.setAdmin(true); }}>Admin tools{me.picsWaiting ? <em className="so-menu-count">{me.picsWaiting} picture{me.picsWaiting === 1 ? '' : 's'} waiting</em> : null}</button>}
          <button role="menuitem" onClick={() => { close(); void social.signOut(); }}>Sign out</button>
        </div>
      )}
      {hud.admin && me?.admin && <AdminPanel slow={chat.slow} onClose={() => hud.setAdmin(false)} />}
      {chatOpen && <ChatPanel chat={chat} onClose={() => setChatOpen(false)} onPerson={onPerson} onPet={(m) => { if (m.p) onFindPet(keyOf(m.p.col, m.p.id)); }} focus={hud.focus} />}
    </>
  );
}

export type { Bubble };
