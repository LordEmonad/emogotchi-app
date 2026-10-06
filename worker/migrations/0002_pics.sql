-- Emotown: pictures people upload (a profile picture and a banner), 2026-09-27. The pictures' bytes live in their
-- own database (emotown-media, migrations-media/), so pictures can never fill this one. Every time is ms since epoch,
-- every address lowercase.

-- One row per upload, whatever became of it. status: 'live' (in use), 'held' (waiting for an admin), 'refused' (an
-- admin said no, or took it down), 'removed' (its owner took it off), 'replaced' (a newer one of the same kind took
-- over). screen: what the automatic check said ('safe', 'unsafe', 'error', or NULL when it did not run).
CREATE TABLE uploads (
  id          TEXT PRIMARY KEY,
  address     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('avatar', 'banner')),
  status      TEXT NOT NULL CHECK (status IN ('live', 'held', 'refused', 'removed', 'replaced')),
  screen      TEXT,
  size        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  decided_by  TEXT
);
CREATE INDEX uploads_address ON uploads (address, created_at);
CREATE INDEX uploads_status ON uploads (status, created_at);

-- The picture in use, if any: NULL means their pet's head (pic) or the chosen Emotown banner (banner).
ALTER TABLE profiles ADD COLUMN pic TEXT;
ALTER TABLE profiles ADD COLUMN banner_pic TEXT;

-- Switches an admin flips at runtime. 'pics': 'screen' (checked automatically, live at once when clean), 'review'
-- (every picture waits for an admin), 'off' (no uploads, and no uploaded picture is served).
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
