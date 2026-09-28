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
  const decided = requests.map((req, i) => ({ ...req, newStatus: i < openSlots ? 'approved' : 'waitlist' }))
  const approved = decided.filter((d) => d.newStatus === 'approved').length
  const waitlisted = decided.length - approved

  // Every decision lands in one batch before any email goes out, so a failure
  // can't leave the release half-applied.
  await env.DB.batch(
    decided.map((d) =>
      env.DB.prepare(
        `UPDATE event_signups SET status = ?1, decided_at = CURRENT_TIMESTAMP, decided_by = ?2 WHERE id = ?3`
      ).bind(d.newStatus, data.user.id, d.id)
    )
  )

  for (const d of decided) {
    if (!d.cancel_token) continue
    const cancelUrl = buildCancelUrl(env, eventId, d.id, d.cancel_token)
    if (d.newStatus === 'approved') await sendRsvpApprovedEmail(env, d.email, d.name, eventInfo, cancelUrl)
    else await sendWaitlistEmail(env, d.email, d.name, eventInfo, cancelUrl)
  }

  await logAudit(env, data.user.id, 'update', 'events', eventId, { action: 'release', approved, waitlisted })
  return json({ ok: true, approved, waitlisted })
}
