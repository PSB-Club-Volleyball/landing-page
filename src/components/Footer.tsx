import { Link } from 'react-router-dom'
import InstagramLink from './InstagramLink'
import { WAIVER_URL } from '../constants'

// GroupMe and the contact email already get top billing on Home and
// Roster (join CTA, board contact section) — repeating them here on
// every page just padded out the footer, especially on mobile.
function Footer() {
  return (
    <footer>
      <div className="footer-main">
        <span className="footer-brand">Behrend Club Volleyball</span>
        <InstagramLink />
      </div>
      <div className="footer-legal">
        <a href={WAIVER_URL} target="_blank" rel="noreferrer">
          Liability waiver
        </a>
        <Link to="/privacy">Privacy policy</Link>
        <Link to="/terms">Terms of use</Link>
      </div>
    </footer>
  )
}

export default Footer
