export interface Env {
  DB: D1Database
  MEDIA_BUCKET: R2Bucket

  PUBLIC_URL: string
  ADMIN_BOOTSTRAP_EMAILS: string

  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string

  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string

  // RSVP confirmation/request/approval emails (see functions/api/_lib/email.ts).
  // EVENTS_EMAIL_FROM is non-secret config; RESEND_API_KEY is a secret.
  // EVENTS_EMAIL_REPLY_TO is optional non-secret config — a monitored inbox
  // replies should go to; falls back to EVENTS_EMAIL_FROM when unset.
  EVENTS_EMAIL_FROM: string
  EVENTS_EMAIL_REPLY_TO?: string
  RESEND_API_KEY: string
}
