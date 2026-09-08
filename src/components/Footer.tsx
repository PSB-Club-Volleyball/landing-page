import { Link } from 'react-router-dom'
import InstagramLink from './InstagramLink'
import { CONTACT_EMAIL, GROUPME_URL, WAIVER_URL } from '../constants'

function Footer() {
  return (
    <footer>
      <div className="footer-main">
        <span className="footer-brand">Behrend Club Volleyball</span>
        <div className="footer-connect">
          <InstagramLink />
          <a className="groupme-link" href={GROUPME_URL} target="_blank" rel="noreferrer">
            Join our GroupMe
          </a>
          <a className="groupme-link" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </div>
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
