/**
 * Profiles: a wallet address, and what its owner says about themselves. Anyone can read any profile, including one
 * for an address that has never signed in (it is just empty). Only the owner can change theirs.
 *
 * Every field is plain text, checked against rules.js (the site uses the same file) and the word filter. The avatar is
 * one of the owner's own pets, checked on chain when it is chosen; the banner is one of Emotown's pictures. There are
 * no uploads of any kind.
 */
import { BANNERS, LIMITS, PLATFORMS, charCount, checkName, cleanText, isAddr, normalizeSocial } from './rules.js';
import { COLS, ownerOfPet } from './chain.js';
import { FILTER_MESSAGE, filtered } from './filter.js';
import { fail, json, now } from './http.js';
import { isAdmin } from './auth.js';
import { heldOf } from './pics.js';

const NAME_EVERY = 24 * 3600_000;

/** An address or a display name (the vanity URL) to an address, or null. */
export async function resolveKey(env, key) {
  const k = String(key ?? '').trim();
  if (isAddr(k)) return k.toLowerCase();
  const c = checkName(k);
  if (!c.ok && !/^[A-Za-z0-9_]{3,20}$/.test(k)) return null;
  const r = await env.DB.prepare('SELECT address FROM profiles WHERE name_key = ?').bind(k.toLowerCase()).first();
  return r?.address ?? null;
}

/**
 * The small version of a profile, for lists and chat: name and avatar. The avatar is the pet they chose, or else the
 * named pet the gate last saw them holding; `pic` is the picture they uploaded, when one is live (pics.js), shown in
 * the pet's place wherever a PERSON is shown (the bubbles in town still go over the pet).
 */
export const CARD_SQL = (col) => `p.name AS name, COALESCE(p.avatar_col, g.pet_col) AS petCol, COALESCE(p.avatar_id, g.pet_id) AS petId, p.pic AS pic`;
export const CARD_JOIN = (col) => `LEFT JOIN profiles p ON p.address = ${col} LEFT JOIN gate g ON g.address = ${col} AND g.ok = 1`;
export const card = (r, address = r.address) => ({ address, name: r.name ?? null, pet: r.petCol ? { col: r.petCol, id: r.petId } : null, pic: r.pic ?? null });

/** GET /api/social/profile/:key */
export async function getProfile(env, who, key) { return json(await profileData(env, who, key)); }

export async function profileData(env, who, key) {
  const address = await resolveKey(env, key);
  if (!address) fail(404, 'Nobody by that name lives in Emotown.');
  const [p, u, socials, counts, gate] = await Promise.all([
    env.DB.prepare('SELECT name, name_changed_at, bio, avatar_col, avatar_id, banner, pic, banner_pic, card_pic, updated_at FROM profiles WHERE address = ?').bind(address).first(),
    env.DB.prepare('SELECT n, joined_at FROM users WHERE address = ?').bind(address).first(),
    env.DB.prepare('SELECT platform, handle FROM socials WHERE address = ?').bind(address).all(),
    env.DB.prepare('SELECT (SELECT COUNT(*) FROM follows WHERE followee = ?) AS followers, (SELECT COUNT(*) FROM follows WHERE follower = ?) AS following').bind(address, address).first(),
    env.DB.prepare('SELECT ok, pet_col, pet_id, pet_name, checked_at FROM gate WHERE address = ?').bind(address).first(),
  ]);
  const out = {
    address,
    name: p?.name ?? null,
    // when the current name was claimed: a name can change hands, and the site's Send asks for a tick when it is new
    nameSince: p?.name ? (p.name_changed_at ?? null) : null,
    bio: p?.bio ?? '',
    avatar: p?.avatar_col ? { col: p.avatar_col, id: p.avatar_id } : gate?.ok && gate.pet_col ? { col: gate.pet_col, id: gate.pet_id } : null,
    avatarChosen: !!p?.avatar_col,
    banner: p?.banner ?? 'hall',
    pic: p?.pic ?? null,
    bannerPic: p?.banner_pic ?? null,
    card: p?.card_pic ?? null,
    socials: Object.fromEntries((socials.results ?? []).map((s) => [s.platform, s.handle])),
    joinedAt: u?.joined_at ?? null,
    resident: u?.n ?? null,
    followers: counts?.followers ?? 0,
    following: counts?.following ?? 0,
    named: !!gate?.ok,
    admin: isAdmin(env, address),
  };
  // their own profile also says which of their pictures are still waiting for a check
  if (who && who.address === address) { out.held = await heldOf(env, address); out.updatedAt = p?.updated_at ?? 0; }
  if (who && who.address !== address) {
    const rel = await env.DB.prepare(`SELECT
        EXISTS(SELECT 1 FROM follows WHERE follower = ?1 AND followee = ?2) AS following,
        EXISTS(SELECT 1 FROM follows WHERE follower = ?2 AND followee = ?1) AS followedBy,
        EXISTS(SELECT 1 FROM blocks WHERE blocker = ?1 AND blocked = ?2) AS blocked,
        EXISTS(SELECT 1 FROM blocks WHERE blocker = ?2 AND blocked = ?1) AS blockedBy,
        EXISTS(SELECT 1 FROM conversations WHERE id = ?3 AND started_by = ?2) AS theyWrote`).bind(who.address, address, convId(who.address, address)).first();
    // may I message them: they follow me (mutual follows included), or they started a conversation with me; never
    // across a block in either direction (whether they blocked me is not shown, only that I cannot message them)
    const canDM = !rel.blocked && !rel.blockedBy && (!!rel.followedBy || !!rel.theyWrote);
    out.me = { following: !!rel.following, followedBy: !!rel.followedBy, blocked: !!rel.blocked, canDM };
  }
  return out;
}

