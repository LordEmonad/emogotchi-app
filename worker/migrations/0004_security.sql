-- 2026-09-27, the security review. Both tables are new; nothing existing changes.

-- A named pet whose holder was banned opens the gate for nobody until the ban ends: otherwise a banned account could
-- hand the same pet to a fresh wallet and be talking again in seconds.
CREATE TABLE banned_pets (
  pet_col    TEXT NOT NULL,
  pet_id     INTEGER NOT NULL,
  until      INTEGER NOT NULL,
  address    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (pet_col, pet_id)
);

-- Every picture upload attempt, counted BEFORE the work starts (the daily cap used to be read before the picture was
-- remade and written after, so a burst of uploads all passed it; and failed attempts were never counted at all).
CREATE TABLE pic_tries (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  grp     TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX pic_tries_by ON pic_tries (address, grp, at);
