import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { AuthUser, PendingUser } from '../../types'

function UsersAdmin({ currentUser, onChange }: { currentUser: AuthUser; onChange: () => void }) {
  const isOwner = currentUser.role === 'owner'
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transferTo, setTransferTo] = useState('')

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

  async function transferOwnership() {
    const target = users.find((u) => u.id === Number(transferTo))
    if (!target) return
    const label = target.name || target.email
    if (!confirm(`Make ${label} the owner? You'll lose owner-only access immediately.`)) return
    try {
      await adminApi.users.transferOwnership(target.id)
      setTransferTo('')
      refresh()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pending = users.filter((u) => u.status === 'pending')
  const decided = users.filter((u) => u.status !== 'pending')
  const transferCandidates = users.filter((u) => u.status === 'approved' && u.role !== 'owner')

  return (
    <>
      <div className="admin-main-head">
        <h2>Users</h2>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!isOwner && <p className="admin-note">Only the owner can approve, deny, or transfer access.</p>}
      {loading && <p>Loading&hellip;</p>}

      {!loading && isOwner && (
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

      {!loading && (
        <div className="data-table" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Role</th>
                {isOwner && <th>Actions</th>}
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
                  <td>{u.role === 'owner' && <span className="status-chip status-approved">Owner</span>}</td>
                  {isOwner && (
                    <td>
                      <span className="row-actions">
                        {u.role === 'owner' ? (
                          <span className="admin-note">Transfer ownership to change</span>
                        ) : (
                          <>
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
                          </>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && isOwner && (
        <div className="admin-form" style={{ marginTop: '1.5rem' }}>
          <span>Transfer ownership to:</span>
          <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Select an approved user&hellip;</option>
            {transferCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
          <button className="danger" type="button" disabled={!transferTo} onClick={transferOwnership}>
            Transfer ownership
          </button>
        </div>
      )}
    </>
  )
}

export default UsersAdmin
