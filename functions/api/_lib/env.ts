export interface Env {
  DB: D1Database
  MEDIA_BUCKET: R2Bucket

  PUBLIC_URL: string
  ADMIN_BOOTSTRAP_EMAILS: string

  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string

  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string
}
