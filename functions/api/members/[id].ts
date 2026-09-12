import type { Env } from '../_lib/env'
import { badRequest, json, notFound, unauthorized } from '../_lib/http'
import { getSessionUser } from '../_lib/session'
import { getPlayerResults, getPlayerSummary } from '../_lib/playerResults'

// GET /api/members/:id -> one account's public profile — name, public-safe
// roster info (position/team/jersey/class year), and match record. Never
// includes skill level, club status, or RSVPs.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) return unauthorized()

  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const user = await env.DB.prepare(
    `SELECT id, name, email, avatar_url, position, team FROM users WHERE id = ?1`
  )
    .bind(id)
    .first<{
      id: number
      name: string | null
      email: string
      avatar_url: string | null
      position: string | null
      team: string | null
    }>()
  if (!user) return notFound('Member not found')

  const rosterRow = await env.DB.prepare(
    `SELECT jersey_number, class_year FROM roster WHERE user_id = ?1 ORDER BY season DESC LIMIT 1`
  )
    .bind(id)
    .first<{ jersey_number: number | null; class_year: string | null }>()

  const results = await getPlayerResults(env, user.email)
  const summary = getPlayerSummary(results)

  return json({
    member: {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatar_url,
      position: user.position,
      team: user.team,
      classYear: rosterRow?.class_year ?? null,
      jerseyNumber: rosterRow?.jersey_number ?? null,
      summary,
      results,
    },
  })
}
