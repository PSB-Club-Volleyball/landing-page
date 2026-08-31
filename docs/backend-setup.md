# Backend setup (D1 + R2 + OAuth)

This repo has a Cloudflare Pages Functions backend under `functions/`,
backed by a D1 database (roster, board, events, media, users, sessions,
audit log) and an R2 bucket for photos/video. Sign-in supports Google and
Microsoft.

There are three separate backends, each with its own D1 database and R2
bucket so they never share data:

| Environment | Site                                  | Pages project                    | Config file            | D1 database                     | R2 bucket                        |
|-------------|----------------------------------------|-----------------------------------|-------------------------|----------------------------------|-----------------------------------|
| Production  | `behrendclubvolleyball.org`            | `behrend-club-volleyball`         | `wrangler.toml` (`env.production`) | `behrend-club-volleyball`        | `behrend-club-volleyball`         |
| Staging     | `staging.behrendclubvolleyball.org`    | `behrend-club-volleyball-staging` | `wrangler.staging.toml` | `behrend-club-volleyball-staging` | `behrend-club-volleyball-staging` |
| Preview (ephemeral PR deploys) | `*.behrend-club-volleyball.pages.dev` | `behrend-club-volleyball` (preview env) | `wrangler.toml` (`env.preview`) | `behrend-club-volleyball-preview` | `behrend-club-volleyball-preview` |

Cloudflare Pages only recognizes two environments per project —
`production` and `preview`. Every push to `main` deploys to `production`;
every other branch (including PRs) is a `preview` deployment and
automatically picks up the `env.preview` bindings in `wrangler.toml`, so PR
previews never touch production data. Staging needs its own persistent URL
and its own isolated backend, so it lives in a **second Pages project**
(`behrend-club-volleyball-staging`) whose production branch is `staging`,
configured by `wrangler.staging.toml`.

## 1. Install the CLI and log in

```
npm install
npx wrangler login
```

## 2. D1 databases — done

All three databases already exist and `wrangler.toml` / `wrangler.staging.toml`
have their IDs:

- `behrend-club-volleyball` (production), id `eca8d67f-5fef-44c1-9f2c-6df039abfbb8`
- `behrend-club-volleyball-staging`, id `a6911b14-456a-4f2c-953c-bf9bfaf48ddd`
- `behrend-club-volleyball-preview`, id `e2b27718-eb68-40d2-a94e-9909066be0b5`

What's left is applying the schema to each:

```
npm run db:migrate:remote    # production
npm run db:migrate:staging   # staging
npm run db:migrate:preview   # ephemeral PR-preview backend
```

