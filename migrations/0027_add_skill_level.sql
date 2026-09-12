-- Self-editable by the account owner (see 0028_add_skill_level_locked.sql
-- for the admin lock). NULL = not yet set.
ALTER TABLE users ADD COLUMN skill_level TEXT; -- 'beginner' | 'intermediate' | 'advanced' | 'competitive'
