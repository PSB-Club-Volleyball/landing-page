import type { Env } from '../../../_lib/env'
import { badRequest, json, notFound } from '../../../_lib/http'
import type { AdminData } from '../../_lib/types'
import { logAudit } from '../../_lib/audit'
import { ensureRosterEntry } from '../../_lib/roster'

// Merging moves one account ("from") into another (":id", the one kept) for
// a person who ended up with two, e.g. a PSU sign-in and a Gmail sign-in.
//
// GET  /api/admin/users/:id/merge?from_id=N  -> what would move (preview)
// POST /api/admin/users/:id/merge  Body: { from_id }  -> merges, deletes "from"
//
// Rules match deleting an account, since "from" stops existing: nobody can
// merge the owner away or their own account, and only the owner can merge an
// admin away. Merging into an admin's or the owner's account hands "from"'s
// sign-ins those rights, so that's owner-only too (like granting admin).
//
// The kept account keeps its own name, position, team, avatar and primary
// email, filling any blank from "from"; the later waiver and dues year wins;
// the higher role wins; RSVP restriction sticks if either had it; an
// admin-locked skill level wins over a self-set one (level, lock and any
// pending request travel together). Everything pointing at "from" moves over:
// its emails (so its signups, which key off email, follow), logins and
// sessions (so either sign-in lands on the kept account), team spots, kudos,
// roster rows, and every *_by reference. Where both accounts had something
// that must be one-per-person, the kept account's stays and "from"'s goes:
// a roster row in the same season (else the person is listed twice), a team
// spot in the same event (one account per event, as teamLinks.ts keeps it)
// is unlinked, and kudos between the two (they'd be self-kudos) or that
// duplicate one the kept account already has are dropped.

interface Account {
  id: number
  name: string | null
  email: string
  role: string
}

async function loadPair(
  env: Env,
  intoId: number,
  fromId: unknown,
  actor: AdminData['user']
): Promise<{ into: Account; from: Account } | Response> {
  if (!Number.isInteger(intoId)) return badRequest('Invalid id')
  if (typeof fromId !== 'number' || !Number.isInteger(fromId)) return badRequest('from_id must be an account id')
  if (fromId === intoId) return badRequest("An account can't be merged into itself")

  const rows = await env.DB.prepare(`SELECT id, name, email, role FROM users WHERE id IN (?1, ?2)`)
    .bind(intoId, fromId)
    .all<Account>()
  const into = rows.results.find((u) => u.id === intoId)
  const from = rows.results.find((u) => u.id === fromId)
  if (!into) return notFound('Account to keep not found')
  if (!from) return notFound('Account to merge not found')

  if (from.role === 'owner') return badRequest("The owner can't be merged away — merge the other account into the owner")
  if (from.id === actor.id) return badRequest("You can't merge away your own account — merge the other one into yours")
  if (from.role === 'admin' && actor.role !== 'owner') return badRequest('Only the owner can merge an admin away')
  if ((into.role === 'owner' || into.role === 'admin') && actor.role !== 'owner') {
    return badRequest("Only the owner can merge into an admin's account")
  }
  return { into, from }
}

