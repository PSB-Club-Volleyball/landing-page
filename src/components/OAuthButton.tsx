import type { SignInOption } from '../lib/signInOptions'

// The `.oauth-btn` sign-in link used on the admin lock screen and in the event
// signup modal. Navbar renders its own plain-text variant.
function OAuthButton({ option, redirect }: { option: SignInOption; redirect?: string }) {
  return (
    <a className="oauth-btn" href={option.href(redirect)}>
      {option.id === 'google' ? (
        <span className="oauth-g">G</span>
      ) : (
        <span className="oauth-ms">
          <span />
          <span />
          <span />
          <span />
        </span>
      )}
      {option.label}
    </a>
  )
}

export default OAuthButton
