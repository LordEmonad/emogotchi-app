/**
 * A person's page in Emotown: /u/<address>, or /u/<name> once they have claimed one. Unlisted, experimental.
 *
 * The banner is one of Emotown's streets; the avatar is their pet, drawn live by its rig and dressed from the chain.
 * Everything about their pets (how many, crowns, never died, cares, MON sent to the burn) is read live from the
 * contracts; the name, bio, links, follows and join date are theirs, from the town's own records. Plain text only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatView } from '@emo-pets/chain';
import { Header } from '../ui/Header';
import { SiteFooter } from '../ui/SiteFooter';
import { getProvider, EMPTY_WALLET, disconnect, restore, revokeInjected, type WalletState } from '../wallet';
import { PETS, fallbackName, petHref } from '../pets';
import { chainCfg } from '../game/chain';
import { api } from './api';
import { openInbox, InboxHost } from './Inbox';
import { Notifications } from './Notifications';
import { LivePet } from './LivePet';
import { FollowButton, SocialLinks, badgesOf, dmClosed, fallbackAvatar, statsOf, useEmoEstimate, useItems, useProfile, usePets, type HeldItem } from './profile';
import { SendSheet } from '../ui/SendSheet';
import { svgSrc } from '../ui/svgImg';
import { chainClient } from '../game/chain';
import { ProfileEditor } from './ProfileEditor';
import { reportSheet, ReportHost } from './Report';
import { askSignIn, SignInHost } from './SignIn';
import { social } from './store';
import { forgetCard } from './cards';
import type { Activity, Card, Profile } from './types';
import { Avatar, LinkGate, SafeText, ago, bannerBg, nameOf, profileHref, short, useSocial } from './ui';
import { cardUrl, picUrl, usePrivatePic } from './pics';
import { cardIsStale, refreshLinkCard } from './linkCard';
import { RoleMarks, RoleTags } from './RoleMarks';
import { RoleSheetHost, roleSheet } from './RolesAdmin';
import { rolesOf, useRoles } from './roles';
import './social.css';

const DID: Record<string, string> = {
  feed: 'had dinner', play: 'played', wash: 'had a bath', sleep: 'went to bed', clean: 'got cleaned up after', name: 'got a new name', named: 'got a new name',
  revive: 'came back to life', revived: 'came back to life', died: 'died', pet: 'got petted', screenshot: 'got screenshotted', slap: 'got slapped',
  squeeze: 'got squeezed', burn: 'caught fire', tung: 'went tung tung tung',
};
const MOOD: Record<string, string> = { content: 'Content', happy: 'Happy', hungry: 'Hungry', grubby: 'Grubby', bored: 'Bored', sleepy: 'Sleepy', sleeping: 'Asleep', sad: 'Sad', dead: 'A ghost' };
type Tab = 'pets' | 'items' | 'activity' | 'followers' | 'following';
const NO_ITEMS: number[] = [];

export function ProfilePage({ keyParam }: { keyParam: string }) {
  const s = useSocial();
  useRoles();
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  useEffect(() => { social.start(); void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, []);
  useEffect(() => { if (s.status === 'in') void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, [s.status]);
  const loaded = useProfile(keyParam);
  const { err, missing, reload, setP } = loaded;
  // the town's own records unreachable (the social Worker is down): a page for an ADDRESS still shows everything the
  // chain knows (its pets, their numbers); only the name, bio and follows wait for Emotown to come back
  const bare = !loaded.p && !!err && /^0x[0-9a-fA-F]{40}$/.test(keyParam);
  const p: Profile | null = loaded.p ?? (bare ? { address: keyParam.toLowerCase(), name: null, bio: '', avatar: null, avatarChosen: false, banner: 'hall', pic: null, bannerPic: null, card: null, socials: {}, joinedAt: null, resident: null, followers: 0, following: 0, named: false, admin: false } : null);
  // a send from this page reloads what the wallet holds
  const [nonce, setNonce] = useState(0);
  const { pets, worn } = usePets(p?.address ?? null, nonce);
  const { items, svgs } = useItems(p?.address ?? null, nonce);
  const [tab, setTab] = useState<Tab>('pets');
  const [sendingPet, setSendingPet] = useState<CatView | null>(null);
  const [sendingItem, setSendingItem] = useState<HeldItem | null>(null);
  const [editing, setEditing] = useState(false);
  // ?edit=1 (Emotown's "Edit profile"): open the editor once we know it is yours
  const askedEdit = useRef(new URLSearchParams(location.search).has('edit'));
  const [menu, setMenu] = useState(false);
  // their uploaded picture, until it cannot load (taken down a moment ago): then their pet, live
  const [picBroken, setPicBroken] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const mine = !!p && s.me?.address === p.address;
  // sending from your own profile: only with the wallet that holds them connected here (the one you signed in with)
  const canSend = mine && !!wallet.address && wallet.address.toLowerCase() === p.address.toLowerCase();
  useEffect(() => { if (canSend && chainClient && wallet.address) chainClient.setSigner({ provider: getProvider() as never, address: wallet.address as `0x${string}` }); }, [canSend, wallet.address]);
  const stats = useMemo(() => (pets ? statsOf(pets) : null), [pets]);
  const emo = useEmoEstimate(stats);
  const badges = p ? badgesOf(p, pets) : [];
  const hasRoles = !!p && rolesOf(p.address).length > 0;
  const admin = !!s.me?.admin;
  const avatar = p?.avatar ?? fallbackAvatar(pets);
  const avatarView = avatar ? pets?.find((v) => v.col === avatar.col && v.id === avatar.id) ?? null : null;
  const who = p ? nameOf(p) : '';
  const closed = p ? dmClosed(p, !!s.me) : null;

  useEffect(() => {
    if (!askedEdit.current || !mine) return;
    askedEdit.current = false; setEditing(true);
    // the link did its job: a reload should not open the editor again
    const u = new URL(location.href); u.searchParams.delete('edit'); history.replaceState(null, '', u.pathname + u.search);
  }, [mine]);
  // your link card (linkCard.ts): drawn quietly when it is missing or older than your profile, once per change, after
  // your pets and their outfits have loaded; then the profile is read again so the Share sheet shows the new one
  const cardFor = useRef<number | null>(null);
  useEffect(() => {
    if (!mine || !p || bare || editing || !pets || (pets.length > 0 && Object.keys(worn).length === 0)) return;
    if (!(s.me?.gate.ok || s.me?.admin) || !cardIsStale(p)) return;
    const stamp = p.updatedAt ?? 0;
    if (cardFor.current === stamp) return;
    cardFor.current = stamp;
    void refreshLinkCard(p, pets, worn).then(() => reload()).catch((e) => console.warn('[emotown] link card', e));
  }, [mine, p, bare, editing, pets, worn, s.me, reload]);
  // the address bar says the name once there is one
  useEffect(() => { if (p?.name && !location.pathname.endsWith(`/u/${p.name}`)) history.replaceState(null, '', `/u/${p.name}${location.search}`); }, [p?.name]);
  useEffect(() => { document.title = p ? `${who} · Emotown` : 'Emotown'; }, [p, who]);

  const out = () => { void social.signOut(); disconnect(); void revokeInjected(); setWallet(EMPTY_WALLET); };
  return (
    <div className="page so-page">
      <Header wallet={wallet} onConnect={() => askSignIn()} onDisconnect={out} compact />
      <main className="so-profile">
        <SocialBar />
        {missing && <div className="so-missing"><h1>Nobody by that name</h1><p>No one goes by <b>{keyParam}</b>. Names can change: try their address.</p><a className="btn btn-pink" href="/pets">Browse the pets</a></div>}
        {err && !p && <p className="lb-note">{s.status === 'down' ? "Emotown's records are resting right now. This profile comes back when they do." : err}</p>}
        {bare && <p className="lb-note">Emotown's records are resting, so this shows only what the chain knows: the pets. Names, follows and messages come back when it does.</p>}
        {!p && !missing && !err && <div className="so-hero skeleton" />}
        {p && (
          <>
            <section className="so-hero">
              <div className="so-banner" style={{ backgroundImage: bannerBg(p) }} />
              <div className="so-hero-row">
                <div className={`so-hero-pet${p.pic && picBroken !== p.pic ? ' is-pic' : ''}`} data-ch={avatar ? avatar.col : undefined}>
                  {p.pic && picBroken !== p.pic ? <img className="so-hero-img" src={picUrl(p.pic)} alt="" onError={() => setPicBroken(p.pic)} /> : avatar ? <LivePet pet={avatar} view={avatarView} worn={worn[`${avatar.col}:${avatar.id}`] ?? NO_ITEMS} /> : <span className="so-hero-empty">✦</span>}
                </div>
                <div className="so-hero-id">
                  <h1>{who}<RoleMarks address={p.address} /></h1>
                  <p className="so-hero-sub tnum">
                    <button type="button" className="so-copy" onClick={() => void navigator.clipboard?.writeText(p.address)} title="Copy the address">{p.name ? short(p.address) : 'Copy address'}</button>
                    {chainCfg?.explorer && <a href={`${chainCfg.explorer}/address/${p.address}`} target="_blank" rel="noreferrer">on chain ↗</a>}
                    {p.joinedAt ? <span>joined {new Date(p.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span> : <span>has not signed in to Emotown</span>}
                    <span className="so-counts"><button type="button" onClick={() => setTab('followers')}><b>{p.followers.toLocaleString('en-US')}</b> {p.followers === 1 ? 'follower' : 'followers'}</button><button type="button" onClick={() => setTab('following')}><b>{p.following.toLocaleString('en-US')}</b> following</button></span>
                    {p.me?.followedBy && <span className="so-follows-you">follows you</span>}
                  </p>
                </div>
                {!bare && <div className="so-hero-acts">
                  {mine ? <button className="so-btn primary" onClick={() => setEditing(true)}>Edit profile</button> : <FollowButton p={p} onChange={() => void reload()} />}
                  {mine && <button className="so-btn" onClick={() => setSharing(true)}>Share</button>}
                  {!mine && <button className="so-btn" disabled={!!s.me && !!closed} title={closed ?? undefined} onClick={() => openInbox(p.address)}>Message</button>}
                  {s.me && (!mine || admin) && <button className="so-btn icon" aria-label="More" onClick={() => setMenu(!menu)}>⋯</button>}
                  {menu && (
                    <div className="so-menu">
                      {admin && <button onClick={() => { setMenu(false); roleSheet({ address: p.address, who }); }}>Roles…</button>}
                      {!mine && <button onClick={() => { setMenu(false); void social.block(p.address, !p.me?.blocked).then(() => reload()); }}>{p.me?.blocked ? `Unblock ${who}` : `Block ${who}`}</button>}
                      {!mine && <button onClick={() => { setMenu(false); setSharing(true); }}>Share {who}'s profile</button>}
                      {!mine && <button onClick={() => { setMenu(false); reportSheet({ kind: 'profile', address: p.address, who }); }}>Report {who}</button>}
                    </div>
                  )}
                </div>}
              </div>
              {(hasRoles || badges.length > 0) && <div className="so-badges"><RoleTags address={p.address} />{badges.map((b) => <span key={b.key} className="so-badge-chip" title={b.tip}><i aria-hidden>{b.icon}</i>{b.label}</span>)}</div>}
              {p.bio && <p className="so-bio"><SafeText text={p.bio} from={who} /></p>}
              {!p.bio && mine && <p className="so-bio muted">Add a few words about you and your pets: <button className="so-textbtn" onClick={() => setEditing(true)}>edit your profile</button>.</p>}
              <SocialLinks socials={p.socials} who={who} />
              {closed && s.me && !mine && <p className="so-note">{closed}</p>}
              {sharing && createPortal(<ShareSheet p={p} mine={mine} who={who} onClose={() => setSharing(false)} />, document.body)}
              {mine && (p.held?.avatar || p.held?.banner) && <p className="so-note">Your new {p.held.avatar && p.held.banner ? 'picture and banner are' : p.held.avatar ? 'picture is' : 'banner is'} waiting for a quick check. Until then, everyone sees what was there before.</p>}
            </section>

            <section className="so-stats" aria-label="Their pets, in numbers">
              <Stat label="Pets" value={stats?.pets} />
              <Stat label="Crowns held" value={stats?.crowns} />
              <Stat label="Never died" value={stats?.neverDied} />
              <Stat label="Cares given" value={stats?.cares} title="Feeds, baths, play, naps and clean-ups across their pets, over each pet's whole life" />
              <Stat label="MON to the burn" value={stats ? Math.round(stats.burnMon * 10) / 10 : undefined} title="What their pets' care, names and revives sent to the EMO buy-and-burn, by each contract's own split" />
              <Stat label="≈ EMO burned" value={emo === null ? undefined : Math.round(emo)} title="An estimate: the chain burns EMO in batches, not per pet, so this is their MON to the burn at the price every burn of that collection has paid so far" />
            </section>

            <nav className="so-tabs big">{(['pets', 'items', 'activity', 'followers', 'following'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ pets: 'Pets', items: 'Items', activity: 'Activity', followers: 'Followers', following: 'Following' }[t]}{t === 'pets' && pets ? <small> {pets.length}</small> : t === 'items' && items ? <small> {items.reduce((a, i) => a + i.count, 0)}</small> : null}</button>)}</nav>
            {mine && !canSend && (tab === 'pets' || tab === 'items') && <p className="lb-note so-send-hint">To send your pets and items from here, <button type="button" className="so-textbtn" onClick={() => askSignIn()}>connect the wallet that holds them</button>.</p>}
            {tab === 'pets' && <PetGrid pets={pets} worn={worn} onSend={canSend ? setSendingPet : undefined} />}
            {tab === 'items' && <ItemGrid items={items} svgs={svgs} pets={pets} worn={worn} onSend={canSend ? setSendingItem : undefined} />}
            {sendingPet && canSend && wallet.address && <SendSheet what={{ kind: 'pet', col: sendingPet.col, id: sendingPet.id, name: sendingPet.name || fallbackName(sendingPet.col, sendingPet.id), view: sendingPet, worn: worn[`${sendingPet.col}:${sendingPet.id}`] ?? [] }} me={wallet.address} myPets={pets ?? []} onClose={() => setSendingPet(null)} onSent={() => setNonce((n) => n + 1)} />}
            {sendingItem && canSend && wallet.address && <SendSheet what={{ kind: 'item', id: sendingItem.id, name: sendingItem.name, svg: svgs[sendingItem.id] ?? null, held: sendingItem.count, wornBy: (pets ?? []).filter((v) => (worn[`${v.col}:${v.id}`] ?? []).includes(sendingItem.id)).map((v) => v.name || fallbackName(v.col, v.id)) }} me={wallet.address} myPets={pets ?? []} onClose={() => setSendingItem(null)} onSent={() => setNonce((n) => n + 1)} />}
            {tab === 'activity' && <ActivityList address={p.address} pets={pets} />}
            {(tab === 'followers' || tab === 'following') && <People address={p.address} which={tab} />}
          </>
        )}
      </main>
      <SiteFooter />
      {editing && p && <ProfileEditor p={p} onClose={() => setEditing(false)} onSaved={(n) => { forgetCard(n.address); setP(n); }} />}
      <SignInHost /><InboxHost /><ReportHost /><RoleSheetHost /><LinkGate />
    </div>
  );
}

/**
 * Signed in: your messages, notifications and profile, one row. Signed out: a way in. (Emotown itself is unlisted
 * while the operator tests it, so nothing here links to it.)
 */