export const onRequestGet: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const raw = new URL(request.url).searchParams.get('from_id')
  const pair = await loadPair(env, Number(params.id), raw === null ? null : Number(raw), data.user)
  if (pair instanceof Response) return pair
  const { into, from } = pair

  const [emails, logins, teamSpots, kudos, roster, signups] = await env.DB.batch([
    env.DB.prepare(`SELECT email FROM user_emails WHERE user_id = ?1 ORDER BY created_at ASC`).bind(from.id),
    env.DB.prepare(`SELECT provider FROM user_logins WHERE user_id = ?1`).bind(from.id),
    // Counts of what actually moves — rows the POST drops or unlinks as
    // duplicates of the kept account's are left out.
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM event_team_members m JOIN event_teams t ON t.id = m.team_id
       WHERE m.user_id = ?2 AND t.event_id NOT IN (${KEPT_EVENTS})`
    ).bind(into.id, from.id),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM stripes s
       WHERE (s.giver_id = ?2 OR s.receiver_id = ?2) AND COALESCE(s.giver_id, 0) <> ?1 AND s.receiver_id <> ?1
         AND NOT EXISTS (
           SELECT 1 FROM stripes k
           WHERE k.event_id = s.event_id AND k.skill = s.skill
             AND k.giver_id IS (CASE WHEN s.giver_id = ?2 THEN ?1 ELSE s.giver_id END)
             AND k.receiver_id = (CASE WHEN s.receiver_id = ?2 THEN ?1 ELSE s.receiver_id END))`
    ).bind(into.id, from.id),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM roster WHERE user_id = ?2
         AND season NOT IN (SELECT season FROM roster WHERE user_id = ?1)`
    ).bind(into.id, from.id),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM event_signups
       WHERE LOWER(email) IN (SELECT email FROM user_emails WHERE user_id = ?1)`
    ).bind(from.id),
  ])
  const count = (r: { results: unknown[] }) => (r.results[0] as { n: number }).n

  return json({
    into,
    from,
    moves: {
      emails: (emails.results as { email: string }[]).map((r) => r.email),
      logins: (logins.results as { provider: string }[]).map((r) => r.provider),
      team_spots: count(teamSpots),
      kudos: count(kudos),
      roster_rows: count(roster),
      signups: count(signups),
    },
  })
}

// Events the kept account (?1) already has a team spot in.
const KEPT_EVENTS = `SELECT t2.event_id FROM event_team_members m2 JOIN event_teams t2 ON t2.id = m2.team_id WHERE m2.user_id = ?1`

const RANK_SQL = (col: string) =>
  `(CASE ${col} WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'club_member' THEN 1 ELSE 0 END)`

