import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { PendingUser } from '../../types'

function UsersAdmin({ onChange }: { onChange: () => void }) {
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    adminApi.users
      .list()
      .then((res) => setUsers(res.users))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function decide(id: number, status: 'approved' | 'denied') {
    try {
      await adminApi.users.decide(id, status)
      refresh()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pending = users.filter((u) => u.status === 'pending')
  const decided = users.filter((u) => u.status !== 'pending')

  return (
    <>
      <div className="admin-main-head">
        <h2>Users</h2>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {loading && <p>Loading&hellip;</p>}

      {!loading && (
        <div className="approvals-panel">
          <div className="ap-head">Pending approvals — {pending.length}</div>
          {pending.length === 0 && <div className="ap-row">Nobody is waiting on approval.</div>}
          {pending.map((u) => (
            <div className="ap-row" key={u.id}>
              <div className="ap-info">
                <span className="ap-name">{u.name || u.email}</span>
                <br />
                <span className="ap-email">{u.email}</span>
              </div>
              <span className="provider-chip">{u.provider}</span>
              <div className="ap-actions">
                <button className="approve-btn" type="button" onClick={() => decide(u.id, 'approved')}>
                  Approve
                </button>
                <button className="deny-btn" type="button" onClick={() => decide(u.id, 'denied')}>
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && decided.length > 0 && (
        <div className="data-table" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((u) => (
                <tr key={u.id}>
                  <td>{u.name || '—'}</td>
                  <td>{u.email}</td>
                  <td>{u.provider}</td>
                  <td>
                    <span className={`status-chip status-${u.status}`}>{u.status}</span>
                  </td>
                  <td>
                    <span className="row-actions">
                      {u.status !== 'approved' && (
                        <button type="button" onClick={() => decide(u.id, 'approved')}>
                          Approve
                        </button>
                      )}
                      {u.status !== 'denied' && (
                        <button type="button" className="danger" onClick={() => decide(u.id, 'denied')}>
                          Deny
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default UsersAdmin
