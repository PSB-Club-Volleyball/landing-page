-- The account-approval gate is gone. Every signup is auto-approved (an
-- outsider has no admin permissions, and bootstrap emails land as admin/
-- owner); access is revoked by demoting to outsider or deleting the account.
-- That makes users.status a dead column, along with its decision trail.
-- requested_at becomes created_at now that there's no approval request to
-- time — it's just when the account was made.
DROP INDEX idx_users_status;
ALTER TABLE users DROP COLUMN decided_by;
ALTER TABLE users DROP COLUMN decided_at;
ALTER TABLE users DROP COLUMN status;
ALTER TABLE users RENAME COLUMN requested_at TO created_at;