function SocialBar() {
  const s = useSocial();
  const [notes, setNotes] = useState(false);
  if (s.status === 'down') return null;   // the page says what is missing, once
  if (!s.me) return (
    <div className="so-bar">
      <a className="so-btn" href="/emotown">Emotown ↗</a>
      {s.status === 'out' && <button className="so-btn primary" onClick={() => askSignIn('Sign in to follow people and message them.')}>Sign in</button>}
    </div>
  );
  return (
    <div className="so-bar">
      <a className="so-btn" href="/emotown">Emotown ↗</a>
      <button className="so-btn" onClick={() => openInbox()}>Messages{s.unread.dms ? <span className="so-badge">{s.unread.dms}</span> : null}</button>
      <span className="so-bar-pop">
        <button className="so-btn" onClick={() => setNotes(!notes)} aria-expanded={notes}>Notifications{s.unread.notifications ? <span className="so-badge">{s.unread.notifications}</span> : null}</button>
        {notes && <div className="so-pop-scrim" onClick={() => setNotes(false)} aria-hidden />}
        {notes && <Notifications onClose={() => setNotes(false)} onPerson={(a) => { location.href = `/u/${a}`; }} />}
      </span>
      <a className="so-btn" href={profileHref(s.me.profile)}>My profile</a>
    </div>
  );
}

