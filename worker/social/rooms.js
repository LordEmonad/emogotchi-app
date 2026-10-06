/**
 * The two Durable Objects behind the live parts of Emotown.
 *
 * ChatRoom: the town square. Every open Emotown tab keeps one websocket to it, signed in or not (anyone may read the
 * square). It uses the WebSocket Hibernation API, so a thousand idle readers cost nothing between messages: the object
 * sleeps with the sockets open and wakes only for a post, a join or a leave. It owns the room's live rules (slow mode,
 * each person's pace, the room-wide cap) in its own SQLite storage, writes each message to D1 (the record), keeps the
 * last sixty for a newcomer's first screen, and tells everyone who is here (presence, batched every 1.5 s so a crowd
 * arriving is one broadcast, not a thousand). One object per room: the square is "square"; a busier town can split
 * into rooms by stretch of street without changing anything here.
 *
 * Inbox: one per person, keyed by address. It is only the pipe to that person's open tabs (a DM, a notification, a
 * read marker, a block made in another tab). D1 holds everything; an Inbox with nobody connected just drops the push.
 *
 * Both trust their caller: only this Worker can reach them (a Durable Object has no public address), and the Worker
 * only ever sends identity it read from a verified session.
 */
import { DurableObject } from 'cloudflare:workers';
import { MESSAGE_SQL, shapeMessage } from './chat.js';

