-- Skill level is now self-editable by the account owner (see /api/profile
-- PATCH). This flag lets an admin take that away for a specific user and
-- go back to setting it themselves from the admin Users panel.
ALTER TABLE users ADD COLUMN skill_level_locked INTEGER NOT NULL DEFAULT 0;