function Stat({ label, value, title, onClick }: { label: string; value: number | undefined; title?: string; onClick?: () => void }) {
  const body = <><b className="tnum">{value === undefined ? '…' : value.toLocaleString('en-US')}</b><span>{label}</span></>;
  return onClick ? <button type="button" className="so-stat" onClick={onClick} title={title}>{body}</button> : <div className="so-stat" title={title}>{body}</div>;
}

function PetGrid({ pets, worn, onSend }: { pets: CatView[] | null; worn: Record<string, number[]>; onSend?: (v: CatView) => void }) {
  if (pets === null) return <p className="lb-note">Reading their pets off the chain…</p>;
  if (!pets.length) return <p className="lb-note">No pets in this wallet right now.</p>;
  return (
    <div className="so-pets">
      {pets.map((v) => {
        const mood = v.alive ? v.mood : 'dead';
        return (
          <div key={`${v.col}:${v.id}`} className="so-pet-cell">
          <a className="so-pet" href={petHref(v.col, v.id)}>
            <Avatar pet={{ col: v.col, id: v.id }} view={v} worn={worn[`${v.col}:${v.id}`]} size={88} />
            <b>{v.name || fallbackName(v.col, v.id)}</b>
            <span className="so-pet-sub"><i className="dot" style={{ background: PETS[v.col].color }} />{PETS[v.col].brand} #{v.id}</span>
            <span className="so-pet-chips"><span className={`chip chip-${mood}`}>{MOOD[mood] ?? mood}</span>{v.crowned && <span className="chip chip-crown">👑</span>}{v.alive && v.deaths === 0 && v.revives === 0 && <span className="chip chip-gold">never died</span>}</span>
            {v.alive && <span className="so-pet-meters">{[v.food, v.clean, v.fun, v.energy].map((n, i) => <i key={i} title={['Food', 'Clean', 'Fun', 'Energy'][i]}><b style={{ width: `${Math.max(0, Math.min(100, n))}%`, background: n < 20 ? '#E84D7F' : n < 35 ? '#F2B14A' : '#8FD16A' }} /></i>)}</span>}
          </a>
          {onSend && <button type="button" className="so-send-btn" onClick={() => onSend(v)}>Send</button>}
          </div>
        );
      })}
    </div>
  );
}

