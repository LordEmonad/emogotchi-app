/**
 * Notifications (a new follower, a new DM, a mention, a verdict on a picture you uploaded) and the live push that carries them, and DMs, to a person's
 * open tabs. D1 is the record; each person's Inbox Durable Object is only the pipe to whatever tabs they have open, so
 * a push to someone who is offline costs one tiny request and loses nothing.
 */
import { fail, json, now } from './http.js';
import { pushSocial } from '../push.js';

/** Send an event to every open tab of `address`. Never throws: a push that fails is picked up on the next load. */
export async function push(env, address, event) {
  if (!env.INBOX) return;
  try {
    const stub = env.INBOX.get(env.INBOX.idFromName(address));
    await stub.fetch('https://inbox/push', { method: 'POST', body: JSON.stringify(event), headers: { 'content-type': 'application/json' } });
  } catch (e) { console.error('[social] push', String(e).slice(0, 120)); }
}

/**
 * Record a notification and push it. A follow is one row per follower per day however often they toggle; a run of
 * DMs from one person is one row with a count until it is read; each mention is its own row.
 */
export async function notify(env, address, kind, actor, ref = null) {
  if (address === actor) return;
  const t = now();
  let row = null;
  if (kind === 'follow') {
    const had = await env.DB.prepare("SELECT id FROM notifications WHERE address = ? AND kind = 'follow' AND actor = ? AND created_at > ?").bind(address, actor, t - 86_400_000).first();
    if (had) return;
  }
  if (kind === 'dm') {
    row = await env.DB.prepare("UPDATE notifications SET count = count + 1, created_at = ?, ref = ? WHERE id = (SELECT id FROM notifications WHERE address = ? AND kind = 'dm' AND actor = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1) RETURNING id, count").bind(t, ref, address, actor).first();
  }
  if (!row) row = await env.DB.prepare('INSERT INTO notifications (address, kind, actor, ref, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id, count').bind(address, kind, actor, ref, t).first();
  await push(env, address, { t: 'notification', n: { id: row.id, kind, actor, ref, count: row.count, at: t } });
  await pushSocial(env, address, kind, actor, ref);   // the phone, if this person switched notifications on (worker/push.js)
}

/** GET /api/social/notifications?before=<id> */
export async function listNotifications(env, who, url) {
  const before = Number(url.searchParams.get('before') ?? 0) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(`SELECT n.id, n.kind, n.actor, n.ref, n.count, n.created_at AS at, n.read_at AS readAt, p.name, p.pic, COALESCE(p.avatar_col, g.pet_col) AS petCol, COALESCE(p.avatar_id, g.pet_id) AS petId
    FROM notifications n LEFT JOIN profiles p ON p.address = n.actor LEFT JOIN gate g ON g.address = n.actor AND g.ok = 1
    WHERE n.address = ? AND n.id < ? ORDER BY n.id DESC LIMIT 40`).bind(who.address, before).all();
  const unread = await unreadNotifications(env, who.address);
  return json({ items: results.map(shapeNote), unread });
}
const shapeNote = (r) => ({ id: r.id, kind: r.kind, actor: r.actor, ref: r.ref, count: r.count, at: r.at, read: !!r.readAt, name: r.name ?? null, pet: r.petCol ? { col: r.petCol, id: r.petId } : null, pic: r.pic ?? null });

export async function unreadNotifications(env, address) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE address = ? AND read_at IS NULL').bind(address).first();
  return r?.n ?? 0;
}

/** POST /api/social/notifications/read { upTo } : everything up to and including that id is read. */
export async function readNotifications(env, who, body) {
  const upTo = Number(body.upTo);
  if (!Number.isSafeInteger(upTo) || upTo < 0) fail(400, 'Bad id.');
  await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE address = ? AND id <= ? AND read_at IS NULL').bind(now(), who.address, upTo).run();
  await push(env, who.address, { t: 'notifications_read', upTo });
  return json({ ok: true, unread: await unreadNotifications(env, who.address) });
}
