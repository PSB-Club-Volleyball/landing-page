import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'

// GET /api/admin/laundry -> every item, dirty first
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env }) => {
  const items = await env.DB.prepare(
    `SELECT * FROM laundry_items ORDER BY stage DESC, sort_order, name`
  ).all()

  return json({ items: items.results ?? [] })
}

// POST /api/admin/laundry -> add an item, starts dirty
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<{ name?: string; sort_order?: number }>().catch(() => null)
  if (!body || !body.name) return badRequest('name is required')

  const result = await env.DB.prepare(
    `INSERT INTO laundry_items (name, stage, sort_order) VALUES (?1, 'dirty', ?2)`
  )
    .bind(body.name, body.sort_order ?? 0)
    .run()

  const id = Number(result.meta.last_row_id)
  await logAudit(env, data.user.id, 'create', 'laundry_items', id, body)
  return json({ id }, { status: 201 })
}