/** The items a wallet holds (the shop's ERC-1155s): each with its on-chain picture, how many, and which pets wear it. */
function ItemGrid({ items, svgs, pets, worn, onSend }: { items: HeldItem[] | null; svgs: Record<number, string>; pets: CatView[] | null; worn: Record<string, number[]>; onSend?: (it: HeldItem) => void }) {
  if (items === null) return <p className="lb-note">Reading their items off the chain…</p>;
  if (!items.length) return <p className="lb-note">No items in this wallet right now. <a href="/shop">The item shop</a> has free ones.</p>;
  return (
    <div className="so-pets so-items">
      {items.map((it) => {
        const on = (pets ?? []).filter((v) => (worn[`${v.col}:${v.id}`] ?? []).includes(it.id));
        return (
          <div key={it.id} className="so-pet-cell">
            <a className="so-pet so-item" href="/shop">
              {svgs[it.id] ? <img className="so-item-img" src={svgSrc(svgs[it.id]!)} alt="" width={88} height={88} /> : <span className="so-item-img" />}
              <b>{it.name}</b>
              <span className="so-pet-sub">{it.count === 1 ? 'one' : `× ${it.count}`}{it.soulbound ? ' · cannot be sent' : ''}</span>
              {on.length > 0 && <span className="so-item-on">on {on.map((v) => v.name || fallbackName(v.col, v.id)).join(', ')}</span>}
            </a>
            {onSend && !it.soulbound && <button type="button" className="so-send-btn" onClick={() => onSend(it)}>Send</button>}
          </div>
        );
      })}
    </div>
  );
}

