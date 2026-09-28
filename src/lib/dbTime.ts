// SQLite's CURRENT_TIMESTAMP (the default for every created_at / decided_at
// column) stores "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker, and
// `new Date()` reads that shape as *local* time — hours off. Parse it as UTC
// explicitly. Anything else is a bug upstream, so it throws rather than
// guessing.
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

export function parseDbTimestamp(value: string): Date {
  if (!SQLITE_TIMESTAMP.test(value)) throw new Error(`Unexpected DB timestamp: ${JSON.stringify(value)}`)
  const date = new Date(value.replace(' ', 'T') + 'Z')
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid DB timestamp: ${JSON.stringify(value)}`)
  return date
}
