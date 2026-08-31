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
  created_at: string
}

// GET /api/admin/events/:id/signups -> attendee list for the event's "View signups"
// panel. cancel_token is deliberately excluded — it's the submitter's private
// self-cancel credential, not something the admin view needs to see.
export const onRequestGet: PagesFunction<Env, 'id', AdminData> = async ({ env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const signups = await env.DB.prepare(
    `SELECT id, event_id, name, email, answers, status, created_at
     FROM event_signups WHERE event_id = ?1 ORDER BY created_at ASC`
  )
    .bind(eventId)
    .all<SignupRow>()

  const parsed = (signups.results ?? []).map((row) => ({
    ...row,
    answers: row.answers ? (JSON.parse(row.answers) as Record<string, string>) : null,
  }))

  return json({ signups: parsed })
}
