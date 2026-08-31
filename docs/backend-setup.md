# Backend setup (D1 + R2 + OAuth)

This repo has a Cloudflare Pages Functions backend under `functions/`,
backed by a D1 database (roster, board, events, media, users, sessions,
audit log) and an R2 bucket for photos/video. Sign-in supports Google and
Microsoft.

## 1. Install the CLI and log in

```
npm install
npx wrangler login
```

## 2. Create the D1 database — done

The database exists (`behrend-club-volleyball`, id `eca8d67f-5fef-44c1-9f2c-6df039abfbb8`)
and `wrangler.toml` already has it. What's left is applying the schema:

```
npm run db:migrate:remote
```

(`npm run db:migrate:local` runs the same migration against a local sqlite
file for `wrangler pages dev`; that one doesn't touch the real database.)
This step needs to run from a machine that can actually reach the Cloudflare
API — it can't be run from a sandboxed coding session with restricted
network egress.

## 3. Create the R2 bucket — done

The bucket exists as `behrend-club-volleyball` (not `-media` — that's just
what got typed when creating it) and `wrangler.toml`'s `bucket_name` matches.
Nothing left to do here.

## 4. Register the Google OAuth app

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an OAuth client ID, application type **Web application**.
3. Authorized redirect URI: `https://behrendclubvolleyball.org/api/auth/google/callback`
   (add a second one for any preview/staging domain you use).
4. Copy the Client ID and Client Secret.

## 5. Register the Microsoft (Entra ID) app

1. [Entra admin center](https://entra.microsoft.com/) → Identity → Applications
   → App registrations → New registration.
2. Supported account types: **Accounts in any organizational directory and
   personal Microsoft accounts** (matches Google's "anyone with an account"
   behavior; the callback code already assumes this).
3. Redirect URI: platform **Web**,
   `https://behrendclubvolleyball.org/api/auth/microsoft/callback`
   (add a second one for any preview/staging domain you use).
4. Copy the Application (client) ID from the app's Overview page.
5. Certificates & secrets → New client secret → copy the secret **value**
   (not the secret ID) immediately, since it's hidden after you leave the page.

## 6. Set the secrets

Non-secret config (`PUBLIC_URL`, `ADMIN_BOOTSTRAP_EMAILS`, `EVENTS_EMAIL_FROM`)
already lives in `wrangler.toml`. The actual OAuth credentials are secrets —
never commit them:

```
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
npx wrangler pages secret put MICROSOFT_CLIENT_ID
npx wrangler pages secret put MICROSOFT_CLIENT_SECRET
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in
the same values there instead (that file is gitignored).

### RSVP emails (Resend)

RSVP confirmation, RSVP request, and RSVP approval emails
(`functions/api/_lib/email.ts` / `eventEmails.ts`) are sent through
[Resend](https://resend.com)'s HTTP API, `from` the address in
`EVENTS_EMAIL_FROM` (`events@behrendclubvolleyball.org`).

1. In the Resend dashboard, verify the `behrendclubvolleyball.org` domain
   (adds the DNS records Resend gives you) so it can send as
   `events@behrendclubvolleyball.org`.
2. Create an API key and set it as a secret:
   ```
   npx wrangler pages secret put RESEND_API_KEY
   ```
   For local dev, put the same value in `.dev.vars` as `RESEND_API_KEY=...`.

If `RESEND_API_KEY` isn't set, RSVP/signup actions still work — the email
send is skipped and logged, never blocking the request.

## 7. Check `ADMIN_BOOTSTRAP_EMAILS`

`wrangler.toml` has:

```toml
ADMIN_BOOTSTRAP_EMAILS = "ethanluh@gmail.com"
```

The first time any of these emails signs in (with either Google or
Microsoft), their account is auto-approved — this is what breaks the
chicken-and-egg problem of "no one is approved yet to approve anyone."
Everyone else who signs in afterward lands as `pending` until an approved
user approves them from the Users tab in `/admin`. Add more emails
(comma-separated) if more than one person should start out pre-approved.

## 8. Deploy

The existing GitHub Actions (`deploy.yml` / `deploy-preview.yml`) already run
`wrangler pages deploy`, which picks up `wrangler.toml`'s bindings and vars
automatically. Nothing to change there — once the database/bucket/secrets
above exist, the next push just works.

## Local dev

```
npm run pages:dev
```

Builds the SPA and serves it through `wrangler pages dev`, so
`functions/api/**` runs against a local D1/R2 emulation
(`npm run db:migrate:local` seeds the schema into it). OAuth won't complete
locally unless `.dev.vars` has real credentials and the provider's redirect
URI allow-list includes `http://localhost:8788/api/auth/<provider>/callback`
(`google` or `microsoft`).
