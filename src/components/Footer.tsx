import InstagramIcon from './InstagramIcon'
import {
  CONTACT_EMAIL,
  GROUPME_URL,
  INSTAGRAM_HANDLE,
  INSTAGRAM_URL,
} from '../constants'

function Footer() {
  return (
    <footer>
      <span>Behrend Club Volleyball</span>
      <a
        className="instagram-link"
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noreferrer"
      >
        <InstagramIcon />
        {INSTAGRAM_HANDLE}
      </a>
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
