import type { Env } from './env'
import { randomToken } from './crypto'
import { buildCancelUrl, sendWaitlistPromotedEmail } from './eventEmails'
import { eventCutoff, eventEndWallClock } from './time'

// Called after a signup that held an 'approved' spot is removed/denied/
// cancelled — promotes the longest-waiting 'waitlist' signup (if any) to
// 'approved' and emails them. One promotion per freed spot, since only one
// spot is ever freed per call site.
//
// The pick, the capacity check and the update are one statement so two
// cancels landing at the same time can't promote the same person twice or
// push the event over capacity (an admin may have approved past it by hand,
// in which case nobody gets promoted until it's back under). A pre-0007 row
// with no cancel_token gets one here, since the promoted email needs a link.
// Nobody is promoted into a cancelled or finished event, whichever caller
// freed the spot (self-cancel, admin deny, admin delete).
export async function promoteFromWaitlist(env: Env, eventId: number): Promise<void> {
  const event = await env.DB.prepare(`SELECT title, start_time, end_time, location_name, status FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ title: string; start_time: string; end_time: string | null; location_name: string | null; status: string }>()
  if (!event) throw new Error(`promoteFromWaitlist: event ${eventId} not found`)
  if (event.status !== 'published' || eventEndWallClock(event) <= eventCutoff(0)) return

  const next = await env.DB.prepare(
    `UPDATE event_signups SET status = 'approved', cancel_token = COALESCE(cancel_token, ?2)
     WHERE id = (SELECT id FROM event_signups WHERE event_id = ?1 AND status = 'waitlist'
                 ORDER BY created_at ASC, id ASC LIMIT 1)
       AND status = 'waitlist'
       AND ((SELECT capacity FROM events WHERE id = ?1) IS NULL
            OR (SELECT COUNT(*) FROM event_signups WHERE event_id = ?1 AND status = 'approved')
               < (SELECT capacity FROM events WHERE id = ?1))
     RETURNING id, name, email, cancel_token`
  )
    .bind(eventId, randomToken(24))
    .first<{ id: number; name: string; email: string; cancel_token: string }>()
  if (!next) return

  const cancelUrl = buildCancelUrl(env, eventId, next.id, next.cancel_token)
  await sendWaitlistPromotedEmail(env, next.email, next.name, event, cancelUrl)
}
