# Backend setup (D1 + R2 + OAuth)

This repo has a Cloudflare Pages Functions backend under `functions/`,
backed by a D1 database (roster, board, events, media, users, sessions,
audit log) and an R2 bucket for photos/video. Sign-in is Google-only.

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

## 5. Set the secrets

Non-secret config (`PUBLIC_URL`, `ADMIN_BOOTSTRAP_EMAILS`) already lives in
`wrangler.toml`. The actual OAuth credentials are secrets — never commit them:

```
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in
the same two values there instead (that file is gitignored).

## 6. Check `ADMIN_BOOTSTRAP_EMAILS`

`wrangler.toml` has:

```toml
ADMIN_BOOTSTRAP_EMAILS = "ethanluh@agentmade.ai"
```

The first time any of these emails signs in with Google, their account is
auto-approved — this is what breaks the
chicken-and-egg problem of "no one is approved yet to approve anyone."
Everyone else who signs in afterward lands as `pending` until an approved
user approves them from the Users tab in `/admin`. Add more emails
(comma-separated) if more than one person should start out pre-approved.

## 7. Deploy

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
locally unless `.dev.vars` has real credentials and Google's redirect URI
allow-list includes `http://localhost:8788/api/auth/google/callback`.
