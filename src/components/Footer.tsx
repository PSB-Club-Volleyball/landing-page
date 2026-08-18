import InstagramLink from './InstagramLink'
import { CONTACT_EMAIL, GROUPME_URL } from '../constants'

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
      <span>{CONTACT_EMAIL}</span>
    </footer>
  )
}

export default Footer
