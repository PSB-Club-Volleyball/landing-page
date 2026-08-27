import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { AuditEntry } from '../../types'

function describe(entry: AuditEntry) {
  const parts = [`${entry.action} ${entry.table_name}`]
  if (entry.record_id !== null) parts.push(`#${entry.record_id}`)
  return parts.join(' ')
}

function AuditLogAdmin() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.auditLog
      .list()
      .then((res) => setEntries(res.entries))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="admin-main-head">
        <h2>Audit log</h2>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {loading && <p>Loading&hellip;</p>}
      {!loading && (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4}>No audit entries yet.</td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString()}</td>
                  <td>{e.actor_email ?? '—'}</td>
                  <td>{describe(e)}</td>
                  <td>{e.details ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default AuditLogAdmin
