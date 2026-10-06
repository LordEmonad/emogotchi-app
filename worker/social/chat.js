/**
 * The town square over HTTP: posting (where the session, the mute, the gate and the filter are checked before the
 * room ever hears of it), the history, and the websocket handshake that hands a reader to the ChatRoom object.
 *
 * A message is one line of plain text, at most 280 characters, and may carry one GIF (KLIPY's, rules.js cleanGif) and
 * answer one earlier message (a reply, quoted from the original so a deleted one quotes nothing). It goes up as a
 * speech bubble over the sender's pet in town: the pet they chose for their profile, or else the named pet the gate
 * found. Anyone who may post may also react to a message with any emoji, one each, like X (2026-09-28; it was one
 * heart before); the counts travel with the message.
 */
import { LIMITS, MAX_REACTION_KINDS, REACTION_PRESETS, charCount, cleanEmoji, cleanGif, cleanText, findMentions, replyQuote } from './rules.js';
import { FILTER_MESSAGE, filtered } from './filter.js';
import { fail, json, limited, now } from './http.js';
import { gateFor, GATE_MESSAGE } from './gate.js';
import { ownerOfPet } from './chain.js';
import { notify } from './notify.js';
import { CRIER, CRIER_NAME } from './crier.js';

export const ROOMS = ['square'];
const roomOf = (v) => (ROOMS.includes(v) ? v : fail(400, 'No such room.'));
export const roomStub = (env, room) => env.CHAT.get(env.CHAT.idFromName(`room:${room}`));

// an avatar the person chose is checked against the chain now and then (they may have sold it since)
const avatarSeen = new Map();   // address -> { key, ok, at }

/** The pet a person's bubble goes over: their chosen avatar if they still own it, else the gate's named pet. */
export async function bubblePet(env, address, gatePet) {
  const p = await env.DB.prepare('SELECT name, avatar_col, avatar_id FROM profiles WHERE address = ?').bind(address).first();
  const chosen = p?.avatar_col ? { col: p.avatar_col, id: p.avatar_id } : null;
  let pet = gatePet ? { col: gatePet.col, id: gatePet.id } : null;
  if (chosen && !(pet && pet.col === chosen.col && pet.id === chosen.id)) {
    const key = `${chosen.col}:${chosen.id}`;
    const seen = avatarSeen.get(address);
    let ok = seen && seen.key === key && now() - seen.at < 5 * 60_000 ? seen.ok : null;
    if (ok === null) {
      try { ok = (await ownerOfPet(env, chosen.col, chosen.id)) === address; } catch { ok = true; /* the chain is down: trust the check made when it was chosen */ }
      avatarSeen.set(address, { key, ok, at: now() });
      if (avatarSeen.size > 5000) avatarSeen.clear();
    }
    if (ok) pet = chosen;
  }
  return { name: p?.name ?? null, pet };
}

/** The gate for taking part in the square (posting, liking): the named pet it found, or a refusal. Admins pass. */
async function mayTakePart(env, who) {
  if (who.muteUntil) fail(403, `You are muted until ${new Date(who.muteUntil).toUTCString()}.`, { muted: who.muteUntil });
  if (!who.admin) {
    const g = await gateFor(env, who.address);
    if (!g.ok) fail(403, g.unknown ? 'Could not check your pets with Monad just now. Try again in a moment.' : GATE_MESSAGE, { gate: true });
    return g.pet;
  }
  const g = await gateFor(env, who.address).catch(() => null);
  return g?.pet ?? null;
}

/** The message a reply answers, quoted as it is now: null when there is none, it is gone, or it is in another room. */
async function quoteOf(env, room, id) {
  const r = await env.DB.prepare('SELECT m.id, m.sender, m.body, m.gif, m.room, m.deleted_at, p.name FROM messages m LEFT JOIN profiles p ON p.address = m.sender WHERE m.id = ?').bind(id).first();
  if (!r || r.room !== room || r.deleted_at) return null;
  return replyQuote(r.id, r.sender, r.sender === CRIER ? CRIER_NAME : r.name, r.body, r.gif);
}

