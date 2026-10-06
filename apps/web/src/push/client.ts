/**
 * Push notifications on this device: the service worker, the browser's subscription, and what the Worker keeps for it
 * (worker/push.js: the wallet whose pets are watched, the kinds wanted, per-pet opt-outs, quiet hours). One small store
 * the sheet and the nudge read. Nothing here touches keys; the subscription is the browser's, the preferences are the
 * Worker's, and the page only carries the two between them.
 *
 * iPhone: push works only in the home-screen app (Safari 16.4+), so the sheet shows the install steps there first.
 */
import { useSyncExternalStore } from 'react';
import { api } from '../social/api';
import { social } from '../social/store';
import { ALL_KINDS, defaultKinds, type Kind } from './kinds';

export type Prefs = { kinds: Record<Kind, boolean>; petsOff: string[]; quiet: { from: number; to: number } | null; tz: number };
export type WatchedPet = { col: string; id: number; name: string };
export type PushState = {
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | 'unsupported';
  status: 'idle' | 'loading' | 'on' | 'off';
  busy: boolean;
  endpoint: string | null;
  address: string | null;       // the wallet the Worker watches for this subscription
  verified: boolean;            // the Worker saw a signed-in session for it (Emotown kinds reach it)
  pets: WatchedPet[];
  prefs: Prefs;
  error: string | null;
  open: boolean;
  wallet: string | null;        // the site's connected or remembered wallet, from App
};

const NUDGE_KEY = 'emogotchi.pushNudge';
const tz = () => -new Date().getTimezoneOffset();
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => (window.matchMedia?.('(display-mode: standalone)').matches ?? false) || (navigator as unknown as { standalone?: boolean }).standalone === true;
const freshPrefs = (): Prefs => ({ kinds: defaultKinds(), petsOff: [], quiet: null, tz: tz() });
const toUint8 = (b64u: string) => { const s = b64u.replace(/-/g, '+').replace(/_/g, '/'); const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''; return Uint8Array.from(atob(s + pad), (c) => c.charCodeAt(0)); };

/**
 * The browser's first `pushManager.subscribe` can hang without ever answering (seen in Chrome on a fresh profile: the
 * first call sat for ever while a second, made later, answered in under a second), so it is asked twice with a limit
 * each time, and a third silence is an error the sheet can show instead of a switch stuck busy.
 */
async function subscribeTwice(reg: ServiceWorkerRegistration, key: Uint8Array): Promise<PushSubscription> {
  const opts = { userVisibleOnly: true, applicationServerKey: key as BufferSource };
  for (let i = 0; i < 2; i++) {
    const r = await Promise.race([reg.pushManager.subscribe(opts), new Promise<null>((res) => setTimeout(() => res(null), 12_000))]);
    if (r) return r;
    const again = await reg.pushManager.getSubscription();   // the first call may have finished after all
    if (again) return again;
  }
  throw new Error("The browser's push service did not answer. Try again in a moment.");
}

