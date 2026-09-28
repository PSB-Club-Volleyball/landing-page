import type { Env } from '../../../_lib/env'
import { badRequest, json, notFound } from '../../../_lib/http'
import type { AdminData } from '../../_lib/types'
import { logAudit } from '../../_lib/audit'
import { sendEventAnnouncementEmail } from '../../../_lib/eventEmails'

interface AnnounceInput {
  subject: string
  message: string
}

// POST /api/admin/events/:id/announce -> email a free-form announcement to
// everyone signed up for the event (any status except 'denied' — a
// confirmed attendee and someone still waiting on a decision both count as
// "signed up"). Used for things like a schedule change or what to bring
// that don't fit anywhere else on the event.
export const onRequestPost: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const body = await request.json<Partial<AnnounceInput>>().catch(() => null)
  if (!body || !body.subject?.trim() || !body.message?.trim()) return badRequest('subject and message are required')

  const event = await env.DB.prepare(`SELECT id, title, start_time, location_name FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ id: number; title: string; start_time: string; location_name: string | null }>()
  if (!event) return notFound('Event not found')

  const recipients = await env.DB.prepare(
    `SELECT name, email FROM event_signups WHERE event_id = ?1 AND status != 'denied'`
  )
    .bind(eventId)
    .all<{ name: string; email: string }>()

  const subject = body.subject.trim()
  const message = body.message.trim()
  const eventInfo = { title: event.title, start_time: event.start_time, location_name: event.location_name }

  const list = recipients.results ?? []
  let sent = 0
  for (const r of list) {
    if (await sendEventAnnouncementEmail(env, r.email, r.name, eventInfo, subject, message)) sent++
  }
  const failed = list.length - sent

  await logAudit(env, data.user.id, 'create', 'event_announcements', eventId, {
    subject,
    recipient_count: list.length,
    sent_count: sent,
  })

  // Nothing went out: an error, and resending is safe. A partial failure is
  // reported with counts instead, because resending would re-email the
  // people who already got it.
  if (list.length > 0 && sent === 0) {
    return json(
      {
        error: `Sent to ${sent} of ${list.length} recipients — ${failed} failed (see the server logs)`,
        recipient_count: list.length,
        sent_count: sent,
      },
      { status: 502 }
    )
  }
  return json({ ok: true, recipient_count: list.length, sent_count: sent, failed_count: failed })
}
