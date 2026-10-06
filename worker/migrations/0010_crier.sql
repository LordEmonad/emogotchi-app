-- The town crier (2026-10-02): messages the Worker posts into the square about what just happened on chain (a fight
-- decided, a pet named, a revive, a paid item bought, the hour's mints). `sys` is the event as JSON (its kind, the pets,
-- the amount) for the page to draw it as an event line; `sys_key` names the event so it is never posted twice however
-- many times the index sees the log (a unique index, partial so ordinary messages are not in it).
ALTER TABLE messages ADD COLUMN sys TEXT;
ALTER TABLE messages ADD COLUMN sys_key TEXT;
CREATE UNIQUE INDEX messages_sys_key ON messages (sys_key) WHERE sys_key IS NOT NULL;
