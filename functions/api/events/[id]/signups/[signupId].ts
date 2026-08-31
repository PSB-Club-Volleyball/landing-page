import type { Env } from '../../../_lib/env'
import { badRequest, forbidden, json, notFound } from '../../../_lib/http'
import { getSessionUser } from '../../../_lib/session'

// DELETE /api/events/:id/signups/:signupId?token=... -> self-serve un-RSVP.
// No auth required — authorized by either the private cancel_token shown at
// submit time, or (if signed in) a session email matching the signup's email.
export const onRequestDelete: PagesFunction<Env, 'id' | 'signupId'> = async ({ request, env, params }) => {
  const eventId = Number(params.id)
  const signupId = Number(params.signupId)
  if (!Number.isInteger(eventId) || !Number.isInteger(signupId)) return badRequest('Invalid id')

  const signup = await env.DB.prepare(
    `SELECT id, email, cancel_token FROM event_signups WHERE id = ?1 AND event_id = ?2`
  )
    .bind(signupId, eventId)
    .first<{ id: number; email: string; cancel_token: string | null }>()
  if (!signup) return notFound('Signup not found')

  const token = new URL(request.url).searchParams.get('token')
  const tokenMatches = Boolean(token) && token === signup.cancel_token

  let emailMatches = false
  if (!tokenMatches) {
    const sessionUser = await getSessionUser(request, env)
    emailMatches = Boolean(sessionUser && sessionUser.status === 'approved' && sessionUser.email.toLowerCase() === signup.email.toLowerCase())
  }

  if (!tokenMatches && !emailMatches) return forbidden("This isn't your signup to cancel")

  await env.DB.prepare(`DELETE FROM event_signups WHERE id = ?1`).bind(signupId).run()
  return json({ ok: true })
}
