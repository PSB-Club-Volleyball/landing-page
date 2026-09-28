import { useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { AuthUser } from '../../types'
import { logout } from '../../lib/adminApi'
import MenuIcon from '../../components/MenuIcon'
import DashboardAdmin from './DashboardAdmin'
import RosterAdmin from './RosterAdmin'
import BoardAdmin from './BoardAdmin'
import EventsAdmin from './EventsAdmin'
import AdminEventPage from './AdminEventPage'
import FormsAdmin from './FormsAdmin'
import MediaAdmin from './MediaAdmin'
import UsersAdmin from './UsersAdmin'
import AuditLogAdmin from './AuditLogAdmin'
import SettingsAdmin from './SettingsAdmin'

type Tab = 'dashboard' | 'roster' | 'board' | 'events' | 'forms' | 'media' | 'users' | 'audit-log' | 'settings'

const TABS: { key: Tab; label: string; ownerOnly?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard' },
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
  onGoTo,
  onDirtyChange,
}: {
  tab: Tab
  user: AuthUser
  isOwner: boolean
  onGoTo: (tab: Tab) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  switch (tab) {
    case 'dashboard':
      return <DashboardAdmin onGoTo={onGoTo} />
    case 'roster':
      return <RosterAdmin onDirtyChange={onDirtyChange} />
    case 'board':
      return <BoardAdmin isOwner={isOwner} onDirtyChange={onDirtyChange} />
    case 'events':
      return <EventsAdmin isOwner={isOwner} onDirtyChange={onDirtyChange} />
    case 'forms':
      return <FormsAdmin isOwner={isOwner} onDirtyChange={onDirtyChange} />
    case 'media':
      return <MediaAdmin />
    case 'users':
      return <UsersAdmin currentUser={user} />
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
  const [tab, setTab] = useState<Tab>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  // Set by whichever editor is mounted (console tab or event page) while it
  // holds unsaved input — switching tabs unmounts it and loses that input.
  const [dirty, setDirty] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  // The console's own screens are on the /admin index; a routed sub-page
  // (e.g. an event) lives at its own path. The sidebar always returns to the
  // console — the tab state persists because AdminLayout never unmounts.
  const onConsole = location.pathname === '/admin' || location.pathname === '/admin/'

  function pickTab(next: Tab) {
    if (onConsole && next === tab) {
      setNavOpen(false)
      return
    }
    if (dirty && !confirm('You have unsaved changes. Leave this page and discard them?')) return
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
              setSignOutError(null)
              logout()
                .then(() => window.location.assign('/admin'))
                .catch((e: Error) => {
                  console.error('Sign out failed', e)
                  setSignOutError(`Sign out failed — you're still signed in. ${e.message}`)
                })
            }}
          >
            Sign out
          </button>
        </span>
      </div>
      {signOutError && (
        <p className="admin-error" role="alert">
          {signOutError}
        </p>
      )}
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
            </button>
          ))}
        </nav>
        <div className="admin-main">
          <Routes>
            <Route
              index
              element={
                <ConsoleTab tab={tab} user={user} isOwner={isOwner} onGoTo={pickTab} onDirtyChange={setDirty} />
              }
            />
            <Route path="events/:eventId" element={<AdminEventPage isOwner={isOwner} onDirtyChange={setDirty} />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

export default AdminLayout
