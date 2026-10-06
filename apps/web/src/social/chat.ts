/**
 * The town square, live: one websocket to the room (anyone may read; a signed-in reader is announced, so their pet can
 * walk into town while they are here), the messages, who is here, and slow mode. Posting goes over HTTP, where the
 * Worker checks the session, the gate and the filter; the message then comes back to everyone over the socket.
 *
 * If the socket drops it comes back by itself (1 s, 2 s, 4 s ... 30 s). If the room is down the town does not care:
 * this reports `down` and the panel says so.
 */
import { api, socketUrl } from './api';
import { REACTION_PRESETS, type Gif, type Reactions, type ReplyQuote } from './rules';
import type { ChatMsg, Person } from './types';
import { loadRoles } from './roles';

const KEEP = 300;
export type ChatStatus = 'connecting' | 'open' | 'down';
type Server =
  | { t: 'hello'; recent: ChatMsg[]; people: Person[]; online: number; slow: number }
  | { t: 'msg'; m: ChatMsg }
  | { t: 'del'; ids: number[] }
  | { t: 'del_user'; a: string }
  | { t: 'presence'; join: Person[]; leave: string[]; online: number }
  | { t: 'slow'; s: number }
  | { t: 'react'; id: number; r: Reactions }
  | { t: 'roles'; v: number }
  | { t: 'pong' };

export class ChatClient {
  msgs: ChatMsg[] = [];
  people = new Map<string, Person>();
  online = 0;
  slow = 0;
  status: ChatStatus = 'connecting';
  more = true;
  version = 0;
  /** the signed-in reader's reaction to each message, by id (read once per message, `syncMine`) */
  mine = new Map<number, string>();
  private askedMine = new Set<number>();
  private subs = new Set<() => void>();
  private live = new Set<(m: ChatMsg) => void>();
  private presence = new Set<(join: Person[], leave: string[]) => void>();
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private backoff = 1000;
  private stopped = true;
  private failures = 0;

  constructor(readonly room = 'square') {}
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getVersion = () => this.version;
  /** a message as it is said (not the history on connect): the town puts it over the speaker's pet */
  onLive(f: (m: ChatMsg) => void) { this.live.add(f); return () => { this.live.delete(f); }; }
  onPresence(f: (join: Person[], leave: string[]) => void) { this.presence.add(f); return () => { this.presence.delete(f); }; }
  private changed() { this.version++; for (const f of this.subs) f(); }

  start() { if (!this.stopped) return; this.stopped = false; this.connect(); document.addEventListener('visibilitychange', this.wake); }
  stop() { this.stopped = true; document.removeEventListener('visibilitychange', this.wake); this.close(); }
  /** after signing in or out: reconnect so the room knows who this is */
  reconnect() { if (this.stopped) return; this.close(); this.backoff = 1000; this.connect(); }
  private wake = () => { if (document.visibilityState === 'visible' && !this.ws && !this.stopped) { this.backoff = 1000; this.connect(); } };