export const convId = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** POST /api/social/profile { name?, bio?, avatar?, banner?, socials? } : any subset. */
export async function saveProfile(env, who, b) {
  // a muted account cannot rewrite its name, bio or links either (it was mute-proof: security review, 2026-09-27)
  if (who.muteUntil > now() && !who.admin) fail(403, 'You are muted for now.');
  const t = now();
  const cur = await env.DB.prepare('SELECT name, name_key, name_changed_at, bio, avatar_col, avatar_id, banner FROM profiles WHERE address = ?').bind(who.address).first();
  const next = { name: cur?.name ?? null, key: cur?.name_key ?? null, changed: cur?.name_changed_at ?? null, bio: cur?.bio ?? '', col: cur?.avatar_col ?? null, id: cur?.avatar_id ?? null, banner: cur?.banner ?? 'hall' };
  const errors = {};

  if ('name' in b) {
    if (b.name === null || b.name === '') { next.name = null; next.key = null; }
    else {
      const c = checkName(b.name);
      if (!c.ok) errors.name = c.error;
      else if (c.key !== next.key || c.name !== next.name) {
        if (await filtered(env, c.name)) errors.name = FILTER_MESSAGE;
        else if (c.key !== next.key && next.changed && t - next.changed < NAME_EVERY && !who.admin) errors.name = 'You can change your name once a day.';
        else {
          const taken = await env.DB.prepare('SELECT address FROM profiles WHERE name_key = ?').bind(c.key).first();
          if (taken && taken.address !== who.address) errors.name = 'That name is taken.';
          else { if (c.key !== next.key) next.changed = t; next.name = c.name; next.key = c.key; }
        }
      }
    }
  }
  if ('bio' in b) {
    const bio = cleanText(b.bio ?? '', { multiline: true });
    if (charCount(bio) > LIMITS.bio) errors.bio = `A bio can be at most ${LIMITS.bio} characters.`;
    else if (bio && await filtered(env, bio)) errors.bio = FILTER_MESSAGE;
    else next.bio = bio;
  }
  if ('avatar' in b) {
    if (b.avatar === null) { next.col = null; next.id = null; }
    else {
      const col = String(b.avatar?.col ?? ''); const id = Number(b.avatar?.id);
      if (!COLS.includes(col) || !Number.isSafeInteger(id) || id <= 0) errors.avatar = 'Pick one of your pets.';
      else {
        let owner;
        try { owner = await ownerOfPet(env, col, id); } catch { fail(503, 'Could not check that pet with Monad just now. Try again.'); }
        if (owner !== who.address) errors.avatar = 'That pet is not yours.';
        else { next.col = col; next.id = id; }
      }
    }
  }
  if ('banner' in b) {
    if (!BANNERS.includes(b.banner)) errors.banner = 'Pick one of the banners.';
    else next.banner = b.banner;
  }
  let socials = null;
  if ('socials' in b) {
    if (!b.socials || typeof b.socials !== 'object') errors.socials = 'Bad socials.';
    else {
      socials = {};
      for (const pf of PLATFORMS) {
        if (!(pf in b.socials)) continue;
        const r = normalizeSocial(pf, b.socials[pf]);
        if (!r.ok) { errors[`social_${pf}`] = r.error; continue; }
        if (r.handle && await filtered(env, r.handle)) { errors[`social_${pf}`] = FILTER_MESSAGE; continue; }
        socials[pf] = r.handle;
      }
    }
  }
  if (Object.keys(errors).length) return json({ ok: false, errors }, 400);

  const stmts = [env.DB.prepare(`INSERT INTO profiles (address, name, name_key, name_changed_at, bio, avatar_col, avatar_id, banner, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET name = excluded.name, name_key = excluded.name_key, name_changed_at = excluded.name_changed_at, bio = excluded.bio, avatar_col = excluded.avatar_col, avatar_id = excluded.avatar_id, banner = excluded.banner, updated_at = excluded.updated_at`)
    .bind(who.address, next.name, next.key, next.changed, next.bio, next.col, next.id, next.banner, t)];
  if (socials) for (const [pf, h] of Object.entries(socials)) {
    stmts.push(h ? env.DB.prepare('INSERT INTO socials (address, platform, handle) VALUES (?, ?, ?) ON CONFLICT(address, platform) DO UPDATE SET handle = excluded.handle').bind(who.address, pf, h)
      : env.DB.prepare('DELETE FROM socials WHERE address = ? AND platform = ?').bind(who.address, pf));
  }
  try { await env.DB.batch(stmts); } catch (e) {
    // two people racing for one name: the unique index decides
    if (/UNIQUE/i.test(String(e))) return json({ ok: false, errors: { name: 'That name is taken.' } }, 409);
    throw e;
  }
  return getProfile(env, who, who.address);   // as its owner: with the pictures of theirs still waiting
}

