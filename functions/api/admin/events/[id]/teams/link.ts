import type { Env } from '../../../../_lib/env'
import { badRequest, json, notFound } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'
import { autoLinkStatements } from '../../../../_lib/teamLinks'

// POST /api/admin/events/:id/teams/link -> auto-link any still-unlinked team
// members to accounts (signup email, then unique name match), without
// touching teams or scores. For players who made an account after the event.
export const onRequestPost: PagesFunction<Env, 'id', AdminData> = async ({ env, params, data }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(`SELECT id FROM events WHERE id = ?1`).bind(eventId).first()
  if (!event) return notFound('Event not found')

  const results = await env.DB.batch(autoLinkStatements(env, eventId))
  const linked = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0)

  if (linked > 0) await logAudit(env, data.user.id, 'update', 'event_team_members', eventId, { auto_linked: linked })
  return json({ linked })
}
