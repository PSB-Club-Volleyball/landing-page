import type { Env } from './env'

interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  // Per-recipient unsubscribe/opt-out URL (e.g. the emailed cancel link).
  // When set it's offered alongside the mailto: option in the
  // List-Unsubscribe header; omit for mail that has no such link.
  unsubscribeUrl?: string
}

// A missed or failed confirmation email should never block the RSVP action
// that triggered it, so failures are logged rather than thrown. Uses Resend
// (https://resend.com) since it's a plain HTTPS API with no SDK/runtime
// dependency needed from a Workers-compatible fetch.
export async function sendEmail(env: Env, input: SendEmailInput): Promise<void> {
  // Trimmed defensively: a secret pasted via `wrangler pages secret put`
  // (or the dashboard) can pick up a trailing newline/space, which makes
  // the Authorization header invalid and fails the fetch below silently
  // (before Resend ever sees the request) rather than as a clean 401.
  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.error('sendEmail skipped: RESEND_API_KEY is not configured')
    return
  }

  const fromAddress = (env.EVENTS_EMAIL_FROM || 'events@behrendclubvolleyball.org').trim()
  const replyTo = (env.EVENTS_EMAIL_REPLY_TO || fromAddress).trim()

  // List-Unsubscribe (RFC 2369): mailboxes treat mail without an unsubscribe
  // affordance as more spam-like, and Gmail/Yahoo bulk-sender guidance calls
  // for the header. One-click (List-Unsubscribe-Post, RFC 8058) is only
  // required above ~5k messages/day and needs a POST endpoint that records a
  // suppression — not built yet — so this stays a mailto: (+ the cancel link
  // when there is one), which fully covers this club's volume.
  const unsubMailto = `mailto:${fromAddress}?subject=unsubscribe`
  const listUnsubscribe = input.unsubscribeUrl
    ? `<${input.unsubscribeUrl}>, <${unsubMailto}>`
    : `<${unsubMailto}>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `Behrend Club Volleyball <${fromAddress}>`,
        to: input.to,
        reply_to: replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: {
          'List-Unsubscribe': listUnsubscribe,
        },
      }),
    })
    if (!res.ok) {
      console.error('sendEmail failed', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.error('sendEmail threw', e)
  }
}
