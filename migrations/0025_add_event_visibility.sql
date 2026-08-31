-- Event visibility: controls who can see an event on the public site,
-- independent of its status (draft/published/cancelled).
--   public -> everyone, including logged-out visitors (today's behavior)
--   club   -> club_member, admin, owner
--   eboard -> admin, owner only (e-board meetings etc.)
-- See functions/api/_lib/roles.ts for the role hierarchy this is checked against.

ALTER TABLE events ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
