/**
 * Direct messages. You can message someone who follows you (so every mutual follow), and you can always answer
 * someone who wrote to you first; never across a block, either way. Sending one needs the named-pet gate, like the
 * town square. DMs are private between the two people but NOT end-to-end encrypted: they are stored in D1, and the
 * site says so. A reported DM is copied into the report for the operator to read; nothing else is.
 *
 * Since 2026-09-28 a DM may carry a GIF (rules.js cleanGif), answer an earlier DM in the same conversation (quoted
 * from the original, so a deleted one quotes nothing), and either person may react to any message in it with one emoji.
 */
import { LIMITS, REACTION_PRESETS, charCount, cleanEmoji, cleanGif, cleanText, isAddr, replyQuote } from './rules.js';
import { FILTER_MESSAGE, filtered } from './filter.js';
import { fail, json, limited, now } from './http.js';
import { CARD_JOIN, CARD_SQL, card, convId } from './profiles.js';
import { notify, push } from './notify.js';
import { gateFor, GATE_MESSAGE } from './gate.js';

const PER_MINUTE = 20;
const PER_DAY = 500;

/** May `from` message `to` right now? { ok, why } */
export async function mayMessage(env, from, to) {
  const r = await env.DB.prepare(`SELECT
      EXISTS(SELECT 1 FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1)) AS blocked,
      EXISTS(SELECT 1 FROM follows WHERE follower = ?2 AND followee = ?1) AS followedBy,
      EXISTS(SELECT 1 FROM conversations WHERE id = ?3 AND started_by = ?2) AS theyWrote`).bind(from, to, convId(from, to)).first();
  if (r.blocked) return { ok: false, why: 'You cannot message this person.' };
  if (!r.followedBy && !r.theyWrote) return { ok: false, why: 'You can message someone once they follow you, or answer someone who wrote to you first.' };
  return { ok: true };
}

