import type { Env } from '../_lib/env'
import { badRequest, json, notFound, unauthorized } from '../_lib/http'
import { getSessionUser } from '../_lib/session'
import { getPlayerResults } from '../_lib/playerResults'

// GET /api/members/:id -> one account's public results view (name + match
// record only — never skill level, club status, or RSVPs).
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) return unauthorized()

  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const user = await env.DB.prepare(`SELECT id, name, email, avatar_url FROM users WHERE id = ?1`)
    .bind(id)
    .first<{ id: number; name: string | null; email: string; avatar_url: string | null }>()
  if (!user) return notFound('Member not found')

  const results = await getPlayerResults(env, user.email)
  if (results.length === 0) return notFound('Member not found')

  return json({
    member: {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatar_url,
      results,
    },
  })
}
