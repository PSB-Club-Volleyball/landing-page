import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'

// POST /api/admin/laundry/clean-all -> "Did laundry": every dirty item becomes clean
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ env, data }) => {
  const result = await env.DB.prepare(
    `UPDATE laundry_items SET stage = 'clean', updated_at = CURRENT_TIMESTAMP WHERE stage = 'dirty'`
  ).run()

  await logAudit(env, data.user.id, 'update', 'laundry_items', null, { action: 'clean-all', count: result.meta.changes })
  return json({ ok: true, count: result.meta.changes })
}
