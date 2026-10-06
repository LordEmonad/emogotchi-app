/**
 * Making and handing out roles (admins only; the Worker checks, this only draws): the Roles tab in Admin tools (every
 * role, its holders, give by name or address, order, edit, delete) and the sheet an admin opens from anyone's card,
 * profile or message ("Roles…": tick the roles they hold, or make a new one for them on the spot).
 */
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import { ROLE_COLORS, ROLE_LIMITS, checkRoleName, cleanEmoji, type RoleColor } from './rules';
import { allRoles, applyRoles, rolesOf, useRoles, type Role, type RoleSnap } from './roles';
import { RoleChip } from './RoleMarks';
import type { Card } from './types';
import { Avatar, ago, nameOf, profileHref } from './ui';

const EmojiPicker = lazy(() => import('./EmojiPicker'));
const COLOR_NAME: Record<RoleColor, string> = { pink: 'Pink', gold: 'Gold', mint: 'Mint', sky: 'Sky', violet: 'Violet', coral: 'Coral', lime: 'Lime', silver: 'Silver' };
type Saved = { ok: true; id: number; snap: RoleSnap };
type AdminRole = Role & { members: (Card & { at: number })[] };

// ------------------------------------------------------------------ a role's name, emoji and colour

export function RoleForm({ initial, submit = 'Save', onSaved, onCancel }: { initial?: Role; submit?: string; onSaved: (id: number) => void | Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [color, setColor] = useState<RoleColor>(initial?.color ?? 'pink');
  const [picking, setPicking] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = checkRoleName(name);
  const ok = n.ok && !!emoji && !busy;
  const save = async () => {
    if (!n.ok) { setErr(n.error); return; }
    if (!emoji) { setErr('Pick one emoji for the role.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post<Saved>('/admin/role-save', { id: initial?.id, name: n.name, emoji, color });
      applyRoles(r.snap);
      await onSaved(r.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <form className="so-role-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="so-role-form-row">
        <button type="button" className={`so-role-emoji${emoji ? '' : ' empty'}`} onClick={() => setPicking(!picking)} aria-expanded={picking} aria-label={emoji ? 'Change the emoji' : 'Pick an emoji'} title={emoji ? 'Change the emoji' : 'Pick an emoji'}>{emoji ?? '+'}</button>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name, like OG or Degen" aria-label="Role name" maxLength={ROLE_LIMITS.name * 2} autoFocus={!!initial} />
      </div>
      {picking && (
        <div className="so-role-pick">
          <Suspense fallback={<p className="so-pick-note">Opening…</p>}>
            <EmojiPicker onPick={(e) => { const c = cleanEmoji(e); if (c) { setEmoji(c); setPicking(false); } }} />
          </Suspense>
        </div>
      )}
      <div className="so-role-swatches" role="radiogroup" aria-label="Colour">
        {ROLE_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={COLOR_NAME[c]} title={COLOR_NAME[c]} className={`so-role-swatch c-${c}${color === c ? ' on' : ''}`} onClick={() => setColor(c)} />)}
      </div>
      <div className="so-role-form-foot">
        <span className="so-role-preview">{emoji && n.ok ? <RoleChip r={{ id: 0, name: n.name, emoji, color }} /> : <span className="so-hint">{!emoji ? 'Pick an emoji' : 'Name it'}</span>}</span>
        <button type="button" className="so-btn small" onClick={onCancel}>Cancel</button>
        <button type="submit" className="so-btn small primary" disabled={!ok}>{busy ? 'Saving…' : submit}</button>
      </div>
      {err && <p className="so-err" role="alert">{err}</p>}
    </form>
  );
}

// ------------------------------------------------------------------ Admin tools → Roles

export function RolesTab() {
  const [data, setData] = useState<{ roles: AdminRole[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => api.get<{ roles: AdminRole[] }>('/admin/roles').then((d) => { setData(d); setErr(null); }).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { void load(); }, [load]);
  const act = async (path: string, body: unknown) => {
    setErr(null);
    try { const r = await api.post<{ snap: RoleSnap | null }>(path, body); applyRoles(r.snap); await load(); }
    catch (e) { setErr((e as Error).message); }
  };
  const roles = data?.roles ?? [];
  return (
    <>
      <p className="so-hint">Tags you hand out. A role's emoji goes by its holders' names everywhere (their first {ROLE_LIMITS.shown}, in this order); its tag shows on their profile and card. Roles give no powers.</p>
      {err && <p className="so-err">{err}</p>}
      {making
        ? <RoleForm submit="Make the role" onSaved={async (id) => { setMaking(false); setOpen(id); await load(); }} onCancel={() => setMaking(false)} />
        : <button className="so-btn small primary so-role-new" disabled={roles.length >= ROLE_LIMITS.roles} onClick={() => setMaking(true)}>New role</button>}
      {data && roles.length === 0 && !making && <p className="so-empty">No roles yet.</p>}
      <ul className="so-plain">
        {roles.map((r, i) => (
          <li key={r.id} className="so-role-row">
            {editing === r.id ? <RoleForm initial={r} onSaved={async () => { setEditing(null); await load(); }} onCancel={() => setEditing(null)} /> : (
              <div className="so-role-top">
                <RoleChip r={r} />
                <button type="button" className="so-textbtn" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>{r.members.length === 1 ? '1 person' : `${r.members.length} people`}</button>
                <span className="so-role-tools">
                  <button type="button" className="so-btn small icon" disabled={i === 0} aria-label={`Move ${r.name} up`} title="Move up" onClick={() => void act('/admin/role-move', { id: r.id, dir: -1 })}>↑</button>
                  <button type="button" className="so-btn small icon" disabled={i === roles.length - 1} aria-label={`Move ${r.name} down`} title="Move down" onClick={() => void act('/admin/role-move', { id: r.id, dir: 1 })}>↓</button>
                  <button type="button" className="so-btn small" onClick={() => setEditing(r.id)}>Edit</button>
                  <button type="button" className="so-btn small danger" onClick={() => { if (confirm(`Delete the role ${r.name}? ${r.members.length ? `It comes off ${r.members.length === 1 ? 'the one person' : `all ${r.members.length} people`} who hold it.` : ''}`)) void act('/admin/role-delete', { id: r.id }); }}>Delete</button>
                </span>
              </div>
            )}
            {open === r.id && editing !== r.id && (
              <div className="so-role-people">
                <GiveForm onGive={(who) => act('/admin/role-give', { id: r.id, who })} />
                {r.members.length === 0 && <p className="so-empty">Nobody holds it yet.</p>}
                <ul className="so-plain">
                  {r.members.map((m) => (
                    <li key={m.address} className="so-person-row">
                      <a href={profileHref(m)} className="so-who"><Avatar pet={m.pet} pic={m.pic} size={26} /><b>{nameOf(m)}</b></a>
                      <span className="so-hint">{ago(m.at)}</span>
                      <button type="button" className="so-btn small" onClick={() => void act('/admin/role-take', { id: r.id, address: m.address })}>Take away</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function GiveForm({ onGive }: { onGive: (who: string) => Promise<void> }) {
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="so-inline-form" onSubmit={async (e) => { e.preventDefault(); const w = who.trim().replace(/^@/, ''); if (!w) return; setBusy(true); await onGive(w); setBusy(false); setWho(''); }}>
      <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Give it to: a name or 0x address" aria-label="Give the role to" maxLength={64} />
      <button className="so-btn small primary" type="submit" disabled={busy || !who.trim()}>{busy ? '…' : 'Give'}</button>
    </form>
  );
}

// ------------------------------------------------------------------ "Roles…" on someone's card, profile or message

type Target = { address: string; who: string };
let current: Target | null = null;
const subs = new Set<() => void>();
export function roleSheet(t: Target) { current = { address: t.address.toLowerCase(), who: t.who }; for (const f of subs) f(); }
const close = () => { current = null; for (const f of subs) f(); };

export function RoleSheetHost() {
  const t = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
  useRoles();
  const [busy, setBusy] = useState<number | null>(null);
  const [making, setMaking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setErr(null); setMaking(false); if (!t) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [t]);
  if (!t) return null;
  const held = new Set(rolesOf(t.address).map((r) => r.id));
  const all = allRoles();
  const toggle = async (r: Role, give: boolean) => {
    setBusy(r.id); setErr(null);
    try { const res = await api.post<{ snap: RoleSnap | null }>(give ? '/admin/role-give' : '/admin/role-take', { id: r.id, address: t.address, who: t.address }); applyRoles(res.snap); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal so-role-sheet" role="dialog" aria-modal="true" aria-label={`${t.who}'s roles`}>
        <div className="modal-head"><h2>{t.who}'s roles</h2><button className="modal-x" onClick={close} aria-label="Close">✕</button></div>
        <p className="modal-sub">Tick a role to give it, untick to take it away. Their first {ROLE_LIMITS.shown} roles' emoji go by their name; the tags show on their profile.</p>
        {all.length === 0 && !making && <p className="so-empty">No roles yet. Make the first one:</p>}
        <ul className="so-plain so-role-ticks">
          {all.map((r) => (
            <li key={r.id}>
              <label className={held.has(r.id) ? 'on' : ''}>
                <input type="checkbox" checked={held.has(r.id)} disabled={busy !== null} onChange={(e) => void toggle(r, e.target.checked)} />
                <RoleChip r={r} />
                {busy === r.id && <span className="so-hint">…</span>}
              </label>
            </li>
          ))}
        </ul>
        {making
          ? <RoleForm submit="Make it and give it" onSaved={async (id) => { setMaking(false); const r = allRoles().find((x) => x.id === id); if (r) await toggle(r, true); }} onCancel={() => setMaking(false)} />
          : <button type="button" className="so-btn small so-role-new" disabled={all.length >= ROLE_LIMITS.roles} onClick={() => setMaking(true)}>New role</button>}
        {err && <p className="modal-err" role="alert">{err}</p>}
        <div className="pk-actions"><button className="btn btn-pink" onClick={close}>Done</button></div>
      </div>
    </div>
  );
}