class PushStore {
  private state: PushState = {
    supported: pushSupported(), ios: typeof navigator !== 'undefined' && isIOS(), standalone: typeof window !== 'undefined' && isStandalone(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    status: 'idle', busy: false, endpoint: null, address: null, verified: false, pets: [], prefs: freshPrefs(), error: null, open: false, wallet: null,
  };
  private subs = new Set<() => void>();
  private reg: ServiceWorkerRegistration | null = null;
  private loaded: Promise<void> | null = null;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.state;
  private set(p: Partial<PushState>) { this.state = { ...this.state, ...p }; for (const f of this.subs) f(); }

  /** Register the service worker (idempotent) and read the subscription this browser already has, if any. */
  load() {
    if (!this.state.supported) return Promise.resolve();
    if (!this.loaded) this.loaded = this.doLoad().catch((e) => { this.set({ status: 'off', error: null }); console.warn('[push] load', e); });
    return this.loaded;
  }
  private async doLoad() {
    this.set({ status: 'loading' });
    this.reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const sub = await this.reg.pushManager.getSubscription();
    if (!sub) { this.set({ status: 'off', endpoint: null }); return; }
    try {
      const r = await api.get<{ address: string | null; verified: boolean; pets: WatchedPet[]; prefs: Prefs }>(`/push/prefs?endpoint=${encodeURIComponent(sub.endpoint)}`);
      this.set({ status: 'on', endpoint: sub.endpoint, address: r.address, verified: r.verified, pets: r.pets, prefs: r.prefs });
      void this.align(sub);
    } catch (e) {
      // the Worker does not know this subscription (a wiped database, or it was made on another deploy): register it afresh
      if ((e as { status?: number }).status === 404) { await this.register(sub); return; }
      this.set({ status: 'on', endpoint: sub.endpoint });
    }
  }

  /** The site's wallet changed (App tells us): a subscription watching another wallet, or none, follows it. */
  setWallet(address: string | null) {
    const a = address ? address.toLowerCase() : null;
    if (a === this.state.wallet) return;
    this.set({ wallet: a });
    if (this.state.status === 'on') void this.load().then(() => this.realign());
  }
  /** Re-register when the Worker's record is behind this device: another wallet now, or a sign-in it has not seen. */
  private async align(sub: PushSubscription) {
    const w = this.state.wallet;
    const signedIn = social.get().status === 'in';
    if ((w && w !== this.state.address) || (signedIn && this.state.address === w && !this.state.verified)) await this.register(sub);
  }
  /** Re-check the Worker's record against this device (the wallet or the sign-in changed). */
  async realign() { const sub = await this.reg?.pushManager.getSubscription(); if (sub) await this.align(sub); }

  private async register(sub: PushSubscription) {
    const j = sub.toJSON();
    const r = await api.post<{ address: string | null; verified: boolean; pets: WatchedPet[]; prefs: Prefs; petsUnknown?: boolean }>('/push/subscribe', {
      subscription: { endpoint: sub.endpoint, keys: j.keys }, address: this.state.wallet, prefs: { ...this.state.prefs, tz: tz() }, tz: tz(), ua: navigator.userAgent.slice(0, 200),
    });
    this.set({ status: 'on', endpoint: sub.endpoint, address: r.address, verified: r.verified, pets: r.pets, prefs: r.prefs, error: r.petsUnknown ? 'Your pets could not be read just now; they will be picked up on the next look.' : null });
  }

  /** Ask for permission and subscribe. Call from a real tap (browsers require it). */
  async enable(): Promise<boolean> {
    if (!this.state.supported) return false;
    this.set({ busy: true, error: null });
    try {
      await this.load();
      // already granted: do not ask again (headless Chrome never answers a second prompt, and no browser needs one)
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      this.set({ permission: perm });
      if (perm !== 'granted') { this.set({ busy: false, error: perm === 'denied' ? 'Notifications are blocked for Emogotchi in your browser settings.' : null }); return false; }
      const { key } = await api.get<{ key: string }>('/push/vapid');
      const reg = this.reg ?? (await navigator.serviceWorker.ready);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await subscribeTwice(reg, toUint8(key));
      await this.register(sub);
      this.set({ busy: false });
      try { localStorage.setItem(NUDGE_KEY, 'on'); } catch { /* storage off */ }
      return true;
    } catch (e) {
      const m = (e as { message?: string }).message ?? String(e);
      this.set({ busy: false, error: /off: true|not switched on/i.test(m) ? 'Notifications are not switched on for the site yet.' : m });
      return false;
    }
  }

  async disable() {
    this.set({ busy: true, error: null });
    try {
      const sub = await this.reg?.pushManager.getSubscription();
      if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      this.set({ status: 'off', endpoint: null, address: null, verified: false, pets: [], busy: false });
    } catch (e) { this.set({ busy: false, error: String((e as { message?: string }).message ?? e) }); }
  }

  /** Change a preference; saved at once, shown at once. */
  async save(patch: Partial<Prefs>) {
    const prefs = { ...this.state.prefs, ...patch, tz: tz() };
    this.set({ prefs });
    if (!this.state.endpoint) return;
    try { await api.post('/push/prefs', { endpoint: this.state.endpoint, prefs }); } catch (e) { this.set({ error: String((e as { message?: string }).message ?? e) }); }
  }
  setKind(kind: Kind, on: boolean) { void this.save({ kinds: { ...this.state.prefs.kinds, [kind]: on } }); }
  setPet(key: string, on: boolean) { const off = new Set(this.state.prefs.petsOff); if (on) off.delete(key); else off.add(key); void this.save({ petsOff: [...off] }); }
  setQuiet(q: Prefs['quiet']) { void this.save({ quiet: q }); }

  async test() {
    if (!this.state.endpoint) return;
    try { await api.post('/push/test', { endpoint: this.state.endpoint }); } catch (e) { this.set({ error: String((e as { message?: string }).message ?? e) }); }
  }

  open() { this.set({ open: true, error: null }); void this.load(); }
  close() { this.set({ open: false }); }
  /** The one-time nudge on a pet's page: not yet answered, and nothing subscribed. */
  nudgeWanted() { if (!this.state.supported || this.state.status === 'on' || !this.state.wallet) return false; try { return !localStorage.getItem(NUDGE_KEY); } catch { return false; } }
  dismissNudge() { try { localStorage.setItem(NUDGE_KEY, 'no'); } catch { /* storage off */ } this.set({}); }
  allKinds(): Kind[] { return ALL_KINDS; }
}

export const push = new PushStore();
if (import.meta.env.DEV) (window as unknown as { __push?: PushStore }).__push = push;   // the browser check drives it
export const usePush = () => useSyncExternalStore(push.subscribe, push.get, push.get);
export const openNotifSheet = () => push.open();
export const setPushWallet = (address: string | null) => push.setWallet(address);
/** Called once at start: the service worker, and a re-registration when the Emotown sign-in changes. */
export function startPush() {
  if (!pushSupported()) return;
  void push.load();
  let last = social.get().status;
  social.subscribe(() => { const s = social.get().status; if (s !== last) { last = s; if (push.get().status === 'on') void push.load().then(() => push.realign()); } });
}