  private connect() {
    if (this.ws || this.stopped) return;
    if (this.status !== 'open') { this.status = this.failures >= 3 ? 'down' : 'connecting'; this.changed(); }
    let ws: WebSocket;
    try { ws = new WebSocket(socketUrl(`/chat/ws?room=${this.room}`)); } catch { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.backoff = 1000; this.failures = 0; this.ping = setInterval(() => { try { ws.send('{"t":"ping"}'); } catch { /* closing */ } }, 25_000); };
    ws.onmessage = (ev) => { let d: Server; try { d = JSON.parse(String(ev.data)); } catch { return; } this.apply(d); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.ping) { clearInterval(this.ping); this.ping = null; }
      this.failures++;
      this.status = this.failures >= 3 ? 'down' : 'connecting'; this.changed();
      this.retry();
    };
  }
  private retry() {
    if (this.timer || this.stopped) return;
    const wait = this.backoff; this.backoff = Math.min(30_000, this.backoff * 2);
    this.timer = setTimeout(() => { this.timer = null; if (document.visibilityState === 'visible') this.connect(); }, wait);
  }
  private close() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.ping) { clearInterval(this.ping); this.ping = null; }
    const ws = this.ws; this.ws = null;
    try { ws?.close(1000); } catch { /* gone */ }
  }

  private apply(d: Server) {
    switch (d.t) {
      case 'hello': {
        // keep anything older we had paged in; the room's recent list replaces the rest
        const first = d.recent[0]?.id ?? Infinity;
        this.msgs = [...this.msgs.filter((m) => m.id < first), ...d.recent].slice(-KEEP);
        // the room sends its last sixty: fewer means there is nothing older to fetch
        if (this.msgs.length === d.recent.length) this.more = d.recent.length >= 60;
        this.people = new Map(d.people.map((p) => [p.a, p]));
        this.online = d.online; this.slow = d.slow; this.status = 'open';
        for (const f of this.presence) f(d.people, []);
        break;
      }
      case 'msg':
        if (this.msgs.some((m) => m.id === d.m.id)) return;
        this.msgs = [...this.msgs, d.m].slice(-KEEP);
        if (d.m.p && !this.people.has(d.m.a)) this.people.set(d.m.a, { a: d.m.a, n: d.m.n, p: d.m.p });
        for (const f of this.live) { try { f(d.m); } catch { /* a listener's problem */ } }
        break;
      // a reply keeps no copy of what it answered: when that goes, its quote says so (the room does the same)
      case 'del': this.msgs = this.unquote(this.msgs.filter((m) => !d.ids.includes(m.id)), (q) => d.ids.includes(q.id)); break;
      case 'del_user': this.msgs = this.unquote(this.msgs.filter((m) => m.a !== d.a), (q) => q.a === d.a); break;
      case 'react': this.msgs = this.msgs.map((m) => (m.id === d.id ? { ...m, rx: d.r, likes: undefined } : m)); break;
      case 'presence':
        for (const p of d.join) this.people.set(p.a, p);
        for (const a of d.leave) this.people.delete(a);
        this.online = d.online;
        for (const f of this.presence) f(d.join, d.leave);
        break;
      case 'slow': this.slow = d.s; break;
      // an admin changed the roles: read them again (not a change to the messages)
      case 'roles': void loadRoles(d.v); return;
      default: return;
    }
    this.changed();
  }

  private unquote(list: ChatMsg[], match: (q: { id: number; a?: string }) => boolean) {
    return list.map((m) => (m.re && !m.re.gone && match(m.re) ? { ...m, re: { id: m.re.id, gone: true } as ReplyQuote } : m));
  }

  /** Dev builds only (Emotown's `window.__town.say`): play a message as if the room had sent it. */
  inject(m: ChatMsg) { this.apply({ t: 'msg', m }); }

  /** Say something. Resolves with the message, or rejects with the Worker's reason (gate, mute, slow mode...). */
  async post(text: string, extra: { gif?: Gif | null; replyTo?: number | null } = {}): Promise<ChatMsg> {
    const { m } = await api.post<{ m: ChatMsg }>('/chat', { room: this.room, text, ...(extra.gif ? { gif: extra.gif } : {}), ...(extra.replyTo ? { replyTo: extra.replyTo } : {}) });
    // the socket brings it too; whichever comes first wins
    if (!this.msgs.some((x) => x.id === m.id)) { this.msgs = [...this.msgs, m].slice(-KEEP); this.changed(); }
    return m;
  }
  async remove(id: number, admin: boolean) {
    await api.post(admin ? '/admin/delete' : '/chat/delete', admin ? { id } : { id, room: this.room });
    this.msgs = this.msgs.filter((m) => m.id !== id); this.changed();
  }
  /** A message's reactions, reading a message kept from before reactions (a heart count) as that many red hearts. */
  static rx(m: ChatMsg): Reactions | undefined { return m.rx ?? (m.likes ? [[REACTION_PRESETS[0]!, m.likes]] : undefined); }
  /**
   * React to a message (or take yours back with null), like X: one each. Shown at once, then set to the room's counts;
   * rejects with the Worker's reason and puts things back.
   */
  async react(id: number, emoji: string | null) {
    const was = this.mine.get(id) ?? null;
    const before = this.msgs.find((m) => m.id === id);
    const prevRx = before ? ChatClient.rx(before) : undefined;
    const bump = (rx: Reactions | undefined, e: string | null, d: number): Reactions => {
      const out = (rx ?? []).map(([k, n]) => [k, n] as [string, number]);
      if (!e) return out;
      const i = out.findIndex(([k]) => k === e);
      if (i >= 0) out[i]![1] += d; else if (d > 0) out.push([e, d]);
      return out.filter(([, n]) => n > 0);
    };
    if (emoji) this.mine.set(id, emoji); else this.mine.delete(id);
    this.msgs = this.msgs.map((m) => (m.id === id ? { ...m, likes: undefined, rx: bump(bump(ChatClient.rx(m), was, -1), emoji, 1) } : m));
    this.changed();
    try {
      const r = await api.post<{ r: Reactions }>('/chat/react', { id, emoji });
      this.msgs = this.msgs.map((m) => (m.id === id ? { ...m, rx: r.r } : m)); this.changed();
    } catch (e) {
      if (was) this.mine.set(id, was); else this.mine.delete(id);
      this.msgs = this.msgs.map((m) => (m.id === id ? { ...m, rx: prevRx } : m));
      this.changed();
      throw e;
    }
  }
  /** The signed-in reader's reactions to the messages shown (each message asked about once). */
  async syncMine() {
    const ids = this.msgs.map((m) => m.id).filter((id) => !this.askedMine.has(id)).slice(-200);
    if (!ids.length) return;
    for (const id of ids) this.askedMine.add(id);
    try {
      const r = await api.get<{ mine: Record<string, string> }>(`/chat/mine?ids=${ids.join(',')}`);
      const got = Object.entries(r.mine ?? {});
      for (const [id, e] of got) this.mine.set(Number(id), e);
      if (got.length) this.changed();
    } catch { for (const id of ids) this.askedMine.delete(id); }
  }
  /** Signed out (or in as someone else): forget whose reactions these were. */
  forgetMine() { this.mine.clear(); this.askedMine.clear(); this.changed(); }

  /** Fifty more, older than the oldest shown. */
  async older() {
    if (!this.more) return;
    const first = this.msgs[0]?.id;
    const r = await api.get<{ items: ChatMsg[]; more: boolean }>(`/chat/history?room=${this.room}${first ? `&before=${first}` : ''}`);
    const have = new Set(this.msgs.map((m) => m.id));
    this.msgs = [...r.items.filter((m) => !have.has(m.id)), ...this.msgs];
    this.more = r.more; this.changed();
  }
}
