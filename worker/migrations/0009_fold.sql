-- 2026-10-01: the index behind /api/stats, /api/cats and /api/starvation (worker/indexer.js). Every pet contract's and
-- the shop's logs are folded into a saved state a little at a time, so a refresh reads only the blocks since the last
-- one instead of the whole history. One row per thing kept: `v<n>:meta` (how far each contract has been read),
-- `v<n>:state:<pet|shop>` (its folded state), `v<n>:owners:<pet>:<chunk>` (who owns which pet, 10,000 ids a row),
-- `v<n>:extras` (starters, referral scores) and `lease` (one run at a time; `at` is when it was taken).
-- Everything here is derived from the chain and can be rebuilt from nothing: deleting every row only costs a rebuild.
CREATE TABLE fold (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  at     INTEGER NOT NULL DEFAULT 0              -- ms: when the row was written
);
