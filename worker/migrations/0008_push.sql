-- 2026-10-01: push notifications for the home-screen app (worker/push.js). A subscription is one browser (its push
-- endpoint and keys) watching one wallet's pets, with what it wants to hear about. Social kinds only reach a subscription
-- whose address came from a signed-in session (`verified`). Nothing here can send anything by itself: every push is a
-- pet's clock read off the chain, a social notification the Worker wrote, or a fight the keeper saw.
CREATE TABLE push_subs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  address     TEXT,                              -- lowercase; the wallet whose pets are watched (null: nothing watched)
  verified    INTEGER NOT NULL DEFAULT 0,        -- 1 when a signed-in session vouched for the address
  pets        TEXT NOT NULL DEFAULT '[]',        -- JSON [{col, id, name}] the wallet held at the last look
  pets_at     INTEGER NOT NULL DEFAULT 0,        -- when the pets were last looked up
  prefs       TEXT NOT NULL DEFAULT '{}',        -- JSON { kinds: {kind: bool}, petsOff: ["cat:12"], quiet: {from, to} | null, tz }
  ua          TEXT,
  failures    INTEGER NOT NULL DEFAULT 0,        -- pushes the service refused in a row; a dead endpoint is removed
  primed      INTEGER NOT NULL DEFAULT 0,        -- 1 once the first tick has noted what was already true (an empty bowl, a poop) without sending it
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX push_subs_address ON push_subs(address);

-- one push per (subscription, event): the key names the occurrence (a feed, a poop, a death), so the same thing is never
-- said twice and a new occurrence is said again
CREATE TABLE push_sent (
  sub_id      INTEGER NOT NULL,
  key         TEXT NOT NULL,
  sent_at     INTEGER NOT NULL,
  PRIMARY KEY (sub_id, key)
);

-- the last state seen of every watched pet, for the edges (a crown won or lost, a death): "col:id" -> flags
CREATE TABLE push_pet_state (
  pet         TEXT PRIMARY KEY,
  alive       INTEGER NOT NULL,
  crowned     INTEGER NOT NULL,
  checked_at  INTEGER NOT NULL
);

-- the fights already announced
CREATE TABLE push_fights (
  id          INTEGER PRIMARY KEY,               -- the fight id
  status      INTEGER NOT NULL,                  -- the last status announced
  seen_at     INTEGER NOT NULL
);
