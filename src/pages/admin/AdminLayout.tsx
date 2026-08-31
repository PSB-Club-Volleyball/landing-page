import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuthUser } from '../../types'
import { adminApi, logout } from '../../lib/adminApi'
import MenuIcon from '../../components/MenuIcon'
import RosterAdmin from './RosterAdmin'
import BoardAdmin from './BoardAdmin'
import EventsAdmin from './EventsAdmin'
import FormsAdmin from './FormsAdmin'
import UsersAdmin from './UsersAdmin'
import AuditLogAdmin from './AuditLogAdmin'

type Tab = 'roster' | 'board' | 'events' | 'forms' | 'users' | 'audit-log'

const TABS: { key: Tab; label: string; ownerOnly?: boolean }[] = [
  { key: 'roster', label: 'Roster' },
  { key: 'board', label: 'Board' },
  { key: 'events', label: 'Events' },
  { key: 'forms', label: 'Forms' },
  { key: 'users', label: 'Users' },
  { key: 'audit-log', label: 'Audit log', ownerOnly: true },
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
  const isOwner = user.role === 'owner'
  const [tab, setTab] = useState<Tab>('roster')
  const [pendingCount, setPendingCount] = useState(0)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    adminApi.users
      .list()
      .then((res) => setPendingCount(res.users.filter((u) => u.status === 'pending').length))
      .catch(() => {})
  }, [tab])

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <button
          type="button"
          className="admin-nav-toggle"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
          aria-controls="admin-sidebar"
          onClick={() => setNavOpen((prev) => !prev)}
        >
          <MenuIcon open={navOpen} />
        </button>
        <span className="admin-brand">Admin Console</span>
        <Link to="/" className="admin-view-site">
          View site
        </Link>
        <span className="admin-who">
          <span className="avatar">{initials(user)}</span>
          <span className="admin-who-name">{user.name || user.email}</span>
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
        <nav id="admin-sidebar" className={navOpen ? 'admin-sidebar open' : 'admin-sidebar'}>
          {TABS.filter((t) => !t.ownerOnly || isOwner).map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? 'active' : undefined}
              onClick={() => {
                setTab(t.key)
                setNavOpen(false)
              }}
            >
              {t.label}
              {t.key === 'users' && isOwner && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="admin-main">
          {tab === 'roster' && <RosterAdmin isOwner={isOwner} />}
          {tab === 'board' && <BoardAdmin isOwner={isOwner} />}
          {tab === 'events' && <EventsAdmin isOwner={isOwner} />}
          {tab === 'forms' && <FormsAdmin isOwner={isOwner} />}
          {tab === 'users' && <UsersAdmin currentUser={user} onChange={() => setTab('users')} />}
          {tab === 'audit-log' && isOwner && <AuditLogAdmin />}
        </div>
      </div>
    </div>
  )
}

export default AdminLayout
