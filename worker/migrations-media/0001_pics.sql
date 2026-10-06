-- emotown-media: the bytes of the pictures people upload, and nothing else (2026-09-27). Kept apart from
-- emotown-social so pictures can never fill the database that holds the town's messages. Each row is a WebP that
-- Cloudflare's image service made (never the uploader's own file), base64 in `data`. `live` = 1 when anyone may see
-- it; a held picture is 0 and is only ever shown to its owner and the admins. Pictures that are refused, removed or
-- replaced are deleted, not kept.
CREATE TABLE pics (
  id          TEXT PRIMARY KEY,
  address     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  data        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  live        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX pics_address ON pics (address);
