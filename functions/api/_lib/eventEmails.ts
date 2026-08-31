import type { Env } from './env'
import { sendEmail } from './email'

interface EventInfo {
  title: string
  start_time: string
  location_name: string | null
}

const whenFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function formatWhen(event: EventInfo): string {
  // start_time is stored as a plain "YYYY-MM-DDTHH:MM" wall-clock string with
  // no timezone, so this parses the same way the public Events page does.
  return whenFormatter.format(new Date(event.start_time))
}

function eventDetailsLines(event: EventInfo): string[] {
  const lines = [`When: ${formatWhen(event)}`]
  if (event.location_name) lines.push(`Where: ${event.location_name}`)
  return lines
}

// Builds the self-serve cancel link emailed to a guest signup (no account
// needed) — the token is the only credential, since we no longer keep
// anything in the guest's browser to prove the signup is theirs.
export function buildCancelUrl(env: Env, eventId: number, signupId: number, cancelToken: string): string {
  return `${env.PUBLIC_URL}/events/${eventId}/cancel/${signupId}?token=${encodeURIComponent(cancelToken)}`
}

function wrapHtml(heading: string, bodyLines: string[], detailLines: string[], cancel?: { url: string; label: string }): string {
  const details = detailLines.map((l) => `<p style="margin:0 0 4px">${l}</p>`).join('')
  const body = bodyLines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join('')
  const cancelHtml = cancel
    ? `<p style="margin:16px 0 0"><a href="${cancel.url}" style="color:#1a56db">${cancel.label}</a></p>`
    : ''
  return `
    <div style="font-family:sans-serif;color:#1a1a1a;max-width:480px">
      <h2 style="margin:0 0 16px">${heading}</h2>
      ${body}
      <div style="margin:16px 0;padding:12px 16px;background:#f4f4f4;border-radius:8px">${details}</div>
      ${cancelHtml}
      <p style="margin:16px 0 0;color:#666;font-size:13px">Behrend Club Volleyball</p>
    </div>
  `.trim()
}

function wrapText(heading: string, bodyLines: string[], detailLines: string[], cancel?: { url: string; label: string }): string {
  const lines = [heading, '', ...bodyLines, '', ...detailLines]
  if (cancel) lines.push('', `${cancel.label}: ${cancel.url}`)
  lines.push('', 'Behrend Club Volleyball')
  return lines.join('\n')
}

// Sent immediately when a guest signs up for an event that does NOT require
// admin approval — the signup is confirmed as soon as it's submitted.
export function sendRsvpConfirmationEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `You're confirmed for ${event.title}. See you there!`]
  const cancel = { url: cancelUrl, label: 'Cancel your RSVP' }
  return sendEmail(env, {
    to,
    subject: `You're confirmed: ${event.title}`,
    html: wrapHtml("You're confirmed", body, details, cancel),
    text: wrapText("You're confirmed", body, details, cancel),
  })
}

// Sent immediately when a guest requests attendance for a gated event — the
// request still needs an admin's approval before it's a confirmed spot.
export function sendRsvpRequestEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [
    `Hi ${name},`,
    `We received your request to attend ${event.title}. This event requires admin approval, so ` +
      `your spot isn't confirmed yet — we'll email you as soon as it's reviewed.`,
  ]
  const cancel = { url: cancelUrl, label: 'Withdraw your request' }
  return sendEmail(env, {
    to,
    subject: `Request received: ${event.title}`,
    html: wrapHtml('Request received', body, details, cancel),
    text: wrapText('Request received', body, details, cancel),
  })
}

// Sent when an admin approves a pending request on a gated event.
export function sendRsvpApprovedEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `Your request to attend ${event.title} has been approved. See you there!`]
  const cancel = { url: cancelUrl, label: 'Cancel your RSVP' }
  return sendEmail(env, {
    to,
    subject: `You're approved: ${event.title}`,
    html: wrapHtml("You're approved", body, details, cancel),
    text: wrapText("You're approved", body, details, cancel),
  })
}

// Sent when a signup is cancelled/withdrawn (self-serve via the emailed
// cancel link) so the guest has confirmation it went through.
export function sendCancellationConfirmationEmail(env: Env, to: string, name: string, event: EventInfo) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `You're no longer signed up for ${event.title}.`]
  return sendEmail(env, {
    to,
    subject: `Cancelled: ${event.title}`,
    html: wrapHtml('Cancelled', body, details),
    text: wrapText('Cancelled', body, details),
  })
}
