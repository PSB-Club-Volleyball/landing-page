import type { Env } from '../_lib/env'
import { json } from '../_lib/http'

const COLUMNS = `id, email, name, avatar_url, provider, status, role, position, team,
                 waiver_signed_year, waiver_signed_at, requested_at, decided_at, decided_by`

// GET /api/admin/users            -> everyone who has ever signed in
// GET /api/admin/users?status=pending
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const status = url.searchParams.get('status')

  const users = status
    ? await env.DB.prepare(`SELECT ${COLUMNS} FROM users WHERE status = ?1 ORDER BY requested_at DESC`)
        .bind(status)
        .all()
    : await env.DB.prepare(`SELECT ${COLUMNS} FROM users ORDER BY requested_at DESC`).all()

  return json({ users: users.results ?? [] })
}
