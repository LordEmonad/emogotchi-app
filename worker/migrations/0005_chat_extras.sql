-- 2026-09-28: GIFs, replies and likes in the town square and in DMs (operator: "gifs and emojis would be huge for
-- global chat and dms ... react to messages and reply to specific messages"; reactions are one heart, "like on x").
-- Emoji need nothing here: they are plain text.

-- A GIF is JSON { id, url, still, w, h }, every URL on KLIPY's CDN (rules.js cleanGif). reply_to is the message it
-- answers (same room / same conversation). likes is the count; who liked what is message_likes.
ALTER TABLE messages ADD COLUMN gif TEXT;
ALTER TABLE messages ADD COLUMN reply_to INTEGER;
ALTER TABLE messages ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE message_likes (
  message_id INTEGER NOT NULL,
  address    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, address)
);
CREATE INDEX message_likes_by ON message_likes (address, message_id);

ALTER TABLE dms ADD COLUMN gif TEXT;
ALTER TABLE dms ADD COLUMN reply_to INTEGER;
CREATE TABLE dm_likes (
  dm_id      INTEGER NOT NULL,
  address    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (dm_id, address)
);

-- KLIPY search results, shared by the whole site: a search term costs one call to KLIPY a day, however many people
-- make it (the free key allows 100 calls an hour). Swept after two days.
CREATE TABLE gif_cache (
  key  TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  at   INTEGER NOT NULL
);
