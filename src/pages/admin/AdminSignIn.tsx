import { useEffect, useState } from 'react'
import { getLoginProviders } from '../../lib/api'

function AdminSignIn() {
  const [providers, setProviders] = useState({ google: true, microsoft: true })

  useEffect(() => {
    getLoginProviders()
      .then(setProviders)
      .catch(() => {})
  }, [])

  return (
    <div className="admin-lock-wrap">
      <div className="admin-lock-card">
        <h1>Sign in to manage content</h1>
        <p>Only approved accounts can edit the roster, board, events, or media.</p>
        {providers.google && (
          <a className="oauth-btn" href="/api/auth/google/start">
            <span className="oauth-g">G</span> Continue with Google
          </a>
        )}
        {providers.microsoft && (
          <a className="oauth-btn" href="/api/auth/microsoft/start">
            <span className="oauth-ms">
              <span />
              <span />
              <span />
              <span />
            </span>
            Continue with Microsoft
          </a>
        )}
        {!providers.google && !providers.microsoft && <p>Sign-in is temporarily disabled.</p>}
      </div>
    </div>
  )
}

export default AdminSignIn
