/**
 * Emotown's social layer: /api/social/*. Built 2026-09-26 on Cloudflare only: D1 (`DB`) is the record, the ChatRoom
 * and Inbox Durable Objects (`CHAT`, `INBOX`) carry the live parts, rate-limit bindings keep callers honest.
 *
 * If any of it is missing or down, the rest of the Worker (and the town) carries on: this router answers 503 and the
 * site shows the town without chat.
 */
import { HttpError, checkOrigin, fail, ipKey, json, limited, readJson } from './http.js';
import { issueNonce, requireSession, sessionOf, signOut, verifySignIn } from './auth.js';
import { gateFor } from './gate.js';
import { cards, followList, getProfile, profileData, resolveKey, saveProfile, searchPeople } from './profiles.js';
import { block, follow, unblock, unfollow } from './graph.js';
import { chatSocket, deleteOwn, history, likeChat, likedChat, mineChat, postChat, reactChat, roomStub } from './chat.js';
import { likeDm, markRead, reactDm, sendDm, thread, threads, unreadDms } from './dm.js';
import { gifsOn, searchGifs } from './gifs.js';
import { listNotifications, readNotifications, unreadNotifications } from './notify.js';
import { admin, report } from './moderation.js';
import { activity } from './activity.js';
import { pendingPics, removeOwn, upload, viewPrivate } from './pics.js';
import { publicRoles } from './roles.js';
import { pushRoute } from '../push.js';

export { ChatRoom, Inbox } from './rooms.js';

const GET = 'GET', POST = 'POST';

export async function social(request, env, ctx, url) {
  // `return await`: a handler's rejected promise must land in this catch, not escape it as a 500
  try { return await dispatch(request, env, ctx, url); } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error('[social]', String(e?.stack ?? e).slice(0, 400));
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
}

