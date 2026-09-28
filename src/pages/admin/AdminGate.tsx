import { useEffect, useState } from 'react'
import { ApiError, getMe } from '../../lib/api'
import type { AuthUser } from '../../types'
import AdminSignIn from './AdminSignIn'
import AdminNotAdmin from './AdminNotAdmin'
import AdminLayout from './AdminLayout'

// Gate for everything under /admin. Mirrors the server-side check in
// functions/api/admin/_middleware.ts: no session -> sign in, role below
// admin -> "not an admin" screen, admin/owner -> the actual console.
function AdminGate() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  // A signed-out visitor gets `{ user: null }` (or a 401); anything else —
  // offline, a 500 — is an outage, not "please sign in", so it gets its own
  // error state instead of a sign-in screen that can't fix it.
  function check() {
    setLoadError(null)
    setUser(undefined)
    getMe()
      .then((res) => setUser(res.user))
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 401) {
          setUser(null)
          return
        }
        console.error('Failed to check admin session', e)
        setLoadError(e.message)
      })
  }

  useEffect(check, [])

  if (loadError) {
    return (
      <div className="admin-lock-wrap">
        <div className="admin-lock-card">
          <h1>Couldn&rsquo;t reach the server</h1>
          <p className="admin-error" role="alert">
            {loadError}
          </p>
          <button type="button" className="btn btn-ace" onClick={check}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (user === undefined) {
    return (
      <div className="admin-lock-wrap">
        <p className="admin-loading">Loading&hellip;</p>
      </div>
    )
  }
  if (!user) return <AdminSignIn />
  if (user.role !== 'admin' && user.role !== 'owner') return <AdminNotAdmin user={user} />
  return <AdminLayout user={user} />
}

export default AdminGate
