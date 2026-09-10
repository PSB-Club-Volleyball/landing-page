import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'

// GET /api/admin/roster            -> every season, newest first
// GET /api/admin/roster?season=... -> one season
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ request, env }) => {
  const url = new URL(request.url)
  const season = url.searchParams.get('season')

  // `email` rides along from the linked account (roster.user_id) when there is
  // one — used by the admin roster's "emails only" export.
  const players = season
    ? await env.DB.prepare(
        `SELECT r.*, u.email AS email FROM roster r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.season = ?1 ORDER BY r.sort_order, r.last_name`
      )
        .bind(season)
        .all()
    : await env.DB.prepare(
        `SELECT r.*, u.email AS email FROM roster r LEFT JOIN users u ON u.id = r.user_id
         ORDER BY r.season DESC, r.sort_order, r.last_name`
      ).all()

  return json({ players: players.results ?? [] })
}

interface RosterInput {
  season: string
  first_name: string
  last_name: string
  jersey_number?: number | null
  position?: string | null
  class_year?: string | null
  photo_key?: string | null
  sort_order?: number
}

// POST /api/admin/roster -> create a player
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<Partial<RosterInput>>().catch(() => null)
  if (!body || !body.season || !body.first_name || !body.last_name) {
    return badRequest('season, first_name, and last_name are required')
  }

  const result = await env.DB.prepare(
    `INSERT INTO roster (season, first_name, last_name, jersey_number, position, class_year, photo_key, sort_order)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      body.season,
      body.first_name,
      body.last_name,
      body.jersey_number ?? null,
      body.position ?? null,
      body.class_year ?? null,
      body.photo_key ?? null,
      body.sort_order ?? 0
    )
    .run()

  const id = Number(result.meta.last_row_id)
  await logAudit(env, data.user.id, 'create', 'roster', id, body)
  return json({ id }, { status: 201 })
}
