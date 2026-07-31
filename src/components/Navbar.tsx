import { NavLink } from 'react-router-dom'
import InstagramIcon from './InstagramIcon'
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../constants'

const PAGES = [
  { to: '/', label: 'Home' },
  { to: '/roster', label: 'Roster' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/photos', label: 'Photos' },
]

function Navbar() {
  return (
    <header className="navbar">
      <NavLink to="/" className="brand">
        Behrend Club Volleyball
      </NavLink>
      <nav className="nav-links">
        {PAGES.map((page) => (
          <NavLink
            key={page.to}
            to={page.to}
            end={page.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
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
      >
        <InstagramIcon />
        {INSTAGRAM_HANDLE}
      </a>
    </header>
  )
}

export default Navbar
