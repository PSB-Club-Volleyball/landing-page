import type { Env } from '../../../../_lib/env'
import { badRequest, notFound, json } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'
import { buildCancelUrl, sendRsvpApprovedEmail } from '../../../../_lib/eventEmails'
import { promoteFromWaitlist } from '../../../../_lib/waitlist'

interface DecisionBody {
  status?: 'approved' | 'denied' | 'waitlist'
  checked_in?: boolean
}

// PUT /api/admin/events/:id/signups/:signupId -> approve/deny a pending
// request, manually move a signup on/off the waitlist, and/or toggle
// check-in — any subset of { status, checked_in } in one call. Approving
// (from 'pending' or 'waitlist') sends the "you're approved" email; denying
// or moving someone off an approved spot frees it up for the next
// waitlisted signup.
export const onRequestPut: PagesFunction<Env, 'id' | 'signupId', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  const signupId = Number(params.signupId)
  if (!Number.isInteger(eventId) || !Number.isInteger(signupId)) return badRequest('Invalid id')

  const body = await request.json<DecisionBody>().catch(() => null)
  if (!body || (body.status === undefined && body.checked_in === undefined)) {
    return badRequest('status and/or checked_in is required')
  }
  if (body.status !== undefined && !['approved', 'denied', 'waitlist'].includes(body.status)) {
    return badRequest('status must be "approved", "denied", or "waitlist"')
  }

  const signup = await env.DB.prepare(
    `SELECT s.id, s.name, s.email, s.status, s.cancel_token, e.title, e.start_time, e.location_name
     FROM event_signups s JOIN events e ON e.id = s.event_id
     WHERE s.id = ?1 AND s.event_id = ?2`
  )
    .bind(signupId, eventId)
    .first<{
      id: number
      name: string
      email: string
      status: string
      cancel_token: string | null
      title: string
      start_time: string
      location_name: string | null
    }>()
  if (!signup) return notFound('Signup not found')

  if (body.status !== undefined) {
    await env.DB.prepare(
      `UPDATE event_signups SET status = ?1, decided_at = CURRENT_TIMESTAMP, decided_by = ?2 WHERE id = ?3`
    )
      .bind(body.status, data.user.id, signupId)
      .run()
  }
  if (body.checked_in !== undefined) {
    await env.DB.prepare(`UPDATE event_signups SET checked_in_at = ?1 WHERE id = ?2`)
      .bind(body.checked_in ? new Date().toISOString() : null, signupId)
      .run()
  }

  await logAudit(env, data.user.id, 'update', 'event_signups', signupId, { event_id: eventId, ...body })

  if (body.status === 'approved' && signup.status !== 'approved' && signup.cancel_token) {
    const eventInfo = { title: signup.title, start_time: signup.start_time, location_name: signup.location_name }
    const cancelUrl = buildCancelUrl(env, eventId, signupId, signup.cancel_token)
    await sendRsvpApprovedEmail(env, signup.email, signup.name, eventInfo, cancelUrl)
  }
  if (body.status && body.status !== 'approved' && signup.status === 'approved') {
    await promoteFromWaitlist(env, eventId)
  }

  return json({ ok: true })
}

// DELETE /api/admin/events/:id/signups/:signupId -> admin removes an attendee
export const onRequestDelete: PagesFunction<Env, 'id' | 'signupId', AdminData> = async ({ env, params, data }) => {
  const eventId = Number(params.id)
  const signupId = Number(params.signupId)
  if (!Number.isInteger(eventId) || !Number.isInteger(signupId)) return badRequest('Invalid id')

  const signup = await env.DB.prepare(`SELECT status FROM event_signups WHERE id = ?1 AND event_id = ?2`)
    .bind(signupId, eventId)
    .first<{ status: string }>()
  if (!signup) return notFound('Signup not found')

  await env.DB.prepare(`DELETE FROM event_signups WHERE id = ?1 AND event_id = ?2`).bind(signupId, eventId).run()
  if (signup.status === 'approved') await promoteFromWaitlist(env, eventId)

  await logAudit(env, data.user.id, 'delete', 'event_signups', signupId, { event_id: eventId })
  return json({ ok: true })
}
