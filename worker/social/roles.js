/**
 * Roles (2026-09-28): tags the admins make and hand out. A role is a name, one emoji and a colour (rules.js
 * ROLE_LIMITS / ROLE_COLORS); its emoji goes by its holders' names everywhere and its tag shows on their profile and
 * card. They carry no power: nothing on the Worker reads a role to decide anything.
 *
 * Everyone reads all of them at once: GET /api/social/roles answers the whole list (the roles in the admins' order, and
 * who holds which), kept ready-made as ONE row of `settings` ('roles') and rewritten after every change. A page load
 * costs one row read however many roles and holders there are, and the answer is never stale. After a change the
 * square's room tells every open tab to read it again.
 */
import { ROLE_COLORS, ROLE_LIMITS, checkRoleName, cleanEmoji } from './rules.js';
import { fail, json, now } from './http.js';
import { CARD_JOIN, CARD_SQL, card, resolveKey } from './profiles.js';
import { roomStub, ROOMS } from './chat.js';

const EMPTY = JSON.stringify({ v: 0, roles: [], holders: [] });

/** GET /api/social/roles : { v, roles: [{ id, name, emoji, color }], holders: [[address, [roleId, ...]], ...] } */
export async function publicRoles(env) {
  let r = null;
  try { r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'roles'").first(); } catch { /* not migrated yet: no roles */ }
  return new Response(r?.value ?? EMPTY, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
}

/** Rebuild the ready-made copy from the two tables, and tell every open tab. */
async function publish(env) {
  const [roles, members] = await Promise.all([
    env.DB.prepare('SELECT id, name, emoji, color FROM roles ORDER BY position, id').all(),
    env.DB.prepare('SELECT m.address, m.role_id FROM role_members m JOIN roles r ON r.id = m.role_id ORDER BY r.position, r.id').all(),
  ]);
  const by = new Map();
  for (const m of members.results) { const l = by.get(m.address) ?? []; l.push(m.role_id); by.set(m.address, l); }
  const v = now();
  const snap = { v, roles: roles.results.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color })), holders: [...by.entries()] };
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('roles', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2").bind(JSON.stringify(snap), v).run();
  await Promise.all(ROOMS.map((room) => roomStub(env, room).fetch('https://room/roles', { method: 'POST', body: JSON.stringify({ v }) }).catch(() => {})));
  return snap;
}

const idOf = (v) => { const id = Number(v); return Number.isSafeInteger(id) && id > 0 ? id : fail(400, 'Which role?'); };
async function roleOf(env, v) {
  const r = await env.DB.prepare('SELECT id, name, emoji FROM roles WHERE id = ?').bind(idOf(v)).first();
  return r ?? fail(404, 'That role is gone.');
}

