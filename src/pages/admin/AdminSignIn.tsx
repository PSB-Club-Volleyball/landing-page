import { useEffect, useState } from 'react'
import { getLoginProviders } from '../../lib/api'
import { signInOptions, DEFAULT_PROVIDERS } from '../../lib/signInOptions'
import OAuthButton from '../../components/OAuthButton'
import { authErrorMessage } from '../../lib/authErrors'

function AdminSignIn() {
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS)
  const authError = authErrorMessage(new URLSearchParams(window.location.search).get('error'))

  useEffect(() => {
    getLoginProviders()
      .then(setProviders)
      .catch(() => {})
  }, [])

  const opts = signInOptions(providers)

  return (
    <div className="admin-lock-wrap">
      <div className="admin-lock-card">
        <h1>Sign in to manage content</h1>
        <p>Only approved accounts can edit the roster, board, events, or media.</p>
        {authError && <p className="admin-error" role="alert">{authError}</p>}
        {opts.map((opt) => (
          <OAuthButton key={opt.id} option={opt} />
        ))}
        {opts.length === 0 && <p>Sign-in is temporarily disabled.</p>}
      </div>
    </div>
  )
}

export default AdminSignIn
