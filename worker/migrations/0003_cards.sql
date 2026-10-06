-- Emotown: a link card per person (2026-09-27): the 1200x630 picture shown when their /u/ link is shared, drawn by the
-- site from their banner, picture, name and pets and uploaded like any picture (worker/social/pics.js).
ALTER TABLE profiles ADD COLUMN card_pic TEXT;

-- uploads.kind now also allows 'card'. SQLite cannot change a CHECK in place, so the table is rebuilt as it was plus
-- the new kind (dropping the old table drops its indexes; they are made again under the same names).
CREATE TABLE uploads_next (
  id          TEXT PRIMARY KEY,
  address     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('avatar', 'banner', 'card')),
  status      TEXT NOT NULL CHECK (status IN ('live', 'held', 'refused', 'removed', 'replaced')),
  screen      TEXT,
  size        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  decided_by  TEXT
);
INSERT INTO uploads_next (id, address, kind, status, screen, size, created_at, decided_at, decided_by)
  SELECT id, address, kind, status, screen, size, created_at, decided_at, decided_by FROM uploads;
DROP TABLE uploads;
ALTER TABLE uploads_next RENAME TO uploads;
CREATE INDEX uploads_address ON uploads (address, created_at);
CREATE INDEX uploads_status ON uploads (status, created_at);
