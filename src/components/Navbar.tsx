import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import BallIcon from './BallIcon'
import InstagramLink from './InstagramLink'
import MenuIcon from './MenuIcon'
import { getMe } from '../lib/api'
import { logout } from '../lib/adminApi'
import type { AuthUser } from '../types'

const PAGES = [
  { to: '/', label: 'Home' },
  { to: '/roster', label: 'Roster' },
  { to: '/events', label: 'Events' },
  { to: '/photos', label: 'Photos' },
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

function Navbar() {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
  }, [])

  return (
    <header className="navbar">
      <NavLink to="/" className="brand" onClick={() => setOpen(false)}>
        <BallIcon />
        Behrend Club Volleyball
      </NavLink>
      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="nav-panel"
        onClick={() => setOpen((prev) => !prev)}
      >
        <MenuIcon open={open} />
      </button>
      <div id="nav-panel" className={open ? 'nav-panel open' : 'nav-panel'}>
        <nav className="nav-links">
          {PAGES.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              end={page.to === '/'}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              onClick={() => setOpen(false)}
            >
              {page.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-account">
          {user === undefined && null}
          {user === null && (
            <a
              className="nav-signin"
              href={`/api/auth/google/start?redirect=${encodeURIComponent(location.pathname)}`}
              onClick={() => setOpen(false)}
            >
              Sign in
            </a>
          )}
          {user && (
            <span className="nav-account-chip">
              <span className="nav-avatar">{initials(user)}</span>
              <button
                type="button"
                className="nav-signout"
                onClick={() => {
                  logout().then(() => window.location.reload())
                }}
              >
                Sign out
              </button>
            </span>
          )}
        </div>
        <InstagramLink onClick={() => setOpen(false)} />
      </div>
    </header>
  )
}

export default Navbar