/** GET /api/social/profile/:key/followers and /following, fifty at a time, newest first. */
export async function followList(env, key, which, url) {
  const address = await resolveKey(env, key);
  if (!address) fail(404, 'Nobody by that name lives in Emotown.');
  const before = Number(url.searchParams.get('before') ?? 0) || Number.MAX_SAFE_INTEGER;
  const [mine, other] = which === 'followers' ? ['followee', 'follower'] : ['follower', 'followee'];
  const { results } = await env.DB.prepare(`SELECT f.${other} AS address, f.created_at AS at, ${CARD_SQL()}
    FROM follows f ${CARD_JOIN(`f.${other}`)} WHERE f.${mine} = ? AND f.created_at < ? ORDER BY f.created_at DESC LIMIT 50`).bind(address, before).all();
  return json({ items: results.map((r) => ({ ...card(r), at: r.at })), next: results.length === 50 ? results[results.length - 1].at : null });
}

/** GET /api/social/cards?a=0x…,0x… : names and avatars for up to 100 addresses (the chat panel's senders, lists). */
export async function cards(env, url) {
  const list = [...new Set(String(url.searchParams.get('a') ?? '').toLowerCase().split(',').filter(isAddr))].slice(0, 100);
  if (!list.length) return json({ items: [] });
  const { results } = await env.DB.prepare(`SELECT a.address, ${CARD_SQL()} FROM (SELECT column1 AS address FROM (VALUES ${list.map(() => '(?)').join(',')})) a ${CARD_JOIN('a.address')}`).bind(...list).all();
  return json({ items: results.map((r) => card(r)) });
}

/** GET /api/social/search?q= : people by name prefix (the mention picker and the finder). */
export async function searchPeople(env, url) {
  const q = String(url.searchParams.get('q') ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,20}$/.test(q)) return json({ items: [] });
  const { results } = await env.DB.prepare(`SELECT p.address, ${CARD_SQL()} FROM profiles p LEFT JOIN gate g ON g.address = p.address AND g.ok = 1 WHERE p.name_key >= ? AND p.name_key < ? ORDER BY p.name_key LIMIT 8`).bind(q, q + '\uffff').all();
  return json({ items: results.map((r) => card(r)) });
}
