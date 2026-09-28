import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { AuthUser } from '../../types'
import { logout } from '../../lib/api'
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

// What a cross-tab link asks the destination tab to open with.
export type TabIntent = 'create' | 'waiver-missing' | 'dues-unpaid'

type Tab = 'dashboard' | 'roster' | 'board' | 'events' | 'forms' | 'media' | 'users' | 'audit-log' | 'settings'

// Sidebar sections, grouped by what the admin is doing: running events,
// managing people, the public site's content, and owner-only settings.
const GROUPS: { title: string | null; ownerOnly?: boolean; tabs: { key: Tab; label: string }[] }[] = [
  { title: null, tabs: [{ key: 'dashboard', label: 'Dashboard' }] },
  {
    title: 'Events',
    tabs: [
      { key: 'events', label: 'Events' },
      { key: 'forms', label: 'Signup forms' },
    ],
  },
  {
    title: 'People',
    tabs: [
      { key: 'users', label: 'Users' },
      { key: 'roster', label: 'Roster' },
      { key: 'board', label: 'Board' },
    ],
  },
  { title: 'Site', tabs: [{ key: 'media', label: 'Media' }] },
  {
    title: 'Owner',
    ownerOnly: true,
    tabs: [
      { key: 'settings', label: 'Settings' },
      { key: 'audit-log', label: 'Audit log' },
    ],
  },
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
  onAttentionChange,
  intent,
}: {
  tab: Tab
  user: AuthUser
  isOwner: boolean
  onGoTo: (tab: Tab, intent?: TabIntent) => void
  onDirtyChange: (dirty: boolean) => void
  onAttentionChange: (count: number) => void
  intent: TabIntent | null
}) {
  switch (tab) {
    case 'dashboard':
      return <DashboardAdmin onGoTo={onGoTo} onAttentionChange={onAttentionChange} />
    case 'roster':
      return <RosterAdmin onDirtyChange={onDirtyChange} />
    case 'board':
      return <BoardAdmin isOwner={isOwner} onDirtyChange={onDirtyChange} />
    case 'events':
      return <EventsAdmin isOwner={isOwner} onDirtyChange={onDirtyChange} createOnOpen={intent === 'create'} />
    case 'forms':
      return <FormsAdmin isOwner={isOwner} onDirtyChange={onDirtyChange} />
    case 'media':
      return <MediaAdmin />
    case 'users':
      return <UsersAdmin currentUser={user} onDirtyChange={onDirtyChange} initialFilter={intent === 'waiver-missing' || intent === 'dues-unpaid' ? intent : null} />
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
  // Items waiting on an admin, reported by the dashboard once it loads; null
  // until then, so the badge never shows a count nobody has computed.
  const [attention, setAttention] = useState<number | null>(null)
  // Set by a cross-tab link (the dashboard's "New event" or a paperwork
  // count) and read once by the tab it lands on.
  const [intent, setIntent] = useState<TabIntent | null>(null)

  // The console's own screens are on the /admin index; a routed sub-page
  // (e.g. an event) lives at its own path. The sidebar always returns to the
  // console — the tab state persists because AdminLayout never unmounts.
  const onConsole = location.pathname === '/admin' || location.pathname === '/admin/'
  // An event sub-page belongs to the Events tab, so keep that one lit there.
  const onEventPage = location.pathname.startsWith('/admin/events/')

  // An intent is for the landing only: leaving the console (e.g. into an
  // event page) drops it, so coming back doesn't reopen "New event".
  useEffect(() => {
    if (!onConsole) setIntent(null)
  }, [onConsole])

  function pickTab(next: Tab, nextIntent?: TabIntent) {
    if (onConsole && next === tab) {
      setNavOpen(false)
      return
    }
    if (dirty && !confirm('You have unsaved changes. Leave this page and discard them?')) return
    setIntent(nextIntent ?? null)
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
          {GROUPS.filter((g) => !g.ownerOnly || isOwner).map((g) => (
            <div className="admin-nav-group" key={g.title ?? 'top'}>
              {g.title && <span className="admin-nav-heading">{g.title}</span>}
              {g.tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={
                    (onConsole && tab === t.key) || (onEventPage && t.key === 'events') ? 'active' : undefined
                  }
                  onClick={() => pickTab(t.key)}
                >
                  <span>{t.label}</span>
                  {t.key === 'dashboard' && attention !== null && attention > 0 && (
                    <span className="admin-nav-badge" aria-label={`${attention} waiting`}>
                      {attention}
                    </span>
                  )}
                </button>
              ))}
            </div>
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
                  onGoTo={pickTab}
                  onDirtyChange={setDirty}
                  onAttentionChange={setAttention}
                  intent={intent}
                />
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