async function dispatch(request, env, ctx, url) {
  {
    if (!env.DB || !env.CHAT) return json({ error: 'Emotown chat is resting right now.', down: true }, 503);
    const path = url.pathname.slice('/api/social'.length) || '/';
    const m = request.method;
    let seg;
    try { seg = path.split('/').filter(Boolean).map(decodeURIComponent); } catch { return json({ error: 'Bad address.' }, 400); }
    if (m !== GET && m !== POST) return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });
    if (m === POST) {
      checkOrigin(request, env);
      if (await limited(env.SOCIAL_LIMIT, ipKey(request))) fail(429, 'Too many requests from here. Wait a moment.');
    } else if (!(WS_PATHS.has(path) && request.headers.get('upgrade') === 'websocket') && await limited(env.READ_LIMIT, ipKey(request))) {
      // only the two socket routes skip this (they have their own limits); an Upgrade header on any other read used
      // to skip it too (security review, 2026-09-27)
      // reads are public, and every one is a D1 query: a scraper gets slowed down, a person never notices
      fail(429, 'Too many requests from here. Wait a moment.');
    }
    const who = () => requireSession(request, env, ctx);
    const body = () => readJson(request);

    switch (seg[0]) {
      case 'auth':
        if (seg[1] === 'nonce' && m === GET) return issueNonce(request, env, url);
        if (seg[1] === 'verify' && m === POST) return verifySignIn(request, env);
        if (seg[1] === 'logout' && m === POST) return signOut(request, env);
        break;
      case 'me': {
        if (m !== GET) break;
        const s = await sessionOf(request, env, ctx);
        if (!s) return json({ signedIn: false });
        // a session refresh re-reads the gate (cached five minutes), so selling your last named pet shows up here
        const [profile, gate, dms, notes, blocks, following, picsWaiting] = await Promise.all([
          profileData(env, s, s.address),
          gateFor(env, s.address),
          unreadDms(env, s.address),
          unreadNotifications(env, s.address),
          env.DB.prepare('SELECT blocked FROM blocks WHERE blocker = ?').bind(s.address).all(),
          env.DB.prepare('SELECT followee FROM follows WHERE follower = ? LIMIT 5000').bind(s.address).all(),
          s.admin ? pendingPics(env) : 0,
        ]);
        return json({ signedIn: true, address: s.address, admin: s.admin, muteUntil: s.muteUntil, profile, gate, unread: { dms, notifications: notes }, blocked: blocks.results.map((r) => r.blocked), following: following.results.map((r) => r.followee), gifs: gifsOn(env), ...(s.admin ? { picsWaiting } : {}) });
      }
      case 'unread': {
        // the two badges, cheaply: DM messages waiting, and notifications not yet seen
        if (m !== GET) break;
        const s = await who();
        const [dms, notifications] = await Promise.all([unreadDms(env, s.address), unreadNotifications(env, s.address)]);
        return json({ dms, notifications });
      }
      case 'gate':
        if (seg[1] === 'refresh' && m === POST) {
          const s = await who();
          if (await limited(env.GATE_LIMIT, s.address)) fail(429, 'Checked a moment ago. Give it a few seconds.');
          return json(await gateFor(env, s.address, { force: true }));
        }
        break;
      case 'profile':
        if (m === POST && seg.length === 1) return saveProfile(env, await who(), await body());
        if (m === GET && seg[1]) {
          const s = await sessionOf(request, env, ctx);
          if (!seg[2]) return getProfile(env, s, seg[1]);
          if (seg[2] === 'followers' || seg[2] === 'following') return followList(env, seg[1], seg[2], url);
          if (seg[2] === 'activity') {
            const a = await resolveKey(env, seg[1]);
            if (!a) fail(404, 'Nobody by that name lives in Emotown.');
            return activity(env, ctx, a, url.origin);
          }
        }
        break;
      case 'cards': if (m === GET) return cards(env, url); break;
      case 'roles': if (m === GET && !seg[1]) return publicRoles(env); break;
      case 'search': if (m === GET) return searchPeople(env, url); break;
      case 'follow': if (m === POST) return follow(env, await who(), await body()); break;
      case 'unfollow': if (m === POST) return unfollow(env, await who(), await body()); break;
      case 'block': if (m === POST) return block(env, await who(), await body()); break;
      case 'unblock': if (m === POST) return unblock(env, await who(), await body()); break;
      case 'chat':
        if (!seg[1] && m === POST) return postChat(env, await who(), await body(), ctx);
        if (seg[1] === 'history' && m === GET) return history(env, url);
        if (seg[1] === 'delete' && m === POST) return deleteOwn(env, await who(), await body());
        if (seg[1] === 'react' && m === POST) return reactChat(env, await who(), await body(), ctx);
        if (seg[1] === 'mine' && m === GET) return mineChat(env, await who(), url);
        if (seg[1] === 'like' && m === POST) return likeChat(env, await who(), await body(), ctx);    // the heart, before reactions
        if (seg[1] === 'liked' && m === GET) return likedChat(env, await who(), url);
        if (seg[1] === 'who' && m === GET) return new Response((await roomStub(env, 'square').fetch('https://room/who')).body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        if (seg[1] === 'ws' && m === GET) {
          checkOrigin(request, env);
          if (request.headers.get('upgrade') !== 'websocket') fail(426, 'This is a websocket.');
          // a signed-in person's sockets count against THEM, not their IP address: a room of phones behind one mobile
          // carrier's NAT shares a single IPv4 address, and 30 a minute between all of them is soon spent. Anyone
          // else counts against the IP; and before the session is looked up at all, a generous per-IP cap
          if (await limited(env.READ_LIMIT, ipKey(request))) fail(429, 'Too many connections from here.');
          const s = await sessionOf(request, env, ctx);
          if (await limited(env.SOCKET_LIMIT, s ? `a:${s.address}` : ipKey(request))) fail(429, 'Too many connections from here.');
          return chatSocket(request, env, s, url);
        }
        break;
      case 'inbox':
        if (seg[1] === 'ws' && m === GET) {
          checkOrigin(request, env);
          if (request.headers.get('upgrade') !== 'websocket') fail(426, 'This is a websocket.');
          const s = await who();
          if (await limited(env.SOCKET_LIMIT, `i:${s.address}`)) fail(429, 'Too many connections. Wait a moment.');
          const headers = new Headers();
          for (const [k, v] of request.headers) if (/^(upgrade|connection|sec-websocket-)/i.test(k)) headers.set(k, v);
          // the socket is tagged with its session, so signing out (or the session ending) closes it (rooms.js Inbox)
          headers.set('x-emo-session', s.hash);
          return env.INBOX.get(env.INBOX.idFromName(s.address)).fetch('https://inbox/ws', { headers });
        }
        break;
      case 'dm':
        if (seg[1] === 'threads' && m === GET) return threads(env, await who());
        if (seg[1] === 'thread' && seg[2] && m === GET) return thread(env, await who(), seg[2], url);
        if (seg[1] === 'send' && m === POST) return sendDm(env, await who(), await body(), ctx);
        if (seg[1] === 'read' && m === POST) return markRead(env, await who(), await body());
        if (seg[1] === 'react' && m === POST) return reactDm(env, await who(), await body());
        if (seg[1] === 'like' && m === POST) return likeDm(env, await who(), await body());   // the heart, before reactions
        break;
      case 'gifs': if (m === GET && !seg[1]) return searchGifs(env, ctx, await who(), url); break;
      case 'notifications':
        if (!seg[1] && m === GET) return listNotifications(env, await who(), url);
        if (seg[1] === 'read' && m === POST) return readNotifications(env, await who(), await body());
        break;
      case 'report': if (m === POST) return report(env, await who(), await body()); break;
      case 'push': { const r = await pushRoute(request, env, ctx, url, seg, m, body); if (r) return r; break; }   // the home-screen app's notifications (worker/push.js)
      case 'pic':
        // uploading a picture (the body is the picture), taking yours off, and seeing one that is not public yet
        if (!seg[1] && m === POST) return upload(request, env, await who(), url);
        if (seg[1] === 'remove' && m === POST) return removeOwn(env, await who(), await body());
        if (seg[1] === 'view' && seg[2] && m === GET) return viewPrivate(env, await who(), seg[2]);
        break;
      case 'admin':
        if (seg[1]) return admin(env, await who(), seg[1], m === POST ? await body() : null, url);
        break;
    }
    return json({ error: 'Not found.' }, 404);
  }
}

/** the two routes that open sockets: they carry their own limits, so only they skip the per-IP read limit */
const WS_PATHS = new Set(['/chat/ws', '/inbox/ws']);

/** The cron: expired nonces and sessions go, and read notifications older than a month. */
export async function sweep(env) {
  if (!env.DB) return;
  const t = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM nonces WHERE created_at < ?').bind(t - 20 * 60_000),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
    env.DB.prepare('DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < ?').bind(t - 30 * 86_400_000),
    env.DB.prepare('DELETE FROM pic_tries WHERE at < ?').bind(t - 2 * 86_400_000),
    env.DB.prepare('DELETE FROM gif_cache WHERE at < ?').bind(t - 2 * 86_400_000),
  ]);
}
