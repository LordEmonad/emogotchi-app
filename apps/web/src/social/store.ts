/**
 * Who you are in Emotown, on this page: signed in or not, your profile, your gate, who you follow and block, and your
 * unread counts; plus the live pipe to your inbox (DMs and notifications arrive over it the moment they are sent).
 *
 * Signing in is Sign-In with Ethereum: the Worker writes the message, the connected wallet signs it (personal_sign),
 * the Worker checks it and sets an HttpOnly session cookie. The page never holds the session and nothing here is
 * kept in localStorage. Every part of this degrades: if the Worker is down, the town carries on and this says "down".
 */
import { cue } from '../sound/cue';
import { stringToHex } from 'viem';
import { api, ApiError, socketUrl } from './api';
import { onAccountsChanged, walletAddressNow } from '../wallet';
import type { Dm, Gate, Me, MeIn, Note } from './types';

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
export type SocialState = {
  status: 'loading' | 'out' | 'in' | 'down';
  me: MeIn | null;
  following: ReadonlySet<string>;
  blocked: ReadonlySet<string>;
  unread: { dms: number; notifications: number };
  /** the inbox socket is connected (live DMs and notifications) */
  live: boolean;
};
export type SocialEvent =
  | { t: 'dm'; m: Dm }
  | { t: 'dm_read'; conv: string; upTo: number }
  | { t: 'dm_react'; id: number; conv: string; by: string; emoji: string | null }
  | { t: 'notification'; n: Omit<Note, 'read' | 'name' | 'pet'> }
  | { t: 'notifications_read'; upTo: number }
  | { t: 'blocked'; address: string; on: boolean };

const EMPTY = new Set<string>();

class SocialStore {
  private state: SocialState = { status: 'loading', me: null, following: EMPTY, blocked: EMPTY, unread: { dms: 0, notifications: 0 }, live: false };
  private subs = new Set<() => void>();
  private listeners = new Set<(e: SocialEvent) => void>();
  private started = false;
  private ws: WebSocket | null = null;
  private wsTimer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private backoff = 1000;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  get = () => this.state;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  /** DMs, notifications and the rest as they arrive */
  on(f: (e: SocialEvent) => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  private set(p: Partial<SocialState>) { this.state = { ...this.state, ...p }; for (const f of this.subs) f(); }

  /** Look once, and every five minutes (a session refresh re-reads the gate on the Worker). */
  start() {
    if (this.started) return;
    this.started = true;
    void this.refresh();
    this.refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') void this.refresh(); }, 5 * 60_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.state.status === 'in' && !this.ws) this.connect(); });
    // the session follows the wallet: switch accounts or disconnect the site in the extension and Emotown signs out
    // (a player signed in with one wallet, switched to the one holding their cat, and stayed signed in as the first
    // until they cleared their cookies)
    onAccountsChanged(() => { void this.syncWallet(); });
  }

  /**
   * Signed in as one address while the site's wallet is now another (or the browser wallet disconnected this site):
   * sign out, so what Emotown thinks is "you" is always the wallet you are using. With no wallet connection to go by
   * (never connected here, WalletConnect, a phone reading the town) the session is left alone.
   */
  private async syncWallet() {
    const me = this.state.me;
    if (this.state.status !== 'in' || !me) return;
    const now = await walletAddressNow();
    if (now === undefined) return;
    if (now === null || now.toLowerCase() !== me.address.toLowerCase()) await this.signOut();
  }

  async refresh(): Promise<Me | null> {
    try {
      const me = await api.get<Me>('/me');
      if (!me.signedIn) { this.closeSocket(); this.set({ status: 'out', me: null, following: EMPTY, blocked: EMPTY, unread: { dms: 0, notifications: 0 } }); return me; }
      this.set({ status: 'in', me, following: new Set(me.following), blocked: new Set(me.blocked), unread: me.unread });
      if (!this.ws) this.connect();
      void this.syncWallet();
      return me;
    } catch (e) {
      // the Worker is down or not deployed: the town works without any of this
      if (this.state.status === 'loading' || (e instanceof ApiError && e.status >= 500)) this.set({ status: this.state.me ? this.state.status : 'down' });
      return null;
    }
  }

  /**
   * Sign in with the connected wallet. The message comes from the Worker; the wallet shows it and signs it (a passkey
   * account shows it in full on its own sheet and signs only on a real press). Nothing is sent on chain.
   */
  async signIn(provider: Eip1193, address: string): Promise<MeIn> {
    const { message } = await api.get<{ message: string }>(`/auth/nonce?address=${encodeURIComponent(address)}`);
    let signature: string;
    try {
      signature = await provider.request({ method: 'personal_sign', params: [stringToHex(message), address] }) as string;
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 4001) throw new Error('Sign-in cancelled.');
      throw new Error((e as Error)?.message?.split('\n')[0] || 'Your wallet could not sign in.');
    }
    await api.post('/auth/verify', { message, signature });
    const me = await this.refresh();
    if (!me || !me.signedIn) throw new Error('Signed in, but Emotown could not load your profile. Reload the page.');
    return me;
  }

