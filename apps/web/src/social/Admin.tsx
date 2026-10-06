/**
 * The operator's tools (admins only; the Worker checks, this only draws): reports with a copy of what was reported and
 * one-tap actions, uploaded pictures (the mode switch, the ones waiting, the ones up), who is muted or banned, slow mode
 * for the square, the word filter, roles (RolesAdmin.tsx), and the log of every admin act.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Card } from './types';
import { Avatar, ago, nameOf, profileHref } from './ui';
import { cardUrl, picUrl, usePrivatePic } from './pics';
import type { Gif } from './rules';
import { GifView } from './compose';
import { social } from './store';
import { RolesTab } from './RolesAdmin';

type Report = { id: number; kind: 'chat' | 'dm' | 'profile'; ref: string | null; reporter: string; target: Card; reason: string; note: string | null; snapshot: { text?: string; name?: string; bio?: string; gif?: Gif } | null; at: number; resolved: { at: number; by: string; how: string } | null; against: number; muted: boolean; banned: boolean };
type Person = Card & { until: number; reason: string | null };
type Tab = 'reports' | 'pics' | 'people' | 'roles' | 'room' | 'filter' | 'log';
type PicItem = { id: string; kind: 'avatar' | 'banner' | 'card'; status: 'held' | 'live' | 'refused'; screen: 'safe' | 'unsafe' | 'error' | null; at: number; who: Card };
type PicMode = 'screen' | 'review' | 'off';

export function AdminPanel({ onClose, slow }: { onClose: () => void; slow: number }) {
  const [tab, setTab] = useState<Tab>('reports');
  return (
    <div className="so-drawer-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="so-drawer so-admin" role="dialog" aria-modal="true" aria-label="Admin">
        <header className="so-drawer-head"><h2>Admin</h2><button className="tc-close" onClick={onClose} aria-label="Close">×</button></header>
        <nav className="so-tabs">{(['reports', 'pics', 'people', 'roles', 'room', 'filter', 'log'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ reports: 'Reports', pics: 'Pictures', people: 'Muted & banned', roles: 'Roles', room: 'Square', filter: 'Filter', log: 'Log' }[t]}</button>)}</nav>
        <div className="so-drawer-body">
          {tab === 'reports' && <Reports />}
          {tab === 'pics' && <Pics />}
          {tab === 'people' && <People />}
          {tab === 'roles' && <RolesTab />}
          {tab === 'room' && <Room slow={slow} />}
          {tab === 'filter' && <Filter />}
          {tab === 'log' && <Log />}
        </div>
      </aside>
    </div>
  );
}

function useList<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.get<T>(path).then((d) => { setData(d); setErr(null); }).catch((e) => setErr((e as Error).message)), [path]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}
function Act({ label, run, danger, confirmText }: { label: string; run: () => Promise<unknown>; danger?: boolean; confirmText?: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return <><button className={`so-btn small${danger ? ' danger' : ''}`} disabled={busy} onClick={async () => { if (confirmText && !confirm(confirmText)) return; setBusy(true); setErr(null); try { await run(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>{label}</button>{err && <span className="so-err">{err}</span>}</>;
}

function Reports() {
  const [all, setAll] = useState(false);
  const { data, err, load } = useList<{ items: Report[] }>(`/admin/reports${all ? '?all=1' : ''}`);
  const act = (path: string, body: unknown) => api.post(path, body).then(() => load());
  return (
    <>
      <label className="so-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show resolved</label>
      {err && <p className="so-err">{err}</p>}
      {data?.items.length === 0 && <p className="so-empty">No reports waiting.</p>}
      {data?.items.map((r) => (
        <article key={r.id} className={`so-report-row${r.resolved ? ' done' : ''}`}>
          <div className="so-report-top">
            <a href={profileHref(r.target)} className="so-who"><Avatar pet={r.target.pet} pic={r.target.pic} size={28} /><b>{nameOf(r.target)}</b></a>
            <span className="chip">{r.kind}</span><span className="chip chip-hungry">{r.reason}</span>
            {r.against > 1 && <span className="chip">{r.against} reports</span>}
            {r.muted && <span className="chip chip-sleepy">muted</span>}{r.banned && <span className="chip chip-sad">banned</span>}
            <time>{ago(r.at)}</time>
          </div>
          {r.snapshot?.text && <blockquote className="so-quote">{r.snapshot.text}</blockquote>}
          {r.snapshot?.gif && <GifView g={r.snapshot.gif} max={200} maxH={160} />}
          {r.kind === 'profile' && r.snapshot && <blockquote className="so-quote">{r.snapshot.name ?? '(no name)'}{r.snapshot.bio ? ` · ${r.snapshot.bio}` : ''}</blockquote>}
          {r.note && <p className="so-report-note">Reporter says: {r.note}</p>}
          {r.resolved ? <p className="so-hint">Resolved {ago(r.resolved.at)}: {r.resolved.how}</p> : (
            <div className="so-report-acts">
              {r.kind === 'chat' && r.ref && <Act label="Delete message" run={() => act('/admin/delete', { id: Number(r.ref) }).then(() => act('/admin/resolve', { id: r.id, resolution: 'deleted' }))} />}
              <Act label="Mute 1h" run={() => act('/admin/mute', { address: r.target.address, minutes: 60, reason: r.reason }).then(() => act('/admin/resolve', { id: r.id, resolution: 'muted 1h' }))} />
              <Act label="Mute 1 day" run={() => act('/admin/mute', { address: r.target.address, minutes: 1440, reason: r.reason }).then(() => act('/admin/resolve', { id: r.id, resolution: 'muted 1d' }))} />
              <Act label="Ban + remove" danger confirmText={`Ban ${nameOf(r.target)} for good and remove everything they said in the square?`} run={() => act('/admin/ban', { address: r.target.address, purge: true, reason: r.reason }).then(() => act('/admin/resolve', { id: r.id, resolution: 'banned' }))} />
              {r.kind === 'profile' && <Act label="Reset name and bio" run={() => act('/admin/reset-profile', { address: r.target.address }).then(() => act('/admin/resolve', { id: r.id, resolution: 'profile reset' }))} />}
              <Act label="Dismiss" run={() => act('/admin/resolve', { id: r.id, resolution: 'dismissed' })} />
            </div>
          )}
        </article>
      ))}
    </>
  );
}

function People() {
  const { data, err, load } = useList<{ muted: Person[]; banned: Person[] }>('/admin/people');
  const row = (p: Person, undo: string, label: string) => (
    <li key={p.address} className="so-person-row">
      <a href={profileHref(p)} className="so-who"><Avatar pet={p.pet} pic={p.pic} size={26} /><b>{nameOf(p)}</b></a>
      <span className="so-hint">{p.until > 3e13 ? 'for good' : `until ${new Date(p.until).toLocaleString()}`}{p.reason ? ` · ${p.reason}` : ''}</span>
      <Act label={label} run={() => api.post(undo, { address: p.address }).then(() => load())} />
    </li>
  );
  return (
    <>
      {err && <p className="so-err">{err}</p>}
      <h3 className="so-h3">Muted</h3>
      {data?.muted.length === 0 && <p className="so-empty">Nobody.</p>}
      <ul className="so-plain">{data?.muted.map((p) => row(p, '/admin/unmute', 'Unmute'))}</ul>
      <h3 className="so-h3">Banned</h3>
      {data?.banned.length === 0 && <p className="so-empty">Nobody.</p>}
      <ul className="so-plain">{data?.banned.map((p) => row(p, '/admin/unban', 'Unban'))}</ul>
    </>
  );
}

function Room({ slow }: { slow: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  const set = (seconds: number) => api.post<{ slow: number }>('/admin/slow', { room: 'square', seconds }).then((r) => setMsg(r.slow ? `Slow mode: one message every ${r.slow} seconds each.` : 'Slow mode is off.'));
  return (
    <>
      <p className="so-hint">Slow mode now: {slow ? `${slow} seconds` : 'off'}. Everyone except admins waits this long between messages.</p>
      <div className="so-report-acts">{[0, 5, 15, 30, 60, 300].map((s) => <Act key={s} label={s ? `${s}s` : 'Off'} run={() => set(s)} />)}</div>
      {msg && <p className="so-hint">{msg}</p>}
    </>
  );
}

function Filter() {
  const { data, err, load } = useList<{ items: { word: string; by: string; at: number }[] }>('/admin/filter');
  const [word, setWord] = useState('');
  return (
    <>
      <p className="so-hint">On top of the built-in list of slurs. A word here blocks any message, name or bio containing it (words of five letters or more also when hidden inside other letters).</p>
      <form className="so-inline-form" onSubmit={(e) => { e.preventDefault(); if (word.trim()) void api.post('/admin/filter', { word }).then(() => { setWord(''); void load(); }); }}>
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Add a word" maxLength={40} /><button className="so-btn small primary" type="submit">Add</button>
      </form>
      {err && <p className="so-err">{err}</p>}
      <ul className="so-plain">{data?.items.map((w) => <li key={w.word} className="so-person-row"><code>{w.word}</code><span className="so-hint">{ago(w.at)}</span><Act label="Remove" run={() => api.post('/admin/filter', { word: w.word, remove: true }).then(() => load())} /></li>)}</ul>
    </>
  );
}

function Log() {
  const { data, err } = useList<{ items: { id: number; admin: string; action: string; target: string | null; detail: unknown; created_at: number }[] }>('/admin/log');
  return (
    <>
      {err && <p className="so-err">{err}</p>}
      <ul className="so-plain so-log">{data?.items.map((l) => <li key={l.id}><time>{ago(l.created_at)}</time> <b>{l.action}</b> {l.target ? <code>{l.target.slice(0, 10)}…</code> : null} <span className="so-hint">{l.detail ? JSON.stringify(l.detail) : ''}</span></li>)}</ul>
    </>
  );
}

const MODES: { mode: PicMode; label: string; tip: string }[] = [
  { mode: 'screen', label: 'Checked automatically', tip: 'A clean picture is up at once; anything the check flags, or cannot judge, waits here for you.' },
  { mode: 'review', label: 'I approve each one', tip: 'Every picture waits here until you approve it.' },
  { mode: 'off', label: 'Off', tip: 'No uploads, and no uploaded picture is shown anywhere: everyone falls back to their pet and Emotown\'s banners. Within a few minutes everywhere.' },
];

function Pics() {
  const [status, setStatus] = useState<PicItem['status']>('held');
  const { data, err, load } = useList<{ mode: PicMode; held: number; items: PicItem[] }>(`/admin/pics?status=${status}`);
  const act = (path: string, body: unknown) => api.post(path, body).then(() => { void load(); void social.refresh(); });
  // new pictures arrive while this is open: look again every 20 s (and on every tap of a tab below)
  useEffect(() => { const i = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 20_000); return () => clearInterval(i); }, [load]);
  return (
    <>
      <fieldset className="so-admin-modes">
        <legend>Uploaded pictures</legend>
        {MODES.map((m) => (
          <label key={m.mode} className={data?.mode === m.mode ? 'on' : ''}>
            <input type="radio" name="pics-mode" checked={data?.mode === m.mode} onChange={() => void act('/admin/pics-mode', { mode: m.mode })} />
            <span><b>{m.label}</b><small>{m.tip}</small></span>
          </label>
        ))}
      </fieldset>
      <nav className="so-subtabs">
        {(['held', 'live', 'refused'] as const).map((st) => <button key={st} className={status === st ? 'on' : ''} onClick={() => { if (status === st) void load(); else setStatus(st); }}>{st === 'held' ? `Waiting${data?.held ? ` (${data.held})` : ''}` : st === 'live' ? 'Up now' : 'Refused'}</button>)}
      </nav>
      {err && <p className="so-err">{err}</p>}
      {data?.items.length === 0 && <p className="so-empty">{status === 'held' ? 'Nothing waiting.' : status === 'live' ? 'No uploaded pictures are up.' : 'None refused.'}</p>}
      {data?.items.map((it) => (
        <article key={it.id} className="so-pic-row">
          <PicThumb it={it} />
          <div className="so-pic-meta">
            <a href={profileHref(it.who)} className="so-who"><Avatar pet={it.who.pet} size={24} /><b>{nameOf(it.who)}</b></a>
            <p>
              <span className="chip">{it.kind === 'avatar' ? 'picture' : it.kind === 'banner' ? 'banner' : 'link card'}</span>
              {it.screen === 'unsafe' && <span className="chip chip-sad">flagged by the check</span>}
              {it.screen === 'error' && <span className="chip chip-sleepy">the check could not judge it</span>}
              <time>{ago(it.at)}</time>
            </p>
            <div className="so-report-acts">
              {it.status === 'held' && <Act label="Approve" run={() => act('/admin/pic-approve', { id: it.id })} />}
              {it.status === 'held' && <Act label="Refuse" danger run={() => act('/admin/pic-refuse', { id: it.id })} />}
              {it.status === 'live' && <Act label="Take down" danger confirmText={`Take ${nameOf(it.who)}'s ${it.kind === 'avatar' ? 'picture' : it.kind === 'banner' ? 'banner' : 'link card'} down?`} run={() => act('/admin/pic-refuse', { id: it.id })} />}
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

/** A waiting picture is fetched with the admin's session (never public); one that is up comes from the media host. */
function PicThumb({ it }: { it: PicItem }) {
  const held = usePrivatePic(it.status === 'held' ? it.id : null);
  const src = it.status === 'live' ? (it.kind === 'card' ? cardUrl(it.id) : picUrl(it.id)) : held;
  return <span className={`so-pic-thumb ${it.kind}`}>{src ? <img src={src} alt="" /> : <i>{it.status === 'refused' ? 'deleted' : '…'}</i>}</span>;
}
