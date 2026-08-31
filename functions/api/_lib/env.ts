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
  EVENTS_EMAIL_FROM: string
  RESEND_API_KEY: string
}
