import type { AuthUser } from '../../types'

function AdminPending({ user }: { user: AuthUser }) {
  return (
    <div className="admin-lock-wrap">
      <div className="admin-lock-card">
        <h1>Waiting on approval</h1>
        <p>
          Signed in as <strong>{user.email}</strong>. An existing admin needs to approve your
          account in the Users tab before you can edit anything.
        </p>
      </div>
    </div>
  )
}

export default AdminPending
