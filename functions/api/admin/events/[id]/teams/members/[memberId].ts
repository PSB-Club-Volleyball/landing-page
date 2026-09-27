import type { Env } from '../../../../../_lib/env'
import { badRequest, json, notFound } from '../../../../../_lib/http'
import type { AdminData } from '../../../../_lib/types'
import { logAudit } from '../../../../_lib/audit'

// PATCH /api/admin/events/:id/teams/members/:memberId { user_id } -> link a
// team member to an account (or unlink with null) in place. Separate from
// the teams PUT on purpose: that one re-creates teams and wipes the
// schedule, which would erase a finished tournament's scores.
export const onRequestPatch: PagesFunction<Env, 'id' | 'memberId', AdminData> = async ({
  request,
  env,
  params,
  data,
}) => {
  const eventId = Number(params.id)
  const memberId = Number(params.memberId)
  if (!Number.isInteger(eventId) || !Number.isInteger(memberId)) return badRequest('Invalid id')

  const body = (await request.json().catch(() => null)) as { user_id?: unknown } | null
  if (!body || !('user_id' in body)) return badRequest('user_id is required')
  const userId = body.user_id
  if (userId !== null && !Number.isInteger(userId)) return badRequest('user_id must be an account id or null')

  const member = await env.DB.prepare(
    `SELECT m.id FROM event_team_members m
     JOIN event_teams t ON t.id = m.team_id
     WHERE m.id = ?1 AND t.event_id = ?2`
  )
    .bind(memberId, eventId)
    .first()
  if (!member) return notFound('Team member not found')

  if (userId !== null) {
    const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?1`).bind(userId).first()
    if (!user) return notFound('Account not found')
    const taken = await env.DB.prepare(
      `SELECT 1 FROM event_team_members m
       JOIN event_teams t ON t.id = m.team_id
       WHERE t.event_id = ?1 AND m.user_id = ?2 AND m.id <> ?3`
    )
      .bind(eventId, userId, memberId)
      .first()
    if (taken) return badRequest('That account is already linked to another player in this event')
  }

  await env.DB.prepare(`UPDATE event_team_members SET user_id = ?1 WHERE id = ?2`).bind(userId, memberId).run()

  await logAudit(env, data.user.id, 'update', 'event_team_members', memberId, { user_id: userId })
  return json({ ok: true })
}
