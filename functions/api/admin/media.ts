import type { Env } from '../_lib/env'
import { json } from '../_lib/http'

// GET /api/admin/media -> every media row, newest first
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const items = await env.DB.prepare(
    `SELECT * FROM media ORDER BY sort_order, created_at DESC`
  ).all()
  return json({ media: items.results ?? [] })
}
