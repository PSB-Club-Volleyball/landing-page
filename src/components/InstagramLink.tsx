import InstagramIcon from './InstagramIcon'
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../constants'

function InstagramLink({
  label = INSTAGRAM_HANDLE,
  onClick,
}: {
  label?: string
  onClick?: () => void
}) {
  return (
    <a
      className="instagram-link"
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
    >
      <InstagramIcon />
      <span>{label}</span>
    </a>
  )
}

export default InstagramLink
