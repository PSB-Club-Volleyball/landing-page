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
