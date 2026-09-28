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

// When an event is over, as an Eastern wall-clock "YYYY-MM-DDTHH:MM". No end
// time means it ends when it starts. The admin form stores an overnight
// event's end on its start date (7 PM - 12:30 AM ends "T00:30" the same day),
// so an end before the start is the next day.
export function eventEndWallClock(event: { start_time: string; end_time: string | null }): string {
  const start = event.start_time.slice(0, 16)
  if (event.end_time === null) return start
  const end = event.end_time.slice(0, 16)
  if (end >= start) return end
  const ms = Date.parse(`${end}:00Z`)
  if (Number.isNaN(ms)) throw new Error(`Bad event end_time: ${event.end_time}`)
  return new Date(ms + 24 * 3_600_000).toISOString().slice(0, 16)
}

// SQL twin of eventEndWallClock for an events row aliased `e`, so list
// queries agree with it: an end before the start is the next day, and no
// end time means the event ends when it starts.
export const EVENT_END_SQL = `(CASE
    WHEN e.end_time IS NULL THEN substr(e.start_time, 1, 16)
    WHEN substr(e.end_time, 1, 16) < substr(e.start_time, 1, 16)
      THEN strftime('%Y-%m-%dT%H:%M', substr(e.end_time, 1, 16), '+1 day')
    ELSE substr(e.end_time, 1, 16)
  END)`
