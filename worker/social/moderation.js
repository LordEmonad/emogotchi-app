/**
 * Reports, and the admin tools. Anyone signed in can report a message, a DM or a profile; the report keeps a copy of
 * what was reported, so deleting it later does not destroy the evidence. Admins (env.ADMINS, the operator's wallet)
 * can delete any message in the square, mute someone for a while (they can read, not post or DM), ban them (they
 * cannot sign in at all, and may have everything they said removed), set slow mode, add words to the filter, reset a
 * profile, work through the reports, approve or take down uploaded pictures (pics.js), and make and hand out roles
 * (roles.js: tags with an emoji, no powers). Everything an admin does is written to admin_log.
 */
import { cleanText, clip, isAddr, LIMITS } from './rules.js';
import { fail, json, now } from './http.js';
import { PERMANENT } from './auth.js';
import { roomStub, ROOMS } from './chat.js';
import { resetFilterCache } from './filter.js';
import { CARD_JOIN, CARD_SQL, card } from './profiles.js';
import { adminPics, takeDownAll } from './pics.js';
import { adminRoles } from './roles.js';

const REASONS = ['spam', 'abuse', 'scam', 'impersonation', 'other'];
const REPORTS_PER_HOUR = 20;

/** POST /api/social/report { kind: 'chat'|'dm'|'profile', ref, address, reason, note } */
export async function report(env, who, b) {
  const kind = String(b.kind ?? '');
  const reason = REASONS.includes(b.reason) ? b.reason : fail(400, 'Pick a reason.');
  const note = clip(cleanText(b.note ?? '', { multiline: true }), LIMITS.note);
  const t = now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND created_at > ?').bind(who.address, t - 3600_000).first();
  if (recent.n >= REPORTS_PER_HOUR) fail(429, 'Thank you. That is enough reports for one hour; they are being read.');
  let target, ref = null, snapshot = null;
  if (kind === 'chat') {
    const id = Number(b.ref);
    const m = Number.isSafeInteger(id) ? await env.DB.prepare('SELECT id, sender, body, room, created_at, gif FROM messages WHERE id = ?').bind(id).first() : null;
    if (!m) fail(404, 'That message is gone.');
    target = m.sender; ref = String(m.id); snapshot = JSON.stringify({ text: m.body, room: m.room, at: m.created_at, ...(m.gif ? { gif: JSON.parse(m.gif) } : {}) });
  } else if (kind === 'dm') {
    const id = Number(b.ref);
    // only a DM sent TO the reporter can be reported (they are the only one who could have seen it)
    const m = Number.isSafeInteger(id) ? await env.DB.prepare('SELECT id, sender, recipient, body, created_at, gif FROM dms WHERE id = ?').bind(id).first() : null;
    if (!m || m.recipient !== who.address) fail(404, 'That message is gone.');
    target = m.sender; ref = String(m.id); snapshot = JSON.stringify({ text: m.body, at: m.created_at, ...(m.gif ? { gif: JSON.parse(m.gif) } : {}) });
  } else if (kind === 'profile') {
    const a = String(b.address ?? '').toLowerCase();
    if (!isAddr(a)) fail(400, 'That is not an address.');
    const p = await env.DB.prepare('SELECT name, bio, pic, banner_pic FROM profiles WHERE address = ?').bind(a).first();
    const s = await env.DB.prepare('SELECT platform, handle FROM socials WHERE address = ?').bind(a).all();
    target = a; snapshot = JSON.stringify({ name: p?.name ?? null, bio: p?.bio ?? '', socials: s.results, pic: p?.pic ?? null, bannerPic: p?.banner_pic ?? null });
  } else fail(400, 'Report what?');
  if (target === who.address) fail(400, 'That is yours.');
  await env.DB.prepare('INSERT INTO reports (reporter, kind, ref, target, reason, note, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(who.address, kind, ref, target, reason, note || null, snapshot, t).run();
  return json({ ok: true });
}

// ------------------------------------------------------------------ admin

const needAdmin = (who) => { if (!who.admin) fail(403, 'Admins only.'); };
const log = (env, who, action, target, detail) => env.DB.prepare('INSERT INTO admin_log (admin, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(who.address, action, target ?? null, detail ? JSON.stringify(detail) : null, now()).run();
const addrOf = (v) => { const a = String(v ?? '').toLowerCase(); return isAddr(a) ? a : fail(400, 'That is not an address.'); };

/** Close their live connections (after a ban). */
async function kick(env, address) {
  await Promise.all([
    ...ROOMS.map((r) => roomStub(env, r).fetch('https://room/kick', { method: 'POST', body: JSON.stringify({ address }) }).catch(() => {})),
    env.INBOX?.get(env.INBOX.idFromName(address)).fetch('https://inbox/close', { method: 'POST' }).catch(() => {}),
  ]);
}

const READS = ['reports', 'people', 'log', 'filter', 'pics', 'roles'];

export async function admin(env, who, action, b, url) {
  needAdmin(who);
  if (!b && !READS.includes(action)) fail(405, 'Use POST.');
  const t = now();
  switch (action) {
    case 'delete': {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Bad id.');
      const row = await env.DB.prepare('SELECT room FROM messages WHERE id = ?').bind(id).first();
      if (!row) fail(404, 'No such message.');
      const res = await (await roomStub(env, row.room).fetch('https://room/delete', { method: 'POST', body: JSON.stringify({ id, by: who.address, admin: true }) })).json();
      if (!res.ok) fail(res.status ?? 500, res.error);
      await log(env, who, 'delete', res.sender, { id });
      return json({ ok: true });
    }
    case 'mute': {
      const a = addrOf(b.address);
      const minutes = Math.max(1, Math.min(60 * 24 * 365, Math.round(Number(b.minutes) || 60)));
      const reason = clip(cleanText(b.reason ?? ''), 200) || null;
      await env.DB.prepare('INSERT INTO mutes (address, until, reason, by, created_at) VALUES (?, ?, ?, ?, ?)').bind(a, t + minutes * 60_000, reason, who.address, t).run();
      await log(env, who, 'mute', a, { minutes, reason });
      return json({ ok: true, until: t + minutes * 60_000 });
    }
    case 'unmute': {
      const a = addrOf(b.address);
      await env.DB.prepare('UPDATE mutes SET until = ? WHERE address = ? AND until > ?').bind(t, a, t).run();
      await log(env, who, 'unmute', a);
      return json({ ok: true });
    }
    case 'ban': {
      const a = addrOf(b.address);
      if (a === who.address) fail(400, 'That is you.');
      const days = Number(b.days);
      const until = Number.isFinite(days) && days > 0 ? t + Math.min(days, 3650) * 86_400_000 : PERMANENT;
      const reason = clip(cleanText(b.reason ?? ''), 200) || null;
      // the named pet that let them in is banned with them, and lets nobody else in meanwhile (gate.js)
      const g = await env.DB.prepare('SELECT pet_col, pet_id FROM gate WHERE address = ? AND pet_col IS NOT NULL').bind(a).first();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO bans (address, until, reason, by, created_at) VALUES (?, ?, ?, ?, ?)').bind(a, until, reason, who.address, t),
        env.DB.prepare('DELETE FROM sessions WHERE address = ?').bind(a),
        ...(g ? [
          env.DB.prepare('INSERT INTO banned_pets (pet_col, pet_id, until, address, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(pet_col, pet_id) DO UPDATE SET until = MAX(until, excluded.until), address = excluded.address').bind(g.pet_col, g.pet_id, until, a, t),
          env.DB.prepare('UPDATE gate SET ok = 0, checked_at = 0 WHERE pet_col = ? AND pet_id = ?').bind(g.pet_col, g.pet_id),
        ] : []),
      ]);
      let purged = 0;
      if (b.purge) {
        for (const r of ROOMS) { const res = await (await roomStub(env, r).fetch('https://room/purge', { method: 'POST', body: JSON.stringify({ address: a, by: who.address }) })).json(); purged += res.deleted ?? 0; }
        purged += await takeDownAll(env, a, who.address);   // their pictures too
      }
      await kick(env, a);
      await log(env, who, 'ban', a, { until, reason, purged });
      return json({ ok: true, until, purged });
    }
    case 'unban': {
      const a = addrOf(b.address);
      await env.DB.batch([
        env.DB.prepare('UPDATE bans SET until = ? WHERE address = ? AND until > ?').bind(t, a, t),
        env.DB.prepare('DELETE FROM banned_pets WHERE address = ?').bind(a),
      ]);
      await log(env, who, 'unban', a);
      return json({ ok: true });
    }
    case 'slow': {
      const room = ROOMS.includes(b.room) ? b.room : 'square';
      const res = await (await roomStub(env, room).fetch('https://room/config', { method: 'POST', body: JSON.stringify({ slow: b.seconds }) })).json();
      await log(env, who, 'slow', room, { seconds: res.slow });
      return json(res);
    }
    case 'filter': {
      if (url && b === null) {
        const { results } = await env.DB.prepare('SELECT word, added_by AS "by", created_at AS at FROM filter_words ORDER BY created_at DESC').all();
        return json({ items: results });
      }
      const word = clip(cleanText(b.word ?? ''), 40).toLowerCase();
      if (word.length < 2) fail(400, 'A word, please.');
      if (b.remove) await env.DB.prepare('DELETE FROM filter_words WHERE word = ?').bind(word).run();
      else await env.DB.prepare('INSERT INTO filter_words (word, added_by, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(word, who.address, t).run();
      resetFilterCache();
      await log(env, who, b.remove ? 'filter_remove' : 'filter_add', null, { word });
      return json({ ok: true });
    }
    case 'reset-profile': {
      const a = addrOf(b.address);
      const fields = Array.isArray(b.fields) ? b.fields : ['name', 'bio', 'socials', 'pics'];
      const stmts = [];
      if (fields.includes('name')) stmts.push(env.DB.prepare('UPDATE profiles SET name = NULL, name_key = NULL WHERE address = ?').bind(a));
      if (fields.includes('bio')) stmts.push(env.DB.prepare("UPDATE profiles SET bio = '' WHERE address = ?").bind(a));
      if (fields.includes('socials')) stmts.push(env.DB.prepare('DELETE FROM socials WHERE address = ?').bind(a));
      if (stmts.length) await env.DB.batch(stmts);
      if (fields.includes('pics')) await takeDownAll(env, a, who.address);
      await log(env, who, 'reset_profile', a, { fields });
      return json({ ok: true });
    }
    case 'reports': {
      const open = url?.searchParams.get('all') ? '' : 'WHERE r.resolved_at IS NULL';
      const { results } = await env.DB.prepare(`SELECT r.*, ${CARD_SQL()},
          (SELECT COUNT(*) FROM reports r2 WHERE r2.target = r.target) AS against,
          (SELECT MAX(until) FROM mutes m WHERE m.address = r.target) AS muteUntil,
          (SELECT MAX(until) FROM bans x WHERE x.address = r.target) AS banUntil
        FROM reports r ${CARD_JOIN('r.target')} ${open} ORDER BY r.id DESC LIMIT 100`).all();
      return json({ items: results.map((r) => ({ id: r.id, kind: r.kind, ref: r.ref, reporter: r.reporter, target: card(r, r.target), reason: r.reason, note: r.note, snapshot: r.snapshot ? JSON.parse(r.snapshot) : null, at: r.created_at, resolved: r.resolved_at ? { at: r.resolved_at, by: r.resolved_by, how: r.resolution } : null, against: r.against, muted: (r.muteUntil ?? 0) > t, banned: (r.banUntil ?? 0) > t })) });
    }
    case 'resolve': {
      const id = Number(b.id);
      await env.DB.prepare('UPDATE reports SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE id = ?').bind(t, who.address, clip(cleanText(b.resolution ?? 'done'), 100), id).run();
      await log(env, who, 'resolve', null, { id });
      return json({ ok: true });
    }
    case 'people': {
      // who is muted or banned right now
      const [m, x] = await Promise.all([
        env.DB.prepare(`SELECT m.address, MAX(m.until) AS until, m.reason, ${CARD_SQL()} FROM mutes m ${CARD_JOIN('m.address')} WHERE m.until > ? GROUP BY m.address ORDER BY until DESC LIMIT 200`).bind(t).all(),
        env.DB.prepare(`SELECT b.address, MAX(b.until) AS until, b.reason, ${CARD_SQL()} FROM bans b ${CARD_JOIN('b.address')} WHERE b.until > ? GROUP BY b.address ORDER BY until DESC LIMIT 200`).bind(t).all(),
      ]);
      return json({ muted: m.results.map((r) => ({ ...card(r), until: r.until, reason: r.reason })), banned: x.results.map((r) => ({ ...card(r), until: r.until, reason: r.reason })) });
    }
    case 'log': {
      const { results } = await env.DB.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 100').all();
      return json({ items: results.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })) });
    }
  }
  const pics = await adminPics(env, who, action, b, url, log);
  if (pics) return pics;
  const roles = await adminRoles(env, who, action, b, url, log);
  if (roles) return roles;
  fail(404, 'No such admin action.');
}
