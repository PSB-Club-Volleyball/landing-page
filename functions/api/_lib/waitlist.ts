import type { Env } from './env'
import { buildCancelUrl, sendWaitlistPromotedEmail } from './eventEmails'

// Called after a signup that held an 'approved' spot is removed/denied/
// cancelled — promotes the longest-waiting 'waitlist' signup (if any) to
// 'approved' and emails them. One promotion per freed spot, since only one
// spot is ever freed per call site.
export async function promoteFromWaitlist(env: Env, eventId: number): Promise<void> {
  const next = await env.DB.prepare(
    `SELECT id, name, email, cancel_token FROM event_signups
     WHERE event_id = ?1 AND status = 'waitlist'
     ORDER BY created_at ASC LIMIT 1`
  )
    .bind(eventId)
    .first<{ id: number; name: string; email: string; cancel_token: string | null }>()
  if (!next) return

  await env.DB.prepare(`UPDATE event_signups SET status = 'approved' WHERE id = ?1`).bind(next.id).run()

  const event = await env.DB.prepare(`SELECT title, start_time, location_name FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ title: string; start_time: string; location_name: string | null }>()
  if (!event || !next.cancel_token) return

  const cancelUrl = buildCancelUrl(env, eventId, next.id, next.cancel_token)
  await sendWaitlistPromotedEmail(env, next.email, next.name, event, cancelUrl)
}
