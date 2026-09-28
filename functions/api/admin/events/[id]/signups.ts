import type { Env } from '../../../_lib/env'
import { badRequest, json } from '../../../_lib/http'
import type { AdminData } from '../../_lib/types'

interface SignupRow {
  id: number
  event_id: number
  name: string
  email: string
  answers: string | null
  status: string
  checked_in_at: string | null
  created_at: string
  user_id: number | null
}

// GET /api/admin/events/:id/signups -> attendee list for the event's "View signups"
// panel. cancel_token is deliberately excluded — it's the submitter's private
// self-cancel credential, not something the admin view needs to see. user_id is
// the account whose email matches the signup's (null = guest), so the panel
// can link the name to that member's profile.
export const onRequestGet: PagesFunction<Env, 'id', AdminData> = async ({ env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const signups = await env.DB.prepare(
    `SELECT s.id, s.event_id, s.name, s.email, s.answers, s.status, s.checked_in_at, s.created_at,
            (SELECT u.id FROM users u WHERE LOWER(u.email) = LOWER(s.email)) AS user_id
     FROM event_signups s WHERE s.event_id = ?1 ORDER BY s.created_at ASC`
  )
    .bind(eventId)
    .all<SignupRow>()

  const parsed = (signups.results ?? []).map((row) => ({
    ...row,
    answers: row.answers ? (JSON.parse(row.answers) as Record<string, string>) : null,
  }))

  return json({ signups: parsed })
}
