import type { Env } from '../../_lib/env'
import { badRequest, forbidden, json, notFound, unauthorized } from '../../_lib/http'
import { getSessionUser } from '../../_lib/session'
import { areTeammates, isStripeSkill, myTeamIds, stripeWindow, type StripeSkill } from '../../_lib/stripes'

interface EventRow {
  id: number
  status: string
  start_time: string
  end_time: string | null
}

async function loadEvent(env: Env, id: number): Promise<EventRow | null> {
  return env.DB.prepare(
    `SELECT id, status, start_time, end_time FROM events WHERE id = ?1 AND status IN ('published', 'cancelled')`
  )
    .bind(id)
    .first<EventRow>()
}

// GET /api/events/:id/stripes -> the signed-in player's side of stripes for
// this event: the window, their team, each linked teammate with the stripes
// already awarded to them, and the stripes they received here.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')
  const user = await getSessionUser(request, env)
  if (!user) return unauthorized()
  const event = await loadEvent(env, eventId)
  if (!event) return notFound('Event not found')

  const window = stripeWindow(event)
  const teamIds = await myTeamIds(env, eventId, user.id)
  if (teamIds.length === 0) return json({ window, team: null, teammates: [], received: [] })
  // A player listed on two teams in one event is an admin mistake; use the
  // first and let the Teams tab show it.
  const teamId = teamIds[0]

  const [teamRow, mateRows, givenRows, receivedRows] = await env.DB.batch([
    env.DB.prepare(`SELECT id, name FROM event_teams WHERE id = ?1`).bind(teamId),
    env.DB.prepare(
      `SELECT DISTINCT m.user_id, COALESCE(u.name, m.display_name, s.name) AS name
       FROM event_team_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN event_signups s ON s.id = m.signup_id
       WHERE m.team_id = ?1 AND m.user_id <> ?2
       ORDER BY name`
    ).bind(teamId, user.id),
    env.DB.prepare(`SELECT receiver_id, skill FROM stripes WHERE event_id = ?1 AND giver_id = ?2`).bind(eventId, user.id),
    env.DB.prepare(
      `SELECT st.skill, st.giver_id, u.name AS giver_name FROM stripes st
       LEFT JOIN users u ON u.id = st.giver_id
       WHERE st.event_id = ?1 AND st.receiver_id = ?2
       ORDER BY st.id`
    ).bind(eventId, user.id),
  ])
  const team = (teamRow.results as { id: number; name: string }[])[0]
  if (!team) throw new Error(`Team ${teamId} vanished while loading stripes`)

  const given = givenRows.results as { receiver_id: number; skill: StripeSkill }[]
  const teammates = (mateRows.results as { user_id: number; name: string | null }[]).map((m) => ({
    user_id: m.user_id,
    name: m.name,
    given: given.filter((g) => g.receiver_id === m.user_id).map((g) => g.skill),
  }))
  const received = (receivedRows.results as { skill: StripeSkill; giver_id: number | null; giver_name: string | null }[]).map(
    (r) => ({ skill: r.skill, from_user_id: r.giver_id, from_name: r.giver_name })
  )

  return json({ window, team, teammates, received })
}

// Shared checks for awarding and taking back: signed in, event published,
// window open, a real skill, and giver/receiver on the same team.
async function authorize(
  request: Request,
  env: Env,
  params: Record<string, string | string[]>
): Promise<Response | { eventId: number; giverId: number; receiverId: number; skill: StripeSkill }> {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')
  const user = await getSessionUser(request, env)
  if (!user) return unauthorized()

  const body = await request.json<{ receiver_id?: unknown; skill?: unknown }>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')
  const receiverId = Number(body.receiver_id)
  if (!Number.isInteger(receiverId)) return badRequest('receiver_id is required')
  if (!isStripeSkill(body.skill)) return badRequest('Unknown skill')
  if (receiverId === user.id) return badRequest("You can't award yourself a stripe")

  const event = await loadEvent(env, eventId)
  if (!event) return notFound('Event not found')
  if (event.status !== 'published') return forbidden('Stripes are closed for a cancelled event')
  const window = stripeWindow(event)
  if (window.state === 'upcoming') return forbidden('Stripes open when the event starts')
  if (window.state === 'closed') return forbidden('Stripes for this event are locked')
  if (!(await areTeammates(env, eventId, user.id, receiverId))) {
    return forbidden('You can only award stripes to a teammate from this event')
  }
  return { eventId, giverId: user.id, receiverId, skill: body.skill }
}

// POST /api/events/:id/stripes { receiver_id, skill } -> award one stripe.
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await authorize(request, env, params)
  if (auth instanceof Response) return auth
  const result = await env.DB.prepare(
    `INSERT INTO stripes (event_id, giver_id, receiver_id, skill) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (event_id, giver_id, receiver_id, skill) DO NOTHING`
  )
    .bind(auth.eventId, auth.giverId, auth.receiverId, auth.skill)
    .run()
  if (result.meta.changes === 0) return json({ error: 'Already awarded' }, { status: 409 })
  return json({ ok: true }, { status: 201 })
}

// DELETE /api/events/:id/stripes { receiver_id, skill } -> take one back
// (only while the window is open).
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await authorize(request, env, params)
  if (auth instanceof Response) return auth
  const result = await env.DB.prepare(
    `DELETE FROM stripes WHERE event_id = ?1 AND giver_id = ?2 AND receiver_id = ?3 AND skill = ?4`
  )
    .bind(auth.eventId, auth.giverId, auth.receiverId, auth.skill)
    .run()
  if (result.meta.changes === 0) return notFound('No such stripe')
  return json({ ok: true })
}
