import type { Env } from './env'

interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

// A missed or failed confirmation email should never block the RSVP action
// that triggered it, so failures are logged rather than thrown. Uses Resend
// (https://resend.com) since it's a plain HTTPS API with no SDK/runtime
// dependency needed from a Workers-compatible fetch.
export async function sendEmail(env: Env, input: SendEmailInput): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error('sendEmail skipped: RESEND_API_KEY is not configured')
    return
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `Behrend Club Volleyball <${env.EVENTS_EMAIL_FROM || 'events@behrendclubvolleyball.org'}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })
    if (!res.ok) {
      console.error('sendEmail failed', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.error('sendEmail threw', e)
  }
}
