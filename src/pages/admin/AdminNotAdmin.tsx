import type { AuthUser } from '../../types'
import { logout } from '../../lib/adminApi'

function AdminNotAdmin({ user }: { user: AuthUser }) {
  return (
    <div className="admin-lock-wrap">
      <div className="admin-lock-card">
        <h1>Not an admin</h1>
        <p>
          Signed in as <strong>{user.email}</strong>. Ask an existing admin to promote your account
          to admin from the Users tab &mdash; the console is only for admins and the owner.
        </p>
        <button
          type="button"
          className="signout"
          onClick={() => {
            logout().finally(() => window.location.assign('/admin'))
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export default AdminNotAdmin