function ActivityList({ address, pets }: { address: string; pets: CatView[] | null }) {
  const [data, setData] = useState<{ items: Activity[]; busy?: boolean; unavailable?: boolean } | null>(null);
  useEffect(() => { void api.get<{ items: Activity[]; busy?: boolean; unavailable?: boolean }>(`/profile/${address}/activity`).then(setData).catch(() => setData({ items: [], unavailable: true })); }, [address]);
  const nameFor = (a: Activity) => pets?.find((v) => v.col === a.col && v.id === a.id)?.name || fallbackName(a.col, a.id);
  if (!data) return <p className="lb-note">Reading the last three days off the chain…</p>;
  if (data.busy) return <p className="lb-note">The history reader is busy. Try again in a minute.</p>;
  if (data.unavailable) return <p className="lb-note">Recent activity is not available right now.</p>;
  if (!data.items.length) return <p className="lb-note">Nothing happened to their pets in the last three days.</p>;
  return (
    <ul className="so-activity">
      {data.items.map((a, i) => (
        <li key={i}>
          <a href={petHref(a.col, a.id)}><Avatar pet={{ col: a.col, id: a.id }} size={30} /></a>
          <span><a href={petHref(a.col, a.id)}><b>{nameFor(a)}</b></a> {DID[a.what] ?? a.what}{a.by && a.by !== address ? <> (by <a href={`/u/${a.by}`}>{short(a.by)}</a>)</> : null}</span>
          <time>{ago(a.at)}</time>
        </li>
      ))}
    </ul>
  );
}

