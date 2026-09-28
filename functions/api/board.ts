import type { Env } from './_lib/env'
import { json } from './_lib/http'

// GET /api/board             -> current (most recent) season
// GET /api/board?season=2025-2026
// Public, so no email — contact details stay on /api/admin/board.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const season = url.searchParams.get('season')

  const members = season
    ? await env.DB.prepare(
        `SELECT id, season, role, first_name, last_name, sort_order
         FROM board WHERE season = ?1
         ORDER BY sort_order`
      )
        .bind(season)
        .all()
    : await env.DB.prepare(
        `SELECT id, season, role, first_name, last_name, sort_order
         FROM board WHERE season = (SELECT MAX(season) FROM board)
         ORDER BY sort_order`
      ).all()

  return json({ board: members.results ?? [] })
}
