import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import BallIcon from './BallIcon'
import InstagramIcon from './InstagramIcon'
import MenuIcon from './MenuIcon'
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../constants'

const PAGES = [
  { to: '/', label: 'Home' },
  { to: '/roster', label: 'Roster' },
  { to: '/events', label: 'Events' },
  { to: '/photos', label: 'Photos' },
]

function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

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
        <a
          className="instagram-link"
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpen(false)}
        >
          <InstagramIcon />
          {INSTAGRAM_HANDLE}
        </a>
      </div>
    </header>
  )
}

export default Navbar
