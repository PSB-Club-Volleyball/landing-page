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

function wrapHtml(heading: string, bodyLines: string[], detailLines: string[]): string {
  const details = detailLines.map((l) => `<p style="margin:0 0 4px">${l}</p>`).join('')
  const body = bodyLines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join('')
  return `
    <div style="font-family:sans-serif;color:#1a1a1a;max-width:480px">
      <h2 style="margin:0 0 16px">${heading}</h2>
      ${body}
      <div style="margin:16px 0;padding:12px 16px;background:#f4f4f4;border-radius:8px">${details}</div>
      <p style="margin:16px 0 0;color:#666;font-size:13px">Behrend Club Volleyball</p>
    </div>
  `.trim()
}

function wrapText(heading: string, bodyLines: string[], detailLines: string[]): string {
  return [heading, '', ...bodyLines, '', ...detailLines, '', 'Behrend Club Volleyball'].join('\n')
}

// Sent immediately when a guest signs up for an event that does NOT require
// admin approval — the signup is confirmed as soon as it's submitted.
export function sendRsvpConfirmationEmail(env: Env, to: string, name: string, event: EventInfo) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `You're confirmed for ${event.title}. See you there!`]
  return sendEmail(env, {
    to,
    subject: `You're confirmed: ${event.title}`,
    html: wrapHtml("You're confirmed", body, details),
    text: wrapText("You're confirmed", body, details),
  })
}

// Sent immediately when a guest requests attendance for a gated event — the
// request still needs an admin's approval before it's a confirmed spot.
export function sendRsvpRequestEmail(env: Env, to: string, name: string, event: EventInfo) {
  const details = eventDetailsLines(event)
  const body = [
    `Hi ${name},`,
    `We received your request to attend ${event.title}. This event requires admin approval, so ` +
      `your spot isn't confirmed yet — we'll email you as soon as it's reviewed.`,
  ]
  return sendEmail(env, {
    to,
    subject: `Request received: ${event.title}`,
    html: wrapHtml('Request received', body, details),
    text: wrapText('Request received', body, details),
  })
}

// Sent when an admin approves a pending request on a gated event.
export function sendRsvpApprovedEmail(env: Env, to: string, name: string, event: EventInfo) {
  const details = eventDetailsLines(event)
  const body = [`Hi ${name},`, `Your request to attend ${event.title} has been approved. See you there!`]
  return sendEmail(env, {
    to,
    subject: `You're approved: ${event.title}`,
    html: wrapHtml("You're approved", body, details),
    text: wrapText("You're approved", body, details),
  })
}
