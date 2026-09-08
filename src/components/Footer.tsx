import { Link } from 'react-router-dom'
import InstagramLink from './InstagramLink'
import { CONTACT_EMAIL, GROUPME_URL, WAIVER_URL } from '../constants'

function Footer() {
  return (
    <footer>
      <span>Behrend Club Volleyball</span>
      <InstagramLink />
      <a
        className="groupme-link"
        href={GROUPME_URL}
        target="_blank"
        rel="noreferrer"
      >
        Join our GroupMe
      </a>
      <a className="groupme-link" href={WAIVER_URL} target="_blank" rel="noreferrer">
        Liability waiver
      </a>
      <Link className="groupme-link" to="/privacy">
        Privacy policy
      </Link>
      <Link className="groupme-link" to="/terms">
        Terms of use
      </Link>
      <span>{CONTACT_EMAIL}</span>
    </footer>
  )
}

export default Footer
