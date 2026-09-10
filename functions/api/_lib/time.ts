// Event start_time/end_time are stored as floating "YYYY-MM-DDTHH:MM" wall-clock
// strings in US Eastern time (see src/lib/calendar.ts) — no zone offset. SQLite's
// datetime('now') is UTC, so comparing it directly against those strings is wrong:
// Eastern is 4-5 hours behind UTC, so an event would look "over" hours before it
// actually ends locally. This computes the current wall-clock time in Eastern
// instead, in the same "YYYY-MM-DDTHH:MM" shape, so it can be bound as a plain
// SQL parameter and compared with ordinary string ordering.
const easternFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function easternWallClock(instant: Date): string {
  const parts = easternFormatter.formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

// Wall-clock cutoff for "has this event's end passed (plus a grace period)?" —
// pass hoursAgo=0 for "right now", or a positive grace period so an event
// stays visible for a while after it ends instead of vanishing the instant it's over.
export function eventCutoff(hoursAgo = 0): string {
  return easternWallClock(new Date(Date.now() - hoursAgo * 60 * 60 * 1000))
}