/** POST /api/social/chat { room, text, gif?, replyTo? } */
export async function postChat(env, who, b, ctx) {
  const room = roomOf(b.room ?? 'square');
  if (who.muteUntil) fail(403, `You are muted until ${new Date(who.muteUntil).toUTCString()}.`, { muted: who.muteUntil });
  const text = cleanText(b.text);
  const gif = b.gif == null ? null : cleanGif(b.gif);
  if (b.gif != null && !gif) fail(400, 'That GIF cannot be used. Pick another.');
  if (!text && !gif) fail(400, 'Write something first.');
  if (charCount(text) > LIMITS.chat) fail(400, `A message can be at most ${LIMITS.chat} characters.`);
  if (text && await filtered(env, text)) fail(400, FILTER_MESSAGE);
  let re = null;
  if (b.replyTo != null) {
    const id = Number(b.replyTo);
    if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Bad reply.');
    re = await quoteOf(env, room, id);
    if (!re) fail(404, 'The message you are replying to is gone.');
  }
  const gatePet = await mayTakePart(env, who);
  const { name, pet } = await bubblePet(env, who.address, gatePet);
  // @names that belong to someone
  const names = findMentions(text);
  let mentions = [];
  if (names.length) {
    const { results } = await env.DB.prepare(`SELECT address, name FROM profiles WHERE name_key IN (${names.map(() => '?').join(',')})`).bind(...names).all();
    mentions = results.filter((r) => r.address !== who.address).map((r) => ({ n: r.name, a: r.address }));
  }
  const res = await roomStub(env, room).fetch('https://room/post', { method: 'POST', body: JSON.stringify({ address: who.address, name, pet, text, gif, re, mentions, admin: who.admin }) });
  const out = await res.json();
  if (!out.ok) return json({ error: out.error, wait: out.wait ?? null }, out.status ?? 500);
  // mentions notify, and so does a reply (once: a reply that also mentions its author is one notification), unless the
  // person has blocked the sender
  const told = new Set();
  const tell = [...(re && re.a !== who.address && re.a !== CRIER ? [{ a: re.a, kind: 'reply' }] : []), ...mentions.map((m) => ({ a: m.a, kind: 'mention' }))].filter((x) => !told.has(x.a) && told.add(x.a));
  if (tell.length) ctx.waitUntil((async () => {
    for (const x of tell) {
      const blocked = await env.DB.prepare('SELECT 1 AS x FROM blocks WHERE blocker = ? AND blocked = ?').bind(x.a, who.address).first();
      if (!blocked) await notify(env, x.a, x.kind, who.address, `chat:${out.m.id}`);
    }
  })());
  return json({ ok: true, m: out.m });
}

/**
 * POST /api/social/chat/react { id, emoji } : your reaction to a message, like X: any one emoji (cleanEmoji), one per
 * person, so a new one replaces yours and `emoji: null` takes it back. The same people who may post may react (the gate,
 * not muted). The counts are recounted, never stepped, kept on the message as [[emoji, n], ...] and sent round the room.
 * The author hears about it once per person, whatever they change it to later (unless they blocked them).
 * POST /chat/like { id, on } is the heart it replaced: on = a red heart, off = none.
 */
export async function reactChat(env, who, b, ctx) {
  const id = Number(b.id);
  if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Bad id.');
  const emoji = b.emoji == null ? null : cleanEmoji(b.emoji);
  if (b.emoji != null && !emoji) fail(400, 'A reaction is one emoji.');
  await mayTakePart(env, who);
  if (await limited(env.LIKE_LIMIT, who.address)) fail(429, 'Easy on the reactions. Try again in a moment.');
  const m = await env.DB.prepare('SELECT id, room, sender, deleted_at, reactions FROM messages WHERE id = ?').bind(id).first();
  if (!m || m.deleted_at) fail(404, 'That message is gone.');
  if (emoji) {
    const kinds = m.reactions ? JSON.parse(m.reactions) : [];
    if (kinds.length >= MAX_REACTION_KINDS && !kinds.some(([e]) => e === emoji)) fail(400, 'That message has all the kinds of reaction it can take. Pick one already on it.');
  }
  const t = now();
  const change = emoji
    ? env.DB.prepare('INSERT INTO message_reactions (message_id, address, emoji, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(message_id, address) DO UPDATE SET emoji = ?3, created_at = ?4').bind(id, who.address, emoji, t)
    : env.DB.prepare('DELETE FROM message_reactions WHERE message_id = ? AND address = ?').bind(id, who.address);
  const [, counted] = await env.DB.batch([change, env.DB.prepare('SELECT emoji, COUNT(*) AS n FROM message_reactions WHERE message_id = ? GROUP BY emoji ORDER BY n DESC, MIN(created_at)').bind(id)]);
  const r = counted.results.map((x) => [x.emoji, x.n]);
  const total = r.reduce((n, [, c]) => n + c, 0);
  await env.DB.prepare('UPDATE messages SET reactions = ?, likes = ? WHERE id = ?').bind(r.length ? JSON.stringify(r) : null, total, id).run();
  ctx.waitUntil(roomStub(env, m.room).fetch('https://room/react', { method: 'POST', body: JSON.stringify({ id, r }) }).catch(() => {}));
  if (emoji && m.sender !== who.address) ctx.waitUntil((async () => {
    const [blocked, had] = await Promise.all([
      env.DB.prepare('SELECT 1 AS x FROM blocks WHERE blocker = ? AND blocked = ?').bind(m.sender, who.address).first(),
      env.DB.prepare("SELECT 1 AS x FROM notifications WHERE address = ? AND (kind = 'like' OR kind LIKE 'react:%') AND actor = ? AND ref = ?").bind(m.sender, who.address, `chat:${id}`).first(),
    ]);
    if (!blocked && !had) await notify(env, m.sender, `react:${emoji}`, who.address, `chat:${id}`);
  })());
  return json({ ok: true, id, r, mine: emoji });
}
/** The old heart: on = a red heart reaction, off = none. Kept for pages opened before reactions shipped. */
export async function likeChat(env, who, b, ctx) {
  return reactChat(env, who, { id: b.id, emoji: b.on === false ? null : REACTION_PRESETS[0] }, ctx);
}