function People({ address, which }: { address: string; which: 'followers' | 'following' }) {
  const [items, setItems] = useState<(Card & { at: number })[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const load = useCallback((before?: number) => api.get<{ items: (Card & { at: number })[]; next: number | null }>(`/profile/${address}/${which}${before ? `?before=${before}` : ''}`).then((r) => { setItems((p) => (before ? [...(p ?? []), ...r.items] : r.items)); setNext(r.next); }).catch(() => setItems([])), [address, which]);
  useEffect(() => { setItems(null); void load(); }, [load]);
  if (items === null) return <p className="lb-note">…</p>;
  if (!items.length) return <p className="lb-note">{which === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>;
  return (
    <>
      <ul className="so-people">{items.map((c) => <li key={c.address}><a href={profileHref(c)}><Avatar pet={c.pet} pic={c.pic} size={40} /><b>{nameOf(c)}<RoleMarks address={c.address} /></b><span className="tnum">{short(c.address)}</span></a></li>)}</ul>
      {next && <button className="so-older" onClick={() => void load(next)}>More</button>}
    </>
  );
}

/** Share a profile: the card its link shows wherever it is posted, the link, Copy, and the phone's own share sheet. */
function ShareSheet({ p, mine, who, onClose }: { p: Profile; mine: boolean; who: string; onClose: () => void }) {
  const link = `${location.origin}/u/${p.name ?? p.address}`;
  const held = mine && p.held?.card?.status === 'held' ? p.held.card.id : null;
  const heldUrl = usePrivatePic(held);
  const src = p.card ? cardUrl(p.card) : heldUrl;
  const [copied, setCopied] = useState(false);
  const [broken, setBroken] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal so-share" role="dialog" aria-modal="true" aria-label="Share">
        <div className="modal-head"><h2>{mine ? 'Share your profile' : `Share ${who}`}</h2><button className="modal-x" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="modal-sub">{mine ? 'Wherever you post your link, this card comes with it.' : `Wherever this link is posted, this card comes with it.`}</p>
        <div className="so-share-card">
          {src && !broken ? <img src={src} alt={`${who}'s link card`} onError={() => setBroken(true)} /> : <span>{mine ? 'Your card is being made. A link shared before it is ready shows your pet.' : 'Their link shows their pet.'}</span>}
        </div>
        {held && !p.card && <p className="so-note">Your card is waiting for a quick check.</p>}
        <div className="so-share-link" translate="no">{link}</div>
        <div className="pk-actions">
          <button className="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}); }}>{copied ? 'Copied' : 'Copy link'}</button>
          {canShare && <button className="btn btn-pink" onClick={() => { void navigator.share({ url: link, title: `${who} · Emotown` }).catch(() => {}); }}>Share…</button>}
        </div>
      </div>
    </div>
  );
}
