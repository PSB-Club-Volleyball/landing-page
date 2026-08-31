const DAYS_PATTERN = /^[0-6](,[0-6])*$/
const UNTIL_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidRecurrenceDays(value: unknown): value is string {
  return typeof value === 'string' && DAYS_PATTERN.test(value)
}

export function isValidRecurrenceUntil(value: unknown): value is string {
  return typeof value === 'string' && UNTIL_PATTERN.test(value)
}

// Validates a full recurrence_days/recurrence_until pair (both provided together,
// as on create or a PUT that sets both at once). Returns an error message, or null if valid.
export function validateRecurrence(recurrence_days: unknown, recurrence_until: unknown): string | null {
  const hasDays = recurrence_days !== undefined && recurrence_days !== null
  const hasUntil = recurrence_until !== undefined && recurrence_until !== null

  if (hasDays !== hasUntil) {
    return 'recurrence_days and recurrence_until must be set together'
  }
  if (!hasDays) return null

  if (!isValidRecurrenceDays(recurrence_days)) {
    return 'recurrence_days must be a comma-separated list of weekday numbers (0-6)'
  }
  if (!isValidRecurrenceUntil(recurrence_until)) {
    return 'recurrence_until must be a YYYY-MM-DD date'
  }
  return null
}

const MAX_OCCURRENCES = 200

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Expands a "repeats weekly on these days until this date" recurrence into
// one real start_time/end_time pair per occurrence — each becomes its own
// independent event row (own signups) rather than a single virtual series.
// start_time/end_time are naive local wall-clock strings (see
// migrations/0002_seed_open_gyms.sql); only their date part changes per
// occurrence, so the time-of-day/duration is reused as-is for every week.
export function expandOccurrences(
  startTime: string,
  endTime: string | null,
  days: string,
  until: string
): { start_time: string; end_time: string | null }[] | null {
  const startDate = startTime.slice(0, 10)
  if (until < startDate) return null

  const timePart = startTime.slice(10)
  const endTimePart = endTime ? endTime.slice(10) : null
  const dayNums = new Set(days.split(',').map(Number))

  const occurrences: { start_time: string; end_time: string | null }[] = []
  for (let cursor = startDate; cursor <= until; cursor = addDays(cursor, 1)) {
    const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay()
    if (!dayNums.has(weekday)) continue
    occurrences.push({
      start_time: `${cursor}${timePart}`,
      end_time: endTimePart ? `${cursor}${endTimePart}` : null,
    })
    if (occurrences.length > MAX_OCCURRENCES) return null
  }
  return occurrences
}
