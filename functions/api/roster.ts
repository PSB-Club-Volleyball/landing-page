import type { Env } from './_lib/env'
import { json } from './_lib/http'

// GET /api/roster            -> current (most recent) season
// GET /api/roster?season=2025-2026
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const season = url.searchParams.get('season')

  const players = season
    ? await env.DB.prepare(
        `SELECT id, season, first_name, last_name, jersey_number, position,
                class_year, photo_key, sort_order
         FROM roster WHERE season = ?1
         ORDER BY sort_order, last_name`
      )
        .bind(season)
        .all()
    : await env.DB.prepare(
        `SELECT id, season, first_name, last_name, jersey_number, position,
                class_year, photo_key, sort_order
         FROM roster WHERE season = (SELECT MAX(season) FROM roster)
         ORDER BY sort_order, last_name`
      ).all()

  return json({ players: players.results ?? [] })
}
