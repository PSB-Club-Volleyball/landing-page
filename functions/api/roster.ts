import type { Env } from './_lib/env'
import { json } from './_lib/http'
import { getLoginSettings } from './auth/_lib/settings'

// GET /api/roster            -> current (most recent) season
// GET /api/roster?season=2025-2026
// Returns an empty list with visible:false when an owner has hidden the
// roster (Settings tab) — enforced here, not just in the page's rendering,
// so the data isn't reachable by a direct request either.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const settings = await getLoginSettings(env)
  if (!settings.roster_visible) return json({ players: [], visible: false })

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

  return json({ players: players.results ?? [], visible: true })
}
