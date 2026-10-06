-- 2026-09-28: roles, tags the admins make and hand out (operator: "they'll mean nothing tbh but it'll put a tag on people
-- and give them the role and i can pick emojis that go by their names"). A role is a name, one emoji and a colour; the
-- emoji shows by its holders' names, the tag on their profile and card. No powers. What every page reads is a ready-made
-- copy of both tables in `settings` ('roles', one row), rewritten after every change (worker/social/roles.js).
CREATE TABLE roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL UNIQUE,
  emoji       TEXT NOT NULL,
  color       TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE TABLE role_members (
  role_id     INTEGER NOT NULL,
  address     TEXT NOT NULL,
  added_by    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (role_id, address)
);
CREATE INDEX role_members_address ON role_members (address);
