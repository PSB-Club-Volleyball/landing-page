import type { Env } from '../../../_lib/env'
import { badRequest, json, notFound } from '../../../_lib/http'
import type { AdminData } from '../../_lib/types'
import { logAudit } from '../../_lib/audit'
import { buildCancelUrl, sendRsvpApprovedEmail, sendWaitlistEmail } from '../../../_lib/eventEmails'

// POST /api/admin/events/:id/release -> bulk-decide every 'pending' signup
// at once, in the order they came in, instead of an admin working through
// them one by one. Fills any open capacity with 'approved' and sends the
// rest to 'waitlist' — same outcome as approving them individually, just in
// one action. A no-op (200, zero counts) when nothing is pending.
export const onRequestPost: PagesFunction<Env, 'id', AdminData> = async ({ env, params, data }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(`SELECT id, title, start_time, location_name, capacity FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ id: number; title: string; start_time: string; location_name: string | null; capacity: number | null }>()
  if (!event) return notFound('Event not found')

  const pending = await env.DB.prepare(
    `SELECT id, name, email, cancel_token FROM event_signups WHERE event_id = ?1 AND status = 'pending' ORDER BY created_at ASC`
  )
    .bind(eventId)
    .all<{ id: number; name: string; email: string; cancel_token: string | null }>()
  const requests = pending.results ?? []
  if (requests.length === 0) return json({ ok: true, approved: 0, waitlisted: 0 })

  let openSlots = Infinity
  if (event.capacity !== null) {
    const approvedCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM event_signups WHERE event_id = ?1 AND status = 'approved'`
    )
      .bind(eventId)
      .first<{ n: number }>()
    openSlots = Math.max(0, event.capacity - (approvedCount?.n ?? 0))
  }

  const eventInfo = { title: event.title, start_time: event.start_time, location_name: event.location_name }
  let approved = 0
  let waitlisted = 0

  for (const req of requests) {
    const newStatus = approved < openSlots ? 'approved' : 'waitlist'
    await env.DB.prepare(
      `UPDATE event_signups SET status = ?1, decided_at = CURRENT_TIMESTAMP, decided_by = ?2 WHERE id = ?3`
    )
      .bind(newStatus, data.user.id, req.id)
      .run()

    if (newStatus === 'approved') approved++
    else waitlisted++

    if (req.cancel_token) {
      const cancelUrl = buildCancelUrl(env, eventId, req.id, req.cancel_token)
      if (newStatus === 'approved') await sendRsvpApprovedEmail(env, req.email, req.name, eventInfo, cancelUrl)
      else await sendWaitlistEmail(env, req.email, req.name, eventInfo, cancelUrl)
    }
  }

  await logAudit(env, data.user.id, 'update', 'events', eventId, { action: 'release', approved, waitlisted })
  return json({ ok: true, approved, waitlisted })
}
