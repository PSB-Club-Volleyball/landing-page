# Backend setup (D1 + R2 + OAuth)

This repo now has a Cloudflare Pages Functions backend under `functions/`,
backed by a D1 database (roster, board, events, media, users, sessions,
audit log) and an R2 bucket for photos/video. None of this is provisioned
yet — the steps below create the real Cloudflare resources and OAuth apps,
which can't be done from a coding session since they need your accounts.

## 1. Install the CLI and log in

```
npm install
npx wrangler login
```

## 2. Create the D1 database

```
npx wrangler d1 create behrend-club-volleyball
```

This prints a `database_id`. Paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "behrend-club-volleyball"
database_id = "PASTE_IT_HERE"
```

Then apply the schema:

```
npm run db:migrate:remote
```

(`npm run db:migrate:local` runs the same migration against a local sqlite
file for `wrangler pages dev`.)

## 3. Create the R2 bucket

```
npx wrangler r2 bucket create behrend-club-volleyball-media
```

The binding name (`MEDIA_BUCKET`) and bucket name in `wrangler.toml` already
match this — no further edits needed there.

## 4. Register the OAuth apps

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an OAuth client ID, application type **Web application**.
3. Authorized redirect URI: `https://behrendclubvolleyball.org/api/auth/google/callback`
   (add a second one for any preview/staging domain you use).
4. Copy the Client ID and Client Secret.

### Microsoft

1. [Azure Portal](https://portal.azure.com/) → App registrations → New registration.
2. Supported account types: "Accounts in any organizational directory and
   personal Microsoft accounts" (or narrower, if you only want work/school
   accounts — adjust `MICROSOFT_TENANT` in `wrangler.toml` to match).
3. Redirect URI (Web): `https://behrendclubvolleyball.org/api/auth/microsoft/callback`
4. Under Certificates & secrets, create a new client secret.
5. Copy the Application (client) ID and the secret **value** (not the secret ID).

## 5. Set the secrets

Non-secret config (`PUBLIC_URL`, `ADMIN_BOOTSTRAP_EMAILS`, `MICROSOFT_TENANT`)
already lives in `wrangler.toml`. The actual OAuth credentials are secrets —
never commit them:

```
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
npx wrangler pages secret put MICROSOFT_CLIENT_ID
npx wrangler pages secret put MICROSOFT_CLIENT_SECRET
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in
the same four values there instead (that file is gitignored).

## 6. Check `ADMIN_BOOTSTRAP_EMAILS`

`wrangler.toml` has:

```toml
ADMIN_BOOTSTRAP_EMAILS = "ethanluh@agentmade.ai"
```

The first time any of these emails signs in (Google or Microsoft, whichever
they use), their account is auto-approved — this is what breaks the
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
locally unless `.dev.vars` has real credentials and the provider's redirect
URI allow-list includes `http://localhost:8788/api/auth/<provider>/callback`.
