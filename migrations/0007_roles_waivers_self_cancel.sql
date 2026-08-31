-- Roles become a hierarchy instead of a binary member/owner: outsider <
-- club_member < admin < owner. Each tier includes the permissions of the
-- ones below it, so "admin/owner are necessarily club members" falls out
-- of the ordering rather than needing a separate flag. Existing 'member'
-- rows become 'club_member' (they were already approved account holders,
-- not anonymous outsiders).
UPDATE users SET role = 'club_member' WHERE role = 'member';

-- Club-member profile info, distinct from the admin-curated public season
-- roster table (roster.position is free text per season; this is the
-- account's current position/team).
ALTER TABLE users ADD COLUMN position TEXT;
ALTER TABLE users ADD COLUMN team TEXT; -- 'A' | 'B' | NULL

-- Self-serve un-RSVP: a private per-signup token shown once at submit time
-- (this app sends no outbound email, so there's nothing to email it to),
-- plus a logged-in account whose email matches the signup can cancel
-- without a token. waiver_accepted is required per submission, not stored
-- once per person, matching the "confirm every time" decision.
ALTER TABLE event_signups ADD COLUMN cancel_token TEXT;
ALTER TABLE event_signups ADD COLUMN waiver_accepted INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_event_signups_cancel_token ON event_signups(cancel_token);
