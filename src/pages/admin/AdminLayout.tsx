import { useEffect, useState } from 'react'
import type { AuthUser } from '../../types'
import { adminApi, logout } from '../../lib/adminApi'
import RosterAdmin from './RosterAdmin'
import BoardAdmin from './BoardAdmin'
import EventsAdmin from './EventsAdmin'
import UsersAdmin from './UsersAdmin'

type Tab = 'roster' | 'board' | 'events' | 'users'

const TABS: { key: Tab; label: string }[] = [
  { key: 'roster', label: 'Roster' },
  { key: 'board', label: 'Board' },
  { key: 'events', label: 'Events' },
  { key: 'users', label: 'Users' },
]

function initials(user: AuthUser) {
  const source = user.name || user.email
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function AdminLayout({ user }: { user: AuthUser }) {
  const [tab, setTab] = useState<Tab>('roster')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    adminApi.users
      .list()
      .then((res) => setPendingCount(res.users.filter((u) => u.status === 'pending').length))
      .catch(() => {})
  }, [tab])

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <span className="admin-brand">Admin Console</span>
        <span className="admin-who">
          <span className="avatar">{initials(user)}</span>
          {user.name || user.email}
          <button
            type="button"
            className="signout"
            onClick={() => {
              logout().finally(() => window.location.assign('/admin'))
            }}
          >
            Sign out
          </button>
        </span>
      </div>
      <div className="admin-body">
        <nav className="admin-sidebar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? 'active' : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'users' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="admin-main">
          {tab === 'roster' && <RosterAdmin />}
          {tab === 'board' && <BoardAdmin />}
          {tab === 'events' && <EventsAdmin />}
          {tab === 'users' && <UsersAdmin onChange={() => setTab('users')} />}
        </div>
      </div>
    </div>
  )
}

export default AdminLayout
