import type { Env } from '../../_lib/env'

export type AuditAction = 'create' | 'update' | 'delete'

export async function logAudit(
  env: Env,
  userId: number,
  action: AuditAction,
  tableName: string,
  recordId: number | null,
  details?: unknown
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log (user_id, action, table_name, record_id, details)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(userId, action, tableName, recordId, details ? JSON.stringify(details) : null)
    .run()
}
