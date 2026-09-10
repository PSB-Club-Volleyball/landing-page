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

// Every email about an actual (not yet cancelled/denied) spot at an event
// links the liability waiver — same file the site links from its footer
// and the signup form (see WAIVER_URL in src/constants.ts) — so "did I ever
// get the waiver" isn't something a guest has to go dig for later.
function buildWaiverLink(env: Env): { url: string; label: string } {
  return { url: `${env.PUBLIC_URL}/liability-waiver.pdf`, label: 'Download the liability waiver' }
}

// A full table-based HTML document rather than a bare styled <div>. Outlook's
// desktop clients (Windows, "classic" Outlook) render mail with Word's engine
// rather than a browser one — it needs a complete <html>/<head>/<body>
// document, ignores CSS margin/max-width/border-radius on <div>s, and
// sometimes drops the generic "sans-serif" font — so the layout here uses
// nested <table>s (with an MSO-only conditional wrapper to pin the content
// width, since Outlook ignores max-width) and an explicit font stack. This
// degrades gracefully everywhere else (Gmail, Apple Mail, etc. all render
// tables and divs the same way for a layout this simple).
function wrapHtml(heading: string, bodyLines: string[], detailLines: string[], links: { url: string; label: string }[] = []): string {
  const FONT = 'Arial, Helvetica, sans-serif'
  const details = detailLines
    .map((l) => `<p style="margin:0 0 4px;font-family:${FONT};font-size:14px;line-height:20px;color:#1a1a1a;">${l}</p>`)
    .join('')
  const body = bodyLines
    .map((l) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:22px;color:#1a1a1a;">${l}</p>`)
    .join('')
  const linksHtml = links
    .map(
      (l) =>
        `<p style="margin:16px 0 0;font-family:${FONT};font-size:14px;"><a href="${l.url}" style="color:#1a56db;">${l.label}</a></p>`
    )
    .join('')
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:24px 16px;">
<!--[if mso]><table role="presentation" width="480" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#ffffff;">
<tr><td style="padding:24px;font-family:${FONT};color:#1a1a1a;">
<h2 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:26px;">${heading}</h2>
${body}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4" style="margin:16px 0;background-color:#f4f4f4;">
<tr><td style="padding:12px 16px;">${details}</td></tr>
</table>
${linksHtml}
<p style="margin:16px 0 0;font-family:${FONT};color:#666666;font-size:13px;">Behrend Club Volleyball</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`
}

function wrapText(heading: string, bodyLines: string[], detailLines: string[], links: { url: string; label: string }[] = []): string {
  const lines = [heading, '', ...bodyLines, '', ...detailLines]
  for (const l of links) lines.push('', `${l.label}: ${l.url}`)
  lines.push('', 'Behrend Club Volleyball')
  return lines.join('\n')
}

// Sent immediately when a guest signs up for an event that does NOT require
// admin approval — the signup is confirmed as soon as it's submitted.
export function sendRsvpConfirmationEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `You're confirmed for ${event.title}. See you there!`]
  const links = [buildWaiverLink(env), { url: cancelUrl, label: 'Cancel your RSVP' }]
  return sendEmail(env, {
    to,
    subject: `You're confirmed: ${event.title}`,
    html: wrapHtml("You're confirmed", body, details, links),
    text: wrapText("You're confirmed", body, details, links),
    unsubscribeUrl: cancelUrl,
  })
}

// Sent immediately when a guest's signup needs an admin's approval before
// it's a confirmed spot — either because the event itself is gated, or
// because the admin flagged this person's account as RSVP-restricted.
export function sendRsvpRequestEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [
    `Hi ${name},`,
    `We received your request to attend ${event.title}. Your spot isn't confirmed yet — we'll email you as soon ` +
      `as it's reviewed.`,
  ]
  const links = [buildWaiverLink(env), { url: cancelUrl, label: 'Withdraw your request' }]
  return sendEmail(env, {
    to,
    subject: `Request received: ${event.title}`,
    html: wrapHtml('Request received', body, details, links),
    text: wrapText('Request received', body, details, links),
    unsubscribeUrl: cancelUrl,
  })
}

// Sent when an admin approves a pending request on a gated event.
export function sendRsvpApprovedEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `Your request to attend ${event.title} has been approved. See you there!`]
  const links = [buildWaiverLink(env), { url: cancelUrl, label: 'Cancel your RSVP' }]
  return sendEmail(env, {
    to,
    subject: `You're approved: ${event.title}`,
    html: wrapHtml("You're approved", body, details, links),
    text: wrapText("You're approved", body, details, links),
    unsubscribeUrl: cancelUrl,
  })
}

// Sent immediately when a guest signs up for a full (ungated, capacitated)
// event — they've joined the waitlist rather than being turned away.
export function sendWaitlistEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [
    `Hi ${name},`,
    `${event.title} is full, so you've been added to the waitlist. We'll email you right away if a spot opens up.`,
  ]
  const links = [buildWaiverLink(env), { url: cancelUrl, label: 'Leave the waitlist' }]
  return sendEmail(env, {
    to,
    subject: `You're on the waitlist: ${event.title}`,
    html: wrapHtml("You're on the waitlist", body, details, links),
    text: wrapText("You're on the waitlist", body, details, links),
    unsubscribeUrl: cancelUrl,
  })
}

// Sent when a spot opens up and a waitlisted signup is automatically
// promoted to 'approved'.
export function sendWaitlistPromotedEmail(env: Env, to: string, name: string, event: EventInfo, cancelUrl: string) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `A spot opened up for ${event.title} and you're in! See you there.`]
  const links = [buildWaiverLink(env), { url: cancelUrl, label: 'Cancel your RSVP' }]
  return sendEmail(env, {
    to,
    subject: `You're in: ${event.title}`,
    html: wrapHtml("You're in!", body, details, links),
    text: wrapText("You're in!", body, details, links),
    unsubscribeUrl: cancelUrl,
  })
}

// Sent to everyone signed up for an event (any non-denied status) when an
// admin posts a free-form announcement from the event's signups panel —
// a schedule change, what to bring, a cancellation notice, etc. message is
// plain text the admin typed; each line becomes its own paragraph.
export function sendEventAnnouncementEmail(
  env: Env,
  to: string,
  name: string,
  event: EventInfo,
  subject: string,
  message: string
) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, ...message.split('\n').map((l) => l.trim()).filter(Boolean)]
  return sendEmail(env, {
    to,
    subject: `${event.title}: ${subject}`,
    html: wrapHtml(subject, body, details),
    text: wrapText(subject, body, details),
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