/** The admin actions, from moderation.js: 'roles' (read), 'role-save', 'role-delete', 'role-move', 'role-give', 'role-take'. */
export async function adminRoles(env, who, action, b, url, log) {
  const t = now();
  switch (action) {
    case 'roles': {
      // every role with its holders, newest first; or (?a=0x…) the roles one person holds
      const a = url?.searchParams.get('a')?.toLowerCase();
      if (a) {
        const { results } = await env.DB.prepare('SELECT role_id FROM role_members WHERE address = ?').bind(a).all();
        return json({ ids: results.map((r) => r.role_id) });
      }
      const [roles, members] = await Promise.all([
        env.DB.prepare('SELECT id, name, emoji, color FROM roles ORDER BY position, id').all(),
        env.DB.prepare(`SELECT m.role_id, m.address, m.created_at AS at, ${CARD_SQL()} FROM role_members m ${CARD_JOIN('m.address')} ORDER BY m.created_at DESC`).all(),
      ]);
      return json({
        limits: ROLE_LIMITS,
        roles: roles.results.map((r) => ({ ...r, members: members.results.filter((m) => m.role_id === r.id).map((m) => ({ ...card(m), at: m.at })) })),
      });
    }
    case 'role-save': {
      const n = checkRoleName(b.name);
      if (!n.ok) fail(400, n.error);
      const emoji = cleanEmoji(b.emoji) ?? fail(400, 'Pick one emoji for the role.');
      const color = ROLE_COLORS.includes(b.color) ? b.color : fail(400, 'Pick one of the colours.');
      let id = b.id == null ? null : idOf(b.id);
      try {
        if (id) {
          const r = await env.DB.prepare('UPDATE roles SET name = ?, name_key = ?, emoji = ?, color = ?, updated_at = ? WHERE id = ?').bind(n.name, n.key, emoji, color, t, id).run();
          if (!r.meta.changes) fail(404, 'That role is gone.');
        } else {
          const c = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS last FROM roles').first();
          if (c.n >= ROLE_LIMITS.roles) fail(400, `There can be at most ${ROLE_LIMITS.roles} roles.`);
          const r = await env.DB.prepare('INSERT INTO roles (name, name_key, emoji, color, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
            .bind(n.name, n.key, emoji, color, c.last + 1, who.address, t, t).first();
          id = r.id;
        }
      } catch (e) {
        if (/UNIQUE/i.test(String(e))) fail(409, 'There is already a role called that.');
        throw e;
      }
      await log(env, who, b.id == null ? 'role_new' : 'role_edit', null, { id, name: n.name, emoji, color });
      return json({ ok: true, id, snap: await publish(env) });
    }
    case 'role-delete': {
      const r = await roleOf(env, b.id);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM role_members WHERE role_id = ?').bind(r.id),
        env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(r.id),
      ]);
      await log(env, who, 'role_delete', null, { id: r.id, name: r.name });
      return json({ ok: true, snap: await publish(env) });
    }
    case 'role-move': {
      // up (-1) or down (+1) one place; the order is what decides which emoji go by a name first
      const r = await roleOf(env, b.id);
      const dir = Number(b.dir) < 0 ? -1 : 1;
      const { results } = await env.DB.prepare('SELECT id FROM roles ORDER BY position, id').all();
      const ids = results.map((x) => x.id);
      const i = ids.indexOf(r.id); const j = i + dir;
      if (j >= 0 && j < ids.length) {
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await env.DB.batch(ids.map((id, k) => env.DB.prepare('UPDATE roles SET position = ? WHERE id = ?').bind(k + 1, id)));
      }
      return json({ ok: true, snap: await publish(env) });
    }
    case 'role-give': {
      // to an address, or to whoever holds a name now (the name is resolved once, here: the role stays with the address)
      const r = await roleOf(env, b.id);
      const address = await resolveKey(env, b.who ?? b.address) ?? fail(404, 'Nobody by that name lives in Emotown. An address works too.');
      const c = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM role_members WHERE address = ?1) AS mine, (SELECT COUNT(*) FROM role_members) AS total, EXISTS(SELECT 1 FROM role_members WHERE role_id = ?2 AND address = ?1) AS has').bind(address, r.id).first();
      if (c.has) return json({ ok: true, address, snap: null });
      if (c.mine >= ROLE_LIMITS.perPerson) fail(400, `Someone can hold at most ${ROLE_LIMITS.perPerson} roles.`);
      if (c.total >= ROLE_LIMITS.holders) fail(400, `Roles have been given ${ROLE_LIMITS.holders} times, which is the most there can be.`);
      await env.DB.prepare('INSERT INTO role_members (role_id, address, added_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(r.id, address, who.address, t).run();
      await log(env, who, 'role_give', address, { id: r.id, name: r.name });
      return json({ ok: true, address, snap: await publish(env) });
    }
    case 'role-take': {
      const r = await roleOf(env, b.id);
      const address = await resolveKey(env, b.address) ?? fail(400, 'That is not an address.');
      const res = await env.DB.prepare('DELETE FROM role_members WHERE role_id = ? AND address = ?').bind(r.id, address).run();
      if (!res.meta.changes) return json({ ok: true, snap: null });
      await log(env, who, 'role_take', address, { id: r.id, name: r.name });
      return json({ ok: true, snap: await publish(env) });
    }
  }
  return null;
}
