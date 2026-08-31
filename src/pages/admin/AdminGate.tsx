import { useEffect, useState } from 'react'
import { getMe } from '../../lib/api'
import type { AuthUser } from '../../types'
import AdminSignIn from './AdminSignIn'
import AdminPending from './AdminPending'
import AdminNotAdmin from './AdminNotAdmin'
import AdminLayout from './AdminLayout'

// Gate for everything under /admin. Mirrors the server-side check in
// functions/api/admin/_middleware.ts: no session -> sign in, role below
// admin -> "not an admin" screen, approved-but-pending -> waiting screen,
// admin/owner -> the actual console.
function AdminGate() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
  }, [])

  if (user === undefined) {
    return (
      <div className="admin-lock-wrap">
        <p className="admin-loading">Loading&hellip;</p>
      </div>
    )
  }
  if (!user) return <AdminSignIn />
  if (user.role !== 'admin' && user.role !== 'owner') return <AdminNotAdmin user={user} />
  if (user.status !== 'approved') return <AdminPending user={user} />
  return <AdminLayout user={user} />
}

export default AdminGate
