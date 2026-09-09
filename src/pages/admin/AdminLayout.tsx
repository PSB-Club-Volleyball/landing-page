import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { AuthUser } from '../../types'
import { adminApi, logout } from '../../lib/adminApi'
import MenuIcon from '../../components/MenuIcon'
import RosterAdmin from './RosterAdmin'
import BoardAdmin from './BoardAdmin'
import EventsAdmin from './EventsAdmin'
import AdminEventPage from './AdminEventPage'
import FormsAdmin from './FormsAdmin'
import MediaAdmin from './MediaAdmin'
import UsersAdmin from './UsersAdmin'
import AuditLogAdmin from './AuditLogAdmin'
import SettingsAdmin from './SettingsAdmin'

type Tab = 'roster' | 'board' | 'events' | 'forms' | 'media' | 'users' | 'audit-log' | 'settings'

const TABS: { key: Tab; label: string; ownerOnly?: boolean }[] = [
  { key: 'roster', label: 'Roster' },
  { key: 'board', label: 'Board' },
  { key: 'events', label: 'Events' },
  { key: 'forms', label: 'Forms' },
  { key: 'media', label: 'Media' },
  { key: 'users', label: 'Users' },
  { key: 'audit-log', label: 'Audit log', ownerOnly: true },
  { key: 'settings', label: 'Settings', ownerOnly: true },
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

function ConsoleTab({
  tab,
  user,
  isOwner,
  onUsersChange,
}: {
  tab: Tab
  user: AuthUser
  isOwner: boolean
  onUsersChange: () => void
}) {
  switch (tab) {
    case 'roster':
      return <RosterAdmin isOwner={isOwner} />
    case 'board':
      return <BoardAdmin isOwner={isOwner} />
    case 'events':
      return <EventsAdmin isOwner={isOwner} />
    case 'forms':
      return <FormsAdmin isOwner={isOwner} />
    case 'media':
      return <MediaAdmin isOwner={isOwner} />
    case 'users':
      return <UsersAdmin currentUser={user} onChange={onUsersChange} />
    case 'audit-log':
      return isOwner ? <AuditLogAdmin /> : null
    case 'settings':
      return isOwner ? <SettingsAdmin /> : null
  }
}

function AdminLayout({ user }: { user: AuthUser }) {
  const isOwner = user.role === 'owner'
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('roster')
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingRefresh, setPendingRefresh] = useState(0)
  const [navOpen, setNavOpen] = useState(false)

  // The console's own screens are on the /admin index; a routed sub-page
  // (e.g. an event) lives at its own path. The sidebar always returns to the
  // console — the tab state persists because AdminLayout never unmounts.
  const onConsole = location.pathname === '/admin' || location.pathname === '/admin/'

  useEffect(() => {
    adminApi.users
      .list()
      .then((res) => setPendingCount(res.users.filter((u) => u.status === 'pending').length))
      .catch(() => {})
  }, [tab, pendingRefresh])

  function pickTab(next: Tab) {
    setTab(next)
    setNavOpen(false)
    if (!onConsole) navigate('/admin')
  }

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
              className={onConsole && tab === t.key ? 'active' : undefined}
              onClick={() => pickTab(t.key)}
            >
              {t.label}
              {t.key === 'users' && isOwner && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="admin-main">
          <Routes>
            <Route
              index
              element={
                <ConsoleTab
                  tab={tab}
                  user={user}
                  isOwner={isOwner}
                  onUsersChange={() => setPendingRefresh((n) => n + 1)}
                />
              }
            />
            <Route path="events/:eventId" element={<AdminEventPage isOwner={isOwner} />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

export default AdminLayout
