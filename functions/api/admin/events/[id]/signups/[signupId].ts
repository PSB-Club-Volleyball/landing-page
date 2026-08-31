import type { Env } from '../../../../_lib/env'
import { badRequest, notFound, json } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'

// DELETE /api/admin/events/:id/signups/:signupId -> admin removes an attendee
export const onRequestDelete: PagesFunction<Env, 'id' | 'signupId', AdminData> = async ({ env, params, data }) => {
  const eventId = Number(params.id)
  const signupId = Number(params.signupId)
  if (!Number.isInteger(eventId) || !Number.isInteger(signupId)) return badRequest('Invalid id')

  const result = await env.DB.prepare(`DELETE FROM event_signups WHERE id = ?1 AND event_id = ?2`)
    .bind(signupId, eventId)
    .run()
  if (result.meta.changes === 0) return notFound('Signup not found')

  await logAudit(env, data.user.id, 'delete', 'event_signups', signupId, { event_id: eventId })
  return json({ ok: true })
}
