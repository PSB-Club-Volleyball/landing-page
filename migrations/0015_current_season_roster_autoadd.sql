-- Current season, set once by the owner, drives auto-adding approved club
-- members/admins to the public roster (see functions/api/admin/_lib/roster.ts)
-- instead of an admin re-entering them by hand every season.
ALTER TABLE login_settings ADD COLUMN current_season TEXT;

-- Links an auto-created roster row back to the account it came from, so a
-- later save on that account's role (or a repeat approval) doesn't insert a
-- second row for the same person in the same season. NULL for every roster
-- row added by hand, before this feature and still going forward (e.g. an
-- alumni entry with no account).
ALTER TABLE roster ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE UNIQUE INDEX idx_roster_user_season ON roster(user_id, season) WHERE user_id IS NOT NULL;
