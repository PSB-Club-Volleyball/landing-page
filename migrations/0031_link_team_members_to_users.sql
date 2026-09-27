-- Links each team member to the account they played as, so tournament
-- results follow the person rather than the signup's email. Before this,
-- results were matched only through event_signups.email, which missed
-- walk-ins and teammates listed by name on a captain's signup (e.g. the
-- COED tournament) and anyone who signed up under a different email than
-- the one they log in with.
--
-- NULL = not linked. Pages Functions keep this in sync on every teams save
-- (functions/api/_lib/teamLinks.ts runs the same two passes as below), and
-- admins can set or change a link per member from the Teams tab.
ALTER TABLE event_team_members ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_event_team_members_user_id ON event_team_members(user_id);

-- Backfill pass 1: a signup member whose signup email is an account's email.
UPDATE event_team_members
SET user_id = (
  SELECT u.id FROM event_signups s
  JOIN users u ON LOWER(u.email) = LOWER(s.email)
  WHERE s.id = event_team_members.signup_id
)
WHERE user_id IS NULL AND signup_id IS NOT NULL;

-- Backfill pass 2: anyone still unlinked (walk-ins, or a signup under an
-- email with no account) whose name matches exactly one account's name,
-- case-insensitively. Ambiguous names are left for an admin to link by hand,
-- and so are two members of one event sharing a name, or an account already
-- linked to another member of the same event, so nobody's results count
-- twice.
UPDATE event_team_members
SET user_id = (
  SELECT u.id FROM users u
  WHERE LOWER(TRIM(u.name)) = LOWER(TRIM(COALESCE(
    event_team_members.display_name,
    (SELECT s.name FROM event_signups s WHERE s.id = event_team_members.signup_id)
  )))
)
WHERE user_id IS NULL
  AND (
    SELECT COUNT(*) FROM users u
    WHERE LOWER(TRIM(u.name)) = LOWER(TRIM(COALESCE(
      event_team_members.display_name,
      (SELECT s.name FROM event_signups s WHERE s.id = event_team_members.signup_id)
    )))
  ) = 1
  AND NOT EXISTS (
    SELECT 1 FROM event_team_members o
    JOIN event_teams ot ON ot.id = o.team_id
    JOIN event_teams mt ON mt.id = event_team_members.team_id
    JOIN users u ON u.id = o.user_id
    WHERE ot.event_id = mt.event_id
      AND o.id <> event_team_members.id
      AND LOWER(TRIM(u.name)) = LOWER(TRIM(COALESCE(
        event_team_members.display_name,
        (SELECT s.name FROM event_signups s WHERE s.id = event_team_members.signup_id)
      )))
  )
  AND (
    SELECT COUNT(*) FROM event_team_members o
    JOIN event_teams ot ON ot.id = o.team_id
    JOIN event_teams mt ON mt.id = event_team_members.team_id
    LEFT JOIN event_signups os ON os.id = o.signup_id
    WHERE ot.event_id = mt.event_id
      AND LOWER(TRIM(COALESCE(o.display_name, os.name))) = LOWER(TRIM(COALESCE(
        event_team_members.display_name,
        (SELECT s.name FROM event_signups s WHERE s.id = event_team_members.signup_id)
      )))
  ) = 1;
