import { useEffect, useState } from 'react'
import { getLoginProviders } from '../../lib/api'
import { signInOptions, DEFAULT_PROVIDERS } from '../../lib/signInOptions'
import OAuthButton from '../../components/OAuthButton'

function AdminSignIn() {
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS)

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
        {opts.map((opt) => (
          <OAuthButton key={opt.id} option={opt} />
        ))}
        {opts.length === 0 && <p>Sign-in is temporarily disabled.</p>}
      </div>
    </div>
  )
}

export default AdminSignIn
