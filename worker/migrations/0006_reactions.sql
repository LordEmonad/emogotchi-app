-- 2026-09-28: reactions, like X: any emoji, one per person per message (choosing another replaces it, the same one again
-- takes it back), in the town square and in DMs (operator: "reacting to messages should let users choose the emoji to
-- react to from presets or even choose their own. similar to how you can on x"). They replace the single heart; every
-- heart given so far becomes a red heart reaction (char(10084, 65039) is that emoji, written by code point so this file
-- holds no invisible characters).
CREATE TABLE message_reactions (
  message_id INTEGER NOT NULL,
  address    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, address)
);
CREATE INDEX message_reactions_by ON message_reactions (address, message_id);
INSERT INTO message_reactions (message_id, address, emoji, created_at) SELECT message_id, address, char(10084, 65039), created_at FROM message_likes;
-- the counts travel with the message: JSON [[emoji, count], ...], most given first
ALTER TABLE messages ADD COLUMN reactions TEXT;
UPDATE messages SET reactions = json_array(json_array(char(10084, 65039), likes)) WHERE likes > 0;

CREATE TABLE dm_reactions (
  dm_id      INTEGER NOT NULL,
  address    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (dm_id, address)
);
INSERT INTO dm_reactions (dm_id, address, emoji, created_at) SELECT dm_id, address, char(10084, 65039), created_at FROM dm_likes;
