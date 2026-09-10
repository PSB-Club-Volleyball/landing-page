// Which OAuth providers currently accept new sign-ins, from
// GET /api/auth/providers. `microsoft` is the PSU-tenant registration;
// `microsoft_other` is a separate registration for any non-PSU Microsoft
// account (see functions/api/auth/_lib/providers.ts).
export interface LoginProviders {
  google: boolean
  microsoft: boolean
  microsoft_other: boolean
}

// Optimistic default for surfaces that render before GET /api/auth/providers
// resolves (Navbar, admin lock screen) — assume the always-on providers are
// available so the sign-in control doesn't flicker. microsoft_other is
// opt-in, so it stays false until the fetch confirms it. The signup modal
// deliberately starts all-false instead (conservative: no prompt until known).
export const DEFAULT_PROVIDERS: LoginProviders = { google: true, microsoft: true, microsoft_other: false }

export interface SignInOption {
  // The provider path segment for /api/auth/<id>/start.
  id: 'google' | 'microsoft' | 'microsoft-other'
  label: string
  href: (redirect?: string) => string
}

// The enabled providers in display order. Components render the button chrome
// (icons, layout); this is the single source for order, labels, and URLs so
// the three sign-in surfaces (Navbar, AdminSignIn, SignupModal) stay in sync.
export function signInOptions(providers: LoginProviders): SignInOption[] {
  const all: Array<SignInOption & { enabled: boolean }> = [
    {
      id: 'google',
      label: 'Continue with Google',
      enabled: providers.google,
      href: (r) => start('google', r),
    },
    {
      id: 'microsoft',
      label: 'Continue with Microsoft',
      enabled: providers.microsoft,
      href: (r) => start('microsoft', r),
    },
    {
      id: 'microsoft-other',
      label: 'Continue with a non-PSU Microsoft account',
      enabled: providers.microsoft_other,
      href: (r) => start('microsoft-other', r),
    },
  ]
  return all.filter((o) => o.enabled).map(({ enabled: _enabled, ...o }) => o)
}

function start(id: string, redirect?: string): string {
  const base = `/api/auth/${id}/start`
  return redirect ? `${base}?redirect=${encodeURIComponent(redirect)}` : base
}