  async signOut() {
    try { await api.post('/auth/logout'); } catch { /* the cookie goes anyway on the next sign-in */ }
    this.closeSocket();
    this.set({ status: 'out', me: null, following: EMPTY, blocked: EMPTY, unread: { dms: 0, notifications: 0 } });
  }

  /** Right after naming a pet: look at the chain again now instead of in twenty seconds. */
  async refreshGate(): Promise<Gate> {
    const g = await api.post<Gate>('/gate/refresh');
    if (this.state.me) this.set({ me: { ...this.state.me, gate: g } });
    return g;
  }

  async follow(address: string, on: boolean) {
    const a = address.toLowerCase();
    const next = new Set(this.state.following); if (on) next.add(a); else next.delete(a);
    const prev = this.state.following;
    this.set({ following: next });
    try { await api.post(on ? '/follow' : '/unfollow', { address: a }); } catch (e) { this.set({ following: prev }); throw e; }
  }
  async block(address: string, on: boolean) {
    const a = address.toLowerCase();
    const blocked = new Set(this.state.blocked); if (on) blocked.add(a); else blocked.delete(a);
    const following = new Set(this.state.following); if (on) following.delete(a);
    const prev = { blocked: this.state.blocked, following: this.state.following };
    this.set({ blocked, following });
    try { await api.post(on ? '/block' : '/unblock', { address: a }); } catch (e) { this.set(prev); throw e; }
  }
  setUnread(u: Partial<SocialState['unread']>) { this.set({ unread: { ...this.state.unread, ...u } }); }

  // ---------------------------------------------------------------- the inbox socket
  private connect() {
    if (this.ws || this.state.status !== 'in') return;
    let ws: WebSocket;
    try { ws = new WebSocket(socketUrl('/inbox/ws')); } catch { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.backoff = 1000; this.set({ live: true }); this.ping = setInterval(() => { try { ws.send('{"t":"ping"}'); } catch { /* closing */ } }, 25_000); };
    ws.onmessage = (ev) => {
      let e: SocialEvent | { t: string };
      try { e = JSON.parse(String(ev.data)); } catch { return; }
      this.apply(e as SocialEvent);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null; this.set({ live: false });
      if (this.ping) { clearInterval(this.ping); this.ping = null; }
      if (ev.code === 4003) { void this.refresh(); return; }   // signed out elsewhere, or banned
      this.retry();
    };
  }
  private retry() {
    if (this.wsTimer || this.state.status !== 'in') return;
    const wait = this.backoff; this.backoff = Math.min(30_000, this.backoff * 2);
    this.wsTimer = setTimeout(() => { this.wsTimer = null; if (document.visibilityState === 'visible') this.connect(); }, wait);
  }
  private closeSocket() {
    if (this.wsTimer) { clearTimeout(this.wsTimer); this.wsTimer = null; }
    if (this.ping) { clearInterval(this.ping); this.ping = null; }
    const ws = this.ws; this.ws = null;
    try { ws?.close(1000); } catch { /* gone */ }
    if (this.state.live) this.set({ live: false });
  }
  /** the badges, re-read from the Worker (it collapses a run of DMs into one notification; the page cannot know) */
  private countsTimer: ReturnType<typeof setTimeout> | null = null;
  recount() {
    if (this.countsTimer) return;
    this.countsTimer = setTimeout(() => {
      this.countsTimer = null;
      void api.get<SocialState['unread']>('/unread').then((u) => this.set({ unread: u })).catch(() => {});
    }, 350);
  }
  private apply(e: SocialEvent) {
    switch (e.t) {
      case 'dm': case 'notification': case 'dm_read': case 'notifications_read':
        this.recount();
        // heard: a message to you, a mention or a reply, anything else new (your own messages, from another tab, are not)
        if (e.t === 'dm' && e.m.from.toLowerCase() !== this.state.me?.address.toLowerCase()) cue('notify.dm');
        else if (e.t === 'notification' && e.n.kind !== 'dm') cue(e.n.kind === 'mention' || e.n.kind === 'reply' ? 'notify.mention' : 'notify.bell');
        // a verdict on a picture you uploaded changes your own profile: read it again
        if (e.t === 'notification' && e.n.kind === 'pic') void this.refresh().catch(() => {});
        break;
      case 'dm_react': break;   // the open conversation shows it; nothing to count
      case 'blocked': {
        const blocked = new Set(this.state.blocked); if (e.on) blocked.add(e.address); else blocked.delete(e.address);
        this.set({ blocked });
        break;
      }
      default: return;
    }
    for (const f of this.listeners) { try { f(e); } catch { /* a listener's problem */ } }
  }
}

export const social = new SocialStore();
