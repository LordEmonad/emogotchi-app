/**
 * Who follows whom, and who has blocked whom. You follow an OWNER (an address), never a pet, and any address can be
 * followed, signed in or not: the owner of a pet you like in town may never have visited.
 *
 * A block cuts both ways at once: it removes the follows between the two, stops DMs in either direction, keeps the
 * blocked person's mentions from reaching you, and the site hides their messages from you in the town square.
 */
import { isAddr } from './rules.js';
import { fail, json, now } from './http.js';
import { notify, push } from './notify.js';

const MAX_FOLLOWING = 5000;
const FOLLOWS_PER_HOUR = 120;

function target(b, who) {
  const a = String(b.address ?? '').toLowerCase();
  if (!isAddr(a)) fail(400, 'That is not an address.');
  if (a === who.address) fail(400, 'That is you.');
  return a;
}

/** POST /api/social/follow { address } */
export async function follow(env, who, b) {
  const a = target(b, who);
  const t = now();
  const r = await env.DB.prepare(`SELECT
      EXISTS(SELECT 1 FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1)) AS blocked,
      (SELECT COUNT(*) FROM follows WHERE follower = ?1) AS following,
      (SELECT COUNT(*) FROM follows WHERE follower = ?1 AND created_at > ?3) AS recent`).bind(who.address, a, t - 3600_000).first();
  if (r.blocked) fail(403, 'You cannot follow this person.');
  if (r.following >= MAX_FOLLOWING) fail(429, `You already follow ${MAX_FOLLOWING.toLocaleString('en-US')} people.`);
  if (r.recent >= FOLLOWS_PER_HOUR) fail(429, 'That is a lot of following in one hour. Try again later.');
  const res = await env.DB.prepare('INSERT INTO follows (follower, followee, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(who.address, a, t).run();
  if (res.meta?.changes) await notify(env, a, 'follow', who.address);
  return json({ ok: true, following: true });
}

/** POST /api/social/unfollow { address } */
export async function unfollow(env, who, b) {
  const a = target(b, who);
  await env.DB.prepare('DELETE FROM follows WHERE follower = ? AND followee = ?').bind(who.address, a).run();
  return json({ ok: true, following: false });
}

/** POST /api/social/block { address } */
export async function block(env, who, b) {
  const a = target(b, who);
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(who.address, a, t),
    env.DB.prepare('DELETE FROM follows WHERE (follower = ?1 AND followee = ?2) OR (follower = ?2 AND followee = ?1)').bind(who.address, a),
  ]);
  // the blocker's other tabs hide them at once
  await push(env, who.address, { t: 'blocked', address: a, on: true });
  return json({ ok: true, blocked: true });
}

/** POST /api/social/unblock { address } */
export async function unblock(env, who, b) {
  const a = target(b, who);
  await env.DB.prepare('DELETE FROM blocks WHERE blocker = ? AND blocked = ?').bind(who.address, a).run();
  await push(env, who.address, { t: 'blocked', address: a, on: false });
  return json({ ok: true, blocked: false });
}

/** Is there a block between these two, either way? */
export async function blockedEitherWay(env, a, b) {
  const r = await env.DB.prepare('SELECT 1 AS x FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1) LIMIT 1').bind(a, b).first();
  return !!r;
}
