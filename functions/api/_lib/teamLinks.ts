import type { Env } from './env'

// The member's display name: a walk-in's typed name, else its signup's name.
const MEMBER_NAME = `LOWER(TRIM(COALESCE(
  event_team_members.display_name,
  (SELECT s.name FROM event_signups s WHERE s.id = event_team_members.signup_id)
)))`

const IN_EVENT = `team_id IN (SELECT id FROM event_teams WHERE event_id = ?1)`

// Links every still-unlinked team member of one event to an account, using
// the same two passes as migration 0031's backfill:
//   1. signup email == account email, unless that account is already linked
//      to another member of the event
//   2. name == exactly one account's name (case-insensitive), unless that
//      account is already linked to another member of the event or two
//      members of the event share the name
// Members that already have a user_id (set by an admin) are left alone.
// Returns statements for the caller to run, so a teams save can link inside
// its own atomic batch.
export function autoLinkStatements(env: Env, eventId: number): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      `UPDATE event_team_members
       SET user_id = (
         SELECT u.id FROM event_signups s
         JOIN users u ON LOWER(u.email) = LOWER(s.email)
         WHERE s.id = event_team_members.signup_id
       )
       WHERE user_id IS NULL AND signup_id IS NOT NULL AND ${IN_EVENT}
         AND NOT EXISTS (
           SELECT 1 FROM event_team_members o
           JOIN event_teams ot ON ot.id = o.team_id
           JOIN event_signups s ON s.id = event_team_members.signup_id
           JOIN users u ON u.id = o.user_id
           WHERE ot.event_id = ?1 AND LOWER(u.email) = LOWER(s.email)
         )`
    ).bind(eventId),
    env.DB.prepare(
      `UPDATE event_team_members
       SET user_id = (SELECT u.id FROM users u WHERE LOWER(TRIM(u.name)) = ${MEMBER_NAME})
       WHERE user_id IS NULL AND ${IN_EVENT}
         AND (SELECT COUNT(*) FROM users u WHERE LOWER(TRIM(u.name)) = ${MEMBER_NAME}) = 1
         AND NOT EXISTS (
           SELECT 1 FROM event_team_members o
           JOIN event_teams ot ON ot.id = o.team_id
           JOIN users u ON u.id = o.user_id
           WHERE ot.event_id = ?1
             AND o.id <> event_team_members.id
             AND LOWER(TRIM(u.name)) = ${MEMBER_NAME}
         )
         AND (
           SELECT COUNT(*) FROM event_team_members o
           JOIN event_teams ot ON ot.id = o.team_id
           LEFT JOIN event_signups os ON os.id = o.signup_id
           WHERE ot.event_id = ?1 AND LOWER(TRIM(COALESCE(o.display_name, os.name))) = ${MEMBER_NAME}
         ) = 1`
    ).bind(eventId),
  ]
}
