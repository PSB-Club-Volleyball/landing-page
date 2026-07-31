import InstagramIcon from './InstagramIcon'
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../constants'

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Coming soon</p>
      <h1>{title}</h1>
      <p>{note}</p>
      <a
        className="instagram-link"
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noreferrer"
      >
        <InstagramIcon />
        Follow {INSTAGRAM_HANDLE} for updates
      </a>
    </section>
  )
}

export default Placeholder
