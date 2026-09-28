import { Link } from 'react-router-dom'

// Catch-all for URLs that match no route, so a bad link shows something
// instead of an empty page between the navbar and footer.
function NotFound() {
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <h1>Page not found</h1>
        <p className="placeholder-note">
          This page doesn&rsquo;t exist, or the link is wrong.{' '}
          <Link className="inline-link" to="/">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  )
}

export default NotFound
