-- Users may self-set their skill level once for free (see /api/profile
-- PATCH), but once skill_level is non-null, further self-service changes
-- become a request an admin must approve (by setting skill_level directly
-- from the admin Users panel) or dismiss (clearing these columns without
-- changing skill_level).
ALTER TABLE users ADD COLUMN skill_level_change_requested TEXT;
ALTER TABLE users ADD COLUMN skill_level_change_requested_at TEXT;
