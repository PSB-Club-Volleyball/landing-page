import type { PlayFormat, PublicClubEvent } from '../types'

export const EVENT_TYPE_LABELS: Record<string, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  open_gym: 'Open gym',
  game: 'Game',
  social: 'Social',
}

// Public-facing wording for a play format — plainer than the admin labels.
// 'none' has no schedule/bracket, so the event page shows nothing for it.
export const PLAY_FORMAT_LABELS: Record<Exclude<PlayFormat, 'none'>, string> = {
  round_robin: 'Round robin',
  pool_bracket: 'Pool play, then a bracket',
  single_elim: 'Single-elimination bracket',
  double_elim: 'Double-elimination bracket',
}

export function playFormatLabel(format: PlayFormat | null | undefined): string | null {
  if (!format || format === 'none') return null
  return PLAY_FORMAT_LABELS[format]
}

const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

export function formatTimeRange(event: Pick<PublicClubEvent, 'start_time' | 'end_time'>) {
  const start = timeFormatter.format(new Date(event.start_time))
  if (!event.end_time) return start
  return `${start} – ${timeFormatter.format(new Date(event.end_time))}`
}

export function formatEventDate(dateLike: string) {
  return dateFormatter.format(new Date(dateLike))
}

export function directionsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// A full, gated event still can't be requested past capacity (see
// functions/api/events/[id]/signups.ts) — but a full, ungated event opens
// the waitlist instead of turning people away.
export function getSignupState(event: PublicClubEvent) {
  const spotsLeft = event.capacity !== null ? event.capacity - event.signup_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const joinsWaitlist = isFull && !event.rsvp_gated
  const deadlinePassed = event.signup_deadline !== null && new Date(event.signup_deadline) < new Date()
  const verb = event.rsvp_gated
    ? 'Request'
    : event.event_type === 'game' || event.event_type === 'tournament'
      ? 'RSVP'
      : 'Sign up'
  return { spotsLeft, isFull, joinsWaitlist, deadlinePassed, verb }
}

export function formatSignupDeadline(deadline: string) {
  return `${dateFormatter.format(new Date(deadline))} at ${timeFormatter.format(new Date(deadline))}`
}
