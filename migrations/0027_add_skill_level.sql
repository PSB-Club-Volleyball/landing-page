-- Admin-verified, same as position/team — set from the admin Users panel,
-- not self-reported. NULL = not yet assessed.
ALTER TABLE users ADD COLUMN skill_level TEXT; -- 'beginner' | 'intermediate' | 'advanced' | 'competitive'
