import InstagramIcon from './InstagramIcon'
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../constants'

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
      <span>{CONTACT_EMAIL}</span>
    </footer>
  )
}

export default Footer
