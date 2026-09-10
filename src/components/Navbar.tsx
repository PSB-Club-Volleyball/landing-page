import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import BallIcon from './BallIcon'
import MenuIcon from './MenuIcon'
import { getMe, getLoginProviders } from '../lib/api'
import { logout } from '../lib/adminApi'
import { signInOptions, DEFAULT_PROVIDERS } from '../lib/signInOptions'
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
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS)
  const location = useLocation()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
    getLoginProviders()
      .then(setProviders)
      .catch(() => {})
  }, [])

  // While the mobile menu is open it's a modal surface: trap Tab inside it,
  // close on Escape (returning focus to the toggle), lock body scroll, and
  // move focus to the first item on open.
  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('a, button, summary')?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      // The toggle (the X while open) is the first stop in the cycle so it
      // stays keyboard-reachable; the panel's own controls follow.
      const toggle = toggleRef.current
      const inPanel = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      )
      const focusable = toggle ? [toggle, ...inPanel] : inPanel
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      const contained = active === toggle || panel.contains(active)
      if (e.shiftKey && (active === first || !contained)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !contained)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [open])

  const signInOpts = signInOptions(providers)

  return (
    <header className="navbar">
      <NavLink
        to="/"
        className="brand"
        aria-label="Behrend Club Volleyball — home"
        onClick={() => setOpen(false)}
      >
        <BallIcon />
        <span className="brand-full">Behrend Club Volleyball</span>
        <span className="brand-short" aria-hidden="true">
          BCV
        </span>
      </NavLink>
      <button
        ref={toggleRef}
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="nav-panel"
        onClick={() => setOpen((prev) => !prev)}
      >
        <MenuIcon open={open} />
      </button>
      {open && (
        <div
          className="nav-scrim"
          onClick={() => {
            setOpen(false)
            toggleRef.current?.focus()
          }}
        />
      )}
      <div
        id="nav-panel"
        ref={panelRef}
        className={open ? 'nav-panel open' : 'nav-panel'}
      >
        <nav className="nav-links" aria-label="Primary">
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
          {user === null && signInOpts.length === 1 && (
            <a
              className="nav-signin"
              href={signInOpts[0].href(location.pathname)}
              onClick={() => setOpen(false)}
            >
              Sign in
            </a>
          )}
          {user === null && signInOpts.length > 1 && (
            <details className="nav-signin-menu">
              <summary className="nav-signin">Sign in</summary>
              <div className="nav-signin-options">
                {signInOpts.map((opt) => (
                  <a key={opt.id} href={opt.href(location.pathname)} onClick={() => setOpen(false)}>
                    {opt.label}
                  </a>
                ))}
              </div>
            </details>
          )}
          {user && (
            <span className="nav-account-chip">
              {(user.role === 'admin' || user.role === 'owner') && (
                <Link to="/admin" className="nav-admin-link" onClick={() => setOpen(false)}>
                  Admin
                </Link>
              )}
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
      </div>
    </header>
  )
}

export default Navbar
