import type { Env } from '../_lib/env'
import { json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { requireOwner } from './_lib/permissions'

// GET /api/admin/audit-log -> owner only, most recent 200 entries
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const entries = await env.DB.prepare(
    `SELECT a.id, a.action, a.table_name, a.record_id, a.details, a.created_at, u.email AS actor_email
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT 200`
  ).all()

  return json({ entries: entries.results ?? [] })
}
