import type { Env } from '../../../../_lib/env'
import { badRequest, notFound, json } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'
import { sendRsvpApprovedEmail } from '../../../../_lib/eventEmails'

// PUT /api/admin/events/:id/signups/:signupId -> approve or deny a (typically
// gated-event) pending request. Approving sends the "you're approved" email;
// denying sends nothing, matching the three email types the product asks for
// (rsvp confirmation, rsvp request, rsvp approval).
export const onRequestPut: PagesFunction<Env, 'id' | 'signupId', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  const signupId = Number(params.signupId)
  if (!Number.isInteger(eventId) || !Number.isInteger(signupId)) return badRequest('Invalid id')

  const body = await request.json<{ status?: string }>().catch(() => null)
  if (!body || (body.status !== 'approved' && body.status !== 'denied')) {
    return badRequest('status must be "approved" or "denied"')
  }

  const signup = await env.DB.prepare(
    `SELECT s.id, s.name, s.email, e.title, e.start_time, e.location_name
     FROM event_signups s JOIN events e ON e.id = s.event_id
     WHERE s.id = ?1 AND s.event_id = ?2`
  )
    .bind(signupId, eventId)
    .first<{ id: number; name: string; email: string; title: string; start_time: string; location_name: string | null }>()
  if (!signup) return notFound('Signup not found')

  await env.DB.prepare(
    `UPDATE event_signups SET status = ?1, decided_at = CURRENT_TIMESTAMP, decided_by = ?2 WHERE id = ?3`
  )
    .bind(body.status, data.user.id, signupId)
    .run()

  await logAudit(env, data.user.id, 'update', 'event_signups', signupId, { event_id: eventId, status: body.status })

  if (body.status === 'approved') {
    await sendRsvpApprovedEmail(env, signup.email, signup.name, {
      title: signup.title,
      start_time: signup.start_time,
      location_name: signup.location_name,
    })
  }

  return json({ ok: true })
}

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