(`npm run db:migrate:local` runs the same migrations against a local sqlite
file for `wrangler pages dev`; that one doesn't touch any real database.)
This step needs to run from a machine that can actually reach the Cloudflare
API — it can't be run from a sandboxed coding session with restricted
network egress.

## 3. R2 buckets — done

All three buckets exist and the config files already reference them:
`behrend-club-volleyball` (production), `behrend-club-volleyball-staging`,
and `behrend-club-volleyball-preview`. Nothing left to do here.

## 4. Create the staging Pages project and attach its domain

The `behrend-club-volleyball` Pages project already exists (production +
preview deploys). Staging needs its own project so it can have its own
persistent custom domain and production-branch semantics:

```
npx wrangler pages project create behrend-club-volleyball-staging --production-branch=staging
```

Then in the Cloudflare dashboard → Pages → `behrend-club-volleyball-staging`
→ **Custom domains**, add `staging.behrendclubvolleyball.org` (this adds the
DNS record automatically if the zone is on the same Cloudflare account).

Pushing to the `staging` branch (see `.github/workflows/deploy-staging.yml`)
now deploys to this project.

## 5. Register the Google OAuth app

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an OAuth client ID, application type **Web application**.
3. Authorized redirect URIs — add one per environment you want working sign-in on:
   - `https://behrendclubvolleyball.org/api/auth/google/callback` (production)
   - `https://staging.behrendclubvolleyball.org/api/auth/google/callback` (staging)
   - `http://localhost:8788/api/auth/google/callback` (local dev)
4. Copy the Client ID and Client Secret.

(PR preview deploys get a per-branch `*.pages.dev` URL that can't be
pre-registered as a fixed redirect URI, so Google/Microsoft sign-in won't
complete on preview deploys — everything else works against the isolated
preview backend.)

## 6. Register the Microsoft (Entra ID) app

1. [Entra admin center](https://entra.microsoft.com/) → Identity → Applications
   → App registrations → New registration.
2. Supported account types: **Accounts in any organizational directory and
   personal Microsoft accounts** (matches Google's "anyone with an account"
   behavior; the callback code already assumes this).
3. Redirect URI: platform **Web**, add one per environment:
   - `https://behrendclubvolleyball.org/api/auth/microsoft/callback`
   - `https://staging.behrendclubvolleyball.org/api/auth/microsoft/callback`
   - `http://localhost:8788/api/auth/microsoft/callback` (local dev)
4. Copy the Application (client) ID from the app's Overview page.
5. Certificates & secrets → New client secret → copy the secret **value**
   (not the secret ID) immediately, since it's hidden after you leave the page.

## 7. Set the secrets

Non-secret config (`PUBLIC_URL`, `ADMIN_BOOTSTRAP_EMAILS`, `EVENTS_EMAIL_FROM`)
already lives in `wrangler.toml` / `wrangler.staging.toml`. The actual OAuth
credentials are secrets — never commit them, and set them separately per
environment:

`wrangler pages secret put` doesn't read `wrangler.toml` at all — it just needs
`--project-name` (which Pages project) and `--env` (`production` or `preview`;
defaults to `production`), so no `--config` flag is needed or supported here:

```
# Production
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name=behrend-club-volleyball --env production
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=behrend-club-volleyball --env production
npx wrangler pages secret put MICROSOFT_CLIENT_ID --project-name=behrend-club-volleyball --env production
npx wrangler pages secret put MICROSOFT_CLIENT_SECRET --project-name=behrend-club-volleyball --env production

# Staging (separate Pages project)
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name=behrend-club-volleyball-staging --env production
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=behrend-club-volleyball-staging --env production
npx wrangler pages secret put MICROSOFT_CLIENT_ID --project-name=behrend-club-volleyball-staging --env production
npx wrangler pages secret put MICROSOFT_CLIENT_SECRET --project-name=behrend-club-volleyball-staging --env production
```

PR previews use the shared `preview` environment; sign-in won't complete
there (see the note in step 5), so preview secrets are optional.

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
2. Create an API key and set it as a secret, per environment:
   ```
   npx wrangler pages secret put RESEND_API_KEY --project-name=behrend-club-volleyball --env production
   npx wrangler pages secret put RESEND_API_KEY --project-name=behrend-club-volleyball-staging --env production
   ```
   PR previews use the shared `preview` environment; the API key there is
   optional (see the fallback below). For local dev, put the same value in
   `.dev.vars` as `RESEND_API_KEY=...`.

If `RESEND_API_KEY` isn't set, RSVP/signup actions still work — the email
send is skipped and logged, never blocking the request.

## 8. Check `ADMIN_BOOTSTRAP_EMAILS`

`wrangler.toml` has:

```toml
[env.production.vars]
ADMIN_BOOTSTRAP_EMAILS = "ethanluh@gmail.com"
```

The first time any of these emails signs in (with either Google or
Microsoft), their account is auto-approved — this is what breaks the
chicken-and-egg problem of "no one is approved yet to approve anyone."
Everyone else who signs in afterward lands as `pending` until an approved
user approves them from the Users tab in `/admin`. Add more emails
(comma-separated) if more than one person should start out pre-approved.
`wrangler.staging.toml` has its own copy of this var for the staging
backend.

## 9. Deploy

- `main` → `.github/workflows/deploy.yml` deploys production.
- `staging` → `.github/workflows/deploy-staging.yml` deploys the staging
  Pages project.
- Any PR → `.github/workflows/deploy-preview.yml` deploys an ephemeral
  preview build against the shared preview backend and comments the URL on
  the PR.

All three already run `wrangler pages deploy`. `main`/PR deploys read
`wrangler.toml` directly (Pages resolves `env.production` vs `env.preview`
from the branch). The staging workflow can't pass `--config wrangler.staging.toml`
to `wrangler pages deploy` — Pages rejects a custom config path — so it stages
a copy of `wrangler.staging.toml` as `wrangler.toml` in a scratch directory and
runs wrangler from there instead. Nothing to change there — once the
databases/buckets/secrets above exist, pushes just work.

## Local dev

```
npm run pages:dev
```

Builds the SPA and serves it through `wrangler pages dev --env preview`, so
`functions/api/**` runs against a local D1/R2 emulation seeded from the
`preview` bindings (`npm run db:migrate:local` seeds the schema into it).
OAuth won't complete locally unless `.dev.vars` has real credentials and the
provider's redirect URI allow-list includes
`http://localhost:8788/api/auth/<provider>/callback` (`google` or
`microsoft`).
