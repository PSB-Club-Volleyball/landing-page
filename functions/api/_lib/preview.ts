// Ephemeral PR-preview deploys get a fresh random `*.pages.dev` hostname that
// can't be pre-registered as an OAuth redirect URI, so Google/Microsoft sign-in
// can never complete there (see docs/backend-setup.md). Auth endpoints use this
// to refuse the flow outright instead of bouncing the user to a broken callback.
//
// No `*.pages.dev` host is exempt: the redirect URI is always built from
// env.PUBLIC_URL (a custom domain) while the host-only state cookie is set on
// the request host, so even a project's own `<project>.pages.dev` alias ends
// at invalid_state.
export function isPreviewDeployment(request: Request): boolean {
  return new URL(request.url).hostname.endsWith('.pages.dev')
}