export const onRequestPost: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const body = await request.json<{ from_id?: unknown }>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')
  const pair = await loadPair(env, Number(params.id), body.from_id, data.user)
  if (pair instanceof Response) return pair
  const { into, from } = pair
  // ?1 = the kept account, ?2 = the merged one; `gone` binds only ?1 = from.
  const bind = (sql: string) => env.DB.prepare(sql).bind(into.id, from.id)
  const gone = (sql: string) => env.DB.prepare(sql).bind(from.id)
  // "from"'s skill settings win only when they're admin-locked and the kept
  // account's aren't, or the kept account has no level at all.
  const fromSkill = `((f.skill_level_locked = 1 AND users.skill_level_locked = 0)
                      OR (users.skill_level IS NULL AND users.skill_level_locked = 0))`
  const later = (col: string) =>
    `CASE WHEN COALESCE(f.${col}_year, 0) > COALESCE(users.${col}_year, 0)`

  // One transaction: the field merge reads "from" before anything moves off
  // it, and "from" is deleted last, after nothing references it.
  const results = await env.DB.batch([
    bind(
      `UPDATE users SET
         name = COALESCE(users.name, f.name),
         avatar_url = COALESCE(users.avatar_url, f.avatar_url),
         position = COALESCE(users.position, f.position),
         team = COALESCE(users.team, f.team),
         skill_level = CASE WHEN ${fromSkill} THEN f.skill_level ELSE users.skill_level END,
         skill_level_locked = CASE WHEN ${fromSkill} THEN f.skill_level_locked ELSE users.skill_level_locked END,
         skill_level_change_requested = CASE WHEN ${fromSkill} THEN f.skill_level_change_requested
                                             ELSE users.skill_level_change_requested END,
         skill_level_change_requested_at = CASE WHEN ${fromSkill} THEN f.skill_level_change_requested_at
                                                ELSE users.skill_level_change_requested_at END,
         rsvp_restricted = MAX(users.rsvp_restricted, f.rsvp_restricted),
         role = CASE WHEN ${RANK_SQL('f.role')} > ${RANK_SQL('users.role')} THEN f.role ELSE users.role END,
         waiver_signed_year = ${later('waiver_signed')} THEN f.waiver_signed_year ELSE users.waiver_signed_year END,
         waiver_signed_by = ${later('waiver_signed')} THEN f.waiver_signed_by ELSE users.waiver_signed_by END,
         waiver_signed_at = ${later('waiver_signed')} THEN f.waiver_signed_at ELSE users.waiver_signed_at END,
         dues_paid_year = ${later('dues_paid')} THEN f.dues_paid_year ELSE users.dues_paid_year END,
         dues_paid_by = ${later('dues_paid')} THEN f.dues_paid_by ELSE users.dues_paid_by END,
         dues_paid_at = ${later('dues_paid')} THEN f.dues_paid_at ELSE users.dues_paid_at END
       FROM (SELECT * FROM users WHERE id = ?2) AS f
       WHERE users.id = ?1`
    ),
    bind(`UPDATE user_emails SET user_id = ?1 WHERE user_id = ?2`),
    bind(`UPDATE user_logins SET user_id = ?1 WHERE user_id = ?2`),
    bind(`UPDATE sessions SET user_id = ?1 WHERE user_id = ?2`),
    bind(
      `UPDATE event_team_members SET user_id = ?1
       WHERE user_id = ?2 AND team_id NOT IN (SELECT id FROM event_teams WHERE event_id IN (${KEPT_EVENTS}))`
    ),
    gone(`UPDATE event_team_members SET user_id = NULL WHERE user_id = ?1`),
    // One roster row per person per season: where both had one, "from"'s is
    // a duplicate listing of the same person and goes.
    bind(`UPDATE OR IGNORE roster SET user_id = ?1 WHERE user_id = ?2`),
    gone(`DELETE FROM roster WHERE user_id = ?1`),
    bind(`DELETE FROM stripes WHERE (giver_id = ?1 AND receiver_id = ?2) OR (giver_id = ?2 AND receiver_id = ?1)`),
    bind(`UPDATE OR IGNORE stripes SET giver_id = ?1 WHERE giver_id = ?2`),
    bind(`UPDATE OR IGNORE stripes SET receiver_id = ?1 WHERE receiver_id = ?2`),
    gone(`DELETE FROM stripes WHERE giver_id = ?1 OR receiver_id = ?1`),
    bind(`UPDATE users SET waiver_signed_by = ?1 WHERE waiver_signed_by = ?2`),
    bind(`UPDATE users SET dues_paid_by = ?1 WHERE dues_paid_by = ?2`),
    bind(`UPDATE media SET uploaded_by = ?1 WHERE uploaded_by = ?2`),
    bind(`UPDATE event_signups SET decided_by = ?1 WHERE decided_by = ?2`),
    bind(`UPDATE audit_log SET user_id = ?1 WHERE user_id = ?2`),
    gone(`DELETE FROM users WHERE id = ?1`),
    // A pre-made account that absorbed a signed-in one is signed into now:
    // record a real provider (after the delete, since "from" held the same
    // provider/provider_sub pair and users has a unique index on it).
    env.DB.prepare(
      `UPDATE users SET
         provider = (SELECT provider FROM user_logins WHERE user_id = ?1 ORDER BY created_at, provider_sub LIMIT 1),
         provider_sub = (SELECT provider_sub FROM user_logins WHERE user_id = ?1 ORDER BY created_at, provider_sub LIMIT 1)
       WHERE id = ?1 AND provider = 'none' AND EXISTS (SELECT 1 FROM user_logins WHERE user_id = ?1)`
    ).bind(into.id),
  ])
  const deleted = results[results.length - 2].meta.changes
  if (deleted !== 1) {
    throw new Error(`Merge of user ${from.id} into ${into.id} deleted ${deleted} rows`)
  }

  // A merge can raise the kept account's role (e.g. an outsider absorbing a
  // club member), which puts it on the current season's roster like a promotion.
  const kept = await env.DB.prepare(`SELECT role FROM users WHERE id = ?1`).bind(into.id).first<{ role: string }>()
  if (!kept) throw new Error(`Kept account ${into.id} vanished during merge`)
  if (kept.role === 'club_member' || kept.role === 'admin') await ensureRosterEntry(env, into.id)

  await logAudit(env, data.user.id, 'update', 'users', into.id, {
    merged_from: from.id,
    from_email: from.email,
    from_name: from.name,
  })
  return json({ ok: true })
}