/** POST /api/social/dm/send { to, text, gif?, replyTo? } */
export async function sendDm(env, who, b, ctx) {
  const to = String(b.to ?? '').toLowerCase();
  if (!isAddr(to) || to === who.address) fail(400, 'Pick someone to message.');
  if (who.muteUntil) fail(403, `You are muted until ${new Date(who.muteUntil).toUTCString()}.`, { muted: who.muteUntil });
  const text = cleanText(b.text);
  const gif = b.gif == null ? null : cleanGif(b.gif);
  if (b.gif != null && !gif) fail(400, 'That GIF cannot be used. Pick another.');
  if (!text && !gif) fail(400, 'Write something first.');
  if (charCount(text) > LIMITS.dm) fail(400, `A message can be at most ${LIMITS.dm} characters.`);
  if (text && await filtered(env, text)) fail(400, FILTER_MESSAGE);
  let re = null;
  if (b.replyTo != null) {
    const rid = Number(b.replyTo);
    if (!Number.isSafeInteger(rid) || rid <= 0) fail(400, 'Bad reply.');
    const r = await env.DB.prepare('SELECT id, sender, body, gif FROM dms WHERE id = ? AND conv = ? AND deleted_at IS NULL').bind(rid, convId(who.address, to)).first();
    if (!r) fail(404, 'The message you are replying to is gone.');
    re = replyQuote(r.id, r.sender, null, r.body, r.gif);
  }
  if (!who.admin) {
    const g = await gateFor(env, who.address);
    if (!g.ok) fail(403, g.unknown ? 'Could not check your pets with Monad just now. Try again in a moment.' : GATE_MESSAGE, { gate: true });
  }
  const may = await mayMessage(env, who.address, to);
  if (!may.ok) fail(403, may.why, { dm: 'closed' });
  const t = now();
  const rate = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM dms WHERE sender = ?1 AND created_at > ?2) AS minute, (SELECT COUNT(*) FROM dms WHERE sender = ?1 AND created_at > ?3) AS day').bind(who.address, t - 60_000, t - 86_400_000).first();
  if (rate.minute >= PER_MINUTE) fail(429, 'Slow down a little.');
  if (rate.day >= PER_DAY) fail(429, 'That is enough messages for one day.');
  const id = convId(who.address, to);
  const [a, bb] = id.split(':');
  const [, ins] = await env.DB.batch([
    env.DB.prepare('INSERT INTO conversations (id, a, b, started_by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id, a, bb, who.address),
    env.DB.prepare('INSERT INTO dms (conv, sender, recipient, body, created_at, gif, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(id, who.address, to, text, t, gif ? JSON.stringify(gif) : null, re?.id ?? null),
  ]);
  const dmId = ins.results[0].id;
  const mine = who.address === a ? 'a_read' : 'b_read';
  await env.DB.prepare(`UPDATE conversations SET last_id = ?, last_at = ?, ${mine} = ? WHERE id = ?`).bind(dmId, t, dmId, id).run();
  const m = { id: dmId, conv: id, from: who.address, to, text, at: t, ...(gif ? { g: gif } : {}), ...(re ? { re } : {}) };
  ctx.waitUntil(Promise.all([push(env, to, { t: 'dm', m }), push(env, who.address, { t: 'dm', m }), notify(env, to, 'dm', who.address, id)]));
  return json({ ok: true, m });
}

/** GET /api/social/dm/threads : my conversations, newest first, with unread counts and the other person's card. */
export async function threads(env, who) {
  const { results } = await env.DB.prepare(`SELECT c.id, c.last_id AS lastId, c.last_at AS lastAt, c.started_by AS startedBy,
      CASE WHEN c.a = ?1 THEN c.b ELSE c.a END AS other,
      CASE WHEN c.a = ?1 THEN c.a_read ELSE c.b_read END AS myRead,
      (SELECT body FROM dms WHERE id = c.last_id) AS lastText, (SELECT sender FROM dms WHERE id = c.last_id) AS lastFrom,
      (SELECT gif IS NOT NULL FROM dms WHERE id = c.last_id) AS lastGif,
      ${CARD_SQL()}
    FROM conversations c ${CARD_JOIN('(CASE WHEN c.a = ?1 THEN c.b ELSE c.a END)')}
    WHERE (c.a = ?1 OR c.b = ?1) AND c.last_id > 0 ORDER BY c.last_at DESC LIMIT 100`).bind(who.address).all();
  const unreadRows = await env.DB.prepare(`SELECT d.conv, COUNT(*) AS n FROM dms d JOIN conversations c ON c.id = d.conv
    WHERE d.recipient = ?1 AND d.deleted_at IS NULL AND d.id > (CASE WHEN c.a = ?1 THEN c.a_read ELSE c.b_read END) GROUP BY d.conv`).bind(who.address).all();
  const unread = Object.fromEntries(unreadRows.results.map((r) => [r.conv, r.n]));
  const blocks = await env.DB.prepare('SELECT blocked FROM blocks WHERE blocker = ?').bind(who.address).all();
  const blocked = new Set(blocks.results.map((r) => r.blocked));
  const items = results.map((r) => ({ id: r.id, with: card(r, r.other), lastAt: r.lastAt, last: { text: r.lastText ?? '', from: r.lastFrom, ...(r.lastGif ? { gif: true } : {}) }, unread: unread[r.id] ?? 0, blocked: blocked.has(r.other) }));
  return json({ items, unread: items.reduce((n, i) => n + (i.blocked ? 0 : i.unread), 0) });
}

/** GET /api/social/dm/thread/:address?before=<id> : fifty messages, newest last. */
export async function thread(env, who, other, url) {
  const o = String(other ?? '').toLowerCase();
  if (!isAddr(o)) fail(400, 'That is not an address.');
  const id = convId(who.address, o);
  const before = Number(url.searchParams.get('before') ?? 0) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(`SELECT d.id, d.sender, d.recipient, d.body, d.created_at, d.gif, d.reply_to,
      r.id AS re_id, r.sender AS re_sender, r.body AS re_body, r.gif AS re_gif,
      (SELECT json_group_object(address, emoji) FROM dm_reactions WHERE dm_id = d.id) AS rx
    FROM dms d LEFT JOIN dms r ON r.id = d.reply_to AND r.deleted_at IS NULL
    WHERE d.conv = ? AND d.id < ? AND d.deleted_at IS NULL ORDER BY d.id DESC LIMIT 50`).bind(id, before).all();
  const may = await mayMessage(env, who.address, o);
  const items = results.reverse().map((r) => ({
    id: r.id, from: r.sender, to: r.recipient, text: r.body, at: r.created_at,
    ...(r.gif ? { g: cleanGif(JSON.parse(r.gif)) } : {}),
    ...(r.reply_to ? { re: r.re_id ? replyQuote(r.re_id, r.re_sender, null, r.re_body, r.re_gif) : { id: r.reply_to, gone: true } } : {}),
    ...(r.rx && r.rx !== '{}' ? { rx: JSON.parse(r.rx) } : {}),
  }));
  return json({ id, items, more: results.length === 50, canSend: may.ok, why: may.ok ? null : may.why });
}

/**
 * POST /api/social/dm/react { id, emoji } : your reaction to a message in one of your own conversations (yours or
 * theirs), one emoji, like X; a new one replaces it and `emoji: null` takes it back. Both people's open tabs hear it; it
 * is not a notification (the conversation shows it). Not across a block. POST /dm/like { id, on } is the heart before it.
 */
export async function reactDm(env, who, b) {
  const dmId = Number(b.id);
  if (!Number.isSafeInteger(dmId) || dmId <= 0) fail(400, 'Bad id.');
  const emoji = b.emoji == null ? null : cleanEmoji(b.emoji);
  if (b.emoji != null && !emoji) fail(400, 'A reaction is one emoji.');
  if (who.muteUntil) fail(403, `You are muted until ${new Date(who.muteUntil).toUTCString()}.`, { muted: who.muteUntil });
  if (await limited(env.LIKE_LIMIT, who.address)) fail(429, 'Easy on the reactions. Try again in a moment.');
  const d = await env.DB.prepare('SELECT id, conv, sender, recipient FROM dms WHERE id = ? AND deleted_at IS NULL').bind(dmId).first();
  if (!d || (d.sender !== who.address && d.recipient !== who.address)) fail(404, 'That message is gone.');
  const other = d.sender === who.address ? d.recipient : d.sender;
  const blocked = await env.DB.prepare('SELECT 1 AS x FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1)').bind(who.address, other).first();
  if (blocked) fail(403, 'You cannot message this person.');
  await (emoji
    ? env.DB.prepare('INSERT INTO dm_reactions (dm_id, address, emoji, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(dm_id, address) DO UPDATE SET emoji = ?3, created_at = ?4').bind(dmId, who.address, emoji, now())
    : env.DB.prepare('DELETE FROM dm_reactions WHERE dm_id = ? AND address = ?').bind(dmId, who.address)).run();
  const ev = { t: 'dm_react', id: dmId, conv: d.conv, by: who.address, emoji };
  await Promise.all([push(env, who.address, ev), push(env, other, ev)]);
  return json({ ok: true, id: dmId, emoji });
}
/** The old heart: on = a red heart reaction, off = none. */
export function likeDm(env, who, b) { return reactDm(env, who, { id: b.id, emoji: b.on === false ? null : REACTION_PRESETS[0] }); }

/** POST /api/social/dm/read { with, upTo } */
export async function markRead(env, who, b) {
  const o = String(b.with ?? '').toLowerCase();
  const upTo = Number(b.upTo);
  if (!isAddr(o) || !Number.isSafeInteger(upTo) || upTo < 0) fail(400, 'Bad request.');
  const id = convId(who.address, o);
  const mine = who.address < o ? 'a_read' : 'b_read';
  await env.DB.batch([
    env.DB.prepare(`UPDATE conversations SET ${mine} = MAX(${mine}, ?) WHERE id = ?`).bind(Math.min(upTo, Number.MAX_SAFE_INTEGER), id),
    // the DM notifications from them are read too
    env.DB.prepare("UPDATE notifications SET read_at = ? WHERE address = ? AND kind = 'dm' AND actor = ? AND read_at IS NULL").bind(now(), who.address, o),
  ]);
  await push(env, who.address, { t: 'dm_read', conv: id, upTo });
  return json({ ok: true });
}

/** How many DMs are waiting for this person (the badge on the envelope). */
export async function unreadDms(env, address) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM dms d JOIN conversations c ON c.id = d.conv
    WHERE d.recipient = ?1 AND d.deleted_at IS NULL AND d.id > (CASE WHEN c.a = ?1 THEN c.a_read ELSE c.b_read END)
    AND NOT EXISTS (SELECT 1 FROM blocks WHERE blocker = ?1 AND blocked = d.sender)`).bind(address).first();
  return r?.n ?? 0;
}
