// Human-readable copy for the ?error=<code> values the OAuth callback
// (functions/api/auth/[provider]/callback.ts) can append to its post-sign-in
// redirect. Kept in one place so both the admin sign-in screen and the public
// event page render the same wording.
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'That sign-in link expired or was already used. Try again.',
  token_exchange_failed: "Couldn't complete sign-in with that provider. Try again.",
  profile_fetch_failed: "Couldn't read your account details from that provider. Try again.",
  missing_profile_fields: 'That account is missing an email address, which we need to sign you in.',
  account_exists:
    'An account with that email already exists under a different sign-in provider. Use the provider you signed up with.',
}

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null
  return AUTH_ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.'
}
