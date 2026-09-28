import { useEffect, useState } from 'react'
import { getLoginProviders } from '../../lib/api'
import { signInOptions, DEFAULT_PROVIDERS, isPreviewHost } from '../../lib/signInOptions'
import OAuthButton from '../../components/OAuthButton'
import { authErrorMessage } from '../../lib/authErrors'

function AdminSignIn() {
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS)
  const [providersError, setProvidersError] = useState<string | null>(null)
  const authError = authErrorMessage(new URLSearchParams(window.location.search).get('error'))

  // On failure the buttons fall back to the optimistic defaults, which may
  // include a provider that's switched off — say so rather than pretend.
  useEffect(() => {
    getLoginProviders()
      .then(setProviders)
      .catch((e: Error) => {
        console.error('Failed to load sign-in providers', e)
        setProvidersError(`Couldn't check which sign-in options are available (${e.message}); some may not work.`)
      })
  }, [])

  const opts = signInOptions(providers)

  return (
    <div className="admin-lock-wrap">
      <div className="admin-lock-card">
        <h1>Sign in to manage content</h1>
        <p>Only approved accounts can edit the roster, board, events, or media.</p>
        {authError && <p className="admin-error" role="alert">{authError}</p>}
        {providersError && <p className="admin-error">{providersError}</p>}
        {opts.map((opt) => (
          <OAuthButton key={opt.id} option={opt} />
        ))}
        {opts.length === 0 && (
          <p>
            {isPreviewHost()
              ? 'Sign-in is disabled on preview deployments. Use the production site to sign in.'
              : 'Sign-in is temporarily disabled.'}
          </p>
        )}
      </div>
    </div>
  )
}

export default AdminSignIn