const RECENT = 60;
const PRESENCE_FLUSH_MS = 1500;
const MIN_GAP_MS = 1200;                  // nobody posts twice within this, slow mode or not
const BURST = { n: 5, ms: 20_000 };       // at most five in twenty seconds
const SUSTAINED = { n: 40, ms: 600_000 }; // and forty in ten minutes
const DUP_MS = 90_000;                    // the same words again within ninety seconds is refused
const ROOM_PER_SECOND = 20;               // the whole room, all together

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS limits (address TEXT PRIMARY KEY, times TEXT NOT NULL, last_hash TEXT, last_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recent (id INTEGER PRIMARY KEY, json TEXT NOT NULL);`);
    // a ping from a client is answered without waking the room
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    this.joins = new Map();   // address -> person, since the last presence broadcast
    this.leaves = new Set();
    this.roomTimes = [];
    this.loaded = null;
  }

  get room() { return this.cfg('room') ?? 'square'; }
  cfg(key) { const r = this.sql.exec('SELECT value FROM config WHERE key = ?', key).toArray()[0]; return r ? r.value : null; }
  setCfg(key, value) { this.sql.exec('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value)); }
  get slow() { return Number(this.cfg('slow') ?? 0); }

  /** The last sixty messages, oldest first; read from D1 the first time this room ever wakes. */
  async recent() {
    if (!this.loaded) this.loaded = (async () => {
      const have = this.sql.exec('SELECT COUNT(*) AS n FROM recent').one().n;
      if (have === 0 && this.env.DB) {
        const { results } = await this.env.DB.prepare(`${MESSAGE_SQL} WHERE m.room = ? AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT ?`).bind(this.room, RECENT).all();
        for (const r of results) this.sql.exec('INSERT OR REPLACE INTO recent (id, json) VALUES (?, ?)', r.id, JSON.stringify(shapeMessage(r)));
      }
    })().catch((e) => { this.loaded = null; throw e; });
    await this.loaded;
    return this.sql.exec('SELECT json FROM recent ORDER BY id DESC LIMIT ?', RECENT).toArray().reverse().map((r) => JSON.parse(r.json));
  }

  people() {
    const seen = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      const at = ws.deserializeAttachment();
      if (at?.a && !seen.has(at.a)) seen.set(at.a, { a: at.a, n: at.n ?? null, p: at.p ?? null });
    }
    return [...seen.values()];
  }
  broadcast(obj, except = null) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) { if (ws === except) continue; try { ws.send(s); } catch { /* closing */ } }
  }
  schedulePresence() {
    void this.ctx.storage.getAlarm().then((at) => { if (!at) void this.ctx.storage.setAlarm(Date.now() + PRESENCE_FLUSH_MS); });
  }
  async alarm() {
    if (!this.joins.size && !this.leaves.size) return;
    const join = [...this.joins.values()]; const leave = [...this.leaves].filter((a) => !this.ctx.getWebSockets('u:' + a).length);
    this.joins.clear(); this.leaves.clear();
    this.broadcast({ t: 'presence', join, leave, online: this.ctx.getWebSockets().length });
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/ws': return await this.connect(request, url);
        case '/post': return Response.json(await this.post(await request.json()));
        case '/delete': return Response.json(await this.remove(await request.json()));
        case '/react': return Response.json(this.react(await request.json()));
        case '/purge': return Response.json(await this.purge(await request.json()));
        case '/config': return Response.json(this.configure(await request.json()));
        // the roles changed (roles.js): every open tab reads them again
        case '/roles': { const { v } = await request.json(); this.broadcast({ t: 'roles', v: Number(v) || 0 }); return Response.json({ ok: true }); }
        case '/kick': { const { address } = await request.json(); for (const ws of this.ctx.getWebSockets('u:' + address)) { try { ws.close(4003, 'signed out'); } catch { /* gone */ } } return Response.json({ ok: true }); }
        case '/who': return Response.json({ online: this.ctx.getWebSockets().length, people: this.people().length, slow: this.slow });
        case '/history': return Response.json({ items: await this.recent() });
      }
      return new Response('not found', { status: 404 });
    } catch (e) {
      console.error('[chatroom]', String(e?.stack ?? e).slice(0, 300));
      return Response.json({ ok: false, status: 500, error: 'The square had a problem. Try again.' }, { status: 500 });
    }
  }

  async connect(request, url) {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    if (!this.cfg('room')) this.setCfg('room', url.searchParams.get('room') ?? 'square');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const a = request.headers.get('x-emo-address');
    const person = a ? { a, n: request.headers.get('x-emo-name') || null, p: parsePet(request.headers.get('x-emo-pet')) } : null;
    this.ctx.acceptWebSocket(server, a ? ['u:' + a] : []);
    server.serializeAttachment(person ? { ...person, since: Date.now() } : { since: Date.now() });
    const recent = await this.recent();
    server.send(JSON.stringify({ t: 'hello', room: this.room, recent, people: this.people(), online: this.ctx.getWebSockets().length, slow: this.slow }));
    if (person && this.ctx.getWebSockets('u:' + a).length === 1) { this.leaves.delete(a); this.joins.set(a, person); this.schedulePresence(); }
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, msg) {
    // the square is read over the socket and written over HTTP (where the session and the gate are checked); the only
    // thing a client says here is a ping, which the auto-response answers before this ever runs
    // anything else is not something this room reads: the socket goes (each stray frame wakes the room and counts)
    if (typeof msg === 'string' && msg.length < 64 && msg.includes('ping')) ws.send('{"t":"pong"}');
    else { try { ws.close(1008, 'unexpected'); } catch { /* gone */ } this.gone(ws); }
  }
  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    const at = ws.deserializeAttachment();
    try { ws.close(1000, 'bye'); } catch { /* already closed */ }
    if (!at?.a) return;
    // another tab of theirs may still be here
    const still = this.ctx.getWebSockets('u:' + at.a).filter((w) => w !== ws && w.readyState === 1).length;
    if (!still) { this.joins.delete(at.a); this.leaves.add(at.a); this.schedulePresence(); }
  }

  /** A message from the Worker, already signed in, gated, filtered and trimmed: pace it, record it, send it round. */
  async post({ address, name, pet, text, gif, re, mentions, admin, sys, sysKey }) {
    const t = Date.now();
    this.roomTimes = this.roomTimes.filter((x) => t - x < 1000);
    if (this.roomTimes.length >= ROOM_PER_SECOND && !admin) return { ok: false, status: 429, error: 'The square is very busy right now. Try again in a moment.' };
    if (!admin) {
      const row = this.sql.exec('SELECT times, last_hash, last_at FROM limits WHERE address = ?', address).toArray()[0];
      const times = row ? JSON.parse(row.times).filter((x) => t - x < SUSTAINED.ms) : [];
      const last = times.length ? times[times.length - 1] : 0;
      const gap = Math.max(MIN_GAP_MS, this.slow * 1000);
      if (t - last < gap) return { ok: false, status: 429, error: this.slow ? `Slow mode is on: one message every ${this.slow} seconds.` : 'Slow down a little.', wait: gap - (t - last) };
      if (times.filter((x) => t - x < BURST.ms).length >= BURST.n) return { ok: false, status: 429, error: 'Slow down a little.', wait: BURST.ms - (t - times[times.length - BURST.n]) };
      if (times.length >= SUSTAINED.n) return { ok: false, status: 429, error: 'That is a lot of talking. Take a short break.', wait: SUSTAINED.ms - (t - times[0]) };
      const hash = `${text.toLowerCase().replace(/\s+/g, ' ')}|${gif?.id ?? ''}`;   // two different GIFs are two different things to say
      if (row && row.last_hash === hash && t - row.last_at < DUP_MS) return { ok: false, status: 429, error: 'You just said that.' };
      times.push(t);
      this.sql.exec('INSERT INTO limits (address, times, last_hash, last_at) VALUES (?, ?, ?, ?) ON CONFLICT(address) DO UPDATE SET times = excluded.times, last_hash = excluded.last_hash, last_at = excluded.last_at', address, JSON.stringify(times), hash, t);
    }
    this.roomTimes.push(t);
    await this.recent();   // loaded before the insert, so the first message of a fresh room is not listed twice
    let r;
    try {
      r = await this.env.DB.prepare('INSERT INTO messages (room, sender, body, pet_col, pet_id, mentions, created_at, gif, reply_to, sys, sys_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
        .bind(this.room, address, text, pet?.col ?? null, pet?.id ?? null, mentions?.length ? JSON.stringify(mentions) : null, t, gif ? JSON.stringify(gif) : null, re?.id ?? null, sys ? JSON.stringify(sys) : null, sysKey ?? null).first();
    } catch (e) {
      // the crier's events are keyed, and one the square already carries is simply not posted again
      if (sysKey && /UNIQUE/i.test(String(e))) return { ok: false, status: 409, error: 'Already told.' };
      throw e;
    }
    const m = { id: r.id, a: address, n: name ?? null, p: pet ?? null, text, men: mentions ?? [], at: t, ...(gif ? { g: gif } : {}), ...(re ? { re } : {}), ...(sys ? { sys } : {}) };
    this.sql.exec('INSERT OR REPLACE INTO recent (id, json) VALUES (?, ?)', m.id, JSON.stringify(m));
    this.sql.exec('DELETE FROM recent WHERE id NOT IN (SELECT id FROM recent ORDER BY id DESC LIMIT ?)', RECENT);
    this.broadcast({ t: 'msg', m });
    return { ok: true, m };
  }

  /** Delete one message (its author, or an admin). */
  async remove({ id, by, admin }) {
    const row = await this.env.DB.prepare('SELECT sender FROM messages WHERE id = ? AND room = ? AND deleted_at IS NULL').bind(id, this.room).first();
    if (!row) return { ok: false, status: 404, error: 'That message is already gone.' };
    if (row.sender !== by && !admin) return { ok: false, status: 403, error: 'That is not your message.' };
    await this.env.DB.prepare('UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?').bind(Date.now(), by, id).run();
    this.sql.exec('DELETE FROM recent WHERE id = ?', id);
    this.unquote((q) => q.id === id);
    this.broadcast({ t: 'del', ids: [id] });
    return { ok: true, sender: row.sender };
  }
  /** Delete everything one person said here (a ban with a purge). */
  async purge({ address, by }) {
    const { results } = await this.env.DB.prepare('UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE room = ? AND sender = ? AND deleted_at IS NULL RETURNING id').bind(Date.now(), by, this.room, address).all();
    for (const r of results) this.sql.exec('DELETE FROM recent WHERE id = ?', r.id);
    this.unquote((q) => q.a === address);
    this.broadcast({ t: 'del_user', a: address });
    return { ok: true, deleted: results.length };
  }
  /** A reply keeps no copy of a deleted message: its quote becomes { id, gone } here, as it does in every open tab. */
  unquote(match) {
    for (const row of this.sql.exec('SELECT id, json FROM recent').toArray()) {
      const m = JSON.parse(row.json);
      if (m.re && !m.re.gone && match(m.re)) { m.re = { id: m.re.id, gone: true }; this.sql.exec('UPDATE recent SET json = ? WHERE id = ?', JSON.stringify(m), row.id); }
    }
  }
  /** A reaction was counted (chat.js reactChat): keep the counts with the message and tell the room. */
  react({ id, r }) {
    const row = this.sql.exec('SELECT json FROM recent WHERE id = ?', id).toArray()[0];
    if (row) { const m = JSON.parse(row.json); delete m.likes; if (r?.length) m.rx = r; else delete m.rx; this.sql.exec('UPDATE recent SET json = ? WHERE id = ?', JSON.stringify(m), id); }
    this.broadcast({ t: 'react', id, r: r ?? [] });
    return { ok: true };
  }
  configure({ slow }) {
    const s = Math.max(0, Math.min(600, Math.round(Number(slow) || 0)));
    this.setCfg('slow', s);
    this.broadcast({ t: 'slow', s });
    return { ok: true, slow: s };
  }
}

export class Inbox extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      // a person has a few tabs at most; a runaway page opening sockets in a loop gets its oldest ones closed
      const open = this.ctx.getWebSockets();
      if (open.length >= 12) for (const ws of open.slice(0, open.length - 11)) { try { ws.close(4008, 'too many tabs'); } catch { /* gone */ } }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const session = request.headers.get('x-emo-session') ?? '';
      this.ctx.acceptWebSocket(server, /^[0-9a-f]{64}$/.test(session) ? ['s:' + session] : []);
      server.send('{"t":"ready"}');
      // every ten minutes the open sockets' sessions are checked: one that has ended (signed out elsewhere, pushed out by
      // a newer sign-in, expired) no longer hears this person's messages (security review, 2026-09-27)
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 600_000);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/end') {
      const session = url.searchParams.get('s') ?? '';
      for (const ws of this.ctx.getWebSockets('s:' + session)) { try { ws.close(4003, 'signed out'); } catch { /* gone */ } }
      return new Response('ok');
    }
    if (url.pathname === '/push') {
      const s = await request.text();
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(s); } catch { /* closing */ } }
      return new Response('ok');
    }
    if (url.pathname === '/close') {
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(4003, 'signed out'); } catch { /* gone */ } }
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg === 'string' && msg.length < 64 && msg.includes('ping')) ws.send('{"t":"pong"}');
    else { try { ws.close(1008, 'unexpected'); } catch { /* gone */ } }
  }
  async alarm() {
    const open = this.ctx.getWebSockets(); if (!open.length) return;
    const t = Date.now();
    const bySession = new Map();
    for (const ws of open) { const tag = this.ctx.getTags(ws).find((x) => x.startsWith('s:')); const k = tag ? tag.slice(2) : ''; (bySession.get(k) ?? bySession.set(k, []).get(k)).push(ws); }
    for (const [hash, list] of bySession) {
      let alive = false;
      if (hash) {
        try {
          const s = await this.env.DB.prepare('SELECT s.expires_at, (SELECT MAX(until) FROM bans b WHERE b.address = s.address) AS ban_until FROM sessions s WHERE s.token_hash = ?').bind(hash).first();
          alive = !!s && s.expires_at > t && !(s.ban_until > t);
        } catch { alive = true; }   // D1 could not say: do not throw people out over it
      }
      if (!alive) for (const ws of list) { try { ws.close(4003, 'signed out'); } catch { /* gone */ } }
    }
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(t + 600_000);
  }
  async webSocketClose(ws) { try { ws.close(1000, 'bye'); } catch { /* already closed */ } }
  async webSocketError(ws) { try { ws.close(1011, 'error'); } catch { /* already closed */ } }
}

function parsePet(s) {
  const m = /^(cat|frok|sahur|thiccums|r3tards|emonad):(\d{1,7})$/.exec(s ?? '');
  return m ? { col: m[1], id: Number(m[2]) } : null;
}
