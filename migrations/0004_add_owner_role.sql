-- Single-holder "owner" role: immune to being managed by other users, exclusive
-- rights over user approval, content deletion, and audit-log visibility. The
-- partial unique index makes "at most one owner" a DB-enforced invariant.
-- No hand-seeded owner here — see functions/api/auth/[provider]/callback.ts,
-- which self-assigns the first owner on the next ADMIN_BOOTSTRAP_EMAILS login.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
CREATE UNIQUE INDEX idx_users_single_owner ON users(role) WHERE role = 'owner';
