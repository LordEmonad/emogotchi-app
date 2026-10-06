-- Emotown's social layer (2026-09-26): profiles, follows, blocks, the town square's chat, DMs, notifications,
-- reports and moderation. Every address is stored lowercased. Every time is unix MILLISECONDS.
--
-- Apply locally:   npx wrangler d1 migrations apply emotown-social --local
-- Apply for real:  npx wrangler d1 migrations apply emotown-social --remote   (ask the operator first)

-- Everyone who has ever signed in. `n` is their resident number (the "early resident" badge reads it).
CREATE TABLE users (
  n INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL UNIQUE,
  joined_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

-- What a person says about themselves. `name_key` is the display name lowercased: names are unique regardless of
-- case, and a name is also the vanity URL /u/<name>. Every field is plain text; nothing here is ever rendered as HTML.
CREATE TABLE profiles (
  address TEXT PRIMARY KEY,
  name TEXT,
  name_key TEXT UNIQUE,
  name_changed_at INTEGER,
  bio TEXT NOT NULL DEFAULT '',
  avatar_col TEXT,
  avatar_id INTEGER,
  banner TEXT NOT NULL DEFAULT 'hall',
  updated_at INTEGER NOT NULL
);

-- Links to other places, as handles on known platforms (rendered only as those platforms' own links, marked unverified).
CREATE TABLE socials (
  address TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  PRIMARY KEY (address, platform)
);

-- You follow an owner, never a pet.
CREATE TABLE follows (
  follower TEXT NOT NULL,
  followee TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower, followee)
);
CREATE INDEX follows_followee ON follows (followee, created_at);
CREATE INDEX follows_follower_time ON follows (follower, created_at);

CREATE TABLE blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
CREATE INDEX blocks_blocked ON blocks (blocked);

-- The town square (and, one day, other rooms: a room per stretch of street). `pet_*` is the pet the speech bubble
-- goes over; `mentions` is JSON [{"n": name, "a": address}] resolved when the message was posted.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  pet_col TEXT,
  pet_id INTEGER,
  mentions TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by TEXT
);
CREATE INDEX messages_room ON messages (room, id);
CREATE INDEX messages_sender ON messages (sender, id);

-- One row per pair of people who have talked. `a` < `b`; the id is "a:b". `*_read` is the last message id each side
-- has seen (the unread count is the other side's messages after it).
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  started_by TEXT NOT NULL,
  last_id INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL DEFAULT 0,
  a_read INTEGER NOT NULL DEFAULT 0,
  b_read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX conversations_a ON conversations (a, last_at);
CREATE INDEX conversations_b ON conversations (b, last_at);

CREATE TABLE dms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX dms_conv ON dms (conv, id);
CREATE INDEX dms_sender_time ON dms (sender, created_at);

-- New follower, new DM, mention. A run of DMs from one person while unread is one row with a count.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  ref TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX notifications_address ON notifications (address, id);
CREATE INDEX notifications_unread ON notifications (address, read_at);

-- What someone reported, with a copy of it as it was (so deleting it does not destroy the evidence).
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  snapshot TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution TEXT
);
CREATE INDEX reports_open ON reports (resolved_at, id);
CREATE INDEX reports_reporter_time ON reports (reporter, created_at);

-- Muted: may read, may not post or DM, until `until`. Banned: may not sign in at all until `until`.
-- A lifted mute or ban has its `until` set to the moment it was lifted, so the history stays.
CREATE TABLE mutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  until INTEGER NOT NULL,
  reason TEXT,
  by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX mutes_address ON mutes (address, until);
CREATE TABLE bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  until INTEGER NOT NULL,
  reason TEXT,
  by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX bans_address ON bans (address, until);

-- A signed-in browser. Only the SHA-256 of the cookie's token is stored: a copy of this table signs nobody in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_address ON sessions (address);
CREATE INDEX sessions_expires ON sessions (expires_at);

-- A Sign-In with Ethereum message the Worker wrote and is waiting to see signed. Used once, then deleted.
CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX nonces_created ON nonces (created_at);

-- The named-pet gate, as last read off the chain: does this address hold a named pet, and which one.
CREATE TABLE gate (
  address TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  pet_col TEXT,
  pet_id INTEGER,
  pet_name TEXT,
  checked_at INTEGER NOT NULL
);

-- Words the operator added to the filter (on top of the built-in list).
CREATE TABLE filter_words (
  word TEXT PRIMARY KEY,
  added_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Everything an admin did, and to whom.
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_log_time ON admin_log (created_at);