/** GET /api/social/chat/mine?ids=1,2,3 : the signed-in person's reaction to each of these (at most 200): { mine: { id: emoji } }. */
export async function mineChat(env, who, url) {
  const ids = [...new Set(String(url.searchParams.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 200);
  if (!ids.length) return json({ mine: {}, ids: [] });
  const { results } = await env.DB.prepare(`SELECT message_id, emoji FROM message_reactions WHERE address = ? AND message_id IN (${ids.map(() => '?').join(',')})`).bind(who.address, ...ids).all();
  // `ids` for pages opened before reactions shipped (they asked /chat/liked and read the ids)
  return json({ mine: Object.fromEntries(results.map((r) => [r.message_id, r.emoji])), ids: results.map((r) => r.message_id) });
}
export const likedChat = mineChat;

/** GET /api/social/chat/history?room=square&before=<id> : fifty messages before that id, oldest first. */
export async function history(env, url) {
  const room = roomOf(url.searchParams.get('room') ?? 'square');
  const before = Number(url.searchParams.get('before') ?? 0) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(`${MESSAGE_SQL} WHERE m.room = ? AND m.id < ? AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 50`).bind(room, before).all();
  return json({ items: results.reverse().map(shapeMessage), more: results.length === 50 });
}

/** A square message row with what it needs: its author's name, and the message it answers (if that still stands). */
export const MESSAGE_SQL = `SELECT m.id, m.sender, m.body, m.pet_col, m.pet_id, m.mentions, m.created_at, m.gif, m.likes, m.reactions, m.reply_to, m.sys, p.name,
    r.id AS re_id, r.sender AS re_sender, r.body AS re_body, r.gif AS re_gif, rp.name AS re_name
  FROM messages m LEFT JOIN profiles p ON p.address = m.sender
  LEFT JOIN messages r ON r.id = m.reply_to AND r.deleted_at IS NULL LEFT JOIN profiles rp ON rp.address = r.sender`;
export const shapeMessage = (r) => ({
  id: r.id, a: r.sender, n: r.sender === CRIER ? CRIER_NAME : r.name ?? null, p: r.pet_col ? { col: r.pet_col, id: r.pet_id } : null, text: r.body,
  men: r.mentions ? JSON.parse(r.mentions) : [], at: r.created_at,
  ...(r.sys ? { sys: JSON.parse(r.sys) } : {}),
  ...(r.gif ? { g: cleanGif(JSON.parse(r.gif)) } : {}),
  ...(r.reactions ? { rx: JSON.parse(r.reactions) } : {}),
  ...(r.reply_to ? { re: r.re_id ? replyQuote(r.re_id, r.re_sender, r.re_name, r.re_body, r.re_gif) : { id: r.reply_to, gone: true } } : {}),
});

/** POST /api/social/chat/delete { id } : your own message (admins use the admin route for anyone's). */
export async function deleteOwn(env, who, b) {
  const id = Number(b.id);
  if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Bad id.');
  const res = await roomStub(env, roomOf(b.room ?? 'square')).fetch('https://room/delete', { method: 'POST', body: JSON.stringify({ id, by: who.address, admin: false }) });
  const out = await res.json();
  if (!out.ok) fail(out.status ?? 500, out.error);
  return json({ ok: true });
}

/**
 * GET /api/social/chat/ws?room=square : the websocket. Signed-in readers are announced to the room (their name and
 * their pet, so the pet can walk into town while they are here); anyone else reads anonymously.
 */
export async function chatSocket(request, env, who, url) {
  const room = roomOf(url.searchParams.get('room') ?? 'square');
  const headers = new Headers();
  for (const [k, v] of request.headers) if (/^(upgrade|connection|sec-websocket-)/i.test(k)) headers.set(k, v);
  if (who) {
    const g = await gateFor(env, who.address).catch(() => null);
    const { name, pet } = await bubblePet(env, who.address, g?.ok ? g.pet : null);
    headers.set('x-emo-address', who.address);
    if (name) headers.set('x-emo-name', name);
    if (pet) headers.set('x-emo-pet', `${pet.col}:${pet.id}`);
  }
  return roomStub(env, room).fetch(`https://room/ws?room=${room}`, { method: 'GET', headers });
}
