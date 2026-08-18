# Behrend Club Volleyball — Landing Page

Public landing page for Penn State Behrend Club Volleyball. React + TypeScript + Vite, deployed to Cloudflare Pages at behrendclubvolleyball.org.

## Develop

```
npm install
npm run dev
```

## Build

```
npm run build
```

## Backend

Roster, board, events, and media are served from a Cloudflare D1 database
and R2 bucket via Pages Functions in `functions/`, with a Google/Microsoft-
gated admin console at `/admin`. See [`docs/backend-setup.md`](docs/backend-setup.md)
for provisioning the database, bucket, and OAuth apps.
