import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'

// GET /api/admin/board            -> every season, newest first
// GET /api/admin/board?season=... -> one season
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ request, env }) => {
  const url = new URL(request.url)
  const season = url.searchParams.get('season')

  const members = season
    ? await env.DB.prepare(`SELECT * FROM board WHERE season = ?1 ORDER BY sort_order`).bind(season).all()
    : await env.DB.prepare(`SELECT * FROM board ORDER BY season DESC, sort_order`).all()

  return json({ board: members.results ?? [] })
}

interface BoardInput {
  season: string
  role: string
  first_name: string
  last_name: string
  email?: string | null
  sort_order?: number
}

// POST /api/admin/board -> create a board member
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<Partial<BoardInput>>().catch(() => null)
  if (!body || !body.season || !body.role || !body.first_name || !body.last_name) {
    return badRequest('season, role, first_name, and last_name are required')
  }

  const result = await env.DB.prepare(
    `INSERT INTO board (season, role, first_name, last_name, email, sort_order)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(body.season, body.role, body.first_name, body.last_name, body.email ?? null, body.sort_order ?? 0)
    .run()

  const id = Number(result.meta.last_row_id)
  await logAudit(env, data.user.id, 'create', 'board', id, body)
  return json({ id }, { status: 201 })
}
